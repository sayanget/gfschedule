Set-Location $PSScriptRoot
Write-Host ""
Write-Host "数据库文件: $PSScriptRoot\schedule.sqlite （启动后即创建，与 frontend、backend 同级）"
Write-Host "浏览器打开 http://127.0.0.1:8787/  Ctrl+C 停止"
Write-Host ""
python backend/server.py
if ($LASTEXITCODE -ne 0) { py backend/server.py }
