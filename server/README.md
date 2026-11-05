# 心意管家 AI 网关（M12 T57）

由 Supabase Edge Function `generate-content` 迁回**国内备案主机**的 Node 小服务。手机 → 上海腾讯云主机（备案子域 `api.talentspec.top`）→ DeepSeek，解决真机直连 Supabase 的 SNI 阻断；同一子域的 Nginx 顺带反代 Supabase Auth/REST，App 只换一个 base URL 即完成回国。

- **零第三方依赖**：仅用 Node 18+ 内置能力（`node:http`、全局 `fetch`、`node:test`），无需 `npm install`。
- **两条调用通道**：登录用户校验 Supabase JWT（按 user.id 限频）；匿名用户持 anon key（按来源 IP 限频，未登录必须可完整使用）。
- **提示词、入参契约、模型参数、结果校验、隐私日志口径与 Edge 版完全一致**（逐个函数原样移植），生成质量无变化。

## 目录

```
server/
├── src/
│   ├── index.js        # HTTP 服务：/health、/api/generate
│   ├── config.js       # 环境变量与启动校验
│   ├── auth.js         # JWT 用户校验（/auth/v1/user，60s 正缓存）+ anon key 匿名通道
│   ├── rateLimit.js    # 内存滑动窗口（用户/IP 各一把，PM2 必须单实例）
│   ├── types.js        # 入参校验（Edge types.ts 原样移植）
│   ├── prompt.js       # 提示词与结果解析（Edge prompt.ts 原样移植）
│   └── upstream.js     # DeepSeek 调用（参数与 Edge 一致）
├── deploy/
│   ├── nginx-api.conf.example      # 备案子域 Nginx 站点（AI 网关 + Supabase 限路径反代）
│   └── ecosystem.config.cjs.example
└── test/
    ├── gateway.test.js             # 入参校验 / 结果解析 / 限频窗口纯逻辑
    ├── auth.test.js                # JWT 双通道鉴权与 60s 正缓存（fetch 桩）
    └── httpGateway.test.js         # 真实端口端到端（鉴权→限频→校验→上游全链路）
```

## 本机自测

```bash
cd server
npm test          # 全部 node:test 自测（27 个用例，零网络请求）
# 不启动真实服务（启动需 DEEPSEEK_API_KEY 等环境变量）
```

---

# 主机部署（由开发者操作，AI 不掌握主机凭证）

前置：主机 124.223.173.79（OpenCloudOS + 宝塔）、域名已 ICP 备案、Node 18+、PM2。

## 1. DNS

腾讯云 DNSPod 加记录：`api.talentspec.top` → A → `124.223.173.79`。

## 2. 上传代码并配置环境变量

把 `server/` 整个目录上传主机（如 `/www/wwwroot/xinyi-gateway`），然后：

```bash
cd /www/wwwroot/xinyi-gateway
cp deploy/ecosystem.config.cjs.example ecosystem.config.cjs
vi ecosystem.config.cjs     # 填入 DEEPSEEK_API_KEY 与 SUPABASE_ANON_KEY
chmod 600 ecosystem.config.cjs
node --test                 # 部署后先跑一遍自测
pm2 start ecosystem.config.cjs
pm2 save && pm2 startup     # 开机自启（按提示再执行输出的命令）
curl -s http://127.0.0.1:3210/health    # {"ok":true}
```

- `DEEPSEEK_API_KEY`：原 Supabase secret（Dashboard → Edge Functions → Secrets，或密钥保管处）。
- 零依赖，不需要 `npm install`；Node 版本 `node -v` 确认 ≥18。

## 3. Nginx 站点（宝塔：新建站点 api.talentspec.top → 配置文件替换）

以 `deploy/nginx-api.conf.example` 为模板：

1. 确认证书路径（宝塔 SSL 页申请 Let's Encrypt 后路径通常与模板一致，不一致按实际改）；
2. 放入站点配置并 `nginx -t`、`nginx -s reload`（宝塔面板内点「重载配置」亦可）。

配置同时承载：

| 路径 | 去向 | 说明 |
|---|---|---|
| `POST /api/generate` | `127.0.0.1:3210` | AI 生成网关 |
| `GET /health` | `127.0.0.1:3210` | 存活探针 |
| `/auth/v1/*`、`/rest/v1/*` | Supabase 首尔 | App 登录与数据通道 |
| `= /functions/v1/generate-content` | Supabase 首尔 | 仅旧 Edge 回退通道 |
| 其他 | 404 | 不做开放代理 |

关键反代细节（模板已含，勿删）：回源 `Host` 必须改写为 `wohcvgarvrizbbcepggg.supabase.co` 且 `proxy_ssl_server_name on`，否则 Supabase 边缘不认；`X-Forwarded-For $remote_addr` 为覆盖式下发，匿名限频取到的才是真实客户端 IP。

## 4. 联调验收（主机上执行）

```bash
curl https://api.talentspec.top/health
# → {"ok":true}

# 匿名通道缺 key：401
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api.talentspec.top/api/generate \
  -H 'content-type: application/json' -d '{"kind":"blessing","occasion":{"type":"festival","festivalName":"中秋"},"person":null}'

# 匿名通道带正确 anon key：200 且返回 {kind,blessings:[...3 条]}
curl -X POST https://api.talentspec.top/api/generate \
  -H 'content-type: application/json' -H 'x-api-key: <ANON_KEY>' \
  -d '{"kind":"blessing","count":3,"occasion":{"type":"festival","festivalName":"中秋"},"person":null}'

# 假 JWT：401 invalid_token
curl -s -o /dev/null -w "%{http_code}\n" -X POST https://api.talentspec.top/api/generate \
  -H 'authorization: Bearer not.a.jwt' -H 'content-type: application/json' \
  -d '{"kind":"blessing","occasion":{"type":"festival","festivalName":"中秋"},"person":null}'
```

App 真机端到端见 T58（登录/匿名两通道各生成一次祝福与礼物）。

## 5. App 端切换

App 内容生成默认仍走 Supabase Edge（回退通道），主机联调通过后把 `rnapp/src/lib/gateway.ts` 的 `USE_SHANGHAI_GATEWAY` 置为 `true`；数据通道 base URL 切换（`SUPABASE_URL` 改为 `https://api.talentspec.top`）在 T58 真机验证反代后进行，两处开关均在该文件留了注释。

## 6. 旧 Edge Function 去留

**保留为备用**（Nginx 已反代 `/functions/v1/generate-content`，App 保留 edge 通道）。网关在生产稳定运行一个版本、T58 全量验收后再停用 Supabase Edge 上的 `generate-content`，届时：删 Nginx functions 段、删 gateway.ts 的 edge 分支、在 Supabase Dashboard 删除函数。收口动作届时记入 tasks.md T57。
