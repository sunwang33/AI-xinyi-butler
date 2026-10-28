import { PlaceholderScreen } from '../src/components';

/**
 * 服务说明（plan 3.1 /service-notice）
 * 设置页常驻入口；说明姓名特征等信息发送至 AI 服务的用途，M12 补充账号与云端说明。
 */
export default function ServiceNoticeScreen() {
  return (
    <PlaceholderScreen
      title="服务说明"
      route="/service-notice"
      description="说明生成祝福与礼物建议时，联系人的姓名与特征描述会发送到 AI 服务处理及用途；说明「生成一次、当年固定」的快照规则、离线时的可用范围；账号信息与云端数据用途在 M12 补充。"
      milestone="M6 · T29 实现"
    />
  );
}
