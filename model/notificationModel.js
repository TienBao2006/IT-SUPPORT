const db = require('../config/database');

const NotificationModel = {

    // Technician/Staff chỉ thấy thông báo đích danh cho họ
    async getForUser(userId) {
        const [rows] = await db.execute(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
            [userId]
        );
        return rows;
    },

    async getUnreadCount(userId) {
        const [rows] = await db.execute(
            'SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND is_read = 0',
            [userId]
        );
        return rows[0].count;
    },

    // Admin thấy tất cả (broadcast + đích danh)
    async getAll() {
        const [rows] = await db.execute(
            'SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100'
        );
        return rows;
    },

    async getAllUnreadCount() {
        const [rows] = await db.execute('SELECT COUNT(*) AS count FROM notifications WHERE is_read = 0');
        return rows[0].count;
    },

    async markRead(id) {
        await db.execute('UPDATE notifications SET is_read = 1 WHERE id = ?', [id]);
    },

    async markAllRead(userId, role) {
        if (role === 'admin') {
            await db.execute('UPDATE notifications SET is_read = 1 WHERE is_read = 0');
        } else {
            await db.execute(
                'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
                [userId]
            );
        }
    },

    // user_id = null => broadcast (admin thấy)
    // user_id = X   => chỉ user X thấy
    async create({ user_id, message, type }) {
        const [r] = await db.execute(
            'INSERT INTO notifications (user_id, message, type) VALUES (?, ?, ?)',
            [user_id || null, message, type || 'info']
        );
        return { id: r.insertId };
    }
};

module.exports = NotificationModel;
