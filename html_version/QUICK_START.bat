@echo off
chcp 65001 >nul
title Trading Bot HTML 버전 - 빠른 시작
color 0A

echo.
echo ╔═══════════════════════════════════════════════════════╗
echo ║     Trading Bot HTML 버전 - 빠른 시작                  ║
echo ╚═══════════════════════════════════════════════════════╝
echo.
echo 권장: start_server_with_http_server.bat 사용
echo.
echo 1. HTTP 서버 포함 (권장) - CORS 이슈 없음
echo 2. 간단한 버전 - 로컬 파일 직접 열기
echo 3. 서버 종료
echo.
set /p choice="선택 (1/2/3): "

if "%choice%"=="1" (
    call start_server_with_http_server.bat
) else if "%choice%"=="2" (
    call start_server.bat
) else if "%choice%"=="3" (
    call stop_server.bat
) else (
    echo 잘못된 선택입니다.
    pause
)

