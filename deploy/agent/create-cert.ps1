$ErrorActionPreference = "Stop"

# Remove old Sclera cert if exists
Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Where-Object { $_.Subject -like "*Sclera Technologies*" } | Remove-Item -Force -ErrorAction SilentlyContinue

# Create code signing certificate - USA location
$cert = New-SelfSignedCertificate `
  -Subject "CN=Sclera Technologies, O=Sclera Technologies, L=New York, S=New York, C=US" `
  -Type CodeSigningCert `
  -CertStoreLocation Cert:\CurrentUser\My `
  -NotAfter (Get-Date).AddYears(5) `
  -KeyUsage DigitalSignature `
  -FriendlyName "Sclera Technologies Code Signing"

Write-Host "Certificate created: $($cert.Thumbprint)"
Write-Host "Subject: $($cert.Subject)"

# Export to PFX
$pwd = ConvertTo-SecureString -String "Optima2024!" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath "$PSScriptRoot\sclera-codesign.pfx" -Password $pwd | Out-Null
Write-Host "PFX exported: sclera-codesign.pfx"

# Add to Trusted Root
$store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root", "CurrentUser")
$store.Open("ReadWrite")
$store.Add($cert)
$store.Close()
Write-Host "Added to Trusted Root store"
