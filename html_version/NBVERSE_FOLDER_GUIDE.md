# NBVerse 데이터베이스 폴더 생성 가이드

## 폴더 구조

NBVerse 데이터베이스는 다음 경로에 자동으로 생성됩니다:

```
v0.0.0.4/
└── data/
    └── nbverse/
        ├── max/          # bitMax 값 저장 (경로 기반)
        │   └── [숫자 경로]/
        ├── min/          # bitMin 값 저장 (경로 기반)
        │   └── [숫자 경로]/
        └── nbverse_data.json  # 컴팩트 저장소 (최대 25개)
```

## 자동 생성 과정

### 1. API 서버 시작 시

`start_server.bat` 또는 `start_server_with_http_server.bat`를 실행하면:

1. **API 서버 초기화** (`api/app.py`의 `init_app()` 함수)
   ```python
   # 현재 파일 위치: html_version/api/app.py
   # 목표 위치: v0.0.0.4/data/nbverse
   current_file_dir = os.path.dirname(os.path.abspath(__file__))  # html_version/api
   parent_dir = os.path.dirname(os.path.dirname(current_file_dir))  # v0.0.0.4
   data_dir = os.path.join(parent_dir, "data", "nbverse")
   
   os.makedirs(data_dir, exist_ok=True)  # data/nbverse 생성
   os.makedirs(os.path.join(data_dir, "max"), exist_ok=True)  # max 폴더 생성
   os.makedirs(os.path.join(data_dir, "min"), exist_ok=True)  # min 폴더 생성
   ```

2. **NBVerse 초기화** (`nbverse_helper.py`의 `init_nbverse_storage()` 함수)
   ```python
   os.makedirs(data_dir, exist_ok=True)  # 이미 생성되어 있어도 안전
   storage = NBverseStorage(data_dir=data_dir, decimal_places=decimal_places)
   ```

### 2. 폴더 생성 위치

- **기본 경로**: `E:\Gif\www\hankookin.center\8BIT\bot\bot-v0.12.0\simulation\v0.0.0.4\data\nbverse\`
- **상대 경로**: API 서버 기준으로 `../../data/nbverse/`

### 3. 생성되는 폴더들

1. **`data/nbverse/`** (메인 디렉토리)
   - NBVerse 데이터베이스의 루트 디렉토리

2. **`data/nbverse/max/`** (bitMax 저장소)
   - bitMax 값을 경로로 변환하여 저장
   - 예: `bitMax = 1.335196` → `max/1/3/3/5/1/9/6/` 경로에 저장

3. **`data/nbverse/min/`** (bitMin 저장소)
   - bitMin 값을 경로로 변환하여 저장
   - 예: `bitMin = 4.798095` → `min/4/7/9/8/0/9/5/` 경로에 저장

4. **`data/nbverse/nbverse_data.json`** (컴팩트 저장소)
   - 최대 25개의 최근 데이터를 FIFO 방식으로 저장
   - 빠른 조회를 위한 캐시 역할

## 수동 생성 방법

폴더가 자동으로 생성되지 않는 경우, 수동으로 생성할 수 있습니다:

### Windows
```batch
cd E:\Gif\www\hankookin.center\8BIT\bot\bot-v0.12.0\simulation\v0.0.0.4
mkdir data\nbverse
mkdir data\nbverse\max
mkdir data\nbverse\min
```

### Python
```python
import os

data_dir = r"E:\Gif\www\hankookin.center\8BIT\bot\bot-v0.12.0\simulation\v0.0.0.4\data\nbverse"
os.makedirs(os.path.join(data_dir, "max"), exist_ok=True)
os.makedirs(os.path.join(data_dir, "min"), exist_ok=True)
```

## 확인 방법

### 1. 폴더 존재 확인
```batch
dir E:\Gif\www\hankookin.center\8BIT\bot\bot-v0.12.0\simulation\v0.0.0.4\data\nbverse
```

### 2. API 서버 로그 확인
서버 시작 시 다음 메시지가 표시됩니다:
```
📁 NBVerse 데이터 디렉토리: E:\Gif\www\...\v0.0.0.4\data\nbverse
✅ NBVerse 데이터 디렉토리 생성 완료: ...
✅ NBVerse 초기화 완료 (소수점 자리수: 10, 데이터 디렉토리: ...)
```

### 3. 브라우저에서 확인
```
http://localhost:5000/api/health
```

응답에서 `nbverse_initialized: true` 확인

## 문제 해결

### 폴더가 생성되지 않는 경우

1. **권한 문제**
   - 관리자 권한으로 실행
   - 폴더 생성 권한 확인

2. **경로 문제**
   - API 서버가 올바른 위치에서 실행되는지 확인
   - `api/app.py`의 경로 계산 로직 확인

3. **디스크 공간**
   - 디스크 공간 확인

### 폴더는 생성되지만 데이터가 저장되지 않는 경우

1. **NBVerse 라이브러리 확인**
   - NBVerse가 올바르게 설치되었는지 확인
   - `nbverse_helper.py`에서 `NBVERSE_AVAILABLE` 확인

2. **초기화 오류 확인**
   - API 서버 로그에서 오류 메시지 확인
   - `init_nbverse_storage()` 함수의 예외 처리 확인

## 폴더 구조 예시

정상적으로 작동하면 다음과 같은 구조가 생성됩니다:

```
data/nbverse/
├── max/
│   ├── 1/
│   │   └── 3/
│   │       └── 3/
│   │           └── 5/
│   │               └── 1/
│   │                   └── 9/
│   │                       └── 6/
│   │                           └── 1335196_20241225_103700_123456.json
│   └── ...
├── min/
│   ├── 4/
│   │   └── 7/
│   │       └── 9/
│   │           └── 8/
│   │               └── 0/
│   │                   └── 9/
│   │                       └── 5/
│   │                           └── 4798095_20241225_103700_123456.json
│   └── ...
└── nbverse_data.json
```

## 주의사항

1. **절대 경로 사용**: API 서버는 절대 경로를 사용하여 폴더를 생성하므로, 어디서 실행하든 올바른 위치에 생성됩니다.

2. **기존 데이터 보존**: `exist_ok=True` 옵션으로 기존 데이터를 덮어쓰지 않습니다.

3. **하위 폴더 자동 생성**: `max/`와 `min/` 폴더도 자동으로 생성됩니다.

4. **경로 기반 저장**: N/B 값은 경로로 변환되어 저장되므로, 폴더 구조가 중요합니다.

