/**
 * 已送出贺卡的只读回看弹层（M11 T52/T70；G-A4 拍板：第一版只读图文预览，不提供导出）。
 *
 * 贺卡记录不存图片，只存模板与图文参数（CardPayload）。打开时按记录的日子定位字段
 * ＋ year 重新派生完整日期（生日 / 纪念日需查一次库；这两类记录随人或纪念日级联删除，
 * 能读到就一定查得到），用标记那一刻的模板 / 称呼 / 祝福 / 自称重渲一张 Postcard。
 * 弹层内容按记录 id 作为 key 重挂：切到另一张卡时是全新实例，dateFull 自然从
 * 「加载中」开始，effect 内只做异步回填（避免在 effect 体里同步 setState）。
 */
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Sheet } from '../../components';
import type { CardPayload, SentRecord } from '../../data/entities';
import { getRepository } from '../../data/repository';
import { Postcard } from '../card/Postcard';
import { getCardTemplate } from '../card/templates';
import { colors, fonts, fontSize, spacing } from '../../theme/tokens';
import { favoriteCardDate } from '../favorites/restore';

export function SentCardSheet({
  record,
  onClose,
}: {
  /** null 表示关闭；为某条贺卡记录时只读重渲该卡 */
  record: SentRecord | null;
  onClose: () => void;
}) {
  return (
    <Sheet visible={record !== null} title="寄出的贺卡" onClose={onClose}>
      {record && record.kind === 'card' ? <CardPreviewBody key={record.id} record={record} /> : null}
    </Sheet>
  );
}

function CardPreviewBody({ record }: { record: SentRecord }) {
  const payload = record.payload as CardPayload;
  // 初始即加载态；按 record.id 重挂，故无需在 effect 里同步复位
  const [dateFull, setDateFull] = useState<string | null>(null);

  // 派生贺卡完整日期（festival 同步、birthday / anniversary 查库），每实例只跑一次
  useEffect(() => {
    let active = true;
    getRepository()
      .then((repo) => favoriteCardDate(repo, record))
      .then((date) => {
        if (active) {
          setDateFull(date);
        }
      })
      .catch(() => {
        if (active) {
          setDateFull('');
        }
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (dateFull === null) {
    return (
      <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
        <ActivityIndicator color={colors.pine} />
      </View>
    );
  }

  const template = getCardTemplate(payload.template_code);
  const to = payload.salutation.trim() ? payload.salutation.trim() : null;
  const wish = payload.text.trim() ? payload.text.trim() : null;
  const sign = payload.signature?.trim() ? payload.signature.trim() : null;

  return (
    <>
      {/* 只读成品：不传 onEditWish / footer / artRef，不可编辑、不可导出（G-A4） */}
      <Postcard template={template} dateFull={dateFull} to={to} wish={wish} sign={sign} />
      <Text
        style={{
          fontFamily: fonts.sans,
          fontSize: fontSize.footnote,
          lineHeight: 18,
          color: colors.inkFaint,
          textAlign: 'center',
          marginTop: spacing.sm,
        }}
      >
        这是标记送出那一刻保存的贺卡样子，仅供回看。
      </Text>
    </>
  );
}
