# Starts the forked OpenClaw Gateway and opens the Governance dashboard.
#
# The fork deliberately runs on port 18799 so it never collides with a
# separately installed OpenClaw on the default port 18789.
#
# Usage:  .\start-governance.ps1

$ErrorActionPreference = "Stop"
$RepoRoot = $PSScriptRoot
$Port = 18799

Write-Host "OpenClaw Governance Fork" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan

# Node 22.22.3+ is required by this OpenClaw release.
$nodeVersion = (& node -v) -replace '^v', ''
Write-Host "Node: $nodeVersion"

$listening = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listening) {
    Write-Host "Gateway already running on port $Port." -ForegroundColor Green
} else {
    Write-Host "Starting gateway on port $Port (first run compiles the project; this can take a few minutes)..." -ForegroundColor Yellow
    $env:OPENCLAW_GATEWAY_PORT = "$Port"
    Start-Process -FilePath "node" `
        -ArgumentList "scripts/run-node.mjs", "gateway", "--port", "$Port" `
        -WorkingDirectory $RepoRoot `
        -WindowStyle Minimized
    Write-Host "Waiting for the gateway to become ready..." -ForegroundColor Yellow
    $deadline = (Get-Date).AddMinutes(10)
    while ((Get-Date) -lt $deadline) {
        Start-Sleep -Seconds 5
        if (Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) { break }
    }
}

# The Gateway's shared-secret credential, needed by the browser session.
$configPath = Join-Path $env:USERPROFILE ".openclaw\openclaw.json"
$token = (Get-Content $configPath -Raw | ConvertFrom-Json).gateway.auth.token

$url = "http://127.0.0.1:$Port/settings/governance"
Write-Host ""
Write-Host "Dashboard:  $url" -ForegroundColor Green
Write-Host "Gateway token (paste if the UI asks to connect):" -ForegroundColor Green
Write-Host "  $token"
Write-Host ""
Start-Process $url
