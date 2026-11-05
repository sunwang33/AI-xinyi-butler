#!/usr/bin/env bash
# =============================================================================
# 心意管家网关 · 主机侧一键初始化（幂等，可反复执行）
# 由本机 deploy.sh 上传后在目标主机以 root 运行：
#   bash setup-host.sh <runtime.env 路径>
#
# 设计目标：换一台干净的 OpenCloudOS/RHEL 系主机，本脚本把 Node/Nginx/PM2/
# certbot、目录、配置、证书、进程守护全部装好，重复执行不报错、不破坏既有服务。
# 同机若有其他站点（如求职站），只新增本应用的 conf.d 文件与进程，不动其配置。
# =============================================================================
set -euo pipefail

RUNTIME_ENV="${1:?用法: bash setup-host.sh <runtime.env>}"
# shellcheck disable=SC1090
source "$RUNTIME_ENV"

# ---------- 校验必填变量 ----------
REQUIRED=(DOMAIN APP_NAME APP_DIR APP_PORT NGINX_CONF CERT_EMAIL SUPABASE_UPSTREAM
          DEEPSEEK_API_KEY SUPABASE_ANON_KEY ANON_RATE_PER_MIN USER_RATE_PER_MIN UPSTREAM_TIMEOUT_MS)
for k in "${REQUIRED[@]}"; do
  if [ -z "${!k:-}" ]; then echo "✗ 缺少必填变量：$k（检查 deploy.env）" >&2; exit 1; fi
done
# 上游 Host 由 URL 自动派生（去掉 https:// 和尾部斜杠）
SUPABASE_HOST="${SUPABASE_HOST:-$(printf '%s' "$SUPABASE_UPSTREAM" | sed -E 's#^https?://##; s#/$##')}"
[ -z "$SUPABASE_HOST" ] && { echo "✗ 无法从 SUPABASE_UPSTREAM 派生 Host" >&2; exit 1; }

# ---------- 日志 ----------
info() { printf '\033[36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '\033[32m✓ %s\033[0m\n' "$*"; }
warn() { printf '\033[33m! %s\033[0m\n' "$*"; }
die()  { printf '\033[31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "请用 root 运行（要装包、写 /etc/nginx、管 systemd）"

# sed 替换值转义：& | \ 三个在 s||| 里有特殊含义的字符
sesc() { printf '%s' "$1" | sed 's/[&|\\]/\\&/g'; }

# 把模板里的 @@KEY@@ 全部替换并输出到目标文件
render() {
  local template="$1" target="$2"
  sed \
    -e "s|@@DOMAIN@@|$(sesc "$DOMAIN")|g" \
    -e "s|@@NGINX_CONF@@|$(sesc "$NGINX_CONF")|g" \
    -e "s|@@APP_NAME@@|$(sesc "$APP_NAME")|g" \
    -e "s|@@APP_DIR@@|$(sesc "$APP_DIR")|g" \
    -e "s|@@APP_PORT@@|$(sesc "$APP_PORT")|g" \
    -e "s|@@SUPABASE_UPSTREAM@@|$(sesc "$SUPABASE_UPSTREAM")|g" \
    -e "s|@@SUPABASE_HOST@@|$(sesc "$SUPABASE_HOST")|g" \
    -e "s|@@DEEPSEEK_API_KEY@@|$(sesc "$DEEPSEEK_API_KEY")|g" \
    -e "s|@@SUPABASE_ANON_KEY@@|$(sesc "$SUPABASE_ANON_KEY")|g" \
    -e "s|@@ANON_RATE_PER_MIN@@|$(sesc "$ANON_RATE_PER_MIN")|g" \
    -e "s|@@USER_RATE_PER_MIN@@|$(sesc "$USER_RATE_PER_MIN")|g" \
    -e "s|@@UPSTREAM_TIMEOUT_MS@@|$(sesc "$UPSTREAM_TIMEOUT_MS")|g" \
    "$template" > "$target"
}

CONF_PATH="/etc/nginx/conf.d/$NGINX_CONF"
TEMPLATE_DIR="$APP_DIR/deploy/remote"
CERT_LIVE="/etc/letsencrypt/live/$DOMAIN"
WEBROOT="/usr/share/nginx/html"

# ---------- 1. 系统依赖（OpenCloudOS/RHEL 系，dnf 优先回退 yum）----------
PM=$(command -v dnf || command -v yum || true)
[ -n "$PM" ] || die "未找到 dnf/yum，本脚本仅适配 RHEL 系（OpenCloudOS/CentOS/Rocky）"
info "安装系统依赖：nginx / certbot / nodejs / npm（已装则跳过）"
$PM install -y nginx certbot nodejs npm >/dev/null 2>&1 || $PM install -y nginx certbot nodejs npm

# Node 主版本需 >=18（网关 engines 要求）
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 18 ] || die "Node 版本过低（$(node -v)），需 >=18"
ok "Node $(node -v) / npm $(npm -v)"

# PM2：没有才全局安装，避免重复动
if ! command -v pm2 >/dev/null 2>&1; then
  info "全局安装 PM2"
  npm install -g pm2 >/dev/null 2>&1
fi
ok "PM2 $(pm2 -v)"

# ---------- 2. 应用目录 ----------
mkdir -p "$APP_DIR/src" "$APP_DIR/test" "$APP_DIR/deploy/remote"
ok "应用目录 $APP_DIR"

# ---------- 3. 渲染 PM2 配置（含密钥，权限 600）----------
info "渲染 PM2 配置 ecosystem.config.cjs"
render "$TEMPLATE_DIR/ecosystem.config.cjs.template" "$APP_DIR/ecosystem.config.cjs"
chmod 600 "$APP_DIR/ecosystem.config.cjs"

# ---------- 4. TLS 证书：首次用「仅 80」引导配置走 webroot 签发 ----------
mkdir -p "$WEBROOT"
if [ ! -d "$CERT_LIVE" ]; then
  warn "未发现 $DOMAIN 的证书，先部署 80 引导配置并签发（需 DNS 已解析到本机、安全组开 80）"
  cat > "$CONF_PATH" <<BOOTSTRAP
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN;
    location /.well-known/acme-challenge/ { root $WEBROOT; }
    location / { return 200 'bootstrap'; add_header Content-Type text/plain; }
}
BOOTSTRAP
  nginx -t || die "引导配置校验失败"
  systemctl enable nginx >/dev/null 2>&1 || true
  systemctl restart nginx
  certbot certonly --webroot -w "$WEBROOT" -d "$DOMAIN" \
    --non-interactive --agree-tos -m "$CERT_EMAIL" --keep-until-expiring \
    || die "证书签发失败：确认 DNS A 记录已指向本机且 80 端口可访问后重跑本脚本"
  ok "证书签发完成 $CERT_LIVE"
else
  ok "证书已存在，跳过签发"
fi

# 续期后自动 reload nginx（幂等写一个 deploy-hook）
HOOK="/etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh"
mkdir -p "$(dirname "$HOOK")"
cat > "$HOOK" <<'HOOKEOF'
#!/usr/bin/env bash
systemctl reload nginx || true
HOOKEOF
chmod +x "$HOOK"
systemctl enable --now certbot-renew.timer >/dev/null 2>&1 || true

# ---------- 5. 渲染完整 Nginx 配置（先备份、校验失败自动回滚）----------
info "渲染 Nginx 配置 $CONF_PATH"
TMP_CONF="$(mktemp)"
render "$TEMPLATE_DIR/nginx-api.conf.template" "$TMP_CONF"
if [ -f "$CONF_PATH" ]; then
  cp -a "$CONF_PATH" "$CONF_PATH.bak.$(date +%Y%m%d%H%M%S)"
fi
cp "$TMP_CONF" "$CONF_PATH"
if ! nginx -t 2>/tmp/nginx-test.err; then
  cat /tmp/nginx-test.err >&2
  LATEST_BAK=$(ls -1t "$CONF_PATH".bak.* 2>/dev/null | head -1 || true)
  [ -n "$LATEST_BAK" ] && cp -a "$LATEST_BAK" "$CONF_PATH"
  rm -f "$TMP_CONF"
  die "新 Nginx 配置校验失败，已回滚到 $LATEST_BAK"
fi
rm -f "$TMP_CONF"
systemctl enable nginx >/dev/null 2>&1 || true
systemctl reload nginx
ok "Nginx 配置生效（旧配置已带时间戳备份，未删除）"

# ---------- 6. PM2 启动/热重载 + 开机自启（幂等）----------
info "同步 PM2 进程 $APP_NAME"
cd "$APP_DIR"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 reload ecosystem.config.cjs --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save >/dev/null
# 已存在 pm2-root 服务时此命令幂等无副作用
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || true
pm2 save >/dev/null
ok "PM2 进程在线并已设开机自启"

# ---------- 7. 本机健康检查 ----------
sleep 1
curl -fsS --max-time 5 "http://127.0.0.1:$APP_PORT/health" >/dev/null \
  || die "网关本机健康检查失败：pm2 logs $APP_NAME 看日志"
ok "网关 127.0.0.1:$APP_PORT/health 正常"
curl -fsS --max-time 8 "https://$DOMAIN/health" >/dev/null \
  || warn "https://$DOMAIN/health 暂不可达（DNS/安全组未生效时属正常，本机侧已就绪）"

# ---------- 8. 清理含密钥的 runtime 文件（密钥已进入 600 权限的 ecosystem）----------
rm -f "$RUNTIME_ENV"
ok "部署完成：$APP_NAME 在线，配置 $CONF_PATH，证书 $CERT_LIVE"
