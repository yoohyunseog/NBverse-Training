"""워커 관리자 (QThreadPool 기반 최적화)"""
from PyQt6.QtCore import QObject, QThreadPool, QRunnable, pyqtSignal
from typing import Dict, Optional
import threading


class WorkerManager(QObject):
    """워커 통합 관리자 (QThreadPool 사용으로 성능 개선)"""
    
    def __init__(self, parent):
        super().__init__(parent)
        self.parent = parent
        
        # QThreadPool 사용 (QThread보다 효율적)
        self.thread_pool = QThreadPool.globalInstance()
        self.thread_pool.setMaxThreadCount(10)  # 최대 10개 스레드
        
        # 워커 추적
        self._active_workers: Dict[str, QRunnable] = {}
        self._lock = threading.Lock()
    
    def start_worker(self, worker_id: str, worker: QRunnable):
        """워커 시작 (QThreadPool 사용)"""
        with self._lock:
            if worker_id in self._active_workers:
                # 이미 실행 중이면 스킵
                return False
            
            self._active_workers[worker_id] = worker
            self.thread_pool.start(worker)
            return True
    
    def stop_worker(self, worker_id: str):
        """워커 중지"""
        with self._lock:
            if worker_id in self._active_workers:
                worker = self._active_workers.pop(worker_id)
                if hasattr(worker, 'stop'):
                    worker.stop()
                return True
            return False
    
    def is_worker_running(self, worker_id: str) -> bool:
        """워커 실행 중인지 확인"""
        with self._lock:
            return worker_id in self._active_workers
    
    def cleanup_all_workers(self):
        """모든 워커 정리"""
        with self._lock:
            for worker_id, worker in list(self._active_workers.items()):
                if hasattr(worker, 'stop'):
                    worker.stop()
            self._active_workers.clear()
        
        # 모든 작업 완료 대기
        self.thread_pool.waitForDone(3000)  # 최대 3초 대기


class BaseWorker(QRunnable):
    """기본 워커 클래스 (QThreadPool용)"""
    
    def __init__(self):
        super().__init__()
        self._stop_event = threading.Event()
    
    def stop(self):
        """워커 중지 요청"""
        self._stop_event.set()
    
    def is_stopped(self) -> bool:
        """중지 요청되었는지 확인"""
        return self._stop_event.is_set()
    
    def run(self):
        """워커 실행 (서브클래스에서 구현)"""
        raise NotImplementedError

