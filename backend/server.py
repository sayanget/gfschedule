#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
本地 SQLite（项目根目录 schedule.sqlite）+ 静态前端 + REST API。
启动后访问：http://127.0.0.1:8787/
"""
from __future__ import annotations

import json
import os
import shutil
import sqlite3
import sys
import unicodedata
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import parse_qs, urlparse

ROOT = Path(__file__).resolve().parent
PROJECT_ROOT = ROOT.parent
DB_PATH = PROJECT_ROOT / "schedule.sqlite"
LEGACY_DB_PATH = ROOT / "data" / "schedule.sqlite"
FRONTEND = PROJECT_ROOT / "frontend"

HOST = "0.0.0.0"
PORT = 8787
DEFAULT_ACCOUNT_SET = "CNO.H"
SUPPORTED_ACCOUNT_SETS = {"CNO.H", "SFO.H"}


def normalize_account_set(raw: str | None) -> str:
    text = str(raw or "").strip().upper()
    return text if text in SUPPORTED_ACCOUNT_SETS else DEFAULT_ACCOUNT_SET


def db_conn():
    PROJECT_ROOT.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    ensure_schema(conn)
    conn.commit()
    return conn


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS kv (
            k TEXT PRIMARY KEY,
            v TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
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
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS labor_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_set TEXT NOT NULL DEFAULT 'CNO.H',
            saved_at TEXT NOT NULL,
            data_json TEXT NOT NULL
        )
        """
    )
    cols = {
        row[1]
        for row in conn.execute("PRAGMA table_info(labor_schedule)").fetchall()
    }
    if "pay_type" not in cols:
        conn.execute(
            "ALTER TABLE labor_schedule ADD COLUMN pay_type TEXT NOT NULL DEFAULT '计时'"
        )
    if "account_set" not in cols:
        conn.execute(
            "ALTER TABLE labor_schedule ADD COLUMN account_set TEXT NOT NULL DEFAULT 'CNO.H'"
        )
    cols = {
        row[1]
        for row in conn.execute("PRAGMA table_info(labor_schedule)").fetchall()
    }
    if "row_uid" not in cols:
        conn.execute(
            "ALTER TABLE labor_schedule ADD COLUMN row_uid TEXT NOT NULL DEFAULT ''"
        )
    history_cols = {
        row[1]
        for row in conn.execute("PRAGMA table_info(labor_history)").fetchall()
    }
    if "account_set" not in history_cols:
        conn.execute(
            "ALTER TABLE labor_history ADD COLUMN account_set TEXT NOT NULL DEFAULT 'CNO.H'"
        )


def _to_float(v) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return 0.0


def _normalize_pay_type(v: object) -> str:
    s = unicodedata.normalize("NFKC", str(v if v is not None else "计时")).strip()
    return "计件" if s == "计件" else "计时"


def _row_uid_sql(row: sqlite3.Row) -> str:
    try:
        return str(row["row_uid"] or "").strip()
    except (KeyError, IndexError):
        return ""


def _strip_nul(text: object) -> str:
    """避免 SQLite TEXT 含 NUL 时个别绑定层或查看工具显示异常。"""
    return str(text or "").replace("\x00", "")


def _record_to_tuple(row: dict, account_set: str) -> tuple:
    pay_type = _normalize_pay_type(row.get("计薪类型", "计时"))
    return (
        account_set,
        str(row.get("_rowUid") or row.get("row_uid") or "").strip(),
        str(row.get("劳务公司/归属", "") or "").strip(),
        str(row.get("班次名称", "常规班次") or "常规班次").strip(),
        pay_type,
        _strip_nul(row.get("岗位/工作内容", "")).strip(),
        _strip_nul(row.get("备注", row.get("单位/备注", ""))).strip(),
        _strip_nul(row.get("变化原因", "")).strip(),
        _to_float(row.get("星期一")),
        _to_float(row.get("星期一_实到")),
        _to_float(row.get("星期二")),
        _to_float(row.get("星期二_实到")),
        _to_float(row.get("星期三")),
        _to_float(row.get("星期三_实到")),
        _to_float(row.get("星期四")),
        _to_float(row.get("星期四_实到")),
        _to_float(row.get("星期五")),
        _to_float(row.get("星期五_实到")),
        _to_float(row.get("星期六")),
        _to_float(row.get("星期六_实到")),
        _to_float(row.get("星期日")),
        _to_float(row.get("星期日_实到")),
    )


def _tuple_to_record(row: sqlite3.Row) -> dict:
    return {
        "_rowUid": _row_uid_sql(row),
        "劳务公司/归属": row["company"],
        "班次名称": row["shift_name"],
        "计薪类型": _normalize_pay_type(row["pay_type"]),
        "岗位/工作内容": row["job_content"],
        "备注": row["note"],
        "变化原因": row["change_reason"],
        "星期一": row["mon_plan"],
        "星期一_实到": row["mon_actual"],
        "星期二": row["tue_plan"],
        "星期二_实到": row["tue_actual"],
        "星期三": row["wed_plan"],
        "星期三_实到": row["wed_actual"],
        "星期四": row["thu_plan"],
        "星期四_实到": row["thu_actual"],
        "星期五": row["fri_plan"],
        "星期五_实到": row["fri_actual"],
        "星期六": row["sat_plan"],
        "星期六_实到": row["sat_actual"],
        "星期日": row["sun_plan"],
        "星期日_实到": row["sun_actual"],
    }


def _insert_labor_rows(conn: sqlite3.Connection, data: list, account_set: str) -> None:
    account_set = normalize_account_set(account_set)
    conn.execute("DELETE FROM labor_schedule WHERE account_set = ?", (account_set,))
    conn.executemany(
        """
        INSERT INTO labor_schedule (
            account_set, row_uid, company, shift_name, pay_type, job_content, note, change_reason,
            mon_plan, mon_actual, tue_plan, tue_actual, wed_plan, wed_actual,
            thu_plan, thu_actual, fri_plan, fri_actual, sat_plan, sat_actual,
            sun_plan, sun_actual
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        [
            _record_to_tuple(item if isinstance(item, dict) else {}, account_set)
            for item in data
        ],
    )


def _migrate_kv_to_table(conn: sqlite3.Connection) -> None:
    count = conn.execute(
        "SELECT COUNT(*) FROM labor_schedule WHERE account_set = ?",
        (DEFAULT_ACCOUNT_SET,),
    ).fetchone()[0]
    if count > 0:
        return
    row = conn.execute("SELECT v FROM kv WHERE k='laborData'").fetchone()
    if not row:
        return
    try:
        data = json.loads(row[0])
    except (json.JSONDecodeError, TypeError, ValueError):
        return
    if not isinstance(data, list):
        return
    _insert_labor_rows(conn, data, DEFAULT_ACCOUNT_SET)
    conn.commit()


def read_labor(account_set: str = DEFAULT_ACCOUNT_SET) -> list:
    account_set = normalize_account_set(account_set)
    if not DB_PATH.exists():
        return []
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        ensure_schema(conn)
        _migrate_kv_to_table(conn)
        rows = conn.execute(
            """
            SELECT company, shift_name, job_content, note, change_reason,
                   pay_type, row_uid,
                   mon_plan, mon_actual, tue_plan, tue_actual, wed_plan, wed_actual,
                   thu_plan, thu_actual, fri_plan, fri_actual, sat_plan, sat_actual,
                   sun_plan, sun_actual
            FROM labor_schedule
            WHERE account_set = ?
            ORDER BY id
            """
            ,
            (account_set,),
        ).fetchall()
        if rows:
            return [_tuple_to_record(r) for r in rows]
        if account_set != DEFAULT_ACCOUNT_SET:
            return []
        legacy = conn.execute("SELECT v FROM kv WHERE k='laborData'").fetchone()
        if not legacy:
            return []
        return json.loads(legacy[0])
    except (sqlite3.Error, json.JSONDecodeError, TypeError, ValueError):
        return []
    finally:
        conn.close()


def write_labor(data: list, account_set: str = DEFAULT_ACCOUNT_SET) -> None:
    account_set = normalize_account_set(account_set)
    conn = db_conn()
    try:
        snapshot_json = json.dumps(data, ensure_ascii=False)
        _insert_labor_rows(conn, data if isinstance(data, list) else [], account_set)
        if account_set == DEFAULT_ACCOUNT_SET:
            conn.execute(
                "INSERT OR REPLACE INTO kv (k, v) VALUES ('laborData', ?)",
                (snapshot_json,),
            )
        conn.execute(
            "INSERT INTO labor_history (account_set, saved_at, data_json) VALUES (?, datetime('now', 'localtime'), ?)",
            (account_set, snapshot_json),
        )
        conn.commit()
        try:
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        except sqlite3.Error:
            pass
    finally:
        conn.close()


def replace_schedule_database_bytes(blob: bytes) -> None:
    """将完整 SQLite 文件写入 DB_PATH（浏览器 sql.js 导出同步 / 导入共用）。"""
    if len(blob) < 100:
        raise ValueError("文件过小或无效")
    if not blob.startswith(b"SQLite format 3\x00"):
        raise ValueError("不是有效的 SQLite 数据库文件")
    PROJECT_ROOT.mkdir(parents=True, exist_ok=True)
    bak = DB_PATH.with_suffix(".sqlite.bak")
    tmp = DB_PATH.with_name(DB_PATH.name + ".tmp")
    if DB_PATH.exists():
        shutil.copy2(DB_PATH, bak)
    try:
        tmp.write_bytes(blob)
        os.replace(tmp, DB_PATH)
    except Exception:
        if tmp.is_file():
            try:
                tmp.unlink()
            except OSError:
                pass
        raise
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.execute("SELECT 1 FROM sqlite_master LIMIT 1")
        try:
            conn.execute("PRAGMA wal_checkpoint(TRUNCATE)")
        except sqlite3.Error:
            pass
    finally:
        conn.close()


def read_labor_history_list(
    account_set: str = DEFAULT_ACCOUNT_SET, limit: int = 200
) -> list:
    account_set = normalize_account_set(account_set)
    if not DB_PATH.exists():
        return []
    conn = sqlite3.connect(DB_PATH)
    try:
        ensure_schema(conn)
        rows = conn.execute(
            """
            SELECT id, saved_at
            FROM labor_history
            WHERE account_set = ?
            ORDER BY id DESC
            LIMIT ?
            """,
            (account_set, max(1, min(int(limit), 1000))),
        ).fetchall()
        return [{"id": r[0], "saved_at": r[1]} for r in rows]
    except sqlite3.Error:
        return []
    finally:
        conn.close()


def read_labor_history_by_id(
    history_id: int, account_set: str = DEFAULT_ACCOUNT_SET
) -> list:
    account_set = normalize_account_set(account_set)
    if not DB_PATH.exists():
        return []
    conn = sqlite3.connect(DB_PATH)
    try:
        ensure_schema(conn)
        row = conn.execute(
            "SELECT data_json FROM labor_history WHERE id = ? AND account_set = ?",
            (int(history_id), account_set),
        ).fetchone()
        if not row:
            return []
        data = json.loads(row[0])
        return data if isinstance(data, list) else []
    except (sqlite3.Error, json.JSONDecodeError, TypeError, ValueError):
        return []
    finally:
        conn.close()


def ensure_db_file_exists() -> None:
    """保证磁盘上有有效的 schedule.sqlite（尚未保存过时也可下载空库）。"""
    if DB_PATH.exists():
        return
    conn = db_conn()
    conn.close()


def _count_labor_rows(db_file: Path) -> int:
    """优先读取 labor_schedule 条数，再回退 kv.laborData。"""
    if not db_file.is_file():
        return -1
    try:
        conn = sqlite3.connect(db_file)
        try:
            tables = {
                r[0]
                for r in conn.execute(
                    "SELECT name FROM sqlite_master WHERE type='table'"
                ).fetchall()
            }
            if "labor_schedule" in tables:
                return conn.execute("SELECT COUNT(*) FROM labor_schedule").fetchone()[0]
            if "kv" not in tables:
                return 0
            row = conn.execute("SELECT v FROM kv WHERE k='laborData'").fetchone()
        finally:
            conn.close()
        if not row:
            return 0
        data = json.loads(row[0])
        return len(data) if isinstance(data, list) else 0
    except (sqlite3.Error, json.JSONDecodeError, TypeError, ValueError, OSError):
        return -2


def migrate_legacy_database_if_needed() -> None:
    """backend/data/schedule.sqlite → 项目根目录 schedule.sqlite。

    若根目录曾被生成「空库」导致早期迁移跳过，会在「根目录条数为 0 但旧库有条目」时自动从旧库恢复。
    """
    if not LEGACY_DB_PATH.is_file():
        return

    legacy_n = _count_labor_rows(LEGACY_DB_PATH)
    if legacy_n == -2:
        print(
            "backend/data/schedule.sqlite 无法正常读取，已跳过迁移；请先备份该文件再排查。",
            file=sys.stderr,
        )
        return
    if legacy_n <= 0:
        return

    root_n = _count_labor_rows(DB_PATH)

    def recover_from_legacy(reason: str) -> None:
        bak = DB_PATH.with_name(DB_PATH.name + ".before-recovery.bak")
        if DB_PATH.exists():
            try:
                shutil.copy2(DB_PATH, bak)
            except OSError as exc:
                print(
                    "无法备份当前根目录数据库，已取消从旧库恢复:",
                    exc,
                    file=sys.stderr,
                )
                return
        try:
            shutil.copy2(LEGACY_DB_PATH, DB_PATH)
            print(
                "已从 backend/data/schedule.sqlite 恢复到项目根目录 schedule.sqlite "
                f"（共 {legacy_n} 条）。{reason}",
                file=sys.stderr,
            )
            if bak.is_file():
                print(
                    "  覆盖前的根目录文件已备份为:",
                    bak.resolve(),
                    file=sys.stderr,
                )
        except OSError as exc:
            print("从旧库恢复失败:", exc, file=sys.stderr)

    if root_n == -1:
        try:
            shutil.copy2(LEGACY_DB_PATH, DB_PATH)
            print(
                "已从 backend/data/schedule.sqlite 复制到项目根目录 schedule.sqlite "
                f"（共 {legacy_n} 条）。",
                file=sys.stderr,
            )
        except OSError as exc:
            print("迁移旧库失败:", exc, file=sys.stderr)
        return

    if root_n == -2:
        recover_from_legacy("原因：项目根目录 schedule.sqlite 无法正常读取。")
        return

    if root_n == 0:
        recover_from_legacy(
            "原因：项目根目录为空库，旧目录 backend/data 中仍有数据（此前迁移被跳过）。"
        )
        return

    if legacy_n > root_n:
        print(
            "提示：backend/data/schedule.sqlite 中有 %d 条记录，项目根目录中有 %d 条。"
            " 若根目录数据不完整，请关闭本服务后，手动将前者复制并覆盖 schedule.sqlite（请先备份当前 schedule.sqlite）。"
            % (legacy_n, root_n),
            file=sys.stderr,
        )
    elif legacy_n < root_n:
        print(
            "数据已在项目根目录（%d 条）；backend/data 中旧库（%d 条）较旧，未覆盖。"
            % (root_n, legacy_n),
            file=sys.stderr,
        )


class ScheduleHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        kwargs.setdefault("directory", str(FRONTEND))
        super().__init__(*args, **kwargs)

    def log_message(self, fmt, *args_):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args_))

    def _send_json_error(self, code: int, message: str) -> None:
        """API 路由返回 JSON，避免浏览器显示 HTML 错误页难以辨认。"""
        body = json.dumps(
            {"ok": False, "error": message},
            ensure_ascii=False,
        ).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        query = parse_qs(parsed.query or "")
        account_set = normalize_account_set(
            (query.get("account_set") or [DEFAULT_ACCOUNT_SET])[0]
        )

        if path == "/api/server-info":
            db_abs = str(DB_PATH.resolve())
            root_abs = str(ROOT.parent.resolve())
            try:
                rel = os.path.relpath(db_abs, root_abs).replace("\\", "/")
            except ValueError:
                rel = "schedule.sqlite"
            payload = {
                "databasePath": db_abs,
                "relativeToProject": rel,
            }
            raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(raw)
            return

        if path == "/api/labor":
            rows = read_labor(account_set)
            raw = json.dumps(rows, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(raw)
            return

        if path == "/api/labor-history":
            if "id" in query:
                try:
                    history_id = int(query["id"][0])
                except ValueError:
                    self._send_json_error(400, "id 参数无效")
                    return
                rows = read_labor_history_by_id(history_id, account_set)
                raw = json.dumps(rows, ensure_ascii=False).encode("utf-8")
                self.send_response(200)
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(raw)))
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(raw)
                return
            history = read_labor_history_list(account_set)
            raw = json.dumps(history, ensure_ascii=False).encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(raw)
            return

        # 浏览器默认请求 /favicon.ico；提供与 favicon.svg 相同内容，避免控制台 404
        if path == "/favicon.ico":
            svg = FRONTEND / "favicon.svg"
            if svg.is_file():
                data = svg.read_bytes()
                self.send_response(200)
                self.send_header("Content-Type", "image/svg+xml")
                self.send_header("Content-Length", str(len(data)))
                self.send_header("Cache-Control", "public, max-age=86400")
                self.end_headers()
                self.wfile.write(data)
                return

        return SimpleHTTPRequestHandler.do_GET(self)

    def do_PUT(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"
        query = parse_qs(parsed.query or "")
        account_set = normalize_account_set(
            (query.get("account_set") or [DEFAULT_ACCOUNT_SET])[0]
        )

        if path != "/api/labor":
            self.send_error(404)
            return

        length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(length).decode("utf-8")
        try:
            data = json.loads(body)
            if not isinstance(data, list):
                raise ValueError("JSON 应为数组")
            write_labor(data, account_set)
        except (json.JSONDecodeError, ValueError) as e:
            self.send_error(400, str(e))
            return

        self.send_response(204)
        self.end_headers()

    def do_POST(self):
        parsed = urlparse(self.path)
        path = parsed.path.rstrip("/") or "/"

        length = int(self.headers.get("Content-Length", 0))
        blob = self.rfile.read(length)
        if len(blob) < 100:
            self.send_error(400, "文件过小或无效")
            return

        bak = DB_PATH.with_suffix(".sqlite.bak")

        if path == "/api/database-sync":
            try:
                replace_schedule_database_bytes(blob)
            except ValueError as e:
                self._send_json_error(400, str(e))
                return
            except Exception as e:
                if bak.exists():
                    try:
                        shutil.copy2(bak, DB_PATH)
                    except OSError:
                        pass
                elif DB_PATH.exists():
                    try:
                        DB_PATH.unlink()
                    except OSError:
                        pass
                self._send_json_error(500, "写入数据库失败: " + str(e))
                return
            self.send_response(204)
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            return

        if path != "/api/database-import":
            self.send_error(404)
            return

        PROJECT_ROOT.mkdir(parents=True, exist_ok=True)
        try:
            replace_schedule_database_bytes(blob)
            rows = read_labor()
            if not isinstance(rows, list):
                rows = []
        except Exception as e:
            if bak.exists():
                try:
                    shutil.copy2(bak, DB_PATH)
                except OSError:
                    pass
            elif DB_PATH.exists():
                try:
                    DB_PATH.unlink()
                except OSError:
                    pass
            self.send_error(400, "无效的 SQLite 文件: " + str(e))
            return

        raw = json.dumps({"ok": True, "rows": rows}, ensure_ascii=False).encode(
            "utf-8"
        )
        self.send_response(200)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)


def main():
    if not FRONTEND.is_dir():
        print("找不到 frontend 目录：", FRONTEND, file=sys.stderr)
        sys.exit(1)

    PROJECT_ROOT.mkdir(parents=True, exist_ok=True)
    migrate_legacy_database_if_needed()
    ensure_db_file_exists()
    httpd = ThreadingHTTPServer((HOST, PORT), ScheduleHandler)
    print(
        "排班系统（SQLite 文件模式）",
        file=sys.stderr,
    )
    print("  数据库文件（应与 frontend、backend 同级）:", DB_PATH.resolve(), file=sys.stderr)
    print(
        "  浏览器打开: http://127.0.0.1:%d/" % PORT,
        file=sys.stderr,
    )
    print("  局域网访问: http://<本机IP>:%d/" % PORT, file=sys.stderr)
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止", file=sys.stderr)


if __name__ == "__main__":
    main()
