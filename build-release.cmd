@echo off
chcp 65001 >nul
setlocal EnableExtensions
title TDLVV 发布打包脚本

rem ============================================================
rem  用法：确认脚本内容无误后双击运行；运行开始还会再暂停一次。
rem  升级版本时只需改下面 VER 两处：本行 + pc\package.json 的 version。
rem ============================================================
set "ROOT=D:\wb\2026-11-27-09-27-53\TDLVV-src"
set "VER=0.6.13"
set "DL=C:\Users\SU\Downloads"
set "NODE=%ROOT%\pc\node_modules"

echo ============================================================
echo  TDLVV 发布打包脚本   版本 %VER%
echo ============================================================
echo.
echo 将依次执行：
echo   [1] 同步源码  pc\src  -^>  mac\src
echo   [2] 打包 Windows 安装包（electron-builder / NSIS）
echo   [3] 复制 exe 到 %DL%
echo   [4] 生成 macOS 版 app.asar（内含版本号 %VER%）
echo   [5] 基于已有完整包替换 asar，生成 mac universal zip
echo   [6] 复制 zip 到 %DL%
echo.
echo 提示：步骤 [5] 依赖 %DL%\TDLVV-mac-universal.zip（完整旧包）。
echo.
pause

rem ---------- [1] 同步源码 ----------
echo.
echo [1/6] 同步源码 pc\src -^> mac\src ...
robocopy "%ROOT%\pc\src" "%ROOT%\mac\src" /MIR /NFL /NDL /NJH /NJS /NP
if %ERRORLEVEL% GEQ 8 (
  echo 源码同步失败
  exit /b 1
)

rem ---------- [2] Windows 打包 ----------
echo.
echo [2/6] 打包 Windows 安装包 ...
cd /d "%ROOT%\pc"
call npm run dist:win
if errorlevel 1 (
  echo Windows 打包失败
  exit /b 1
)

rem ---------- [3] 复制 exe ----------
echo.
echo [3/6] 复制 exe 到下载目录 ...
copy /Y "%ROOT%\pc\dist\TDLVV-Setup-v%VER%.exe" "%DL%\TDLVV-Setup-v%VER%.exe"
if errorlevel 1 (
  echo 复制 exe 失败
  exit /b 1
)

rem ---------- [4] 生成 mac app.asar ----------
echo.
echo [4/6] 生成 macOS app.asar ...
set "TMPASAR=%TEMP%\tdlvv-asar-%RANDOM%"
mkdir "%TMPASAR%"
xcopy /E /I /Y /Q "%ROOT%\mac\src" "%TMPASAR%\src" >nul
>  "%TMPASAR%\package.json" echo {
>> "%TMPASAR%\package.json" echo   "name": "tdlvv",
>> "%TMPASAR%\package.json" echo   "productName": "TDLVV",
>> "%TMPASAR%\package.json" echo   "version": "%VER%",
>> "%TMPASAR%\package.json" echo   "description": "TDLVV task notes",
>> "%TMPASAR%\package.json" echo   "main": "src/main.js",
>> "%TMPASAR%\package.json" echo   "author": "TDLVV",
>> "%TMPASAR%\package.json" echo   "license": "MIT"
>> "%TMPASAR%\package.json" echo }
node -e "const asar=require(process.argv[1]);asar.createPackage(process.argv[2],process.argv[3]).then(()=>console.log('asar ok')).catch(e=>{console.error(e);process.exit(1)})" "%NODE%\@electron\asar" "%TMPASAR%" "%ROOT%\build-output\app.asar"
if errorlevel 1 (
  echo 生成 asar 失败
  exit /b 1
)
rmdir /S /Q "%TMPASAR%"

rem ---------- [5] 生成 mac zip ----------
echo.
echo [5/6] 生成 macOS universal zip ...
cd /d "%ROOT%"
python build-output\build_mac_from_existing.py
if errorlevel 1 (
  echo 生成 mac zip 失败
  exit /b 1
)

rem ---------- [6] 复制 zip ----------
echo.
echo [6/6] 复制 zip 到下载目录 ...
copy /Y "%ROOT%\build-output\TDLVV-mac-universal.zip" "%DL%\TDLVV-mac-universal.zip"
if errorlevel 1 (
  echo 复制 zip 失败
  exit /b 1
)

echo.
echo ============ 全部完成 ============
echo exe: %DL%\TDLVV-Setup-v%VER%.exe
echo zip: %DL%\TDLVV-mac-universal.zip
endlocal
pause
