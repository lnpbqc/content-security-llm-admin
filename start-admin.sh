#!/usr/bin/env bash
# Linux 管理端启动脚本；用法：PORT=8080 bash start-admin.sh start
# 支持 start（默认）、stop、restart、status、log、fg。
# Windows 换行修复：sed -i 's/\r$//' start-admin.sh
set -euo pipefail

APP_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
PORT="${PORT:-5173}"
PIDFILE="$APP_DIR/.admin/admin.pid"
LOGFILE="$APP_DIR/.admin/admin.log"
VITE_BIN="$APP_DIR/node_modules/vite/bin/vite.js"
cd -- "$APP_DIR"

die() { echo "错误: $*" >&2; exit 1; }

is_running() {
  [ -f "$PIDFILE" ] || return 1
  PID="$(cat "$PIDFILE")"
  [[ "$PID" =~ ^[1-9][0-9]*$ ]] || return 1
  kill -0 "$PID" 2>/dev/null || return 1
  # 防止遗留 PID 文件误停止已复用该 PID 的其他进程。
  [[ "$(ps -p "$PID" -o args=)" == *"$VITE_BIN preview "* ]]
}

prepare() {
  [[ "$PORT" =~ ^[0-9]{1,5}$ ]] && (( 10#$PORT >= 1 && 10#$PORT <= 65535 )) \
    || die "PORT 必须是 1–65535 的整数"
  command -v node >/dev/null 2>&1 || die "请先安装 Node.js 22.18+ 或 24.12+"
  command -v pnpm >/dev/null 2>&1 || die "请先安装 pnpm"
  if [ ! -f "$VITE_BIN" ]; then
    pnpm install --frozen-lockfile --prod=false
  fi
  pnpm build
  mkdir -p "$APP_DIR/.admin"
}

cmd_start() {
  if is_running; then
    echo "已经在运行，PID=$PID；重启请用: bash $0 restart"
    return 0
  fi
  prepare
  echo "启动中，日志: $LOGFILE"
  # 直接启动 Node.js，确保 PID 对应服务本身，而不是 pnpm 的父进程。
  nohup node "$VITE_BIN" preview --host 0.0.0.0 --port "$PORT" --strictPort \
    >>"$LOGFILE" 2>&1 < /dev/null &
  echo "$!" > "$PIDFILE"
  sleep 2
  if is_running; then
    echo "已启动，PID=$PID"
    echo "访问: http://<服务器IP>:$PORT"
  else
    rm -f -- "$PIDFILE"
    tail -n 30 "$LOGFILE"
    die "启动失败，请检查日志"
  fi
}

cmd_stop() {
  if ! is_running; then
    echo "未运行"
    rm -f -- "$PIDFILE"
    return 0
  fi
  echo "停止 PID=$PID ..."
  kill "$PID"
  for ((i = 0; i < 10; i++)); do
    if ! is_running; then
      rm -f -- "$PIDFILE"
      echo "已停止"
      return 0
    fi
    sleep 1
  done
  die "进程尚未退出，保留 PID 文件，请检查日志后重试"
}

cmd_status() {
  if is_running; then
    echo "运行中，PID=$PID"
    ps -p "$PID" -o etime=,args=
  else
    echo "未运行"
  fi
}

case "${1:-start}" in
  start) cmd_start ;;
  stop) cmd_stop ;;
  restart) cmd_stop; cmd_start ;;
  status) cmd_status ;;
  log)
    [ -f "$LOGFILE" ] || die "暂无日志，请先启动服务"
    tail -n 50 -f "$LOGFILE"
    ;;
  fg)
    if is_running; then die "后台服务已运行，PID=$PID，请先停止"; fi
    prepare
    exec node "$VITE_BIN" preview --host 0.0.0.0 --port "$PORT" --strictPort
    ;;
  *) die "用法: bash $0 {start|stop|restart|status|log|fg}；PORT 默认 5173" ;;
esac
