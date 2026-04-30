@echo off
cd /d "%~dp0"
echo.
echo 数据库文件：与本脚本同一文件夹下的 schedule.sqlite（启动后即创建，与 frontend、backend 并列）
echo 若资源管理器里看不到，请看下方 Python 打印的「完整路径」
echo 浏览器访问 http://127.0.0.1:8787/
echo 按 Ctrl+C 停止服务
echo.
python backend\server.py
if errorlevel 1 (
  echo.
  echo 若失败可尝试: py backend\server.py
  pause
)
