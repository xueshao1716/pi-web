# pi-web 全服务开机自启
$ErrorActionPreference = 'Stop'
$user = "$env:USERDOMAIN\$env:USERNAME"

Write-Host ''
Write-Host 'pi-web 开机自启配置' -ForegroundColor Cyan

# 1. pi-web + watchdog
$piWeb = @{
  TaskName = 'piweb-server'
  Action   = (New-ScheduledTaskAction -Execute 'C:\Program Files\nodejs\node.exe' -Argument 'watchdog.mjs' -WorkingDirectory 'D:\pi-web')
  Trigger  = (New-ScheduledTaskTrigger -AtStartup)
  Settings = (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 0))
  Principal = (New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest)
}
Register-ScheduledTask @piWeb -Force | Out-Null
Write-Host '[1/4] piweb-server (watchdog) OK' -ForegroundColor Green

# 2. cloudflared
$cf = @{
  TaskName = 'piweb-cloudflared'
  Action   = (New-ScheduledTaskAction -Execute 'C:\Users\xuexiaofeng\AppData\Local\Programs\Python\Python312\python.exe' -Argument 'C:\Users\xuexiaofeng\.cloudflared\start-tunnel.py' -WorkingDirectory 'C:\Users\xuexiaofeng\.cloudflared')
  Trigger  = (New-ScheduledTaskTrigger -AtStartup)
  Settings = (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 0))
  Principal = (New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest)
}
Register-ScheduledTask @cf -Force | Out-Null
Write-Host '[2/4] piweb-cloudflared OK' -ForegroundColor Green

# 3. shi openclaw
$shi = @{
  TaskName = 'piweb-shi-openclaw'
  Action   = (New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c D:\linxinyu-system\host\openclaw\profile\start_gateway.bat' -WorkingDirectory 'D:\linxinyu-system\host\openclaw\profile')
  Trigger  = (New-ScheduledTaskTrigger -AtStartup)
  Settings = (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 0))
  Principal = (New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest)
}
Register-ScheduledTask @shi -Force | Out-Null
Write-Host '[3/4] piweb-shi-openclaw OK' -ForegroundColor Green

# 4. si hermes
$si = @{
  TaskName = 'piweb-si-hermes'
  Action   = (New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c D:\xinyu-hermes\gateway-service\Hermes_Gateway.cmd' -WorkingDirectory 'D:\xinyu-hermes')
  Trigger  = (New-ScheduledTaskTrigger -AtStartup)
  Settings = (New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 0))
  Principal = (New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest)
}
Register-ScheduledTask @si -Force | Out-Null
Write-Host '[4/4] piweb-si-hermes OK' -ForegroundColor Green

Write-Host ''
Write-Host '4 autostart tasks registered' -ForegroundColor Green
