param(
  [Parameter(Mandatory = $true)][string]$BaseUrl,
  [Parameter(Mandatory = $true)][string]$FunctionName,
  [Parameter(Mandatory = $true)][string]$ProjectRef,
  [Parameter(Mandatory = $true)][string]$TokenPath,
  [Parameter(Mandatory = $true)][string]$CredentialPath,
  [Parameter(Mandatory = $true)][string]$MetadataPath
)
$ErrorActionPreference = 'Stop'
$credential = Import-Clixml -LiteralPath $CredentialPath
$metadata = Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json
$env:ACHANG_E2E_BASE_URL = $BaseUrl
$env:ACHANG_E2E_ADMIN_PHONE = [string]$metadata.adminPhone
$env:ACHANG_E2E_ADMIN_PIN = $credential.GetNetworkCredential().Password
$env:ACHANG_E2E_METADATA_PATH = $MetadataPath
$env:ACHANG_E2E_FIXTURE_FUNCTION = $FunctionName
$env:ACHANG_E2E_PROJECT_REF = $ProjectRef
$env:ACHANG_E2E_TOKEN_PATH = $TokenPath
try { node .\test\live-e2e.browser.cjs }
finally {
  Remove-Item Env:ACHANG_E2E_ADMIN_PIN -ErrorAction SilentlyContinue
  Remove-Item Env:ACHANG_E2E_ADMIN_PHONE -ErrorAction SilentlyContinue
}
