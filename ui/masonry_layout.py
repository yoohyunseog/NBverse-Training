"""Masonry 레이아웃 모듈"""
from PyQt6.QtWidgets import QWidget, QVBoxLayout, QHBoxLayout
from PyQt6.QtCore import Qt, QTimer


class MasonryLayout(QWidget):
    """Masonry 스타일 레이아웃 위젯"""
    def __init__(self, parent=None, columns=3, min_card_width=280, column_spacing=10):
        super().__init__(parent)
        self.base_columns = columns  # 기본 열 수
        self.min_card_width = min_card_width
        self.column_spacing = column_spacing
        self.column_widgets = []
        self.column_heights = []
        self.stored_widgets = []  # 위젯 저장용
        self._widget_height_cache = {}  # 위젯 높이 캐시 {widget_id: height}
        
        # resizeEvent 디바운싱을 위한 타이머
        self._resize_timer = QTimer()
        self._resize_timer.setSingleShot(True)
        self._resize_timer.timeout.connect(self._on_resize_timeout)
        self._pending_resize = False
        
        # 열 레이아웃 생성
        self.main_layout = QHBoxLayout(self)
        self.main_layout.setContentsMargins(0, 0, 0, 0)
        self.main_layout.setSpacing(column_spacing)
        
        self._create_columns(columns)
    
    def _create_columns(self, columns):
        """열 생성"""
        # 기존 열 제거
        while self.main_layout.count():
            child = self.main_layout.takeAt(0)
            if child.widget():
                child.widget().deleteLater()
        
        self.columns = columns
        self.column_widgets = []
        self.column_heights = []
        # 높이 캐시는 유지 (위젯이 재배치되어도 캐시 유용)
        
        for i in range(columns):
            col_widget = QWidget()
            col_layout = QVBoxLayout(col_widget)
            col_layout.setContentsMargins(0, 0, 0, 0)
            col_layout.setSpacing(10)
            col_widget.setLayout(col_layout)
            self.column_widgets.append(col_widget)
            self.column_heights.append(0)
            self.main_layout.addWidget(col_widget)
    
    def _calculate_optimal_columns(self):
        """창 크기에 따라 최적의 열 수 계산"""
        if not self.isVisible():
            return self.base_columns
        
        available_width = self.width()
        if available_width <= 0:
            return self.base_columns
        
        # 카드 너비 + 간격을 고려하여 열 수 계산
        card_width_with_spacing = self.min_card_width + self.column_spacing
        optimal_columns = max(1, int(available_width / card_width_with_spacing))
        
        # 최소 1개, 최대는 너무 많지 않도록 제한
        optimal_columns = max(1, min(optimal_columns, 6))
        
        return optimal_columns
    
    def resizeEvent(self, event):
        """창 크기 변경 시 열 수 자동 조정 (디바운싱 적용)"""
        super().resizeEvent(event)
        
        # 디바운싱: 300ms 후에 실제 리사이즈 처리
        self._pending_resize = True
        if not self._resize_timer.isActive():
            self._resize_timer.start(300)  # 300ms 디바운스
    
    def _on_resize_timeout(self):
        """리사이즈 타이머 타임아웃 (실제 리사이즈 처리)"""
        if not self._pending_resize:
            return
        
        self._pending_resize = False
        
        optimal_columns = self._calculate_optimal_columns()
        if optimal_columns != self.columns:
            # 기존 위젯들 저장
            widgets = []
            for col_widget in self.column_widgets:
                col_layout = col_widget.layout()
                while col_layout.count():
                    child = col_layout.takeAt(0)
                    if child.widget():
                        widgets.append(child.widget())
            
            # 새 열 수로 재구성
            self._create_columns(optimal_columns)
            
            # 위젯들 다시 추가 (배치로 처리하여 성능 향상)
            if widgets:
                self.add_widgets_batch(widgets)
            
            # 모든 위젯 추가 후 한 번만 UI 업데이트
            from PyQt6.QtWidgets import QApplication
            QApplication.processEvents()
    
    def _get_widget_height(self, widget):
        """위젯 높이 가져오기 (캐시 사용)"""
        widget_id = id(widget)  # 위젯의 고유 ID
        
        # 캐시에 있으면 캐시된 값 사용
        if widget_id in self._widget_height_cache:
            return self._widget_height_cache[widget_id]
        
        # 캐시에 없으면 계산하고 캐시에 저장
        if widget.isVisible():
            widget_height = widget.sizeHint().height()
        else:
            # 추정 높이 사용 (실제 계산보다 빠름)
            widget_height = 200  # 기본 카드 높이 추정값
        
        # 캐시에 저장
        self._widget_height_cache[widget_id] = widget_height
        return widget_height
    
    def _invalidate_widget_cache(self, widget):
        """위젯 높이 캐시 무효화 (내부용)"""
        widget_id = id(widget)
        if widget_id in self._widget_height_cache:
            del self._widget_height_cache[widget_id]
    
    def invalidate_cache(self, widget=None):
        """위젯 높이 캐시 무효화 (공개 메서드)
        
        Args:
            widget: 특정 위젯의 캐시만 무효화. None이면 전체 캐시 초기화
        """
        if widget is None:
            # 전체 캐시 초기화
            self._widget_height_cache.clear()
        else:
            # 특정 위젯의 캐시만 무효화
            self._invalidate_widget_cache(widget)
    
    def add_widget(self, widget):
        """위젯을 가장 짧은 열에 추가 (단일 위젯용)"""
        if not self.column_widgets:
            return
        
        shortest_idx = self.column_heights.index(min(self.column_heights))
        col_layout = self.column_widgets[shortest_idx].layout()
        col_layout.addWidget(widget)
        
        # 캐시를 사용하여 높이 가져오기
        widget_height = self._get_widget_height(widget)
        
        self.column_heights[shortest_idx] += widget_height + col_layout.spacing()
        self.stored_widgets.append(widget)  # 위젯 저장
    
    def add_widgets_batch(self, widgets):
        """여러 위젯을 배치로 추가 (성능 최적화)"""
        if not widgets or not self.column_widgets:
            return
        
        # 레이아웃 업데이트 비활성화하여 성능 향상
        self.setUpdatesEnabled(False)
        
        try:
            # 모든 열의 레이아웃 업데이트 비활성화
            for col_widget in self.column_widgets:
                col_widget.setUpdatesEnabled(False)
            
            # 높이 계산을 한 번에 수행 (성능 최적화)
            column_heights_copy = self.column_heights[:]  # 복사본 사용
            
            # 위젯들을 배치로 추가
            for widget in widgets:
                if not widget:
                    continue
                
                shortest_idx = column_heights_copy.index(min(column_heights_copy))
                col_layout = self.column_widgets[shortest_idx].layout()
                col_layout.addWidget(widget)
                
                # 캐시를 사용하여 높이 가져오기
                widget_height = self._get_widget_height(widget)
                
                column_heights_copy[shortest_idx] += widget_height + col_layout.spacing()
                self.stored_widgets.append(widget)
            
            # 한 번에 높이 업데이트 (성능 최적화)
            self.column_heights = column_heights_copy
            
        finally:
            # 레이아웃 업데이트 활성화
            for col_widget in self.column_widgets:
                col_widget.setUpdatesEnabled(True)
            self.setUpdatesEnabled(True)
    
    def remove_widget(self, widget):
        """특정 위젯 제거"""
        card_id = 'unknown'
        if hasattr(widget, 'card') and widget.card:
            card_id = widget.card.get('card_id', 'unknown')
        
        print(f"🗑️ [위젯 제거 시작] 카드: {card_id}")
        
        if widget not in self.stored_widgets:
            print(f"  ℹ️ 위젯이 stored_widgets에 없습니다 (이미 제거됨)")
            return
        
        # 위젯의 cleanup 메서드 호출 (UI 반응성을 위해 비동기 처리)
        if hasattr(widget, 'cleanup'):
            try:
                print(f"  → 위젯 cleanup 시작 (비동기)...")
                # UI 반응성을 위해 wait_for_completion=False로 변경
                widget.cleanup(wait_for_completion=False)  # 워커 종료 신호만 전송, 대기 안 함
                print(f"  ✓ 위젯 cleanup 신호 전송 완료 (비동기)")
            except Exception as e:
                print(f"  ⚠️ 위젯 cleanup 오류: {e}")
                import traceback
                traceback.print_exc()
        
        # UI 반응성을 위해 워커 종료 대기 없이 즉시 위젯 제거
        # 워커는 백그라운드에서 자동으로 종료됨
        
        # 모든 열에서 위젯 찾아서 제거
        for col_widget in self.column_widgets:
            col_layout = col_widget.layout()
            for i in range(col_layout.count()):
                child = col_layout.itemAt(i)
                if child and child.widget() == widget:
                    col_layout.removeWidget(widget)
                    # 캐시 무효화
                    self._invalidate_widget_cache(widget)
                    widget.deleteLater()
                    # 높이 재계산
                    self._recalculate_heights()
                    break
        
        # stored_widgets에서 제거
        if widget in self.stored_widgets:
            self.stored_widgets.remove(widget)
    
    def _recalculate_heights(self):
        """열 높이 재계산 (최적화: 캐시 사용)"""
        self.column_heights = []
        for col_widget in self.column_widgets:
            col_layout = col_widget.layout()
            total_height = 0
            for i in range(col_layout.count()):
                child = col_layout.itemAt(i)
                if child and child.widget():
                    widget = child.widget()
                    # 캐시를 사용하여 높이 가져오기
                    widget_height = self._get_widget_height(widget)
                    total_height += widget_height + col_layout.spacing()
            self.column_heights.append(total_height)
    
    def clear(self):
        """모든 위젯 제거 (UI 반응성을 위해 비동기 처리, 최적화)"""
        # 이미 비어있으면 스킵 (불필요한 clear 호출 방지)
        if len(self.stored_widgets) == 0:
            return
        
        widget_count = len(self.stored_widgets)
        print(f"🧹 [Masonry clear 시작] 위젯 개수: {widget_count}")
        
        # UI 반응성을 위해 cleanup을 비동기로 처리 (대기 없이)
        # 배치로 처리하여 processEvents 호출 최소화
        cleanup_batch_size = 10
        for batch_start in range(0, len(self.stored_widgets), cleanup_batch_size):
            batch = self.stored_widgets[batch_start:batch_start + cleanup_batch_size]
            for idx, widget in enumerate(batch, start=batch_start + 1):
                if hasattr(widget, 'cleanup'):
                    try:
                        widget.cleanup(wait_for_completion=False)  # 워커 종료 신호만 전송, 대기 안 함
                    except Exception as e:
                        print(f"  ⚠️ [{idx}/{widget_count}] 위젯 cleanup 오류: {e}")
            
            # 배치마다 한 번만 UI 업데이트
            if batch_start + cleanup_batch_size < len(self.stored_widgets):
                from PyQt6.QtWidgets import QApplication
                QApplication.processEvents()
        
        # UI 반응성을 위해 워커 종료 대기 없이 즉시 위젯 제거
        # 워커는 백그라운드에서 자동으로 종료됨
        print(f"  → 위젯 제거 시작 (비동기)...")
        from PyQt6.QtWidgets import QApplication
        
        # 모든 열에서 위젯 제거 (배치 처리)
        for col_widget in self.column_widgets:
            col_layout = col_widget.layout()
            while col_layout.count():
                child = col_layout.takeAt(0)
                if child.widget():
                    child.widget().deleteLater()
        
        # 한 번만 UI 업데이트
        QApplication.processEvents()
        
        self.column_heights = [0] * len(self.column_widgets)
        self.stored_widgets = []
        # 캐시도 초기화
        self._widget_height_cache.clear()
        print(f"✅ [Masonry clear 완료] 위젯 제거 완료 (비동기)")
    
    def set_columns(self, columns):
        """열 수 변경 (수동 설정)"""
        if columns == self.columns:
            return
        
        # 기존 위젯들 저장
        widgets = []
        for col_widget in self.column_widgets:
            col_layout = col_widget.layout()
            while col_layout.count():
                child = col_layout.takeAt(0)
                if child.widget():
                    widgets.append(child.widget())
        
        # 새 열 수로 재구성
        self._create_columns(columns)
        
        # 위젯들 다시 추가 (배치로 처리하여 성능 향상)
        if widgets:
            self.add_widgets_batch(widgets)

