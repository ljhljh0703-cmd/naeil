# 폰에서 열기: 서버는 이 컴퓨터 안(127.0.0.1)에 그대로 두고, Tailscale 이 암호화 주소(https://<기기>.<tailnet>.ts.net)를 앞에 세운다.
# 그 주소는 내 Tailscale 기기(폰, 맥)에서만 열리고 인터넷에는 안 열린다. 컴퓨터를 다시 켜도 유지된다.
#   powershell -ExecutionPolicy Bypass -File scripts\windows\phone.ps1        열기
#   powershell -ExecutionPolicy Bypass -File scripts\windows\phone.ps1 -Off   닫기
# 처음 한 번은 Tailscale 관리 화면에서 MagicDNS 와 HTTPS 인증서를 켜야 한다 (안 켜져 있으면 Tailscale 이 켜는 주소를 알려 줌)
param([switch]$Off)
. "$PSScriptRoot\common.ps1"

$ts = Find-Tailscale
if (-not $ts) { Die 'Tailscale 이 없음. https://tailscale.com/download/windows 에서 깔고 같은 계정으로 로그인' }
Invoke-Quiet { & $ts status } | Out-Null
if ($LASTEXITCODE -ne 0) { Die 'Tailscale 에 로그인되어 있지 않음. 작업 표시줄의 Tailscale 아이콘에서 로그인' }

if ($Off) {
  & $ts serve --https=443 off
  if ($LASTEXITCODE -ne 0) { Die '폰 주소 닫기 실패' }
  Write-Host '폰 주소를 닫음'
  exit 0
}

if (-not (Get-Health)) { Write-Host "참고: 지금 서버가 응답하지 않음 ($HealthUrl). 주소는 열어 두고, 서버가 켜지면 바로 보임" -ForegroundColor Yellow }
# 서버 주소는 그대로(127.0.0.1). Tailscale 이 https 로 받아 이 컴퓨터 안으로 넘긴다
& $ts serve --bg $Port
if ($LASTEXITCODE -ne 0) { Die 'tailscale serve 실패. 위에 나온 안내(HTTPS 인증서 켜기 등)를 먼저' }
$self = (Invoke-Quiet { & $ts status --json }) -join "`n" | ConvertFrom-Json
$name = ($self.Self.DNSName).TrimEnd('.')
Say '폰 주소'
Write-Host "https://$name"
Write-Host '폰에서: Tailscale 앱을 켠 채 위 주소를 열고, 처음 한 번 출입증을 넣는다 (홈 화면에 추가해 두면 앱처럼 열림)'
Show-SleepWarning
