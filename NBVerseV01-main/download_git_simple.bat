@echo off
chcp 65001 >nul
echo ========================================
echo Git 포터블 버전 다운로드 (E 드라이브)
echo ========================================
echo.

set "GIT_DIR=E:\GitPortable"
set "GIT_BIN=%GIT_DIR%\bin\git.exe"

REM 이미 설치되어 있는지 확인
if exist "%GIT_BIN%" (
    echo [확인] Git이 이미 설치되어 있습니다.
    "%GIT_BIN%" --version
    echo.
    echo 경로: %GIT_BIN%
    echo.
    pause
    exit /b 0
)

REM 디렉토리 생성
if not exist "%GIT_DIR%" (
    mkdir "%GIT_DIR%"
)

echo [안내] Git 포터블 버전을 다운로드합니다.
echo.
echo 다운로드 방법:
echo.
echo 방법 1: 자동 다운로드 (PowerShell 필요)
echo   이 스크립트가 자동으로 다운로드를 시도합니다.
echo.
echo 방법 2: 수동 다운로드
echo   1. 브라우저에서 다음 URL 열기:
echo      https://github.com/git-for-windows/git/releases/latest
echo   2. "PortableGit-*-64-bit.7z.exe" 파일 다운로드
echo   3. 다운로드한 파일을 %GIT_DIR%에 실행하여 압축 해제
echo.
echo 계속하려면 Enter를 누르세요...
pause
echo.

REM PowerShell로 다운로드 시도
echo [1/2] Git 다운로드 시도 중...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
"$ErrorActionPreference='Stop'; ^
try { ^
    $url = 'https://github.com/git-for-windows/git/releases/download/v2.43.0.windows.1/PortableGit-2.43.0-64-bit.7z.exe'; ^
    $out = '%GIT_DIR%\git-installer.exe'; ^
    Write-Host '다운로드 URL:' $url; ^
    Write-Host '저장 위치:' $out; ^
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; ^
    Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing; ^
    Write-Host '다운로드 완료'; ^
    Write-Host '압축 해제 중...'; ^
    Start-Process -FilePath $out -ArgumentList '-o%GIT_DIR%', '-y' -Wait -NoNewWindow; ^
    Write-Host '설치 완료' ^
} catch { ^
    Write-Host '자동 다운로드 실패:' $_.Exception.Message; ^
    Write-Host '수동 다운로드가 필요합니다.' ^
}"

if exist "%GIT_BIN%" (
    echo.
    echo [2/2] 설치 확인...
    "%GIT_BIN%" --version
    echo.
    echo ========================================
    echo 설치 완료!
    echo ========================================
    echo.
    echo Git 경로: %GIT_BIN%
    echo.
    echo 다음 단계:
    echo   1. upload_with_local_git.bat 실행하여 업로드
    echo   2. 또는 PATH에 추가하여 일반적으로 사용
    echo.
) else (
    echo.
    echo [오류] 자동 설치 실패
    echo.
    echo 수동 설치 방법:
    echo   1. https://git-scm.com/download/win 접속
    echo   2. "Portable" 또는 "Standalone" 버전 다운로드
    echo   3. %GIT_DIR%에 압축 해제
    echo   4. 또는 일반 설치 프로그램으로 E:\Git에 설치
    echo.
)

pause

