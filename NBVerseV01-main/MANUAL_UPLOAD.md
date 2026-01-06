# GitHub 업로드 수동 가이드

Git이 설치되어 있지 않거나 자동 업로드가 실패한 경우, 다음 명령어를 수동으로 실행하세요.

## 사전 준비

1. Git 설치 확인
   ```bash
   git --version
   ```

2. GitHub 인증 설정 (Personal Access Token 필요)
   - GitHub Settings > Developer settings > Personal access tokens
   - `repo` 권한이 있는 토큰 생성

## 업로드 단계

### 1. Git 저장소 초기화

```bash
cd E:\Gif\www\hankookin.center\8BIT\bot\NBverse
git init
```

### 2. 원격 저장소 추가

```bash
git remote add origin https://github.com/yoohyunseog/NBVerseV0.0.0.1.git
```

### 3. 파일 추가

```bash
git add .
```

### 4. 커밋

```bash
git commit -m "Initial commit: NBverse library v0.2.0"
```

### 5. 브랜치 설정

```bash
git branch -M main
```

### 6. 푸시

```bash
git push -u origin main
```

## 인증 문제 해결

### Personal Access Token 사용

```bash
# 사용자 이름과 토큰 입력
git push -u origin main
# Username: yoohyunseog
# Password: [Personal Access Token]
```

### SSH 키 사용 (선택사항)

```bash
# SSH URL로 변경
git remote set-url origin git@github.com:yoohyunseog/NBVerseV0.0.0.1.git
git push -u origin main
```

## 자동 업로드 스크립트

`upload_to_github.bat` 파일을 실행하면 위 과정이 자동으로 수행됩니다.

```bash
upload_to_github.bat
```

