"""
강화학습 리워드 기록 워커 모듈 (백그라운드 실행)
"""
from PyQt6.QtCore import QThread, pyqtSignal
from typing import Dict, Any, Optional
import numpy as np


class RLRewardWorker(QThread):
    """강화학습 리워드 계산 및 기록 워커 (백그라운드 실행)"""
    
    reward_recorded = pyqtSignal(str, float)  # 리워드 기록 완료 시그널 (card_id, reward)
    error_occurred = pyqtSignal(str)  # 오류 발생 시그널
    
    def __init__(self, rl_system, card: Dict[str, Any], action_name: str,
                 pnl_percent: float, pnl_amount: float,
                 current_price: float, entry_price: float,
                 qty: float, fee_amount: float, is_simulation: bool = False):
        """
        Args:
            rl_system: RLSystem 인스턴스
            card: 카드 데이터
            action_name: 행동 이름 (SELL, FREEZE, DELETE)
            pnl_percent: 손익률 (%)
            pnl_amount: 손익 금액
            current_price: 현재 가격
            entry_price: 진입 가격
            qty: 수량
            fee_amount: 수수료
            is_simulation: 모의전(시뮬레이션) 여부 (True: 모의전, False: 실제 거래)
        """
        super().__init__()
        self.rl_system = rl_system
        self.card = card
        self.action_name = action_name
        self.pnl_percent = pnl_percent
        self.pnl_amount = pnl_amount
        self.current_price = current_price
        self.entry_price = entry_price
        self.qty = qty
        self.fee_amount = fee_amount
        self.is_simulation = is_simulation
    
    def run(self):
        """백그라운드에서 리워드 계산 및 기록"""
        try:
            # ActionType 매핑
            from ai.policy_model import ActionType
            action_map = {
                'BUY': ActionType.BUY,
                'SELL': ActionType.SELL,
                'FREEZE': ActionType.FREEZE,
                'DELETE': ActionType.DELETE,
                'HOLD': ActionType.HOLD
            }
            action = action_map.get(self.action_name, ActionType.HOLD)
            
            # 행동 결과 구성
            action_result = {
                'success': True,
                'pnl_percent': self.pnl_percent,
                'pnl_amount': self.pnl_amount,
                'transaction_cost': self.fee_amount,
                'drawdown': abs(min(0, self.pnl_percent)) / 100.0,  # 최대 낙폭 (음수 손익만)
                'volatility': 0.0,  # 변동성 (추후 계산 가능)
                'base_pred_return': base_output.get('pred_return', 0.0) if base_output else 0.0  # Base Model 예측 수익률
            }
            
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
                base_output = self.rl_system.base_model.predict(self.card, self.current_price)
                emotion_output = self.rl_system.emotion_model.encode(base_output, self.card)
                state = self.rl_system.policy_model.build_state(base_output, emotion_output, self.card)
            
            # action_result에 base_pred_return 추가 (위에서 base_output을 가져온 후)
            action_result['base_pred_return'] = base_output.get('pred_return', 0.0) if base_output else 0.0
            
            # 이전 상태 가져오기 (FREEZE 보상 계산용 + 점수 상승 보상용 + Zone 보상용)
            previous_state = None
            history_list = self.card.get('history_list', [])
            if len(history_list) > 1:
                prev_hist = history_list[1]  # 두 번째 최근 히스토리
                # Zone 정보 추출
                zone = (self.card.get('zone') or 
                       self.card.get('analysis_details', {}).get('zone') or 
                       self.card.get('zone_analysis', {}).get('zone'))
                r_value = (self.card.get('r_value') or 
                          self.card.get('analysis_details', {}).get('r_value') or 
                          self.card.get('zone_analysis', {}).get('r_value') or 
                          0.5)
                
                previous_state = {
                    'pnl_percent': prev_hist.get('pnl_percent', 0),
                    'score': self.card.get('score', 100.0),  # 현재 점수 (이전 점수는 히스토리에서 가져와야 함)
                    'rank': self.card.get('rank', 'C'),  # 현재 랭크
                    'zone': zone,  # Zone 정보 추가
                    'analysis_details': {  # Zone 정보를 analysis_details에도 포함
                        'zone': zone,
                        'r_value': r_value
                    },
                    'zone_analysis': {  # zone_analysis에도 포함
                        'zone': zone,
                        'r_value': r_value
                    }
                }
            
            # 카드의 이전 점수 추정 (히스토리에서)
            # 실제로는 카드의 점수 변화를 추적해야 하지만, 여기서는 간단히 처리
            # 점수는 SELL 성공 시 증가하므로, 이전 점수를 추정
            if previous_state and self.action_name == 'SELL':
                # SELL 성공 시 점수 증가 (간단한 추정)
                pnl_percent = self.pnl_percent
                if pnl_percent > 0:
                    # 수익 실현 시 점수 증가
                    score_increase = min(20.0, pnl_percent * 2)  # 최대 20점 증가
                    previous_state['score'] = max(0.0, self.card.get('score', 100.0) - score_increase)
                    
                    # 랭크도 추정
                    from managers.production_card_manager import ProductionCardManager
                    temp_manager = ProductionCardManager()
                    previous_state['rank'] = temp_manager._calculate_rank_from_score(previous_state['score'])
            
            # 리워드 계산
            reward = self.rl_system.reward_calculator.calculate_reward(
                action=action.value,
                action_result=action_result,
                base_output=base_output,
                card=self.card,
                previous_state=previous_state
            )
            
            # 상태 벡터 사용 (이미 계산된 state 사용, 없으면 새로 생성)
            if state is None or not isinstance(state, np.ndarray):
                state_dim = 32
                state = np.zeros(state_dim, dtype=np.float32)
                # 간단한 상태 표현
                state[0] = self.pnl_percent / 100.0  # 손익률 정규화
                state[1] = base_output.get('pred_return', 0.0)
                state[2] = base_output.get('confidence', 0.5)
            
            # 다음 상태 (카드가 제거되므로 done=True)
            state_dim = len(state) if isinstance(state, np.ndarray) else 32
            next_state = np.zeros(state_dim, dtype=np.float32)
            done = True  # SELL/DELETE 후 카드 제거
            
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
            
            # 점수 계산 및 업데이트 (SELL/DELETE/FREEZE 완료 시)
            if self.action_name in ['SELL', 'DELETE', 'FREEZE']:
                # 손익률 기반 점수 계산
                from managers.production_card_manager import ProductionCardManager
                temp_manager = ProductionCardManager()
                calculated_score = temp_manager._calculate_loss_rate_score(self.pnl_percent)
                
                # 카드 점수 업데이트
                self.card['score'] = calculated_score
                self.card['rank'] = temp_manager._calculate_rank_from_score(calculated_score)
                
                # ProductionCardManager에 점수 업데이트 반영
                if hasattr(self.rl_system, 'production_card_manager') and self.rl_system.production_card_manager:
                    card_id = self.card.get('card_id', '')
                    updated_card = self.rl_system.production_card_manager.get_card_by_id(card_id)
                    if updated_card:
                        updated_card['score'] = calculated_score
                        updated_card['rank'] = temp_manager._calculate_rank_from_score(calculated_score)
                        # NBverse에 업데이트
                        self.rl_system.production_card_manager._update_card_in_nbverse(updated_card)
            
            card_id = self.card.get('card_id', '')
            print(f"🧠 [RL 리워드 기록 완료] 카드 {card_id}, 행동: {self.action_name}, 리워드: {reward:.4f}, 손익: {self.pnl_percent:.2f}%, 점수: {self.card.get('score', 100.0):.1f}")
            
            self.reward_recorded.emit(card_id, reward)
            
        except Exception as e:
            error_msg = f"RL 리워드 기록 오류: {str(e)}"
            print(f"⚠️ {error_msg}")
            import traceback
            traceback.print_exc()
            self.error_occurred.emit(error_msg)

