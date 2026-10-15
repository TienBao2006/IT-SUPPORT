const mysql = require('mysql2/promise');
require('dotenv').config();

const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 3306, // Thêm dòng port này để nhận cổng 26181 từ Aiven
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'it_support',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    ssl: { // Thêm cấu hình SSL bắt buộc cho Aiven Cloud
        rejectUnauthorized: false
    }
});

module.exports = pool;