// As you command — คลังคำสั่ง OOC แบบติ๊กเปิด/ปิด สำหรับ SillyTavern
// คำสั่งที่เปิดไว้จะถูก inject ใหม่ทุกเทิร์นที่ความลึกคงที่ จึงไม่ถูกดันหายไปกับประวัติแชท
// เก็บได้ 2 ขอบเขต: ทุกแชท (extension settings) และเฉพาะแชทนี้ (chat metadata)
//
// หน้าตา: แอปเต็มจอบนมือถือ มีแถบเมนูล่าง (ทุกแชท / แชทนี้ / คลัง / ตั้งค่า) และเป็นหน้าต่างกลางจอบนจอกว้าง
// สีตามธีม ST หรือเลือกสว่าง/มืดเองได้ในหน้า ตั้งค่า

import { STARTERS, CATEGORIES } from './starters.js';
import { initLauncher, renderLauncher, updateLauncherBadge, resetLauncherPos, resetLook, lookEditorHtml, mountLookEditor, LAUNCH_POS_DEFAULT } from './launcher.js';

const MODULE = 'as_you_command';
const LOG = '[As you command]';
const VERSION = '1.2.7'; // ให้ตรงกับ manifest.json เสมอ
const BASE_URL = new URL('.', import.meta.url);
/** ไฟล์ทั้งหมดของ extension ใช้ตอนดึงไฟล์ใหม่มาทับ cache ของเบราว์เซอร์ */
const FILES = ['index.js', 'starters.js', 'launcher.js', 'style.css', 'manifest.json'];

const POS = { IN_PROMPT: 0, IN_CHAT: 1, BEFORE_PROMPT: 2 };
const ROLE = { SYSTEM: 0, USER: 1, ASSISTANT: 2 };

const DEFAULT_TEMPLATE =
    '[OOC: Standing instructions from the player. Follow all of them in every reply. Never mention or acknowledge them in the story.\n{{list}}]';

const DEFAULTS = {
    enabled: true,
    position: POS.IN_CHAT,
    depth: 2,
    role: ROLE.SYSTEM,
    template: DEFAULT_TEMPLATE,
    skipQuiet: true,
    onceNotice: true,
    scheme: 'theme', // theme | light | dark
    launcher: true,  // ปุ่มลอยบนจอ
    launcherPos: LAUNCH_POS_DEFAULT,
    launcherLook: null, // เติมจาก LOOK_DEFAULT ใน launcher.js
    global: [],
    myLibrary: [],
    seeded: false,
    lastTab: 'global',
};

const ctx = () => SillyTavern.getContext();

// ───────────────────────── state ─────────────────────────

function settings() {
    const all = ctx().extensionSettings;
    if (!all[MODULE]) all[MODULE] = {};
    const s = all[MODULE];
    for (const [k, v] of Object.entries(DEFAULTS)) {
        if (s[k] === undefined) s[k] = structuredClone(v);
    }
    if (!s.seeded) {
        s.global = STARTERS.filter(x => x.seed).map(x => fromStarter(x, false));
        s.seeded = true;
        ctx().saveSettingsDebounced();
    }
    return s;
}

function hasChat() {
    try { return !!ctx().getCurrentChatId(); } catch { return false; }
}

function chatStore(create = true) {
    if (!hasChat()) return null;
    const meta = ctx().chatMetadata;
    if (!meta) return null;
    if (!meta[MODULE] && create) meta[MODULE] = { items: [] };
    if (meta[MODULE] && !Array.isArray(meta[MODULE].items)) meta[MODULE].items = [];
    return meta[MODULE] ?? null;
}

function list(scope) {
    if (scope === 'global') return settings().global;
    return chatStore(false)?.items ?? [];
}

function save(scope) {
    if (scope === 'global' || scope === 'lib') ctx().saveSettingsDebounced();
    else ctx().saveMetadataDebounced();
}

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function fromStarter(st, enabled = true) {
    return { id: uid(), title: st.title, text: st.text, enabled, once: !!st.once, group: st.group || '', src: 's:' + st.id };
}

function fromMine(t, enabled = true) {
    return { id: uid(), title: t.title, text: t.text, enabled, once: !!t.once, group: t.group || '', src: 'm:' + t.id };
}

function libEntries() {
    const s = settings();
    const mine = s.myLibrary.map(t => ({ ...t, cat: 'mine', mine: true, key: 'm:' + t.id }));
    const starters = STARTERS.map(t => ({ ...t, key: 's:' + t.id }));
    return [...mine, ...starters];
}

function activeItems() {
    const out = [];
    for (const scope of ['global', 'chat']) {
        for (const it of list(scope)) {
            if (it.enabled && String(it.text || '').trim()) out.push({ scope, it });
        }
    }
    return out;
}

// ───────────────────────── injection ─────────────────────────

function buildPrompt() {
    const s = settings();
    if (!s.enabled) return '';
    const items = activeItems();
    if (!items.length) return '';
    const body = items.map(({ it }) => '- ' + it.text.trim().replace(/\n+/g, ' ')).join('\n');
    const tpl = (s.template || DEFAULT_TEMPLATE);
    return tpl.includes('{{list}}') ? tpl.replace('{{list}}', body) : `${tpl}\n${body}`;
}

function applyInjection(forceEmpty = false) {
    const s = settings();
    const text = forceEmpty ? '' : buildPrompt();
    ctx().setExtensionPrompt(MODULE, text, Number(s.position), Number(s.depth), false, Number(s.role));
}

let pendingOnce = null; // { chatId, refs: [{scope,id}] }

function onAfterCommands(type, _opts, dryRun) {
    const s = settings();
    if (type === 'quiet' && s.skipQuiet) {
        applyInjection(true);
        return;
    }
    applyInjection();
    if (dryRun || type === 'quiet') return;
    const refs = activeItems().filter(x => x.it.once).map(x => ({ scope: x.scope, id: x.it.id }));
    pendingOnce = refs.length ? { chatId: ctx().getCurrentChatId(), refs } : null;
}

function onMessageReceived() {
    if (!pendingOnce) return;
    if (pendingOnce.chatId !== ctx().getCurrentChatId()) { pendingOnce = null; return; }
    const touched = new Set();
    const used = [];
    for (const { scope, id } of pendingOnce.refs) {
        const it = list(scope).find(x => x.id === id);
        if (it && it.enabled) {
            it.enabled = false;
            touched.add(scope);
            used.push({ scope, id, title: it.title || '(ไม่มีชื่อ)' });
        }
    }
    const chatId = pendingOnce.chatId;
    pendingOnce = null;
    touched.forEach(save);
    if (touched.size) { applyInjection(); refresh(); }
    if (used.length && settings().onceNotice) showOnceNotice(used, chatId);
}

/** ป๊อบอัพเล็กๆ บอกว่าคำสั่งแบบใช้ครั้งเดียวมีผลแล้วและถูกปิดให้แล้ว แตะเพื่อเปิดกลับมา (เช่น ก่อนจะ swipe) */
function showOnceNotice(used, chatId) {
    const names = used.map(u => `“${esc(u.title)}”`).join(', ');
    toastr.info(
        `${names}<div class="ayc-toast-sub">ปิดให้แล้ว · ถ้าจะ swipe หรือใช้อีก แตะที่นี่เพื่อเปิดใหม่</div>`,
        '⚡ คำสั่งใช้ครั้งเดียวมีผลแล้ว',
        {
            timeOut: 7000, extendedTimeOut: 4000, closeButton: true, escapeHtml: false, progressBar: true,
            onclick: () => reEnableOnce(used, chatId),
        },
    );
}

function reEnableOnce(used, chatId) {
    if (chatId !== ctx().getCurrentChatId()) { toastr.warning('ย้ายไปแชทอื่นแล้ว เปิดใหม่ในแผงได้เลย'); return; }
    let n = 0;
    for (const { scope, id } of used) {
        const it = list(scope).find(x => x.id === id);
        if (it && !it.enabled) { setEnabled(scope, id, true); n++; }
    }
    refresh();
    if (n) toastr.success('กด swipe หรือส่งข้อความต่อได้เลย', `⚡ เปิดอีกครั้งแล้ว ${n} คำสั่ง`, { timeOut: 2200 });
}

// ───────────────────────── mutations ─────────────────────────

function setEnabled(scope, id, on) {
    const arr = list(scope);
    const it = arr.find(x => x.id === id);
    if (!it) return;
    it.enabled = on;
    const touched = new Set([scope]);
    if (on && it.group) {
        for (const sc of ['global', 'chat']) {
            for (const other of list(sc)) {
                if (other !== it && other.enabled && other.group === it.group) {
                    other.enabled = false;
                    touched.add(sc);
                    toastr.info(`ปิด "${other.title}" ให้แล้ว (กลุ่มเดียวกัน)`, '', { timeOut: 2200 });
                }
            }
        }
    }
    touched.forEach(save);
    applyInjection();
}

function addItem(scope, item) {
    if (scope === 'chat') {
        const store = chatStore(true);
        if (!store) { toastr.warning('ยังไม่ได้เปิดแชท'); return false; }
        store.items.push(item);
    } else {
        settings().global.push(item);
    }
    save(scope);
    if (item.enabled) setEnabled(scope, item.id, true);
    else applyInjection();
    return true;
}

function removeItem(scope, id) {
    const arr = list(scope);
    const i = arr.findIndex(x => x.id === id);
    if (i < 0) return;
    arr.splice(i, 1);
    save(scope);
    applyInjection();
}

function moveItem(scope, id) {
    const target = scope === 'global' ? 'chat' : 'global';
    if (target === 'chat' && !hasChat()) { toastr.warning('ยังไม่ได้เปิดแชท'); return; }
    const arr = list(scope);
    const i = arr.findIndex(x => x.id === id);
    if (i < 0) return;
    const [it] = arr.splice(i, 1);
    save(scope);
    addItem(target, it);
    toastr.success(target === 'chat' ? 'ย้ายไป "แชทนี้" แล้ว' : 'ย้ายไป "ทุกแชท" แล้ว', '', { timeOut: 1800 });
}

// ───────────────────────── UI helpers ─────────────────────────

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const icon = (name, extra = '') => `<i class="fa-solid ${name} ${extra}" aria-hidden="true"></i>`;

const ui = {
    tab: 'global', // global | chat | lib | settings
    cat: 'all',
    query: '',
    expanded: new Set(),
    lookOpen: false, // ส่วนแต่งปุ่มลอยในหน้า ตั้งค่า กางอยู่ไหม
};

let $root = null;

function catLabel(id) {
    if (id === 'mine') return { label: 'ของฉัน', icon: 'fa-star' };
    return CATEGORIES.find(c => c.id === id) || { label: id, icon: 'fa-tag' };
}

function matches(obj) {
    const q = ui.query.trim().toLowerCase();
    if (!q) return true;
    return [obj.title, obj.text, obj.desc, obj.group].some(v => String(v || '').toLowerCase().includes(q));
}

function switchHtml(checked, attrs = '', label = '') {
    return `<label class="ayc-switch" ${label ? `title="${esc(label)}"` : ''}><input type="checkbox" ${attrs} ${checked ? 'checked' : ''}><span class="ayc-knob"></span>${label ? `<span class="ayc-sr">${esc(label)}</span>` : ''}</label>`;
}

function whereText(s = settings()) {
    return Number(s.position) === POS.IN_CHAT ? `ในแชท ความลึก ${s.depth}`
        : Number(s.position) === POS.IN_PROMPT ? 'ต่อท้าย prompt หลัก' : 'ก่อน prompt หลัก';
}

// ───────────────────────── layers: sheets & dialogs (อยู่เหนือแผง หน้าตาเดียวกับแผง) ─────────────────────────

function openLayer(inner, kind = 'sheet') {
    const $l = $(`<div class="ayc-layer ayc-layer-${kind}"><div class="ayc-scrim" data-x></div>${inner}</div>`);
    $root.find('.ayc-shell').append($l);
    const close = () => {
        if ($l.hasClass('ayc-closing')) return;
        $l.addClass('ayc-closing');
        setTimeout(() => $l.remove(), 160);
    };
    $l.data('close', close);
    $l.on('click', '[data-x]', close);
    return { $l, close };
}

function topLayer() {
    const $ls = $root?.find('.ayc-layer:not(.ayc-closing)');
    return $ls?.length ? $ls.last() : null;
}

/** เมนูแบบแผ่นล่าง คืนค่าที่เลือก หรือ null */
function actionSheet({ title = '', sub = '', items }) {
    return new Promise(resolve => {
        const { $l, close } = openLayer(`
<div class="ayc-sheet" role="menu">
  <div class="ayc-grab"></div>
  ${title ? `<div class="ayc-sheet-title">${esc(title)}</div>` : ''}
  ${sub ? `<div class="ayc-sheet-sub">${esc(sub)}</div>` : ''}
  <div class="ayc-sheet-items">${items.map((it, i) => it === '-' ? '<div class="ayc-sep"></div>' : `
    <button class="ayc-sheet-item ${it.danger ? 'ayc-danger' : ''}" data-i="${i}" ${it.disabled ? 'disabled' : ''} role="menuitem">
      ${icon(it.icon || 'fa-circle')}<span class="ayc-grow">${esc(it.label)}${it.hint ? `<small>${esc(it.hint)}</small>` : ''}</span>
    </button>`).join('')}</div>
  <button class="ayc-sheet-cancel" data-x>ยกเลิก</button>
</div>`);
        let done = false;
        const finish = v => { if (done) return; done = true; close(); resolve(v); };
        $l.off('click').on('click', '[data-x]', () => finish(null));
        $l.on('click', '[data-i]', function () { if (!this.disabled) finish(items[Number(this.dataset.i)].value); });
        $l.data('close', () => finish(null));
    });
}

/** กล่องยืนยัน คืน true/false */
function confirmBox({ title, text = '', ok = 'ตกลง', danger = false }) {
    return new Promise(resolve => {
        const { $l, close } = openLayer(`
<div class="ayc-dialog" role="alertdialog">
  <div class="ayc-dialog-title">${esc(title)}</div>
  ${text ? `<div class="ayc-dialog-text">${esc(text)}</div>` : ''}
  <div class="ayc-dialog-btns"><button class="ayc-btn" data-x>ยกเลิก</button><button class="ayc-btn ${danger ? 'ayc-btn-danger' : 'ayc-primary'}" data-ok>${esc(ok)}</button></div>
</div>`, 'dialog');
        let done = false;
        const finish = v => { if (done) return; done = true; close(); resolve(v); };
        $l.off('click').on('click', '[data-x]', () => finish(false));
        $l.on('click', '[data-ok]', () => finish(true));
        $l.data('close', () => finish(false));
        setTimeout(() => $l.find('[data-ok]').trigger('focus'), 30);
    });
}

function formSheet(title, iconName, body, foot) {
    return openLayer(`
<div class="ayc-sheet ayc-sheet-form" role="dialog" aria-label="${esc(title)}">
  <div class="ayc-grab"></div>
  <div class="ayc-sheet-head"><div class="ayc-sheet-title">${icon(iconName)}${esc(title)}</div>
    <button class="ayc-icon" data-x aria-label="ปิด">${icon('fa-xmark')}</button></div>
  <div class="ayc-sheet-body">${body}</div>
  ${foot ? `<div class="ayc-sheet-foot">${foot}</div>` : ''}
</div>`);
}

// ───────────────────────── overlay ─────────────────────────

const NAV = [
    ['global', 'fa-earth-asia', 'ทุกแชท'],
    ['chat', 'fa-comment-dots', 'แชทนี้'],
    ['lib', 'fa-book-bookmark', 'คลัง'],
    ['settings', 'fa-gear', 'ตั้งค่า'],
];

function buildOverlay() {
    $root = $(`
<div id="ayc-overlay" class="ayc-hidden" aria-hidden="true">
  <div class="ayc-shell" role="dialog" aria-label="As you command">
    <header class="ayc-head">
      <div class="ayc-logo">${icon('fa-scroll')}</div>
      <div class="ayc-headtext">
        <div class="ayc-htitle">As you command</div>
        <div class="ayc-hsub" data-ref="status"></div>
      </div>
      <div class="ayc-hactions">
        <span class="ayc-master">${switchHtml(true, 'data-act="master"', 'เปิด/ปิดทั้งหมด')}</span>
        <button class="ayc-icon" data-act="preview" title="ดูสิ่งที่โมเดลจะเห็น" aria-label="ดู prompt">${icon('fa-eye')}</button>
        <button class="ayc-icon" data-act="close" title="ปิด" aria-label="ปิด">${icon('fa-xmark')}</button>
      </div>
    </header>

    <div class="ayc-toolbar" data-ref="toolbar">
      <div class="ayc-toolrow">
        <div class="ayc-search">${icon('fa-magnifying-glass')}<input class="ayc-input" type="search" data-ref="search" placeholder="ค้นหาคำสั่ง…" autocomplete="off" enterkeyhint="search"></div>
        <button class="ayc-btn ayc-pillbtn" data-act="all-off" title="ปิดทุกคำสั่งในแท็บนี้">${icon('fa-power-off')}<span>ปิดหมด</span></button>
      </div>
      <div class="ayc-chiprow" data-ref="chips"></div>
    </div>

    <main class="ayc-body" data-ref="body"></main>

    <button class="ayc-fab" data-act="new" title="เพิ่มคำสั่ง" aria-label="เพิ่มคำสั่ง">${icon('fa-plus')}</button>

    <nav class="ayc-nav">${NAV.map(([t, ic, label]) => `
      <button class="ayc-navbtn" data-tab="${t}">${icon(ic)}<span>${label}</span><b class="ayc-navbadge" data-ref="cnt-${t}"></b></button>`).join('')}
    </nav>
  </div>
</div>`);
    $('body').append($root);

    // ไม่ปิดจาก click ที่มาไม่ถึงครึ่งวินาทีหลังเปิด (click ที่ค้างจากการแตะ/กดค้างที่เปิดแผงขึ้นมา)
    $root.on('click', (e) => { if (e.target === $root[0] && Date.now() - openedAt > 450) closeOverlay(); });
    $root.on('click', '[data-tab]', function () { goTab(String($(this).data('tab'))); });
    $root.on('input', '[data-ref="search"]', function () {
        ui.query = String($(this).val() || '');
        renderBody();
    });
    $root.on('click', '[data-cat]', function () {
        ui.cat = String($(this).data('cat'));
        renderChips();
        renderBody();
    });

    // ── main actions ──
    $root.on('change', '[data-act="master"]', function () {
        settings().enabled = this.checked;
        ctx().saveSettingsDebounced();
        applyInjection();
        syncDrawer();
        render();
    });
    $root.on('click', '[data-act="close"]', closeOverlay);
    $root.on('click', '[data-act="preview"]', openPreviewSheet);
    $root.on('click', '[data-act="new"]', () => {
        if (ui.tab === 'lib') openEditor({ mode: 'lib', id: null });
        else openEditor({ mode: 'item', scope: ui.tab === 'chat' ? 'chat' : 'global', id: null });
    });
    $root.on('click', '[data-act="all-off"]', () => {
        const scopes = [ui.tab];
        let n = 0;
        for (const sc of scopes) {
            for (const it of list(sc)) if (it.enabled) { it.enabled = false; n++; }
            save(sc);
        }
        applyInjection();
        render();
        toastr.info(n ? `ปิด ${n} คำสั่ง` : 'ไม่มีคำสั่งที่เปิดอยู่', '', { timeOut: 1600 });
    });

    // ── item cards ──
    $root.on('change', '.ayc-card .ayc-switch input', function () {
        const $c = $(this).closest('.ayc-card');
        setEnabled(String($c.data('scope')), String($c.data('id')), this.checked);
        render();
    });
    $root.on('click', '.ayc-card [data-act="expand"]', function () {
        const id = String($(this).closest('[data-id]').data('id'));
        ui.expanded.has(id) ? ui.expanded.delete(id) : ui.expanded.add(id);
        $(this).closest('[data-id]').toggleClass('ayc-expanded');
    });
    $root.on('click', '.ayc-card [data-act="more"]', async function () {
        const $c = $(this).closest('.ayc-card');
        const scope = String($c.data('scope')), id = String($c.data('id'));
        const it = list(scope).find(x => x.id === id);
        if (!it) return;
        const choice = await actionSheet({
            title: it.title || '(ไม่มีชื่อ)',
            sub: scope === 'global' ? 'อยู่ใน ทุกแชท' : 'อยู่ใน แชทนี้',
            items: [
                { value: 'edit', label: 'แก้ไข', icon: 'fa-pen' },
                { value: 'move', label: scope === 'global' ? 'ย้ายไป แชทนี้' : 'ย้ายไป ทุกแชท', icon: scope === 'global' ? 'fa-comment-dots' : 'fa-earth-asia', disabled: scope === 'global' && !hasChat() },
                { value: 'lib', label: 'บันทึกเป็นแม่แบบในคลัง', icon: 'fa-book-bookmark', hint: 'ไว้ใช้กับแชทอื่น' },
                '-',
                { value: 'delete', label: 'ลบ', icon: 'fa-trash-can', danger: true },
            ],
        });
        if (choice === 'edit') openEditor({ mode: 'item', scope, id });
        else if (choice === 'move') { moveItem(scope, id); render(); }
        else if (choice === 'lib') {
            const s = settings();
            const libId = uid();
            s.myLibrary.unshift({ id: libId, title: it.title, text: it.text, once: !!it.once, group: it.group || '' });
            it.src = 'm:' + libId;
            save('lib'); save(scope);
            toastr.success(`เก็บ "${it.title}" ไว้ในคลังแล้ว`, '', { timeOut: 1600 });
        } else if (choice === 'delete') {
            if (!(await confirmBox({ title: `ลบคำสั่ง "${it.title}"?`, ok: 'ลบ', danger: true }))) return;
            removeItem(scope, id);
            render();
        }
    });

    // ── library ──
    $root.on('click', '.ayc-lib [data-act="expand"]', function () {
        const key = String($(this).closest('[data-key]').data('key'));
        ui.expanded.has(key) ? ui.expanded.delete(key) : ui.expanded.add(key);
        $(this).closest('[data-key]').toggleClass('ayc-expanded');
    });
    $root.on('click', '.ayc-lib [data-add]', function () {
        const scope = String($(this).data('add'));
        const key = String($(this).closest('[data-key]').data('key'));
        const entry = libEntries().find(x => x.key === key);
        if (!entry) return;
        const existing = list(scope).find(x => x.src === key);
        const where = scope === 'chat' ? 'แชทนี้' : 'ทุกแชท';
        if (existing) {
            const on = !existing.enabled;
            setEnabled(scope, existing.id, on);
            toastr[on ? 'success' : 'info'](`${on ? 'เปิด' : 'ปิด'} "${entry.title}" ใน ${where} แล้ว`, '', { timeOut: 1600 });
        } else {
            const item = entry.mine ? fromMine(entry, true) : fromStarter(entry, true);
            if (!addItem(scope, item)) return;
            toastr.success(`เพิ่มและเปิด "${entry.title}" ใน ${where} แล้ว`, '', { timeOut: 1600 });
        }
        render();
    });
    $root.on('click', '.ayc-lib [data-act="lib-more"]', async function () {
        const key = String($(this).closest('[data-key]').data('key'));
        const s = settings();
        const t = s.myLibrary.find(x => 'm:' + x.id === key);
        if (!t) return;
        const choice = await actionSheet({
            title: t.title, sub: 'แม่แบบของฉัน',
            items: [{ value: 'edit', label: 'แก้แม่แบบ', icon: 'fa-pen' }, '-', { value: 'delete', label: 'ลบออกจากคลัง', icon: 'fa-trash-can', danger: true, hint: 'คำสั่งที่เพิ่มเข้าลิสต์ไปแล้วไม่หาย' }],
        });
        if (choice === 'edit') openEditor({ mode: 'lib', id: t.id });
        else if (choice === 'delete') {
            if (!(await confirmBox({ title: `ลบ "${t.title}" ออกจากคลัง?`, text: 'คำสั่งที่เพิ่มเข้าลิสต์ไปแล้วจะยังอยู่', ok: 'ลบ', danger: true }))) return;
            s.myLibrary = s.myLibrary.filter(x => x !== t);
            save('lib');
            render();
        }
    });

    bindSettingsView();

    $(document).on('keydown.ayc', (e) => {
        if (e.key !== 'Escape' || !$root || $root.hasClass('ayc-hidden')) return;
        const $l = topLayer();
        if ($l) { e.stopPropagation(); $l.data('close')?.(); }
        else closeOverlay();
    });
}

function goTab(tab) {
    ui.tab = tab;
    ui.cat = 'all';
    settings().lastTab = tab;
    ctx().saveSettingsDebounced();
    $root.find('.ayc-body').scrollTop(0);
    render(true);
}

let openedAt = 0;

/** บันทึกล่าสุดสำหรับปุ่ม ตรวจปัญหา (บนมือถือดู console ไม่ได้) */
const diagLog = [];
function diag(msg) {
    diagLog.push(`${new Date().toISOString().slice(11, 23)} ${msg}`);
    if (diagLog.length > 30) diagLog.shift();
}

/** แจ้ง error บนจอ (บนมือถือดู console ไม่ได้) */
function reportError(where, err) {
    console.error(LOG, where, err);
    diag(`ERROR ${where}: ${err?.stack || err}`);
    const msg = String(err?.message ?? err);
    try { toastr.error(`${where}: ${msg}`, 'As you command', { timeOut: 15000, extendedTimeOut: 15000 }); } catch { /* ignore */ }
}

/** ย่อชื่อ element ให้อ่านง่าย */
function elName(el) {
    if (!el) return 'null';
    const cls = typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 3).join('.') : '';
    return `${el.tagName?.toLowerCase()}${el.id ? '#' + el.id : ''}${cls}`;
}

/** สไตล์ที่ทำให้ position:fixed ของแผงไม่ยึดหน้าจอ หรือซ่อนแผง */
function fixedBreakers(el) {
    const out = [];
    for (let n = el?.parentElement; n; n = n.parentElement) {
        const cs = getComputedStyle(n);
        const bad = ['transform', 'perspective', 'filter', 'backdropFilter', 'contain', 'willChange']
            .filter(k => cs[k] && !['none', 'normal', 'auto', ''].includes(cs[k]))
            .map(k => `${k}:${cs[k]}`);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.opacity === '0') bad.push(`display:${cs.display} visibility:${cs.visibility} opacity:${cs.opacity}`);
        if (bad.length) out.push(`${elName(n)} {${bad.join('; ')}}`);
    }
    return out;
}

/** ทดลองเปิดแผงแล้ววัดว่าเห็นจริงไหม คืนรายงานเป็นข้อความ */
async function runDiagnostics() {
    const lines = [];
    const add = (k, v) => lines.push(`${k}: ${v}`);
    add('version', `v${VERSION} (server ${remoteVersion ?? '?'})`);
    add('ua', navigator.userAgent);
    const vv = window.visualViewport;
    add('viewport', `${innerWidth}x${innerHeight} · vv ${vv ? `${Math.round(vv.width)}x${Math.round(vv.height)} @${Math.round(vv.offsetLeft)},${Math.round(vv.offsetTop)} scale ${vv.scale}` : '-'} · dpr ${devicePixelRatio}`);
    add('scroll', `window ${scrollX},${scrollY} · html ${document.documentElement.scrollTop} · body ${document.body.scrollTop}`);
    const s = settings();
    add('settings', `enabled=${s.enabled} lastTab=${s.lastTab} launcher=${s.launcher} scheme=${s.scheme} items=${s.global?.length}`);
    add('jquery', `${$.fn?.jquery} sortable=${typeof $.fn.sortable}`);

    const before = diagLog.length;
    openOverlay();
    await new Promise(r => setTimeout(r, 700));
    const o = document.getElementById('ayc-overlay');
    add('overlay', o ? `inDOM=${document.body.contains(o)} parent=${elName(o.parentElement)} class="${o.className}"` : 'ไม่มี');
    if (o) {
        const cs = getComputedStyle(o);
        const r = o.getBoundingClientRect();
        add('overlay style', `display:${cs.display} visibility:${cs.visibility} opacity:${cs.opacity} position:${cs.position} z:${cs.zIndex} transform:${cs.transform}`);
        add('overlay rect', `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}`);
        const sh = o.querySelector('.ayc-shell');
        if (sh) {
            const rs = sh.getBoundingClientRect(), css = getComputedStyle(sh);
            add('shell', `${Math.round(rs.left)},${Math.round(rs.top)} ${Math.round(rs.width)}x${Math.round(rs.height)} opacity:${css.opacity} bg:${css.backgroundColor}`);
        }
        add('body view', `${o.querySelector('[data-ref="body"]')?.children.length ?? '-'} children, ${o.querySelector('[data-ref="body"]')?.textContent.length ?? 0} chars`);
        const pts = [[0.5, 0.5], [0.5, 0.15], [0.5, 0.85]].map(([fx, fy]) => {
            const el = document.elementFromPoint(innerWidth * fx, innerHeight * fy);
            return `${Math.round(fy * 100)}%=${o.contains(el) ? 'แผง' : elName(el)}`;
        });
        add('ที่จุดบนจอ', pts.join(' · '));
        const br = fixedBreakers(o);
        add('ตัวบัง fixed', br.length ? br.join(' | ') : 'ไม่มี');
    }
    add('log', '');
    lines.push(...diagLog.slice(Math.max(0, before - 8)).map(x => '  ' + x));
    closeOverlay();
    return lines.join('\n');
}

function safeLookHtml() {
    try { return lookEditorHtml(); }
    catch (err) { reportError('ส่วนแต่งปุ่มลอยพัง', err); return `<div class="ayc-look"><small>แต่งปุ่มไม่ได้: ${esc(err?.message ?? err)}</small></div>`; }
}

function openOverlay(tab = null) {
    diag(`open(${tab ?? ''})`);
    try {
        if (!$root) {
            try { buildOverlay(); }
            catch (err) { $root?.remove(); $root = null; throw err; } // สร้างไม่ครบ อย่าเก็บตัวพังไว้
        }
        openedAt = Date.now();
        const want = tab || settings().lastTab || 'global';
        ui.tab = ['global', 'chat', 'lib', 'settings'].includes(want) ? want : 'global';
        ui.query = '';
        $root.find('[data-ref="search"]').val('');
        $root.find('.ayc-layer').remove();
        // โชว์แผงก่อน แล้วค่อยวาดเนื้อหา: ถ้าส่วนไหนพัง แผงยังเปิดอยู่ ไม่หายเงียบ
        $root.removeClass('ayc-hidden').attr('aria-hidden', 'false');
        $('html').addClass('ayc-noscroll');
        try { render(true); }
        catch (err) {
            reportError(`วาดแท็บ ${ui.tab} ไม่ได้`, err);
            if (ui.tab !== 'global') {
                ui.tab = 'global';
                settings().lastTab = 'global';
                ctx().saveSettingsDebounced();
                render(true);
            }
        }
    } catch (err) {
        reportError('เปิดแผงไม่ได้', err);
    }
}

function closeOverlay() {
    if (!$root) return;
    if (!$root.hasClass('ayc-hidden')) diag(`close ${Date.now() - openedAt}ms หลังเปิด · ${(new Error().stack || '').split('\n').slice(1, 4).map(x => x.trim()).join(' < ')}`);
    $root.find('.ayc-layer').remove();
    $root.addClass('ayc-hidden').attr('aria-hidden', 'true');
    $('html').removeClass('ayc-noscroll');
}

function refresh() {
    if ($root && !$root.hasClass('ayc-hidden')) render();
    updateWandBadge();
}

// ───────────────────────── render ─────────────────────────

function render(animate = false) {
    if (!$root) return;
    const s = settings();
    $root.attr('data-scheme', s.scheme || 'theme').attr('data-view', ui.tab);
    $root.find('.ayc-navbtn').each(function () {
        $(this).toggleClass('ayc-on', $(this).data('tab') === ui.tab);
    });
    $root.find('[data-act="master"]').prop('checked', s.enabled);
    $root.find('.ayc-shell').toggleClass('ayc-off', !s.enabled);
    const listTab = ui.tab === 'global' || ui.tab === 'chat';
    $root.find('[data-ref="toolbar"]').toggle(ui.tab !== 'settings');
    $root.find('[data-act="all-off"]').toggle(listTab && list(ui.tab).some(x => x.enabled));
    $root.find('[data-act="new"]').toggle(ui.tab !== 'settings' && !(ui.tab === 'chat' && !hasChat()))
        .attr('title', ui.tab === 'lib' ? 'สร้างแม่แบบ' : 'เพิ่มคำสั่ง');
    $root.find('[data-ref="search"]').attr('placeholder', ui.tab === 'lib' ? 'ค้นหาในคลัง…' : 'ค้นหาคำสั่ง…');
    renderStatus();
    renderChips();
    renderBody(animate);
    updateWandBadge();
}

function renderStatus() {
    const s = settings();
    const g = list('global'), c = list('chat');
    const gOn = g.filter(x => x.enabled).length, cOn = c.filter(x => x.enabled).length;
    const badge = (n) => n ? String(n) : '';
    $root.find('[data-ref="cnt-global"]').text(badge(gOn));
    $root.find('[data-ref="cnt-chat"]').text(badge(cOn));
    $root.find('[data-ref="cnt-settings"]').text(isStale() ? '!' : '').toggleClass('ayc-warnbadge', isStale());
    const txt = !s.enabled ? 'ปิดอยู่ · ไม่มีอะไรถูกส่งให้โมเดล'
        : (gOn + cOn) ? `กำลังสั่ง ${gOn + cOn} ข้อ · ${whereText(s)}` : 'ยังไม่ได้เปิดคำสั่งไหน';
    $root.find('[data-ref="status"]').html(`<span class="ayc-dot ${s.enabled && (gOn + cOn) ? 'ayc-dot-on' : ''}"></span><span>${esc(txt)}</span>`);
}

function renderChips() {
    const $chips = $root.find('[data-ref="chips"]');
    if (ui.tab !== 'lib') { $chips.empty().hide(); return; }
    const hasMine = settings().myLibrary.length > 0;
    const all = libEntries();
    const count = id => id === 'all' ? all.length : all.filter(e => e.cat === id).length;
    const cats = [{ id: 'all', label: 'ทั้งหมด', icon: 'fa-layer-group' }, ...(hasMine ? [{ id: 'mine', ...catLabel('mine') }] : []), ...CATEGORIES];
    $chips.html(cats.map(c => `<button class="ayc-fchip ${ui.cat === c.id ? 'ayc-on' : ''}" data-cat="${c.id}">${icon(c.icon)}${esc(c.label)}<b>${count(c.id)}</b></button>`).join('')).show();
}

function renderBody(animate = false) {
    const $body = $root.find('[data-ref="body"]');
    let html;
    if (ui.tab === 'settings') html = viewSettings();
    else if (ui.tab === 'lib') html = viewLibrary();
    else html = viewList(ui.tab);
    $body.html(`<div class="ayc-view ${animate ? 'ayc-enter' : ''}">${html}<div class="ayc-bottom-pad"></div></div>`);
    if (ui.tab === 'settings') {
        try { mountLookEditor($body.find('[data-ref="look"]')[0]); }
        catch (err) { reportError('ส่วนแต่งปุ่มลอยพัง', err); }
        $body.find('[data-ref="look-details"]').on('toggle', function () { ui.lookOpen = this.open; });
    }
    if (ui.tab === 'global' || ui.tab === 'chat') makeSortable($body, ui.tab);
}

function viewList(scope) {
    if (scope === 'chat' && !hasChat()) {
        return emptyState('fa-comment-slash', 'ยังไม่ได้เปิดแชท', 'เปิดแชทก่อน แล้วคำสั่งในแท็บนี้จะผูกกับแชทนั้นแชทเดียว');
    }
    const arr = list(scope);
    if (!arr.length) {
        return scope === 'chat'
            ? emptyState('fa-feather', 'แชทนี้ยังไม่มีคำสั่งเฉพาะ', 'ใช้สำหรับคำสั่งที่อยากให้มีแค่ในเรื่องนี้ เช่น ทิศทางเนื้อเรื่อง หรือกฎของโลกในบอทนี้', true)
            : emptyState('fa-scroll', 'ลิสต์ว่าง', 'เลือกคำสั่งสำเร็จรูปจากคลัง หรือกดปุ่ม + เพื่อเขียนเอง', true);
    }
    const shown = arr.filter(matches);
    if (!shown.length) return emptyState('fa-magnifying-glass', 'ไม่พบคำสั่งที่ค้นหา', '');
    const on = arr.filter(x => x.enabled).length;
    const head = `<h3 class="ayc-h">${icon(scope === 'global' ? 'fa-earth-asia' : 'fa-comment-dots')} ${scope === 'global' ? 'ใช้กับทุกแชท' : 'เฉพาะแชทนี้'}
      <small>เปิด ${on} จาก ${arr.length}${!ui.query && arr.length > 1 ? ' · ลาก ⠿ เพื่อเรียง' : ''}</small></h3>`;
    return head + `<div class="ayc-list" data-ref="sortable">${shown.map(it => itemCard(scope, it)).join('')}</div>`;
}

function makeSortable($body, scope) {
    if (ui.query || typeof $.fn.sortable !== 'function') return;
    $body.find('[data-ref="sortable"]').sortable({
        handle: '.ayc-grip',
        axis: 'y',
        tolerance: 'pointer',
        placeholder: 'ayc-card-placeholder',
        update: function () {
            const order = $(this).children('.ayc-card').map((_, el) => String($(el).data('id'))).get();
            const cur = list(scope);
            cur.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
            save(scope);
            applyInjection();
        },
    });
}

function tagsHtml(x) {
    return [
        x.once ? `<span class="ayc-tag ayc-tag-once">${icon('fa-bolt')}ครั้งเดียว</span>` : '',
        x.group ? `<span class="ayc-tag">${icon('fa-circle-half-stroke')}${esc(x.group)}</span>` : '',
    ].join('');
}

function itemCard(scope, it) {
    return `
<div class="ayc-card ${it.enabled ? 'ayc-on' : ''} ${it.once ? 'ayc-once' : ''} ${ui.expanded.has(it.id) ? 'ayc-expanded' : ''}" data-scope="${scope}" data-id="${esc(it.id)}">
  <span class="ayc-grip" title="ลากเพื่อเรียง">${icon('fa-grip-vertical')}</span>
  <div class="ayc-card-main" data-act="expand">
    <div class="ayc-card-top"><span class="ayc-card-title">${esc(it.title || '(ไม่มีชื่อ)')}</span>${tagsHtml(it)}</div>
    <div class="ayc-card-text">${esc(it.text)}</div>
  </div>
  ${switchHtml(it.enabled, '', it.enabled ? 'ปิดคำสั่งนี้' : 'เปิดคำสั่งนี้')}
  <button class="ayc-icon ayc-more" data-act="more" title="ตัวเลือก" aria-label="ตัวเลือก">${icon('fa-ellipsis-vertical')}</button>
</div>`;
}

function viewLibrary() {
    const entries = libEntries().filter(e => (ui.cat === 'all' || e.cat === ui.cat) && matches(e));
    if (!entries.length) return emptyState('fa-magnifying-glass', 'ไม่พบแม่แบบ', '');
    const chatOk = hasChat();
    const gSrc = new Map(list('global').map(x => [x.src, x]));
    const cSrc = new Map(list('chat').map(x => [x.src, x]));

    const groups = [];
    if (ui.cat === 'all') {
        for (const id of ['mine', ...CATEGORIES.map(c => c.id)]) {
            const g = entries.filter(e => e.cat === id);
            if (g.length) groups.push({ id, items: g });
        }
    } else {
        groups.push({ id: ui.cat, items: entries });
    }

    const addBtn = (scope, inList, disabled) => {
        const label = scope === 'global' ? 'ทุกแชท' : 'แชทนี้';
        if (!inList) {
            return `<button class="ayc-add" data-add="${scope}" ${disabled ? 'disabled' : ''} title="เพิ่มเข้า ${label} และเปิดทันที">${icon('fa-plus')}${label}</button>`;
        }
        const on = inList.enabled;
        return `<button class="ayc-add ayc-in ${on ? 'ayc-in-on' : ''}" data-add="${scope}" ${disabled ? 'disabled' : ''} aria-pressed="${on}"
            title="${on ? `เปิดอยู่ใน ${label} · แตะเพื่อปิด` : `อยู่ใน ${label} แต่ปิดอยู่ · แตะเพื่อเปิด`}">${icon(on ? 'fa-toggle-on' : 'fa-toggle-off')}${label}<small>${on ? 'เปิดอยู่' : 'ปิดอยู่'}</small></button>`;
    };

    return groups.map(g => {
        const c = catLabel(g.id);
        const head = `<h3 class="ayc-h">${icon(c.icon)} ${esc(c.label)} <small>${g.items.length}</small></h3>`;
        const cards = g.items.map(e => `
<div class="ayc-lib ${ui.expanded.has(e.key) ? 'ayc-expanded' : ''} ${gSrc.get(e.key)?.enabled || cSrc.get(e.key)?.enabled ? 'ayc-on' : ''}" data-key="${esc(e.key)}">
  <div class="ayc-lib-main" data-act="expand">
    <div class="ayc-card-top"><span class="ayc-card-title">${esc(e.title)}</span>${tagsHtml(e)}</div>
    ${e.desc ? `<div class="ayc-lib-desc">${esc(e.desc)}</div>` : ''}
    <div class="ayc-card-text ayc-mono">${esc(e.text)}</div>
  </div>
  <div class="ayc-lib-actions">
    ${addBtn('global', gSrc.get(e.key), false)}
    ${addBtn('chat', cSrc.get(e.key), !chatOk)}
    ${e.mine ? `<button class="ayc-icon ayc-more" data-act="lib-more" title="ตัวเลือก" aria-label="ตัวเลือก">${icon('fa-ellipsis-vertical')}</button>` : ''}
  </div>
</div>`).join('');
        return head + `<div class="ayc-grid">${cards}</div>`;
    }).join('');
}

function emptyState(ic, title, text, showLibLink = false) {
    return `
<div class="ayc-empty">
  <div class="ayc-empty-icon">${icon(ic)}</div>
  <div class="ayc-empty-title">${esc(title)}</div>
  ${text ? `<div class="ayc-empty-text">${esc(text)}</div>` : ''}
  ${showLibLink ? `<button class="ayc-btn ayc-primary" data-tab="lib">${icon('fa-book-bookmark')}เปิดคลังสำเร็จรูป</button>` : ''}
</div>`;
}

// ───────────────────────── settings tab ─────────────────────────

const POS_OPTIONS = [
    { v: POS.IN_CHAT, tag: '@ ความลึก', label: 'ในแชท ตามความลึก', hint: 'แนะนำ · แทรกระหว่างข้อความในแชท นับจากข้อความล่าสุดขึ้นไป' },
    { v: POS.IN_PROMPT, tag: 'หลัง', label: 'ต่อท้าย prompt หลัก', hint: 'อยู่ไกลจากข้อความล่าสุด โมเดลอาจให้น้ำหนักน้อยกว่า' },
    { v: POS.BEFORE_PROMPT, tag: 'ก่อน', label: 'ก่อน prompt หลัก', hint: 'อยู่บนสุดของ prompt' },
];

function viewSettings() {
    const s = settings();
    const pos = Number(s.position);
    return `
<h3 class="ayc-h">${icon('fa-location-crosshairs')} ตำแหน่งที่แทรก</h3>
<div class="ayc-card-plain">
  <div class="ayc-poslist">${POS_OPTIONS.map(o => `
    <button class="ayc-pos ${pos === o.v ? 'ayc-on' : ''}" data-set="position" data-v="${o.v}">
      <span class="ayc-pos-tag">${esc(o.tag)}</span><span class="ayc-grow"><b>${esc(o.label)}</b><small>${esc(o.hint)}</small></span>
    </button>`).join('')}</div>
  <div class="ayc-setrow ${pos === POS.IN_CHAT ? '' : 'ayc-disabled'}">
    <div class="ayc-grow"><b>ความลึก (depth)</b><small>0 = หลังข้อความล่าสุด แรงสุดแต่บอทอาจตอบสนองคำสั่งตรงๆ · 2–4 สมดุลที่สุด · ลึกเกิน 6 เริ่มลืม</small></div>
    <div class="ayc-stepper">
      <button class="ayc-icon" data-step="-1" aria-label="ลด" ${pos !== POS.IN_CHAT ? 'disabled' : ''}>${icon('fa-minus')}</button>
      <input class="ayc-input ayc-num" type="number" data-s="depth" min="0" max="50" value="${Number(s.depth)}" inputmode="numeric" ${pos !== POS.IN_CHAT ? 'disabled' : ''}>
      <button class="ayc-icon" data-step="1" aria-label="เพิ่ม" ${pos !== POS.IN_CHAT ? 'disabled' : ''}>${icon('fa-plus')}</button>
    </div>
  </div>
  <div class="ayc-setrow ayc-setcol">
    <div><b>ส่งในนาม (role)</b></div>
    <div class="ayc-seg ayc-seg3">${[[ROLE.SYSTEM, 'System'], [ROLE.USER, 'User'], [ROLE.ASSISTANT, 'Assistant']].map(([v, l]) =>
        `<button class="ayc-segbtn ${Number(s.role) === v ? 'ayc-on' : ''}" data-set="role" data-v="${v}">${l}</button>`).join('')}</div>
  </div>
</div>

<h3 class="ayc-h">${icon('fa-quote-left')} แม่แบบห่อคำสั่ง <small><code>{{list}}</code> คือที่วางรายการ</small></h3>
<div class="ayc-card-plain">
  <textarea class="ayc-input ayc-mono-input" data-s="template" rows="4">${esc(s.template)}</textarea>
  <button class="ayc-link" data-act="tpl-reset">${icon('fa-rotate-left')} คืนค่าแม่แบบเริ่มต้น</button>
</div>

<h3 class="ayc-h">${icon('fa-sliders')} การทำงาน</h3>
<div class="ayc-card-plain">
  <div class="ayc-setrow">
    <div class="ayc-grow"><b>${icon('fa-bolt', 'ayc-ic-once')} แจ้งเมื่อคำสั่งใช้ครั้งเดียวมีผลแล้ว</b><small>ป๊อบอัพเล็กๆ หลังบอทตอบ บอกว่าคำสั่งไหนถูกปิดไปแล้ว แตะที่ป๊อบอัพเพื่อเปิดกลับมาก่อน swipe ได้</small></div>
    ${switchHtml(s.onceNotice, 'data-s="onceNotice"')}
  </div>
  <div class="ayc-setrow">
    <div class="ayc-grow"><b>${icon('fa-ghost')} ไม่ส่งตอน generate เบื้องหลัง</b><small>กัน OOC ปนเข้า quiet prompt ของ extension อื่น เช่น งานสรุปความจำ</small></div>
    ${switchHtml(s.skipQuiet, 'data-s="skipQuiet"')}
  </div>
</div>

<h3 class="ayc-h" data-ref="launch-head">${icon('fa-circle-dot')} ปุ่มลอย <small>ตัวเลขบนปุ่ม = คำสั่งที่มีผลอยู่ตอนนี้</small></h3>
<div class="ayc-card-plain">
  <div class="ayc-setrow">
    <div class="ayc-grow"><b>${icon('fa-hand-pointer')} แสดงปุ่มลอยบนจอ</b><small>แตะเพื่อเปิดแผง · ลากไปวางตรงไหนก็ได้ · กดค้างเพื่อแต่งปุ่ม · เก็บเข้า Quick Dock ได้</small></div>
    ${switchHtml(s.launcher, 'data-s="launcher"')}
  </div>
  <details class="ayc-lookbox" data-ref="look-details" ${ui.lookOpen ? 'open' : ''}>
    <summary>${icon('fa-paintbrush')} แต่งหน้าตาปุ่ม</summary>
    ${safeLookHtml()}
  </details>
  <div class="ayc-row ayc-mt">
    <button class="ayc-btn" data-act="launch-resetpos">${icon('fa-crosshairs')} รีเซ็ตตำแหน่ง</button>
    <button class="ayc-btn" data-act="look-reset">${icon('fa-rotate-left')} หน้าตาแบบเดิม</button>
  </div>
</div>

<h3 class="ayc-h">${icon('fa-palette')} หน้าตาแผง</h3>
<div class="ayc-card-plain">
  <div class="ayc-seg ayc-seg3">${[['theme', 'fa-palette', 'ตามธีม'], ['light', 'fa-sun', 'สว่าง'], ['dark', 'fa-moon', 'มืด']].map(([k, ic, l]) =>
        `<button class="ayc-segbtn ${s.scheme === k ? 'ayc-on' : ''}" data-set="scheme" data-v="${k}">${icon(ic)} ${l}</button>`).join('')}</div>
  <div class="ayc-hint">ตามธีม = ใช้สีจากธีม ST ที่ใช้อยู่ (สีเน้นมาจาก Quote Color)</div>
</div>

<h3 class="ayc-h">${icon('fa-box-archive')} สำรอง / ย้ายเครื่อง <small>ลิสต์ทุกแชท + คลังของฉัน</small></h3>
<div class="ayc-card-plain">
  <div class="ayc-row">
    <button class="ayc-btn" data-act="export">${icon('fa-file-export')} ส่งออก</button>
    <button class="ayc-btn" data-act="import">${icon('fa-file-import')} นำเข้า</button>
    <input type="file" accept=".json,application/json" data-ref="import-file" hidden>
  </div>
</div>

<h3 class="ayc-h">${icon('fa-code-branch')} เวอร์ชัน</h3>
<div class="ayc-card-plain">
  <div class="ayc-verline">ที่รันอยู่: <b>v${VERSION}</b> <span data-ayc-remote>${remoteHtml()}</span></div>
  <div class="ayc-row">
    <button class="ayc-btn" data-act="vcheck">${icon('fa-magnifying-glass')} ตรวจเวอร์ชัน</button>
    <button class="ayc-btn ${isStale() ? 'ayc-primary' : ''}" data-act="reload">${icon('fa-rotate')} โหลดเวอร์ชันล่าสุด</button>
  </div>
  <div class="ayc-hint">หลังกด Update ใน ST แล้ว เบราว์เซอร์ (โดยเฉพาะมือถือและเว็บแอปบนหน้าจอโฮม) มักยังใช้ไฟล์เก่าที่จำไว้ ปุ่มนี้ดึงไฟล์ใหม่ทั้งหมดแล้วโหลดหน้าใหม่ให้</div>
</div>`;
}

function bindSettingsView() {
    const s = () => settings();
    const after = () => { ctx().saveSettingsDebounced(); applyInjection(); renderStatus(); };

    $root.on('click', '[data-set]', function () {
        const k = String($(this).data('set'));
        const raw = String($(this).data('v'));
        s()[k] = k === 'scheme' ? raw : Number(raw);
        after();
        render();
    });
    $root.on('click', '[data-step]', function () {
        const v = Math.max(0, Math.min(50, Number(s().depth) + Number($(this).data('step'))));
        s().depth = v;
        $root.find('[data-s="depth"]').val(v);
        after();
    });
    $root.on('change input', '.ayc-body [data-s]', function (e) {
        const k = String($(this).data('s'));
        if (k === 'template' && e.type === 'change') return;
        let v = this.type === 'checkbox' ? this.checked : $(this).val();
        if (k === 'depth') {
            if (e.type === 'input' && v === '') return;
            v = Math.max(0, Math.min(50, parseInt(v) || 0));
        }
        s()[k] = v;
        after();
        if (k === 'launcher') { renderLauncher(); syncDrawer(); }
    });
    $root.on('click', '[data-act="launch-resetpos"]', () => {
        resetLauncherPos();
        syncDrawer();
        render();
        toastr.success('ย้ายปุ่มลอยกลับที่เดิมแล้ว', '', { timeOut: 1400 });
    });
    $root.on('click', '[data-act="look-reset"]', () => {
        resetLook();
        render();
        toastr.success('ปุ่มลอยกลับเป็นหน้าตาเดิมแล้ว', '', { timeOut: 1400 });
    });
    $root.on('click', '[data-act="tpl-reset"]', () => {
        s().template = DEFAULT_TEMPLATE;
        $root.find('[data-s="template"]').val(DEFAULT_TEMPLATE);
        after();
        toastr.success('คืนค่าแม่แบบแล้ว', '', { timeOut: 1400 });
    });
    $root.on('click', '[data-act="export"]', exportData);
    $root.on('click', '[data-act="import"]', () => $root.find('[data-ref="import-file"]').trigger('click'));
    $root.on('change', '[data-ref="import-file"]', function () {
        const f = this.files?.[0];
        if (f) importData(f);
        this.value = '';
    });
    $root.on('click', '[data-act="vcheck"]', async () => {
        const remote = await checkForNewVersion(true);
        if (!remote) toastr.warning('อ่านเวอร์ชันบนเซิร์ฟเวอร์ไม่ได้');
        else if (!newer(remote, VERSION)) toastr.success(`รัน v${VERSION} อยู่ ตรงกับที่ติดตั้งไว้แล้ว`);
        else toastr.info(`ติดตั้งไว้ v${remote} แต่หน้านี้รัน v${VERSION} กด “โหลดเวอร์ชันล่าสุด”`);
        render();
    });
    $root.on('click', '[data-act="reload"]', reloadWithFreshFiles);
}

// ───────────────────────── editor / preview sheets ─────────────────────────

function openEditor(target) {
    const s = settings();
    let data = { title: '', text: '', once: false, group: '' };
    const scope = target.scope || 'global';
    if (target.mode === 'item' && target.id) {
        const it = list(target.scope).find(x => x.id === target.id);
        if (it) data = it;
    } else if (target.mode === 'lib' && target.id) {
        const t = s.myLibrary.find(x => x.id === target.id);
        if (t) data = t;
    }
    const isNew = !target.id;
    const isLib = target.mode === 'lib';
    const title = isLib ? (isNew ? 'สร้างแม่แบบในคลัง' : 'แก้แม่แบบ') : (isNew ? 'เพิ่มคำสั่ง' : 'แก้คำสั่ง');
    const groups = [...new Set([...list('global'), ...list('chat'), ...s.myLibrary, ...STARTERS].map(x => x.group).filter(Boolean))];
    const chatOk = hasChat();

    const body = `
<label class="ayc-label">ชื่อ <small>ไว้ดูเอง ไม่ถูกส่งให้โมเดล</small></label>
<input class="ayc-input" type="text" data-f="title" maxlength="80" value="${esc(data.title)}" placeholder="เช่น ห้ามพูดแทนผู้เล่น">
<label class="ayc-label">คำสั่ง <small>ข้อความที่ส่งให้โมเดล · ใช้ {{char}} {{user}} ได้</small></label>
<textarea class="ayc-input ayc-mono-input" data-f="text" rows="5" placeholder="Never write {{user}}'s actions…">${esc(data.text)}</textarea>
${!isLib && isNew ? `
<label class="ayc-label">เก็บไว้ที่</label>
<div class="ayc-seg ayc-seg2" data-ref="scope-seg">
  <button class="ayc-segbtn ${scope !== 'chat' ? 'ayc-on' : ''}" data-scope-pick="global">${icon('fa-earth-asia')} ทุกแชท</button>
  <button class="ayc-segbtn ${scope === 'chat' && chatOk ? 'ayc-on' : ''}" data-scope-pick="chat" ${chatOk ? '' : 'disabled'}>${icon('fa-comment-dots')} แชทนี้</button>
</div>` : ''}
<div class="ayc-card-plain ayc-mt">
  <div class="ayc-setrow">
    <div class="ayc-grow"><b>${icon('fa-bolt', 'ayc-ic-once')} ใช้ครั้งเดียว</b><small>ปิดเองหลังบอทตอบ 1 ข้อความ เหมาะกับข้ามเวลา เปลี่ยนฉาก หักมุม</small></div>
    ${switchHtml(data.once, 'data-f="once"')}
  </div>
  ${!isLib ? `<div class="ayc-setrow">
    <div class="ayc-grow"><b>${icon('fa-book-bookmark')} บันทึกเป็นแม่แบบในคลังด้วย</b><small>เก็บไว้ใช้กับแชทอื่นภายหลัง</small></div>
    ${switchHtml(false, 'data-f="toLib"')}
  </div>` : ''}
</div>
<label class="ayc-label">กลุ่ม <small>ไม่บังคับ · คำสั่งกลุ่มเดียวกันเปิดได้ทีละอัน</small></label>
<input class="ayc-input" type="text" data-f="group" list="ayc-groups" maxlength="30" value="${esc(data.group)}" placeholder="เช่น length, pace, pov">
<datalist id="ayc-groups">${groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist>`;

    const foot = `<button class="ayc-btn" data-x>ยกเลิก</button>
<button class="ayc-btn ayc-primary" data-act="editor-save">${icon('fa-check')} บันทึก</button>`;

    const { $l, close } = formSheet(title, isLib ? 'fa-book-bookmark' : 'fa-pen-to-square', body, foot);
    let pickedScope = scope === 'chat' && chatOk ? 'chat' : 'global';
    $l.on('click', '[data-scope-pick]', function () {
        if (this.disabled) return;
        pickedScope = String($(this).data('scope-pick'));
        $l.find('[data-scope-pick]').removeClass('ayc-on');
        $(this).addClass('ayc-on');
    });
    $l.on('click', '[data-act="editor-save"]', () => { if (saveEditor($l, target, pickedScope)) close(); });
    setTimeout(() => $l.find(isNew ? '[data-f="title"]' : '[data-f="text"]').trigger('focus'), 60);
}

function saveEditor($l, t, pickedScope) {
    const val = (f) => $l.find(`[data-f="${f}"]`);
    const title = String(val('title').val() || '').trim();
    const text = String(val('text').val() || '').trim();
    const once = val('once').is(':checked');
    const group = String(val('group').val() || '').trim();
    if (!text) { toastr.warning('ใส่ข้อความคำสั่งก่อน'); return false; }
    const finalTitle = title || text.slice(0, 40) + (text.length > 40 ? '…' : '');
    const s = settings();

    if (t.mode === 'lib') {
        if (t.id) {
            const x = s.myLibrary.find(y => y.id === t.id);
            if (x) Object.assign(x, { title: finalTitle, text, once, group });
        } else {
            s.myLibrary.unshift({ id: uid(), title: finalTitle, text, once, group });
        }
        save('lib');
    } else {
        let libId = null;
        if (val('toLib').is(':checked')) {
            libId = uid();
            s.myLibrary.unshift({ id: libId, title: finalTitle, text, once, group });
            save('lib');
        }
        if (t.id) {
            const it = list(t.scope).find(x => x.id === t.id);
            if (it) {
                Object.assign(it, { title: finalTitle, text, once, group });
                if (libId) it.src = 'm:' + libId;
                save(t.scope);
                applyInjection();
            }
        } else {
            const item = { id: uid(), title: finalTitle, text, enabled: true, once, group, src: libId ? 'm:' + libId : '' };
            if (!addItem(pickedScope, item)) return false;
            ui.tab = pickedScope;
            settings().lastTab = pickedScope;
        }
    }
    render();
    return true;
}

async function openPreviewSheet() {
    const raw = buildPrompt();
    const shown = raw ? ctx().substituteParams(raw) : '';
    let tokens = '';
    if (shown && typeof ctx().getTokenCountAsync === 'function') {
        try { tokens = `≈ ${await ctx().getTokenCountAsync(shown)} tokens`; } catch { /* ignore */ }
    }
    const s = settings();
    const body = `
<div class="ayc-meta"><span>${icon('fa-location-crosshairs')}${esc(whereText(s))}</span>${tokens ? `<span>${icon('fa-coins')}${esc(tokens)}</span>` : ''}</div>
${shown ? `<pre class="ayc-preview">${esc(shown)}</pre>` : emptyState('fa-moon', s.enabled ? 'ยังไม่มีคำสั่งที่เปิดอยู่' : 'ส่วนขยายปิดอยู่', 'ตอนนี้ไม่มีอะไรถูกแทรกเข้า prompt')}`;
    const foot = `${shown ? `<button class="ayc-btn" data-act="copy-preview">${icon('fa-copy')} คัดลอก</button>` : ''}
<button class="ayc-btn ayc-primary" data-x>เรียบร้อย</button>`;
    const { $l } = formSheet('สิ่งที่โมเดลจะเห็น', 'fa-eye', body, foot);
    $l.on('click', '[data-act="copy-preview"]', async () => {
        try { await navigator.clipboard.writeText(shown); toastr.success('คัดลอกแล้ว', '', { timeOut: 1200 }); }
        catch { toastr.error('คัดลอกไม่ได้'); }
    });
}

// ───────────────────────── export / import ─────────────────────────

function exportData() {
    const s = settings();
    const data = { format: 'as-you-command', version: 1, global: s.global, myLibrary: s.myLibrary };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'as-you-command-backup.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

async function importData(file) {
    try {
        const data = JSON.parse(await file.text());
        if (data?.format !== 'as-you-command') throw new Error('not ours');
        const s = settings();
        const clean = (arr) => (Array.isArray(arr) ? arr : []).filter(x => x && typeof x.text === 'string');
        const haveG = new Set(s.global.map(x => x.title + '\u0000' + x.text));
        const haveL = new Set(s.myLibrary.map(x => x.title + '\u0000' + x.text));
        let n = 0;
        for (const x of clean(data.global)) {
            if (haveG.has(x.title + '\u0000' + x.text)) continue;
            s.global.push({ id: uid(), title: String(x.title || ''), text: x.text, enabled: !!x.enabled, once: !!x.once, group: String(x.group || ''), src: String(x.src || '') });
            n++;
        }
        for (const x of clean(data.myLibrary)) {
            if (haveL.has(x.title + '\u0000' + x.text)) continue;
            s.myLibrary.push({ id: String(x.id || uid()), title: String(x.title || ''), text: x.text, once: !!x.once, group: String(x.group || '') });
            n++;
        }
        ctx().saveSettingsDebounced();
        applyInjection();
        render();
        toastr.success(n ? `นำเข้า ${n} รายการ` : 'ไม่มีรายการใหม่ (ซ้ำทั้งหมด)');
    } catch (err) {
        console.error(LOG, err);
        toastr.error('ไฟล์ไม่ใช่ข้อมูลของ As you command');
    }
}

// ───────────────────────── version check + hard refresh ─────────────────────────
//
// ST โหลดไฟล์ extension จาก URL เดิมทุกครั้ง เบราว์เซอร์ (และเว็บแอปบนหน้าจอโฮมของ iOS ที่แทบไม่โหลดใหม่จริง)
// จึงมักยังใช้ไฟล์เก่าที่ cache ไว้หลังกด Update เทียบกับ manifest บนเซิร์ฟเวอร์ ถ้าใหม่กว่าก็บอก
// และให้กดดึงไฟล์ใหม่ทุกไฟล์แล้วโหลดหน้าใหม่

let remoteVersion = '';
let versionCheckedAt = 0;
let versionToastShown = false;

function newer(a, b) {
    const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
    }
    return false;
}
const isStale = () => !!remoteVersion && newer(remoteVersion, VERSION);

async function fetchRemoteVersion() {
    try {
        const res = await fetch(new URL('manifest.json', BASE_URL), { cache: 'no-store' });
        if (!res.ok) return '';
        return String((await res.json())?.version ?? '');
    } catch { return ''; }
}

function remoteHtml() {
    if (!remoteVersion) return '';
    return isStale()
        ? `· ติดตั้งไว้ <b>v${esc(remoteVersion)}</b> <span class="ayc-stale">ยังไม่ได้โหลด กด “โหลดเวอร์ชันล่าสุด”</span>`
        : '· เป็นเวอร์ชันล่าสุดที่ติดตั้งไว้แล้ว';
}

function showRemote() {
    document.querySelectorAll('[data-ayc-remote]').forEach(el => { el.innerHTML = remoteHtml(); });
    if ($root) renderStatus();
}

async function checkForNewVersion(force = false) {
    if (!force && Date.now() - versionCheckedAt < 10 * 60_000) return remoteVersion;
    versionCheckedAt = Date.now();
    remoteVersion = await fetchRemoteVersion();
    showRemote();
    if (isStale() && !versionToastShown) {
        versionToastShown = true;
        toastr.info(`ติดตั้ง v${esc(remoteVersion)} ไว้แล้ว แต่หน้านี้ยังรัน v${VERSION} อยู่<br>แตะที่นี่เพื่อโหลดเวอร์ชันใหม่`, 'As you command', {
            timeOut: 0, extendedTimeOut: 0, closeButton: true, escapeHtml: false, onclick: () => reloadWithFreshFiles(),
        });
    }
    return remoteVersion;
}

async function reloadWithFreshFiles() {
    try {
        toastr.info('กำลังดึงไฟล์ใหม่…', 'As you command', { timeOut: 2000 });
        const c = ctx();
        // บันทึกที่ค้างอยู่ก่อนโหลดหน้าใหม่ (save แบบ debounce รอ ~1 วินาที)
        const pending = [
            typeof c.saveSettings === 'function' ? c.saveSettings() : new Promise(r => setTimeout(r, 1200)),
            typeof c.saveMetadata === 'function' && hasChat() ? c.saveMetadata() : null,
        ];
        // cache: 'reload' ดึงจากเซิร์ฟเวอร์แล้วเขียนทับสำเนาใน cache ของเบราว์เซอร์ หน้าที่โหลดใหม่จึงได้ไฟล์ใหม่
        await Promise.all([
            ...pending.map(p => Promise.resolve(p).catch(() => null)),
            ...FILES.map(f => fetch(new URL(f, BASE_URL), { cache: 'reload' }).catch(() => null)),
        ]);
    } finally {
        location.reload();
    }
}

// ───────────────────────── wand menu + settings drawer ─────────────────────────

function updateWandBadge() {
    const n = settings().enabled ? activeItems().length : 0;
    $('#ayc_wand .ayc-wand-badge').text(n || '').toggle(n > 0);
    updateLauncherBadge();
}

/** เปิดแผงที่หน้า ตั้งค่า ตรงส่วนแต่งปุ่มลอย (กดค้างที่ปุ่ม / ปุ่มในหน้า Extensions) */
function openCustomize() {
    ui.lookOpen = true;
    openOverlay('settings');
    const head = $root.find('[data-ref="launch-head"]')[0];
    if (head) setTimeout(() => head.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60);
}

function syncDrawer() {
    $('#ayc_enabled_cb').prop('checked', settings().enabled);
    $('#ayc_launcher_cb').prop('checked', !!settings().launcher);
}

function mountMenus() {
    const $wand = $(`
<div id="ayc_wand" class="list-group-item flex-container flexGap5 interactable" tabindex="0" title="คลังคำสั่ง OOC">
  <div class="fa-solid fa-scroll extensionsMenuExtensionButton"></div>
  <span>As you command</span><b class="ayc-wand-badge"></b>
</div>`);
    $wand.on('click', () => openOverlay());
    $('#extensionsMenu').append($wand);

    if (document.getElementById('ayc_settings')) return;
    const $panel = $(`
<div id="ayc_settings" class="ayc-settings-panel">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b><i class="fa-solid fa-scroll"></i> As you command <small class="ayc-vertag">v${VERSION}</small></b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content"><div class="ayc-drawer-inner">
      <label class="checkbox_label"><input type="checkbox" id="ayc_enabled_cb"><span>เปิดใช้งาน</span></label>
      <label class="checkbox_label"><input type="checkbox" id="ayc_launcher_cb"><span>ปุ่มลอยบนจอ (ตัวเลข = คำสั่งที่มีผลอยู่)</span></label>
      <div class="ayc-drawer-btns">
        <div class="menu_button" data-ayc-open="global"><i class="fa-solid fa-scroll"></i> เปิดแผงคำสั่ง</div>
        <div class="menu_button" data-ayc-open="lib"><i class="fa-solid fa-book-bookmark"></i> คลัง</div>
        <div class="menu_button" data-ayc-open="settings"><i class="fa-solid fa-gear"></i> ตั้งค่า</div>
        <div class="menu_button" data-ayc-look><i class="fa-solid fa-paintbrush"></i> แต่งปุ่มลอย</div>
        <div class="menu_button" data-ayc-diag title="ทดลองเปิดแผงแล้ววัดว่าเกิดอะไรขึ้น ได้รายงานไว้คัดลอกส่งให้คนแก้"><i class="fa-solid fa-stethoscope"></i> ตรวจปัญหา</div>
        <div class="menu_button" data-ayc-reload title="ดึงไฟล์ของ As you command จากเซิร์ฟเวอร์ใหม่ทั้งหมดแล้วโหลดหน้าใหม่"><i class="fa-solid fa-rotate"></i> โหลดเวอร์ชันล่าสุด</div>
      </div>
      <div class="ayc-verline">ที่รันอยู่: <b>v${VERSION}</b> <span data-ayc-remote></span></div>
      <div class="ayc-diagbox" data-ayc-diagbox hidden>
        <textarea class="text_pole" readonly rows="10"></textarea>
        <div class="menu_button" data-ayc-diagcopy><i class="fa-solid fa-copy"></i> คัดลอกรายงาน</div>
      </div>
      <small>คลังคำสั่ง OOC ติ๊กเปิด/ปิดได้ คำสั่งที่เปิดจะถูกแทรกทุกเทิร์น บอทจึงไม่ลืม · เปิดแผงจากเมนู 🪄 หรือพิมพ์ <code>/ayc</code></small>
    </div></div>
  </div>
</div>`);
    $panel.find('#ayc_enabled_cb').prop('checked', settings().enabled).on('change', function () {
        settings().enabled = this.checked;
        ctx().saveSettingsDebounced();
        applyInjection();
        refresh();
    });
    $panel.find('#ayc_launcher_cb').prop('checked', !!settings().launcher).on('change', function () {
        settings().launcher = this.checked;
        ctx().saveSettingsDebounced();
        renderLauncher();
        refresh();
    });
    $panel.on('click', '[data-ayc-open]', function () { openOverlay(String($(this).data('ayc-open'))); });
    $panel.on('click', '[data-ayc-look]', openCustomize);
    $panel.on('click', '[data-ayc-reload]', reloadWithFreshFiles);
    $panel.on('click', '[data-ayc-diag]', async () => {
        const $box = $panel.find('[data-ayc-diagbox]');
        let text;
        try { text = await runDiagnostics(); } catch (err) { text = `ตรวจไม่สำเร็จ: ${err?.stack || err}\n${diagLog.join('\n')}`; }
        $box.prop('hidden', false).find('textarea').val(text);
    });
    $panel.on('click', '[data-ayc-diagcopy]', async () => {
        const ta = $panel.find('[data-ayc-diagbox] textarea')[0];
        try { await navigator.clipboard.writeText(ta.value); toastr.success('คัดลอกรายงานแล้ว', '', { timeOut: 1500 }); }
        catch { ta.focus(); ta.select(); toastr.info('เลือกข้อความไว้แล้ว กดคัดลอกเองได้เลย'); }
    });
    $('#extensions_settings2').append($panel);
}

// ───────────────────────── slash commands ─────────────────────────

function findItems(query, scope) {
    const q = String(query || '').trim().toLowerCase();
    const scopes = scope === 'global' ? ['global'] : scope === 'chat' ? ['chat'] : ['global', 'chat'];
    const hits = [];
    for (const sc of scopes) for (const it of list(sc)) {
        const t = String(it.title || '').toLowerCase();
        if (t === q) return [{ scope: sc, it }];
        if (t.includes(q)) hits.push({ scope: sc, it });
    }
    return hits;
}

function registerCommands() {
    const c = ctx();
    const { SlashCommandParser, SlashCommand, SlashCommandArgument, SlashCommandNamedArgument, ARGUMENT_TYPE } = c;
    if (!SlashCommandParser || !SlashCommand) return;

    const scopeArg = () => SlashCommandNamedArgument.fromProps({
        name: 'scope', description: 'global | chat | all', typeList: [ARGUMENT_TYPE.STRING],
        defaultValue: 'all', enumList: ['all', 'global', 'chat'],
    });
    const titleArg = () => SlashCommandArgument.fromProps({
        description: 'ชื่อคำสั่ง (ตรงทั้งหมด หรือบางส่วนที่ไม่ซ้ำ)', typeList: [ARGUMENT_TYPE.STRING], isRequired: true,
    });

    const toggleCmd = (name, mode, help) => SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name,
        returns: 'ชื่อคำสั่งที่เปลี่ยน',
        namedArgumentList: [scopeArg()],
        unnamedArgumentList: [titleArg()],
        helpString: help,
        callback: (args, value) => {
            const hits = findItems(value, args.scope);
            if (!hits.length) { toastr.warning(`ไม่พบคำสั่ง "${value}"`); return ''; }
            if (hits.length > 1) { toastr.warning(`"${value}" ตรงกับหลายคำสั่ง: ${hits.map(h => h.it.title).join(', ')}`); return ''; }
            const { scope, it } = hits[0];
            const on = mode === 'toggle' ? !it.enabled : mode === 'on';
            setEnabled(scope, it.id, on);
            refresh();
            toastr.info(`${on ? 'เปิด' : 'ปิด'} "${it.title}"`, '', { timeOut: 1400 });
            return it.title;
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'ayc',
        helpString: 'เปิดแผง As you command',
        callback: () => { openOverlay(); return ''; },
    }));
    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'ayc-debug',
        helpString: 'ตรวจปัญหาแผง As you command แล้วคืนรายงาน (ดูหรือคัดลอกได้จาก Extensions → As you command → ตรวจปัญหา)',
        callback: async () => runDiagnostics(),
    }));
    toggleCmd('ayc-on', 'on', 'เปิดคำสั่ง OOC ตามชื่อ เช่น <code>/ayc-on ตอบสั้น</code>');
    toggleCmd('ayc-off', 'off', 'ปิดคำสั่ง OOC ตามชื่อ');
    toggleCmd('ayc-toggle', 'toggle', 'สลับเปิด/ปิดคำสั่ง OOC ตามชื่อ');

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'ayc-add',
        returns: 'id ของคำสั่งใหม่',
        namedArgumentList: [
            SlashCommandNamedArgument.fromProps({ name: 'scope', description: 'global | chat', typeList: [ARGUMENT_TYPE.STRING], defaultValue: 'chat', enumList: ['chat', 'global'] }),
            SlashCommandNamedArgument.fromProps({ name: 'title', description: 'ชื่อ (ไม่บังคับ)', typeList: [ARGUMENT_TYPE.STRING] }),
            SlashCommandNamedArgument.fromProps({ name: 'once', description: 'ใช้ครั้งเดียว', typeList: [ARGUMENT_TYPE.BOOLEAN], defaultValue: 'false', enumList: ['true', 'false'] }),
        ],
        unnamedArgumentList: [SlashCommandArgument.fromProps({ description: 'ข้อความคำสั่ง', typeList: [ARGUMENT_TYPE.STRING], isRequired: true })],
        helpString: 'เพิ่มคำสั่ง OOC แล้วเปิดทันที (ค่าเริ่มต้นเก็บในแชทนี้) เช่น <code>/ayc-add once=true ให้ฝนตกในฉากถัดไป</code>',
        callback: (args, value) => {
            const text = String(value || '').trim();
            if (!text) return '';
            const scope = args.scope === 'global' ? 'global' : 'chat';
            const title = String(args.title || '').trim() || text.slice(0, 40) + (text.length > 40 ? '…' : '');
            const item = { id: uid(), title, text, enabled: true, once: String(args.once) === 'true', group: '', src: '' };
            if (!addItem(scope, item)) return '';
            refresh();
            return item.id;
        },
    }));

    SlashCommandParser.addCommandObject(SlashCommand.fromProps({
        name: 'ayc-clear',
        namedArgumentList: [scopeArg()],
        helpString: 'ปิดทุกคำสั่ง OOC (scope=global|chat|all)',
        callback: (args) => {
            const scopes = args.scope === 'global' ? ['global'] : args.scope === 'chat' ? ['chat'] : ['global', 'chat'];
            for (const sc of scopes) { list(sc).forEach(x => { x.enabled = false; }); save(sc); }
            applyInjection();
            refresh();
            return '';
        },
    }));
}

// ───────────────────────── boot ─────────────────────────

window.addEventListener('error', e => {
    if (String(e.filename || '').startsWith(BASE_URL.href)) diag(`window error ${e.message} @${String(e.filename).slice(BASE_URL.href.length)}:${e.lineno}`);
});
window.addEventListener('unhandledrejection', e => {
    if (String(e.reason?.stack || '').includes(BASE_URL.href)) diag(`unhandled ${e.reason?.message ?? e.reason}`);
});

jQuery(async () => {
    try {
        settings();
        mountMenus();
        registerCommands();
        initLauncher({
            settings,
            save: () => ctx().saveSettingsDebounced(),
            open: () => openOverlay(),
            customize: openCustomize,
            count: () => activeItems().length,
            enabled: () => !!settings().enabled,
        });
        renderLauncher();

        const { eventSource, eventTypes } = ctx();
        eventSource.on(eventTypes.CHAT_CHANGED, () => { pendingOnce = null; applyInjection(); refresh(); checkForNewVersion(); });
        eventSource.on(eventTypes.GENERATION_AFTER_COMMANDS, onAfterCommands);
        eventSource.on(eventTypes.MESSAGE_RECEIVED, onMessageReceived);
        eventSource.on(eventTypes.GENERATION_STOPPED, () => { pendingOnce = null; });
        eventSource.on(eventTypes.GENERATION_ENDED, () => applyInjection());

        applyInjection();
        updateWandBadge();
        setTimeout(() => checkForNewVersion(true), 3000);
        globalThis.AsYouCommand = { open: openOverlay, customize: openCustomize, version: VERSION, remote: () => remoteVersion, isStale, reload: reloadWithFreshFiles };
        console.log(LOG, `v${VERSION} ready`);
    } catch (err) {
        console.error(LOG, 'failed to load', err);
    }
});
