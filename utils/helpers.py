"""헬퍼 함수 모듈"""
from datetime import datetime
import pyupbit


def get_btc_price() -> float:
    """BTC 현재 가격 조회"""
    try:
        price = pyupbit.get_current_price("KRW-BTC")
        return float(price) if price is not None else 0.0
    except Exception as e:
        print(f"BTC 가격 조회 오류: {e}")
        return 0.0


def safe_float(value, default=0.0) -> float:
    """None이나 문자열이 들어와도 안전하게 float로 변환"""
    if value is None or value == "":
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def parse_iso_datetime(value: str | None):
    """ISO 포맷 문자열을 datetime으로 변환하거나 None 반환"""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except Exception:
        return None


def get_all_balances(upbit: pyupbit.Upbit | None) -> dict:
    """모든 자산 조회"""
    if upbit is None:
        return {}
    
    balances = {}
    try:
        try:
            krw_balance = float(upbit.get_balance("KRW") or 0.0)
            balances["KRW"] = krw_balance
            print(f"KRW 잔고: {krw_balance:,.0f} KRW")
        except Exception as e:
            print(f"KRW 잔고 조회 오류: {e}")
            balances["KRW"] = 0.0
        
        try:
            balances_info = upbit.get_balances()
            if balances_info:
                for balance in balances_info:
                    currency = balance.get("currency", "")
                    balance_amount = float(balance.get("balance", 0) or 0)
                    locked = float(balance.get("locked", 0) or 0)
                    total = balance_amount + locked
                    if total > 0:
                        balances[currency] = {
                            "available": balance_amount,
                            "locked": locked,
                            "total": total
                        }
        except Exception as e:
            print(f"코인 잔고 조회 오류: {e}")
    except Exception as e:
        print(f"자산 조회 오류: {e}")
    
    return balances

