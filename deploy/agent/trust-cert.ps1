# Run this on any machine where you want SmartScreen to trust Optima Agent.
# Must be run as Administrator. Can be deployed via Group Policy (GPO) across your org.
$ErrorActionPreference = "Stop"

$cert = Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Subject -like "*Sclera Technologies*" } | Select-Object -First 1

if (-not $cert) {
  # Import from PFX if not in user store
  $pfxPath = "$PSScriptRoot\sclera-codesign.pfx"
  if (-not (Test-Path $pfxPath)) {
    Write-Host "ERROR: No Sclera Technologies certificate found. Place sclera-codesign.pfx next to this script." -ForegroundColor Red
    exit 1
  }
  $pwd = ConvertTo-SecureString -String "Optima2024!" -Force -AsPlainText
  $cert = Import-PfxCertificate -FilePath $pfxPath -CertStoreLocation Cert:\CurrentUser\My -Password $pwd
}

Write-Host "Certificate: $($cert.Subject)" -ForegroundColor Cyan

# Add to Trusted Root (Machine level - requires Admin)
$rootStore = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "LocalMachine")
$rootStore.Open("ReadWrite")
$rootStore.Add($cert)
$rootStore.Close()
Write-Host "Added to Trusted Root (LocalMachine)" -ForegroundColor Green

# Add to Trusted Publishers (Machine level - this is what SmartScreen checks)
$pubStore = New-Object System.Security.Cryptography.X509Certificates.X509Store("TrustedPublisher", "LocalMachine")
$pubStore.Open("ReadWrite")
$pubStore.Add($cert)
$pubStore.Close()
Write-Host "Added to Trusted Publishers (LocalMachine)" -ForegroundColor Green

Write-Host "`nDone! SmartScreen should now trust Optima Agent executables on this machine." -ForegroundColor Green
Write-Host "To deploy org-wide, push sclera-codesign.pfx to Trusted Publishers via Group Policy." -ForegroundColor Yellow
