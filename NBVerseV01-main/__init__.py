"""
NBverse - 문자를 N/B 값으로 변환하는 라이브러리
JavaScript bitCalculation.v.0.2.js 기반 구현

간단한 사용 예제:
    >>> from NBverse import TextToNBConverter
    >>> converter = TextToNBConverter()
    >>> result = converter.text_to_nb("안녕하세요")
    >>> print(result['bitMax'], result['bitMin'])
"""

from .calculator import NBValueCalculator
from .converter import TextToNBConverter, calculate_sentence_bits
from .utils import word_nb_unicode_format
from .storage import NBverseStorage, nested_path_from_number
from .config import NBverseConfig
from .similarity import (
    calculate_nb_similarity,
    calculate_text_similarity,
    calculate_hybrid_similarity,
    find_similar_items
)
from .history import QueryHistory
from .compact_storage import NBverseCompactStorage
from .hybrid_storage import NBverseHybridStorage

__version__ = '0.2.1'
__author__ = 'yoohyunseog'
__email__ = 'yoohyunseog@users.noreply.github.com'

# 주요 클래스 및 함수 (간단한 임포트를 위해)
__all__ = [
    # 버전 정보
    '__version__',
    
    # 핵심 클래스
    'NBValueCalculator',
    'TextToNBConverter',
    'NBverseStorage',
    'NBverseConfig',
    'QueryHistory',
    
    # 주요 함수
    'calculate_sentence_bits',
    'word_nb_unicode_format',
    'nested_path_from_number',
    
    # 유사도 함수
    'calculate_nb_similarity',
    'calculate_text_similarity',
    'calculate_hybrid_similarity',
    'find_similar_items',
    
    # 컴팩트 저장소
    'NBverseCompactStorage',
    
    # 하이브리드 저장소
    'NBverseHybridStorage',
]

# 편의 함수 (간단한 사용을 위해)
def convert_text(text: str, bit: float = 5.5, decimal_places: int = 10) -> dict:
    """
    텍스트를 N/B 값으로 변환 (편의 함수)
    
    Args:
        text: 변환할 텍스트
        bit: 기본 비트 값 (기본값: 5.5)
        decimal_places: 소수점 자리수 (기본값: 10)
    
    Returns:
        {
            'bitMax': float,
            'bitMin': float,
            'unicodeArray': list
        }
    
    Example:
        >>> from NBverse import convert_text
        >>> result = convert_text("안녕하세요")
        >>> print(result['bitMax'])
    """
    converter = TextToNBConverter(bit=bit, decimal_places=decimal_places)
    return converter.text_to_nb(text)


def save_text(text: str, data_dir: str = "novel_ai/v1.0.7/data", 
              metadata: dict = None) -> dict:
    """
    텍스트를 저장 (편의 함수)
    
    Args:
        text: 저장할 텍스트
        data_dir: 데이터 디렉토리 경로
        metadata: 추가 메타데이터 (선택사항)
    
    Returns:
        저장 결과 딕셔너리
    
    Example:
        >>> from NBverse import save_text
        >>> result = save_text("안녕하세요")
        >>> print(result['max_path'])
    """
    storage = NBverseStorage(data_dir=data_dir)
    return storage.save_text(text, metadata=metadata)


def add_text_compact(text: str, data_file: str = "novel_ai/v1.0.7/data/nbverse_data.json",
                     max_items: int = 25, metadata: dict = None) -> dict:
    """
    텍스트를 컴팩트 저장소에 추가 (편의 함수)
    - 단일 JSON 파일에 최대 25개 유지
    - 1개씩 추가되면 가장 오래된 것 제거 (FIFO)
    - 타임스탬프와 히스토리 자동 생성
    
    Args:
        text: 저장할 텍스트
        data_file: 데이터 파일 경로
        max_items: 최대 유지할 항목 개수 (기본값: 25)
        metadata: 추가 메타데이터 (선택사항)
    
    Returns:
        추가된 항목 정보
    
    Example:
        >>> from NBverse import add_text_compact
        >>> result = add_text_compact("테스트 1")
        >>> print(result['id'], result['timestamp'])
    """
    storage = NBverseCompactStorage(data_file=data_file, max_items=max_items)
    return storage.add_text(text, metadata=metadata)

