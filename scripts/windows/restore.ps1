# 백업에서 되살린다: 서버 끄기 → 지금 자료를 옆 폴더로 옮기고 백업을 제자리에 → 폐기 명부 다시 적용 → 서버 켜기
#   관리자 권한 PowerShell 에서
#   powershell -ExecutionPolicy Bypass -File scripts\windows\restore.ps1 -From latest
#   powershell -ExecutionPolicy Bypass -File scripts\windows\restore.ps1 -From naeil-20261110T041700Z.db
#   powershell -ExecutionPolicy Bypass -File scripts\windows\restore.ps1 -From C:\Users\me\Downloads\naeil-20261113T090000Z.db   (맥에서 가져온 백업)
param([Parameter(Mandatory = $true)][string]$From)
. "$PSScriptRoot\common.ps1"

$cli = Join-Path $Current 'dist\cli\backup.js'
if (-not (Test-Path $cli)) { Die "배포본이 없음: $cli (deploy.ps1 을 먼저)" }
$node = Get-NodePath
if (-not $node) { Die 'node 를 못 찾음' }
if ((Test-Path $From) -and -not [System.IO.Path]::IsPathRooted($From)) { $From = (Resolve-Path $From).Path }

Say '서버 끄기'
Stop-Naeil

Say '되살리기'
$env:NAEIL_DB = $Db
$env:NAEIL_HOST = '127.0.0.1'
$env:NAEIL_PORT = "$Port"
& $node $cli restore $From
if ($LASTEXITCODE -ne 0) {
  # 되살리기는 중간에 실패하면 원래 자료를 제자리로 되돌린다. 그래도 자료 파일이 없으면 켜지 않는다
  # (켜면 빈 자료 파일이 새로 생겨 빈 작업판이 정상처럼 보임). 처음 옮겨 오는 중이었으면 원래 없던 것
  if (Test-Path $Db) {
    Start-Naeil
    Die '되살리기 실패. 원래 자료 그대로 서버를 다시 켬'
  }
  Die "되살리기 실패, 자료 파일이 제자리에 없어 서버를 켜지 않음. $AppHome\backups\before-restore-* 를 확인"
}

Say '서버 켜기'
Start-Naeil
$h = Wait-Health 30
if (-not $h) { Die "켜지지 않음. 기록: $LogDir\server.err.log" }
Write-Host $h
