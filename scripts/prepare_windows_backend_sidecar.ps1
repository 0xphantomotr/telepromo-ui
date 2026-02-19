param(
  [string]$BackendRoot = ""
)

$ErrorActionPreference = "Stop"

$UiRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if ([string]::IsNullOrWhiteSpace($BackendRoot)) {
  $BackendRoot = (Resolve-Path (Join-Path $UiRoot "..\\telegramGatherTool")).Path
}

$BackendBuilder = Join-Path $BackendRoot "scripts\\build_windows_sidecar.ps1"
$SidecarOutDir = Join-Path $UiRoot "src-tauri\\resources\\backend"

if (-not (Test-Path $BackendBuilder)) {
  throw "Missing backend sidecar builder: $BackendBuilder"
}

New-Item -ItemType Directory -Force -Path $SidecarOutDir | Out-Null
& $BackendBuilder -OutDir $SidecarOutDir

Write-Host "Prepared Windows sidecar resources in $SidecarOutDir"
