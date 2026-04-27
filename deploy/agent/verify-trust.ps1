$certs = Get-ChildItem Cert:\LocalMachine\TrustedPublisher
foreach ($c in $certs) {
  if ($c.Subject -like "*Sclera*") {
    Write-Host "FOUND in Trusted Publishers: $($c.Subject)" -ForegroundColor Green
    Write-Host "Thumbprint: $($c.Thumbprint)"
    exit 0
  }
}
Write-Host "NOT FOUND in Trusted Publishers" -ForegroundColor Red
