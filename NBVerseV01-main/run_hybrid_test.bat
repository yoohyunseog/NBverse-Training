@echo off
call E:\python_env\Scripts\activate.bat
cd /d %~dp0
python test_hybrid_storage.py
pause

