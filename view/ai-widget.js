/**
 * AI Chat Widget — Floating Messenger-style
 * File: /view/ai-widget.js
 *
 * Chức năng:
 *  - Nút chat nổi góc dưới phải
 *  - Cửa sổ chat kiểu Messenger (bong bóng, avatar, typing...)
 *  - Gửi text + hình ảnh (base64) lên /api/ai/chat
 *  - Lưu lịch sử chat vào localStorage (theo role)
 *  - Hỗ trợ retry khi lỗi, xem ảnh phóng to khi click
 *  - Responsive: full-screen trên mobile
 *
 * Cách dùng: thêm <script src="/ai-widget.js"></script> vào cuối <body>
 * Widget tự khởi tạo khi DOM sẵn sàng.
 * Biến toàn cục cần có trước: window.AI_WIDGET_ROLE ('staff'|'technician'|'admin')
 */

(function () {
    'use strict';

    // ── Cấu hình ────────────────────────────────────────────────────────
    const STORAGE_KEY_PREFIX = 'ai_widget_history_';
    const MAX_HISTORY = 40;       // số tin nhắn lưu trong localStorage
    const MAX_HISTORY_SEND = 12;  // số lượt gửi lên API
    const MAX_IMG_MB = 5;         // giới hạn dung lượng ảnh
    const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

    // Chips gợi ý theo role
    const CHIPS = {
        staff: [
            '💻 Máy tính của tôi bị lỗi',
            '🌐 Không vào được internet',
            '📧 Không gửi được email',
            '🖨️ Kết nối máy in',
            '🔑 Quên mật khẩu máy tính',
            '🐢 Máy chạy chậm bất thường',
        ],
        technician: [
            '🌐 Máy không kết nối WiFi',
            '🖨️ Máy in báo lỗi offline',
            '💻 Máy tính không khởi động',
            '🔑 Reset mật khẩu Windows',
            '🖥️ Màn hình xanh BSOD',
            '🔧 Driver thiết bị lỗi',
            '📧 Outlook không nhận mail',
            '📶 Mạng LAN chậm bất thường',
        ],
        admin: [
            '🔐 Quản lý tài khoản Active Directory',
            '🖧 Cấu hình mạng nội bộ',
            '📊 Báo cáo sự cố hệ thống',
            '🛡️ Bảo mật và phân quyền',
        ],
    };

    // ── State ────────────────────────────────────────────────────────────
    let isOpen = false;
    let isLoading = false;
    let chatHistory = [];
    let pendingImage = null;   // { dataUrl, base64, mimeType, name }
    let userInitials = 'U';
    let userRole = 'staff';
    let lastFailedPayload = null; // dùng cho retry

    // ── Khởi tạo sau DOM ────────────────────────────────────────────────
    function init() {
        userRole = (window.AI_WIDGET_ROLE || 'staff').toLowerCase();
        injectHTML();
        bindEvents();
        loadHistory();
        // Lấy initials từ user đã đăng nhập (nếu có)
        fetchUserInitials();
    }

    async function fetchUserInitials() {
        try {
            const res = await fetch('/api/auth/me').then(r => r.json());
            if (res.success && res.data) {
                const name = res.data.full_name || '';
                userInitials = name.split(' ').slice(-2).map(w => w[0]).join('').toUpperCase() || 'U';
                document.getElementById('ai-fab-user-label')?.setAttribute('data-initials', userInitials);
            }
        } catch (_) { /* không làm gì */ }
    }

    // ── Tạo HTML ─────────────────────────────────────────────────────────
    function injectHTML() {
        const chips = (CHIPS[userRole] || CHIPS.staff)
            .map(c => `<button class="ai-chip" type="button">${c}</button>`)
            .join('');

        const html = `
<!-- AI Widget -->
<link rel="stylesheet" href="/css/ai-widget.css">

<button id="ai-fab" title="Trợ lý AI" aria-label="Mở trợ lý AI">
    <span id="ai-fab-dot"></span>
    <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2H4a2 2 0 0 0-2 2v18l4-4h14a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zm-2 10H6v-2h12v2zm0-3H6V7h12v2z"/>
    </svg>
</button>

<div id="ai-window" role="dialog" aria-label="Chat với trợ lý AI" aria-hidden="true">
    <!-- Header -->
    <div id="ai-header">
        <div id="ai-header-avatar">🤖</div>
        <div id="ai-header-info">
            <div id="ai-header-name">IT Bot</div>
            <div id="ai-header-status">
                <span id="ai-status-dot"></span>
                <span>Đang trực tuyến</span>
            </div>
        </div>
        <button class="ai-header-btn" id="ai-clear-btn" title="Xóa lịch sử chat">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
            </svg>
        </button>
        <button class="ai-header-btn" id="ai-minimize-btn" title="Thu nhỏ">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor">
                <path d="M19 13H5v-2h14v2z"/>
            </svg>
        </button>
        <button class="ai-header-btn" id="ai-close-btn" title="Đóng">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
            </svg>
        </button>
    </div>

    <!-- Messages -->
    <div id="ai-messages">
        <div id="ai-welcome">
            <span class="ai-wi-icon">🤖</span>
            <h4>Xin chào! Mình là IT Bot</h4>
            <p>Bạn đang gặp sự cố kỹ thuật gì?<br>Mình sẵn sàng hỗ trợ ngay!</p>
            <div id="ai-chips">${chips}</div>
        </div>
    </div>

    <!-- Image preview bar -->
    <div id="ai-img-preview">
        <img id="ai-preview-thumb" src="" alt="preview">
        <span id="ai-preview-name">ảnh.jpg</span>
        <button id="ai-preview-remove" title="Xóa ảnh">✕</button>
    </div>

    <!-- Input bar -->
    <div id="ai-input-bar">
        <div id="ai-input-row">
            <button id="ai-attach-btn" type="button" title="Đính kèm hình ảnh">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
                    <path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/>
                </svg>
            </button>
            <input type="file" id="ai-file-input" accept="image/jpeg,image/png,image/gif,image/webp" aria-label="Chọn ảnh đính kèm">
            <textarea id="ai-text-input"
                placeholder="Nhập câu hỏi hoặc mô tả sự cố..."
                rows="1"
                aria-label="Tin nhắn cho AI"
            ></textarea>
            <button id="ai-send-btn" type="button" title="Gửi" aria-label="Gửi tin nhắn">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                </svg>
            </button>
        </div>
        <div id="ai-input-hint">Enter gửi · Shift+Enter xuống dòng · Hỗ trợ bởi Gemini AI</div>
    </div>
</div>`;

        const container = document.createElement('div');
        container.id = 'ai-widget-root';
        container.innerHTML = html;
        document.body.appendChild(container);
    }

    // ── Bind events ──────────────────────────────────────────────────────
    function bindEvents() {
        // FAB toggle
        document.getElementById('ai-fab').addEventListener('click', toggleWidget);

        // Header buttons
        document.getElementById('ai-close-btn').addEventListener('click', closeWidget);
        document.getElementById('ai-minimize-btn').addEventListener('click', closeWidget);
        document.getElementById('ai-clear-btn').addEventListener('click', clearChat);

        // Send
        document.getElementById('ai-send-btn').addEventListener('click', sendMessage);

        // Textarea — Enter to send, Shift+Enter new line, auto-resize
        const textarea = document.getElementById('ai-text-input');
        textarea.addEventListener('keydown', function (e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        textarea.addEventListener('input', function () {
            this.style.height = 'auto';
            this.style.height = Math.min(this.scrollHeight, 100) + 'px';
        });

        // Attach image
        document.getElementById('ai-attach-btn').addEventListener('click', function () {
            document.getElementById('ai-file-input').click();
        });
        document.getElementById('ai-file-input').addEventListener('change', handleFileSelect);

        // Remove preview
        document.getElementById('ai-preview-remove').addEventListener('click', clearImage);

        // Chip clicks (delegated)
        document.getElementById('ai-chips').addEventListener('click', function (e) {
            const chip = e.target.closest('.ai-chip');
            if (!chip) return;
            const text = chip.textContent.replace(/^[^\s]+\s/, '').trim();
            document.getElementById('ai-text-input').value = text;
            sendMessage();
        });

        // Close on outside click
        document.addEventListener('click', function (e) {
            if (!isOpen) return;
            const win = document.getElementById('ai-window');
            const fab = document.getElementById('ai-fab');
            if (!win.contains(e.target) && !fab.contains(e.target)) {
                closeWidget();
            }
        });

        // ESC to close
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && isOpen) closeWidget();
        });
    }

    // ── Widget open/close ────────────────────────────────────────────────
    function toggleWidget() {
        isOpen ? closeWidget() : openWidget();
    }

    function openWidget() {
        isOpen = true;
        const win = document.getElementById('ai-window');
        const fab = document.getElementById('ai-fab');
        win.classList.add('visible');
        win.setAttribute('aria-hidden', 'false');
        fab.classList.add('open');
        hideFabDot();
        // Focus textarea
        setTimeout(() => document.getElementById('ai-text-input').focus(), 200);
        scrollToBottom();
    }

    function closeWidget() {
        isOpen = false;
        const win = document.getElementById('ai-window');
        const fab = document.getElementById('ai-fab');
        win.classList.remove('visible');
        win.setAttribute('aria-hidden', 'true');
        fab.classList.remove('open');
    }

    function showFabDot() {
        if (!isOpen) document.getElementById('ai-fab-dot').style.display = 'block';
    }
    function hideFabDot() {
        document.getElementById('ai-fab-dot').style.display = 'none';
    }

    // ── History (localStorage) ───────────────────────────────────────────
    function storageKey() {
        return STORAGE_KEY_PREFIX + userRole;
    }

    function loadHistory() {
        try {
            const saved = localStorage.getItem(storageKey());
            if (!saved) return;
            chatHistory = JSON.parse(saved);
            if (!chatHistory.length) return;
            // Xóa welcome screen
            document.getElementById('ai-welcome')?.remove();
            chatHistory.forEach(m => {
                if (m.role === 'user') {
                    renderUserBubble(m.content, m.image || null, false);
                } else {
                    renderBotBubble(m.content, false);
                }
            });
            scrollToBottom(false);
        } catch (_) {
            localStorage.removeItem(storageKey());
            chatHistory = [];
        }
    }

    function saveHistory() {
        try {
            const trimmed = chatHistory.slice(-MAX_HISTORY);
            localStorage.setItem(storageKey(), JSON.stringify(trimmed));
            chatHistory = trimmed;
        } catch (_) { /* quota exceeded — ignore */ }
    }

    // ── Image handling ───────────────────────────────────────────────────
    function handleFileSelect(e) {
        const file = e.target.files[0];
        if (!file) return;
        // Reset input để có thể chọn lại cùng file
        e.target.value = '';

        if (!ALLOWED_MIME.includes(file.type)) {
            showSystemMsg('⚠️ Chỉ hỗ trợ ảnh JPG, PNG, GIF hoặc WEBP.');
            return;
        }
        if (file.size > MAX_IMG_MB * 1024 * 1024) {
            showSystemMsg(`⚠️ Ảnh quá lớn (tối đa ${MAX_IMG_MB}MB). Vui lòng chọn ảnh nhỏ hơn.`);
            return;
        }

        const reader = new FileReader();
        reader.onload = function (ev) {
            const dataUrl = ev.target.result;
            // Tách phần base64 thuần (bỏ prefix "data:image/...;base64,")
            const base64 = dataUrl.split(',')[1];
            pendingImage = { dataUrl, base64, mimeType: file.type, name: file.name };
            showImagePreview(dataUrl, file.name);
        };
        reader.readAsDataURL(file);
    }

    function showImagePreview(dataUrl, name) {
        document.getElementById('ai-preview-thumb').src = dataUrl;
        document.getElementById('ai-preview-name').textContent = name;
        document.getElementById('ai-img-preview').classList.add('show');
        document.getElementById('ai-attach-btn').style.color = '#4f46e5';
    }

    function clearImage() {
        pendingImage = null;
        document.getElementById('ai-img-preview').classList.remove('show');
        document.getElementById('ai-preview-thumb').src = '';
        document.getElementById('ai-file-input').value = '';
        document.getElementById('ai-attach-btn').style.color = '';
    }

    // ── Send message ─────────────────────────────────────────────────────
    async function sendMessage(retryPayload) {
        if (isLoading) return;

        let message, image;

        if (retryPayload) {
            // Retry mode: dùng lại payload cũ
            message = retryPayload.message;
            image = retryPayload.image || null;
        } else {
            const input = document.getElementById('ai-text-input');
            message = input.value.trim();
            image = pendingImage
                ? { data: pendingImage.base64, mimeType: pendingImage.mimeType }
                : null;

            if (!message && !image) return;

            // Xóa welcome block khi có tin nhắn đầu tiên
            document.getElementById('ai-welcome')?.remove();

            // Hiển thị user bubble
            renderUserBubble(message, pendingImage ? pendingImage.dataUrl : null);

            // Lưu vào history
            chatHistory.push({
                role: 'user',
                content: message,
                image: pendingImage ? pendingImage.dataUrl : null
            });

            // Reset input
            input.value = '';
            input.style.height = 'auto';
            clearImage();
        }

        isLoading = true;
        document.getElementById('ai-send-btn').disabled = true;

        // Hiển thị typing
        const typingId = showTyping();
        lastFailedPayload = { message, image };

        try {
            const historyToSend = chatHistory
                .slice(-(MAX_HISTORY_SEND * 2))
                .filter(m => !m.image) // Không gửi lại ảnh cũ trong history (tối ưu token)
                .map(m => ({ role: m.role, content: m.content || '' }));

            const payload = { message, history: historyToSend };
            if (image) payload.image = image;

            const res = await fetch('/api/ai/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });

            removeTyping(typingId);

            if (!res.ok) {
                throw new Error(`HTTP ${res.status}`);
            }

            const data = await res.json();

            if (data.success && data.reply) {
                renderBotBubble(data.reply);
                chatHistory.push({ role: 'assistant', content: data.reply });
                saveHistory();
                lastFailedPayload = null;
                if (!isOpen) showFabDot();
            } else {
                throw new Error(data.message || 'Phản hồi không hợp lệ');
            }
        } catch (err) {
            removeTyping(typingId);
            renderErrorBubble('Không thể kết nối đến AI. Kiểm tra mạng rồi thử lại nhé!');
        }

        isLoading = false;
        document.getElementById('ai-send-btn').disabled = false;
    }

    // ── Render helpers ───────────────────────────────────────────────────
    function renderUserBubble(text, imageDataUrl, animate) {
        if (animate === undefined) animate = true;
        const msgs = document.getElementById('ai-messages');
        const time = nowTime();
        const el = document.createElement('div');
        el.className = 'ai-msg user' + (animate ? ' animated' : '');

        let imgHtml = '';
        if (imageDataUrl) {
            imgHtml = `<img class="ai-bubble-img" src="${escAttr(imageDataUrl)}" alt="ảnh đính kèm" onclick="window.open('${escAttr(imageDataUrl)}')">`;
        }
        let textHtml = text ? `<div class="ai-bubble">${escHtml(text)}</div>` : '';

        el.innerHTML = `
            <div class="ai-bubble-avatar">${escHtml(userInitials)}</div>
            <div class="ai-bubble-wrap">
                ${imgHtml}${textHtml}
                <div class="ai-bubble-time">${time}</div>
            </div>`;
        msgs.appendChild(el);
        if (animate) scrollToBottom();
    }

    function renderBotBubble(text, animate) {
        if (animate === undefined) animate = true;
        const msgs = document.getElementById('ai-messages');
        const time = nowTime();
        const el = document.createElement('div');
        el.className = 'ai-msg bot' + (animate ? ' animated' : '');
        el.innerHTML = `
            <div class="ai-bubble-avatar">🤖</div>
            <div class="ai-bubble-wrap">
                <div class="ai-bubble">${fmtBotText(text)}</div>
                <div class="ai-bubble-time">${time}</div>
            </div>`;
        msgs.appendChild(el);
        if (animate) scrollToBottom();
    }

    function renderErrorBubble(text) {
        const msgs = document.getElementById('ai-messages');
        const el = document.createElement('div');
        el.className = 'ai-msg bot animated';
        el.innerHTML = `
            <div class="ai-bubble-avatar">🤖</div>
            <div class="ai-bubble-wrap">
                <div class="ai-bubble error">${escHtml(text)}</div>
                <button class="ai-retry-btn" type="button">🔄 Thử lại</button>
                <div class="ai-bubble-time">${nowTime()}</div>
            </div>`;
        el.querySelector('.ai-retry-btn').addEventListener('click', function () {
            el.remove();
            if (lastFailedPayload) sendMessage(lastFailedPayload);
        });
        msgs.appendChild(el);
        scrollToBottom();
    }

    function showSystemMsg(text) {
        const msgs = document.getElementById('ai-messages');
        const el = document.createElement('div');
        el.style.cssText = 'text-align:center;font-size:11.5px;color:#64748b;padding:4px 0';
        el.textContent = text;
        msgs.appendChild(el);
        scrollToBottom();
        setTimeout(() => el.remove(), 4000);
    }

    function showTyping() {
        const msgs = document.getElementById('ai-messages');
        const id = 'ai-ty-' + Date.now();
        const el = document.createElement('div');
        el.className = 'ai-msg bot animated';
        el.id = id;
        el.innerHTML = `
            <div class="ai-bubble-avatar">🤖</div>
            <div class="ai-bubble-wrap">
                <div class="ai-typing">
                    <div class="ai-typing-dot"></div>
                    <div class="ai-typing-dot"></div>
                    <div class="ai-typing-dot"></div>
                </div>
            </div>`;
        msgs.appendChild(el);
        scrollToBottom();
        return id;
    }

    function removeTyping(id) {
        document.getElementById(id)?.remove();
    }

    // ── Clear chat ───────────────────────────────────────────────────────
    function clearChat() {
        if (chatHistory.length && !confirm('Xóa toàn bộ lịch sử trò chuyện?')) return;
        chatHistory = [];
        localStorage.removeItem(storageKey());
        clearImage();
        lastFailedPayload = null;

        const chips = (CHIPS[userRole] || CHIPS.staff)
            .map(c => `<button class="ai-chip" type="button">${c}</button>`)
            .join('');

        document.getElementById('ai-messages').innerHTML = `
            <div id="ai-welcome">
                <span class="ai-wi-icon">🤖</span>
                <h4>Xin chào! Mình là IT Bot</h4>
                <p>Bạn đang gặp sự cố kỹ thuật gì?<br>Mình sẵn sàng hỗ trợ ngay!</p>
                <div id="ai-chips">${chips}</div>
            </div>`;

        // Rebind chip clicks
        document.getElementById('ai-chips').addEventListener('click', function (e) {
            const chip = e.target.closest('.ai-chip');
            if (!chip) return;
            const text = chip.textContent.replace(/^[^\s]+\s/, '').trim();
            document.getElementById('ai-text-input').value = text;
            sendMessage();
        });
    }

    // ── Utilities ────────────────────────────────────────────────────────
    function scrollToBottom(smooth) {
        const msgs = document.getElementById('ai-messages');
        if (!msgs) return;
        if (smooth === false) {
            msgs.scrollTop = msgs.scrollHeight;
        } else {
            requestAnimationFrame(() => { msgs.scrollTop = msgs.scrollHeight; });
        }
    }

    function nowTime() {
        return new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    }

    function escHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#x27;');
    }

    function escAttr(str) {
        if (!str) return '';
        return String(str).replace(/"/g, '&quot;');
    }

    /**
     * Format bot text: chuyển newline thành <br>,
     * in đậm các số thứ tự bước "1.", "2." ở đầu dòng
     */
    function fmtBotText(text) {
        if (!text) return '';
        const escaped = escHtml(text);
        return escaped
            // Số thứ tự bước → in đậm
            .replace(/^(\d+\.)\s/gm, '<strong>$1</strong> ')
            // Newline → <br>
            .replace(/\n/g, '<br>');
    }

    // ── Khởi chạy ────────────────────────────────────────────────────────
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
