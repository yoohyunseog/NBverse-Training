@echo off
chcp 65001 >nul
echo ========================================
echo Trading Bot 서버 재시작
echo ========================================
echo.

REM 기존 서버 종료
echo [1/4] 기존 서버 종료 중...
call stop_server.bat
timeout /t 2 /nobreak >nul
echo.

REM 포트 확인
echo [2/4] 포트 확인 중...
netstat -ano | findstr ":5000" >nul
if not errorlevel 1 (
    echo ⚠️ 포트 5000이 아직 사용 중입니다. 강제 종료합니다...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":5000" ^| findstr "LISTENING"') do (
        taskkill /PID %%a /F >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
)

netstat -ano | findstr ":8000" >nul
if not errorlevel 1 (
    echo ⚠️ 포트 8000이 아직 사용 중입니다. 강제 종료합니다...
    for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8000" ^| findstr "LISTENING"') do (
        taskkill /PID %%a /F >nul 2>&1
    )
    timeout /t 2 /nobreak >nul
)
echo ✅ 포트 정리 완료
echo.

REM 서버 시작
echo [3/4] 서버 시작 중...
call start_server_with_http_server.bat
echo.

echo [4/4] 서버 상태 확인 중...
timeout /t 5 /nobreak >nul
call check_server_status.bat

