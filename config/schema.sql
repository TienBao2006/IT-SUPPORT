-- ================================================================
-- IT SUPPORT SYSTEM - DATABASE SCHEMA
-- 3 Roles: admin | staff (nhân viên công ty) | technician (kỹ thuật)
-- Luồng: staff tạo ticket -> admin phân công -> technician xử lý
-- ================================================================

CREATE DATABASE IF NOT EXISTS it_support CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE it_support;

SET FOREIGN_KEY_CHECKS = 0;

-- ================================================================
-- USERS: 1 bảng duy nhất, phân biệt bằng role
-- ================================================================
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS tickets;
DROP TABLE IF EXISTS users;

CREATE TABLE users (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    full_name     VARCHAR(100) NOT NULL,
    email         VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role          ENUM('admin','staff','technician') NOT NULL DEFAULT 'staff',
    department    VARCHAR(100),
    phone         VARCHAR(20),
    status        ENUM('active','inactive') DEFAULT 'active',
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ================================================================
-- TICKETS
--   staff_id      = nhân viên gửi yêu cầu
--   technician_id = kỹ thuật viên được admin phân công
-- ================================================================
CREATE TABLE tickets (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    code          VARCHAR(20)  NOT NULL UNIQUE,
    staff_id      INT          NULL,
    technician_id INT          NULL,
    title         VARCHAR(200) NOT NULL,
    description   TEXT,
    category      VARCHAR(50),
    priority      ENUM('urgent','high','medium','low') DEFAULT 'medium',
    status        ENUM('new','assigned','processing','waiting','done','overdue') DEFAULT 'new',
    note          TEXT,
    image_path    VARCHAR(255),
    created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (staff_id)      REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (technician_id) REFERENCES users(id) ON DELETE SET NULL
);

-- ================================================================
-- NOTIFICATIONS
--   user_id = NULL  -> broadcast (admin thấy)
--   user_id = X     -> chỉ user X thấy
-- ================================================================
CREATE TABLE notifications (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    user_id    INT  NULL,
    message    TEXT NOT NULL,
    type       ENUM('info','warning','error') DEFAULT 'info',
    is_read    TINYINT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ================================================================
-- TICKET_UPDATES: lịch sử cập nhật + ảnh đính kèm
-- ================================================================
CREATE TABLE IF NOT EXISTS ticket_updates (
    id         INT AUTO_INCREMENT PRIMARY KEY,
    ticket_id  INT NOT NULL,
    user_id    INT NOT NULL,
    message    TEXT,
    image_path VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id)   REFERENCES users(id)   ON DELETE CASCADE
);

SET FOREIGN_KEY_CHECKS = 1;

-- ================================================================
-- INDEXES
-- ================================================================
CREATE INDEX idx_tickets_status     ON tickets(status);
CREATE INDEX idx_tickets_staff      ON tickets(staff_id);
CREATE INDEX idx_tickets_tech       ON tickets(technician_id);
CREATE INDEX idx_tickets_created    ON tickets(created_at);
CREATE INDEX idx_notif_user_read    ON notifications(user_id, is_read);
CREATE INDEX idx_users_role         ON users(role, status);
CREATE INDEX idx_updates_ticket     ON ticket_updates(ticket_id);

-- ================================================================
-- SAMPLE DATA
-- Passwords duoc seed tu dong khi server start:
--   admin      : admin@system.com / admin123
--   staff      : nvb@company.com  / user123
--   technician : nva@tech.com     / tech123
-- ================================================================
INSERT INTO users (full_name, email, password_hash, role, department) VALUES
('Quan tri vien', 'admin@system.com', 'SEED', 'admin',      'IT'),
('Nguyen Van B',  'nvb@company.com',  'SEED', 'staff',      'Ke toan'),
('Tran Van C',    'tvc@company.com',  'SEED', 'staff',      'Nhan su'),
('Le Thi D',      'ltd@company.com',  'SEED', 'staff',      'Marketing'),
('Nguyen Van A',  'nva@tech.com',     'SEED', 'technician', 'IT'),
('Pham Van E',    'pve@tech.com',     'SEED', 'technician', 'IT'),
('Tran Van H',    'tvh@tech.com',     'SEED', 'technician', 'IT');

INSERT INTO tickets (code, staff_id, technician_id, title, description, category, priority, status) VALUES
('TK001',
    (SELECT id FROM users WHERE email='nvb@company.com'),
    (SELECT id FROM users WHERE email='nva@tech.com'),
    'May tinh khong khoi dong',
    'May tinh ban tai phong Ke toan khong bat duoc sau khi mat dien.',
    'Phan cung', 'high', 'processing'),
('TK002',
    (SELECT id FROM users WHERE email='tvc@company.com'),
    NULL,
    'Khong ket noi duoc WiFi',
    'Toan bo may trong phong Nhan su mat ket noi WiFi tu sang nay.',
    'Mang', 'medium', 'new'),
('TK003',
    (SELECT id FROM users WHERE email='ltd@company.com'),
    (SELECT id FROM users WHERE email='pve@tech.com'),
    'Cai dat phan mem ke toan',
    'Can cai phan mem MISA 2026 cho may tinh moi.',
    'Phan mem', 'low', 'assigned'),
('TK004',
    (SELECT id FROM users WHERE email='nvb@company.com'),
    (SELECT id FROM users WHERE email='nva@tech.com'),
    'May in khong in duoc',
    'May in tang 2 bao loi Offline, da thu khoi dong lai nhung khong duoc.',
    'May in', 'high', 'done'),
('TK005',
    (SELECT id FROM users WHERE email='tvc@company.com'),
    NULL,
    'Quen mat khau email cong ty',
    'Khong dang nhap duoc email cong ty, can reset mat khau.',
    'Tai khoan', 'medium', 'new');

INSERT INTO notifications (user_id, message, type) VALUES
-- null = chỉ admin thấy
(NULL, 'Ticket moi #TK002 dang cho phan cong ky thuat vien.', 'warning'),
(NULL, 'Ticket moi #TK005 dang cho phan cong ky thuat vien.', 'warning'),
-- staff_id = chi staff do thay
((SELECT id FROM users WHERE email='nvb@company.com'), 'Ticket #TK004 cua ban da duoc hoan thanh.', 'info'),
-- technician_id = chi technician do thay
((SELECT id FROM users WHERE email='nva@tech.com'), 'Ban duoc phan cong ticket #TK001: May tinh khong khoi dong. Vui long vao muc Ticket de chap nhan.', 'info'),
((SELECT id FROM users WHERE email='pve@tech.com'), 'Ban duoc phan cong ticket #TK003: Cai dat phan mem ke toan. Vui long vao muc Ticket de chap nhan.', 'info');
