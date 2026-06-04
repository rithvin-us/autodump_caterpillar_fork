$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$hooksPath = Join-Path $repoRoot 'config/git-hooks'
$syncCommitScript = Join-Path $repoRoot 'config/sync-commit.ps1'

git -C $repoRoot config core.hooksPath $hooksPath
git -C $repoRoot config alias.ccommit "!powershell -ExecutionPolicy Bypass -File `"$syncCommitScript`""
Write-Host "Configured core.hooksPath -> $hooksPath"
Write-Host "Configured git alias -> ccommit"
