# First-time push to GitHub (fixes: author identity, remote URL, no commits)
# Usage:
#   cd c:\Users\Christos\Documents\moving-mate
#   .\deploy\git-first-push.ps1 -GitHubUsername "your-github-username" -Email "you@example.com"
#
# Optional: -Name "Christos"

param(
  [Parameter(Mandatory = $true)]
  [string]$GitHubUsername,

  [Parameter(Mandatory = $true)]
  [string]$Email,

  [string]$Name = 'Christos'
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot\..

Write-Host "==> Checking staged files (server/.env must NOT appear)..." -ForegroundColor Cyan
$status = git status --porcelain
if ($status -match '(^|\s)server/\.env(\s|$)') {
  Write-Error "server/.env is staged — aborting. It must stay secret."
}

Write-Host "==> Commit (one-off author via -c, no git config changes)..." -ForegroundColor Cyan
git -c "user.name=$Name" -c "user.email=$Email" commit -m "Initial commit — Moving Mate app for Render deploy"
if ($LASTEXITCODE -ne 0) {
  Write-Error "Commit failed. Run 'git status' and fix issues above."
}

$remoteUrl = "https://github.com/$GitHubUsername/moving-mate.git"
Write-Host "==> Setting remote origin -> $remoteUrl" -ForegroundColor Cyan
git remote remove origin 2>$null
git remote add origin $remoteUrl

Write-Host "==> Pushing to main (GitHub login / token prompt may appear)..." -ForegroundColor Cyan
git branch -M main
git push -u origin main

Write-Host ""
Write-Host "Done. Open: https://github.com/$GitHubUsername/moving-mate" -ForegroundColor Green
