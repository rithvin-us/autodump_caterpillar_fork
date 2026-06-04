param(
  [Parameter(Mandatory = $true, Position = 0)]
  [string]$Message,

  [Parameter(Position = 1)]
  [string]$TestCommand
)

$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$docsDir = Join-Path $repoRoot 'docs'
$changeLogPath = Join-Path $docsDir 'CHANGELOG.md'
$testingPath = Join-Path $docsDir 'TESTING.md'

function Add-ChangelogEntry {
  param(
    [string]$Path,
    [string]$Summary,
    [string[]]$Files
  )

  $date = Get-Date -Format 'yyyy-MM-dd'
  $fileList = if ($Files.Count -gt 0) { $Files | ForEach-Object { "- $_" } } else { @('- no file paths captured') }
  $entry = @(
    "## $date",
    '',
    '### Commit sync',
    "- Commit message: $Summary",
    '- Files included:'
  ) + $fileList + @('')

  Add-Content -LiteralPath $Path -Value ($entry -join [Environment]::NewLine)
}

function Add-TestingEntry {
  param(
    [string]$Path,
    [string]$Summary,
    [string]$CommandText,
    [int]$ExitCode,
    [string]$OutputText
  )

  $date = Get-Date -Format 'yyyy-MM-dd'
  $status = if ($ExitCode -eq 0) { 'PASS' } else { 'FIXED' }
  $entry = @(
    "## $date",
    '',
    '### Commit sync validation',
    "- Command: $CommandText",
    "- Expected: docs stay in sync before the commit is created",
    "- Result: $Summary",
    "- Status: $status"
  )

  if ($ExitCode -ne 0) {
    $entry += @("- Error: validation command exited with code $ExitCode")
  }

  if ($OutputText) {
    $entry += @("- Output: $OutputText")
  }

  $entry += ''
  Add-Content -LiteralPath $Path -Value ($entry -join [Environment]::NewLine)
}

$staged = @(git -C $repoRoot diff --cached --name-only)
if (-not $staged -or $staged.Count -eq 0) {
  git -C $repoRoot add -A
  $staged = @(git -C $repoRoot diff --cached --name-only)
}

$trackedChanges = @($staged | Where-Object { $_ -notmatch '^(docs/CHANGELOG\.md|docs/TESTING\.md)$' })
$testSummary = 'no separate validation command was provided'
$testExit = 0
$testOutput = ''

if ($TestCommand) {
  $invokeResult = & powershell -NoProfile -ExecutionPolicy Bypass -Command $TestCommand 2>&1
  $testExit = $LASTEXITCODE
  $testOutput = ($invokeResult | Out-String).Trim()
  if ($testExit -eq 0) {
    $testSummary = 'validation command completed successfully'
  } else {
    $testSummary = 'validation command failed'
  }
}

Add-ChangelogEntry -Path $changeLogPath -Summary $Message -Files $trackedChanges
if ($TestCommand) {
  $commandText = $TestCommand
} else {
  $commandText = 'not provided'
}
Add-TestingEntry -Path $testingPath -Summary $testSummary -CommandText $commandText -ExitCode $testExit -OutputText $testOutput

git -C $repoRoot add docs/CHANGELOG.md docs/TESTING.md

git -C $repoRoot commit -m $Message
