# 바로 전 판으로 되돌린다. 자료 파일은 그대로 (표 구조를 되돌리지는 않는다)
#   관리자 권한 PowerShell: powershell -ExecutionPolicy Bypass -File scripts\windows\rollback.ps1
. "$PSScriptRoot\common.ps1"
$cur = Get-CurrentTarget
if (-not $cur) { Die '지금 판이 없음' }
$prev = Get-ChildItem -Directory $Releases | Sort-Object Name | Where-Object { $_.FullName -ne $cur } | Select-Object -Last 1
if (-not $prev) { Die '되돌릴 이전 판이 없음' }
Stop-Naeil
Set-Current $prev.FullName
Start-Naeil
Write-Host ("되돌림: {0} → {1}" -f (Split-Path $cur -Leaf), $prev.Name)
$h = Wait-Health 30
if (-not $h) { Die "되돌린 판이 켜지지 않음. 기록: $LogDir\server.err.log" }
Write-Host $h
