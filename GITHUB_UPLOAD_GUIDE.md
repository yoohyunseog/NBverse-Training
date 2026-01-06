# GitHub 업로드 가이드

## 방법 1: 배치 파일 사용 (가장 간단)

1. `upload_to_github.bat` 파일을 더블클릭하여 실행
2. Git이 설치되어 있지 않으면 자동으로 오류 메시지가 표시됩니다
3. 인증이 필요하면 GitHub 사용자명과 비밀번호(또는 토큰)를 입력하세요

## 방법 2: 수동 업로드

### 1. Git 설치 확인
```bash
git --version
```
Git이 설치되어 있지 않으면 [Git 다운로드](https://git-scm.com/download/win)

### 2. Git 저장소 초기화
```bash
cd bot/bot-v0.12.0/simulation/v0.0.0.4
git init
```

### 3. 원격 저장소 추가
```bash
git remote add origin https://github.com/yoohyunseog/RL-Trading-Bot.git
```

### 4. 파일 추가 및 커밋
```bash
git add .
git commit -m "Initial commit: RL-Trading-Bot v0.0.0.4"
```

### 5. 브랜치 이름 설정 (필요한 경우)
```bash
git branch -M main
```

### 6. GitHub에 푸시
```bash
git push -u origin main
```

## 인증 문제 해결

### Personal Access Token 사용 (권장)

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. "Generate new token" 클릭
3. 권한 선택: `repo` 체크
4. 토큰 생성 후 복사
5. 푸시 시 비밀번호 대신 토큰 사용

### SSH 키 사용

```bash
# SSH 키 생성
ssh-keygen -t ed25519 -C "your_email@example.com"

# 공개 키를 GitHub에 추가
# GitHub → Settings → SSH and GPG keys → New SSH key
```

## 주의사항

- `env.local` 파일은 `.gitignore`에 포함되어 있어 업로드되지 않습니다
- API 키 등 민감한 정보는 절대 커밋하지 마세요
- 대용량 파일(모델 파일 등)은 Git LFS를 사용하거나 제외하세요

## 문제 해결

### "remote origin already exists" 오류
```bash
git remote remove origin
git remote add origin https://github.com/yoohyunseog/RL-Trading-Bot.git
```

### "failed to push some refs" 오류
```bash
git pull origin main --allow-unrelated-histories
git push -u origin main
```

### 브랜치 이름 오류
```bash
git branch -M main  # 또는 master
git push -u origin main
```

