# Lets phones on YOUR Wi-Fi reach the Hungerly development servers on this computer.
#   8000      = API (FastAPI)
#   8081-8083 = Expo / Metro dev server (the app bundle; also forwards /api in development)
# Only devices on the local subnet are allowed - nothing from the internet.
# Undo any time:  Remove-NetFirewallRule -DisplayName "Hungerly dev servers"

$ErrorActionPreference = 'Stop'
$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) {
    # Re-launch this script elevated (Windows shows a UAC prompt you must approve).
    Start-Process powershell -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`""
    exit
}

Remove-NetFirewallRule -DisplayName "Hungerly dev servers" -ErrorAction SilentlyContinue
Remove-NetFirewallRule -DisplayName "Hungerly API (dev)" -ErrorAction SilentlyContinue
New-NetFirewallRule -DisplayName "Hungerly dev servers" -Direction Inbound -Protocol TCP `
    -LocalPort 8000, 8081, 8082, 8083 -Action Allow -Profile Private, Public -RemoteAddress LocalSubnet | Out-Null

Write-Host "Done. Phones on your Wi-Fi can now reach ports 8000 and 8081-8083 on this computer." -ForegroundColor Green
Write-Host "Test on the phone's browser: http://<this computer's Wi-Fi IP>:8000/health/live"
Read-Host "Press Enter to close"
