@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo 家庭学习网页（点开视频即可看，不用选文件夹）
echo 浏览器打开: http://127.0.0.1:8765/
echo 请保持本窗口不关；Ctrl+C 结束。
echo.
python serve-web.py
pause
