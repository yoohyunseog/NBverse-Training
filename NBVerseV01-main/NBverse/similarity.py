"""
유사도 계산 모듈
N/B 값 기반 및 텍스트 기반 유사도 계산
"""

import math
from typing import Dict, Tuple


def calculate_nb_similarity(input_max: float, input_min: float,
                            stored_max: float, stored_min: float) -> float:
    """
    N/B 값 기반 유사도 계산
    
    Args:
        input_max: 입력 텍스트의 bitMax
        input_min: 입력 텍스트의 bitMin
        stored_max: 저장된 데이터의 bitMax
        stored_min: 저장된 데이터의 bitMin
    
    Returns:
        유사도 (0.0 ~ 1.0, 1.0이 가장 유사)
    """
    # 절대 차이 계산
    max_diff = abs(input_max - stored_max)
    min_diff = abs(input_min - stored_min)
    
    # 최대 차이 계산 (입력값의 범위 기반)
    max_range = max(abs(input_max), abs(input_min), abs(stored_max), abs(stored_min))
    if max_range == 0:
        return 1.0  # 둘 다 0이면 완전 일치
    
    # 정규화된 차이
    normalized_diff = (max_diff + min_diff) / (max_range * 2)
    
    # 유사도 (차이가 작을수록 높은 유사도)
    similarity = 1.0 - min(normalized_diff, 1.0)
    
    return max(0.0, similarity)


def calculate_text_similarity(text1: str, text2: str) -> float:
    """
    텍스트 기반 유사도 계산 (Jaccard 유사도)
    
    Args:
        text1: 첫 번째 텍스트
        text2: 두 번째 텍스트
    
    Returns:
        유사도 (0.0 ~ 1.0)
    """
    if not text1 or not text2:
        return 0.0
    
    if text1 == text2:
        return 1.0
    
    # 문자 집합으로 변환
    set1 = set(text1)
    set2 = set(text2)
    
    # 교집합과 합집합
    intersection = len(set1 & set2)
    union = len(set1 | set2)
    
    if union == 0:
        return 0.0
    
    # Jaccard 유사도
    return intersection / union


def calculate_levenshtein_similarity(text1: str, text2: str) -> float:
    """
    레벤슈타인 거리 기반 유사도 계산
    
    Args:
        text1: 첫 번째 텍스트
        text2: 두 번째 텍스트
    
    Returns:
        유사도 (0.0 ~ 1.0)
    """
    if not text1 or not text2:
        return 0.0
    
    if text1 == text2:
        return 1.0
    
    # 레벤슈타인 거리 계산
    m, n = len(text1), len(text2)
    dp = [[0] * (n + 1) for _ in range(m + 1)]
    
    for i in range(m + 1):
        dp[i][0] = i
    for j in range(n + 1):
        dp[0][j] = j
    
    for i in range(1, m + 1):
        for j in range(1, n + 1):
            if text1[i-1] == text2[j-1]:
                dp[i][j] = dp[i-1][j-1]
            else:
                dp[i][j] = min(
                    dp[i-1][j] + 1,      # 삭제
                    dp[i][j-1] + 1,      # 삽입
                    dp[i-1][j-1] + 1     # 교체
                )
    
    distance = dp[m][n]
    max_len = max(m, n)
    
    if max_len == 0:
        return 1.0
    
    # 거리를 유사도로 변환
    similarity = 1.0 - (distance / max_len)
    return max(0.0, similarity)


def calculate_hybrid_similarity(input_text: str, input_max: float, input_min: float,
                                stored_text: str, stored_max: float, stored_min: float,
                                nb_weight: float = 0.7, text_weight: float = 0.3) -> float:
    """
    하이브리드 유사도 계산 (N/B 값 + 텍스트)
    
    Args:
        input_text: 입력 텍스트
        input_max: 입력 bitMax
        input_min: 입력 bitMin
        stored_text: 저장된 텍스트
        stored_max: 저장된 bitMax
        stored_min: 저장된 bitMin
        nb_weight: N/B 값 유사도 가중치 (기본값: 0.7)
        text_weight: 텍스트 유사도 가중치 (기본값: 0.3)
    
    Returns:
        하이브리드 유사도 (0.0 ~ 1.0)
    """
    # N/B 값 유사도
    nb_sim = calculate_nb_similarity(input_max, input_min, stored_max, stored_min)
    
    # 텍스트 유사도 (레벤슈타인 + Jaccard 평균)
    text_sim_lev = calculate_levenshtein_similarity(input_text, stored_text)
    text_sim_jac = calculate_text_similarity(input_text, stored_text)
    text_sim = (text_sim_lev + text_sim_jac) / 2.0
    
    # 가중 평균
    hybrid_sim = (nb_weight * nb_sim) + (text_weight * text_sim)
    
    return hybrid_sim


def find_similar_items(input_text: str, input_max: float, input_min: float,
                       stored_items: list, threshold: float = 0.7,
                       method: str = 'hybrid', limit: int = 10) -> list:
    """
    유사한 항목 찾기
    
    Args:
        input_text: 입력 텍스트
        input_max: 입력 bitMax
        input_min: 입력 bitMin
        stored_items: 저장된 항목 리스트 [{'data': {...}, 'path': '...'}, ...]
        threshold: 유사도 임계값 (기본값: 0.7)
        method: 유사도 계산 방법 ('nb', 'text', 'hybrid')
        limit: 최대 반환 개수
    
    Returns:
        유사도가 높은 순으로 정렬된 항목 리스트
    """
    results = []
    
    for item in stored_items:
        data = item.get('data', {})
        stored_text = data.get('text', '')
        nb_data = data.get('nb', {})
        stored_max = nb_data.get('max', 0)
        stored_min = nb_data.get('min', 0)
        
        # 유사도 계산
        if method == 'nb':
            similarity = calculate_nb_similarity(input_max, input_min, stored_max, stored_min)
        elif method == 'text':
            similarity = calculate_text_similarity(input_text, stored_text)
        else:  # hybrid
            similarity = calculate_hybrid_similarity(
                input_text, input_max, input_min,
                stored_text, stored_max, stored_min
            )
        
        # 임계값 이상만 추가
        if similarity >= threshold:
            results.append({
                'item': item,
                'similarity': similarity,
                'text': stored_text,
                'max': stored_max,
                'min': stored_min
            })
    
    # 유사도 높은 순으로 정렬
    results.sort(key=lambda x: x['similarity'], reverse=True)
    
    return results[:limit]

