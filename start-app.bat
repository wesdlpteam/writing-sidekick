@echo off
rem Starts Writing Sidekick on this computer (practice mode, no AI key needed)
start "Writing Sidekick server" cmd /k node "%~dp0dev-server.mjs" --mock
timeout /t 2 >nul
start "" http://localhost:4173
