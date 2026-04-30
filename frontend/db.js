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

    function hasPayTypeField(rows) {
        if (!Array.isArray(rows) || rows.length === 0) return true;
        return rows.some((r) => r && typeof r === 'object' && Object.prototype.hasOwnProperty.call(r, '计薪类型'));
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

    async function loadScheduleData(accountSet = 'CNO.H') {
        const set = normalizeAccountSet(accountSet);
        if (isForceLocalMode()) {
            backendMode = false;
            return await loadScheduleDataSqlJs(set);
        }
        if (isHttpPage()) {
            try {
                const rows = await tryBackendLoad(set);
                if (!hasPayTypeField(rows)) {
                    console.warn('[scheduleDb] 后端返回不包含「计薪类型」字段，切换到本地 SQLite 模式保存。');
                    backendMode = false;
                    serverStorageInfo = null;
                    setForceLocalMode(true);
                    // 把当前后端数据落一份到本地，避免刷新后丢失
                    await saveLaborDataSqlJs(Array.isArray(rows) ? rows : [], set);
                    return await loadScheduleDataSqlJs(set);
                }
                backendMode = true;
                setForceLocalMode(false);
                await fetchServerStorageInfo();
                if (Array.isArray(rows) && rows.length > 0) return rows;
                if (
                    typeof initialData !== 'undefined' &&
                    Array.isArray(initialData)
                ) {
                    return initialData;
                }
                return [];
            } catch (e) {
                console.warn(
                    '[scheduleDb] 无法连接后端 API，改用浏览器内 SQLite（sql.js）',
                    e
                );
                backendMode = false;
                serverStorageInfo = null;
            }
        }
        return await loadScheduleDataSqlJs(set);
    }

    async function saveLaborDataToDb(arr, accountSet = 'CNO.H') {
        const set = normalizeAccountSet(accountSet);
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
                    // 常见于旧服务（无 API 路由）或代理未放行 PUT：自动退回本地保存
                    if (r.status === 404 || r.status === 405 || r.status >= 500) {
                        backendMode = false;
                        serverStorageInfo = null;
                        setForceLocalMode(true);
                        const diskOk = await saveLaborDataSqlJs(arr, set);
                        if (!diskOk) {
                            console.warn(
                                '[scheduleDb] 已写入浏览器 IndexedDB，但磁盘 schedule.sqlite 未同步（请启动后端）'
                            );
                        }
                        return;
                    }
                    throw new Error('保存失败 HTTP ' + r.status);
                }
                return;
            } catch (e) {
                // 网络层失败也回退本地模式
                backendMode = false;
                serverStorageInfo = null;
                setForceLocalMode(true);
                const diskOk = await saveLaborDataSqlJs(arr, set);
                if (!diskOk) {
                    console.warn(
                        '[scheduleDb] 已写入浏览器 IndexedDB，但磁盘 schedule.sqlite 未同步（请启动后端）'
                    );
                }
                return;
            }
        }
        const diskOk = await saveLaborDataSqlJs(arr, set);
        if (!diskOk) {
            console.warn(
                '[scheduleDb] 已写入浏览器 IndexedDB，但磁盘 schedule.sqlite 未同步（请启动后端）'
            );
        }
    }

    async function importSqliteFile(file) {
        if (backendMode) {
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
        const r = await fetch(`/api/labor-history?account_set=${encodeURIComponent(set)}`, { cache: 'no-store' });
        if (!r.ok) {
            if (r.status === 404) {
                historyApiSupported = false;
                return [];
            }
            throw new Error('历史查询失败 HTTP ' + r.status);
        }
        const rows = await r.json();
        return Array.isArray(rows) ? rows : [];
    }

    async function loadLaborHistoryById(id, accountSet = 'CNO.H') {
        const set = normalizeAccountSet(accountSet);
        if (!backendMode || !historyApiSupported) return [];
        const r = await fetch(`/api/labor-history?id=${encodeURIComponent(String(id))}&account_set=${encodeURIComponent(set)}`, {
            cache: 'no-store'
        });
        if (!r.ok) {
            if (r.status === 404) {
                historyApiSupported = false;
                return [];
            }
            throw new Error('历史详情查询失败 HTTP ' + r.status);
        }
        const rows = await r.json();
        return Array.isArray(rows) ? rows : [];
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

    function ensureSqlModule() {
        if (typeof initSqlJs === 'undefined') {
            return Promise.reject(new Error('sql.js 未加载'));
        }
        if (!sqlModulePromise) {
            sqlModulePromise = initSqlJs({
                locateFile: (file) =>
                    `https://cdn.jsdelivr.net/npm/sql.js@1.10.3/dist/${file}`
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
        return s === '计件' ? '计件' : '计时';
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
