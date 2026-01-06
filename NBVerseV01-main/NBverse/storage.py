"""
NBverse 데이터 저장 모듈
max/min 폴더 구조로 데이터를 저장합니다.
"""

import os
import json
from datetime import datetime
from typing import Dict, List, Optional, Tuple
from .calculator import NBValueCalculator
from .converter import TextToNBConverter


def nested_path_from_number(number: int, base_path: str = "data") -> str:
    """
    숫자를 기반으로 중첩된 경로 생성
    예: 12345 -> data/1/2/3/4/5/
    
    Args:
        number: 경로를 생성할 숫자
        base_path: 기본 경로 (기본값: "data")
    
    Returns:
        생성된 경로 문자열
    """
    number_str = str(abs(number))
    path_parts = [base_path] + list(number_str)
    return os.path.join(*path_parts)


class NBverseStorage:
    """NBverse 데이터 저장 클래스 (max/min 폴더 구조)"""
    
    def __init__(self, data_dir: str = "novel_ai/v1.0.7/data", decimal_places: int = 10):
        """
        초기화
        
        Args:
            data_dir: 데이터 디렉토리 경로
            decimal_places: 소수점 자리수 (기본값: 10)
        """
        self.data_dir = data_dir
        self.max_dir = os.path.join(data_dir, "max")
        self.min_dir = os.path.join(data_dir, "min")
        self.decimal_places = decimal_places
        
        # 디렉토리 생성
        os.makedirs(self.max_dir, exist_ok=True)
        os.makedirs(self.min_dir, exist_ok=True)
        
        self.converter = TextToNBConverter(decimal_places=decimal_places)
        self.calculator = NBValueCalculator(decimal_places=decimal_places)
    
    def _get_file_path(self, nb_value: float, folder_type: str = "max") -> str:
        """
        N/B 값에 따라 파일 경로 생성
        예: 0.2604972083 -> max/0/2/6/0/4/9/7/2/0/8/3/
        
        Args:
            nb_value: N/B 값
            folder_type: "max" 또는 "min"
        
        Returns:
            파일 경로
        """
        # N/B 값을 문자열로 변환 (정수 부분 + 소수점 이후)
        # 0.2604972083의 경우: "0" + "2604972083" = "02604972083"
        nb_str = f"{abs(nb_value):.10f}".replace('.', '')  # 소수점 제거하여 문자열로
        
        # 폴더 선택
        base_dir = self.max_dir if folder_type == "max" else self.min_dir
        
        # 중첩된 경로 생성 (문자열 각 자릿수를 폴더로 사용)
        path_parts = [base_dir] + list(nb_str)
        nested_path = os.path.join(*path_parts)
        os.makedirs(nested_path, exist_ok=True)
        
        # 파일명 생성 (타임스탬프 포함)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
        # 파일명에는 원본 nb_value 유지
        filename = f"{nb_value:.10f}_{timestamp}.json"
        
        return os.path.join(nested_path, filename)
    
    def save_text(self, text: str, metadata: Optional[Dict] = None) -> Dict[str, str]:
        """
        텍스트를 N/B 값으로 변환하여 max/min 폴더에 저장
        
        Args:
            text: 저장할 텍스트
            metadata: 추가 메타데이터 (선택사항)
        
        Returns:
            저장된 파일 경로 정보
            {
                'max_path': str,
                'min_path': str,
                'bitMax': float,
                'bitMin': float
            }
        """
        # 텍스트를 N/B 값으로 변환
        result = self.converter.text_to_nb(text)
        bit_max = result['bitMax']
        bit_min = result['bitMin']
        
        # 설정된 소수점 자릿수로 반올림
        bit_max = round(bit_max, self.decimal_places)
        bit_min = round(bit_min, self.decimal_places)
        
        # 데이터 구조 생성
        data = {
            'text': text,
            'nb': {
                'max': bit_max,
                'min': bit_min,
                'unicodeArray': result['unicodeArray']
            },
            'calculated_at': datetime.now().isoformat(),
            'version': 'bitCalculation.v.0.2',
            'decimal_places': self.decimal_places
        }
        
        # 메타데이터 추가
        if metadata:
            data['metadata'] = metadata
        
        # max 폴더에 저장
        max_path = self._get_file_path(bit_max, "max")
        with open(max_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        # min 폴더에 저장
        min_path = self._get_file_path(bit_min, "min")
        with open(min_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        return {
            'max_path': max_path,
            'min_path': min_path,
            'bitMax': bit_max,
            'bitMin': bit_min
        }
    
    def save_nb_values(self, bit_max: float, bit_min: float, 
                      text: Optional[str] = None,
                      metadata: Optional[Dict] = None) -> Dict[str, str]:
        """
        N/B 값(max/min)을 직접 저장
        
        Args:
            bit_max: bitMax 값
            bit_min: bitMin 값
            text: 원본 텍스트 (선택사항)
            metadata: 추가 메타데이터 (선택사항)
        
        Returns:
            저장된 파일 경로 정보
        """
        # 설정된 소수점 자릿수로 반올림
        bit_max = round(bit_max, self.decimal_places)
        bit_min = round(bit_min, self.decimal_places)
        
        # 데이터 구조 생성
        data = {
            'nb': {
                'max': bit_max,
                'min': bit_min
            },
            'calculated_at': datetime.now().isoformat(),
            'version': 'bitCalculation.v.0.2',
            'decimal_places': self.decimal_places
        }
        
        if text:
            data['text'] = text
        
        if metadata:
            data['metadata'] = metadata
        
        # max 폴더에 저장
        max_path = self._get_file_path(bit_max, "max")
        with open(max_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        # min 폴더에 저장
        min_path = self._get_file_path(bit_min, "min")
        with open(min_path, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        
        return {
            'max_path': max_path,
            'min_path': min_path,
            'bitMax': bit_max,
            'bitMin': bit_min
        }
    
    def load_from_path(self, file_path: str) -> Optional[Dict]:
        """
        파일 경로에서 데이터 로드 (빈 파일 및 손상된 파일 처리)
        
        Args:
            file_path: 파일 경로
        
        Returns:
            로드된 데이터 또는 None
        """
        try:
            if not os.path.exists(file_path):
                return None
            
            # 파일 크기 확인
            file_size = os.path.getsize(file_path)
            if file_size == 0:
                print(f"⚠️ 파일이 비어있습니다: {file_path}")
                return None
            
            with open(file_path, 'r', encoding='utf-8') as f:
                content = f.read().strip()
                
            # 빈 내용 체크
            if not content or len(content) == 0:
                print(f"⚠️ 파일 내용이 비어있습니다: {file_path}")
                return None
            
            # JSON 파싱
            try:
                return json.loads(content)
            except json.JSONDecodeError as json_error:
                error_msg = str(json_error)
                if "Expecting value" in error_msg and "line 1 column 1" in error_msg:
                    print(f"⚠️ 파일이 비어있거나 손상되었습니다: {file_path}")
                else:
                    print(f"⚠️ JSON 파싱 오류 ({file_path}): {error_msg}")
                return None
        except Exception as e:
            error_msg = str(e)
            if "Expecting value" in error_msg or "line 1 column 1" in error_msg:
                print(f"⚠️ 파일 로드 오류 (빈 파일): {file_path}")
            else:
                print(f"⚠️ 파일 로드 오류 ({file_path}): {error_msg}")
        return None
    
    def find_by_nb_value(self, nb_value: float, folder_type: str = "max", 
                        limit: int = 10) -> List[Dict]:
        """
        N/B 값으로 파일 검색
        
        Args:
            nb_value: 검색할 N/B 값
            folder_type: "max" 또는 "min"
            limit: 최대 반환 개수
        
        Returns:
            검색된 파일 데이터 리스트
        """
        # N/B 값을 정수로 변환
        nb_int = int(abs(nb_value) * 1000000)
        
        # 중첩된 경로 생성
        base_dir = self.max_dir if folder_type == "max" else self.min_dir
        search_path = nested_path_from_number(nb_int, base_dir)
        
        results = []
        
        if os.path.exists(search_path):
            # 해당 경로의 모든 JSON 파일 검색
            for filename in os.listdir(search_path):
                if filename.endswith('.json'):
                    file_path = os.path.join(search_path, filename)
                    data = self.load_from_path(file_path)
                    if data:
                        results.append({
                            'path': file_path,
                            'data': data
                        })
        
        # 정렬 (최신순)
        results.sort(key=lambda x: x['data'].get('calculated_at', ''), reverse=True)
        
        return results[:limit]
    
    def find_similar_by_nb_range(self, nb_max: float, nb_min: float,
                                 range_threshold: float = 0.5, limit: int = 50) -> List[Dict]:
        """
        N/B 값 범위로 검색 (유사도 검색용)
        
        Args:
            nb_max: bitMax 값
            nb_min: bitMin 값
            range_threshold: 범위 임계값 (기본값: 0.5)
            limit: 최대 반환 개수
        
        Returns:
            검색된 파일 데이터 리스트
        """
        # 범위 계산
        max_min = nb_max - range_threshold
        max_max = nb_max + range_threshold
        min_min = nb_min - range_threshold
        min_max = nb_min + range_threshold
        
        results = []
        
        # max 폴더에서 검색
        max_results = self._search_in_range(self.max_dir, max_min, max_max, limit)
        # min 폴더에서 검색
        min_results = self._search_in_range(self.min_dir, min_min, min_max, limit)
        
        # 중복 제거 (같은 파일이 max/min에 모두 있을 수 있음)
        seen_paths = set()
        for result in max_results + min_results:
            path = result['path']
            if path not in seen_paths:
                seen_paths.add(path)
                results.append(result)
        
        return results[:limit]
    
    def _search_in_range(self, base_dir: str, min_val: float, max_val: float, limit: int) -> List[Dict]:
        """범위 내에서 검색"""
        results = []
        
        if not os.path.exists(base_dir):
            return results
        
        # 범위 내의 모든 가능한 경로 검색
        min_int = int(abs(min_val) * 1000000)
        max_int = int(abs(max_val) * 1000000)
        
        # 검색 범위를 좁히기 위해 상위 디렉토리부터 검색
        for root, dirs, files in os.walk(base_dir):
            for filename in files:
                if filename.endswith('.json') and filename.startswith(str(min_int)[:3]):
                    try:
                        # 파일명에서 N/B 값 추출
                        nb_int = int(filename.split('_')[0])
                        nb_val = nb_int / 1000000.0
                        
                        if min_val <= nb_val <= max_val:
                            file_path = os.path.join(root, filename)
                            data = self.load_from_path(file_path)
                            if data:
                                results.append({
                                    'path': file_path,
                                    'data': data
                                })
                    except:
                        pass
        
        return results

