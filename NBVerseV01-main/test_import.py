"""
임포트 테스트 스크립트
설치 후 제대로 임포트되는지 확인
"""

def test_imports():
    """모든 주요 모듈 임포트 테스트"""
    print("=" * 60)
    print("NBverse 임포트 테스트")
    print("=" * 60)
    print()
    
    try:
        # 기본 임포트
        print("[1] 기본 모듈 임포트...")
        import NBverse
        print(f"  ✅ NBverse 버전: {NBverse.__version__}")
        print()
        
        # 편의 함수
        print("[2] 편의 함수 임포트...")
        from NBverse import convert_text, save_text
        print("  ✅ convert_text, save_text")
        print()
        
        # 주요 클래스
        print("[3] 주요 클래스 임포트...")
        from NBverse import (
            TextToNBConverter,
            NBverseStorage,
            QueryHistory,
            NBverseConfig
        )
        print("  ✅ TextToNBConverter, NBverseStorage, QueryHistory, NBverseConfig")
        print()
        
        # 유사도 함수
        print("[4] 유사도 함수 임포트...")
        from NBverse import (
            calculate_nb_similarity,
            calculate_text_similarity,
            calculate_hybrid_similarity,
            find_similar_items
        )
        print("  ✅ 유사도 함수들")
        print()
        
        # 실제 사용 테스트
        print("[5] 실제 사용 테스트...")
        result = convert_text("테스트")
        print(f"  ✅ convert_text('테스트') = bitMax: {result['bitMax']:.10f}")
        print()
        
        print("=" * 60)
        print("모든 테스트 통과! ✅")
        print("=" * 60)
        return True
        
    except ImportError as e:
        print(f"  ❌ 임포트 오류: {e}")
        print()
        print("설치가 필요합니다:")
        print("  pip install -e .")
        return False
    except Exception as e:
        print(f"  ❌ 오류: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    test_imports()

