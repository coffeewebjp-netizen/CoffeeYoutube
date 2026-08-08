param(
  [string]$ElectronVersion = '43.2.0'
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$cacheRoot = Join-Path $projectRoot 'build-cache'
$distRoot = Join-Path $projectRoot 'dist'
$packageRoot = Join-Path $distRoot 'CoffeeYoutubeDL-win32-x64'
$archiveName = "electron-v$ElectronVersion-win32-x64.zip"
$archivePath = Join-Path $cacheRoot $archiveName
$partialPath = $archivePath + '.partial'
$checksumsPath = Join-Path $cacheRoot "SHASUMS256-$ElectronVersion.txt"
$releaseBase = "https://github.com/electron/electron/releases/download/v$ElectronVersion"

New-Item -ItemType Directory -Force -Path $cacheRoot | Out-Null
New-Item -ItemType Directory -Force -Path $distRoot | Out-Null

if (-not (Test-Path -LiteralPath $checksumsPath)) {
  Invoke-WebRequest -Uri "$releaseBase/SHASUMS256.txt" -OutFile $checksumsPath
}

$checksumLine = Get-Content -LiteralPath $checksumsPath |
  Where-Object {
    $parts = $_.Trim() -split '[ ]+'
    $parts.Count -ge 2 -and $parts[-1].TrimStart('*') -eq $archiveName
  } |
  Select-Object -First 1

if (-not $checksumLine) {
  throw "Checksum for $archiveName was not found."
}

$expectedHash = ($checksumLine.Trim() -split '[ ]+')[0].ToUpperInvariant()
$archiveIsValid = $false

if (Test-Path -LiteralPath $archivePath) {
  $cachedHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToUpperInvariant()
  $archiveIsValid = $cachedHash -eq $expectedHash
}

if (-not $archiveIsValid) {
  if (Test-Path -LiteralPath $partialPath) {
    Remove-Item -LiteralPath $partialPath -Force
  }

  Write-Host "Downloading Electron $ElectronVersion..."
  Invoke-WebRequest -Uri "$releaseBase/$archiveName" -OutFile $partialPath

  $downloadedHash = (Get-FileHash -LiteralPath $partialPath -Algorithm SHA256).Hash.ToUpperInvariant()
  if ($downloadedHash -ne $expectedHash) {
    Remove-Item -LiteralPath $partialPath -Force
    throw "Electron archive checksum mismatch. Expected $expectedHash but got $downloadedHash."
  }

  Move-Item -LiteralPath $partialPath -Destination $archivePath -Force
}

$resolvedDist = [System.IO.Path]::GetFullPath($distRoot)
$resolvedPackage = [System.IO.Path]::GetFullPath($packageRoot)
$distPrefix = $resolvedDist.TrimEnd(
  [System.IO.Path]::DirectorySeparatorChar,
  [System.IO.Path]::AltDirectorySeparatorChar
) + [System.IO.Path]::DirectorySeparatorChar

if (-not $resolvedPackage.StartsWith($distPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to replace a package outside dist: $resolvedPackage"
}

if (Test-Path -LiteralPath $packageRoot) {
  Remove-Item -LiteralPath $packageRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $packageRoot | Out-Null
Expand-Archive -LiteralPath $archivePath -DestinationPath $packageRoot

$appTarget = Join-Path $packageRoot 'resources/app'
$toolsTarget = Join-Path $packageRoot 'resources/tools'
New-Item -ItemType Directory -Force -Path $appTarget | Out-Null
New-Item -ItemType Directory -Force -Path $toolsTarget | Out-Null

$applicationItems = @(
  'server.js',
  'package.json',
  'src',
  'public',
  'electron'
)

foreach ($item in $applicationItems) {
  Copy-Item -LiteralPath (Join-Path $projectRoot $item) -Destination $appTarget -Recurse -Force
}

Copy-Item -Path (Join-Path $projectRoot 'tools/*.exe') -Destination $toolsTarget -Force

$electronExe = Join-Path $packageRoot 'electron.exe'
$appExe = Join-Path $packageRoot 'CoffeeYoutubeDL.exe'
if (-not (Test-Path -LiteralPath $electronExe)) {
  throw 'electron.exe was not found in the extracted package.'
}
Move-Item -LiteralPath $electronExe -Destination $appExe

Write-Host ''
Write-Host 'Windows portable app created:'
Write-Host $appExe