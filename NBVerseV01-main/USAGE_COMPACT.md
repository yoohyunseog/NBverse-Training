# NBverse Compact Storage 사용 가이드

## 컴팩트 저장소란?

단일 JSON 파일에 최대 25개 데이터를 유지하는 저장 방식입니다.
- **FIFO 방식**: 새 데이터가 들어오면 가장 오래된 데이터 자동 제거
- **타임스탬프 자동 생성**: 모든 데이터에 저장 시간 자동 기록
- **히스토리 자동 기록**: 모든 작업이 히스토리에 자동 저장
- **용량 최적화**: 약 10-15 KB (25개 기준)

## 기본 사용법

### 간단한 사용

```python
from NBverse import add_text_compact

# 1개씩 추가 (타임스탬프 자동 생성)
result = add_text_compact("테스트 1")
print(f"ID: {result['id']}")
print(f"타임스탬프: {result['timestamp']}")
print(f"총 항목: {result['total_items']}/25")
```

### 클래스 사용

```python
from NBverse import NBverseCompactStorage

storage = NBverseCompactStorage(max_items=25)

# 텍스트 추가
result = storage.add_text("테스트 1")
print(f"추가됨: {result['text']}")

# 저장된 항목 조회
items = storage.get_items(limit=10)
for item in items:
    print(f"{item['timestamp']}: {item['text']}")

# 히스토리 조회
history = storage.get_history(limit=10)
for entry in history:
    print(f"{entry['timestamp']}: {entry['action']} - {entry['text']}")
```

## 동작 방식

### 1개씩 추가

```
1. "테스트 1" 입력
   ↓
2. N/B 값 계산 (자동)
   ↓
3. 타임스탬프 생성 (자동)
   ↓
4. items 배열에 추가 (맨 뒤)
   ↓
5. 25개 초과 확인
   ├─ 25개 이하: 그대로 유지
   └─ 26개 이상: 가장 오래된 1개 제거 (맨 앞)
   ↓
6. 히스토리에 기록 추가 (자동)
   ↓
7. JSON 파일 저장 (자동)
```

### 예시

#### 초기 상태 (24개)
```json
{
  "items": [item1, item2, ..., item24]  // 24개
}
```

#### "테스트 1" 추가
```json
{
  "items": [item1, item2, ..., item24, item25]  // 25개
}
```

#### "테스트 2" 추가 (26개가 됨)
```json
{
  "items": [item2, item3, ..., item24, item25, item26]  // 25개
  // item1 제거됨 (가장 오래된 것)
}
```

## 데이터 구조

### 저장 파일 구조

```json
{
  "version": "0.2.1",
  "max_items": 25,
  "items": [
    {
      "id": "1734772245123456",
      "timestamp": "2024-12-21T19:30:45.123456",
      "text": "테스트 1",
      "nb": {
        "max": 3.1415926535,
        "min": 2.7182818284,
        "unicodeArray": [54620, 44592, ...]
      },
      "version": "bitCalculation.v.0.2",
      "decimal_places": 10
    }
    // ... 최대 25개
  ],
  "history": [
    {
      "timestamp": "2024-12-21T19:30:45.123456",
      "action": "add",
      "text": "테스트 1",
      "item_id": "1734772245123456"
    }
    // ... 최대 100개
  ],
  "created_at": "2024-12-21T10:00:00.000000",
  "last_updated": "2024-12-21T19:30:45.123456"
}
```

## 주요 메서드

### `add_text(text, metadata=None)`
- 텍스트를 1개씩 추가
- 타임스탬프 자동 생성
- 25개 초과 시 가장 오래된 것 제거
- 히스토리 자동 기록

### `get_items(limit=None)`
- 저장된 항목 조회 (최신순)
- `limit`: 최대 반환 개수

### `get_history(limit=50)`
- 히스토리 조회 (최신순)
- `limit`: 최대 반환 개수

### `find_by_text(text)`
- 텍스트로 항목 검색

### `get_statistics()`
- 통계 정보 조회

## 파일 위치

기본 저장 위치:
- `novel_ai/v1.0.7/data/nbverse_data.json`

## 용량 정보

- 단일 항목: 약 300 bytes
- 25개 항목: 약 7.5 KB
- JSON 구조: 약 1 KB
- 히스토리: 약 2 KB
- **총 예상: 약 10-15 KB**

## 예제 실행

```bash
run_compact_example.bat
```

또는

```bash
python compact_example.py
```

