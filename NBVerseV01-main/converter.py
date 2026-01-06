"""
문자열을 N/B 값으로 변환하는 모듈
"""

from .calculator import NBValueCalculator
from .utils import word_nb_unicode_format


class TextToNBConverter:
    """문자열을 N/B 값으로 변환하는 클래스"""
    
    def __init__(self, bit: float = 5.5, decimal_places: int = 10):
        """초기화
        
        Args:
            bit: 기본 비트 값 (기본값: 5.5)
            decimal_places: 소수점 자리수 (기본값: 10)
        """
        self.calculator = NBValueCalculator(decimal_places=decimal_places)
        self.bit = bit
        self.decimal_places = decimal_places
    
    def text_to_nb(self, text: str) -> dict:
        """문자열을 N/B 값으로 변환
        
        Args:
            text: 변환할 문자열
        
        Returns:
            {
                'bitMax': float,  # 시간 순방향 분석 결과 (상한치)
                'bitMin': float,  # 시간 역방향 분석 결과 (하한치)
                'unicodeArray': list  # 유니코드 배열
            }
        """
        if not text:
            return {
                'bitMax': 0.0,
                'bitMin': 0.0,
                'unicodeArray': []
            }
        
        # 문자열을 유니코드 배열로 변환
        unicode_array = word_nb_unicode_format(text)
        
        if len(unicode_array) < 2:
            return {
                'bitMax': 0.0,
                'bitMin': 0.0,
                'unicodeArray': unicode_array
            }
        
        # N/B 값 계산
        bit_max = self.calculator.bit_max_nb(unicode_array, self.bit)
        bit_min = self.calculator.bit_min_nb(unicode_array, self.bit)
        
        return {
            'bitMax': bit_max,
            'bitMin': bit_min,
            'unicodeArray': unicode_array
        }
    
    def calculate_sentence_bits(self, sentence: str) -> dict:
        """문장의 N/B 값 계산 (별칭 함수)
        
        Args:
            sentence: 계산할 문장
        
        Returns:
            {
                'bitMax': float,
                'bitMin': float,
                'unicodeArray': list
            }
        """
        return self.text_to_nb(sentence)


def calculate_sentence_bits(sentence: str, bit: float = 5.5) -> dict:
    """문장의 N/B 값 계산 (편의 함수)
    
    Args:
        sentence: 계산할 문장
        bit: 기본 비트 값 (기본값: 5.5)
    
    Returns:
        {
            'bitMax': float,
            'bitMin': float,
            'unicodeArray': list
        }
    """
    converter = TextToNBConverter(bit)
    return converter.calculate_sentence_bits(sentence)

