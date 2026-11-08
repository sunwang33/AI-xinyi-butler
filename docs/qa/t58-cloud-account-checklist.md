# T58 账号云链路 + T57 网关真机验收清单（预制于 2026-11-04 晚）

> 用途：开发者在场真机走查时逐条打勾记录。AI 只负责配合（adb 深链/截图/logcat），
> 所有点击由开发者手动完成（小米机禁止模拟输入）。
> 基线代码：T56/T57/T77 已收口（2026-11-04，`25abd6a` 及当晚未提交的网关 HTTP 测试增量）。
> 设备：小米真机；Expo Go 58.0.5；调试期 adb reverse 8081（Metro）、必要时 7890（代理）。
>
> 记录约定：每条记 ✅/❌＋现象；❌ 条记录复现步骤与 logcat 时间点。

## 〇、前置条件

- [x] Supabase 云端 7 表迁移与 RLS 已部署（T54，已验证）。
- [ ] 测试邮箱两个（A、B 账号，用于换号隔离）；能收重置密码邮件。（A 已在用，B 待备）
- [ ] 「网络测试」人员资料已在未登录态建好，并含：生日、纪念日、≥1 条特征、
      当年已生成的祝福与礼物快照、1 条收藏、1 条已送出记录（首登合并的迁移素材）。
- [x] T57 网关主机部署按 `server/README.md` 完成（DNS/PM2/Nginx/证书），
      主机 curl 四条验收全过：/health 200、无 key 401、anon key 200、假 JWT 401。

## 一、注册 / 登录 / 改密（T55 回归 + T58）

| # | 场景 | 预期 | 结果 |
|---|---|---|---|
| 1.1 | 邮箱 A 注册并登录 | 登录成功进首页，设置页显示「已登录 · 数据自动同步到云端」 | |
| 1.2 | 杀进程重开 App | 仍是登录态，不要求重新登录 | ✅ 2026-11-08 真机：force-stop Expo Go 后深链冷启动（全新 bundle、rootTag=1），直接落提醒 Tab 而非 onboarding 空态，设置页显示「已登录 · sunwang1101@aliyun.com」；JS 日志无 ERROR、无恢复超时告警（截图 `t58-cold-start-ok.png`，缺陷现场对照 `t58-resume.png`） |
| 1.3 | 忘记密码：收邮件→重置 | 重置页可打开；新密码可登录；旧密码失效 | ✅ 2026-11-06 真机：App 内发起→反代 `/auth/v1/recover` 200→GitHub Pages 重置页改密→新密码 token 200 登录；旧密码 token 400 失效 |
| 1.4 | 错误密码 / 网络异常文案 | 提示为可读中文，无卡死 | |

## 二、未登录完整路径回归（重点：T77 修复点）

> T56 曾引入 `markSent` INSERT 参数错位（已修复于 `25abd6a` 当晚），
> 未登录「已送出」标记一度必然失败——本组是该修复的真机验收。

| # | 场景 | 预期 | 结果 |
|---|---|---|---|
| 2.1 | 未登录新增/编辑/删除人员 | 全部成功，重启后数据仍在 | |
| 2.2 | 未登录生成祝福（3 次失败兜底）与礼物 | 正常；失败计数与兜底文案符合既有行为 | |
| 2.3 | 收藏 / 取消收藏 | 成功，历史 Tab「收藏」分区即时更新 | ✅ 2026-11-07：祝福/礼物/贺卡三类收藏与取消均即时刷新；回看含 chips/「藏」戳/归属行/原文 |
| 2.4 | **标记已送出（祝福/礼物/贺卡各一）** | **全部成功，「已送出」流水可见且有标记时间** | ✅ 2026-11-07：三类标记全成功（T77 INSERT 参数错位修复回归通过）；流水含标记时间，红邮戳「26 已送」聚合行 |
| 2.5 | **取消已送出标记** | 行消失，重新标记成功（验证只有一行，不重复） | ✅ 2026-11-07：取消后行消失，重标仅 1 聚合行，副行「11月7日寄出 · 祝福 · 贺卡」 |
| 2.6 | 贺卡翻页 / 手写 / 换模板 / 收藏贺卡 | 均成功；重开后状态保持 | ✅ 2026-11-07：翻页 1/5、手写（预填原文保存/手写态翻页锁/「用回 AI 祝福（第 n 条）」恢复）、晴光/夜色/暖庐切换不丢字、收藏/已送出回看均通过。同期修复两真机缺陷：①贺卡抬头与祝福开头称呼、右下署名与祝福落款重复——Postcard 画面派生根净化（`stripLeadingSalutation`/`stripTrailingSignature`，13 例单测），存储/快照/复制原文不动，AI 与手写同规则（拍板方案 A）；②手写弹层键盘态面板顶出屏幕——Sheet 自适应键盘避让（见文末修复记录） |
| 2.7 | 节日关注开关、单人提醒设置 | 正常（仅本机表不受云链路影响） | ✅ 2026-11-08 真机（登录 A 态，uiautomator dump 读文本＋截图，滑动由开发者手动）：① 单人弹层填 12 保存→行摘要即时变「提前 12 天提醒」，其余 4 人仍「跟随全局（提前 5 天）」；② force-stop 冷启动后 12 仍在（跨进程持久化）；③ 清空保存→回「跟随全局（提前 5 天）」；④ 行内开关关闭→显「已关闭提醒」，再开恢复；⑤ 节日管理取关感恩节→提醒页「已关注 6→5」、节日区即时隐藏感恩节，重新关注后回 6 个且感恩节带星重现。仅本机四表操作期间无同步报错。弹层键盘避让已于 2026-11-07 先验 |

## 三、首登静默合并（G-A6）

| # | 场景 | 预期 | 结果 |
|---|---|---|---|
| 3.1 | 用含「网络测试」资料的未登录库登录 A | 无弹窗、无 loading 死等；登录后该人员与全部快照/收藏/已送出仍在 | ✅ 2026-11-06（修复五缺陷后冷启动复验）：4 位联系人全在、「网络测试」祝福/礼物/贺卡内容核对不丢、无弹窗死等；收藏与已送出流水待历史 Tab 补核 |
| 3.2 | Supabase Dashboard 核对 | persons 等 7 表出现该人员行，user_id=A，原本机 UUID 保留、created_at 未被覆盖 | ✅ 2026-11-08 Dashboard 眼见：persons 6 行 user_id 全为 A（`fc67221b-c6d0-4865-a0cb-e667fa97830c`）无 null，id 为 App 生成 UUID、created_at 保留 App 写入值未被云端 default 覆盖；favorites 6 行、sent_records 2 行同样 user_id=A 且 payload 完整。anniversaries/traits/content_snapshots/card_states 四表于 2026-11-06 首登合并时经主机 okhttp 七表合并 200 日志验证 |
| 3.3 | 合并后杀进程重开 | 数据不重复、不丢失 | ✅ 2026-11-08 真机（登录 A 态，杀进程前联系人「共 7 位」）：`adb shell am force-stop host.exp.exponent` 彻底杀进程（pid 消亡）后深链冷启动。**壳层冷启竞态（非 App 缺陷，如实记录）**：force-stop 后首条 `am start -d exp://127.0.0.1:8081/--/contacts` 虽返回 Starting 成功，但 Expo Go 冷启没接住 URL、进程起来后停在 HomeActivity（Development servers 主页，焦点 `com.miui.home`→`host.exp.exponent/.experience.HomeActivity`）；在 Expo Go 已存活时重发同一深链，3s 内即正常加载 bundle 落入联系人页。**数据断言全过**：冷启后联系人仍「共 7 位」与杀前一致；uiautomator dump 按卡片容器 `content-desc` 统计得 7 条、`sort -u` 去重后仍 7 条（七张卡全唯一、无重复行），七名齐全——妈妈（6/5）、测试同事（11/1）、网络测试（11/6）、测试人员（11/20）、测试大佬（11/21）、同步测试改（11/25）、故障测试（11/26，在视口底部仅渲染容器 content-desc）；精确 `text="人名"` 节点视口内 6 人各 1 次无重复；全屏无 ERROR/失败/异常/重试类报错文案。机制：SQLite 落盘跨进程持久化＋会话恢复后 registry 重建云仓储（inner=SqliteRepository，scopeUserId=A），首登合并结果不依赖内存态，故杀进程重开不丢不重 |
| 3.4 | （如方便）同一条记录两端都改过 | updated_at 新者胜 | |

## 四、在线写与同步

| # | 场景 | 预期 | 结果 |
|---|---|---|---|
| 4.1 | 登录态在线新增人员、生成内容、收藏、标记、贺卡操作 | 操作成功；Dashboard 可见对应行；写后约 8s 内同步 | ✅ 2026-11-08 真机＋Dashboard：在线新增「同步测试」（挚友）后 App 联系人即时 5→6 位、logcat 零 ERROR；Dashboard persons 立见该行（id `6041de13…`、user_id=A、created_at=updated_at 保留写入时刻、deleted=false）。write-through 设计：云端 POST 成功才回写本机，故能进列表即证明已上云。内容类在线写：favorites 6 行（blessing×2/gift×3/card×1）、sent_records 2 行均在云端 |
| 4.2 | 下拉/切前后台触发增量同步 | 另端改动（Dashboard 手改一行）能拉回；水位增量不重复拉 | ✅ 2026-11-08 真机：① **另端改动拉回**——Dashboard 把 persons 行 `6041de13…` 的 name「同步测试」改「同步测试改」并 Save（21:37 App 仍旧名），App 切后台再回前台触发 `onAppStateActive`（首登缓存命中＋8s 防抖 `schedulePull`），21:38 联系人列表自动变「同步测试改」；uiautomator dump 精确匹配新名、旧名 `text="同步测试"` 0 匹配，列表仍「共 6 位」证明是原地 upsert 而非新增第 7 行。② **再切一次前后台**：dump 仍 6 行、新名保持、无重复无丢失。③ **水位不重复拉**（三层证据，真机 logcat 通道受限：SDK58 JS console 走 Metro 不进 logcat、supabase-js 默认不打 okhttp URL，设备侧取不到请求参数）——代码层 `sync.ts pullTable`：有 cursor 必带 `gt('updated_at', cursor)` 只拉增量、空结果提前 return 零写入、成功后 `setCursor` 推进水位；新增单测 `sync.test.ts`「回前台两次」用例：首拉无 gt 建水位 T2 并 upsert 1 行，二次回前台 merge 缓存短路零请求、防抖拉取断言带 `updated_at gt T2`、空回包后本机仍 1 行不重复、水位不变。全量 22 套件 220 测试绿、typecheck/lint 零告警 |
| 4.3 | 云端故障时写入 | 报错为真实中文原因，不冒充「本地写入失败」 | ✅ 2026-11-08 真机（fetch 层精确注入，验完代码已还原）：① **注入方式演进**——先试整体改 `SUPABASE_URL` 为不可达地址，误伤 auth：Reload 后 `getSession()` 失败、5s 兜底把会话置空，App 降级匿名仓储（联系人只显匿名行），偏离目标，弃用；改为在 supabase 客户端 `global.fetch` 只拦截 `/rest/v1/` 的非 GET 请求（auth 与 rest 读全放行），保持登录态与缓存可读，仅七表云端写 reject `Network request failed`。② **真机证据**——登录在线态新增「故障测试2」点保存，弹 Alert 标题「保存失败」、正文「网络连接异常，改动尚未保存到云端，请检查网络后重试」（uiautomator dump 标题/正文各精确命中 1 次）；关掉弹窗后该人员在联系人列表 0 匹配、未入库（write-through：云端失败本机不写），列表仍为原行数。报错链路 `SupabaseRepository.unwrap → translateCloudError` 网络分支 → PersonForm catch `writeErrorMessage`，是云端真因而非笼统本地失败。③ **顺带抓出并修复一个真实缺陷**：`cloudError.ts` 的 PGRST116 分支只匹配 message 不匹配 code，而 PostgREST 该错误码在 `code` 字段、生产中命中不了中文翻译；改为查 `haystack`（raw+code）。新增 `cloudError.test.ts` 6 例锁定网络/鉴权/唯一约束/PGRST116/未知透传/兜底六类翻译。④ **副作用澄清（非缺陷）**：首个 URL 注入期以匿名态建的「故障测试」，因编辑注入时分两次保存、Metro HMR 把「好 URL+无拦截」中间态热推进运行中 App，首登合并在该无拦截窗口将其正常上云并认领；Dashboard 刷新见 persons 7 行、该行 user_id=A，云端与本机一致、无「本机认领但云端缺失」脏数据。全量 23 套件 226 测试绿、typecheck/lint 双零，注入代码已完全移除（`git diff supabase.ts` 为空） |

## 五、登录态离线只读（G-A6，T78 联网门控）

| # | 场景 | 预期 | 结果 |
|---|---|---|---|
| 5.1 | 开飞行模式，设置页副标题 | 显示「已登录 · 离线模式（仅可查看）」 | ✅ 2026-11-08 真机（飞行模式＋手动关 WiFi 后）：副标题准确切换。**重要环境注记**：HyperOS 飞行模式默认不关 WiFi，wlan0 仍 CONNECTED/VALIDATED，NetInfo 报 type=wifi 不算离线；必须手动再关 WiFi 才触发 type=none |
| 5.2 | 人员新增/编辑/删除入口 | 按钮置灰或拦截，弹「离线只读模式」说明 | ✅ 真机：可进「添加人员」表单，但底部「保存」按钮置灰点不动（PersonForm `disabled=readOnly`，handleSave 另有 Alert 双保险；编辑/删除同组件同机制；SupabaseRepository 写方法仓储层硬拦截 throw 兜底） |
| 5.3 | 收藏开关、已送出标记/取消 | 禁用并提示，不错误改写 | ✅ 真机：「标记送出」按钮灰色不可点（SentToggle `disabled=readOnly`）；收藏 FavoriteToggle 同 useCloudReadOnly 机制置灰。另发现并澄清：仅开飞行模式（WiFi 仍连）时点收藏会成功——属正确在线行为非缺陷，真断网后才禁用 |
| 5.4 | 贺卡翻页/手写/换模板 | 禁用；首次进详情不卡转圈（默认行写不进时降级占位） | 机制同 5.2/5.3（CardSection 三写点均接 useCloudReadOnly＋CLOUD_READONLY_ALERT，代码审查 206/228/253 行）；离线进心意详情页秒开不卡转圈已间接实证；逐点操作待补 |
| 5.5 | 已生成内容、收藏、流水查看 | 全部可完整查看 | ✅ 真机：离线态测试大佬详情页祝福 4 条缓存完整可读，复制等本机操作不受影响 |
| 5.6 | 节日关注、提醒设置在离线时 | **仍可写**（仅本机四表不误伤） | ✅ 真机：离线态关闭测试大佬单人提醒成功，摘要即时变「已关闭提醒」，无拦截弹窗（person_reminder_settings 为仅本机表） |
| 5.7 | 恢复网络 | 各入口恢复可写，无需重登录 | ✅ 2026-11-08 真机：关飞行模式＋WiFi 重连后，设置副标题自动变回「已登录 · 数据自动同步到云端」、账号仍登录无需重认证；进心意详情页，离线时置灰的「标记送出」按钮恢复正常可点、离线蜜蜡条消失。所有只读判定订阅同一 network store，副标题翻转即代表全写入口同步恢复 |

## 六、退出登录两路径

| # | 场景 | 预期 | 结果 |
|---|---|---|---|
| 6.1 | 退出弹窗默认聚焦项 | 默认聚焦「清除本机缓存（推荐）」 | |
| 6.2 | 选「清除本机缓存」 | 七张云表本机行清空（首页空白）；仅本机设置保留；sync_cursors 清空 | |
| 6.3 | 清除后重新登录 A | 全量拉取，数据完整恢复 | |
| 6.4 | 再次退出选「保留在本机」 | 数据留在本机可读；未登录态可见 | |

## 七、换号隔离

| # | 场景 | 预期 | 结果 |
|---|---|---|---|
| 7.1 | A 退出清除后登录 B | 看不到 A 的任何人员/收藏/流水；B 的数据正常 | |
| 7.2 | （如保留 A 本机缓存后登 B） | A 的缓存行 user_id 作用域隔离，不串显 | |

## 八、卸载重装 / 换机恢复

| # | 场景 | 预期 | 结果 |
|---|---|---|---|
| 8.1 | A 登录同步完成后卸载重装 | 登录 A 后七类数据恢复；提醒设置/节日关注回到默认（仅本机） | |

## 九、T57 上海网关真机联调（主机部署完成后）

| # | 场景 | 预期 | 结果 |
|---|---|---|---|
| 9.1 | App 开关置 `USE_SHANGHAI_GATEWAY=true`，真机**不挂代理**匿名生成祝福 | 走 api.talentspec.top 成功返回，条数正确 | ✅ 2026-11-05（前序会话，双兜底后换新文案成功） |
| 9.2 | 匿名生成礼物（有人对象） | 成功，≥5 个且三字段齐全 | ✅ 2026-11-07：匿名礼物 6 条，名称/理由/「去看看」三字段齐（随第二组未登录回归一并验收） |
| 9.3 | 登录 A 后生成（带 JWT） | 成功；主机日志 channel=user，无姓名特征 | ✅ 2026-11-06 13:19：PM2 审计两条 `channel:"user"`（blessing count=5 / gift count=6，均 200），日志仅 `hasPerson:true` 无姓名；Nginx 两 POST 200；截图 `t58-9.3-user-channel.png` 礼物名称/理由/去看看三字段齐 |
| 9.4 | 连续请求触发限频 | 收到「请求过于频繁，请稍后再试」中文提示 | ✅ 2026-11-08（开发者拍板认可三层证据，不退出登录眼见）：① 真机 adb shell curl 从手机网络连发 25 次空 body POST（限频在 body 校验/DeepSeek 之前，**零 AI 配额**）——前 24 次 400 bad_json、第 25 次 **429 `{error:{code:'rate_limited',message:'请求过于频繁，请稍后再试'}}`**，anon 24/min 滑动窗口精确生效；② App 映射有单测 `api.test.ts`「429→ratelimit」；③ UI 文案分支已审查：BlessingSection/GiftSection 对 reason=ratelimit 显「请求有点频繁，请稍等一会儿再试」（空态）/「…仍保留上次的…」（有内容）。注：App 不直显服务端 message，按 reason 用本地文案，措辞与服务端不同属设计如此 |
| 9.5 | 断网/主机异常 | 提示与 Edge 通道一致（network/ratelimit/service 三因） | ✅ 2026-11-08 收口：**network 因真机通过**——真断网（飞行+关 WiFi）心意详情祝福区顶部蜜蜡条「当前无网络，暂时不能重新生成；恢复网络后可继续，已有祝福可正常复制」，写入口转只读；**ratelimit 因**见 9.4 真机 429；**service 因**由 api.test.ts「502→service」单测覆盖（生产网关不可停服造 5xx）。三因分类逻辑单测齐全，Edge/上海两通道共用同一 reason 映射，提示口径一致 |
| 9.6 | 数据通道切换（SUPABASE_URL 改子域，9.1–9.5 稳后） | 登录/同步在国内网络不挂代理可用 | ✅ 2026-11-06：冷启动 okhttp 17 条新请求（15×200＋2×201，零 409/4xx/5xx）；五缺陷修复（`dd8a50f`/`34bbae4`）后 Metro 见两条「合并去重」警告、无 ERROR；联系人 UI 自愈（截图 `t58-after-fix-home.png`） |

## 附：T58 验收期真机缺陷修复记录（2026-11-07）

1. **贺卡文案重复（称呼 ×2、署名 ×2）**：服务端提示词鼓励开场称呼、强制尾部落款，与贺卡左上抬头/右下署名叠加。拍板方案 A——Postcard 画面派生根净化：`stripLeadingSalutation`（前缀须紧跟标点，防「大佬」误伤「大佬们好」）、`stripTrailingSignature`（落款须独立成行且全文等于自称），剥后为空则不剥。手写与 AI 同规则（手写弹层预填 AI 原文直接保存是主流路径）；editedText、快照、收藏 payload、一键复制全文一律保留原文。三个渲染点（CardSection/FavoriteCardSheet/SentCardSheet）统一套用，13 例单测覆盖。
2. **手写弹层键盘态面板顶出屏幕**：logcat 实证透明 Modal 的 Dialog 窗口在本机被系统随键盘 resize（overlay 858.7→520.4），与手动 `paddingBottom=键盘高` 双重顶起（sheet y=−81.5）。Sheet 改自适应：`onLayout` 实测 overlay 高度识别 systemResized，resize 设备 padding 归零、maxHeight 按 overlay 封顶；未 resize 设备保留 2026-11-03 老路径。内容区包 ScrollView（`flexShrink:1`）承接超长内容，握把/标题固定。修复后 sheet y=140.95 完整在屏。PersonReminderSheet 同场景复验通过。
3. **冷启动已登录用户误判空库、落 onboarding 空态（2026-11-08，截图 `t58-resume.png`）**：根因是首屏路由守卫（`app/index.tsx` 的 runCheck、`app/onboarding.tsx` 的 checkProfile）在 `authStore.ready=false` 时就执行，只拿到匿名仓储，已登录用户本地人员行因 user_id 作用域不匹配被判空库。修复三点：① `authStore.initialize` 的 `getSession()` 加 5s 兜底 `Promise.race` 超时——挂起时先按未登录放行（ready=true、session=null），避免首屏永久 loading，会话晚到由 `onAuthStateChange` 接回；② index 守卫等 `ready` 后再跑；③ onboarding 拆出纯查询 `queryProfile`，`ready/session` 变化时 useEffect 静默复查，覆盖 ready 晚到与恢复超时后会话晚到两种时序。新增 `authStore.test.ts` 11 例（ready 门控、超时兜底、会话晚到接回、initialize 幂等、中文报错），全量 22 套件 219 测试绿。

## 收口结论

- 全部 ✅ 后：T58 关闭；网关稳定一个版本后再停用旧 Edge 函数（删 Nginx functions 段、删 edge 分支、Dashboard 删函数）。
- 任何 ❌：记录现象→定修复归属→修后重跑相关组，不跳过。
