const express = require('express');
const router  = express.Router();
const multer  = require('multer');
const path    = require('path');
const { requireAuth, requireRole } = require('../middleware/auth');
const AuthController         = require('../controller/authController');
const TicketController       = require('../controller/ticketController');
const UserController         = require('../controller/userController');
const NotificationController = require('../controller/notificationController');
const ReportController       = require('../controller/reportController');

// Upload ảnh
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, path.join(__dirname, '../uploads')),
    filename:    (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } });

// ===== PUBLIC =====
router.post('/auth/login',  AuthController.login);
router.post('/auth/logout', AuthController.logout);
router.get('/auth/me',      AuthController.me);

// ===== PROTECTED =====
router.use(requireAuth);

router.post('/auth/change-password', AuthController.changePassword);

// Thông báo (mọi role)
router.get('/notifications',              NotificationController.getAll);
router.get('/notifications/unread-count', NotificationController.getUnreadCount);
router.patch('/notifications/all/read',   NotificationController.markAllRead);
router.patch('/notifications/:id/read',   NotificationController.markRead);

// ===== STAFF =====
router.get('/my/tickets',         requireRole('staff'), TicketController.getMyTickets);
router.get('/my/tickets/stats',   requireRole('staff'), TicketController.getMyStats);
router.post('/my/tickets',        requireRole('staff'), upload.single('image'), TicketController.create);
router.get('/my/tickets/:id',     requireRole('staff'), TicketController.getById);

// ===== TECHNICIAN =====
router.get('/assigned/tickets',         requireRole('technician'), TicketController.getAssignedTickets);
router.get('/assigned/tickets/stats',   requireRole('technician'), TicketController.getAssignedStats);
router.get('/assigned/tickets/:id',     requireRole('technician'), TicketController.getAssignedById);
router.post('/assigned/tickets/:id/accept', requireRole('technician'), TicketController.accept);
router.post('/assigned/tickets/:id/reject', requireRole('technician'), TicketController.reject);
router.post('/assigned/tickets/:id/update',
    requireRole('technician'),
    upload.single('image'),
    TicketController.addUpdate
);

// ===== ADMIN =====
router.get('/tickets/stats',      requireRole('admin'), TicketController.getStats);
router.get('/tickets',            requireRole('admin'), TicketController.getAll);
router.get('/tickets/:id',        requireRole('admin'), TicketController.getById);
router.post('/tickets',           requireRole('admin'), TicketController.create);
router.put('/tickets/:id/assign', requireRole('admin'), TicketController.assign);
router.put('/tickets/:id',        requireRole('admin'), TicketController.update);
router.delete('/tickets/:id',     requireRole('admin'), TicketController.delete);

router.get('/users',          requireRole('admin'), UserController.getAll);
router.get('/users/:id',      requireRole('admin'), UserController.getById);
router.post('/users',         requireRole('admin'), UserController.create);
router.put('/users/:id',      requireRole('admin'), UserController.update);
router.delete('/users/:id',   requireRole('admin'), UserController.delete);

router.get('/reports/by-month', requireRole('admin'), ReportController.getByMonth);

// AI Chat — hỗ trợ text + hình ảnh (multimodal)
router.post('/ai/chat', requireAuth, async (req, res) => {
    try {
        const { message, history, image } = req.body;
        // Cho phép gửi ảnh mà không có text (người dùng chỉ gửi ảnh)
        if (!message && !image) {
            return res.status(400).json({ success: false, message: 'Thiếu nội dung tin nhắn hoặc hình ảnh' });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.json({ success: true, reply: getFallbackReply(message || '') });
        }

        // ── System prompt tự nhiên, thân thiện ──────────────────────────────
        const systemPrompt = `Bạn là trợ lý AI tên "IT Bot" thuộc hệ thống IT Support nội bộ. Nhiệm vụ của bạn là hỗ trợ nhân viên và kỹ thuật viên giải quyết các vấn đề công nghệ thông tin tại công ty.

Phong cách giao tiếp:
- Trả lời tự nhiên, thân thiện như đang trò chuyện trực tiếp với đồng nghiệp — không quá trang trọng, không cứng nhắc.
- Ưu tiên tiếng Việt. Xưng "mình", gọi người dùng là "bạn".
- Câu trả lời cần rõ ràng, dễ hiểu. Nếu cần liệt kê các bước thì dùng số thứ tự (1. 2. 3.) cho dễ theo dõi.
- Không dùng markdown như **, ## hay các ký tự đặc biệt thừa.

Cách xử lý câu hỏi:
- Nếu câu hỏi rõ ràng: trả lời thẳng vào vấn đề, hướng dẫn từng bước nếu cần.
- Nếu câu hỏi chưa đủ thông tin: hỏi lại 1-2 chi tiết cụ thể để hiểu đúng vấn đề (thiết bị gì, lỗi gì, khi nào xảy ra...).
- Nếu người dùng gửi ảnh: phân tích nội dung ảnh và đưa ra nhận xét, giải thích hoặc hướng dẫn dựa trên ảnh đó.
- Nếu vấn đề nằm ngoài phạm vi IT: nói rõ và hướng dẫn liên hệ bộ phận phù hợp.
- Nếu không chắc chắn: nói thật là chưa rõ và đề xuất người dùng tạo ticket để kỹ thuật viên hỗ trợ trực tiếp.

Phạm vi hỗ trợ chính: máy tính, mạng, WiFi, máy in, phần mềm văn phòng, tài khoản, mật khẩu, lỗi hệ thống Windows/macOS, thiết bị ngoại vi.

Luôn kết thúc bằng cách hỏi xem vấn đề đã được giải quyết chưa hoặc cần hỗ trợ thêm gì không — trừ khi câu hỏi chỉ là hỏi thông tin đơn giản.`;

        // ── Xây dựng contents ────────────────────────────────────────────────
        const contents = [];

        // Đưa history vào (tối đa 12 lượt gần nhất)
        if (Array.isArray(history)) {
            for (const h of history.slice(-12)) {
                contents.push({
                    role: h.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: h.content || '' }]
                });
            }
        }

        // Xây dựng parts cho tin nhắn hiện tại
        const currentParts = [];

        // Nếu có ảnh base64
        if (image && typeof image === 'object' && image.data && image.mimeType) {
            // Kiểm tra định dạng MIME hợp lệ
            const allowedMimes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
            if (!allowedMimes.includes(image.mimeType)) {
                return res.status(400).json({ success: false, message: 'Định dạng ảnh không hỗ trợ. Vui lòng dùng JPG, PNG, GIF hoặc WEBP.' });
            }
            currentParts.push({
                inlineData: {
                    mimeType: image.mimeType,
                    data: image.data  // base64 string (không có prefix data:...)
                }
            });
        }

        // Thêm text (nếu có)
        if (message && message.trim()) {
            currentParts.push({ text: message.trim() });
        } else if (image) {
            // Người dùng chỉ gửi ảnh không kèm text
            currentParts.push({ text: 'Hãy phân tích hình ảnh này và cho mình biết bạn thấy gì, có vấn đề gì không?' });
        }

        contents.push({ role: 'user', parts: currentParts });

        // ── Gọi Gemini API ───────────────────────────────────────────────────
        const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system_instruction: { parts: [{ text: systemPrompt }] },
                    contents,
                    generationConfig: {
                        maxOutputTokens: 1500,
                        temperature: 0.75,
                        topP: 0.95
                    },
                    safetySettings: [
                        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_ONLY_HIGH' },
                        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_ONLY_HIGH' },
                        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' }
                    ]
                })
            }
        );

        if (response.ok) {
            const data = await response.json();
            const reply = data.candidates?.[0]?.content?.parts?.[0]?.text;
            if (reply) return res.json({ success: true, reply: reply.trim() });
            // Kiểm tra nếu bị block bởi safety filter
            const finishReason = data.candidates?.[0]?.finishReason;
            if (finishReason === 'SAFETY') {
                return res.json({ success: true, reply: 'Mình không thể trả lời câu hỏi này. Bạn có thể hỏi theo cách khác hoặc liên hệ trực tiếp với bộ phận IT nhé.' });
            }
            console.error('Gemini empty reply:', JSON.stringify(data).slice(0, 300));
        } else {
            const errText = await response.text().catch(() => '');
            console.error('Gemini API error:', response.status, errText.slice(0, 300));
        }

        // Fallback nếu Gemini lỗi
        res.json({ success: true, reply: getFallbackReply(message || '') });
    } catch (err) {
        console.error('AI chat error:', err.message);
        res.json({ success: true, reply: getFallbackReply(req.body?.message || '') });
    }
});

// Danh sách technician kèm stats (admin dùng để phân công)
router.get('/technicians', requireAuth, async (req, res) => {
    try {
        const db = require('../config/database');
        const [rows] = await db.execute(`
            SELECT u.id, u.full_name, u.email, u.status,
                COALESCE(SUM(t.status IN ('assigned','processing','waiting')), 0) AS tickets_processing,
                COALESCE(SUM(t.status = 'done'), 0) AS tickets_done
            FROM users u
            LEFT JOIN tickets t ON t.technician_id = u.id
            WHERE u.role = 'technician'
            GROUP BY u.id ORDER BY u.full_name
        `);
        res.json({ success: true, data: rows });
    } catch (err) { res.status(500).json({ success: false, message: err.message }); }
});

module.exports = router;

// ===== AI FALLBACK — dùng khi không có key hoặc Gemini lỗi =====
function getFallbackReply(msg) {
    const m = (msg || '').toLowerCase();

    if (m.includes('wifi') || m.includes('mạng') || m.includes('internet') || m.includes('kết nối'))
        return 'Mình nghe rồi! Sự cố mạng/WiFi khá hay gặp. Bạn thử các bước này xem sao nhé:\n1. Tắt WiFi rồi bật lại trên máy.\n2. Khởi động lại router/modem (rút điện 30 giây).\n3. Vào Device Manager > Network Adapters, click phải > Disable rồi Enable lại.\n4. Mở CMD chạy lệnh: ipconfig /flushdns\nNếu vẫn không được, bạn cho mình biết thêm: máy dùng WiFi hay dây LAN, và lỗi xuất hiện khi nào (mới cài Windows, sau khi cập nhật...) để mình hỗ trợ cụ thể hơn nhé!';

    if (m.includes('máy in') || m.includes('printer') || m.includes('in ấn'))
        return 'Máy in báo lỗi thì mình kiểm tra theo thứ tự này:\n1. Kiểm tra cáp USB/mạng và nguồn điện máy in.\n2. Vào Control Panel > Devices and Printers, xem máy in có hiện "Offline" không — nếu có thì click phải > See what\'s printing > Use Printer Online.\n3. Xóa hàng đợi in bị kẹt: mở Services.msc, tìm Print Spooler, Stop > xóa file trong C:\\Windows\\System32\\spool\\PRINTERS > Start lại.\nBạn đang gặp lỗi gì cụ thể (thông báo lỗi là gì)? Mình có thể hỗ trợ chi tiết hơn!';

    if (m.includes('màn hình xanh') || m.includes('bsod') || m.includes('blue screen'))
        return 'Màn hình xanh (BSOD) thì cần chú ý mã lỗi hiển thị trên màn hình (ví dụ: IRQL_NOT_LESS_OR_EQUAL, MEMORY_MANAGEMENT...). Nguyên nhân phổ biến:\n1. Driver lỗi — thử rollback driver gần nhất.\n2. RAM hỏng — chạy Windows Memory Diagnostic.\n3. Ổ đĩa lỗi — chạy chkdsk /f.\nBạn có nhớ mã lỗi hiển thị trên màn hình xanh không? Mình sẽ hướng dẫn cụ thể hơn!';

    if (m.includes('máy tính') || m.includes('khởi động') || m.includes('boot') || m.includes('không bật'))
        return 'Máy không khởi động được thì mình cần biết thêm chút:\n- Máy có bật nguồn được không (có đèn/quạt quay không)?\n- Có nghe tiếng bíp khi bật không?\n- Màn hình hiện gì (logo BIOS, màn hình đen, hay không hiện gì)?\nThông thường hay gặp nhất là: RAM bị bụi (rút ra lau rồi cắm lại), hoặc ổ cứng mất kết nối. Bạn mô tả thêm để mình hỗ trợ đúng hướng hơn nhé!';

    if (m.includes('phần mềm') || m.includes('cài đặt') || m.includes('install') || m.includes('cài '))
        return 'Cài phần mềm bị lỗi thì thử theo thứ tự:\n1. Click phải file cài đặt > Run as Administrator.\n2. Kiểm tra ổ đĩa còn đủ dung lượng không (cần ít nhất 2-3GB trống).\n3. Kiểm tra phần mềm có tương thích với Windows 32-bit hay 64-bit không.\n4. Tắt tạm antivirus khi cài (bật lại sau khi xong).\nBạn đang cài phần mềm gì và lỗi báo gì? Mình kiểm tra cụ thể giúp!';

    if (m.includes('mật khẩu') || m.includes('tài khoản') || m.includes('đăng nhập') || m.includes('quên'))
        return 'Vấn đề tài khoản/mật khẩu thì mình phân biệt như sau:\n- Mật khẩu Windows local: cần boot USB WinPE để reset, hoặc dùng tài khoản admin khác trên máy.\n- Tài khoản domain (Active Directory): liên hệ IT Admin để reset — mình không thể tự reset được.\n- Email/Office 365: dùng chức năng "Forgot password" hoặc nhờ admin reset.\nBạn đang gặp vấn đề với loại tài khoản nào vậy?';

    if (m.includes('chậm') || m.includes('lag') || m.includes('đơ') || m.includes('treo'))
        return 'Máy chậm/đơ thì thử:\n1. Mở Task Manager (Ctrl+Shift+Esc) xem CPU/RAM có bị ngốn 100% không — nếu có thì xem tiến trình nào chiếm nhiều nhất.\n2. Khởi động lại máy nếu lâu không tắt.\n3. Dọn file rác: chạy Disk Cleanup.\n4. Kiểm tra máy có bị nhiễm malware không — chạy Windows Defender.\nBạn máy đơ ở thời điểm nào (khi mở phần mềm cụ thể hay liên tục)? Mình hỗ trợ thêm nhé!';

    if (!msg || msg.trim().length < 5)
        return 'Xin chào! Mình là IT Bot, sẵn sàng hỗ trợ bạn các vấn đề kỹ thuật. Bạn đang gặp sự cố gì vậy? Cứ mô tả tự nhiên, mình sẽ giúp ngay!';

    return 'Mình hiểu rồi! Để hỗ trợ chính xác hơn, bạn cho mình biết thêm: thiết bị là gì, thông báo lỗi cụ thể là gì, và sự cố xảy ra từ khi nào? Nếu phức tạp hơn, bạn có thể tạo ticket để kỹ thuật viên hỗ trợ trực tiếp nhé.';
}
