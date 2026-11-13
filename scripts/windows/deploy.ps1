# naeil 을 윈도우에 배포하고, 컴퓨터가 켜지면(로그인 전에도) 켜지고 죽으면 다시 켜지게 한다 (작업 스케줄러).
#
#   관리자 권한 PowerShell 에서 (시작 메뉴에서 PowerShell 을 오른쪽 클릭 → 관리자 권한으로 실행)
#   cd "<저장소 폴더>"
#   npm ci
#   powershell -ExecutionPolicy Bypass -File scripts\windows\deploy.ps1
#
# 하는 일 (순서대로, 한 단계라도 실패하면 멈춘다. 맥 scripts/macos/deploy.sh 와 같은 순서)
#   0) 관리자 확인   로그인 전에도 켜지게 등록하려면 한 번 필요
#   1) Node 확인     node 가 .node-version 이상인지
#   2) 굽기          npm run build (서버와 화면)
#   3) 판 만들기     실행에 필요한 것만 %LOCALAPPDATA%\naeil\releases\<판> 에 복사
#   4) 판 시험       새 판을 빈 폴더, 빈 자료로 켜 연기 시험 (실제 자료는 건드리지 않음)
#   5) 배포 전 백업  자료 파일이 있으면 새 판의 백업 명령으로 백업과 복원 연습. 실패하면 바꿔 끼우지 않음
#   6) 바꿔 끼우기   current 를 새 판으로 (지금 켜진 서버는 끄고)
#   7) 자동 실행     naeil-server (컴퓨터 켜질 때, 실행기가 죽으면 다시 켬)
#                    naeil-backup (매일 새벽 4시 17분, 그 시각에 꺼져 있었으면 켜질 때)
#   8) 확인          상태 확인이 200 이 될 때까지 기다림. 안 되면 이전 판으로 되돌리고 실패로 끝남
#
# 바꿀 수 있는 값 (환경 변수): NAEIL_NODE(쓸 node 경로), NAEIL_PORT(기본 3700), NAEIL_APP_HOME(시험용 자리)
# 맥 자료를 옮겨 올 때는 배포 뒤 scripts\windows\restore.ps1 (운영 안내서 「맥에서 윈도우로 옮기기」)
param([switch]$SkipBuild)
. "$PSScriptRoot\common.ps1"

$Repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
Set-Location $Repo

Say '0) 관리자 권한 확인'
if (-not (Test-Admin)) { Die '관리자 권한 PowerShell 에서 실행하세요 (로그인 전에도 켜지게 등록하려면 한 번 필요)' }
$User = [Security.Principal.WindowsIdentity]::GetCurrent().Name
Write-Host "사용자: $User"

Say '1) Node 확인'
$Node = $env:NAEIL_NODE
if (-not $Node) {
  $c = Get-Command node -ErrorAction SilentlyContinue
  if ($c) { $Node = $c.Source }
}
if (-not $Node -or -not (Test-Path $Node)) { Die 'node 를 못 찾음. https://nodejs.org 에서 22 판을 깔거나 NAEIL_NODE 로 경로를 알려 주세요' }
& $Node scripts\node-ok.mjs
if ($LASTEXITCODE -ne 0) { Die 'Node 판이 맞지 않음' }
Write-Host "node: $Node"

Say '2) 굽기'
if ($SkipBuild) {
  Write-Host '건너뜀'
} else {
  if (-not (Test-Path node_modules)) { Die 'node_modules 가 없음. npm ci 먼저' }
  & npm run build
  if ($LASTEXITCODE -ne 0) { Die '굽기 실패' }
}
if (-not (Test-Path dist\server.js) -or -not (Test-Path web\dist\index.html)) { Die '구운 결과가 없음 (dist\server.js, web\dist\index.html)' }

Say '3) 판 만들기'
$sha = Invoke-Quiet { git rev-parse --short HEAD }
if (-not $sha) { $sha = 'nogit' }
Invoke-Quiet { git diff --quiet HEAD } | Out-Null
$dirty = if ($LASTEXITCODE -ne 0) { '-dirty' } else { '' }
$RelId = '{0}-{1}{2}' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), $sha, $dirty
$Rel = Join-Path $Releases $RelId
New-Item -ItemType Directory -Force -Path $Releases, $LogDir | Out-Null
New-Item -ItemType Directory -Path $Rel | Out-Null
Copy-Item package.json, package-lock.json, .node-version -Destination $Rel
Copy-Item -Recurse dist, migrations -Destination $Rel
New-Item -ItemType Directory -Force -Path (Join-Path $Rel 'docs\api'), (Join-Path $Rel 'web'), (Join-Path $Rel 'scripts') | Out-Null
Copy-Item docs\api\openapi.yaml -Destination (Join-Path $Rel 'docs\api')
Copy-Item -Recurse web\dist -Destination (Join-Path $Rel 'web\dist')
Copy-Item scripts\smoke-dist.mjs, scripts\service.mjs, scripts\node-ok.mjs -Destination (Join-Path $Rel 'scripts')
# 꾸러미는 인터넷에서 다시 받지 않고 복사한 뒤 개발용만 뺀다 (사내망, 폐쇄망에서도 같은 방법)
# robocopy 는 긴 경로도 복사한다. 8 미만이 성공
& robocopy node_modules (Join-Path $Rel 'node_modules') /E /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { Die "꾸러미 복사 실패 (robocopy $LASTEXITCODE)" }
Push-Location $Rel
& npm prune --omit=dev --no-audit --no-fund | Out-Null
$pruned = $LASTEXITCODE
Pop-Location
if ($pruned -ne 0) { Die '개발용 꾸러미 빼기 실패' }
Set-Content -Path (Join-Path $Rel 'RELEASE') -Value $RelId -Encoding ASCII
Write-Host "판: $RelId"

Say '4) 판 시험 (빈 자료, 빈 폴더)'
& $Node (Join-Path $Rel 'scripts\smoke-dist.mjs')
if ($LASTEXITCODE -ne 0) {
  & cmd /c rmdir /s /q "$Rel"
  Die '새 판 연기 시험 실패. 판을 지우고 멈춤 (지금 켜진 판은 그대로)'
}

Say '5) 배포 전 백업'
$env:NAEIL_DB = $Db
$env:NAEIL_HOST = '127.0.0.1'
$env:NAEIL_PORT = "$Port"
if (Test-Path $Db) {
  & $Node (Join-Path $Rel 'dist\cli\backup.js') run
  if ($LASTEXITCODE -ne 0) { Die '배포 전 백업 또는 복원 연습 실패. 바꿔 끼우지 않고 멈춤 (지금 켜진 판은 그대로)' }
} else {
  Write-Host "자료 파일이 아직 없음. 처음 켤 때 새로 만듦: $Db"
  Write-Host '맥 자료를 옮겨 오려면 배포 뒤 scripts\windows\restore.ps1 -From <맥 백업 파일>'
}

Say '6) 바꿔 끼우기'
$Prev = Get-CurrentTarget
Stop-Naeil
Set-Current $Rel
if ($Prev) { Write-Host ("지금 판: {0} (이전: {1})" -f $RelId, (Split-Path $Prev -Leaf)) } else { Write-Host "지금 판: $RelId" }

Say '7) 자동 실행 설정'
# 실행기 설정. node 가 읽으니 머리표 없는 UTF-8 로
$cfg = @{ port = $Port; db = $Db; logDir = $LogDir } | ConvertTo-Json
[System.IO.File]::WriteAllText((Join-Path $AppHome 'service.json'), $cfg, (New-Object System.Text.UTF8Encoding $false))
$Svc = Join-Path $Current 'scripts\service.mjs'
# 로그인하지 않아도 이 사용자로 돈다(S4U, 암호를 저장하지 않음). 이 컴퓨터 안의 파일만 쓰므로 충분
$principal = New-ScheduledTaskPrincipal -UserId $User -LogonType S4U -RunLevel Limited
$serverSet = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew
$serverAct = New-ScheduledTaskAction -Execute $Node -Argument ('"{0}" server "{1}"' -f $Svc, $AppHome) -WorkingDirectory $AppHome
Register-ScheduledTask -TaskName $TaskServer -Description 'naeil 서버 (scripts/windows/deploy.ps1 이 등록)' `
  -Action $serverAct -Trigger (New-ScheduledTaskTrigger -AtStartup) -Principal $principal -Settings $serverSet -Force | Out-Null
$backupSet = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Hours 1) -MultipleInstances IgnoreNew
$backupAct = New-ScheduledTaskAction -Execute $Node -Argument ('"{0}" backup "{1}"' -f $Svc, $AppHome) -WorkingDirectory $AppHome
Register-ScheduledTask -TaskName $TaskBackup -Description 'naeil 매일 백업 (scripts/windows/deploy.ps1 이 등록)' `
  -Action $backupAct -Trigger (New-ScheduledTaskTrigger -Daily -At '04:17') -Principal $principal -Settings $backupSet -Force | Out-Null
Write-Host "등록: $TaskServer (컴퓨터 켜질 때), $TaskBackup (매일 04:17)"
Start-Naeil

Say '8) 확인'
$h = Wait-Health 30
if (-not $h) {
  if ($Prev -and (Test-Path $Prev)) {
    Stop-Naeil
    Set-Current $Prev
    Start-Naeil
    Die ("새 판이 켜지지 않아 이전 판({0})으로 되돌림. 기록: {1}\server.err.log, {1}\service.log" -f (Split-Path $Prev -Leaf), $LogDir)
  }
  Die "켜지지 않음. 기록: $LogDir\server.err.log, $LogDir\service.log"
}
Write-Host $h

# 오래된 판은 셋만 남긴다 (지금 판과 이전 판은 늘 남음)
$all = @(Get-ChildItem -Directory $Releases | Sort-Object Name)
if ($all.Count -gt 3) {
  $all | Select-Object -First ($all.Count - 3) | ForEach-Object {
    if ($_.FullName -ne $Rel -and $_.FullName -ne $Prev) { & cmd /c rmdir /s /q "$($_.FullName)" }
  }
}

Show-SleepWarning
Say '끝'
Write-Host "주소: http://127.0.0.1:$Port   판: $RelId"
Write-Host '상태 보기: powershell -ExecutionPolicy Bypass -File scripts\windows\status.ps1'
Write-Host '폰에서 열기: powershell -ExecutionPolicy Bypass -File scripts\windows\phone.ps1'
