Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c ""cd /d C:\Projects\translator\backend && node server.js >> C:\Projects\translator\backend\server.log 2>&1""", 0, False
