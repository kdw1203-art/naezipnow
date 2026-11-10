# naezipnow new Supabase project (gjhnrpiiuhjzjzuuvdck) - build schema. ASCII only on purpose.
$ErrorActionPreference = "Continue"
$env:Path += ";C:\Program Files\PostgreSQL\17\bin"
$env:PGCLIENTENCODING = "UTF8"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$sec = Read-Host "NEW project DB password" -AsSecureString
$pw = [uri]::EscapeDataString([Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)))
$NEW = "postgresql://postgres.gjhnrpiiuhjzjzuuvdck:${pw}@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"
psql $NEW -t -c "select 'connected'" | Out-Null
if ($LASTEXITCODE -ne 0) { Write-Host "STOP: cannot connect (check password)"; return }
$state = Join-Path $root "applied.txt"
$log = Join-Path $root "apply-log.txt"
$done = @(); if (Test-Path $state) { $done = Get-Content $state }
$notx = @(); if (Test-Path (Join-Path $root "notx.txt")) { $notx = Get-Content (Join-Path $root "notx.txt") }
$ok = 0; $fail = 0; $skip = 0
"run " + (Get-Date -Format s) | Out-File $log -Encoding utf8
foreach ($f in (Get-ChildItem (Join-Path $root "sql") -Filter "*.sql" | Sort-Object Name)) {
  if ($done -contains $f.Name) { $skip++; continue }
  $a = @($NEW, "-q", "-v", "ON_ERROR_STOP=1")
  if (-not ($notx -contains $f.Name)) { $a += "--single-transaction" }
  $a += @("-f", $f.FullName)
  $out = (& psql @a 2>&1 | Out-String)
  if ($LASTEXITCODE -eq 0) { $ok++; Add-Content $state $f.Name }
  else {
    $fail++
    $line = ($out -split "`n" | Where-Object { $_ -match "ERROR|FATAL" } | Select-Object -First 1)
    ("FAIL " + $f.Name + " :: " + $line) | Out-File $log -Append -Encoding utf8
    Write-Host ("FAIL " + $f.Name)
  }
}
$sum = "ok=$ok fail=$fail already=$skip"
$sum | Out-File $log -Append -Encoding utf8
Write-Host ""
Write-Host $sum
Write-Host "log: $log"
