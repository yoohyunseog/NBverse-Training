@echo off
chcp 65001 >nul
echo ========================================
echo 프로파일링 로그 뷰어 실행
echo ========================================
echo.

REM 현재 스크립트의 디렉토리로 이동
cd /d "%~dp0"

REM 프로젝트 루트로 이동 (profiling의 상위 디렉토리)
cd ..

REM 가상환경 활성화
echo [정보] 가상환경을 활성화합니다...
call E:\python_env\Scripts\activate.bat
if errorlevel 1 (
    echo [오류] 가상환경 활성화에 실패했습니다.
    echo [오류] 경로를 확인해주세요: E:\python_env\Scripts\activate.bat
    echo.
    pause
    exit /b 1
)
echo [정보] 가상환경 활성화 완료
echo.

REM Python 경로 확인
python --version >nul 2>&1
if errorlevel 1 (
    echo [오류] Python이 설치되어 있지 않거나 PATH에 등록되어 있지 않습니다.
    echo.
    pause
    exit /b 1
)

REM 프로파일링 로그 디렉토리 확인
if not exist "data\profiling_logs" (
    echo [정보] 프로파일링 로그 디렉토리를 생성합니다...
    mkdir "data\profiling_logs" 2>nul
)

echo [정보] 프로파일링 로그 뷰어를 실행합니다...
echo.

REM Python 스크립트 실행
python profiling\profile_log_viewer.py

if errorlevel 1 (
    echo.
    echo [오류] 프로그램 실행 중 오류가 발생했습니다.
    echo.
    pause
)

