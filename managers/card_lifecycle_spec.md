# 카드 생명주기 + 히스토리 기록 + 강화학습 루프 규격서

## 전체 개념 요약

AI는 모든 생산 카드를 대상으로 상태를 관측하고
- 행동은 BUY 또는 HOLD 또는 SELL(이미 보유 중일 때)로 결정하고
- SELL이 실행되면 손익이 히스토리에 기록되고 해당 생산 카드는 회색 카드(비활성)로 전환되고
- 다음 생산 카드가 실제로 생산되는 순간, 회색 카드는 Active 목록에서 제거된다(단, 히스토리는 유지)
- 이후 동일 카드 키가 "중첩 카드"로 다시 조회되면, 다시 생산을 허용하고 히스토리를 또 쌓으면서 강화학습 데이터로 재사용한다

## 카드 상태 머신

### CardState
- **ACTIVE**: AI가 관측하고 의사결정하는 정상 카드
- **GRAY**: SELL로 청산 완료된 직후 상태. 화면에서 회색 처리. 다음 생산 이벤트 때 Active 목록에서 제거 대상
- **REMOVED**: Active 목록에서는 빠졌지만 히스토리와 통계(별점, 랭크, 누적손익)는 남아있는 상태
- **OVERLAP_ACTIVE**: 중첩 조회로 다시 살아난 ACTIVE. generation이 증가한 새 사이클로 취급

## 히스토리 이벤트 타입 (최대 100개, 최신 우선)

### HistoryType
- **NEW**: 해당 카드 키로 첫 생산(첫 매수)일 때
- **BUY**: 두 번째 이후 매수(중첩 재생산 포함해서 "새 매수 발생"이면 BUY로 통일)
- **SOLD**: 판매 완료(청산 완료)

### 히스토리 필드 최소 세트
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
    'fee_amount': float            # 수수료
}
```

### 저장 규칙
- 이벤트가 발생할 때마다 히스토리 맨 앞에 추가
- 100개 초과면 맨 뒤를 삭제
- 출력은 리스트 순서 그대로 출력하면 최신 우선이 됨

## SELL 이후 회색 카드 처리 규칙

### SELL 체결 완료 이벤트 발생 시
1. 히스토리에 SOLD 1건 추가(손익 포함)
2. CardState를 GRAY로 변경
3. `removal_pending = true`로 표시

### 다음 "생산 카드가 실제로 생산되는 순간"에 실행할 정리 규칙
1. Active 카드 목록을 스윕하면서
   - CardState가 GRAY이고 `removal_pending=true`인 카드는 Active에서 제거
2. CardState는 REMOVED로 바꾸되
   - 히스토리/누적통계는 그대로 유지

## 중첩 카드 재활성 규칙

`card_key`로 조회했을 때 히스토리가 존재하고
- 가장 최신 사이클이 SOLD로 닫혀 있으면
- 중첩 생산 허용 조건일 때

1. `generation = 이전 최대 generation + 1`
2. `CardState = OVERLAP_ACTIVE`로 변경
3. 새 매수 실행 시 히스토리에는 BUY로 기록

## 강화학습 설계 (실전형)

### 환경(Environment)

#### 관측(state)
각 생산 카드의 특징값 벡터
- 변동성, 추세강도, 거래량 변화, 박스폭, ATR, 최근 수익률, NB 상태(보유 여부), 시간 경과 등

#### 행동(action)
- 보유 전: 0 = HOLD, 1 = BUY
- 보유 중: 0 = HOLD, 1 = SELL

#### 보상(reward)
SELL이 실행되어 청산이 확정되는 순간에만 보상을 주는 게 깔끔함
```
reward = pnl_amount - fee_amount - slippage_cost
```

추가 옵션:
- 조기 손절 같은 FAIL도 SELL로 처리하면 동일하게 학습됨
- 장기 보유를 싫어하게 만들고 싶으면 시간 패널티를 조금 추가
```
reward = 위 식 - holding_penalty_per_step
```

### 학습 알고리즘 선택
- 행동이 단순(매수/매도/홀드)이고 빠르게 굴려야 하면: DQN 계열이 간단함
- 연속적인 포지션 크기까지 다루면: PPO 또는 SAC가 보통 잘 맞음

### 학습 데이터가 쌓이는 지점
- 매번 의사결정 스텝에서: `state_t`와 `action_t`는 기록
- SELL로 청산이 확정되는 순간: `reward`와 `terminal=true`가 확정되므로 그때 transition을 완성해서 경험 버퍼에 넣는다
- 즉, SELL이 "학습이 확정되는 트리거" 역할을 한다

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

## 카드 키(card_key) 만드는 규칙

```python
card_key = f"{timeframe}_{nb_id}"
# 예: "15m_nb_15m_0.5"
```

## generation과 nb_id 파일명 규칙

- `nb_id`: `f"nb_{timeframe}_{nb_value}"` 형식
- `generation`: 히스토리에서 최대값 + 1

## GRAY 카드 제거 시점

- **체결 시점**: BUY 주문이 체결 완료된 순간에 GRAY 카드 정리 실행

## 강화학습 멀티카드 구조

- **단일 에이전트**: 모든 카드를 하나의 에이전트가 관측하고 행동 결정
- 각 카드의 state를 벡터로 결합하여 입력
- 출력은 각 카드별 행동 (멀티액션)

