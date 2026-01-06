# 문제 해결 가이드

## "Failed to fetch" 오류

### 증상
- 카드 생산 시 "Failed to fetch" 오류 발생
- "차트 데이터 로드 완료" 후 오류 발생

### 원인
1. API 서버가 실행되지 않음
2. API 서버 포트(5000)가 다른 프로그램에 의해 사용 중
3. CORS 문제
4. 네트워크 연결 문제

### 해결 방법

#### 1. API 서버 실행 확인
```bash
# 서버 시작
start_server_with_http_server.bat
```

또는

```bash
start_server.bat
```

#### 2. API 서버 상태 확인
브라우저에서 다음 URL을 열어 확인:
```
http://localhost:5000/api/health
```

정상적으로 실행 중이면 다음 응답이 표시됩니다:
```json
{
  "status": "ok",
  "nbverse_initialized": true,
  "timestamp": "..."
}
```

#### 3. 포트 충돌 확인
다른 프로그램이 5000번 포트를 사용 중일 수 있습니다.

**해결 방법**:
1. 작업 관리자에서 Python 프로세스 확인
2. `stop_server.bat` 실행하여 기존 서버 종료
3. 다른 포트 사용 (app.py 수정 필요)

#### 4. CORS 문제 해결
HTTP 서버를 사용하여 HTML 파일을 서빙하세요:
```bash
start_server_with_http_server.bat
```

이 파일은 HTTP 서버(포트 8000)도 함께 시작합니다.

#### 5. 브라우저 콘솔 확인
F12를 눌러 브라우저 개발자 도구를 열고 Console 탭에서 자세한 오류 메시지를 확인하세요.

## 기타 오류

### "N/B 값 계산에 실패했습니다"
- NBVerse 데이터베이스가 초기화되지 않았을 수 있습니다
- API 서버 로그를 확인하세요

### "차트 데이터를 가져올 수 없습니다"
- Upbit API 연결 문제일 수 있습니다
- 인터넷 연결을 확인하세요

### "카드 생산에 실패했습니다"
- API 서버 로그를 확인하세요
- NBVerse 데이터베이스 경로를 확인하세요

## 로그 확인

### API 서버 로그
API 서버가 실행 중인 창에서 오류 메시지를 확인하세요.

### 브라우저 콘솔
F12 → Console 탭에서 JavaScript 오류를 확인하세요.

## 빠른 진단

1. **API 서버 실행 확인**
   ```
   http://localhost:5000/api/health
   ```

2. **브라우저 콘솔 확인**
   - F12 → Console 탭
   - 네트워크 탭에서 API 요청 상태 확인

3. **서버 재시작**
   ```bash
   stop_server.bat
   start_server_with_http_server.bat
   ```

## 자주 묻는 질문

### Q: 서버를 시작했는데도 연결이 안 됩니다
A: 방화벽이나 보안 프로그램이 포트를 차단할 수 있습니다. 방화벽 설정을 확인하세요.

### Q: HTTP 서버와 API 서버의 차이는?
A: 
- **API 서버**: 백엔드 로직 및 데이터베이스 연동 (포트 5000)
- **HTTP 서버**: 프론트엔드 HTML 파일 서빙 (포트 8000)

### Q: 로컬 파일로 직접 열면 안 되나요?
A: CORS 정책 때문에 API 요청이 차단될 수 있습니다. HTTP 서버를 사용하는 것을 권장합니다.

