@echo off
cd /d "%~dp0"
echo.
echo Database file: schedule.sqlite in this folder (created on first run, next to frontend and backend)
echo If Explorer hides it, check the full path printed by Python below.
echo Open in browser: http://127.0.0.1:8787/
echo Press Ctrl+C to stop the server.
echo.
python -B -u backend\server.py
if errorlevel 1 (
  echo.
  echo If that failed, try: py -B -u backend\server.py
  pause
)
