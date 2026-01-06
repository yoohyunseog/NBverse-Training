"""
NBverse Compact Storage 사용 예제
단일 JSON 파일에 최대 25개 데이터 유지
"""

import sys
import os

# 상위 디렉토리를 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from NBverse import NBverseCompactStorage, add_text_compact


def example_basic_usage():
    """기본 사용 예제"""
    print("=" * 70)
    print("예제 1: 기본 사용 (1개씩 추가)")
    print("=" * 70)
    
    storage = NBverseCompactStorage(max_items=25)
    
    # 텍스트 추가
    result = storage.add_text("테스트 1")
    print(f"✅ 추가 완료!")
    print(f"  ID: {result['id']}")
    print(f"  텍스트: {result['text']}")
    print(f"  타임스탬프: {result['timestamp']}")
    print(f"  bitMax: {result['bitMax']:.10f}")
    print(f"  bitMin: {result['bitMin']:.10f}")
    print(f"  총 항목 수: {result['total_items']}")
    print()


def example_multiple_adds():
    """여러 개 추가 예제"""
    print("=" * 70)
    print("예제 2: 여러 개 추가 (25개 제한 테스트)")
    print("=" * 70)
    
    storage = NBverseCompactStorage(max_items=25)
    
    # 30개 추가 (25개 초과)
    for i in range(30):
        result = storage.add_text(f"테스트 {i+1}")
        if (i+1) % 5 == 0:
            print(f"  {i+1}개 추가됨, 총 항목: {result['total_items']}개")
    
    print(f"\n✅ 최종 항목 수: {len(storage.get_items())}개 (최대 25개 유지)")
    print()


def example_get_items():
    """항목 조회 예제"""
    print("=" * 70)
    print("예제 3: 저장된 항목 조회")
    print("=" * 70)
    
    storage = NBverseCompactStorage(max_items=25)
    
    items = storage.get_items(limit=10)
    print(f"최근 10개 항목:")
    for i, item in enumerate(items, 1):
        print(f"  {i}. [{item['timestamp'][:19]}] {item['text']}")
        print(f"     bitMax: {item['nb']['max']:.10f}, bitMin: {item['nb']['min']:.10f}")
    print()


def example_history():
    """히스토리 조회 예제"""
    print("=" * 70)
    print("예제 4: 히스토리 조회")
    print("=" * 70)
    
    storage = NBverseCompactStorage(max_items=25)
    
    history = storage.get_history(limit=10)
    print(f"최근 10개 히스토리:")
    for i, entry in enumerate(history, 1):
        print(f"  {i}. [{entry['timestamp'][:19]}] {entry['action']}: {entry['text']}")
    print()


def example_statistics():
    """통계 조회 예제"""
    print("=" * 70)
    print("예제 5: 통계 정보")
    print("=" * 70)
    
    storage = NBverseCompactStorage(max_items=25)
    
    stats = storage.get_statistics()
    print(f"통계 정보:")
    print(f"  총 항목 수: {stats['total_items']}")
    print(f"  최대 항목 수: {stats['max_items']}")
    print(f"  총 히스토리: {stats['total_history']}")
    print(f"  생성일: {stats['created_at']}")
    print(f"  마지막 업데이트: {stats['last_updated']}")
    print()


def example_convenience_function():
    """편의 함수 사용 예제"""
    print("=" * 70)
    print("예제 6: 편의 함수 사용")
    print("=" * 70)
    
    from NBverse import add_text_compact
    
    # 한 줄로 추가
    result = add_text_compact("편의 함수 테스트", max_items=25)
    print(f"✅ 추가 완료!")
    print(f"  ID: {result['id']}")
    print(f"  텍스트: {result['text']}")
    print(f"  타임스탬프: {result['timestamp']}")
    print()


if __name__ == "__main__":
    # 모든 예제 실행
    example_basic_usage()
    example_multiple_adds()
    example_get_items()
    example_history()
    example_statistics()
    example_convenience_function()
    
    print("=" * 70)
    print("모든 예제 실행 완료!")
    print("=" * 70)
    print("\n데이터 파일 위치:")
    print("  novel_ai/v1.0.7/data/nbverse_data.json")
    print("\n파일 크기: 약 10-15 KB (25개 기준)")

