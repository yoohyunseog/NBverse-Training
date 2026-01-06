# -*- coding: utf-8 -*-
"""프로파일링 결과 분석 스크립트"""
import pstats
import sys
import os
import io

# Windows 콘솔 인코딩 문제 해결
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
        sys.stderr.reconfigure(encoding='utf-8', errors='replace')
    except AttributeError:
        # Python 3.6 이하 버전
        sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
        sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')


def analyze_profile(profile_file: str):
    """프로파일링 결과 분석"""
    if not os.path.exists(profile_file):
        print(f"[오류] 프로파일링 파일을 찾을 수 없습니다: {profile_file}")
        return
    
    stats = pstats.Stats(profile_file)
    
    print("=" * 80)
    print("프로파일링 결과 분석")
    print("=" * 80)
    
    # 1. 총 시간 기준 (상위 20개)
    print("\n[1] 총 시간 기준 (상위 20개)")
    print("-" * 80)
    stats.sort_stats('cumulative')
    stats.print_stats(20)
    
    # 2. 자체 시간 기준 (상위 20개)
    print("\n[2] 자체 시간 기준 (상위 20개)")
    print("-" * 80)
    stats.sort_stats('tottime')
    stats.print_stats(20)
    
    # 3. 호출 횟수 기준 (상위 20개)
    print("\n[3] 호출 횟수 기준 (상위 20개)")
    print("-" * 80)
    stats.sort_stats('ncalls')
    stats.print_stats(20)
    
    # 4. 병목 지점 식별
    print("\n[4] 병목 지점 식별")
    print("-" * 80)
    stats.sort_stats('cumulative')
    
    # 상위 10개 함수의 총 시간이 전체의 80% 이상인지 확인
    total_time = stats.total_tt
    top_functions = []
    
    for func, (cc, nc, tt, ct, callers) in stats.stats.items():
        if ct > 0:
            percentage = (ct / total_time) * 100
            top_functions.append((func, ct, percentage))
    
    top_functions.sort(key=lambda x: x[1], reverse=True)
    
    cumulative_percentage = 0
    print(f"\n상위 병목 지점 (전체 시간: {total_time:.4f}초):")
    for i, (func, ct, percentage) in enumerate(top_functions[:10], 1):
        cumulative_percentage += percentage
        print(f"{i:2d}. {func[2]:<50} {ct:>10.4f}초 ({percentage:>6.2f}%)")
    
    print(f"\n상위 10개 함수가 전체의 {cumulative_percentage:.2f}% 차지")
    
    if cumulative_percentage > 80:
        print("[경고] 병목이 명확합니다. 상위 함수들을 최적화하세요.")
    else:
        print("[확인] 병목이 분산되어 있습니다.")


def main():
    """메인 함수"""
    # 현재 스크립트의 디렉토리
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = os.path.dirname(script_dir)
    
    if len(sys.argv) > 1:
        profile_file = sys.argv[1]
        # 상대 경로인 경우 절대 경로로 변환
        if not os.path.isabs(profile_file):
            profile_file = os.path.join(project_root, profile_file)
    else:
        # 기본 경로
        profile_file = os.path.join(project_root, "profiling", "production_cards_profile.prof")
    
    analyze_profile(profile_file)


if __name__ == "__main__":
    main()
