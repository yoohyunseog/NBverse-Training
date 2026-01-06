@echo off
chcp 65001 >nul
echo ========================================
echo Git 찾기 및 업로드
echo ========================================
echo.

REM Git 경로 찾기
set "GIT_CMD="

REM 방법 1: PATH에서 찾기
where git >nul 2>&1
if not errorlevel 1 (
    for /f "delims=" %%i in ('where git') do (
        set "GIT_CMD=%%i"
        goto :found
    )
)

REM 방법 2: 일반적인 설치 경로
if exist "C:\Program Files\Git\bin\git.exe" (
    set "GIT_CMD=C:\Program Files\Git\bin\git.exe"
    goto :found
)

if exist "C:\Program Files (x86)\Git\bin\git.exe" (
    set "GIT_CMD=C:\Program Files (x86)\Git\bin\git.exe"
    goto :found
)

if exist "F:\Program Files\git\Git\bin\git.exe" (
    set "GIT_CMD=F:\Program Files\git\Git\bin\git.exe"
    goto :found
)

if exist "F:\Program Files\git\Git\cmd\git.exe" (
    set "GIT_CMD=F:\Program Files\git\Git\cmd\git.exe"
    goto :found
)

REM 방법 3: 사용자 AppData에서 찾기
if exist "%LOCALAPPDATA%\Programs\Git\cmd\git.exe" (
    set "GIT_CMD=%LOCALAPPDATA%\Programs\Git\cmd\git.exe"
    goto :found
)

:found
if "%GIT_CMD%"=="" (
    echo [오류] Git을 찾을 수 없습니다.
    echo.
    echo Git 설치 방법:
    echo   1. https://git-scm.com/download/win
    echo   2. 설치 후 PowerShell 재시작
    echo   3. 또는 GitHub Desktop 사용: https://desktop.github.com/
    echo.
    pause
    exit /b 1
)

echo [확인] Git 발견: %GIT_CMD%
"%GIT_CMD%" --version
echo.

REM 작업 디렉토리로 이동
cd /d "%~dp0"
echo 현재 디렉토리: %CD%
echo.

REM Git 저장소 초기화
if not exist ".git" (
    echo [1/6] Git 저장소 초기화...
    "%GIT_CMD%" init
    echo 완료
) else (
    echo [1/6] Git 저장소가 이미 존재합니다.
)
echo.

REM 원격 저장소 설정
echo [2/6] 원격 저장소 설정...
"%GIT_CMD%" remote remove origin 2>nul
"%GIT_CMD%" remote add origin https://github.com/yoohyunseog/NBVerseV01.git
echo 완료
echo.

REM 사용자 정보 설정
echo [3/6] Git 사용자 정보 설정...
"%GIT_CMD%" config user.name "yoohyunseog" 2>nul
"%GIT_CMD%" config user.email "yoohyunseog@users.noreply.github.com" 2>nul
echo 완료
echo.

REM 파일 추가
echo [4/6] 파일 추가...
"%GIT_CMD%" add .
echo 완료
echo.

REM 커밋
echo [5/6] 커밋 생성...
"%GIT_CMD%" commit -m "Initial commit: NBverse library v0.2.0

- N/B 값 계산 기능
- 텍스트를 N/B 값으로 변환
- max/min 폴더 구조로 데이터 저장
- 유사도 검색 기능
- 조회 히스토리 및 타임라인
- pip로 설치 가능한 패키지"
if errorlevel 1 (
    echo [경고] 커밋 실패 (변경사항이 없을 수 있음)
) else (
    echo 완료
)
echo.

REM 브랜치 설정
echo [6/6] 브랜치 설정...
"%GIT_CMD%" branch -M main 2>nul
echo 완료
echo.

REM 푸시
echo ========================================
echo GitHub에 푸시
echo ========================================
echo.
echo [중요] GitHub 인증이 필요합니다.
echo.
echo Personal Access Token 사용:
echo   1. https://github.com/settings/tokens
echo   2. Generate new token (classic)
echo   3. 'repo' 권한 체크
echo   4. 토큰 생성 후 복사
echo   5. 아래에서 Username: yoohyunseog, Password: [토큰] 입력
echo.
pause

"%GIT_CMD%" push -u origin main
if errorlevel 1 (
    echo.
    echo [오류] 푸시 실패
    echo.
    echo 수동 푸시:
    echo   "%GIT_CMD%" push -u origin main
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo 업로드 완료!
echo ========================================
echo.
echo 저장소: https://github.com/yoohyunseog/NBVerseV01
echo.
pause

