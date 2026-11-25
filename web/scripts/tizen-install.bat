@echo off
rem Signs the built Tizen app with the Samsung certificate profile "skmate" and installs it on the TV.
rem Run after `npm run build && npm run package` (web\release\SkMate-IPTV-tizen-v*.wgt must exist).
rem Needs: Tizen Studio in C:\tizen-studio, the "skmate" profile from Certificate Manager, Java 8 in .tools\jre8,
rem and the TV in Developer Mode with this computer's IP. Change TV below if the TV's address changes.
chcp 65001 >nul
setlocal

set "TV=192.168.0.100"
set "WEB=%~dp0.."
set "JAVA_HOME=%~dp0..\..\.tools\jre8"
set "PATH=%JAVA_HOME%\bin;%PATH%"
set "TIZEN=C:\tizen-studio\tools\ide\bin\tizen.bat"
set "SDB=C:\tizen-studio\tools\sdb.exe"
set "WORK=%WEB%\release\tizen"
set "OUT=%WEB%\release\signed"

if not exist "%TIZEN%" (
  echo [!] Не найдена программа tizen: %TIZEN%
  echo     В Package Manager на вкладке Main SDK поставьте "Tizen SDK tools" и запустите снова.
  pause & exit /b 1
)
if not exist "%JAVA_HOME%\bin\java.exe" (
  echo [!] Не найдена Java 8: %JAVA_HOME%
  pause & exit /b 1
)

echo === 1/4 Распаковываю собранное приложение
if exist "%WORK%" rmdir /s /q "%WORK%"
if exist "%OUT%" rmdir /s /q "%OUT%"
mkdir "%WORK%" "%OUT%"
for %%f in ("%WEB%\release\SkMate-IPTV-tizen-v*.wgt") do copy /y "%%f" "%WORK%\app.zip" >nul
if not exist "%WORK%\app.zip" (
  echo [!] Нет файла release\SkMate-IPTV-tizen-v*.wgt. Сначала: npm run build ^&^& npm run package
  pause & exit /b 1
)
powershell -NoProfile -Command "Expand-Archive -Force -Path '%WORK%\app.zip' -DestinationPath '%WORK%'" || (pause & exit /b 1)
del "%WORK%\app.zip"

echo === 2/4 Подписываю сертификатом skmate
call "%TIZEN%" package -t wgt -s skmate -o "%OUT%" -- "%WORK%" || (echo [!] Подпись не удалась & pause & exit /b 1)
set "WGT="
for %%f in ("%OUT%\*.wgt") do set "WGT=%%~nxf"
if not defined WGT (echo [!] Подписанный файл не появился & pause & exit /b 1)
echo     Готово: %WGT%

echo === 3/4 Подключаюсь к телевизору %TV%
"%SDB%" connect %TV%
"%SDB%" devices

echo === 4/4 Ставлю и запускаю на телевизоре
call "%TIZEN%" install -n "%WGT%" -s %TV%:26101 -- "%OUT%" || (echo [!] Установка не удалась & pause & exit /b 1)
call "%TIZEN%" run -p SkMateIPTV.SkMate -s %TV%:26101

echo.
echo Готово. Приложение SkMate IPTV должно открыться на телевизоре.
pause
