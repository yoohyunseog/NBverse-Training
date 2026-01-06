# RL-Trading-Bot

강화학습(Reinforcement Learning) 기반 암호화폐 자동 거래 봇

## 📋 프로젝트 소개

이 프로젝트는 강화학습 AI를 활용한 암호화폐 자동 거래 시스템입니다. PyQt6 기반 GUI를 제공하며, 생산 카드 시스템과 NBVerse 분석을 통해 거래 전략을 최적화합니다.

## ✨ 주요 기능

### 🤖 강화학습 AI 시스템
- **3층 구조 AI**: Base Model → Emotion Model → Policy Model
- **실시간 판정**: BUY, SELL, HOLD, FREEZE, DELETE
- **리워드 기반 학습**: 손익률, 리스크, 점수 상승 등을 고려한 보상 시스템

### 📊 생산 카드 시스템
- **카드 기반 거래 전략**: 각 카드는 독립적인 거래 전략을 가짐
- **N/B 값 분석**: NBVerse를 활용한 차트 분석
- **실시간 모니터링**: 가격, 손익, 점수 추적

### 🎯 검증 시스템
- **AI 검증 완료 목록**: SELL 완료된 카드의 실적 추적
- **점수 및 랭크 시스템**: 손익률 기반 점수 계산 및 등급 부여
- **통계 대시보드**: 승률, 평균 손익, 랭크별 분포 등

## 🛠️ 기술 스택

- **Python 3.9+**
- **PyQt6**: GUI 프레임워크
- **PyUpbit**: 업비트 API
- **NumPy, Pandas**: 데이터 처리
- **Scikit-learn**: 머신러닝 모델
- **NBVerse**: N/B 값 계산 및 분석

## 📦 설치 방법

### 1. 저장소 클론
```bash
git clone https://github.com/yoohyunseog/RL-Trading-Bot.git
cd RL-Trading-Bot
```

### 2. 의존성 설치
```bash
pip install -r requirements.txt
```

### 3. 환경 변수 설정
`env.local` 파일을 생성하고 업비트 API 키를 설정하세요:
```
UPBIT_ACCESS_KEY=your_access_key
UPBIT_SECRET_KEY=your_secret_key
```

### 4. 실행
```bash
python main.py
```

## 📁 프로젝트 구조

```
v0.0.0.4/
├── ai/                    # 강화학습 AI 모듈
│   ├── base_model.py      # 기준 모델
│   ├── emotion_model.py   # 감정 모델
│   ├── policy_model.py    # 정책 모델
│   ├── reward_calculator.py  # 보상 계산기
│   └── rl_system.py       # RL 시스템 통합
├── managers/              # 데이터 관리자
│   ├── production_card_manager.py  # 생산 카드 관리
│   ├── settings_manager.py        # 설정 관리
│   └── discarded_card_manager.py # 폐기 카드 관리
├── ui/                    # UI 컴포넌트
│   ├── production_card.py  # 생산 카드 위젯
│   ├── verification_card.py # 검증 카드 위젯
│   └── gui_builder.py     # GUI 빌더
├── workers/               # 백그라운드 워커
│   ├── card_workers.py    # 카드 관련 워커
│   ├── rl_ai_workers.py    # RL AI 워커
│   └── rl_reward_worker.py # 리워드 워커
├── services/              # 서비스
│   └── price_cache_service.py # 가격 캐시 서비스
└── trading_gui_app_v0.12.0_pyqt6.py  # 메인 애플리케이션
```

## 🎮 사용 방법

1. **프로그램 실행**: `python main.py` 또는 `run.bat` 실행
2. **설정**: 설정 페이지에서 최소 구매 금액, 수수료율 등 설정
3. **카드 생산**: 좌측 차트의 MAX/MIN 값 기반으로 자동 카드 생산
4. **AI 판정**: 강화학습 AI가 실시간으로 BUY/SELL 판정
5. **검증**: SELL 완료된 카드는 검증 탭에서 실적 확인

## ⚙️ 주요 설정

- **최소 구매 금액**: 거래 최소 금액 설정
- **수수료율**: 거래 수수료 비율
- **생산 타임프레임**: 카드 생산에 사용할 타임프레임 목록
- **N/B 소수점 자리수**: N/B 값 표시 정밀도

## 📊 카드 상태

- **ACTIVE**: 활성 카드 (AI가 관측 중)
- **OVERLAP_ACTIVE**: 중첩 활성 카드
- **REMOVED**: 제거된 카드 (검증 탭으로 이동)
- **GRAY**: SELL 완료 직후 상태

## 🔒 보안 주의사항

- API 키는 절대 공개 저장소에 커밋하지 마세요
- `env.local` 파일은 `.gitignore`에 포함되어 있습니다
- 실제 거래 전 충분한 시뮬레이션 테스트를 권장합니다

## 📝 라이선스

이 프로젝트는 개인 사용 목적으로 제작되었습니다.

## 🤝 기여

버그 리포트나 기능 제안은 Issues를 통해 알려주세요.

## 📧 문의

프로젝트 관련 문의사항이 있으시면 Issues를 통해 연락해주세요.

