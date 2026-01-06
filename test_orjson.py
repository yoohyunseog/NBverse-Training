"""orjson 설치 및 작동 확인 스크립트"""
import sys
import io

# Windows 콘솔 인코딩 설정
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

print("=" * 50)
print("orjson 설치 확인")
print("=" * 50)
print()

# 1. orjson 설치 확인
try:
    import orjson
    print("✅ orjson이 설치되어 있습니다!")
    print(f"   버전: {orjson.__version__ if hasattr(orjson, '__version__') else '확인 불가'}")
except ImportError:
    print("❌ orjson이 설치되지 않았습니다.")
    print()
    print("설치 방법:")
    print("  pip install orjson")
    print()
    print("또는:")
    print("  install_performance_optimization.bat 실행")
    sys.exit(1)

print()

# 2. 성능 테스트
import json
import time

test_data = {
    "cards": [
        {
            "card_id": f"test_card_{i}",
            "card_key": f"minute15_nb_minute15_{i}",
            "timeframe": "minute15",
            "nb_value": 0.1234567890 + i * 0.001,
            "production_time": "2025-01-01T00:00:00",
            "history_list": [
                {
                    "history_id": f"hist_{i}_{j}",
                    "type": "NEW",
                    "timestamp": "2025-01-01T00:00:00",
                    "qty": 0.001,
                    "entry_price": 1000000.0 + j * 1000
                }
                for j in range(10)
            ]
        }
        for i in range(100)
    ],
    "saved_at": "2025-01-01T00:00:00"
}

print("=" * 50)
print("성능 테스트 (100개 카드, 각 10개 히스토리)")
print("=" * 50)
print()

# 표준 json 테스트
start_time = time.time()
for _ in range(100):
    json_str = json.dumps(test_data, ensure_ascii=False, indent=2)
    json_data = json.loads(json_str)
json_time = time.time() - start_time

# orjson 테스트
start_time = time.time()
for _ in range(100):
    orjson_bytes = orjson.dumps(test_data, option=orjson.OPT_INDENT_2)
    orjson_data = orjson.loads(orjson_bytes)
orjson_time = time.time() - start_time

print(f"표준 json: {json_time:.4f}초 (100회 반복)")
print(f"orjson:     {orjson_time:.4f}초 (100회 반복)")
print()
print(f"성능 향상: {json_time / orjson_time:.2f}배 빠름")
print()

if orjson_time < json_time:
    print("✅ orjson이 표준 json보다 빠릅니다!")
else:
    print("⚠️ 예상과 다르게 표준 json이 더 빠릅니다. (데이터 크기나 환경에 따라 다를 수 있음)")

print()
print("=" * 50)
print("테스트 완료!")
print("=" * 50)

