# -*- coding: utf-8 -*-
"""프로파일링 로그 뷰어 GUI"""
import os
import sys
import re
from datetime import datetime
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout,
    QListWidget, QTextEdit, QTableWidget, QTableWidgetItem, QLabel,
    QPushButton, QSplitter, QFileDialog, QMessageBox, QHeaderView
)
from PyQt6.QtCore import Qt, QTimer
from PyQt6.QtGui import QFont, QColor

# matplotlib을 사용한 차트
try:
    import matplotlib
    matplotlib.use('Qt5Agg')  # PyQt6와 호환
    from matplotlib.backends.backend_qt5agg import FigureCanvasQTAgg as FigureCanvas
    from matplotlib.figure import Figure
    import matplotlib.pyplot as plt
    import matplotlib.font_manager as fm
    
    # 한글 폰트 설정
    # Windows에서 사용 가능한 한글 폰트 목록
    korean_fonts = ['Malgun Gothic', 'NanumGothic', 'Gulim', 'Batang']
    korean_font = None
    
    # 시스템에 설치된 폰트 중 한글 폰트 찾기
    font_list = [f.name for f in fm.fontManager.ttflist]
    for font_name in korean_fonts:
        if font_name in font_list:
            korean_font = font_name
            break
    
    if korean_font:
        # matplotlib 기본 폰트 설정
        matplotlib.rcParams['font.family'] = korean_font
        matplotlib.rcParams['axes.unicode_minus'] = False  # 마이너스 기호 깨짐 방지
        print(f"✅ 한글 폰트 설정 완료: {korean_font}")
    else:
        print("⚠️ 한글 폰트를 찾을 수 없습니다. 차트의 한글이 제대로 표시되지 않을 수 있습니다.")
        # 기본 폰트로 설정
        matplotlib.rcParams['axes.unicode_minus'] = False
    
    MATPLOTLIB_AVAILABLE = True
except ImportError:
    MATPLOTLIB_AVAILABLE = False
    print("⚠️ matplotlib이 설치되어 있지 않습니다. 차트 기능을 사용할 수 없습니다.")


class ProfileLogViewer(QMainWindow):
    """프로파일링 로그 뷰어"""
    
    def __init__(self):
        super().__init__()
        self.log_dir = os.path.join("data", "profiling_logs")
        self.current_log_data = None
        self.init_ui()
        self.load_log_files()
    
    def init_ui(self):
        """UI 초기화"""
        self.setWindowTitle("프로파일링 로그 뷰어")
        self.setGeometry(100, 100, 1400, 900)
        self.setStyleSheet("background-color: #0b1220; color: #ffffff;")
        
        # 중앙 위젯
        central_widget = QWidget()
        self.setCentralWidget(central_widget)
        
        # 메인 레이아웃
        main_layout = QHBoxLayout(central_widget)
        main_layout.setSpacing(10)
        main_layout.setContentsMargins(10, 10, 10, 10)
        
        # 스플리터 생성
        splitter = QSplitter(Qt.Orientation.Horizontal)
        main_layout.addWidget(splitter)
        
        # 왼쪽: 로그 파일 목록
        left_panel = QWidget()
        left_layout = QVBoxLayout(left_panel)
        left_layout.setContentsMargins(5, 5, 5, 5)
        
        left_label = QLabel("로그 파일 목록")
        left_label.setStyleSheet("font-size: 14px; font-weight: bold; padding: 5px;")
        left_layout.addWidget(left_label)
        
        self.log_list = QListWidget()
        self.log_list.setStyleSheet("""
            QListWidget {
                background-color: #1e2329;
                border: 1px solid #2a2e36;
                border-radius: 5px;
                padding: 5px;
            }
            QListWidget::item {
                padding: 8px;
                border-bottom: 1px solid #2a2e36;
            }
            QListWidget::item:selected {
                background-color: #00d1ff;
                color: #000000;
            }
            QListWidget::item:hover {
                background-color: #2a2e36;
            }
        """)
        self.log_list.itemClicked.connect(self.on_log_selected)
        left_layout.addWidget(self.log_list)
        
        # 새로고침 버튼
        refresh_btn = QPushButton("새로고침")
        refresh_btn.setStyleSheet("""
            QPushButton {
                background-color: #00d1ff;
                color: #000000;
                border: none;
                border-radius: 5px;
                padding: 8px;
                font-weight: bold;
            }
            QPushButton:hover {
                background-color: #00b8e6;
            }
        """)
        refresh_btn.clicked.connect(self.load_log_files)
        left_layout.addWidget(refresh_btn)
        
        splitter.addWidget(left_panel)
        
        # 오른쪽: 상세 정보
        right_panel = QWidget()
        right_layout = QVBoxLayout(right_panel)
        right_layout.setContentsMargins(5, 5, 5, 5)
        
        # 탭 위젯 (차트, 테이블, 원본 텍스트)
        from PyQt6.QtWidgets import QTabWidget
        self.tab_widget = QTabWidget()
        self.tab_widget.setStyleSheet("""
            QTabWidget::pane {
                background-color: #1e2329;
                border: 1px solid #2a2e36;
                border-radius: 5px;
            }
            QTabBar::tab {
                background-color: #2a2e36;
                color: #ffffff;
                padding: 8px 20px;
                border-top-left-radius: 5px;
                border-top-right-radius: 5px;
                margin-right: 2px;
            }
            QTabBar::tab:selected {
                background-color: #00d1ff;
                color: #000000;
            }
            QTabBar::tab:hover {
                background-color: #3a3e46;
            }
        """)
        
        # 차트 탭
        self.chart_widget = QWidget()
        chart_layout = QVBoxLayout(self.chart_widget)
        chart_layout.setContentsMargins(5, 5, 5, 5)
        
        if MATPLOTLIB_AVAILABLE:
            # matplotlib 차트 캔버스
            self.figure = Figure(figsize=(10, 6), facecolor='#1e2329')
            self.canvas = FigureCanvas(self.figure)
            self.canvas.setStyleSheet("background-color: #1e2329; border-radius: 5px;")
            chart_layout.addWidget(self.canvas)
        else:
            # matplotlib이 없으면 라벨 표시
            no_chart_label = QLabel("matplotlib이 설치되어 있지 않습니다.\npip install matplotlib 로 설치해주세요.")
            no_chart_label.setAlignment(Qt.AlignmentFlag.AlignCenter)
            no_chart_label.setStyleSheet("color: #888888; font-size: 14px; padding: 20px;")
            chart_layout.addWidget(no_chart_label)
        
        self.tab_widget.addTab(self.chart_widget, "차트")
        
        # 테이블 탭
        self.table_widget = QTableWidget()
        self.table_widget.setStyleSheet("""
            QTableWidget {
                background-color: #1e2329;
                border: 1px solid #2a2e36;
                border-radius: 5px;
                gridline-color: #2a2e36;
            }
            QTableWidget::item {
                padding: 5px;
                border: none;
            }
            QTableWidget::item:selected {
                background-color: #00d1ff;
                color: #000000;
            }
            QHeaderView::section {
                background-color: #2a2e36;
                color: #ffffff;
                padding: 8px;
                border: none;
                font-weight: bold;
            }
        """)
        self.tab_widget.addTab(self.table_widget, "테이블")
        
        # 원본 텍스트 탭
        self.text_widget = QTextEdit()
        self.text_widget.setStyleSheet("""
            QTextEdit {
                background-color: #1e2329;
                border: 1px solid #2a2e36;
                border-radius: 5px;
                color: #ffffff;
                font-family: 'Consolas', 'Courier New', monospace;
                font-size: 10px;
            }
        """)
        self.text_widget.setReadOnly(True)
        self.tab_widget.addTab(self.text_widget, "원본 텍스트")
        
        # 시스템 정보 탭
        self.system_info_widget = QTextEdit()
        self.system_info_widget.setStyleSheet("""
            QTextEdit {
                background-color: #1e2329;
                border: 1px solid #2a2e36;
                border-radius: 5px;
                color: #ffffff;
                font-family: 'Consolas', 'Courier New', monospace;
                font-size: 11px;
            }
        """)
        self.system_info_widget.setReadOnly(True)
        self.tab_widget.addTab(self.system_info_widget, "시스템 정보")
        
        right_layout.addWidget(self.tab_widget)
        
        splitter.addWidget(right_panel)
        
        # 스플리터 비율 설정
        splitter.setSizes([300, 1100])
    
    def load_log_files(self):
        """로그 파일 목록 로드"""
        self.log_list.clear()
        
        if not os.path.exists(self.log_dir):
            os.makedirs(self.log_dir, exist_ok=True)
            return
        
        # 로그 파일 목록 가져오기
        log_files = []
        for filename in os.listdir(self.log_dir):
            if filename.endswith('.txt'):
                filepath = os.path.join(self.log_dir, filename)
                mtime = os.path.getmtime(filepath)
                log_files.append((filename, mtime))
        
        # 최신순으로 정렬
        log_files.sort(key=lambda x: x[1], reverse=True)
        
        # 목록에 추가
        for filename, _ in log_files:
            self.log_list.addItem(filename)
        
        if log_files:
            # 첫 번째 항목 자동 선택
            self.log_list.setCurrentRow(0)
            self.on_log_selected(self.log_list.item(0))
    
    def on_log_selected(self, item):
        """로그 파일 선택 시"""
        if not item:
            return
        
        filename = item.text()
        filepath = os.path.join(self.log_dir, filename)
        
        if not os.path.exists(filepath):
            QMessageBox.warning(self, "오류", f"파일을 찾을 수 없습니다: {filename}")
            return
        
        # 파일 읽기
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()
            
            self.current_log_data = self.parse_log_file(content)
            
            # 디버깅: 파싱 결과 확인
            if self.current_log_data:
                summary_count = len(self.current_log_data.get('summary', []))
                print(f"📊 파싱된 요약 데이터: {summary_count}개 항목")
                if summary_count > 0:
                    print(f"   첫 번째 항목: {self.current_log_data['summary'][0]}")
            
            # 원본 텍스트 표시
            self.text_widget.setPlainText(content)
            
            # 차트 업데이트
            self.update_chart()
            
            # 테이블 업데이트
            self.update_table()
            
            # 시스템 정보 업데이트
            self.update_system_info()
            
        except Exception as e:
            QMessageBox.critical(self, "오류", f"파일 읽기 오류: {e}")
    
    def parse_log_file(self, content):
        """로그 파일 파싱"""
        data = {
            'summary': [],
            'system_info': {},
            'raw_content': content
        }
        
        # 요약 정보 파싱
        summary_section = re.search(r'\[요약 정보\](.*?)(?=\n\n|\[|$)', content, re.DOTALL)
        has_summary_data = False
        
        if summary_section:
            summary_text = summary_section.group(1)
            # "기록된 프로파일링 데이터가 없습니다" 메시지 체크
            if '기록된 프로파일링 데이터가 없습니다' in summary_text or '⚠️' in summary_text:
                print("📊 요약 정보에 데이터가 없어 cProfile 데이터를 파싱합니다...")
                has_summary_data = False
            else:
                # 테이블 형식 파싱
                lines = summary_text.strip().split('\n')
                header_found = False
                for line in lines:
                    line = line.strip()
                    if not line:
                        continue
                    # 헤더 라인 건너뛰기
                    if '함수명' in line and '호출' in line:
                        header_found = True
                        continue
                    # 구분선 건너뛰기
                    if '─' in line or '=' in line or '-' * 10 in line:
                        continue
                    if not header_found:
                        continue
                    
                    # 공백으로 분리 (함수명은 길 수 있으므로 마지막 4개는 숫자)
                    parts = line.split()
                    if len(parts) >= 5:
                        # 마지막 4개는 숫자 (호출, 총시간, 평균, 최대)
                        try:
                            max_time = float(parts[-1])
                            avg_time = float(parts[-2])
                            total_time = float(parts[-3])
                            call_count = int(parts[-4])
                            # 나머지는 함수명
                            func_name = ' '.join(parts[:-4])
                            
                            data['summary'].append({
                                'function': func_name,
                                'call_count': call_count,
                                'total_time': total_time,
                                'avg_time': avg_time,
                                'max_time': max_time
                            })
                            has_summary_data = True
                        except (ValueError, IndexError):
                            continue
        
        # 요약 정보가 비어있거나 "기록된 프로파일링 데이터가 없습니다" 메시지만 있으면 cProfile 데이터에서 파싱
        if not has_summary_data or len(data['summary']) == 0:
            print("📊 요약 정보가 비어있어 cProfile 데이터를 파싱합니다...")
            cprofile_summary = self.parse_cprofile_data(content)
            if cprofile_summary:
                data['summary'] = cprofile_summary
                print(f"✅ cProfile에서 {len(cprofile_summary)}개 항목 파싱 완료")
            else:
                print("⚠️ cProfile 데이터 파싱 실패")
                # 디버깅: cProfile 섹션 찾기 시도
                if '[상세 통계' in content:
                    print("   ℹ️ '상세 통계' 섹션은 발견되었지만 파싱에 실패했습니다.")
        
        # 시스템 정보 파싱
        system_section = re.search(r'\[시스템 정보\](.*?)(?=\n\n|$)', content, re.DOTALL)
        if system_section:
            system_text = system_section.group(1)
            for line in system_text.strip().split('\n'):
                line = line.strip()
                if ':' in line:
                    parts = line.split(':', 1)
                    if len(parts) == 2:
                        key = parts[0].strip()
                        value = parts[1].strip()
                        data['system_info'][key] = value
        
        return data
    
    def parse_cprofile_data(self, content):
        """cProfile 데이터에서 요약 정보 파싱"""
        summary = []
        
        # cProfile 섹션 찾기 (더 유연한 패턴)
        # 먼저 "[상세 통계"로 시작하는 부분 찾기
        start_idx = content.find('[상세 통계')
        if start_idx == -1:
            # 영어로도 시도
            start_idx = content.find('[Detailed Statistics')
        
        if start_idx != -1:
            # 다음 섹션 시작 부분 찾기 (다음 "[" 또는 파일 끝)
            next_section = content.find('\n[', start_idx + 1)
            if next_section == -1:
                cprofile_text = content[start_idx:]
            else:
                cprofile_text = content[start_idx:next_section]
            
            # "[상세 통계 ...]" 헤더 제거
            first_newline = cprofile_text.find('\n')
            if first_newline != -1:
                cprofile_text = cprofile_text[first_newline + 1:]
            
            print(f"✅ cProfile 섹션 발견 (시작 위치: {start_idx})")
        else:
            # 정규식으로 재시도
            cprofile_patterns = [
                r'\[상세 통계 \(cProfile\)\](.*?)(?=\n\n|\[|$)',
                r'\[상세 통계.*?cProfile.*?\](.*?)(?=\n\n|\[|$)',
                r'상세 통계.*?cProfile(.*?)(?=\n\n|\[|$)',
                r'\[상세 통계.*?\](.*?)(?=\n\n|\[|$)',  # cProfile 없이도 찾기
            ]
            
            cprofile_text = None
            for pattern in cprofile_patterns:
                match = re.search(pattern, content, re.DOTALL | re.IGNORECASE)
                if match:
                    cprofile_text = match.group(1)
                    print(f"✅ cProfile 섹션 발견 (정규식 패턴)")
                    break
        
        if not cprofile_text:
            print("⚠️ cProfile 섹션을 찾을 수 없습니다.")
            # 디버깅: content에서 관련 키워드 찾기
            if 'ncalls' in content:
                print("   ℹ️ 'ncalls' 키워드는 발견되었습니다.")
                # ncalls 주변 텍스트 출력
                ncalls_idx = content.find('ncalls')
                if ncalls_idx != -1:
                    print(f"   'ncalls' 주변 텍스트: {content[max(0, ncalls_idx-50):ncalls_idx+200]}")
            return summary
        
        lines = cprofile_text.split('\n')
        print(f"📊 cProfile 텍스트 라인 수: {len(lines)}")
        
        # 헤더 라인 찾기
        header_line_idx = -1
        for i, line in enumerate(lines):
            line_stripped = line.strip()
            line_lower = line_stripped.lower()
            # "ncalls"와 "cumtime" 또는 "tottime"이 모두 포함되어 있고, "Ordered by" 같은 메타 정보가 아닌 경우
            if 'ncalls' in line_lower and ('cumtime' in line_lower or 'tottime' in line_lower) and 'ordered by' not in line_lower:
                header_line_idx = i
                print(f"✅ 헤더 라인 발견: 인덱스 {i}, 내용: {line[:80]}")
                break
        
        if header_line_idx == -1:
            print("⚠️ cProfile 헤더 라인을 찾을 수 없습니다.")
            print(f"   첫 15개 라인:")
            for i, line in enumerate(lines[:15]):
                print(f"   {i}: {repr(line[:80])}")
            return summary
        
        # 데이터 라인 파싱
        parsed_count = 0
        skipped_count = 0
        
        for line_idx, line in enumerate(lines[header_line_idx + 1:], start=header_line_idx + 1):
            original_line = line
            # strip하지 않고 원본 유지 (공백으로 시작하는 라인도 처리)
            line_stripped = line.strip()
            
            # 빈 라인 건너뛰기
            if not line_stripped:
                continue
            
            # 구분선 건너뛰기
            if line_stripped.startswith('-') or line_stripped.startswith('=') or line_stripped.startswith('─'):
                continue
            
            # 최소 길이 체크
            if len(line_stripped) < 10:
                continue
            
            # 데이터 라인 체크: 숫자나 '/' 또는 '{' 또는 '('로 시작하거나, 공백으로 시작하는 라인
            first_char_stripped = line_stripped[0] if line_stripped else ''
            first_char_original = line[0] if line else ''
            
            # 데이터 라인 조건: 숫자, '/', '{', '('로 시작하거나, 원본 라인이 공백으로 시작
            is_data_line = (
                first_char_stripped.isdigit() or 
                first_char_stripped == '/' or 
                first_char_stripped == '{' or 
                first_char_stripped == '(' or
                first_char_original == ' ' or
                first_char_original == '\t'
            )
            
            if not is_data_line:
                skipped_count += 1
                if skipped_count <= 3:  # 처음 3개만 디버깅 출력
                    print(f"   건너뛴 라인 {line_idx}: {repr(line_stripped[:60])}")
                continue
            
            # 공백으로 분리 (최대 6개로 분리 - 마지막이 함수명)
            # strip된 라인 사용 (공백 정규화)
            parts = line_stripped.split(None, 5)
            
            # 원본 라인도 시도 (공백 보존)
            if len(parts) < 6:
                parts_original = line.split(None, 5)
                if len(parts_original) >= 6:
                    parts = parts_original
            
            if len(parts) >= 6:
                try:
                    # 첫 번째: ncalls (예: "1" 또는 "66/23" 또는 "238/55")
                    ncalls_str = parts[0].strip()
                    if '/' in ncalls_str:
                        ncalls_str = ncalls_str.split('/')[0]
                    ncalls = int(ncalls_str)
                    
                    # 두 번째: tottime
                    tottime = float(parts[1])
                    
                    # 세 번째: percall (tottime)
                    percall_tottime = float(parts[2])
                    
                    # 네 번째: cumtime (총 시간)
                    cumtime = float(parts[3])
                    
                    # 다섯 번째: percall (cumtime)
                    percall_cumtime = float(parts[4])
                    
                    # 여섯 번째: 함수명
                    func_name = parts[5].strip()
                    
                    # 함수명 정리
                    if len(func_name) > 100:
                        func_name = func_name[:97] + "..."
                    
                    summary.append({
                        'function': func_name,
                        'call_count': ncalls,
                        'total_time': cumtime,  # 누적 시간을 총 시간으로 사용
                        'avg_time': percall_cumtime,  # 평균 시간
                        'max_time': percall_cumtime  # 최대 시간
                    })
                    parsed_count += 1
                    
                    # 처음 3개만 디버깅 출력
                    if parsed_count <= 3:
                        print(f"   ✅ 파싱 성공 {parsed_count}: {func_name[:50]} (cumtime: {cumtime:.3f})")
                    
                except (ValueError, IndexError) as e:
                    # 파싱 실패 시 해당 라인 건너뛰기
                    skipped_count += 1
                    if skipped_count <= 5:  # 처음 5개만 디버깅 출력
                        print(f"   ❌ 파싱 실패 라인 {line_idx}: {repr(line_stripped[:60])} (오류: {e})")
                        print(f"      parts: {parts}")
                    continue
            elif len(parts) >= 5:
                # 5개 필드만 있는 경우도 시도 (함수명이 없는 경우)
                try:
                    ncalls_str = parts[0].strip()
                    if '/' in ncalls_str:
                        ncalls_str = ncalls_str.split('/')[0]
                    ncalls = int(ncalls_str)
                    tottime = float(parts[1])
                    percall_tottime = float(parts[2])
                    cumtime = float(parts[3])
                    percall_cumtime = float(parts[4])
                    
                    summary.append({
                        'function': 'unknown',
                        'call_count': ncalls,
                        'total_time': cumtime,
                        'avg_time': percall_cumtime,
                        'max_time': percall_cumtime
                    })
                    parsed_count += 1
                except (ValueError, IndexError):
                    skipped_count += 1
                    continue
        
        print(f"✅ cProfile 데이터 파싱 완료: {parsed_count}개 함수")
        if skipped_count > 0:
            print(f"   ℹ️ 건너뛴 라인: {skipped_count}개")
        if parsed_count == 0:
            print(f"⚠️ 파싱된 데이터가 없습니다. 헤더 라인 인덱스: {header_line_idx}")
            print(f"   첫 10개 데이터 라인:")
            for i, line in enumerate(lines[header_line_idx:header_line_idx+10]):
                print(f"   {i}: {line[:80]}")
        return summary
    
    def update_chart(self):
        """차트 업데이트"""
        if not MATPLOTLIB_AVAILABLE:
            print("⚠️ matplotlib이 사용 불가능합니다.")
            return
        
        if not self.current_log_data:
            print("⚠️ 로그 데이터가 없습니다.")
            self._show_chart_error("로그 데이터가 없습니다")
            return
        
        summary = self.current_log_data.get('summary', [])
        if not summary:
            print("⚠️ 요약 데이터가 없습니다.")
            print(f"   current_log_data keys: {list(self.current_log_data.keys()) if self.current_log_data else 'None'}")
            if self.current_log_data:
                print(f"   summary 타입: {type(summary)}, 길이: {len(summary)}")
            self._show_chart_error("요약 데이터가 없습니다")
            return
        
        print(f"📊 차트 업데이트: {len(summary)}개 항목")
        if len(summary) > 0:
            print(f"   첫 번째 항목 예시: {summary[0]}")
        
        # 상위 10개 함수만 표시
        summary = sorted(
            self.current_log_data['summary'],
            key=lambda x: x['total_time'],
            reverse=True
        )[:10]
        
        # 데이터 준비
        func_names = []
        total_times = []
        
        for item in summary:
            func_name = item['function']
            # 함수명이 너무 길면 잘라내기
            if len(func_name) > 40:
                func_name = func_name[:37] + "..."
            func_names.append(func_name)
            total_times.append(item['total_time'])
        
        # 차트 그리기
        try:
            self.figure.clear()
            ax = self.figure.add_subplot(111)
            
            # 한글 폰트 설정 (차트용)
            try:
                korean_fonts = ['Malgun Gothic', 'NanumGothic', 'Gulim', 'Batang']
                font_list = [f.name for f in fm.fontManager.ttflist]
                chart_font = None
                for font_name in korean_fonts:
                    if font_name in font_list:
                        chart_font = font_name
                        break
                
                if chart_font:
                    # 폰트 속성 설정
                    font_prop = fm.FontProperties(family=chart_font)
                else:
                    font_prop = None
            except:
                font_prop = None
            
            # 바 차트 생성 (역순으로 표시 - 위에서 아래로)
            y_pos = list(range(len(func_names)))
            bars = ax.barh(y_pos, total_times, color='#00d1ff', height=0.6)
            
            # 레이블 설정
            ax.set_yticks(y_pos)
            # 함수명 정리 (특수 문자 처리)
            clean_func_names = []
            for name in func_names:
                # 너무 긴 경로는 파일명만 표시
                if '\\' in name or '/' in name:
                    # 파일 경로에서 파일명만 추출
                    parts = name.replace('\\', '/').split('/')
                    if parts:
                        name = parts[-1]
                # 괄호 제거 또는 간소화
                if '(' in name:
                    # 함수명만 추출 (괄호 앞부분)
                    name = name.split('(')[0].strip()
                clean_func_names.append(name)
            
            # 폰트 속성 적용
            if font_prop:
                ax.set_yticklabels(clean_func_names, color='#ffffff', fontsize=8, fontproperties=font_prop)
                ax.set_xlabel('총 실행 시간 (초)', color='#ffffff', fontsize=11, fontproperties=font_prop)
                ax.set_title('함수별 총 실행 시간 (상위 10개)', color='#ffffff', fontsize=12, fontweight='bold', fontproperties=font_prop)
            else:
                ax.set_yticklabels(clean_func_names, color='#ffffff', fontsize=8)
                ax.set_xlabel('총 실행 시간 (초)', color='#ffffff', fontsize=11)
                ax.set_title('함수별 총 실행 시간 (상위 10개)', color='#ffffff', fontsize=12, fontweight='bold')
            
            # 축 색상 설정
            ax.set_facecolor('#1e2329')
            for spine in ax.spines.values():
                spine.set_color('#ffffff')
            ax.tick_params(colors='#ffffff', labelsize=8)
            ax.xaxis.label.set_color('#ffffff')
            ax.yaxis.label.set_color('#ffffff')
            
            # 값 표시 (시간이 0보다 큰 경우만)
            for i, (bar, time) in enumerate(zip(bars, total_times)):
                if time > 0:
                    # 값이 너무 작으면 표시하지 않음
                    if time > max(total_times) * 0.01:  # 최대값의 1% 이상인 경우만
                        ax.text(time, i, f' {time:.2f}s', 
                               va='center', color='#ffffff', fontsize=7)
            
            # 그리드 추가 (선택사항)
            ax.grid(True, alpha=0.3, color='#666666', linestyle='--')
            ax.set_axisbelow(True)
            
            # Y축 반전 (위에서 아래로)
            ax.invert_yaxis()
            
            self.figure.patch.set_facecolor('#1e2329')
            self.figure.tight_layout(pad=2.0)
            self.canvas.draw()
            print(f"✅ 차트 그리기 완료: {len(func_names)}개 함수")
        except Exception as e:
            # 차트 그리기 오류 시 메시지 표시
            print(f"❌ 차트 그리기 오류: {e}")
            import traceback
            traceback.print_exc()
            self._show_chart_error(f'차트 그리기 오류:\n{str(e)}')
    
    def _show_chart_error(self, message):
        """차트 오류 메시지 표시"""
        try:
            self.figure.clear()
            ax = self.figure.add_subplot(111)
            ax.text(0.5, 0.5, message, 
                   ha='center', va='center', 
                   transform=ax.transAxes,
                   color='#ffffff', fontsize=14)
            ax.set_facecolor('#1e2329')
            self.figure.patch.set_facecolor('#1e2329')
            self.canvas.draw()
        except:
            pass
    
    def update_table(self):
        """테이블 업데이트"""
        if not self.current_log_data or not self.current_log_data['summary']:
            self.table_widget.setRowCount(0)
            return
        
        summary = sorted(
            self.current_log_data['summary'],
            key=lambda x: x['total_time'],
            reverse=True
        )
        
        # 테이블 설정
        self.table_widget.setRowCount(len(summary))
        self.table_widget.setColumnCount(5)
        self.table_widget.setHorizontalHeaderLabels([
            "함수명", "호출 횟수", "총 시간 (초)", "평균 시간 (ms)", "최대 시간 (ms)"
        ])
        
        # 데이터 채우기
        for row, item in enumerate(summary):
            self.table_widget.setItem(row, 0, QTableWidgetItem(item['function']))
            self.table_widget.setItem(row, 1, QTableWidgetItem(str(item['call_count'])))
            self.table_widget.setItem(row, 2, QTableWidgetItem(f"{item['total_time']:.4f}"))
            self.table_widget.setItem(row, 3, QTableWidgetItem(f"{item['avg_time']*1000:.2f}"))
            self.table_widget.setItem(row, 4, QTableWidgetItem(f"{item['max_time']*1000:.2f}"))
        
        # 컬럼 너비 자동 조정
        self.table_widget.resizeColumnsToContents()
        header = self.table_widget.horizontalHeader()
        header.setStretchLastSection(True)
    
    def update_system_info(self):
        """시스템 정보 업데이트"""
        if not self.current_log_data or not self.current_log_data['system_info']:
            self.system_info_widget.setPlainText("시스템 정보가 없습니다.")
            return
        
        info_text = "시스템 정보\n"
        info_text += "=" * 50 + "\n\n"
        
        for key, value in self.current_log_data['system_info'].items():
            info_text += f"{key}: {value}\n"
        
        self.system_info_widget.setPlainText(info_text)


def main():
    """메인 함수"""
    app = QApplication(sys.argv)
    
    # 폰트 설정
    font = QFont("나눔고딕", 10)
    app.setFont(font)
    
    # 뷰어 창 생성
    viewer = ProfileLogViewer()
    viewer.show()
    
    sys.exit(app.exec())


if __name__ == "__main__":
    main()

