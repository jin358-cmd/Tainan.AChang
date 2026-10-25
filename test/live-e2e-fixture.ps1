param(
  [Parameter(Mandatory = $true)][ValidateSet('PrepareToken','Setup','Expire','Cleanup')][string]$Mode,
  [Parameter(Mandatory = $true)][string]$FunctionName,
  [Parameter(Mandatory = $true)][string]$ProjectRef,
  [Parameter(Mandatory = $true)][string]$TokenPath,
  [Parameter(Mandatory = $true)][string]$CredentialPath,
  [Parameter(Mandatory = $true)][string]$MetadataPath,
  [string]$MemberId = ''
)
$ErrorActionPreference = 'Stop'

if ($Mode -eq 'PrepareToken') {
  $bytes = [byte[]]::new(32)
  [System.Security.Cryptography.RandomNumberGenerator]::Fill($bytes)
  $token = [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+','-').Replace('/','_')
  [pscredential]::new('fixture-token',(ConvertTo-SecureString $token -AsPlainText -Force)) | Export-Clixml -LiteralPath $TokenPath -Force
  $hash = [Convert]::ToHexString([System.Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($token))).ToLowerInvariant()
  Write-Output $hash
  exit 0
}

$tokenCredential = Import-Clixml -LiteralPath $TokenPath
$token = $tokenCredential.GetNetworkCredential().Password
$headers = @{ 'x-e2e-token' = $token }
$uri = "https://$ProjectRef.supabase.co/functions/v1/$FunctionName"
$payload = @{ action = $Mode.ToLowerInvariant() }
if ($MemberId) { $payload.memberId = $MemberId }
if ($Mode -eq 'Cleanup' -and (Test-Path -LiteralPath $MetadataPath)) {
  $payload.fixtureId = [string](Get-Content -LiteralPath $MetadataPath -Raw | ConvertFrom-Json).fixtureId
}
$result = Invoke-RestMethod -Method Post -Uri $uri -Headers $headers -ContentType 'application/json' -Body ($payload | ConvertTo-Json -Compress)

if ($Mode -eq 'Setup') {
  if (-not $result.admin.email -or -not $result.admin.pin) { throw 'Fixture did not return an administrator credential' }
  [pscredential]::new([string]$result.admin.email,(ConvertTo-SecureString ([string]$result.admin.pin) -AsPlainText -Force)) | Export-Clixml -LiteralPath $CredentialPath -Force
  $metadata = [ordered]@{
    fixtureId = [string]$result.fixtureId
    adminUserId = [string]$result.admin.userId
    adminMemberId = [string]$result.admin.memberId
    adminPhone = [string]$result.admin.phone
    volunteerMemberId = [string]$result.volunteer.memberId
    volunteerPhone = [string]$result.volunteer.phone
    secondAdminMemberId = [string]$result.secondAdmin.memberId
    secondAdminPhone = [string]$result.secondAdmin.phone
    expiryMemberId = [string]$result.expiryMember.memberId
    expiryMemberPhone = [string]$result.expiryMember.phone
  }
  $metadata | ConvertTo-Json | Set-Content -LiteralPath $MetadataPath -Encoding utf8
  [pscustomobject]@{ ok = $true; fixtureId = $metadata.fixtureId; memberCount = 4 } | ConvertTo-Json -Compress
  exit 0
}

[pscustomobject]@{ ok = [bool]$result.ok; action = $Mode } | ConvertTo-Json -Compress
