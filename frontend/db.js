(function () {
    let backendMode = false;
    let historyApiSupported = true;
    const FORCE_LOCAL_MODE_KEY = 'scheduleForceLocalMode';
    /** @type {{ databasePath?: string, relativeToProject?: string } | null} */
    let serverStorageInfo = null;

    function isHttpPage() {
        return (
            typeof window !== 'undefined' &&
            (window.location.protocol === 'http:' ||
                window.location.protocol === 'https:')
        );
    }

    function normalizeAccountSet(raw) {
        const v = String(raw || '').trim().toUpperCase();
        return v === 'SFO.H' ? 'SFO.H' : 'CNO.H';
    }

    function isForceLocalMode() {
        try {
            return localStorage.getItem(FORCE_LOCAL_MODE_KEY) === '1';
        } catch (_) {
            return false;
        }
    }

    function setForceLocalMode(on) {
        try {
            if (on) localStorage.setItem(FORCE_LOCAL_MODE_KEY, '1');
            else localStorage.removeItem(FORCE_LOCAL_MODE_KEY);
        } catch (_) {
            // ignore storage failures
        }
    }

    async function tryBackendLoad(accountSet) {
        const set = normalizeAccountSet(accountSet);
        const r = await fetch(`/api/labor?account_set=${encodeURIComponent(set)}`, { cache: 'no-store' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return await r.json();
    }

    async function fetchServerStorageInfo() {
        serverStorageInfo = null;
        try {
            const r = await fetch('/api/server-info', { cache: 'no-store' });
            if (!r.ok) return null;
            serverStorageInfo = await r.json();
            return serverStorageInfo;
        } catch (e) {
            return null;
        }
    }

    /** 逐行补全缺省字段（原先「只要有一行带键就跳过」会导致其它行仍缺 计薪类型） */
    function ensurePayTypeOnRows(rows) {
        const list = Array.isArray(rows) ? rows : [];
        let patched = false;
        const out = list.map((r) => {
            if (!r || typeof r !== 'object') return r;
            if (!Object.prototype.hasOwnProperty.call(r, '计薪类型')) {
                patched = true;
                return { ...r, 计薪类型: '计时' };
            }
            return r;
        });
        if (patched) {
            if (typeof console !== 'undefined' && typeof console.debug === 'function') {
                console.debug(
                    '[scheduleDb] 已从服务器载入的行中补足缺省的 计薪类型 → 计时（旧数据或未写该字段时常见）。'
                );
            }
        }
        return out;
    }

    async function loadScheduleData(accountSet = 'CNO.H') {
        const set = normalizeAccountSet(accountSet);

        /** http(s) 访问：只允许服务端 schedule.sqlite，不写浏览器 IndexedDB */
        if (isHttpPage()) {
            setForceLocalMode(false);
            try {
                const rows = await tryBackendLoad(set);
                const normalized = ensurePayTypeOnRows(rows);
                backendMode = true;
                await fetchServerStorageInfo();
                if (normalized.length > 0) return normalized;
                if (
                    typeof initialData !== 'undefined' &&
                    Array.isArray(initialData)
                ) {
                    return initialData;
                }
                return [];
            } catch (e) {
                console.error('[scheduleDb] HTTP page requires backend API', e);
                backendMode = false;
                serverStorageInfo = null;
                throw new Error(
                    '无法连接排班后端（请在本机运行 python backend/server.py，并用 http://服务器IP:8787/ 打开页面）。'
                );
            }
        }

        if (isForceLocalMode()) {
            backendMode = false;
            return await loadScheduleDataSqlJs(set);
        }

        try {
            const rows = await tryBackendLoad(set);
            const normalized = ensurePayTypeOnRows(rows);
            backendMode = true;
            setForceLocalMode(false);
            await fetchServerStorageInfo();
            if (normalized.length > 0) return normalized;
            if (
                typeof initialData !== 'undefined' &&
                Array.isArray(initialData)
            ) {
                return initialData;
            }
            return [];
        } catch (e) {
            console.warn(
                '[scheduleDb] Backend unreachable (file/offline mode); using in-browser SQLite.',
                e
            );
            backendMode = false;
            serverStorageInfo = null;
        }
        return await loadScheduleDataSqlJs(set);
    }

    async function saveLaborDataToDb(arr, accountSet = 'CNO.H') {
        const set = normalizeAccountSet(accountSet);

        if (isHttpPage()) {
            try {
                const r = await fetch(`/api/labor?account_set=${encodeURIComponent(set)}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8'
                    },
                    body: JSON.stringify(arr)
                });
                if (!r.ok) {
                    throw new Error(
                        (r.status === 404 || r.status === 405
                            ? '保存失败：服务器无法写入（请使用本项目 backend/server.py）。 '
                            : '保存失败 ') + 'HTTP ' + r.status
                    );
                }
                backendMode = true;
            } catch (e) {
                if (e instanceof TypeError) {
                    throw new Error(
                        '保存失败：无法连接服务器（请确认本机已启动 python backend/server.py，并用 http://地址:8787 访问）。'
                    );
                }
                throw e;
            }
            return;
        }

        if (backendMode) {
            try {
                const r = await fetch(`/api/labor?account_set=${encodeURIComponent(set)}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json; charset=utf-8'
                    },
                    body: JSON.stringify(arr)
                });
                if (!r.ok) {
                    if (r.status === 404 || r.status === 405 || r.status >= 500) {
                        backendMode = false;
                        serverStorageInfo = null;
                        setForceLocalMode(true);
                        const diskOk = await saveLaborDataSqlJs(arr, set);
                        if (!diskOk) {
                            console.warn(
                                '[scheduleDb] Saved to IndexedDB only; schedule.sqlite sync failed (start backend).'
                            );
                        }
                        return;
                    }
                    throw new Error('保存失败 HTTP ' + r.status);
                }
                return;
            } catch (e) {
                backendMode = false;
                serverStorageInfo = null;
                setForceLocalMode(true);
                const diskOk = await saveLaborDataSqlJs(arr, set);
                if (!diskOk) {
                    console.warn(
                        '[scheduleDb] Saved to IndexedDB only; schedule.sqlite sync failed (start backend).'
                    );
                }
                return;
            }
        }
        const diskOk = await saveLaborDataSqlJs(arr, set);
        if (!diskOk) {
            console.warn(
                '[scheduleDb] Saved to IndexedDB only; schedule.sqlite sync failed (start backend).'
            );
        }
    }

    async function importSqliteFile(file) {
        if (isHttpPage() || backendMode) {
            const buf = await file.arrayBuffer();
            const r = await fetch('/api/database-import', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream'
                },
                body: buf
            });
            if (!r.ok) {
                const t = await r.text();
                throw new Error(t || '导入失败 HTTP ' + r.status);
            }
            const j = await r.json();
            return Array.isArray(j.rows) ? j.rows : [];
        }
        return await importSqliteFileSqlJs(file);
    }

    async function loadLaborHistoryList(accountSet = 'CNO.H') {
        const set = normalizeAccountSet(accountSet);
        if (!backendMode || !historyApiSupported) return [];
        try {
            const r = await fetch(`/api/labor-history?account_set=${encodeURIComponent(set)}`, {
                cache: 'no-store'
            });
            if (!r.ok) {
                historyApiSupported = false;
                return [];
            }
            const rows = await r.json();
            return Array.isArray(rows) ? rows : [];
        } catch {
            historyApiSupported = false;
            return [];
        }
    }

    async function loadLaborHistoryById(id, accountSet = 'CNO.H') {
        const set = normalizeAccountSet(accountSet);
        if (!backendMode || !historyApiSupported) return [];
        try {
            const r = await fetch(
                `/api/labor-history?id=${encodeURIComponent(String(id))}&account_set=${encodeURIComponent(set)}`,
                { cache: 'no-store' }
            );
            if (!r.ok) {
                historyApiSupported = false;
                return [];
            }
            const rows = await r.json();
            return Array.isArray(rows) ? rows : [];
        } catch {
            historyApiSupported = false;
            return [];
        }
    }

    /* ---------- 以下为浏览器内 sql.js + IndexedDB（直连 HTML / CDN 失败时） ---------- */

    const IDB_NAME = 'schedule-app-sqlite';
    const IDB_VER = 1;
    const STORE = 'blobs';
    const SQLITE_KEY = 'labor.sqlite';

    let sqlDbInstance = null;
    let sqlModulePromise = null;

    function idbOpen() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(IDB_NAME, IDB_VER);
            req.onerror = () => reject(req.error);
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE);
                }
            };
            req.onsuccess = () => resolve(req.result);
        });
    }

    function idbGet(key) {
        return idbOpen().then(
            (db) =>
                new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE, 'readonly');
                    const r = tx.objectStore(STORE).get(key);
                    r.onsuccess = () => resolve(r.result);
                    r.onerror = () => reject(r.error);
                })
        );
    }

    function idbPut(key, value) {
        return idbOpen().then(
            (db) =>
                new Promise((resolve, reject) => {
                    const tx = db.transaction(STORE, 'readwrite');
                    tx.objectStore(STORE).put(value, key);
                    tx.oncomplete = () => resolve();
                    tx.onerror = () => reject(tx.error);
                })
        );
    }

    function loadSqlJsScriptOnce() {
        return new Promise((resolve, reject) => {
            if (typeof initSqlJs !== 'undefined') {
                resolve();
                return;
            }
            const existed = document.querySelector('script[data-schedule-sqljs="1"]');
            if (existed) {
                existed.addEventListener('load', () => resolve());
                existed.addEventListener('error', () => reject(new Error('sql.js script failed')));
                return;
            }
            const s = document.createElement('script');
            s.src = 'https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/sql-wasm.js';
            s.async = true;
            s.crossOrigin = 'anonymous';
            s.dataset.scheduleSqljs = '1';
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('Failed to load sql.js (offline/file mode only)'));
            document.head.appendChild(s);
        });
    }

    function ensureSqlModule() {
        if (isHttpPage()) {
            return Promise.reject(
                new Error('Browser SQLite is disabled on http(s); use backend schedule.sqlite only.')
            );
        }
        if (!sqlModulePromise) {
            sqlModulePromise = loadSqlJsScriptOnce().then(() => {
                if (typeof initSqlJs === 'undefined') {
                    throw new Error('sql.js failed to initialize');
                }
                return initSqlJs({
                    locateFile: (file) =>
                        `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${file}`
                });
            });
        }
        return sqlModulePromise;
    }

    function ensureSchema(db) {
        db.run(`CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)`);
        db.run(`
            CREATE TABLE IF NOT EXISTS labor_schedule (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                account_set TEXT NOT NULL DEFAULT 'CNO.H',
                company TEXT NOT NULL DEFAULT '',
                shift_name TEXT NOT NULL DEFAULT '常规班次',
                pay_type TEXT NOT NULL DEFAULT '计时',
                job_content TEXT NOT NULL DEFAULT '',
                note TEXT NOT NULL DEFAULT '',
                change_reason TEXT NOT NULL DEFAULT '',
                mon_plan REAL NOT NULL DEFAULT 0,
                mon_actual REAL NOT NULL DEFAULT 0,
                tue_plan REAL NOT NULL DEFAULT 0,
                tue_actual REAL NOT NULL DEFAULT 0,
                wed_plan REAL NOT NULL DEFAULT 0,
                wed_actual REAL NOT NULL DEFAULT 0,
                thu_plan REAL NOT NULL DEFAULT 0,
                thu_actual REAL NOT NULL DEFAULT 0,
                fri_plan REAL NOT NULL DEFAULT 0,
                fri_actual REAL NOT NULL DEFAULT 0,
                sat_plan REAL NOT NULL DEFAULT 0,
                sat_actual REAL NOT NULL DEFAULT 0,
                sun_plan REAL NOT NULL DEFAULT 0,
                sun_actual REAL NOT NULL DEFAULT 0
            )
        `);
        try {
            db.run(`ALTER TABLE labor_schedule ADD COLUMN pay_type TEXT NOT NULL DEFAULT '计时'`);
        } catch (_) {
            // ignore when column already exists
        }
        try {
            db.run(`ALTER TABLE labor_schedule ADD COLUMN account_set TEXT NOT NULL DEFAULT 'CNO.H'`);
        } catch (_) {
            // ignore when column already exists
        }
        try {
            db.run(`ALTER TABLE labor_schedule ADD COLUMN row_uid TEXT NOT NULL DEFAULT ''`);
        } catch (_) {
            // ignore when column already exists
        }
    }

    function readLaborFromKv() {
        const stmt = sqlDbInstance.prepare('SELECT v FROM kv WHERE k = ?');
        stmt.bind(['laborData']);
        if (!stmt.step()) {
            stmt.free();
            return null;
        }
        const row = stmt.get();
        stmt.free();
        try {
            return JSON.parse(row[0]);
        } catch (e) {
            console.warn('解析 laborData 失败', e);
            return null;
        }
    }

    function toNum(v) {
        const n = Number(v);
        return Number.isFinite(n) ? n : 0;
    }

    function normalizePayTypeField(raw) {
        let s = String(raw ?? '').trim().replace(/\u3000/g, '');
        if (typeof s.normalize === 'function') s = s.normalize('NFKC');
        const lower = s.toLowerCase();
        if (s === '计件' || s === '計件' || lower === 'piece' || lower === 'piecework') return '计件';
        return '计时';
    }

    function rowToRecord(row) {
        return {
            _rowUid: String(row.row_uid || '').trim(),
            '劳务公司/归属': row.company || '',
            '班次名称': row.shift_name || '常规班次',
            '计薪类型': normalizePayTypeField(row.pay_type),
            '岗位/工作内容': row.job_content || '',
            '备注': row.note || '',
            '变化原因': row.change_reason || '',
            '星期一': toNum(row.mon_plan),
            '星期一_实到': toNum(row.mon_actual),
            '星期二': toNum(row.tue_plan),
            '星期二_实到': toNum(row.tue_actual),
            '星期三': toNum(row.wed_plan),
            '星期三_实到': toNum(row.wed_actual),
            '星期四': toNum(row.thu_plan),
            '星期四_实到': toNum(row.thu_actual),
            '星期五': toNum(row.fri_plan),
            '星期五_实到': toNum(row.fri_actual),
            '星期六': toNum(row.sat_plan),
            '星期六_实到': toNum(row.sat_actual),
            '星期日': toNum(row.sun_plan),
            '星期日_实到': toNum(row.sun_actual)
        };
    }

    function recordToParams(item, accountSet) {
        const row = item && typeof item === 'object' ? item : {};
        const payType = normalizePayTypeField(row['计薪类型']);
        const set = normalizeAccountSet(accountSet);
        return [
            set,
            String(row._rowUid || row.row_uid || '').trim(),
            String(row['劳务公司/归属'] || '').trim(),
            String(row['班次名称'] || '常规班次').trim() || '常规班次',
            payType,
            String(row['岗位/工作内容'] || '').replace(/\u0000/g, '').trim(),
            String((row['备注'] ?? row['单位/备注'] ?? '') || '').replace(/\u0000/g, '').trim(),
            String(row['变化原因'] || '').trim(),
            toNum(row['星期一']),
            toNum(row['星期一_实到']),
            toNum(row['星期二']),
            toNum(row['星期二_实到']),
            toNum(row['星期三']),
            toNum(row['星期三_实到']),
            toNum(row['星期四']),
            toNum(row['星期四_实到']),
            toNum(row['星期五']),
            toNum(row['星期五_实到']),
            toNum(row['星期六']),
            toNum(row['星期六_实到']),
            toNum(row['星期日']),
            toNum(row['星期日_实到'])
        ];
    }

    function readLaborFromTable(accountSet) {
        const set = normalizeAccountSet(accountSet);
        const rows = sqlDbInstance.exec(`
            SELECT company, shift_name, job_content, note, change_reason,
                   pay_type, row_uid,
                   mon_plan, mon_actual, tue_plan, tue_actual, wed_plan, wed_actual,
                   thu_plan, thu_actual, fri_plan, fri_actual, sat_plan, sat_actual,
                   sun_plan, sun_actual
            FROM labor_schedule
            WHERE account_set = '${set.replace("'", "''")}'
            ORDER BY id
        `);
        if (!rows || !rows.length) return [];
        const table = rows[0];
        return table.values.map((vals) => {
            const obj = {};
            table.columns.forEach((c, i) => {
                obj[c] = vals[i];
            });
            return rowToRecord(obj);
        });
    }

    function replaceLaborTable(arr, accountSet) {
        const set = normalizeAccountSet(accountSet);
        sqlDbInstance.run(`DELETE FROM labor_schedule WHERE account_set = '${set.replace("'", "''")}'`);
        const stmt = sqlDbInstance.prepare(`
            INSERT INTO labor_schedule (
                account_set, row_uid, company, shift_name, pay_type, job_content, note, change_reason,
                mon_plan, mon_actual, tue_plan, tue_actual, wed_plan, wed_actual,
                thu_plan, thu_actual, fri_plan, fri_actual, sat_plan, sat_actual,
                sun_plan, sun_actual
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);
        (Array.isArray(arr) ? arr : []).forEach((item) => {
            stmt.run(recordToParams(item, set));
        });
        stmt.free();
    }

    function migrateKvToTableIfNeeded(accountSet) {
        const set = normalizeAccountSet(accountSet);
        const hasRows = sqlDbInstance.exec(`SELECT COUNT(*) AS c FROM labor_schedule WHERE account_set='${set.replace("'", "''")}'`);
        const count = hasRows && hasRows[0] && hasRows[0].values && hasRows[0].values[0]
            ? Number(hasRows[0].values[0][0] || 0)
            : 0;
        if (count > 0) return;
        if (set !== 'CNO.H') return;
        const legacy = readLaborFromKv();
        if (!Array.isArray(legacy) || !legacy.length) return;
        replaceLaborTable(legacy, set);
    }

    async function persistSqliteToIdb() {
        const exported = sqlDbInstance.export();
        await idbPut(SQLITE_KEY, exported);
    }

    /**
     * sql.js 保存后把当前库同步到后端磁盘 schedule.sqlite。
     * @returns {Promise<boolean>} 无需同步或非 HTTP 页视为成功 true；已尝试同步且失败为 false
     */
    async function syncSqliteFileToServer() {
        if (!isHttpPage()) return true;
        if (!sqlDbInstance) return true;
        let exported;
        try {
            exported = sqlDbInstance.export();
        } catch (e) {
            console.warn('[scheduleDb] SQLite export 失败', e);
            return false;
        }
        const body = exported instanceof Uint8Array ? exported : new Uint8Array(exported);
        if (body.byteLength < 100) return false;
        try {
            const r = await fetch('/api/database-sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/octet-stream' },
                body: body
            });
            if (!r.ok) {
                console.warn('[scheduleDb] 未能同步到磁盘 schedule.sqlite，HTTP', r.status);
                return false;
            }
            return true;
        } catch (e) {
            console.warn(
                '[scheduleDb] 未能同步到磁盘 schedule.sqlite（请确认本机已启动 python backend/server.py）',
                e
            );
            return false;
        }
    }

    async function loadScheduleDataSqlJs(accountSet = 'CNO.H') {
        const set = normalizeAccountSet(accountSet);
        const SQL = await ensureSqlModule();
        const buf = await idbGet(SQLITE_KEY);

        if (buf) {
            const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
            sqlDbInstance = new SQL.Database(u8);
        } else {
            sqlDbInstance = new SQL.Database();
            ensureSchema(sqlDbInstance);
            const legacy = localStorage.getItem('laborData');
            if (legacy) {
                sqlDbInstance.run(`INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)`, [
                    'laborData',
                    legacy
                ]);
                await persistSqliteToIdb();
                localStorage.removeItem('laborData');
            }
        }
        ensureSchema(sqlDbInstance);
        migrateKvToTableIfNeeded(set);
        let rows = readLaborFromTable(set);
        if (Array.isArray(rows) && rows.length) return rows;
        const legacyRows = set === 'CNO.H' ? readLaborFromKv() : null;
        if (legacyRows && Array.isArray(legacyRows)) return legacyRows;
        if (typeof initialData !== 'undefined' && Array.isArray(initialData)) {
            return initialData;
        }
        return [];
    }

    async function saveLaborDataSqlJs(arr, accountSet = 'CNO.H') {
        const set = normalizeAccountSet(accountSet);
        const SQL = await ensureSqlModule();
        if (!sqlDbInstance) {
            sqlDbInstance = new SQL.Database();
            ensureSchema(sqlDbInstance);
        }
        ensureSchema(sqlDbInstance);
        replaceLaborTable(arr, set);
        if (set === 'CNO.H') {
            const json = JSON.stringify(arr);
            sqlDbInstance.run(`INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)`, ['laborData', json]);
        }
        await persistSqliteToIdb();
        return await syncSqliteFileToServer();
    }

    async function importSqliteFileSqlJs(file) {
        const SQL = await ensureSqlModule();
        const buf = await file.arrayBuffer();
        if (sqlDbInstance) {
            sqlDbInstance.close();
            sqlDbInstance = null;
        }
        sqlDbInstance = new SQL.Database(new Uint8Array(buf));
        ensureSchema(sqlDbInstance);
        const set = 'CNO.H';
        migrateKvToTableIfNeeded(set);
        await persistSqliteToIdb();
        await syncSqliteFileToServer();
        const rows = readLaborFromTable(set);
        if (Array.isArray(rows) && rows.length) return rows;
        const legacyRows = readLaborFromKv();
        return legacyRows && Array.isArray(legacyRows) ? legacyRows : [];
    }

    window.scheduleDb = {
        loadScheduleData,
        saveLaborDataToDb,
        importSqliteFile,
        loadLaborHistoryList,
        loadLaborHistoryById,
        isBackendMode: () => backendMode,
        getServerStorageInfo: () => serverStorageInfo,
        refreshServerStorageInfo: fetchServerStorageInfo
    };
})();
