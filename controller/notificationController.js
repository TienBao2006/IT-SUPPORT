const NotificationModel = require('../model/notificationModel');

const NotificationController = {
    async getAll(req, res) {
        try {
            const userId = req.session.user.id;
            const role = req.session.user.role;
            const data = role === 'admin'
                ? await NotificationModel.getAll()
                : await NotificationModel.getForUser(userId);
            res.json({ success: true, data });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    async getUnreadCount(req, res) {
        try {
            const userId = req.session.user.id;
            const role = req.session.user.role;
            const count = role === 'admin'
                ? await NotificationModel.getAllUnreadCount()
                : await NotificationModel.getUnreadCount(userId);
            res.json({ success: true, data: { count } });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    async markAllRead(req, res) {
        try {
            await NotificationModel.markAllRead(req.session.user.id, req.session.user.role);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    },

    async markRead(req, res) {
        try {
            await NotificationModel.markRead(req.params.id);
            res.json({ success: true });
        } catch (err) { res.status(500).json({ success: false, message: err.message }); }
    }
};

module.exports = NotificationController;
