#!/bin/bash
# Run as the signed-in user. Only installation / headless Tailscale uses sudo.
set +x
set -euo pipefail
umask 077

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_PATH="$SCRIPT_DIR/nas-config.local.json"
WORK_DIR=""
AUTH_WORK_DIR=""
TAILSCALE=""
GUI_CLIENT=0

log() { printf '%s\n' "$*"; }
die() { printf 'Error: %s\n' "$*" >&2; exit 1; }
cleanup() {
    if [[ -n "$AUTH_WORK_DIR" ]]; then rm -rf -- "$AUTH_WORK_DIR"; fi
    if [[ -n "$WORK_DIR" ]]; then rm -rf -- "$WORK_DIR"; fi
}
setting() { /usr/bin/plutil -extract "$1" raw -expect string -o - "$CONFIG_PATH" 2>/dev/null; }

load_config() {
    [[ -f "$CONFIG_PATH" ]] || die "Copy nas-config.example.json to nas-config.local.json and fill in the credentials."
    CONFIG_PATH="$(cd -- "$(dirname -- "$CONFIG_PATH")" && pwd)/$(basename -- "$CONFIG_PATH")"
    /usr/bin/plutil -convert xml1 -o /dev/null "$CONFIG_PATH" >/dev/null 2>&1 || die "The settings file is not valid JSON."
    NAS_HOST="$(setting nasHost)" || die "nasHost must be a string."
    SHARE_NAME="$(setting shareName)" || die "shareName must be a string."
    SMB_USERNAME="$(setting smbUsername)" || die "smbUsername must be a string."
    SMB_PASSWORD="$(setting smbPassword)" || die "smbPassword must be a string."
    AUTH_KEY="$(setting tailscaleAuthKey)" || die "tailscaleAuthKey must be a string."
    [[ "$NAS_HOST" =~ ^[A-Za-z0-9][A-Za-z0-9.-]*$ ]] || die "nasHost must be an IP address or hostname."
    [[ "$SHARE_NAME" =~ ^[A-Za-z0-9._-]+$ ]] || die "shareName must be a single share name using letters, digits, dots, underscores or hyphens."
    [[ -n "$SMB_USERNAME" && -n "$SMB_PASSWORD" ]] || die "smbUsername and smbPassword must not be empty."
}

ensure_work_dir() {
    if [[ -z "$WORK_DIR" ]]; then
        WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/nasa-connect.XXXXXXXX")"
        chmod 700 "$WORK_DIR"
    fi
}

auth_temp_parent() {
    local bundle_id
    if [[ "$GUI_CLIENT" -eq 1 ]]; then
        bundle_id="$(/usr/bin/plutil -extract CFBundleIdentifier raw -o - "${TAILSCALE%/MacOS/Tailscale}/Info.plist" 2>/dev/null)" || return 1
        if [[ "$bundle_id" == io.tailscale.ipn.macos ]]; then
            # The App Store binary can read its own container, but not Terminal's TMPDIR.
            printf '%s' "$HOME/Library/Containers/$bundle_id/Data/tmp"
            return
        fi
    fi
    printf '%s' "${TMPDIR:-/tmp}"
}

create_auth_file() {
    local parent
    parent="$(auth_temp_parent)" || die "Could not determine Tailscale's private temporary folder."
    mkdir -p "$parent" || die "Cannot access Tailscale's private temporary folder. Allow your terminal to access Tailscale's app data if macOS asks."
    AUTH_WORK_DIR="$(mktemp -d "$parent/nasa-connect.XXXXXXXX")" || die "Cannot create a private key file in Tailscale's temporary folder."
    chmod 700 "$AUTH_WORK_DIR"
    printf '%s' "$AUTH_KEY" > "$AUTH_WORK_DIR/auth-key"
    chmod 600 "$AUTH_WORK_DIR/auth-key"
}

download() {
    /usr/bin/curl --fail --silent --show-error --location --proto '=https' \
        --tlsv1.2 --connect-timeout 15 --max-time 300 --retry 2 "$1" -o "$2"
}

find_tailscale() {
    local candidate
    GUI_CLIENT=0
    for candidate in /Applications/Tailscale.app/Contents/MacOS/Tailscale \
        "$HOME/Applications/Tailscale.app/Contents/MacOS/Tailscale"; do
        if [[ -x "$candidate" ]]; then TAILSCALE="$candidate"; GUI_CLIENT=1; return 0; fi
    done
    for candidate in "$(command -v tailscale || true)" /opt/homebrew/bin/tailscale /usr/local/bin/tailscale; do
        if [[ -n "$candidate" && -x "$candidate" ]]; then TAILSCALE="$candidate"; return 0; fi
    done
    return 1
}

install_tailscale() {
    local name package expected actual signature
    ensure_work_dir
    log "Downloading the current stable Tailscale installer..."
    download 'https://pkgs.tailscale.com/stable/?mode=json' "$WORK_DIR/packages.json"
    name="$(/usr/bin/plutil -extract MacZips.universal-package raw -expect string -o - "$WORK_DIR/packages.json")"
    [[ "$name" =~ ^Tailscale-[0-9.]+-macos\.pkg$ ]] || die "Unexpected macOS package name."
    package="$WORK_DIR/$name"
    download "https://pkgs.tailscale.com/stable/$name" "$package"
    download "https://pkgs.tailscale.com/stable/$name.sha256" "$WORK_DIR/package.sha256"
    expected="$(awk 'NR == 1 {print $1; exit}' "$WORK_DIR/package.sha256")"
    actual="$(/usr/bin/shasum -a 256 "$package" | awk '{print $1}')"
    [[ "$expected" =~ ^[a-fA-F0-9]{64}$ && "$expected" == "$actual" ]] || die "The installer checksum does not match."
    signature="$(/usr/sbin/pkgutil --check-signature "$package")" || die "The installer signature is invalid."
    [[ "$signature" == *'Developer ID Installer: Tailscale Inc.'* ]] || die "The installer is not signed by Tailscale Inc."
    /usr/sbin/spctl --assess --type install "$package" || die "macOS did not accept the installer signature."
    log "Installing Tailscale. Enter your Mac administrator password if asked."
    sudo /usr/sbin/installer -pkg "$package" -target /
    find_tailscale || die "Tailscale was installed but its command-line tool was not found."
    /usr/bin/open -gj "${TAILSCALE%/Contents/MacOS/Tailscale}"
    log "Approve Tailscale's network extension / VPN in System Settings if macOS asks."
    run_ts configure sysext activate || true
    run_ts configure mac-vpn install || true
}

run_ts() {
    if [[ "$GUI_CLIENT" -eq 1 ]]; then TAILSCALE_BE_CLI=1 "$TAILSCALE" "$@"
    else sudo "$TAILSCALE" "$@"; fi
}

get_backend_state() {
    local json state
    json="$(run_ts status --json 2>/dev/null || true)"
    state="$(printf '%s' "$json" | /usr/bin/plutil -extract BackendState raw -expect string -o - - 2>/dev/null)" || return 0
    printf '%s' "$state"
}

start_client() {
    local daemon candidate
    if [[ "$GUI_CLIENT" -eq 1 ]]; then
        /usr/bin/open -gj "${TAILSCALE%/Contents/MacOS/Tailscale}"
    else
        sudo -v
        if [[ -z "$(get_backend_state)" ]]; then
            daemon=""
            for candidate in "$(dirname -- "$TAILSCALE")/tailscaled" /opt/homebrew/bin/tailscaled /usr/local/bin/tailscaled; do
                if [[ -x "$candidate" ]]; then daemon="$candidate"; break; fi
            done
            [[ -n "$daemon" ]] || die "The installed CLI needs tailscaled. Install the complete Tailscale client and try again."
            sudo "$daemon" install-system-daemon
        fi
    fi
}

connect_tailscale() {
    local state deadline
    deadline=$((SECONDS + 120))
    state="$(get_backend_state)"
    while [[ -z "$state" || "$state" == Starting ]]; do
        (( SECONDS < deadline )) || die "Tailscale did not start. Check its network extension / VPN approval in System Settings, then rerun this script."
        sleep 2
        state="$(get_backend_state)"
    done
    case "$state" in
        Running) log "Tailscale is already connected; reusing its current login." ;;
        NeedsLogin|NoState)
            [[ "$AUTH_KEY" == tskey-auth-* ]] || die "Set tailscaleAuthKey to a valid Tailscale auth key."
            log "Authenticating this Mac with Tailscale..."
            create_auth_file
            if ! run_ts up "--auth-key=file:$AUTH_WORK_DIR/auth-key" --timeout=120s; then
                rm -rf -- "$AUTH_WORK_DIR"
                AUTH_WORK_DIR=""
                die "Tailscale authentication failed. Check key expiry, reuse settings and device approval."
            fi
            rm -rf -- "$AUTH_WORK_DIR"
            AUTH_WORK_DIR=""
            ;;
        Stopped) run_ts up --timeout=120s ;;
        NeedsMachineAuth) die "Approve this computer in the Tailscale admin console, then rerun the script." ;;
        *) die "Tailscale is in an unsupported state: $state. Open Tailscale and resolve it, then rerun the script." ;;
    esac
    deadline=$((SECONDS + 120))
    while [[ "$(get_backend_state)" != Running ]]; do
        [[ "$(get_backend_state)" != NeedsMachineAuth ]] || die "Approve this computer in the Tailscale admin console, then rerun the script."
        (( SECONDS < deadline )) || die "Tailscale did not connect within two minutes. Check connectivity and device approval."
        sleep 2
    done
}

smb_port_open() { /usr/bin/nc -z -G 3 -w 3 "$NAS_HOST" 445 >/dev/null 2>&1; }
wait_for_smb() {
    local deadline=$((SECONDS + 120))
    log "Waiting for $NAS_HOST to accept SMB connections..."
    until smb_port_open; do
        (( SECONDS < deadline )) || die "Cannot reach $NAS_HOST on port 445. Check the NAS is online, the current tailnet can reach it, and Tailscale / NAS firewall rules allow SMB."
        sleep 2
    done
}

list_smb_mounts() { /sbin/mount -t smbfs; }
is_share_mounted() {
    local line
    while IFS= read -r line; do
        case "$line" in
            *"@$NAS_HOST/$SHARE_NAME on "*|"//$NAS_HOST/$SHARE_NAME on "*) return 0 ;;
        esac
    done < <(list_smb_mounts)
    return 1
}

mount_share() {
    if is_share_mounted; then log "The NASA share is already mounted."; return; fi
    log "Mounting smb://$NAS_HOST/$SHARE_NAME as $SMB_USERNAME..."
    if ! NASA_CONNECT_CONFIG="$CONFIG_PATH" /usr/bin/osascript "$SCRIPT_DIR/mount-share.applescript" >/dev/null 2>&1; then
        die "macOS could not mount the share. Check NAS credentials / permissions and try Finder > Go > Connect to Server."
    fi
    is_share_mounted || die "The SMB mount was not found after connecting. Check Finder and the NAS permissions."
    log "Connected. Open Finder > Locations > $SHARE_NAME (normally /Volumes/$SHARE_NAME)."
}

main() {
    local dry_run=0
    trap cleanup EXIT
    trap 'exit 130' INT
    trap 'exit 143' TERM
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --config) [[ $# -gt 1 ]] || die "--config needs a file path."; CONFIG_PATH="$2"; shift 2 ;;
            --dry-run) dry_run=1; shift ;;
            -h|--help) log "Usage: $0 [--config /path/to/nas-config.local.json] [--dry-run]"; return 0 ;;
            *) die "Unknown option: $1" ;;
        esac
    done
    [[ "$(uname -s)" == Darwin ]] || die "Use connect-windows.cmd on Windows."
    load_config
    if [[ "$dry_run" -eq 1 ]]; then
        log "Settings valid: smb://$NAS_HOST/$SHARE_NAME, user $SMB_USERNAME."
        if find_tailscale; then log "Tailscale found; it will be reused."; else log "Tailscale will be installed from the official package server."; fi
        log "Dry run complete. No software installed, login attempted or share mounted."
        return 0
    fi
    [[ "$EUID" -ne 0 ]] || die "Run as your normal signed-in user, without sudo. The script requests administrator access where needed."
    chmod 600 "$CONFIG_PATH"
    if ! find_tailscale; then install_tailscale; fi
    start_client
    connect_tailscale
    wait_for_smb
    mount_share
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
