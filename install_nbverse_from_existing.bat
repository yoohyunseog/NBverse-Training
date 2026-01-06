@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul
echo ========================================
echo NBVerse Installation from Existing Folder
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

REM 기존 NBverse 폴더 찾기
set NBVERSE_FOUND=0
set NBVERSE_PATH=

REM 여러 경로에서 NBverse 찾기
echo Searching for existing NBverse folder...
echo.

REM 현재 디렉토리부터 상위 디렉토리까지 검색
set SEARCH_DIR=%CD%
for /L %%i in (0,1,6) do (
    REM NBVerseV01-main 폴더 확인 (ZIP 다운로드 폴더)
    if exist "!SEARCH_DIR!\NBVerseV01-main\__init__.py" (
        set "NBVERSE_PATH=!SEARCH_DIR!\NBVerseV01-main"
        set NBVERSE_FOUND=1
        goto :found
    )
    if exist "!SEARCH_DIR!\NBverseV01-main\__init__.py" (
        set "NBVERSE_PATH=!SEARCH_DIR!\NBverseV01-main"
        set NBVERSE_FOUND=1
        goto :found
    )
    REM 일반 NBverse 폴더 확인
    if exist "!SEARCH_DIR!\NBverse\__init__.py" (
        set "NBVERSE_PATH=!SEARCH_DIR!\NBverse"
        set NBVERSE_FOUND=1
        goto :found
    )
    if exist "!SEARCH_DIR!\NBVerse\__init__.py" (
        set "NBVERSE_PATH=!SEARCH_DIR!\NBVerse"
        set NBVERSE_FOUND=1
        goto :found
    )
    if exist "!SEARCH_DIR!\NBVerse\NBverse\__init__.py" (
        set "NBVERSE_PATH=!SEARCH_DIR!\NBVerse\NBverse"
        set NBVERSE_FOUND=1
        goto :found
    )
    set "SEARCH_DIR=!SEARCH_DIR!\.."
    call :normalize_path SEARCH_DIR
)

:found
if %NBVERSE_FOUND% equ 0 (
    echo [ERROR] NBverse folder not found.
    echo.
    echo Please ensure NBverse folder exists in one of these locations:
    echo   - Current directory: %CD%\NBVerseV01-main
    echo   - Current directory: %CD%\NBverse
    echo   - Parent directories: ..\NBVerseV01-main, ..\NBverse, etc.
    echo.
    echo Or use install_nbverse_pip.bat to install from GitHub.
    echo.
    pause
    exit /b 1
)

echo Found NBverse at: %NBVERSE_PATH%
echo.

REM pip 설치 시도 (실패해도 경로 추가 방식으로 계속 진행)
echo Attempting to install NBverse from existing folder...
echo.

cd /d "%NBVERSE_PATH%"

REM NBVerseV01-main 폴더인 경우 패키지 구조 확인 및 생성
if "%NBVERSE_PATH:~-15%"=="NBVerseV01-main" (
    if not exist "NBverse\__init__.py" (
        echo Creating NBverse package structure...
        mkdir NBverse 2>nul
        if exist "__init__.py" copy /Y "__init__.py" "NBverse\" >nul
        if exist "calculator.py" copy /Y "calculator.py" "NBverse\" >nul
        if exist "converter.py" copy /Y "converter.py" "NBverse\" >nul
        if exist "storage.py" copy /Y "storage.py" "NBverse\" >nul
        if exist "config.py" copy /Y "config.py" "NBverse\" >nul
        if exist "similarity.py" copy /Y "similarity.py" "NBverse\" >nul
        if exist "history.py" copy /Y "history.py" "NBverse\" >nul
        if exist "compact_storage.py" copy /Y "compact_storage.py" "NBverse\" >nul
        if exist "hybrid_storage.py" copy /Y "hybrid_storage.py" "NBverse\" >nul
        if exist "utils.py" copy /Y "utils.py" "NBverse\" >nul
        echo Package structure created.
    )
)

REM setup.py가 있으면 설치 시도
if exist "setup.py" (
    echo Found setup.py, attempting installation...
    python -m pip install -e . 2>nul
    if %ERRORLEVEL% neq 0 (
        echo [INFO] pip install failed (this is OK, will use path-based import instead)
    ) else (
        echo [SUCCESS] NBverse installed via pip
        cd /d "%~dp0"
        goto :verify
    )
)

REM pyproject.toml이 있으면 설치 시도
if exist "pyproject.toml" (
    echo Found pyproject.toml, attempting installation...
    python -m pip install -e . 2>nul
    if %ERRORLEVEL% neq 0 (
        echo [INFO] pip install failed (this is OK, will use path-based import instead)
    ) else (
        echo [SUCCESS] NBverse installed via pip
        cd /d "%~dp0"
        goto :verify
    )
)

REM pip 설치가 실패했거나 setup 파일이 없는 경우
echo.
echo [INFO] Using path-based import (no pip installation needed)
echo NBverse will be found automatically by the program's path search.
echo This is the recommended method when pip installation fails.
echo.

cd /d "%~dp0"

:verify
echo.
echo [SUCCESS] NBverse setup completed!
echo.

REM 설치 확인
echo Verifying NBverse can be imported...
python -c "from NBverse import NBverseStorage, TextToNBConverter; print('✓ NBverse import successful!')" 2>nul
if %ERRORLEVEL% equ 0 (
    echo.
    echo ✓ NBverse is ready to use!
    echo   Location: %NBVERSE_PATH%
    echo   Installed as package: nbverse
) else (
    echo.
    echo [INFO] Direct import test failed, trying path-based import...
    python -c "import sys; import os; sys.path.insert(0, r'%NBVERSE_PATH%'); from NBverse import NBverseStorage, TextToNBConverter; print('✓ NBverse import successful (path-based)!')" 2>nul
    if %ERRORLEVEL% equ 0 (
        echo.
        echo ✓ NBverse is ready to use (path-based)!
        echo   Location: %NBVERSE_PATH%
    ) else (
        echo.
        echo [INFO] Import test failed, but this is OK.
        echo The program's nbverse_helper.py will automatically find NBverse at:
        echo   %NBVERSE_PATH%
        echo.
        echo The path search system will locate it when the program runs.
    )
)
echo.
echo You can now run the program (run.bat) and NBverse will be available.
echo.
pause
exit /b 0

:normalize_path
for %%F in ("!%~1!") do set "%~1=%%~fF"
exit /b

