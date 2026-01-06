"""
NBverse 하이브리드 저장소 모듈
컴팩트 저장소는 경로만 저장, 실제 데이터는 Verse 저장소에서 로드
"""

import os
import sys
import json
from datetime import datetime
from typing import Dict, List, Optional

# 상대 import 지원
try:
    from .compact_storage import NBverseCompactStorage
    from .storage import NBverseStorage, nested_path_from_number
except ImportError:
    # 직접 실행 시 절대 import
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.insert(0, current_dir)
    from compact_storage import NBverseCompactStorage
    from storage import NBverseStorage, nested_path_from_number


class NBverseHybridStorage:
    """NBverse 하이브리드 저장소 클래스"""
    
    def __init__(self, 
                 compact_file: str = "data/nbverse/nbverse_data.json",
                 verse_data_dir: str = "data/nbverse",
                 max_items: int = 25,
                 decimal_places: int = 10):
        """
        초기화
        
        Args:
            compact_file: 컴팩트 저장소 파일 경로
            verse_data_dir: Verse 저장소 디렉토리 경로
            max_items: 최대 유지할 항목 개수 (기본값: 25)
            decimal_places: 소수점 자리수 (기본값: 10)
        """
        self.compact_file = compact_file
        self.verse_data_dir = verse_data_dir
        self.max_items = max_items
        self.decimal_places = decimal_places
        
        # 컴팩트 저장소 초기화 (경로 정보만 저장)
        self.compact_storage = NBverseCompactStorage(
            data_file=compact_file,
            max_items=max_items,
            decimal_places=decimal_places
        )
        
        # Verse 저장소 초기화 (실제 데이터 저장)
        self.verse_storage = NBverseStorage(
            data_dir=verse_data_dir,
            decimal_places=decimal_places
        )
    
    def _calculate_path(self, nb_value: float, folder_type: str = "max") -> str:
        """
        N/B 값으로 경로 계산
        
        Args:
            nb_value: N/B 값
            folder_type: "max" 또는 "min"
        
        Returns:
            계산된 경로
        """
        nb_int = int(abs(nb_value) * 1000000)
        base_dir = os.path.join(self.verse_data_dir, folder_type)
        return nested_path_from_number(nb_int, base_dir)
    
    def save_text(self, text: str, metadata: Optional[Dict] = None) -> Dict:
        """
        텍스트 저장 (하이브리드 방식)
        
        Args:
            text: 저장할 텍스트
            metadata: 추가 메타데이터 (선택사항)
        
        Returns:
            저장 결과
        """
        # 1. Verse 저장소에 실제 데이터 저장
        verse_result = self.verse_storage.save_text(text, metadata=metadata)
        
        # 2. 컴팩트 저장소에 경로 정보만 저장
        path_info = {
            'max_path': verse_result['max_path'],
            'min_path': verse_result['min_path'],
            'nb_max': verse_result['bitMax'],
            'nb_min': verse_result['bitMin']
        }
        
        # 경로 정보를 메타데이터에 추가
        compact_metadata = {
            'verse_max_path': verse_result['max_path'],
            'verse_min_path': verse_result['min_path'],
            **(metadata or {})
        }
        
        # 컴팩트 저장소에 경로 정보만 저장
        compact_result = self.compact_storage.add_text(text, metadata=compact_metadata)
        
        return {
            'id': compact_result['id'],
            'timestamp': compact_result['timestamp'],
            'text': text,
            'bitMax': verse_result['bitMax'],
            'bitMin': verse_result['bitMin'],
            'verse_max_path': verse_result['max_path'],
            'verse_min_path': verse_result['min_path'],
            'total_items': compact_result['total_items']
        }
    
    def find_by_nb_value(self, nb_value: float, folder_type: str = "max", 
                        limit: int = 10) -> List[Dict]:
        """
        N/B 값으로 검색 (하이브리드 방식)
        
        Args:
            nb_value: 검색할 N/B 값
            folder_type: "max" 또는 "min"
            limit: 최대 반환 개수
        
        Returns:
            검색된 데이터 리스트
        """
        # 1. 컴팩트 저장소에서 경로 정보 조회
        path = self._calculate_path(nb_value, folder_type)
        
        # 2. Verse 저장소에서 실제 데이터 로드
        verse_results = self.verse_storage.find_by_nb_value(
            nb_value, folder_type, limit
        )
        
        return verse_results
    
    def find_by_path(self, path: str) -> Optional[Dict]:
        """
        경로로 데이터 검색
        
        Args:
            path: 파일 경로
        
        Returns:
            로드된 데이터 또는 None
        """
        return self.verse_storage.load_from_path(path)
    
    def search_hybrid(self, nb_value: float, folder_type: str = "max", 
                     limit: int = 10) -> List[Dict]:
        """
        하이브리드 검색: 컴팩트 저장소에서 경로 조회 → Verse 저장소에서 데이터 로드
        
        Args:
            nb_value: 검색할 N/B 값
            folder_type: "max" 또는 "min"
            limit: 최대 반환 개수
        
        Returns:
            검색된 데이터 리스트
        """
        results = []
        
        # 1. 컴팩트 저장소에서 경로 정보만 조회
        compact_items = self.compact_storage.get_items(limit=limit)
        
        for item in compact_items:
            nb_data = item.get('nb', {})
            item_nb_max = nb_data.get('max')
            item_nb_min = nb_data.get('min')
            
            # N/B 값이 일치하는지 확인
            if folder_type == "max" and abs(item_nb_max - nb_value) < 0.0001:
                # 경로 정보 가져오기
                metadata = item.get('metadata', {})
                verse_path = metadata.get('verse_max_path')
                
                if verse_path:
                    # 2. Verse 저장소에서 실제 데이터 로드
                    data = self.find_by_path(verse_path)
                    if data:
                        results.append({
                            'path': verse_path,
                            'data': data,
                            'compact_info': item
                        })
            elif folder_type == "min" and abs(item_nb_min - nb_value) < 0.0001:
                metadata = item.get('metadata', {})
                verse_path = metadata.get('verse_min_path')
                
                if verse_path:
                    data = self.find_by_path(verse_path)
                    if data:
                        results.append({
                            'path': verse_path,
                            'data': data,
                            'compact_info': item
                        })
        
        return results[:limit]
    
    def get_items(self, limit: Optional[int] = None) -> List[Dict]:
        """
        저장된 항목 조회 (하이브리드 방식)
        
        Args:
            limit: 최대 반환 개수
        
        Returns:
            항목 리스트 (실제 데이터 포함)
        """
        results = []
        
        # 컴팩트 저장소에서 경로 정보 조회
        compact_items = self.compact_storage.get_items(limit=limit)
        
        for item in compact_items:
            metadata = item.get('metadata', {})
            verse_max_path = metadata.get('verse_max_path')
            
            # Verse 저장소에서 실제 데이터 로드
            if verse_max_path:
                data = self.find_by_path(verse_max_path)
                if data:
                    results.append({
                        'id': item.get('id'),
                        'timestamp': item.get('timestamp'),
                        'text': item.get('text'),
                        'nb': item.get('nb'),
                        'data': data,  # 실제 데이터
                        'verse_path': verse_max_path
                    })
        
        return results
    
    def get_statistics(self) -> Dict:
        """
        통계 정보 조회
        
        Returns:
            통계 정보
        """
        compact_stats = self.compact_storage.get_statistics()
        
        return {
            **compact_stats,
            'storage_type': 'hybrid',
            'compact_file': self.compact_file,
            'verse_data_dir': self.verse_data_dir
        }

