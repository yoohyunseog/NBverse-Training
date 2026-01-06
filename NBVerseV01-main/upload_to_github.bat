@echo off
chcp 65001 >nul
echo ========================================
echo NBverse GitHub Upload
echo ========================================
echo.

REM Git 설치 확인
where git >nul 2>&1
if errorlevel 1 (
    echo [오류] Git이 설치되어 있지 않거나 PATH에 없습니다.
    echo Git을 설치하거나 PATH에 추가한 후 다시 시도하세요.
    echo.
    echo Git 다운로드: https://git-scm.com/download/win
    pause
    exit /b 1
)

REM 작업 디렉토리로 이동
cd /d "%~dp0"
echo 현재 디렉토리: %CD%
echo.

REM Git 저장소 초기화 (이미 있으면 스킵)
if not exist ".git" (
    echo [1/6] Git 저장소 초기화...
    git init
    if errorlevel 1 (
        echo [오류] Git 초기화 실패
        pause
        exit /b 1
    )
    echo 완료
) else (
    echo [1/6] Git 저장소가 이미 존재합니다.
)
echo.

REM 원격 저장소 설정
echo [2/6] 원격 저장소 설정...
git remote remove origin 2>nul
git remote add origin https://github.com/yoohyunseog/NBVerseV0.0.0.1.git
if errorlevel 1 (
    echo [경고] 원격 저장소 설정 실패 (이미 설정되어 있을 수 있음)
) else (
    echo 완료
)
echo.

REM 모든 파일 추가
echo [3/6] 파일 추가...
git add .
if errorlevel 1 (
    echo [오류] 파일 추가 실패
    pause
    exit /b 1
)
echo 완료
echo.

REM 커밋
echo [4/6] 커밋 생성...
git commit -m "Initial commit: NBverse library v0.2.0

- N/B 값 계산 기능 (bitCalculation.v.0.2.js 기반)
- 텍스트를 N/B 값으로 변환
- max/min 폴더 구조로 데이터 저장
- CLI 도구 및 입력/조회 기능
- 유사도 검색 기능 (N/B 값, 텍스트, 하이브리드)
- 조회 히스토리 및 타임라인 저장
- 설정 관리 (소수점 자리수 등)
- 배치 파일로 실행 가능"
if errorlevel 1 (
    echo [경고] 커밋 실패 (변경사항이 없을 수 있음)
) else (
    echo 완료
)
echo.

REM 브랜치 이름 확인 및 설정
echo [5/6] 브랜치 확인...
git branch -M main 2>nul
if errorlevel 1 (
    git checkout -b main 2>nul
)
echo 완료
echo.

REM 푸시
echo [6/6] GitHub에 푸시...
echo.
echo [주의] GitHub 인증이 필요할 수 있습니다.
echo GitHub 사용자 이름과 Personal Access Token을 입력하세요.
echo.
git push -u origin main
if errorlevel 1 (
    echo.
    echo [오류] 푸시 실패
    echo.
    echo 가능한 원인:
    echo 1. GitHub 인증 실패
    echo 2. 저장소 권한 없음
    echo 3. 네트워크 문제
    echo.
    echo 수동 푸시 방법:
    echo   git push -u origin main
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo 업로드 완료!
echo ========================================
echo.
echo 저장소 주소: https://github.com/yoohyunseog/NBVerseV0.0.0.1
echo.
pause

