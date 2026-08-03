$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$installers = @(Get-ChildItem -LiteralPath (Join-Path $repositoryRoot "apps\desktop\src-tauri\target\release\bundle\nsis") -Filter "*.exe")
if ($installers.Count -ne 1) { throw "Expected exactly one NSIS installer" }
$installer = $installers[0]

$dataDirectory = Join-Path $env:USERPROFILE ".gielinor-companion"
$database = Join-Path $dataDirectory "gielinor.db"
New-Item -ItemType Directory -Force -Path $dataDirectory | Out-Null
if (-not (Test-Path -LiteralPath $database)) {
  [System.IO.File]::WriteAllBytes($database, [byte[]](0x47, 0x49, 0x45, 0x4c, 0x49, 0x4e, 0x4f, 0x52))
}
$databaseHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $database).Hash

$uninstallRoot = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall"
$existing = Get-ChildItem -LiteralPath $uninstallRoot -ErrorAction SilentlyContinue |
  Get-ItemProperty |
  Where-Object DisplayName -EQ "Gielinor Companion"
if ($null -ne $existing) { throw "A Gielinor Companion installation already exists on this runner" }

Start-Process -FilePath $installer.FullName -ArgumentList "/S" -Wait
$entries = @(Get-ChildItem -LiteralPath $uninstallRoot |
  Get-ItemProperty |
  Where-Object DisplayName -EQ "Gielinor Companion")
if ($entries.Count -ne 1) { throw "NSIS did not register one per-user uninstall entry" }
$entry = $entries[0]
if ($entry.DisplayVersion -ne "1.2.0") { throw "Installed DisplayVersion is not 1.2.0" }

$uninstallMatch = [regex]::Match($entry.UninstallString, '^"?([^"].*?\.exe)"?(?:\s|$)')
if (-not $uninstallMatch.Success) { throw "The uninstall command is malformed" }
$uninstaller = $uninstallMatch.Groups[1].Value
$installDirectory = Split-Path -Parent $uninstaller
$mainExecutable = Get-ChildItem -LiteralPath $installDirectory -Filter "*.exe" |
  Where-Object Name -NotMatch "uninstall" |
  Select-Object -First 1
if ($null -eq $mainExecutable) { throw "The installed desktop executable is missing" }
if (-not (Test-Path -LiteralPath (Join-Path $installDirectory "gielinor-runtime.exe"))) {
  throw "The bundled MCP sidecar is missing"
}
if (-not (Test-Path -LiteralPath (Join-Path $installDirectory "runtime\dist\index.js"))) {
  throw "The bundled MCP runtime is missing"
}

$startMenu = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Gielinor Companion"
if (-not (Get-ChildItem -LiteralPath $startMenu -Filter "*.lnk" -ErrorAction SilentlyContinue)) {
  throw "The Start Menu shortcut is missing"
}
$desktopShortcut = Get-ChildItem -LiteralPath ([Environment]::GetFolderPath("Desktop")) -Filter "*Gielinor Companion*.lnk" -ErrorAction SilentlyContinue
if ($null -eq $desktopShortcut) { throw "The default desktop shortcut is missing" }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $database).Hash -ne $databaseHash) {
  throw "Installation modified the existing local database"
}

Start-Process -FilePath $uninstaller -ArgumentList "/S" -Wait
if (Test-Path -LiteralPath $uninstaller) { throw "The application was not uninstalled" }
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $database).Hash -ne $databaseHash) {
  throw "Ordinary uninstall modified or removed the local database"
}

Write-Output "Clean per-user NSIS install/uninstall preserved local data and included all runtime files."
