@echo off
chcp 65001 >nul
echo ========================================
echo NBverse-Training GitHub 업로드 스크립트
echo ========================================
echo.

REM Git 설치 확인 (여러 경로 확인)
set "GIT_PATH="
where git >nul 2>&1
if %errorlevel% equ 0 (
    for /f "delims=" %%i in ('where git') do set "GIT_PATH=%%i"
) else (
    REM 일반적인 Git 설치 경로 확인
    if exist "F:\Program Files\git\Git\cmd\git.exe" (
        set "GIT_PATH=F:\Program Files\git\Git\cmd\git.exe"
    ) else if exist "C:\Program Files\Git\cmd\git.exe" (
        set "GIT_PATH=C:\Program Files\Git\cmd\git.exe"
    ) else if exist "C:\Program Files (x86)\Git\cmd\git.exe" (
        set "GIT_PATH=C:\Program Files (x86)\Git\cmd\git.exe"
    )
)

if "%GIT_PATH%"=="" (
    echo [오류] Git을 찾을 수 없습니다.
    echo Git이 설치되어 있는지 확인해주세요: https://git-scm.com/download/win
    pause
    exit /b 1
)

REM Git 경로를 PATH에 추가
for %%i in ("%GIT_PATH%") do set "GIT_DIR=%%~dpi"
set "PATH=%GIT_DIR%;%PATH%"

echo [1/6] Git 설치 확인 완료
echo.

REM 현재 디렉토리로 이동
cd /d "%~dp0"
echo [2/6] 작업 디렉토리: %CD%
echo.

REM Git 저장소 초기화 확인
if not exist ".git" (
    echo [3/6] Git 저장소 초기화 중...
    "%GIT_PATH%" init
    if %errorlevel% neq 0 (
        echo [오류] Git 초기화 실패
        pause
        exit /b 1
    )
) else (
    echo [3/6] Git 저장소가 이미 초기화되어 있습니다.
)
echo.

REM 원격 저장소 설정
echo [4/6] 원격 저장소 설정 중...
"%GIT_PATH%" remote remove origin 2>nul
"%GIT_PATH%" remote add origin https://github.com/yoohyunseog/NBverse-Training.git
if %errorlevel% neq 0 (
    echo [오류] 원격 저장소 설정 실패
    pause
    exit /b 1
)
echo 원격 저장소: https://github.com/yoohyunseog/NBverse-Training.git
echo.

REM 파일 추가
echo [5/6] 파일 추가 중...
"%GIT_PATH%" add .
if %errorlevel% neq 0 (
    echo [오류] 파일 추가 실패
    pause
    exit /b 1
)
echo.

REM 커밋
echo [6/6] 커밋 중...
"%GIT_PATH%" commit -m "Initial commit: NBverse-Training v0.0.0.4"
if %errorlevel% neq 0 (
    echo [경고] 커밋 실패 (변경사항이 없을 수 있습니다)
)
echo.

REM 브랜치 이름 확인 및 설정
"%GIT_PATH%" branch -M main 2>nul

REM 푸시
echo [완료] GitHub에 업로드 중...
echo 사용자 인증이 필요할 수 있습니다.
"%GIT_PATH%" push -u origin main
if %errorlevel% neq 0 (
    echo [오류] 푸시 실패
    echo.
    echo 원격 저장소에 이미 내용이 있을 경우:
    echo "%GIT_PATH%" pull origin main --allow-unrelated-histories
    echo "%GIT_PATH%" push -u origin main
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo ✓ GitHub 업로드 완료!
echo 저장소: https://github.com/yoohyunseog/NBverse-Training
echo ========================================
pause
