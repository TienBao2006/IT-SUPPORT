// Auth guard
async function checkAuth(requiredRole) {
    const res = await fetch('/api/auth/me').then(r=>r.json()).catch(()=>({success:false}));
    if (!res.success) { location.href='/login.html'; return null; }
    if (requiredRole && res.data.role !== requiredRole) { location.href='/login.html'; return null; }
    return res.data;
}
async function logout() {
    await fetch('/api/auth/logout',{method:'POST'});
    location.href='/login.html';
}

// Notification badge
async function loadNotifCount() {
    const res = await fetch('/api/notifications/unread-count').then(r=>r.json()).catch(()=>null);
    if (!res?.success) return;
    const c = parseInt(res.data.count)||0;
    document.querySelectorAll('.notif-badge').forEach(el=>{
        el.textContent=c; el.style.display=c>0?'flex':'none';
    });
}

// Maps
const STATUS_MAP = {
    new:        {label:'Mới',          cls:'b-new'},
    assigned:   {label:'Đã phân công', cls:'b-assigned'},
    processing: {label:'Đang xử lý',  cls:'b-processing'},
    waiting:    {label:'Chờ phản hồi',cls:'b-waiting'},
    done:       {label:'Hoàn thành',  cls:'b-done'},
    overdue:    {label:'Quá hạn',     cls:'b-overdue'}
};
const PRIORITY_MAP = {
    urgent:{label:'Khẩn cấp',cls:'p-urgent'},
    high:  {label:'Cao',     cls:'p-high'},
    medium:{label:'Trung bình',cls:'p-medium'},
    low:   {label:'Thấp',   cls:'p-low'}
};
const ROLE_MAP = {
    admin:      {label:'Quản trị viên', cls:'b-admin'},
    staff:      {label:'Nhân viên',     cls:'b-staff'},
    technician: {label:'Kỹ thuật viên', cls:'b-technician'}
};

function statusBadge(s) {
    const m=STATUS_MAP[s]||{label:s,cls:''};
    return `<span class="badge ${m.cls}">${m.label}</span>`;
}
function priorityBadge(p) {
    const m=PRIORITY_MAP[p]||{label:p,cls:''};
    return `<span class="${m.cls}">${m.label}</span>`;
}
function roleBadge(r) {
    const m=ROLE_MAP[r]||{label:r,cls:''};
    return `<span class="badge ${m.cls}">${m.label}</span>`;
}
function fmtDate(d) { return d?new Date(d).toLocaleDateString('vi-VN'):'—'; }
function fmtDateTime(d) { return d?new Date(d).toLocaleString('vi-VN'):'—'; }
