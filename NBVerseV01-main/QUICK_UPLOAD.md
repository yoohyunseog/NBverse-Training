# 빠른 GitHub 업로드 가이드

## 방법 1: Git Bash 사용 (권장)

1. Git Bash 열기
2. 다음 명령어 실행:

```bash
cd /e/Gif/www/hankookin.center/8BIT/bot/NBverse

# Git 초기화
git init

# 원격 저장소 추가
git remote add origin https://github.com/yoohyunseog/NBVerseV0.0.0.1.git

# 모든 파일 추가
git add .

# 커밋
git commit -m "Initial commit: NBverse library v0.2.0 with similarity search and history"

# 브랜치 설정
git branch -M main

# 푸시 (인증 필요)
git push -u origin main
```

## 방법 2: GitHub Desktop 사용

1. GitHub Desktop 설치: https://desktop.github.com/
2. File > Add Local Repository
3. `E:\Gif\www\hankookin.center\8BIT\bot\NBverse` 선택
4. Publish repository 클릭
5. Repository name: `NBVerseV0.0.0.1`
6. Owner: `yoohyunseog` 선택
7. Publish 클릭

## 방법 3: 수동 업로드 (웹 인터페이스)

1. https://github.com/yoohyunseog/NBVerseV0.0.0.1 로 이동
2. "uploading an existing file" 클릭
3. 파일들을 드래그 앤 드롭
4. Commit changes 클릭

## 방법 4: PowerShell에서 실행

PowerShell을 관리자 권한으로 열고:

```powershell
cd E:\Gif\www\hankookin.center\8BIT\bot\NBverse

# Git 설치 확인
git --version

# Git이 없으면 Chocolatey로 설치
# Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))
# choco install git -y

git init
git remote add origin https://github.com/yoohyunseog/NBVerseV0.0.0.1.git
git add .
git commit -m "Initial commit: NBverse library v0.2.0"
git branch -M main
git push -u origin main
```

## 인증 문제 해결

### Personal Access Token 사용

1. GitHub > Settings > Developer settings > Personal access tokens > Tokens (classic)
2. Generate new token (classic)
3. `repo` 권한 체크
4. 토큰 생성 후 복사
5. 푸시 시:
   - Username: `yoohyunseog`
   - Password: `[생성한 토큰]`

### SSH 키 사용

```bash
# SSH 키 생성
ssh-keygen -t ed25519 -C "your_email@example.com"

# 공개 키 복사
cat ~/.ssh/id_ed25519.pub

# GitHub > Settings > SSH and GPG keys > New SSH key에 추가

# 원격 URL 변경
git remote set-url origin git@github.com:yoohyunseog/NBVerseV0.0.0.1.git
git push -u origin main
```

