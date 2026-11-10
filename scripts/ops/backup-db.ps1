# naezipnow DB backup (new project gjhnrpiiuhjzjzuuvdck). ASCII only. Reads only; writes a dated .sql under ~/nz-backups.
$env:Path += ";C:\Program Files\PostgreSQL\17\bin"
$env:PGCLIENTENCODING = "UTF8"
$sec = Read-Host "NEW project DB password" -AsSecureString
$pw = [uri]::EscapeDataString([Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)))
$DB = "postgresql://postgres.gjhnrpiiuhjzjzuuvdck:${pw}@aws-0-ap-northeast-2.pooler.supabase.com:5432/postgres"
$dir = Join-Path $env:USERPROFILE "nz-backups"; New-Item -ItemType Directory -Force $dir | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmm"
$out = Join-Path $dir "naezipnow-$stamp.sql"
pg_dump $DB --no-owner --schema=public --schema=market_agg --schema=private --schema=ops --schema=reporting -f $out
if ($LASTEXITCODE -ne 0) { Write-Host "STOP: backup failed"; return }
$mb = [math]::Round((Get-Item $out).Length / 1MB, 1)
Write-Host "backup ok: $out ($mb MB)"
Get-ChildItem $dir -Filter "naezipnow-*.sql" | Sort-Object LastWriteTime -Descending | Select-Object -Skip 14 | Remove-Item -Force
