@echo off
chcp 65001 >nul
echo ========================================
echo NBverse Library - Full Test and Example
echo ========================================
echo.

REM 가상환경 활성화
echo [1/4] Activating virtual environment...
if exist "E:\python_env\Scripts\activate.bat" (
    call E:\python_env\Scripts\activate.bat >nul 2>&1
    if errorlevel 1 (
        echo [Warning] Virtual environment activation failed, using system Python
    ) else (
        echo Virtual environment activated
    )
) else (
    echo [Warning] Virtual environment not found, using system Python
)
echo.

REM 작업 디렉토리로 이동 및 PYTHONPATH 설정
echo [2/4] Setting up environment...
cd /d "%~dp0"
set "PARENT_DIR=%~dp0.."
set "PYTHONPATH=%PARENT_DIR%;%PYTHONPATH%"
set "PYTHONIOENCODING=utf-8"
echo Current directory: %CD%
echo.

REM 기본 테스트 실행
echo [3/4] Running basic test...
echo ========================================
python test_basic.py
echo.
echo ========================================
echo.

REM 예제 실행
echo [4/4] Running example...
echo ========================================
python example.py
echo.
echo ========================================
echo.

echo All tests and examples completed!
echo.
pause
