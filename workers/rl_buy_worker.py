"""
강화학습 매수 기록 워커 모듈 (백그라운드 실행)
"""
from PyQt6.QtCore import QThread, pyqtSignal
from typing import Dict, Any
import numpy as np


class RLBuyWorker(QThread):
    """강화학습 매수 기록 워커 (백그라운드 실행)"""
    
    buy_recorded = pyqtSignal(str)  # 매수 기록 완료 시그널 (card_id)
    error_occurred = pyqtSignal(str)  # 오류 발생 시그널
    
    def __init__(self, rl_system, card: Dict[str, Any], entry_price: float,
                 amount_krw: float, purchase_amount: float,
                 fee_amount: float, is_simulation: bool = False):
        """
        Args:
            rl_system: RLSystem 인스턴스
            card: 카드 데이터
            entry_price: 진입 가격
            amount_krw: 매수 금액 (KRW)
            purchase_amount: 매수 수량 (BTC)
            fee_amount: 수수료
            is_simulation: 모의전(시뮬레이션) 여부 (True: 모의전, False: 실제 거래)
        """
        super().__init__()
        self.rl_system = rl_system
        self.card = card
        self.entry_price = entry_price
        self.amount_krw = amount_krw
        self.purchase_amount = purchase_amount
        self.fee_amount = fee_amount
        self.is_simulation = is_simulation
    
    def run(self):
        """백그라운드에서 매수 학습 데이터 기록"""
        try:
            # ActionType 매핑
            from ai.policy_model import ActionType
            action = ActionType.BUY
            
            # Base Model 출력 가져오기 (실제 AI 시그널 사용)
            # 1. 캐시에서 가져오기 시도
            card_id = self.card.get('card_id', '')
            cached_decision = self.rl_system.card_decision_cache.get(card_id) if hasattr(self.rl_system, 'card_decision_cache') else None
            
            if cached_decision:
                base_output = cached_decision.get('base_output', {})
                emotion_output = cached_decision.get('emotion_output', {})
                state = cached_decision.get('state')
            else:
                # 2. 캐시에 없으면 실제 Base Model 예측 수행
                base_output = self.rl_system.base_model.predict(self.card, self.entry_price)
                emotion_output = self.rl_system.emotion_model.encode(base_output, self.card)
                state = self.rl_system.policy_model.build_state(base_output, emotion_output, self.card)
            
            # 상태 벡터 사용 (이미 계산된 state 사용, 없으면 새로 생성)
            if state is None or not isinstance(state, np.ndarray):
                state_dim = 32
                state = np.zeros(state_dim, dtype=np.float32)
                # 간단한 상태 표현
                state[0] = 0.0  # 매수 시점이므로 손익률 0
                state[1] = base_output.get('pred_return', 0.0)
                state[2] = base_output.get('confidence', 0.5)
            
            # 다음 상태 (매수 후 포지션 보유 중이므로 done=False)
            state_dim = len(state) if isinstance(state, np.ndarray) else 32
            next_state = state.copy() if isinstance(state, np.ndarray) else np.zeros(state_dim, dtype=np.float32)
            # 매수 후 상태 업데이트 (보유 중 플래그 등)
            done = False  # 매수 후에는 포지션이 열려있으므로 종료 상태 아님
            
            # 매수 시 보상 (매수 자체는 손익이 없으므로 작은 보상 또는 0)
            # 진입 타이밍에 대한 작은 보상 가능 (Base Model confidence 기반)
            confidence = base_output.get('confidence', 0.5)
            pred_return = base_output.get('pred_return', 0.0)
            # 매수 시 보상: confidence와 예측 수익률을 기반으로 작은 보상
            # confidence가 높고 예측 수익률이 양수면 작은 보상, 아니면 0 또는 작은 음수
            if confidence > 0.5 and pred_return > 0:
                reward = 0.01 * confidence * min(pred_return, 0.1)  # 최대 0.001 정도의 작은 보상
            elif confidence > 0.3:
                reward = 0.0  # 중립
            else:
                reward = -0.001  # 낮은 confidence는 작은 페널티
            
            # 기본 AI 분석 데이터 추출 (Zone 분석)
            zone = (self.card.get('zone') or 
                   self.card.get('analysis_details', {}).get('zone') or 
                   self.card.get('zone_analysis', {}).get('zone'))
            r_value = (self.card.get('r_value') or 
                      self.card.get('analysis_details', {}).get('r_value') or 
                      self.card.get('zone_analysis', {}).get('r_value') or 
                      0.5)
            zone_message = (self.card.get('zone_message') or 
                           self.card.get('analysis_details', {}).get('zone_message') or 
                           self.card.get('zone_analysis', {}).get('zone_message') or 
                           '')
            
            basic_ai_output = {
                'zone': zone,
                'r_value': r_value,
                'zone_message': zone_message
            }
            
            # 경험 기록 (카드 전체 데이터와 AI 시그널 포함)
            self.rl_system.record_experience(
                state=state,
                action=action.value,
                reward=reward,
                next_state=next_state,
                done=done,
                card=self.card,  # 카드 전체 데이터
                base_output=base_output,  # AI 시그널 (Base Model 출력)
                emotion_output=emotion_output,  # Emotion Model 출력
                basic_ai_output=basic_ai_output,  # 기본 AI 분석 출력 (Zone 분석)
                is_simulation=self.is_simulation  # 모의전(시뮬레이션) 여부
            )
            
            print(f"🧠 [RL 매수 기록 완료] 카드 {card_id}, 행동: BUY, 리워드: {reward:.4f}, 진입가: {self.entry_price:,.0f} KRW")
            
            self.buy_recorded.emit(card_id)
            
        except Exception as e:
            error_msg = f"RL 매수 기록 오류: {str(e)}"
            print(f"⚠️ {error_msg}")
            import traceback
            traceback.print_exc()
            self.error_occurred.emit(error_msg)

