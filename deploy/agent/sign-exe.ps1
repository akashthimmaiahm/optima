$ErrorActionPreference = "Stop"

# Load cert from store (already imported during create-cert.ps1)
$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Subject -like "*Sclera Technologies*" } | Select-Object -First 1

if (-not $cert) {
  Write-Host "No Sclera code signing cert found in store. Importing from PFX..."
  $pfxPath = "$PSScriptRoot\sclera-codesign.pfx"
  $pwd = ConvertTo-SecureString -String "Optima2024!" -Force -AsPlainText
  $cert = Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation Cert:\CurrentUser\My -Password $pwd
}

Write-Host "Using cert: $($cert.Subject)"

# Sign the setup installer
$setup = "$PSScriptRoot\dist\optima-agent-setup.exe"
if (Test-Path $setup) {
  Set-AuthenticodeSignature -FilePath $setup -Certificate $cert -TimestampServer "http://timestamp.digicert.com"
  Write-Host "Signed: optima-agent-setup.exe"
}

# Sign the agent binary
$agent = "$PSScriptRoot\dist\optima-agent-win.exe"
if (Test-Path $agent) {
  Set-AuthenticodeSignature -FilePath $agent -Certificate $cert -TimestampServer "http://timestamp.digicert.com"
  Write-Host "Signed: optima-agent-win.exe"
}

Write-Host "`nDone! Publisher: $($cert.Subject)"
