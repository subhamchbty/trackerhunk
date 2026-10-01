# Create a self-signed code-signing certificate for LOCAL TESTING of the
# signing pipeline, export it as a PFX, and print the variables to set.
#
#   powershell -ExecutionPolicy Bypass -File scripts\dev-cert.ps1
#
# A self-signed certificate is NOT trusted by Windows: SmartScreen still warns
# and Smart App Control still blocks. Use it only to verify that `npm run dist`
# signs correctly; ship with a certificate from a public CA (see README).

param(
  [string]$Subject = "CN=TrackerHunk Dev",
  [string]$OutDir = (Join-Path $PSScriptRoot "..\certs"),
  [string]$Password = "trackerhunk-dev"
)

$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$pfx = Join-Path (Resolve-Path $OutDir) "dev-codesign.pfx"

$cert = New-SelfSignedCertificate `
  -Type CodeSigningCert `
  -Subject $Subject `
  -KeyAlgorithm RSA -KeyLength 2048 `
  -HashAlgorithm SHA256 `
  -CertStoreLocation "Cert:\CurrentUser\My" `
  -NotAfter (Get-Date).AddYears(2)

$secure = ConvertTo-SecureString -String $Password -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath $pfx -Password $secure | Out-Null

Write-Host ""
Write-Host "Created $($cert.Subject) (thumbprint $($cert.Thumbprint))"
Write-Host "Exported to $pfx"
Write-Host ""
Write-Host "To sign a build with it, set these in the shell and run npm run dist:"
Write-Host "  `$env:CSC_LINK = `"$pfx`""
Write-Host "  `$env:CSC_KEY_PASSWORD = `"$Password`""
