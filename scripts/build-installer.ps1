param(
  [string]$ElectronVersion = '43.2.0',
  [switch]$SkipPortableBuild
)

$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $PSScriptRoot
$packageRoot = Join-Path $projectRoot 'dist/CoffeeYoutubeDL-win32-x64'
$installerOutputRoot = Join-Path $projectRoot 'dist/installer'
$buildRoot = Join-Path $projectRoot 'build-cache/installer'
$sourceRoot = Join-Path $PSScriptRoot 'installer'
$packageJsonPath = Join-Path $projectRoot 'package.json'

if (-not $SkipPortableBuild) {
  & (Join-Path $PSScriptRoot 'package-windows.ps1') -ElectronVersion $ElectronVersion
}

$appExecutable = Join-Path $packageRoot 'CoffeeYoutubeDL.exe'
if (-not (Test-Path -LiteralPath $appExecutable)) {
  throw "Portable app is missing: $appExecutable. Run npm run dist first."
}

$packageJson = Get-Content -LiteralPath $packageJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json
$displayVersion = [string]$packageJson.version
if ($displayVersion -notmatch '^\d+\.\d+\.\d+(?:[-+].*)?$') {
  throw "package.json contains an unsupported version: $displayVersion"
}

$numericVersion = ($displayVersion -split '[-+]')[0]
$versionParts = @($numericVersion -split '\.')
while ($versionParts.Count -lt 4) {
  $versionParts += '0'
}
$assemblyVersion = ($versionParts[0..3] -join '.')

$resolvedProject = [System.IO.Path]::GetFullPath($projectRoot)
$resolvedBuild = [System.IO.Path]::GetFullPath($buildRoot)
$projectPrefix = $resolvedProject.TrimEnd(
  [System.IO.Path]::DirectorySeparatorChar,
  [System.IO.Path]::AltDirectorySeparatorChar
) + [System.IO.Path]::DirectorySeparatorChar

if (-not $resolvedBuild.StartsWith($projectPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to replace a build directory outside the project: $resolvedBuild"
}

if (Test-Path -LiteralPath $buildRoot) {
  Remove-Item -LiteralPath $buildRoot -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $buildRoot | Out-Null
New-Item -ItemType Directory -Force -Path $installerOutputRoot | Out-Null

$frameworkCompilers = @(
  (Join-Path $env:WINDIR 'Microsoft.NET/Framework64/v4.0.30319/csc.exe'),
  (Join-Path $env:WINDIR 'Microsoft.NET/Framework/v4.0.30319/csc.exe')
)
$compiler = $frameworkCompilers |
  Where-Object { Test-Path -LiteralPath $_ } |
  Select-Object -First 1

if (-not $compiler) {
  throw '.NET Framework C# compiler was not found. Install or enable .NET Framework 4.x.'
}

$payloadPath = Join-Path $buildRoot 'payload.zip'
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(
  $packageRoot,
  $payloadPath,
  [System.IO.Compression.CompressionLevel]::Optimal,
  $false
)

$payloadHash = (Get-FileHash -LiteralPath $payloadPath -Algorithm SHA256).Hash.ToUpperInvariant()
$uninstallerPath = Join-Path $buildRoot 'Uninstall.exe'
$manifestPath = Join-Path $sourceRoot 'app.manifest'
$uninstallerSource = Join-Path $sourceRoot 'Uninstaller.cs'

$commonCompilerArguments = @(
  '/nologo',
  '/target:winexe',
  '/platform:anycpu',
  '/optimize+',
  "/win32manifest:$manifestPath",
  '/reference:System.dll',
  '/reference:System.Core.dll',
  '/reference:System.Drawing.dll',
  '/reference:System.Windows.Forms.dll'
)

& $compiler @commonCompilerArguments "/out:$uninstallerPath" $uninstallerSource
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $uninstallerPath)) {
  throw 'Failed to compile the uninstaller.'
}

$installerTemplate = Get-Content -LiteralPath (Join-Path $sourceRoot 'Installer.cs') -Raw -Encoding UTF8
$installerSourceText = $installerTemplate
$installerSourceText = $installerSourceText.Replace('__DISPLAY_VERSION__', $displayVersion)
$installerSourceText = $installerSourceText.Replace('__ASSEMBLY_VERSION__', $assemblyVersion)
$installerSourceText = $installerSourceText.Replace('__PAYLOAD_SHA256__', $payloadHash)
$generatedInstallerSource = Join-Path $buildRoot 'Installer.generated.cs'
$installerSourceText | Set-Content -LiteralPath $generatedInstallerSource -Encoding UTF8

$setupName = "CoffeeYoutubeDL-Setup-$displayVersion.exe"
$setupPath = Join-Path $installerOutputRoot $setupName
$installerCompilerArguments = $commonCompilerArguments + @(
  '/reference:System.IO.Compression.dll',
  '/reference:System.IO.Compression.FileSystem.dll',
  "/resource:$payloadPath,CoffeeYoutubeDL.Payload.zip",
  "/resource:$uninstallerPath,CoffeeYoutubeDL.Uninstaller.exe",
  "/out:$setupPath",
  $generatedInstallerSource
)

& $compiler @installerCompilerArguments
if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $setupPath)) {
  throw 'Failed to compile the installer.'
}

$setupHash = (Get-FileHash -LiteralPath $setupPath -Algorithm SHA256).Hash.ToUpperInvariant()
$setupSize = (Get-Item -LiteralPath $setupPath).Length

Write-Host ''
Write-Host 'Windows installer created:'
Write-Host $setupPath
Write-Host "Size: $setupSize bytes"
Write-Host "SHA256: $setupHash"
