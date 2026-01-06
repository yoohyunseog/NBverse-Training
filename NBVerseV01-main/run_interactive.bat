@echo off
chcp 65001 >nul
echo ========================================
echo NBverse Library Interactive Mode
echo ========================================
echo.

REM 가상환경 활성화
echo [1/2] Activating virtual environment...
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
echo [2/2] Setting up environment...
cd /d "%~dp0"
set "PARENT_DIR=%~dp0.."
set "PYTHONPATH=%PARENT_DIR%;%PYTHONPATH%"
set "PYTHONIOENCODING=utf-8"
echo Current directory: %CD%
echo.

REM Python 대화형 모드 실행
echo ========================================
echo Starting Python Interactive Mode
echo ========================================
echo.
echo Usage example:
echo   from NBverse import TextToNBConverter
echo   converter = TextToNBConverter()
echo   result = converter.text_to_nb("Hello")
echo   print(result)
echo.
echo Type exit() or press Ctrl+Z to quit.
echo ========================================
echo.

python -i -c "import sys; import os; parent = os.path.normpath(os.path.join(os.getcwd(), '..')); sys.path.insert(0, parent); from NBverse import *; print('NBverse library loaded successfully.'); print('Available: TextToNBConverter, calculate_sentence_bits, word_nb_unicode_format')"
