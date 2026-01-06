# NBverse - N/B 값 변환 라이브러리

문자열을 N/B 값으로 변환하는 Python 라이브러리입니다. JavaScript `bitCalculation.v.0.2.js`의 로직을 Python으로 구현했습니다.

## 주요 기능

- ✅ 텍스트를 N/B 값(bitMax, bitMin)으로 변환
- ✅ max/min 폴더 구조로 데이터 저장 (NBverse 서버 호환)
- ✅ CLI 도구로 입력 및 조회
- ✅ 설정 관리 (소수점 자리수, 데이터 디렉토리 등)
- ✅ 저장된 날짜와 형식 정보 출력

## 빠른 시작

### 1. 설치

```bash
# 저장소 클론
git clone https://github.com/yoohyunseog/NBVerseV0.0.0.1.git
cd NBVerseV0.0.0.1
```

### 2. 기본 사용

```python
from NBverse import TextToNBConverter

converter = TextToNBConverter()
result = converter.text_to_nb("안녕하세요")

print(f"bitMax: {result['bitMax']}")
print(f"bitMin: {result['bitMin']}")
```

### 3. CLI 도구 실행

```bash
# Windows
run_cli.bat

# 또는 입력/조회만
input_view.bat
```

## 파일 구조

```
NBverse/
├── __init__.py          # 메인 인터페이스
├── calculator.py         # N/B 값 계산 로직
├── converter.py         # 텍스트 변환
├── storage.py           # 데이터 저장 (max/min 폴더)
├── config.py            # 설정 관리
├── utils.py             # 유틸리티 함수
├── cli.py               # CLI 도구
├── input_view.py        # 입력/조회 도구
├── example.py           # 사용 예제
├── test_basic.py        # 테스트
└── *.bat                # 실행 배치 파일
```

## 사용 예제

### 텍스트 변환

```python
from NBverse import TextToNBConverter

converter = TextToNBConverter(bit=5.5, decimal_places=10)
result = converter.text_to_nb("Hello World")

print(f"bitMax: {result['bitMax']:.10f}")
print(f"bitMin: {result['bitMin']:.10f}")
```

### 데이터 저장

```python
from NBverse import NBverseStorage

storage = NBverseStorage(data_dir="novel_ai/v1.0.7/data")
result = storage.save_text("안녕하세요")

print(f"저장 경로: {result['max_path']}")
```

### 설정 관리

```python
from NBverse import NBverseConfig

config = NBverseConfig()
config.set_decimal_places(10)  # 소수점 10자리
config.set_data_dir("novel_ai/v1.0.7/data")
```

## 원본 코드

- JavaScript: https://xn--9l4b4xi9r.com/_8%EB%B9%84%ED%8A%B8/js/bitCalculation.v.0.2.js
- NBverse 서버: https://github.com/yoohyunseog/NBverse

## 라이선스

원본 JavaScript 코드의 라이선스를 따릅니다.

## 버전

v0.2.0

