// notewin.js — หน้าต่างสมุดจดแบบลอย: จดไปพร้อมกับอ่านแชท ไม่มีพื้นหลังบังจอ
// ลากที่หัวเพื่อย้าย · ลากมุมขวาล่างเพื่อปรับขนาด · ย่อเหลือแค่หัว · ปิดแล้วเปิดใหม่จากเมนู/แผง/คำสั่ง
//
// ตำแหน่งเป็น px จาก visualViewport (ไม่ใช้ % / bottom:0 / transform: <html> ของ ST มี transform ได้
// ซึ่งทำให้ position:fixed อ้างอิง <html> แทนจอ ดู skill sillytavern-extension-overlays ข้อ 1)
// เก็บขนาด/ตำแหน่งเป็นสัดส่วนของจอที่เห็น จึงย้ายระหว่างจอแนวตั้ง/แนวนอนได้ไม่หลุดจอ

let host = null;
let el = null;

const clamp = (v, a, b) => Math.min(Math.max(v, a), Math.max(a, b));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name) => `<i class="fa-solid ${name}" aria-hidden="true"></i>`;

function area() {
    const vv = window.visualViewport;
    return vv ? { x: vv.offsetLeft, y: vv.offsetTop, w: vv.width, h: vv.height } : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
}

const M = 8; // ระยะห่างจากขอบจอ
const MIN_W = 240, MIN_H = 150;

function geo() {
    const s = host.settings();
    if (!s.noteWin || typeof s.noteWin !== 'object') s.noteWin = {};
    return s.noteWin;
}

/** ขนาด/ตำแหน่งเริ่มต้น: มือถือ = เต็มความกว้าง ครึ่งบนของจอ · จอกว้าง = กล่องเล็กมุมขวาบน */
function defaults(a) {
    if (a.w < 640) return { w: a.w - 2 * M, h: Math.round(a.h * 0.42), left: M, top: M };
    const w = 360, h = 320;
    return { w, h, left: a.w - w - 24, top: 72 };
}

export function placeNoteWin() {
    if (!el || el.hidden || el.classList.contains('ayc-nw-moving')) return;
    const a = area();
    const g = geo(), d = defaults(a);
    const maxW = a.w - 2 * M, maxH = a.h - 2 * M;
    const w = Math.round(clamp(g.w != null ? g.w * a.w : d.w, Math.min(MIN_W, maxW), maxW));
    const fullH = Math.round(clamp(g.h != null ? g.h * a.h : d.h, Math.min(MIN_H, maxH), maxH));
    const h = g.min ? el.querySelector('.ayc-nw-head').offsetHeight + 2 : fullH;
    const left = clamp(g.x != null ? g.x * (a.w - w) : d.left, M, a.w - w - M);
    const top = clamp(g.y != null ? g.y * (a.h - h) : d.top, M, a.h - h - M);
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.left = `${Math.round(a.x + left)}px`;
    el.style.top = `${Math.round(a.y + top)}px`;
}

let placeTimer = 0;
function placeSoon() {
    requestAnimationFrame(placeNoteWin);
    clearTimeout(placeTimer);
    placeTimer = setTimeout(placeNoteWin, 350); // iOS บอกขนาดหลังคีย์บอร์ดเลื่อนเสร็จช้า
}

/** จำตำแหน่ง/ขนาดปัจจุบันเป็นสัดส่วนของจอที่เห็น */
function remember({ size = false } = {}) {
    const a = area(), r = el.getBoundingClientRect(), g = geo();
    if (size) {
        g.w = clamp(r.width / a.w, 0.1, 1);
        g.h = clamp(r.height / a.h, 0.1, 1);
    }
    g.x = clamp((r.left - a.x) / Math.max(1, a.w - r.width), 0, 1);
    g.y = clamp((r.top - a.y) / Math.max(1, a.h - r.height), 0, 1);
    host.save();
}

export function isNoteWinOpen() { return !!host?.settings().noteWinOpen; }

export function openNoteWin() { host.settings().noteWinOpen = true; host.save(); renderNoteWin(); el?.querySelector('textarea')?.focus({ preventScroll: true }); }
export function closeNoteWin() { host.settings().noteWinOpen = false; host.save(); renderNoteWin(); }
export function toggleNoteWin() { isNoteWinOpen() ? closeNoteWin() : openNoteWin(); }

function build() {
    el = document.createElement('div');
    el.id = 'ayc-notewin';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', 'สมุดจด');
    el.innerHTML = `
<div class="ayc-nw-head">
  <span class="ayc-nw-title">${icon('fa-feather-pointed')}<span class="ayc-nw-titletext"><b>สมุดจด</b><small data-ref="who"></small></span></span>
  <label class="ayc-switch" title="ส่งให้โมเดล"><input type="checkbox" data-act="on"><span class="ayc-knob"></span><span class="ayc-sr">ส่งให้โมเดล</span></label>
  <button class="ayc-icon" data-act="min" title="ย่อ" aria-label="ย่อ">${icon('fa-window-minimize')}</button>
  <button class="ayc-icon" data-act="close" title="ปิด" aria-label="ปิด">${icon('fa-xmark')}</button>
</div>
<div class="ayc-nw-body" data-ref="body"></div>
<div class="ayc-nw-grip" title="ลากเพื่อปรับขนาด">${icon('fa-up-right-and-down-left-from-center')}</div>`;
    document.body.append(el);

    // ปุ่มบนหัว
    el.addEventListener('click', e => {
        const t = e.target instanceof Element ? e.target.closest('[data-act]') : null;
        if (!t) return;
        const act = t.dataset.act;
        if (act === 'close') closeNoteWin();
        else if (act === 'min') { const g = geo(); g.min = !g.min; host.save(); renderNoteWin(); }
        else if (act === 'adopt') host.adopt();
        else if (act === 'fresh') host.fresh();
        else if (act === 'panel') host.openPanel();
    });
    el.addEventListener('change', e => {
        if (e.target instanceof HTMLInputElement && e.target.dataset.act === 'on') host.setOn(e.target.checked);
    });
    el.addEventListener('input', e => {
        const ta = e.target;
        if (!(ta instanceof HTMLTextAreaElement)) return;
        if (host.setText(ta.value, ta.dataset.chat)) updateMeta();
    });
    // ย่ออยู่: แตะหัวเพื่อกางออก (ไม่นับการลาก)
    el.querySelector('.ayc-nw-head').addEventListener('dblclick', e => {
        if (e.target instanceof Element && e.target.closest('button, label')) return;
        const g = geo(); g.min = !g.min; host.save(); renderNoteWin();
    });

    dragger(el.querySelector('.ayc-nw-head'), false);
    dragger(el.querySelector('.ayc-nw-grip'), true);
}

/** ลากหัว = ย้าย · ลากมุม = ปรับขนาด (pointer events ใช้ได้ทั้งเมาส์และนิ้ว) */
function dragger(handle, resize) {
    let start = null;
    handle.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        if (!resize && e.target instanceof Element && e.target.closest('button, label, input')) return;
        const r = el.getBoundingClientRect();
        start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, w: r.width, h: r.height, id: e.pointerId, moved: false };
        try { handle.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    handle.addEventListener('pointermove', e => {
        if (!start || e.pointerId !== start.id) return;
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (!start.moved && Math.hypot(dx, dy) < 5) return;
        if (!start.moved) { start.moved = true; el.classList.add('ayc-nw-moving'); }
        e.preventDefault();
        const a = area();
        if (resize) {
            el.style.width = `${clamp(start.w + dx, MIN_W, a.x + a.w - start.left - M)}px`;
            el.style.height = `${clamp(start.h + dy, MIN_H, a.y + a.h - start.top - M)}px`;
        } else {
            el.style.left = `${clamp(start.left + dx, a.x + M, a.x + a.w - start.w - M)}px`;
            el.style.top = `${clamp(start.top + dy, a.y + M, a.y + a.h - start.h - M)}px`;
        }
    });
    const end = e => {
        if (!start || e.pointerId !== start.id) return;
        const moved = start.moved;
        start = null;
        if (!moved) return;
        el.classList.remove('ayc-nw-moving');
        remember({ size: resize });
        placeNoteWin();
    };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
}

function updateMeta() {
    if (!el) return;
    const m = el.querySelector('[data-ref="meta"]');
    if (m) m.textContent = host.metaText();
}

/** วาดใหม่ทั้งหมด (เปลี่ยนแชท ล็อก/ปลดล็อก เปิด/ปิด) แต่ไม่ทับช่องที่กำลังพิมพ์ */
export function renderNoteWin() {
    if (!host) return;
    const open = isNoteWinOpen();
    if (!open) { if (el) el.hidden = true; return; }
    if (!el) build();
    el.hidden = false;
    el.dataset.scheme = host.settings().scheme || 'theme';
    const g = geo();
    el.classList.toggle('ayc-nw-min', !!g.min);
    el.querySelector('[data-act="min"]').innerHTML = icon(g.min ? 'fa-window-maximize' : 'fa-window-minimize');
    el.querySelector('[data-act="min"]').title = g.min ? 'กางออก' : 'ย่อ';

    const info = host.info(); // { chatId, who, hasChat, note: {text,on,lock}, active, enabled }
    el.querySelector('[data-ref="who"]').textContent = info.hasChat ? info.who : 'ยังไม่ได้เปิดแชท';
    el.querySelector('[data-ref="who"]').title = info.hasChat ? `ผูกกับแชท: ${info.chatId}` : '';
    const sw = el.querySelector('[data-act="on"]');
    sw.checked = info.note.on;
    sw.disabled = !info.hasChat || !!info.note.lock;
    el.classList.toggle('ayc-nw-live', info.active);

    const body = el.querySelector('[data-ref="body"]');
    const ta = body.querySelector('textarea');
    const typing = ta && document.activeElement === ta && ta.dataset.chat === info.chatId && !info.note.lock;
    if (typing) { updateMeta(); placeNoteWin(); return; }

    if (!info.hasChat) {
        body.innerHTML = `<div class="ayc-nw-empty">${icon('fa-comment-slash')}<span>สมุดจดผูกกับแชท เปิดแชทก่อนแล้วค่อยจด</span></div>`;
    } else {
        const lock = info.note.lock;
        body.innerHTML = `
${lock ? `<div class="ayc-nw-lock" role="alert">
  <div>${icon('fa-lock')} <b>สมุดจดนี้เป็นของแชทอื่น ยังไม่ถูกส่ง</b></div>
  <small>${lock.sameBot
        ? `ติดมากับแชทที่แตกกิ่ง คัดลอก หรือเปลี่ยนชื่อมาจาก “${esc(lock.chat)}”`
        : `เป็นของบอท “${esc(lock.name || '?')}” (แชท “${esc(lock.chat)}”) ไม่ใช่บอทนี้`}</small>
  <div class="ayc-nw-lockbtns">
    <button class="ayc-btn" data-act="adopt">${icon('fa-lock-open')} ใช้กับแชทนี้</button>
    <button class="ayc-btn" data-act="fresh">${icon('fa-file')} เริ่มสมุดใหม่</button>
  </div>
</div>` : ''}
<textarea class="ayc-input ayc-nw-text" data-chat="${esc(info.chatId)}" spellcheck="false" ${lock ? 'readonly' : ''}
  placeholder="จดอะไรก็ได้ที่อยากให้บอทจำตลอด&#10;เช่น - {{user}} แพ้ถั่ว">${esc(info.note.text)}</textarea>
<div class="ayc-nw-foot"><span data-ref="meta"></span><button class="ayc-link" data-act="panel" title="เปิดในแผง As you command">${icon('fa-up-right-from-square')} แผง</button></div>`;
        updateMeta();
    }
    placeNoteWin();
}

export function initNoteWin(h) {
    host = h;
    window.addEventListener('resize', placeSoon);
    window.visualViewport?.addEventListener('resize', placeSoon);
    window.visualViewport?.addEventListener('scroll', () => placeNoteWin());
    renderNoteWin();
}
