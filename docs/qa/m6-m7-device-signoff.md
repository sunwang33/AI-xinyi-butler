# M6/M7 真机收口记录（2026-10-31）

- 设备：小米 vermeer（23113RKC6C）/ HyperOS；Expo Go 58.0.5；Metro `npx expo start --port 8081 -c`
- 网络：家庭 Wi-Fi + FlClash 局域网代理（国内直连 `*.supabase.co` 被重置，手机 Wi-Fi 手动代理 192.168.124.5:7890）
- 配套质量抽检：[m6-blessing-quality.md](./m6-blessing-quality.md)、[m7-gift-quality.md](./m7-gift-quality.md)
- 回归基线：typecheck 0 错、lint 0、jest 98 例全绿

## 六项验收结果（全部通过）

| # | 验收项 | 结果 | 关键证据 |
| --- | --- | --- | --- |
| 1 | 告知门禁 | ✅ | 首次进入弹告知；同意后自动生成；服务说明页撤回，状态回「尚未同意」；撤回后点重新生成弹层重现；「暂不同意」不发请求、内容不变；再点弹层再现，「同意并生成」正常；礼物区入口同样受控 |
| 2 | 快照固定 / 条数 | ✅ | 杀 App 冷启动读同一快照；条数 3→设置改 5，旧内容保持，重新生成后 5 条；礼物独立按钮固定 6 条 |
| 3 | 复制 / 跳转 | ✅ | 复制到微信逐字完整；淘宝 s.taobao.com、京东 so.m.jd.com 均到搜索结果页且词相关；浏览器返回停留原详情礼物区 |
| 4 | 断网兜底 | ✅ | 无快照新人：需要网络 → 3 次失败出蜜蜡提示+通用祝福；礼物始终不兜底；联网重新生成覆盖。有旧内容断网重试：旧内容保留 + 蜜蜡失败提示；联网后提示消失、内容更新（见 D-3） |
| 5 | 无特征降级 | ✅ | 虚线盒「去补充特征」跳 `/persons/[personId]`；通用版节日无礼物区由线上 `person=null` 400 实测与代码分支覆盖，**UI 复验留 M8**（T40 占位页链路未通） |
| 6 | 就绪邮戳 | ✅ | 两样齐备后主卡红色「心意邮局 1天 已备好」，副文案「祝福语和礼物都已备好」 |

## 真机发现并当场修复的缺陷

### D-1 告知门禁绕过（T28 违规）

- 现象：服务说明页撤回同意后，心意详情点「重新生成」不弹告知，直接发请求。
- 根因：`BlessingSection.tsx`（内容态/失败态 2 处）与 `GiftSection.tsx`（同 2 处）直接 `state.run()`，只有首次生成入口包了 `ensureConsent`。
- 修复：4 处统一 `onPress={() => ensureConsent(() => state.run())}`。
- 回归：修复后走完撤回→弹层→暂不同意→重现→同意生成全流程；jest/lint/typecheck 通过。

### D-2 京东链接丢词

- 现象：点京东「去看看」唤起京东 App 落首页、关键词丢失；浏览器打开 `search.jd.com` 302 到风控页。
- 实证：curl 见 302 Location 跳 `cfe.m.jd.com`；真机浏览器/App 两路均丢词。
- 修复：`src/features/gift/link.ts` 改移动搜索域名 `https://so.m.jd.com/ware/search.action?keyword=...`。
- 回归：真机搜索框带「客户 生日 茶叶 礼盒」，结果为龙井/大红袍茶叶礼盒；link.test.ts 断言更新。

### D-3 有旧内容时断网重试静默（spec 全局规则 3）

- 现象：已有成功内容后断网点「重新生成」，失败后页面无任何提示（旧内容保留本身符合 T34，但不满足全局规则 3「无法生成时页面明确显示」）。
- 修复：`SectionParts.tsx` 抽共用 `NoticeBar`；Blessing/Gift 两区内容态在 `state.error` 时显示蜜蜡提示（区分限频/断网文案）；成功后 notice 清空，提示消失。
- 回归：飞行模式下两区均见提示、旧内容保留；联网重新生成后提示消失、内容更新；98 例测试通过。

### 环境备忘

- 新增原生模块（expo-clipboard）后必须杀掉旧 Metro 进程并 `npx expo start -c` 清缓存，否则 Expo Go 红屏「Cannot find native module 'ExpoClipboard'」。
- 安卓 Wi-Fi 手动代理不写 `settings global http_proxy`（读到 null 不代表未生效）；用 `adb shell dumpsys connectivity | grep HttpProxy` 验证。
