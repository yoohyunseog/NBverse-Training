"""
NBverse CLI 도구
사용자 입력을 받아 N/B 값으로 변환하고 저장/조회하는 인터페이스
"""

import sys
import os
from datetime import datetime
from typing import Optional, List, Dict

# 상위 디렉토리를 경로에 추가
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from NBverse import NBverseStorage, TextToNBConverter
from NBverse.config import NBverseConfig


class NBverseCLI:
    """NBverse CLI 클래스"""
    
    def __init__(self):
        """초기화"""
        self.config = NBverseConfig()
        self.decimal_places = self.config.get_decimal_places()
        self.storage = NBverseStorage(
            data_dir=self.config.get_data_dir(),
            decimal_places=self.decimal_places
        )
        self.converter = TextToNBConverter(
            bit=self.config.get_bit_default(),
            decimal_places=self.decimal_places
        )
    
    def print_header(self):
        """헤더 출력"""
        print("=" * 70)
        print("NBverse - 문자를 N/B 값으로 변환하는 라이브러리")
        print("=" * 70)
        print(f"현재 설정:")
        print(f"  - 소수점 자리수: {self.decimal_places}")
        print(f"  - 기본 비트 값: {self.config.get_bit_default()}")
        print(f"  - 데이터 디렉토리: {self.config.get_data_dir()}")
        print("=" * 70)
        print()
    
    def print_menu(self):
        """메뉴 출력"""
        print("\n[메뉴]")
        print("1. 텍스트 입력 및 저장")
        print("2. 저장된 데이터 조회")
        print("3. N/B 값으로 검색")
        print("4. 설정 변경 (소수점 자리수)")
        print("5. 설정 변경 (데이터 디렉토리)")
        print("6. 설정 변경 (기본 비트 값)")
        print("0. 종료")
        print()
    
    def input_text_and_save(self):
        """텍스트 입력 및 저장"""
        print("\n" + "=" * 70)
        print("텍스트 입력 및 저장")
        print("=" * 70)
        
        text = input("텍스트를 입력하세요: ").strip()
        
        if not text:
            print("❌ 텍스트가 입력되지 않았습니다.")
            return
        
        try:
            # N/B 값 계산
            result = self.converter.text_to_nb(text)
            
            # 저장
            save_result = self.storage.save_text(
                text, 
                metadata={
                    'input_method': 'cli',
                    'decimal_places': self.decimal_places
                }
            )
            
            # 결과 출력
            print("\n✅ 저장 완료!")
            print(f"입력 텍스트: {text}")
            print(f"bitMax: {result['bitMax']:.{self.decimal_places}f}")
            print(f"bitMin: {result['bitMin']:.{self.decimal_places}f}")
            print(f"\n저장 정보:")
            print(f"  - 저장 날짜: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            print(f"  - 저장 형식: JSON")
            print(f"  - max 경로: {save_result['max_path']}")
            print(f"  - min 경로: {save_result['min_path']}")
            print(f"  - 유니코드 배열 길이: {len(result['unicodeArray'])}")
            
        except Exception as e:
            print(f"❌ 오류 발생: {e}")
    
    def list_saved_data(self):
        """저장된 데이터 목록 조회"""
        print("\n" + "=" * 70)
        print("저장된 데이터 조회")
        print("=" * 70)
        
        max_dir = self.storage.max_dir
        min_dir = self.storage.min_dir
        
        print(f"\n[max 폴더: {max_dir}]")
        max_files = self._list_files_in_directory(max_dir)
        print(f"  총 {len(max_files)}개 파일")
        
        print(f"\n[min 폴더: {min_dir}]")
        min_files = self._list_files_in_directory(min_dir)
        print(f"  총 {len(min_files)}개 파일")
        
        if max_files or min_files:
            print("\n최근 저장된 파일 (최대 10개):")
            all_files = max_files + min_files
            all_files.sort(key=lambda x: x.get('modified_time', 0), reverse=True)
            
            for i, file_info in enumerate(all_files[:10], 1):
                print(f"\n{i}. {file_info['filename']}")
                print(f"   경로: {file_info['path']}")
                print(f"   수정 시간: {file_info['modified_time_str']}")
                
                # 파일 내용 로드
                data = self.storage.load_from_path(file_info['path'])
                if data:
                    print(f"   텍스트: {data.get('text', 'N/A')}")
                    if 'nb' in data:
                        nb = data['nb']
                        print(f"   bitMax: {nb.get('max', 0):.{self.decimal_places}f}")
                        print(f"   bitMin: {nb.get('min', 0):.{self.decimal_places}f}")
                    print(f"   계산 시간: {data.get('calculated_at', 'N/A')}")
        else:
            print("\n저장된 파일이 없습니다.")
    
    def _list_files_in_directory(self, directory: str) -> List[Dict]:
        """디렉토리의 모든 JSON 파일 목록"""
        files = []
        
        if not os.path.exists(directory):
            return files
        
        for root, dirs, filenames in os.walk(directory):
            for filename in filenames:
                if filename.endswith('.json'):
                    file_path = os.path.join(root, filename)
                    try:
                        stat = os.stat(file_path)
                        files.append({
                            'path': file_path,
                            'filename': filename,
                            'modified_time': stat.st_mtime,
                            'modified_time_str': datetime.fromtimestamp(stat.st_mtime).strftime('%Y-%m-%d %H:%M:%S')
                        })
                    except:
                        pass
        
        return files
    
    def search_by_nb_value(self):
        """N/B 값으로 검색"""
        print("\n" + "=" * 70)
        print("N/B 값으로 검색")
        print("=" * 70)
        
        try:
            nb_value_str = input("검색할 N/B 값을 입력하세요: ").strip()
            if not nb_value_str:
                print("❌ N/B 값이 입력되지 않았습니다.")
                return
            
            nb_value = float(nb_value_str)
            
            folder_type = input("검색할 폴더 (max/min, 기본값: max): ").strip().lower()
            if folder_type not in ['max', 'min']:
                folder_type = 'max'
            
            limit_str = input("최대 결과 개수 (기본값: 10): ").strip()
            limit = int(limit_str) if limit_str.isdigit() else 10
            
            results = self.storage.find_by_nb_value(nb_value, folder_type=folder_type, limit=limit)
            
            print(f"\n검색 결과: {len(results)}개")
            print(f"검색 N/B 값: {nb_value:.{self.decimal_places}f}")
            print(f"검색 폴더: {folder_type}")
            
            if results:
                for i, result in enumerate(results, 1):
                    print(f"\n[{i}]")
                    print(f"  경로: {result['path']}")
                    data = result['data']
                    print(f"  텍스트: {data.get('text', 'N/A')}")
                    if 'nb' in data:
                        nb = data['nb']
                        print(f"  bitMax: {nb.get('max', 0):.{self.decimal_places}f}")
                        print(f"  bitMin: {nb.get('min', 0):.{self.decimal_places}f}")
                    print(f"  저장 날짜: {data.get('calculated_at', 'N/A')}")
                    print(f"  저장 형식: JSON")
                    if 'metadata' in data:
                        print(f"  메타데이터: {data['metadata']}")
            else:
                print("\n검색 결과가 없습니다.")
                
        except ValueError:
            print("❌ 올바른 숫자를 입력하세요.")
        except Exception as e:
            print(f"❌ 오류 발생: {e}")
    
    def change_decimal_places(self):
        """소수점 자리수 변경"""
        print("\n" + "=" * 70)
        print("소수점 자리수 변경")
        print("=" * 70)
        print(f"현재 소수점 자리수: {self.decimal_places}")
        
        try:
            new_decimal = input("새로운 소수점 자리수 (0~20): ").strip()
            if not new_decimal.isdigit():
                print("❌ 올바른 숫자를 입력하세요.")
                return
            
            new_decimal = int(new_decimal)
            if new_decimal < 0 or new_decimal > 20:
                print("❌ 소수점 자리수는 0~20 사이여야 합니다.")
                return
            
            self.config.set_decimal_places(new_decimal)
            self.decimal_places = new_decimal
            # converter와 storage도 업데이트
            self.converter = TextToNBConverter(
                bit=self.config.get_bit_default(),
                decimal_places=self.decimal_places
            )
            self.storage = NBverseStorage(
                data_dir=self.config.get_data_dir(),
                decimal_places=self.decimal_places
            )
            print(f"✅ 소수점 자리수가 {new_decimal}로 변경되었습니다.")
            
        except Exception as e:
            print(f"❌ 오류 발생: {e}")
    
    def change_data_dir(self):
        """데이터 디렉토리 변경"""
        print("\n" + "=" * 70)
        print("데이터 디렉토리 변경")
        print("=" * 70)
        print(f"현재 데이터 디렉토리: {self.config.get_data_dir()}")
        
        new_dir = input("새로운 데이터 디렉토리 경로: ").strip()
        if not new_dir:
            print("❌ 경로가 입력되지 않았습니다.")
            return
        
        try:
            self.config.set_data_dir(new_dir)
            self.storage = NBverseStorage(
                data_dir=new_dir,
                decimal_places=self.decimal_places
            )
            print(f"✅ 데이터 디렉토리가 '{new_dir}'로 변경되었습니다.")
            
        except Exception as e:
            print(f"❌ 오류 발생: {e}")
    
    def change_bit_default(self):
        """기본 비트 값 변경"""
        print("\n" + "=" * 70)
        print("기본 비트 값 변경")
        print("=" * 70)
        print(f"현재 기본 비트 값: {self.config.get_bit_default()}")
        
        try:
            new_bit = input("새로운 기본 비트 값: ").strip()
            if not new_bit:
                print("❌ 값이 입력되지 않았습니다.")
                return
            
            new_bit = float(new_bit)
            self.config.set_bit_default(new_bit)
            self.converter = TextToNBConverter(
                bit=new_bit,
                decimal_places=self.decimal_places
            )
            print(f"✅ 기본 비트 값이 {new_bit}로 변경되었습니다.")
            
        except ValueError:
            print("❌ 올바른 숫자를 입력하세요.")
        except Exception as e:
            print(f"❌ 오류 발생: {e}")
    
    def run(self):
        """CLI 실행"""
        self.print_header()
        
        while True:
            self.print_menu()
            choice = input("선택하세요: ").strip()
            
            if choice == '0':
                print("\n프로그램을 종료합니다.")
                break
            elif choice == '1':
                self.input_text_and_save()
            elif choice == '2':
                self.list_saved_data()
            elif choice == '3':
                self.search_by_nb_value()
            elif choice == '4':
                self.change_decimal_places()
            elif choice == '5':
                self.change_data_dir()
            elif choice == '6':
                self.change_bit_default()
            else:
                print("❌ 잘못된 선택입니다.")
            
            input("\n계속하려면 Enter를 누르세요...")


if __name__ == "__main__":
    cli = NBverseCLI()
    cli.run()

