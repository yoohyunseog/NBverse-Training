@echo off
chcp 65001 >nul
echo ========================================
echo Git 상세 확인
echo ========================================
echo.

REM 여러 경로에서 Git 찾기
set "GIT_FOUND=0"
set "GIT_PATH="

echo [1] 일반적인 설치 경로 확인 중...
if exist "C:\Program Files\Git\bin\git.exe" (
    set "GIT_PATH=C:\Program Files\Git\bin\git.exe"
    set "GIT_FOUND=1"
    echo   ✅ 발견: C:\Program Files\Git\bin\git.exe
    goto :test_git
)

if exist "C:\Program Files (x86)\Git\bin\git.exe" (
    set "GIT_PATH=C:\Program Files (x86)\Git\bin\git.exe"
    set "GIT_FOUND=1"
    echo   ✅ 발견: C:\Program Files (x86)\Git\bin\git.exe
    goto :test_git
)

if exist "F:\Program Files\git\Git\cmd\git.exe" (
    set "GIT_PATH=F:\Program Files\git\Git\cmd\git.exe"
    set "GIT_FOUND=1"
    echo   ✅ 발견: F:\Program Files\git\Git\cmd\git.exe
    goto :test_git
)

echo   ❌ 일반 경로에서 찾을 수 없음
echo.

echo [2] PATH에서 검색 중...
where git >nul 2>&1
if not errorlevel 1 (
    for /f "delims=" %%i in ('where git') do (
        set "GIT_PATH=%%i"
        set "GIT_FOUND=1"
        echo   ✅ 발견: %%i
        goto :test_git
    )
)
echo   ❌ PATH에서 찾을 수 없음
echo.

:test_git
if %GIT_FOUND%==0 (
    echo ========================================
    echo [결과] Git을 찾을 수 없습니다.
    echo ========================================
    echo.
    echo Git 설치 방법:
    echo   1. https://git-scm.com/download/win 에서 다운로드
    echo   2. 설치 시 "Add Git to PATH" 옵션 체크
    echo   3. 또는 GitHub Desktop 사용: https://desktop.github.com/
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo [결과] Git 발견!
echo ========================================
echo.
echo Git 경로: %GIT_PATH%
echo.

echo [3] Git 버전 확인...
"%GIT_PATH%" --version
if errorlevel 1 (
    echo   ❌ Git 실행 실패
    pause
    exit /b 1
)
echo.

echo [4] 현재 디렉토리 확인...
cd /d "%~dp0"
echo   현재 디렉토리: %CD%
echo.

echo [5] Git 저장소 상태 확인...
if exist ".git" (
    echo   ✅ Git 저장소가 초기화되어 있습니다.
    echo.
    echo   원격 저장소:
    "%GIT_PATH%" remote -v
    echo.
    echo   현재 상태:
    "%GIT_PATH%" status --short
) else (
    echo   ⚠️  Git 저장소가 초기화되지 않았습니다.
    echo.
    echo   초기화하려면:
    echo     "%GIT_PATH%" init
)

echo.
echo ========================================
echo 확인 완료!
echo ========================================
echo.
echo Git 경로를 사용하여 업로드할 수 있습니다:
echo   "%GIT_PATH%" push -u origin main
echo.
pause

