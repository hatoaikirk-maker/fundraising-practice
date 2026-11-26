@echo off
chcp 65001 >nul
rem Push this folder to GitHub.
rem First time: create an EMPTY repo on github.com. Put its URL in repo_url.txt (one line), or paste it when asked.
cd /d "%~dp0"
where git >nul 2>nul
if errorlevel 1 (
  echo [X] Git not found. Please install Git for Windows first.
  pause
  exit /b 1
)
if not exist ".git" (
  git init -b main
  if exist "repo_url.txt" (
    set /p REPO=<repo_url.txt
  ) else (
    set /p REPO=Paste GitHub repo URL ^(e.g. https://github.com/you/fundraising-practice.git^): 
  )
  call git remote add origin %%REPO%%
)
git add -A
git -c user.name=KIRK -c user.email=kirk@lifemapx.local commit -m "update %date% %time%"
git push -u origin main
echo.
echo Done.
pause
