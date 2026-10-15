const TicketModel = require('../model/ticketModel');
const NotificationModel = require('../model/notificationModel');
const db = require('../config/database');

const TicketController = {

    // ===== ADMIN =====
    async getAll(req, res) {
        try {
            const { status, priority, technician_id, search } = req.query;
            const data = await TicketModel.getAll({ status, priority, technician_id, search });
            res.json({ success: true, data });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    async getStats(req, res) {
        try {
            const data = await TicketModel.getStats();
            res.json({ success: true, data });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    async getById(req, res) {
        try {
            const t = await TicketModel.getById(req.params.id);
            if (!t) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
            // Lấy lịch sử cập nhật
            const [updates] = await db.execute(`
                SELECT u.*, us.full_name, us.role
                FROM ticket_updates u
                JOIN users us ON u.user_id = us.id
                WHERE u.ticket_id = ?
                ORDER BY u.created_at ASC
            `, [req.params.id]);
            res.json({ success: true, data: { ...t, updates } });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    async create(req, res) {
        try {
            const { title, description, category, priority, staff_id } = req.body;
            if (!title) return res.status(400).json({ success: false, message: 'Tiêu đề không được trống' });
            const sid = staff_id || (req.session.user.role === 'staff' ? req.session.user.id : null);
            const image_path = req.file ? `/uploads/${req.file.filename}` : null;
            const result = await TicketModel.create({ staff_id: sid, title, description, category, priority, image_path });
            await NotificationModel.create({ user_id: null, message: `Ticket mới #${result.code}: ${title}`, type: 'info' });
            res.status(201).json({ success: true, data: result });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    // Admin phân công → status = assigned
    async assign(req, res) {
        try {
            const { technician_id } = req.body;
            if (!technician_id) return res.status(400).json({ success: false, message: 'Chưa chọn kỹ thuật viên' });
            const t = await TicketModel.getById(req.params.id);
            if (!t) return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
            await TicketModel.assign(req.params.id, technician_id);
            // Gửi thông báo cho technician kèm link chấp nhận
            await NotificationModel.create({
                user_id: technician_id,
                message: `Bạn được phân công ticket #${t.code}: "${t.title}". Vui lòng vào mục Ticket để chấp nhận hoặc từ chối.`,
                type: 'info'
            });
            res.json({ success: true, message: 'Đã phân công. Kỹ thuật viên sẽ nhận thông báo.' });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    async update(req, res) {
        try {
            const ok = await TicketModel.update(req.params.id, req.body);
            if (!ok) return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
            res.json({ success: true, message: 'Cập nhật thành công' });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    async delete(req, res) {
        try {
            const ok = await TicketModel.delete(req.params.id);
            if (!ok) return res.status(404).json({ success: false, message: 'Không tìm thấy ticket' });
            res.json({ success: true, message: 'Đã xóa ticket' });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    // ===== STAFF =====
    async getMyTickets(req, res) {
        try {
            const { status } = req.query;
            const data = await TicketModel.getAll({ staff_id: req.session.user.id, status });
            res.json({ success: true, data });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    async getMyStats(req, res) {
        try {
            const data = await TicketModel.getStats({ staff_id: req.session.user.id });
            res.json({ success: true, data });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    // ===== TECHNICIAN =====
    async getAssignedTickets(req, res) {
        try {
            const { status } = req.query;
            const data = await TicketModel.getAll({ technician_id: req.session.user.id, status });
            res.json({ success: true, data });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    async getAssignedStats(req, res) {
        try {
            const data = await TicketModel.getStats({ technician_id: req.session.user.id });
            res.json({ success: true, data });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    async getAssignedById(req, res) {
        try {
            const t = await TicketModel.getById(req.params.id);
            if (!t) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
            if (Number(t.technician_id) !== Number(req.session.user.id))
                return res.status(403).json({ success: false, message: 'Không có quyền' });
            const [updates] = await db.execute(`
                SELECT u.*, us.full_name, us.role
                FROM ticket_updates u
                JOIN users us ON u.user_id = us.id
                WHERE u.ticket_id = ?
                ORDER BY u.created_at ASC
            `, [req.params.id]);
            res.json({ success: true, data: { ...t, updates } });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    // Technician chấp nhận → processing
    async accept(req, res) {
        try {
            const t = await TicketModel.getById(req.params.id);
            if (!t) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
            if (Number(t.technician_id) !== Number(req.session.user.id))
                return res.status(403).json({ success: false, message: 'Không có quyền' });
            if (t.status !== 'assigned')
                return res.status(400).json({ success: false, message: 'Ticket chưa ở trạng thái được phân công' });

            await TicketModel.update(req.params.id, { status: 'processing' });
            // Ghi lịch sử
            await db.execute(
                'INSERT INTO ticket_updates (ticket_id, user_id, message) VALUES (?, ?, ?)',
                [req.params.id, req.session.user.id, `Kỹ thuật viên ${req.session.user.full_name} đã chấp nhận ticket.`]
            );
            // Thông báo admin
            await NotificationModel.create({ user_id: null, message: `KTV ${req.session.user.full_name} đã chấp nhận ticket #${t.code}.`, type: 'info' });
            res.json({ success: true, message: 'Đã chấp nhận, bắt đầu xử lý' });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    // Technician từ chối → new + unassign
    async reject(req, res) {
        try {
            const t = await TicketModel.getById(req.params.id);
            if (!t) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
            if (Number(t.technician_id) !== Number(req.session.user.id))
                return res.status(403).json({ success: false, message: 'Không có quyền' });

            const { reason } = req.body;
            await TicketModel.update(req.params.id, { status: 'new', technician_id: null });
            // Ghi lịch sử
            await db.execute(
                'INSERT INTO ticket_updates (ticket_id, user_id, message) VALUES (?, ?, ?)',
                [req.params.id, req.session.user.id, `Kỹ thuật viên ${req.session.user.full_name} đã từ chối. Lý do: ${reason || 'Không có lý do'}`]
            );
            // Thông báo admin
            await NotificationModel.create({
                user_id: null,
                message: `⚠️ KTV ${req.session.user.full_name} từ chối ticket #${t.code}. Cần phân công lại.`,
                type: 'warning'
            });
            res.json({ success: true, message: 'Đã từ chối. Admin sẽ phân công lại.' });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    // Technician cập nhật tình trạng + ảnh
    async addUpdate(req, res) {
        try {
            const t = await TicketModel.getById(req.params.id);
            if (!t) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
            if (Number(t.technician_id) !== Number(req.session.user.id))
                return res.status(403).json({ success: false, message: 'Không có quyền' });

            const { message, status } = req.body;
            const image_path = req.file ? `/uploads/${req.file.filename}` : null;

            // Ghi lịch sử cập nhật
            await db.execute(
                'INSERT INTO ticket_updates (ticket_id, user_id, message, image_path) VALUES (?, ?, ?, ?)',
                [req.params.id, req.session.user.id, message || null, image_path]
            );

            // Cập nhật trạng thái nếu có
            if (status) {
                await TicketModel.update(req.params.id, { status });
                if (status === 'done' && t.staff_id) {
                    await NotificationModel.create({
                        user_id: t.staff_id,
                        message: `Ticket #${t.code} của bạn đã được hoàn thành.`,
                        type: 'info'
                    });
                }
            }

            res.json({ success: true, message: 'Đã cập nhật', image_path });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    async updateStatus(req, res) {
        try {
            const t = await TicketModel.getById(req.params.id);
            if (!t) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
            if (Number(t.technician_id) !== Number(req.session.user.id))
                return res.status(403).json({ success: false, message: 'Không có quyền' });
            const { status, note } = req.body;
            await TicketModel.update(req.params.id, { status, note });
            if (status === 'done' && t.staff_id) {
                await NotificationModel.create({ user_id: t.staff_id, message: `Ticket #${t.code} đã được hoàn thành.`, type: 'info' });
            }
            res.json({ success: true, message: 'Cập nhật thành công' });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    }
};

module.exports = TicketController;
