@echo off
chcp 65001 >nul
echo ========================================
echo Trading Bot 서버 종료
echo ========================================
echo.

echo 서버 프로세스를 종료하는 중...
echo.

REM Python 프로세스 중에서 app.py를 실행 중인 프로세스 찾아서 종료
taskkill /FI "WINDOWTITLE eq Trading Bot API Server*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq Trading Bot HTTP Server*" /T /F >nul 2>&1

REM Python 프로세스 중에서 app.py를 실행 중인 프로세스 찾아서 종료
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq python.exe" /FO LIST ^| findstr /I "PID"') do (
    wmic process where "ProcessId=%%a" get CommandLine 2>nul | findstr /I "app.py" >nul
    if not errorlevel 1 (
        taskkill /PID %%a /F >nul 2>&1
        echo ✅ API 서버 프로세스 종료 (PID: %%a)
    )
)

REM HTTP 서버 프로세스 종료
for /f "tokens=2" %%a in ('tasklist /FI "IMAGENAME eq python.exe" /FO LIST ^| findstr /I "PID"') do (
    wmic process where "ProcessId=%%a" get CommandLine 2>nul | findstr /I "http.server" >nul
    if not errorlevel 1 (
        taskkill /PID %%a /F >nul 2>&1
        echo ✅ HTTP 서버 프로세스 종료 (PID: %%a)
    )
)

echo.
echo ========================================
echo ✅ 서버 종료 완료!
echo ========================================
echo.
pause

