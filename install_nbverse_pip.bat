@echo off
chcp 65001 >nul
echo ========================================
echo NBVerseV01 Installation Script (pip)
echo ========================================
echo.

cd /d "%~dp0"

echo Current directory: %CD%
echo.

REM 가상환경 경로 설정
set PYTHON_VENV_PATH=E:\python_env

REM 가상환경 활성화
if exist "%PYTHON_VENV_PATH%\Scripts\activate.bat" (
    echo Activating virtual environment: %PYTHON_VENV_PATH%
    call "%PYTHON_VENV_PATH%\Scripts\activate.bat"
    if %ERRORLEVEL% neq 0 (
        echo [ERROR] Failed to activate virtual environment.
        pause
        exit /b 1
    )
    echo Virtual environment activated successfully.
    echo.
) else (
    echo [WARNING] Virtual environment not found at: %PYTHON_VENV_PATH%
    echo Continuing with system Python...
    echo.
)

REM Python 및 pip 버전 확인
echo Checking Python version...
python --version
echo.

echo Checking pip version...
pip --version
echo.

echo Installing NBVerseV01 using pip...
echo This may take a few minutes...
echo.

REM pip 업그레이드 시도 (실패해도 계속 진행)
echo Upgrading pip...
python -m pip install --upgrade pip
echo.

REM NBVerseV01 설치
echo Installing NBVerseV01 from GitHub...
echo Please wait...
python -m pip install git+https://github.com/yoohyunseog/NBVerseV01.git

if %ERRORLEVEL% neq 0 (
    echo.
    echo [ERROR] pip installation failed (Git compatibility issue detected).
    echo.
    echo Alternative installation methods:
    echo 1. Use existing NBverse folder: install_nbverse_from_existing.bat
    echo 2. Download ZIP from GitHub and extract manually:
    echo    - Visit: https://github.com/yoohyunseog/NBVerseV01/archive/refs/heads/main.zip
    echo    - Extract to: NBVerse folder
    echo    - Run: install_nbverse_from_existing.bat
    echo 3. Fix Git installation (reinstall Git for your system architecture)
    echo.
    pause
    exit /b 1
)

echo.
echo [SUCCESS] NBVerseV01 installation completed!
echo.
echo Verifying installation...
python -c "from NBverse import NBverseStorage, TextToNBConverter; print('NBVerse import successful!')" 2>nul
if %ERRORLEVEL% equ 0 (
    echo NBVerse is ready to use!
) else (
    echo [WARNING] NBVerse import test failed, but installation may have completed.
    echo The program will try to find NBVerse automatically.
)
echo.
echo You can now run the program and NBVerse will be available.
echo.
pause

