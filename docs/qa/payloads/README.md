# QA 载荷（过程检资产）

`generate-content` 云函数的人工抽检入参，配套文档：

- `../m6-blessing-quality.md`（T35 祝福）：case1、case2、case4、case5（正）、case6（反）
- `../m7-gift-quality.md`（T39 礼物）：case3、case7（差异化对比），case6 兼作边界反例

均不含密钥；调用需自带 anon key（在 App 工程 `rnapp/src/lib/supabase.ts` 内）。
Windows 终端用 `curl --data-binary @文件` 发送，勿内联中文 JSON。
