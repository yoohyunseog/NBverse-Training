# Git 설치 가이드 (E 드라이브)

## 자동 설치 (권장)

### 방법 1: 포터블 버전 설치 스크립트

```bash
install_git_portable.bat
```

이 스크립트는:
- E:\GitPortable에 Git 포터블 버전을 다운로드
- 자동으로 압축 해제
- PATH 추가 옵션 제공

### 방법 2: 설치 후 업로드

```bash
# 1. Git 설치
install_git_portable.bat

# 2. 업로드
upload_with_local_git.bat
```

## 수동 설치

### 방법 1: Git 공식 설치 프로그램

1. https://git-scm.com/download/win 접속
2. 다운로드 후 설치
3. 설치 경로를 `E:\Git` 또는 원하는 경로로 변경
4. "Add Git to PATH" 옵션 체크

### 방법 2: 포터블 버전

1. https://git-scm.com/download/win 접속
2. "Portable" 버전 다운로드
3. `E:\GitPortable`에 압축 해제
4. `E:\GitPortable\bin\git.exe` 경로 사용

### 방법 3: Chocolatey 사용 (관리자 권한 필요)

```powershell
# Chocolatey 설치 (한 번만)
Set-ExecutionPolicy Bypass -Scope Process -Force; [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.ServicePointManager]::SecurityProtocol -bor 3072; iex ((New-Object System.Net.WebClient).DownloadString('https://community.chocolatey.org/install.ps1'))

# Git 설치
choco install git -y --install-arguments="'/DIR=E:\Git'"
```

## 설치 확인

```bash
# 포터블 버전 확인
E:\GitPortable\bin\git.exe --version

# 또는 PATH에 추가된 경우
git --version
```

## 사용 방법

### 로컬 Git 경로 사용

배치 파일에서:

```batch
set "GIT_CMD=E:\GitPortable\bin\git.exe"
%GIT_CMD% --version
```

### PATH에 추가

현재 세션에만 추가:
```batch
set "PATH=%PATH%;E:\GitPortable\bin"
```

영구적으로 추가 (관리자 권한 필요):
```batch
setx PATH "%PATH%;E:\GitPortable\bin" /M
```

## 문제 해결

### Git을 찾을 수 없는 경우

1. `E:\GitPortable\bin\git.exe` 파일이 존재하는지 확인
2. 경로에 공백이 있으면 따옴표로 감싸기: `"E:\Program Files\Git\bin\git.exe"`
3. `upload_with_local_git.bat` 사용 (로컬 경로 지정)

### 다운로드 실패

1. 인터넷 연결 확인
2. 수동 다운로드: https://git-scm.com/download/win
3. 다운로드한 파일을 `E:\GitPortable`에 압축 해제

