@echo off
chcp 65001 >nul
set PYTHON_VENV_PATH=E:\python_env

echo ========================================
echo 8BIT Trading Bot GUI v0.12.0 (PyQt6)
echo ========================================
echo.

cd /d "%~dp0"

REM 가상환경 활성화
if exist "%PYTHON_VENV_PATH%\Scripts\activate.bat" (
    echo 가상환경 활성화: %PYTHON_VENV_PATH%
    call "%PYTHON_VENV_PATH%\Scripts\activate.bat"
    if %ERRORLEVEL% neq 0 (
        echo [오류] 가상환경 활성화 실패.
        pause
        exit /b 1
    )
) else (
    echo [경고] 지정된 가상환경 경로를 찾을 수 없습니다: %PYTHON_VENV_PATH%
    echo 시스템 Python으로 실행을 시도합니다.
    echo.
    
    REM Python 경로 확인
    python --version >nul 2>&1
    if errorlevel 1 (
        echo [오류] Python이 설치되어 있지 않습니다.
        echo Python을 설치한 후 다시 시도하세요.
        pause
        exit /b 1
    )
)

echo Python 버전 확인 중...
python --version

echo.
echo 필요한 패키지 확인 중...
python -c "import PyQt6" >nul 2>&1
if errorlevel 1 (
    echo [경고] PyQt6가 설치되어 있지 않습니다.
    echo 설치 명령: pip install PyQt6
    echo.
)

python -c "import pyupbit" >nul 2>&1
if errorlevel 1 (
    echo [경고] pyupbit이 설치되어 있지 않습니다.
    echo 설치 명령: pip install pyupbit
    echo.
)

python -c "import pandas" >nul 2>&1
if errorlevel 1 (
    echo [경고] pandas가 설치되어 있지 않습니다.
    echo 설치 명령: pip install pandas
    echo.
)

python -c "import numpy" >nul 2>&1
if errorlevel 1 (
    echo [경고] numpy가 설치되어 있지 않습니다.
    echo 설치 명령: pip install numpy
    echo.
)

echo.
echo NBVerse 라이브러리 확인 중...
REM nbverse_helper가 자동으로 경로를 찾으므로, 단순히 import만 시도
python -c "from nbverse_helper import NBVERSE_AVAILABLE; exit(0 if NBVERSE_AVAILABLE else 1)" >nul 2>&1
if errorlevel 1 (
    echo [경고] NBVerse가 설치되어 있지 않습니다.
    echo 설치 방법:
    echo   1. install_nbverse_pip.bat 실행 (pip 사용, 권장)
    echo   2. install_nbverse.bat 실행 (Git 필요)
    echo.
    echo 참고: 프로그램 실행 시 자동으로 상위 디렉토리에서 NBVerse를 찾습니다.
    echo.
)

echo.
echo 메인 프로그램 실행 중...
echo.

REM 메인 파일 실행
python trading_gui_app_v0.12.0_pyqt6.py

if errorlevel 1 (
    echo.
    echo [오류] 프로그램 실행 중 오류가 발생했습니다.
    pause
    exit /b 1
)

echo.
echo 프로그램이 종료되었습니다.
pause

