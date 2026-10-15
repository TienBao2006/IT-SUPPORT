const db = require('../config/database');

const ReportController = {
    async getByMonth(req, res) {
        try {
            const [rows] = await db.execute(`
                SELECT DATE_FORMAT(created_at,'%m/%Y') AS month, COUNT(*) AS total
                FROM tickets
                WHERE created_at >= DATE_SUB(NOW(), INTERVAL 6 MONTH)
                GROUP BY DATE_FORMAT(created_at,'%Y-%m')
                ORDER BY DATE_FORMAT(created_at,'%Y-%m') ASC
            `);
            res.json({ success: true, data: rows });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    }
};

module.exports = ReportController;
