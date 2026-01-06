"""
검증 차트 데이터 계산 워커 모듈 (백그라운드 실행)
"""
from PyQt6.QtCore import QThread, pyqtSignal
from typing import List, Dict


class VerificationChartWorker(QThread):
    """검증 차트 데이터 계산 워커 (백그라운드 실행)"""
    
    chart_data_ready = pyqtSignal(dict)  # 차트 데이터 준비 시그널
    error_occurred = pyqtSignal(str)  # 오류 발생 시그널
    
    def __init__(self, verification_cards: List[Dict]):
        """
        Args:
            verification_cards: 검증 완료된 카드 리스트
        """
        super().__init__()
        self.verification_cards = verification_cards
    
    def run(self):
        """백그라운드에서 차트 데이터 계산"""
        try:
            if not self.verification_cards:
                self.chart_data_ready.emit({
                    'pnl_data': [],
                    'winrate_data': [],
                    'buy_count': 0,
                    'sell_count': 0,
                    'discard_count': 0
                })
                return
            
            # 손익률 추이 데이터 (시간순)
            pnl_data = []
            # 승률 추이 데이터 (누적)
            winrate_data = []
            
            total_buy = 0
            total_sell = 0
            total_discard = 0
            wins = 0
            total_trades = 0
            total_loss_rate_score = 0.0  # 손실률 기반 점수 누적
            score_count = 0  # 점수 계산된 카드 수
            
            # 시간순으로 정렬된 카드 처리
            sorted_cards = sorted(
                self.verification_cards,
                key=lambda c: self._get_sold_time(c)
            )
            
            for card in sorted_cards:
                history_list = card.get('history_list', [])
                
                # 카드당 폐기 여부 추적 (중복 카운트 방지)
                card_discarded = False
                card_has_sold = False
                card_pnl_percent = 0
                card_pnl_amount = 0
                
                # BUY/SELL/폐기 횟수 계산
                for hist in history_list:
                    hist_type = hist.get('type', '')
                    memo = hist.get('memo', '')
                    
                    if hist_type in ['NEW', 'BUY']:
                        total_buy += 1
                    elif hist_type == 'SOLD':
                        total_sell += 1
                        total_trades += 1
                        card_has_sold = True
                        
                        # 손익률 데이터 저장
                        card_pnl_percent = hist.get('pnl_percent', 0)
                        card_pnl_amount = hist.get('pnl_amount', 0)
                        
                        # 손익률 데이터 추가
                        pnl_data.append(card_pnl_percent)
                        
                        # 손실률 기반 점수 계산 및 누적
                        loss_rate_score = self._calculate_loss_rate_score(card_pnl_percent)
                        total_loss_rate_score += loss_rate_score
                        score_count += 1
                        
                        # 승/패 카운트
                        if card_pnl_amount > 0:
                            wins += 1
                    
                    # 폐기 판정 확인 (FREEZE/DELETE 판정이 있으면 카운트)
                    if not card_discarded and ('폐기' in memo and ('FREEZE' in memo or 'DELETE' in memo)):
                        total_discard += 1
                        card_discarded = True  # 카드당 1회만 카운트
                        
                        # 폐기된 카드 중 SOLD 히스토리가 없으면 손익률 0으로 추가
                        if not card_has_sold:
                            # 폐기 전 마지막 BUY 히스토리에서 손익률 계산 시도
                            for buy_hist in reversed(history_list):
                                if buy_hist.get('type') in ['NEW', 'BUY']:
                                    # BUY 히스토리가 있으면 손익률 0으로 처리 (매도 전 폐기)
                                    pnl_data.append(0.0)
                                    total_trades += 1
                                    break
                
                # 누적 승률 계산
                if total_trades > 0:
                    current_winrate = (wins / total_trades) * 100
                    winrate_data.append(current_winrate)
            
            # 랭크별 통계 계산
            rank_stats = self._calculate_rank_stats(sorted_cards)
            
            # 평균 손실률 기반 점수 계산
            avg_loss_rate_score = total_loss_rate_score / score_count if score_count > 0 else 0.0
            
            # 차트 데이터 준비 완료 시그널 발생
            self.chart_data_ready.emit({
                'pnl_data': pnl_data,
                'winrate_data': winrate_data,
                'buy_count': total_buy,
                'sell_count': total_sell,
                'discard_count': total_discard,
                'rank_stats': rank_stats,
                'avg_loss_rate_score': avg_loss_rate_score,
                'total_loss_rate_score': total_loss_rate_score,
                'score_count': score_count
            })
            
        except Exception as e:
            error_msg = f"검증 차트 데이터 계산 오류: {str(e)}"
            print(f"⚠️ {error_msg}")
            import traceback
            traceback.print_exc()
            self.error_occurred.emit(error_msg)
    
    def _get_sold_time(self, card):
        """카드의 SOLD 시간 가져오기"""
        history_list = card.get('history_list', [])
        for hist in reversed(history_list):
            if hist.get('type') == 'SOLD':
                timestamp = hist.get('timestamp', '')
                return timestamp
        return ''
    
    def _calculate_rank_stats(self, cards: List[Dict]) -> Dict[str, int]:
        """랭크별 통계 계산"""
        rank_stats = {
            'F': 0, 'E': 0, 'D': 0, 'C': 0, 'B': 0,
            'A': 0, 'S': 0, '+S': 0, '++S': 0, '+SS': 0
        }
        
        for card in cards:
            rank = card.get('rank', 'C')
            if rank in rank_stats:
                rank_stats[rank] += 1
        
        return rank_stats
    
    def _calculate_loss_rate_score(self, pnl_percent: float) -> float:
        """손실률 기반 점수 계산
        
        Args:
            pnl_percent: 손익률 (%)
            
        Returns:
            점수 (0-100)
        """
        try:
            # 손익률에 따른 점수 계산
            # 수익: 50 + (수익률 * 2), 최대 100
            # 손실: 50 - (손실률 * 2), 최소 0
            if pnl_percent > 0:
                # 수익인 경우
                score = 50 + min(pnl_percent * 2, 50)
            elif pnl_percent < 0:
                # 손실인 경우
                score = 50 + max(pnl_percent * 2, -50)
            else:
                # 무승부
                score = 50.0
            
            return max(0.0, min(100.0, score))
        except:
            return 50.0

