param(
    [string]$Version
)

$ErrorActionPreference = "Stop"

function Require-Command {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Required command not found: $Name"
    }
}

function Invoke-Checked {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FilePath,

        [Parameter(Mandatory = $true)]
        [string[]]$Arguments
    )

    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "Command failed: $FilePath $($Arguments -join ' ')"
    }
}

$RepoRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $RepoRoot

Require-Command git
Require-Command docker

$PackageJsonPath = Join-Path $RepoRoot "server\package.json"
$VersionJsonPath = Join-Path $RepoRoot "server\version.json"

if (-not (Test-Path $PackageJsonPath)) {
    throw "Cannot find package file: $PackageJsonPath"
}

$PackageJson = Get-Content $PackageJsonPath -Raw | ConvertFrom-Json

if ([string]::IsNullOrWhiteSpace($Version)) {
    $Version = $PackageJson.version
}

if ([string]::IsNullOrWhiteSpace($Version)) {
    throw "Cannot read version from server/package.json"
}

$VersionNum = $Version -replace '^v', ''
$VersionTag = "v$VersionNum"

Write-Host "============================================"
Write-Host "Release $VersionTag"
Write-Host "============================================"
Write-Host ""

Write-Host "Update server/package.json -> $VersionNum"
$PackageJson.version = $VersionNum
$PackageJson |
    ConvertTo-Json -Depth 20 |
    Set-Content -Path $PackageJsonPath -Encoding UTF8

Write-Host "Update server/version.json -> $VersionNum"
$VersionInfo = [ordered]@{
    currentVersion = $VersionNum
    latestVersion  = $VersionNum
    releaseUrl     = ""
    releaseNotes   = ""
    publishedAt    = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
}

$VersionInfo |
    ConvertTo-Json -Depth 10 |
    Set-Content -Path $VersionJsonPath -Encoding UTF8

Write-Host ""
Write-Host "git add . && git commit && git tag && git push"
Invoke-Checked git @("add", ".")

& git diff --cached --quiet
if ($LASTEXITCODE -eq 0) {
    Write-Host "No changes to commit"
}
elseif ($LASTEXITCODE -eq 1) {
    Invoke-Checked git @("commit", "-m", "release: $VersionTag")
}
else {
    throw "Command failed: git diff --cached --quiet"
}

Invoke-Checked git @("tag", "-f", $VersionTag)
Invoke-Checked git @("push", "origin", "main")
Invoke-Checked git @("push", "origin", "-f", $VersionTag)

Write-Host ""
Write-Host "docker buildx build & push"
Invoke-Checked docker @(
    "buildx",
    "build",
    "--platform",
    "linux/amd64",
    "-t",
    "sunqz/email-notify:$VersionTag",
    "-t",
    "sunqz/email-notify:latest",
    "-f",
    "Dockerfile",
    "--push",
    "."
)

Write-Host ""
Write-Host "============================================"
Write-Host "Release complete: $VersionTag"
Write-Host "   Docker: sunqz/email-notify:$VersionTag"
Write-Host "   Docker: sunqz/email-notify:latest"
Write-Host "   Git:    $VersionTag"
Write-Host "============================================"
