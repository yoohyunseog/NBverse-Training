"""생산 카드 관리자 모듈 (카드 생명주기 + 히스토리 기록 + 강화학습 루프 규격)"""
import os
import json
import random
import uuid
import threading
from datetime import datetime
from typing import List, Dict, Optional
from enum import Enum
from functools import lru_cache

# 빠른 JSON 처리를 위한 orjson 사용 (없으면 표준 json 사용)
_USE_ORJSON = False
_ORJSON_AVAILABLE = False

try:
    import orjson
    _ORJSON_AVAILABLE = True
    _USE_ORJSON = True
    print("✅ orjson 사용 가능 - 빠른 JSON 처리 활성화")
except ImportError:
    _ORJSON_AVAILABLE = False
    _USE_ORJSON = False
    print("ℹ️ orjson이 설치되지 않았습니다. 표준 json을 사용합니다. (설치: pip install orjson)")

def _json_loads(data: bytes) -> dict:
    """빠른 JSON 로드 (orjson 우선, 없으면 표준 json) - 빈 파일 및 손상된 파일 처리"""
    try:
        # 빈 데이터 체크
        if not data or len(data) == 0:
            print("⚠️ JSON 데이터가 비어있습니다. 빈 딕셔너리 반환")
            return {}
        
        # 문자열로 변환 (필요한 경우)
        if isinstance(data, bytes):
            data_str = data.decode('utf-8').strip()
        else:
            data_str = str(data).strip()
        
        # 빈 문자열 체크
        if not data_str or len(data_str) == 0:
            print("⚠️ JSON 문자열이 비어있습니다. 빈 딕셔너리 반환")
            return {}
        
        # orjson 사용 시도
        if _USE_ORJSON and _ORJSON_AVAILABLE:
            try:
                return orjson.loads(data)
            except Exception as orjson_error:
                # orjson 실패 시 표준 json으로 fallback
                pass
        
        # 표준 json 사용
        try:
            return json.loads(data_str)
        except json.JSONDecodeError as json_error:
            # JSON 파싱 오류 상세 정보 출력
            error_msg = str(json_error)
            if "Expecting value" in error_msg and "line 1 column 1" in error_msg:
                print(f"⚠️ JSON 파일이 비어있거나 손상되었습니다. 빈 딕셔너리 반환")
                return {}
            else:
                print(f"⚠️ JSON 파싱 오류: {error_msg}")
                # 복구 시도: 빈 딕셔너리 반환
                return {}
    except Exception as e:
        # 모든 오류 처리
        error_msg = str(e)
        if "Expecting value" in error_msg or "line 1 column 1" in error_msg:
            print(f"⚠️ JSON 파일이 비어있거나 손상되었습니다. 빈 딕셔너리 반환")
            return {}
        else:
            print(f"⚠️ JSON 로드 오류: {error_msg}")
            # 복구 시도: 빈 딕셔너리 반환
            return {}

def _json_dumps(data: dict, indent: int = 2) -> bytes:
    """빠른 JSON 덤프 (orjson 우선, 없으면 표준 json)"""
    try:
        if _USE_ORJSON and _ORJSON_AVAILABLE:
            if indent == 2:
                return orjson.dumps(data, option=orjson.OPT_INDENT_2)
            else:
                return orjson.dumps(data)
        else:
            # 표준 json 사용
            result = json.dumps(data, ensure_ascii=False, indent=indent)
            if isinstance(result, str):
                return result.encode('utf-8')
            return result
    except Exception as e:
        # orjson 실패 시 표준 json으로 fallback
        if _USE_ORJSON:
            try:
                result = json.dumps(data, ensure_ascii=False, indent=indent)
                if isinstance(result, str):
                    return result.encode('utf-8')
                return result
            except Exception as e2:
                print(f"⚠️ JSON 저장 오류: {e2}")
                raise
        else:
            print(f"⚠️ JSON 저장 오류: {e}")
            raise


# 카드 상태 머신
class CardState(str, Enum):
    ACTIVE = "ACTIVE"              # AI가 관측하고 의사결정하는 정상 카드
    GRAY = "GRAY"                  # SELL로 청산 완료된 직후 상태
    REMOVED = "REMOVED"            # Active 목록에서 제거되었지만 히스토리는 유지
    OVERLAP_ACTIVE = "OVERLAP_ACTIVE"  # 중첩 조회로 다시 살아난 ACTIVE


# 히스토리 타입
class HistoryType(str, Enum):
    NEW = "NEW"    # 해당 카드 키로 첫 생산(첫 매수)일 때
    BUY = "BUY"    # 두 번째 이후 매수
    SOLD = "SOLD"  # 판매 완료(청산 완료)


class ProductionCardManager:
    """
    생산 카드 관리 클래스 (카드 생명주기 규격 준수)
    
    규격:
    - 카드 상태: ACTIVE, GRAY, REMOVED, OVERLAP_ACTIVE
    - 히스토리: NEW, BUY, SOLD (최대 100개, 최신 우선)
    - card_key 기반 시스템
    - SELL 이후 GRAY 처리 및 다음 생산 시 REMOVED 처리
    - 중첩 카드 재활성 지원
    """
    def __init__(self, nbverse_storage=None, discarded_card_manager=None):
        """
        초기화
        
        Args:
            nbverse_storage: NBverseStorage 인스턴스 (나중에 설정 가능)
            discarded_card_manager: DiscardedCardManager 인스턴스 (자동 폐기용, 선택사항)
        """
        self.nbverse_storage = nbverse_storage
        self.discarded_card_manager = discarded_card_manager
        self.cards_cache = []  # 메모리 캐시
        self.MAX_CARDS = 4  # 기본값: 최대 4개 제한 (설정에서 동적으로 읽어옴)
        self.MAX_HISTORY_PER_CARD = 100  # 카드당 최대 히스토리 100개
        self._cache_dirty = True  # 캐시 무효화 플래그
        self._loading = False  # 로드 중 플래그 (중복 호출 방지)
        self.AUTO_DISCARD_LOSS_THRESHOLD = -10.0  # 자동 폐기 손실률 임계값 (%)
        
        # 설정에서 MAX_CARDS 값 읽어오기
        self._update_max_cards_from_settings()
        
        # 메모리 캐싱 최적화: 빠른 조회를 위한 인덱스
        self._card_id_index = {}  # card_id -> card 매핑 (O(1) 조회)
        self._card_key_index = {}  # card_key -> [cards] 매핑 (O(1) 조회)
        self._index_lock = threading.Lock()  # 인덱스 스레드 안전성
        
        # 임시 저장 파일 경로
        self._cache_file_path = os.path.join("data", "production_cards_cache.json")
        
        # 프로그램 시작 시 임시 저장 파일에서 로드 (백그라운드로 실행)
        self.load(background=True)
    
    def _update_max_cards_from_settings(self):
        """설정에서 MAX_CARDS 값을 읽어와서 업데이트"""
        try:
            from managers.settings_manager import SettingsManager
            settings_manager = SettingsManager()
            production_card_limit = settings_manager.get('production_card_limit', 0)
            
            # 0이면 제한 없음 (매우 큰 값으로 설정)
            if production_card_limit == 0:
                self.MAX_CARDS = 999999  # 제한 없음
            else:
                self.MAX_CARDS = production_card_limit
            
            print(f"✅ 생산 카드 제한 설정: {self.MAX_CARDS}개 (설정값: {production_card_limit})")
        except Exception as e:
            print(f"⚠️ 설정에서 MAX_CARDS 읽기 실패, 기본값 사용: {e}")
            self.MAX_CARDS = 4  # 기본값 유지
    
    def _get_max_cards(self):
        """현재 MAX_CARDS 값을 반환 (설정에서 동적으로 읽어옴)"""
        self._update_max_cards_from_settings()
        return self.MAX_CARDS
    
    @lru_cache(maxsize=1000)  # 최대 1000개 결과 캐싱
    def _generate_card_key(self, timeframe: str, nb_id: str) -> str:
        """
        카드 키 생성 규칙 (lru_cache 적용 - 반복 계산 제거)
        
        Args:
            timeframe: 타임프레임
            nb_id: N/B ID
            
        Returns:
            card_key: "{timeframe}_{nb_id}" 형식
        """
        return f"{timeframe}_{nb_id}"
    
    @lru_cache(maxsize=1000)  # 최대 1000개 결과 캐싱
    def _generate_nb_id(self, timeframe: str, nb_value: float, decimal_places: int = 10) -> str:
        """
        N/B ID 생성 규칙 (lru_cache 적용 - 반복 계산 제거)
        
        Args:
            timeframe: 타임프레임
            nb_value: N/B 값
            decimal_places: 소수점 자리수
            
        Returns:
            nb_id: "nb_{timeframe}_{nb_value}" 형식
        """
        return f"nb_{timeframe}_{round(nb_value, decimal_places)}"
    
    @lru_cache(maxsize=500)  # 최대 500개 결과 캐싱
    def _calculate_rank_from_score(self, score: float) -> str:
        """
        점수에 따른 등급 계산 (lru_cache 적용 - 반복 계산 제거)
        
        Args:
            score: 카드 점수
            
        Returns:
            등급 문자열 (F, E, D, C, B, A, S, +S, ++S, +SS)
        """
        if score < 60:
            return 'F'
        elif score < 80:
            return 'E'
        elif score < 100:
            return 'D'
        elif score < 120:
            return 'C'
        elif score < 140:
            return 'B'
        elif score < 180:
            return 'A'
        elif score < 220:
            return 'S'
        elif score < 260:
            return '+S'
        elif score < 300:
            return '++S'
        else:
            return '+SS'
    
    def _calculate_loss_rate_score(self, pnl_percent: float) -> float:
        """
        손실률 기반 점수 계산
        
        Args:
            pnl_percent: 손익률 (%)
            
        Returns:
            점수 (0-100)
        """
        try:
            # 손익률에 따른 점수 계산
            # 수익: 50 + (수익률 * 2), 최대 100
            # 손실: 50 + (손실률 * 2), 최소 0
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
    
    def load(self, background: bool = False):
        """
        생산 카드 로드 (임시 저장 파일에서 먼저 시도, 없으면 NBverse에서)
        
        Args:
            background: True이면 백그라운드 스레드에서 실행 (기본값: False)
        """
        # 중복 호출 방지
        if self._loading:
            print("ℹ️ 생산 카드 로드가 이미 진행 중입니다. 중복 호출을 건너뜁니다.")
            return
        
        if background:
            # 백그라운드 스레드에서 실행
            import threading
            
            def load_in_background():
                try:
                    self._loading = True
                    self._load_cards()
                finally:
                    self._loading = False
            
            thread = threading.Thread(target=load_in_background, daemon=True)
            thread.start()
        else:
            # 동기 실행
            try:
                self._loading = True
                self._load_cards()
            finally:
                self._loading = False
    
    def _load_cards(self):
        """실제 카드 로드 작업 (내부 메서드) - 임시 저장 파일에서 먼저 시도"""
        try:
            # 먼저 임시 저장 파일에서 로드 시도
            if self._load_cards_from_cache():
                print(f"✅ 생산 카드 로드 완료 (임시 저장 파일): {len(self.cards_cache)}개")
                self._cache_dirty = False
                return
            
            # 임시 저장 파일이 없으면 NBverse에서 로드
            print("ℹ️ 임시 저장 파일이 없어서 NBverse에서 로드합니다.")
            cards = []
            # max와 min 폴더에서 모든 production_card 타입의 카드 검색
            search_dirs = []
            if self.nbverse_storage:
                if hasattr(self.nbverse_storage, 'max_dir') and os.path.exists(self.nbverse_storage.max_dir):
                    search_dirs.append(self.nbverse_storage.max_dir)
                if hasattr(self.nbverse_storage, 'min_dir') and os.path.exists(self.nbverse_storage.min_dir):
                    search_dirs.append(self.nbverse_storage.min_dir)
            
            if not search_dirs:
                print("⚠️ NBverse 저장소가 초기화되지 않았습니다.")
                self.cards_cache = []
                self._cache_dirty = False
                return
            
            # UI 반응성을 위해 배치 처리
            # 최적화: 리스트 컴프리헨션 사용 + os.path.join 최적화
            all_files = []
            for base_dir in search_dirs:
                # os.walk 최적화: 제너레이터 사용
                for root, dirs, files in os.walk(base_dir):
                    # 최적화: 리스트 컴프리헨션으로 파일 경로 생성
                    json_files = [
                        os.path.join(root, filename)
                        for filename in files
                        if filename.endswith('.json')
                    ]
                    all_files.extend(json_files)
            
            # 파일을 병렬로 처리 (속도 개선: ThreadPoolExecutor 사용)
            cards_dict = {}  # card_id -> card 매핑
            cards_dict_lock = threading.Lock()  # 스레드 안전성을 위한 락
            
            def process_file(file_path: str):
                """단일 파일 처리 함수"""
                try:
                    data = self.nbverse_storage.load_from_path(file_path)
                    if data and data.get('metadata'):
                        metadata = data.get('metadata', {})
                        # production_card 타입만 필터링
                        if metadata.get('card_type') == 'production_card':
                            card = self._data_to_card(data, metadata)
                            if card:
                                card_id = card.get('card_id')
                                if card_id:
                                    with cards_dict_lock:
                                        # 중복 제거 (card_id 기준)
                                        if card_id not in cards_dict:
                                            cards_dict[card_id] = card
                                        else:
                                            # 생산 시간 비교하여 더 최신 것만 유지
                                            existing_time = cards_dict[card_id].get('production_time', '')
                                            new_time = card.get('production_time', '')
                                            if new_time > existing_time:
                                                cards_dict[card_id] = card
                except Exception as e:
                    # 개별 파일 오류는 무시하고 계속 진행
                    pass
            
            # 병렬 처리 (ThreadPoolExecutor 사용)
            from concurrent.futures import ThreadPoolExecutor, as_completed
            max_workers = min(8, len(all_files))  # 최대 8개 스레드 또는 파일 수만큼
            
            with ThreadPoolExecutor(max_workers=max_workers) as executor:
                # 모든 파일을 병렬로 처리
                futures = [executor.submit(process_file, file_path) for file_path in all_files]
                # 완료 대기 (진행 상황 표시용)
                for future in as_completed(futures):
                    try:
                        future.result()  # 예외 확인
                    except Exception:
                        pass  # 개별 파일 오류는 무시
            
            # dict에서 리스트로 변환
            cards = list(cards_dict.values())
            
            # production_time 기준으로 정렬 (최신순)
            cards.sort(key=lambda x: x.get('production_time', ''), reverse=True)
            
            # 기존 캐시의 카드와 병합 (중복 제거 - card_id 및 card_key 기준)
            # 새로 추가된 카드가 사라지지 않도록 보존
            # 속도 개선: dict 사용하여 중복 제거 + 리스트 컴프리헨션 최적화
            existing_card_ids = {c.get('card_id') for c in self.cards_cache if c.get('card_id')}
            # card_key -> 최신 card 매핑 (최적화: 딕셔너리 컴프리헨션 사용)
            existing_card_keys = {}
            for c in self.cards_cache:
                card_key = c.get('card_key')
                if card_key:
                    existing_time = existing_card_keys.get(card_key, {}).get('production_time', '')
                    new_time = c.get('production_time', '')
                    if not existing_time or new_time > existing_time:
                        existing_card_keys[card_key] = c
            
            # card_key 기준으로도 중복 제거 (같은 card_key를 가진 카드가 여러 개 있으면 최신 것만 유지)
            new_card_dict = {}  # card_id -> card 매핑
            new_card_key_dict = {}  # card_key -> 최신 card 매핑
            
            for card in cards:
                card_id = card.get('card_id')
                card_key = card.get('card_key', '')
                if not card_id:
                    continue
                
                # 기존 캐시에 없고, new_card_dict에도 없는 경우만 추가
                if card_id not in existing_card_ids:
                    # card_key 기준 중복 체크
                    if card_key:
                        if card_key not in new_card_key_dict:
                            # 새로운 card_key
                            new_card_key_dict[card_key] = card
                            new_card_dict[card_id] = card
                        else:
                            # 같은 card_key가 이미 있으면 생산 시간 비교
                            existing_time = new_card_key_dict[card_key].get('production_time', '')
                            new_time = card.get('production_time', '')
                            if new_time > existing_time:
                                # 더 최신 카드로 교체
                                old_card_id = new_card_key_dict[card_key].get('card_id')
                                if old_card_id in new_card_dict:
                                    del new_card_dict[old_card_id]
                                new_card_key_dict[card_key] = card
                                new_card_dict[card_id] = card
                    else:
                        # card_key가 없으면 card_id만으로 추가
                        if card_id not in new_card_dict:
                            new_card_dict[card_id] = card
            
            # 캐시 업데이트 (기존 캐시 유지 + 새 카드 추가)
            for card in new_card_dict.values():
                if card.get('card_id') not in existing_card_ids:
                    self.cards_cache.append(card)
                    existing_card_ids.add(card.get('card_id'))
            
            # 최신순으로 정렬
            self.cards_cache.sort(key=lambda x: x.get('production_time', ''), reverse=True)
            
            # 인덱스 재구성 (캐시 업데이트 후)
            self._rebuild_indexes()
            
            # card_key 기준 중복 제거 (동기적으로 실행하여 즉시 정리)
            # 활성 카드 중에서 같은 card_key를 가진 카드가 여러 개 있으면 최신 것만 남기고 나머지 제거
            # 최적화: 리스트 컴프리헨션 + 딕셔너리 사용
            active_states = {CardState.ACTIVE.value, CardState.OVERLAP_ACTIVE.value}
            active_cards_by_key = {}
            for card in self.cards_cache:
                if card.get('card_state', CardState.ACTIVE.value) in active_states:
                    card_key = card.get('card_key', '')
                    if card_key:
                        if card_key not in active_cards_by_key:
                            active_cards_by_key[card_key] = []
                        active_cards_by_key[card_key].append(card)
            
            # 중복 제거: 같은 card_key를 가진 활성 카드가 여러 개 있으면 최신 것만 남기고 나머지 REMOVED 처리
            for card_key, duplicate_cards in active_cards_by_key.items():
                if len(duplicate_cards) > 1:
                    # 생산 시간 기준으로 정렬 (최신 것부터)
                    duplicate_cards.sort(key=lambda x: x.get('production_time', ''), reverse=True)
                    
                    # 가장 최신 카드는 유지하고 나머지 제거
                    for card_to_remove in duplicate_cards[1:]:
                        card_id = card_to_remove.get('card_id', 'unknown')
                        print(f"🗑️ [로드 시 중복 제거] 카드 {card_id}: 같은 card_key({card_key})를 가진 활성 카드가 {len(duplicate_cards)}개 있어 제거")
                        
                        # 카드 상태를 REMOVED로 변경
                        card_to_remove['card_state'] = CardState.REMOVED.value
                        card_to_remove['status'] = CardState.REMOVED.value
                        
                        # NBverse에 업데이트 (백그라운드)
                        self._update_card_in_nbverse(card_to_remove)
            
            # 중복 카드 정리 (로드 후 실행, 재귀 호출 방지를 위해 _cache_dirty를 False로 설정 후 실행)
            # 이미 위에서 card_key 기준 중복 제거를 했으므로 추가 정리는 백그라운드로만 실행
            self._cache_dirty = False  # 재귀 호출 방지
            try:
                # 추가 중복 카드 정리를 백그라운드로 실행 (UI 블로킹 방지)
                import threading
                def cleanup_in_background():
                    try:
                        self.cleanup_duplicate_cards(force_use_cache=True)  # 캐시 강제 사용
                    except Exception as e:
                        print(f"⚠️ 중복 카드 정리 오류: {e}")
                
                thread = threading.Thread(target=cleanup_in_background, daemon=True)
                thread.start()
            except Exception as e:
                print(f"⚠️ 중복 카드 정리 시작 오류: {e}")
            
            # 최대 개수 제한 (REMOVED 상태는 제외)
            self._update_max_cards_from_settings()  # 설정에서 최신 값 읽어오기
            active_cards = [c for c in self.cards_cache if c.get('card_state') != CardState.REMOVED.value]
            if len(active_cards) > self.MAX_CARDS:
                # 오래된 카드 제거
                cards_to_remove = active_cards[self.MAX_CARDS:]
                for card in cards_to_remove:
                    self._remove_card_from_nbverse(card.get('card_id'))
                self.cards_cache = [c for c in self.cards_cache if c not in cards_to_remove]
            
            self._cache_dirty = False
            print(f"✅ 생산 카드 로드 완료 (NBverse): {len(cards)}개")
        except Exception as e:
            print(f"❌ 생산 카드 로드 오류: {e}")
            import traceback
            traceback.print_exc()
            self.cards_cache = []
            self._cache_dirty = False
        finally:
            self._loading = False  # 로드 완료 플래그 해제
    
    def _data_to_card(self, data: Dict, metadata: Dict) -> Optional[Dict]:
        """NBverse 데이터를 카드 형식으로 변환"""
        try:
            card_id = metadata.get('card_id')
            if not card_id:
                return None
            
            # card_key 생성 (기존 데이터 호환성)
            timeframe = metadata.get('timeframe', 'unknown')
            nb_id = metadata.get('nb_id', '')
            if not nb_id:
                # 기존 데이터에서 nb_id 복원 시도
                nb_value = metadata.get('nb_value', 0.0)
                nb_id = self._generate_nb_id(timeframe, nb_value)
            card_key = self._generate_card_key(timeframe, nb_id)
            
            # 카드 상태 (기존 데이터 호환성)
            old_status = metadata.get('status', 'active')
            card_state_from_metadata = metadata.get('card_state')  # card_state 필드도 확인
            
            # card_state가 명시적으로 있으면 우선 사용
            if card_state_from_metadata:
                try:
                    card_state = CardState(card_state_from_metadata)
                except ValueError:
                    # 유효하지 않은 값이면 old_status로 판단
                    card_state = None
            else:
                card_state = None
            
            # card_state가 없으면 old_status로 판단
            if card_state is None:
                if old_status == 'removed' or old_status == CardState.REMOVED.value:
                    card_state = CardState.REMOVED
                elif old_status == 'sold' or old_status == CardState.GRAY.value:
                    card_state = CardState.GRAY
                elif old_status == 'active' or old_status == CardState.ACTIVE.value:
                    # 히스토리 확인하여 OVERLAP_ACTIVE 판단
                    history_list = metadata.get('history_list', [])
                    if history_list and len(history_list) > 0:
                        # 최신 히스토리가 SOLD로 닫혀있으면 OVERLAP_ACTIVE 가능성
                        latest_hist = history_list[0]
                        if latest_hist.get('type') == HistoryType.SOLD:
                            card_state = CardState.OVERLAP_ACTIVE
                        else:
                            card_state = CardState.ACTIVE
                    else:
                        card_state = CardState.ACTIVE
                else:
                    card_state = CardState.ACTIVE
            
            # nb_max, nb_min 값 추출 (여러 소스에서 시도)
            nb_max = None
            nb_min = None
            
            # 1순위: metadata에서 bit_max, bit_min 확인
            if 'bit_max' in metadata:
                nb_max = metadata.get('bit_max')
            if 'bit_min' in metadata:
                nb_min = metadata.get('bit_min')
            
            # 2순위: metadata에서 nb_max, nb_min 확인
            if nb_max is None and 'nb_max' in metadata:
                nb_max = metadata.get('nb_max')
            if nb_min is None and 'nb_min' in metadata:
                nb_min = metadata.get('nb_min')
            
            # 3순위: 최상위 레벨의 nb.max, nb.min 확인
            if nb_max is None and 'nb' in data:
                nb_dict = data.get('nb', {})
                if 'max' in nb_dict:
                    nb_max = nb_dict.get('max')
            if nb_min is None and 'nb' in data:
                nb_dict = data.get('nb', {})
                if 'min' in nb_dict:
                    nb_min = nb_dict.get('min')
            
            # 점수와 등급 (기본값: 100점, C 등급)
            score = metadata.get('score', 100.0)
            rank = metadata.get('rank', 'C')
            # 점수는 있지만 등급이 없으면 점수로부터 계산
            if 'score' in metadata and 'rank' not in metadata:
                rank = self._calculate_rank_from_score(score)
            
            card = {
                'card_id': card_id,
                'card_key': card_key,  # 새 필드
                'timeframe': timeframe,
                'nb_value': metadata.get('nb_value', 0.0),
                'nb_max': nb_max,  # nb_max 값 추가
                'nb_min': nb_min,  # nb_min 값 추가
                'nb_id': nb_id,
                'card_type': metadata.get('card_type_detail', 'normal'),
                'card_state': card_state.value,  # 새 필드 (기존 status 대체)
                'status': card_state.value,  # 호환성을 위해 유지
                'removal_pending': metadata.get('removal_pending', False),  # 새 필드
                'production_time': metadata.get('production_time', datetime.now().isoformat()),
                'chart_data': metadata.get('chart_data', {}),
                'history_list': metadata.get('history_list', []),  # 히스토리 리스트 포함
                'score': score,  # 점수 (기본값 100점)
                'rank': rank  # 등급 (기본값 C)
            }
            
            # 히스토리 100개 제한 적용
            if len(card.get('history_list', [])) > self.MAX_HISTORY_PER_CARD:
                card['history_list'] = card['history_list'][:self.MAX_HISTORY_PER_CARD]
            
            return card
        except Exception as e:
            print(f"⚠️ 카드 데이터 변환 오류: {e}")
            return None
    
    def _remove_card_from_nbverse(self, card_id: str):
        """NBverse에서 카드 제거 - 백그라운드 실행"""
        if not self.nbverse_storage:
            return
        
        # 백그라운드 스레드에서 실행 (렉 방지)
        import threading
        
        def remove_in_background():
            try:
                # max/min 폴더에서 해당 card_id를 가진 파일 찾아서 삭제
                # 최적화: 리스트 컴프리헨션 + 조기 종료
                base_dirs = [d for d in [self.nbverse_storage.max_dir, self.nbverse_storage.min_dir] 
                            if d and os.path.exists(d)]
                
                for base_dir in base_dirs:
                    for root, dirs, files in os.walk(base_dir):
                        # 최적화: 리스트 컴프리헨션으로 파일 경로 수집
                        json_files = [
                            os.path.join(root, filename)
                            for filename in files
                            if filename.endswith('.json')
                        ]
                        for file_path in json_files:
                            try:
                                data = self.nbverse_storage.load_from_path(file_path)
                                if data and data.get('metadata', {}).get('card_id') == card_id:
                                    os.remove(file_path)
                                    print(f"🗑️ 카드 제거: {card_id}")
                                    return  # 찾았으면 즉시 종료
                            except:
                                pass
            except Exception as e:
                print(f"⚠️ 카드 제거 오류: {e}")
        
        # 백그라운드 스레드에서 실행
        thread = threading.Thread(target=remove_in_background, daemon=True)
        thread.start()
    
    def _update_card_in_nbverse(self, card: Dict):
        """NBverse에서 카드 업데이트 (히스토리 포함) - 백그라운드 실행"""
        if not self.nbverse_storage:
            return False
        
        # 백그라운드 스레드에서 실행 (렉 방지)
        import threading
        
        def update_in_background():
            try:
                card_id = card.get('card_id')
                if not card_id:
                    return
                
                # 기존 파일 찾기 (최적화: 리스트 컴프리헨션 사용)
                found_files = []
                base_dirs = [d for d in [self.nbverse_storage.max_dir, self.nbverse_storage.min_dir] 
                            if d and os.path.exists(d)]
                
                for base_dir in base_dirs:
                    # 최적화: 리스트 컴프리헨션으로 파일 경로 수집
                    for root, dirs, files in os.walk(base_dir):
                        json_files = [
                            os.path.join(root, filename)
                            for filename in files
                            if filename.endswith('.json')
                        ]
                        # 최적화: 배치로 로드하여 I/O 최소화
                        for file_path in json_files:
                            try:
                                data = self.nbverse_storage.load_from_path(file_path)
                                if data and data.get('metadata', {}).get('card_id') == card_id:
                                    found_files.append(file_path)
                                    # 첫 번째 파일만 찾으면 중단 (같은 card_id는 하나만 있어야 함)
                                    break
                            except:
                                pass
                        if found_files:
                            break  # 찾았으면 중단
                    if found_files:
                        break  # 찾았으면 중단
                
                # 모든 파일 업데이트 (최적화: found_files가 비어있으면 스킵)
                if not found_files:
                    return
                
                for file_path in found_files:
                    try:
                        data = self.nbverse_storage.load_from_path(file_path)
                        if data and data.get('metadata'):
                            # metadata 업데이트
                            metadata = data['metadata']
                            metadata.update({
                                'card_id': card.get('card_id'),
                                'card_key': card.get('card_key'),
                                'timeframe': card.get('timeframe'),
                                'nb_value': card.get('nb_value'),
                                'nb_id': card.get('nb_id'),
                                'card_type_detail': card.get('card_type', 'normal'),
                                'card_state': card.get('card_state', CardState.ACTIVE.value),
                                'status': card.get('card_state', CardState.ACTIVE.value),  # 호환성
                                'removal_pending': card.get('removal_pending', False),
                                'production_time': card.get('production_time'),
                                'chart_data': card.get('chart_data', {}),
                                'history_list': card.get('history_list', []),  # 히스토리 포함
                                'bit_max': (card.get('nb_max', 0.5) * 10.0) if card.get('nb_max') is not None else (card.get('bit_max', 5.5)),  # nb_max * 10으로 bit_max 계산 (호환성)
                                'bit_min': (card.get('nb_min', 0.5) * 10.0) if card.get('nb_min') is not None else (card.get('bit_min', 5.5)),  # nb_min * 10으로 bit_min 계산 (호환성)
                                'nb_max': card.get('nb_max'),  # nb_max 직접 저장 (0~1 범위)
                                'nb_min': card.get('nb_min'),  # nb_min 직접 저장 (0~1 범위)
                                'score': card.get('score', 100.0),  # 점수 (기본값 100점)
                                'rank': card.get('rank', 'C'),  # 등급 (기본값 C)
                                'realtime_scores': card.get('realtime_scores', []),  # 실시간 점수 히스토리
                                'buy_entry_price': card.get('buy_entry_price', 0.0)  # 매수 진입 가격
                            })
                            
                            # 파일 저장 (빠른 JSON 사용)
                            with open(file_path, 'wb') as f:
                                f.write(_json_dumps(data, indent=2))
                                f.flush()
                                os.fsync(f.fileno())
                    except Exception as e:
                        print(f"⚠️ 카드 업데이트 오류: {e}")
            except Exception as e:
                print(f"⚠️ 카드 업데이트 오류: {e}")
        
        # 백그라운드 스레드에서 실행
        thread = threading.Thread(target=update_in_background, daemon=True)
        thread.start()
        
        # 즉시 반환 (비동기)
        return True
    
    def get_card_by_key(self, card_key: str) -> Optional[Dict]:
        """
        card_key로 카드 찾기 (중첩 카드 조회용) - 인덱스 사용으로 O(1) 조회 (메모리 캐싱 최적화)
        
        Args:
            card_key: 카드 키
            
        Returns:
            카드 딕셔너리 또는 None
        """
        # UI 반응성을 위해 load() 호출 제거, 캐시만 사용
        # 캐시가 비어있으면 백그라운드로 로드만 시작 (대기 안 함)
        if not self.cards_cache and not self._loading:
            self.load(background=True)  # 백그라운드로만 시작, 대기 안 함
        
        # 인덱스가 비어있으면 재구성
        if not self._card_key_index and self.cards_cache:
            self._rebuild_indexes()
        
        # 인덱스를 사용한 O(1) 조회 (같은 card_key가 여러 개 있으면 첫 번째 반환)
        with self._index_lock:
            cards = self._card_key_index.get(card_key, [])
            if cards:
                return cards[0]  # 첫 번째 카드 반환
        return None
    
    def get_active_cards_by_key(self, card_key: str) -> List[Dict]:
        """
        card_key로 활성 카드 찾기 (중복 체크용) - 인덱스 사용으로 최적화
        
        Args:
            card_key: 카드 키
            
        Returns:
            활성 카드 리스트 (ACTIVE, OVERLAP_ACTIVE 상태)
        """
        # UI 반응성을 위해 load() 호출 제거, 캐시만 사용
        # 캐시가 비어있으면 백그라운드로 로드만 시작 (대기 안 함)
        if not self.cards_cache and not self._loading:
            self.load(background=True)  # 백그라운드로만 시작, 대기 안 함
        
        # 인덱스가 비어있으면 재구성
        if not self._card_key_index and self.cards_cache:
            self._rebuild_indexes()
        
        # 인덱스를 사용한 O(1) 조회 + 필터링 (최적화: 리스트 컴프리헨션)
        active_states = {CardState.ACTIVE.value, CardState.OVERLAP_ACTIVE.value}
        with self._index_lock:
            cards = self._card_key_index.get(card_key, [])
            return [card for card in cards if card.get('card_state') in active_states]
    
    def cleanup_duplicate_cards(self, force_use_cache: bool = False) -> int:
        """
        중복 카드 정리 (같은 card_key를 가진 활성 카드가 여러 개 있으면 가장 오래된 것만 남기고 나머지 제거)
        
        Args:
            force_use_cache: True이면 캐시를 강제로 사용 (재귀 호출 방지)
        
        Returns:
            제거된 카드 개수
        """
        # 재귀 호출 방지: force_use_cache가 True이면 load() 호출 안 함
        # UI 반응성을 위해 load() 호출 제거, 캐시만 사용
        if not force_use_cache and not self.cards_cache and not self._loading:
            # 캐시가 비어있으면 백그라운드로 로드만 시작 (대기 안 함)
            self.load(background=True)
            return 0  # 캐시가 없으면 정리할 것도 없음
        
        removed_count = 0
        
        # card_key별로 활성 카드 그룹화
        card_key_groups = {}
        for card in self.cards_cache:
            card_key = card.get('card_key', '')
            if not card_key:
                continue
            
            card_state = card.get('card_state', CardState.ACTIVE.value)
            if card_state in [CardState.ACTIVE.value, CardState.OVERLAP_ACTIVE.value]:
                if card_key not in card_key_groups:
                    card_key_groups[card_key] = []
                card_key_groups[card_key].append(card)
        
        # 각 그룹에서 중복 카드 제거 (가장 최신 카드만 남기고 나머지 제거)
        for card_key, cards in card_key_groups.items():
            if len(cards) > 1:
                # 생산 시간 기준으로 정렬 (최신 것부터)
                cards.sort(key=lambda x: x.get('production_time', ''), reverse=True)
                
                # 가장 최신 카드는 유지하고 나머지 제거
                for card_to_remove in cards[1:]:
                    card_id = card_to_remove.get('card_id', 'unknown')
                    print(f"🗑️ [중복 카드 제거] 카드 {card_id}: 같은 card_key를 가진 활성 카드가 {len(cards)}개 있어 가장 오래된 카드 제거")
                    
                    # 카드 상태를 REMOVED로 변경
                    card_to_remove['card_state'] = CardState.REMOVED.value
                    card_to_remove['status'] = CardState.REMOVED.value
                    
                    # NBverse에 업데이트
                    self._update_card_in_nbverse(card_to_remove)
                    
                    # 캐시에서 제거
                    if card_to_remove in self.cards_cache:
                        self.cards_cache.remove(card_to_remove)
                    
                    removed_count += 1
        
        if removed_count > 0:
            print(f"✅ 중복 카드 정리 완료: {removed_count}개 카드 제거")
        
        return removed_count
    
    def check_overlap_allowed(self, card_key: str) -> bool:
        """
        중첩 카드 재활성 허용 여부 확인
        - NBVerse에 동일 card_key가 존재하면 (REMOVED 제외) 중첩 허용
        """
        card = self.get_card_by_key(card_key)
        if not card:
            return False
        
        card_state = card.get('card_state', CardState.ACTIVE.value)
        if card_state == CardState.REMOVED.value:
            print(f"⚠️ REMOVED 상태의 카드는 재활성할 수 없습니다: {card_key}")
            return False
        
        # SOLD 여부와 무관하게 기존 데이터가 있으면 중첩을 허용
        return True
    
    def activate_overlap_card(self, card_key: str) -> Optional[Dict]:
        """
        중첩 카드 재활성
        
        Args:
            card_key: 카드 키
            
        Returns:
            재활성된 카드 딕셔너리 또는 None
        """
        card = self.get_card_by_key(card_key)
        if not card:
            return None
        
        # REMOVED 상태의 카드는 재활성 불가 (이중 체크)
        card_state = card.get('card_state', CardState.ACTIVE.value)
        if card_state == CardState.REMOVED.value:
            print(f"⚠️ REMOVED 상태의 카드는 재활성할 수 없습니다: {card_key}")
            return None
        
        if not self.check_overlap_allowed(card_key):
            return None
        
        # generation 계산 (최대값 + 1)
        history_list = card.get('history_list', [])
        max_generation = 0
        for hist in history_list:
            gen = hist.get('generation', 0)
            if gen > max_generation:
                max_generation = gen
        
        # 카드 상태를 OVERLAP_ACTIVE로 변경
        card['card_state'] = CardState.OVERLAP_ACTIVE.value
        card['status'] = CardState.OVERLAP_ACTIVE.value  # 호환성
        card['removal_pending'] = False
        
        # NBverse에 업데이트
        self._update_card_in_nbverse(card)
        
        print(f"🔄 중첩 카드 재활성: {card_key} (generation: {max_generation + 1})")
        return card
    
    def cleanup_old_cards(self, hours_threshold: float = 20.0) -> int:
        """
        오래된 카드 정리 (20시간 이상 된 카드)
        
        Args:
            hours_threshold: 정리 기준 시간 (기본값: 20시간)
        
        Returns:
            정리된 카드 수
        """
        try:
            cleaned_count = 0
            now = datetime.now()
            threshold_seconds = hours_threshold * 3600  # 시간을 초로 변환
            
            # 모든 활성 카드 확인
            all_cards = self.get_all_cards()
            
            for card in all_cards:
                # 보유 중인 포지션이 있으면 건너뜀
                history_list = card.get('history_list', [])
                has_buy = any(h.get('type') in ['NEW', 'BUY'] for h in history_list)
                has_sold = any(h.get('type') == 'SOLD' for h in history_list)
                
                # 매수했지만 아직 매도하지 않은 카드는 보호
                if has_buy and not has_sold:
                    continue
                
                # 생산 시간 확인
                production_time_str = card.get('production_time')
                if not production_time_str:
                    continue
                
                try:
                    from utils import parse_iso_datetime
                    production_time = parse_iso_datetime(production_time_str)
                    if not production_time:
                        continue
                    
                    # 시간 차이 계산
                    time_diff = now - production_time.replace(tzinfo=None) if production_time.tzinfo else now - production_time
                    elapsed_seconds = time_diff.total_seconds()
                    
                    # 20시간 이상 된 카드 정리
                    if elapsed_seconds >= threshold_seconds:
                        card_id = card.get('card_id', 'unknown')
                        elapsed_hours = elapsed_seconds / 3600
                        print(f"🗑️ [오래된 카드 정리] 카드 {card_id}: {elapsed_hours:.1f}시간 경과 (기준: {hours_threshold}시간)")
                        
                        # 카드 상태를 REMOVED로 변경
                        card['card_state'] = CardState.REMOVED.value
                        card['status'] = CardState.REMOVED.value
                        
                        # NBverse에 업데이트
                        self._update_card_in_nbverse(card)
                        
                        # 캐시에서 제거
                        if card in self.cards_cache:
                            self.cards_cache.remove(card)
                        
                        cleaned_count += 1
                except Exception as e:
                    print(f"⚠️ 카드 {card.get('card_id', 'unknown')} 생산 시간 파싱 오류: {e}")
                    continue
            
            if cleaned_count > 0:
                print(f"✅ 오래된 카드 정리 완료: {cleaned_count}개 카드 제거 (기준: {hours_threshold}시간 이상)")
            
            return cleaned_count
            
        except Exception as e:
            print(f"⚠️ 오래된 카드 정리 오류: {e}")
            import traceback
            traceback.print_exc()
            return 0
    
    def cleanup_gray_cards(self):
        """
        GRAY 카드 정리 (다음 생산 시점에 호출)
        removal_pending=true인 GRAY 카드를 REMOVED로 변경하고 Active 목록에서 제거
        """
        if self._cache_dirty:
            self.load()
        
        removed_count = 0
        for card in self.cards_cache[:]:  # 복사본으로 순회
            card_state = card.get('card_state', CardState.ACTIVE.value)
            removal_pending = card.get('removal_pending', False)
            
            if card_state == CardState.GRAY.value and removal_pending:
                # REMOVED로 변경
                card['card_state'] = CardState.REMOVED.value
                card['status'] = CardState.REMOVED.value  # 호환성
                card['removal_pending'] = False
                
                # NBverse에 업데이트
                self._update_card_in_nbverse(card)
                
                # 캐시에서 제거 (Active 목록에서 제거)
                self.cards_cache.remove(card)
                removed_count += 1
                print(f"🗑️ GRAY 카드 제거: {card.get('card_key', 'unknown')}")
        
        if removed_count > 0:
            print(f"✅ {removed_count}개 GRAY 카드 정리 완료")
        
        return removed_count
    
    def add_card(self, timeframe: str, nb_value: float = 0.0, nb_max: Optional[float] = None, 
                 nb_min: Optional[float] = None, card_type: str = 'normal', 
                 chart_data: dict = None, nb_id: Optional[str] = None, generation: int = 1,
                 qty: float = 0.0, entry_price: float = 0.0, memo: str = "", 
                 decimal_places: int = 10, status: str = 'active'):
        """
        생산 카드 추가 (NBverse 데이터베이스에 자동 저장)
        
        Args:
            timeframe: 타임프레임
            nb_value: N/B 값
            card_type: 카드 타입 (normal/overlap)
            chart_data: 차트 데이터
            nb_id: N/B ID (선택사항, 없으면 자동 생성)
            generation: 중첩 생산 세대 (기본값: 1)
            qty: 수량 (기본값: 0.0)
            entry_price: 진입 가격 (기본값: 0.0)
            memo: 메모 (기본값: "")
            decimal_places: 소수점 자리수 (기본값: 10)
        
        Returns:
            생성된 카드 딕셔너리
        """
        if not self.nbverse_storage:
            raise RuntimeError("NBverse 저장소가 초기화되지 않았습니다.")
        
        # 캐시가 무효화되었으면 다시 로드
        if self._cache_dirty:
            self.load()
        
        # GRAY 카드 정리 (생산 시점에 실행)
        self.cleanup_gray_cards()
        
        # nb_id 생성 (없으면)
        if not nb_id:
            nb_id = self._generate_nb_id(timeframe, nb_value, decimal_places)
        
        # card_key 생성
        card_key = self._generate_card_key(timeframe, nb_id)
        
        # 중첩 카드 처리: NBverse에 동일 card_key가 있으면 활성/비활성 관계없이 중첩으로 간주
        active_cards_with_same_key = self.get_active_cards_by_key(card_key)
        existing_card = self.get_card_by_key(card_key)
        
        # REMOVED는 생성 허용(삭제 후 새로), 그 외는 중첩 재활성
        if existing_card:
            card_state = existing_card.get('card_state', CardState.ACTIVE.value)
            if card_state == CardState.REMOVED.value:
                print(f"⚠️ REMOVED 상태의 카드가 이미 존재합니다: {card_key} (카드 ID: {existing_card.get('card_id', 'unknown')})")
                print(f"  → REMOVED 상태의 카드를 완전히 삭제하고 새 카드를 생성합니다.")
                self._remove_card_from_nbverse(existing_card.get('card_id'))
                if existing_card in self.cards_cache:
                    self.cards_cache.remove(existing_card)
                    self._rebuild_indexes()
                existing_card = None
            else:
                # 활성/GRAY/OVERLAP 모두 중첩 재활성
                card = self.activate_overlap_card(card_key)
                if card:
                    # generation 업데이트 (히스토리 최대 generation + 1)
                    history_list = card.get('history_list', [])
                    max_generation = 0
                    for hist in history_list:
                        gen = hist.get('generation', 0)
                        if gen > max_generation:
                            max_generation = gen
                    generation = max_generation + 1
                    print(f"🔄 기존 카드 중첩 재활성: {card_key} (generation={generation})")
                    return card
                # 재활성 실패 시 새 카드 생성 계속 진행
        
        # 최대 개수에 도달하면 가장 오래된 카드부터 제거 (FIFO)
        self._update_max_cards_from_settings()  # 설정에서 최신 값 읽어오기
        active_cards = [c for c in self.cards_cache if c.get('card_state') in [CardState.ACTIVE.value, CardState.OVERLAP_ACTIVE.value]]
        if len(active_cards) >= self.MAX_CARDS:
            # 생산 시간 기준으로 정렬 (오래된 것부터)
            active_cards.sort(key=lambda x: x.get('production_time', ''))
            # 가장 오래된 카드 제거
            removed_card = active_cards[0]
            self._remove_card_from_nbverse(removed_card.get('card_id'))
            if removed_card in self.cards_cache:
                self.cards_cache.remove(removed_card)
                # 인덱스 재구성 (카드 제거 후)
                self._rebuild_indexes()
            print(f"⚠️ 생산 카드가 {self.MAX_CARDS}개에 도달하여 가장 오래된 카드를 제거했습니다: {removed_card.get('card_id', 'unknown')}")
        
        # 카드 ID 생성
        card_id = f"prod_card_{timeframe}_{datetime.now().strftime('%Y%m%d_%H%M%S')}_{random.randint(1000, 9999)}"
        
        # 생산 순서 번호 부여 (모든 카드 중 가장 큰 번호 + 1)
        try:
            all_cards = self.get_all_cards()
            max_production_number = 0
            if all_cards:
                for c in all_cards:
                    prod_num = c.get('production_number', 0)
                    if isinstance(prod_num, (int, float)) and prod_num > max_production_number:
                        max_production_number = int(prod_num)
            production_number = max_production_number + 1
        except Exception as e:
            # 오류 발생 시 기본값 사용
            print(f"⚠️ 생산 순서 번호 계산 중 오류 발생, 기본값 사용: {e}")
            production_number = 1
        
        # 히스토리 리스트 초기화
        history_list = []
        
        # 히스토리 추가 (NEW 타입 - 처음 생산)
        history_item = {
            'history_id': str(uuid.uuid4()),
            'card_key': card_key,
            'generation': generation,
            'type': HistoryType.NEW.value,
            'nb_id': nb_id,
            'timestamp': datetime.now().isoformat(),
            'entry_price': entry_price,
            'exit_price': 0.0,
            'qty': qty,
            'pnl_percent': 0.0,
            'pnl_amount': 0.0,
            'fee_amount': 0.0
        }
        history_list.insert(0, history_item)
        
        # 카드 상태 결정
        if existing_card:
            card_state = CardState.OVERLAP_ACTIVE
        else:
            card_state = CardState.ACTIVE
        
        # 점수와 등급 초기화 (기본값: 100점, C 등급)
        initial_score = 100.0
        initial_rank = 'C'
        
        # 기존 카드가 있으면 기존 점수와 등급 유지 (중첩 카드 재활성 시)
        if existing_card:
            initial_score = existing_card.get('score', 100.0)
            initial_rank = existing_card.get('rank', 'C')
        
        # 카드 객체 생성
        card = {
            'card_id': card_id,
            'card_key': card_key,
            'timeframe': timeframe,
            'nb_value': nb_value,
            'nb_max': nb_max,
            'nb_min': nb_min,
            'nb_id': nb_id,
            'card_type': card_type,
            'card_state': card_state.value,
            'status': card_state.value,  # 호환성
            'removal_pending': False,
            'production_time': datetime.now().isoformat(),
            'production_number': production_number,  # 생산 순서 번호
            'chart_data': chart_data or {},
            'history_list': history_list,
            'score': initial_score,  # 기본 점수 100점
            'rank': initial_rank  # 기본 등급 C
        }
        
        # 기존 카드가 있으면 히스토리 병합 (중첩 카드 재활성 시)
        if existing_card:
            existing_history = existing_card.get('history_list', [])
            card['history_list'] = history_list + existing_history
            card['card_id'] = existing_card.get('card_id')  # 기존 card_id 유지
            # 중첩 카드 재활성 시 기존 생산 번호 유지
            if existing_card.get('production_number'):
                card['production_number'] = existing_card.get('production_number')
                production_number = existing_card.get('production_number')
        
        # 차트 데이터에서 가격 문자열 생성 (NBverse 저장용)
        prices_str = ""
        if chart_data and isinstance(chart_data, dict) and chart_data.get('prices'):
            prices_str = ",".join([str(p) for p in chart_data['prices']])
        else:
            # 가격 데이터가 없으면 카드 ID를 텍스트로 사용
            prices_str = card_id
        
        # 메타데이터 구성 (히스토리 포함)
        metadata = {
            'card_id': card.get('card_id'),
            'card_key': card_key,
            'card_type': 'production_card',  # 식별자
            'timeframe': timeframe,
            'nb_value': nb_value,
            'nb_id': nb_id,
            'card_type_detail': card_type,
            'card_state': card_state.value,
            'status': card_state.value,  # 호환성
            'removal_pending': False,
            'production_time': datetime.now().isoformat(),
            'production_number': production_number,  # 생산 순서 번호
            'chart_data': chart_data or {},
            'history_list': card.get('history_list', []),  # 히스토리 리스트 포함
            'bit_max': nb_max,  # nb_max를 bit_max로도 저장 (호환성)
            'bit_min': nb_min,  # nb_min을 bit_min으로도 저장 (호환성)
            'nb_max': nb_max,  # nb_max 직접 저장
            'nb_min': nb_min,  # nb_min 직접 저장
            'score': card.get('score', 100.0),  # 점수 (기본값 100점)
            'rank': card.get('rank', 'C')  # 등급 (기본값 C)
        }
        
        # NBverse에 저장 (백그라운드 실행)
        try:
            if not existing_card:
                # 새 카드만 저장 (백그라운드 실행)
                import threading
                
                def save_in_background():
                    try:
                        self.nbverse_storage.save_text(prices_str, metadata=metadata)
                        print(f"💾 생산 카드 저장 완료 (NBverse): {card_id}")
                    except Exception as e:
                        print(f"❌ 생산 카드 저장 오류: {e}")
                        import traceback
                        traceback.print_exc()
                
                thread = threading.Thread(target=save_in_background, daemon=True)
                thread.start()
            else:
                # 기존 카드 업데이트 (이미 백그라운드로 실행됨)
                self._update_card_in_nbverse(card)
                print(f"🔄 중첩 카드 업데이트 완료: {card_key}")
        except Exception as e:
            print(f"❌ 생산 카드 저장 오류: {e}")
            import traceback
            traceback.print_exc()
            # 백그라운드 실행이므로 예외를 다시 발생시키지 않음
        
        # 캐시에 추가 (기존 카드가 아니면)
        if not existing_card:
            self.cards_cache.append(card)
            # 최신순으로 정렬
            self.cards_cache.sort(key=lambda x: x.get('production_time', ''), reverse=True)
        else:
            # 기존 카드 업데이트 (캐시에서 찾아서 업데이트)
            for i, cached_card in enumerate(self.cards_cache):
                if cached_card.get('card_id') == card.get('card_id'):
                    self.cards_cache[i] = card
                    break
        
        # 인덱스 재구성 (캐시 업데이트 후)
        self._rebuild_indexes()
        
        # 캐시가 최신 상태이므로 dirty 플래그를 False로 설정
        # (load()를 호출해도 새로 추가된 카드가 사라지지 않도록)
        self._cache_dirty = False
        
        # 카드 추가/업데이트 시 임시 저장 파일에도 저장 (백그라운드)
        try:
            self._save_cards_to_cache()
        except Exception as e:
            print(f"⚠️ 카드 추가 후 임시 저장 오류: {e}")
        
        return card
    
    def add_history(self, 
                   card_id: str,
                   history_type: str,  # NEW, BUY, SOLD
                   nb_id: Optional[str] = None,
                   generation: Optional[int] = None,
                   qty: float = 0.0,
                   entry_price: float = 0.0,
                   exit_price: float = 0.0,
                   pnl_percent: float = 0.0,
                   pnl_amount: float = 0.0,
                   fee_amount: float = 0.0,
                   memo: str = "",
                   is_simulation: bool = False):
        """
        카드 히스토리 추가
        
        Args:
            card_id: 카드 ID
            history_type: 히스토리 타입 (NEW, BUY, SOLD)
            nb_id: N/B ID (선택사항)
            generation: 중첩 생산 세대 (선택사항)
            qty: 수량
            entry_price: 진입 가격
            exit_price: 청산 가격
            pnl_percent: 손익률 (%)
            pnl_amount: 손익 금액
            fee_amount: 수수료
            memo: 메모
            is_simulation: 모의 거래 여부 (True: 모의, False: 실제)
        """
        # 카드 찾기
        card = self.get_card_by_id(card_id)
        if not card:
            print(f"⚠️ 카드를 찾을 수 없습니다: {card_id}")
            return None
        
        # 히스토리 리스트 초기화 (없으면)
        if 'history_list' not in card:
            card['history_list'] = []
        
        # card_key 가져오기
        card_key = card.get('card_key', '')
        if not card_key:
            # 기존 데이터 호환성
            timeframe = card.get('timeframe', 'unknown')
            nb_id_for_key = nb_id or card.get('nb_id', '')
            if not nb_id_for_key:
                nb_value = card.get('nb_value', 0.0)
                nb_id_for_key = self._generate_nb_id(timeframe, nb_value)
            card_key = self._generate_card_key(timeframe, nb_id_for_key)
            card['card_key'] = card_key
        
        # nb_id가 없으면 가장 최근 NEW 또는 BUY의 nb_id 사용
        if not nb_id:
            for hist in card['history_list']:
                if hist.get('type') in [HistoryType.NEW.value, HistoryType.BUY.value] and hist.get('nb_id'):
                    nb_id = hist.get('nb_id')
                    break
            if not nb_id:
                nb_id = card.get('nb_id', '')
        
        # generation이 없으면 가장 최근 NEW 또는 BUY의 generation 사용
        if generation is None:
            for hist in card['history_list']:
                if hist.get('type') in [HistoryType.NEW.value, HistoryType.BUY.value] and hist.get('generation') is not None:
                    generation = hist.get('generation')
                    break
            if generation is None:
                generation = 1
        
        # 히스토리 항목 생성
        history_item = {
            'history_id': str(uuid.uuid4()),
            'card_key': card_key,
            'generation': generation,
            'type': history_type,
            'nb_id': nb_id,
            'timestamp': datetime.now().isoformat(),
            'entry_price': entry_price,
            'exit_price': exit_price,
            'qty': qty,
            'pnl_percent': pnl_percent,
            'pnl_amount': pnl_amount,
            'fee_amount': fee_amount,
            'memo': memo,
            'is_simulation': is_simulation  # 모의 거래 여부
        }
        
        # 맨 앞에 삽입 (최신 우선)
        card['history_list'].insert(0, history_item)
        
        # 100개 제한 (맨 뒤에서 잘라냄)
        if len(card['history_list']) > self.MAX_HISTORY_PER_CARD:
            card['history_list'] = card['history_list'][:self.MAX_HISTORY_PER_CARD]
        
        # NBverse에 업데이트 저장
        self._update_card_in_nbverse(card)
        
        # 임시 저장 파일에도 저장 (백그라운드)
        try:
            self._save_cards_to_cache()
        except Exception as e:
            print(f"⚠️ 히스토리 추가 후 임시 저장 오류: {e}")
        
        return history_item
    
    def add_buy_history(self, 
                       card_id: str,
                       qty: float,
                       entry_price: float,
                       fee_amount: float = 0.0,
                       nb_id: Optional[str] = None,
                       generation: Optional[int] = None,
                       memo: str = ""):
        """
        매수 히스토리 추가
        
        Args:
            card_id: 카드 ID
            qty: 수량
            entry_price: 진입 가격
            fee_amount: 수수료
            nb_id: N/B ID (선택사항)
            generation: 중첩 생산 세대 (선택사항, 없으면 자동 증가)
            memo: 메모
        """
        card = self.get_card_by_id(card_id)
        if not card:
            return None
        
        # generation이 없으면 가장 최근 generation + 1
        if generation is None:
            max_generation = 0
            for hist in card.get('history_list', []):
                gen = hist.get('generation', 0)
                if gen > max_generation:
                    max_generation = gen
            generation = max_generation + 1
        
        # 첫 매수면 NEW, 그 외는 BUY
        history_list = card.get('history_list', [])
        is_first_buy = len([h for h in history_list if h.get('type') in [HistoryType.NEW.value, HistoryType.BUY.value]]) == 0
        history_type = HistoryType.NEW.value if is_first_buy else HistoryType.BUY.value
        
        return self.add_history(
            card_id=card_id,
            history_type=history_type,
            nb_id=nb_id,
            generation=generation,
            qty=qty,
            entry_price=entry_price,
            fee_amount=fee_amount,
            memo=memo
        )
    
    def add_sold_history(self,
                        card_id: str,
                        exit_price: float,
                        pnl_percent: float,
                        pnl_amount: float,
                        fee_amount: float = 0.0,
                        qty: Optional[float] = None,
                        memo: str = "",
                        is_simulation: bool = False,
                        settings_manager=None):
        """
        판매 완료 히스토리 추가 (SELL 체결 완료 시)
        
        Args:
            card_id: 카드 ID
            exit_price: 청산 가격
            pnl_percent: 손익률 (%)
            pnl_amount: 손익 금액
            fee_amount: 수수료
            qty: 수량 (선택사항, 없으면 가장 최근 BUY의 qty 사용)
            memo: 메모
            is_simulation: 모의 거래 여부 (True: 모의, False: 실제)
            settings_manager: 설정 관리자 (최소 구매 금액 사용용, 선택사항)
        """
        card = self.get_card_by_id(card_id)
        if not card:
            return None
        
        # qty와 entry_price가 없으면 가장 최근 BUY 또는 NEW의 값 사용
        entry_price_for_history = 0.0
        if qty is None:
            for hist in card.get('history_list', []):
                if hist.get('type') in [HistoryType.NEW.value, HistoryType.BUY.value]:
                    if hist.get('qty'):
                        qty = hist.get('qty')
                    if hist.get('entry_price'):
                        entry_price_for_history = hist.get('entry_price')
                    # qty와 entry_price를 모두 찾았으면 중단
                    if qty and entry_price_for_history:
                        break
        
        # entry_price가 0이거나 qty가 0이면 최소 구매 금액 사용
        if (entry_price_for_history == 0 or (qty is not None and qty == 0)) and settings_manager and exit_price > 0:
            min_buy_amount = settings_manager.get("min_buy_amount", 5000)
            if entry_price_for_history == 0:
                entry_price_for_history = exit_price  # exit_price를 entry_price로 사용
            if qty is None or qty == 0:
                qty = min_buy_amount / entry_price_for_history if entry_price_for_history > 0 else 0
        
        # entry_price_for_history가 여전히 0이면 exit_price 사용 (최소한의 값 보장)
        if entry_price_for_history == 0 and exit_price > 0:
            entry_price_for_history = exit_price
        
        # 히스토리 추가 (entry_price도 함께 저장)
        history_item = self.add_history(
            card_id=card_id,
            history_type=HistoryType.SOLD.value,
            qty=qty or 0.0,
            entry_price=entry_price_for_history,  # 가장 최근 BUY/NEW의 entry_price 또는 exit_price 저장
            exit_price=exit_price,
            pnl_percent=pnl_percent,
            pnl_amount=pnl_amount,
            fee_amount=fee_amount,
            memo=memo,
            is_simulation=is_simulation
        )
    
        # SELL 체결 완료 이벤트 발생 시 (규격서에 따름):
        # 1. 히스토리에 SOLD 추가 (위에서 완료)
        # 2. CardState를 GRAY로 변경
        # 3. removal_pending = true로 표시
        # 다음 생산 시점에 cleanup_gray_cards()가 REMOVED로 변경함
        card['card_state'] = CardState.GRAY.value
        card['status'] = CardState.GRAY.value  # 호환성
        card['removal_pending'] = True  # 다음 생산 시점에 REMOVED로 변경 예정
        
        # 점수는 강화학습 AI가 계산하므로 여기서는 계산하지 않음
        # (RLRewardWorker에서 점수 계산 및 업데이트)
        
        # 손실률 체크 및 자동 폐기
        if self._should_auto_discard(card, pnl_percent):
            self._auto_discard_card(card, pnl_percent)
        
        # NBverse에 업데이트
        self._update_card_in_nbverse(card)
        
        print(f"🔴 카드 GRAY 처리 (SELL 완료): {card.get('card_key', 'unknown')} (손익: {pnl_amount:,.0f} KRW)")
        print(f"   → 다음 생산 시점에 REMOVED로 변경되어 생산 카드 탭에서 제거됩니다 (검증 탭에서 확인 가능)")
        
        return history_item
    
    def _rebuild_indexes(self):
        """인덱스 재구성 (캐시 업데이트 시 호출) - 최적화: 딕셔너리 조회 최소화"""
        with self._index_lock:
            self._card_id_index.clear()
            self._card_key_index.clear()
            
            # 최적화: 한 번의 순회로 모든 인덱스 구성
            for card in self.cards_cache:
                card_id = card.get('card_id')
                card_key = card.get('card_key', '')
                
                if card_id:
                    self._card_id_index[card_id] = card
                
                if card_key:
                    # 최적화: setdefault 사용으로 조회 최소화
                    self._card_key_index.setdefault(card_key, []).append(card)
    
    def get_card_by_id(self, card_id: str) -> Optional[Dict]:
        """카드 ID로 카드 찾기 - 인덱스 사용으로 O(1) 조회 (메모리 캐싱 최적화)"""
        # UI 반응성을 위해 load() 호출 제거, 캐시만 사용
        # 캐시가 비어있으면 백그라운드로 로드만 시작 (대기 안 함)
        if not self.cards_cache and not self._loading:
            self.load(background=True)  # 백그라운드로만 시작, 대기 안 함
        
        # 인덱스가 비어있으면 재구성
        if not self._card_id_index and self.cards_cache:
            self._rebuild_indexes()
        
        # 인덱스를 사용한 O(1) 조회
        with self._index_lock:
            return self._card_id_index.get(card_id)
    
    def update_card(self, card_id: str, updates: Dict) -> bool:
        """
        카드 업데이트 (예측 정보 등)
        
        Args:
            card_id: 카드 ID
            updates: 업데이트할 필드 딕셔너리
            
        Returns:
            True: 업데이트 성공, False: 업데이트 실패
        """
        try:
            # 카드 찾기
            card = self.get_card_by_id(card_id)
            if not card:
                print(f"⚠️ 카드를 찾을 수 없습니다: {card_id}")
                return False
            
            # 기존 카드에 업데이트 필드 병합
            card.update(updates)
            
            # NBverse에서 카드 업데이트 (백그라운드)
            self._update_card_in_nbverse(card)
            
            # 인덱스 재구성 (업데이트된 카드 반영)
            self._rebuild_indexes()
            
            return True
        except Exception as e:
            print(f"⚠️ 카드 업데이트 오류: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def remove_card(self, card_id: str) -> bool:
        """
        카드 제거 (즉시 실행)
        
        Args:
            card_id: 카드 ID
            
        Returns:
            True: 제거 성공, False: 제거 실패
        """
        try:
            # 카드 찾기
            card = self.get_card_by_id(card_id)
            if not card:
                print(f"⚠️ 카드를 찾을 수 없습니다: {card_id}")
                return False
            
            # NBverse에서 카드 제거
            self._remove_card_from_nbverse(card_id)
            
            # 캐시에서 제거
            if card in self.cards_cache:
                self.cards_cache.remove(card)
                self._rebuild_indexes()
            
            # 저장
            self._save_cards_to_cache()
            
            print(f"✅ 카드 제거 완료: {card_id}")
            return True
        except Exception as e:
            print(f"⚠️ 카드 제거 오류: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def get_card_history(self, card_id: str) -> List[Dict]:
        """
        카드 히스토리 조회 (최신순)
        
        Args:
            card_id: 카드 ID
        
        Returns:
            히스토리 리스트 (최신순)
        """
        card = self.get_card_by_id(card_id)
        if not card:
            return []
        
        return card.get('history_list', [])
    
    def get_active_cards(self):
        """
        활성 생산 카드만 반환 (ACTIVE, OVERLAP_ACTIVE만) - UI 반응성을 위해 캐시만 사용
        중복 제거: 같은 card_key를 가진 카드가 여러 개 있으면 최신 것만 반환
        검증 완료된 카드(SOLD 히스토리가 있는 카드)는 제외
        """
        # UI 반응성을 위해 load() 호출 제거, 캐시만 사용
        # 캐시가 비어있으면 백그라운드로 로드만 시작 (대기 안 함)
        if not self.cards_cache and not self._loading:
            self.load(background=True)  # 백그라운드로만 시작, 대기 안 함
        
        # 활성 카드 필터링 (최적화: set 사용으로 O(1) 조회)
        active_states = {CardState.ACTIVE.value, CardState.OVERLAP_ACTIVE.value}
        active_cards = [card for card in self.cards_cache 
                       if card.get('card_state') in active_states]
        
        # 검증 완료된 카드 제외 (SOLD 히스토리가 있는 카드는 제외)
        filtered_cards = []
        for card in active_cards:
            history_list = card.get('history_list', [])
            has_sold = any(hist.get('type') == 'SOLD' for hist in history_list)
            if not has_sold:
                filtered_cards.append(card)
        
        # card_key 기준 중복 제거 (같은 card_key를 가진 카드가 여러 개 있으면 최신 것만 유지)
        # 최적화: 딕셔너리 컴프리헨션 스타일로 개선
        cards_by_key = {}
        for card in filtered_cards:
            card_key = card.get('card_key', '')
            if card_key:
                existing_time = cards_by_key.get(card_key, {}).get('production_time', '')
                new_time = card.get('production_time', '')
                if not existing_time or new_time > existing_time:
                    cards_by_key[card_key] = card
        
        # 중복 제거된 카드 리스트 반환 (최신순 정렬)
        result = list(cards_by_key.values())
        result.sort(key=lambda x: x.get('production_time', ''), reverse=True)
        return result
    
    def get_all_cards(self):
        """
        모든 생산 카드 반환 (REMOVED 제외) - UI 반응성을 위해 캐시만 사용
        중복 제거: 같은 card_key를 가진 카드가 여러 개 있으면 최신 것만 반환
        """
        # UI 반응성을 위해 load() 호출 제거, 캐시만 사용
        # 캐시가 비어있으면 백그라운드로 로드만 시작 (대기 안 함)
        if not self.cards_cache and not self._loading:
            self.load(background=True)  # 백그라운드로만 시작, 대기 안 함
        
        # 캐시에서 REMOVED 상태가 아닌 카드만 필터링
        cards = [card for card in self.cards_cache 
                if card.get('card_state') != CardState.REMOVED.value]
        
        # card_key 기준 중복 제거 (같은 card_key를 가진 카드가 여러 개 있으면 최신 것만 유지)
        # 최적화: 딕셔너리 조회 최소화
        cards_by_key = {}
        for card in cards:
            card_key = card.get('card_key', '')
            if card_key:
                existing_time = cards_by_key.get(card_key, {}).get('production_time', '')
                new_time = card.get('production_time', '')
                if not existing_time or new_time > existing_time:
                    cards_by_key[card_key] = card
            else:
                # card_key가 없으면 card_id로 구분
                card_id = card.get('card_id', '')
                if card_id and card_id not in cards_by_key:
                    cards_by_key[card_id] = card
        
        # 중복 제거된 카드 리스트 반환 (최신순 정렬)
        result = list(cards_by_key.values())
        result.sort(key=lambda x: x.get('production_time', ''), reverse=True)
        return result
    
    def _should_auto_discard(self, card: Dict, current_pnl_percent: float) -> bool:
        """
        자동 폐기 여부 판단
        
        Args:
            card: 카드 데이터
            current_pnl_percent: 현재 거래의 손익률 (%)
        
        Returns:
            폐기 여부
        """
        if not self.discarded_card_manager:
            return False
        
        # 현재 거래 손실률이 임계값을 넘으면 폐기
        if current_pnl_percent <= self.AUTO_DISCARD_LOSS_THRESHOLD:
            return True
        
        # 히스토리에서 평균 손실률 계산
        history_list = card.get('history_list', [])
        if not history_list:
            return False
        
        # 최근 10개 거래의 손익률 평균 계산
        recent_pnls = []
        for hist in history_list[:10]:
            pnl = hist.get('pnl_percent')
            if pnl is not None:
                recent_pnls.append(pnl)
        
        if len(recent_pnls) >= 3:  # 최소 3개 거래가 있어야 판단
            avg_pnl = sum(recent_pnls) / len(recent_pnls)
            # 평균 손실률이 임계값을 넘으면 폐기
            if avg_pnl <= self.AUTO_DISCARD_LOSS_THRESHOLD:
                return True
        
        # 연속 손실 체크 (5회 이상 연속 손실)
        consecutive_losses = 0
        for hist in history_list[:10]:
            pnl = hist.get('pnl_percent', 0)
            if pnl < 0:
                consecutive_losses += 1
            else:
                break
        
        if consecutive_losses >= 5:
            return True
        
        return False
    
    def _auto_discard_card(self, card: Dict, pnl_percent: float):
        """
        카드 자동 폐기
        
        Args:
            card: 카드 데이터
            pnl_percent: 현재 거래의 손익률 (%)
        """
        if not self.discarded_card_manager:
            return
        
        try:
            from managers.discarded_card_manager import DiscardReason
            
            # 폐기 사유 상세 정보
            history_list = card.get('history_list', [])
            recent_pnls = [h.get('pnl_percent', 0) for h in history_list[:10] if h.get('pnl_percent') is not None]
            avg_pnl = sum(recent_pnls) / len(recent_pnls) if recent_pnls else 0.0
            
            # 연속 손실 계산
            consecutive_losses = 0
            for hist in history_list[:10]:
                pnl = hist.get('pnl_percent', 0)
                if pnl < 0:
                    consecutive_losses += 1
                else:
                    break
            
            reason_detail = f"자동 폐기: 현재 손익 {pnl_percent:.2f}%, 평균 손익 {avg_pnl:.2f}%, 연속 손실 {consecutive_losses}회"
            
            # 카드 폐기
            self.discarded_card_manager.discard_card(
                card,
                reason=DiscardReason.AUTO_CLEANUP,
                reason_detail=reason_detail
            )
            
            # NBverse에서 카드 제거
            card_id = card.get('card_id')
            if card_id:
                self._remove_card_from_nbverse(card_id)
            
            # 캐시에서 제거
            if card in self.cards_cache:
                self.cards_cache.remove(card)
            
            print(f"🗑️ 자동 폐기: {card.get('card_key', 'unknown')} (손익: {pnl_percent:.2f}%)")
            
        except Exception as e:
            print(f"⚠️ 자동 폐기 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def _load_cards_from_cache(self) -> bool:
        """
        임시 저장 파일에서 카드 로드
        
        Returns:
            True: 로드 성공, False: 파일이 없거나 오류 발생
        """
        try:
            if not os.path.exists(self._cache_file_path):
                return False
            
            with open(self._cache_file_path, 'rb') as f:
                data = _json_loads(f.read())
            
            if not isinstance(data, dict) or 'cards' not in data:
                return False
            
            cards = data.get('cards', [])
            if not isinstance(cards, list):
                return False
            
            # 카드 데이터 검증 및 로드 (card_key 기준 중복 제거)
            cards_dict = {}  # card_key -> 최신 card 매핑
            for card in cards:
                if isinstance(card, dict) and card.get('card_id'):
                    card_key = card.get('card_key', '')
                    if card_key:
                        if card_key not in cards_dict:
                            cards_dict[card_key] = card
                        else:
                            # 생산 시간 비교하여 더 최신 것만 유지
                            existing_time = cards_dict[card_key].get('production_time', '')
                            new_time = card.get('production_time', '')
                            if new_time > existing_time:
                                cards_dict[card_key] = card
                    else:
                        # card_key가 없으면 card_id로 구분
                        card_id = card.get('card_id', '')
                        if card_id:
                            cards_dict[card_id] = card
            
            # 중복 제거된 카드 리스트로 변환
            self.cards_cache = list(cards_dict.values())
            
            # 최신순으로 정렬
            self.cards_cache.sort(key=lambda x: x.get('production_time', ''), reverse=True)
            
            # 인덱스 재구성 (캐시 업데이트 후)
            self._rebuild_indexes()
            
            return len(self.cards_cache) > 0
        except Exception as e:
            print(f"⚠️ 임시 저장 파일 로드 오류: {e}")
            return False
    
    def _save_cards_to_cache(self):
        """임시 저장 파일에 카드 저장 (백그라운드 실행 권장)"""
        try:
            # data 디렉토리 생성
            cache_dir = os.path.dirname(self._cache_file_path)
            if cache_dir and not os.path.exists(cache_dir):
                os.makedirs(cache_dir, exist_ok=True)
            
            # 카드 데이터 저장
            data = {
                'cards': self.cards_cache,
                'saved_at': datetime.now().isoformat()
            }
            
            with open(self._cache_file_path, 'wb') as f:
                f.write(_json_dumps(data, indent=2))
                f.flush()
                os.fsync(f.fileno())
        except Exception as e:
            print(f"⚠️ 임시 저장 파일 저장 오류: {e}")