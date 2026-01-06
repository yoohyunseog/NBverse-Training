# NBverse-Training

*[한국어 버전은 아래를 참조하세요](#한국어-korean)*

Reinforcement Learning-Based Cryptocurrency Trading Bot with Card Production System

## 📋 Overview

This project is an automated cryptocurrency trading system utilizing Reinforcement Learning AI. It features a PyQt6-based GUI and optimizes trading strategies through a card production system and NBVerse analysis.

## ✨ Key Features

### 🤖 Reinforcement Learning AI System
- **3-Layer AI Architecture**: Base Model → Emotion Model → Policy Model
- **Real-time Decisions**: BUY, SELL, HOLD, FREEZE, DELETE
- **Reward-Based Learning**: Reward system considering profit/loss ratio, risk, and score improvement

### 📊 Production Card System
- **Card-Based Trading Strategies**: Each card has an independent trading strategy
- **N/B Value Analysis**: Chart analysis using NBVerse
- **Real-time Monitoring**: Price, profit/loss, and score tracking

### 🎯 Verification System
- **AI Verification List**: Performance tracking of completed SELL cards
- **Score & Rank System**: Score calculation and rank assignment based on profit/loss ratio
- **Statistics Dashboard**: Win rate, average profit/loss, rank distribution, etc.

## 🛠️ Tech Stack

- **Python 3.9+**
- **PyQt6**: GUI Framework
- **PyUpbit**: Upbit API
- **NumPy, Pandas**: Data Processing
- **Scikit-learn**: Machine Learning Models
- **NBVerse**: N/B Value Calculation and Analysis

## 📦 Installation

### 1. Clone Repository
```bash
git clone https://github.com/yoohyunseog/NBverse-Training.git
cd NBverse-Training
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Set Environment Variables
Create an `env.local` file and set your Upbit API keys:
```
UPBIT_ACCESS_KEY=your_access_key
UPBIT_SECRET_KEY=your_secret_key
```

### 4. Run
```bash
python main.py
```

## 📁 Project Structure

```
v0.0.0.4/
├── ai/                    # Reinforcement Learning AI Module
│   ├── base_model.py      # Base Model
│   ├── emotion_model.py   # Emotion Model
│   ├── policy_model.py    # Policy Model
│   ├── reward_calculator.py  # Reward Calculator
│   └── rl_system.py       # RL System Integration
├── managers/              # Data Managers
│   ├── production_card_manager.py  # Production Card Manager
│   ├── settings_manager.py        # Settings Manager
│   └── discarded_card_manager.py # Discarded Card Manager
├── ui/                    # UI Components
│   ├── production_card.py  # Production Card Widget
│   ├── verification_card.py # Verification Card Widget
│   └── gui_builder.py     # GUI Builder
├── workers/               # Background Workers
│   ├── card_workers.py    # Card-related Workers
│   ├── rl_ai_workers.py    # RL AI Workers
│   └── rl_reward_worker.py # Reward Workers
├── services/              # Services
│   └── price_cache_service.py # Price Cache Service
└── trading_gui_app_v0.12.0_pyqt6.py  # Main Application
```

## 🎮 Usage

1. **Launch**: Run `python main.py` or `run.bat`
2. **Settings**: Configure minimum purchase amount, commission rate, etc. in the settings page
3. **Card Production**: Automatic card production based on MAX/MIN values from the left chart
4. **AI Decisions**: Real-time BUY/SELL decisions by the RL AI
5. **Verification**: Check performance of completed SELL cards in the verification tab

## ⚙️ Key Settings

- **Minimum Purchase Amount**: Set minimum trading amount
- **Commission Rate**: Trading fee ratio
- **Production Timeframes**: List of timeframes for card production
- **N/B Decimal Places**: Precision for N/B value display

## 📊 Card Status

- **ACTIVE**: Active card (monitored by AI)
- **OVERLAP_ACTIVE**: Overlapping active card
- **REMOVED**: Removed card (moved to verification tab)
- **GRAY**: Status immediately after SELL completion

## 🔒 Security Notes

- Never commit API keys to public repositories
- `env.local` file is included in `.gitignore`
- Sufficient simulation testing is recommended before actual trading

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

Please report bugs or suggest features through Issues.

## 📧 Contact

For project-related inquiries, please contact us through Issues.

---

## 한국어 (Korean)

# NBverse-Training

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
git clone https://github.com/yoohyunseog/NBverse-Training.git
cd NBverse-Training
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

이 프로젝트는 MIT 라이선스를 따릅니다. 자세한 내용은 [LICENSE](LICENSE) 파일을 참조하세요.

## 🤝 기여

버그 리포트나 기능 제안은 Issues를 통해 알려주세요.

## 📧 문의

프로젝트 관련 문의사항이 있으시면 Issues를 통해 연락해주세요.

