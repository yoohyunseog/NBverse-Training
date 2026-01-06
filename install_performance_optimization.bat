@echo off
echo ========================================
echo 성능 최적화 라이브러리 설치
echo ========================================
echo.

REM 가상환경 활성화
if exist "E:\python_env\Scripts\activate.bat" (
    call E:\python_env\Scripts\activate.bat
    echo ✅ 가상환경 활성화 완료
) else (
    echo ⚠️ 가상환경을 찾을 수 없습니다. 기본 Python을 사용합니다.
)

echo.
echo 📦 orjson 설치 중... (빠른 JSON 처리)
pip install orjson>=3.9.0

if %ERRORLEVEL% EQU 0 (
    echo ✅ orjson 설치 완료!
    echo.
    echo 📊 성능 개선 효과:
    echo    - JSON 로드: 2-3배 빠름
    echo    - JSON 저장: 2-3배 빠름
    echo    - 메모리 사용: 더 효율적
    echo.
    echo 🧪 성능 테스트 실행 중...
    python test_orjson.py
) else (
    echo ⚠️ orjson 설치 실패. 표준 json을 사용합니다.
    echo    (기능에는 영향 없음, 속도만 약간 느림)
    echo.
    echo 💡 해결 방법:
    echo    1. Python 버전 확인 (Python 3.7 이상 필요)
    echo    2. pip 업그레이드: python -m pip install --upgrade pip
    echo    3. Visual C++ 빌드 도구 필요할 수 있음 (Windows)
)

echo.
echo ========================================
echo 설치 완료!
echo ========================================
pause

