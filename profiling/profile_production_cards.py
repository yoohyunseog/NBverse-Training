"""생산 카드 관리자 프로파일링 스크립트"""
import sys
import os

# 현재 스크립트의 디렉토리
script_dir = os.path.dirname(os.path.abspath(__file__))
# 프로젝트 루트 경로 (profiling의 상위 디렉토리)
project_root = os.path.dirname(script_dir)

# 프로젝트 루트 경로 추가
if project_root not in sys.path:
    sys.path.insert(0, project_root)

# 현재 디렉토리를 작업 디렉토리로 설정
os.chdir(project_root)

# Import
from profiling.profile_manager import Profiler, get_profiler
from managers.production_card_manager import ProductionCardManager

# NBverseStorage import (실제 사용 방식과 동일하게)
try:
    from nbverse_helper import init_nbverse_storage
    NBVERSE_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ nbverse_helper를 찾을 수 없습니다: {e}")
    print("   NBverse 없이 프로파일링을 진행합니다.")
    NBVERSE_AVAILABLE = False
    init_nbverse_storage = None

import time


def create_test_data():
    """테스트 데이터 생성"""
    # NBverse 저장소 초기화 (실제 사용 방식과 동일)
    nbverse = None
    if NBVERSE_AVAILABLE and init_nbverse_storage:
        try:
            nbverse, _ = init_nbverse_storage(
                data_dir="data/nbverse",
                decimal_places=10
            )
            print("✅ NBverseStorage 초기화 완료")
        except Exception as e:
            print(f"⚠️ NBverseStorage 초기화 오류: {e}")
            print("   NBverse 없이 ProductionCardManager만 초기화합니다.")
            nbverse = None
    else:
        print("ℹ️ NBverse를 사용할 수 없습니다. ProductionCardManager만 초기화합니다.")
    
    # ProductionCardManager 초기화
    manager = ProductionCardManager(nbverse_storage=nbverse)
    
    return manager, nbverse


def profile_load_cards(manager: ProductionCardManager, profiler: Profiler):
    """카드 로드 프로파일링"""
    print("\n📊 카드 로드 프로파일링 시작...")
    
    try:
        with profiler.profile_context("load_cards"):
            manager.load(background=False)  # 동기 실행으로 측정
        
        print(f"✅ 로드된 카드 수: {len(manager.cards_cache)}개")
    except Exception as e:
        print(f"⚠️ 카드 로드 오류: {e}")
        print("   (NBverse가 없으면 정상입니다)")


def profile_get_cards(manager: ProductionCardManager, profiler: Profiler):
    """카드 조회 프로파일링"""
    print("\n📊 카드 조회 프로파일링 시작...")
    
    # 여러 번 조회하여 평균 측정
    iterations = 100
    
    # get_card_by_id 프로파일링
    if manager.cards_cache:
        test_card_id = manager.cards_cache[0].get('card_id')
        if test_card_id:
            for _ in range(iterations):
                with profiler.profile_context("get_card_by_id"):
                    manager.get_card_by_id(test_card_id)
    
    # get_active_cards 프로파일링
    for _ in range(iterations):
        with profiler.profile_context("get_active_cards"):
            manager.get_active_cards()
    
    # get_all_cards 프로파일링
    for _ in range(iterations):
        with profiler.profile_context("get_all_cards"):
            manager.get_all_cards()


def profile_card_operations(manager: ProductionCardManager, profiler: Profiler):
    """카드 작업 프로파일링"""
    print("\n📊 카드 작업 프로파일링 시작...")
    
    # 인덱스 재구성 프로파일링
    for _ in range(10):
        with profiler.profile_context("_rebuild_indexes"):
            manager._rebuild_indexes()
    
    # 중복 제거 프로파일링
    for _ in range(5):
        with profiler.profile_context("cleanup_duplicate_cards"):
            manager.cleanup_duplicate_cards(force_use_cache=True)


def main():
    """메인 프로파일링 함수"""
    print("=" * 80)
    print("생산 카드 관리자 성능 프로파일링")
    print("=" * 80)
    
    profiler = Profiler()
    profiler.start()
    
    try:
        # 테스트 데이터 생성
        print("\n🔧 테스트 환경 설정 중...")
        manager, nbverse = create_test_data()
        
        # 각 작업 프로파일링
        profile_load_cards(manager, profiler)
        profile_get_cards(manager, profiler)
        profile_card_operations(manager, profiler)
        
        # 프로파일링 중지
        profiler.stop()
        
        # 결과 출력
        profiler.print_summary()
        
        # 상세 통계 저장 (절대 경로 사용)
        profile_file = os.path.join(project_root, "profiling", "production_cards_profile.prof")
        profiler.save_stats(profile_file)
        print(f"\n💾 상세 프로파일링 결과 저장: {profile_file}")
        print(f"   (분석: python profiling\\analyze_profile.py {profile_file})")
        
        # cProfile 결과 출력
        print("\n" + "=" * 80)
        print("cProfile 상세 결과 (상위 30개)")
        print("=" * 80)
        print(profiler.get_stats(sort_by='cumulative', limit=30))
        
    except Exception as e:
        print(f"\n❌ 프로파일링 오류: {e}")
        import traceback
        traceback.print_exc()
    finally:
        profiler.stop()


if __name__ == "__main__":
    main()

