# naeil 자동 실행 상태 한눈에: 켜져 있나, 몇 번 다시 켜졌나, 어느 판인가, 백업, 폰 주소
#   powershell -ExecutionPolicy Bypass -File scripts\windows\status.ps1
. "$PSScriptRoot\common.ps1"
$ErrorActionPreference = 'Continue'

$rel = Join-Path $Current 'RELEASE'
if (Test-Path $rel) { Write-Host ("판:        {0}" -f (Get-Content $rel -Raw).Trim()) } else { Write-Host '판:        없음 (deploy.ps1 을 먼저)' }
Write-Host ("자료:      {0} ({1})" -f $Db, $(if (Test-Path $Db) { '있음' } else { '없음' }))
foreach ($name in @($TaskServer, $TaskBackup)) {
  $t = Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue
  if (-not $t) { Write-Host "자동 실행: $name 등록 안 됨"; continue }
  $i = Get-ScheduledTaskInfo -TaskName $name
  Write-Host ("자동 실행: {0} {1}, 마지막 실행 {2} (결과 {3}), 다음 {4}" -f $name, $t.State, $i.LastRunTime, $i.LastTaskResult, $i.NextRunTime)
}
$st = Join-Path $LogDir 'service-state.json'
if (Test-Path $st) {
  $s = Get-Content $st -Raw | ConvertFrom-Json
  $last = if ($s.lastExit) { "마지막 종료 코드 $($s.lastExit.code) ($($s.lastExit.at))" } else { '종료 없음' }
  Write-Host ("실행기:    {0} 부터, 켠 횟수 {1}, 서버 pid {2}, {3}" -f $s.startedAt, $s.runs, $s.pid, $last)
}
$h = Get-Health
if ($h) { Write-Host "상태 확인: $h" } elseif (Test-Listening) { Write-Host '상태 확인: 켜져 있지만 200 이 아님 (자료 파일 이상일 수 있음)' } else { Write-Host "상태 확인: 연결 안 됨 (포트 $Port)" }
$bk = Join-Path $AppHome 'backups'
$list = @(Get-ChildItem -Path $bk -Filter 'naeil-*.db' -ErrorAction SilentlyContinue | Sort-Object Name)
if ($list.Count -gt 0) { Write-Host ("최근 백업: {0} (모두 {1}개)" -f $list[-1].Name, $list.Count) } else { Write-Host '최근 백업: 없음' }
$drill = Join-Path $bk 'last-drill.json'
if (Test-Path $drill) {
  $d = Get-Content $drill -Raw | ConvertFrom-Json
  Write-Host ("복원 연습: {0}" -f $(if ($d.ok) { '통과' } else { "실패 ($drill)" }))
}
Write-Host ("폐기 명부: {0}" -f $(if (Test-Path (Join-Path $AppHome 'revoked-keys.json')) { '있음' } else { '없음' }))
Show-SleepWarning
$ts = Find-Tailscale
if ($ts) {
  $serve = Invoke-Quiet { & $ts serve status }
  if ($serve -and ($serve -join ' ') -match 'https://') { Write-Host '폰 주소:'; $serve | ForEach-Object { Write-Host "  $_" } } else { Write-Host '폰 주소:   아직 안 엶 (phone.ps1)' }
} else {
  Write-Host '폰 주소:   Tailscale 이 없음'
}
Write-Host "기록:      $LogDir (server.log, server.err.log, service.log, backup.log)"
