@echo off
setlocal
cd /d "%~dp0"
set PYTHONPATH=backend
python run.py
pause
