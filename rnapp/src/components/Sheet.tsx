import { PropsWithChildren, useEffect, useState } from 'react';
import { Keyboard, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, fonts, fontSize, radius } from '../theme/tokens';

/** iOS 用带动画的 will 事件，Android 只有 did 事件可靠 */
const KEYBOARD_SHOW = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const KEYBOARD_HIDE = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

/**
 * 底部弹层，对应原型 .overlay + .sheet：
 * 半透明遮罩 + 信纸白圆角顶面板、苔绿握把、宋体标题。
 * 点击遮罩可关闭（如删除确认这类强制选择，外部用 dismissable=false 控制）。
 * 键盘避让不用 KeyboardAvoidingView：透明 Modal 在 Android edge-to-edge 下
 * 窗口不 resize、拿不到 insets（2026-11-03 真机实测 height/padding 均无效），
 * 改为直接监听键盘事件，按键盘高度给容器加 paddingBottom 把面板顶上去。
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
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  useEffect(() => {
    if (!visible) return undefined;
    const showSub = Keyboard.addListener(KEYBOARD_SHOW, (e) => setKeyboardHeight(e.endCoordinates.height));
    const hideSub = Keyboard.addListener(KEYBOARD_HIDE, () => setKeyboardHeight(0));
    // 随取消订阅复位键盘高度，避免下次打开还停在「顶起态」
    return () => {
      showSub.remove();
      hideSub.remove();
      setKeyboardHeight(0);
    };
  }, [visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={dismissable ? onClose : undefined}>
      <View style={[styles.overlay, { paddingBottom: keyboardHeight }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={dismissable ? onClose : undefined} />
        <View style={[styles.sheet, keyboardHeight > 0 && styles.sheetByKeyboard]}>
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
  sheetByKeyboard: {
    // 键盘弹起时紧贴键盘顶（paddingBottom 已等于键盘高度）
    marginBottom: 0,
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
