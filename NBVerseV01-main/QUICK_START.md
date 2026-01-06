# NBverse 빠른 시작 가이드

## 설치

```bash
pip install git+https://github.com/yoohyunseog/NBVerseV01.git
```

## 사용 예제

### 예제 1: 간단한 변환

```python
from NBverse import convert_text

result = convert_text("안녕하세요")
print(f"bitMax: {result['bitMax']:.10f}")
print(f"bitMin: {result['bitMin']:.10f}")
```

### 예제 2: 저장

```python
from NBverse import save_text

result = save_text("Hello World")
print(f"저장 완료: {result['max_path']}")
```

### 예제 3: 전체 기능

```python
from NBverse import (
    TextToNBConverter,
    NBverseStorage,
    QueryHistory,
    calculate_hybrid_similarity
)

# 변환
converter = TextToNBConverter(decimal_places=10)
result = converter.text_to_nb("안녕하세요")

# 저장
storage = NBverseStorage()
storage.save_text("안녕하세요")

# 히스토리
history = QueryHistory()
history.add_query("안녕하세요", query_type="exact", found=True)
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
range_results = storage.find_similar_by_nb_range(bit_max, bit_min)

# 유사도 계산
similar = find_similar_items(
    input_text="안녕하세요",
    input_max=bit_max,
    input_min=bit_min,
    stored_items=range_results,
    threshold=0.7
)

for item in similar:
    print(f"유사도: {item['similarity']:.2%} - {item['text']}")
```

## 주요 함수 및 클래스

### 편의 함수

- `convert_text(text, bit=5.5, decimal_places=10)` - 텍스트를 N/B 값으로 변환
- `save_text(text, data_dir="novel_ai/v1.0.7/data", metadata=None)` - 텍스트 저장

### 주요 클래스

- `TextToNBConverter` - 텍스트 변환기
- `NBverseStorage` - 데이터 저장소
- `QueryHistory` - 조회 히스토리 관리
- `NBverseConfig` - 설정 관리

### 유사도 함수

- `calculate_nb_similarity()` - N/B 값 기반 유사도
- `calculate_text_similarity()` - 텍스트 기반 유사도
- `calculate_hybrid_similarity()` - 하이브리드 유사도
- `find_similar_items()` - 유사 항목 검색

## 더 많은 예제

자세한 예제는 `example.py` 파일을 참고하세요.

```bash
python -m NBverse.example
```

