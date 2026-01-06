# env.local 파일 가이드

## 파일 위치

`env.local` 파일은 다음 위치 중 하나에 있어야 합니다 (우선순위 순):

1. **`v0.0.0.4/env.local`** (최우선)
2. **`html_version/env.local`**
3. **`html_version/api/env.local`**

## 파일 형식

```env
UPBIT_ACCESS_KEY=your_access_key_here
UPBIT_SECRET_KEY=your_secret_key_here
```

## 현재 설정 확인

현재 `html_version/env.local` 파일에 다음이 설정되어 있습니다:
- ✅ UPBIT_ACCESS_KEY: 설정됨
- ✅ UPBIT_SECRET_KEY: 설정됨

## API 서버에서의 로드 과정

1. **서버 시작 시** (`api/app.py`의 `load_env_local()` 함수)
   - 여러 위치에서 `env.local` 파일 검색
   - 찾은 파일을 `dotenv`로 로드
   - 환경 변수로 설정

2. **Upbit API 초기화 시** (`load_config()` 함수)
   - 환경 변수에서 `UPBIT_ACCESS_KEY`, `UPBIT_SECRET_KEY` 읽기
   - `pyupbit.Upbit()` 객체 생성

## 문제 해결

### env.local 파일을 찾을 수 없는 경우

**증상:**
```
⚠️ env.local 파일을 찾을 수 없습니다.
⚠️ Upbit API 키가 설정되지 않았습니다.
```

**해결 방법:**
1. `v0.0.0.4/env.local` 파일 생성 (권장)
2. 또는 `html_version/env.local` 파일 확인

### API 키가 로드되지 않는 경우

**확인 사항:**
1. 파일 이름이 정확한지 확인 (`env.local`, 대소문자 구분)
2. 파일 형식이 올바른지 확인 (`KEY=value` 형식)
3. 공백이나 특수문자가 없는지 확인
4. 서버 재시작

### 보안 주의사항

- ⚠️ **절대 공개 저장소에 커밋하지 마세요**
- ⚠️ `.gitignore`에 `env.local`이 포함되어 있는지 확인
- ⚠️ API 키는 외부에 노출되지 않도록 주의

## 서버 로그 확인

서버 시작 시 다음 메시지가 표시됩니다:

```
📄 env.local 파일 로드: E:\...\v0.0.0.4\env.local
환경 변수 로드 확인:
  - UPBIT_ACCESS_KEY: 설정됨 (IiiBJJxRL...)
  - UPBIT_SECRET_KEY: 설정됨
✅ Upbit API 연결 성공
```

## 수동 테스트

Python에서 직접 확인:

```python
from dotenv import load_dotenv
import os

load_dotenv("env.local")
print("UPBIT_ACCESS_KEY:", os.getenv("UPBIT_ACCESS_KEY"))
print("UPBIT_SECRET_KEY:", "설정됨" if os.getenv("UPBIT_SECRET_KEY") else "없음")
```

