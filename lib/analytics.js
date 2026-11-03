// Scoring, event study and indicator derivation for dsh-market-radar.
// These are deliberately transparent heuristics, not investment advice.

import { round } from './data.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const pct1 = (n) => (Number.isFinite(n) ? `${n > 0 ? '+' : ''}${n.toFixed(2)}%` : '—');

// ---------------------------------------------------------------------------
// Announcement classification

const ANN_RULES = [
  {
    re: /终止.{0,12}(重组|收购|定增|发行)|(重组|收购|定增|发行).{0,12}(终止|失败|撤回)/,
    category: '重组终止',
    base: 86,
    direction: -1,
    tag: '利空',
  },
  {
    re: /(立案|行政处罚|处罚决定|监管函|警示函|纪律处分|退市风险|终止上市|破产|失信|被冻结|司法冻结)/,
    category: '监管风险',
    base: 80,
    direction: -1,
    tag: '利空',
  },
  {
    re: /(问询函|关注函|诉讼|仲裁|事故|停产|召回|爆炸|火灾)/,
    category: '风险事件',
    base: 70,
    direction: -1,
    tag: '利空',
  },
  {
    re: /(重大资产重组|发行股份购买资产|重组预案|重组报告书)/,
    category: '重大重组',
    base: 82,
    direction: 1,
    tag: '利好',
  },
  {
    re: /(控制权|实际控制人).{0,8}(变更|拟变更|转让)/,
    category: '控制权变更',
    base: 74,
    direction: 1,
    tag: '待观察',
  },
  {
    re: /(收购|购买资产|对外投资|增资)/,
    category: '收购扩张',
    base: 66,
    direction: 1,
    tag: '利好',
  },
  {
    re: /(重大合同|重大经营合同|中标|预中标|签订.{0,10}合同|订单)/,
    category: '订单合同',
    base: 68,
    direction: 1,
    tag: '利好',
  },
  {
    re: /(业绩预增|预盈|扭亏|净利润.{0,8}增长|同比增长)/,
    category: '业绩向好',
    base: 66,
    direction: 1,
    tag: '利好',
  },
  {
    re: /(业绩预减|预亏|首亏|净利润.{0,8}下降|同比下降)/,
    category: '业绩承压',
    base: 68,
    direction: -1,
    tag: '利空',
  },
  {
    re: /(业绩预告|业绩快报|年度报告|半年度报告|季度报告)/,
    category: '定期报告',
    base: 50,
    direction: 0,
    tag: '待观察',
  },
  {
    re: /(回购|回购股份|注销)/,
    category: '股份回购',
    base: 58,
    direction: 1,
    tag: '利好',
  },
  {
    re: /(增持|拟增持|增持计划)/,
    category: '股东增持',
    base: 56,
    direction: 1,
    tag: '利好',
  },
  {
    re: /(减持|拟减持|减持计划)/,
    category: '股东减持',
    base: 58,
    direction: -1,
    tag: '利空',
  },
  {
    re: /(解禁|限售股上市流通)/,
    category: '限售解禁',
    base: 46,
    direction: -1,
    tag: '利空',
  },
  {
    re: /(质押|补充质押|股权质押)/,
    category: '股权质押',
    base: 42,
    direction: -1,
    tag: '利空',
  },
  {
    re: /(定增|向特定对象发行|可转债|配股|发行 GDR)/,
    category: '再融资',
    base: 38,
    direction: 0,
    tag: '待观察',
  },
  {
    re: /(分红|利润分配|权益分派)/,
    category: '利润分配',
    base: 36,
    direction: 1,
    tag: '利好',
  },
  {
    re: /(股权激励|员工持股|限制性股票)/,
    category: '股权激励',
    base: 42,
    direction: 1,
    tag: '利好',
  },
  {
    re: /(战略合作|框架协议|合作协议|签约)/,
    category: '战略合作',
    base: 54,
    direction: 1,
    tag: '利好',
  },
  {
    re: /(涨价|提价|上调价格|价格上调)/,
    category: '产品涨价',
    base: 52,
    direction: 1,
    tag: '利好',
  },
  {
    re: /(获批|批准|注册证|临床|专利|认证)/,
    category: '进展获批',
    base: 50,
    direction: 1,
    tag: '利好',
  },
  {
    re: /(股票交易异常波动|风险提示)/,
    category: '异动提示',
    base: 40,
    direction: 0,
    tag: '待观察',
  },
  {
    re: /(澄清|媒体报道)/,
    category: '传闻澄清',
    base: 34,
    direction: 0,
    tag: '待观察',
  },
  {
    re: /(董事会|监事会|股东大会|章程|换届|选举)/,
    category: '公司治理',
    base: 12,
    direction: 0,
    tag: '中性',
  },
];

export function classifyAnnouncement(title) {
  const text = String(title || '');
  const matches = ANN_RULES.filter((r) => r.re.test(text));
  if (!matches.length) {
    return { category: '一般公告', base: 10, direction: 0, tag: '中性', tags: [] };
  }
  matches.sort((a, b) => b.base - a.base);
  const top = matches[0];
  const tags = Array.from(new Set(matches.map((m) => m.category))).slice(0, 3);
  // A negative event inside an otherwise positive title (e.g. 终止重组) wins above.
  return {
    category: top.category,
    base: top.base,
    direction: top.direction,
    tag: top.tag,
    tags,
  };
}

export function scoreAnnouncement(ann, quote, event) {
  const c = classifyAnnouncement(ann.title);
  let score = c.base;
  const reaction = event && Number.isFinite(event.car3) ? event.car3 : quote && Number.isFinite(quote.pct) ? quote.pct : null;
  if (reaction !== null) score += Math.min(16, Math.abs(reaction) * 4.2);
  if (event && Number.isFinite(event.volRatio) && event.volRatio > 1) {
    score += Math.min(8, (event.volRatio - 1) * 3.5);
  }
  const ageH = (Date.now() - ann.time) / 3600000;
  score += ageH < 6 ? 4 : ageH < 24 ? 2 : ageH < 72 ? 1 : 0;
  if (event && event.pending) score -= 3;
  let note = '';
  if (event && Number.isFinite(event.car3)) {
    if (c.direction > 0 && event.car3 < -1.5) {
      score -= 6;
      note = '市场不买账';
    } else if (c.direction < 0 && event.car3 > 1.5) {
      score -= 4;
      note = '利空钝化';
    }
  }
  score = clamp(Math.round(score), 5, 99);
  const level = score >= 75 ? '高' : score >= 55 ? '中' : '低';
  return {
    ...c,
    score,
    level,
    note,
    directionLabel: c.direction > 0 ? '利好' : c.direction < 0 ? '利空' : '中性',
  };
}

// ---------------------------------------------------------------------------
// Event study (market-adjusted)

export function eventStudy(kline, indexKline, annTime) {
  if (!Array.isArray(kline) || kline.length < 12 || !Array.isArray(indexKline) || !indexKline.length) return null;
  const dates = kline.map((k) => k.date);
  const indexByDate = new Map(indexKline.map((k) => [k.date, k]));
  const annDate = new Date(Number(annTime) + 8 * 3600000).toISOString().slice(0, 10);
  const hour = new Date(Number(annTime) + 8 * 3600000).getUTCHours();
  let pos = dates.findIndex((d) => (hour >= 15 ? d > annDate : d >= annDate));
  if (pos < 0) pos = dates.length - 1;
  const ab = (i) => {
    if (i < 0 || i >= kline.length) return null;
    const idx = indexByDate.get(kline[i].date);
    if (!idx || !Number.isFinite(kline[i].pct) || !Number.isFinite(idx.pct)) return null;
    return kline[i].pct - idx.pct;
  };
  const sum = (from, to) => {
    let s = 0;
    let n = 0;
    for (let i = from; i <= to; i++) {
      const v = ab(i);
      if (v !== null) {
        s += v;
        n++;
      }
    }
    return n ? { value: s, n } : null;
  };
  const d0 = ab(pos);
  const c1 = sum(pos, pos + 1);
  const c3 = sum(pos, pos + 3);
  const post5 = sum(pos + 1, pos + 5);
  const pre5 = sum(pos - 5, pos - 1);
  const volWindow = kline.slice(Math.max(0, pos - 5), pos).map((k) => k.volume).filter((v) => v > 0);
  const avgVol = volWindow.length ? volWindow.reduce((a, b) => a + b, 0) / volWindow.length : null;
  const volRatio = avgVol && kline[pos] ? kline[pos].volume / avgVol : null;
  const idxBefore = indexByDate.get(kline[Math.max(0, pos - 1)].date);
  const idxStart = indexByDate.get(kline[Math.max(0, pos - 6)].date);
  const runUpStock =
    pos >= 6 && kline[pos - 6] && kline[pos - 1] ? (kline[pos - 1].close / kline[pos - 6].close - 1) * 100 : null;
  const runUpIndex =
    idxStart && idxBefore ? (idxBefore.close / idxStart.close - 1) * 100 : null;
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  return {
    eventDate: kline[pos].date,
    pos,
    d0: d0 === null ? null : round(d0, 2),
    car1: c1 ? round(c1.value, 2) : null,
    car3: c3 ? round(c3.value, 2) : null,
    pre5: pre5 ? round(pre5.value, 2) : null,
    post5: post5 ? round(post5.value, 2) : null,
    volRatio: volRatio === null ? null : round(volRatio, 2),
    runUp: runUpStock === null ? null : round(runUpStock - (runUpIndex || 0), 2),
    availableDays: c3 ? c3.n : 0,
    pending: kline[pos].date >= today,
    quotePct: kline[pos].pct,
  };
}

// ---------------------------------------------------------------------------
// Company indicators

function mean(values) {
  const xs = values.filter((v) => Number.isFinite(v));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

function std(values) {
  const m = mean(values);
  if (m === null) return null;
  const xs = values.filter((v) => Number.isFinite(v));
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(1, xs.length - 1));
}

function retOver(kline, n) {
  if (!kline || kline.length <= n) return null;
  const last = kline[kline.length - 1];
  const prev = kline[kline.length - 1 - n];
  if (!last || !prev || !prev.close) return null;
  return (last.close / prev.close - 1) * 100;
}

function maxDrawdown(kline, n) {
  const rows = kline.slice(-n);
  if (rows.length < 2) return null;
  let peak = rows[0].close;
  let mdd = 0;
  for (const row of rows) {
    if (row.close > peak) peak = row.close;
    if (peak > 0) mdd = Math.min(mdd, (row.close / peak - 1) * 100);
  }
  return mdd;
}

function ma(kline, n) {
  const rows = kline.slice(-n);
  if (rows.length < n) return null;
  return mean(rows.map((r) => r.close));
}

export function computeIndicators(quote, kline, indexKline, announcements) {
  const last = kline[kline.length - 1] || null;
  const pct = quote && Number.isFinite(quote.pct) ? quote.pct : last ? last.pct : null;
  const ret20 = retOver(kline, 20);
  const ret60 = retOver(kline, 60);
  const idx20 = retOver(indexKline, 20);
  const idx60 = retOver(indexKline, 60);
  const vol60 = (() => {
    const rows = kline.slice(-61, -1);
    if (rows.length < 20) return null;
    return std(rows.map((r) => r.pct)) * Math.sqrt(252);
  })();
  const mdd60 = maxDrawdown(kline, 60);
  const ma20 = ma(kline, 20);
  const ma60 = ma(kline, 60);
  const main5 = (quote?.mainHistory || []).reduce((s, r) => s + (Number(r.mainNetAmt) || 0), 0);
  const lastEvent = (announcements || [])
    .map((a) => eventStudy(kline, indexKline, a.time))
    .filter(Boolean)
    .sort((a, b) => b.pos - a.pos)[0] || null;
  const rs20 = ret20 !== null && idx20 !== null ? ret20 - idx20 : null;
  const rs60 = ret60 !== null && idx60 !== null ? ret60 - idx60 : null;
  const volRatio5 = (() => {
    if (kline.length < 7) return null;
    const prev = kline.slice(-6, -1).map((r) => r.volume);
    const avg = mean(prev);
    return avg ? kline[kline.length - 1].volume / avg : null;
  })();

  const list = [
    {
      key: 'pct',
      label: '涨跌幅',
      value: pct,
      display: pct === null ? '—' : `${pct > 0 ? '+' : ''}${pct.toFixed(2)}%`,
      tone: pct > 0 ? 'up' : pct < 0 ? 'down' : 'neutral',
      explain: '（现价 − 昨收）÷ 昨收。A 股红色为上涨、绿色为下跌。',
    },
    {
      key: 'turnover',
      label: '换手率',
      value: quote?.turnover ?? null,
      display: quote ? `${quote.turnover.toFixed(2)}%` : '—',
      tone: 'neutral',
      explain: '成交量 ÷ 流通股本。越高说明筹码交换越活跃，短线资金参与度越强。',
    },
    {
      key: 'volumeRatio',
      label: '量比',
      value: quote?.volumeRatio ?? null,
      display: quote ? quote.volumeRatio.toFixed(2) : '—',
      tone: quote && quote.volumeRatio > 1.5 ? 'up' : quote && quote.volumeRatio < 0.7 ? 'down' : 'neutral',
      explain: '当日每分钟成交量 ÷ 过去 5 日每分钟成交量。大于 1 表示放量，小于 0.7 表示缩量。',
    },
    {
      key: 'amount',
      label: '成交额',
      value: quote?.amount ?? null,
      display: quote ? fmtMoney(quote.amount) : '—',
      tone: 'neutral',
      explain: '当日成交金额。成交额越大，价格信号通常越可信。',
    },
    {
      key: 'amplitude',
      label: '振幅',
      value: quote?.amplitude ?? null,
      display: quote ? `${quote.amplitude.toFixed(2)}%` : '—',
      tone: 'neutral',
      explain: '（最高 − 最低）÷ 昨收。衡量日内多空分歧与波动。',
    },
    {
      key: 'pe',
      label: '市盈率 PE(动)',
      value: quote?.pe ?? null,
      display: quote && quote.pe ? quote.pe.toFixed(2) : '—',
      tone: 'neutral',
      explain: '总市值 ÷ 预测净利润。越高意味着市场对未来增长预期越高，也越依赖业绩兑现。',
    },
    {
      key: 'pb',
      label: '市净率 PB',
      value: quote?.pb ?? null,
      display: quote && quote.pb ? quote.pb.toFixed(2) : '—',
      tone: 'neutral',
      explain: '总市值 ÷ 净资产。适合银行、地产、制造业等重资产行业的相对估值比较。',
    },
    {
      key: 'marketCap',
      label: '总市值',
      value: quote?.totalMarketCap ?? null,
      display: quote ? fmtMoney(quote.totalMarketCap) : '—',
      tone: 'neutral',
      explain: '总股本 × 现价。用于判断公司在行业与指数中的权重级别。',
    },
    {
      key: 'ret20',
      label: '20日涨跌幅',
      value: ret20,
      display: pct1(ret20),
      tone: ret20 > 0 ? 'up' : ret20 < 0 ? 'down' : 'neutral',
      explain: '近 20 个交易日的累计涨跌幅，观察约一个月的趋势方向。',
    },
    {
      key: 'rs20',
      label: '相对强弱 RS(20)',
      value: rs20,
      display: rs20 === null ? '—' : `${rs20 > 0 ? '+' : ''}${rs20.toFixed(2)}pct`,
      tone: rs20 > 0 ? 'up' : rs20 < 0 ? 'down' : 'neutral',
      explain: '个股 20 日涨幅 − 沪深300 20 日涨幅。正值表示跑赢大盘。',
    },
    {
      key: 'volatility',
      label: '年化波动率',
      value: vol60,
      display: vol60 === null ? '—' : `${vol60.toFixed(1)}%`,
      tone: 'neutral',
      explain: '近 60 个交易日日收益率标准差 × √252。越高代表价格越不稳定。',
    },
    {
      key: 'mdd',
      label: '最大回撤(60日)',
      value: mdd60,
      display: mdd60 === null ? '—' : `${mdd60.toFixed(2)}%`,
      tone: 'down',
      explain: '近 60 日从区间高点到后续低点的最大跌幅，衡量持有体验与下行风险。',
    },
    {
      key: 'ma',
      label: '均线位置',
      value: ma20,
      display:
        ma20 && ma60 && last
          ? last.close >= ma20 && ma20 >= ma60
            ? '多头排列'
            : last.close < ma20 && ma20 < ma60
              ? '空头排列'
              : '均线纠缠'
          : '—',
      tone: ma20 && ma60 && last ? (last.close >= ma20 && ma20 >= ma60 ? 'up' : last.close < ma20 ? 'down' : 'neutral') : 'neutral',
      explain: '收盘价与 MA20 / MA60 的相对位置。多头排列=价格>MA20>MA60，反之为空头排列。',
    },
    {
      key: 'main5',
      label: '主力净流入(5日)',
      value: main5,
      display: quote ? fmtMoney(main5) : '—',
      tone: main5 > 0 ? 'up' : main5 < 0 ? 'down' : 'neutral',
      explain: '最近 5 个交易日超大单 + 大单的净买入额。正值为主力净流入，负值为净流出。',
    },
    {
      key: 'career',
      label: '近一年公告数',
      value: (announcements || []).length,
      display: String((announcements || []).length),
      tone: 'neutral',
      explain: '近 365 天巨潮资讯披露的公告数量。公告密度高通常意味着事件驱动更频繁。',
    },
  ];
  return {
    list,
    summary: {
      ret20,
      ret60,
      rs20,
      rs60,
      vol60,
      mdd60,
      main5,
      volRatio5,
      lastEvent,
      ma20,
      ma60,
    },
  };
}

function fmtMoney(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return '—';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `${(value / 1e12).toFixed(2)}万亿`;
  if (abs >= 1e8) return `${(value / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${(value / 1e4).toFixed(2)}万`;
  return value.toFixed(0);
}

// ---------------------------------------------------------------------------
// Market pulse / sentiment

export function buildMarket(indices, dapan, flow, sectorFlow) {
  const summary = dapan.summary || {};
  const stocks = Array.from(dapan.stocks.values());
  let limitUp = 0;
  let limitDown = 0;
  for (const s of stocks) {
    const code = s.code;
    const name = s.name || '';
    const threshold = /ST/i.test(name)
      ? 4.8
      : /^(30|68)/.test(code)
        ? 19.5
        : /^(4|8|92)/.test(code)
          ? 29.5
          : 9.8;
    if (s.pct >= threshold) limitUp++;
    else if (s.pct <= -threshold) limitDown++;
  }
  const turnover = {
    amount: Number(summary.turnoverAmount) || 0,
    previous: Number(summary.turnoverPreviousAmount) || 0,
    delta: Number(summary.turnoverDelta) || 0,
  };
  turnover.previousSameTime = turnover.amount - turnover.delta;
  turnover.deltaRatio = turnover.previousSameTime ? turnover.delta / turnover.previousSameTime : 0;
  const flowHistory = flow && Array.isArray(flow.history) ? flow.history : Array.isArray(flow) ? flow : [];
  const flowToday = flow && flow.today ? flow.today : flowHistory.length ? flowHistory[flowHistory.length - 1] : null;
  const sentiment = computeSentiment({
    advance: Number(summary.advanceCount) || 0,
    flat: Number(summary.flatCount) || 0,
    decline: Number(summary.declineCount) || 0,
    indices,
    turnover,
    limitUp,
    limitDown,
    total: dapan.stockCount || stocks.length,
    mainNet: flowToday ? flowToday.main : 0,
  });
  const byName = new Map(indices.map((i) => [i.name, i]));
  const sse = byName.get('上证指数');
  const hs300 = byName.get('沪深300');
  const zz500 = byName.get('中证500');
  const cyb = byName.get('创业板指');
  return {
    indices,
    breadth: {
      advance: Number(summary.advanceCount) || 0,
      flat: Number(summary.flatCount) || 0,
      decline: Number(summary.declineCount) || 0,
      total: dapan.stockCount || stocks.length,
      limitUp,
      limitDown,
    },
    turnover,
    sentiment,
    flow: {
      today: flowToday,
      history: flowHistory.slice(-12),
      sectors: sectorFlow,
    },
    style: {
      largeVsSmall: hs300 && zz500 ? hs300.pct - zz500.pct : null,
      growthVsValue: cyb && sse ? cyb.pct - sse.pct : null,
    },
    boards: dapan.boards,
    updatedAt: dapan.updatedAt,
  };
}

function computeSentiment({ advance, flat, decline, indices, turnover, limitUp, limitDown, total, mainNet }) {
  const advRatio = advance + decline ? advance / (advance + decline) : 0.5;
  const breadthScore = advRatio * 100;
  const avgPct = mean((indices || []).slice(0, 3).map((i) => i.pct)) || 0;
  const indexScore = clamp(50 + avgPct * 12, 0, 100);
  const turnoverScore = clamp(50 + turnover.deltaRatio * 120, 0, 100);
  const limitScore = clamp(50 + ((limitUp - limitDown) / Math.max(1, total)) * 1400, 0, 100);
  const flowScore = clamp(50 + (mainNet / Math.max(1, turnover.amount)) * 320, 0, 100);
  const score = Math.round(
    breadthScore * 0.32 + indexScore * 0.22 + turnoverScore * 0.14 + limitScore * 0.14 + flowScore * 0.18,
  );
  const label =
    score < 20
      ? '极度恐慌'
      : score < 38
        ? '偏冷'
        : score < 52
          ? '中性偏弱'
          : score < 66
            ? '中性偏强'
            : score < 82
              ? '偏热'
              : '亢奋';
  const components = [
    { key: 'breadth', label: '涨跌家数', value: Math.round(breadthScore), detail: `${advance} 涨 / ${decline} 跌` },
    { key: 'index', label: '指数动量', value: Math.round(indexScore), detail: `三大指数均值 ${avgPct > 0 ? '+' : ''}${avgPct.toFixed(2)}%` },
    { key: 'turnover', label: '量能变化', value: Math.round(turnoverScore), detail: `较昨同期 ${turnover.delta > 0 ? '+' : ''}${(turnover.delta / 1e8).toFixed(0)} 亿` },
    { key: 'limit', label: '涨跌停', value: Math.round(limitScore), detail: `${limitUp} 涨停 / ${limitDown} 跌停` },
    { key: 'flow', label: '主力资金', value: Math.round(flowScore), detail: `主力净流入 ${fmtMoney(mainNet)}` },
  ];
  return { score, label, components };
}

// ---------------------------------------------------------------------------
// News / policy

const NEWS_TAGS = [
  { re: /(降准|降息|利率|货币政策|流动性|MLF|LPR|逆回购|外汇存款准备金)/, tag: '货币政策', sectors: ['银行', '非银金融', '房地产'] },
  { re: /(证监会|资本市场|IPO|再融资|回购|增持|两融|融资融券|ETF|中长期资金|护盘)/, tag: '资本市场', sectors: ['非银金融', '银行'] },
  { re: /(财政|专项债|国债|减税|税收|补贴|以旧换新|设备更新)/, tag: '财政政策', sectors: ['机械设备', '家用电器', '汽车'] },
  { re: /(房地产|楼市|住房|房贷|城中村|保障房)/, tag: '地产政策', sectors: ['房地产', '建筑材料', '建筑装饰', '家用电器'] },
  { re: /(半导体|芯片|光刻|存储|算力|人工智能|AI|大模型|Token|数据中心)/, tag: '科技产业', sectors: ['电子', '计算机', '通信'] },
  { re: /(新能源|光伏|储能|锂电池|风电|氢能|充电桩)/, tag: '新能源', sectors: ['电力设备', '有色金属', '公用事业'] },
  { re: /(汽车|智能驾驶|自动驾驶|车企|新能源车)/, tag: '汽车产业', sectors: ['汽车', '电子', '电力设备'] },
  { re: /(医药|创新药|医保|集采|医疗器械|临床)/, tag: '医药政策', sectors: ['医药生物'] },
  { re: /(消费|零售|旅游|免税|生育|养老|白酒|食品)/, tag: '消费民生', sectors: ['食品饮料', '商贸零售', '社会服务', '美容护理'] },
  { re: /(军工|国防|航天|低空经济|商业航天|大飞机)/, tag: '军工航天', sectors: ['国防军工', '机械设备'] },
  { re: /(关税|贸易|出口|中美|制裁|实体清单)/, tag: '外部贸易', sectors: ['电子', '家用电器', '机械设备'] },
  { re: /(原油|石油|天然气|能源|煤炭|电力)/, tag: '能源电力', sectors: ['石油石化', '煤炭', '公用事业'] },
  { re: /(黄金|有色金属|铜|铝|稀土|锂)/, tag: '资源品', sectors: ['有色金属', '钢铁'] },
];

export function classifyNews(item) {
  const text = `${item.title || ''} ${item.summary || ''}`;
  const tags = NEWS_TAGS.filter((t) => t.re.test(text));
  let level = 1;
  if (/(国务院|中共中央|央行|人民银行|证监会|财政部|国家发展改革委|发改委|金融监管总局|外汇局)/.test(text)) level = 3;
  else if (/(部委|工信部|商务部|住建部|市场监管总局|地方政府|省委|市政府)/.test(text)) level = 2;
  if (/(发布|出台|印发|实施|调整|决定|会议|通知|意见|办法|规划|试点|落地)/.test(text)) level = Math.min(3, level + 1);
  const direction = /(收紧|加税|限制|禁止|处罚|风险|下调|下跌|制裁|冲突)/.test(text)
    ? -1
    : /(支持|促进|放宽|降准|降息|减税|补贴|回购|增持|稳市场|稳预期|提振|扩张|上调)/.test(text)
      ? 1
      : 0;
  const sectors = Array.from(new Set(tags.flatMap((t) => t.sectors)));
  return {
    tags: tags.map((t) => t.tag),
    sectors,
    level,
    direction,
    directionLabel: direction > 0 ? '偏利好' : direction < 0 ? '偏利空' : '中性',
  };
}

export function buildNews(news, dapan, indexKline) {
  const indexByDate = new Map((indexKline || []).map((k) => [k.date, k]));
  const boardByName = new Map((dapan.boards || []).map((b) => [b.name, b]));
  const today = new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 10);
  const items = (news || []).map((n) => {
    const cls = classifyNews(n);
    const idx = indexByDate.get(n.date) || (n.date === today ? indexKline[indexKline.length - 1] : null);
    const affected = cls.sectors
      .map((name) => {
        const b = boardByName.get(name);
        return b ? { name: b.name, pct: round(b.changePct, 2) } : null;
      })
      .filter(Boolean);
    const isPolicy = cls.level >= 2 || cls.tags.some((t) => ['货币政策', '资本市场', '财政政策', '地产政策'].includes(t));
    const score = clamp(
      Math.round(cls.level * 18 + cls.tags.length * 6 + (isPolicy ? 18 : 4) + Math.min(12, Math.abs(idx?.pct || 0) * 3)),
      10,
      99,
    );
    return {
      ...n,
      ...cls,
      isPolicy,
      indexPct: idx ? round(idx.pct, 2) : null,
      indexClose: idx ? round(idx.close, 2) : null,
      affected,
      score,
    };
  });
  const policy = items
    .filter((n) => n.isPolicy)
    .sort((a, b) => b.score - a.score || b.time - a.time)
    .slice(0, 10);
  const market = items
    .filter((n) => !n.isPolicy)
    .sort((a, b) => b.time - a.time)
    .slice(0, 5);
  const tagCounts = new Map();
  for (const n of policy) for (const tag of n.tags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  return {
    policy,
    market,
    tags: Array.from(tagCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  };
}

// ---------------------------------------------------------------------------
// Announcement enrichment

export function enrichAnnouncement(ann, dapan, quote, event) {
  const scored = scoreAnnouncement(ann, quote, event);
  const stock = dapan.stocks.get(ann.code) || null;
  return {
    ...ann,
    board: stock ? stock.board : '',
    subBoard: stock ? stock.subBoard : '',
    price: stock ? stock.price : null,
    pct: quote ? quote.pct : stock ? stock.pct : null,
    turnover: stock ? stock.turnover : null,
    marketCap: stock ? stock.marketCap : null,
    scored,
    event: event || null,
  };
}

export function makeCompanySearchResult(stock) {
  return {
    code: stock.code,
    name: stock.name,
    board: stock.board,
    pct: round(stock.pct, 2),
    price: round(stock.price, 2),
    marketCap: stock.marketCap,
  };
}

export const helpers = { clamp, pct1, fmtMoney, mean, std, retOver, maxDrawdown };
