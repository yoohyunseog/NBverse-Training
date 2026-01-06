# 에이전트 시스템 설계 문서

## 개요

HTML 버전 Trading Bot은 모듈화된 에이전트 아키텍처를 사용합니다. 각 에이전트는 특정 책임을 가지며, N/B 값은 모든 카드에 필수로 포함되어야 합니다.

## 에이전트 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                    Frontend (Browser)                     │
│                                                           │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────┐ │
│  │ NBAgent  │  │CardAgent  │  │ChartAgent│  │AIAgent │ │
│  │          │  │           │  │          │  │        │ │
│  │ N/B 값   │  │ 카드 관리 │  │ 차트     │  │ AI 분석 │ │
│  │ 계산/저장│  │ 생산/업데이트│ │ 데이터/시각화│ │ 강화학습│ │
│  └──────────┘  └──────────┘  └──────────┘  └────────┘ │
│       │              │              │              │      │
│       └──────────────┴──────────────┴──────────────┘      │
│                          │                                  │
│                    ┌─────▼─────┐                           │
│                    │   API.js  │                           │
│                    │  (Client)  │                           │
│                    └─────┬─────┘                           │
└──────────────────────────┼──────────────────────────────────┘
                           │ HTTP/REST
┌──────────────────────────▼──────────────────────────────────┐
│                    Backend (Flask API)                      │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐  │
│  │              Flask API Server (app.py)                │  │
│  └──────────────────────────────────────────────────────┘  │
│                          │                                   │
│       ┌──────────────────┼──────────────────┐              │
│       │                  │                  │              │
│  ┌────▼────┐      ┌──────▼──────┐    ┌──────▼──────┐      │
│  │NBVerse  │      │ProductionCard│    │  Upbit API   │      │
│  │Database │      │   Manager    │    │              │      │
│  │         │      │              │    │              │      │
│  │ N/B 값  │      │ 카드 생명주기│    │ 가격/잔고    │      │
│  │ 저장/조회│      │ 관리         │    │ 조회         │      │
│  └─────────┘      └──────────────┘    └──────────────┘      │
└──────────────────────────────────────────────────────────────┘
```

## 에이전트 상세 설계

### 1. NBAgent (N/B 에이전트)

**목적**: N/B 값 계산, 저장, 조회를 담당하는 핵심 에이전트

**책임**:
- 차트 데이터로부터 N/B 값 계산
- N/B 값을 NBVerse 데이터베이스에 저장
- N/B 값 조회 및 검색
- N/B 값 중복 체크
- N/B 값 유효성 검사

**주요 메서드**:

```javascript
class NBAgent {
    // N/B 값 계산 (필수)
    async calculateNB(prices, chartData)
    
    // N/B 값 저장 (NBVerse 데이터베이스)
    async saveNB(nbData)
    
    // N/B 값 조회
    async getNB(nbValue)
    
    // N/B 값 중복 체크
    async checkDuplicate(nbValue, threshold)
    
    // N/B 값 유효성 검사
    isValidNB(nbValue)
    
    // N/B 값 포맷팅
    formatNB(value)
}
```

**N/B 값 구조**:
```javascript
{
    nb_value: 0.5,      // 0~1 범위의 정규화된 N/B 값 (필수)
    nb_max: 5.5,       // bitMax를 0~1로 정규화한 값 (필수)
    nb_min: 5.5,       // bitMin을 0~1로 정규화한 값 (필수)
    bit_max: 5.5,      // NBVerse의 bitMax 값
    bit_min: 5.5,      // NBVerse의 bitMin 값
    nb_id: "nb_...",   // NBVerse 데이터베이스 ID
    timestamp: "..."    // 생성 시간
}
```

**N/B 값 필수 규칙**:
1. 모든 카드는 반드시 `nb_value`, `nb_max`, `nb_min` 값을 가져야 함
2. N/B 값은 0~1 범위의 실수여야 함
3. N/B 값이 없는 카드는 기본값(0.5, 5.5, 5.5)으로 설정됨
4. N/B 값 계산 실패 시 카드 생산이 거부될 수 있음

### 2. CardAgent (카드 에이전트)

**목적**: 카드 생산, 관리, 업데이트를 담당하는 에이전트

**책임**:
- 카드 생산 (N/B 값 필수 포함)
- 카드 목록 조회 및 필터링
- 카드 업데이트 및 삭제
- 카드 검증 (N/B 값 필수 체크)
- 최대 카드 수 제한 관리

**주요 메서드**:

```javascript
class CardAgent {
    // 카드 생산 (N/B 값 필수)
    async produceCard(chartData)
    
    // 카드 목록 조회
    async getCards(type)
    
    // 카드 업데이트
    async updateCard(cardId, updates)
    
    // 카드 삭제
    async deleteCard(cardId)
    
    // 카드 검증 (N/B 값 필수 체크)
    validateCard(card)
}
```

**카드 생산 프로세스**:
```
1. 차트 데이터 가져오기
   ↓
2. NBAgent를 통해 N/B 값 계산 (필수)
   ↓
3. N/B 값 중복 체크
   ↓
4. 카드 데이터 생성 (N/B 값 포함)
   {
     card_id: "...",
     nb_value: 0.5,  // 필수
     nb_max: 5.5,    // 필수
     nb_min: 5.5,    // 필수
     ...
   }
   ↓
5. 서버에 카드 생성 요청
   ↓
6. 카드 검증 (N/B 값 필수 체크)
   ↓
7. 메모리 캐시에 저장
```

**카드 데이터 구조**:
```javascript
{
    card_id: "card_...",           // 카드 고유 ID
    card_key: "key_...",            // 카드 키
    timeframe: "1m",               // 타임프레임
    nb_value: 0.5,                 // N/B 값 (필수)
    nb_max: 5.5,                   // N/B MAX (필수)
    nb_min: 5.5,                   // N/B MIN (필수)
    bit_max: 5.5,                  // bitMax
    bit_min: 5.5,                  // bitMin
    chart_data: {...},             // 차트 데이터
    production_time: "2024-...",   // 생산 시간
    card_state: "ACTIVE",          // 카드 상태
    card_type: "normal",           // 카드 타입
    score: 100.0,                  // 점수
    rank: "C",                     // 등급
    history_list: [...]            // 히스토리
}
```

### 3. ChartAgent (차트 에이전트)

**목적**: 차트 데이터 수집 및 시각화를 담당하는 에이전트

**책임**:
- 차트 데이터 가져오기 (Upbit API)
- 차트 그리기 및 시각화
- 타임프레임 변경 처리
- N/B 값 표시 업데이트
- 자동 업데이트 관리

**주요 메서드**:

```javascript
class ChartAgent {
    // 차트 초기화
    init()
    
    // 차트 데이터 가져오기
    async fetchChartData(timeframe)
    
    // 차트 그리기
    drawChart(prices)
    
    // 차트 업데이트
    async update()
    
    // 타임프레임 변경
    async changeTimeframe(timeframe)
    
    // 자동 업데이트 시작/중지
    startAutoUpdate()
    stopAutoUpdate()
}
```

**차트 업데이트 프로세스**:
```
1. API에서 차트 데이터 가져오기
   ↓
2. 차트 그리기 (Canvas)
   ↓
3. NBAgent를 통해 N/B 값 계산
   ↓
4. N/B 값 표시 업데이트 (MAX, MIN, VALUE)
```

### 4. AIAgent (AI 에이전트)

**목적**: AI 분석 및 강화학습을 담당하는 에이전트

**책임**:
- 차트 AI 분석
- 강화학습 AI 분석
- 행동 결정 (BUY/SELL/HOLD)
- AI 분석 결과 캐싱

**주요 메서드**:

```javascript
class AIAgent {
    // 차트 AI 분석
    async analyzeChart(chartData)
    
    // 강화학습 AI 분석
    async analyzeRL(cardId)
    
    // 행동 결정
    async decideAction(state, card)
}
```

**행동 결정 프로세스**:
```
1. 카드의 N/B 값 확인
   ↓
2. 강화학습 AI 분석 요청
   ↓
3. N/B 값 기반 기본 의사결정
   - nb_value > 0.7 → BUY
   - nb_value < 0.3 → SELL
   - 그 외 → HOLD
   ↓
4. 행동 반환
```

## 에이전트 간 상호작용

### 카드 생산 시나리오

```
User Action: "카드 생산" 버튼 클릭
    ↓
CardAgent.produceCard()
    ↓
ChartAgent.fetchChartData() → 차트 데이터 가져오기
    ↓
NBAgent.calculateNB() → N/B 값 계산 (필수)
    ↓
NBAgent.checkDuplicate() → 중복 체크
    ↓
CardAgent.validateCard() → 카드 검증 (N/B 값 필수 체크)
    ↓
API.produceCard() → 서버에 카드 생성 요청
    ↓
CardAgent.getCards() → 카드 목록 새로고침
    ↓
CardRenderer.renderCardList() → UI 업데이트
```

### 차트 업데이트 시나리오

```
Timer: 5초마다
    ↓
ChartAgent.update()
    ↓
API.getChartData() → 차트 데이터 가져오기
    ↓
ChartAgent.drawChart() → 차트 그리기
    ↓
NBAgent.calculateNB() → N/B 값 계산
    ↓
ChartAgent.updateNBDisplay() → N/B 값 표시 업데이트
```

### AI 분석 시나리오

```
User Action: "AI 분석" 버튼 클릭
    ↓
AIAgent.analyzeRL(cardId)
    ↓
API.analyzeRL() → 강화학습 분석 요청
    ↓
서버: 카드의 N/B 값 기반 분석
    ↓
AIAgent.decideAction() → 행동 결정 (BUY/SELL/HOLD)
    ↓
UI 업데이트
```

## NBVerse 데이터베이스 연동

### 저장 프로세스

```
NBAgent.saveNB()
    ↓
API.saveNB() → POST /api/nb/save
    ↓
Backend: nbverse_storage.save_text()
    ↓
NBVerse 데이터베이스에 저장
    - 컴팩트 저장소: data/nbverse/nbverse_data.json
    - Verse 저장소: data/nbverse/max/... 및 min/...
```

### 조회 프로세스

```
NBAgent.getNB()
    ↓
API.getNB() → GET /api/nb/<nb_value>
    ↓
Backend: nbverse_storage.load_from_path()
    ↓
NBVerse 데이터베이스에서 조회
    - 경로 기반 검색
    - 범위 검색 지원
```

## 데이터 흐름

### N/B 값 계산 흐름

```
차트 데이터 (가격 배열)
    ↓
TextToNBConverter.text_to_nb()
    ↓
bitMax, bitMin 계산
    ↓
정규화 (0~1 범위)
    ↓
nb_value = (nb_max + nb_min) / 2
    ↓
카드 데이터에 포함 (필수)
```

### 카드 데이터 흐름

```
카드 생산
    ↓
N/B 값 계산 (필수)
    ↓
카드 데이터 생성
    ↓
서버에 저장
    ↓
NBVerse 데이터베이스에 N/B 값 저장
    ↓
메모리 캐시에 저장
    ↓
UI 업데이트
```

## 에러 처리

### N/B 값 계산 실패

```javascript
try {
    const nbResult = await nbAgent.calculateNB(prices);
    if (!nbResult || !nbResult.nb_value) {
        throw new Error('N/B 값 계산에 실패했습니다');
    }
} catch (error) {
    // 기본값 사용 또는 카드 생산 거부
    console.error('N/B 값 계산 실패:', error);
    // 기본값: { nb_value: 0.5, nb_max: 5.5, nb_min: 5.5 }
}
```

### 카드 검증 실패

```javascript
if (!cardAgent.validateCard(card)) {
    console.error('카드 검증 실패: N/B 값이 없습니다');
    // 카드 거부 또는 기본값 설정
}
```

## 성능 최적화

1. **메모리 캐싱**: 에이전트는 메모리 캐시를 사용하여 빠른 조회 지원
2. **비동기 처리**: 모든 API 호출은 비동기로 처리
3. **배치 업데이트**: 여러 카드를 한 번에 업데이트
4. **캐시 무효화**: 데이터 변경 시 캐시 자동 무효화

## 확장성

새로운 에이전트를 추가하려면:

1. `js/agents/` 폴더에 새 에이전트 파일 생성
2. 에이전트 클래스 정의
3. `index.html`에 스크립트 추가
4. 필요한 경우 백엔드 API 엔드포인트 추가

## 보안 고려사항

1. **API 키 보호**: Upbit API 키는 서버에서만 사용
2. **입력 검증**: 모든 사용자 입력 검증
3. **N/B 값 검증**: N/B 값 유효성 검사 필수
4. **에러 메시지**: 민감한 정보 노출 방지

## 테스트

각 에이전트는 독립적으로 테스트 가능:

```javascript
// NBAgent 테스트
const nbResult = await nbAgent.calculateNB([100, 101, 102]);
console.assert(nbResult.nb_value !== undefined, 'N/B 값이 있어야 함');

// CardAgent 테스트
const card = await cardAgent.produceCard(chartData);
console.assert(card.nb_value !== undefined, '카드에 N/B 값이 있어야 함');
```

## 결론

에이전트 시스템은 모듈화된 아키텍처로 설계되어 유지보수성과 확장성을 제공합니다. **N/B 값은 모든 카드에 필수로 포함되어야 하며**, NBVerse 데이터베이스를 통해 관리됩니다.

