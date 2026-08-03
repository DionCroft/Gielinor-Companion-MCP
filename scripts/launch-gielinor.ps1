[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$diagnosticDirectory = Join-Path $repositoryRoot "artifacts\launcher"
New-Item -ItemType Directory -Path $diagnosticDirectory -Force | Out-Null
$diagnosticPath = Join-Path $diagnosticDirectory ("launch-{0}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"))
$transcriptStarted = $false

function Invoke-RequiredCommand {
  param(
    [Parameter(Mandatory = $true)][string]$FilePath,
    [Parameter(Mandatory = $true)][string[]]$ArgumentList,
    [Parameter(Mandatory = $true)][string]$FailureMessage
  )

  & $FilePath @ArgumentList
  if ($LASTEXITCODE -ne 0) {
    throw "$FailureMessage (exit code $LASTEXITCODE)."
  }
}

function Start-NativeDesktop {
  param([Parameter(Mandatory = $true)][string]$ExecutablePath)

  Remove-Item Env:VITE_GIELINOR_RUNTIME_MODE -ErrorAction SilentlyContinue
  Remove-Item Env:VITE_GIELINOR_FIXTURE -ErrorAction SilentlyContinue
  Start-Process -FilePath $ExecutablePath -WorkingDirectory (Split-Path $ExecutablePath) -WindowStyle Hidden
}

try {
  Start-Transcript -Path $diagnosticPath -Force | Out-Null
  $transcriptStarted = $true
  Set-Location $repositoryRoot

  $manifest = Get-Content (Join-Path $repositoryRoot "package.json") -Raw | ConvertFrom-Json
  $expectedVersion = [string]$manifest.version
  $nativeExecutable = Join-Path $repositoryRoot "apps\desktop\src-tauri\target\release\gielinor-companion-desktop.exe"

  if (Test-Path -LiteralPath $nativeExecutable -PathType Leaf) {
    $builtVersion = (Get-Item -LiteralPath $nativeExecutable).VersionInfo.ProductVersion
    if ($builtVersion -like "$expectedVersion*") {
      Write-Host "Opening Gielinor Companion $expectedVersion..."
      Start-NativeDesktop -ExecutablePath $nativeExecutable
      exit 0
    }
  }

  $nodeCommand = Get-Command node -ErrorAction SilentlyContinue
  if ($null -eq $nodeCommand) {
    throw "Node.js 22 or 24 is required for the source launcher. Install an LTS release from nodejs.org."
  }
  $nodeVersion = (& $nodeCommand.Source --version).TrimStart("v").Split(".")[0]
  if ($nodeVersion -notin @("22", "24")) {
    throw "Node.js 22 or 24 is required; the detected major version is $nodeVersion."
  }

  $corepackCommand = Get-Command corepack -ErrorAction SilentlyContinue
  if ($null -eq $corepackCommand) {
    throw "Corepack is unavailable. Reinstall Node.js 22/24 with Corepack enabled."
  }
  $rustCommand = Get-Command rustc -ErrorAction SilentlyContinue
  if ($null -eq $rustCommand) {
    throw "Rust is required to build the native desktop from source. Install it from rustup.rs."
  }
  Invoke-RequiredCommand -FilePath $rustCommand.Source -ArgumentList @("--version") -FailureMessage "Rust could not be executed"

  $lockfile = Join-Path $repositoryRoot "pnpm-lock.yaml"
  $lockHash = (Get-FileHash -LiteralPath $lockfile -Algorithm SHA256).Hash
  $statePath = Join-Path $repositoryRoot "node_modules\.gielinor-launcher-state.json"
  $installedHash = $null
  if (Test-Path -LiteralPath $statePath -PathType Leaf) {
    try {
      $installedHash = (Get-Content -LiteralPath $statePath -Raw | ConvertFrom-Json).lockHash
    } catch {
      $installedHash = $null
    }
  }
  if (-not (Test-Path -LiteralPath (Join-Path $repositoryRoot "node_modules\.modules.yaml")) -or $installedHash -ne $lockHash) {
    Write-Host "Installing locked dependencies..."
    Invoke-RequiredCommand -FilePath $corepackCommand.Source -ArgumentList @("pnpm", "install", "--frozen-lockfile") -FailureMessage "Locked dependency installation failed"
    @{ lockHash = $lockHash; packageVersion = $expectedVersion } | ConvertTo-Json | Set-Content -LiteralPath $statePath -Encoding UTF8
  }

  Write-Host "Building the native-real desktop..."
  Invoke-RequiredCommand -FilePath $corepackCommand.Source -ArgumentList @("pnpm", "build") -FailureMessage "Application build failed"
  Invoke-RequiredCommand -FilePath $corepackCommand.Source -ArgumentList @("pnpm", "--filter", "@gielinor/desktop", "prepare:runtime") -FailureMessage "Bundled runtime preparation failed"
  Invoke-RequiredCommand -FilePath $corepackCommand.Source -ArgumentList @("pnpm", "--filter", "@gielinor/desktop", "exec", "tauri", "build", "--no-bundle") -FailureMessage "Native desktop build failed"

  if (-not (Test-Path -LiteralPath $nativeExecutable -PathType Leaf)) {
    throw "The native build finished without producing the expected executable."
  }
  Write-Host "Opening Gielinor Companion $expectedVersion..."
  Start-NativeDesktop -ExecutablePath $nativeExecutable
  exit 0
} catch {
  Write-Error ("Gielinor Companion could not be launched: {0}`nDetailed log: {1}" -f $_.Exception.Message, $diagnosticPath)
  exit 1
} finally {
  if ($transcriptStarted) {
    Stop-Transcript | Out-Null
  }
}
