@echo off
title RU-KO Translator — запуск...

:: Backend
start "RU-KO Backend" /min cmd /k "cd /d C:\Projects\translator\backend && npm start"

:: Небольшая пауза, чтобы бэкенд успел стартовать
timeout /t 3 /nobreak >nul

:: Frontend Metro bundler
start "RU-KO Metro" /min cmd /k "cd /d C:\Projects\translator\frontend && npx expo start --port 8082"
