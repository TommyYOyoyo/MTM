# Connect a computer to the NASA NAS

These scripts connect Tailscale, then mount `smb://100.64.217.109/nasa` with NAS
username `nasa`. Windows maps **N:**; Mac mounts **nasa** in Finder, normally at
**/Volumes/nasa**.

## Run

The local `nas-config.local.json` is already filled in with your supplied
credentials. Keep it alongside these scripts when copying this folder privately
to another computer. This settings file is excluded from future Git tracking.
For a fresh checkout, copy `nas-config.example.json` to `nas-config.local.json`
and fill in `tailscaleAuthKey` and `smbPassword`.

- **Mac:** double-click **connect-mac.command**. Enter your Mac administrator
  password for installation if needed. Approve Tailscale's network extension /
  VPN in System Settings if prompted. If approval takes over two minutes, rerun
  the launcher after approving it.
- **Windows:** double-click **connect-windows.cmd** normally. Approve the Windows
  administrator prompt for setup if needed. Drive mapping then runs in your
  signed-in user session, so it appears in File Explorer. Keep the folder on a
  local disk where the setup process can read it.

Run these as the signed-in user, without choosing Run as administrator or using
`sudo` for the main launcher. Only the installation / Tailscale setup phase asks
for administrator access. Current Tailscale installers require macOS 13+, Windows
10+ or Windows Server 2016+. Installation also requires internet access.

## Behavior

1. Validate settings without displaying the password or auth key.
2. Reuse an existing Tailscale installation, or download the current stable
   installer from Tailscale, verify its SHA-256 checksum and publisher signature,
   and install it. Windows selects x64, ARM64 or x86; Mac uses the universal PKG.
3. Reuse an existing connected Tailscale login. Resume a stopped client's saved
   login. For a new login, pass the configured key through a protected temporary
   file and remove it after the attempt.
4. Wait for NAS TCP port 445, then mount / map the share. Existing matching
   mounts are reused. Other shares and occupied drive letters are preserved.

Windows installs Tailscale as an automatic service and enables unattended mode
during setup. An existing connected installation keeps its settings. The SMB
drive mapping is persistent and the supplied NAS credentials are saved by
Windows' SMB credential store. After a restart, opening the drive or rerunning
the launcher reconnects it once Tailscale is online. On Mac, rerun the launcher
after a restart to mount the share again.

The NAS must already be connected to the same tailnet, with SMB enabled and
Tailscale / NAS firewall rules allowing TCP port 445. A client connected to a
different tailnet is not automatically switched; connect it to the NAS's tailnet
in Tailscale and rerun the launcher.

## Options

From a terminal in this folder on Mac:

```sh
./connect-mac.command --dry-run
./connect-mac.command --config /path/to/nas-config.local.json
```

From Windows PowerShell in this folder:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Connect-Nas.ps1 -DryRun
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Connect-Nas.ps1 -DriveLetter M
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\Connect-Nas.ps1 -ConfigPath C:\Internal\nas-config.local.json
```

Dry runs validate settings and look for an installation. They do not download,
install, authenticate, probe the NAS or mount a share. An empty auth key is
allowed when reusing a saved login; a new login needs a valid key.

## Deployment and troubleshooting

- The local settings file contains plaintext credentials. Transfer it privately
  and restrict access to the intended user. The Mac launcher sets owner-only
  permissions. Auth keys and SMB passwords are kept out of command-line arguments.
- A **reusable** auth key is needed to enroll multiple new computers; a single-use
  key can enroll one. Expired / revoked keys need replacement for new logins.
  Device approval or Tailnet Lock can require an administrator action.
- If Windows reports error 1219, close your other connections to this NAS or use
  the same account for them. The scripts leave unrelated SMB connections alone.
- If **N:** is occupied, change `windowsDrive` in the settings or use `-DriveLetter`.
- If Windows requests a restart after installation, restart and rerun the launcher.
- If SMB authentication fails, check that the `nasa` account has access to the
  `nasa` share. These scripts use the OS's existing SMB settings.

## Why Tailscale is installed

Tailscale userspace mode provides SOCKS / HTTP proxies. Finder SMB mounts and
Windows mapped drives need a system network route, so these scripts install a
Tailscale client when missing. An existing CLI-only Mac installation is also
supported; its daemon is started if needed.

References: [userspace networking](https://tailscale.com/docs/concepts/userspace-networking),
[macOS variants](https://tailscale.com/docs/concepts/macos-variants),
[Windows MSI installation](https://tailscale.com/docs/install/windows/msi),
[Tailscale CLI](https://tailscale.com/docs/reference/tailscale-cli),
[Windows SMB mapping](https://learn.microsoft.com/powershell/module/smbshare/new-smbmapping).

## Offline verification

These checks use dummy credentials and simulated commands. They do not install
Tailscale, change its login or contact the NAS.

```sh
bash tests/test_mac.sh
```

```powershell
powershell.exe -NoProfile -File .\tests\test_windows.ps1
```

Mac checks require macOS. PowerShell checks can also run with `pwsh` on Mac for
parsing and simulated behavior; MSI installation, Windows permissions and real
SMB mapping still need a Windows machine.
