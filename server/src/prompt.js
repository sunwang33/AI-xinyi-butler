/**
 * 提示词构造与模型结果解析（T57 由 Edge Function prompt.ts 原样移植，提示词一字未改）。
 */

const RELATION_HINT = {
  家人: '对方是用户的家人：语气温暖体贴，可以关心身体、生活与陪伴。',
  挚友: '对方是用户的挚友：语气亲近自然，可以轻松、带点幽默，像好朋友说的话。',
  客户:
    '对方是用户的客户：语气得体、有分寸，可以祝愿事业顺遂、合作长久，绝不狎昵、不开冒昧的玩笑。',
  其他: '对方与用户是其他关系：语气礼貌、真诚，保持恰当的距离感。',
};

/** 组装「日子」描述段 */
function occasionLine(req) {
  const o = req.occasion;
  if (o.type === 'birthday') return '日子：生日。';
  if (o.type === 'anniversary') {
    const years =
      typeof o.anniversaryYears === 'number' ? `（今年是第 ${o.anniversaryYears} 周年）` : '';
    return `日子：纪念日「${o.anniversaryName}」${years}。`;
  }
  return `日子：通用节日「${o.festivalName}」，内容必须体现这个节日的主题与典型情境。`;
}

/** 组装「对象」描述段；通用版节日无人时返回 null */
function personLines(req) {
  const p = req.person;
  if (!p) {
    return null;
  }
  const lines = [RELATION_HINT[p.relation] ?? RELATION_HINT.其他];
  if (p.traits.length > 0) {
    lines.push(
      `对方的特征（只允许使用这些信息，不得编造）：\n${p.traits
        .map((t, i) => `${i + 1}. ${t}`)
        .join('\n')}`,
    );
  } else {
    lines.push(
      '对方没有填写任何特征：请写「通用但真诚」的版本，只依据关系与日子，不得虚构对方的爱好、职业或经历。',
    );
  }
  if (p.salutation) {
    lines.push(`用户平时这样称呼对方：${p.salutation}（祝福中可以自然使用这个称呼）。`);
  }
  if (p.signature) {
    lines.push(`用户的自称是「${p.signature}」：每条祝福必须在末尾另起一行落款「——${p.signature}」。`);
  } else {
    lines.push('用户没有提供自称：一律不得落款，也不要出现「你的 XX」之类的署名暗示。');
  }
  return lines;
}

/** 按 kind 构造 system / user 消息 */
export function buildPrompt(kind, req) {
  const occasion = occasionLine(req);
  const person = personLines(req);

  if (kind === 'blessing') {
    const system = [
      '你是「AI 心意管家」的祝福文案助手。用户会给自己在乎的人准备生日、纪念日或节日祝福，由你代拟。',
      '文字要真诚、具体、像真人写的话，不要空话套话堆砌。',
      '铁律：',
      '1. 只依据用户给出的信息写作，严禁编造未提供的职业、爱好、经历；',
      '2. 严禁出现具体年龄、岁数、「X 岁」「大寿」等任何年龄表述，也不要根据年份推算年龄；',
      '3. 有「自称」时每条祝福末尾另起一行落款「——{自称}」；没有自称时一律不落款；',
      '4. 纪念日只有明确给出周年数时才可写「N 周年」，只给名称时只围绕名称写，绝不杜撰年份；',
      '5. 节日祝福必须体现该节日的主题与典型情境；',
      '6. 每条必须至少结合一条人物特征，或明显贴合关系与日子；',
      '7. 每条 30–90 字，完整可直接复制发送；不要编号、不要引号包裹、不要「祝福一：」之类前缀；',
      '8. 只输出 JSON 对象：{"blessings":["文案1","文案2"]}，不要输出任何解释或 Markdown 代码块。',
    ].join('\n');

    const userLines = [
      occasion,
      person
        ? person.join('\n')
        : '这是不针对具体某个人的通用版节日祝福：面向大多数人都适用，但要具体贴合这个节日，避免空泛口号。',
      `请写 ${req.count} 条彼此风格不同的祝福，以 JSON 对象输出。`,
    ];
    return { system, user: userLines.join('\n\n') };
  }

  const system = [
    '你是「AI 心意管家」的礼物建议助手。用户要为在乎的人挑选礼物，由你给出可立刻去电商搜索的方向。',
    '铁律：',
    '1. 只依据提供的关系、特征与日子给建议，严禁编造对方信息，不出现任何年龄表述；',
    '2. 给出 6 个建议，覆盖不同品类与价位带，彼此明显不同；每条都要能由人物特征或日子主题推出理由；',
    '3. 同一节日下，特征不同的两个人，建议必须有明显差异；',
    '4. 不写价格数字，不指定具体品牌或店铺；可以写「礼盒」「实用」等方向词；',
    '5. reason 一句话（不超过 40 字），说明「为什么适合 TA」，必须点到一条特征或日子主题；',
    '6. search_term 是国内电商搜索词：2–6 个词，不要平台名，要带上对象/场景关键词（如「妈妈 颈椎 按摩仪」「客户 商务 钢笔 礼盒」）；',
    '7. 只输出 JSON 对象：{"gifts":[{"name":"","reason":"","search_term":""}]}，不要输出任何解释或 Markdown 代码块。',
  ].join('\n');

  const userLines = [occasion, person.join('\n'), '请给 6 个礼物建议，以 JSON 对象输出。'];
  return { system, user: userLines.join('\n\n') };
}

/** 从模型返回文本中提取 JSON（容忍模型偶尔输出 ```json 包裹） */
export function extractJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : trimmed);
}

/** 校验祝福结果：非空字符串数组，长度必须等于请求条数 */
export function parseBlessings(data, count) {
  if (typeof data !== 'object' || data === null) throw new Error('模型返回不是对象');
  const list = data.blessings;
  if (!Array.isArray(list) || list.length !== count) {
    throw new Error(`祝福条数不合规：期望 ${count}，实际 ${Array.isArray(list) ? list.length : '非数组'}`);
  }
  return list.map((item) => {
    if (typeof item !== 'string') throw new Error('祝福元素不是字符串');
    const text = item.trim();
    if (text.length === 0) throw new Error('存在空祝福');
    return text;
  });
}

/** 校验礼物结果：至少 5 个，每项三字段齐全 */
export function parseGifts(data) {
  if (typeof data !== 'object' || data === null) throw new Error('模型返回不是对象');
  const list = data.gifts;
  if (!Array.isArray(list) || list.length < 5) {
    throw new Error(`礼物条数不足：期望 ≥5，实际 ${Array.isArray(list) ? list.length : '非数组'}`);
  }
  return list.slice(0, 8).map((item) => {
    if (typeof item !== 'object' || item === null) throw new Error('礼物元素不是对象');
    const name = typeof item.name === 'string' ? item.name.trim() : '';
    const reason = typeof item.reason === 'string' ? item.reason.trim() : '';
    const search_term = typeof item.search_term === 'string' ? item.search_term.trim() : '';
    if (!name || !reason || !search_term) throw new Error('礼物字段缺失');
    return { name, reason, search_term };
  });
}
