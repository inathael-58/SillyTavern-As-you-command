// As you command — ปุ่มลอยบนจอ
// ตัวเลขบนปุ่ม = จำนวนคำสั่งที่มีผลอยู่ตอนนี้ (เปิดอยู่และมีข้อความ) · ปุ่มเทาเมื่อปิดทั้ง extension
// แตะ = เปิดแผง · ลาก = ย้าย (ติดขอบที่ใกล้ที่สุด) · กดค้าง = แต่งหน้าตาปุ่ม
// หน้าตาแต่งได้แบบเดียวกับ Chat Browser: รูปทรง ไอคอน อีโมจิ รูปภาพ สี ขนาด การเคลื่อนไหว
// ไม่ใช้ transform กับตัวปุ่มที่ fixed เพราะ ST ใส่ 3D perspective ไว้ที่ <html>

export const LAUNCH_POS_DEFAULT = Object.freeze({ x: 1, y: 0.45, edge: 'right' });

export const LOOK_DEFAULT = Object.freeze({
    shape: 'squircle',  // circle squircle bubble pill heart flower star cloud sticker
    icon: 'fa-scroll',
    emoji: '',          // ใช้แทนไอคอน
    image: '',          // data: URL หรือลิงก์ ใช้แทนไอคอนและอีโมจิ
    fit: 'cover',       // cover | contain
    size: 48,
    iconSize: 44,       // % ของปุ่ม
    bg: 'theme',        // theme (ไล่สีแบบโลโก้) | glass | custom | none
    bgColor: '#2a2633',
    fg: 'theme',        // theme (ขาว) | accent | custom
    fgColor: '#ffd38a',
    border: false,
    shadow: true,
    anim: 'none',       // none float sway pulse spin glow nudge
    opacity: 100,
    label: 'OOC',       // แสดงเมื่อเป็นแคปซูล
    badge: true,
});

const svgMask = d => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>${d}</svg>`)}")`;
const MASKS = {
    heart: { mask: svgMask("<path d='M50 90C22 70 3 53 3 31 3 15 15 4 29 4c9 0 17 5 21 13 4-8 12-13 21-13 14 0 26 11 26 27 0 22-19 39-47 59z'/>"), nudge: '-6%' },
    star: { mask: svgMask("<path d='M50 3l13.6 30.2 32.9 3.6-24.6 22.2 7 32.4L50 75 21.1 91.4l7-32.4L3.5 36.8l32.9-3.6z' stroke='black' stroke-width='5' stroke-linejoin='round'/>"), nudge: '5%' },
    flower: { mask: svgMask(`${[0, 45, 90, 135, 180, 225, 270, 315].map(a => `<circle cx='${(50 + 30 * Math.cos(a * Math.PI / 180)).toFixed(1)}' cy='${(50 + 30 * Math.sin(a * Math.PI / 180)).toFixed(1)}' r='20'/>`).join('')}<circle cx='50' cy='50' r='34'/>`), nudge: '0' },
    cloud: { mask: svgMask("<path d='M27 84C13 84 3 74 3 61c0-12 9-22 21-23 2-17 15-29 31-29 13 0 24 8 29 20 9 2 16 10 16 21 0 19-13 34-32 34z'/>"), nudge: '4%' },
};
const SHAPES = [
    ['circle', 'วงกลม'], ['squircle', 'มนเหลี่ยม'], ['bubble', 'บับเบิลแชท'], ['pill', 'แคปซูล + ข้อความ'],
    ['heart', 'หัวใจ'], ['flower', 'ดอกไม้'], ['star', 'ดาว'], ['cloud', 'ก้อนเมฆ'], ['sticker', 'สติกเกอร์ (ไม่มีพื้น)'],
];
const ICONS = ['fa-scroll', 'fa-wand-magic-sparkles', 'fa-feather-pointed', 'fa-bullhorn', 'fa-crown', 'fa-gavel', 'fa-book-bookmark', 'fa-list-check',
    'fa-hat-wizard', 'fa-dragon', 'fa-cat', 'fa-paw', 'fa-ghost', 'fa-heart', 'fa-star', 'fa-moon', 'fa-bolt', 'fa-seedling'];
const ANIMS = [['none', 'นิ่ง'], ['float', 'ลอยขึ้นลง'], ['sway', 'โยกเบา ๆ'], ['pulse', 'เต้นตุบ ๆ'], ['spin', 'หมุนช้า ๆ'], ['glow', 'เรืองแสง'], ['nudge', 'ดุ๊กดิ๊กเมื่อมีคำสั่งเปิดอยู่']];
const BGS = [['theme', 'ไล่สีแบบโลโก้'], ['glass', 'กระจก (สีธีม)'], ['custom', 'เลือกสี'], ['none', 'โปร่งใส']];
const FGS = [['theme', 'ขาว'], ['accent', 'สีเน้นของธีม'], ['custom', 'เลือกสี']];
const PRESETS = [
    ['คลาสสิก', {}],
    ['กระจก', { shape: 'circle', bg: 'glass', fg: 'accent', border: true, size: 46, iconSize: 42 }],
    ['หัวใจ', { shape: 'heart', icon: 'fa-heart', bg: 'custom', bgColor: '#f06292', fg: 'custom', fgColor: '#ffffff', anim: 'pulse', size: 54, iconSize: 36 }],
    ['ดาวเรือง', { shape: 'star', icon: 'fa-crown', bg: 'custom', bgColor: '#f5c451', fg: 'custom', fgColor: '#4a3200', anim: 'glow', size: 58, iconSize: 32 }],
    ['ดอกไม้', { shape: 'flower', icon: 'fa-seedling', bg: 'custom', bgColor: '#b7e4c7', fg: 'custom', fgColor: '#2d6a4f', anim: 'sway', size: 54, iconSize: 36 }],
    ['แคปซูล', { shape: 'pill', icon: 'fa-scroll', label: 'OOC', size: 40, iconSize: 45 }],
    ['ก้อนเมฆ', { shape: 'cloud', icon: 'fa-wand-magic-sparkles', bg: 'custom', bgColor: '#e8eefc', fg: 'custom', fgColor: '#5468a8', anim: 'float', size: 58, iconSize: 32 }],
    ['สติกเกอร์', { shape: 'sticker', emoji: '📜', anim: 'nudge', size: 52 }],
];

const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

/** ฟังก์ชันจาก index.js (ตั้งตอน initLauncher) */
const host = {
    settings: () => ({}),
    save: () => {},
    open: () => {},
    customize: () => {},
    count: () => 0,
    enabled: () => true,
};

export function initLauncher(h) {
    Object.assign(host, h);
    window.addEventListener('resize', placeSoon);
    window.visualViewport?.addEventListener('resize', placeSoon);
    window.visualViewport?.addEventListener('scroll', () => placeLauncher());
    document.addEventListener('focusin', placeSoon);
    document.addEventListener('focusout', placeSoon);
}

export function look() {
    const s = host.settings();
    s.launcherLook = { ...LOOK_DEFAULT, ...(s.launcherLook && typeof s.launcherLook === 'object' ? s.launcherLook : {}) };
    return s.launcherLook;
}

/** วาดปุ่ม (ตัวจริงหรือตัวอย่าง) ตามหน้าตาที่ตั้งไว้ */
function applyLook(el, L = look()) {
    const mask = MASKS[L.shape];
    el.dataset.shape = SHAPES.some(x => x[0] === L.shape) ? L.shape : 'squircle';
    el.dataset.masked = mask ? '1' : '';
    el.dataset.anim = L.anim;
    el.dataset.fit = L.fit;
    el.dataset.bg = L.bg;
    el.dataset.fg = L.fg;
    el.dataset.border = L.border && !mask && L.shape !== 'sticker' && L.bg !== 'none' ? '1' : '';
    el.dataset.shadow = L.shadow ? '1' : '';
    const size = clamp(Number(L.size) || 48, 24, 160);
    el.style.setProperty('--ayc-lsize', `${size}px`);
    el.style.setProperty('--ayc-licon', `${Math.round(size * clamp(Number(L.iconSize) || 44, 20, 100) / 100)}px`);
    el.style.setProperty('--ayc-lop', String(clamp(Number(L.opacity) || 100, 20, 100) / 100));
    if (L.bg === 'custom') el.style.setProperty('--ayc-lbg', L.bgColor); else el.style.removeProperty('--ayc-lbg');
    if (L.fg === 'custom') el.style.setProperty('--ayc-lfg', L.fgColor); else el.style.removeProperty('--ayc-lfg');
    if (mask) { el.style.setProperty('--ayc-lmask', mask.mask); el.style.setProperty('--ayc-lnudge', mask.nudge); }
    let inner = el.querySelector('.ayc-lshape');
    if (!inner) {
        inner = document.createElement('div');
        inner.className = 'ayc-lshape';
        el.prepend(inner);
    }
    const label = L.shape === 'pill' && String(L.label ?? '').trim() ? `<span class="ayc-llabel">${esc(L.label)}</span>` : '';
    const face = L.image ? `<img class="ayc-limg" src="${esc(L.image)}" alt="" draggable="false">`
        : String(L.emoji ?? '').trim() ? `<span class="ayc-lemoji">${esc(String(L.emoji).trim().slice(0, 8))}</span>`
            : `<i class="fa-solid ${esc(/^fa-[\w-]+$/.test(L.icon) ? L.icon : 'fa-scroll')} ayc-licon"></i>`;
    inner.innerHTML = face + label;
    if (!el.querySelector('.ayc-lbadge')) el.insertAdjacentHTML('beforeend', '<span class="ayc-lbadge" hidden></span>');
    el.classList.toggle('ayc-nobadge', !L.badge);
}

/** ตัวเลขบนปุ่ม = จำนวนคำสั่งที่มีผลอยู่ตอนนี้ */
export function updateLauncherBadge() {
    const on = host.enabled();
    const n = on ? host.count() : 0;
    const el = document.getElementById('ayc_launcher');
    if (!el) return;
    const b = el.querySelector('.ayc-lbadge');
    if (b) {
        const prev = b.textContent;
        b.textContent = n > 99 ? '99+' : String(n);
        b.hidden = !n || el.classList.contains('ayc-nobadge');
        if (!b.hidden && prev !== b.textContent) { b.classList.remove('ayc-pop'); void b.offsetWidth; b.classList.add('ayc-pop'); }
    }
    el.dataset.active = n ? '1' : '';
    el.dataset.off = on ? '' : '1';
    el.title = !on ? 'As you command ปิดอยู่ · แตะเพื่อเปิดแผง'
        : n ? `As you command · คำสั่งที่มีผลอยู่ ${n} ข้อ · แตะเพื่อเปิด · ลากเพื่อย้าย · กดค้างเพื่อแต่งปุ่ม`
            : 'As you command · ยังไม่มีคำสั่งที่เปิดอยู่ · แตะเพื่อเปิด · ลากเพื่อย้าย · กดค้างเพื่อแต่งปุ่ม';
    el.setAttribute('aria-label', on ? `As you command, คำสั่งที่มีผลอยู่ ${n} ข้อ` : 'As you command, ปิดอยู่');
}

/** ส่วนของหน้าที่เห็นจริง (หดเมื่อคีย์บอร์ดบนจอเปิด) */
function visibleArea() {
    const vv = window.visualViewport;
    return vv ? { x: vv.offsetLeft, y: vv.offsetTop, w: vv.width, h: vv.height } : { x: 0, y: 0, w: window.innerWidth, h: window.innerHeight };
}

export function placeLauncher(el = document.getElementById('ayc_launcher')) {
    if (!el || el.hidden || el.classList.contains('ayc-dragging')) return;
    const { x: ox, y: oy, w: vw, h: vh } = visibleArea();
    const p = host.settings().launcherPos || LAUNCH_POS_DEFAULT;
    const m = 8, w = el.offsetWidth, h = el.offsetHeight;
    let left = m + clamp(Number(p.x) || 0, 0, 1) * Math.max(0, vw - w - 2 * m);
    let top = m + clamp(Number(p.y) || 0, 0, 1) * Math.max(0, vh - h - 2 * m);
    if (p.edge === 'left') left = m;
    if (p.edge === 'right') left = vw - w - m;
    if (p.edge === 'top') top = m;
    if (p.edge === 'bottom') top = vh - h - m;
    el.style.left = `${Math.round(ox + left)}px`;
    el.style.top = `${Math.round(oy + top)}px`;
    el.dataset.edge = p.edge ?? '';
}

let placeTimer = null;
function placeSoon() {
    requestAnimationFrame(() => placeLauncher());
    clearTimeout(placeTimer);
    placeTimer = setTimeout(() => placeLauncher(), 350); // iOS บอกขนาดหลังคีย์บอร์ดเลื่อนเสร็จช้า
}

export function renderLauncher() {
    let el = document.getElementById('ayc_launcher');
    if (!host.settings().launcher) { el?.remove(); return; }
    if (el) { applyLook(el); placeLauncher(el); updateLauncherBadge(); return; }
    el = document.createElement('div');
    el.id = 'ayc_launcher';
    el.className = 'ayc-launch';
    el.setAttribute('role', 'button');
    el.tabIndex = 0;
    applyLook(el);
    document.body.append(el);
    el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); host.open(); } });
    el.addEventListener('contextmenu', e => e.preventDefault()); // กดค้างเป็นของเรา ไม่ใช่เมนูของเบราว์เซอร์

    let start = null, moved = false, longTimer = null, longDone = false;
    el.addEventListener('pointerdown', e => {
        if (e.button !== 0) return;
        const r = el.getBoundingClientRect();
        start = { x: e.clientX, y: e.clientY, left: r.left, top: r.top, id: e.pointerId };
        moved = false;
        longDone = false;
        clearTimeout(longTimer);
        longTimer = setTimeout(() => { if (start && !moved) { longDone = true; host.customize(); } }, 650);
        try { el.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    });
    el.addEventListener('pointermove', e => {
        if (!start || e.pointerId !== start.id || longDone) return;
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (!moved && Math.hypot(dx, dy) < 6) return;
        moved = true;
        clearTimeout(longTimer);
        el.classList.add('ayc-dragging');
        const a = visibleArea();
        el.style.left = `${clamp(start.left + dx, a.x, a.x + a.w - el.offsetWidth)}px`;
        el.style.top = `${clamp(start.top + dy, a.y, a.y + a.h - el.offsetHeight)}px`;
    });
    const end = e => {
        if (!start || e.pointerId !== start.id) return;
        start = null;
        clearTimeout(longTimer);
        if (longDone) return;
        if (!moved) { if (e.type === 'pointerup') host.open(); return; }
        el.classList.remove('ayc-dragging');
        const { x: ox, y: oy, w: vw, h: vh } = visibleArea();
        const b = el.getBoundingClientRect();
        const r = { left: b.left - ox, top: b.top - oy, right: b.right - ox, bottom: b.bottom - oy, width: b.width, height: b.height };
        const dist = { left: r.left, right: vw - r.right, top: r.top, bottom: vh - r.bottom };
        const edge = Object.keys(dist).reduce((a, k) => (dist[k] < dist[a] ? k : a));
        host.settings().launcherPos = {
            x: clamp((r.left - 8) / Math.max(1, vw - r.width - 16), 0, 1),
            y: clamp((r.top - 8) / Math.max(1, vh - r.height - 16), 0, 1),
            edge,
        };
        host.save();
        placeLauncher(el);
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
    placeLauncher(el);
    updateLauncherBadge();
}

export function resetLauncherPos() {
    const s = host.settings();
    s.launcherPos = { ...LAUNCH_POS_DEFAULT };
    s.launcher = true;
    host.save();
    renderLauncher();
    placeLauncher();
}

/** รูปสำหรับปุ่ม: รูปเล็ก (และ GIF) ใช้ตามเดิม รูปใหญ่ย่อลง */
async function imageToDataUrl(file) {
    const read = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
    if (file.size <= 160_000 || (file.type === 'image/gif' && file.size <= 500_000)) return await read(file);
    if (file.type === 'image/gif') throw new Error('GIF ใหญ่เกิน 500 KB');
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, 320 / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', 0.9);
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
}

function shapeSwatch(shape) {
    const m = MASKS[shape];
    if (m) return `<span class="ayc-swatch" style="${esc(`-webkit-mask:${m.mask} center/100% 100% no-repeat;mask:${m.mask} center/100% 100% no-repeat`)}"></span>`;
    const radius = { circle: '50%', squircle: '30%', bubble: '50% 50% 50% 14%', pill: '999px' }[shape];
    if (radius) return `<span class="ayc-swatch" style="border-radius:${radius};${shape === 'pill' ? 'width:28px;height:14px' : ''}"></span>`;
    return '<i class="fa-solid fa-note-sticky"></i>';
}

/** แถบเลื่อน + ช่องตัวเลขที่พิมพ์เองได้ (ขนาดไอคอนเก็บเป็น % ของปุ่ม แต่แสดงและพิมพ์เป็น px) */
const sliderRow = (k, min, max, step, v, unit, label, num = k) => `
    <div class="ayc-look-slider">
      <input type="range" class="ayc-range" data-k="${k}" min="${min}" max="${max}" step="${step}" value="${v}" aria-label="${esc(label)}">
      <label class="ayc-valbox" title="${esc(label)}"><input type="number" data-num="${num}" inputmode="numeric" aria-label="${esc(label)}"><i>${unit}</i></label>
    </div>`;
/** ขนาดไอคอนจริงเป็น px (ปุ่มวาดด้วยสูตรเดียวกันใน applyLook) */
const iconPx = L => Math.round(clamp(Number(L.size) || 48, 24, 160) * clamp(Number(L.iconSize) || 44, 20, 100) / 100);

const opt = (list, cur) => list.map(([v, t]) => `<option value="${v}"${v === cur ? ' selected' : ''}>${esc(t)}</option>`).join('');

/** ส่วนแต่งปุ่มลอยในหน้า ตั้งค่า ของแผง (เปลี่ยนแล้วเห็นทั้งตัวอย่างและปุ่มจริงทันที) */
export function lookEditorHtml() {
    const L = look();
    return `
<div class="ayc-look" data-ref="look">
  <div class="ayc-look-top">
    <div class="ayc-look-stage"><div class="ayc-launch" data-ref="look-preview"></div></div>
    <div class="ayc-grow">
      <span class="ayc-look-label ayc-look-label-first">สไตล์สำเร็จรูป</span>
      <div class="ayc-look-presets">${PRESETS.map(([n], i) => `<button type="button" class="ayc-chipbtn" data-preset="${i}">${esc(n)}</button>`).join('')}</div>
    </div>
  </div>
  <span class="ayc-look-label">รูปทรง</span>
  <div class="ayc-look-grid" data-group="shape">${SHAPES.map(([v, t]) => `<button type="button" data-v="${v}" title="${esc(t)}" aria-label="${esc(t)}">${shapeSwatch(v)}</button>`).join('')}</div>
  <span class="ayc-look-label">ไอคอน <small>หรือใช้อีโมจิ / รูป ด้านล่าง</small></span>
  <div class="ayc-look-grid" data-group="icon">${ICONS.map(v => `<button type="button" data-v="${v}"><i class="fa-solid ${v}"></i></button>`).join('')}</div>
  <div class="ayc-look-rows">
    <span>อีโมจิ</span><input type="text" class="ayc-input" data-k="emoji" maxlength="8" placeholder="เช่น 📜 🪄 ✨" value="${esc(L.emoji)}" autocomplete="off">
    <span>รูปภาพ</span>
    <div class="ayc-look-inline">
      <button type="button" class="ayc-btn ayc-btn-sm" data-img="upload"><i class="fa-solid fa-image"></i> เลือกรูป</button>
      <button type="button" class="ayc-btn ayc-btn-sm" data-img="url"><i class="fa-solid fa-link"></i> ลิงก์รูป</button>
      <button type="button" class="ayc-btn ayc-btn-sm" data-img="clear"><i class="fa-solid fa-xmark"></i> เอารูปออก</button>
      <select class="ayc-input ayc-select" data-k="fit">${opt([['cover', 'เต็มกรอบ'], ['contain', 'ทั้งรูป']], L.fit)}</select>
      <input type="file" accept="image/*" hidden>
    </div>
    <span>ข้อความ</span><input type="text" class="ayc-input" data-k="label" maxlength="16" value="${esc(L.label)}" title="แสดงเมื่อเลือกรูปทรงแคปซูล" autocomplete="off">
    <span>ขนาด</span>${sliderRow('size', 28, 140, 1, L.size, 'px', 'ขนาดปุ่ม')}
    <span>ไอคอน</span>${sliderRow('iconSize', 20, 100, 1, L.iconSize, 'px', 'ขนาดไอคอน (px)', 'iconPx')}
    <span>ความทึบ</span>${sliderRow('opacity', 20, 100, 5, L.opacity, '%', 'ความทึบตอนไม่ได้แตะ (แตะหรือชี้แล้วชัดเต็ม)')}
    <span>พื้น</span>
    <div class="ayc-look-inline"><select class="ayc-input ayc-select" data-k="bg">${opt(BGS, L.bg)}</select><input type="color" data-k="bgColor" value="${esc(L.bgColor)}"></div>
    <span>สีไอคอน</span>
    <div class="ayc-look-inline"><select class="ayc-input ayc-select" data-k="fg">${opt(FGS, L.fg)}</select><input type="color" data-k="fgColor" value="${esc(L.fgColor)}"></div>
    <span>เคลื่อนไหว</span><select class="ayc-input ayc-select" data-k="anim">${opt(ANIMS, L.anim)}</select>
  </div>
  <div class="ayc-look-checks">
    <label class="ayc-look-check"><input type="checkbox" data-k="badge"${L.badge ? ' checked' : ''}> ตัวเลขคำสั่งที่มีผล</label>
    <label class="ayc-look-check"><input type="checkbox" data-k="shadow"${L.shadow ? ' checked' : ''}> เงา</label>
    <label class="ayc-look-check"><input type="checkbox" data-k="border"${L.border ? ' checked' : ''}> ขอบ</label>
  </div>
</div>`;
}

/** ผูกปุ่มต่างๆ ในส่วนแต่งปุ่ม (เรียกหลังวาดหน้า ตั้งค่า ทุกครั้ง) */
export function mountLookEditor(box, { toast = globalThis.toastr } = {}) {
    if (!box) return;
    const preview = box.querySelector('[data-ref="look-preview"]');
    const refresh = () => {
        const cur = look();
        // ตัวเลขข้างแถบเลื่อน (ไม่เขียนทับช่องที่กำลังพิมพ์อยู่)
        const active = document.activeElement;
        const nums = { size: cur.size, iconPx: iconPx(cur), opacity: cur.opacity };
        for (const el of box.querySelectorAll('[data-num]')) {
            if (el.dataset.num === 'iconPx') { el.min = String(Math.round(cur.size * 0.2)); el.max = String(cur.size); }
            else { const r = box.querySelector(`[data-k="${el.dataset.num}"]`); el.min = r.min; el.max = r.max; }
            if (el !== active) el.value = String(nums[el.dataset.num]);
        }
        for (const r of box.querySelectorAll('input[type="range"][data-k]')) if (r !== active) r.value = String(cur[r.dataset.k]);
        applyLook(preview, cur);
        const pb = preview.querySelector('.ayc-lbadge');
        pb.textContent = String((host.enabled() ? host.count() : 0) || 3); // ตัวอย่างโชว์ตัวเลขเสมอ
        pb.hidden = !cur.badge;
        renderLauncher();
        box.querySelectorAll('[data-group="shape"] button').forEach(b => b.classList.toggle('ayc-on', b.dataset.v === cur.shape));
        box.querySelectorAll('[data-group="icon"] button').forEach(b => b.classList.toggle('ayc-on', !cur.emoji && !cur.image && b.dataset.v === cur.icon));
        box.querySelector('[data-img="clear"]').hidden = !cur.image;
        box.querySelector('[data-k="fit"]').hidden = !cur.image;
        box.querySelector('[data-k="bgColor"]').hidden = cur.bg !== 'custom';
        box.querySelector('[data-k="fgColor"]').hidden = cur.fg !== 'custom';
    };
    const set = patch => { Object.assign(look(), patch); host.save(); refresh(); };
    const sync = () => {
        const cur = look();
        for (const el of box.querySelectorAll('[data-k]')) {
            const k = el.dataset.k;
            if (el.type === 'checkbox') el.checked = !!cur[k]; else el.value = cur[k] ?? '';
        }
        refresh();
    };

    box.addEventListener('click', async e => {
        const b = e.target.closest('button');
        if (!b || !box.contains(b)) return;
        const group = b.closest('[data-group]')?.dataset.group;
        if (group === 'shape') return set({ shape: b.dataset.v });
        if (group === 'icon') { set({ icon: b.dataset.v, emoji: '', image: '' }); return sync(); }
        if (b.dataset.preset) { host.settings().launcherLook = { ...LOOK_DEFAULT, ...PRESETS[Number(b.dataset.preset)][1] }; host.save(); return sync(); }
        if (b.dataset.img === 'upload') return box.querySelector('input[type="file"]').click();
        if (b.dataset.img === 'clear') { set({ image: '' }); return sync(); }
        if (b.dataset.img === 'url') {
            const url = prompt('ลิงก์รูป (https://… ใช้ PNG พื้นใสหรือ GIF ได้)', /^https?:/.test(look().image) ? look().image : '');
            if (url == null) return;
            if (url && !/^https?:\/\//i.test(url.trim())) { toast?.warning('ใส่ลิงก์ที่ขึ้นต้นด้วย https://'); return; }
            set({ image: url.trim(), fit: look().shape === 'sticker' ? 'contain' : look().fit });
            sync();
        }
    });
    box.querySelector('input[type="file"]').addEventListener('change', async e => {
        const f = e.target.files?.[0];
        e.target.value = '';
        if (!f) return;
        try { set({ image: await imageToDataUrl(f) }); sync(); }
        catch (err) { toast?.error(`ใช้รูปนี้ไม่ได้: ${err?.message ?? err}`); }
    });
    const onNum = e => {
        const el = e.target.closest('[data-num]');
        if (!el || !box.contains(el)) return;
        const n = Number(el.value);
        if (el.value === '' || !Number.isFinite(n)) { if (e.type === 'change') refresh(); return; }
        const k = el.dataset.num;
        if (k === 'iconPx') {
            const size = Number(look().size) || 48;
            const pct = clamp(Math.round(n * 100 / size), 20, 100);
            if (e.type === 'input' && Math.abs(Math.round(size * pct / 100) - n) > 1) return; // ยังพิมพ์ไม่จบ
            set({ iconSize: pct });
        } else {
            const min = Number(el.min), max = Number(el.max);
            if (e.type === 'input' && (n < min || n > max)) return; // ยังพิมพ์ไม่จบ เช่น "1" ระหว่างพิมพ์ "120"
            set({ [k]: clamp(Math.round(n), min, max) });
        }
        if (e.type === 'change') { el.blur(); refresh(); }
    };
    box.addEventListener('input', onNum);
    box.addEventListener('change', onNum);
    box.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.closest('[data-num]')) e.target.blur(); });
    const onField = e => {
        const el = e.target.closest('[data-k]');
        if (!el || !box.contains(el)) return;
        const k = el.dataset.k;
        const v = el.type === 'checkbox' ? el.checked : el.type === 'range' ? Number(el.value) : el.value;
        set({ [k]: v, ...(k === 'emoji' && String(v).trim() ? { image: '' } : {}) });
    };
    box.addEventListener('input', onField);
    box.addEventListener('change', onField);
    sync();
}

export function resetLook() {
    host.settings().launcherLook = { ...LOOK_DEFAULT };
    host.save();
    renderLauncher();
}
