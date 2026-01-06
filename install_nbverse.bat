@echo off
chcp 65001 >nul
echo ========================================
echo NBVerseV01 설치 스크립트
echo ========================================
echo.

cd /d "%~dp0"

echo 현재 디렉토리: %CD%
echo.

REM Git이 설치되어 있는지 확인
where git >nul 2>&1
if %ERRORLEVEL% neq 0 (
    echo [오류] Git이 설치되어 있지 않습니다.
    echo.
    echo Git 설치 방법:
    echo 1. https://git-scm.com/download/win 에서 Git 다운로드
    echo 2. 또는 pip로 설치 시도: pip install git+https://github.com/yoohyunseog/NBVerseV01.git
    echo.
    pause
    exit /b 1
)

echo Git이 설치되어 있습니다.
echo.

REM NBVerse 폴더가 이미 있는지 확인
if exist "NBVerse" (
    echo [경고] NBVerse 폴더가 이미 존재합니다.
    set /p overwrite="덮어쓰시겠습니까? (y/n): "
    if /i not "%overwrite%"=="y" (
        echo 설치를 취소했습니다.
        pause
        exit /b 0
    )
    echo 기존 NBVerse 폴더 삭제 중...
    rmdir /s /q NBVerse
)

echo NBVerseV01 저장소 클론 중...
git clone https://github.com/yoohyunseog/NBVerseV01.git NBVerse

if %ERRORLEVEL% neq 0 (
    echo.
    echo [오류] Git 클론에 실패했습니다.
    echo.
    echo 대안 설치 방법:
    echo pip install git+https://github.com/yoohyunseog/NBVerseV01.git
    echo.
    pause
    exit /b 1
)

echo.
echo ✅ NBVerseV01 설치 완료!
echo.
echo 설치 위치: %CD%\NBVerse
echo.
pause

