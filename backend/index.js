const express = require('express')
const mysql = require('mysql')
const session = require('express-session')
const MySQLStore = require('express-mysql-session')(session)
const multer = require('multer')
const uniqid = require('uniqid')
const path = require('path')
const cors = require('cors')
const bcrypt = require('bcrypt');
const http = require('http')
const { Server } = require('socket.io')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const { BACKEND_PORT, DB_HOST, DB_USER, DB_PASS, DB_DATABASE, FRONTEND_URL, BACKEND_URL, SESSION_SECRET } = require("./config.js");

// app
const app = express()

// middlewares

app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(cookieParser())
app.use(bodyParser.json());
app.use(cors({
    credentials: true,
    origin: [FRONTEND_URL], 
    methods: ["GET", "POST", "PUT", "DELETE"]
}))

// config

// database
const options = {
    host: DB_HOST,
    port: 3306,
    user: DB_USER,
    password: DB_PASS,
    database: DB_DATABASE
}

// connection 

const conn = mysql.createConnection(options)

// session
const sessionStore = new MySQLStore(options)
app.use(session({
    key: 'session_user',
    secret: '123456',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        secure: true, 
        httpOnly: true,
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}))

// multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads')
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname);
        cb(null, file.fieldname + '-' + Date.now() + ext)
    }
})

// routes

app.post("/signup", (req, res) => {
    conn.query("SELECT * FROM users WHERE email = ? OR username = ?", [req.body.email, req.body.username], (err, result) => {
        if (err) {
            console.error(err)
            return res.status(500).send({ error: 'Internal server error' })
        }
        if (result.length > 0) {
            return res.status(409).send("User already exists")
        } else {
            const id = uniqid()
            const password = req.body.password
            const hashpassword = bcrypt.hashSync(password, 10)
            const q = "INSERT INTO users (id_user, username, email, pass) VALUES (?,?,?,?)"
            const values = [id, req.body.username, req.body.email, hashpassword]
            conn.query(q, values, (err) => {
                if (err) {
                    console.error(err)
                    return res.status(500).send({ error: 'Internal server error' })
                }
                res.status(201).send("User created successfully")
            })
        }
    })
})

app.post("/login", (req, res) => {
    const username = req.body.username;
    const password = req.body.password;

    conn.query("SELECT * FROM users WHERE username = ?", [username], (err, result) => {
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Internal server error' });
        }
        if (result.length === 0) {
            return res.status(404).send('User not found');
        }
        const user = result[0];

        bcrypt.compare(password, user.pass, (err, isMatch) => {
            if (err) {
                console.error(err);
                return res.status(500).send({ error: 'Internal server error' });
            }
            if (!isMatch) {
                return res.status(401).send("Contraseña incorrecta");
            }

            req.session.username = user.username;
            res.send("Success");
        });
    });
});

app.get("/session", (req, res) => {
    if (req.session.username) {
        res.send({ loggedIn: true, username: req.session.username });
    } else {
        res.send({ loggedIn: false });
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy(err => {
        if (err) {
            console.error(err);
            return res.status(500).send({ error: 'Internal server error' });
        }
        res.send("Success");
    });
});

const upload = multer({ storage: storage })

// chat
const server = http.createServer(app)

const io = new Server(server, {
    cors: {
        credentials: true,
        origin: FRONTEND_URL,
        methods: ["GET", "POST"]
    }
})

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        socket.join(data)
    })

    socket.on("send_message", (data) => {
        socket.to(data.room).emit("receive_message", data);
    });
})

server.listen(BACKEND_PORT, () => {
    console.log(`Backend server running on ${BACKEND_URL}`);
});
