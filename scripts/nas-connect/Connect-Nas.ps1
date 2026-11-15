#Requires -Version 5.1
[CmdletBinding()]
param(
    [string]$ConfigPath = (Join-Path $PSScriptRoot 'nas-config.local.json'),
    [ValidatePattern('^[D-Zd-z]:?$')][string]$DriveLetter,
    [switch]$DryRun,
    # Internal phase: installation and Tailscale configuration, without mapping.
    [switch]$SetupOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Read-NasConfig {
    param([string]$Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw 'Copy nas-config.example.json to nas-config.local.json and fill in the credentials.'
    }
    try { $config = Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json }
    catch { throw 'The settings file is not valid JSON.' }
    foreach ($name in @('tailscaleAuthKey', 'nasHost', 'shareName', 'smbUsername', 'smbPassword', 'windowsDrive')) {
        if (-not $config.PSObject.Properties[$name] -or $config.$name -isnot [string]) { throw "Settings must contain a string named '$name'." }
    }
    if ($config.nasHost -notmatch '^[A-Za-z0-9][A-Za-z0-9.-]*$') { throw 'nasHost must be an IP address or hostname.' }
    if ($config.shareName -notmatch '^[A-Za-z0-9._-]+$') { throw 'shareName must be a single share name using letters, digits, dots, underscores or hyphens.' }
    if (-not $config.smbUsername -or -not $config.smbPassword) { throw 'smbUsername and smbPassword must not be empty.' }
    if ($config.windowsDrive -notmatch '^[D-Zd-z]:$') { throw 'windowsDrive must be a drive letter between D: and Z:.' }
    return $config
}

function Test-Administrator {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Find-Tailscale {
    $candidates = @()
    foreach ($folder in @($env:ProgramW6432, $env:ProgramFiles, ${env:ProgramFiles(x86)})) {
        if ($folder) { $candidates += Join-Path $folder 'Tailscale\tailscale.exe' }
    }
    $command = Get-Command tailscale.exe -ErrorAction SilentlyContinue
    if ($command) { $candidates += $command.Source }
    foreach ($candidate in $candidates) {
        if (Test-Path -LiteralPath $candidate -PathType Leaf) { return $candidate }
    }
    return $null
}

function New-PrivateTempDirectory {
    $directory = Join-Path ([IO.Path]::GetTempPath()) ('nasa-connect-' + [Guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $directory | Out-Null
    try {
        $acl = New-Object Security.AccessControl.DirectorySecurity
        $acl.SetAccessRuleProtection($true, $false)
        $userSid = [Security.Principal.WindowsIdentity]::GetCurrent().User
        $systemSid = New-Object Security.Principal.SecurityIdentifier('S-1-5-18')
        foreach ($sid in @($userSid, $systemSid)) {
            $rule = New-Object Security.AccessControl.FileSystemAccessRule($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
            $acl.AddAccessRule($rule)
        }
        Set-Acl -LiteralPath $directory -AclObject $acl
        return $directory
    }
    catch { Remove-Item -LiteralPath $directory -Recurse -Force; throw }
}

function Install-Tailscale {
    $directory = New-PrivateTempDirectory
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Write-Host 'Downloading the current stable Tailscale installer...'
        $metadata = Invoke-RestMethod -Uri 'https://pkgs.tailscale.com/stable/?mode=json' -TimeoutSec 60
        $processor = $env:PROCESSOR_ARCHITEW6432
        if (-not $processor) { $processor = $env:PROCESSOR_ARCHITECTURE }
        $architecture = switch ($processor) {
            'AMD64' { 'amd64' }
            'ARM64' { 'arm64' }
            'x86' { 'x86' }
            default { throw "Unsupported Windows architecture: $processor" }
        }
        $name = $metadata.MSIs.$architecture
        if ($name -notmatch '^tailscale-setup-[0-9.]+-(amd64|arm64|x86)\.msi$') { throw 'Unexpected Windows package name.' }
        $uri = 'https://pkgs.tailscale.com/stable/' + $name
        $installer = Join-Path $directory $name
        Invoke-WebRequest -UseBasicParsing -Uri $uri -OutFile $installer -TimeoutSec 300
        $checksum = [string](Invoke-RestMethod -Uri ($uri + '.sha256') -TimeoutSec 60)
        $expected = ($checksum.Trim() -split '\s+')[0]
        $actual = (Get-FileHash -LiteralPath $installer -Algorithm SHA256).Hash
        if ($expected -notmatch '^[a-fA-F0-9]{64}$' -or $expected -ne $actual) { throw 'The installer checksum does not match.' }
        $signature = Get-AuthenticodeSignature -LiteralPath $installer
        if ($signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -notmatch '(?:^|,\s*)O="?Tailscale Inc\.?"?(?:,|$)') {
            throw 'The installer does not have a valid Tailscale Inc. signature.'
        }
        Write-Host 'Installing Tailscale...'
        $process = Start-Process -FilePath "$env:SystemRoot\System32\msiexec.exe" -ArgumentList @('/i', ('"{0}"' -f $installer), '/qn', '/norestart', 'TS_NOLAUNCH=1') -Wait -PassThru
        if ($process.ExitCode -notin @(0, 3010)) { throw "Tailscale installation failed (code $($process.ExitCode))." }
        if ($process.ExitCode -eq 3010) { Write-Host 'Windows requested a restart. If connection fails, restart Windows and rerun the launcher.' }
    }
    finally { Remove-Item -LiteralPath $directory -Recurse -Force }
}

function Get-TailscaleState {
    param([string]$Cli)
    # Unauthenticated clients can return valid JSON with a nonzero exit code.
    try {
        $output = & $Cli status --json 2>$null
        $status = ($output -join "`n") | ConvertFrom-Json
        if ($status.PSObject.Properties['BackendState']) { return $status.BackendState }
    }
    catch { }
    return ''
}

function Invoke-TailscaleUp {
    param([string]$Cli, [object]$Config, [string]$State)
    $directory = $null
    try {
        # Keep up free of preference flags so saved non-default settings survive.
        $arguments = @('up', '--timeout=120s')
        if ($State -in @('NeedsLogin', 'NoState')) {
            if ($Config.tailscaleAuthKey -notlike 'tskey-auth-*') { throw 'Set tailscaleAuthKey to a valid Tailscale auth key.' }
            $directory = New-PrivateTempDirectory
            $keyPath = Join-Path $directory 'auth-key'
            [IO.File]::WriteAllText($keyPath, $Config.tailscaleAuthKey, (New-Object Text.UTF8Encoding($false)))
            $arguments += '--auth-key=file:' + $keyPath
            Write-Host 'Authenticating this computer with Tailscale...'
        }
        & $Cli @arguments
        if ($LASTEXITCODE -ne 0) { throw 'Tailscale could not connect. Check key expiry, reuse settings and device approval.' }
    }
    finally { if ($directory) { Remove-Item -LiteralPath $directory -Recurse -Force } }
}

function Invoke-TailscaleSetup {
    param([object]$Config)
    if (-not (Test-Administrator)) { throw 'The internal setup phase requires administrator access.' }
    $cli = Find-Tailscale
    if (-not $cli) { Install-Tailscale; $cli = Find-Tailscale }
    if (-not $cli) { throw 'Tailscale was installed but tailscale.exe was not found.' }
    Set-Service -Name Tailscale -StartupType Automatic
    Start-Service -Name Tailscale
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    do {
        $state = Get-TailscaleState $cli
        if ($state -and $state -ne 'Starting') { break }
        if ([DateTime]::UtcNow -ge $deadline) { throw 'Tailscale did not start. Restart Windows and rerun the launcher.' }
        Start-Sleep -Seconds 2
    } while ($true)
    switch ($state) {
        'Running' { }
        'NeedsLogin' { Invoke-TailscaleUp $cli $Config $state }
        'NoState' { Invoke-TailscaleUp $cli $Config $state }
        'Stopped' { Invoke-TailscaleUp $cli $Config $state }
        'NeedsMachineAuth' { throw 'Approve this computer in the Tailscale admin console, then rerun the launcher.' }
        default { throw "Tailscale is in an unsupported state: $state. Open Tailscale and resolve it, then rerun the launcher." }
    }
    & $cli set --unattended=true
    if ($LASTEXITCODE -ne 0) { throw 'Could not enable unattended mode in Tailscale.' }
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    while ((Get-TailscaleState $cli) -ne 'Running') {
        if ((Get-TailscaleState $cli) -eq 'NeedsMachineAuth') { throw 'Approve this computer in the Tailscale admin console, then rerun the launcher.' }
        if ([DateTime]::UtcNow -ge $deadline) { throw 'Tailscale did not connect within two minutes. Check connectivity and device approval.' }
        Start-Sleep -Seconds 2
    }
}

function Wait-SmbPort {
    param([string]$Server)
    Write-Host "Waiting for $Server to accept SMB connections..."
    $deadline = [DateTime]::UtcNow.AddSeconds(120)
    do {
        $client = New-Object Net.Sockets.TcpClient
        try {
            $connection = $client.ConnectAsync($Server, 445)
            if ($connection.Wait(3000) -and $client.Connected) { return }
        }
        catch { }
        finally { $client.Dispose() }
        Start-Sleep -Seconds 2
    } while ([DateTime]::UtcNow -lt $deadline)
    throw "Cannot reach $Server on port 445. Check the NAS is online, the current tailnet can reach it, and Tailscale / NAS firewall rules allow SMB."
}

function Mount-NasDrive {
    param([object]$Config, [string]$Drive)
    $remotePath = '\\' + $Config.nasHost + '\' + $Config.shareName
    $mapping = @(Get-SmbMapping | Where-Object { $_.LocalPath -eq $Drive })
    if ($mapping.Count -gt 0) {
        if ($mapping[0].RemotePath.TrimEnd('\') -ne $remotePath) { throw "$Drive already maps to another share. Choose a different windowsDrive or use -DriveLetter." }
        if (Test-Path -LiteralPath ($Drive + '\')) { Write-Host "$Drive is already connected to $remotePath."; return }
        # Repair only this share's disconnected mapping; preserve other connections.
        Remove-SmbMapping -LocalPath $Drive -UpdateProfile -Confirm:$false
    }
    elseif (Get-PSDrive -Name $Drive.Substring(0, 1) -ErrorAction SilentlyContinue) {
        throw "$Drive is already in use. Choose a different windowsDrive or use -DriveLetter."
    }
    New-SmbMapping -LocalPath $Drive -RemotePath $remotePath -UserName $Config.smbUsername -Password $Config.smbPassword -Persistent $true -SaveCredentials | Out-Null
    if (-not (Test-Path -LiteralPath ($Drive + '\'))) { throw "$Drive was mapped but its root could not be opened. Check NAS permissions." }
    Write-Host "Connected. Open $Drive in File Explorer ($remotePath)."
}

function Invoke-NasConnect {
    if ($env:OS -ne 'Windows_NT') { throw 'Use connect-mac.command on macOS.' }
    $config = Read-NasConfig $ConfigPath
    $resolvedPath = (Resolve-Path -LiteralPath $ConfigPath).ProviderPath
    $drive = $config.windowsDrive.ToUpperInvariant()
    if ($DriveLetter) { $drive = $DriveLetter.TrimEnd(':').ToUpperInvariant() + ':' }
    if ($DryRun) {
        Write-Host "Settings valid: \\$($config.nasHost)\$($config.shareName), user $($config.smbUsername), drive $drive."
        if (Find-Tailscale) { Write-Host 'Tailscale found; it will be reused.' }
        else { Write-Host 'Tailscale will be installed from the official package server.' }
        Write-Host 'Dry run complete. No software installed, login attempted or drive mapped.'
        return
    }
    if ($SetupOnly) { Invoke-TailscaleSetup $config; return }
    if (Test-Administrator) { throw 'Run connect-windows.cmd normally, without Run as administrator, so the drive appears in File Explorer. The setup phase elevates separately.' }
    $cli = Find-Tailscale
    $state = ''
    if ($cli) { $state = Get-TailscaleState $cli }
    if ($state -ne 'Running') {
        Write-Host 'Preparing Tailscale. Windows will ask for administrator approval.'
        # Only paths cross UAC. Mapping remains in the original user's session.
        $arguments = @('-NoLogo', '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', ('"{0}"' -f $PSCommandPath), '-ConfigPath', ('"{0}"' -f $resolvedPath), '-SetupOnly')
        $process = Start-Process -FilePath "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -ArgumentList $arguments -Verb RunAs -Wait -PassThru
        if ($process.ExitCode -ne 0) { throw 'Tailscale setup failed. See the setup window for the error, correct it and rerun the launcher.' }
        $cli = Find-Tailscale
        if (-not $cli -or (Get-TailscaleState $cli) -ne 'Running') { throw 'Tailscale setup finished but this computer is not connected.' }
    }
    else { Write-Host 'Tailscale is already connected; reusing its current login.' }
    Wait-SmbPort $config.nasHost
    Mount-NasDrive $config $drive
}

# Dot-sourcing exposes functions for offline verification without executing them.
if ($MyInvocation.InvocationName -ne '.') {
    try { Invoke-NasConnect }
    catch {
        $message = $_.Exception.Message
        try {
            $privateConfig = Read-NasConfig $ConfigPath
            foreach ($secret in @($privateConfig.tailscaleAuthKey, $privateConfig.smbPassword)) {
                if ($secret) { $message = $message.Replace($secret, '[redacted]') }
            }
        }
        catch { }
        [Console]::Error.WriteLine('Error: ' + $message)
        if ($SetupOnly) { [void](Read-Host 'Press Enter to close the setup window') }
        exit 1
    }
}
