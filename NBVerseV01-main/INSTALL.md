# NBverse 설치 가이드

## 설치 방법

### 방법 1: 로컬에서 설치 (개발용)

```bash
# 저장소 클론 또는 다운로드
cd NBverse

# 설치
pip install -e .

# 또는
python setup.py install
```

### 방법 2: GitHub에서 직접 설치

```bash
pip install git+https://github.com/yoohyunseog/NBVerseV0.0.0.1.git
```

### 방법 3: 소스 코드에서 설치

```bash
# 저장소 클론
git clone https://github.com/yoohyunseog/NBVerseV0.0.0.1.git
cd NBVerseV0.0.0.1

# 설치
pip install .
```

## 사용 방법

### 기본 사용

```python
# 간단한 임포트
from NBverse import TextToNBConverter

# 변환기 생성
converter = TextToNBConverter()

# 텍스트 변환
result = converter.text_to_nb("안녕하세요")
print(result['bitMax'], result['bitMin'])
```

### 편의 함수 사용

```python
from NBverse import convert_text, save_text

# 텍스트 변환
result = convert_text("Hello World")
print(result['bitMax'])

# 텍스트 저장
save_result = save_text("안녕하세요")
print(save_result['max_path'])
```

### 전체 기능 사용

```python
from NBverse import (
    TextToNBConverter,
    NBverseStorage,
    QueryHistory,
    calculate_hybrid_similarity
)

# 변환
converter = TextToNBConverter()
result = converter.text_to_nb("안녕하세요")

# 저장
storage = NBverseStorage()
storage.save_text("안녕하세요")

# 히스토리
history = QueryHistory()
history.add_query("안녕하세요", query_type="exact", found=True)
```

## 개발 모드 설치

개발 중인 경우 편집 가능한 모드로 설치:

```bash
pip install -e .
```

이렇게 하면 소스 코드를 수정하면 바로 반영됩니다.

## 의존성

현재 외부 의존성이 없습니다. Python 3.8 이상이 필요합니다.

## 업그레이드

```bash
pip install --upgrade git+https://github.com/yoohyunseog/NBVerseV01.git
```

## 제거

```bash
pip uninstall nbverse
```

