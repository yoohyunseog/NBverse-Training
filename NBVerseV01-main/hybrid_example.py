"""
NBverse 하이브리드 저장소 사용 예제
컴팩트 저장소는 경로만 저장, 실제 데이터는 Verse 저장소에서 로드
"""

import sys
import os

# 패키지로 import
try:
    from NBverse.hybrid_storage import NBverseHybridStorage
except ImportError:
    # 직접 실행 시
    current_dir = os.path.dirname(os.path.abspath(__file__))
    parent_dir = os.path.dirname(current_dir)
    if parent_dir not in sys.path:
        sys.path.insert(0, parent_dir)
    from NBverse.hybrid_storage import NBverseHybridStorage


def main():
    """하이브리드 저장소 사용 예제"""
    
    print("=" * 60)
    print("NBverse 하이브리드 저장소 사용 예제")
    print("=" * 60)
    print()
    
    # 하이브리드 저장소 초기화
    storage = NBverseHybridStorage(
        compact_file="data/nbverse/nbverse_data.json",
        verse_data_dir="data/nbverse",
        max_items=25
    )
    
    print("1. 텍스트 저장 (하이브리드 방식)")
    print("-" * 60)
    
    # 텍스트 저장
    result = storage.save_text("안녕하세요", metadata={'source': 'example'})
    
    print(f"저장 완료:")
    print(f"  - ID: {result['id']}")
    print(f"  - 텍스트: {result['text']}")
    print(f"  - bitMax: {result['bitMax']:.10f}")
    print(f"  - bitMin: {result['bitMin']:.10f}")
    print(f"  - Verse 경로 (max): {result['verse_max_path']}")
    print(f"  - Verse 경로 (min): {result['verse_min_path']}")
    print()
    
    print("2. 하이브리드 검색 (경로 조회 → 데이터 로드)")
    print("-" * 60)
    
    # 하이브리드 검색
    nb_max = result['bitMax']
    search_results = storage.search_hybrid(nb_max, folder_type="max", limit=5)
    
    print(f"검색 결과: {len(search_results)}개")
    for item in search_results:
        data = item.get('data', {})
        print(f"  - 텍스트: {data.get('text')}")
        print(f"    경로: {item.get('path')}")
        print(f"    N/B max: {data.get('nb', {}).get('max', 'N/A')}")
    print()
    
    print("3. 경로로 직접 데이터 로드")
    print("-" * 60)
    
    # 경로로 직접 로드
    verse_path = result['verse_max_path']
    loaded_data = storage.find_by_path(verse_path)
    
    if loaded_data:
        print(f"데이터 로드 성공:")
        print(f"  - 텍스트: {loaded_data.get('text')}")
        print(f"  - N/B max: {loaded_data.get('nb', {}).get('max', 'N/A')}")
        print(f"  - N/B min: {loaded_data.get('nb', {}).get('min', 'N/A')}")
    print()
    
    print("4. 전체 항목 조회 (하이브리드 방식)")
    print("-" * 60)
    
    # 전체 항목 조회
    all_items = storage.get_items(limit=10)
    print(f"전체 항목 수: {len(all_items)}")
    
    for item in all_items[:3]:
        print(f"  - ID: {item.get('id')}")
        print(f"    텍스트: {item.get('text')}")
        print(f"    Verse 경로: {item.get('verse_path')}")
    print()
    
    print("=" * 60)
    print("예제 완료!")


if __name__ == "__main__":
    main()

