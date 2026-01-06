@echo off
chcp 65001 >nul
echo ========================================
echo NBverse GitHub 업로드 (로컬 Git 사용)
echo ========================================
echo.

REM 로컬 Git 경로 설정
set "GIT_DIR=E:\GitPortable"
set "GIT_CMD=%GIT_DIR%\bin\git.exe"

REM Git 확인
if not exist "%GIT_CMD%" (
    echo [오류] Git을 찾을 수 없습니다: %GIT_CMD%
    echo.
    echo Git 설치 방법:
    echo   1. install_git_portable.bat 실행
    echo   2. 또는 https://git-scm.com/download/win 에서 다운로드
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

- N/B 값 계산 기능 (bitCalculation.v.0.2.js 기반)
- 텍스트를 N/B 값으로 변환
- max/min 폴더 구조로 데이터 저장
- CLI 도구 및 입력/조회 기능
- 유사도 검색 기능 (N/B 값, 텍스트, 하이브리드)
- 조회 히스토리 및 타임라인 저장
- 설정 관리 (소수점 자리수 등)
- pip로 설치 가능한 패키지"
if errorlevel 1 (
    echo [경고] 커밋 실패 (변경사항이 없을 수 있음)
    "%GIT_CMD%" log --oneline -1 2>nul
) else (
    echo 완료
)
echo.

REM 브랜치 설정
echo [6/6] 브랜치 설정...
"%GIT_CMD%" branch -M main 2>nul
if errorlevel 1 (
    "%GIT_CMD%" checkout -b main 2>nul
)
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
    echo 가능한 원인:
    echo 1. GitHub 인증 실패 (Personal Access Token 필요)
    echo 2. 저장소 권한 없음
    echo 3. 네트워크 문제
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
echo 설치 방법:
echo   pip install git+https://github.com/yoohyunseog/NBVerseV01.git
echo.
pause

