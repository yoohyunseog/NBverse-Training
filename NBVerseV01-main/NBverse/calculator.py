"""
N/B 값 계산 모듈
JavaScript bitCalculation.v.0.2.js의 calculateBit, BIT_MAX_NB, BIT_MIN_NB 로직 구현
"""

from decimal import Decimal, getcontext
import math


class NBValueCalculator:
    """N/B 값 계산 클래스 (JavaScript bitCalculation.v.0.2.js 로직 변환)"""
    
    def __init__(self, decimal_places: int = 10):
        """
        초기화
        
        Args:
            decimal_places: 소수점 자리수 (기본값: 10)
        """
        self.SUPER_BIT = 0.0
        self.BIT_DEFAULT = 5.5
        self.COUNT = 150
        self.CONT = 20
        self.NB_DECIMAL_PLACES = decimal_places
        # Decimal 정밀도 설정
        getcontext().prec = 28
    
    def initialize_arrays(self, count: int) -> dict:
        """배열 초기화 (BIT_START_A50, A100, B50, B100, NBA100)"""
        return {
            'BIT_START_A50': [0.0] * count,
            'BIT_START_A100': [0.0] * count,
            'BIT_START_B50': [0.0] * count,
            'BIT_START_B100': [0.0] * count,
            'BIT_START_NBA100': [0.0] * count
        }
    
    def format_nb_value(self, value: float) -> float:
        """N/B 값을 소수점 10자리로 포맷팅"""
        if not math.isfinite(value) or math.isnan(value):
            return 0.0
        return round(float(Decimal(str(value))), self.NB_DECIMAL_PLACES)
    
    def calculate_bit(self, nb: list, bit: float = 5.5, reverse: bool = False) -> float:
        """N/B 값을 계산하는 함수 (가중치 상한치 및 하한치 기반)
        
        Args:
            nb: N/B 값 배열
            bit: 기본 비트 값 (기본값: 5.5)
            reverse: 시간 역방향 흐름 분석 여부 (기본값: False)
        
        Returns:
            계산된 N/B 값
        """
        if len(nb) < 2:
            return self.format_nb_value(bit / 100.0)
        
        BIT_NB = bit
        max_val = max(nb)
        min_val = min(nb)
        COUNT = self.COUNT
        total_count = COUNT * len(nb)
        
        # 음수와 양수 범위를 구분하여 증분 계산
        negative_range = abs(min_val) if min_val < 0 else 0.0
        positive_range = max_val if max_val > 0 else 0.0
        
        negative_increment = negative_range / (total_count - 1) if total_count > 1 else 0.0
        positive_increment = positive_range / (total_count - 1) if total_count > 1 else 0.0
        
        arrays = self.initialize_arrays(total_count)
        count = 0
        total_sum = 0.0
        
        for value in nb:
            for i in range(COUNT):
                BIT_END = 1
                
                # 부호에 따른 A50, B50 계산
                if value < 0:
                    A50 = min_val + negative_increment * (count + 1)
                else:
                    A50 = min_val + positive_increment * (count + 1)
                
                A100 = (count + 1) * BIT_NB / total_count
                
                if value < 0:
                    B50 = A50 - negative_increment * 2
                    B100 = A50 + negative_increment
                else:
                    B50 = A50 - positive_increment * 2
                    B100 = A50 + positive_increment
                
                NBA100 = A100 / (len(nb) - BIT_END) if len(nb) > BIT_END else A100
                
                arrays['BIT_START_A50'][count] = self.format_nb_value(A50)
                arrays['BIT_START_A100'][count] = self.format_nb_value(A100)
                arrays['BIT_START_B50'][count] = self.format_nb_value(B50)
                arrays['BIT_START_B100'][count] = self.format_nb_value(B100)
                arrays['BIT_START_NBA100'][count] = self.format_nb_value(NBA100)
                
                count += 1
            total_sum += value
        
        # Reverse 옵션 처리 (시간 역방향 흐름 분석)
        if reverse:
            arrays['BIT_START_NBA100'].reverse()
        
        # NB50 계산 (시간 흐름 기반 가중치 분석)
        NB50 = 0.0
        for value in nb:
            for a in range(len(arrays['BIT_START_NBA100'])):
                B50_val = arrays['BIT_START_B50'][a]
                B100_val = arrays['BIT_START_B100'][a]
                if B50_val <= value <= B100_val:
                    NBA100_val = arrays['BIT_START_NBA100'][min(a, len(arrays['BIT_START_NBA100']) - 1)]
                    NB50 += NBA100_val
                    break
        
        # 시간 흐름의 상한치(MAX)와 하한치(MIN) 보정
        if len(nb) == 2:
            return self.format_nb_value(bit - NB50)  # NB 분석 점수가 작을수록 시간 흐름 안정성이 높음
        else:
            return self.format_nb_value(NB50)
    
    def update_super_bit(self, new_value: float):
        """SUPER_BIT는 현재 N/B 분석 상태를 반영한 전역 가중치"""
        self.SUPER_BIT = self.format_nb_value(new_value)
    
    def bit_max_nb(self, nb: list, bit: float = 5.5) -> float:
        """BIT_MAX_NB 함수 (시간 흐름 상한치 분석)
        
        Args:
            nb: N/B 값 배열
            bit: 기본 비트 값 (기본값: 5.5)
        
        Returns:
            시간 순방향 분석 결과 (Forward Time Flow)
        """
        result = self.calculate_bit(nb, bit, False)
        
        # 결과 값이 유효 범위를 벗어나면 SUPER_BIT 반환
        if not math.isfinite(result) or math.isnan(result) or result > 100 or result < -100:
            return self.format_nb_value(self.SUPER_BIT)
        else:
            self.update_super_bit(result)
            return self.format_nb_value(result)
    
    def bit_min_nb(self, nb: list, bit: float = 5.5) -> float:
        """BIT_MIN_NB 함수 (시간 흐름 하한치 분석)
        
        Args:
            nb: N/B 값 배열
            bit: 기본 비트 값 (기본값: 5.5)
        
        Returns:
            시간 역방향 분석 결과 (Reverse Time Flow)
        """
        result = self.calculate_bit(nb, bit, True)
        
        # 결과 값이 유효 범위를 벗어나면 SUPER_BIT 반환
        if not math.isfinite(result) or math.isnan(result) or result > 100 or result < -100:
            return self.format_nb_value(self.SUPER_BIT)
        else:
            self.update_super_bit(result)
            return self.format_nb_value(result)

