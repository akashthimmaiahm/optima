#Requires -RunAsAdministrator
<#
.SYNOPSIS
    Optima Property Agent - Windows Installer
.DESCRIPTION
    Installs the Optima monitoring agent as a Windows Scheduled Task.
    Run as Administrator: powershell -ExecutionPolicy Bypass -File install.ps1
#>

param(
    [string]$PropertyKey = "",
    [string]$ServerUrl   = ""
)

$ErrorActionPreference = "Stop"
$AgentDir = "C:\Program Files\Optima\agent"
$LogFile  = "C:\Program Files\Optima\agent\agent.log"

Write-Host ""
Write-Host "  Optima Agent Installer for Windows" -ForegroundColor Cyan
Write-Host "  ====================================" -ForegroundColor Cyan
Write-Host ""

# Prompt for values if not provided
if (-not $PropertyKey) {
    $PropertyKey = Read-Host "  Enter PROPERTY KEY (from Optima portal)"
}
if (-not $ServerUrl) {
    $input = Read-Host "  Enter SERVER URL [https://optima.sclera.com]"
    if (-not $input) { $ServerUrl = "https://optima.sclera.com" } else { $ServerUrl = $input }
}

# Validate key against server
Write-Host ""
Write-Host "  Validating property key..." -ForegroundColor Yellow
try {
    $body = @{ property_key = $PropertyKey } | ConvertTo-Json
    $resp = Invoke-RestMethod -Uri "$ServerUrl/api/portal/verify-key" `
        -Method POST -Body $body -ContentType "application/json" `
        -SkipCertificateCheck -ErrorAction Stop
    Write-Host "  Property: $($resp.property.name)" -ForegroundColor Green
    Write-Host "  Plan    : $($resp.property.plan)" -ForegroundColor Green
} catch {
    Write-Host "  ERROR: Invalid property key or cannot reach server." -ForegroundColor Red
    Write-Host "  $_" -ForegroundColor Red
    exit 1
}

# Check / install Node.js
Write-Host ""
Write-Host "  Checking Node.js..." -ForegroundColor Yellow
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
    Write-Host "  Installing Node.js 20 LTS..." -ForegroundColor Yellow
    $nodeUrl = "https://nodejs.org/dist/v20.11.0/node-v20.11.0-x64.msi"
    $msi = "$env:TEMP\node-install.msi"
    Invoke-WebRequest -Uri $nodeUrl -OutFile $msi
    Start-Process msiexec.exe -Wait -ArgumentList "/i `"$msi`" /quiet /norestart"
    $env:PATH += ";C:\Program Files\nodejs"
} else {
    Write-Host "  Node.js: $((node --version 2>&1))" -ForegroundColor Green
}

# Install agent files
Write-Host ""
Write-Host "  Installing agent to $AgentDir..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path $AgentDir -Force | Out-Null

# Copy files
Copy-Item -Path "$PSScriptRoot\agent.js"      -Destination $AgentDir -Force
Copy-Item -Path "$PSScriptRoot\package.json"  -Destination $AgentDir -Force

# Write config
$config = @{
    property_key   = $PropertyKey
    server_url     = $ServerUrl
    agent_id       = $null
    interval_hours = 24
} | ConvertTo-Json
Set-Content -Path "$AgentDir\config.json" -Value $config

# Install npm dependencies
Write-Host "  Installing dependencies..." -ForegroundColor Yellow
Push-Location $AgentDir
& npm install --production --silent
Pop-Location

# Create Scheduled Task (runs at startup + every 24h)
Write-Host "  Creating Scheduled Task..." -ForegroundColor Yellow
$action  = New-ScheduledTaskAction -Execute "node" -Argument "`"$AgentDir\agent.js`"" -WorkingDirectory $AgentDir
$trigger1 = New-ScheduledTaskTrigger -AtStartup
$trigger2 = New-ScheduledTaskTrigger -Daily -At "03:00AM"
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Hours 2) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

Register-ScheduledTask -TaskName "OptimaAgent" `
    -Action $action -Trigger $trigger1,$trigger2 `
    -Settings $settings -Principal $principal `
    -Description "Optima HAM/SAM monitoring agent" `
    -Force | Out-Null

# Run once immediately
Write-Host ""
Write-Host "  Running initial inventory scan..." -ForegroundColor Yellow
Start-Process "node" -ArgumentList "`"$AgentDir\agent.js`" --once" `
    -WorkingDirectory $AgentDir -Wait -NoNewWindow

Write-Host ""
Write-Host "  Installation complete!" -ForegroundColor Green
Write-Host "  Agent will run daily at 03:00 and on system startup." -ForegroundColor Cyan
Write-Host "  Logs: $LogFile" -ForegroundColor Cyan
Write-Host ""
