require('dotenv').config();
const express = require('express');
const cors = require('cors');
const session = require('express-session');
const path = require('path');
const api = require('./routes/api');
const UserModel = require('./model/userModel');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ credentials: true, origin: true }));
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));
app.use(session({
    secret: process.env.SESSION_SECRET || 'it_support_2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 8 * 60 * 60 * 1000 }
}));

app.use(express.static(path.join(__dirname, 'view')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/api', api);
app.get('/', (req, res) => res.redirect('/login.html'));

async function init() {
    await UserModel.migrate().catch(console.error);
    await UserModel.seedDefaults().catch(console.error);
}
init();

app.listen(PORT, () => console.log(`Server: http://localhost:${PORT}`));
