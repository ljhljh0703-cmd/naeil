# 윈도우 스크립트가 같이 쓰는 자리와 함수. 다른 스크립트가 맨 위에서 불러 쓴다 (. "$PSScriptRoot\common.ps1")
# 윈도우 PowerShell 5.1 에서도 돌도록 쓴다. 이 파일들은 머리표(BOM) 있는 UTF-8 로 저장한다
# (없으면 5.1 이 한글을 깨뜨려 읽는다. test/windows-scripts.test.ts 가 지킨다).

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$AppHome = if ($env:NAEIL_APP_HOME) { $env:NAEIL_APP_HOME } else { Join-Path $env:LOCALAPPDATA 'naeil' }
$LogDir = Join-Path $AppHome 'logs'
$Current = Join-Path $AppHome 'current'
$Releases = Join-Path $AppHome 'releases'
$Db = Join-Path $AppHome 'naeil.db'
$Port = if ($env:NAEIL_PORT) { [int]$env:NAEIL_PORT } else { 3700 }
$TaskServer = 'naeil-server'
$TaskBackup = 'naeil-backup'
$HealthUrl = "http://127.0.0.1:$Port/health"

# 바깥 프로그램(git, powercfg 등)을 오류 출력은 버리고 돌린다.
# 5.1 은 바깥 프로그램의 오류 출력을 돌려 받으면 그것만으로 멈춰 버려서, 이 안에서만 멈춤을 푼다
function Invoke-Quiet([scriptblock]$Block) {
  $old = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Block 2>$null } finally { $ErrorActionPreference = $old }
}

function Say([string]$m) { Write-Host "`n== $m" }
function Die([string]$m) { Write-Host "`n실패: $m" -ForegroundColor Red; exit 1 }

function Test-Admin {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  return ([Security.Principal.WindowsPrincipal]$id).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# 상태 확인 답 (200 이면 내용, 아니면 $null)
function Get-Health {
  try {
    $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri $HealthUrl
    if ($r.StatusCode -eq 200) { return $r.Content }
  } catch {}
  return $null
}

# 응답이 아예 없는가 (503 은 「켜져 있음」으로 본다)
function Test-Listening {
  try {
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 -Uri $HealthUrl | Out-Null
    return $true
  } catch [System.Net.WebException] {
    return ($null -ne $_.Exception.Response)
  } catch {
    return $false
  }
}

function Wait-Health([int]$Seconds = 20) {
  $end = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $end) {
    $h = Get-Health
    if ($h) { return $h }
    Start-Sleep -Milliseconds 500
  }
  return $null
}

# 이 앱 폴더에서 켜진 node (실행기와 서버). 실행기가 먼저 죽어 남은 서버도 찾는다
function Get-NaeilProcesses {
  $needle = $AppHome.ToLowerInvariant()
  Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($needle) }
}

# 서버 끄기: 작업을 멈추면 실행기가 꺼지고, 서버는 입력 통로가 닫힌 것을 보고 자료를 닫고 끝난다
function Stop-Naeil {
  if (Get-ScheduledTask -TaskName $TaskServer -ErrorAction SilentlyContinue) {
    Stop-ScheduledTask -TaskName $TaskServer -ErrorAction SilentlyContinue
  }
  $end = (Get-Date).AddSeconds(15)
  while ((Get-Date) -lt $end) {
    if (-not (Test-Listening) -and -not (Get-NaeilProcesses)) { return }
    Start-Sleep -Milliseconds 500
  }
  # 그래도 남아 있으면 강제로 (SQLite 는 갑자기 꺼져도 마지막으로 저장된 그대로 남는다)
  Get-NaeilProcesses | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Start-Sleep -Seconds 1
  if (Test-Listening) { Die "서버가 꺼지지 않음 (포트 $Port 를 다른 프로그램이 쓰는지 확인)" }
}

function Start-Naeil {
  Start-ScheduledTask -TaskName $TaskServer
}

# current 가 가리키는 판 폴더 (없으면 $null)
function Get-CurrentTarget {
  if (-not (Test-Path $Current)) { return $null }
  $t = (Get-Item $Current).Target
  if ($t -is [array]) { $t = $t[0] }
  return $t
}

# current 를 다른 판으로 바꿔 끼운다. 바로가기(정션)만 지우고 판 폴더는 건드리지 않는다
function Set-Current([string]$Target) {
  if (Test-Path $Current) { [System.IO.Directory]::Delete($Current) }
  New-Item -ItemType Junction -Path $Current -Target $Target | Out-Null
}

function Get-NodePath {
  $n = $env:NAEIL_NODE
  if (-not $n) {
    $info = Get-ScheduledTask -TaskName $TaskServer -ErrorAction SilentlyContinue
    if ($info) { $n = $info.Actions[0].Execute }
  }
  if (-not $n) {
    $c = Get-Command node -ErrorAction SilentlyContinue
    if ($c) { $n = $c.Source }
  }
  return $n
}

# 전원 연결 중 잠자기가 켜져 있으면 경고만 (서버가 같이 멈춘다)
function Show-SleepWarning {
  try {
    $q = Invoke-Quiet { powercfg /query SCHEME_CURRENT SUB_SLEEP STANDBYIDLE }
    $vals = @($q | Select-String -Pattern ':\s*0x([0-9a-fA-F]{8})\s*$' | ForEach-Object { $_.Matches[0].Groups[1].Value })
    if ($vals.Count -ge 2) {
      $ac = [Convert]::ToInt32($vals[$vals.Count - 2], 16)
      if ($ac -gt 0) {
        Write-Host ("경고: 전원 연결 중에도 {0}분 뒤 잠자기. 잠자는 동안 서버도 멈춤 → 설정 > 시스템 > 전원에서 「절전 모드: 안 함」" -f [int]($ac / 60)) -ForegroundColor Yellow
      } else {
        Write-Host '잠자기: 전원 연결 중에는 안 함 (서버가 계속 열림)'
      }
    }
  } catch {}
}

function Find-Tailscale {
  $c = Get-Command tailscale -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  $p = Join-Path $env:ProgramFiles 'Tailscale\tailscale.exe'
  if (Test-Path $p) { return $p }
  return $null
}
