# 换机 / 新机一键部署 Runbook

目标：换一台干净的云主机（或从零搭建），**填一个变量文件、跑一条命令**即把心意管家 AI 网关 + Supabase 反代 + 证书 + 进程守护全部复刻，不再手工逐行调试。脚本幂等，升级/改配置后可反复重跑。

## 一、自动化边界（哪些脚本管，哪些必须人做）

| 事项 | 谁来做 |
|------|--------|
| 装 Node/Nginx/PM2/certbot、建目录、渲染配置、签证书、起进程、开机自启、健康检查 | **脚本自动**（`setup-host.sh`） |
| 购机装系统、云安全组、DNS 解析、ICP 备案接入、SSH 密钥、certbot 邮箱 | **人工一次性**（下面前置清单） |

> 备案是行政流程，无法脚本化，且**换公网 IP / 换云厂商通常要做「接入备案」变更**，务必先确认再切流量。

## 二、人工前置（新主机一次性）

1. **主机与系统**：OpenCloudOS 9 / RHEL 系（dnf 或 yum）。脚本以 root 运行。
2. **SSH 可登录**：把本机公钥加入目标机，确认 `ssh -i <私钥> root@新IP` 能进。
3. **云安全组/防火墙**：放行入站 `80`、`443`，以及 SSH 端口（建议改非标端口）。主机内 firewalld 可保持关闭，靠安全组。
4. **DNS**：在 DNSPod/解析商把 `api.你的域名` 的 A 记录指向**新公网 IP**，等待解析生效（`dig +short api.你的域名` 应返回新 IP）。certbot 首次签发依赖域名已解析且 80 可达。
5. **备案**：确认该子域沿用的主域 ICP 备案覆盖新主机；换厂商/IP 提前办接入变更。
6. **certbot 邮箱**：准备一个接收证书到期提醒的邮箱，填进 `deploy.env` 的 `CERT_EMAIL`。

## 三、三步部署（开发机执行，Git Bash / Linux / macOS）

```bash
# 1. 准备变量文件（真实密钥，已被 .gitignore 忽略，勿提交）
cp server/deploy/deploy.env.example server/deploy/deploy.env
#    编辑 deploy.env：改 SSH_HOST（新 IP）、DOMAIN、CERT_EMAIL，
#    填入真实 DEEPSEEK_API_KEY 与 SUPABASE_ANON_KEY，其余一般沿用

# 2. 一条命令完成部署
bash server/deploy/deploy.sh

# 3. 看脚本结尾的健康检查；通过即完成
curl https://api.你的域名/health      # {"ok":true}
```

`deploy.sh` 会：加载变量 → 生成临时 runtime env（含密钥，本机退出即删、主机部署完即删）→ `scp` 上传 `src/test/package.json` 与部署物料 → 规范化 LF 换行 → 远程跑 `setup-host.sh` → 本机 https 验收。

## 四、setup-host.sh 在主机上做了什么（8 步，全幂等）

1. 装 `nginx certbot nodejs npm`（已装跳过），校验 Node ≥18；无 PM2 则全局安装。
2. 建应用目录 `$APP_DIR`（默认 `/www/wwwroot/xinyi-gateway`）。
3. 渲染 `ecosystem.config.cjs`（注入密钥，`chmod 600`）。
4. 证书：无证书时先写「仅 80」引导配置 → `certbot certonly --webroot` 签发；有证书跳过。续期 `reload nginx` 的 deploy-hook 与 `certbot-renew.timer` 自动就位。
5. 渲染完整 Nginx 配置：**先备份旧文件为 `.bak.时间戳`（只新增不删），`nginx -t` 失败自动回滚**，通过才 reload。
6. PM2：进程在则 `reload --update-env`，不在则 `start`；`pm2 save` + `pm2 startup` 保证开机自启。
7. 本机 `127.0.0.1:端口/health` 与 `https://域名/health` 两级健康检查。
8. 删除含密钥的 runtime env（密钥仅留存于 600 权限的 ecosystem）。

## 五、幂等与回滚

- **可反复执行**：改了代码或 `deploy.env` 后重跑 `deploy.sh` 即可，安装、渲染、签发、起进程都做了存在性判断，不会重复创建或报错。
- **Nginx 回滚**：每次渲染前把现有配置备份成 `xinyi-api.conf.bak.<时间戳>`；新配置 `nginx -t` 不过会自动还原最近备份并中止，不会拖垮同机其他站点。
- **PM2 回滚**：`reload` 是平滑重载；异常时 `pm2 logs <APP_NAME>` 排查，或手动 `pm2 reload ecosystem.config.cjs`。
- **同机多服务共存**：本脚本只新增自己的 `conf.d` 文件与 PM2 进程，不触碰其他 vhost；网关监听独立本地端口（默认 3210），给已有服务让路。多个 vhost 都监听 `[::]:443` 时 `ipv6only` 选项须一致（模板已对齐）。

## 六、故障排查

| 现象 | 排查 |
|------|------|
| 证书签发失败 | 确认 DNS 已解析到本机、安全组开 80；主机 `curl -I http://域名/.well-known/acme-challenge/`；修好后重跑脚本（幂等） |
| `nginx -t` 失败 | 脚本已自动回滚；看输出的报错行，常见是 443 重复 listen 选项或证书路径不符 |
| 网关 health 不通 | `pm2 logs xinyi-gateway --lines 50`；确认 `.env/ecosystem` 密钥齐全、端口未被占（`ss -tlnp`） |
| 公网 https 不通但主机内正常 | 安全组未放行 443 / DNS 未生效 / 备案未就绪；主机内 `curl https://域名/health` 可区分 |
| Windows 上传脚本报换行错 | 已在部署时统一去 CR，并由 `.gitattributes` 锁定 LF；如手动传文件注意别用 CRLF |
| 反代 Supabase 报错 | 核对模板 `proxy_ssl_server_name on` 与回源 `Host` 为项目原域名；用 `curl -H "apikey: <key>" https://域名/auth/v1/settings` 验证 |

## 七、现网参考值（当前生产，供核对）

| 项 | 值 |
|----|----|
| 主机 | OpenCloudOS 9.6，腾讯云上海 `124.223.173.79` |
| 应用目录 | `/www/wwwroot/xinyi-gateway` |
| PM2 进程 | `xinyi-gateway`（fork 单实例，root，开机自启 pm2-root） |
| 网关端口 | `127.0.0.1:3210`（3000 留给同机求职站） |
| Nginx 配置 | `/etc/nginx/conf.d/xinyi-api.conf` |
| 证书 | certbot webroot，`/etc/letsencrypt/live/api.talentspec.top/` |
| 访问日志 | `/var/log/nginx/access.log`（多站混合，按 host 字段区分） |
| Node / PM2 / certbot | v20.20.2 / 7.1.2 / 2.8.0 |
