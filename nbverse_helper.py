"""NBVerse 헬퍼 모듈"""
import os
import sys
import re
from datetime import datetime
from decimal import Decimal, getcontext
import math

# Windows 콘솔 인코딩 문제 해결을 위한 안전한 출력 함수
def safe_print(text):
    """Windows 콘솔에서도 안전하게 출력"""
    try:
        print(text)
    except UnicodeEncodeError:
        # emoji만 제거하고 한글은 유지
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

# NBVerse 라이브러리 import
NBVERSE_AVAILABLE = False
NBverseStorage = None
TextToNBConverter = None

try:
    # 먼저 pip로 설치된 경우 확인
    try:
        import NBverse
        if hasattr(NBverse, 'NBverseStorage') and hasattr(NBverse, 'TextToNBConverter'):
            NBverseStorage = NBverse.NBverseStorage
            TextToNBConverter = NBverse.TextToNBConverter
            NBVERSE_AVAILABLE = True
            safe_print("✅ NBVerse 라이브러리 로드 완료 (pip 설치)")
        else:
            raise ImportError("NBVerse 모듈에 필요한 클래스가 없습니다")
    except ImportError:
        # pip로 설치되지 않은 경우, 로컬 폴더에서 찾기
        base_dir = os.path.dirname(os.path.abspath(__file__))
        current_work_dir = os.getcwd()  # 현재 작업 디렉토리도 확인
        
        # 더 많은 상위 디렉토리 확인 (최대 10단계까지)
        possible_paths = []
        
        # 파일 위치 기준 경로
        current_dir = base_dir
        for i in range(10):  # 0~9단계 상위 디렉토리
            possible_paths.extend([
                os.path.join(current_dir, 'NBVerse'),
                os.path.join(current_dir, 'NBverse'),
                os.path.join(current_dir, 'NBVerseV01-main'),  # ZIP 다운로드 폴더
                os.path.join(current_dir, 'NBverseV01-main'),
            ])
            parent_dir = os.path.dirname(current_dir)
            if parent_dir == current_dir:  # 루트에 도달
                break
            current_dir = parent_dir
        
        # 현재 작업 디렉토리 기준 경로도 추가
        current_dir = current_work_dir
        for i in range(10):  # 0~9단계 상위 디렉토리
            possible_paths.extend([
                os.path.join(current_dir, 'NBVerse'),
                os.path.join(current_dir, 'NBverse'),
                os.path.join(current_dir, 'NBVerseV01-main'),  # ZIP 다운로드 폴더
                os.path.join(current_dir, 'NBverseV01-main'),
            ])
            parent_dir = os.path.dirname(current_dir)
            if parent_dir == current_dir:  # 루트에 도달
                break
            current_dir = parent_dir
        
        # 중복 제거 및 순서 유지
        seen = set()
        unique_paths = []
        for path in possible_paths:
            if path not in seen:
                seen.add(path)
                unique_paths.append(path)
        
        nbverse_found = False
        nbverse_path = None
        
        for path in unique_paths:
            # 경로 정규화 (절대 경로로 변환)
            abs_path = os.path.abspath(path)
            if os.path.exists(abs_path) and os.path.isdir(abs_path):
                # __init__.py가 직접 있는지 확인 (NBVerseV01-main 같은 경우)
                init_file_direct = os.path.join(abs_path, '__init__.py')
                if os.path.exists(init_file_direct):
                    nbverse_path = abs_path
                else:
                    # NBVerse 폴더 내부의 NBverse 폴더 확인
                    nbverse_inner = os.path.join(abs_path, 'NBverse')
                    if os.path.exists(nbverse_inner) and os.path.isdir(nbverse_inner):
                        nbverse_path = os.path.abspath(nbverse_inner)
                    else:
                        nbverse_path = abs_path
                
                # __init__.py가 있는지 확인
                init_file = os.path.join(nbverse_path, '__init__.py')
                if os.path.exists(init_file):
                    # 경로를 sys.path에 추가 (중복 방지)
                    nbverse_path_normalized = os.path.normpath(nbverse_path)
                    if nbverse_path_normalized not in [os.path.normpath(p) for p in sys.path]:
                        sys.path.insert(0, nbverse_path_normalized)
                        safe_print(f"📁 NBVerse 경로 추가: {nbverse_path_normalized}")
                    
                    # 상위 디렉토리도 경로에 추가 (NBVerse/NBverse 구조인 경우)
                    parent_path = os.path.dirname(nbverse_path_normalized)
                    parent_path_normalized = os.path.normpath(parent_path)
                    if parent_path_normalized not in [os.path.normpath(p) for p in sys.path] and parent_path_normalized != nbverse_path_normalized:
                        sys.path.insert(0, parent_path_normalized)
                    
                    nbverse_found = True
                    break
        
        if not nbverse_found:
            safe_print("⚠️ NBVerse 폴더를 찾을 수 없습니다.")
            print(f"   파일 위치 기준 디렉토리: {base_dir}")
            print(f"   현재 작업 디렉토리: {current_work_dir}")
            print("   확인한 경로 (처음 15개):")
            for i, path in enumerate(unique_paths[:15], 1):
                exists = "[OK]" if os.path.exists(path) else "[X]"
                print(f"     {i:2d}. {exists} {path}")
            print("   설치 방법:")
            print("   1. pip 설치 (권장): install_nbverse_pip.bat 실행")
            print("   2. 또는 수동 설치: git clone https://github.com/yoohyunseog/NBVerseV01.git NBVerse")
            print("   3. 또는 pip로 직접 설치: pip install git+https://github.com/yoohyunseog/NBVerseV01.git")
            raise ImportError("NBVerse 폴더를 찾을 수 없습니다")
        
        # NBverse 모듈 import 시도
        try:
            from NBverse import NBverseStorage, TextToNBConverter
        except ImportError as e1:
            try:
                # NBVerse/NBverse 구조인 경우
                from NBVerse.NBverse import NBverseStorage, TextToNBConverter
            except ImportError as e2:
                # 마지막 시도: 직접 import
                import importlib.util
                spec = importlib.util.spec_from_file_location(
                    "NBverse", 
                    os.path.join(nbverse_path, "__init__.py")
                )
                if spec and spec.loader:
                    nbverse_module = importlib.util.module_from_spec(spec)
                    spec.loader.exec_module(nbverse_module)
                    NBverseStorage = nbverse_module.NBverseStorage
                    TextToNBConverter = nbverse_module.TextToNBConverter
                else:
                    raise ImportError(f"NBVerse 모듈을 로드할 수 없습니다: {e1}, {e2}")
    
    NBVERSE_AVAILABLE = True
    safe_print("✅ NBVerse 라이브러리 로드 완료")
    
except ImportError as e:
    safe_print(f"⚠️ NBVerse 라이브러리를 찾을 수 없습니다: {e}")
    print("   설치 방법:")
    print("   1. 현재 디렉토리에서: git clone https://github.com/yoohyunseog/NBVerseV01.git NBVerse")
    print("   2. 또는 pip로 설치: pip install git+https://github.com/yoohyunseog/NBVerseV01.git")
    print("   NBVerse 기능을 사용할 수 없습니다.")
    NBVERSE_AVAILABLE = False
    NBverseStorage = None
    TextToNBConverter = None
except Exception as e:
    safe_print(f"⚠️ NBVerse 라이브러리 로드 중 예상치 못한 오류: {e}")
    import traceback
    traceback.print_exc()
    NBVERSE_AVAILABLE = False
    NBverseStorage = None
    TextToNBConverter = None


class SimpleNBCalculator:
    """간단한 N/B 계산기 (NBVerse가 없을 때 사용)"""
    def __init__(self, decimal_places=10):
        self.BIT_DEFAULT = 5.5
        self.NB_DECIMAL_PLACES = decimal_places
        getcontext().prec = 28
    
    def format_nb_value(self, value: float) -> float:
        """N/B 값을 소수점 자리수로 포맷팅"""
        if not math.isfinite(value) or math.isnan(value):
            return 0.0
        return round(float(Decimal(str(value))), self.NB_DECIMAL_PLACES)
    
    def calculate_simple_nb(self, prices: list) -> float:
        """간단한 N/B 값 계산 (가격 변화율 기반)"""
        if len(prices) < 2:
            return 0.5
        
        # 가격 변화율 계산
        price_changes = []
        for i in range(1, len(prices)):
            if prices[i-1] > 0:
                change = (prices[i] - prices[i-1]) / prices[i-1]
                price_changes.append(change)
        
        if not price_changes:
            return 0.5
        
        # 평균 변화율을 0~1 범위로 정규화
        avg_change = sum(price_changes) / len(price_changes)
        # -0.1 ~ 0.1 범위를 0 ~ 1로 매핑
        normalized = (avg_change + 0.1) / 0.2
        normalized = max(0.0, min(1.0, normalized))  # 0~1 범위로 제한
        
        return self.format_nb_value(normalized)


def calculate_nb_value_from_chart(chart_data, nbverse_storage=None, nbverse_converter=None, 
                                  settings_manager=None, nb_decimal_places=10):
    """차트 데이터로부터 N/B 값 계산"""
    try:
        if not chart_data or 'prices' not in chart_data:
            return 0.5
        
        # NBVerse를 사용하여 N/B 값 계산
        if NBVERSE_AVAILABLE and nbverse_storage and nbverse_converter:
            # 가격 데이터를 텍스트로 변환 (간단한 문자열 표현)
            prices_str = ",".join([str(p) for p in chart_data['prices'][-200:]])  # 최근 200개 사용
            
            # NBVerse로 변환
            result = nbverse_converter.text_to_nb(prices_str)
            bit_max = result.get('bitMax', 5.5)
            bit_min = result.get('bitMin', 5.5)
            
            # bitMax와 bitMin을 0~1 범위로 정규화 (일반적으로 0~10 범위)
            nb_max_normalized = max(0.0, min(1.0, bit_max / 10.0))
            nb_min_normalized = max(0.0, min(1.0, bit_min / 10.0))
            nb_value = (nb_max_normalized + nb_min_normalized) / 2.0
            
            # 소수점 자릿수 가져오기
            decimal_places = nb_decimal_places
            if settings_manager:
                decimal_places = settings_manager.get("nb_decimal_places", 10)
            if nbverse_storage and hasattr(nbverse_storage, 'decimal_places'):
                decimal_places = nbverse_storage.decimal_places
            
            # NBVerse에 저장
            try:
                nbverse_storage.save_text(
                    prices_str,
                    metadata={
                        'timeframe': chart_data.get('timeframe', 'unknown'),
                        'current_price': chart_data.get('current_price', 0),
                        'bit_max': bit_max,
                        'bit_min': bit_min,
                        'nb_value': nb_value,
                        'timestamp': datetime.now().isoformat()
                    }
                )
                safe_print(f"💾 NBVerse에 저장 완료: {chart_data.get('timeframe', 'unknown')} (bitMax: {bit_max:.{decimal_places}f}, bitMin: {bit_min:.{decimal_places}f})")
            except Exception as e:
                safe_print(f"⚠️ NBVerse 저장 오류: {e}")
                import traceback
                traceback.print_exc()
            
            return nb_value
        else:
            # NBVerse가 없으면 간단한 계산
            decimal_places = nb_decimal_places
            if settings_manager:
                decimal_places = settings_manager.get("nb_decimal_places", 10)
            
            calculator = SimpleNBCalculator(decimal_places=decimal_places)
            nb_value = calculator.calculate_simple_nb(chart_data['prices'])
            
            return nb_value
        
    except Exception as e:
        safe_print(f"⚠️ N/B 값 계산 오류: {e}, 기본값 0.5 사용")
        import traceback
        traceback.print_exc()
        return 0.5


def init_nbverse_storage(data_dir, decimal_places=10):
    """NBVerse 저장소 초기화"""
    if not NBVERSE_AVAILABLE or NBverseStorage is None:
        return None, None
    
    try:
        os.makedirs(data_dir, exist_ok=True)
        storage = NBverseStorage(data_dir=data_dir, decimal_places=decimal_places)
        converter = TextToNBConverter(bit=5.5, decimal_places=decimal_places)
        safe_print(f"✅ NBVerse 초기화 완료 (소수점 자리수: {decimal_places}, 데이터 디렉토리: {data_dir})")
        return storage, converter
    except Exception as e:
        safe_print(f"⚠️ NBVerse 초기화 오류: {e}")
        import traceback
        traceback.print_exc()
        return None, None

