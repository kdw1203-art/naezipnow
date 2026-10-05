& {
  $repo = [IO.Path]::Combine($env:USERPROFILE, "nuguzip_new")
  $dl   = [IO.Path]::Combine($env:USERPROFILE, "Downloads")
  $tmp  = [IO.Path]::Combine([IO.Path]::GetTempPath(), "naezipnow-__ID__")
  if (-not [IO.Directory]::Exists($repo)) { Write-Host "STOP: no repo folder"; return }
  $cand = Get-ChildItem -LiteralPath $dl -Filter "naezipnow-__ID__*.zip" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $cand) { Write-Host "STOP: Downloads 에 naezipnow-__ID__.zip 없음"; return }
  $zip = $cand.FullName
  Write-Host "zip: $($cand.Name)"
  Set-Location -LiteralPath $repo
  git pull -q
  $base = git rev-parse "HEAD^{tree}"
  if ($base -eq "__TREE__") { Write-Host "OK: 이미 __ID__ 이 적용돼 있음"; return }
  if (@(__BASES__) -notcontains $base) { Write-Host "STOP: 기준 트리가 아님 (tree $base)"; git log --oneline -3; git status --short | Select-Object -First 10; return }
  if ([IO.Directory]::Exists($tmp)) { [IO.Directory]::Delete($tmp, $true) }
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  [IO.Compression.ZipFile]::ExtractToDirectory($zip, $tmp)
  $root = (Get-Location).Path
  foreach ($f in [IO.File]::ReadAllLines([IO.Path]::Combine($tmp, "DELETED.txt"))) {
    if ($f) { git rm -q --force --ignore-unmatch -- ":(literal)$f" }
  }
  $n = 0
  foreach ($f in [IO.File]::ReadAllLines([IO.Path]::Combine($tmp, "FILES.txt"))) {
    if (-not $f) { continue }
    $src = [IO.Path]::Combine($tmp, $f); $dst = [IO.Path]::Combine($root, $f)
    [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dst))
    [IO.File]::Copy($src, $dst, $true); $n++
  }
  git add -A
  $tree = git write-tree
  if ($tree -ne "__TREE__") { Write-Host "STOP: tree mismatch ($n files copied) — zip 이 최신본인지 확인"; git status --short | Select-Object -First 20; git reset -q --hard HEAD; return }
  git commit -q -F ([IO.Path]::Combine($tmp, "COMMIT-MSG.txt"))
  git push -q origin main
  if ($LASTEXITCODE -ne 0) { Write-Host "STOP: push 실패 — 위 git 메시지 확인"; return }
  Write-Host "OK: $n files, tree verified, pushed"
}
