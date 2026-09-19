@echo off
setlocal
cd /d "%~dp0"
set PYTHONPATH=backend
python scripts\verify_phase1.py
if errorlevel 1 (
  echo.
  echo StudyHub verification FAILED.
  pause
  exit /b 1
)
echo.
echo StudyHub verification PASSED.
pause
