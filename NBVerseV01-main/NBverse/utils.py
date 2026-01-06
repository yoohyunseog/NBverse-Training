"""
유틸리티 함수 모듈
문자열 처리 및 유니코드 변환 함수
"""


def word_nb_unicode_format(text: str) -> list:
    """문자열을 유니코드 값 배열로 변환
    
    Args:
        text: 변환할 문자열
    
    Returns:
        각 문자의 유니코드 코드 포인트 값 배열
    """
    if not text:
        return []
    
    unicode_array = []
    for char in text:
        # Python의 ord()는 유니코드 코드 포인트를 반환
        # JavaScript의 codePointAt(0)과 동일한 동작
        unicode_value = ord(char)
        unicode_array.append(unicode_value)
    
    return unicode_array


def remove_special_chars_and_spaces(input_text: str) -> str:
    """특수 문자와 공백 제거 ([] 제외)
    
    Args:
        input_text: 입력 문자열
    
    Returns:
        정제된 문자열
    """
    if input_text is None:
        return ''
    
    # 연속된 공백을 하나의 공백으로 치환
    normalized_spaces = ' '.join(input_text.split())
    
    # 특수 문자 제거 ([] 제외)
    # 영문, 숫자, 한글, 공백, [], # 만 허용
    result = ''
    for char in normalized_spaces:
        if (char.isalnum() or 
            '\uAC00' <= char <= '\uD7AF' or  # 한글
            '\u1100' <= char <= '\u11FF' or  # 한글 자모
            '\u3130' <= char <= '\u318F' or  # 한글 호환 자모
            char in [' ', '[', ']', '#']):
            result += char
    
    return result.strip()

