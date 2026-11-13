# 자동 실행(서버, 매일 백업)을 끄고 등록만 지운다. 판(releases), 자료 파일(naeil.db), 백업, 폰 주소는 남긴다
#   관리자 권한 PowerShell: powershell -ExecutionPolicy Bypass -File scripts\windows\uninstall.ps1
# 폰 주소까지 닫으려면: powershell -ExecutionPolicy Bypass -File scripts\windows\phone.ps1 -Off
. "$PSScriptRoot\common.ps1"
Stop-Naeil
foreach ($name in @($TaskServer, $TaskBackup)) {
  if (Get-ScheduledTask -TaskName $name -ErrorAction SilentlyContinue) {
    Unregister-ScheduledTask -TaskName $name -Confirm:$false
  }
}
Write-Host "자동 실행 해제. 자료, 백업, 판은 $AppHome 에 그대로"
