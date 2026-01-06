@echo off
chcp 65001 >nul
echo ========================================
echo NBverse 패키지 빌드
echo ========================================
echo.

REM 가상환경 활성화
if exist "E:\python_env\Scripts\activate.bat" (
    call E:\python_env\Scripts\activate.bat >nul 2>&1
    echo 가상환경 활성화됨
)

REM 작업 디렉토리로 이동
cd /d "%~dp0"
echo 현재 디렉토리: %CD%
echo.

REM 이전 빌드 파일 삭제
echo [1/3] 이전 빌드 파일 정리...
if exist "build" rmdir /s /q build
if exist "dist" rmdir /s /q dist
if exist "*.egg-info" rmdir /s /q *.egg-info
echo 완료
echo.

REM 패키지 빌드
echo [2/3] 패키지 빌드 중...
python -m pip install --upgrade build wheel setuptools
python -m build
if errorlevel 1 (
    echo [오류] 빌드 실패
    pause
    exit /b 1
)
echo 완료
echo.

REM 빌드 결과 확인
echo [3/3] 빌드 결과 확인...
if exist "dist" (
    echo.
    echo 빌드된 파일:
    dir /b dist
    echo.
    echo 설치 방법:
    echo   pip install dist\nbverse-0.2.0-py3-none-any.whl
    echo   또는
    echo   pip install dist\nbverse-0.2.0.tar.gz
) else (
    echo [오류] dist 폴더가 생성되지 않았습니다.
)

echo.
pause

