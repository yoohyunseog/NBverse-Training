"""파일 I/O 관련 워커 클래스들"""
from PyQt6.QtCore import QThread, pyqtSignal
import os
import json
from typing import Dict, Optional, List


class CardUpdateWorker(QThread):
    """카드 업데이트를 백그라운드에서 실행하는 워커 스레드"""
    update_completed = pyqtSignal(bool)  # 업데이트 완료 시그널 (성공 여부)
    error_occurred = pyqtSignal(str)  # 오류 발생 시그널
    
    def __init__(self, nbverse_storage, card: Dict):
        super().__init__()
        self.nbverse_storage = nbverse_storage
        self.card = card
    
    def run(self):
        """백그라운드에서 실행"""
        try:
            if not self.nbverse_storage:
                self.update_completed.emit(False)
                return
            
            card_id = self.card.get('card_id')
            if not card_id:
                self.update_completed.emit(False)
                return
            
            # 기존 파일 찾기
            found_files = []
            for base_dir in [self.nbverse_storage.max_dir, self.nbverse_storage.min_dir]:
                if not os.path.exists(base_dir):
                    continue
                
                for root, dirs, files in os.walk(base_dir):
                    for filename in files:
                        if filename.endswith('.json'):
                            file_path = os.path.join(root, filename)
                            try:
                                data = self.nbverse_storage.load_from_path(file_path)
                                if data and data.get('metadata', {}).get('card_id') == card_id:
                                    found_files.append(file_path)
                            except:
                                pass
            
            # 모든 파일 업데이트
            for file_path in found_files:
                try:
                    data = self.nbverse_storage.load_from_path(file_path)
                    if data and data.get('metadata'):
                        # metadata 업데이트
                        metadata = data['metadata']
                        from managers.production_card_manager import CardState
                        
                        metadata.update({
                            'card_id': self.card.get('card_id'),
                            'card_key': self.card.get('card_key'),
                            'timeframe': self.card.get('timeframe'),
                            'nb_value': self.card.get('nb_value'),
                            'nb_id': self.card.get('nb_id'),
                            'card_type_detail': self.card.get('card_type', 'normal'),
                            'card_state': self.card.get('card_state', CardState.ACTIVE.value),
                            'status': self.card.get('card_state', CardState.ACTIVE.value),
                            'removal_pending': self.card.get('removal_pending', False),
                            'production_time': self.card.get('production_time'),
                            'chart_data': self.card.get('chart_data', {}),
                            'history_list': self.card.get('history_list', []),
                            'bit_max': self.card.get('nb_max'),
                            'bit_min': self.card.get('nb_min'),
                            'nb_max': self.card.get('nb_max'),
                            'nb_min': self.card.get('nb_min')
                        })
                        
                        # 파일 저장
                        with open(file_path, 'w', encoding='utf-8') as f:
                            json.dump(data, f, ensure_ascii=False, indent=2)
                            f.flush()
                            os.fsync(f.fileno())
                except Exception as e:
                    print(f"⚠️ 카드 업데이트 오류: {e}")
            
            self.update_completed.emit(len(found_files) > 0)
        except Exception as e:
            self.error_occurred.emit(f"카드 업데이트 오류: {str(e)}")
            self.update_completed.emit(False)


class CardRemoveWorker(QThread):
    """카드 제거를 백그라운드에서 실행하는 워커 스레드"""
    remove_completed = pyqtSignal(bool)  # 제거 완료 시그널 (성공 여부)
    error_occurred = pyqtSignal(str)  # 오류 발생 시그널
    
    def __init__(self, nbverse_storage, card_id: str):
        super().__init__()
        self.nbverse_storage = nbverse_storage
        self.card_id = card_id
    
    def run(self):
        """백그라운드에서 실행"""
        try:
            if not self.nbverse_storage:
                self.remove_completed.emit(False)
                return
            
            removed_count = 0
            # max/min 폴더에서 해당 card_id를 가진 파일 찾아서 삭제
            for base_dir in [self.nbverse_storage.max_dir, self.nbverse_storage.min_dir]:
                if not os.path.exists(base_dir):
                    continue
                
                for root, dirs, files in os.walk(base_dir):
                    for filename in files:
                        if filename.endswith('.json'):
                            file_path = os.path.join(root, filename)
                            try:
                                data = self.nbverse_storage.load_from_path(file_path)
                                if data and data.get('metadata', {}).get('card_id') == self.card_id:
                                    os.remove(file_path)
                                    removed_count += 1
                            except:
                                pass
            
            self.remove_completed.emit(removed_count > 0)
        except Exception as e:
            self.error_occurred.emit(f"카드 제거 오류: {str(e)}")
            self.remove_completed.emit(False)

