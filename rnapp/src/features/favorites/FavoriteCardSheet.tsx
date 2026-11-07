/**
 * 收藏分区 · 贺卡「导出图片」预览弹层（M10 T49）。
 *
 * 贺卡收藏不存图片，只存模板与图文参数（CardPayload）。点「导出图片」时：
 * - 按收藏行的日子定位字段 ＋ year 重新派生完整日期（生日 / 纪念日需查一次库，
 *   这两类收藏行随人或纪念日级联删除，能读到就一定查得到）；
 * - 用收藏那一刻的模板 / 称呼 / 祝福 / 自称在弹层里重渲一张 Postcard（所见即所导出）；
 * - 截图 / 存相册 / 系统分享完全复用 M9 T46 已真机验收的链路与权限纪律。
 *
 * 弹层内容按收藏行 id 作为 key 重挂：切换到另一张卡时是全新实例，dateFull
 * 自然从「加载中」开始，effect 内只做异步回填（避免在 effect 体里同步 setState）。
 */
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Text, View } from 'react-native';
import { Button, Sheet } from '../../components';
import type { CardPayload, Favorite } from '../../data/entities';
import { getRepository } from '../../data/repository';
import {
  Postcard,
  stripLeadingSalutation,
  stripTrailingSignature,
  type CardArtHost,
} from '../card/Postcard';
import { captureCardArt, saveCardToLibrary, shareCardImage } from '../card/export';
import { getCardTemplate } from '../card/templates';
import { colors, fonts, fontSize, spacing } from '../../theme/tokens';
import { favoriteCardDate } from './restore';

export function FavoriteCardSheet({
  favorite,
  onClose,
}: {
  /** 传 null 表示关闭；为某条贺卡收藏时渲染该卡 */
  favorite: Favorite | null;
  onClose: () => void;
}) {
  return (
    <Sheet visible={favorite !== null} title="导出这张贺卡" onClose={onClose}>
      {favorite && favorite.kind === 'card' ? (
        <CardExportBody key={favorite.id} favorite={favorite} />
      ) : null}
    </Sheet>
  );
}

function CardExportBody({ favorite }: { favorite: Favorite }) {
  const payload = favorite.payload as CardPayload;
  const artRef = useRef<CardArtHost>(null);
  // 初始即加载态；按 favorite.id 重挂，故无需在 effect 里同步复位
  const [dateFull, setDateFull] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'share' | null>(null);
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [deniedVisible, setDeniedVisible] = useState(false);

  // 派生贺卡完整日期（festival 同步、birthday / anniversary 查库），每实例只跑一次
  useEffect(() => {
    let active = true;
    getRepository()
      .then((repo) => favoriteCardDate(repo, favorite))
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

  const template = getCardTemplate(payload.template_code);
  const to = payload.salutation.trim() ? payload.salutation.trim() : null;
  const wish = payload.text.trim() ? payload.text.trim() : null;
  const sign = payload.signature?.trim() ? payload.signature.trim() : null;

  const flash = (text: string) => {
    setNotice({ kind: 'ok', text });
    setTimeout(() => setNotice((cur) => (cur?.text === text ? null : cur)), 1800);
  };

  // 与心意详情贺卡分区一致：每次按当前画面实时截图，再存或分享
  const runExport = async (mode: 'save' | 'share') => {
    if (busy || !artRef.current) {
      return;
    }
    setBusy(mode);
    setNotice(null);
    try {
      const uri = await captureCardArt(artRef);
      if (mode === 'save') {
        const result = await saveCardToLibrary(uri);
        if (result.ok) {
          flash('已保存到手机相册');
        } else if (result.reason === 'denied') {
          setDeniedVisible(true);
        } else {
          setNotice({ kind: 'err', text: '这次没能存进相册，请稍后再试，或改用分享。' });
        }
      } else {
        const result = await shareCardImage(uri);
        if (!result.ok) {
          setNotice({ kind: 'err', text: '暂时调不起系统分享，请稍后再试。' });
        }
      }
    } catch (e) {
      console.warn('[T49] captureCardArt failed:', e instanceof Error ? e.message : String(e));
      setNotice({ kind: 'err', text: '图片生成失败，请稍后再试。' });
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {dateFull === null ? (
        <View style={{ paddingVertical: spacing.xl, alignItems: 'center' }}>
          <ActivityIndicator color={colors.pine} />
        </View>
      ) : (
        <>
          {/* 纯成品（无纸脚操作区），截图目标即此艺术区 */}
          <Postcard
            template={template}
            dateFull={dateFull}
            to={to}
            wish={stripTrailingSignature(stripLeadingSalutation(wish, to), sign)}
            sign={sign}
            artRef={artRef}
          />

          <View style={{ flexDirection: 'row', gap: 10, marginTop: 11 }}>
            <Button
              title="保存到手机"
              size="sm"
              style={{ flex: 1 }}
              loading={busy === 'save'}
              disabled={busy !== null}
              onPress={() => void runExport('save')}
            />
            <Button
              title="经系统分享发送"
              size="sm"
              variant="ghost"
              style={{ flex: 1 }}
              loading={busy === 'share'}
              disabled={busy !== null}
              onPress={() => void runExport('share')}
            />
          </View>
          {notice ? (
            <Text
              style={{
                fontFamily: fonts.sans,
                fontSize: fontSize.footnote,
                color: notice.kind === 'ok' ? colors.pineDeep : colors.honeyDeep,
                textAlign: 'center',
                marginTop: spacing.sm,
              }}
            >
              {notice.text}
            </Text>
          ) : null}
        </>
      )}

      {/* 相册保存权限被拒降级：去系统设置 / 改用分享（与 T46 一致）。
          用独立 Modal 承载，避免与外层 Sheet 嵌套冲突。 */}
      {deniedVisible ? (
        <Sheet visible title="保存到相册需要权限" onClose={() => setDeniedVisible(false)}>
          <Text
            style={{
              fontFamily: fonts.sans,
              fontSize: fontSize.base,
              lineHeight: 24,
              color: colors.inkSoft,
              marginBottom: spacing.md,
            }}
          >
            保存到手机相册的权限没有开启。可以去系统设置里打开；也可以直接用系统分享面板发送——在面板里同样能保存图片，且不需要相册权限。
          </Text>
          <Button
            title="去系统设置开启"
            block
            onPress={() => {
              setDeniedVisible(false);
              void Linking.openSettings();
            }}
          />
          <Button
            title="改用分享发送"
            variant="ghost"
            size="sm"
            block
            style={{ marginTop: spacing.sm }}
            onPress={() => {
              setDeniedVisible(false);
              void runExport('share');
            }}
          />
        </Sheet>
      ) : null}
    </>
  );
}
