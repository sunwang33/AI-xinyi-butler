# 密码重置公网回调页

Supabase Auth「找回密码」邮件中的链接需要一个公网 HTTPS 地址承接：
邮件验证通过后会带 `#access_token=...&type=recovery` 回跳到本页，
页面调 `PUT /auth/v1/user` 设置新密码，零第三方依赖（不用任何 CDN）。

- 线上地址：<https://sunwang33.github.io/AI-xinyi-butler/>
- 源码：`web/index.html`；部署分支：`gh-pages`（孤立分支，仓库需为 Public）
- 更新页面：改完 `web/index.html` 后执行 `bash web/deploy-pages.sh`
- 页面内硬编码了项目 ref（`wohcvgarvrizbbcepggg`）与公开 anon key——anon key 设计上可公开，数据安全由 RLS 保证；**service_role 密钥绝不能放入此页**

## Supabase Dashboard 必配项

项目 → Authentication → URL Configuration：

1. **Site URL**：`https://sunwang33.github.io/AI-xinyi-butler/`
2. **Redirect URLs**：新增 `https://sunwang33.github.io/AI-xinyi-butler/**`

邮件模板（Authentication → Emails → Reset Password）保持默认的 `{{ .ConfirmationURL }}` 即可，
回跳地址取 Site URL。测试可用 Dashboard 用户列表的「Send recovery email」。

> 说明：App 登录已于 2026-10-28 经开发者拍板由邮箱验证码（OTP）改为**邮箱 + 密码**（spec 第 14 条、
> T55 已同步），App「忘记密码」调用 `resetPasswordForEmail`，邮件链接即回跳本页完成改密。
> anon key 同时硬编码在 App 端（Supabase 设计上公开，安全由 RLS 保证）。
