"""GPU 설정 모듈"""
import numpy as np
import sys

# Windows 콘솔 인코딩 문제 해결을 위한 안전한 출력 함수
def safe_print(text):
    """Windows 콘솔에서도 안전하게 출력"""
    try:
        print(text)
    except UnicodeEncodeError:
        # emoji만 제거하고 한글은 유지
        import re
        # emoji 패턴 제거 (대부분의 emoji 범위)
        emoji_pattern = re.compile("["
            u"\U0001F600-\U0001F64F"  # emoticons
            u"\U0001F300-\U0001F5FF"  # symbols & pictographs
            u"\U0001F680-\U0001F6FF"  # transport & map symbols
            u"\U0001F1E0-\U0001F1FF"  # flags (iOS)
            u"\U00002702-\U000027B0"
            u"\U000024C2-\U0001F251"
            u"\U00002600-\U000026FF"  # Miscellaneous Symbols
            u"\U00002700-\U000027BF"  # Dingbats
            "]+", flags=re.UNICODE)
        text_clean = emoji_pattern.sub('', text)
        try:
            print(text_clean)
        except UnicodeEncodeError:
            # 그래도 실패하면 cp949로 인코딩 시도
            print(text_clean.encode('cp949', 'ignore').decode('cp949'))

# GPU 지원 라이브러리 확인 및 설정
GPU_AVAILABLE = False
USE_GPU = True  # GPU 사용 여부 플래그 (기본값: True - 성능 향상)
try:
    import cupy as cp
    # 실제 GPU 사용 가능 여부 확인
    try:
        # 1단계: 기본 배열 생성 테스트
        test_array = cp.array([1, 2, 3])
        _ = cp.asnumpy(test_array)  # GPU에서 CPU로 데이터 전송 테스트
        
        # 2단계: 실제 사용하는 연산 테스트 (CUDA 런타임 컴파일 필요)
        # 이 연산들이 실제로 nvrtc64_120_0.dll을 필요로 함
        test_data = cp.array([1.0, 2.0, 3.0, 4.0, 5.0], dtype=cp.float32)
        _ = cp.concatenate([test_data, test_data])  # concatenate 테스트
        _ = cp.exp(test_data - cp.max(test_data))  # exp, max 테스트
        _ = cp.sum(test_data)  # sum 테스트
        
        GPU_AVAILABLE = True
        USE_GPU = True
        safe_print("✅ CuPy GPU 지원 가능 - NumPy 연산을 GPU로 전환합니다.")
        # 기본 메모리 풀 설정
        mempool = cp.get_default_memory_pool()
        pinned_mempool = cp.get_default_pinned_memory_pool()
    except Exception as e:
        error_msg = str(e)
        if "nvrtc" in error_msg.lower() or "dll" in error_msg.lower() or "cuda" in error_msg.lower():
            safe_print("⚠️ CuPy가 설치되었지만 CUDA 런타임이 필요합니다.")
            safe_print("   CPU 모드로 실행됩니다.")
            safe_print(f"   오류: {error_msg[:150]}")
            safe_print("   💡 해결 방법:")
            safe_print("      - CUDA Toolkit 설치 (https://developer.nvidia.com/cuda-downloads)")
            safe_print("      - 또는 CUDA_PATH 환경 변수 설정")
        else:
            safe_print(f"⚠️ GPU 초기화 실패: {error_msg[:150]}")
            safe_print("   CPU 모드로 실행됩니다.")
        GPU_AVAILABLE = False
        USE_GPU = False
        cp = None
except ImportError:
    safe_print("⚠️ CuPy가 설치되지 않았습니다. CPU 모드로 실행됩니다.")
    safe_print("   GPU 사용을 원하시면: pip install cupy-cuda11x (CUDA 11.x) 또는 pip install cupy-cuda12x (CUDA 12.x)")
    cp = None

try:
    import cudf
    CUDF_AVAILABLE = True
    safe_print("✅ cuDF GPU 지원 가능 - pandas 연산을 GPU로 전환합니다.")
except ImportError:
    safe_print("ℹ️ cuDF가 설치되지 않았습니다. pandas는 CPU로 실행됩니다.")
    safe_print("   GPU 사용을 원하시면: pip install cudf-cuda11x (CUDA 11.x) 또는 pip install cudf-cuda12x (CUDA 12.x)")
    cudf = None
    CUDF_AVAILABLE = False

# cuML (sklearn 호환 GPU 라이브러리) 확인
CUML_AVAILABLE = False
try:
    import cuml
    from cuml.ensemble import RandomForestClassifier as cuRF
    from cuml.linear_model import LogisticRegression as cuLR
    CUML_AVAILABLE = True
    safe_print("✅ cuML GPU 지원 가능 - sklearn 모델을 GPU로 전환합니다.")
except ImportError:
    safe_print("ℹ️ cuML이 설치되지 않았습니다. sklearn 모델은 CPU로 실행됩니다.")
    safe_print("   GPU 사용을 원하시면: pip install cuml-cu11 (CUDA 11.x) 또는 pip install cuml-cu12 (CUDA 12.x)")
    cuml = None
    CUML_AVAILABLE = False

# GPU 사용 여부에 따라 배열 라이브러리 선택
if GPU_AVAILABLE and USE_GPU and cp is not None:
    np_gpu = cp  # GPU 배열 연산
    safe_print("🚀 GPU 모드 활성화: NumPy 연산이 GPU에서 실행됩니다.")
else:
    np_gpu = np  # CPU 배열 연산
    safe_print("💻 CPU 모드: NumPy 연산이 CPU에서 실행됩니다.")

