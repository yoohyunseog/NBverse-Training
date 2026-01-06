# NBverse

문자열을 N/B 값으로 변환하는 Python 라이브러리입니다. JavaScript `bitCalculation.v.0.2.js`의 로직을 Python으로 구현했습니다.

[![Python Version](https://img.shields.io/badge/python-3.8+-blue.svg)](https://www.python.org/downloads/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

## 주요 기능

- ✅ **텍스트를 N/B 값으로 변환**: bitMax, bitMin 계산
- ✅ **하이브리드 저장 방식**: 
  - **컴팩트 저장소**: 단일 JSON 파일에 최대 25개 유지 (FIFO 방식, 빠른 조회)
  - **Verse 저장소**: 경로 기반 중첩 폴더 구조로 영구 저장 (max/min 폴더)
- ✅ **경로 기반 검색**: N/B 값을 경로로 변환하여 직접 접근 (매우 빠름)
- ✅ **범위 검색 최적화**: 경로 검색만 수행, 자동 범위 제한 (전체 스캔 불필요)
- ✅ **유사도 경로 최적화**: 비슷한 값들이 같은 폴더에 위치하여 빠른 검색
- ✅ **유사도 검색**: N/B 값, 텍스트, 하이브리드 유사도 계산
- ✅ **조회 히스토리**: 조회 기록 및 타임라인 저장 (자동)
- ✅ **타임스탬프**: 모든 데이터에 자동 타임스탬프 생성
- ✅ **CLI 도구**: 대화형 입력/조회 인터페이스
- ✅ **설정 관리**: 소수점 자리수, 데이터 디렉토리 등

## 설치

### pip로 설치 (권장)

```bash
pip install git+https://github.com/yoohyunseog/NBVerseV01.git
```

### 로컬에서 설치

```bash
git clone https://github.com/yoohyunseog/NBVerseV01.git
cd NBVerseV01
pip install .
```

### 개발 모드 설치

```bash
git clone https://github.com/yoohyunseog/NBVerseV01.git
cd NBVerseV01
pip install -e .
```

## 빠른 시작

### 기본 사용

```python
from NBverse import convert_text

# 텍스트를 N/B 값으로 변환
result = convert_text("안녕하세요")
print(f"bitMax: {result['bitMax']:.10f}")
print(f"bitMin: {result['bitMin']:.10f}")
```

### 저장 기능

#### 하이브리드 저장 방식

NBVerse는 **하이브리드 저장 방식**을 사용합니다:
- **컴팩트 저장소**: 최근 데이터 빠른 조회 (기존 방식 활용)
- **Verse 저장소**: 경로 기반 영구 저장 (데이터는 NBVerse에 저장)

#### 컴팩트 저장소 (빠른 조회용)

```python
from NBverse import add_text_compact

# 1개씩 추가 (최대 25개 유지, 자동 타임스탬프)
result = add_text_compact("테스트 1")
print(f"ID: {result['id']}")
print(f"타임스탬프: {result['timestamp']}")
print(f"총 항목: {result['total_items']}/25")
```

#### Verse 저장소 (경로 기반 영구 저장)

```python
from NBverse import save_text, NBverseStorage

# 텍스트 저장 (자동으로 경로 기반 저장)
result = save_text("Hello World")
print(f"저장 경로: {result['max_path']}")
# 예: novel_ai/v1.0.7/data/max/1/2/3/4/5/0/123450_타임스탬프.json

# 경로 기반 검색 (매우 빠름)
storage = NBverseStorage()
nb_value = 0.12345
found = storage.find_by_nb_value(nb_value, folder_type="max", limit=10)
# 경로만 계산하면 바로 접근 가능!
```

#### Verse 방식의 작동 원리

**N/B 값을 경로로 변환**:
- `0.12345` → `123450` (정수 변환)
- `123450` → `max/1/2/3/4/5/0/` (자릿수별 폴더 분리)
- 해당 경로에 파일 저장

**범위 검색 최적화**:
- 범위 제한도 경로 검색만 수행
- 자릿수를 줄이면 자동으로 범위 확장
- 예: `max/1/2/3/4/` → 12340~12399 범위 (100개)
- 예: `max/1/2/3/` → 12300~12399 범위 (1000개)

**유사도 경로 최적화**:
- 비슷한 N/B 값들이 같은 상위 폴더에 위치
- 상위 폴더만 확인하면 유사한 값들을 한 번에 찾음
- 전체 스캔 불필요, 매우 빠른 검색

### 전체 기능 사용

```python
from NBverse import (
    TextToNBConverter,
    NBverseStorage,
    QueryHistory,
    calculate_hybrid_similarity
)

# 변환기 생성
converter = TextToNBConverter(decimal_places=10)
result = converter.text_to_nb("안녕하세요")

# 저장소 사용
storage = NBverseStorage()
storage.save_text("안녕하세요")

# 히스토리 관리
history = QueryHistory()
history.add_query("안녕하세요", query_type="exact", found=True)
```

## 사용 예제

### 예제 1: 간단한 변환

```python
from NBverse import convert_text

result = convert_text("안녕하세요", bit=5.5, decimal_places=10)
print(f"bitMax: {result['bitMax']:.10f}")
print(f"bitMin: {result['bitMin']:.10f}")
print(f"유니코드 배열: {result['unicodeArray']}")
```

### 예제 2: 컴팩트 저장소 사용

```python
from NBverse import NBverseCompactStorage

storage = NBverseCompactStorage(max_items=25)

# 1개씩 추가 (타임스탬프 자동 생성)
result = storage.add_text("테스트 1")
print(f"추가됨: {result['text']} (ID: {result['id']})")

# 저장된 항목 조회
items = storage.get_items(limit=10)
for item in items:
    print(f"{item['timestamp']}: {item['text']}")

# 히스토리 조회
history = storage.get_history(limit=10)
for entry in history:
    print(f"{entry['timestamp']}: {entry['action']} - {entry['text']}")
```

### 예제 2-1: 하이브리드 저장소 사용 (권장)

```python
from NBverse import NBverseHybridStorage

# 하이브리드 저장소 초기화
storage = NBverseHybridStorage(
    compact_file="novel_ai/v1.0.7/data/nbverse_data.json",
    verse_data_dir="novel_ai/v1.0.7/data",
    max_items=25
)

# 텍스트 저장 (하이브리드 방식)
# - Verse 저장소에 실제 데이터 저장
# - 컴팩트 저장소에 경로 정보만 저장
result = storage.save_text("안녕하세요")
print(f"저장 완료: {result['text']}")
print(f"Verse 경로: {result['verse_max_path']}")

# 하이브리드 검색 (경로 조회 → 데이터 로드)
# - 컴팩트 저장소에서 경로 정보만 조회
# - Verse 저장소에서 실제 데이터 로드
nb_max = result['bitMax']
search_results = storage.search_hybrid(nb_max, folder_type="max", limit=5)

for item in search_results:
    data = item.get('data', {})
    print(f"텍스트: {data.get('text')}")
    print(f"경로: {item.get('path')}")

# 경로로 직접 데이터 로드
loaded_data = storage.find_by_path(result['verse_max_path'])
print(f"로드된 데이터: {loaded_data.get('text')}")
```

### 예제 3: 데이터 저장 및 조회 (경로 기반)

```python
from NBverse import NBverseStorage

storage = NBverseStorage(data_dir="novel_ai/v1.0.7/data")

# 저장 (자동으로 경로 기반 저장)
result = storage.save_text("안녕하세요", metadata={'source': 'example'})
# bitMax = 0.12345 → 경로: max/1/2/3/4/5/0/
# bitMin = 4.28260 → 경로: min/4/2/8/2/6/0/

# 경로 기반 조회 (매우 빠름)
found = storage.find_by_nb_value(result['bitMax'], folder_type="max", limit=10)
# 경로 계산만 하면 바로 접근 가능!
for item in found:
    print(f"텍스트: {item['data'].get('text')}")
    print(f"경로: {item['path']}")
```

### 예제 3-1: 범위 검색 (경로 검색만 수행)

```python
from NBverse import NBverseStorage

storage = NBverseStorage()

# 범위 검색 (경로 검색만 수행, 전체 스캔 불필요)
results = storage.find_similar_by_nb_range(
    nb_max=1.335196513,
    nb_min=4.2826049049,
    range_threshold=0.5,  # ±0.5 범위
    limit=50
)

# 검색 과정:
# 1. 범위 계산: 0.835196513 ~ 1.835196513
# 2. 경로 계산만 수행 (자동 범위 제한)
# 3. 해당 경로의 파일들만 검색
# 4. 매우 빠른 검색 속도!

for item in results:
    print(f"유사 항목: {item['data'].get('text')}")
```

### 예제 4: 유사도 검색

```python
from NBverse import (
    TextToNBConverter,
    NBverseStorage,
    find_similar_items
)

converter = TextToNBConverter()
storage = NBverseStorage()

# 텍스트 변환
result = converter.text_to_nb("안녕하세요")
bit_max = result['bitMax']
bit_min = result['bitMin']

# 범위 검색
range_results = storage.find_similar_by_nb_range(bit_max, bit_min, range_threshold=1.0)

# 유사도 계산
similar_items = find_similar_items(
    input_text="안녕하세요",
    input_max=bit_max,
    input_min=bit_min,
    stored_items=range_results,
    threshold=0.7,
    method='hybrid',
    limit=10
)

for item in similar_items:
    print(f"유사도: {item['similarity']:.2%} - {item['text']}")
```

### 예제 5: 조회 히스토리

```python
from NBverse import QueryHistory

history = QueryHistory()

# 조회 기록 추가
history.add_query(
    query_text="안녕하세요",
    query_type="similar",
    found=True,
    result_count=5
)

# 타임라인 조회
timeline = history.get_timeline(limit=10)
for record in timeline:
    print(f"{record['timestamp']}: {record['query_text']}")

# 통계
stats = history.get_statistics()
print(f"총 조회: {stats['total_queries']}")
print(f"성공률: {stats['success_rate']:.1f}%")
```

## CLI 도구

### 입력/조회 도구

```bash
# Windows
input_view.bat

# 또는 Python으로 실행
python -m NBverse.input_view
```

### 전체 CLI 도구

```bash
# Windows
run_cli.bat

# 또는 Python으로 실행
python -m NBverse.cli
```

### 하이브리드 저장소 테스트

```bash
# Windows
run_hybrid_test.bat

# 또는 Python으로 실행 (상위 디렉토리에서)
cd ..
python -m NBverse.test_hybrid_storage
```

### 하이브리드 저장소 예제

```bash
# Windows
run_hybrid_example.bat

# 또는 Python으로 실행 (상위 디렉토리에서)
cd ..
python -m NBverse.hybrid_example
```

## API 문서

### 주요 클래스

#### `TextToNBConverter`
텍스트를 N/B 값으로 변환하는 클래스

```python
converter = TextToNBConverter(bit=5.5, decimal_places=10)
result = converter.text_to_nb("텍스트")
```

#### `NBverseStorage`
데이터 저장 및 조회 클래스 (경로 기반 Verse 방식)

```python
storage = NBverseStorage(data_dir="novel_ai/v1.0.7/data")

# 저장 (자동으로 경로 기반 저장)
storage.save_text("텍스트")

# 경로 기반 조회 (매우 빠름)
storage.find_by_nb_value(3.14, folder_type="max")

# 범위 검색 (경로 검색만 수행)
storage.find_similar_by_nb_range(
    nb_max=1.335196513,
    nb_min=4.2826049049,
    range_threshold=0.5
)
```

**Verse 방식의 장점**:
- 경로만 있으면 바로 접근 (O(1)에 가까운 속도)
- 범위 검색도 경로 검색만 수행 (전체 스캔 불필요)
- 유사한 값들이 같은 폴더에 위치하여 빠른 검색
- 기존 save/load 방식과 다른 알고리즘, 매우 빠른 속도

#### `QueryHistory`
조회 히스토리 관리 클래스

```python
history = QueryHistory()
history.add_query("텍스트", query_type="exact", found=True)
timeline = history.get_timeline(limit=10)
```

#### `NBverseHybridStorage`
하이브리드 저장소 클래스 (컴팩트 저장소 + Verse 저장소)

```python
storage = NBverseHybridStorage(
    compact_file="novel_ai/v1.0.7/data/nbverse_data.json",
    verse_data_dir="novel_ai/v1.0.7/data"
)

# 저장 (하이브리드 방식)
result = storage.save_text("텍스트")
# - Verse 저장소에 실제 데이터 저장
# - 컴팩트 저장소에 경로 정보만 저장

# 하이브리드 검색
results = storage.search_hybrid(nb_value=0.12345, folder_type="max")
# - 컴팩트 저장소에서 경로 정보만 조회
# - Verse 저장소에서 실제 데이터 로드

# 경로로 직접 로드
data = storage.find_by_path("verse/max/1/2/3/4/5/0/파일.json")
```

### 편의 함수

- `convert_text(text, bit=5.5, decimal_places=10)` - 텍스트를 N/B 값으로 변환
- `save_text(text, data_dir="novel_ai/v1.0.7/data", metadata=None)` - 텍스트 저장

### 유사도 함수

- `calculate_nb_similarity(input_max, input_min, stored_max, stored_min)` - N/B 값 기반 유사도
- `calculate_text_similarity(text1, text2)` - 텍스트 기반 유사도
- `calculate_hybrid_similarity(...)` - 하이브리드 유사도
- `find_similar_items(...)` - 유사 항목 검색

## 파일 구조

```
NBverse/
├── __init__.py          # 메인 인터페이스
├── calculator.py         # N/B 값 계산 로직
├── converter.py         # 텍스트 변환
├── storage.py           # Verse 저장소 (경로 기반 max/min 폴더)
├── compact_storage.py   # 컴팩트 저장소 (25개 제한, FIFO)
├── hybrid_storage.py    # 하이브리드 저장소 (경로만 저장 + Verse 저장)
├── similarity.py        # 유사도 계산
├── history.py           # 조회 히스토리 관리
├── config.py            # 설정 관리
├── utils.py             # 유틸리티 함수
├── cli.py               # CLI 도구
├── input_view.py        # 입력/조회 도구
├── example.py           # 사용 예제
├── hybrid_example.py    # 하이브리드 저장소 예제
├── test_basic.py        # 테스트
└── test_hybrid_storage.py  # 하이브리드 저장소 테스트
```

## Verse 방식: 경로 기반 저장 및 검색

### 핵심 개념

**Verse = Universe (우주)**: N/B 값들의 저장 공간

**경로 기반 저장**:
- N/B 값을 경로로 변환하여 저장
- 예: `0.12345` → `max/1/2/3/4/5/0/123450_타임스탬프.json`
- 각 자릿수가 폴더로 분리되어 중첩 구조 생성

**경로 기반 검색**:
- 경로만 계산하면 바로 데이터 접근
- 범위 검색도 경로 검색만 수행
- 전체 스캔 불필요, 매우 빠른 속도

### 하이브리드 저장 방식

1. **컴팩트 저장소**: 기존 저장 방식 활용
   - 최근 데이터 빠른 조회
   - 단일 JSON 파일, 최대 25개 유지

2. **Verse 저장소**: 경로 기반 영구 저장
   - 모든 데이터는 NBVerse에 저장
   - 경로만 있으면 바로 접근
   - 범위 검색도 경로 검색만 수행

### 속도가 빠른 이유

1. **경로 직접 접근**: 전체 데이터 로드 불필요
2. **자동 범위 제한**: 폴더 구조가 자동으로 범위 제한
3. **유사도 경로 최적화**: 비슷한 값들이 같은 폴더에 위치
4. **메모리 효율**: 필요한 부분만 로드
5. **알고리즘 차이**: 기존 save/load 방식과 다른 알고리즘

### 범위 검색 최적화

**자릿수 줄이기 = 범위 확장**:
- `max/1/2/3/4/5/` → 정확히 1개
- `max/1/2/3/4/` → 0~99 범위 (100개)
- `max/1/2/3/` → 0~999 범위 (1000개)

**유사도 경로**:
- 비슷한 N/B 값들이 같은 상위 폴더에 위치
- 상위 폴더만 확인하면 유사한 값들을 한 번에 찾음
- 밀접한 관계끼리 붙어있어 매우 빠른 검색

## 원본 코드

- JavaScript: https://xn--9l4b4xi9r.com/_8%EB%B9%84%ED%8A%B8/js/bitCalculation.v.0.2.js
- NBverse 서버: https://github.com/yoohyunseog/NBverse

## 요구사항

- Python 3.8 이상
- 외부 의존성 없음

## 라이선스

MIT License

## 기여

이슈 및 풀 리퀘스트를 환영합니다!

## 버전

현재 버전: **v0.2.1**

### 주요 변경사항 (v0.2.1)
- ✅ 컴팩트 저장소 추가 (25개 제한, FIFO 방식)
- ✅ 타임스탬프 자동 생성
- ✅ 히스토리 자동 기록
- ✅ 파일 크기 최적화 (약 10-15 KB)

## 변경 이력

자세한 변경 이력은 [CHANGELOG.md](CHANGELOG.md)를 참고하세요.

## 문의

- GitHub Issues: https://github.com/yoohyunseog/NBVerseV01/issues
- 저장소: https://github.com/yoohyunseog/NBVerseV01
