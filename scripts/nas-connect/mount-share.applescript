-- Read credentials inside this process instead of placing them in its arguments.
set settingsPath to system attribute "NASA_CONNECT_CONFIG"
set quotedPath to quoted form of settingsPath
set nasHost to do shell script "/usr/bin/plutil -extract nasHost raw -expect string -o - " & quotedPath
set shareName to do shell script "/usr/bin/plutil -extract shareName raw -expect string -o - " & quotedPath
set smbUser to do shell script "/usr/bin/plutil -extract smbUsername raw -expect string -o - " & quotedPath
set smbPassword to do shell script "/usr/bin/plutil -extract smbPassword raw -expect string -o - " & quotedPath
mount volume ("smb://" & nasHost & "/" & shareName) as user name smbUser with password smbPassword
