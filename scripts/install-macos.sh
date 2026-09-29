#!/bin/bash
# Installs the latest CornerPet release on an Apple Silicon Mac.
#
#   curl -fsSL https://raw.githubusercontent.com/ask6688/cornerpet/main/scripts/install-macos.sh | bash
#
# The DMG is checked against the SHA-256 digest GitHub publishes for the release
# asset. A command-line download carries no browser quarantine flag, so the
# ad-hoc signed app opens without the "Apple could not verify" prompt.
#
#   --fix      CornerPet.app is already in Applications (dragged from the DMG):
#              only lift the quarantine flag, then open it. No download.
#   --no-open  install without launching.
#
#   CORNERPET_APP_DIR      install location (default /Applications)
#   CORNERPET_RELEASE_API  release JSON (default: latest GitHub release)
set -euo pipefail

say() { printf '[CornerPet] %s\n' "$*"; }
fail() { printf '[CornerPet] %s\n' "$*" >&2; exit 1; }

work=''
mounted=0
cleanup() {
  if [ "$mounted" = 1 ]; then hdiutil detach -quiet "$work/mnt" || hdiutil detach -quiet -force "$work/mnt" || true; fi
  if [ -n "$work" ]; then rm -rf "$work"; fi
}

lift_quarantine() { xattr -dr com.apple.quarantine "$1" 2>/dev/null || true; }

# Replacing the bundle under a running copy would leave it half-updated.
quit_running() {
  local executable="$1/Contents/MacOS/CornerPet" pid
  for pid in $(pgrep -x CornerPet || true); do
    [ "$(ps -o comm= -p "$pid" || true)" = "$executable" ] || continue
    say "先退出正在运行的 CornerPet…"
    kill "$pid" 2>/dev/null || true
    for _ in $(seq 50); do kill -0 "$pid" 2>/dev/null || break; sleep 0.1; done
  done
}

# macOS 13/14 ship no jq; JavaScript for Automation is always there.
read -r -d '' PICK_ASSET <<'JXA' || true
function run(argv) {
  const release = JSON.parse(argv[0]);
  const asset = (release.assets || []).find(item => /-arm64\.dmg$/.test(item.name));
  return asset ? [release.tag_name || '', asset.browser_download_url, asset.digest || ''].join('\n') : '';
}
JXA

install_latest() {
  local app_dir=$1 target=$2
  local api="${CORNERPET_RELEASE_API:-https://api.github.com/repos/ask6688/cornerpet/releases/latest}"
  local release info tag='' url='' digest='' actual

  say "查找最新版本…"
  release=$(curl -fsSL -H 'Accept: application/vnd.github+json' "$api") || fail "读不到发布信息，请检查网络后重试：$api"
  info=$(osascript -l JavaScript -e "$PICK_ASSET" "$release" 2>/dev/null) || fail "发布信息格式无法识别"
  { IFS= read -r tag; IFS= read -r url; IFS= read -r digest; } <<<"$info" || true
  [ -n "$url" ] || fail "最新发布里没有 Apple Silicon 安装包"
  [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "发布信息里没有 SHA-256 校验值，为安全起见停止安装"

  mkdir -p "$app_dir" 2>/dev/null || true
  [ -w "$app_dir" ] || fail "没有写入 $app_dir 的权限。可以改装到自己的应用程序文件夹：curl -fsSL https://raw.githubusercontent.com/ask6688/cornerpet/main/scripts/install-macos.sh | CORNERPET_APP_DIR=\"\$HOME/Applications\" bash"

  work=$(mktemp -d "${TMPDIR:-/tmp}/cornerpet.XXXXXX")
  trap cleanup EXIT
  say "下载 CornerPet ${tag}（约 130 MB）…"
  curl -fL --retry 3 --silent --show-error -o "$work/CornerPet.dmg" "$url" || fail "下载失败，请检查网络后重试"
  actual=$(shasum -a 256 "$work/CornerPet.dmg" | cut -d' ' -f1)
  [ "$actual" = "${digest#sha256:}" ] || fail "安装包校验失败（SHA-256 与发布信息不一致），已停止安装"
  say "SHA-256 校验通过"

  hdiutil attach -quiet -nobrowse -noautoopen -readonly -mountpoint "$work/mnt" "$work/CornerPet.dmg" || fail "打不开安装包"
  mounted=1
  [ -d "$work/mnt/CornerPet.app" ] || fail "安装包里没有 CornerPet.app"
  quit_running "$target"
  rm -rf "$target.installing"
  ditto "$work/mnt/CornerPet.app" "$target.installing"
  lift_quarantine "$target.installing"
  rm -rf "$target"
  mv "$target.installing" "$target"
  say "已安装到 $target"
}

main() {
  local fix=0 open_app=1 arg
  for arg in "$@"; do
    case "$arg" in
      --fix) fix=1 ;;
      --no-open) open_app=0 ;;
      *) fail "未知参数：$arg（可用 --fix、--no-open）" ;;
    esac
  done
  local app_dir="${CORNERPET_APP_DIR:-/Applications}"
  local target="${app_dir%/}/CornerPet.app"

  [ "$(uname -s)" = Darwin ] || fail "CornerPet 桌面版只支持 macOS"
  # hw.optional.arm64 stays 1 even when this shell runs under Rosetta.
  [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ] || fail "CornerPet 目前只支持 Apple Silicon（M 系列芯片）的 Mac，暂不支持 Intel Mac"
  [ "$(sw_vers -productVersion | cut -d. -f1)" -ge 13 ] || fail "CornerPet 需要 macOS 13 或更新版本"

  if [ "$fix" = 1 ]; then
    [ -d "$target" ] || fail "没有在 $app_dir 找到 CornerPet.app，请去掉 --fix 重新运行来安装"
    lift_quarantine "$target"
    say "已解除 $target 的下载隔离"
  else
    install_latest "$app_dir" "$target"
  fi

  if [ "$open_app" = 1 ]; then
    # `open` hands this shell's environment to the app. Editors and AI tools
    # built on Electron export ELECTRON_RUN_AS_NODE=1, which would start
    # CornerPet as a bare Node process that exits at once.
    env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS open "$target"
    say "CornerPet 已打开：菜单栏会出现 ◡，小伙伴在屏幕右下角。回到网页点「带它去桌面」即可。"
  fi
}

# Everything runs from main, so a truncated `curl | bash` download executes nothing.
main "$@"
