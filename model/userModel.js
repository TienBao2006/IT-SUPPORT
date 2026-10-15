const db = require('../config/database');
const bcrypt = require('bcryptjs');

const UserModel = {

    async migrate() {
        // Tạo bảng users nếu chưa có
        await db.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id            INT AUTO_INCREMENT PRIMARY KEY,
                full_name     VARCHAR(100) NOT NULL,
                email         VARCHAR(100) NOT NULL UNIQUE,
                password_hash VARCHAR(255) NOT NULL,
                role          ENUM('admin','staff','technician') NOT NULL DEFAULT 'staff',
                department    VARCHAR(100),
                phone         VARCHAR(20),
                status        ENUM('active','inactive') DEFAULT 'active',
                created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // Kiểm tra tickets có đúng schema không (phải có cột staff_id)
        const [cols] = await db.execute(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tickets' AND COLUMN_NAME = 'staff_id'
        `);
        if (cols.length === 0) {
            // Schema cũ — drop và tạo lại
            await db.execute('SET FOREIGN_KEY_CHECKS=0');
            await db.execute('DROP TABLE IF EXISTS notifications');
            await db.execute('DROP TABLE IF EXISTS tickets');
            await db.execute('SET FOREIGN_KEY_CHECKS=1');
            console.log('Recreating tickets table with new schema...');
        }

        // Tạo bảng tickets
        await db.execute(`
            CREATE TABLE IF NOT EXISTS tickets (
                id              INT AUTO_INCREMENT PRIMARY KEY,
                code            VARCHAR(20) NOT NULL UNIQUE,
                staff_id        INT,
                technician_id   INT,
                title           VARCHAR(200) NOT NULL,
                description     TEXT,
                category        VARCHAR(50),
                priority        ENUM('urgent','high','medium','low') DEFAULT 'medium',
                status          ENUM('new','assigned','processing','waiting','done','overdue') DEFAULT 'new',
                note            TEXT,
                created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                FOREIGN KEY (staff_id)      REFERENCES users(id) ON DELETE SET NULL,
                FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE SET NULL
            )
        `);

        // Tạo bảng notifications
        await db.execute(`
            CREATE TABLE IF NOT EXISTS notifications (
                id         INT AUTO_INCREMENT PRIMARY KEY,
                user_id    INT,
                message    TEXT NOT NULL,
                type       ENUM('info','warning','error') DEFAULT 'info',
                is_read    TINYINT(1) DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
            )
        `);

        // Tạo bảng ticket_updates (lịch sử + ảnh đính kèm)
        await db.execute(`
            CREATE TABLE IF NOT EXISTS ticket_updates (
                id         INT AUTO_INCREMENT PRIMARY KEY,
                ticket_id  INT NOT NULL,
                user_id    INT NOT NULL,
                message    TEXT,
                image_path VARCHAR(255),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
                FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
            )
        `);

        // Thêm cột image_path vào tickets nếu chưa có
        const [imgCol] = await db.execute(`
            SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
            WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tickets' AND COLUMN_NAME = 'image_path'
        `);
        if (imgCol.length === 0) {
            await db.execute(`ALTER TABLE tickets ADD COLUMN image_path VARCHAR(255) NULL AFTER note`);
            console.log('Added image_path column to tickets');
        }
    },

    async seedDefaults() {
        const defaults = [
            { full_name: 'Quản trị viên', email: 'admin@system.com',  password: 'admin123', role: 'admin',      dept: 'IT' },
            { full_name: 'Nguyễn Văn B',  email: 'nvb@company.com',   password: 'user123',  role: 'staff',      dept: 'Kế toán' },
            { full_name: 'Trần Văn C',    email: 'tvc@company.com',   password: 'user123',  role: 'staff',      dept: 'Nhân sự' },
            { full_name: 'Lê Thị D',      email: 'ltd@company.com',   password: 'user123',  role: 'staff',      dept: 'Marketing' },
            { full_name: 'Nguyễn Văn A',  email: 'nva@tech.com',      password: 'tech123',  role: 'technician', dept: 'IT' },
            { full_name: 'Phạm Văn E',    email: 'pve@tech.com',      password: 'tech123',  role: 'technician', dept: 'IT' },
            { full_name: 'Trần Văn H',    email: 'tvh@tech.com',      password: 'tech123',  role: 'technician', dept: 'IT' },
        ];
        let seeded = 0;
        for (const u of defaults) {
            const [rows] = await db.execute('SELECT id FROM users WHERE email = ?', [u.email]);
            if (rows.length === 0) {
                const hash = await bcrypt.hash(u.password, 10);
                await db.execute(
                    'INSERT INTO users (full_name, email, password_hash, role, department) VALUES (?, ?, ?, ?, ?)',
                    [u.full_name, u.email, hash, u.role, u.dept]
                );
                seeded++;
            } else if (rows.length > 0) {
                // Fix SEED placeholder
                const [u2] = await db.execute('SELECT password_hash FROM users WHERE email = ?', [u.email]);
                if (u2[0] && u2[0].password_hash === 'SEED') {
                    const hash = await bcrypt.hash(u.password, 10);
                    await db.execute('UPDATE users SET password_hash = ? WHERE email = ?', [hash, u.email]);
                    seeded++;
                }
            }
        }
        if (seeded > 0) console.log(`Seeded ${seeded} default users`);
    },

    async findByEmail(email) {
        const [rows] = await db.execute('SELECT * FROM users WHERE email = ?', [email]);
        return rows[0] || null;
    },

    async getById(id) {
        const [rows] = await db.execute('SELECT * FROM users WHERE id = ?', [id]);
        return rows[0] || null;
    },

    async getByRole(role) {
        const [rows] = await db.execute(
            'SELECT id, full_name, email, role, department, phone, status FROM users WHERE role = ? ORDER BY full_name',
            [role]
        );
        return rows;
    },

    async getAll(role = null, search = '') {
        let sql = 'SELECT id, full_name, email, role, department, phone, status, created_at FROM users WHERE 1=1';
        const params = [];
        if (role) { sql += ' AND role = ?'; params.push(role); }
        if (search) {
            sql += ' AND (full_name LIKE ? OR email LIKE ?)';
            params.push(`%${search}%`, `%${search}%`);
        }
        sql += ' ORDER BY role, full_name';
        const [rows] = await db.execute(sql, params);
        return rows;
    },

    async create({ full_name, email, password, role, department, phone }) {
        const hash = await bcrypt.hash(password, 10);
        const [result] = await db.execute(
            'INSERT INTO users (full_name, email, password_hash, role, department, phone) VALUES (?, ?, ?, ?, ?, ?)',
            [full_name, email, hash, role || 'staff', department || null, phone || null]
        );
        return { id: result.insertId };
    },

    async update(id, { full_name, email, role, department, phone, status, password }) {
        const fields = [], params = [];
        if (full_name  !== undefined) { fields.push('full_name = ?');  params.push(full_name); }
        if (email      !== undefined) { fields.push('email = ?');      params.push(email); }
        if (role       !== undefined) { fields.push('role = ?');       params.push(role); }
        if (department !== undefined) { fields.push('department = ?'); params.push(department); }
        if (phone      !== undefined) { fields.push('phone = ?');      params.push(phone); }
        if (status     !== undefined) { fields.push('status = ?');     params.push(status); }
        if (password) {
            fields.push('password_hash = ?');
            params.push(await bcrypt.hash(password, 10));
        }
        if (!fields.length) return false;
        params.push(id);
        const [r] = await db.execute(`UPDATE users SET ${fields.join(',')} WHERE id = ?`, params);
        return r.affectedRows > 0;
    },

    async delete(id) {
        const [r] = await db.execute('DELETE FROM users WHERE id = ?', [id]);
        return r.affectedRows > 0;
    },

    async verifyPassword(plain, hash) {
        if (!hash || hash === 'SEED') return false;
        return bcrypt.compare(plain, hash);
    }
};

module.exports = UserModel;
