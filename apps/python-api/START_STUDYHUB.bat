@echo off
setlocal
cd /d "%~dp0"
set PYTHONPATH=backend
where py >nul 2>nul
if errorlevel 1 (
	python run.py
) else (
	py -3.12 run.py
)
pause
