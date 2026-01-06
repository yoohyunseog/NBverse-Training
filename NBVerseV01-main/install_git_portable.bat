@echo off
chcp 65001 >nul
echo ========================================
echo Git 포터블 버전 설치 (E 드라이브)
echo ========================================
echo.

set "GIT_DIR=E:\GitPortable"
set "GIT_ZIP=%GIT_DIR%\git-portable.zip"
set "GIT_URL=https://github.com/git-for-windows/git/releases/download/v2.43.0.windows.1/PortableGit-2.43.0-64-bit.7z.exe"

REM Git 디렉토리 생성
if not exist "%GIT_DIR%" (
    echo [1/4] Git 디렉토리 생성...
    mkdir "%GIT_DIR%"
    echo 완료
) else (
    echo [1/4] Git 디렉토리가 이미 존재합니다.
)
echo.

REM 다운로드 확인
if exist "%GIT_DIR%\bin\git.exe" (
    echo [확인] Git이 이미 설치되어 있습니다: %GIT_DIR%\bin\git.exe
    "%GIT_DIR%\bin\git.exe" --version
    echo.
    echo PATH에 추가하려면 다음 명령어를 관리자 권한으로 실행하세요:
    echo   setx PATH "%%PATH%%;%GIT_DIR%\bin" /M
    echo.
    pause
    exit /b 0
)

echo [2/4] Git 포터블 버전 다운로드 중...
echo 다운로드 URL: %GIT_URL%
echo 저장 위치: %GIT_ZIP%
echo.

REM PowerShell로 다운로드
powershell -Command "& {[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; Invoke-WebRequest -Uri '%GIT_URL%' -OutFile '%GIT_ZIP%' -UseBasicParsing}"

if not exist "%GIT_ZIP%" (
    echo [오류] 다운로드 실패
    echo.
    echo 수동 다운로드 방법:
    echo   1. https://git-scm.com/download/win 접속
    echo   2. "Portable" 버전 다운로드
    echo   3. %GIT_DIR%에 압축 해제
    echo.
    pause
    exit /b 1
)

echo 다운로드 완료
echo.

REM 7-Zip이 있는지 확인
set "7ZIP_PATH="
if exist "C:\Program Files\7-Zip\7z.exe" (
    set "7ZIP_PATH=C:\Program Files\7-Zip\7z.exe"
) else if exist "C:\Program Files (x86)\7-Zip\7z.exe" (
    set "7ZIP_PATH=C:\Program Files (x86)\7-Zip\7z.exe"
)

if "%7ZIP_PATH%"=="" (
    echo [3/4] 압축 해제를 위해 7-Zip이 필요합니다.
    echo.
    echo 방법 1: 7-Zip 설치
    echo   https://www.7-zip.org/download.html
    echo.
    echo 방법 2: 수동 압축 해제
    echo   1. %GIT_ZIP% 파일을 더블클릭하여 실행
    echo   2. %GIT_DIR%에 압축 해제
    echo.
    pause
    exit /b 1
)

echo [3/4] 압축 해제 중...
"%7ZIP_PATH%" x "%GIT_ZIP%" -o"%GIT_DIR%" -y
if errorlevel 1 (
    echo [오류] 압축 해제 실패
    pause
    exit /b 1
)
echo 완료
echo.

REM Git 실행 파일 확인
if not exist "%GIT_DIR%\bin\git.exe" (
    REM PortableGit 폴더 구조 확인
    if exist "%GIT_DIR%\PortableGit\bin\git.exe" (
        REM PortableGit 폴더 내용을 상위로 이동
        xcopy "%GIT_DIR%\PortableGit\*" "%GIT_DIR%\" /E /I /Y
        rmdir /s /q "%GIT_DIR%\PortableGit"
    )
)

if not exist "%GIT_DIR%\bin\git.exe" (
    echo [오류] Git 실행 파일을 찾을 수 없습니다.
    echo.
    echo 수동 설치:
    echo   1. https://git-scm.com/download/win 에서 다운로드
    echo   2. %GIT_DIR%에 설치
    echo.
    pause
    exit /b 1
)

echo [4/4] Git 설치 확인...
"%GIT_DIR%\bin\git.exe" --version
if errorlevel 1 (
    echo [오류] Git 실행 실패
    pause
    exit /b 1
)
echo 완료
echo.

echo ========================================
echo 설치 완료!
echo ========================================
echo.
echo Git 경로: %GIT_DIR%\bin\git.exe
echo.

REM 현재 세션에 PATH 추가
set "PATH=%PATH%;%GIT_DIR%\bin"

echo [선택] PATH에 추가하시겠습니까? (Y/N)
set /p ADD_PATH="입력: "

if /i "%ADD_PATH%"=="Y" (
    echo.
    echo PATH에 추가 중...
    setx PATH "%PATH%;%GIT_DIR%\bin"
    echo 완료 (새 PowerShell 창에서 적용됨)
) else (
    echo.
    echo PATH에 추가하지 않았습니다.
    echo.
    echo 사용 방법:
    echo   "%GIT_DIR%\bin\git.exe" --version
    echo.
    echo 또는 배치 파일에서:
    echo   set "GIT_CMD=%GIT_DIR%\bin\git.exe"
    echo   %%GIT_CMD%% --version
)

echo.
pause

