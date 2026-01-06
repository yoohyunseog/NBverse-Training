"""
조회 히스토리 및 타임라인 관리 모듈
"""

import os
import json
from datetime import datetime
from typing import List, Dict, Optional


class QueryHistory:
    """조회 히스토리 관리 클래스"""
    
    def __init__(self, history_file: str = "novel_ai/v1.0.7/data/query_history.json"):
        """
        초기화
        
        Args:
            history_file: 히스토리 파일 경로
        """
        self.history_file = history_file
        self.history_dir = os.path.dirname(history_file)
        
        # 디렉토리 생성
        if self.history_dir:
            os.makedirs(self.history_dir, exist_ok=True)
        
        self.history = self._load_history()
    
    def _load_history(self) -> List[Dict]:
        """히스토리 로드"""
        try:
            if os.path.exists(self.history_file):
                with open(self.history_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
        except Exception as e:
            print(f"히스토리 로드 오류: {e}")
        return []
    
    def _save_history(self):
        """히스토리 저장"""
        try:
            with open(self.history_file, 'w', encoding='utf-8') as f:
                json.dump(self.history, f, ensure_ascii=False, indent=2)
            return True
        except Exception as e:
            print(f"히스토리 저장 오류: {e}")
            return False
    
    def add_query(self, query_text: str, query_type: str = "exact",
                  found: bool = False, result_count: int = 0,
                  similar_results: Optional[List] = None,
                  nb_max: Optional[float] = None,
                  nb_min: Optional[float] = None):
        """
        조회 기록 추가
        
        Args:
            query_text: 조회한 텍스트
            query_type: 조회 타입 ('exact', 'similar', 'range')
            found: 데이터 발견 여부
            result_count: 결과 개수
            similar_results: 유사도 검색 결과 (선택사항)
            nb_max: bitMax 값 (선택사항)
            nb_min: bitMin 값 (선택사항)
        """
        record = {
            'timestamp': datetime.now().isoformat(),
            'query_text': query_text,
            'query_type': query_type,
            'found': found,
            'result_count': result_count,
            'nb_max': nb_max,
            'nb_min': nb_min,
            'similar_results': similar_results[:5] if similar_results else None  # 최대 5개만 저장
        }
        
        self.history.append(record)
        
        # 최대 1000개만 유지 (오래된 것부터 삭제)
        if len(self.history) > 1000:
            self.history = self.history[-1000:]
        
        self._save_history()
    
    def get_timeline(self, limit: int = 50) -> List[Dict]:
        """
        타임라인 조회 (최신순)
        
        Args:
            limit: 최대 반환 개수
        
        Returns:
            타임라인 기록 리스트
        """
        return self.history[-limit:][::-1]  # 최신순
    
    def get_query_history_by_text(self, text: str, limit: int = 10) -> List[Dict]:
        """
        특정 텍스트로 조회한 히스토리
        
        Args:
            text: 조회 텍스트
            limit: 최대 반환 개수
        
        Returns:
            히스토리 리스트
        """
        results = [h for h in self.history if h.get('query_text') == text]
        return results[-limit:][::-1]
    
    def get_statistics(self) -> Dict:
        """
        조회 통계
        
        Returns:
            통계 정보
        """
        total = len(self.history)
        found_count = sum(1 for h in self.history if h.get('found', False))
        similar_count = sum(1 for h in self.history if h.get('query_type') == 'similar')
        
        return {
            'total_queries': total,
            'found_count': found_count,
            'not_found_count': total - found_count,
            'similar_queries': similar_count,
            'exact_queries': total - similar_count,
            'success_rate': (found_count / total * 100) if total > 0 else 0
        }

