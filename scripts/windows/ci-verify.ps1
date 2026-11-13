# 자동 검사(CI)용: 윈도우 러너에서 deploy.ps1 로 배포한 뒤, 상시 서버가 약속대로 움직이는지 실제로 본다.
# 실제 작업판 컴퓨터에서는 돌리지 않는다 (끝에서 자동 실행을 지우고, 되살리기를 한다).
#   powershell -ExecutionPolicy Bypass -File scripts\windows\ci-verify.ps1
. "$PSScriptRoot\common.ps1"
$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$fails = 0
function Check([string]$name, [bool]$ok, [string]$detail = '') {
  if ($ok) { Write-Host "통과  $name" } else { Write-Host "실패  $name  $detail" -ForegroundColor Red; $script:fails++ }
}
function ServerPid {
  $p = Get-NaeilProcesses | Where-Object { $_.CommandLine -like '*dist\server.js*' } | Select-Object -First 1
  if ($p) { return [int]$p.ProcessId } else { return $null }
}
function ServiceLogs {
  foreach ($f in @('service.log', 'server.err.log', 'backup.log', 'backup.err.log')) {
    $p = Join-Path $LogDir $f
    if (Test-Path $p) { Write-Host "--- $f"; Get-Content $p -Tail 30 }
  }
}

# 1. 배포 직후
$h = Wait-Health 30
Check '배포 뒤 상태 확인 200' ($null -ne $h) $h
$ver = (Get-Content (Join-Path $Repo 'package.json') -Raw | ConvertFrom-Json).version
Check "상태 확인의 판 번호 = $ver" ($h -match "`"version`":`"$ver`"") $h
$t = Get-ScheduledTask -TaskName $TaskServer -ErrorAction SilentlyContinue
Check '서버 작업 등록 (컴퓨터 켜질 때, 로그인 없이)' ($t -and $t.Triggers[0].CimClass.CimClassName -eq 'MSFT_TaskBootTrigger' -and $t.Principal.LogonType -eq 'S4U') "$($t.Triggers[0].CimClass.CimClassName) $($t.Principal.LogonType)"
$b = Get-ScheduledTask -TaskName $TaskBackup -ErrorAction SilentlyContinue
Check '매일 백업 작업 등록 (놓치면 켜질 때)' ($b -and $b.Settings.StartWhenAvailable) ''
$web = try { (Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:$Port/").StatusCode } catch { 0 }
Check '첫 주소가 화면을 엶' ($web -eq 200) "$web"
Check '자료 파일이 앱 폴더에 생김' (Test-Path $Db) $Db

# 2. 서버가 갑자기 죽으면 실행기가 다시 켬
$pid1 = ServerPid
Check '서버 프로세스를 찾음' ($null -ne $pid1) ''
if ($pid1) {
  Stop-Process -Id $pid1 -Force
  Start-Sleep -Seconds 2
  $h2 = Wait-Health 40
  $pid2 = ServerPid
  Check '죽인 서버가 다시 켜짐 (새 프로세스)' ($null -ne $h2 -and $pid2 -and $pid2 -ne $pid1) "$pid1 → $pid2"
  $st = Get-Content (Join-Path $LogDir 'service-state.json') -Raw | ConvertFrom-Json
  Check '실행기 기록에 두 번 켬' ($st.runs -ge 2) "runs=$($st.runs)"
}

# 3. 작업을 멈추면 서버도 같이 끝나 포트를 붙잡고 남지 않음
Stop-ScheduledTask -TaskName $TaskServer
$end = (Get-Date).AddSeconds(15)
while ((Get-Date) -lt $end -and ((Test-Listening) -or (ServerPid))) { Start-Sleep -Milliseconds 500 }
Check '작업 멈춤 → 서버도 끝남 (남은 서버 없음)' (-not (Test-Listening) -and -not (ServerPid)) ''
Start-Naeil
Check '다시 켬' ($null -ne (Wait-Health 30)) ''

# 4. 매일 백업 작업을 지금 한 번
Start-ScheduledTask -TaskName $TaskBackup
$end = (Get-Date).AddSeconds(90)
do { Start-Sleep -Seconds 2; $bi = Get-ScheduledTaskInfo -TaskName $TaskBackup; $bs = (Get-ScheduledTask -TaskName $TaskBackup).State } while ((Get-Date) -lt $end -and $bs -eq 'Running')
Check '매일 백업 작업 결과 0' ($bi.LastTaskResult -eq 0) "결과 $($bi.LastTaskResult)"
$bk = @(Get-ChildItem (Join-Path $AppHome 'backups') -Filter 'naeil-*.db' -ErrorAction SilentlyContinue)
Check '백업 파일이 생김' ($bk.Count -ge 1) "$($bk.Count)"
$drill = Join-Path $AppHome 'backups\last-drill.json'
Check '복원 연습 통과' ((Test-Path $drill) -and (Get-Content $drill -Raw | ConvertFrom-Json).ok) ''
$h4 = Get-Health
Check '상태 확인 백업 칸 ok' ($h4 -match '"backup":"ok"') $h4

# 5. 다시 배포 → 판이 바뀌고 자료는 그대로
$before = Get-CurrentTarget
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'deploy.ps1') -SkipBuild
Check '다시 배포 성공' ($LASTEXITCODE -eq 0) "$LASTEXITCODE"
$after = Get-CurrentTarget
Check '판이 새것으로 바뀜' ($after -and $after -ne $before) "$before → $after"
$bk2 = @(Get-ChildItem (Join-Path $AppHome 'backups') -Filter 'naeil-*.db')
Check '배포 전 백업이 하나 더 생김' ($bk2.Count -gt $bk.Count) "$($bk.Count) → $($bk2.Count)"

# 6. 되돌리기
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'rollback.ps1')
Check '되돌리기 성공' ($LASTEXITCODE -eq 0) "$LASTEXITCODE"
Check '이전 판으로 돌아감' ((Get-CurrentTarget) -eq $before) "$(Get-CurrentTarget)"

# 7. 되살리기 (맥에서 가져온 백업처럼 앱 폴더 밖 파일로)
$outside = Join-Path $env:RUNNER_TEMP 'from-mac.db'
Copy-Item $bk2[-1].FullName $outside
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'restore.ps1') -From $outside
Check '앱 폴더 밖 백업 파일로 되살리기' ($LASTEXITCODE -eq 0) "$LASTEXITCODE"
Check '되살린 뒤 상태 확인 200' ($null -ne (Get-Health)) ''
Check '옮기기 전 자료를 옆 폴더에 남김' (@(Get-ChildItem (Join-Path $AppHome 'backups') -Directory -Filter 'before-restore-*').Count -ge 1) ''

# 8. 상태 보기가 끝까지 돎
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'status.ps1')
Check '상태 보기 스크립트' ($LASTEXITCODE -eq 0 -or $null -eq $LASTEXITCODE) "$LASTEXITCODE"

# 9. 지우기: 등록만 지우고 자료는 남김
& powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'uninstall.ps1')
Check '지우기 성공' ($LASTEXITCODE -eq 0) "$LASTEXITCODE"
Check '자동 실행 등록이 사라짐' (-not (Get-ScheduledTask -TaskName $TaskServer -ErrorAction SilentlyContinue) -and -not (Get-ScheduledTask -TaskName $TaskBackup -ErrorAction SilentlyContinue)) ''
Check '서버가 꺼짐' (-not (Test-Listening) -and -not (ServerPid)) ''
Check '자료 파일과 백업은 남음' ((Test-Path $Db) -and (@(Get-ChildItem (Join-Path $AppHome 'backups') -Filter 'naeil-*.db').Count -ge 1)) ''

if ($fails -gt 0) { ServiceLogs; Die "윈도우 상시 서버 확인 $fails 건 실패" }
Write-Host "`n윈도우 상시 서버 확인 모두 통과"
