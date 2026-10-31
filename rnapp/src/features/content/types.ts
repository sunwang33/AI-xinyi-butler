/**
 * AI 内容生成的上下文与错误类型（M6 T30–T32 / M7 T36–T38）。
 *
 * ContentContext 是发送给 Edge Function 的全部人物信息：
 * 只含生成所必需的内容（关系、特征、称呼、自称、日子信息），
 * 不含姓名与出生年份（spec 第 13 条、T30 入参最小化）。
 */
import type {
  FestivalCode,
  GiftSuggestion,
  OccasionType,
  Relation,
} from '../../data/entities';

/** 发送给云函数的人物信息；通用版节日为 null */
export interface ContentPersonInput {
  relation: Relation;
  traits: string[];
  salutation: string | null;
  signature: string | null;
}

/** 发送给云函数的日子信息 */
export interface OccasionInput {
  type: OccasionType;
  /** festival 时必填：六节日中文名 */
  festivalName?: string;
  /** festival 时的代号，客户端保留备用（不参与提示词） */
  festivalCode?: FestivalCode;
  /** anniversary 时必填：档案中的纪念日自定义名 */
  anniversaryName?: string;
  /** anniversary 且填了起始年份时：year - startYear（客户端算好，避免模型推算） */
  anniversaryYears?: number;
}

export interface ContentContext {
  occasion: OccasionInput;
  person: ContentPersonInput | null;
}

/** 生成失败原因分类（驱动「需要网络」等 UI 文案） */
export type ContentErrorReason = 'network' | 'ratelimit' | 'service' | 'bad_response';

export class ContentError extends Error {
  constructor(
    readonly reason: ContentErrorReason,
    message?: string,
  ) {
    super(message ?? reason);
    this.name = 'ContentError';
  }
}

/** 云函数成功响应 */
export type GenerateResponse =
  | { kind: 'blessing'; blessings: string[] }
  | { kind: 'gift'; gifts: GiftSuggestion[] };
