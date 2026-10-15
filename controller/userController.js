const UserModel = require('../model/userModel');

const UserController = {
    async getAll(req, res) {
        try {
            const { role, search } = req.query;
            const data = await UserModel.getAll(role, search);
            res.json({ success: true, data });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    async getById(req, res) {
        try {
            const u = await UserModel.getById(req.params.id);
            if (!u) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
            res.json({ success: true, data: u });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    async create(req, res) {
        try {
            const { full_name, email, password, role, department, phone } = req.body;
            if (!full_name || !email || !password)
                return res.status(400).json({ success: false, message: 'Thiếu thông tin bắt buộc' });
            if (password.length < 6)
                return res.status(400).json({ success: false, message: 'Mật khẩu phải ít nhất 6 ký tự' });
            const result = await UserModel.create({ full_name, email, password, role, department, phone });
            res.status(201).json({ success: true, data: result });
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY')
                return res.status(400).json({ success: false, message: 'Email đã tồn tại' });
            res.status(500).json({ success: false, message: err.message });
        }
    },

    async update(req, res) {
        try {
            const ok = await UserModel.update(req.params.id, req.body);
            if (!ok) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
            res.json({ success: true, message: 'Cập nhật thành công' });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    async delete(req, res) {
        try {
            const ok = await UserModel.delete(req.params.id);
            if (!ok) return res.status(404).json({ success: false, message: 'Không tìm thấy' });
            res.json({ success: true, message: 'Đã xóa' });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    }
};

module.exports = UserController;
