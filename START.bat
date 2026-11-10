@echo off
cd /d "%~dp0"
echo Downloading latest prices...
python build.py
if errorlevel 1 echo Download failed. Showing the prices already saved in site\data.js.
start "" "site\index.html"
