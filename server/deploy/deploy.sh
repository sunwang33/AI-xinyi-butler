#!/usr/bin/env bash
# =============================================================================
# 心意管家网关 · 本机一键部署入口（在开发机运行：Git Bash / Linux / macOS）
#
# 用法：
#   1. cp server/deploy/deploy.env.example server/deploy/deploy.env 并填真实值
#   2. bash server/deploy/deploy.sh
#
# 做什么：加载 deploy.env → 校验 → 上传网关代码与模板 → 远程执行幂等的
#         setup-host.sh（装依赖/配置/证书/PM2）→ 本机 https 健康检查。
# 可反复执行：升级代码、改配置后重跑即可，主机侧全程幂等，不影响同机其他站点。
# 前提：目标主机 SSH 可登录；DOMAIN 的 A 记录已指向该机；云安全组放行 80/443。
# =============================================================================
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SERVER_DIR="$(cd "$DEPLOY_DIR/.." && pwd)"
ENV_FILE="$DEPLOY_DIR/deploy.env"

[ -f "$ENV_FILE" ] || { echo "✗ 缺少 $ENV_FILE，请先 cp deploy.env.example deploy.env 并填值" >&2; exit 1; }
# shellcheck disable=SC1090
source "$ENV_FILE"

# ---------- 校验必填 ----------
for k in SSH_HOST SSH_USER DOMAIN APP_NAME APP_DIR APP_PORT NGINX_CONF CERT_EMAIL \
         SUPABASE_UPSTREAM DEEPSEEK_API_KEY SUPABASE_ANON_KEY; do
  if [ -z "${!k:-}" ]; then echo "✗ deploy.env 缺少必填项：$k" >&2; exit 1; fi
done
case "$DEEPSEEK_API_KEY" in *在此填入*|*sk-在此*) echo "✗ 请先在 deploy.env 填入真实 DEEPSEEK_API_KEY" >&2; exit 1;; esac
case "$SUPABASE_ANON_KEY" in *在此填入*) echo "✗ 请先在 deploy.env 填入真实 SUPABASE_ANON_KEY" >&2; exit 1;; esac

command -v ssh >/dev/null || { echo "✗ 未找到 ssh" >&2; exit 1; }
command -v scp >/dev/null || { echo "✗ 未找到 scp" >&2; exit 1; }

# 变量里的 ~ 不会自动展开，手动替换为本机 HOME
SSH_KEY_EXP="${SSH_KEY/#\~/$HOME}"
REMOTE="$SSH_USER@$SSH_HOST"
SSH_OPTS=(-p "${SSH_PORT:-22}" -o ConnectTimeout=15 -o StrictHostKeyChecking=accept-new)
[ -n "${SSH_KEY:-}" ] && SSH_OPTS=(-i "$SSH_KEY_EXP" "${SSH_OPTS[@]}")

info() { printf '\033[36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }

# 本地临时 runtime env（含密钥），退出即删
RUNTIME_LOCAL="$(mktemp)"
trap 'rm -f "$RUNTIME_LOCAL"' EXIT
chmod 600 "$RUNTIME_LOCAL"
# 只透传主机侧需要的业务变量，不含 SSH 连接信息
for k in APP_NAME APP_DIR APP_PORT NGINX_CONF DOMAIN CERT_EMAIL SUPABASE_UPSTREAM SUPABASE_HOST \
         DEEPSEEK_API_KEY SUPABASE_ANON_KEY ANON_RATE_PER_MIN USER_RATE_PER_MIN UPSTREAM_TIMEOUT_MS; do
  # %q 做 shell 安全转义，保证主机 source 时值原样还原（即便含特殊字符）
  printf '%s=%q\n' "$k" "${!k:-}" >> "$RUNTIME_LOCAL"
done

info "目标：$REMOTE  域名：$DOMAIN  目录：$APP_DIR"

# ---------- 1. 远程目录 ----------
info "创建远程目录"
ssh "${SSH_OPTS[@]}" "$REMOTE" "mkdir -p '$APP_DIR'/src '$APP_DIR'/test '$APP_DIR'/deploy/remote"

# ---------- 2. 上传代码与部署物料 ----------
info "上传网关代码（src/test/package.json）"
scp "${SSH_OPTS[@]}" -r "$SERVER_DIR/src" "$SERVER_DIR/test" "$SERVER_DIR/package.json" "$REMOTE:$APP_DIR/"

info "上传部署模板与主机脚本"
scp "${SSH_OPTS[@]}" -r "$DEPLOY_DIR/remote/." "$REMOTE:$APP_DIR/deploy/remote/"

info "上传运行时变量（600 权限，部署完主机侧自删）"
scp "${SSH_OPTS[@]}" "$RUNTIME_LOCAL" "$REMOTE:$APP_DIR/deploy/deploy.runtime.env"
ssh "${SSH_OPTS[@]}" "$REMOTE" "chmod 600 '$APP_DIR/deploy/deploy.runtime.env'"

# ---------- 3. 去除 Windows CRLF（Git Bash 上传防护）----------
info "规范化换行符（LF）"
ssh "${SSH_OPTS[@]}" "$REMOTE" \
  "find '$APP_DIR' -type f \( -name '*.sh' -o -name '*.js' -o -name '*.cjs' -o -name '*.template' -o -name '*.env' \) -exec sed -i 's/\r\$//' {} +"

# ---------- 4. 远程幂等初始化 ----------
info "远程执行 setup-host.sh（装依赖/证书/配置/PM2）"
ssh "${SSH_OPTS[@]}" "$REMOTE" "bash '$APP_DIR/deploy/remote/setup-host.sh' '$APP_DIR/deploy/deploy.runtime.env'"

# ---------- 5. 本机侧验收 ----------
info "本机访问 https://$DOMAIN/health 验收"
if curl -fsS --max-time 10 "https://$DOMAIN/health" >/dev/null; then
  ok "公网健康检查通过：https://$DOMAIN/health"
else
  warn "公网健康检查未通过——若为首次部署，检查 DNS A 记录是否已生效、云安全组是否放行 443；主机内服务已就绪"
fi

ok "部署流程结束。查看进程：ssh $REMOTE 'pm2 logs $APP_NAME --lines 30'"
