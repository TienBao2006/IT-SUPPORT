const db = require('../config/database');

const TicketModel = {

    async getAll({ status, priority, technician_id, staff_id, search } = {}) {
        let sql = `
            SELECT t.*,
                   s.full_name AS staff_name,    s.department AS staff_dept,
                   e.full_name AS tech_name,     e.department AS tech_dept
            FROM tickets t
            LEFT JOIN users s ON t.staff_id = s.id
            LEFT JOIN users e ON t.technician_id = e.id
            WHERE 1=1
        `;
        const params = [];
        if (status       && status !== 'all')      { sql += ' AND t.status = ?';         params.push(status); }
        if (priority     && priority !== 'all')    { sql += ' AND t.priority = ?';        params.push(priority); }
        if (technician_id)                          { sql += ' AND t.technician_id = ?';  params.push(technician_id); }
        if (staff_id)                               { sql += ' AND t.staff_id = ?';       params.push(staff_id); }
        if (search) {
            sql += ' AND (t.code LIKE ? OR s.full_name LIKE ? OR t.title LIKE ?)';
            const l = `%${search}%`;
            params.push(l, l, l);
        }
        sql += ' ORDER BY t.created_at DESC';
        const [rows] = await db.execute(sql, params);
        return rows;
    },

    async getById(id) {
        const [rows] = await db.execute(`
            SELECT t.*,
                   s.full_name AS staff_name, s.department AS staff_dept, s.email AS staff_email,
                   e.full_name AS tech_name,  e.department AS tech_dept,  e.email AS tech_email
            FROM tickets t
            LEFT JOIN users s ON t.staff_id = s.id
            LEFT JOIN users e ON t.technician_id = e.id
            WHERE t.id = ?
        `, [id]);
        return rows[0] || null;
    },

    async getStats(filter = {}) {
        let sql = `
            SELECT
                COUNT(*) AS total,
                SUM(status='new')        AS new_count,
                SUM(status='assigned')   AS assigned,
                SUM(status='processing') AS processing,
                SUM(status='waiting')    AS waiting,
                SUM(status='done')       AS done,
                SUM(status='overdue')    AS overdue
            FROM tickets WHERE 1=1
        `;
        const params = [];
        if (filter.staff_id)      { sql += ' AND staff_id = ?';      params.push(filter.staff_id); }
        if (filter.technician_id) { sql += ' AND technician_id = ?'; params.push(filter.technician_id); }
        const [rows] = await db.execute(sql, params);
        return rows[0];
    },

    async create({ staff_id, title, description, category, priority, image_path }) {
        const code = 'TK' + Date.now().toString().slice(-6);
        const [r] = await db.execute(
            'INSERT INTO tickets (code, staff_id, title, description, category, priority, image_path) VALUES (?,?,?,?,?,?,?)',
            [code, staff_id || null, title, description || null, category || null, priority || 'medium', image_path || null]
        );
        return { id: r.insertId, code };
    },

    async assign(id, technician_id) {
        const [r] = await db.execute(
            "UPDATE tickets SET technician_id = ?, status = 'assigned' WHERE id = ?",
            [technician_id, id]
        );
        return r.affectedRows > 0;
    },

    async update(id, fields) {
        const allowed = ['status','technician_id','description','note','title','category','priority'];
        const cols = [], params = [];
        for (const k of allowed) {
            if (fields[k] !== undefined) { cols.push(`${k} = ?`); params.push(fields[k]); }
        }
        if (!cols.length) return false;
        params.push(id);
        const [r] = await db.execute(`UPDATE tickets SET ${cols.join(',')} WHERE id = ?`, params);
        return r.affectedRows > 0;
    },

    async delete(id) {
        const [r] = await db.execute('DELETE FROM tickets WHERE id = ?', [id]);
        return r.affectedRows > 0;
    }
};

module.exports = TicketModel;
