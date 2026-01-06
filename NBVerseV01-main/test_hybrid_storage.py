"""
NBverse 하이브리드 저장소 테스트
"""

import os
import sys
import tempfile
import shutil
from datetime import datetime

# Windows 콘솔 인코딩 설정
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

# 현재 디렉토리를 경로에 추가
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)

# NBVerse 모듈 import
# 상위 디렉토리를 Python 경로에 추가 (패키지로 import하기 위해)
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

# 모듈 import (패키지로 import)
try:
    from NBverse.hybrid_storage import NBverseHybridStorage
except ImportError as e:
    print(f"Import 오류: {e}")
    print("패키지로 설치되어 있지 않습니다. pip install -e . 로 설치하세요.")
    sys.exit(1)


def test_hybrid_storage():
    """하이브리드 저장소 테스트"""
    
    # 테스트용 임시 디렉토리 생성
    test_dir = tempfile.mkdtemp(prefix="nbverse_test_")
    compact_file = os.path.join(test_dir, "nbverse_data.json")
    verse_dir = os.path.join(test_dir, "verse")
    
    print(f"테스트 디렉토리: {test_dir}")
    print("=" * 60)
    
    try:
        # 하이브리드 저장소 초기화
        storage = NBverseHybridStorage(
            compact_file=compact_file,
            verse_data_dir=verse_dir,
            max_items=25
        )
        
        print("[OK] 하이브리드 저장소 초기화 완료")
        print()
        
        # 테스트 1: 텍스트 저장
        print("테스트 1: 텍스트 저장 (하이브리드 방식)")
        print("-" * 60)
        
        test_texts = [
            "안녕하세요",
            "Hello World",
            "테스트 데이터 1",
            "테스트 데이터 2",
            "테스트 데이터 3"
        ]
        
        saved_items = []
        for text in test_texts:
            result = storage.save_text(text, metadata={'test': True})
            saved_items.append(result)
            print(f"  저장: {text}")
            print(f"    - ID: {result['id']}")
            print(f"    - bitMax: {result['bitMax']:.10f}")
            print(f"    - bitMin: {result['bitMin']:.10f}")
            print(f"    - Verse 경로 (max): {result['verse_max_path']}")
            print()
        
        print("[OK] 텍스트 저장 완료")
        print()
        
        # 테스트 2: 컴팩트 저장소에서 경로 정보 조회
        print("테스트 2: 컴팩트 저장소에서 경로 정보 조회")
        print("-" * 60)
        
        compact_items = storage.compact_storage.get_items()
        print(f"  컴팩트 저장소 항목 수: {len(compact_items)}")
        
        for item in compact_items[:3]:
            metadata = item.get('metadata', {})
            print(f"  - 텍스트: {item.get('text')}")
            print(f"    경로 (max): {metadata.get('verse_max_path', 'N/A')}")
            print(f"    경로 (min): {metadata.get('verse_min_path', 'N/A')}")
        print()
        
        # 테스트 3: 하이브리드 검색 (경로 조회 → 데이터 로드)
        print("테스트 3: 하이브리드 검색 (경로 조회 → 데이터 로드)")
        print("-" * 60)
        
        if saved_items:
            first_item = saved_items[0]
            nb_max = first_item['bitMax']
            
            print(f"  검색 N/B 값: {nb_max:.10f}")
            results = storage.search_hybrid(nb_max, folder_type="max", limit=5)
            
            print(f"  검색 결과: {len(results)}개")
            for result in results:
                data = result.get('data', {})
                print(f"    - 텍스트: {data.get('text')}")
                print(f"      경로: {result.get('path')}")
                print(f"      N/B max: {data.get('nb', {}).get('max', 'N/A')}")
            print()
        
        # 테스트 4: Verse 저장소에서 직접 검색
        print("테스트 4: Verse 저장소에서 직접 검색")
        print("-" * 60)
        
        if saved_items:
            first_item = saved_items[0]
            nb_max = first_item['bitMax']
            
            verse_results = storage.find_by_nb_value(nb_max, folder_type="max", limit=5)
            print(f"  검색 결과: {len(verse_results)}개")
            for result in verse_results:
                data = result.get('data', {})
                print(f"    - 텍스트: {data.get('text')}")
                print(f"      경로: {result.get('path')}")
            print()
        
        # 테스트 5: 경로로 직접 데이터 로드
        print("테스트 5: 경로로 직접 데이터 로드")
        print("-" * 60)
        
        if saved_items:
            first_item = saved_items[0]
            verse_path = first_item['verse_max_path']
            
            print(f"  경로: {verse_path}")
            data = storage.find_by_path(verse_path)
            
            if data:
                print(f"  [OK] 데이터 로드 성공")
                print(f"    - 텍스트: {data.get('text')}")
                print(f"    - N/B max: {data.get('nb', {}).get('max', 'N/A')}")
                print(f"    - N/B min: {data.get('nb', {}).get('min', 'N/A')}")
            else:
                print(f"  [FAIL] 데이터 로드 실패")
            print()
        
        # 테스트 6: 전체 항목 조회 (하이브리드 방식)
        print("테스트 6: 전체 항목 조회 (하이브리드 방식)")
        print("-" * 60)
        
        all_items = storage.get_items(limit=10)
        print(f"  전체 항목 수: {len(all_items)}")
        
        for item in all_items[:3]:
            print(f"  - ID: {item.get('id')}")
            print(f"    텍스트: {item.get('text')}")
            print(f"    Verse 경로: {item.get('verse_path')}")
            print(f"    실제 데이터 존재: {'data' in item}")
        print()
        
        # 테스트 7: 통계 조회
        print("테스트 7: 통계 조회")
        print("-" * 60)
        
        stats = storage.get_statistics()
        print(f"  총 항목 수: {stats.get('total_items')}")
        print(f"  최대 항목 수: {stats.get('max_items')}")
        print(f"  저장소 타입: {stats.get('storage_type')}")
        print(f"  컴팩트 파일: {stats.get('compact_file')}")
        print(f"  Verse 디렉토리: {stats.get('verse_data_dir')}")
        print()
        
        print("=" * 60)
        print("[OK] 모든 테스트 완료!")
        
    except Exception as e:
        print(f"[ERROR] 테스트 오류: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # 테스트 디렉토리 정리
        if os.path.exists(test_dir):
            shutil.rmtree(test_dir)
            print(f"테스트 디렉토리 삭제: {test_dir}")


if __name__ == "__main__":
    test_hybrid_storage()

