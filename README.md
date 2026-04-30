# 劳务排班核对系统

按公司、班次和岗位维护每周「计划 / 实到」人数，支持多套账套视图与本地持久化。

## 功能概览

- 表格维护劳务排班（公司、班次、岗位内容、计薪类型等）
- 周一至周日计划数与实到数核对，汇总统计
- 账套切换（如 `CNO.H`、`SFO.H`）
- 用户登录、修改密码、管理员用户管理（前端会话）
- 数据优先写入后端 SQLite；在网络异常时可回退浏览器本地存储（sql.js / IndexedDB）

## 技术栈

| 层级 | 说明 |
|------|------|
| 后端 | Python 3 标准库：`ThreadingHTTPServer` + SQLite（`sqlite3`） |
| 前端 | 原生 HTML / CSS / JavaScript |
| 数据库 | 项目根目录 `schedule.sqlite`（已纳入版本库，便于协作与备份） |
| 可选脚本 | `convert_excel.py`、`read_excel.py`（Excel 相关）；`restore_from_data_js.py`（从 `frontend/data.js` 恢复库） |

前端依赖通过 CDN 加载（如 XLSX、html2canvas、Remix Icon），无需单独执行 `npm install`。

## 环境要求

- **Python 3.8+**（建议 3.10+）

## 本地运行

在项目根目录执行：

```bash
python backend/server.py
```

若系统命令为 `py`：

```bash
py backend/server.py
```

**Windows** 也可双击或运行根目录下的 `serve.ps1` / `serve.bat`。

启动成功后浏览器访问：**http://127.0.0.1:8787/**

默认监听 `0.0.0.0:8787`，局域网内其他设备可通过本机 IP 访问（注意防火墙与安全策略）。

## 目录结构（简要）

```
排班系统/
├── backend/
│   └── server.py          # HTTP 服务 + REST API + SQLite
├── frontend/
│   ├── index.html
│   ├── app.js             # 页面逻辑
│   ├── db.js              # 与后端 / 本地存储交互
│   ├── style.css
│   └── data.js            # 内置示例初始数据（可用于恢复）
├── schedule.sqlite        # 主数据库文件
├── restore_from_data_js.py
├── serve.ps1 / serve.bat
└── README.md
```

## 数据恢复

若需用 `frontend/data.js` 中的 `initialData` 覆盖并重写根目录 `schedule.sqlite`：

```bash
python restore_from_data_js.py
```

执行前请自行备份现有 `schedule.sqlite`。

## 关于仓库中的数据库文件

`schedule.sqlite` 已跟踪进 Git，便于团队拿到一致的起始数据。**请勿将含敏感商业或个人信息的库推送到公开仓库**；若仓库为公开可见，请改用私密仓库或对数据库脱敏后再提交。

SQLite 使用 WAL 模式时，会产生 `schedule.sqlite-wal` / `schedule.sqlite-shm`，这些文件已在 `.gitignore` 中忽略；提交数据库前建议在停止写入后备份或执行 checkpoint，避免未合并的 WAL 内容丢失。

## 开源协议

若未另行约定，以仓库内许可证文件为准；无许可证文件时默认保留所有权利。

---

**仓库：** [github.com/sayanget/gfschedule](https://github.com/sayanget/gfschedule)
