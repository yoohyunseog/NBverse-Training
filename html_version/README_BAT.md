# 배치 파일 사용 가이드

## 파일 설명

### 1. `start_server.bat`
- **기능**: API 서버만 시작하고 브라우저에서 HTML 파일을 직접 엽니다
- **사용 시나리오**: 로컬 파일로 HTML을 열어도 되는 경우 (CORS 이슈 없음)
- **실행 내용**:
  1. 가상환경 활성화 (`E:\python_env\Scripts\activate.bat`)
  2. API 서버 시작 (포트 5000)
  3. 브라우저에서 `index.html` 파일 열기
  4. API 헬스 체크 페이지 열기

### 2. `start_server_with_http_server.bat` (권장)
- **기능**: API 서버와 HTTP 서버를 모두 시작합니다
- **사용 시나리오**: HTTP 서버를 통해 HTML을 서빙하는 경우 (CORS 이슈 해결)
- **실행 내용**:
  1. 가상환경 활성화 (`E:\python_env\Scripts\activate.bat`)
  2. API 서버 시작 (포트 5000)
  3. HTTP 서버 시작 (포트 8000)
  4. 브라우저에서 `http://localhost:8000/index.html` 열기
  5. API 헬스 체크 페이지 열기

### 3. `stop_server.bat`
- **기능**: 실행 중인 모든 서버 프로세스를 종료합니다
- **실행 내용**:
  - API 서버 프로세스 종료
  - HTTP 서버 프로세스 종료

## 사용 방법

### 서버 시작

1. **권장 방법** (HTTP 서버 포함):
   ```
   start_server_with_http_server.bat
   ```

2. **간단한 방법** (로컬 파일):
   ```
   start_server.bat
   ```

### 서버 종료

```
stop_server.bat
```

또는 작업 관리자에서 다음 프로세스를 수동으로 종료:
- "Trading Bot API Server"
- "Trading Bot HTTP Server"

## 포트 정보

- **API 서버**: `http://localhost:5000`
- **HTTP 서버**: `http://localhost:8000` (start_server_with_http_server.bat 사용 시)

## 문제 해결

### 포트가 이미 사용 중인 경우

다른 프로그램이 5000번 또는 8000번 포트를 사용 중일 수 있습니다.

**해결 방법**:
1. `stop_server.bat` 실행하여 기존 서버 종료
2. 또는 작업 관리자에서 Python 프로세스 확인 및 종료

### 가상환경 활성화 실패

`E:\python_env\Scripts\activate.bat` 파일이 존재하는지 확인하세요.

**해결 방법**:
1. 가상환경 경로 확인
2. 배치 파일의 경로 수정

### 패키지 설치 실패

필요한 Python 패키지가 설치되지 않았을 수 있습니다.

**해결 방법**:
```bash
cd api
pip install -r requirements.txt
```

### 브라우저가 열리지 않는 경우

수동으로 다음 URL을 열어보세요:
- `http://localhost:8000/index.html` (HTTP 서버 사용 시)
- 또는 `html_version/index.html` 파일을 직접 열기

## 자동 실행 설정

Windows 작업 스케줄러를 사용하여 부팅 시 자동 실행할 수 있습니다:

1. 작업 스케줄러 열기
2. 기본 작업 만들기
3. 트리거: 컴퓨터 시작 시
4. 작업: 프로그램 시작
5. 프로그램: `start_server_with_http_server.bat`의 전체 경로

## 주의사항

- 서버를 종료하지 않고 컴퓨터를 종료하면 다음 부팅 시 포트 충돌이 발생할 수 있습니다
- `stop_server.bat`를 실행하여 서버를 정상적으로 종료하세요
- 여러 개의 서버를 동시에 실행하지 마세요

