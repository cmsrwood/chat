const express = require('express');
const mysql = require('mysql');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const cors = require('cors');
const bcrypt = require('bcrypt');
const http = require('http');
const { Server } = require('socket.io');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const { BACKEND_PORT, DB_HOST, DB_USER, DB_PASS, DB_DATABASE, FRONTEND_URL } = require("./config.js");

// app
const app = express();

// middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(bodyParser.json());
app.use(cors({
    credentials: true,
    origin: [FRONTEND_URL],
    methods: ["GET", "POST"]
}));

// config

// database
const options = {
    host: DB_HOST,
    port: 3306,
    user: DB_USER,
    password: DB_PASS,
    database: DB_DATABASE
};

// conexion 
const conn = mysql.createConnection(options);

// session
const sessionStore = new MySQLStore(options);
app.use(session({
    key: 'session_user',
    secret: '123',
    resave: false,
    saveUninitialized: false,
    store: sessionStore,
    cookie: {
        secure: false,
        httpOnly: false,
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
}));

// routes

app.post("/signup", (req, res) => {
    conn.query("SELECT * FROM users WHERE email = ? OR username = ?", [req.body.email, req.body.username], (err, result) => {
        const id = uniqid();

        if (err) {
            res.send(err);
        }
        if (result.length > 0) {
            res.send("User already exists");
        } else {
            const password = req.body.password;
            const hashpassword = bcrypt.hashSync(password, 10);
            const q = "INSERT INTO users (id_user, username, email, pass) VALUES (?,?,?,?)";
            const values = [
                id,
                req.body.username,
                req.body.email,
                hashpassword
            ];
            conn.query(q, values, (err) => {
                if (err) {
                    res.send(err);
                }
                res.send("User created successfully");
            });
        }
    });
});

app.post("/login", (req, res) => {
    console.log(req.sessionID);
    const username = req.body.username;
    const password = req.body.password;

    conn.query("SELECT * FROM users WHERE username = ?", [username], (err, result) => {
        if (err) {
            res.send(err);
            return;
        }
        if (result.length === 0) {
            res.send("Usuario no encontrado");
            return;
        }
        const user = result[0];

        req.session.username = user.username;
        console.log(req.session.username);

        bcrypt.compare(password, user.pass, (err, isMatch) => {
            if (err) {
                res.send(err);
                return;
            }
            if (!isMatch) {
                res.send("Contraseña incorrecta");
                return;
            }
            res.send("Success");
        });
    });
});

app.get("/session", (req, res) => {
    if (req.session.username) {
        res.json({ loggedIn: true, username: req.session.username });
    } else {
        res.json({ loggedIn: false });
    }
});

app.get("/logout", (req, res) => {
    req.session.destroy();
    res.send("Success");
});

// chat
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        credentials: true,
        origin: FRONTEND_URL,
        methods: ["GET", "POST"]
    }
});

io.on('connection', (socket) => {
    socket.on('join_room', (data) => {
        socket.join(data);
    });

    socket.on("send_message", (data) => {
        socket.to(data.room).emit("receive_message", data);
    });
});

server.listen(BACKEND_PORT, () => {
    console.log(`Server running on ${BACKEND_URL}:${BACKEND_PORT}`);
});
