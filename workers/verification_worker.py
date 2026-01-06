"""
검증 카드 로드 워커 모듈 (백그라운드 실행)
"""
from PyQt6.QtCore import QThread, pyqtSignal
from typing import List, Dict


class VerificationCardLoadWorker(QThread):
    """검증 카드 로드 워커 (백그라운드 실행)"""
    
    cards_ready = pyqtSignal(list)  # 검증 카드 데이터 준비 시그널
    error_occurred = pyqtSignal(str)  # 오류 발생 시그널
    
    def __init__(self, production_card_manager, discarded_card_manager=None):
        """
        Args:
            production_card_manager: ProductionCardManager 인스턴스
            discarded_card_manager: DiscardedCardManager 인스턴스 (폐기된 카드 포함용)
        """
        super().__init__()
        self.production_card_manager = production_card_manager
        self.discarded_card_manager = discarded_card_manager
    
    def run(self):
        """백그라운드에서 검증 카드 로드"""
        try:
            if not self.production_card_manager:
                self.cards_ready.emit([])
                return
            
            # 모든 카드 가져오기 (REMOVED 포함 - 검증 완료된 카드 포함)
            # get_all_cards()는 REMOVED를 제외하므로, 캐시에서 직접 가져오기
            from managers.production_card_manager import CardState
            
            # 캐시에서 모든 카드 가져오기 (REMOVED 포함)
            all_cards = []
            if hasattr(self.production_card_manager, 'cards_cache'):
                all_cards = list(self.production_card_manager.cards_cache)
            else:
                # 캐시가 없으면 get_all_cards() 사용 (REMOVED 제외)
                all_cards = self.production_card_manager.get_all_cards()
            
            # 폐기된 카드도 가져오기 (REMOVED 상태인 카드 포함)
            discarded_cards = []
            if self.discarded_card_manager:
                try:
                    discarded_cards = self.discarded_card_manager.get_all_discarded_cards()
                    print(f"  📊 폐기된 카드 {len(discarded_cards)}개 검증 카드에 포함")
                except Exception as e:
                    print(f"  ⚠️ 폐기된 카드 로드 오류: {e}")
            
            # 모든 카드 통합 (중복 제거)
            all_verification_cards = {}
            for card in all_cards:
                card_id = card.get('card_id', '')
                if card_id:
                    all_verification_cards[card_id] = card
            
            # 폐기된 카드 추가 (덮어쓰기 가능 - 최신 데이터 우선)
            for card in discarded_cards:
                card_id = card.get('card_id', '')
                if card_id:
                    all_verification_cards[card_id] = card
            
            print(f"  📊 전체 카드 {len(all_verification_cards)}개 (REMOVED 포함)")
            
            # 검증 카드 필터링 (BUY/SELL 완료된 카드만 - BUY와 SOLD 히스토리가 모두 있는 카드)
            verification_cards = []
            for card in all_verification_cards.values():
                history_list = card.get('history_list', [])
                
                # BUY 히스토리 확인
                has_buy = any(hist.get('type') in ['NEW', 'BUY'] for hist in history_list)
                
                # SOLD 히스토리 확인
                has_sold = any(hist.get('type') == 'SOLD' for hist in history_list)
                
                # BUY와 SOLD가 모두 있으면 검증 완료 카드로 포함
                if has_buy and has_sold:
                    verification_cards.append(card)
            
            # 최신순으로 정렬 (SOLD 히스토리의 시간 기준)
            def get_sold_time(card):
                history_list = card.get('history_list', [])
                for hist in reversed(history_list):
                    if hist.get('type') == 'SOLD':
                        timestamp = hist.get('timestamp', '')
                        return timestamp
                return ''
            
            verification_cards.sort(key=get_sold_time, reverse=True)
            
            # 전체 검증 카드 반환 (통계 계산용)
            # UI 표시는 _on_verification_cards_loaded에서 최신 5장만 제한
            # 검증 카드 데이터 준비 완료 시그널 발생
            self.cards_ready.emit(verification_cards)
            
        except Exception as e:
            error_msg = f"검증 카드 로드 오류: {str(e)}"
            print(f"⚠️ {error_msg}")
            import traceback
            traceback.print_exc()
            self.error_occurred.emit(error_msg)

