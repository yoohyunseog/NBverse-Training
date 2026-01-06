@echo off
echo ========================================
echo 성능 프로파일링 실행
echo ========================================
echo.

REM 현재 스크립트의 디렉토리로 이동
cd /d "%~dp0\.."

REM 현재 디렉토리 확인
echo 현재 디렉토리: %CD%
echo.

REM 가상환경 활성화
if exist "E:\python_env\Scripts\activate.bat" (
    call E:\python_env\Scripts\activate.bat
    echo ✅ 가상환경 활성화 완료
) else (
    echo ⚠️ 가상환경을 찾을 수 없습니다. 기본 Python을 사용합니다.
)

echo.
echo 📊 프로파일링 시작...
echo.

REM 프로파일링 디렉토리 생성
if not exist "profiling" mkdir profiling

REM 프로파일링 실행 (현재 디렉토리 기준)
E:\python_env\Scripts\python.exe profiling\profile_production_cards.py

echo.
echo ========================================
echo 프로파일링 완료!
echo ========================================
echo.
echo 📊 결과 분석:
echo    E:\python_env\Scripts\python.exe profiling\analyze_profile.py
echo.
pause

