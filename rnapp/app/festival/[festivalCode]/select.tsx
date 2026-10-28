import { PlaceholderScreen } from '../../../src/components';

/**
 * 节日选人页（plan 3.1 /festival/[festivalCode]/select，query: year）
 * 可选一位已录入的人查看定制心意，也可不选人直接看通用版；
 * 未录入任何人时也能直接进入通用版，不出现空白页。
 */
export default function FestivalSelectScreen() {
  return (
    <PlaceholderScreen
      title="节日选人"
      route="/festival/[festivalCode]/select?year="
      description="选择一位已录入的人查看「节日 + 这个人」的心意；也可不选人直接查看通用版（仅祝福与贺卡、不含礼物建议）。festivalCode 对应六个内置节日：元旦、情人节、母亲节、父亲节、感恩节、圣诞节。"
      milestone="M8 · T40 实现"
    />
  );
}
