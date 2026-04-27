$f = "C:\Users\Admin\Downloads\SAM_HAM\optima\deploy\agent\dist\optima-agent-setup.exe"
Write-Host "=== Version Info ==="
(Get-Item $f).VersionInfo | Select-Object CompanyName, FileDescription, ProductName | Format-List
Write-Host "=== Code Signature ==="
Get-AuthenticodeSignature $f | Select-Object Status, @{N='Publisher';E={$_.SignerCertificate.Subject}} | Format-List
Write-Host "=== File Size ==="
$size = [math]::Round((Get-Item $f).Length / 1MB, 1)
Write-Host "$size MB"
