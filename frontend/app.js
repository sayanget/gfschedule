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
    weekStartDate: '',
    /** 晚班核对卡片所选列：星期一…星期日 */
    dailyOpsCheckDay: '',
    /** 表头周周一的 ymd，用于切换自然周时重置核对日 */
    dailyOpsWeekAnchorKey: '',
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

let _scheduleJumpHighlightTimer = null;
/** @type {HTMLTableRowElement | null} */
let _scheduleJumpHighlightRow = null;

function clearScheduleJumpHighlight() {
    if (_scheduleJumpHighlightTimer !== null) {
        clearTimeout(_scheduleJumpHighlightTimer);
        _scheduleJumpHighlightTimer = null;
    }
    if (_scheduleJumpHighlightRow) {
        _scheduleJumpHighlightRow.classList.remove('schedule-row-highlight');
        _scheduleJumpHighlightRow = null;
    }
}

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
    changeReasonModalClose: document.getElementById('change-reason-modal-close'),
    weekStartDate: document.getElementById('week-start-date')
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
    
    // Initialize Week Start Date
    if (elements.weekStartDate) {
        const now = new Date();
        const loc = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
        state.weekStartDate = mondayYmdFromCalendarDate(loc);
        elements.weekStartDate.value = state.weekStartDate;
    }

    applyDefaultDateColumnFilterTomorrowOnly();

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
        flushDailyOpsPanelInputsToData();
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

function getLocalTomorrowNoon() {
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1, 12, 0, 0, 0);
}

/** 当前表周周一至周日中与本地日历日 anchor 同一天的那一列；不在本周则 null */
function getScheduleWeekDayLabelForCalendarDate(anchor) {
    const mon = getMondayDateOfScheduleWeek();
    let target = null;
    if (anchor instanceof Date && !Number.isNaN(anchor.getTime())) {
        target = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 12, 0, 0, 0);
    }
    if (!target || !mon || Number.isNaN(mon.getTime())) return null;
    const diff = Math.round((target.getTime() - mon.getTime()) / 86400000);
    if (diff >= 0 && diff <= 6) return WEEK_DAYS[diff];
    return null;
}

/** 「显示日期」与「当日换算」默认：表周内对应本地「明天」的列；若明天不在本周则按星期名对齐列（如周日看盘时次日已入下一日历周）。 */
function getDefaultTomorrowDisplayDayLabel() {
    const tomorrow = getLocalTomorrowNoon();
    const inWeek = getScheduleWeekDayLabelForCalendarDate(tomorrow);
    if (inWeek) return inWeek;
    const dow = tomorrow.getDay();
    return WEEK_DAYS[(dow + 6) % 7];
}

function applyDefaultDateColumnFilterTomorrowOnly() {
    if (!elements.dateFilterContainer) return;
    const label = getDefaultTomorrowDisplayDayLabel();
    elements.dateFilterContainer.querySelectorAll('input[type="checkbox"]').forEach((box) => {
        box.checked = box.value === label;
    });
}

/** 将 YYYY-MM-DD 解析为本地日历日当天 12:00，避免仅日期串被当作 UTC 午夜导致周几错位 */
function parseYmdToLocalNoon(ymd) {
    const s = String(ymd || '').trim();
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (!m) return null;
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    const da = Number(m[3]);
    const d = new Date(y, mo, da, 12, 0, 0, 0);
    return Number.isNaN(d.getTime()) ? null : d;
}

/** 本地自然周（周一至周日）的周一 12:00 */
function getMondayLocalNoonFromDate(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
    const day = x.getDay();
    const delta = x.getDate() - day + (day === 0 ? -6 : 1);
    x.setDate(delta);
    return x;
}

/** 将所选日历日对齐到其所在自然周的周一（YYYY-MM-DD），与表头「星期一…星期日」为同一周 */
function mondayYmdFromCalendarDate(anchor) {
    let d = null;
    if (typeof anchor === 'string') {
        d = parseYmdToLocalNoon(anchor);
    } else if (anchor instanceof Date && !Number.isNaN(anchor.getTime())) {
        d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate(), 12, 0, 0, 0);
    }
    if (!d) return '';
    const mon = getMondayLocalNoonFromDate(d);
    const y = mon.getFullYear();
    const mo = String(mon.getMonth() + 1).padStart(2, '0');
    const da = String(mon.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
}

function getScheduleWeekBaseDate() {
    if (isViewingHistory() && state.currentHistorySavedAt) {
        const raw = String(state.currentHistorySavedAt).trim();
        const datePart = raw.split(/[\sT]/)[0];
        const d = parseYmdToLocalNoon(datePart);
        if (d) return d;
        const legacy = new Date(raw.replace(/-/g, '/'));
        if (!Number.isNaN(legacy.getTime())) {
            return new Date(legacy.getFullYear(), legacy.getMonth(), legacy.getDate(), 12, 0, 0, 0);
        }
    }
    if (state.weekStartDate) {
        const d = parseYmdToLocalNoon(state.weekStartDate);
        if (d) return d;
    }
    const t = new Date();
    return new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12, 0, 0, 0);
}

/** 与主表表头一致：由基准日得到周一至周日的「月/日」 */
function getWeekDatesFromBase(baseDate) {
    let ref = null;
    if (baseDate instanceof Date && !Number.isNaN(baseDate.getTime())) {
        ref = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate(), 12, 0, 0, 0);
    } else if (typeof baseDate === 'string') {
        ref = parseYmdToLocalNoon(baseDate);
    }
    if (!ref || Number.isNaN(ref.getTime())) {
        const t = new Date();
        ref = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12, 0, 0, 0);
    }
    const mon = getMondayLocalNoonFromDate(ref);
    return Array.from({ length: 7 }, (_, i) => {
        const date = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i, 12, 0, 0, 0);
        return `${date.getMonth() + 1}/${date.getDate()}`;
    });
}

/** 与主表同一自然周的「周一」本地 noon */
function getMondayDateOfScheduleWeek() {
    const base = getScheduleWeekBaseDate();
    if (!base || Number.isNaN(base.getTime())) return getCalendarMondayThisWeek();
    return getMondayLocalNoonFromDate(base);
}

function getCalendarMondayThisWeek() {
    const t = new Date();
    const loc = new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12, 0, 0, 0);
    return getMondayLocalNoonFromDate(loc);
}

function ymdFromLocalDate(d) {
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${y}-${mo}-${da}`;
}

let _dailyOpsDaySelectBound = false;

function syncDailyOpsDaySelect() {
    const sel = document.getElementById('daily-ops-day-select');
    if (!sel) return;
    const monSched = getMondayDateOfScheduleWeek();
    const anchorKey = ymdFromLocalDate(monSched);
    if (state.dailyOpsWeekAnchorKey !== anchorKey) {
        state.dailyOpsWeekAnchorKey = anchorKey;
        state.dailyOpsCheckDay = '';
    }
    const labels = getWeekDatesFromBase(getScheduleWeekBaseDate());
    sel.innerHTML = WEEK_DAYS.map((wk, i) => `<option value="${wk}">${wk}（${labels[i]}）</option>`).join('');
    const keep = state.dailyOpsCheckDay && WEEK_DAYS.includes(state.dailyOpsCheckDay) ? state.dailyOpsCheckDay : '';
    if (keep) {
        sel.value = keep;
        state.dailyOpsCheckDay = keep;
    } else {
        const def = getDefaultTomorrowDisplayDayLabel();
        sel.value = def;
        state.dailyOpsCheckDay = def;
    }
    if (!_dailyOpsDaySelectBound) {
        _dailyOpsDaySelectBound = true;
        sel.addEventListener('change', () => {
            state.dailyOpsCheckDay = sel.value;
            recalcTotal();
        });
    }
}

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

function populateAddRecordDatalists() {
    const rows = getActiveRows();
    const fillDatalist = (id, values) => {
        const dl = document.getElementById(id);
        if (!dl) return;
        dl.innerHTML = '';
        values.forEach((text) => {
            const opt = document.createElement('option');
            opt.value = text;
            dl.appendChild(opt);
        });
    };
    const companies = [...new Set(rows.map((r) => String(r['劳务公司/归属'] ?? '').trim()))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'zh-CN'));
    const shifts = [...new Set(rows.map((r) => String(r['班次名称'] ?? '').replace(/\s+/g, ' ').trim()))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'zh-CN'));
    const roles = [...new Set(rows.map((r) => String(r['岗位/工作内容'] ?? '').replace(/\s+/g, ' ').trim()))]
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b, 'zh-CN'));
    fillDatalist('add-company-options', companies);
    fillDatalist('add-shift-options', shifts);
    fillDatalist('add-role-options', roles);
}

function openAddRecordModal() {
    if (!elements.addRecordModal) return;
    if (elements.addCompany) elements.addCompany.value = '';
    if (elements.addShift) elements.addShift.value = '';
    if (elements.addRole) elements.addRole.value = '';
    if (elements.addNote) elements.addNote.value = '';
    populateAddRecordDatalists();
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

/** 叉车：班次名称中最早可解析的开始时刻（归一为 H:mm），无则 null（与排序用起始时刻一致） */
function getForkliftPrimaryStartNorm(shiftText) {
    const starts = extractShiftStartTimes(shiftText);
    let best = null;
    let bestM = null;
    for (const t of starts) {
        const n = normalizeTimeToken(t);
        if (!/^\d{1,2}:\d{2}$/.test(n)) continue;
        const m = timeStringToMinutes(n);
        if (m === null) continue;
        if (bestM === null || m < bestM) {
            bestM = m;
            best = n;
        }
    }
    if (best !== null) return best;
    const text = String(shiftText ?? '').replace(/：/g, ':');
    const loose = text.match(/(\d{1,2}:\d{2}\s*(?:am|pm)?)/i);
    if (loose) {
        const n = normalizeTimeToken(loose[1]);
        if (/^\d{1,2}:\d{2}$/.test(n)) return n;
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

/** 业务看板：晚班/午后段，与叉车拆分、Machine & Dumping 晚班汇总一致 */
function isLateShiftForOps(shiftText) {
    const s = sanitizeShiftName(shiftText);
    const lower = s.toLowerCase();
    if (lower.includes('night')) return true;
    if (lower.includes('special')) return true;
    if (s.includes('晚') || s.includes('夜')) return true;
    const tier = shiftSemanticTier(shiftText);
    if (tier >= 35 && tier <= 46) return true;
    const start = shiftStartMinutesForSort(s);
    if (start !== null && start >= 15 * 60) return true;
    return false;
}

const ROLE_MACHINE_OPS = 'Machine include warpping & cleaning';
const ROLE_DUMPING_OPS = 'Dumping & cleaning';
const ROLE_FORKLIFT_OPS = 'Forklift Driver';
const ROLE_PICK_SORT_TABLE_OPS = '人工分拣台-粗分';
/** 拣桌卡片只读同步：该岗位在 14:30 / 16:30 下班次计划人数，单位「人」 */
const ROLE_PICK_CBS_CBT_OPS = '人工分拣台-CBS&CBT';
const PICK_CBS_CBT_SYNC_START_MINUTES = [14 * 60 + 30, 16 * 60 + 30];

/** 早晚班 Machine 看板（6 人/组）：含固定岗位名及 Sorting Machine、分拣机 */
function isDailyOpsMachineRoleRow(row) {
    if (!row || typeof row !== 'object') return false;
    const r = String(row['岗位/工作内容'] || '').trim();
    if (r === ROLE_MACHINE_OPS) return true;
    if (r.includes('Sorting Machine')) return true;
    if (r.includes('分拣机')) return true;
    return false;
}

/** 早晚班 Machine/Dumping 看板：Dumping 小卡汇总岗位（3 人/组）；Sorting Machine/分拣机计入 Machine */
function isDailyOpsDumpingRoleRow(row) {
    if (!row || typeof row !== 'object') return false;
    const r = String(row['岗位/工作内容'] || '').trim();
    if (r === ROLE_DUMPING_OPS) return true;
    if (r.includes('供包员')) return true;
    return false;
}

/** 拣桌换算：岗位为「人工分拣台-粗分」的计划人数列 */
function isDailyOpsPickRoughRow(row) {
    if (!row || typeof row !== 'object') return false;
    return String(row['岗位/工作内容'] || '').trim() === ROLE_PICK_SORT_TABLE_OPS;
}

function isDailyOpsPickCbsCbtRoleRow(row) {
    if (!row || typeof row !== 'object') return false;
    return String(row['岗位/工作内容'] || '').trim() === ROLE_PICK_CBS_CBT_OPS;
}

/** CBS&CBT 且班次解析起始时刻为 14:30 或 16:30（与拣桌卡片同步行一致） */
function isDailyOpsPickCbsCbtSyncSlotRow(row) {
    if (!isDailyOpsPickCbsCbtRoleRow(row)) return false;
    const m = shiftStartMinutesForSort(row['班次名称']);
    if (m === null) return false;
    return PICK_CBS_CBT_SYNC_START_MINUTES.includes(m);
}

function isDailyOpsPickCbsCbtSlotMinutesRow(row, minutes) {
    return isDailyOpsPickCbsCbtSyncSlotRow(row) && shiftStartMinutesForSort(row['班次名称']) === minutes;
}

/** 拣桌卡片标题后缀：粗分 + CBS&CBT(14:30/16:30) 涉及班次时刻 */
function isDailyOpsPickCardShiftContextRow(row) {
    return isDailyOpsPickRoughRow(row) || isDailyOpsPickCbsCbtSyncSlotRow(row);
}

/** 拣桌卡片内：该公司行按人数显示/编辑，不按 8 人/组换算（劳务公司名称，不区分大小写） */
function isPickRoughHeadcountLaborCompany(companyName) {
    return /^direct\s*job$/i.test(String(companyName || '').trim());
}

/** 出库侧：岗位名称含「出库」 */
function isDailyOpsOutboundRoleRow(row) {
    if (!row || typeof row !== 'object') return false;
    return String(row['岗位/工作内容'] || '').includes('出库');
}

/** 入库侧：岗位名称含「入库」 */
function isDailyOpsInboundRoleRow(row) {
    if (!row || typeof row !== 'object') return false;
    return String(row['岗位/工作内容'] || '').includes('入库');
}

function isDailyOpsForkliftRoleRow(row) {
    if (!row || typeof row !== 'object') return false;
    return String(row['岗位/工作内容'] || '').trim() === ROLE_FORKLIFT_OPS;
}

/** 叉车司机固定时段：早班 6:00、8:00；晚班 16:30（与班次名称解析到的起始时刻精确对应） */
const FORKLIFT_FIXED_START_MINUTES = {
    am6: 6 * 60,
    am8: 8 * 60,
    pm1630: 16 * 60 + 30,
};

function forkliftRowStartMinutesOrNull(row) {
    if (!isDailyOpsForkliftRoleRow(row)) return null;
    const n = getForkliftPrimaryStartNorm(row['班次名称']);
    if (!n) return null;
    return timeStringToMinutes(n);
}

function isDailyOpsForkliftFixedMinutesRow(row, minutes) {
    return forkliftRowStartMinutesOrNull(row) === minutes;
}

function isDailyOpsForkliftOtherFixedSlotRow(row) {
    if (!isDailyOpsForkliftRoleRow(row)) return false;
    const m = forkliftRowStartMinutesOrNull(row);
    if (m === null) return true;
    return (
        m !== FORKLIFT_FIXED_START_MINUTES.am6 &&
        m !== FORKLIFT_FIXED_START_MINUTES.am8 &&
        m !== FORKLIFT_FIXED_START_MINUTES.pm1630
    );
}

/** 当日换算看板：按行筛选类型，与 updateDailyOpsPanel 中条件一致 */
function getDailyOpsPredicate(predKind) {
    switch (String(predKind || '')) {
        case 'pickCbs1430':
            return (row) => isDailyOpsPickCbsCbtSlotMinutesRow(row, PICK_CBS_CBT_SYNC_START_MINUTES[0]);
        case 'pickCbs1630':
            return (row) => isDailyOpsPickCbsCbtSlotMinutesRow(row, PICK_CBS_CBT_SYNC_START_MINUTES[1]);
        case 'rough':
            return (row) => isDailyOpsPickRoughRow(row);
        case 'forkAm6':
            return (row) => isDailyOpsForkliftFixedMinutesRow(row, FORKLIFT_FIXED_START_MINUTES.am6);
        case 'forkAm8':
            return (row) => isDailyOpsForkliftFixedMinutesRow(row, FORKLIFT_FIXED_START_MINUTES.am8);
        case 'forkPm1630':
            return (row) => isDailyOpsForkliftFixedMinutesRow(row, FORKLIFT_FIXED_START_MINUTES.pm1630);
        case 'forkOther':
            return (row) => isDailyOpsForkliftOtherFixedSlotRow(row);
        case 'outAm':
            return (row) => isDailyOpsOutboundRoleRow(row) && !isLateShiftForOps(row['班次名称']);
        case 'inAm':
            return (row) => isDailyOpsInboundRoleRow(row) && !isLateShiftForOps(row['班次名称']);
        case 'outPm':
            return (row) => isDailyOpsOutboundRoleRow(row) && isLateShiftForOps(row['班次名称']);
        case 'inPm':
            return (row) => isDailyOpsInboundRoleRow(row) && isLateShiftForOps(row['班次名称']);
        case 'machAm':
            return (row) => isDailyOpsMachineRoleRow(row) && !isLateShiftForOps(row['班次名称']);
        case 'dumpAm':
            return (row) => isDailyOpsDumpingRoleRow(row) && !isLateShiftForOps(row['班次名称']);
        case 'machPm':
            return (row) => isDailyOpsMachineRoleRow(row) && isLateShiftForOps(row['班次名称']);
        case 'dumpPm':
            return (row) => isDailyOpsDumpingRoleRow(row) && isLateShiftForOps(row['班次名称']);
        default:
            return () => false;
    }
}

/** 「复制到其他日期」涵盖的非拣桌专项卡片类型（拣桌卡的 rough/CBS 由 collectPickDeskCompanyPredSnapshots） */
const DAILY_OPS_STANDARD_PRED_KINDS = [
    'forkAm6', 'forkAm8', 'forkPm1630', 'forkOther',
    'outAm', 'inAm', 'outPm', 'inPm',
    'machAm', 'dumpAm', 'machPm', 'dumpPm',
];

function dailyOpsPredicateLabel(predKind) {
    const map = {
        pickCbs1430: '14:30 计划人数',
        pickCbs1630: '16:30 计划人数',
        rough: '人工分拣台-粗分→拣桌',
        forkAm6: '叉车 早班 06：00',
        forkAm8: '叉车 早班 08：00',
        forkPm1630: '叉车 晚班 16：30',
        forkOther: '叉车 其他时段',
        outAm: '出库早班',
        inAm: '入库早班',
        outPm: '出库晚班',
        inPm: '入库晚班',
        machAm: 'Sorting Machine/分拣机 早班',
        dumpAm: 'Dumping/供包 早班',
        machPm: 'Sorting Machine/分拣机 晚班',
        dumpPm: 'Dumping/供包 晚班',
    };
    return map[predKind] || String(predKind);
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

/** 排班表：劳务公司首行锚点 id（与 focusScheduleCompanyInTable 一致） */
function scheduleCompanyAnchorId(companyName) {
    const s = String(companyName || '').trim();
    if (!s) return 'schedule-co-empty';
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return `schedule-co-${(h >>> 0).toString(16)}`;
}

function findFirstScheduleRowForCompany(companyName) {
    const want = String(companyName || '').trim();
    if (!want || !elements.scheduleTable) return null;
    const byId = document.getElementById(scheduleCompanyAnchorId(want));
    if (byId) return byId;
    const tbody = elements.scheduleTable.querySelector('tbody');
    if (!tbody) return null;
    const trs = tbody.querySelectorAll('tr.data-row');
    for (let i = 0; i < trs.length; i++) {
        const tag = trs[i].querySelector('.company-tag');
        if (tag && String(tag.textContent || '').trim() === want) return trs[i];
    }
    return null;
}

/** 与主表 renderTable 中 sortedData 排序规则一致（同公司多条时为其中第一条） */
function compareScheduleRowsForJumpOrder(a, b) {
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
    const payCmp = payTypeA.localeCompare(payTypeB, 'zh-CN');
    if (payCmp !== 0) return payCmp;
    const roleCmp = String(a['岗位/工作内容'] || '').localeCompare(String(b['岗位/工作内容'] || ''), 'zh-CN');
    if (roleCmp !== 0) return roleCmp;
    return String(a._rowUid || '').localeCompare(String(b._rowUid || ''), 'zh-CN');
}

/** 当日运算卡片中某公司在本指标下的数据行：取排序后的首行用于定位到具体班次/岗位 */
function pickPrimaryDailyOpsJumpRow(rows) {
    const list = (rows || []).filter((r) => r && typeof r === 'object' && String(r._rowUid || '').trim());
    if (!list.length) return null;
    return list.slice().sort(compareScheduleRowsForJumpOrder)[0];
}

function findScheduleRowByUid(rowUid) {
    const uid = String(rowUid || '').trim();
    if (!uid || !elements.scheduleTable) return null;
    const tbody = elements.scheduleTable.querySelector('tbody');
    if (!tbody) return null;
    const trs = tbody.querySelectorAll('tr.data-row');
    for (let i = 0; i < trs.length; i++) {
        if (String(trs[i].getAttribute('data-row-uid') || '').trim() === uid) return trs[i];
    }
    return null;
}

/** 与下拉选项对齐（选项值可能含首尾空格，与卡片 trim 后的公司名一致即可） */
function syncCompanyFilterSelectAfterJump(trimmedName) {
    const want = String(trimmedName || '').trim();
    if (!elements.companyFilter || !want) return;
    const sel = elements.companyFilter;
    for (let i = 0; i < sel.options.length; i++) {
        const v = sel.options[i].value;
        if (v === 'ALL') continue;
        if (String(v || '').trim() === want) {
            sel.value = v;
            state.currentCompany = v;
            return;
        }
    }
    state.currentCompany = want;
    sel.value = want;
}

/** 从当日换算等位置跳转到主表：可选 rowUid 时定位到该行（班次/岗位），否则该公司首行 */
function focusScheduleCompanyInTable(companyName, options = {}) {
    const co = String(companyName || '').trim();
    if (!co) return;
    const wantUid = String(options.rowUid || '').trim();
    const doScroll = () => {
        let row = wantUid ? findScheduleRowByUid(wantUid) : null;
        if (!row) row = findFirstScheduleRowForCompany(co);
        if (!row) return;
        clearScheduleJumpHighlight();
        row.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
        row.classList.add('schedule-row-highlight');
        _scheduleJumpHighlightRow = row;
        _scheduleJumpHighlightTimer = window.setTimeout(() => {
            _scheduleJumpHighlightTimer = null;
            if (_scheduleJumpHighlightRow === row) {
                row.classList.remove('schedule-row-highlight');
                _scheduleJumpHighlightRow = null;
            }
        }, 10000);
    };
    const curTrim = String(state.currentCompany || '').trim();
    if (state.currentCompany !== 'ALL' && curTrim !== co) {
        syncCompanyFilterSelectAfterJump(co);
        renderTable();
        requestAnimationFrame(() => requestAnimationFrame(doScroll));
        return;
    }
    doScroll();
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

    clearScheduleJumpHighlight();

    let html = '';
    if (elements.weekStartDate) {
        elements.weekStartDate.disabled = isViewingHistory();
        if (isViewingHistory() && state.currentHistorySavedAt) {
            const raw = String(state.currentHistorySavedAt).trim();
            const datePart = raw.split(/[\sT]/)[0];
            let mon = mondayYmdFromCalendarDate(datePart);
            if (!mon) {
                const legacy = new Date(raw.replace(/-/g, '/'));
                if (!Number.isNaN(legacy.getTime())) {
                    mon = mondayYmdFromCalendarDate(
                        new Date(legacy.getFullYear(), legacy.getMonth(), legacy.getDate(), 12, 0, 0, 0)
                    );
                }
            }
            if (mon) elements.weekStartDate.value = mon;
        } else if (!isViewingHistory()) {
            const mon = state.weekStartDate ? mondayYmdFromCalendarDate(state.weekStartDate) : '';
            if (mon) state.weekStartDate = mon;
            elements.weekStartDate.value = state.weekStartDate;
        }
    }
    if (!isViewingHistory()) {
        ensureLaborRowUids(state.data);
    }
    const filteredData = getActiveRows().filter(item => {
        const matchCompany =
            state.currentCompany === 'ALL' ||
            String(item['劳务公司/归属'] || '').trim() === String(state.currentCompany || '').trim();
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

    const baseDate = getScheduleWeekBaseDate();
    const weekDates = getWeekDatesFromBase(baseDate);

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
        const coTrim = String(company || '').trim();
        const isFirstRowOfCompany =
            index === 0 ||
            String(sortedData[index - 1]['劳务公司/归属'] || '').trim() !== coTrim;
        const rowAnchorAttr = isFirstRowOfCompany ? ` id="${scheduleCompanyAnchorId(coTrim)}"` : '';
        const rowUidDataAttr = rowUid ? ` data-row-uid="${escapeHtml(rowUid)}"` : '';
        html += `
            <tr class="data-row"${rowAnchorAttr}${rowUidDataAttr}>
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
        const matchCompany =
            state.currentCompany === 'ALL' ||
            String(item['劳务公司/归属'] || '').trim() === String(state.currentCompany || '').trim();
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

    const baseDate = getScheduleWeekBaseDate();
    const weekDates = getWeekDatesFromBase(baseDate);

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
    const value = parseFloat(input.value) || 0;
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
    updateDailyOpsPanel(filteredRows);
}

function getMondayOfWeekContainingYmd(ymd) {
    if (!ymd) return null;
    const parts = String(ymd).trim().split('-').map((x) => Number(x));
    if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) return null;
    const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
    if (Number.isNaN(d.getTime())) return null;
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.getFullYear(), d.getMonth(), diff, 12, 0, 0, 0);
}

function formatOpsDivideValue(total, divisor) {
    if (!divisor) return '0';
    const v = total / divisor;
    if (!Number.isFinite(v)) return '—';
    if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
    return String(v.toFixed(3)).replace(/\.?0+$/, '');
}

/** 拣桌卡片主数字：人数÷8 的换算结果 + 单位「组」 */
function formatPickDeskGroupsDisplay(roughPeopleTotal) {
    const v = formatOpsDivideValue(roughPeopleTotal, 8);
    if (v === '—') return '—';
    return `${v} 组`;
}

function sumFilteredPlanForDay(rows, dayKey, predicate) {
    let s = 0;
    rows.forEach((row) => {
        if (!row || typeof row !== 'object') return;
        if (!predicate(row)) return;
        s += getDisplayDayValue(row, dayKey, 'plan');
    });
    return s;
}

/** 分拣粗分岗位：计划人数拆成「可折算拣桌组」与「Direct Job 按人」两类（主数字只对前者 ÷8） */
function sumPickRoughPlanSplitForDesk(rows, dayKey) {
    let convertible = 0;
    let directJob = 0;
    rows.forEach((row) => {
        if (!row || typeof row !== 'object') return;
        if (!isDailyOpsPickRoughRow(row)) return;
        const p = getDisplayDayValue(row, dayKey, 'plan');
        const co = String(row['劳务公司/归属'] || '').trim();
        if (isPickRoughHeadcountLaborCompany(co)) directJob += p;
        else convertible += p;
    });
    return { convertible, directJob };
}

function rowNoteIndicatesGroupUnit(row) {
    const t = String(getRowNote(row) || '');
    return t.includes('组');
}

function buildDailyOpsCompanyMap(rows, dayKey, predicate) {
    const m = new Map();
    rows.forEach((row) => {
        if (!row || typeof row !== 'object') return;
        if (!predicate(row)) return;
        const c = String(row['劳务公司/归属'] || '').trim();
        if (!c) return;
        if (!m.has(c)) m.set(c, { people: 0, rows: [] });
        const o = m.get(c);
        o.people += getDisplayDayValue(row, dayKey, 'plan');
        o.rows.push(row);
    });
    return m;
}

/** 拣桌卡片：CBS&CBT 在 14:30、16:30 的计划人数按公司汇总（只读同步） */
function buildPickCbsCbtSyncByCompany(rows, dayKey) {
    const m = new Map();
    rows.forEach((row) => {
        if (!row || typeof row !== 'object') return;
        if (!isDailyOpsPickCbsCbtSyncSlotRow(row)) return;
        const co = String(row['劳务公司/归属'] || '').trim();
        if (!co) return;
        const mins = shiftStartMinutesForSort(row['班次名称']);
        const label = mins === 14 * 60 + 30 ? '14:30' : '16:30';
        if (!m.has(co)) m.set(co, []);
        const arr = m.get(co);
        let bucket = arr.find((b) => b.label === label);
        if (!bucket) {
            bucket = { label, people: 0, rows: [] };
            arr.push(bucket);
        }
        bucket.people += getDisplayDayValue(row, dayKey, 'plan');
        bucket.rows.push(row);
    });
    m.forEach((arr) => arr.sort((a, b) => a.label.localeCompare(b.label, 'zh-CN')));
    return m;
}

function getDailyOpsCompanyDisplayInputValue(entry, mode, laborCompany) {
    const { people, rows } = entry;
    if (mode === 'rough') {
        if (laborCompany && isPickRoughHeadcountLaborCompany(laborCompany)) {
            return String(Math.max(0, Math.round(people)));
        }
        if (rows.length && rows.every(rowNoteIndicatesGroupUnit)) {
            return String(Math.max(0, Math.round(people)));
        }
        if (people <= 0) return '0';
        const v = people / 8;
        if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
        return String(Number(v.toFixed(4)));
    }
    if (mode === 'fork') return String(Math.max(0, Math.round(people)));
    if (mode === 'machine6') return String(Math.floor(people / 6));
    if (mode === 'dump3') return String(Math.floor(people / 3));
    return '0';
}

function parseDailyOpsInputToPlanTotal(mode, rowsForCompany, rawStr, laborCompany) {
    const g = parseFloat(String(rawStr ?? '').replace(/,/g, '').trim());
    const n = Number.isFinite(g) ? g : 0;
    if (mode === 'fork') return Math.max(0, Math.round(n));
    if (mode === 'machine6') return Math.max(0, Math.round(n)) * 6;
    if (mode === 'dump3') return Math.max(0, Math.round(n)) * 3;
    if (mode === 'rough') {
        if (laborCompany && isPickRoughHeadcountLaborCompany(laborCompany)) {
            return Math.max(0, Math.round(n));
        }
        const allGroup = rowsForCompany.length && rowsForCompany.every(rowNoteIndicatesGroupUnit);
        if (allGroup) return Math.max(0, Math.round(n));
        return Math.max(0, Math.round(n * 8));
    }
    return 0;
}

function renderDailyOpsCompanyLines(container, rows, dayKey, predKind, mode) {
    if (!container) return;
    container.innerHTML = '';
    const predicate = getDailyOpsPredicate(predKind);
    const map = buildDailyOpsCompanyMap(rows, dayKey, predicate);
    if (!map.size) {
        const empty = document.createElement('div');
        empty.className = 'daily-ops-company-lines-empty';
        empty.textContent = '（无劳务公司数据）';
        container.appendChild(empty);
        return;
    }
    const editable = canEditPlan() && !isViewingHistory();
    [...map.entries()]
        .sort((a, b) => a[0].localeCompare(b[0], 'zh-CN'))
        .forEach(([co, entry]) => {
            const line = document.createElement('div');
            line.className = 'daily-ops-company-line';
            const nameBtn = document.createElement('button');
            nameBtn.type = 'button';
            nameBtn.className = 'daily-ops-company-name daily-ops-company-jumpbtn';
            nameBtn.textContent = co;
            const jumpRow = pickPrimaryDailyOpsJumpRow(entry.rows);
            const jumpUid = jumpRow ? String(jumpRow._rowUid || '').trim() : '';
            nameBtn.title = jumpUid ? `在排班表中定位：${co}（本条卡片对应的班次/岗位）` : `在排班表中定位：${co}`;
            nameBtn.setAttribute('aria-label', jumpUid ? `查看 ${co} 对应班次排班` : `查看 ${co} 排班`);
            nameBtn.addEventListener('click', () => focusScheduleCompanyInTable(co, jumpUid ? { rowUid: jumpUid } : {}));
            line.appendChild(nameBtn);
            const unitLabel =
                mode === 'fork' || (mode === 'rough' && isPickRoughHeadcountLaborCompany(co)) ? '人' : '组';
            const displayVal = getDailyOpsCompanyDisplayInputValue(entry, mode, co);
            if (editable) {
                const inp = document.createElement('input');
                inp.type = 'number';
                inp.className = 'daily-ops-company-groups-input';
                inp.min = '0';
                const roughPeopleMode =
                    mode === 'rough' &&
                    !(entry.rows.length && entry.rows.every(rowNoteIndicatesGroupUnit)) &&
                    !isPickRoughHeadcountLaborCompany(co);
                inp.step = roughPeopleMode ? 'any' : '1';
                inp.value = displayVal;
                inp.dataset.dopsPred = predKind;
                inp.dataset.dopsMode = mode;
                inp.dataset.dopsCompany = co;
                inp.dataset.lastCommitted = displayVal;
                inp.title = `写入「${dayKey}」计划列；同一公司多条班次时合计记首行`;
                inp.setAttribute('aria-label', `${co} ${unitLabel}数`);
                line.appendChild(inp);
            } else {
                const ro = document.createElement('span');
                ro.className = 'daily-ops-company-readonly';
                ro.textContent = `${displayVal} ${unitLabel}`;
                line.appendChild(ro);
            }
            const unit = document.createElement('span');
            unit.className = 'daily-ops-company-unit';
            unit.textContent = unitLabel;
            line.appendChild(unit);
            container.appendChild(line);
        });
}

/** 拣桌卡片：粗分（可编辑组/人）+ 14:30/16:30 时段计划人数（可编辑，人；不展示岗位文案） */
function renderPickDeskCompanyLines(container, rows, dayKey) {
    if (!container) return;
    container.innerHTML = '';
    const roughPred = getDailyOpsPredicate('rough');
    const roughMap = buildDailyOpsCompanyMap(rows, dayKey, roughPred);
    const cbsMap = buildPickCbsCbtSyncByCompany(rows, dayKey);
    const companies = new Set([...roughMap.keys(), ...cbsMap.keys()]);
    if (!companies.size) {
        const empty = document.createElement('div');
        empty.className = 'daily-ops-company-lines-empty';
        empty.textContent = '（无劳务公司数据）';
        container.appendChild(empty);
        return;
    }
    const editable = canEditPlan() && !isViewingHistory();
    [...companies]
        .sort((a, b) => a.localeCompare(b, 'zh-CN'))
        .forEach((co) => {
            const roughEntry = roughMap.get(co);
            const cbsSlots = cbsMap.get(co) || [];

            if (roughEntry) {
                const line = document.createElement('div');
                line.className = 'daily-ops-company-line';
                const nameBtn = document.createElement('button');
                nameBtn.type = 'button';
                nameBtn.className = 'daily-ops-company-name daily-ops-company-jumpbtn';
                nameBtn.textContent = co;
                const jumpRowR = pickPrimaryDailyOpsJumpRow(roughEntry.rows);
                const jumpUidR = jumpRowR ? String(jumpRowR._rowUid || '').trim() : '';
                nameBtn.title = jumpUidR
                    ? `在排班表中定位：${co}（本条卡片对应的班次/岗位）`
                    : `在排班表中定位：${co}`;
                nameBtn.setAttribute(
                    'aria-label',
                    jumpUidR ? `查看 ${co} 对应班次排班` : `查看 ${co} 排班`
                );
                nameBtn.addEventListener('click', () =>
                    focusScheduleCompanyInTable(co, jumpUidR ? { rowUid: jumpUidR } : {})
                );
                line.appendChild(nameBtn);
                const unitLabel = isPickRoughHeadcountLaborCompany(co) ? '人' : '组';
                const displayVal = getDailyOpsCompanyDisplayInputValue(roughEntry, 'rough', co);
                if (editable) {
                    const inp = document.createElement('input');
                    inp.type = 'number';
                    inp.className = 'daily-ops-company-groups-input';
                    inp.min = '0';
                    const roughPeopleMode =
                        !(
                            roughEntry.rows.length &&
                            roughEntry.rows.every(rowNoteIndicatesGroupUnit)
                        ) && !isPickRoughHeadcountLaborCompany(co);
                    inp.step = roughPeopleMode ? 'any' : '1';
                    inp.value = displayVal;
                    inp.dataset.dopsPred = 'rough';
                    inp.dataset.dopsMode = 'rough';
                    inp.dataset.dopsCompany = co;
                    inp.dataset.lastCommitted = displayVal;
                    inp.title = `写入「${dayKey}」计划列；同一公司多条班次时合计记首行`;
                    inp.setAttribute('aria-label', `${co} ${unitLabel}数`);
                    line.appendChild(inp);
                } else {
                    const ro = document.createElement('span');
                    ro.className = 'daily-ops-company-readonly';
                    ro.textContent = `${displayVal} ${unitLabel}`;
                    line.appendChild(ro);
                }
                const unit = document.createElement('span');
                unit.className = 'daily-ops-company-unit';
                unit.textContent = unitLabel;
                line.appendChild(unit);
                container.appendChild(line);
            }

            cbsSlots.forEach((slot, idx) => {
                const line = document.createElement('div');
                line.className = 'daily-ops-company-line daily-ops-pick-cbs-line';
                if (roughEntry) line.classList.add('daily-ops-pick-cbs-line--indented');

                if (!roughEntry && idx === 0) {
                    const nameBtn = document.createElement('button');
                    nameBtn.type = 'button';
                    nameBtn.className = 'daily-ops-company-name daily-ops-company-jumpbtn';
                    nameBtn.textContent = co;
                    const jr0 = pickPrimaryDailyOpsJumpRow(slot.rows);
                    const uid0 = jr0 ? String(jr0._rowUid || '').trim() : '';
                    nameBtn.title = uid0
                        ? `在排班表中定位：${co}（${slot.label}）`
                        : `在排班表中定位：${co}`;
                    nameBtn.addEventListener('click', () =>
                        focusScheduleCompanyInTable(co, uid0 ? { rowUid: uid0 } : {})
                    );
                    line.appendChild(nameBtn);
                }

                const timeBtn = document.createElement('button');
                timeBtn.type = 'button';
                timeBtn.className = 'daily-ops-pick-cbs-time daily-ops-company-jumpbtn';
                timeBtn.textContent = slot.label;
                const jr = pickPrimaryDailyOpsJumpRow(slot.rows);
                const juid = jr ? String(jr._rowUid || '').trim() : '';
                timeBtn.title = juid ? `在排班表中定位 ${slot.label}` : '';
                timeBtn.setAttribute('aria-label', `${co} ${slot.label} 排班`);
                timeBtn.addEventListener('click', () =>
                    focusScheduleCompanyInTable(co, juid ? { rowUid: juid } : {})
                );
                line.appendChild(timeBtn);

                const cbsEntry = { people: slot.people, rows: slot.rows };
                const predCbs = slot.label === '14:30' ? 'pickCbs1430' : 'pickCbs1630';
                const displayN = getDailyOpsCompanyDisplayInputValue(cbsEntry, 'fork', co);

                if (editable) {
                    const inp = document.createElement('input');
                    inp.type = 'number';
                    inp.className = 'daily-ops-company-groups-input';
                    inp.min = '0';
                    inp.step = '1';
                    inp.value = displayN;
                    inp.dataset.dopsPred = predCbs;
                    inp.dataset.dopsMode = 'fork';
                    inp.dataset.dopsCompany = co;
                    inp.dataset.lastCommitted = displayN;
                    inp.title = `写入「${dayKey}」计划列；${slot.label} 时段（与粗分卡片同步）`;
                    inp.setAttribute('aria-label', `${co} ${slot.label} 人数`);
                    line.appendChild(inp);
                } else {
                    const ro = document.createElement('span');
                    ro.className = 'daily-ops-company-readonly';
                    ro.textContent = displayN;
                    line.appendChild(ro);
                }

                const unit = document.createElement('span');
                unit.className = 'daily-ops-company-unit';
                unit.textContent = '人';

                line.appendChild(unit);
                container.appendChild(line);
            });
        });
}

function tryCommitDailyOpsInput(el) {
    if (!(el instanceof HTMLInputElement) || !el.classList.contains('daily-ops-company-groups-input')) {
        return false;
    }
    if (!canEditPlan() || isViewingHistory()) return false;
    const sel = document.getElementById('daily-ops-day-select');
    const dayKey = sel && WEEK_DAYS.includes(sel.value) ? sel.value : null;
    if (!dayKey) return false;
    const company = String(el.dataset.dopsCompany || '').trim();
    const predKind = String(el.dataset.dopsPred || '');
    const mode = String(el.dataset.dopsMode || '');
    const lastCommitted = String(el.dataset.lastCommitted ?? '');
    if (!company || !predKind || !mode) return false;
    if (String(el.value) === lastCommitted) return false;

    const predicate = getDailyOpsPredicate(predKind);
    const rows = getFilteredData();
    const matches = rows.filter(
        (r) => r && predicate(r) && String(r['劳务公司/归属'] || '').trim() === company
    );
    if (!matches.length) {
        el.value = lastCommitted;
        return false;
    }

    const newTotal = parseDailyOpsInputToPlanTotal(mode, matches, el.value, company);
    const oldSum = matches.reduce((s, r) => s + getDisplayDayValue(r, dayKey, 'plan'), 0);

    if (newTotal === oldSum) {
        el.dataset.lastCommitted = String(el.value);
        return false;
    }

    matches.sort((a, b) => String(a._rowUid || '').localeCompare(String(b._rowUid || '')));
    const oldVals = matches.map((r) => getDisplayDayValue(r, dayKey, 'plan'));
    matches.forEach((row, i) => {
        const nv = i === 0 ? newTotal : 0;
        const ov = oldVals[i];
        if (ov !== nv) {
            setRawDayValueFromDisplay(row, dayKey, 'plan', nv);
        }
    });
    el.dataset.lastCommitted = String(el.value);
    return true;
}

function flushDailyOpsPanelInputsToData() {
    let any = false;
    document.querySelectorAll('#daily-ops-panel .daily-ops-company-groups-input').forEach((inp) => {
        if (tryCommitDailyOpsInput(inp)) any = true;
    });
    return any;
}

function collectPickDeskCompanyPredSnapshots(rows, fromDay) {
    const roughPred = getDailyOpsPredicate('rough');
    const roughMap = buildDailyOpsCompanyMap(rows, fromDay, roughPred);
    const cbsMap = buildPickCbsCbtSyncByCompany(rows, fromDay);
    const snaps = [];
    roughMap.forEach((entry, co) => {
        snaps.push({ company: co, predKind: 'rough', total: entry.people });
    });
    cbsMap.forEach((slots, co) => {
        slots.forEach((slot) => {
            const predCbs = slot.label === '14:30' ? 'pickCbs1430' : 'pickCbs1630';
            snaps.push({ company: co, predKind: predCbs, total: slot.people });
        });
    });
    return snaps;
}

function collectStandardPredSnapshots(rows, fromDay) {
    const snaps = [];
    DAILY_OPS_STANDARD_PRED_KINDS.forEach((predKind) => {
        const predicate = getDailyOpsPredicate(predKind);
        const map = buildDailyOpsCompanyMap(rows, fromDay, predicate);
        map.forEach((entry, co) => {
            snaps.push({ company: co, predKind, total: entry.people });
        });
    });
    return snaps;
}

function applyDailyOpsPlanTotalFirstRow(matches, dayKey, total) {
    matches.sort((a, b) => String(a._rowUid || '').localeCompare(String(b._rowUid || '')));
    const oldVals = matches.map((r) => getDisplayDayValue(r, dayKey, 'plan'));
    let changed = false;
    matches.forEach((row, i) => {
        const nv = i === 0 ? total : 0;
        const ov = oldVals[i];
        if (ov !== nv) {
            setRawDayValueFromDisplay(row, dayKey, 'plan', nv);
            changed = true;
        }
    });
    return changed;
}

function copyDailyOpsPlanConfigToTargetDays(targetWeekdays) {
    flushDailyOpsPanelInputsToData();
    const fromDay = state.dailyOpsCheckDay;
    if (!fromDay || !WEEK_DAYS.includes(fromDay)) {
        alert('请先选择当前「核对列」作为复制来源。');
        return;
    }
    const uniq = [];
    const seen = new Set();
    (Array.isArray(targetWeekdays) ? targetWeekdays : []).forEach((d) => {
        if (!WEEK_DAYS.includes(d) || d === fromDay || seen.has(d)) return;
        seen.add(d);
        uniq.push(d);
    });
    if (!uniq.length) {
        alert('请至少勾选一项与来源不同的目标日期。');
        return;
    }
    if (!canEditPlan() || isViewingHistory()) {
        alert('当前不可编辑计划（无权限或正在查看历史快照）。');
        return;
    }
    const rows = getFilteredData();
    const allSnaps = [
        ...collectPickDeskCompanyPredSnapshots(rows, fromDay),
        ...collectStandardPredSnapshots(rows, fromDay),
    ];
    let anyChange = false;
    uniq.forEach((toDay) => {
        allSnaps.forEach(({ company, predKind, total }) => {
            const predicate = getDailyOpsPredicate(predKind);
            const matches = rows.filter(
                (r) => r && predicate(r) && String(r['劳务公司/归属'] || '').trim() === company
            );
            if (!matches.length) return;
            if (applyDailyOpsPlanTotalFirstRow(matches, toDay, total)) anyChange = true;
        });
    });
    if (!anyChange) {
        alert('没有可写入的变更（目标列已有相同计划，或无匹配行）。');
        return;
    }
    enqueuePersistLaborToDb();
    renderTable();
}

function openDailyOpsCopyModal() {
    const modal = document.getElementById('daily-ops-copy-modal');
    const desc = document.getElementById('daily-ops-copy-desc');
    const wrap = document.getElementById('daily-ops-copy-target-checkboxes');
    if (!modal || !desc || !wrap) return;
    if (!canEditPlan() || isViewingHistory()) {
        alert('当前不可使用复制（需在最新数据且具有计划编辑权限）。');
        return;
    }
    const fromDay = state.dailyOpsCheckDay;
    if (!fromDay || !WEEK_DAYS.includes(fromDay)) {
        alert('请先选择核对列（复制来源）。');
        return;
    }
    const base = getScheduleWeekBaseDate();
    const dates = getWeekDatesFromBase(base);
    const fromIdx = WEEK_DAYS.indexOf(fromDay);
    const dateSuffix = fromIdx >= 0 ? `（${dates[fromIdx]}）` : '';
    desc.textContent =
        `将当前核对列「${fromDay}${dateSuffix}」在各卡片中的计划人数汇总写入下方勾选的列；不修改「实到」。来源列为灰色不可选。`;
    wrap.innerHTML = '';
    WEEK_DAYS.forEach((d, i) => {
        const label = document.createElement('label');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = d;
        if (d === fromDay) {
            cb.disabled = true;
            cb.checked = false;
        }
        label.appendChild(cb);
        label.append(` ${d}（${dates[i]}）`);
        wrap.appendChild(label);
    });
    modal.classList.add('active');
}

function closeDailyOpsCopyModal() {
    const modal = document.getElementById('daily-ops-copy-modal');
    if (modal) modal.classList.remove('active');
}

function confirmDailyOpsCopyModal() {
    const wrap = document.getElementById('daily-ops-copy-target-checkboxes');
    if (!wrap) {
        closeDailyOpsCopyModal();
        return;
    }
    const targets = [...wrap.querySelectorAll('input[type="checkbox"]:checked')].map((i) => i.value);
    closeDailyOpsCopyModal();
    copyDailyOpsPlanConfigToTargetDays(targets);
}

function updateDailyOpsCopyButtonState() {
    const btn = document.getElementById('btn-daily-ops-copy-days');
    if (!btn) return;
    const ok = canEditPlan() && !isViewingHistory();
    btn.disabled = !ok;
    btn.title = ok ? '把当前核对列的计划人数汇总复制到其他星期（不复制实到）' : '需在最新数据且具有计划编辑权限';
}

function onDailyOpsCompanyGroupsChange(ev) {
    const el = ev.target;
    if (!(el instanceof HTMLInputElement) || !el.classList.contains('daily-ops-company-groups-input')) return;
    if (!canEditPlan()) {
        renderTable();
        return;
    }
    const sel = document.getElementById('daily-ops-day-select');
    const dayKey = sel && WEEK_DAYS.includes(sel.value) ? sel.value : null;
    if (!dayKey) {
        renderTable();
        return;
    }
    if (!tryCommitDailyOpsInput(el)) return;
    enqueuePersistLaborToDb();
    renderTable();
}

/** 早/晚班各一栏：人数、满组 */
function applyDailyOpsMachDumpShift({
    machinePeople,
    dumpingPeople,
    machineValEl,
    dumpingValEl,
    machineProvidedEl,
    dumpingProvidedEl,
}) {
    const gM = Math.floor(machinePeople / 6);
    const gD = Math.floor(dumpingPeople / 3);

    if (machineValEl) machineValEl.textContent = `${gM} 组`;
    if (dumpingValEl) dumpingValEl.textContent = `${gD} 组`;
    if (machineProvidedEl) machineProvidedEl.textContent = '';
    if (dumpingProvidedEl) dumpingProvidedEl.textContent = '';

    const hasAny = machinePeople > 0 || dumpingPeople > 0;
    const mismatch = hasAny && gM !== gD;

    return { hasAny, mismatch, gM, gD };
}

const _DAILY_OPS_SHIFT_TIME_EL_IDS = [
    'daily-ops-pick-shift-time',
    'daily-ops-forklift-am-h-time',
    'daily-ops-forklift-pm-h-time',
    'daily-ops-forklift-other-h-time',
    'daily-ops-inout-am-h-time',
    'daily-ops-inout-pm-h-time',
    'daily-ops-mach-heading-am-time',
    'daily-ops-mach-heading-pm-time',
    'daily-ops-machine-am-shift-time',
    'daily-ops-dumping-am-shift-time',
    'daily-ops-machine-pm-shift-time',
    'daily-ops-dumping-pm-shift-time',
];

function clearDailyOpsShiftTimeSuffixes() {
    _DAILY_OPS_SHIFT_TIME_EL_IDS.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = '';
    });
}

/** 从当前筛选结果、核对列有计划人数的行中解析班次名称里的起始时刻，用于卡片标题后展示 */
function collectDailyOpsShiftTimeLabels(rows, dayKey, rowPredicate, maxTimes = 6) {
    const labels = [];
    const seen = new Set();
    if (!Array.isArray(rows)) return labels;
    rows.forEach((row) => {
        if (!row || typeof row !== 'object') return;
        if (!rowPredicate(row)) return;
        if (dayKey && getDisplayDayValue(row, dayKey, 'plan') <= 0) return;
        const name = String(row['班次名称'] || '').trim();
        if (!name) return;
        extractShiftStartTimes(name).forEach((t) => {
            const norm = normalizeTimeToken(t);
            if (!/^\d{1,2}:\d{2}$/.test(norm)) return;
            if (seen.has(norm)) return;
            seen.add(norm);
            labels.push({ norm, disp: formatDisplayTime(t) });
        });
    });
    labels.sort((a, b) => a.norm.localeCompare(b.norm));
    return labels.slice(0, maxTimes).map((x) => x.disp);
}

function formatDailyOpsShiftTimesSuffix(rows, dayKey, rowPredicate) {
    const parts = collectDailyOpsShiftTimeLabels(rows, dayKey, rowPredicate);
    if (!parts.length) return '';
    const half = parts.map((p) => String(p).replace(/：/g, ':').replace(/，/g, ',').replace(/；/g, ';'));
    return `, ${half.join(', ')}`;
}

function setDailyOpsShiftTimeSuffix(elId, rows, dayKey, rowPredicate) {
    const el = document.getElementById(elId);
    if (!el) return;
    el.textContent = formatDailyOpsShiftTimesSuffix(rows, dayKey, rowPredicate);
}

function updateDailyOpsPanel(filteredRows) {
    syncDailyOpsDaySelect();

    const pickEl = document.getElementById('daily-ops-pick-count');
    const forkAm6El = document.getElementById('daily-ops-forklift-am6-val');
    const forkAm8El = document.getElementById('daily-ops-forklift-am8-val');
    const forkPm1630El = document.getElementById('daily-ops-forklift-pm1630-val');
    const forkOtherEl = document.getElementById('daily-ops-forklift-other-val');
    const outAmEl = document.getElementById('daily-ops-out-am-val');
    const inAmEl = document.getElementById('daily-ops-in-am-val');
    const outPmEl = document.getElementById('daily-ops-out-pm-val');
    const inPmEl = document.getElementById('daily-ops-in-pm-val');
    const sel = document.getElementById('daily-ops-day-select');

    const dayKey = sel && sel.value && WEEK_DAYS.includes(sel.value) ? sel.value : null;

    const resetMachDumpShiftBlocks = () => {
        document.querySelectorAll('#daily-ops-panel .daily-ops-company-lines').forEach((el) => {
            el.innerHTML = '';
        });
        document.querySelectorAll('#daily-ops-panel .daily-ops-provided-groups').forEach((el) => {
            el.textContent = '';
        });
        const ids = [
            'daily-ops-machine-am-val',
            'daily-ops-dumping-am-val',
            'daily-ops-machine-pm-val',
            'daily-ops-dumping-pm-val',
        ];
        ids.forEach((rid) => {
            const n = document.getElementById(rid);
            if (!n) return;
            n.textContent = '—';
        });
    };

    const setDash = () => {
        clearDailyOpsShiftTimeSuffixes();
        if (pickEl) pickEl.textContent = '—';
        if (forkAm6El) forkAm6El.textContent = '—';
        if (forkAm8El) forkAm8El.textContent = '—';
        if (forkPm1630El) forkPm1630El.textContent = '—';
        if (forkOtherEl) forkOtherEl.textContent = '—';
        const forkOtherSec = document.getElementById('daily-ops-forklift-other-section');
        if (forkOtherSec) forkOtherSec.hidden = true;
        if (outAmEl) outAmEl.textContent = '—';
        if (inAmEl) inAmEl.textContent = '—';
        if (outPmEl) outPmEl.textContent = '—';
        if (inPmEl) inPmEl.textContent = '—';
        resetMachDumpShiftBlocks();
    };

    if (!dayKey) {
        setDash();
        updateDailyOpsCopyButtonState();
        return;
    }

    const roughSplit = sumPickRoughPlanSplitForDesk(filteredRows, dayKey);

    const predForkAm6 = getDailyOpsPredicate('forkAm6');
    const predForkAm8 = getDailyOpsPredicate('forkAm8');
    const predForkPm1630 = getDailyOpsPredicate('forkPm1630');
    const predForkOther = getDailyOpsPredicate('forkOther');

    const forkAm6 = sumFilteredPlanForDay(filteredRows, dayKey, predForkAm6);
    const forkAm8 = sumFilteredPlanForDay(filteredRows, dayKey, predForkAm8);
    const forkPm1630 = sumFilteredPlanForDay(filteredRows, dayKey, predForkPm1630);
    const forkOther = sumFilteredPlanForDay(filteredRows, dayKey, predForkOther);
    const forkOtherCompanyMap = buildDailyOpsCompanyMap(filteredRows, dayKey, predForkOther);
    const showForkliftOtherSection = forkOther > 0 || forkOtherCompanyMap.size > 0;
    const forkOtherSectionEl = document.getElementById('daily-ops-forklift-other-section');
    if (forkOtherSectionEl) forkOtherSectionEl.hidden = !showForkliftOtherSection;

    const outAm = sumFilteredPlanForDay(filteredRows, dayKey, (row) => {
        return isDailyOpsOutboundRoleRow(row) && !isLateShiftForOps(row['班次名称']);
    });
    const inAm = sumFilteredPlanForDay(filteredRows, dayKey, (row) => {
        return isDailyOpsInboundRoleRow(row) && !isLateShiftForOps(row['班次名称']);
    });
    const outPm = sumFilteredPlanForDay(filteredRows, dayKey, (row) => {
        return isDailyOpsOutboundRoleRow(row) && isLateShiftForOps(row['班次名称']);
    });
    const inPm = sumFilteredPlanForDay(filteredRows, dayKey, (row) => {
        return isDailyOpsInboundRoleRow(row) && isLateShiftForOps(row['班次名称']);
    });

    const machineAm = sumFilteredPlanForDay(filteredRows, dayKey, (row) => {
        return isDailyOpsMachineRoleRow(row) && !isLateShiftForOps(row['班次名称']);
    });

    const dumpingAm = sumFilteredPlanForDay(filteredRows, dayKey, (row) => {
        return isDailyOpsDumpingRoleRow(row) && !isLateShiftForOps(row['班次名称']);
    });

    const machinePm = sumFilteredPlanForDay(filteredRows, dayKey, (row) => {
        return isDailyOpsMachineRoleRow(row) && isLateShiftForOps(row['班次名称']);
    });

    const dumpingPm = sumFilteredPlanForDay(filteredRows, dayKey, (row) => {
        return isDailyOpsDumpingRoleRow(row) && isLateShiftForOps(row['班次名称']);
    });

    if (pickEl) pickEl.textContent = formatPickDeskGroupsDisplay(roughSplit.convertible);
    if (forkAm6El) forkAm6El.textContent = String(forkAm6);
    if (forkAm8El) forkAm8El.textContent = String(forkAm8);
    if (forkPm1630El) forkPm1630El.textContent = String(forkPm1630);
    if (forkOtherEl) forkOtherEl.textContent = showForkliftOtherSection ? String(forkOther) : '—';
    if (outAmEl) outAmEl.textContent = String(outAm);
    if (inAmEl) inAmEl.textContent = String(inAm);
    if (outPmEl) outPmEl.textContent = String(outPm);
    if (inPmEl) inPmEl.textContent = String(inPm);

    const predOutAm = getDailyOpsPredicate('outAm');
    const predInAm = getDailyOpsPredicate('inAm');
    const predOutPm = getDailyOpsPredicate('outPm');
    const predInPm = getDailyOpsPredicate('inPm');
    const predMachAm = getDailyOpsPredicate('machAm');
    const predDumpAm = getDailyOpsPredicate('dumpAm');
    const predMachPm = getDailyOpsPredicate('machPm');
    const predDumpPm = getDailyOpsPredicate('dumpPm');

    setDailyOpsShiftTimeSuffix('daily-ops-pick-shift-time', filteredRows, dayKey, isDailyOpsPickCardShiftContextRow);
    setDailyOpsShiftTimeSuffix(
        'daily-ops-forklift-am-h-time',
        filteredRows,
        dayKey,
        (r) => isDailyOpsForkliftRoleRow(r) && !isLateShiftForOps(r['班次名称'])
    );
    setDailyOpsShiftTimeSuffix(
        'daily-ops-forklift-pm-h-time',
        filteredRows,
        dayKey,
        getDailyOpsPredicate('forkPm1630')
    );
    setDailyOpsShiftTimeSuffix('daily-ops-forklift-other-h-time', filteredRows, dayKey, getDailyOpsPredicate('forkOther'));
    setDailyOpsShiftTimeSuffix(
        'daily-ops-inout-am-h-time',
        filteredRows,
        dayKey,
        (r) => predOutAm(r) || predInAm(r)
    );
    setDailyOpsShiftTimeSuffix(
        'daily-ops-inout-pm-h-time',
        filteredRows,
        dayKey,
        (r) => predOutPm(r) || predInPm(r)
    );
    setDailyOpsShiftTimeSuffix(
        'daily-ops-mach-heading-am-time',
        filteredRows,
        dayKey,
        (r) => predMachAm(r) || predDumpAm(r)
    );
    setDailyOpsShiftTimeSuffix(
        'daily-ops-mach-heading-pm-time',
        filteredRows,
        dayKey,
        (r) => predMachPm(r) || predDumpPm(r)
    );
    setDailyOpsShiftTimeSuffix('daily-ops-machine-am-shift-time', filteredRows, dayKey, predMachAm);
    setDailyOpsShiftTimeSuffix('daily-ops-dumping-am-shift-time', filteredRows, dayKey, predDumpAm);
    setDailyOpsShiftTimeSuffix('daily-ops-machine-pm-shift-time', filteredRows, dayKey, predMachPm);
    setDailyOpsShiftTimeSuffix('daily-ops-dumping-pm-shift-time', filteredRows, dayKey, predDumpPm);

    const pickLinesEl = document.getElementById('daily-ops-pick-companies');
    const forkAm6LinesEl = document.getElementById('daily-ops-forklift-am6-cos');
    const forkAm8LinesEl = document.getElementById('daily-ops-forklift-am8-cos');
    const forkPm1630LinesEl = document.getElementById('daily-ops-forklift-pm1630-cos');
    const forkOtherLinesEl = document.getElementById('daily-ops-forklift-other-cos');
    renderPickDeskCompanyLines(pickLinesEl, filteredRows, dayKey);
    renderDailyOpsCompanyLines(forkAm6LinesEl, filteredRows, dayKey, 'forkAm6', 'fork');
    renderDailyOpsCompanyLines(forkAm8LinesEl, filteredRows, dayKey, 'forkAm8', 'fork');
    renderDailyOpsCompanyLines(forkPm1630LinesEl, filteredRows, dayKey, 'forkPm1630', 'fork');
    if (showForkliftOtherSection) {
        renderDailyOpsCompanyLines(forkOtherLinesEl, filteredRows, dayKey, 'forkOther', 'fork');
    } else if (forkOtherLinesEl) {
        forkOtherLinesEl.innerHTML = '';
    }

    const outAmLinesEl = document.getElementById('daily-ops-out-am-cos');
    const inAmLinesEl = document.getElementById('daily-ops-in-am-cos');
    const outPmLinesEl = document.getElementById('daily-ops-out-pm-cos');
    const inPmLinesEl = document.getElementById('daily-ops-in-pm-cos');
    renderDailyOpsCompanyLines(outAmLinesEl, filteredRows, dayKey, 'outAm', 'fork');
    renderDailyOpsCompanyLines(inAmLinesEl, filteredRows, dayKey, 'inAm', 'fork');
    renderDailyOpsCompanyLines(outPmLinesEl, filteredRows, dayKey, 'outPm', 'fork');
    renderDailyOpsCompanyLines(inPmLinesEl, filteredRows, dayKey, 'inPm', 'fork');

    const machAmLines = document.getElementById('daily-ops-machine-am-cos');
    const dumpAmLines = document.getElementById('daily-ops-dumping-am-cos');
    const machPmLines = document.getElementById('daily-ops-machine-pm-cos');
    const dumpPmLines = document.getElementById('daily-ops-dumping-pm-cos');
    renderDailyOpsCompanyLines(machAmLines, filteredRows, dayKey, 'machAm', 'machine6');
    renderDailyOpsCompanyLines(dumpAmLines, filteredRows, dayKey, 'dumpAm', 'dump3');
    renderDailyOpsCompanyLines(machPmLines, filteredRows, dayKey, 'machPm', 'machine6');
    renderDailyOpsCompanyLines(dumpPmLines, filteredRows, dayKey, 'dumpPm', 'dump3');

    const pickProvEl = document.getElementById('daily-ops-pick-provided-groups');
    const forkAm6ProvEl = document.getElementById('daily-ops-forklift-am6-provided-groups');
    const forkAm8ProvEl = document.getElementById('daily-ops-forklift-am8-provided-groups');
    const forkPm1630ProvEl = document.getElementById('daily-ops-forklift-pm1630-provided-groups');
    const forkOtherProvEl = document.getElementById('daily-ops-forklift-other-provided-groups');
    if (pickProvEl) {
        pickProvEl.textContent =
            roughSplit.directJob > 0
                ? `Direct Job 合计 ${Math.max(0, Math.round(roughSplit.directJob))} 人（不计入拣桌组）`
                : '';
    }
    const forkProvLine = (el, n, label) => {
        if (el) el.textContent = n > 0 ? `合计：${n} 人（${label}）` : '';
    };
    forkProvLine(forkAm6ProvEl, forkAm6, dailyOpsPredicateLabel('forkAm6'));
    forkProvLine(forkAm8ProvEl, forkAm8, dailyOpsPredicateLabel('forkAm8'));
    forkProvLine(forkPm1630ProvEl, forkPm1630, dailyOpsPredicateLabel('forkPm1630'));
    if (forkOtherProvEl) {
        forkOtherProvEl.textContent =
            showForkliftOtherSection && forkOther > 0
                ? `合计：${forkOther} 人（${dailyOpsPredicateLabel('forkOther')}）`
                : '';
    }
    const outAmProvEl = document.getElementById('daily-ops-out-am-provided-groups');
    const inAmProvEl = document.getElementById('daily-ops-in-am-provided-groups');
    const outPmProvEl = document.getElementById('daily-ops-out-pm-provided-groups');
    const inPmProvEl = document.getElementById('daily-ops-in-pm-provided-groups');
    if (outAmProvEl) outAmProvEl.textContent = '';
    if (inAmProvEl) inAmProvEl.textContent = '';
    if (outPmProvEl) outPmProvEl.textContent = '';
    if (inPmProvEl) inPmProvEl.textContent = '';

    applyDailyOpsMachDumpShift({
        machinePeople: machineAm,
        dumpingPeople: dumpingAm,
        machineValEl: document.getElementById('daily-ops-machine-am-val'),
        dumpingValEl: document.getElementById('daily-ops-dumping-am-val'),
        machineProvidedEl: document.getElementById('daily-ops-machine-am-provided-groups'),
        dumpingProvidedEl: document.getElementById('daily-ops-dumping-am-provided-groups'),
    });

    applyDailyOpsMachDumpShift({
        machinePeople: machinePm,
        dumpingPeople: dumpingPm,
        machineValEl: document.getElementById('daily-ops-machine-pm-val'),
        dumpingValEl: document.getElementById('daily-ops-dumping-pm-val'),
        machineProvidedEl: document.getElementById('daily-ops-machine-pm-provided-groups'),
        dumpingProvidedEl: document.getElementById('daily-ops-dumping-pm-provided-groups'),
    });

    updateDailyOpsCopyButtonState();
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
    const dailyOpsPanel = document.getElementById('daily-ops-panel');
    if (dailyOpsPanel) {
        dailyOpsPanel.addEventListener('change', onDailyOpsCompanyGroupsChange);
    }
    const btnDailyOpsCopy = document.getElementById('btn-daily-ops-copy-days');
    if (btnDailyOpsCopy) {
        btnDailyOpsCopy.addEventListener('click', () => openDailyOpsCopyModal());
    }
    const dailyOpsCopyModal = document.getElementById('daily-ops-copy-modal');
    if (dailyOpsCopyModal) {
        dailyOpsCopyModal.addEventListener('click', (e) => {
            if (e.target === dailyOpsCopyModal) closeDailyOpsCopyModal();
        });
    }
    const dailyOpsCopyCancel = document.getElementById('daily-ops-copy-cancel');
    const dailyOpsCopyConfirm = document.getElementById('daily-ops-copy-confirm');
    if (dailyOpsCopyCancel) dailyOpsCopyCancel.addEventListener('click', closeDailyOpsCopyModal);
    if (dailyOpsCopyConfirm) dailyOpsCopyConfirm.addEventListener('click', confirmDailyOpsCopyModal);
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
    if (elements.weekStartDate) {
        elements.weekStartDate.addEventListener('change', (e) => {
            const mon = mondayYmdFromCalendarDate(e.target.value);
            state.weekStartDate = mon || String(e.target.value || '').trim();
            if (mon) elements.weekStartDate.value = mon;
            renderTable();
        });
    }
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
            const dopCopyModal = document.getElementById('daily-ops-copy-modal');
            if (dopCopyModal && dopCopyModal.classList.contains('active')) {
                closeDailyOpsCopyModal();
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
