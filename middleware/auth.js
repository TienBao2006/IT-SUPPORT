function requireAuth(req, res, next) {
    if (req.session?.user) return next();
    res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
}

function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.session?.user)
            return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
        if (!roles.includes(req.session.user.role))
            return res.status(403).json({ success: false, message: 'Không có quyền truy cập' });
        next();
    };
}

module.exports = { requireAuth, requireRole };
