"""차트 관련 컨트롤러"""
from PyQt6.QtCore import QObject, pyqtSignal
from typing import Optional


class ChartController(QObject):
    """차트 관리 컨트롤러"""
    
    # 시그널
    chart_data_ready = pyqtSignal(dict)
    chart_error = pyqtSignal(str)
    max_min_ready = pyqtSignal(float, float)
    
    def __init__(self, parent, settings_manager, nbverse_storage, nbverse_converter):
        super().__init__(parent)
        self.parent = parent
        self.settings_manager = settings_manager
        self.nbverse_storage = nbverse_storage
        self.nbverse_converter = nbverse_converter
        
        # 워커 변수
        self._chart_worker = None
        self._nb_max_min_worker = None
        
        # 상태 변수
        self._chart_updating = False
        self.chart_timeframes = ['1m', '3m', '5m', '15m', '30m', '60m', '1d']
        self.current_timeframe_index = 0
        self.current_chart_timeframe = None
        self.current_chart_max_nb = None
        self.current_chart_min_nb = None
        self.current_chart_nb_value = None
    
    def update_main_chart(self):
        """메인 차트 업데이트"""
        if self._chart_updating:
            return
        
        self._chart_updating = True
        
        if self.current_timeframe_index >= len(self.chart_timeframes):
            self.current_timeframe_index = 0
        
        timeframe = self.chart_timeframes[self.current_timeframe_index]
        self.current_timeframe_index = (self.current_timeframe_index + 1) % len(self.chart_timeframes)
        
        if self._chart_worker and self._chart_worker.isRunning():
            return
        
        from workers.chart_workers import ChartDataWorker
        self._chart_worker = ChartDataWorker(
            timeframe,
            self.settings_manager,
            self.nbverse_storage,
            self.nbverse_converter
        )
        self._chart_worker.chart_data_ready.connect(self._on_chart_data_ready)
        self._chart_worker.error_occurred.connect(self._on_chart_error)
        self._chart_worker.start()
    
    def _on_chart_data_ready(self, chart_data):
        """차트 데이터 준비 완료"""
        self._chart_updating = False
        self.current_chart_timeframe = chart_data.get('timeframe')
        self.chart_data_ready.emit(chart_data)
        
        # MAX/MIN 계산 시작
        self._calculate_max_min(chart_data)
    
    def _on_chart_error(self, error_msg):
        """차트 오류"""
        self._chart_updating = False
        self.chart_error.emit(error_msg)
    
    def _calculate_max_min(self, chart_data):
        """MAX/MIN 계산"""
        if self._nb_max_min_worker and self._nb_max_min_worker.isRunning():
            return
        
        from workers.chart_workers import NBMaxMinWorker
        self._nb_max_min_worker = NBMaxMinWorker(
            chart_data,
            self.nbverse_converter,
            self.settings_manager
        )
        self._nb_max_min_worker.max_min_ready.connect(self._on_max_min_ready)
        self._nb_max_min_worker.start()
    
    def _on_max_min_ready(self, bit_max, bit_min):
        """MAX/MIN 계산 완료"""
        try:
            if bit_max is not None and bit_min is not None:
                decimal_places = self.settings_manager.get("nb_decimal_places", 10)
                
                # MAX/MIN 레이블 업데이트
                if hasattr(self.parent, 'max_nb_label'):
                    self.parent.max_nb_label.setText(f"{bit_max:.{decimal_places}f}")
                if hasattr(self.parent, 'min_nb_label'):
                    self.parent.min_nb_label.setText(f"{bit_min:.{decimal_places}f}")
                
                # 좌측 차트에서 계산한 MAX/MIN 값을 저장
                self.current_chart_max_nb = bit_max
                self.current_chart_min_nb = bit_min
                
                # N/B 값 계산
                nb_max_normalized = max(0.0, min(1.0, bit_max / 10.0))
                nb_min_normalized = max(0.0, min(1.0, bit_min / 10.0))
                nb_value = (nb_max_normalized + nb_min_normalized) / 2.0
                
                self.current_chart_nb_value = round(nb_value, decimal_places)
                
                print(f"✅ 좌측 차트 N/B 값 계산 완료: {self.current_chart_nb_value:.{decimal_places}f}")
                
                self.max_min_ready.emit(bit_max, bit_min)
        except Exception as e:
            print(f"⚠️ MAX/MIN 표시 오류: {e}")
            import traceback
            traceback.print_exc()
    
    def update_chart_ui(self, chart_data):
        """차트 UI 업데이트"""
        if not hasattr(self.parent, 'main_chart_widget'):
            return
        
        try:
            self.parent.main_chart_widget.chart_data = chart_data
            self.parent.main_chart_widget.update()
        except Exception as e:
            print(f"⚠️ 차트 UI 업데이트 오류: {e}")

