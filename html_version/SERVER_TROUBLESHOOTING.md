# 서버 문제 해결 가이드

## 현재 상황 분석

### 문제 증상
- ✅ 포트 5000 사용 중 (SYN_SENT 상태)
- ❌ API 서버 헬스 체크 실패
- ❌ HTTP 서버 미실행

### 원인 분석
`SYN_SENT` 상태는 클라이언트가 서버에 연결을 시도했지만 서버가 응답하지 않는다는 의미입니다. 이는:
1. 서버가 시작 중이거나
2. 서버가 오류로 인해 응답하지 않거나
3. 서버가 다른 포트에서 실행 중일 수 있습니다.

## 해결 방법

### 1. 서버 재시작 (권장)

```batch
restart_server.bat
```

이 스크립트는:
- 기존 서버를 완전히 종료
- 포트를 정리
- 서버를 재시작
- 서버 상태를 확인

### 2. 수동 서버 종료 및 재시작

```batch
# 1단계: 서버 종료
stop_server.bat

# 2단계: 포트 강제 정리 (필요시)
netstat -ano | findstr ":5000"
# PID를 확인한 후:
taskkill /PID [PID번호] /F

# 3단계: 서버 시작
start_server_with_http_server.bat
```

### 3. 서버 로그 확인

서버가 시작되면 "Trading Bot API Server" 창이 열립니다. 이 창에서:
- ✅ 초기화 성공 메시지 확인
- ❌ 오류 메시지 확인

**정상 시작 시 표시되는 메시지:**
```
📁 NBVerse 데이터 디렉토리: E:\...\data\nbverse
✅ NBVerse 데이터 디렉토리 생성 완료
✅ NBVerse 초기화 완료
📄 env.local 파일 로드: E:\...\env.local
✅ Upbit API 연결 성공
✅ 백엔드 API 서버 초기화 완료
 * Running on http://0.0.0.0:5000
```

**오류가 있는 경우:**
- 오류 메시지를 확인하고 해결
- 일반적인 오류:
  - `ModuleNotFoundError`: 필요한 패키지 설치 필요
  - `Port already in use`: 포트가 사용 중 (stop_server.bat 실행)
  - `NBVerse 초기화 실패`: NBVerse 라이브러리 확인

### 4. 포트 확인 및 정리

```batch
# 포트 5000 사용 중인 프로세스 확인
netstat -ano | findstr ":5000"

# LISTENING 상태인 프로세스 찾기
netstat -ano | findstr ":5000" | findstr "LISTENING"

# PID 확인 후 종료
taskkill /PID [PID번호] /F
```

### 5. 방화벽 확인

Windows 방화벽이 포트 5000을 차단할 수 있습니다:
1. Windows 보안 → 방화벽 및 네트워크 보호
2. 고급 설정
3. 인바운드 규칙 → 새 규칙
4. 포트 → TCP → 5000 → 허용

## 단계별 진단

### Step 1: 서버 프로세스 확인
```batch
tasklist | findstr python
```

### Step 2: 포트 상태 확인
```batch
netstat -ano | findstr ":5000"
```

### Step 3: 서버 재시작
```batch
restart_server.bat
```

### Step 4: 헬스 체크
브라우저에서:
```
http://localhost:5000/api/health
```

또는:
```batch
check_server_status.bat
```

## 예상되는 오류 및 해결

### 오류 1: "포트가 이미 사용 중입니다"
**해결:**
```batch
stop_server.bat
# 또는
restart_server.bat
```

### 오류 2: "ModuleNotFoundError: No module named 'flask'"
**해결:**
```batch
cd api
pip install -r requirements.txt
```

### 오류 3: "NBVerse 초기화 실패"
**해결:**
- NBVerse 라이브러리가 설치되어 있는지 확인
- `nbverse_helper.py`에서 NBVerse 경로 확인

### 오류 4: "env.local 파일을 찾을 수 없습니다"
**해결:**
- `v0.0.0.4/env.local` 또는 `html_version/env.local` 파일 확인
- 파일 형식 확인: `UPBIT_ACCESS_KEY=...`

## 빠른 해결 체크리스트

- [ ] `restart_server.bat` 실행
- [ ] 서버 로그 창에서 오류 메시지 확인
- [ ] `check_server_status.bat`로 상태 확인
- [ ] 브라우저에서 `http://localhost:5000/api/health` 접속
- [ ] 작업 관리자에서 "Trading Bot API Server" 프로세스 확인

## 추가 도움말

문제가 계속되면:
1. 서버 로그의 전체 오류 메시지를 확인
2. `check_server_status.bat`의 출력을 확인
3. 작업 관리자에서 Python 프로세스 상태 확인

