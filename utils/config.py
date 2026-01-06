"""설정 관련 모듈"""
import os
from dataclasses import dataclass
from dotenv import load_dotenv


@dataclass
class Config:
    access_key: str | None
    secret_key: str | None
    paper: bool
    market: str
    order_krw: int


def load_config() -> Config:
    """설정 로드"""
    load_dotenv()
    load_dotenv("env.local", override=False)
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    try:
        load_dotenv(os.path.join(base_dir, ".env"), override=False)
        load_dotenv(os.path.join(base_dir, "env.local"), override=False)
    except Exception:
        pass
    
    access_key = os.getenv("UPBIT_ACCESS_KEY")
    secret_key = os.getenv("UPBIT_SECRET_KEY")
    
    print(f"환경 변수 로드 확인:")
    print(f"  - UPBIT_ACCESS_KEY: {'설정됨' if access_key else '없음'} ({access_key[:10] + '...' if access_key and len(access_key) > 10 else 'None'})")
    print(f"  - UPBIT_SECRET_KEY: {'설정됨' if secret_key and secret_key != '여기에_SECRET_KEY_입력' else '없음 또는 기본값'}")
    
    return Config(
        access_key=access_key,
        secret_key=secret_key,
        paper=os.getenv("PAPER", "false").lower() == "true",
        market=os.getenv("MARKET", "KRW-BTC"),
        order_krw=int(os.getenv("ORDER_KRW", "5000")),
    )

