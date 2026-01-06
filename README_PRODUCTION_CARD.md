# 생산 카드 시스템 README

## 개요

생산 카드(Production Card)는 거래 봇의 핵심 기능으로, N/B(NBverse) 값 기반으로 생성되는 거래 신호 카드입니다. 각 카드는 독립적인 생명주기를 가지며, AI가 관측하고 의사결정하는 단위입니다.

## 주요 특징

- **N/B 값 기반 생성**: 타임프레임과 N/B 값을 기반으로 고유한 카드 생성
- **카드 생명주기 관리**: ACTIVE → GRAY → REMOVED 상태 전환
- **히스토리 추적**: 최대 100개의 거래 히스토리 관리 (NEW, BUY, SOLD)
- **점수 및 등급 시스템**: 성과에 따른 점수(0~300+) 및 등급(F~+SS) 부여
- **중첩 카드 재활성**: 동일 패턴의 카드 재활성 및 세대(generation) 관리
- **강화학습 연동**: AI가 카드를 관측하고 행동 결정 (BUY/HOLD/SELL)
- **실시간 가격 추적**: 생산 시점부터 현재까지의 가격 변화 추적
- **실시간 점수 추적**: 카드 성과에 따른 점수 변화 추적

## 카드 생명주기

### 카드 상태 (CardState)

| 상태 | 설명 | 특징 |
|------|------|------|
| **ACTIVE** | 정상 활성 카드 | AI가 관측하고 의사결정하는 카드 |
| **GRAY** | 청산 완료 직후 | SELL로 청산 완료된 직후 상태, 화면에서 회색 처리 |
| **REMOVED** | Active 목록에서 제거 | 히스토리와 통계는 유지하되 Active 목록에서는 제거 |
| **OVERLAP_ACTIVE** | 중첩 재활성 카드 | 중첩 조회로 다시 살아난 ACTIVE, generation 증가 |

### 상태 전환 흐름

```
생산 → ACTIVE → (매수) → ACTIVE (보유 중)
                    ↓
                (SELL 체결)
                    ↓
                 GRAY (removal_pending=true)
                    ↓
            (다음 생산 시점)
                    ↓
                REMOVED
                    ↓
            (중첩 재활성 시)
                    ↓
            OVERLAP_ACTIVE
```

## 히스토리 시스템

### 히스토리 타입 (HistoryType)

- **NEW**: 해당 카드 키로 첫 생산(첫 매수)일 때
- **BUY**: 두 번째 이후 매수 (중첩 재생산 포함)
- **SOLD**: 판매 완료(청산 완료)

### 히스토리 필드

```python
{
    'history_id': str,           # UUID
    'card_key': str,              # 카드 키 (nb_id 기반)
    'generation': int,            # 세대 번호
    'type': str,                  # NEW, BUY, SOLD
    'nb_id': str,                 # N/B ID
    'timestamp': str,             # ISO 형식
    'entry_price': float,         # 진입 가격
    'exit_price': float,          # 청산 가격 (SOLD일 때만)
    'qty': float,                 # 수량
    'pnl_percent': float,         # 손익률 (%)
    'pnl_amount': float,          # 손익 금액
    'fee_amount': float,           # 수수료
    'memo': str,                  # 메모
    'is_simulation': bool         # 모의 거래 여부
}
```

### 저장 규칙

- 이벤트 발생 시 히스토리 맨 앞에 추가 (최신 우선)
- 최대 100개 제한, 초과 시 맨 뒤 삭제
- 조회 시 리스트 순서 그대로 출력하면 최신 우선

## 점수 및 등급 시스템

### 초기 값

- **기본 점수**: 100점
- **기본 등급**: C

### 등급 체계

| 등급 | 점수 범위 | 설명 |
|------|----------|------|
| **F** | 0 ~ 59점 | 최하위 등급 |
| **E** | 60 ~ 79점 | 하위 등급 |
| **D** | 80 ~ 99점 | 중하위 등급 |
| **C** | 100 ~ 119점 | 기본 등급 (생산 시 기본값) |
| **B** | 120 ~ 139점 | 중위 등급 |
| **A** | 140 ~ 179점 | 상위 등급 |
| **S** | 180 ~ 219점 | 최상위 등급 |
| **+S** | 220 ~ 259점 | 특급 등급 |
| **++S** | 260 ~ 299점 | 초특급 등급 |
| **+SS** | 300점 이상 | 최고 등급 |

### 점수 변동

- 강화학습 AI가 거래 성과에 따라 점수 계산 및 업데이트
- SELL 체결 완료 시 보상(reward) 기반으로 점수 업데이트
- 중첩 카드 재활성 시 기존 점수와 등급 유지

## 카드 키(card_key) 시스템

### 생성 규칙

```python
card_key = f"{timeframe}_{nb_id}"
# 예: "15m_nb_15m_0.5"
```

### 용도

- 중복 카드 감지
- 중첩 카드 재활성
- 카드 조회 및 관리

## 중첩 카드 재활성

### 재활성 조건

1. 동일 `card_key`를 가진 카드가 NBverse에 존재
2. 최신 사이클이 SOLD로 닫혀 있음
3. 카드 상태가 REMOVED가 아님

### 재활성 프로세스

1. `generation = 이전 최대 generation + 1`
2. `CardState = OVERLAP_ACTIVE`로 변경
3. 기존 히스토리 유지
4. 새 매수 실행 시 히스토리에 BUY로 기록

## 강화학습 연동

### 환경(Environment)

#### 관측(state)
각 생산 카드의 특징값 벡터:
- 변동성, 추세강도, 거래량 변화
- 박스폭, ATR, 최근 수익률
- NB 상태(보유 여부), 시간 경과 등

#### 행동(action)
- **보유 전**: 0 = HOLD, 1 = BUY
- **보유 중**: 0 = HOLD, 1 = SELL

#### 보상(reward)
SELL이 실행되어 청산이 확정되는 순간에만 보상 부여:
```python
reward = pnl_amount - fee_amount - slippage_cost
```

### 학습 데이터 수집

- 매 의사결정 스텝: `state_t`, `action_t` 기록
- SELL 체결 완료 시: `reward`, `terminal=true` 확정 → transition 완성 → 경험 버퍼에 추가

## 운영 루프 (매 틱 반복)

1. 모든 ACTIVE 또는 OVERLAP_ACTIVE 카드에 대해 state 생성
2. AI가 행동 결정
   - 보유 전이면 BUY 또는 HOLD
   - 보유 중이면 SELL 또는 HOLD
3. BUY 실행되면
   - 히스토리 기록 (첫 매수면 NEW, 그 외는 BUY)
   - `nb_status = OPEN`
4. SELL 실행되고 체결 완료되면
   - 히스토리 SOLD 기록(손익 포함)
   - `nb_status = SOLD`
   - 카드 GRAY 처리(`removal_pending=true`)
   - 강화학습 transition 확정(보상 계산)
5. 다음에 어떤 카드든 "실제 생산(BUY 체결)"이 하나라도 발생한 순간
   - GRAY 카드들 중 `removal_pending=true`를 Active 목록에서 제거하고 REMOVED로 변경
6. 이후 `card_key` 조회 시
   - 최신 사이클이 SOLD로 닫혀 있고 중첩 허용이면
   - `generation` 증가시키고 OVERLAP_ACTIVE로 부활

## 주요 기능

### 1. 카드 생산

- 좌측 차트에서 계산한 MAX/MIN 값 기반으로 카드 생성
- N/B 값, 타임프레임, 차트 데이터 포함
- 최대 카드 수 제한 (설정에서 동적으로 읽어옴, 기본값 4개)

### 2. 카드 관리

- 메모리 캐싱으로 빠른 조회 (O(1) 인덱스 사용)
- 임시 저장 파일(`data/production_cards_cache.json`)로 빠른 로드
- NBverse 저장소에 영구 저장

### 3. 실시간 업데이트

- 가격 캐시 서비스를 통한 실시간 가격 업데이트
- 실시간 손익 계산 및 표시
- 실시간 점수 추적 및 차트 표시

### 4. AI 분석

- 기존 ML AI 메시지 표시
- 강화학습 AI 분석 및 행동 결정
- AI 분석 진행률 표시

### 5. 자동 폐기

- 손실률 임계값(-10%) 초과 시 자동 폐기
- 연속 손실 5회 이상 시 자동 폐기
- 평균 손실률 임계값 초과 시 자동 폐기

## 데이터 구조

### 카드 필드

```python
{
    'card_id': str,                    # 카드 고유 ID
    'card_key': str,                   # 카드 키 (timeframe_nb_id)
    'timeframe': str,                  # 타임프레임
    'nb_value': float,                 # N/B 값
    'nb_max': float,                   # N/B MAX 값
    'nb_min': float,                   # N/B MIN 값
    'nb_id': str,                      # N/B ID
    'card_type': str,                  # 카드 타입 (normal/overlap)
    'card_state': str,                 # 카드 상태 (ACTIVE/GRAY/REMOVED/OVERLAP_ACTIVE)
    'status': str,                     # 상태 (호환성)
    'removal_pending': bool,           # 제거 대기 여부
    'production_time': str,            # 생산 시간 (ISO 형식)
    'production_number': int,          # 생산 순서 번호
    'chart_data': dict,                # 차트 데이터
    'history_list': list,              # 히스토리 리스트 (최대 100개)
    'score': float,                    # 카드 점수 (기본값 100.0)
    'rank': str,                       # 카드 등급 (기본값 'C')
    'realtime_scores': list,           # 실시간 점수 히스토리
    'buy_entry_price': float           # 매수 진입 가격
}
```

## 파일 구조

### 주요 파일

- `managers/production_card_manager.py`: 카드 관리 클래스
- `ui/production_card.py`: 카드 UI 위젯 (PyQt6)
- `managers/card_lifecycle_spec.md`: 카드 생명주기 규격서
- `DOC/CARD_SCORE_RANK_SYSTEM.md`: 점수 및 등급 시스템 문서
- `managers/HISTORY_USAGE.md`: 히스토리 시스템 사용 가이드

### 저장 위치

- **임시 저장**: `data/production_cards_cache.json`
- **영구 저장**: NBverse 저장소 (`max_dir`, `min_dir`)

## 사용 예시

### 카드 생성

```python
from managers.production_card_manager import ProductionCardManager

manager = ProductionCardManager()

# 새 카드 생성
card = manager.add_card(
    timeframe='15m',
    nb_value=0.5,
    nb_max=5.5,
    nb_min=4.5,
    card_type='normal',
    chart_data={'prices': [50000000, 51000000, ...]},
    decimal_places=10
)
```

### 히스토리 추가

```python
# 매수 히스토리 추가
manager.add_buy_history(
    card_id=card['card_id'],
    qty=0.001,
    entry_price=50000000,
    fee_amount=0.0,
    memo='매수 완료'
)

# 판매 완료 히스토리 추가
manager.add_sold_history(
    card_id=card['card_id'],
    exit_price=51000000,
    pnl_percent=2.0,
    pnl_amount=100000,
    fee_amount=0.0,
    memo='판매 완료'
)
```

### 카드 조회

```python
# 활성 카드 조회
active_cards = manager.get_active_cards()

# 모든 카드 조회 (REMOVED 제외)
all_cards = manager.get_all_cards()

# 카드 ID로 조회
card = manager.get_card_by_id('prod_card_15m_20241223_120000_1234')

# 카드 키로 조회
card = manager.get_card_by_key('15m_nb_15m_0.5')
```

## 성능 최적화

### 메모리 캐싱

- 메모리 캐시로 빠른 조회 (O(1) 인덱스 사용)
- `card_id_index`: card_id → card 매핑
- `card_key_index`: card_key → [cards] 매핑

### 백그라운드 처리

- 카드 로드: 백그라운드 스레드에서 실행
- NBverse 저장/업데이트: 백그라운드 스레드에서 실행
- 중복 카드 정리: 백그라운드 스레드에서 실행

### JSON 처리 최적화

- `orjson` 사용 가능 시 빠른 JSON 처리
- 없으면 표준 `json` 사용

## 주의사항

1. **카드 상태 관리**: GRAY 카드는 다음 생산 시점에 REMOVED로 변경됨
2. **히스토리 제한**: 히스토리는 최대 100개, 초과 시 자동 삭제
3. **중복 카드**: 같은 `card_key`를 가진 활성 카드가 여러 개 있으면 최신 것만 유지
4. **최대 카드 수**: 설정에서 동적으로 읽어옴, 기본값 4개
5. **스레드 안전성**: 인덱스 접근 시 락 사용

## 향후 개선 사항

1. **점수 계산 로직 고도화**: 거래 성과, 빈도, 보유 기간 등 종합 고려
2. **AI 분석 정확도 향상**: 더 정교한 특징값 추출 및 행동 결정
3. **성능 최적화**: 대량 카드 처리 시 성능 개선
4. **UI/UX 개선**: 카드 정보 표시 및 인터랙션 개선
5. **통계 및 분석**: 카드별 상세 통계 및 분석 기능 추가

## 변경 이력

- **v0.0.0.4**: 생산 카드 시스템 초기 구현
  - 카드 생명주기 관리
  - 히스토리 시스템
  - 점수 및 등급 시스템
  - 중첩 카드 재활성
  - 강화학습 연동

