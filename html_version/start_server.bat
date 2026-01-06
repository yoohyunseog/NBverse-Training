@echo off
chcp 65001 >nul
echo ========================================
echo Trading Bot HTML 버전 서버 시작
echo ========================================
echo.

REM 현재 스크립트의 디렉토리로 이동
cd /d "%~dp0"

REM 가상환경 활성화
echo [1/3] 가상환경 활성화 중...
call "E:\python_env\Scripts\activate.bat"
if errorlevel 1 (
    echo ❌ 가상환경 활성화 실패!
    pause
    exit /b 1
)
echo ✅ 가상환경 활성화 완료
echo.

REM API 서버 경로 저장
set API_DIR=%~dp0api

REM 필요한 패키지 설치 확인
echo [2/3] 필요한 패키지 확인 중...
cd /d "%API_DIR%"
python -c "import flask" 2>nul
if errorlevel 1 (
    echo 필요한 패키지를 설치합니다...
    pip install -r requirements.txt
    if errorlevel 1 (
        echo ❌ 패키지 설치 실패!
        pause
        exit /b 1
    )
)
echo ✅ 패키지 확인 완료
echo.

REM API 서버 시작 (백그라운드)
echo [3/3] API 서버 시작 중...
REM 상위 디렉토리 경로 설정 (모듈 import를 위해)
set PARENT_DIR=%~dp0..
REM 상위 디렉토리(v0.0.0.4)로 이동하여 API 서버 실행
REM 작업 디렉토리를 v0.0.0.4로 설정하여 상대 경로 문제 해결
start "Trading Bot API Server" cmd /k "cd /d %PARENT_DIR% && python html_version\api\app.py"
timeout /t 3 /nobreak >nul

REM 서버가 시작될 때까지 대기
echo 서버 시작 대기 중...
timeout /t 2 /nobreak >nul

REM 브라우저 자동 열기 비활성화
REM echo 브라우저 열기...
REM start "" "http://localhost:5000/api/health"

REM HTML 파일 열기 (로컬 파일) - 비활성화
REM echo HTML 파일 열기...
REM start "" "%~dp0index.html"

echo.
echo ========================================
echo ✅ 서버 시작 완료!
echo.
echo API 서버: http://localhost:5000
echo HTML 파일: %~dp0index.html
echo.
echo 서버를 종료하려면 작업 관리자에서
echo "Trading Bot API Server" 프로세스를 종료하세요.
echo ========================================
echo.

REM 이 창을 유지
pause

