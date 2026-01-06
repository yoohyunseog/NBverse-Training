@echo off
chcp 65001 >nul
echo ========================================
echo GitHub에 푸시
echo ========================================
echo.

set "GIT_CMD=E:\GitPortable\bin\git.exe"

cd /d "%~dp0"

echo [확인] 현재 상태:
"%GIT_CMD%" status
echo.

echo [중요] GitHub 인증이 필요합니다.
echo.
echo Personal Access Token 사용 방법:
echo   1. https://github.com/settings/tokens 접속
echo   2. "Generate new token (classic)" 클릭
echo   3. Token name: "NBverse Upload" 입력
echo   4. "repo" 권한 체크
echo   5. "Generate token" 클릭
echo   6. 생성된 토큰을 복사 (한 번만 보여집니다!)
echo.
echo 푸시 시:
echo   Username: yoohyunseog
echo   Password: [복사한 토큰]
echo.
echo 계속하려면 Enter를 누르세요...
pause
echo.

echo [푸시 중...]
"%GIT_CMD%" push -u origin main

if errorlevel 1 (
    echo.
    echo [오류] 푸시 실패
    echo.
    echo 가능한 원인:
    echo 1. GitHub 인증 실패 (토큰이 올바른지 확인)
    echo 2. 저장소 권한 없음
    echo 3. 네트워크 문제
    echo.
    echo 수동 푸시:
    echo   "%GIT_CMD%" push -u origin main
    echo.
) else (
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
)

pause

