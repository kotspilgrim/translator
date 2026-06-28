@echo off
title RU-KO Translator — остановка...

:: Останавливаем Backend и Metro по заголовку окна
taskkill /FI "WINDOWTITLE eq RU-KO Backend*" /T /F >nul 2>&1
taskkill /FI "WINDOWTITLE eq RU-KO Metro*"   /T /F >nul 2>&1

:: Резервный вариант — по портам
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr "LISTENING"') do (
    taskkill /PID %%p /T /F >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":8082 " ^| findstr "LISTENING"') do (
    taskkill /PID %%p /T /F >nul 2>&1
)

echo Серверы остановлены.
timeout /t 2 /nobreak >nul
