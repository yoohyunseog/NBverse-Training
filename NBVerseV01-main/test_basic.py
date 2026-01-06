"""
기본 테스트 스크립트
"""

import sys
import os

# 상위 디렉토리를 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from NBverse import TextToNBConverter, calculate_sentence_bits, word_nb_unicode_format


def test_basic():
    """기본 기능 테스트"""
    print("=" * 60)
    print("NBverse 라이브러리 기본 테스트")
    print("=" * 60)
    print()
    
    # 테스트 1: 기본 변환
    print("테스트 1: 기본 문자열 변환")
    print("-" * 60)
    converter = TextToNBConverter(bit=5.5)
    text = "안녕하세요"
    result = converter.text_to_nb(text)
    
    print(f"입력 텍스트: {text}")
    print(f"유니코드 배열: {result['unicodeArray']}")
    print(f"bitMax (상한치): {result['bitMax']:.10f}")
    print(f"bitMin (하한치): {result['bitMin']:.10f}")
    print()
    
    # 테스트 2: 영어 텍스트
    print("테스트 2: 영어 텍스트")
    print("-" * 60)
    text2 = "Hello World"
    result2 = converter.text_to_nb(text2)
    print(f"입력 텍스트: {text2}")
    print(f"bitMax: {result2['bitMax']:.10f}")
    print(f"bitMin: {result2['bitMin']:.10f}")
    print()
    
    # 테스트 3: 직접 함수 사용
    print("테스트 3: calculate_sentence_bits 함수 사용")
    print("-" * 60)
    result3 = calculate_sentence_bits("테스트", bit=5.5)
    print(f"입력: 테스트")
    print(f"bitMax: {result3['bitMax']:.10f}")
    print(f"bitMin: {result3['bitMin']:.10f}")
    print()
    
    # 테스트 4: 유니코드 변환
    print("테스트 4: 유니코드 변환")
    print("-" * 60)
    text4 = "한글ABC123"
    unicode_array = word_nb_unicode_format(text4)
    print(f"입력: {text4}")
    print(f"유니코드 배열: {unicode_array}")
    print()
    
    print("=" * 60)
    print("모든 테스트 완료!")
    print("=" * 60)


if __name__ == "__main__":
    test_basic()

