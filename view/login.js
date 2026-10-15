// Redirect if already logged in
(async () => {
    try {
        const res = await fetch('/api/auth/me').then(r => r.json());
        if (res.success && res.data?.role) {
            goTo(res.data.role);
        }
    } catch (_) {}
})();

// Key listener for Enter
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') login();
});

// Role redirection mapper
function goTo(role) {
    const map = {
        admin: '/admin/index.html',
        staff: '/staff/dashboard.html',
        technician: '/technician/dashboard.html'
    };
    location.href = map[role] || '/login.html';
}

// Quick autofill demo accounts
function quickFill(role) {
    const accounts = {
        admin: { email: 'admin@system.com', pass: 'admin123' },
        staff: { email: 'nvb@company.com', pass: 'user123' },
        tech:  { email: 'nva@tech.com', pass: 'tech123' }
    };
    const acc = accounts[role];
    if (acc) {
        document.getElementById('email').value = acc.email;
        document.getElementById('password').value = acc.pass;
        document.getElementById('errMsg').style.display = 'none';
        // Subtle focus animation
        const btn = document.getElementById('loginBtn');
        btn.focus();
    }
}

// Toggle show/hide password
function togglePassword() {
    const pwInput = document.getElementById('password');
    const toggleBtn = document.getElementById('togglePw');
    if (pwInput.type === 'password') {
        pwInput.type = 'text';
        toggleBtn.textContent = '🙈';
    } else {
        pwInput.type = 'password';
        toggleBtn.textContent = '👁️';
    }
}

// Main login logic
async function login() {
    const emailEl = document.getElementById('email');
    const passEl = document.getElementById('password');
    const errEl = document.getElementById('errMsg');
    const btn = document.getElementById('loginBtn');
    const spinner = document.getElementById('btnSpinner');
    const btnText = document.getElementById('btnText');

    const email = emailEl.value.trim();
    const password = passEl.value;

    errEl.style.display = 'none';

    if (!email || !password) {
        errEl.textContent = '⚠️ Vui lòng nhập đầy đủ Email và Mật khẩu';
        errEl.style.display = 'block';
        if (!email) emailEl.focus();
        else passEl.focus();
        return;
    }

    btn.disabled = true;
    if (spinner) spinner.style.display = 'inline-block';
    if (btnText) btnText.textContent = 'Đang đăng nhập...';

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        }).then(r => r.json());

        if (res.success && res.data?.role) {
            goTo(res.data.role);
        } else {
            errEl.textContent = '⚠️ ' + (res.message || 'Email hoặc mật khẩu không chính xác');
            errEl.style.display = 'block';
            btn.disabled = false;
            if (spinner) spinner.style.display = 'none';
            if (btnText) btnText.textContent = 'Đăng nhập';
        }
    } catch (err) {
        errEl.textContent = '⚠️ Lỗi kết nối đến máy chủ. Vui lòng thử lại sau.';
        errEl.style.display = 'block';
        btn.disabled = false;
        if (spinner) spinner.style.display = 'none';
        if (btnText) btnText.textContent = 'Đăng nhập';
    }
}
