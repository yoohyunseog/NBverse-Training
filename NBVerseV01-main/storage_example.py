"""
NBverse Storage 사용 예제
max/min 폴더 구조로 데이터 저장
"""

import sys
import os

# 상위 디렉토리를 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from NBverse import NBverseStorage


def example_save_text():
    """텍스트 저장 예제"""
    print("=" * 60)
    print("예제 1: 텍스트 저장")
    print("=" * 60)
    
    storage = NBverseStorage(data_dir="novel_ai/v1.0.7/data")
    
    text = "안녕하세요"
    result = storage.save_text(text, metadata={'source': 'example'})
    
    print(f"입력 텍스트: {text}")
    print(f"bitMax: {result['bitMax']:.10f}")
    print(f"bitMin: {result['bitMin']:.10f}")
    print(f"max 폴더 저장 경로: {result['max_path']}")
    print(f"min 폴더 저장 경로: {result['min_path']}")
    print()


def example_save_nb_values():
    """N/B 값 직접 저장 예제"""
    print("=" * 60)
    print("예제 2: N/B 값 직접 저장")
    print("=" * 60)
    
    storage = NBverseStorage(data_dir="novel_ai/v1.0.7/data")
    
    bit_max = 3.1415926535
    bit_min = 2.7182818284
    
    result = storage.save_nb_values(
        bit_max=bit_max,
        bit_min=bit_min,
        text="테스트 데이터",
        metadata={'type': 'manual_input'}
    )
    
    print(f"bitMax: {bit_max:.10f}")
    print(f"bitMin: {bit_min:.10f}")
    print(f"max 폴더 저장 경로: {result['max_path']}")
    print(f"min 폴더 저장 경로: {result['min_path']}")
    print()


def example_find_by_nb_value():
    """N/B 값으로 검색 예제"""
    print("=" * 60)
    print("예제 3: N/B 값으로 검색")
    print("=" * 60)
    
    storage = NBverseStorage(data_dir="novel_ai/v1.0.7/data")
    
    # 먼저 데이터 저장
    text = "검색 테스트"
    save_result = storage.save_text(text)
    
    # 저장된 값으로 검색
    nb_value = save_result['bitMax']
    results = storage.find_by_nb_value(nb_value, folder_type="max", limit=5)
    
    print(f"검색 N/B 값: {nb_value:.10f}")
    print(f"검색 결과 개수: {len(results)}")
    
    for i, result in enumerate(results, 1):
        print(f"\n결과 {i}:")
        print(f"  경로: {result['path']}")
        print(f"  텍스트: {result['data'].get('text', 'N/A')}")
        print(f"  계산 시간: {result['data'].get('calculated_at', 'N/A')}")
    print()


def example_multiple_texts():
    """여러 텍스트 저장 예제"""
    print("=" * 60)
    print("예제 4: 여러 텍스트 저장")
    print("=" * 60)
    
    storage = NBverseStorage(data_dir="novel_ai/v1.0.7/data")
    
    texts = [
        "안녕하세요",
        "Hello World",
        "こんにちは",
        "123456",
        "한글ABC123"
    ]
    
    for i, text in enumerate(texts, 1):
        result = storage.save_text(text, metadata={'index': i, 'total': len(texts)})
        print(f"{i}. {text}")
        print(f"   bitMax: {result['bitMax']:.10f}, bitMin: {result['bitMin']:.10f}")
    print()


if __name__ == "__main__":
    # 모든 예제 실행
    example_save_text()
    example_save_nb_values()
    example_find_by_nb_value()
    example_multiple_texts()
    
    print("=" * 60)
    print("모든 예제 실행 완료!")
    print("=" * 60)
    print("\n저장된 데이터는 다음 경로에서 확인할 수 있습니다:")
    print("  - novel_ai/v1.0.7/data/max/")
    print("  - novel_ai/v1.0.7/data/min/")

