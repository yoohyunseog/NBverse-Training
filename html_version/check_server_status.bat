@echo off
chcp 65001 >nul
echo ========================================
echo API 서버 상태 확인
echo ========================================
echo.

REM 포트 5000 확인
echo [1/3] 포트 5000 확인 중...
netstat -ano | findstr ":5000" >nul
if errorlevel 1 (
    echo ❌ 포트 5000이 사용 중이 아닙니다.
    echo    API 서버가 실행되지 않았습니다.
) else (
    echo ✅ 포트 5000이 사용 중입니다.
    echo    API 서버가 실행 중인 것으로 보입니다.
    netstat -ano | findstr ":5000"
)
echo.

REM 포트 8000 확인
echo [2/3] 포트 8000 확인 중...
netstat -ano | findstr ":8000" >nul
if errorlevel 1 (
    echo ⚠️ 포트 8000이 사용 중이 아닙니다.
    echo    HTTP 서버가 실행되지 않았습니다.
) else (
    echo ✅ 포트 8000이 사용 중입니다.
    echo    HTTP 서버가 실행 중인 것으로 보입니다.
    netstat -ano | findstr ":8000"
)
echo.

REM API 헬스 체크
echo [3/3] API 서버 헬스 체크 중...
REM Python으로 헬스 체크 (curl이 없을 수 있음)
python -c "import urllib.request; import json; response = urllib.request.urlopen('http://localhost:5000/api/health', timeout=5); data = json.loads(response.read().decode()); print('✅ API 서버 응답:', json.dumps(data, indent=2, ensure_ascii=False))" 2>nul
if errorlevel 1 (
    echo ❌ API 서버에 연결할 수 없습니다.
    echo.
    echo 가능한 원인:
    echo 1. 서버가 아직 시작 중일 수 있습니다 (5초 대기 후 다시 시도)
    echo 2. 서버가 오류로 인해 종료되었을 수 있습니다
    echo 3. 방화벽이 포트를 차단하고 있을 수 있습니다
    echo.
    echo 해결 방법:
    echo 1. restart_server.bat 실행하여 서버 재시작
    echo 2. 작업 관리자에서 "Trading Bot API Server" 프로세스 확인
    echo 3. 서버 로그 창에서 오류 메시지 확인
    echo.
    echo 서버 로그 확인:
    echo - 작업 관리자에서 "Trading Bot API Server" 창 찾기
    echo - 또는 restart_server.bat를 실행하여 서버를 재시작하세요
) else (
    echo.
)
echo.

echo ========================================
echo 확인 완료
echo ========================================
echo.
pause

