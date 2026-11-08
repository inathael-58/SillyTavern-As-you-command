// As you command — คลังคำสั่ง OOC แบบติ๊กเปิด/ปิด สำหรับ SillyTavern
// คำสั่งที่เปิดไว้จะถูก inject ใหม่ทุกเทิร์นที่ความลึกคงที่ จึงไม่ถูกดันหายไปกับประวัติแชท
// เก็บได้ 2 ขอบเขต: ทุกแชท (extension settings) และเฉพาะแชทนี้ (chat metadata)

import { STARTERS, CATEGORIES } from './starters.js';

const MODULE = 'as_you_command';
const LOG = '[As you command]';

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
    return {
        id: uid(),
        title: st.title,
        text: st.text,
        enabled,
        once: !!st.once,
        group: st.group || '',
        src: 's:' + st.id,
    };
}

function fromMine(t, enabled = true) {
    return {
        id: uid(),
        title: t.title,
        text: t.text,
        enabled,
        once: !!t.once,
        group: t.group || '',
        src: 'm:' + t.id,
    };
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
    for (const { scope, id } of pendingOnce.refs) {
        const it = list(scope).find(x => x.id === id);
        if (it && it.enabled) { it.enabled = false; touched.add(scope); }
    }
    pendingOnce = null;
    touched.forEach(save);
    if (touched.size) { applyInjection(); refresh(); }
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

const ui = {
    tab: 'global',
    cat: 'all',
    query: '',
    expanded: new Set(),
    editing: null, // { mode:'item'|'lib', scope, id|null }
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

function switchHtml(checked, attrs = '') {
    return `<label class="ayc-switch" ${attrs}><input type="checkbox" ${checked ? 'checked' : ''}><span class="ayc-slider"></span></label>`;
}

// ───────────────────────── overlay ─────────────────────────

function buildOverlay() {
    $root = $(`
<div id="ayc-overlay" class="ayc-hidden" aria-hidden="true">
  <div class="ayc-shell" role="dialog" aria-label="As you command">
    <header class="ayc-head">
      <div class="ayc-brand">
        <div class="ayc-seal"><i class="fa-solid fa-scroll"></i></div>
        <div class="ayc-brand-text">
          <div class="ayc-title">As you command</div>
          <div class="ayc-sub" data-ref="status"></div>
        </div>
      </div>
      <div class="ayc-head-actions">
        <span class="ayc-master" title="เปิด/ปิดทั้งหมด">${switchHtml(true, 'data-act="master"')}</span>
        <button class="ayc-icon-btn" data-act="settings" title="ตั้งค่า"><i class="fa-solid fa-sliders"></i></button>
        <button class="ayc-icon-btn" data-act="close" title="ปิด"><i class="fa-solid fa-xmark"></i></button>
      </div>
    </header>

    <nav class="ayc-tabs" role="tablist">
      <button class="ayc-tab" data-tab="global"><i class="fa-solid fa-earth-asia"></i><span>ทุกแชท</span><b class="ayc-count" data-ref="cnt-global"></b></button>
      <button class="ayc-tab" data-tab="chat"><i class="fa-solid fa-comment-dots"></i><span>แชทนี้</span><b class="ayc-count" data-ref="cnt-chat"></b></button>
      <button class="ayc-tab" data-tab="lib"><i class="fa-solid fa-book-bookmark"></i><span>คลัง</span></button>
    </nav>

    <div class="ayc-toolbar">
      <div class="ayc-search">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input type="search" data-ref="search" placeholder="ค้นหาคำสั่ง…" autocomplete="off">
      </div>
      <div class="ayc-chips" data-ref="chips"></div>
    </div>

    <div class="ayc-body" data-ref="body"></div>

    <footer class="ayc-foot">
      <button class="ayc-btn ayc-btn-primary" data-act="new"><i class="fa-solid fa-plus"></i><span data-ref="new-label">เพิ่มคำสั่ง</span></button>
      <button class="ayc-btn" data-act="preview"><i class="fa-solid fa-eye"></i><span>ดู prompt</span></button>
      <button class="ayc-btn ayc-btn-ghost" data-act="all-off" title="ปิดทุกคำสั่งในแท็บนี้"><i class="fa-solid fa-power-off"></i></button>
    </footer>

    <div class="ayc-sheet ayc-hidden" data-ref="sheet">
      <div class="ayc-sheet-card" data-ref="sheet-card"></div>
    </div>
  </div>
</div>`);
    $('body').append($root);

    $root.on('click', (e) => { if (e.target === $root[0]) closeOverlay(); });
    $root.on('click', '[data-tab]', function () {
        ui.tab = $(this).data('tab');
        ui.cat = 'all';
        settings().lastTab = ui.tab;
        ctx().saveSettingsDebounced();
        render();
    });
    $root.on('input', '[data-ref="search"]', function () {
        ui.query = String($(this).val() || '');
        renderBody();
    });
    $root.on('click', '[data-cat]', function () {
        ui.cat = $(this).data('cat');
        renderChips();
        renderBody();
    });

    // ── main actions ──
    $root.on('change', '[data-act="master"] input', function () {
        settings().enabled = this.checked;
        ctx().saveSettingsDebounced();
        applyInjection();
        renderStatus();
        $root.find('.ayc-shell').toggleClass('ayc-off', !this.checked);
    });
    $root.on('click', '[data-act="close"]', closeOverlay);
    $root.on('click', '[data-act="settings"]', openSettingsSheet);
    $root.on('click', '[data-act="preview"]', openPreviewSheet);
    $root.on('click', '[data-act="new"]', () => {
        if (ui.tab === 'lib') openEditor({ mode: 'lib', id: null });
        else openEditor({ mode: 'item', scope: ui.tab, id: null });
    });
    $root.on('click', '[data-act="all-off"]', () => {
        const scopes = ui.tab === 'lib' ? ['global', 'chat'] : [ui.tab];
        let n = 0;
        for (const sc of scopes) {
            for (const it of list(sc)) if (it.enabled) { it.enabled = false; n++; }
            save(sc);
        }
        applyInjection();
        render();
        toastr.info(n ? `ปิด ${n} คำสั่ง` : 'ไม่มีคำสั่งที่เปิดอยู่', '', { timeOut: 1600 });
    });

    // ── item card actions ──
    $root.on('change', '.ayc-card .ayc-switch input', function () {
        const $c = $(this).closest('.ayc-card');
        setEnabled($c.data('scope'), $c.data('id'), this.checked);
        render();
    });
    $root.on('click', '.ayc-card [data-act="expand"]', function () {
        const id = $(this).closest('[data-id]').data('id');
        ui.expanded.has(id) ? ui.expanded.delete(id) : ui.expanded.add(id);
        $(this).closest('[data-id]').toggleClass('ayc-expanded');
    });
    $root.on('click', '.ayc-card [data-act="edit"]', function () {
        const $c = $(this).closest('.ayc-card');
        openEditor({ mode: 'item', scope: $c.data('scope'), id: $c.data('id') });
    });
    $root.on('click', '.ayc-card [data-act="move"]', function () {
        const $c = $(this).closest('.ayc-card');
        moveItem($c.data('scope'), $c.data('id'));
        render();
    });
    $root.on('click', '.ayc-card [data-act="delete"]', async function () {
        const $c = $(this).closest('.ayc-card');
        const it = list($c.data('scope')).find(x => x.id === $c.data('id'));
        if (!it) return;
        if (!(await confirmBox(`ลบคำสั่ง "${it.title}"?`))) return;
        removeItem($c.data('scope'), it.id);
        render();
    });

    // ── library actions ──
    $root.on('click', '.ayc-lib-card [data-act="expand"]', function () {
        const key = $(this).closest('[data-key]').data('key');
        ui.expanded.has(key) ? ui.expanded.delete(key) : ui.expanded.add(key);
        $(this).closest('[data-key]').toggleClass('ayc-expanded');
    });
    $root.on('click', '.ayc-lib-card [data-add]', function () {
        const scope = $(this).data('add');
        const key = $(this).closest('[data-key]').data('key');
        const entry = libEntries().find(x => x.key === key);
        if (!entry) return;
        const existing = list(scope).find(x => x.src === key);
        if (existing) {
            setEnabled(scope, existing.id, !existing.enabled);
        } else {
            const item = entry.mine ? fromMine(entry, true) : fromStarter(entry, true);
            if (!addItem(scope, item)) return;
            toastr.success(`เพิ่ม "${entry.title}" → ${scope === 'chat' ? 'แชทนี้' : 'ทุกแชท'}`, '', { timeOut: 1600 });
        }
        render();
    });
    $root.on('click', '.ayc-lib-card [data-act="lib-edit"]', function () {
        const key = String($(this).closest('[data-key]').data('key'));
        openEditor({ mode: 'lib', id: key.slice(2) });
    });
    $root.on('click', '.ayc-lib-card [data-act="lib-delete"]', async function () {
        const key = String($(this).closest('[data-key]').data('key'));
        const s = settings();
        const t = s.myLibrary.find(x => 'm:' + x.id === key);
        if (!t || !(await confirmBox(`ลบ "${t.title}" ออกจากคลัง? (คำสั่งที่เพิ่มเข้าลิสต์ไปแล้วไม่หาย)`))) return;
        s.myLibrary = s.myLibrary.filter(x => x !== t);
        save('lib');
        render();
    });

    // ── sheet ──
    $root.on('click', '[data-ref="sheet"]', function (e) { if (e.target === this) closeSheet(); });
    $root.on('click', '[data-act="sheet-close"]', closeSheet);

    $(document).on('keydown.ayc', (e) => {
        if (e.key !== 'Escape' || $root.hasClass('ayc-hidden')) return;
        if (!$root.find('[data-ref="sheet"]').hasClass('ayc-hidden')) closeSheet();
        else closeOverlay();
    });
}

function openOverlay() {
    if (!$root) buildOverlay();
    ui.tab = settings().lastTab || 'global';
    ui.query = '';
    $root.find('[data-ref="search"]').val('');
    closeSheet();
    render();
    $root.removeClass('ayc-hidden').attr('aria-hidden', 'false');
    $('body').addClass('ayc-open');
}

function closeOverlay() {
    if (!$root) return;
    $root.addClass('ayc-hidden').attr('aria-hidden', 'true');
    $('body').removeClass('ayc-open');
}

function refresh() {
    if ($root && !$root.hasClass('ayc-hidden')) render();
    updateWandBadge();
}

// ───────────────────────── render ─────────────────────────

function render() {
    if (!$root) return;
    const s = settings();
    $root.find('.ayc-tab').each(function () {
        $(this).toggleClass('ayc-active', $(this).data('tab') === ui.tab);
    });
    $root.find('[data-act="master"] input').prop('checked', s.enabled);
    $root.find('.ayc-shell').toggleClass('ayc-off', !s.enabled);
    $root.find('[data-ref="new-label"]').text(ui.tab === 'lib' ? 'สร้างแม่แบบ' : 'เพิ่มคำสั่ง');
    $root.find('[data-act="all-off"]').toggle(ui.tab !== 'lib');
    renderStatus();
    renderChips();
    renderBody();
    updateWandBadge();
}

function renderStatus() {
    const s = settings();
    const g = list('global'), c = list('chat');
    const gOn = g.filter(x => x.enabled).length, cOn = c.filter(x => x.enabled).length;
    $root.find('[data-ref="cnt-global"]').text(gOn ? `${gOn}/${g.length}` : g.length || '').toggleClass('ayc-lit', gOn > 0);
    $root.find('[data-ref="cnt-chat"]').text(cOn ? `${cOn}/${c.length}` : c.length || '').toggleClass('ayc-lit', cOn > 0);
    const where = Number(s.position) === POS.IN_CHAT ? `ความลึก ${s.depth}` : (Number(s.position) === POS.IN_PROMPT ? 'หลัง prompt หลัก' : 'ก่อน prompt หลัก');
    const txt = !s.enabled ? 'ปิดอยู่ — ไม่มีอะไรถูกส่งให้โมเดล'
        : (gOn + cOn) ? `กำลังสั่ง ${gOn + cOn} ข้อ · ${where}` : 'ยังไม่ได้เปิดคำสั่งไหน';
    $root.find('[data-ref="status"]').text(txt);
}

function renderChips() {
    const $chips = $root.find('[data-ref="chips"]');
    if (ui.tab !== 'lib') { $chips.empty().hide(); return; }
    const hasMine = settings().myLibrary.length > 0;
    const cats = [{ id: 'all', label: 'ทั้งหมด', icon: 'fa-layer-group' }, ...(hasMine ? [{ id: 'mine', ...catLabel('mine') }] : []), ...CATEGORIES];
    $chips.html(cats.map(c => `<button class="ayc-chip-btn ${ui.cat === c.id ? 'ayc-active' : ''}" data-cat="${c.id}"><i class="fa-solid ${c.icon}"></i>${esc(c.label)}</button>`).join('')).show();
}

function renderBody() {
    const $body = $root.find('[data-ref="body"]');
    if (ui.tab === 'lib') { $body.html(renderLibrary()); return; }

    if (ui.tab === 'chat' && !hasChat()) {
        $body.html(emptyState('fa-comment-slash', 'ยังไม่ได้เปิดแชท', 'เปิดแชทก่อน แล้วคำสั่งในแท็บนี้จะผูกกับแชทนั้นแชทเดียว'));
        return;
    }

    const arr = list(ui.tab);
    if (!arr.length) {
        $body.html(ui.tab === 'chat'
            ? emptyState('fa-feather', 'แชทนี้ยังไม่มีคำสั่งเฉพาะ', 'ใช้สำหรับคำสั่งที่อยากให้มีแค่ในเรื่องนี้ เช่น ทิศทางเนื้อเรื่อง หรือกฎของโลกในบอทนี้', true)
            : emptyState('fa-scroll', 'ลิสต์ว่าง', 'เลือกคำสั่งสำเร็จรูปจากคลัง หรือเขียนเองได้เลย', true));
        return;
    }
    const shown = arr.filter(matches);
    if (!shown.length) { $body.html(emptyState('fa-magnifying-glass', 'ไม่พบคำสั่งที่ค้นหา', '')); return; }

    $body.html(`<div class="ayc-list" data-ref="sortable">${shown.map(it => itemCard(ui.tab, it)).join('')}</div>`);

    if (!ui.query && typeof $.fn.sortable === 'function') {
        const scope = ui.tab;
        $body.find('[data-ref="sortable"]').sortable({
            handle: '.ayc-grip',
            axis: 'y',
            tolerance: 'pointer',
            placeholder: 'ayc-card-placeholder',
            update: function () {
                const order = $(this).children('.ayc-card').map((_, el) => $(el).data('id')).get();
                const cur = list(scope);
                cur.sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id));
                save(scope);
                applyInjection();
            },
        });
    }
}

function itemCard(scope, it) {
    const moveTitle = scope === 'global' ? 'ย้ายไปแชทนี้' : 'ย้ายไปทุกแชท';
    const moveIcon = scope === 'global' ? 'fa-comment-dots' : 'fa-earth-asia';
    const tags = [
        it.once ? '<span class="ayc-tag ayc-tag-once"><i class="fa-solid fa-bolt"></i>ครั้งเดียว</span>' : '',
        it.group ? `<span class="ayc-tag"><i class="fa-solid fa-circle-half-stroke"></i>${esc(it.group)}</span>` : '',
    ].join('');
    return `
<div class="ayc-card ${it.enabled ? 'ayc-on' : ''} ${ui.expanded.has(it.id) ? 'ayc-expanded' : ''}" data-scope="${scope}" data-id="${esc(it.id)}">
  <span class="ayc-grip" title="ลากเพื่อเรียง"><i class="fa-solid fa-grip-vertical"></i></span>
  ${switchHtml(it.enabled)}
  <div class="ayc-card-main" data-act="expand">
    <div class="ayc-card-title">${esc(it.title || '(ไม่มีชื่อ)')}${tags}</div>
    <div class="ayc-card-text">${esc(it.text)}</div>
  </div>
  <div class="ayc-card-actions">
    <button class="ayc-mini" data-act="edit" title="แก้ไข"><i class="fa-solid fa-pen"></i></button>
    <button class="ayc-mini" data-act="move" title="${moveTitle}"><i class="fa-solid ${moveIcon}"></i></button>
    <button class="ayc-mini ayc-danger" data-act="delete" title="ลบ"><i class="fa-solid fa-trash-can"></i></button>
  </div>
</div>`;
}

function renderLibrary() {
    const entries = libEntries().filter(e => (ui.cat === 'all' || e.cat === ui.cat) && matches(e));
    if (!entries.length) return emptyState('fa-magnifying-glass', 'ไม่พบแม่แบบ', '');
    const chatOk = hasChat();
    const gSrc = new Map(list('global').map(x => [x.src, x]));
    const cSrc = new Map(list('chat').map(x => [x.src, x]));

    // group by category when showing all
    const groups = [];
    if (ui.cat === 'all') {
        const order = ['mine', ...CATEGORIES.map(c => c.id)];
        for (const id of order) {
            const g = entries.filter(e => e.cat === id);
            if (g.length) groups.push({ id, items: g });
        }
    } else {
        groups.push({ id: null, items: entries });
    }

    const addBtn = (scope, entry, inList, disabled) => {
        const state = !inList ? '' : (inList.enabled ? 'ayc-in ayc-in-on' : 'ayc-in');
        const icon = !inList ? 'fa-plus' : (inList.enabled ? 'fa-check' : 'fa-circle');
        const label = scope === 'global' ? 'ทุกแชท' : 'แชทนี้';
        const tip = !inList ? `เพิ่มและเปิดใน${label}` : (inList.enabled ? `กดเพื่อปิดใน${label}` : `อยู่ใน${label}แล้ว (ปิดอยู่) — กดเพื่อเปิด`);
        return `<button class="ayc-add ${state}" data-add="${scope}" ${disabled ? 'disabled' : ''} title="${tip}"><i class="fa-solid ${icon}"></i>${label}</button>`;
    };

    return groups.map(g => {
        const head = g.id ? (() => { const c = catLabel(g.id); return `<div class="ayc-group-head"><i class="fa-solid ${c.icon}"></i>${esc(c.label)}</div>`; })() : '';
        const cards = g.items.map(e => `
<div class="ayc-lib-card ${ui.expanded.has(e.key) ? 'ayc-expanded' : ''}" data-key="${esc(e.key)}">
  <div class="ayc-lib-main" data-act="expand">
    <div class="ayc-card-title">${esc(e.title)}
      ${e.once ? '<span class="ayc-tag ayc-tag-once"><i class="fa-solid fa-bolt"></i>ครั้งเดียว</span>' : ''}
      ${e.group ? `<span class="ayc-tag"><i class="fa-solid fa-circle-half-stroke"></i>${esc(e.group)}</span>` : ''}
    </div>
    ${e.desc ? `<div class="ayc-lib-desc">${esc(e.desc)}</div>` : ''}
    <div class="ayc-card-text ayc-mono">${esc(e.text)}</div>
  </div>
  <div class="ayc-lib-actions">
    ${addBtn('global', e, gSrc.get(e.key), false)}
    ${addBtn('chat', e, cSrc.get(e.key), !chatOk)}
    ${e.mine ? `<button class="ayc-mini" data-act="lib-edit" title="แก้แม่แบบ"><i class="fa-solid fa-pen"></i></button>
               <button class="ayc-mini ayc-danger" data-act="lib-delete" title="ลบแม่แบบ"><i class="fa-solid fa-trash-can"></i></button>` : ''}
  </div>
</div>`).join('');
        return head + `<div class="ayc-list">${cards}</div>`;
    }).join('');
}

function emptyState(icon, title, text, showLibLink = false) {
    return `
<div class="ayc-empty">
  <div class="ayc-empty-icon"><i class="fa-solid ${icon}"></i></div>
  <div class="ayc-empty-title">${esc(title)}</div>
  ${text ? `<div class="ayc-empty-text">${esc(text)}</div>` : ''}
  ${showLibLink ? '<button class="ayc-btn" data-tab="lib"><i class="fa-solid fa-book-bookmark"></i>เปิดคลังสำเร็จรูป</button>' : ''}
</div>`;
}

// ───────────────────────── sheets ─────────────────────────

function openSheet(html) {
    const $sheet = $root.find('[data-ref="sheet"]');
    $sheet.find('[data-ref="sheet-card"]').html(html);
    $sheet.removeClass('ayc-hidden');
}

function closeSheet() {
    if (!$root) return;
    $root.find('[data-ref="sheet"]').addClass('ayc-hidden');
    ui.editing = null;
}

function sheetHead(icon, title) {
    return `<div class="ayc-sheet-head"><div class="ayc-sheet-title"><i class="fa-solid ${icon}"></i>${esc(title)}</div>
<button class="ayc-icon-btn" data-act="sheet-close"><i class="fa-solid fa-xmark"></i></button></div>`;
}

function openEditor(target) {
    ui.editing = target;
    const s = settings();
    let data = { title: '', text: '', once: false, group: '' };
    let scope = target.scope || 'global';
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

    openSheet(`
${sheetHead(isLib ? 'fa-book-bookmark' : 'fa-pen-to-square', title)}
<div class="ayc-form">
  <label class="ayc-field"><span>ชื่อ (ไว้ดูเอง ไม่ถูกส่งให้โมเดล)</span>
    <input type="text" data-f="title" maxlength="80" value="${esc(data.title)}" placeholder="เช่น ห้ามพูดแทนผู้เล่น"></label>
  <label class="ayc-field"><span>คำสั่ง (ข้อความที่ส่งให้โมเดล — ใช้ {{char}} {{user}} ได้)</span>
    <textarea data-f="text" rows="5" placeholder="Never write {{user}}'s actions…">${esc(data.text)}</textarea></label>
  ${!isLib && isNew ? `
  <div class="ayc-field"><span>เก็บไว้ที่</span>
    <div class="ayc-seg">
      <label><input type="radio" name="ayc-scope" value="global" ${scope === 'global' ? 'checked' : ''}><span><i class="fa-solid fa-earth-asia"></i>ทุกแชท</span></label>
      <label class="${hasChat() ? '' : 'ayc-disabled'}"><input type="radio" name="ayc-scope" value="chat" ${scope === 'chat' ? 'checked' : ''} ${hasChat() ? '' : 'disabled'}><span><i class="fa-solid fa-comment-dots"></i>แชทนี้</span></label>
    </div></div>` : ''}
  <div class="ayc-row">
    <label class="ayc-check"><input type="checkbox" data-f="once" ${data.once ? 'checked' : ''}><span><i class="fa-solid fa-bolt"></i>ใช้ครั้งเดียว <small>ปิดเองหลังบอทตอบ</small></span></label>
  </div>
  <label class="ayc-field"><span>กลุ่ม (ไม่บังคับ) — คำสั่งกลุ่มเดียวกันเปิดได้ทีละอัน</span>
    <input type="text" data-f="group" list="ayc-groups" maxlength="30" value="${esc(data.group)}" placeholder="เช่น length, pace, pov">
    <datalist id="ayc-groups">${groups.map(g => `<option value="${esc(g)}">`).join('')}</datalist></label>
  ${!isLib ? `<label class="ayc-check"><input type="checkbox" data-f="toLib"><span><i class="fa-solid fa-book-bookmark"></i>บันทึกเป็นแม่แบบในคลังด้วย</span></label>` : ''}
</div>
<div class="ayc-sheet-foot">
  <button class="ayc-btn ayc-btn-ghost" data-act="sheet-close">ยกเลิก</button>
  <button class="ayc-btn ayc-btn-primary" data-act="editor-save"><i class="fa-solid fa-check"></i>บันทึก</button>
</div>`);

    const $card = $root.find('[data-ref="sheet-card"]');
    $card.off('click.ed').on('click.ed', '[data-act="editor-save"]', () => saveEditor($card));
    setTimeout(() => $card.find(isNew ? '[data-f="title"]' : '[data-f="text"]').trigger('focus'), 50);
}

function saveEditor($card) {
    const t = ui.editing;
    if (!t) return;
    const val = (f) => $card.find(`[data-f="${f}"]`);
    const title = String(val('title').val() || '').trim();
    const text = String(val('text').val() || '').trim();
    const once = val('once').is(':checked');
    const group = String(val('group').val() || '').trim();
    if (!text) { toastr.warning('ใส่ข้อความคำสั่งก่อน'); return; }
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
            const scope = $card.find('input[name="ayc-scope"]:checked').val() || t.scope || 'global';
            const item = { id: uid(), title: finalTitle, text, enabled: true, once, group, src: libId ? 'm:' + libId : '' };
            if (!addItem(scope, item)) return;
            ui.tab = scope;
        }
    }
    closeSheet();
    render();
}

function openSettingsSheet() {
    const s = settings();
    openSheet(`
${sheetHead('fa-sliders', 'ตั้งค่าการส่งคำสั่ง')}
<div class="ayc-form">
  <label class="ayc-field"><span>ตำแหน่งที่แทรก</span>
    <select data-s="position">
      <option value="1" ${Number(s.position) === 1 ? 'selected' : ''}>ในแชท @ ความลึก (แนะนำ)</option>
      <option value="0" ${Number(s.position) === 0 ? 'selected' : ''}>ต่อท้าย prompt หลัก</option>
      <option value="2" ${Number(s.position) === 2 ? 'selected' : ''}>ก่อน prompt หลัก</option>
    </select></label>
  <div class="ayc-row ayc-row-2">
    <label class="ayc-field"><span>ความลึก (depth)</span>
      <input type="number" data-s="depth" min="0" max="50" value="${Number(s.depth)}"></label>
    <label class="ayc-field"><span>ส่งในนาม (role)</span>
      <select data-s="role">
        <option value="0" ${Number(s.role) === 0 ? 'selected' : ''}>System</option>
        <option value="1" ${Number(s.role) === 1 ? 'selected' : ''}>User</option>
        <option value="2" ${Number(s.role) === 2 ? 'selected' : ''}>Assistant</option>
      </select></label>
  </div>
  <div class="ayc-hint"><i class="fa-solid fa-lightbulb"></i>depth 0 = หลังข้อความล่าสุด แรงสุดแต่บอทอาจตอบสนองคำสั่งตรงๆ · 2–4 สมดุลที่สุด · ลึกเกิน 6 เริ่มลืม</div>
  <label class="ayc-field"><span>แม่แบบห่อคำสั่ง — <code>{{list}}</code> คือที่วางรายการ</span>
    <textarea data-s="template" rows="4">${esc(s.template)}</textarea></label>
  <button class="ayc-link" data-act="tpl-reset"><i class="fa-solid fa-rotate-left"></i>คืนค่าแม่แบบเริ่มต้น</button>
  <label class="ayc-check"><input type="checkbox" data-s="skipQuiet" ${s.skipQuiet ? 'checked' : ''}><span><i class="fa-solid fa-ghost"></i>ไม่ส่งตอน generate เบื้องหลัง <small>เช่น สรุปความจำ ของ extension อื่น</small></span></label>
  <div class="ayc-divider"></div>
  <div class="ayc-field"><span>สำรอง / ย้ายเครื่อง (ลิสต์ทุกแชท + คลังของฉัน)</span>
    <div class="ayc-row">
      <button class="ayc-btn" data-act="export"><i class="fa-solid fa-file-export"></i>ส่งออก</button>
      <button class="ayc-btn" data-act="import"><i class="fa-solid fa-file-import"></i>นำเข้า</button>
      <input type="file" accept=".json,application/json" data-ref="import-file" hidden>
    </div></div>
</div>`);

    const $card = $root.find('[data-ref="sheet-card"]');
    $card.off('.st');
    $card.on('change.st input.st', '[data-s]', function () {
        const k = $(this).data('s');
        let v = this.type === 'checkbox' ? this.checked : $(this).val();
        if (k === 'depth') v = Math.max(0, Math.min(50, parseInt(v) || 0));
        if (k === 'position' || k === 'role') v = Number(v);
        s[k] = v;
        ctx().saveSettingsDebounced();
        applyInjection();
        renderStatus();
    });
    $card.on('click.st', '[data-act="tpl-reset"]', () => {
        s.template = DEFAULT_TEMPLATE;
        $card.find('[data-s="template"]').val(DEFAULT_TEMPLATE);
        ctx().saveSettingsDebounced();
        applyInjection();
    });
    $card.on('click.st', '[data-act="export"]', exportData);
    $card.on('click.st', '[data-act="import"]', () => $card.find('[data-ref="import-file"]').trigger('click'));
    $card.on('change.st', '[data-ref="import-file"]', function () {
        const f = this.files?.[0];
        if (f) importData(f);
        this.value = '';
    });
}

async function openPreviewSheet() {
    const raw = buildPrompt();
    const shown = raw ? ctx().substituteParams(raw) : '';
    let tokens = '';
    if (shown && typeof ctx().getTokenCountAsync === 'function') {
        try { tokens = `≈ ${await ctx().getTokenCountAsync(shown)} tokens`; } catch { /* ignore */ }
    }
    const s = settings();
    const where = Number(s.position) === POS.IN_CHAT ? `ในแชท ความลึก ${s.depth}` : (Number(s.position) === POS.IN_PROMPT ? 'ต่อท้าย prompt หลัก' : 'ก่อน prompt หลัก');
    openSheet(`
${sheetHead('fa-eye', 'สิ่งที่โมเดลจะเห็น')}
<div class="ayc-meta"><span><i class="fa-solid fa-location-crosshairs"></i>${esc(where)}</span>${tokens ? `<span><i class="fa-solid fa-coins"></i>${esc(tokens)}</span>` : ''}</div>
${shown ? `<pre class="ayc-preview">${esc(shown)}</pre>` : emptyState('fa-moon', s.enabled ? 'ยังไม่มีคำสั่งที่เปิดอยู่' : 'ส่วนขยายปิดอยู่', 'ตอนนี้ไม่มีอะไรถูกแทรกเข้า prompt')}
<div class="ayc-sheet-foot">
  ${shown ? '<button class="ayc-btn" data-act="copy-preview"><i class="fa-solid fa-copy"></i>คัดลอก</button>' : ''}
  <button class="ayc-btn ayc-btn-primary" data-act="sheet-close">เรียบร้อย</button>
</div>`);
    const $card = $root.find('[data-ref="sheet-card"]');
    $card.off('click.pv').on('click.pv', '[data-act="copy-preview"]', async () => {
        try { await navigator.clipboard.writeText(shown); toastr.success('คัดลอกแล้ว', '', { timeOut: 1200 }); }
        catch { toastr.error('คัดลอกไม่ได้'); }
    });
}

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

async function confirmBox(text) {
    const c = ctx();
    if (typeof c.callGenericPopup === 'function' && c.POPUP_TYPE) {
        const r = await c.callGenericPopup(esc(text), c.POPUP_TYPE.CONFIRM, '', { okButton: 'ลบ', cancelButton: 'ยกเลิก' });
        return !!r;
    }
    return window.confirm(text);
}

// ───────────────────────── wand menu + settings drawer ─────────────────────────

function updateWandBadge() {
    const n = settings().enabled ? activeItems().length : 0;
    $('#ayc_wand .ayc-wand-badge').text(n || '').toggle(n > 0);
}

function mountMenus() {
    const $wand = $(`
<div id="ayc_wand" class="list-group-item flex-container flexGap5 interactable" tabindex="0" title="คลังคำสั่ง OOC">
  <div class="fa-solid fa-scroll extensionsMenuExtensionButton"></div>
  <span>As you command</span><b class="ayc-wand-badge"></b>
</div>`);
    $wand.on('click', openOverlay);
    $('#extensionsMenu').append($wand);

    const $panel = $(`
<div class="ayc-settings-panel">
  <div class="inline-drawer">
    <div class="inline-drawer-toggle inline-drawer-header">
      <b><i class="fa-solid fa-scroll"></i> As you command</b>
      <div class="inline-drawer-icon fa-solid fa-circle-chevron-down down"></div>
    </div>
    <div class="inline-drawer-content">
      <small>คลังคำสั่ง OOC ติ๊กเปิด/ปิดได้ คำสั่งที่เปิดจะถูกแทรกทุกเทิร์น บอทจึงไม่ลืม — เปิดแผงได้จากเมนู 🪄 หรือพิมพ์ <code>/ayc</code></small>
      <label class="checkbox_label"><input type="checkbox" id="ayc_enabled_cb"><span>เปิดใช้งาน</span></label>
      <div class="menu_button menu_button_icon" id="ayc_open_btn"><i class="fa-solid fa-scroll"></i><span>เปิดแผงคำสั่ง</span></div>
    </div>
  </div>
</div>`);
    $panel.find('#ayc_enabled_cb').prop('checked', settings().enabled).on('change', function () {
        settings().enabled = this.checked;
        ctx().saveSettingsDebounced();
        applyInjection();
        refresh();
    });
    $panel.find('#ayc_open_btn').on('click', openOverlay);
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

jQuery(async () => {
    try {
        settings();
        mountMenus();
        registerCommands();

        const { eventSource, eventTypes } = ctx();
        eventSource.on(eventTypes.CHAT_CHANGED, () => { pendingOnce = null; applyInjection(); refresh(); });
        eventSource.on(eventTypes.GENERATION_AFTER_COMMANDS, onAfterCommands);
        eventSource.on(eventTypes.MESSAGE_RECEIVED, onMessageReceived);
        eventSource.on(eventTypes.GENERATION_STOPPED, () => { pendingOnce = null; });
        eventSource.on(eventTypes.GENERATION_ENDED, () => applyInjection());

        applyInjection();
        updateWandBadge();
        console.log(LOG, 'loaded');
    } catch (err) {
        console.error(LOG, 'failed to load', err);
    }
});
