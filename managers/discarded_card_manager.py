"""
폐기된 카드 관리 모듈

폐기된 카드를 일정 시간 동안 보관하고 관리
"""
import os
import json
from datetime import datetime, timedelta
from typing import List, Dict, Optional
from enum import Enum


class DiscardReason(str, Enum):
    """폐기 사유"""
    RL_DELETE = "RL_DELETE"  # 강화학습 AI DELETE
    MANUAL = "MANUAL"  # 수동 폐기
    AUTO_CLEANUP = "AUTO_CLEANUP"  # 자동 정리


class DiscardedCardManager:
    """
    폐기된 카드 관리 클래스
    
    폐기된 카드를 일정 시간 동안 보관하고 관리
    """
    
    def __init__(self, data_dir: str = "data/discarded_cards", retention_days: int = 7):
        """
        Args:
            data_dir: 폐기된 카드 저장 디렉토리
            retention_days: 보관 기간 (일) - 기본 7일
        """
        self.data_dir = data_dir
        self.retention_days = retention_days
        os.makedirs(self.data_dir, exist_ok=True)
        
        # 메타데이터 파일
        self.metadata_file = os.path.join(self.data_dir, "discarded_metadata.json")
        self._load_metadata()
    
    def _load_metadata(self):
        """메타데이터 로드"""
        if os.path.exists(self.metadata_file):
            try:
                with open(self.metadata_file, 'r', encoding='utf-8') as f:
                    self.metadata = json.load(f)
            except:
                self.metadata = {'cards': []}
        else:
            self.metadata = {'cards': []}
    
    def _save_metadata(self, background: bool = True):
        """
        메타데이터 저장
        
        Args:
            background: True이면 백그라운드 스레드에서 실행 (기본값: True)
        """
        if background:
            # 백그라운드 스레드에서 실행
            import threading
            
            def save_in_background():
                try:
                    with open(self.metadata_file, 'w', encoding='utf-8') as f:
                        json.dump(self.metadata, f, indent=2, ensure_ascii=False)
                except Exception as e:
                    print(f"⚠️ 폐기 카드 메타데이터 저장 오류: {e}")
            
            thread = threading.Thread(target=save_in_background, daemon=True)
            thread.start()
        else:
            # 동기 실행
            try:
                with open(self.metadata_file, 'w', encoding='utf-8') as f:
                    json.dump(self.metadata, f, indent=2, ensure_ascii=False)
            except Exception as e:
                print(f"⚠️ 폐기 카드 메타데이터 저장 오류: {e}")
    
    def discard_card(self, card: Dict, reason: DiscardReason = DiscardReason.RL_DELETE,
                    reason_detail: str = "") -> bool:
        """
        카드 폐기
        
        Args:
            card: 카드 데이터
            reason: 폐기 사유
            reason_detail: 폐기 사유 상세
        
        Returns:
            폐기 성공 여부
        """
        try:
            card_id = card.get('card_id', '')
            if not card_id:
                return False
            
            # 폐기 시간 기록
            discarded_at = datetime.now().isoformat()
            expiry_at = (datetime.now() + timedelta(days=self.retention_days)).isoformat()
            
            # 폐기된 카드 데이터 구성
            discarded_card = {
                **card,
                'discarded_at': discarded_at,
                'expiry_at': expiry_at,
                'discard_reason': reason.value,
                'reason_detail': reason_detail,
                'original_state': card.get('card_state', 'ACTIVE')
            }
            
            # 메타데이터에 추가
            self.metadata['cards'].append({
                'card_id': card_id,
                'discarded_at': discarded_at,
                'expiry_at': expiry_at,
                'reason': reason.value,
                'reason_detail': reason_detail
            })
            
            # 카드 파일 저장 및 메타데이터 저장 (백그라운드 실행)
            import threading
            
            def save_in_background():
                try:
                    # 카드 파일 저장
                    card_file = os.path.join(self.data_dir, f"{card_id}.json")
                    with open(card_file, 'w', encoding='utf-8') as f:
                        json.dump(discarded_card, f, indent=2, ensure_ascii=False)
                    
                    # 메타데이터 저장
                    self._save_metadata(background=False)  # 동기 실행 (이미 백그라운드 내부)
                    
                    print(f"✅ 카드 폐기 완료: {card_id} (사유: {reason.value})")
                except Exception as e:
                    print(f"⚠️ 카드 폐기 저장 오류: {e}")
            
            thread = threading.Thread(target=save_in_background, daemon=True)
            thread.start()
            
            return True
            
        except Exception as e:
            print(f"⚠️ 카드 폐기 오류: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def get_all_discarded_cards(self) -> List[Dict]:
        """모든 폐기된 카드 조회"""
        try:
            cards = []
            
            # 메타데이터에서 카드 ID 목록 가져오기
            for card_info in self.metadata.get('cards', []):
                card_id = card_info.get('card_id')
                if not card_id:
                    continue
                
                card_file = os.path.join(self.data_dir, f"{card_id}.json")
                if os.path.exists(card_file):
                    try:
                        with open(card_file, 'r', encoding='utf-8') as f:
                            card = json.load(f)
                            cards.append(card)
                    except Exception as e:
                        print(f"⚠️ 폐기 카드 로드 오류 ({card_id}): {e}")
            
            # 폐기 시간 기준 정렬 (최신순)
            cards.sort(key=lambda x: x.get('discarded_at', ''), reverse=True)
            
            return cards
            
        except Exception as e:
            print(f"⚠️ 폐기 카드 목록 조회 오류: {e}")
            return []
    
    def cleanup_expired_cards(self) -> int:
        """
        만료된 카드 정리
        
        Returns:
            정리된 카드 수
        """
        try:
            cleaned_count = 0
            now = datetime.now()
            
            # 만료된 카드 찾기
            expired_cards = []
            for card_info in self.metadata.get('cards', []):
                expiry_at_str = card_info.get('expiry_at')
                if not expiry_at_str:
                    continue
                
                try:
                    expiry_at = datetime.fromisoformat(expiry_at_str)
                    if now > expiry_at:
                        expired_cards.append(card_info)
                except:
                    continue
            
            # 만료된 카드 삭제 (백그라운드 실행)
            import threading
            
            def cleanup_in_background():
                try:
                    cleaned = 0
                    for card_info in expired_cards:
                        card_id = card_info.get('card_id')
                        if not card_id:
                            continue
                        
                        # 카드 파일 삭제
                        card_file = os.path.join(self.data_dir, f"{card_id}.json")
                        if os.path.exists(card_file):
                            try:
                                os.remove(card_file)
                            except:
                                pass
                        
                        # 메타데이터에서 제거
                        self.metadata['cards'] = [
                            c for c in self.metadata['cards'] 
                            if c.get('card_id') != card_id
                        ]
                        cleaned += 1
                    
                    if cleaned > 0:
                        self._save_metadata(background=False)  # 동기 실행 (이미 백그라운드 내부)
                        print(f"✅ 만료된 폐기 카드 {cleaned}개 정리 완료")
                except Exception as e:
                    print(f"⚠️ 만료 카드 정리 오류: {e}")
            
            thread = threading.Thread(target=cleanup_in_background, daemon=True)
            thread.start()
            
            return len(expired_cards)  # 예상 정리 개수 반환
            
        except Exception as e:
            print(f"⚠️ 만료 카드 정리 오류: {e}")
            return 0
    
    def restore_card(self, card_id: str) -> Optional[Dict]:
        """
        폐기된 카드 복구
        
        Args:
            card_id: 카드 ID
        
        Returns:
            복구된 카드 데이터 (None이면 실패)
        """
        try:
            card_file = os.path.join(self.data_dir, f"{card_id}.json")
            if not os.path.exists(card_file):
                return None
            
            # 카드 데이터 로드
            with open(card_file, 'r', encoding='utf-8') as f:
                card = json.load(f)
            
            # 폐기 관련 필드 제거
            card.pop('discarded_at', None)
            card.pop('expiry_at', None)
            card.pop('discard_reason', None)
            card.pop('reason_detail', None)
            
            # 원래 상태 복구
            original_state = card.pop('original_state', 'ACTIVE')
            card['card_state'] = original_state
            card['status'] = original_state
            
            # 메타데이터에서 제거
            self.metadata['cards'] = [
                c for c in self.metadata['cards'] 
                if c.get('card_id') != card_id
            ]
            
            # 카드 파일 삭제 및 메타데이터 저장 (백그라운드 실행)
            import threading
            
            def cleanup_in_background():
                try:
                    # 카드 파일 삭제
                    if os.path.exists(card_file):
                        os.remove(card_file)
                    
                    # 메타데이터 저장
                    self._save_metadata(background=False)  # 동기 실행 (이미 백그라운드 내부)
                    
                    print(f"✅ 폐기 카드 복구 완료: {card_id}")
                except Exception as e:
                    print(f"⚠️ 폐기 카드 복구 저장 오류: {e}")
            
            thread = threading.Thread(target=cleanup_in_background, daemon=True)
            thread.start()
            
            return card
            
        except Exception as e:
            print(f"⚠️ 폐기 카드 복구 오류: {e}")
            return None
    
    def get_card_info(self, card_id: str) -> Optional[Dict]:
        """폐기된 카드 정보 조회"""
        try:
            card_file = os.path.join(self.data_dir, f"{card_id}.json")
            if not os.path.exists(card_file):
                return None
            
            with open(card_file, 'r', encoding='utf-8') as f:
                return json.load(f)
        except:
            return None

