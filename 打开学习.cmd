@echo off
chcp 65001 >nul
cd /d "%~dp0"

REM 关掉旧的本机学习服务，避免旧进程不支持视频 Range
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /R /C:":8765 .*LISTENING"') do (
  taskkill /F /PID %%p >nul 2>&1
)

echo.
echo 正在启动家庭学习网页...
echo 浏览器打开后：进任意课 -^> 点「播放本课视频」
echo 请保持本窗口不关；Ctrl+C 结束。
echo.

start "" http://127.0.0.1:8765/
python serve-web.py
if errorlevel 1 (
  echo.
  echo 启动失败。若提示端口占用，请关掉其他黑色命令窗口后再试。
  pause
)
