/**
 * 网关纯逻辑自测（node --test，零依赖）：
 * 入参校验、模型结果解析、限频窗口。提示词构造不在此断言（改提示词不应弄挂测试）。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateRequest } from '../src/types.js';
import { parseBlessings, parseGifts, extractJson } from '../src/prompt.js';
import { createLimiter } from '../src/rateLimit.js';

const validBlessingBody = {
  kind: 'blessing',
  count: 3,
  occasion: { type: 'birthday' },
  person: { relation: '家人', traits: ['喜欢喝茶'], salutation: '爸爸', signature: '小明' },
};

test('生日祝福合法请求通过归一化', () => {
  const v = validateRequest(validBlessingBody);
  assert.equal(v.kind, 'blessing');
  assert.equal(v.count, 3);
  assert.equal(v.person.traits[0], '喜欢喝茶');
});

test('非法 kind / occasion / relation 被拒', () => {
  assert.throws(() => validateRequest({ ...validBlessingBody, kind: 'poem' }), /kind/);
  assert.throws(() => validateRequest({ ...validBlessingBody, occasion: { type: 'newyear' } }), /type/);
  assert.throws(
    () => validateRequest({ ...validBlessingBody, person: { ...validBlessingBody.person, relation: '同事' } }),
    /relation/,
  );
});

test('生日不允许无具体人；通用版节日允许匿名', () => {
  assert.throws(() => validateRequest({ ...validBlessingBody, person: null }), /具体的人/);
  const generic = validateRequest({
    kind: 'blessing',
    occasion: { type: 'festival', festivalName: '中秋' },
    person: null,
  });
  assert.equal(generic.person, null);
});

test('礼物必须有人且 count 强制为 6；通用版节日礼物被拒', () => {
  const gift = validateRequest({
    kind: 'gift',
    occasion: { type: 'birthday' },
    person: { relation: '挚友', traits: [], salutation: null, signature: null },
  });
  assert.equal(gift.count, 6);
  assert.throws(
    () =>
      validateRequest({
        kind: 'gift',
        occasion: { type: 'festival', festivalName: '春节' },
        person: null,
      }),
    /必须有具体对象/,
  );
});

test('特征最多取 5 条；超长字段被拒', () => {
  const v = validateRequest({
    ...validBlessingBody,
    person: {
      ...validBlessingBody.person,
      traits: Array.from({ length: 8 }, (_, i) => `特征${i}`),
    },
  });
  assert.equal(v.person.traits.length, 5);
  assert.throws(
    () => validateRequest({ ...validBlessingBody, person: { ...validBlessingBody.person, salutation: 'x'.repeat(21) } }),
    /salutation/,
  );
});

test('count 越界被拒', () => {
  assert.throws(() => validateRequest({ ...validBlessingBody, count: 11 }), /count/);
  assert.throws(() => validateRequest({ ...validBlessingBody, count: 0 }), /count/);
});

test('parseBlessings 条数必须精确；parseGifts 至少 5 个且三字段齐全', () => {
  assert.equal(parseBlessings({ blessings: ['a', 'b'] }, 2).length, 2);
  assert.throws(() => parseBlessings({ blessings: ['a'] }, 2), /条数不合规/);
  assert.throws(() => parseBlessings({ blessings: ['a', '  '] }, 2), /空祝福/);

  const gifts = parseGifts({
    gifts: Array.from({ length: 5 }, () => ({ name: 'n', reason: 'r', search_term: 's' })),
  });
  assert.equal(gifts.length, 5);
  assert.throws(() => parseGifts({ gifts: [{ name: 'n', reason: 'r' }] }), /条数不足/);
  assert.throws(
    () => parseGifts({ gifts: Array.from({ length: 5 }, () => ({ name: 'n', reason: '', search_term: 's' })) }),
    /字段缺失/,
  );
});

test('extractJson 容忍 ```json 围栏', () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
});

test('滑动窗口：窗口内超 max 拒绝，滑出后恢复', () => {
  const limiter = createLimiter({ windowMs: 1000, max: 2 });
  assert.equal(limiter.allow('k', 0), true);
  assert.equal(limiter.allow('k', 100), true);
  assert.equal(limiter.allow('k', 200), false);
  // 键之间互不影响
  assert.equal(limiter.allow('other', 200), true);
  // 首条滑出窗口后恢复
  assert.equal(limiter.allow('k', 1001), true);
});
