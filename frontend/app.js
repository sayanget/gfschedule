// Classic App Logic - Reverted & Fixed
function isHttpBackendPage() {
    return typeof window !== 'undefined' &&
        (window.location.protocol === 'http:' || window.location.protocol === 'https:');
}

function safeLoadData() {
    const fallback = (typeof initialData !== 'undefined' ? initialData : []);
    try {
        const raw = localStorage.getItem('laborData');
        if (!raw) return fallback;
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : fallback;
    } catch (err) {
        console.warn('Failed to parse laborData from localStorage, fallback to initial data.', err);
        return fallback;
    }
}

const state = {
    data: [],
    historyData: null,
    currentHistoryId: '',
    currentAccountSet: 'CNO.H',
    currentCompany: 'ALL',
    currentPayType: 'ALL',
    shiftQuery: '',
    shiftQueries: [],
    searchQuery: '',
    currentHistorySavedAt: '',
    currentUser: (() => {
        try {
            return localStorage.getItem('currentUser') || '';
        } catch {
            return '';
        }
    })(),
    users: [],
    hasUnsavedChanges: false
};

const USERS_STORAGE_KEY = 'scheduleUsers';
const ACCOUNT_SETS = ['CNO.H', 'SFO.H'];
const MAX_LOGIN_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const RESET_PASSWORD_DEFAULT = '123456';
const DEFAULT_USERS = [{
    username: 'admin',
    password: 'admin',
    role: 'admin',
    canEditPlan: true,
    canEditActual: true,
    accountSets: [...ACCOUNT_SETS],
    enabled: true,
    failedLoginCount: 0,
    lockedUntil: 0
}];

const elements = {
    scheduleTable: document.getElementById('schedule-table'),
    loginAccountSet: document.getElementById('login-account-set'),
    companyFilter: document.getElementById('company-filter'),
    shiftSearchInput: document.getElementById('shift-search-input'),
    shiftPickerBtn: document.getElementById('shift-picker-btn'),
    shiftSelectedTags: document.getElementById('shift-selected-tags'),
    searchInput: document.getElementById('search-input'),
    rolePickerBtn: document.getElementById('role-picker-btn'),
    payTypeFilter: document.getElementById('pay-type-filter'),
    historySelect: document.getElementById('history-select'),
    btnHistoryLoad: document.getElementById('btn-history-load'),
    btnHistoryClear: document.getElementById('btn-history-clear'),
    dateFilterContainer: document.getElementById('date-columns-filter'),
    btnDaysSelectAll: document.getElementById('btn-days-select-all'),
    btnDaysClearAll: document.getElementById('btn-days-clear-all'),
    statTotal: document.getElementById('stat-total'),
    statTotalActual: document.getElementById('stat-total-actual'),
    statTotalDiff: document.getElementById('stat-total-diff'),
    btnExport: document.getElementById('btn-export'),
    btnSaveRecords: document.getElementById('btn-save-records'),
    btnScreenshot: document.getElementById('btn-screenshot-mode'),
    loginModal: document.getElementById('login-modal'),
    loginUsername: document.getElementById('login-username'),
    loginPassword: document.getElementById('login-password'),
    btnLogin: document.getElementById('btn-login'),
    btnLogout: document.getElementById('btn-logout'),
    btnChangePassword: document.getElementById('btn-change-password'),
    btnUserMgmt: document.getElementById('btn-user-mgmt'),
    currentUserAvatar: document.getElementById('current-user-avatar'),
    screenshotExit: document.getElementById('screenshot-exit'),
    btnAddRecord: document.getElementById('btn-add-record'),
    addRecordModal: document.getElementById('add-record-modal'),
    addCompany: document.getElementById('add-company'),
    addShift: document.getElementById('add-shift'),
    addRole: document.getElementById('add-role'),
    addNote: document.getElementById('add-note'),
    addRecordSubmit: document.getElementById('add-record-submit'),
    addRecordCancel: document.getElementById('add-record-cancel'),
    storageLocationHint: document.getElementById('storage-location-hint'),
    scheduleTableScroll: document.getElementById('schedule-table-scroll'),
    scheduleHscrollRail: document.getElementById('schedule-hscroll-rail'),
    scheduleHscrollSpacer: document.getElementById('schedule-hscroll-spacer'),
    userMgmtModal: document.getElementById('user-mgmt-modal'),
    userListBody: document.getElementById('user-list-body'),
    userAddUsername: document.getElementById('user-add-username'),
    userAddPassword: document.getElementById('user-add-password'),
    userAddAccountCno: document.getElementById('user-add-account-cno'),
    userAddAccountSfo: document.getElementById('user-add-account-sfo'),
    userAddCanPlan: document.getElementById('user-add-can-plan'),
    userAddCanActual: document.getElementById('user-add-can-actual'),
    userAddSubmit: document.getElementById('user-add-submit'),
    userMgmtClose: document.getElementById('user-mgmt-close'),
    changePasswordModal: document.getElementById('change-password-modal'),
    changeOldPassword: document.getElementById('change-old-password'),
    changeNewPassword: document.getElementById('change-new-password'),
    changeConfirmPassword: document.getElementById('change-confirm-password'),
    changePasswordCancel: document.getElementById('change-password-cancel'),
    changePasswordSubmit: document.getElementById('change-password-submit'),
    changeReasonModal: document.getElementById('change-reason-modal'),
    changeReasonModalBody: document.getElementById('change-reason-modal-body'),
    changeReasonModalClose: document.getElementById('change-reason-modal-close')
};

let _scheduleHscrollMirroring = false;
let _scheduleHscrollBindDone = false;

function syncScheduleHscrollRailDock() {
    const pane = elements.scheduleTableScroll;
    const rail = elements.scheduleHscrollRail;
    if (!pane || !rail) return;
    const r = pane.getBoundingClientRect();
    const left = Math.max(0, r.left);
    const w = Math.max(0, r.width);
    rail.style.left = `${left}px`;
    rail.style.width = `${w}px`;
}

function bindScheduleHorizontalScrollOnce() {
    if (_scheduleHscrollBindDone) return;
    const pane = elements.scheduleTableScroll;
    const rail = elements.scheduleHscrollRail;
    const spacer = elements.scheduleHscrollSpacer;
    const table = elements.scheduleTable;
    if (!pane || !rail || !spacer || !table) return;
    _scheduleHscrollBindDone = true;

    const mirrorPaneToRail = () => {
        if (_scheduleHscrollMirroring) return;
        _scheduleHscrollMirroring = true;
        rail.scrollLeft = pane.scrollLeft;
        queueMicrotask(() => {
            _scheduleHscrollMirroring = false;
        });
    };

    pane.addEventListener('scroll', mirrorPaneToRail, { passive: true });
    rail.addEventListener(
        'scroll',
        () => {
            if (_scheduleHscrollMirroring) return;
            _scheduleHscrollMirroring = true;
            pane.scrollLeft = rail.scrollLeft;
            queueMicrotask(() => {
                _scheduleHscrollMirroring = false;
            });
        },
        { passive: true }
    );
    window.addEventListener(
        'resize',
        () => queueMicrotask(() => refreshScheduleHorizontalScroll()),
        { passive: true }
    );
    window.addEventListener(
        'scroll',
        () => queueMicrotask(() => syncScheduleHscrollRailDock()),
        { passive: true }
    );
    if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => refreshScheduleHorizontalScroll());
        ro.observe(pane);
        ro.observe(table);
    }
}

/** 底部拉杆固定视口；占位宽度与 .schedule-table-scroll 同步；内层滚动条仍隐藏 */
function refreshScheduleHorizontalScroll() {
    const pane = elements.scheduleTableScroll;
    const rail = elements.scheduleHscrollRail;
    const spacer = elements.scheduleHscrollSpacer;
    const table = elements.scheduleTable;
    if (!pane || !rail || !spacer || !table) return;

    syncScheduleHscrollRailDock();

    const paneW = pane.clientWidth;
    const contentW = Math.max(table.scrollWidth || 0, pane.scrollWidth || 0);
    spacer.style.width = `${Math.max(contentW, paneW)}px`;

    if (_scheduleHscrollMirroring) return;
    _scheduleHscrollMirroring = true;
    rail.scrollLeft = pane.scrollLeft;
    queueMicrotask(() => {
        _scheduleHscrollMirroring = false;
    });
}

function updateStorageLocationHint() {
    const el = elements.storageLocationHint;
    if (!el) return;
    el.hidden = true;
    el.textContent = '';
}

function normalizeUsername(name) {
    return String(name || '').trim();
}

function normalizeAccountSet(raw) {
    const text = String(raw || '').trim().toUpperCase();
    return text === 'SFO.H' ? 'SFO.H' : 'CNO.H';
}

function normalizeUserAccountSets(rawSets, role) {
    if (role === 'admin') return [...ACCOUNT_SETS];
    const arr = Array.isArray(rawSets) ? rawSets : [];
    const cleaned = [...new Set(arr.map(normalizeAccountSet))].filter((s) => ACCOUNT_SETS.includes(s));
    return cleaned.length ? cleaned : ['CNO.H'];
}

/** 登录输入与存储密码 NFC + trim，减轻手机输入法全角/兼容字符导致的「密码不对」误判 */
function normalizeLoginCredential(raw) {
    let s = String(raw ?? '');
    if (typeof s.normalize === 'function') s = s.normalize('NFKC');
    return s.trim().replace(/\u3000/g, '');
}

function normalizeStoredUserArray(parsed) {
    if (!Array.isArray(parsed)) return [];
    return parsed
        .map((u) => ({
            username: normalizeUsername(u.username),
            password: String(u.password || ''),
            role: u.role === 'admin' ? 'admin' : 'user',
            canEditPlan: !!u.canEditPlan,
            canEditActual: !!u.canEditActual,
            accountSets: normalizeUserAccountSets(u.accountSets, u.role === 'admin' ? 'admin' : 'user'),
            enabled: u.enabled !== false,
            failedLoginCount: Number.isFinite(Number(u.failedLoginCount)) ? Number(u.failedLoginCount) : 0,
            lockedUntil: Number.isFinite(Number(u.lockedUntil)) ? Number(u.lockedUntil) : 0
        }))
        .filter((u) => !!u.username);
}

function loadUsers() {
    try {
        const raw = localStorage.getItem(USERS_STORAGE_KEY);
        if (!raw) return [...DEFAULT_USERS];
        const parsed = JSON.parse(raw);
        const cleaned = normalizeStoredUserArray(parsed);
        return cleaned.length ? cleaned : [...DEFAULT_USERS];
    } catch (err) {
        console.warn('Failed to parse users from localStorage, fallback to defaults.', err);
        return [...DEFAULT_USERS];
    }
}

let _scheduleUsersPushTimer = null;

function pushScheduleUsersToServerOnce() {
    if (!isHttpBackendPage() || !Array.isArray(state.users) || !state.users.length) return;
    fetch('/api/schedule-users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json;charset=utf-8' },
        body: JSON.stringify(state.users),
        credentials: 'same-origin',
        cache: 'no-store',
    }).catch((e) => console.warn('[schedule-users] 同步到服务器失败', e));
}

function schedulePushScheduleUsersToServer() {
    if (!isHttpBackendPage()) return;
    clearTimeout(_scheduleUsersPushTimer);
    _scheduleUsersPushTimer = setTimeout(() => {
        _scheduleUsersPushTimer = null;
        pushScheduleUsersToServerOnce();
    }, 80);
}

function saveUsers() {
    try {
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(state.users));
    } catch (err) {
        console.warn('无法写入浏览器用户列表缓存（如隐私模式）', err);
    }
    schedulePushScheduleUsersToServer();
}

/**
 * HTTP 模式下从 SQLite（kv.scheduleUsers）拉取与各终端共用的账号库；
 * 若服务器尚无数据则用本机 localStorage（或默认）并回写服务端，避免手机与电脑各用各的 localStorage 导致密码不一致。
 */
async function hydrateScheduleUsersBeforeInit() {
    if (!isHttpBackendPage()) {
        state.users = loadUsers();
        return;
    }
    try {
        const r = await fetch('/api/schedule-users', { cache: 'no-store' });
        if (!r.ok) {
            state.users = loadUsers();
            return;
        }
        const data = await r.json();
        const hasServerUsers = Array.isArray(data) && data.length > 0;
        if (hasServerUsers) {
            const nu = normalizeStoredUserArray(data);
            state.users = nu.length ? nu : loadUsers();
        } else {
            state.users = loadUsers();
            pushScheduleUsersToServerOnce();
        }
    } catch (e) {
        console.warn('从服务器读取用户列表失败，使用本机数据。', e);
        state.users = loadUsers();
    }
    try {
        localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(state.users));
    } catch {
        /* ignore */
    }
}

function getLockRemainMs(user) {
    const lockedUntil = Number(user && user.lockedUntil ? user.lockedUntil : 0);
    return Math.max(0, lockedUntil - Date.now());
}

function formatLockRemain(ms) {
    const totalSec = Math.ceil(ms / 1000);
    const mm = Math.floor(totalSec / 60);
    const ss = totalSec % 60;
    return `${mm}分${ss}秒`;
}

function getCurrentUserProfile() {
    const username = normalizeUsername(state.currentUser);
    if (!username) return null;
    return state.users.find((u) => u.username === username) || null;
}

function getAllowedAccountSets(profile = getCurrentUserProfile()) {
    if (!profile) return ['CNO.H'];
    return normalizeUserAccountSets(profile.accountSets, profile.role);
}

function isCurrentUserAdmin() {
    const profile = getCurrentUserProfile();
    return !!profile && profile.role === 'admin';
}

function canEditPlan() {
    if (isViewingHistory()) return false;
    const profile = getCurrentUserProfile();
    if (!profile || profile.enabled === false) return false;
    return profile.role === 'admin' || !!profile.canEditPlan;
}

function canEditActual() {
    if (isViewingHistory()) return false;
    const profile = getCurrentUserProfile();
    if (!profile || profile.enabled === false) return false;
    return profile.role === 'admin' || !!profile.canEditActual;
}

/** 计薪类型、备注：与计划/实到同属业务编辑，至少需具备其一（管理员已由 canEdit* 覆盖） */
function canEditPayTypeAndNote() {
    return canEditPlan() || canEditActual();
}

function applyAuthUi() {
    const profile = getCurrentUserProfile();
    if (!profile) {
        elements.loginModal.classList.add('active');
        elements.currentUserAvatar.innerText = '未登录';
        if (elements.btnUserMgmt) elements.btnUserMgmt.style.display = 'none';
        if (elements.btnChangePassword) elements.btnChangePassword.style.display = 'none';
        syncLoginAccountSetOptions();
        return;
    }
    if (profile.enabled === false) {
        state.currentUser = '';
        localStorage.removeItem('currentUser');
        elements.loginModal.classList.add('active');
        elements.currentUserAvatar.innerText = '未登录';
        if (elements.btnUserMgmt) elements.btnUserMgmt.style.display = 'none';
        if (elements.btnChangePassword) elements.btnChangePassword.style.display = 'none';
        syncLoginAccountSetOptions();
        return;
    }
    elements.loginModal.classList.remove('active');
    elements.currentUserAvatar.innerText = profile.username;
    if (elements.btnUserMgmt) elements.btnUserMgmt.style.display = profile.role === 'admin' ? 'inline-block' : 'none';
    if (elements.btnChangePassword) elements.btnChangePassword.style.display = 'inline-block';
}

function init() {
    if (!Array.isArray(state.users) || !state.users.length) {
        state.users = loadUsers();
    }
    const profile = getCurrentUserProfile();
    if (!profile) {
        state.currentUser = '';
        localStorage.removeItem('currentUser');
    }
    checkAuth();
    updateStorageLocationHint();
    populateCompanyFilter();
    refreshHistoryOptions();
    renderSelectedShiftTags();
    bindScheduleHorizontalScrollOnce();
    renderTable();
    setupEventListeners();
    syncSaveButtonState();
}

function syncLoginAccountSetOptions() {
    if (!elements.loginAccountSet) return;
    const select = elements.loginAccountSet;
    select.innerHTML = '';
    ACCOUNT_SETS.forEach((set) => {
        const opt = document.createElement('option');
        opt.value = set;
        opt.textContent = set;
        select.appendChild(opt);
    });
    const saved = localStorage.getItem('currentAccountSet');
    const normalized = saved ? normalizeAccountSet(saved) : state.currentAccountSet;
    select.value = ACCOUNT_SETS.includes(normalized) ? normalized : 'CNO.H';
}

async function switchAccountSet(nextSet, forceReload = false) {
    const targetSet = normalizeAccountSet(nextSet);
    const allowed = getAllowedAccountSets();
    if (!allowed.includes(targetSet)) {
        alert('当前用户无该账套访问权限。');
        return;
    }
    await _persistLaborChain;
    if (!forceReload && state.currentAccountSet === targetSet) return;
    if (state.hasUnsavedChanges) {
        const ok = window.confirm(
            '仍有数据未能写入服务器数据库（可多终端稍后重试）。确定切换账套吗？'
        );
        if (!ok) return;
    }
    state.currentAccountSet = targetSet;
    localStorage.setItem('currentAccountSet', targetSet);
    state.currentCompany = 'ALL';
    state.currentPayType = 'ALL';
    state.shiftQuery = '';
    state.shiftQueries = [];
    state.searchQuery = '';
    state.historyData = null;
    state.currentHistoryId = '';
    state.hasUnsavedChanges = false;
    if (elements.companyFilter) elements.companyFilter.value = 'ALL';
    if (elements.payTypeFilter) elements.payTypeFilter.value = 'ALL';
    if (elements.shiftSearchInput) elements.shiftSearchInput.value = '';
    if (elements.searchInput) elements.searchInput.value = '';
    if (elements.historySelect) elements.historySelect.value = '';
    try {
        const rows = await window.scheduleDb.loadScheduleData(targetSet);
        state.data = Array.isArray(rows) ? rows : [];
        ensureLaborRowUids(state.data);
        normalizeLaborRowsPayType(state.data);
        populateCompanyFilter();
        renderSelectedShiftTags();
        await refreshHistoryOptions();
        renderTable();
        syncSaveButtonState();
    } catch (err) {
        console.error(err);
        alert('切换账套失败：' + (err && err.message ? err.message : String(err)));
    }
}

function getActiveRows() {
    if (String(state.currentHistoryId || '').trim() !== '' && Array.isArray(state.historyData)) {
        return state.historyData;
    }
    return state.data;
}

function isViewingHistory() {
    return String(state.currentHistoryId || '').trim() !== '';
}

/** 备注写入数据库前去掉 NUL，避免部分客户端或查看工具异常截断 */
function sanitizeNoteForDb(raw) {
    return String(raw ?? '').replace(/\u0000/g, '');
}

function getRowNote(row) {
    return String(row['备注'] ?? row['单位/备注'] ?? '').trim();
}

function getChangeReason(row) {
    return String(row['变化原因'] || '').trim();
}

function openChangeReasonModal(text) {
    if (!elements.changeReasonModal || !elements.changeReasonModalBody) return;
    elements.changeReasonModalBody.textContent = text || '(无)';
    elements.changeReasonModal.classList.add('active');
}

function closeChangeReasonModal() {
    if (!elements.changeReasonModal) return;
    elements.changeReasonModal.classList.remove('active');
    if (elements.changeReasonModalBody) elements.changeReasonModalBody.textContent = '';
}

function appendPlanChangeReason(row, day, oldValue, newValue, reasonText) {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const dateText = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
    const record = `${dateText} ${day} 计划 ${oldValue}→${newValue}：${reasonText.trim()}`;
    const existing = getChangeReason(row);
    row['变化原因'] = existing ? `${record} | ${existing}` : record;
}

/** 各日「计划」「实到」与库字段一致：按人数存、按人数显示（1:1），不按备注还原「组数」或做 ÷8 折算，避免出现小数或非整数组表示。 */

function getRawDayValue(row, day, type) {
    const key = type === 'actual' ? `${day}_实到` : day;
    return parseFloat(row[key]) || 0;
}

function getDisplayDayValue(row, day, type) {
    return getRawDayValue(row, day, type);
}

function setRawDayValueFromDisplay(row, day, type, displayValue) {
    const key = type === 'actual' ? `${day}_实到` : day;
    const numeric = parseFloat(displayValue) || 0;
    row[key] = numeric;
}

/** 统一「计时 / 计件」，避免全角空格或 Unicode 规范化差异导致保存成计时 */
function normalizePayType(raw) {
    let s = String(raw ?? '').trim().replace(/\u3000/g, '');
    if (typeof s.normalize === 'function') s = s.normalize('NFKC');
    const lower = s.toLowerCase();
    if (s === '计件' || s === '計件' || lower === 'piece' || lower === 'piecework') return '计件';
    return '计时';
}

function normalizeLaborRowsPayType(rows) {
    if (!Array.isArray(rows)) return;
    rows.forEach((row) => {
        if (!row || typeof row !== 'object') return;
        row['计薪类型'] = normalizePayType(row['计薪类型']);
    });
}

function generateLaborRowUid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `r-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

/** 每行稳定 ID，避免筛选/排序后用 indexOf 改错行导致保存丢失（如计薪类型） */
function ensureLaborRowUids(rows) {
    if (!Array.isArray(rows)) return;
    rows.forEach((row) => {
        if (!row || typeof row !== 'object') return;
        const u = String(row._rowUid || row.row_uid || '').trim();
        if (u) {
            row._rowUid = u;
            return;
        }
        row._rowUid = generateLaborRowUid();
    });
}

function findDataRowByUid(uid) {
    const id = String(uid || '').trim();
    if (!id) return null;
    const rows = getActiveRows();
    return rows.find((r) => r && String(r._rowUid || '').trim() === id) || null;
}

function syncSaveButtonState() {
    if (!elements.btnSaveRecords) return;
    const profile = getCurrentUserProfile();
    if (!profile || profile.enabled === false) {
        elements.btnSaveRecords.disabled = true;
        elements.btnSaveRecords.innerHTML = '<i class="ri-save-3-line"></i> 请先登录后保存';
        return;
    }
    if (!canEditPlan() && !canEditActual()) {
        elements.btnSaveRecords.disabled = true;
        elements.btnSaveRecords.innerHTML = '<i class="ri-lock-line"></i> 无排班编辑权限';
        return;
    }
    if (isViewingHistory()) {
        elements.btnSaveRecords.disabled = true;
        elements.btnSaveRecords.innerHTML = '<i class="ri-history-line"></i> 历史模式不可保存';
        return;
    }
    elements.btnSaveRecords.disabled = false;
    elements.btnSaveRecords.innerHTML = state.hasUnsavedChanges
        ? '<i class="ri-error-warning-line"></i> 写入失败，点击重试'
        : '<i class="ri-database-2-line"></i> 已写入数据库';
}

/** 串行执行，避免并发 PUT 互相覆盖 */
let _persistLaborChain = Promise.resolve();
let _lastLaborPersistErrorAlert = 0;

function enqueuePersistLaborToDb() {
    if (isViewingHistory()) return;
    const profile = getCurrentUserProfile();
    if (!profile || profile.enabled === false) return;
    if (!canEditPlan() && !canEditActual()) return;
    state.hasUnsavedChanges = true;
    syncSaveButtonState();
    _persistLaborChain = _persistLaborChain.then(() => persistLaborToServerOnce());
}

let _debouncedNotePersistTimer = null;

/** 备注连续输入时防抖写入数据库（停止输入约 0.55s 后 PUT） */
function scheduleDebouncedNotePersist(textarea, rowUid) {
    if (isViewingHistory()) return;
    if (!canEditPayTypeAndNote()) return;
    const row = findDataRowByUid(rowUid);
    if (!row || !textarea) return;
    row['备注'] = sanitizeNoteForDb(textarea.value);
    clearTimeout(_debouncedNotePersistTimer);
    _debouncedNotePersistTimer = setTimeout(() => {
        _debouncedNotePersistTimer = null;
        enqueuePersistLaborToDb();
    }, 550);
}

async function persistLaborToServerOnce() {
    try {
        flushPendingNoteInputs();
        flushPendingRoleInputs();
        flushPendingShiftInputs();
        flushPendingPayTypeSelects();
        flushPendingDayInputs();
        ensureLaborRowUids(state.data);
        normalizeLaborRowsPayType(state.data);
        await window.scheduleDb.saveLaborDataToDb(state.data, state.currentAccountSet);
        state.hasUnsavedChanges = false;
        _lastLaborPersistErrorAlert = 0;
        syncSaveButtonState();
        await refreshHistoryOptions();
    } catch (err) {
        console.error(err);
        state.hasUnsavedChanges = true;
        syncSaveButtonState();
        const now = Date.now();
        if (now - _lastLaborPersistErrorAlert > 4000) {
            _lastLaborPersistErrorAlert = now;
            alert('写入数据库失败：' + (err && err.message ? err.message : String(err)));
        }
    }
}

function flushPendingNoteInputs() {
    const inputs = document.querySelectorAll('.note-input[data-row-uid]');
    inputs.forEach((input) => {
        const rowUid = String(input.getAttribute('data-row-uid') || '').trim();
        if (!rowUid) return;
        const row = findDataRowByUid(rowUid);
        if (!row) return;
        row['备注'] = sanitizeNoteForDb(input.value);
    });
}

function flushPendingRoleInputs() {
    const inputs = document.querySelectorAll('.role-edit-input[data-row-uid]');
    inputs.forEach((input) => {
        const rowUid = String(input.getAttribute('data-row-uid') || '').trim();
        if (!rowUid) return;
        const row = findDataRowByUid(rowUid);
        if (!row) return;
        row['岗位/工作内容'] = String(input.value ?? '').replace(/\u0000/g, '').trim();
    });
}

function flushPendingShiftInputs() {
    const inputs = document.querySelectorAll('.shift-edit-input[data-row-uid]');
    inputs.forEach((input) => {
        const rowUid = String(input.getAttribute('data-row-uid') || '').trim();
        if (!rowUid) return;
        const row = findDataRowByUid(rowUid);
        if (!row) return;
        row['班次名称'] = String(input.value || '').trim() || '常规班次';
    });
}

function flushPendingPayTypeSelects() {
    const selects = document.querySelectorAll('.pay-type-select[data-row-uid]');
    selects.forEach((selectEl) => {
        const rowUid = String(selectEl.getAttribute('data-row-uid') || '').trim();
        if (!rowUid) return;
        const row = findDataRowByUid(rowUid);
        if (!row) return;
        row['计薪类型'] = normalizePayType(selectEl.value);
    });
}

function flushPendingDayInputs() {
    const inputs = document.querySelectorAll('.plan-input[data-row-uid][data-day], .actual-input[data-row-uid][data-day]');
    inputs.forEach((input) => {
        const rowUid = String(input.getAttribute('data-row-uid') || '').trim();
        const day = String(input.getAttribute('data-day') || '').trim();
        const value = parseFloat(input.value) || 0;
        if (!rowUid || !day) return;
        const row = findDataRowByUid(rowUid);
        if (!row) return;
        if (input.classList.contains('actual-input')) {
            setRawDayValueFromDisplay(row, day, 'actual', value);
            return;
        }
        setRawDayValueFromDisplay(row, day, 'plan', value);
    });
}

async function saveChanges() {
    if (isViewingHistory()) {
        alert('当前为历史查看模式，无法保存。请先点击“回到最新”。');
        return;
    }
    const profile = getCurrentUserProfile();
    if (!profile || profile.enabled === false) {
        alert('请先登录后再保存。');
        return;
    }
    if (!canEditPlan() && !canEditActual()) {
        alert('当前账号无排班编辑权限。');
        return;
    }
    await _persistLaborChain;
    await persistLaborToServerOnce();
}

function formatHistoryLabel(item) {
    const ts = String(item && item.saved_at ? item.saved_at : '');
    const id = item && item.id ? `#${item.id}` : '';
    return ts ? `${ts} ${id}`.trim() : id || '历史记录';
}

async function refreshHistoryOptions() {
    if (!elements.historySelect) return;
    const select = elements.historySelect;
    const oldValue = select.value;
    select.innerHTML = '<option value="">最新数据</option>';
    if (!window.scheduleDb.isBackendMode()) return;
    try {
        const list = await window.scheduleDb.loadLaborHistoryList(state.currentAccountSet);
        list.forEach((item) => {
            const opt = document.createElement('option');
            opt.value = String(item.id);
            opt.textContent = formatHistoryLabel(item);
            select.appendChild(opt);
        });
        if (oldValue && Array.from(select.options).some((o) => o.value === oldValue)) {
            select.value = oldValue;
        }
    } catch (err) {
        console.warn('历史记录加载失败', err);
    }
}

async function loadHistorySelection() {
    if (!elements.historySelect) return;
    const id = String(elements.historySelect.value || '').trim();
    if (!id) {
        clearHistoryView();
        return;
    }
    try {
        const rows = await window.scheduleDb.loadLaborHistoryById(id, state.currentAccountSet);
        state.historyData = Array.isArray(rows) ? rows : [];
        normalizeLaborRowsPayType(state.historyData);
        state.currentHistoryId = id;
        
        // Find saved_at from history select
        if (elements.historySelect) {
            const opt = Array.from(elements.historySelect.options).find(o => o.value === id);
            if (opt) {
                const ts = opt.textContent.split(' #')[0];
                if (ts && ts.includes('-')) {
                    state.currentHistorySavedAt = ts;
                }
            }
        }

        populateCompanyFilter();
        renderTable();
    } catch (err) {
        console.error(err);
        alert('历史查询失败：' + (err && err.message ? err.message : String(err)));
    }
}

function clearHistoryView() {
    state.historyData = null;
    state.currentHistoryId = '';
    state.currentHistorySavedAt = '';

    if (elements.historySelect) elements.historySelect.value = '';
    populateCompanyFilter();
    renderTable();
}

const WEEK_DAYS = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];

function createEmptyRecordRow(company, shift, role, note) {
    const row = {
        _rowUid: generateLaborRowUid(),
        '劳务公司/归属': company.trim(),
        '班次名称': shift.trim() || '常规班次',
        '计薪类型': normalizePayType('计时'),
        '岗位/工作内容': role.trim(),
        '备注': sanitizeNoteForDb(note || '').trim(),
        '变化原因': ''
    };
    WEEK_DAYS.forEach(d => {
        row[d] = 0;
        row[`${d}_实到`] = 0;
    });
    return row;
}

function openAddRecordModal() {
    if (!elements.addRecordModal) return;
    if (elements.addCompany) elements.addCompany.value = '';
    if (elements.addShift) elements.addShift.value = '';
    if (elements.addRole) elements.addRole.value = '';
    if (elements.addNote) elements.addNote.value = '';
    elements.addRecordModal.classList.add('active');
    if (elements.addCompany) elements.addCompany.focus();
}

function closeAddRecordModal() {
    if (elements.addRecordModal) elements.addRecordModal.classList.remove('active');
}

function submitNewRecord() {
    if (!isCurrentUserAdmin()) {
        alert('仅管理员可新增记录。');
        return;
    }
    const company = (elements.addCompany && elements.addCompany.value) ? elements.addCompany.value.trim() : '';
    const shift = elements.addShift ? elements.addShift.value.trim() : '';
    const role = elements.addRole ? elements.addRole.value.trim() : '';
    const note = elements.addNote ? elements.addNote.value.trim() : '';
    if (!company) {
        alert('请填写劳务公司。');
        return;
    }
    if (!role) {
        alert('请填写岗位内容。');
        return;
    }
    const row = createEmptyRecordRow(company, shift || '常规班次', role, note);
    state.data.push(row);
    enqueuePersistLaborToDb();
    populateCompanyFilter();
    if (elements.companyFilter && company) {
        elements.companyFilter.value = company;
        state.currentCompany = company;
    }
    renderTable();
    closeAddRecordModal();
}

function checkAuth() {
    applyAuthUi();
}

function openUserMgmtModal() {
    if (!isCurrentUserAdmin()) {
        alert('仅管理员可管理用户。');
        return;
    }
    renderUserList();
    if (elements.userMgmtModal) elements.userMgmtModal.classList.add('active');
}

function closeUserMgmtModal() {
    if (elements.userMgmtModal) elements.userMgmtModal.classList.remove('active');
}

function renderUserList() {
    if (!elements.userListBody) return;
    const rows = state.users
        .slice()
        .sort((a, b) => {
            if (a.role === b.role) return a.username.localeCompare(b.username, 'zh-CN');
            return a.role === 'admin' ? -1 : 1;
        });
    elements.userListBody.innerHTML = '';
    rows.forEach((user) => {
        const tr = document.createElement('tr');
        const roleLabel = user.role === 'admin' ? '管理员' : '普通用户';
        const planDisabled = user.role === 'admin' ? 'disabled' : '';
        const actualDisabled = user.role === 'admin' ? 'disabled' : '';
        const deleteDisabled = (user.username === state.currentUser || user.role === 'admin') ? 'disabled' : '';
        const statusClass = user.enabled ? 'user-status-enabled' : 'user-status-disabled';
        const statusLabel = user.enabled ? '启用' : '禁用';
        const toggleLabel = user.enabled ? '禁用' : '启用';
        const toggleDisabled = user.role === 'admin' ? 'disabled' : '';
        const resetDisabled = user.role === 'admin' ? 'disabled' : '';
        const accountSets = normalizeUserAccountSets(user.accountSets, user.role);
        const setDisabled = user.role === 'admin' ? 'disabled' : '';
        const lockRemain = getLockRemainMs(user);
        const lockText = lockRemain > 0 ? `（锁定剩余 ${formatLockRemain(lockRemain)}）` : '';
        tr.innerHTML = `
            <td>${user.username}</td>
            <td>${roleLabel}</td>
            <td><span class="user-status-badge ${statusClass}">${statusLabel}</span> ${lockText}</td>
            <td>
                <label><input type="checkbox" data-type="account-set" data-account="CNO.H" data-user="${user.username}" ${accountSets.includes('CNO.H') ? 'checked' : ''} ${setDisabled}>CNO.H</label>
                <label><input type="checkbox" data-type="account-set" data-account="SFO.H" data-user="${user.username}" ${accountSets.includes('SFO.H') ? 'checked' : ''} ${setDisabled}>SFO.H</label>
            </td>
            <td><input type="checkbox" data-type="plan" data-user="${user.username}" ${user.canEditPlan ? 'checked' : ''} ${planDisabled}></td>
            <td><input type="checkbox" data-type="actual" data-user="${user.username}" ${user.canEditActual ? 'checked' : ''} ${actualDisabled}></td>
            <td>
                <button type="button" class="btn-text user-op-btn user-toggle-btn" data-user="${user.username}" ${toggleDisabled}>${toggleLabel}</button>
                <button type="button" class="btn-text user-op-btn user-reset-btn" data-user="${user.username}" ${resetDisabled}>重置密码</button>
                <button type="button" class="btn-text user-del-btn" data-user="${user.username}" ${deleteDisabled}>删除</button>
            </td>
        `;
        elements.userListBody.appendChild(tr);
    });
}

function addUserFromForm() {
    const username = normalizeUsername(elements.userAddUsername ? elements.userAddUsername.value : '');
    const password = String(elements.userAddPassword ? elements.userAddPassword.value : '').trim();
    if (!username || !password) {
        alert('请填写账号和密码。');
        return;
    }
    if (state.users.some((u) => u.username === username)) {
        alert('该账号已存在。');
        return;
    }
    const accountSets = [];
    if (elements.userAddAccountCno && elements.userAddAccountCno.checked) accountSets.push('CNO.H');
    if (elements.userAddAccountSfo && elements.userAddAccountSfo.checked) accountSets.push('SFO.H');
    if (!accountSets.length) {
        alert('请至少勾选一个账套权限。');
        return;
    }
    state.users.push({
        username,
        password,
        role: 'user',
        canEditPlan: !!(elements.userAddCanPlan && elements.userAddCanPlan.checked),
        canEditActual: !!(elements.userAddCanActual && elements.userAddCanActual.checked),
        accountSets,
        enabled: true,
        failedLoginCount: 0,
        lockedUntil: 0
    });
    saveUsers();
    if (elements.userAddUsername) elements.userAddUsername.value = '';
    if (elements.userAddPassword) elements.userAddPassword.value = '';
    if (elements.userAddAccountCno) elements.userAddAccountCno.checked = true;
    if (elements.userAddAccountSfo) elements.userAddAccountSfo.checked = false;
    if (elements.userAddCanPlan) elements.userAddCanPlan.checked = true;
    if (elements.userAddCanActual) elements.userAddCanActual.checked = true;
    renderUserList();
}

function toggleUserEnabled(username) {
    const user = state.users.find((u) => u.username === username);
    if (!user || user.role === 'admin') return;
    user.enabled = !user.enabled;
    if (!user.enabled) {
        user.failedLoginCount = 0;
        user.lockedUntil = 0;
        if (user.username === state.currentUser) {
            handleLogout();
        }
    }
    saveUsers();
    renderUserList();
}

function resetUserPassword(username) {
    const user = state.users.find((u) => u.username === username);
    if (!user || user.role === 'admin') return;
    user.password = RESET_PASSWORD_DEFAULT;
    user.failedLoginCount = 0;
    user.lockedUntil = 0;
    user.enabled = true;
    saveUsers();
    renderUserList();
    alert(`用户 ${username} 密码已重置为 ${RESET_PASSWORD_DEFAULT}`);
}

function updateUserPermission(username, permissionType, checked) {
    const user = state.users.find((u) => u.username === username);
    if (!user || user.role === 'admin') return;
    if (permissionType === 'plan') user.canEditPlan = checked;
    if (permissionType === 'actual') user.canEditActual = checked;
    saveUsers();
    renderTable();
}

function updateUserAccountSet(username, accountSet, checked) {
    const user = state.users.find((u) => u.username === username);
    if (!user || user.role === 'admin') return;
    const set = normalizeAccountSet(accountSet);
    const current = normalizeUserAccountSets(user.accountSets, user.role);
    let next = current.slice();
    if (checked) {
        if (!next.includes(set)) next.push(set);
    } else {
        next = next.filter((s) => s !== set);
    }
    if (!next.length) {
        alert('至少保留一个账套权限。');
        renderUserList();
        return;
    }
    user.accountSets = next;
    saveUsers();
    if (user.username === state.currentUser) {
        if (!getAllowedAccountSets().includes(state.currentAccountSet)) {
            switchAccountSet(getAllowedAccountSets()[0] || 'CNO.H');
            return;
        }
    }
    renderUserList();
}

function deleteUser(username) {
    const targetUser = state.users.find((u) => u.username === username);
    if (!targetUser) return;
    if (username === state.currentUser || targetUser.role === 'admin') {
        alert('管理员或当前登录用户不能删除。');
        return;
    }
    const idx = state.users.findIndex((u) => u.username === username);
    if (idx < 0) return;
    state.users.splice(idx, 1);
    saveUsers();
    renderUserList();
}

function handleLogin() {
    const username = normalizeUsername(elements.loginUsername ? elements.loginUsername.value : '');
    const password = normalizeLoginCredential(elements.loginPassword ? elements.loginPassword.value : '');
    const user = state.users.find((u) => u.username === username);
    if (!user) {
        alert('账号或密码错误。');
        return;
    }
    if (!user.enabled) {
        alert('账号已被禁用，请联系管理员。');
        return;
    }
    const lockRemain = getLockRemainMs(user);
    if (lockRemain > 0) {
        alert(`账号已锁定，请稍后再试（剩余 ${formatLockRemain(lockRemain)}）`);
        return;
    }
    if (normalizeLoginCredential(user.password) !== password) {
        user.failedLoginCount = (user.failedLoginCount || 0) + 1;
        if (user.failedLoginCount >= MAX_LOGIN_ATTEMPTS) {
            user.lockedUntil = Date.now() + LOCK_MINUTES * 60 * 1000;
            user.failedLoginCount = 0;
            saveUsers();
            alert(`密码错误次数过多，账号已锁定 ${LOCK_MINUTES} 分钟。`);
            return;
        }
        saveUsers();
        const remain = Math.max(0, MAX_LOGIN_ATTEMPTS - user.failedLoginCount);
        alert(`账号或密码错误。再错 ${remain} 次将锁定 ${LOCK_MINUTES} 分钟。`);
        return;
    }
    user.failedLoginCount = 0;
    user.lockedUntil = 0;
    saveUsers();
    const chosenRaw = elements.loginAccountSet ? elements.loginAccountSet.value : '';
    const chosenSet = normalizeAccountSet(chosenRaw || 'CNO.H');
    const allowedSets = getAllowedAccountSets(user);
    if (!allowedSets.includes(chosenSet)) {
        alert('当前账号无权访问所选账套。');
        return;
    }
    state.currentUser = user.username;
    state.currentAccountSet = chosenSet;
    try {
        localStorage.setItem('currentUser', user.username);
        localStorage.setItem('currentAccountSet', state.currentAccountSet);
    } catch (err) {
        console.warn(
            '无法在浏览器中写入登录状态（可能被跟踪防护拦截）；仍可继续使用，修改会通过服务器写入数据库。',
            err
        );
    }
    state.historyData = null;
    state.currentHistoryId = '';
    if (elements.loginPassword) elements.loginPassword.value = '';
    checkAuth();
    switchAccountSet(state.currentAccountSet, true);
}

async function handleLogout() {
    await _persistLaborChain;
    clearTimeout(_debouncedNotePersistTimer);
    _debouncedNotePersistTimer = null;
    state.currentUser = '';
    try {
        localStorage.removeItem('currentUser');
    } catch (_) { /* ignore */ }
    state.historyData = null;
    state.currentHistoryId = '';
    checkAuth();
    renderTable();
    syncSaveButtonState();
}

function openChangePasswordModal() {
    if (!state.currentUser) {
        alert('请先登录。');
        return;
    }
    if (elements.changeOldPassword) elements.changeOldPassword.value = '';
    if (elements.changeNewPassword) elements.changeNewPassword.value = '';
    if (elements.changeConfirmPassword) elements.changeConfirmPassword.value = '';
    if (elements.changePasswordModal) elements.changePasswordModal.classList.add('active');
}

function closeChangePasswordModal() {
    if (elements.changePasswordModal) elements.changePasswordModal.classList.remove('active');
}

function submitChangePassword() {
    const current = getCurrentUserProfile();
    if (!current) return;
    const oldPwd = normalizeLoginCredential(elements.changeOldPassword ? elements.changeOldPassword.value : '');
    const newPwd = String(elements.changeNewPassword ? elements.changeNewPassword.value : '').trim();
    const confirmPwd = String(elements.changeConfirmPassword ? elements.changeConfirmPassword.value : '').trim();
    if (normalizeLoginCredential(current.password) !== oldPwd) {
        alert('旧密码不正确。');
        return;
    }
    if (newPwd.length < 6) {
        alert('新密码至少6位。');
        return;
    }
    if (newPwd !== confirmPwd) {
        alert('两次输入的新密码不一致。');
        return;
    }
    current.password = newPwd;
    saveUsers();
    closeChangePasswordModal();
    alert('密码修改成功。');
}

function setupUserMgmtEvents() {
    if (elements.btnUserMgmt) {
        elements.btnUserMgmt.addEventListener('click', openUserMgmtModal);
    }
    if (elements.userMgmtClose) {
        elements.userMgmtClose.addEventListener('click', closeUserMgmtModal);
    }
    if (elements.userAddSubmit) {
        elements.userAddSubmit.addEventListener('click', addUserFromForm);
    }
    if (elements.btnChangePassword) {
        elements.btnChangePassword.addEventListener('click', openChangePasswordModal);
    }
    if (elements.changePasswordCancel) {
        elements.changePasswordCancel.addEventListener('click', closeChangePasswordModal);
    }
    if (elements.changePasswordSubmit) {
        elements.changePasswordSubmit.addEventListener('click', submitChangePassword);
    }
    if (elements.changeConfirmPassword) {
        elements.changeConfirmPassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') submitChangePassword();
        });
    }
    if (elements.changePasswordModal) {
        elements.changePasswordModal.addEventListener('click', (e) => {
            if (e.target === elements.changePasswordModal) closeChangePasswordModal();
        });
    }
    if (elements.userMgmtModal) {
        elements.userMgmtModal.addEventListener('click', (e) => {
            if (e.target === elements.userMgmtModal) closeUserMgmtModal();
        });
    }
    if (elements.userListBody) {
        elements.userListBody.addEventListener('change', (e) => {
            const target = e.target;
            if (!(target instanceof HTMLInputElement)) return;
            if (target.type !== 'checkbox') return;
            const username = target.getAttribute('data-user') || '';
            const type = target.getAttribute('data-type') || '';
            if (type === 'account-set') {
                const accountSet = target.getAttribute('data-account') || 'CNO.H';
                updateUserAccountSet(username, accountSet, target.checked);
                return;
            }
            updateUserPermission(username, type, target.checked);
        });
        elements.userListBody.addEventListener('click', (e) => {
            const target = e.target;
            if (!(target instanceof HTMLElement)) return;
            if (target.classList.contains('user-toggle-btn')) {
                const username = target.getAttribute('data-user') || '';
                toggleUserEnabled(username);
                return;
            }
            if (target.classList.contains('user-reset-btn')) {
                const username = target.getAttribute('data-user') || '';
                resetUserPassword(username);
                return;
            }
            if (!target.classList.contains('user-del-btn')) return;
            const username = target.getAttribute('data-user') || '';
            deleteUser(username);
        });
    }
}

function normalizeShiftForMatch(raw) {
    return String(raw ?? '')
        .replace(/[，,]/g, ' ')
        .replace(/：/g, ':')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function normalizeTimeToken(raw) {
    const s = String(raw ?? '')
        .replace(/：/g, ':')
        .replace(/\s+/g, '')
        .toLowerCase();
    const m = s.match(/^(\d{1,2}):(\d{2})(am|pm)?$/);
    if (!m) return s;
    let hour = parseInt(m[1], 10);
    const minute = m[2];
    const meridiem = m[3];
    if (meridiem === 'am') {
        if (hour === 12) hour = 0;
    } else if (meridiem === 'pm') {
        if (hour !== 12) hour += 12;
    }
    return `${hour}:${minute}`;
}

function formatDisplayTime(raw) {
    const normalized = normalizeTimeToken(raw);
    const m = String(normalized).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return String(raw ?? '').trim();
    const hh = String(parseInt(m[1], 10)).padStart(2, '0');
    return `${hh}：${m[2]}`;
}

function normalizeShiftFilterToken(raw) {
    const text = String(raw || '').trim();
    if (!text) return '';
    const normalizedTime = normalizeTimeToken(text);
    if (/^\d{1,2}:\d{2}$/.test(normalizedTime)) return formatDisplayTime(normalizedTime);
    return text;
}

function matchesSingleShiftToken(row, token) {
    const q = normalizeTimeToken(String(token || '').trim());
    if (!q) return true;
    const starts = extractShiftStartTimes(row['班次名称']);
    if (/^\d{1,2}:\d{2}$/.test(q)) {
        if (starts.some(t => normalizeTimeToken(t) === q)) return true;
        return false;
    }
    if (starts.some(t => normalizeTimeToken(t).includes(q))) return true;
    return normalizeShiftForMatch(row['班次名称']).includes(q);
}

function matchesShiftQuery(row) {
    if (state.shiftQueries.length) {
        return state.shiftQueries.some((token) => matchesSingleShiftToken(row, token));
    }
    return matchesSingleShiftToken(row, state.shiftQuery);
}

function extractShiftStartTimes(shiftText) {
    const text = String(shiftText ?? '')
        .replace(/：/g, ':')
        .replace(/[，,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) return [];

    // Match start time in ranges like 08:00-20:00 / 6:00AM-2:30PM / 08:00到20:00
    const rangePattern = /(\d{1,2}:\d{2}\s*(?:am|pm)?)\s*[-~—到至]/gi;
    const starts = [];
    let match;
    while ((match = rangePattern.exec(text)) !== null) {
        starts.push(normalizeTimeToken(match[1]));
    }
    return starts;
}

function sanitizeShiftName(shiftName) {
    return String(shiftName || '常规班次')
        .replace(/[，,]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function timeStringToMinutes(timeStr) {
    const norm = normalizeTimeToken(timeStr);
    const m = String(norm).match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    let h = parseInt(m[1], 10);
    const minute = parseInt(m[2], 10);
    if (!Number.isFinite(h) || !Number.isFinite(minute)) return null;
    h = ((h % 24) + 24) % 24;
    return h * 60 + minute;
}

/** 班次开始时间（分钟，0–1439）；无法解析则 null */
function shiftStartMinutesForSort(shiftText) {
    const starts = extractShiftStartTimes(shiftText);
    let best = null;
    for (const t of starts) {
        const mins = timeStringToMinutes(normalizeTimeToken(t));
        if (mins === null) continue;
        if (best === null || mins < best) best = mins;
    }
    if (best !== null) return best;
    const text = String(shiftText ?? '').replace(/：/g, ':');
    const loose = text.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
    if (loose) {
        const mins = timeStringToMinutes(normalizeTimeToken(loose[1]));
        if (mins !== null) return mins;
    }
    return null;
}

/** 无明确时间时：用语义顺序从早到晚（数值越小越靠前） */
function shiftSemanticTier(shiftText) {
    const shift = String(shiftText || '');
    const s = normalizeShiftForMatch(shift);
    const lower = s.toLowerCase();
    if (!s || s === '常规班次') return 80;
    if (lower.includes('special')) return 46;
    if (shift.includes('早') || lower.includes('morning')) return 10;
    if (shift.includes('白') || /\bday\b/i.test(lower)) return 20;
    if (shift.includes('中') || shift.includes('午')) return 30;
    if (lower.includes('night')) return 35;
    if (shift.includes('晚')) return 36;
    if (shift.includes('夜')) return 45;
    return 70;
}

function populateShiftDatalist() {
    const dl = document.getElementById('shift-options-list');
    if (!dl) return;
    dl.innerHTML = '';
    const shiftCandidates = [];
    getActiveRows().forEach(r => {
        const raw = r['班次名称'] ?? '';
        const starts = extractShiftStartTimes(raw);
        if (starts.length) {
            shiftCandidates.push(...starts.map(formatDisplayTime));
            return;
        }
        const normalized = String(raw).replace(/[，,]/g, ' ').replace(/\s+/g, ' ').trim();
        shiftCandidates.push(normalized || '常规班次');
    });
    const shifts = [...new Set(shiftCandidates)].sort((a, b) => a.localeCompare(b, 'zh-CN'));
    shifts.forEach(text => {
        const opt = document.createElement('option');
        opt.value = text;
        dl.appendChild(opt);
    });
}

function renderSelectedShiftTags() {
    if (!elements.shiftSelectedTags) return;
    elements.shiftSelectedTags.innerHTML = '';
    state.shiftQueries.forEach((token, idx) => {
        const tag = document.createElement('span');
        tag.className = 'shift-tag';
        tag.innerHTML = `
            <span>${token}</span>
            <button type="button" class="shift-tag-remove" data-index="${idx}" aria-label="移除班次筛选">×</button>
        `;
        elements.shiftSelectedTags.appendChild(tag);
    });
}

function addShiftSelection(rawToken) {
    const token = normalizeShiftFilterToken(rawToken);
    if (!token) return;
    if (!state.shiftQueries.includes(token)) {
        state.shiftQueries.push(token);
    }
    state.shiftQuery = '';
    if (elements.shiftSearchInput) elements.shiftSearchInput.value = '';
    renderSelectedShiftTags();
    renderTable();
}

function removeShiftSelectionByIndex(index) {
    if (index < 0 || index >= state.shiftQueries.length) return;
    state.shiftQueries.splice(index, 1);
    renderSelectedShiftTags();
    renderTable();
}

function populateRoleDatalist() {
    const dl = document.getElementById('role-options-list');
    if (!dl) return;
    dl.innerHTML = '';
    const roles = [...new Set(getActiveRows().map(r =>
        String(r['岗位/工作内容'] ?? '').replace(/\s+/g, ' ').trim()
    ))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'zh-CN'));
    roles.forEach(text => {
        const opt = document.createElement('option');
        opt.value = text;
        dl.appendChild(opt);
    });
}

function populateCompanyFilter() {
    const companies = [...new Set(getActiveRows().map(item => item['劳务公司/归属']))].filter(Boolean);
    elements.companyFilter.innerHTML = '<option value="ALL">显示全部</option>';
    companies.forEach(company => {
        const option = document.createElement('option');
        option.value = company;
        option.textContent = company;
        elements.companyFilter.appendChild(option);
    });
    populateShiftDatalist();
    populateRoleDatalist();
}

function renderTable() {
    function escapeHtml(text) {
        return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    let html = '';
    if (!isViewingHistory()) {
        ensureLaborRowUids(state.data);
    }
    const filteredData = getActiveRows().filter(item => {
        const matchCompany = state.currentCompany === 'ALL' || item['劳务公司/归属'] === state.currentCompany;
        const itemPayType = normalizePayType(item['计薪类型']);
        const matchPayType = state.currentPayType === 'ALL' || itemPayType === state.currentPayType;
        const matchShift = matchesShiftQuery(item);
        const matchSearch = (item['岗位/工作内容'] || '').toLowerCase().includes(state.searchQuery.toLowerCase());
        return matchCompany && matchPayType && matchShift && matchSearch;
    });
    const sortedData = filteredData.slice().sort((a, b) => {
        const companyCompare = String(a['劳务公司/归属'] || '').localeCompare(String(b['劳务公司/归属'] || ''), 'zh-CN');
        if (companyCompare !== 0) return companyCompare;
        const ma = shiftStartMinutesForSort(a['班次名称']);
        const mb = shiftStartMinutesForSort(b['班次名称']);
        if (ma !== null && mb !== null && ma !== mb) return ma - mb;
        if (ma !== null && mb === null) return -1;
        if (ma === null && mb !== null) return 1;
        const ta = shiftSemanticTier(a['班次名称']);
        const tb = shiftSemanticTier(b['班次名称']);
        if (ta !== tb) return ta - tb;
        const shiftCompare = sanitizeShiftName(a['班次名称']).localeCompare(sanitizeShiftName(b['班次名称']), 'zh-CN');
        if (shiftCompare !== 0) return shiftCompare;
        const payTypeA = normalizePayType(a['计薪类型']);
        const payTypeB = normalizePayType(b['计薪类型']);
        return payTypeA.localeCompare(payTypeB, 'zh-CN');
    });

    const days = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
    
    function getWeekDates(baseDate = new Date()) {
        const d = new Date(baseDate);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
        const monday = new Date(d.setDate(diff));
        return Array.from({length: 7}, (_, i) => {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            return (date.getMonth() + 1) + '/' + date.getDate();
        });
    }

    const baseDate = state.currentHistorySavedAt ? new Date(state.currentHistorySavedAt) : new Date();
    const weekDates = getWeekDates(baseDate);


    let currentGroupKey = null;
    let groupIdx = -1;
    let groupTotals = days.reduce((acc, d) => ({...acc, [d]: 0}), {});
    let groupActuals = days.reduce((acc, d) => ({...acc, [d]: 0}), {});

    function buildSubtotalRow(label, totals, actuals) {
        let cells = days.map(d => `
            <td class="col-day subtotal-cell" data-day-col="${d}">
                <div class="cell-split">
                    <span class="subtotal-plan">${totals[d]}</span>
                    <span class="subtotal-actual">${actuals[d]}</span>
                </div>
            </td>
        `).join('');
        return `<tr class="subtotal-row">
            <td colspan="4" class="summary-label-cell">【${label}】合计:</td>
            ${cells}
            <td></td>
            <td></td>
        </tr>`;
    }

    function getShiftMeta(rawShiftName) {
        const shift = sanitizeShiftName(rawShiftName);
        const lower = shift.toLowerCase();
        // English keywords first：special=夜班，night=晚班（与中文「夜/晚」区分配色）
        if (lower.includes('special')) {
            return { cls: 'shift-special-slot', icon: 'ri-moon-clear-line', text: shift };
        }
        if (lower.includes('night')) {
            return { cls: 'shift-late-slot', icon: 'ri-contrast-2-line', text: shift };
        }
        if (shift.includes('白')) return { cls: 'shift-day', icon: 'ri-sun-line', text: shift };
        if (shift.includes('夜')) return { cls: 'shift-night', icon: 'ri-moon-clear-line', text: shift };
        if (shift.includes('早')) return { cls: 'shift-morning', icon: 'ri-sun-foggy-line', text: shift };
        if (shift.includes('晚')) return { cls: 'shift-evening', icon: 'ri-contrast-2-line', text: shift };
        return { cls: 'shift-normal', icon: 'ri-time-line', text: shift };
    }

    function getCompanyColorClass(companyName) {
        const name = String(companyName || '');
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = ((hash << 5) - hash) + name.charCodeAt(i);
            hash |= 0;
        }
        const mixed = (hash ^ (hash >>> 16)) >>> 0;
        const idx = mixed % 24;
        return `company-color-${idx}`;
    }

    sortedData.forEach((row, index) => {
        const company = row['劳务公司/归属'];
        const shift = sanitizeShiftName(row['班次名称']);
        const rowUid = String(row._rowUid || '').trim();
        const editableRow = !isViewingHistory() && !!rowUid;
        const payType = normalizePayType(row['计薪类型']);
        const groupKey = company;
        const shiftMeta = getShiftMeta(shift);
        const companyColorClass = getCompanyColorClass(company);

        if (currentGroupKey !== groupKey) {
            if (currentGroupKey !== null) {
                html += buildSubtotalRow(currentGroupKey, groupTotals, groupActuals);
            }
            currentGroupKey = groupKey;
            groupIdx++;
            days.forEach(d => { groupTotals[d] = 0; groupActuals[d] = 0; });
        }

        days.forEach(d => {
            groupTotals[d] += getDisplayDayValue(row, d, 'plan');
            groupActuals[d] += getDisplayDayValue(row, d, 'actual');
        });

        let cells = days.map(day => {
            const plan = getDisplayDayValue(row, day, 'plan');
            const actual = getDisplayDayValue(row, day, 'actual');
            const statusClass = actual < plan ? 'shortfall' : (actual > plan ? 'overage' : '');
            const planEditor = canEditPlan()
                ? `<input type="number" class="plan-input" data-row-uid="${rowUid}" data-day="${day}" value="${plan}" onchange="updatePlan(this, '${rowUid}', '${day}')">`
                : `<span class="plan-label">${plan}</span>`;
            const actualEditor = canEditActual()
                ? `<input type="number" class="actual-input ${statusClass}" data-row-uid="${rowUid}" data-day="${day}" value="${actual}" onchange="updateActual(this, '${rowUid}', '${day}')">`
                : `<span class="plan-label">${actual}</span>`;
            return `
                <td class="col-day" data-day-col="${day}">
                    <div class="cell-split">
                        <div class="plan-wrap">
                            ${planEditor}
                        </div>
                        <div class="actual-wrap">
                            ${actualEditor}
                        </div>
                    </div>
                </td>
            `;
        }).join('');

        const rowPlanTotal = days.reduce((sum, day) => sum + getDisplayDayValue(row, day, 'plan'), 0);
        const shiftCellAlertClass = rowPlanTotal <= 0 ? 'shift-empty-warning' : '';
        const roleText = row['岗位/工作内容'] || '';
        const noteValue = getRowNote(row);
        const changeReason = getChangeReason(row);
        const roleCellContent = editableRow && isCurrentUserAdmin()
            ? `<input type="text" class="role-edit-input" data-row-uid="${rowUid}" value="${escapeHtml(roleText)}" onchange="updateJobContent(this, '${rowUid}')">`
            : `<div class="role-info">${escapeHtml(roleText)}</div>`;
        const shiftCellContent = editableRow && isCurrentUserAdmin()
            ? `
                <div class="shift-badge ${shiftMeta.cls}">
                    <i class="${shiftMeta.icon}"></i>
                    <span class="shift-name">${escapeHtml(shiftMeta.text)}</span>
                </div>
                <div class="shift-admin-tools">
                    <input type="text" class="shift-edit-input" data-row-uid="${rowUid}" value="${escapeHtml(shift)}" onchange="updateShiftName(this, '${rowUid}')">
                    <button type="button" class="shift-delete-btn" title="删除班次记录" aria-label="删除班次记录" onclick="deleteScheduleRow('${rowUid}')"><i class="ri-delete-bin-line"></i></button>
                </div>
            `
            : `
                <div class="shift-badge ${shiftMeta.cls}">
                    <i class="${shiftMeta.icon}"></i>
                    <span class="shift-name">${escapeHtml(shiftMeta.text)}</span>
                </div>
            `;
        const payTypeClass = payType === '计件' ? 'pay-type-piece' : 'pay-type-hourly';
        const canShared = editableRow && canEditPayTypeAndNote();
        html += `
            <tr class="data-row">
                <td><span class="company-tag ${companyColorClass}">${escapeHtml(company)}</span></td>
                <td class="${shiftCellAlertClass}">
                    ${shiftCellContent}
                </td>
                <td>
                    ${canShared
                        ? `<select class="pay-type-select ${payTypeClass}" data-row-uid="${rowUid}" onchange="updatePayType(this, '${rowUid}')">
                            <option value="计时" ${payType === '计时' ? 'selected' : ''}>计时</option>
                            <option value="计件" ${payType === '计件' ? 'selected' : ''}>计件</option>
                        </select>`
                        : `<span class="pay-type-badge ${payTypeClass}">${payType}</span>`
                    }
                </td>
                <td class="role-cell">${roleCellContent}</td>
                ${cells}
                <td class="note-cell">
                    <div class="note-wrap">
                        ${canShared
                            ? `<textarea class="note-input" data-row-uid="${rowUid}" rows="2" wrap="soft" spellcheck="false" oninput="scheduleDebouncedNotePersist(this, '${rowUid}')" onchange="updateNote(this, '${rowUid}')">${escapeHtml(noteValue)}</textarea>`
                            : `<span class="plan-label note-readonly">${escapeHtml(noteValue) || '-'}</span>`
                        }
                    </div>
                </td>
                <td class="reason-cell-wrap">
                    ${
                        changeReason
                            ? `<button type="button" class="reason-detail-btn" data-row-uid="${rowUid}" title="查看完整变化原因" aria-label="查看完整变化原因"><i class="ri-file-list-3-line" aria-hidden="true"></i></button>`
                            : `<span class="reason-empty">—</span>`
                    }
                </td>
            </tr>
        `;
    });

    if (currentGroupKey !== null) {
        html += buildSubtotalRow(currentGroupKey, groupTotals, groupActuals);
    }

    elements.scheduleTable.innerHTML = `
        <thead>
            <tr>
                <th>公司</th><th>班次</th><th>计薪类型</th><th>岗位内容</th>
                ${days.map((d, i) => `
                    <th data-day-col="${d}">
                        <div class="day-header">
                            <span class="day-date">${weekDates[i]}</span>
                            <span class="day-title">${d}</span>
                            <div class="day-subheads">
                                <span>计划</span>
                                <span>实到</span>
                            </div>
                        </div>
                    </th>
                `).join('')}
                <th>备注</th>
                <th>变化原因</th>
            </tr>
        </thead>
        <tbody>${html}</tbody>
        <tfoot>
            <tr class="total-row total-row-plan-foot">
                <td colspan="4" class="summary-label-cell">全场计划合计:</td>
                ${days.map(d => `
                    <td class="col-day" data-day-col="${d}">
                        <div class="cell-split footer-total-split">
                            <span class="footer-total-num footer-total-plan" id="total-plan-${d}">0</span>
                            <span class="footer-total-placeholder" aria-hidden="true"></span>
                        </div>
                    </td>
                `).join('')}
                <td colspan="2"></td>
            </tr>
            <tr class="total-row total-row-actual-foot">
                <td colspan="4" class="summary-label-cell">全场实到总计:</td>
                ${days.map(d => `
                    <td class="col-day" data-day-col="${d}">
                        <div class="cell-split footer-total-split">
                            <span class="footer-total-placeholder" aria-hidden="true"></span>
                            <span class="footer-total-num footer-total-actual" id="total-${d}">0</span>
                        </div>
                    </td>
                `).join('')}
                <td colspan="2"></td>
            </tr>
        </tfoot>
    `;
    
    applyFilters();
    recalcTotal();
    syncSaveButtonState();
}

function applyFilters() {
    const checkedDays = Array.from(elements.dateFilterContainer.querySelectorAll('input:checked')).map(i => i.value);
    document.querySelectorAll('[data-day-col]').forEach(cell => {
        const day = cell.getAttribute('data-day-col');
        cell.style.display = checkedDays.includes(day) ? '' : 'none';
    });
    requestAnimationFrame(() => refreshScheduleHorizontalScroll());
}

function getFilteredData() {
    return getActiveRows().filter(item => {
        const matchCompany = state.currentCompany === 'ALL' || item['劳务公司/归属'] === state.currentCompany;
        const itemPayType = normalizePayType(item['计薪类型']);
        const matchPayType = state.currentPayType === 'ALL' || itemPayType === state.currentPayType;
        const matchShift = matchesShiftQuery(item);
        const matchSearch = (item['岗位/工作内容'] || '').toLowerCase().includes(state.searchQuery.toLowerCase());
        return matchCompany && matchPayType && matchShift && matchSearch;
    });
}

function exportCurrentView() {
    const filteredData = getFilteredData();
    if (!filteredData.length) {
        alert('当前筛选结果为空，暂无可导出的数据。');
        return;
    }

    const checkedDays = Array.from(elements.dateFilterContainer.querySelectorAll('input:checked')).map(i => i.value);
    const days = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
    const exportDays = days.filter(day => checkedDays.includes(day));
    if (!exportDays.length) {
        alert('请至少勾选一个日期再导出。');
        return;
    }

    function getWeekDates(baseDate = new Date()) {
        const d = new Date(baseDate);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1); 
        const monday = new Date(d.setDate(diff));
        return Array.from({length: 7}, (_, i) => {
            const date = new Date(monday);
            date.setDate(monday.getDate() + i);
            return (date.getMonth() + 1) + '/' + date.getDate();
        });
    }
    const baseDate = state.currentHistorySavedAt ? new Date(state.currentHistorySavedAt) : new Date();
    const weekDates = getWeekDates(baseDate);

    const rows = filteredData.map(row => {
        const exportRow = {
            公司: row['劳务公司/归属'] || '',
            班次: row['班次名称'] || '',
            计薪类型: normalizePayType(row['计薪类型']),
            岗位内容: row['岗位/工作内容'] || '',
            备注: getRowNote(row),
            变化原因: getChangeReason(row)
        };
        exportDays.forEach(day => {
            const dayIdx = days.indexOf(day);
            const dateStr = dayIdx !== -1 ? ` (${weekDates[dayIdx]})` : '';
            exportRow[`${day}${dateStr}_计划`] = getDisplayDayValue(row, day, 'plan');
            exportRow[`${day}${dateStr}_实到`] = getDisplayDayValue(row, day, 'actual');
        });
        return exportRow;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, '排班导出');

    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const timestamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
    XLSX.writeFile(workbook, `排班导出_${timestamp}.xlsx`);
}

function updateActual(input, rowUid, day) {
    if (!canEditActual()) {
        renderTable();
        return;
    }
    const row = findDataRowByUid(rowUid);
    if (!row) {
        renderTable();
        return;
    }
    const value = parseFloat(input.value) || 0;

    setRawDayValueFromDisplay(row, day, 'actual', value);
    enqueuePersistLaborToDb();

    const plan = getDisplayDayValue(row, day, 'plan');
    input.classList.remove('shortfall', 'overage');
    if (value < plan) input.classList.add('shortfall');
    else if (value > plan) input.classList.add('overage');
    
    renderTable(); // Re-render to update subtotals
}

function updatePlan(input, rowUid, day) {
    if (!canEditPlan()) {
        renderTable();
        return;
    }
    const row = findDataRowByUid(rowUid);
    if (!row) {
        renderTable();
        return;
    }
    const oldDisplayValue = getDisplayDayValue(row, day, 'plan');
    const value = parseFloat(input.value) || 0;
    if (value !== oldDisplayValue) {
        const reason = window.prompt(`请填写变化原因（${day} 计划 ${oldDisplayValue}→${value}）`);
        if (!reason || !reason.trim()) {
            alert('未填写变化原因，本次修改已取消。');
            input.value = oldDisplayValue;
            return;
        }
        appendPlanChangeReason(row, day, oldDisplayValue, value, reason);
    }
    setRawDayValueFromDisplay(row, day, 'plan', value);
    enqueuePersistLaborToDb();
    renderTable(); // Re-render to refresh subtotal and variance styles
}

function updateNote(input, rowUid) {
    if (isViewingHistory()) return;
    if (!canEditPayTypeAndNote()) {
        renderTable();
        return;
    }
    const row = findDataRowByUid(rowUid);
    if (!row) return;
    clearTimeout(_debouncedNotePersistTimer);
    _debouncedNotePersistTimer = null;
    row['备注'] = sanitizeNoteForDb(input.value);
    enqueuePersistLaborToDb();
    renderTable();
}

function updatePayType(selectEl, rowUid) {
    if (isViewingHistory()) return;
    if (!canEditPayTypeAndNote()) {
        renderTable();
        return;
    }
    const row = findDataRowByUid(rowUid);
    if (!row) return;
    const selected = String(selectEl && selectEl.value ? selectEl.value : '').trim();
    row['计薪类型'] = normalizePayType(selected);
    const pt = row['计薪类型'];
    /* 筛选为单一计薪类型时，改类型会导致本行被剔出表格，看起来像「保存失败」——改为显示全部 */
    if (state.currentPayType !== 'ALL' && pt !== state.currentPayType) {
        state.currentPayType = 'ALL';
        if (elements.payTypeFilter) elements.payTypeFilter.value = 'ALL';
    }
    enqueuePersistLaborToDb();
    renderTable();
}

function updateShiftName(input, rowUid) {
    if (isViewingHistory()) return;
    if (!isCurrentUserAdmin()) {
        renderTable();
        return;
    }
    const row = findDataRowByUid(rowUid);
    if (!row) return;
    const value = String(input.value || '').trim() || '常规班次';
    row['班次名称'] = value;
    enqueuePersistLaborToDb();
    populateCompanyFilter();
    renderTable();
}

function updateJobContent(input, rowUid) {
    if (isViewingHistory()) return;
    if (!isCurrentUserAdmin()) {
        renderTable();
        return;
    }
    const row = findDataRowByUid(rowUid);
    if (!row) return;
    row['岗位/工作内容'] = String(input.value ?? '').replace(/\u0000/g, '').trim();
    enqueuePersistLaborToDb();
    populateCompanyFilter();
    renderTable();
}

function deleteScheduleRow(rowUid) {
    if (isViewingHistory()) return;
    if (!isCurrentUserAdmin()) {
        alert('仅管理员可删除班次记录。');
        return;
    }
    const idx = state.data.findIndex((r) => r && String(r._rowUid || '').trim() === String(rowUid || '').trim());
    if (idx < 0) return;
    const row = state.data[idx];
    if (!row) return;
    const shiftName = String(row['班次名称'] || '常规班次');
    if (!window.confirm(`确认删除班次记录「${shiftName}」吗？`)) return;
    state.data.splice(idx, 1);
    enqueuePersistLaborToDb();
    populateCompanyFilter();
    renderTable();
}

function recalcTotal() {
    let totalPlan = 0, totalActual = 0;
    const days = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日'];
    const checkedDays = Array.from(elements.dateFilterContainer.querySelectorAll('input:checked')).map(i => i.value);
    const grandActuals = days.reduce((acc, d) => ({...acc, [d]: 0}), {});
    const grandPlans = days.reduce((acc, d) => ({...acc, [d]: 0}), {});

    const filteredRows = getFilteredData();
    filteredRows.forEach(row => {
        days.forEach(d => {
            const plan = getDisplayDayValue(row, d, 'plan');
            const act = getDisplayDayValue(row, d, 'actual');
            if (checkedDays.includes(d)) {
                totalPlan += plan;
                totalActual += act;
            }
            grandPlans[d] += plan;
            grandActuals[d] += act;
        });
    });

    days.forEach(d => {
        const elActual = document.getElementById(`total-${d}`);
        const elPlan = document.getElementById(`total-plan-${d}`);
        if (elActual) elActual.innerText = grandActuals[d];
        if (elPlan) elPlan.innerText = grandPlans[d];
    });

    elements.statTotal.innerText = totalPlan;
    elements.statTotalActual.innerText = totalActual;
    elements.statTotalDiff.innerText = totalActual - totalPlan;

    const shiftOn = state.shiftQueries.length > 0 || !!state.shiftQuery.trim();
    const planLabel = document.getElementById('stat-label-plan');
    const actualLabel = document.getElementById('stat-label-actual');
    const diffLabel = document.getElementById('stat-label-diff');
    if (planLabel) planLabel.textContent = shiftOn ? '计划总数（当前班次）' : '计划总数';
    if (actualLabel) actualLabel.textContent = shiftOn ? '实到总数（当前班次）' : '实到总数';
    if (diffLabel) diffLabel.textContent = shiftOn ? '差异（当前班次）' : '差异';

    updateShiftHeadcountBanner(filteredRows, totalActual, checkedDays);
}

function updateShiftHeadcountBanner(filteredRows, totalActual, checkedDays) {
    const banner = document.getElementById('shift-headcount-banner');
    const valEl = document.getElementById('shift-headcount-value');
    const descEl = document.getElementById('shift-headcount-desc');
    if (!banner || !valEl || !descEl) return;

    const q = state.shiftQueries.length ? state.shiftQueries.join('、') : state.shiftQuery.trim();
    if (!q) {
        banner.hidden = true;
        return;
    }

    banner.hidden = false;
    const rounded = Number.isInteger(totalActual) ? totalActual : Number(totalActual.toFixed(2));
    valEl.textContent = String(rounded);

    const dayLabel = checkedDays.length === 7 ? '周一至周日' : `${checkedDays.join('、')}`;
    descEl.textContent = `关键词「${q}」· 统计所选日期列（${dayLabel}）· 本表当前 ${filteredRows.length} 条岗位；合计为以上岗位在各日「实到」人数之和。`;
}

function openShiftDatalist(inputEl) {
    if (!inputEl || typeof inputEl.showPicker !== 'function') return;
    try {
        inputEl.showPicker();
    } catch (_) {
        // Ignore showPicker restrictions; fallback to native behavior.
    }
}

function resetAndOpenShiftPicker() {
    if (!elements.shiftSearchInput) return;
    elements.shiftSearchInput.value = '';
    state.shiftQuery = '';
    // Let input value clear flush before opening native picker.
    requestAnimationFrame(() => openShiftDatalist(elements.shiftSearchInput));
}

function resetAndOpenRolePicker() {
    if (!elements.searchInput) return;
    elements.searchInput.value = '';
    if (state.searchQuery) {
        state.searchQuery = '';
        renderTable();
    }
    requestAnimationFrame(() => openShiftDatalist(elements.searchInput));
}

function setAllDayFilters(checked) {
    if (!elements.dateFilterContainer) return;
    const boxes = elements.dateFilterContainer.querySelectorAll('input[type="checkbox"]');
    boxes.forEach((box) => {
        box.checked = checked;
    });
    applyFilters();
    recalcTotal();
}

function setupEventListeners() {
    setupUserMgmtEvents();
    elements.companyFilter.addEventListener('change', (e) => { state.currentCompany = e.target.value; renderTable(); });
    if (elements.payTypeFilter) {
        elements.payTypeFilter.addEventListener('change', (e) => {
            state.currentPayType = e.target.value;
            renderTable();
        });
    }
    if (elements.historySelect) {
        elements.historySelect.addEventListener('change', () => {
            loadHistorySelection();
        });
    }
    if (elements.btnHistoryLoad) {
        elements.btnHistoryLoad.addEventListener('click', () => {
            loadHistorySelection();
        });
    }
    if (elements.btnHistoryClear) {
        elements.btnHistoryClear.addEventListener('click', () => {
            clearHistoryView();
        });
    }
    if (elements.shiftSearchInput) {
        elements.shiftSearchInput.addEventListener('input', (e) => {
            state.shiftQuery = e.target.value;
            renderTable();
        });
        elements.shiftSearchInput.addEventListener('change', (e) => {
            addShiftSelection(e.target.value);
        });
        elements.shiftSearchInput.addEventListener('focus', () => {
            openShiftDatalist(elements.shiftSearchInput);
        });
        elements.shiftSearchInput.addEventListener('click', () => {
            openShiftDatalist(elements.shiftSearchInput);
        });
        elements.shiftSearchInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown') {
                openShiftDatalist(elements.shiftSearchInput);
                return;
            }
            if (e.key === 'Enter' || e.key === ',') {
                e.preventDefault();
                addShiftSelection(elements.shiftSearchInput.value);
            }
        });
    }
    if (elements.shiftPickerBtn) {
        elements.shiftPickerBtn.addEventListener('click', () => {
            resetAndOpenShiftPicker();
        });
    }
    if (elements.shiftSelectedTags) {
        elements.shiftSelectedTags.addEventListener('click', (e) => {
            const target = e.target;
            if (!(target instanceof HTMLElement)) return;
            if (!target.classList.contains('shift-tag-remove')) return;
            const idx = Number(target.getAttribute('data-index'));
            if (!Number.isFinite(idx)) return;
            removeShiftSelectionByIndex(idx);
        });
    }
    elements.searchInput.addEventListener('input', (e) => { state.searchQuery = e.target.value; renderTable(); });
    elements.searchInput.addEventListener('focus', () => {
        openShiftDatalist(elements.searchInput);
    });
    elements.searchInput.addEventListener('click', () => {
        openShiftDatalist(elements.searchInput);
    });
    elements.searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowDown') {
            openShiftDatalist(elements.searchInput);
        }
    });
    if (elements.rolePickerBtn) {
        elements.rolePickerBtn.addEventListener('click', () => {
            resetAndOpenRolePicker();
        });
    }
    elements.dateFilterContainer.addEventListener('change', () => {
        applyFilters();
        recalcTotal();
    });
    if (elements.btnDaysSelectAll) {
        elements.btnDaysSelectAll.addEventListener('click', () => {
            setAllDayFilters(true);
        });
    }
    if (elements.btnDaysClearAll) {
        elements.btnDaysClearAll.addEventListener('click', () => {
            setAllDayFilters(false);
        });
    }
    elements.btnScreenshot.addEventListener('click', () => toggleScreenshotMode());
    if (elements.screenshotExit) {
        elements.screenshotExit.addEventListener('click', () => toggleScreenshotMode(false));
    }
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            if (elements.changeReasonModal && elements.changeReasonModal.classList.contains('active')) {
                closeChangeReasonModal();
                return;
            }
            if (document.body.classList.contains('screenshot-active')) {
                toggleScreenshotMode(false);
            }
        }
    });
    elements.btnSaveRecords.addEventListener('click', saveChanges);
    elements.btnExport.addEventListener('click', exportCurrentView);
    if (elements.scheduleTable) {
        elements.scheduleTable.addEventListener('click', (e) => {
            const btn = e.target.closest('.reason-detail-btn');
            if (!btn) return;
            e.preventDefault();
            const uid = btn.getAttribute('data-row-uid') || '';
            const row = findDataRowByUid(uid);
            openChangeReasonModal(row ? getChangeReason(row) : '');
        });
    }
    if (elements.changeReasonModalClose) {
        elements.changeReasonModalClose.addEventListener('click', closeChangeReasonModal);
    }
    if (elements.changeReasonModal) {
        elements.changeReasonModal.addEventListener('click', (e) => {
            if (e.target === elements.changeReasonModal) closeChangeReasonModal();
        });
    }
    if (elements.btnAddRecord) {
        elements.btnAddRecord.addEventListener('click', () => {
            if (!state.currentUser) {
                alert('请先登录后再新增。');
                return;
            }
            if (!isCurrentUserAdmin()) {
                alert('仅管理员可新增记录。');
                return;
            }
            openAddRecordModal();
        });
    }
    if (elements.addRecordSubmit) elements.addRecordSubmit.addEventListener('click', submitNewRecord);
    if (elements.addRecordCancel) elements.addRecordCancel.addEventListener('click', closeAddRecordModal);
    if (elements.addRecordModal) {
        elements.addRecordModal.addEventListener('click', (e) => {
            if (e.target === elements.addRecordModal) closeAddRecordModal();
        });
    }
    elements.btnLogin.addEventListener('click', handleLogin);
    if (elements.loginPassword) {
        elements.loginPassword.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') handleLogin();
        });
    }
    elements.btnLogout.addEventListener('click', () => void handleLogout());
    window.addEventListener('beforeunload', (e) => {
        if (!state.hasUnsavedChanges) return;
        e.preventDefault();
        e.returnValue = '';
    });
}

function toggleScreenshotMode(forceState) {
    let isActive;
    if (typeof forceState === 'boolean') {
        isActive = forceState;
        document.body.classList.toggle('screenshot-active', isActive);
    } else {
        document.body.classList.toggle('screenshot-active');
        isActive = document.body.classList.contains('screenshot-active');
    }
    if (elements.screenshotExit) {
        elements.screenshotExit.hidden = !isActive;
        elements.screenshotExit.setAttribute('aria-hidden', isActive ? 'false' : 'true');
        elements.screenshotExit.style.display = isActive ? 'inline-flex' : 'none';
    }
}

(async function bootstrap() {
    try {
        const saved = localStorage.getItem('currentAccountSet');
        if (saved) {
            const n = normalizeAccountSet(saved);
            if (ACCOUNT_SETS.includes(n)) state.currentAccountSet = n;
        }
    } catch {
        /* ignore */
    }

    await hydrateScheduleUsersBeforeInit();

    try {
        const rows = await window.scheduleDb.loadScheduleData(state.currentAccountSet);
        state.data = Array.isArray(rows) ? rows : [];
        ensureLaborRowUids(state.data);
        normalizeLaborRowsPayType(state.data);
    } catch (err) {
        console.error('加载排班数据失败', err);
        if (isHttpBackendPage()) {
            alert(
                (err && err.message ? err.message : String(err)) +
                    '\n\n通过 http(s) 访问时数据仅从服务器加载，不会使用浏览器本地副本。'
            );
            state.data = [];
            ensureLaborRowUids(state.data);
            normalizeLaborRowsPayType(state.data);
        } else {
            console.warn('回退 localStorage / 示例数据', err);
            state.data = safeLoadData();
            ensureLaborRowUids(state.data);
            normalizeLaborRowsPayType(state.data);
        }
    }
    init();
})();
