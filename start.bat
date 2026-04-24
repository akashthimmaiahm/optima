@echo off
echo Starting Optima - Enterprise Asset Management Platform
echo ================================================
echo.

echo Installing backend dependencies...
cd /d "%~dp0backend"
call npm install
if errorlevel 1 (
    echo Failed to install backend dependencies
    pause
    exit /b 1
)

echo.
echo Installing frontend dependencies...
cd /d "%~dp0frontend"
call npm install
if errorlevel 1 (
    echo Failed to install frontend dependencies
    pause
    exit /b 1
)

echo.
echo Starting backend server on port 5000...
cd /d "%~dp0backend"
start "Optima Backend" cmd /k "node server.js"

echo Waiting for backend to start...
timeout /t 3 /nobreak >nul

echo Starting frontend server on port 5173...
cd /d "%~dp0frontend"
start "Optima Frontend" cmd /k "npm run dev"

echo.
echo ================================================
echo Optima is starting up!
echo.
echo  Backend API:  http://localhost:5000
echo  Frontend:     http://localhost:5173
echo.
echo Demo Credentials:
echo  Super Admin:   admin@optima.com / Admin@123
echo  IT Manager:    manager@optima.com / Manager@123
echo  IT Admin:      itadmin@optima.com / ITAdmin@123
echo  Asset Manager: assets@optima.com / Assets@123
echo  Auditor:       auditor@optima.com / Audit@123
echo  End User:      john@optima.com / User@123
echo ================================================
echo.
pause
