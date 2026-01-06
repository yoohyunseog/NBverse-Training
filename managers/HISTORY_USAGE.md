# 생산 카드 히스토리 시스템 사용 가이드

## 개요

생산 카드마다 최대 100개의 히스토리를 관리하는 시스템입니다.
히스토리는 최신순으로 저장되며, 100개를 초과하면 가장 오래된 항목이 자동으로 제거됩니다.

## 히스토리 타입

- **NEW**: 카드가 처음 생산될 때 (자동 추가)
- **BUY**: 추가 매수 시
- **SOLD**: 판매 완료 시
- **CANCEL**: 매수 취소/실패 시

## 히스토리 필드

```python
{
    'history_id': str,        # 고유 ID (UUID)
    'created_at': str,        # 생성 시간 (ISO 형식)
    'type': str,              # NEW, BUY, SOLD, CANCEL
    'nb_id': str,             # N/B ID (선택사항)
    'generation': int,        # 중첩 생산 세대
    'qty': float,             # 수량
    'entry_price': float,     # 진입 가격
    'exit_price': float,      # 청산 가격
    'pnl_percent': float,     # 손익률 (%)
    'memo': str               # 메모
}
```

## 사용 예제

### 1. 카드 생성 시 (자동으로 NEW 히스토리 추가)

```python
from managers.production_card_manager import ProductionCardManager

manager = ProductionCardManager()

# 카드 생성 (자동으로 NEW 히스토리 추가됨)
card = manager.add_card(
    timeframe='15m',
    nb_value=0.5,
    card_type='normal',
    chart_data={'prices': [...]},
    nb_id='nb_15m_0.5',
    generation=1,
    qty=0.0,  # 실제 매수 시 업데이트
    entry_price=0.0,  # 실제 매수 시 업데이트
    memo='카드 생성'
)
```

### 2. 매수 히스토리 추가

```python
# 실제 매수가 실행되었을 때
manager.add_buy_history(
    card_id='prod_card_15m_20241223_120000_1234',
    qty=0.001,  # BTC 수량
    entry_price=50000000,  # 진입 가격 (KRW)
    nb_id='nb_15m_0.5',  # 선택사항 (없으면 자동으로 최근 것 사용)
    generation=None,  # 선택사항 (없으면 자동으로 +1)
    memo='추가 매수'
)
```

### 3. 판매 완료 히스토리 추가

```python
# 판매가 완료되었을 때
exit_price = 51000000  # 청산 가격
entry_price = 50000000  # 진입 가격
pnl_percent = ((exit_price - entry_price) / entry_price) * 100  # 손익률

manager.add_sold_history(
    card_id='prod_card_15m_20241223_120000_1234',
    exit_price=exit_price,
    pnl_percent=pnl_percent,
    qty=0.001,  # 선택사항 (없으면 가장 최근 BUY의 qty 사용)
    memo='판매 완료'
)
```

### 4. 취소 히스토리 추가 (매수 실패 시)

```python
# 매수가 실패했을 때
manager.add_cancel_history(
    card_id='prod_card_15m_20241223_120000_1234',
    memo='매수 주문 실패: 잔액 부족'
)
```

### 5. 히스토리 조회

```python
# 카드의 모든 히스토리 조회 (최신순)
history_list = manager.get_card_history('prod_card_15m_20241223_120000_1234')

for hist in history_list:
    print(f"{hist['created_at']} - {hist['type']}: {hist.get('memo', '')}")
```

## 자동 처리 규칙

### 1. nb_id 자동 연결
- 히스토리 추가 시 `nb_id`가 없으면, 가장 최근 NEW 또는 BUY의 `nb_id`를 자동으로 사용합니다.

### 2. generation 자동 증가
- `add_buy_history()`에서 `generation`이 없으면, 가장 최근 generation + 1로 자동 설정됩니다.

### 3. qty 자동 연결
- `add_sold_history()`에서 `qty`가 없으면, 가장 최근 BUY의 `qty`를 자동으로 사용합니다.

### 4. 100개 제한
- 히스토리가 100개를 초과하면 가장 오래된 항목이 자동으로 제거됩니다.
- 새 히스토리는 항상 맨 앞에 추가되므로, 조회 시 최신순으로 반환됩니다.

## 실제 매수/매도와 연동

현재 시스템에서 실제 매수/매도가 발생할 때 히스토리를 추가하려면:

### 매수 완료 시

```python
def _on_buy_order_completed(self, amount_krw: float, purchase_amount: float):
    """매수 주문 완료 후 처리"""
    # ... 기존 코드 ...
    
    # 생산 카드에 매수 히스토리 추가 (해당 카드 ID가 있다면)
    # card_id = ...  # 매수와 연결된 카드 ID
    # if card_id:
    #     from utils import get_btc_price
    #     current_price = get_btc_price()
    #     self.production_card_manager.add_buy_history(
    #         card_id=card_id,
    #         qty=purchase_amount,
    #         entry_price=current_price,
    #         memo=f'매수 완료: {amount_krw:,.0f} KRW'
    #     )
```

### 매도 완료 시

```python
def _on_sell_order_completed(self, item_id: str, current_price: float):
    """매도 주문 완료 후 처리"""
    # ... 기존 코드 ...
    
    # 생산 카드에 판매 완료 히스토리 추가 (해당 카드 ID가 있다면)
    # card_id = ...  # 매도와 연결된 카드 ID
    # if card_id:
    #     # 손익률 계산
    #     entry_price = ...  # 진입 가격
    #     pnl_percent = ((current_price - entry_price) / entry_price) * 100
    #     
    #     self.production_card_manager.add_sold_history(
    #         card_id=card_id,
    #         exit_price=current_price,
    #         pnl_percent=pnl_percent,
    #         memo=f'판매 완료: {item_id}'
    #     )
```

## 저장 구조

JSON 파일 구조:

```json
{
  "cards": [
    {
      "card_id": "prod_card_15m_20241223_120000_1234",
      "timeframe": "15m",
      "nb_value": 0.5,
      "card_type": "normal",
      "status": "active",
      "production_time": "2024-12-23T12:00:00",
      "chart_data": {...},
      "history_list": [
        {
          "history_id": "uuid-1",
          "created_at": "2024-12-23T12:00:00",
          "type": "NEW",
          "nb_id": "nb_15m_0.5",
          "generation": 1,
          "qty": 0.0,
          "entry_price": 0.0,
          "exit_price": 0.0,
          "pnl_percent": 0.0,
          "memo": "카드 생성"
        },
        {
          "history_id": "uuid-2",
          "created_at": "2024-12-23T12:05:00",
          "type": "BUY",
          "nb_id": "nb_15m_0.5",
          "generation": 2,
          "qty": 0.001,
          "entry_price": 50000000,
          "exit_price": 0.0,
          "pnl_percent": 0.0,
          "memo": "추가 매수"
        }
      ]
    }
  ],
  "last_updated": "2024-12-23T12:00:00",
  "max_cards": 25,
  "total_cards": 1
}
```

## 주의사항

1. **히스토리는 최신순**: `history_list`는 항상 최신 항목이 맨 앞에 있습니다.
2. **자동 저장**: 히스토리 추가 시 자동으로 JSON 파일에 저장됩니다.
3. **100개 제한**: 히스토리가 100개를 초과하면 자동으로 제거됩니다.
4. **카드당 독립적**: 각 카드는 독립적인 히스토리 리스트를 가집니다.

