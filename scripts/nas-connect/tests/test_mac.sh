#!/bin/bash
# Offline checks: no real Tailscale, administrator or NAS operations.
set -euo pipefail
TEST_SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/nasa-connect-tests.XXXXXXXX")"
trap 'rm -rf -- "$TEST_ROOT"' EXIT
export TEST_SCRIPT_DIR TEST_ROOT
cat > "$TEST_ROOT/config.json" <<'JSON'
{"tailscaleAuthKey":"tskey-auth-offline-test-only","nasHost":"100.64.217.109","shareName":"nasa","smbUsername":"nasa","smbPassword":"dummy-password","windowsDrive":"N:"}
JSON
passed=0
check() { passed=$((passed + 1)); printf 'ok %d - %s\n' "$passed" "$1"; }

bash -n "$TEST_SCRIPT_DIR/connect-mac.command"
/usr/bin/osacompile -o "$TEST_ROOT/mount.scpt" "$TEST_SCRIPT_DIR/mount-share.applescript"
check 'Bash and AppleScript parse'

output="$(bash "$TEST_SCRIPT_DIR/connect-mac.command" --config "$TEST_ROOT/config.json" --dry-run)"
[[ "$output" == *'Settings valid'* && "$output" == *'Dry run complete'* ]]
[[ "$output" != *'dummy-password'* && "$output" != *'tskey-auth-offline-test-only'* ]]
check 'Dry runs validate settings without displaying credentials'

/usr/bin/plutil -replace smbPassword -string '' -o "$TEST_ROOT/invalid.json" "$TEST_ROOT/config.json"
if bash "$TEST_SCRIPT_DIR/connect-mac.command" --config "$TEST_ROOT/invalid.json" --dry-run > "$TEST_ROOT/error" 2>&1; then exit 1; fi
check 'Empty passwords are rejected before setup'

bash <<'BASH'
source "$TEST_SCRIPT_DIR/connect-mac.command"
CONFIG_PATH="$TEST_ROOT/config.json"
load_config
get_backend_state() { printf Running; }
run_ts() { die 'An existing login must not be replaced.'; }
AUTH_KEY=''
connect_tailscale
BASH
check 'Connected clients reuse their login without a key'

printf NeedsLogin > "$TEST_ROOT/state"
bash <<'BASH'
source "$TEST_SCRIPT_DIR/connect-mac.command"
trap cleanup EXIT
CONFIG_PATH="$TEST_ROOT/config.json"
load_config
get_backend_state() { cat "$TEST_ROOT/state"; }
run_ts() {
    [[ "$1" == up && "$2" == --auth-key=file:* && "$3" == --timeout=120s ]] || die 'Incorrect login arguments.'
    local key_path="${2#--auth-key=file:}"
    [[ "$(cat "$key_path")" == tskey-auth-offline-test-only ]] || die 'Incorrect key file contents.'
    [[ "$(/usr/bin/stat -f '%Lp' "$key_path")" == 600 ]] || die 'Key file permissions are not private.'
    printf '%s' "$key_path" > "$TEST_ROOT/key-path"
    printf Running > "$TEST_ROOT/state"
}
connect_tailscale
[[ ! -e "$(cat "$TEST_ROOT/key-path")" ]]
BASH
check 'New logins use and delete a protected auth-key file'

printf NeedsLogin > "$TEST_ROOT/state"
if bash > "$TEST_ROOT/failed-auth" 2>&1 <<'BASH'
source "$TEST_SCRIPT_DIR/connect-mac.command"
trap cleanup EXIT
CONFIG_PATH="$TEST_ROOT/config.json"
load_config
get_backend_state() { cat "$TEST_ROOT/state"; }
run_ts() { printf '%s' "${2#--auth-key=file:}" > "$TEST_ROOT/failed-key-path"; return 1; }
connect_tailscale
BASH
then exit 1; fi
[[ ! -e "$(cat "$TEST_ROOT/failed-key-path")" ]]
check 'Failed logins report an error and clean temporary credentials'

mkdir -p "$TEST_ROOT/Fake.app/Contents/MacOS"
printf '{"CFBundleIdentifier":"io.tailscale.ipn.macos"}' > "$TEST_ROOT/Fake.app/Contents/Info.plist"
bash <<'BASH'
source "$TEST_SCRIPT_DIR/connect-mac.command"
GUI_CLIENT=1
TAILSCALE="$TEST_ROOT/Fake.app/Contents/MacOS/Tailscale"
[[ "$(auth_temp_parent)" == "$HOME/Library/Containers/io.tailscale.ipn.macos/Data/tmp" ]]
BASH
check 'The App Store client uses its own readable app container'

printf Stopped > "$TEST_ROOT/state"
bash <<'BASH'
source "$TEST_SCRIPT_DIR/connect-mac.command"
get_backend_state() { cat "$TEST_ROOT/state"; }
run_ts() {
    [[ "$#" == 2 && "$1" == up && "$2" == --timeout=120s ]] || die 'A stopped login consumed a new key.'
    printf Running > "$TEST_ROOT/state"
}
AUTH_KEY='expired-key-must-not-be-used'
connect_tailscale
BASH
check 'Stopped clients resume without consuming another key'

bash <<'BASH'
source "$TEST_SCRIPT_DIR/connect-mac.command"
run_ts() { printf 'not JSON'; return 1; }
[[ -z "$(get_backend_state)" ]]
run_ts() { printf '{"BackendState":"NeedsLogin"}'; return 1; }
[[ "$(get_backend_state)" == NeedsLogin ]]
BASH
check 'Status accepts login-required exit codes and rejects invalid JSON'

bash <<'BASH'
source "$TEST_SCRIPT_DIR/connect-mac.command"
NAS_HOST=100.64.217.109
SHARE_NAME=nasa
list_smb_mounts() { printf '//other@100.64.217.108/nasa on /Volumes/nasa (smbfs)\n'; }
if is_share_mounted; then exit 1; fi
list_smb_mounts() { printf '//nasa@100.64.217.109/nasa on /Volumes/nasa (smbfs)\n'; }
is_share_mounted
list_smb_mounts() { printf '//nasa@100.64.217.109/nasa-other on /Volumes/nasa-other (smbfs)\n'; }
if is_share_mounted; then exit 1; fi
BASH
check 'Existing mounts must match the correct server and share'

if bash > "$TEST_ROOT/offline" 2>&1 <<'BASH'
source "$TEST_SCRIPT_DIR/connect-mac.command"
NAS_HOST=100.64.217.109
smb_port_open() { return 1; }
sleep() { SECONDS=$((SECONDS + 121)); }
wait_for_smb
BASH
then exit 1; fi
check 'Unreachable NAS connections time out before mounting'
printf '%s Mac offline checks passed.\n' "$passed"
