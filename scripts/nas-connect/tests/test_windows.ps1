# Offline checks, runnable in Windows PowerShell 5.1 or portable pwsh on macOS.
# Native installation, ACL changes and network operations are replaced by fakes.
$ErrorActionPreference = 'Stop'
$entry = Join-Path (Split-Path $PSScriptRoot -Parent) 'Connect-Nas.ps1'
. $entry
$testRoot = Join-Path ([IO.Path]::GetTempPath()) ('nasa verification ' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $testRoot | Out-Null
$script:Checks = 0
function Assert([bool]$Condition, [string]$Message) { if (-not $Condition) { throw $Message } }
function Check([string]$Message) { $script:Checks++; Write-Host "ok $script:Checks - $Message" }
function Assert-Throws([scriptblock]$Action, [string]$Expected) {
    $caught = $false
    try { & $Action }
    catch { $caught = $true; Assert ($_.Exception.Message -like ('*' + $Expected + '*')) ('Unexpected error: ' + $_.Exception.Message) }
    Assert $caught 'Expected an error, but the action succeeded.'
}

try {
    $ConfigPath = Join-Path $testRoot 'settings with spaces.json'
    $fixture = [ordered]@{
        tailscaleAuthKey = 'tskey-auth-offline-test-only'
        nasHost = '100.64.217.109'
        shareName = 'nasa'
        smbUsername = 'nasa'
        smbPassword = 'dummy-password'
        windowsDrive = 'N:'
    }
    $fixture | ConvertTo-Json | Set-Content -LiteralPath $ConfigPath -Encoding UTF8
    $config = Read-NasConfig $ConfigPath
    Assert ($config.smbUsername -eq 'nasa' -and $config.windowsDrive -eq 'N:') 'Valid settings were rejected.'
    Check 'Valid settings and paths with spaces are accepted'

    $badPath = Join-Path $testRoot 'bad.json'
    $fixture.smbPassword = ''
    $fixture | ConvertTo-Json | Set-Content -LiteralPath $badPath -Encoding UTF8
    Assert-Throws { Read-NasConfig $badPath } 'must not be empty'
    $fixture.smbPassword = 42
    $fixture | ConvertTo-Json | Set-Content -LiteralPath $badPath -Encoding UTF8
    Assert-Throws { Read-NasConfig $badPath } 'string'
    Check 'Empty and non-string passwords are rejected'

    $script:State = 'NeedsLogin'
    $script:FakeExit = 0
    $script:LastKeyPath = $null
    $script:LastArgs = @()
    $script:UnattendedSet = $false
    function New-PrivateTempDirectory {
        $path = Join-Path $testRoot ('private ' + [Guid]::NewGuid().ToString('N'))
        New-Item -ItemType Directory -Path $path | Out-Null
        return $path
    }
    function Fake-Tailscale {
        $script:LastArgs = @($args)
        if ($args[0] -eq 'status') {
            $global:LASTEXITCODE = 1
            return ('{"BackendState":"' + $script:State + '"}')
        }
        foreach ($argument in $args) {
            if ($argument -like '--auth-key=file:*') {
                $script:LastKeyPath = $argument.Substring('--auth-key=file:'.Length)
                Assert ([IO.File]::ReadAllText($script:LastKeyPath) -eq 'tskey-auth-offline-test-only') 'Incorrect key file contents.'
            }
            Assert ($argument -notlike '*tskey-auth-offline*') 'The auth key appeared in command arguments.'
        }
        $global:LASTEXITCODE = $script:FakeExit
        if ($script:FakeExit -eq 0 -and $args[0] -eq 'up') { $script:State = 'Running' }
        if ($args[0] -eq 'set' -and $args -contains '--unattended=true') { $script:UnattendedSet = $true }
    }
    Assert ((Get-TailscaleState 'Fake-Tailscale') -eq 'NeedsLogin') 'Nonzero status exit codes should still return JSON state.'
    Check 'Status reads unauthenticated clients with nonzero exit codes'

    Invoke-TailscaleUp 'Fake-Tailscale' $config 'NeedsLogin'
    Assert ($script:LastArgs -notcontains '--unattended=true') 'up must not reset saved preferences.'
    Assert ($script:LastKeyPath -and -not [IO.File]::Exists($script:LastKeyPath)) 'Temporary key file was not removed.'
    Check 'New logins use a temporary file without credentials in arguments'

    $script:FakeExit = 1
    Assert-Throws { Invoke-TailscaleUp 'Fake-Tailscale' $config 'NeedsLogin' } 'could not connect'
    Assert (-not [IO.File]::Exists($script:LastKeyPath)) 'Failed authentication left a key file behind.'
    $script:FakeExit = 0
    Check 'Failed logins report errors and clean temporary credentials'

    $script:LastKeyPath = $null
    $config.tailscaleAuthKey = ''
    Invoke-TailscaleUp 'Fake-Tailscale' $config 'Stopped'
    Assert (-not $script:LastKeyPath) 'A stopped client tried to consume a new key.'
    Assert-Throws { Invoke-TailscaleUp 'Fake-Tailscale' $config 'NeedsLogin' } 'valid Tailscale auth key'
    Check 'Saved logins resume without a key while new logins require one'

    function Find-Tailscale { return 'Fake-Tailscale' }
    function Test-Administrator { return $true }
    function Set-Service { param($Name, $StartupType); $script:ServiceMode = $StartupType }
    function Start-Service { param($Name); $script:ServiceStarted = ($Name -eq 'Tailscale') }
    $script:State = 'Stopped'
    Invoke-TailscaleSetup $config
    Assert ($script:UnattendedSet -and $script:ServiceStarted -and $script:ServiceMode -eq 'Automatic') 'Setup did not start the service and enable unattended mode.'
    Assert (-not $script:LastKeyPath) 'Setup replaced a saved login.'
    Check 'Setup resumes the saved login and enables unattended mode separately'

    $script:State = 'NeedsMachineAuth'
    Assert-Throws { Invoke-TailscaleSetup $config } 'Approve this computer'
    Check 'Device approval requirements produce an actionable error'

    $script:Mappings = @()
    $script:DriveInUse = $false
    $script:ShareAccessible = $false
    $script:NewMappings = @()
    $script:RemovedMappings = @()
    function Get-SmbMapping { return $script:Mappings }
    function Get-PSDrive { param($Name, $ErrorAction); if ($script:DriveInUse) { return [pscustomobject]@{Name=$Name} } }
    function Test-Path {
        param([string]$LiteralPath, [string]$PathType)
        if ($LiteralPath -eq 'N:\') { return $script:ShareAccessible }
        return Microsoft.PowerShell.Management\Test-Path -LiteralPath $LiteralPath
    }
    function New-SmbMapping {
        param($LocalPath, $RemotePath, $UserName, $Password, [bool]$Persistent, [switch]$SaveCredentials)
        $script:NewMappings += [pscustomobject]@{LocalPath=$LocalPath;RemotePath=$RemotePath;UserName=$UserName;Password=$Password;Persistent=$Persistent;SaveCredentials=[bool]$SaveCredentials}
        $script:ShareAccessible = $true
    }
    function Remove-SmbMapping { param($LocalPath, [switch]$UpdateProfile, [switch]$Confirm); $script:RemovedMappings += $LocalPath }

    Mount-NasDrive $config 'N:'
    Assert ($script:NewMappings.Count -eq 1) 'A drive was not mapped.'
    Assert ($script:NewMappings[0].RemotePath -eq '\\100.64.217.109\nasa') 'Incorrect UNC path.'
    Assert ($script:NewMappings[0].Persistent -and $script:NewMappings[0].SaveCredentials) 'The mapping must persist with saved credentials.'
    Assert ($script:NewMappings[0].UserName -eq 'nasa' -and $script:NewMappings[0].Password -eq 'dummy-password') 'Incorrect SMB credentials.'
    Check 'New drives use the requested share and persistent SMB credentials'

    $script:Mappings = @([pscustomobject]@{LocalPath='N:';RemotePath='\\other-server\other-share'})
    Assert-Throws { Mount-NasDrive $config 'N:' } 'another share'
    Assert ($script:RemovedMappings.Count -eq 0 -and $script:NewMappings.Count -eq 1) 'An unrelated share was changed.'
    $script:Mappings = @()
    $script:DriveInUse = $true
    Assert-Throws { Mount-NasDrive $config 'N:' } 'already in use'
    $script:DriveInUse = $false
    Check 'Other shares and local drives are never overwritten'

    $script:Mappings = @([pscustomobject]@{LocalPath='N:';RemotePath='\\100.64.217.109\nasa'})
    Mount-NasDrive $config 'N:'
    Assert ($script:NewMappings.Count -eq 1) 'An already connected drive was remapped.'
    $script:ShareAccessible = $false
    Mount-NasDrive $config 'N:'
    Assert ($script:RemovedMappings.Count -eq 1 -and $script:NewMappings.Count -eq 2) 'A disconnected matching mapping was not repaired.'
    Check 'Connected mappings are reused and matching disconnected ones repaired'

    function Find-Tailscale { return 'Fake-Tailscale' }
    function Test-Administrator { return $false }
    function Wait-SmbPort { param($Server); $script:WaitedFor = $Server }
    function Mount-NasDrive { param($Config, $Drive); $script:MappedDrive = $Drive }
    function Start-Process { throw 'A connected client must not be elevated or reauthenticated.' }
    $script:State = 'Running'
    $originalOs = $env:OS
    $env:OS = 'Windows_NT'
    try {
        $DryRun = $false
        $SetupOnly = $false
        $DriveLetter = 'M'
        Invoke-NasConnect
        Assert ($script:WaitedFor -eq '100.64.217.109' -and $script:MappedDrive -eq 'M:') 'Normal flow did not wait for SMB and map the overridden drive.'
        Check 'Connected clients map in the original user session without elevation'

        function Start-Process {
            param($FilePath, $ArgumentList, $Verb, [switch]$Wait, [switch]$PassThru)
            Assert ($Verb -eq 'RunAs' -and $Wait) 'Setup must elevate and finish before mapping.'
            Assert ($ArgumentList -contains '-SetupOnly') 'Elevation must be limited to setup.'
            $joined = $ArgumentList -join ' '
            Assert ($joined -like '*Connect-Nas.ps1*' -and $joined -like '*settings with spaces.json*') 'The entry script / settings path was not passed through UAC.'
            Assert ($joined -notlike '*tskey-auth-*' -and $joined -notlike '*dummy-password*') 'Credentials appeared in elevation arguments.'
            $script:State = 'Running'
            return [pscustomobject]@{ExitCode=0}
        }
        $script:State = 'Stopped'
        Invoke-NasConnect
        Check 'Only setup elevates and UAC receives paths instead of credentials'
    }
    finally { $env:OS = $originalOs }
    Write-Host "$script:Checks Windows offline checks passed."
}
finally { Remove-Item -LiteralPath $testRoot -Recurse -Force }
