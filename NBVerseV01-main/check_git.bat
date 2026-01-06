@echo off
chcp 65001 >nul
echo ========================================
echo Git 설치 및 상태 확인
echo ========================================
echo.

REM Git 설치 확인
where git >nul 2>&1
if errorlevel 1 (
    echo [오류] Git이 설치되어 있지 않거나 PATH에 없습니다.
    echo.
    echo Git 설치 방법:
    echo 1. https://git-scm.com/download/win 에서 다운로드
    echo 2. 또는 Chocolatey 사용: choco install git
    echo.
    pause
    exit /b 1
)

echo [확인] Git이 설치되어 있습니다.
git --version
echo.

REM 현재 디렉토리 확인
cd /d "%~dp0"
echo 현재 디렉토리: %CD%
echo.

REM Git 저장소 상태 확인
if exist ".git" (
    echo [확인] Git 저장소가 초기화되어 있습니다.
    echo.
    echo Git 상태:
    git status
    echo.
    echo 원격 저장소:
    git remote -v
    echo.
) else (
    echo [알림] Git 저장소가 초기화되지 않았습니다.
    echo.
    echo 초기화하려면 다음 명령어를 실행하세요:
    echo   git init
    echo   git remote add origin https://github.com/yoohyunseog/NBVerseV0.0.0.1.git
    echo   git add .
    echo   git commit -m "Initial commit"
    echo   git branch -M main
    echo   git push -u origin main
    echo.
)

pause

