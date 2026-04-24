@echo off
echo ================================================
echo  Optima Local Multi-Property Test
echo ================================================
echo  Port 5000  - Property 1: Headquarters backend
echo  Port 5001  - Property 2: Acme Corp backend
echo  Port 4000  - Central Portal (proxy + auth)
echo  Port 5173  - Frontend (Vite dev server)
echo ================================================
echo.

cd /d "%~dp0"

:: Kill anything on these ports first
for %%p in (4000 5000 5001) do (
  for /f "tokens=5" %%a in ('netstat -ano 2^>nul ^| findstr ":%%p "') do (
    taskkill /F /PID %%a >nul 2>&1
  )
)

:: Start Property 1 backend (HQ) on port 5000
echo [1/4] Starting Property 1 - Headquarters (port 5000)...
start "Property-1-HQ" cmd /k "cd optima\backend && set PROPERTY_ID=1 && set PROPERTY_SLUG=headquarters && set PORT=5000 && set DB_PATH=./optima.db && node property-server.js"

timeout /t 2 /nobreak >nul

:: Start Property 2 backend (Acme) on port 5001 — same DB, different PROPERTY_ID
echo [2/4] Starting Property 2 - Acme Corp (port 5001)...
start "Property-2-Acme" cmd /k "cd optima\backend && set PROPERTY_ID=2 && set PROPERTY_SLUG=acme-corp && set PORT=5001 && set DB_PATH=./optima.db && node property-server.js"

timeout /t 2 /nobreak >nul

:: Start Central Portal on port 4000
echo [3/4] Starting Central Portal (port 4000)...
start "Central-Portal" cmd /k "cd optima\central-server && node server.js"

timeout /t 2 /nobreak >nul

:: Start Vite frontend dev server on port 5173
echo [4/4] Starting Frontend dev server (port 5173)...
start "Frontend-Vite" cmd /k "cd optima\frontend && npm run dev"

echo.
echo ================================================
echo  All servers starting...
echo.
echo  Open: http://localhost:5173
echo.
echo  Login: admin@optima.com / Admin@123
echo  -> You will see 2 properties to choose from
echo.
echo  Test user (HQ only): john@optima.com / User@123
echo  -> Goes straight to dashboard (1 property)
echo ================================================
pause
