"""성능 프로파일링 관리자"""
import cProfile
import pstats
import io
import time
from functools import wraps
from typing import Dict, List, Optional
from contextlib import contextmanager


class Profiler:
    """성능 프로파일러 클래스"""
    
    def __init__(self):
        self.profiler = cProfile.Profile()
        self.function_times: Dict[str, List[float]] = {}
        self.call_counts: Dict[str, int] = {}
    
    def start(self):
        """프로파일링 시작"""
        self.profiler.enable()
    
    def stop(self):
        """프로파일링 중지"""
        self.profiler.disable()
    
    def get_stats(self, sort_by='cumulative', limit=20) -> str:
        """프로파일링 결과 반환"""
        s = io.StringIO()
        ps = pstats.Stats(self.profiler, stream=s)
        ps.sort_stats(sort_by)
        ps.print_stats(limit)
        return s.getvalue()
    
    def save_stats(self, filename: str):
        """프로파일링 결과를 파일로 저장"""
        self.profiler.dump_stats(filename)
    
    def profile_function(self, func):
        """함수 프로파일링 데코레이터"""
        @wraps(func)
        def wrapper(*args, **kwargs):
            func_name = f"{func.__module__}.{func.__name__}"
            start_time = time.perf_counter()
            
            try:
                result = func(*args, **kwargs)
                return result
            finally:
                elapsed = time.perf_counter() - start_time
                
                if func_name not in self.function_times:
                    self.function_times[func_name] = []
                    self.call_counts[func_name] = 0
                
                self.function_times[func_name].append(elapsed)
                self.call_counts[func_name] += 1
        
        return wrapper
    
    @contextmanager
    def profile_context(self, name: str):
        """컨텍스트 매니저로 프로파일링"""
        start_time = time.perf_counter()
        try:
            yield
        finally:
            elapsed = time.perf_counter() - start_time
            if name not in self.function_times:
                self.function_times[name] = []
                self.call_counts[name] = 0
            self.function_times[name].append(elapsed)
            self.call_counts[name] += 1
    
    def get_summary(self) -> Dict[str, Dict]:
        """함수별 성능 요약"""
        summary = {}
        for func_name, times in self.function_times.items():
            if times:
                summary[func_name] = {
                    'call_count': self.call_counts.get(func_name, 0),
                    'total_time': sum(times),
                    'avg_time': sum(times) / len(times),
                    'min_time': min(times),
                    'max_time': max(times),
                    'total_calls': len(times)
                }
        return summary
    
    def print_summary(self):
        """성능 요약 출력"""
        summary = self.get_summary()
        
        # 디버깅: 데이터 확인
        if not summary:
            print("\n" + "=" * 80)
            print("성능 프로파일링 요약")
            print("=" * 80)
            print("⚠️ 기록된 프로파일링 데이터가 없습니다.")
            print(f"   function_times 항목 수: {len(self.function_times)}")
            print(f"   call_counts 항목 수: {len(self.call_counts)}")
            if self.function_times:
                print(f"   기록된 함수들: {list(self.function_times.keys())}")
            print("=" * 80)
            return
        
        # 총 시간 기준으로 정렬
        sorted_summary = sorted(
            summary.items(),
            key=lambda x: x[1]['total_time'],
            reverse=True
        )
        
        print("\n" + "=" * 80)
        print("성능 프로파일링 요약")
        print("=" * 80)
        print(f"{'함수명':<50} {'호출':<8} {'총시간(s)':<12} {'평균(ms)':<12} {'최대(ms)':<12}")
        print("-" * 80)
        
        for func_name, stats in sorted_summary[:20]:  # 상위 20개만
            print(f"{func_name:<50} {stats['call_count']:<8} "
                  f"{stats['total_time']:<12.4f} "
                  f"{stats['avg_time']*1000:<12.2f} "
                  f"{stats['max_time']*1000:<12.2f}")
        
        print("=" * 80)


# 전역 프로파일러 인스턴스
_global_profiler = Profiler()


def profile_function(func):
    """함수 프로파일링 데코레이터 (간편 사용)"""
    return _global_profiler.profile_function(func)


@contextmanager
def profile_context(name: str):
    """컨텍스트 매니저로 프로파일링 (간편 사용)"""
    with _global_profiler.profile_context(name):
        yield


def get_profiler() -> Profiler:
    """전역 프로파일러 반환"""
    return _global_profiler

