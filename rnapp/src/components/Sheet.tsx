import { PropsWithChildren, useEffect, useState } from 'react';
import {
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { colors, fonts, fontSize, radius } from '../theme/tokens';

/** iOS 用带动画的 will 事件，Android 只有 did 事件可靠 */
const KEYBOARD_SHOW = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
const KEYBOARD_HIDE = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

/**
 * 底部弹层，对应原型 .overlay + .sheet：
 * 半透明遮罩 + 信纸白圆角顶面板、苔绿握把、宋体标题。
 * 点击遮罩可关闭（如删除确认这类强制选择，外部用 dismissable=false 控制）。
 * 键盘避让不用 KeyboardAvoidingView：透明 Modal 在 Android edge-to-edge 下
 * 拿不到 insets（2026-11-03 真机实测 height/padding 均无效），改为直接监听
 * 键盘事件。但设备分两类，须自适应（2026-11-07 小米真机 logcat 实证）：
 * - Dialog 窗口随系统 resize 的设备：overlay 高度自动收缩为「窗口高−键盘高」，
 *   再手动补 paddingBottom 会双重顶起、面板推出屏幕（实测 y=-81.5）。
 *   据 onLayout 实测高度识别（systemResized），padding 归零，maxHeight 按
 *   overlay 实测高度封顶；
 * - 不 resize 的设备（2026-11-03 老结论环境）：保留 paddingBottom=键盘高 的老路径。
 * 另：键盘态内容区包 ScrollView（flexShrink:1）承接超长内容，握把与标题固定不被裁。
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
  // overlay 实测高度：透明 Modal 的 Dialog 窗口在部分设备上会被系统随键盘 resize，
  // 需据此判断要不要手动补 padding（见下方 systemResized）
  const [overlayHeight, setOverlayHeight] = useState(0);
  const { height: windowHeight } = useWindowDimensions();

  // 键盘弹起时，若 overlay 实测高度已收缩到「窗口高−键盘高」附近，说明系统已做
  // resize（2026-11-07 小米真机实证 overlay 858.7→520.4），手动 padding 会双重顶起；
  // 未 resize 的设备（2026-11-03 老结论环境）才需要补 paddingBottom 把面板顶上去。
  const systemResized =
    keyboardHeight > 0 &&
    overlayHeight > 0 &&
    overlayHeight <= windowHeight - keyboardHeight + 10;
  const effectivePadding = systemResized ? 0 : keyboardHeight;
  const sheetMaxHeight = systemResized
    ? overlayHeight - 24
    : windowHeight - keyboardHeight - 24;

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
      <View
        style={[styles.overlay, { paddingBottom: effectivePadding }]}
        onLayout={(e) => setOverlayHeight(e.nativeEvent.layout.height)}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={dismissable ? onClose : undefined} />
        <View
          style={[
            styles.sheet,
            keyboardHeight > 0 && styles.sheetByKeyboard,
            // 键盘态封顶：顶部留 24dp 呼吸量，超出部分由内部 ScrollView 滚动
            keyboardHeight > 0 && { maxHeight: sheetMaxHeight },
          ]}
        >
          <View style={styles.grip} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {/* 短内容不超高时无滚动、视觉零变化；长内容（如手写祝福）键盘弹起时可滚动。
              flexShrink:1 不可省：maxHeight 父容器内 Yoga 需显式许可，ScrollView
              才会把超出部分收为内部滚动，而不是把握把/标题挤出可视区（Android 实测坑） */}
          <ScrollView
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            style={{ flexShrink: 1 }}
          >
            {children}
          </ScrollView>
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
