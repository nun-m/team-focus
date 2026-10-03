# 開発用。APIサーバーと画面(Vite)をバックグラウンドで起動する。画面は http://localhost:5174
$env:NODE_EXTRA_CA_CERTS = [System.Environment]::GetEnvironmentVariable("NODE_EXTRA_CA_CERTS", "User")
$env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
# スクリプトの置き場所を基準にする。フォルダを移しても書き換え不要。
Set-Location $PSScriptRoot

Start-Process -FilePath "node.exe" -ArgumentList "server/index.js" -WindowStyle Hidden `
  -RedirectStandardOutput "$PSScriptRoot\api-server.log" `
  -RedirectStandardError "$PSScriptRoot\api-server.err.log"

Start-Process -FilePath "npm.cmd" -ArgumentList "run dev" -WindowStyle Hidden `
  -RedirectStandardOutput "$PSScriptRoot\dev-server.log" `
  -RedirectStandardError "$PSScriptRoot\dev-server.err.log"
