"""
NBverse 입력 및 조회 도구
조회 먼저 수행하고, 데이터가 없으면 저장
유사도 조회 및 히스토리 저장 기능 포함
"""

import sys
import os
from datetime import datetime

# 상위 디렉토리를 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from NBverse import NBverseStorage, TextToNBConverter, NBverseCompactStorage
from NBverse.config import NBverseConfig
from NBverse.similarity import find_similar_items
from NBverse.history import QueryHistory


def main():
    """메인 함수"""
    # 설정 로드
    config = NBverseConfig()
    decimal_places = config.get_decimal_places()
    
    # 초기화
    storage = NBverseStorage(
        data_dir=config.get_data_dir(),
        decimal_places=decimal_places
    )
    compact_storage = NBverseCompactStorage(
        data_file=os.path.join(config.get_data_dir(), "nbverse_data.json"),
        max_items=25,
        decimal_places=decimal_places
    )
    converter = TextToNBConverter(
        bit=config.get_bit_default(),
        decimal_places=decimal_places
    )
    history = QueryHistory()
    
    print("=" * 70)
    print("NBverse - 입력 및 조회 (유사도 검색 포함)")
    print("=" * 70)
    print(f"소수점 자리수: {decimal_places}")
    print(f"데이터 디렉토리: {config.get_data_dir()}")
    print("=" * 70)
    print()
    
    while True:
        # 텍스트 입력
        text = input("텍스트를 입력하세요 (종료: quit 또는 exit): ").strip()
        
        if not text or text.lower() in ['quit', 'exit', 'q']:
            print("\n프로그램을 종료합니다.")
            break
        
        try:
            # 1. 먼저 정확 일치 조회 시도
            print("\n[정확 일치 조회 중...]")
            result = converter.text_to_nb(text)
            bit_max = result['bitMax']
            bit_min = result['bitMin']
            
            # N/B 값으로 검색
            max_results = storage.find_by_nb_value(bit_max, folder_type="max", limit=10)
            min_results = storage.find_by_nb_value(bit_min, folder_type="min", limit=10)
            
            # 텍스트가 일치하는 데이터 찾기
            found_data = None
            exact_match_path = None
            for res in max_results + min_results:
                data = res.get('data', {})
                if data.get('text') == text:
                    found_data = data
                    exact_match_path = res.get('path')
                    break
            
            if found_data:
                # 정확 일치 데이터가 있으면 조회 결과 출력
                print("\n✅ 정확 일치 데이터를 찾았습니다!")
                print(f"입력 텍스트: {text}")
                print(f"bitMax: {bit_max:.{decimal_places}f}")
                print(f"bitMin: {bit_min:.{decimal_places}f}")
                print(f"\n저장 정보:")
                print(f"  - 저장 날짜: {found_data.get('calculated_at', 'N/A')}")
                print(f"  - 저장 형식: JSON")
                if 'nb' in found_data:
                    nb = found_data['nb']
                    print(f"  - bitMax: {nb.get('max', 0):.{decimal_places}f}")
                    print(f"  - bitMin: {nb.get('min', 0):.{decimal_places}f}")
                if 'metadata' in found_data:
                    print(f"  - 메타데이터: {found_data['metadata']}")
                
                # 히스토리 저장
                history.add_query(
                    query_text=text,
                    query_type="exact",
                    found=True,
                    result_count=1,
                    nb_max=bit_max,
                    nb_min=bit_min
                )
            else:
                # 2. 정확 일치가 없으면 유사도 검색
                print("\n[정확 일치 없음. 유사도 검색 중...]")
                
                # 범위 검색으로 후보 찾기
                range_results = storage.find_similar_by_nb_range(bit_max, bit_min, range_threshold=1.0, limit=100)
                
                if range_results:
                    # 유사도 계산
                    similar_items = find_similar_items(
                        input_text=text,
                        input_max=bit_max,
                        input_min=bit_min,
                        stored_items=range_results,
                        threshold=0.7,
                        method='hybrid',
                        limit=10
                    )
                    
                    if similar_items:
                        print(f"\n🔍 유사한 데이터를 {len(similar_items)}개 찾았습니다:")
                        print()
                        
                        for i, item in enumerate(similar_items, 1):
                            sim_data = item['item']['data']
                            print(f"[{i}] 유사도: {item['similarity']:.2%}")
                            print(f"    텍스트: {item['text']}")
                            print(f"    bitMax: {item['max']:.{decimal_places}f}")
                            print(f"    bitMin: {item['min']:.{decimal_places}f}")
                            print(f"    저장일: {sim_data.get('calculated_at', 'N/A')}")
                            print()
                        
                        # 히스토리 저장 (유사도 검색)
                        history.add_query(
                            query_text=text,
                            query_type="similar",
                            found=True,
                            result_count=len(similar_items),
                            similar_results=[{
                                'text': item['text'],
                                'similarity': item['similarity'],
                                'max': item['max'],
                                'min': item['min']
                            } for item in similar_items],
                            nb_max=bit_max,
                            nb_min=bit_min
                        )
                    else:
                        print("\n❌ 유사한 데이터를 찾을 수 없습니다.")
                        # 히스토리 저장 (검색 실패)
                        history.add_query(
                            query_text=text,
                            query_type="similar",
                            found=False,
                            result_count=0,
                            nb_max=bit_max,
                            nb_min=bit_min
                        )
                else:
                    print("\n❌ 검색 범위 내 데이터가 없습니다.")
                    # 히스토리 저장 (검색 실패)
                    history.add_query(
                        query_text=text,
                        query_type="range",
                        found=False,
                        result_count=0,
                        nb_max=bit_max,
                        nb_min=bit_min
                    )
                
                # 3. 데이터가 없으면 저장
                print("\n[새로 저장합니다...]")
                
                # 컴팩트 저장소에 추가 (1개씩, 25개 제한)
                compact_result = compact_storage.add_text(
                    text,
                    metadata={
                        'input_method': 'input_view',
                        'decimal_places': decimal_places,
                        'auto_saved': True
                    }
                )
                
                # 기존 저장소에도 저장 (호환성)
                save_result = storage.save_text(
                    text,
                    metadata={
                        'input_method': 'input_view',
                        'decimal_places': decimal_places,
                        'auto_saved': True
                    }
                )
                
                print("\n✅ 저장 완료!")
                print(f"입력 텍스트: {text}")
                print(f"bitMax: {bit_max:.{decimal_places}f}")
                print(f"bitMin: {bit_min:.{decimal_places}f}")
                print(f"\n저장 정보:")
                print(f"  - 저장 날짜: {compact_result['timestamp'][:19]}")
                print(f"  - 저장 형식: JSON (컴팩트)")
                print(f"  - 항목 ID: {compact_result['id']}")
                print(f"  - 총 항목 수: {compact_result['total_items']}/25")
                print(f"  - max 경로: {save_result['max_path']}")
                print(f"  - min 경로: {save_result['min_path']}")
                print(f"  - 유니코드 배열 길이: {len(result['unicodeArray'])}")
            
            # 타임라인 출력 (최근 5개)
            print("\n" + "=" * 70)
            print("최근 조회 타임라인 (최근 5개):")
            print("=" * 70)
            timeline = history.get_timeline(limit=5)
            for i, record in enumerate(timeline, 1):
                time_str = record.get('timestamp', '')[:19].replace('T', ' ')
                query_type = record.get('query_type', 'unknown')
                found = "✅" if record.get('found') else "❌"
                print(f"{i}. [{time_str}] {found} {query_type}: {record.get('query_text', '')}")
            print("=" * 70)
            print()
            
        except Exception as e:
            print(f"\n❌ 오류 발생: {e}\n")
            import traceback
            traceback.print_exc()


if __name__ == "__main__":
    main()

