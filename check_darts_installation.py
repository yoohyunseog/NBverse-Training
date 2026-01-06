"""
Darts 라이브러리 설치 확인 스크립트
"""
import sys
import os
import io

# Windows 콘솔 인코딩 설정
if sys.platform == 'win32':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

print("=" * 60)
print("Darts 라이브러리 설치 확인")
print("=" * 60)
print(f"Python 경로: {sys.executable}")
print(f"Python 버전: {sys.version}")
print(f"작업 디렉토리: {os.getcwd()}")
print()

# 1. darts 패키지 설치 확인
print("1. darts 패키지 설치 확인 중...")
try:
    import darts
    print(f"   [OK] darts 패키지 발견: {darts.__file__}")
    print(f"   버전: {getattr(darts, '__version__', '알 수 없음')}")
except ImportError as e:
    print(f"   [FAIL] darts 패키지를 찾을 수 없습니다: {e}")
    print("   해결 방법: pip install darts")
    sys.exit(1)

# 2. TimeSeries import 확인
print("\n2. TimeSeries import 확인 중...")
try:
    from darts import TimeSeries
    print(f"   [OK] TimeSeries import 성공: {TimeSeries}")
except ImportError as e:
    print(f"   [FAIL] TimeSeries import 실패: {e}")
    sys.exit(1)

# 3. 모델 import 확인
print("\n3. 모델 import 확인 중...")
all_models_ok = True

# LSTM 확인 (Darts 0.40.0+ 에서는 RNNModel 또는 BlockRNNModel 사용)
try:
    from darts.models import LSTM
    print(f"   [OK] LSTM import 성공")
except ImportError:
    try:
        from darts.models import RNNModel
        print(f"   [OK] RNNModel import 성공 (LSTM 대체)")
    except ImportError:
        try:
            from darts.models import BlockRNNModel
            print(f"   [OK] BlockRNNModel import 성공 (LSTM 대체)")
        except ImportError as e:
            print(f"   [FAIL] LSTM/RNNModel/BlockRNNModel import 실패: {e}")
            all_models_ok = False

# TransformerModel 확인
try:
    from darts.models import TransformerModel
    print(f"   [OK] TransformerModel import 성공")
except ImportError as e:
    print(f"   [FAIL] TransformerModel import 실패: {e}")
    all_models_ok = False

# NBEATSModel 확인
try:
    from darts.models import NBEATSModel
    print(f"   [OK] NBEATSModel import 성공")
except ImportError as e:
    print(f"   [FAIL] NBEATSModel import 실패: {e}")
    all_models_ok = False

# 4. 메트릭 import 확인
print("\n4. 메트릭 import 확인 중...")
try:
    from darts.metrics import mape, mse
    print(f"   [OK] mape, mse import 성공")
except ImportError as e:
    print(f"   [FAIL] 메트릭 import 실패: {e}")
    all_models_ok = False

# 5. ChartPredictionModel import 확인
print("\n5. ChartPredictionModel import 확인 중...")
try:
    # 현재 디렉토리를 sys.path에 추가
    current_dir = os.path.dirname(os.path.abspath(__file__))
    if current_dir not in sys.path:
        sys.path.insert(0, current_dir)
    
    from ai.prediction_model import ChartPredictionModel
    print(f"   [OK] ChartPredictionModel import 성공")
    
    # 인스턴스 생성 테스트
    print("\n6. ChartPredictionModel 인스턴스 생성 테스트 중...")
    try:
        model = ChartPredictionModel()
        print(f"   [OK] ChartPredictionModel 인스턴스 생성 성공")
        print(f"   모델 디렉토리: {model.model_dir}")
    except Exception as e:
        print(f"   [FAIL] ChartPredictionModel 인스턴스 생성 실패: {e}")
        import traceback
        traceback.print_exc()
        all_models_ok = False
except ImportError as e:
    print(f"   [FAIL] ChartPredictionModel import 실패: {e}")
    import traceback
    traceback.print_exc()
    all_models_ok = False

print("\n" + "=" * 60)
if all_models_ok:
    print("[SUCCESS] 모든 확인 완료! Darts 라이브러리가 정상적으로 설치되어 있습니다.")
else:
    print("[FAIL] 일부 확인 실패. 위의 오류 메시지를 확인하세요.")
print("=" * 60)
