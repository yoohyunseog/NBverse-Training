@echo off
chcp 65001 >nul
echo ========================================
echo ⚡ 고속 Trading Bot 서버 시작 (Waitress)
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

REM 고속 서버 패키지 설치
echo [2/3] 고속 서버 패키지 설치 중...
pip install waitress==3.0.0 Flask-Caching==2.1.0 -q
if errorlevel 1 (
    echo ❌ 패키지 설치 실패!
    pause
    exit /b 1
)
echo ✅ 패키지 설치 완료
echo.

REM API 서버 시작
echo [3/3] 고속 API 서버 시작 중...
set PARENT_DIR=%~dp0..
cd /d "%PARENT_DIR%"
python html_version\api\app.py

pause
