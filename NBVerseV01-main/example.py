"""
NBverse 라이브러리 사용 예제
"""

import sys
import os

# 상위 디렉토리를 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from NBverse import TextToNBConverter, calculate_sentence_bits, word_nb_unicode_format


def example_basic_usage():
    """기본 사용 예제"""
    print("=" * 50)
    print("기본 사용 예제")
    print("=" * 50)
    
    # 방법 1: TextToNBConverter 클래스 사용
    converter = TextToNBConverter(bit=5.5)
    
    text = "안녕하세요"
    result = converter.text_to_nb(text)
    
    print(f"입력 텍스트: {text}")
    print(f"유니코드 배열: {result['unicodeArray']}")
    print(f"bitMax (상한치): {result['bitMax']}")
    print(f"bitMin (하한치): {result['bitMin']}")
    print()


def example_direct_function():
    """직접 함수 사용 예제"""
    print("=" * 50)
    print("직접 함수 사용 예제")
    print("=" * 50)
    
    # 방법 2: calculate_sentence_bits 함수 직접 사용
    sentence = "Hello World"
    result = calculate_sentence_bits(sentence, bit=5.5)
    
    print(f"입력 문장: {sentence}")
    print(f"bitMax: {result['bitMax']}")
    print(f"bitMin: {result['bitMin']}")
    print()


def example_unicode_format():
    """유니코드 변환 예제"""
    print("=" * 50)
    print("유니코드 변환 예제")
    print("=" * 50)
    
    text = "한글ABC123"
    unicode_array = word_nb_unicode_format(text)
    
    print(f"입력 텍스트: {text}")
    print(f"유니코드 배열: {unicode_array}")
    print(f"각 문자별 유니코드:")
    for i, (char, unicode_val) in enumerate(zip(text, unicode_array)):
        print(f"  '{char}' -> {unicode_val} (0x{unicode_val:X})")
    print()


def example_multiple_texts():
    """여러 텍스트 비교 예제"""
    print("=" * 50)
    print("여러 텍스트 비교 예제")
    print("=" * 50)
    
    texts = [
        "안녕하세요",
        "Hello",
        "こんにちは",
        "123456",
        "한글ABC123"
    ]
    
    converter = TextToNBConverter()
    
    for text in texts:
        result = converter.text_to_nb(text)
        print(f"텍스트: {text}")
        print(f"  bitMax: {result['bitMax']:.10f}")
        print(f"  bitMin: {result['bitMin']:.10f}")
        print()


def example_long_text():
    """긴 텍스트 처리 예제"""
    print("=" * 50)
    print("긴 텍스트 처리 예제")
    print("=" * 50)
    
    long_text = "이것은 좀 더 긴 텍스트입니다. 여러 문자가 포함되어 있어서 N/B 값 계산이 더 복잡해집니다."
    
    converter = TextToNBConverter()
    result = converter.text_to_nb(long_text)
    
    print(f"입력 텍스트 길이: {len(long_text)} 문자")
    print(f"유니코드 배열 길이: {len(result['unicodeArray'])}")
    print(f"bitMax: {result['bitMax']:.10f}")
    print(f"bitMin: {result['bitMin']:.10f}")
    print()


if __name__ == "__main__":
    # 모든 예제 실행
    example_basic_usage()
    example_direct_function()
    example_unicode_format()
    example_multiple_texts()
    example_long_text()
    
    print("=" * 50)
    print("모든 예제 실행 완료!")
    print("=" * 50)

