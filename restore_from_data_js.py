#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""从 frontend/data.js 的 initialData 恢复到项目根目录 schedule.sqlite。"""
from __future__ import annotations

import json
import re
import sqlite3
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / "schedule.sqlite"
DATA_JS = ROOT / "frontend" / "data.js"

WEEK_DAYS = [
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
    "星期日",
]


def _parse_initial_data() -> list:
    text = DATA_JS.read_text(encoding="utf-8")
    start = text.index("[")
    end = text.rindex("]") + 1
    raw = text[start:end]
    raw = re.sub(r"\bNaN\b", "null", raw)
    raw = re.sub(r",(\s*})", r"\1", raw)
    raw = re.sub(r",(\s*])", r"\1", raw)
    data = json.loads(raw)
    if not isinstance(data, list):
        raise ValueError("initialData must be a JSON array")
    return data


def _note_from_row(item: dict) -> str:
    for key in ("备注", "单位/备注"):
        val = item.get(key)
        if val is None or val == "":
            continue
        return str(val).strip()
    return ""


def _normalize_pay_type(item: dict) -> str:
    pt = item.get("计薪类型")
    if pt == "计件":
        return "计件"
    return "计时"


def main() -> None:
    rows_js = _parse_initial_data()
    print(f"parsed rows from data.js: {len(rows_js)}")

    front_rows: list[dict] = []
    sql_rows: list[tuple] = []

    for item in rows_js:
        if not isinstance(item, dict):
            continue
        row_uid = str(uuid.uuid4())
        company = str(item.get("劳务公司/归属", "") or "").strip()
        shift = str(item.get("班次名称", "常规班次") or "常规班次").strip() or "常规班次"
        job = str(item.get("岗位/工作内容", "") or "").strip()
        note = _note_from_row(item)
        reason = str(item.get("变化原因", "") or "").strip()
        pay_type = _normalize_pay_type(item)

        fr = {
            "_rowUid": row_uid,
            "劳务公司/归属": company,
            "班次名称": shift,
            "计薪类型": pay_type,
            "岗位/工作内容": job,
            "备注": note,
            "变化原因": reason,
        }
        tup_days: list[float] = []
        for d in WEEK_DAYS:
            plan = float(item.get(d) or 0)
            actual = float(item.get(f"{d}_实到") or 0)
            fr[d] = plan
            fr[f"{d}_实到"] = actual
            tup_days.extend([plan, actual])

        front_rows.append(fr)
        sql_rows.append(
            (
                "CNO.H",
                row_uid,
                company,
                shift,
                pay_type,
                job,
                note,
                reason,
                *tup_days,
            )
        )

    conn = sqlite3.connect(DB_PATH)
    try:
        cur = conn.cursor()
        cols = {r[1] for r in cur.execute("PRAGMA table_info(labor_schedule)")}
        needed = {"pay_type", "row_uid", "account_set"}
        missing = needed - cols
        if missing:
            raise RuntimeError(f"labor_schedule missing columns {missing}; migrate DB first")

        cur.execute("DELETE FROM labor_schedule WHERE account_set='CNO.H'")
        cur.executemany(
            """
            INSERT INTO labor_schedule (
                account_set, row_uid, company, shift_name, pay_type, job_content, note, change_reason,
                mon_plan, mon_actual, tue_plan, tue_actual, wed_plan, wed_actual,
                thu_plan, thu_actual, fri_plan, fri_actual, sat_plan, sat_actual,
                sun_plan, sun_actual
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            sql_rows,
        )
        blob = json.dumps(front_rows, ensure_ascii=False)
        cur.execute("INSERT OR REPLACE INTO kv (k, v) VALUES ('laborData', ?)", (blob,))
        conn.commit()
        print(f"inserted labor_schedule CNO.H rows: {len(sql_rows)}; kv.laborData updated")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
