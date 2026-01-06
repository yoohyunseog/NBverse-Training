"""
NBverse 컴팩트 저장소 모듈
단일 JSON 파일에 최대 25개 데이터 유지 (FIFO 방식)
"""

import os
import json
from datetime import datetime
from typing import Dict, List, Optional
from .calculator import NBValueCalculator
from .converter import TextToNBConverter


class NBverseCompactStorage:
    """NBverse 컴팩트 저장소 클래스 (단일 JSON 파일, 최대 25개 유지)"""
    
    def __init__(self, data_file: str = "novel_ai/v1.0.7/data/nbverse_data.json", 
                 max_items: int = 25, decimal_places: int = 10):
        """
        초기화
        
        Args:
            data_file: 데이터 파일 경로
            max_items: 최대 유지할 항목 개수 (기본값: 25)
            decimal_places: 소수점 자리수 (기본값: 10)
        """
        self.data_file = data_file
        self.max_items = max_items
        self.decimal_places = decimal_places
        
        # 디렉토리 생성
        data_dir = os.path.dirname(data_file)
        if data_dir:
            os.makedirs(data_dir, exist_ok=True)
        
        self.converter = TextToNBConverter(decimal_places=decimal_places)
        self.calculator = NBValueCalculator(decimal_places=decimal_places)
        
        # 데이터 로드
        self.data = self._load_data()
    
    def _load_data(self) -> Dict:
        """데이터 파일 로드"""
        default_data = {
            'version': '0.2.0',
            'max_items': self.max_items,
            'items': [],
            'history': [],
            'created_at': datetime.now().isoformat(),
            'last_updated': datetime.now().isoformat()
        }
        
        try:
            if os.path.exists(self.data_file):
                with open(self.data_file, 'r', encoding='utf-8') as f:
                    loaded_data = json.load(f)
                    # 기본 구조 보장
                    if 'items' not in loaded_data:
                        loaded_data['items'] = []
                    if 'history' not in loaded_data:
                        loaded_data['history'] = []
                    if 'max_items' not in loaded_data:
                        loaded_data['max_items'] = self.max_items
                    return loaded_data
        except Exception as e:
            print(f"데이터 로드 오류: {e}")
        
        return default_data
    
    def _save_data(self):
        """데이터 파일 저장"""
        try:
            self.data['last_updated'] = datetime.now().isoformat()
            with open(self.data_file, 'w', encoding='utf-8') as f:
                json.dump(self.data, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"데이터 저장 오류: {e}")
            return False
    
    def add_text(self, text: str, metadata: Optional[Dict] = None) -> Dict:
        """
        텍스트를 추가 (1개씩)
        
        Args:
            text: 저장할 텍스트
            metadata: 추가 메타데이터 (선택사항)
        
        Returns:
            추가된 항목 정보
        """
        # N/B 값 계산
        result = self.converter.text_to_nb(text)
        bit_max = result['bitMax']
        bit_min = result['bitMin']
        
        # 타임스탬프 생성
        timestamp = datetime.now().isoformat()
        
        # 새 항목 생성
        new_item = {
            'id': f"{int(datetime.now().timestamp() * 1000000)}",
            'timestamp': timestamp,
            'text': text,
            'nb': {
                'max': round(bit_max, self.decimal_places),
                'min': round(bit_min, self.decimal_places),
                'unicodeArray': result['unicodeArray']
            },
            'version': 'bitCalculation.v.0.2',
            'decimal_places': self.decimal_places
        }
        
        if metadata:
            new_item['metadata'] = metadata
        
        # items 배열에 추가 (맨 뒤에)
        self.data['items'].append(new_item)
        
        # 25개 초과 시 가장 오래된 것 제거 (FIFO)
        if len(self.data['items']) > self.max_items:
            removed_item = self.data['items'].pop(0)  # 맨 앞 제거
            # 히스토리에 제거 기록
            self._add_history('remove', removed_item.get('text'), 
                           removed_item.get('id'), metadata={'reason': 'max_items_exceeded'})
        
        # 히스토리에 추가 기록
        self._add_history('add', text, new_item['id'], 
                         metadata={'bitMax': bit_max, 'bitMin': bit_min})
        
        # 파일 저장
        self._save_data()
        
        return {
            'id': new_item['id'],
            'timestamp': timestamp,
            'text': text,
            'bitMax': bit_max,
            'bitMin': bit_min,
            'total_items': len(self.data['items'])
        }
    
    def _add_history(self, action: str, text: str, item_id: str = None, 
                    metadata: Optional[Dict] = None):
        """
        히스토리에 기록 추가
        
        Args:
            action: 작업 타입 ('add', 'remove', 'query', 'update')
            text: 관련 텍스트
            item_id: 항목 ID (선택사항)
            metadata: 추가 메타데이터 (선택사항)
        """
        history_entry = {
            'timestamp': datetime.now().isoformat(),
            'action': action,
            'text': text,
            'item_id': item_id
        }
        
        if metadata:
            history_entry['metadata'] = metadata
        
        self.data['history'].append(history_entry)
        
        # 히스토리도 최대 100개로 제한 (오래된 것부터 삭제)
        if len(self.data['history']) > 100:
            self.data['history'] = self.data['history'][-100:]
    
    def get_items(self, limit: Optional[int] = None) -> List[Dict]:
        """
        저장된 항목 조회
        
        Args:
            limit: 최대 반환 개수 (None이면 전체)
        
        Returns:
            항목 리스트 (최신순)
        """
        items = self.data.get('items', [])
        if limit:
            return items[-limit:][::-1]  # 최신순
        return items[::-1]  # 최신순
    
    def get_history(self, limit: int = 50) -> List[Dict]:
        """
        히스토리 조회
        
        Args:
            limit: 최대 반환 개수
        
        Returns:
            히스토리 리스트 (최신순)
        """
        history = self.data.get('history', [])
        return history[-limit:][::-1]  # 최신순
    
    def find_by_text(self, text: str) -> Optional[Dict]:
        """
        텍스트로 항목 검색
        
        Args:
            text: 검색할 텍스트
        
        Returns:
            찾은 항목 또는 None
        """
        items = self.data.get('items', [])
        for item in items:
            if item.get('text') == text:
                return item
        return None
    
    def find_by_id(self, item_id: str) -> Optional[Dict]:
        """
        ID로 항목 검색
        
        Args:
            item_id: 항목 ID
        
        Returns:
            찾은 항목 또는 None
        """
        items = self.data.get('items', [])
        for item in items:
            if item.get('id') == item_id:
                return item
        return None
    
    def get_statistics(self) -> Dict:
        """
        통계 정보 조회
        
        Returns:
            통계 정보
        """
        items = self.data.get('items', [])
        history = self.data.get('history', [])
        
        return {
            'total_items': len(items),
            'max_items': self.max_items,
            'total_history': len(history),
            'created_at': self.data.get('created_at'),
            'last_updated': self.data.get('last_updated')
        }
    
    def clear_all(self):
        """모든 데이터 삭제"""
        self.data['items'] = []
        self.data['history'] = []
        self._add_history('clear', 'all', metadata={'reason': 'manual_clear'})
        self._save_data()

