"""
8BIT Trading Bot GUI - PyQt6 버전 (모듈화)
메인 실행 파일
"""
import os
import sys
import time
import threading
from datetime import datetime

# 모듈화된 코드 import
from utils import Config, load_config, safe_float, parse_iso_datetime, get_btc_price, get_all_balances
from utils.gpu_setup import GPU_AVAILABLE, USE_GPU, CUDF_AVAILABLE, np_gpu
from managers import SettingsManager, ItemManager, ProductionCardManager
from ui.masonry_layout import MasonryLayout
from nbverse_helper import (
    NBVERSE_AVAILABLE, NBverseStorage, TextToNBConverter,
    calculate_nb_value_from_chart, init_nbverse_storage
)

# PyQt6 imports
from PyQt6.QtWidgets import (
    QApplication, QMainWindow, QWidget, QVBoxLayout, QHBoxLayout, QGridLayout,
    QLabel, QPushButton, QLineEdit, QTabWidget, QScrollArea, QFrame,
    QMessageBox, QInputDialog, QSizePolicy, QProgressBar, QStackedWidget
)
from PyQt6.QtCore import Qt, QTimer, QSize, pyqtSignal, QObject
from PyQt6.QtGui import QFont, QColor, QPalette

# ML 라이브러리
try:
    import joblib
    ML_AVAILABLE = True
except ImportError:
    ML_AVAILABLE = False
    print("⚠️ joblib이 설치되지 않았습니다. ML 기능을 사용할 수 없습니다.")

# Upbit API
import pyupbit
import pandas as pd
import numpy as np

# UI 컴포넌트는 원본 파일에서 import (파일이 크므로 별도로 분리하지 않음)
# ItemCard, ProductionCard, SettingsPage는 원본 파일에 남겨둠
# 필요시 별도 파일로 분리 가능

# 원본 파일의 UI 컴포넌트 import
# from ui.item_card import ItemCard
# from ui.production_card import ProductionCard  
# from ui.settings_page import SettingsPage

# 임시로 원본 파일에서 직접 import (리팩토링 완료 후 분리)
# 이 부분은 trading_gui_app_v0.12.0_pyqt6.py에서 ItemCard, ProductionCard, SettingsPage를 import

print("✅ 모듈화된 코드 로드 완료")
print("⚠️ UI 컴포넌트(ItemCard, ProductionCard, SettingsPage)는 원본 파일에서 import 필요")

