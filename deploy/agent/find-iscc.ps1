$paths = @(
  "C:\Program Files (x86)\Inno Setup 6\ISCC.exe",
  "C:\Program Files\Inno Setup 6\ISCC.exe",
  "$env:LocalAppData\Programs\Inno Setup 6\ISCC.exe"
)
foreach ($p in $paths) {
  if (Test-Path $p) { Write-Host $p; exit 0 }
}
# Search user profile
$found = Get-ChildItem "$env:UserProfile" -Filter "ISCC.exe" -Recurse -Depth 4 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($found) { Write-Host $found.FullName; exit 0 }
Write-Host "NOT_FOUND"
