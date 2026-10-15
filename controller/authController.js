const UserModel = require('../model/userModel');

const AuthController = {

    async login(req, res) {
        try {
            const { email, password } = req.body;
            if (!email || !password)
                return res.status(400).json({ success: false, message: 'Vui lòng nhập đủ thông tin' });

            const user = await UserModel.findByEmail(email);
            if (!user)
                return res.status(401).json({ success: false, message: 'Email không tồn tại' });
            if (user.status === 'inactive')
                return res.status(403).json({ success: false, message: 'Tài khoản đã bị khóa' });

            const valid = await UserModel.verifyPassword(password, user.password_hash);
            if (!valid)
                return res.status(401).json({ success: false, message: 'Mật khẩu không đúng' });

            req.session.user = {
                id: user.id,
                full_name: user.full_name,
                email: user.email,
                role: user.role,
                department: user.department
            };

            // Redirect theo role
            const redirects = {
                admin:       '/admin/index.html',
                staff:       '/staff/dashboard.html',
                technician:  '/technician/dashboard.html'
            };

            res.json({
                success: true,
                data: req.session.user,
                redirect: redirects[user.role] || '/'
            });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    },

    logout(req, res) {
        req.session.destroy(() => res.json({ success: true }));
    },

    me(req, res) {
        if (!req.session.user)
            return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
        res.json({ success: true, data: req.session.user });
    },

    async changePassword(req, res) {
        try {
            const { oldPassword, newPassword } = req.body;
            if (!oldPassword || !newPassword)
                return res.status(400).json({ success: false, message: 'Vui lòng nhập đủ thông tin' });
            if (newPassword.length < 6)
                return res.status(400).json({ success: false, message: 'Mật khẩu mới phải ít nhất 6 ký tự' });

            const user = await UserModel.getById(req.session.user.id);
            const valid = await UserModel.verifyPassword(oldPassword, user.password_hash);
            if (!valid)
                return res.status(401).json({ success: false, message: 'Mật khẩu hiện tại không đúng' });

            await UserModel.update(req.session.user.id, { password: newPassword });
            res.json({ success: true, message: 'Đổi mật khẩu thành công' });
        } catch (err) {
            res.status(500).json({ success: false, message: err.message });
        }
    }
};

module.exports = AuthController;
