import { PropsWithChildren } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, fontSize, radius } from '../theme/tokens';

/**
 * 底部弹层，对应原型 .overlay + .sheet：
 * 半透明遮罩 + 信纸白圆角顶面板、苔绿握把、宋体标题。
 * 点击遮罩可关闭（如删除确认这类强制选择，外部用 dismissable=false 控制）。
 */
export function Sheet({
  visible,
  title,
  onClose,
  dismissable = true,
  children,
}: PropsWithChildren<{
  visible: boolean;
  title?: string;
  onClose?: () => void;
  dismissable?: boolean;
}>) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismissable ? onClose : undefined}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismissable ? onClose : undefined} />
        <View style={styles.sheet}>
          <View style={styles.grip} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {children}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.mask,
  },
  sheet: {
    backgroundColor: colors.paper,
    borderTopLeftRadius: radius.sheet,
    borderTopRightRadius: radius.sheet,
    paddingHorizontal: 22,
    paddingTop: 18,
    paddingBottom: 26,
    marginHorizontal: 10,
    marginBottom: 10,
  },
  grip: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.sage,
    alignSelf: 'center',
    marginBottom: 16,
  },
  title: {
    fontFamily: fonts.serif,
    fontSize: fontSize.title3,
    color: colors.ink,
    marginBottom: 9,
  },
});
