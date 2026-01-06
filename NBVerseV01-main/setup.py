"""
NBverse 라이브러리 설치 스크립트
"""

from setuptools import setup, find_packages
from pathlib import Path

# README 파일 읽기
this_directory = Path(__file__).parent
long_description = (this_directory / "README.md").read_text(encoding='utf-8')

setup(
    name="nbverse",
    version="0.2.1",
    author="yoohyunseog",
    author_email="yoohyunseog@users.noreply.github.com",
    description="문자열을 N/B 값으로 변환하는 Python 라이브러리",
    long_description=long_description,
    long_description_content_type="text/markdown",
    url="https://github.com/yoohyunseog/NBVerseV01",
    packages=['NBverse'],
    py_modules=[],
    classifiers=[
        "Development Status :: 4 - Beta",
        "Intended Audience :: Developers",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "License :: OSI Approved :: MIT License",
        "Programming Language :: Python :: 3",
        "Programming Language :: Python :: 3.8",
        "Programming Language :: Python :: 3.9",
        "Programming Language :: Python :: 3.10",
        "Programming Language :: Python :: 3.11",
        "Programming Language :: Python :: 3.12",
    ],
    python_requires=">=3.8",
    install_requires=[
        # 현재는 외부 의존성이 없지만, 향후 추가 가능
    ],
    extras_require={
        "dev": [
            "pytest>=7.0.0",
            "black>=23.0.0",
            "flake8>=6.0.0",
        ],
    },
    include_package_data=True,
    zip_safe=False,
)

