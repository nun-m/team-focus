# Team Focus を起動する(Windows用)。初回や更新後は、画面を作り直してから起動する。
# 合言葉やポートを変えるときは、起動前に環境変数を設定する。例: $env:TEAM_FOCUS_PASSWORD = "合言葉"
Set-Location $PSScriptRoot

if (-not (Test-Path "node_modules")) { npm install }
if (-not (Test-Path "dist\index.html")) { npm run build }

node server/index.js
