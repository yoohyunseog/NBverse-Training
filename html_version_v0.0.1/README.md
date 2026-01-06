# Trading Bot HTML 버전

PyQt6 기반 Trading Bot GUI를 HTML/JavaScript로 변환한 버전입니다.

## 주요 특징

- ✅ **N/B 값 필수**: 모든 카드는 반드시 N/B 값(nb_value, nb_max, nb_min)을 포함해야 합니다
- ✅ **NBVerse 데이터베이스 연동**: N/B 값 계산 및 저장을 위해 NBVerse 데이터베이스 사용
- ✅ **에이전트 시스템**: 모듈화된 에이전트 아키텍처
  - NBAgent: N/B 값 계산, 저장, 조회
  - CardAgent: 카드 생산, 관리, 업데이트
  - ChartAgent: 차트 데이터 수집 및 시각화
  - AIAgent: AI 분석 및 강화학습
- ✅ **실시간 업데이트**: 가격, 잔고, 차트 데이터 자동 업데이트
- ✅ **모든 기능 포함**: 원본 PyQt6 버전의 모든 기능 구현

## 폴더 구조

```
html_version/
├── index.html          # 메인 HTML 파일
├── css/                # CSS 스타일시트
│   ├── main.css
│   ├── cards.css
│   └── chart.css
├── js/                 # JavaScript 파일
│   ├── config.js       # 설정 관리
│   ├── api.js          # API 클라이언트
│   ├── chart.js        # 차트 유틸리티
│   ├── cards.js        # 카드 렌더링
│   ├── main.js         # 메인 애플리케이션
│   └── agents/         # 에이전트 시스템
│       ├── nb-agent.js      # N/B 에이전트
│       ├── card-agent.js    # 카드 에이전트
│       ├── chart-agent.js   # 차트 에이전트
│       └── ai-agent.js      # AI 에이전트
├── api/                # 백엔드 API 서버
│   ├── app.py          # Flask API 서버
│   └── requirements.txt
└── README.md
```

## 설치 및 실행

### 1. 백엔드 API 서버 실행

```bash
cd api
pip install -r requirements.txt
python app.py
```

API 서버는 `http://localhost:5000`에서 실행됩니다.

### 2. 프론트엔드 실행

웹 브라우저에서 `index.html` 파일을 열거나, 로컬 웹 서버를 사용합니다:

```bash
# Python 3
python -m http.server 8000

# Node.js (http-server)
npx http-server -p 8000
```

그 다음 브라우저에서 `http://localhost:8000`으로 접속합니다.

## 에이전트 시스템 설계

### NBAgent (N/B 에이전트)

**책임**: N/B 값 계산, 저장, 조회

**주요 메서드**:
- `calculateNB(prices, chartData)`: 차트 데이터로부터 N/B 값 계산
- `saveNB(nbData)`: N/B 값을 NBVerse 데이터베이스에 저장
- `getNB(nbValue)`: N/B 값 조회
- `checkDuplicate(nbValue)`: N/B 값 중복 체크
- `isValidNB(nbValue)`: N/B 값 유효성 검사

**N/B 값 필수 규칙**:
- 모든 카드는 반드시 `nb_value`, `nb_max`, `nb_min` 값을 가져야 함
- N/B 값은 0~1 범위의 실수여야 함
- N/B 값이 없는 카드는 기본값(0.5, 5.5, 5.5)으로 설정됨

### CardAgent (카드 에이전트)

**책임**: 카드 생산, 관리, 업데이트

**주요 메서드**:
- `produceCard(chartData)`: 새 카드 생산 (N/B 값 필수 포함)
- `getCards(type)`: 카드 목록 조회
- `updateCard(cardId, updates)`: 카드 업데이트
- `deleteCard(cardId)`: 카드 삭제
- `validateCard(card)`: 카드 검증 (N/B 값 필수 체크)

**카드 생산 프로세스**:
1. 차트 데이터 가져오기
2. **N/B 값 계산 (필수)**
3. N/B 값 중복 체크
4. 카드 데이터 생성 (N/B 값 포함)
5. 서버에 카드 생성 요청

### ChartAgent (차트 에이전트)

**책임**: 차트 데이터 수집 및 시각화

**주요 메서드**:
- `fetchChartData(timeframe)`: 차트 데이터 가져오기
- `drawChart(prices)`: 차트 그리기
- `update()`: 차트 업데이트
- `changeTimeframe(timeframe)`: 타임프레임 변경

### AIAgent (AI 에이전트)

**책임**: AI 분석 및 강화학습

**주요 메서드**:
- `analyzeChart(chartData)`: 차트 AI 분석
- `analyzeRL(cardId)`: 강화학습 AI 분석
- `decideAction(state, card)`: 행동 결정 (BUY/SELL/HOLD)

## API 엔드포인트

### 가격 및 잔고
- `GET /api/price`: BTC 현재 가격
- `GET /api/balance`: 잔고 정보

### 차트
- `GET /api/chart?timeframe=1m&count=200`: 차트 데이터

### N/B 값
- `POST /api/nb/calculate`: N/B 값 계산
- `POST /api/nb/save`: N/B 값 저장
- `GET /api/nb/<nb_value>`: N/B 값 조회

### 카드
- `GET /api/cards/production`: 생산 카드 목록
- `GET /api/cards/verification`: 검증 카드 목록
- `GET /api/cards/discarded`: 폐기 카드 목록
- `POST /api/cards/produce`: 카드 생산
- `PUT /api/cards/<card_id>`: 카드 업데이트
- `DELETE /api/cards/<card_id>`: 카드 삭제

### AI
- `POST /api/ai/analyze-chart`: 차트 AI 분석
- `POST /api/ai/analyze-rl`: 강화학습 AI 분석

### 설정
- `GET /api/settings`: 설정 조회
- `POST /api/settings`: 설정 저장

## NBVerse 데이터베이스

이 프로젝트는 NBVerse 데이터베이스를 사용하여 N/B 값을 관리합니다.

- **저장 위치**: `../data/nbverse/`
- **하이브리드 저장**: 컴팩트 저장소 + Verse 저장소
- **N/B 값 계산**: TextToNBConverter를 사용하여 텍스트(가격 데이터)를 N/B 값으로 변환
- **경로 기반 검색**: N/B 값을 경로로 변환하여 빠른 검색 지원

## 주의사항

1. **N/B 값 필수**: 모든 카드는 반드시 N/B 값을 포함해야 합니다. N/B 값이 없는 카드는 기본값으로 설정되거나 거부될 수 있습니다.

2. **NBVerse 초기화**: 백엔드 API 서버가 시작될 때 NBVerse가 자동으로 초기화됩니다. 초기화에 실패하면 N/B 값 계산 기능을 사용할 수 없습니다.

3. **Upbit API**: 실제 트레이딩을 사용하려면 Upbit API 키를 설정해야 합니다. 설정하지 않으면 모니터링 전용으로 동작합니다.

## 개발

### 프론트엔드 수정
- CSS: `css/` 폴더의 파일 수정
- JavaScript: `js/` 폴더의 파일 수정
- HTML: `index.html` 수정

### 백엔드 수정
- API 엔드포인트: `api/app.py` 수정
- NBVerse 연동: `nbverse_helper.py` 참조

## 라이선스

원본 프로젝트와 동일한 라이선스를 따릅니다.

