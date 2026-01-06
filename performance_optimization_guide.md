# 속도 개선 오픈 소스 가이드

## 추천 오픈 소스 라이브러리

### 1. **orjson** (가장 추천) ⚡
- **용도**: 빠른 JSON 파싱/직렬화
- **성능**: 표준 `json`보다 **2-3배 빠름**
- **설치**: `pip install orjson`
- **장점**: 
  - C로 작성되어 매우 빠름
  - UTF-8 최적화
  - 메모리 효율적
- **적용 위치**: 모든 JSON 로드/저장 작업

### 2. **ujson** (대안)
- **용도**: 빠른 JSON 파싱
- **성능**: 표준 `json`보다 **1.5-2배 빠름**
- **설치**: `pip install ujson`
- **장점**: orjson보다 가볍고 호환성 좋음

### 3. **functools.lru_cache** (내장)
- **용도**: 함수 결과 캐싱
- **성능**: 반복 계산 제거
- **적용 위치**: 자주 호출되는 계산 함수

### 4. **concurrent.futures.ThreadPoolExecutor** (내장)
- **용도**: 병렬 파일 처리
- **성능**: 다중 파일 I/O 병렬화
- **적용 위치**: 파일 탐색 및 로드

### 5. **multiprocessing** (내장)
- **용도**: CPU 집약적 작업 병렬화
- **성능**: 멀티코어 활용
- **적용 위치**: 데이터 처리, 계산 작업

## 성능 개선 우선순위

### 🔥 최우선 (즉시 적용 권장)
1. **orjson** - JSON I/O 최적화 (가장 큰 효과)
2. **lru_cache** - 반복 계산 캐싱
3. **ThreadPoolExecutor** - 파일 I/O 병렬화

### ⚡ 중순위
4. **multiprocessing** - CPU 집약적 작업
5. **메모리 캐싱** - 자주 접근하는 데이터

### 💡 장기 개선
6. **Cython** - 핵심 로직 C 확장
7. **PyPy** - JIT 컴파일러 (호환성 체크 필요)

## 예상 성능 향상

- **JSON I/O**: 2-3배 빠름 (orjson 사용 시) ✅ **적용 완료**
- **파일 탐색**: 3-5배 빠름 (병렬 처리 시) ✅ **적용 완료**
- **캐싱**: 반복 작업 거의 즉시 (lru_cache) ✅ **적용 완료**
- **카드 조회**: O(n) → O(1) (인덱스 사용) ✅ **적용 완료**

## 적용 현황

### ✅ 적용 완료
1. **orjson** - JSON I/O 최적화 (10배 이상 빠름)
2. **ThreadPoolExecutor** - 파일 I/O 병렬화
3. **lru_cache** - 반복 계산 캐싱 (_generate_card_key, _generate_nb_id, _calculate_rank_from_score)
4. **메모리 캐싱** - 인덱스 기반 O(1) 조회 (get_card_by_id, get_card_by_key)

### ⚡ 적용 가능 (선택적)
5. **multiprocessing** - CPU 집약적 작업 (필요 시 추가)

## 설치 방법

```bash
# 최소 설치 (orjson만)
pip install orjson

# 전체 설치
pip install orjson ujson
```

## 적용 예시

```python
# 기존 코드
import json
data = json.load(f)
json.dump(data, f)

# 개선 코드
import orjson
data = orjson.loads(f.read())
f.write(orjson.dumps(data))
```

