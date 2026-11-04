// "快速了解一个公司" — the ten-angle framework from 快速了解一个公司.md applied to
// public data. Purpose picks the weights; every score is a transparent sum of
// banded sub-scores, and angles without data are listed as 待核实 instead of
// being filled with a made-up number.

import {
  getAnnualIndicators,
  getHolders,
  getLatestIndicators,
  getPeerValuation,
  getSurvey,
  getValuationSeries,
  median,
  normalizeCode,
  percentile,
} from './f10.js';
import { getCompanyAnnouncements, getDapan, getStockKline, getStockQuote, round } from './data.js';

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function fmtPct(v, digits = 2) {
  return isNum(v) ? `${v > 0 ? '+' : ''}${v.toFixed(digits)}%` : '—';
}

function fmtNum(v, digits = 2) {
  return isNum(v) ? v.toFixed(digits) : '—';
}

function fmtMoney(v) {
  if (!isNum(v)) return '—';
  const abs = Math.abs(v);
  if (abs >= 1e12) return `${(v / 1e12).toFixed(2)}万亿`;
  if (abs >= 1e8) return `${(v / 1e8).toFixed(2)}亿`;
  if (abs >= 1e4) return `${(v / 1e4).toFixed(2)}万`;
  return v.toFixed(0);
}

function ratio(a, b) {
  return isNum(a) && isNum(b) && b !== 0 ? a / b : null;
}

function meanOf(values) {
  const xs = (values || []).filter(isNum);
  return xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null;
}

function stdOf(values) {
  const xs = (values || []).filter(isNum);
  if (xs.length < 2) return null;
  const m = meanOf(xs);
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / (xs.length - 1));
}

// ---------------------------------------------------------------------------
// Purpose profiles: the doc's "先定目的和标准" step, encoded as weights over the
// ten angles. Weights only reorder the reading; they never change a score.

export const PURPOSES = [
  {
    key: 'invest',
    label: '投资',
    intent: '成长性、盈利质量、估值与风险',
    weights: { industry: 8, profit: 18, moat: 12, financial: 20, operations: 4, governance: 5, growth: 15, risk: 6, valuation: 12, culture: 0 },
    asks: ['增长是真实的，还是靠赊销/并购堆出来的？', '利润有没有变成现金？', '当前估值处在自身历史的什么位置？'],
  },
  {
    key: 'job',
    label: '求职',
    intent: '业务健康度、组织文化、稳定性',
    weights: { industry: 8, profit: 10, moat: 8, financial: 12, operations: 6, governance: 14, growth: 10, risk: 10, valuation: 2, culture: 20 },
    asks: ['公司赚钱吗，业务是在扩张还是在收缩？', '有没有裁员、欠薪、社保纠纷一类的信号？', '晋升与薪酬结构能否从公开信息印证？'],
  },
  {
    key: 'partner',
    label: '合作/采购',
    intent: '信用、履约、交付、合规',
    weights: { industry: 6, profit: 14, moat: 10, financial: 26, operations: 14, governance: 14, growth: 4, risk: 8, valuation: 4, culture: 0 },
    asks: ['账上有没有钱，短期偿债压力大不大？', '交付能力与回款周期是否稳定？', '有没有被处罚、被执行、拖欠货款的历史？'],
  },
  {
    key: 'ma',
    label: '并购',
    intent: '协同、资产质量、负债、团队',
    weights: { industry: 6, profit: 16, moat: 12, financial: 18, operations: 10, governance: 16, growth: 8, risk: 8, valuation: 6, culture: 0 },
    asks: ['资产质量与负债结构是否干净？', '团队与控制权是否稳定？', '协同价值能不能对应到具体产品/客户？'],
  },
  {
    key: 'regulator',
    label: '监管/风控',
    intent: '治理、合规、信息披露、诉讼',
    weights: { industry: 4, profit: 8, moat: 4, financial: 20, operations: 6, governance: 28, growth: 4, risk: 24, valuation: 2, culture: 0 },
    asks: ['股权结构与实际控制人是否清晰？', '近一年监管类公告有多少、是什么性质？', '财务异常信号（应收、存货、现金流）是否指向粉饰？'],
  },
];

const LEVELS = [
  { min: 75, label: '强', tone: 'good' },
  { min: 60, label: '偏强', tone: 'good' },
  { min: 45, label: '中性', tone: 'neutral' },
  { min: 30, label: '偏弱', tone: 'weak' },
  { min: -1, label: '弱', tone: 'weak' },
];

export function levelOf(score) {
  if (!isNum(score)) return { label: '数据不足', tone: 'dim' };
  return LEVELS.find((l) => score >= l.min) || LEVELS[LEVELS.length - 1];
}

// Sub-scores are banded; combine() rescales whatever is available to 0-100 so a
// missing feed lowers confidence instead of silently becoming a "neutral" score.
export function combine(parts) {
  const valid = (parts || []).filter((p) => p && isNum(p.score) && p.max > 0);
  if (!valid.length) return null;
  const cap = valid.reduce((s, p) => s + p.max, 0);
  const got = valid.reduce((s, p) => s + clamp(p.score, 0, p.max), 0);
  return clamp(Math.round((got / cap) * 100), 0, 100);
}

function band(value, table) {
  if (!isNum(value)) return null;
  const hit = table.find((row) => value >= row.min);
  return hit ? hit.score : 0;
}

// ---------------------------------------------------------------------------
// Derived blocks

const RISK_RULES = [
  { key: 'legal', label: '立案/处罚/监管函', re: /立案|行政处罚|处罚决定|监管函|警示函|纪律处分|退市风险|终止上市|违规|失信|被冻结|司法冻结/ },
  { key: 'litigation', label: '诉讼/仲裁', re: /诉讼|仲裁|判决|裁决/ },
  { key: 'inquiry', label: '问询/关注函', re: /问询函|关注函|监管工作函/ },
  { key: 'pledge', label: '股权质押', re: /质押/ },
  { key: 'reduce', label: '股东减持', re: /减持|拟减持/ },
  { key: 'guarantee', label: '对外担保', re: /担保/ },
  { key: 'related', label: '关联交易', re: /关联交易/ },
  { key: 'management', label: '董监高变动', re: /辞职|离任|聘任|换届|选举|变更.{0,8}(董事|监事|高管|财务负责人)/ },
];

const POSITIVE_RULES = [
  { key: 'dividend', label: '分红', re: /分红|利润分配|权益分派/ },
  { key: 'buyback', label: '回购', re: /回购/ },
  { key: 'increase', label: '股东增持', re: /增持/ },
  { key: 'incentive', label: '股权激励', re: /股权激励|员工持股|限制性股票/ },
  { key: 'orders', label: '订单/中标', re: /中标|订单|重大合同|签约/ },
];

function scanAnnouncements(list) {
  const rows = Array.isArray(list) ? list : [];
  const pick = (rule) => {
    const hits = rows.filter((a) => rule.re.test(String(a.title || '')));
    return {
      key: rule.key,
      label: rule.label,
      count: hits.length,
      items: hits.slice(0, 3).map((a) => ({ title: a.title, time: a.time, id: a.id, url: a.url || '' })),
    };
  };
  return { risks: RISK_RULES.map(pick), positives: POSITIVE_RULES.map(pick), total: rows.length };
}

function deriveFinancials(annualRows, latestRows) {
  const annual = (annualRows || []).slice(-5);
  const newest = annual[annual.length - 1] || null;
  const oldest = annual[0] || null;
  const latest = (latestRows || [])[0] || null;
  const span = newest && oldest ? Number(newest.reportDate.slice(0, 4)) - Number(oldest.reportDate.slice(0, 4)) : null;
  const cagr = (from, to) => (isNum(from) && isNum(to) && from > 0 && to > 0 && span > 0 ? (Math.pow(to / from, 1 / span) - 1) * 100 : null);
  const roeValues = annual.map((r) => r.roe).filter(isNum);
  const gmValues = annual.map((r) => r.grossMargin).filter(isNum);
  const ocfRatios = annual.map((r) => r.ocfToNp).filter(isNum);
  return {
    annual,
    latest,
    summary: {
      years: annual.length,
      span,
      revenueLatest: newest ? newest.revenue : null,
      profitLatest: newest ? newest.netProfit : null,
      deductedLatest: newest ? newest.deducted : null,
      revCagr: cagr(oldest && oldest.revenue, newest && newest.revenue),
      profitCagr: cagr(oldest && oldest.deducted, newest && newest.deducted),
      roeAvg: meanOf(roeValues),
      roeMin: roeValues.length ? Math.min(...roeValues) : null,
      roeNow: newest ? newest.roe : null,
      gmAvg: meanOf(gmValues),
      gmNow: newest ? newest.grossMargin : null,
      gmRange: gmValues.length > 1 ? Math.max(...gmValues) - Math.min(...gmValues) : null,
      nmNow: newest ? newest.netMargin : null,
      ocfToNpAvg: meanOf(ocfRatios),
      debtNow: newest ? newest.debtRatio : null,
      debtThen: oldest ? oldest.debtRatio : null,
      arNow: newest ? newest.arDays : null,
      arThen: oldest ? oldest.arDays : null,
      invNow: newest ? newest.invDays : null,
      invThen: oldest ? oldest.invDays : null,
      currentRatio: newest ? newest.currentRatio : null,
      assetTurnover: newest ? newest.assetTurnover : null,
      positiveYears: annual.filter((r) => isNum(r.netProfit) && r.netProfit > 0).length,
      ocfPositiveYears: annual.filter((r) => isNum(r.ocf) && r.ocf > 0).length,
      latestPeriod: latest ? latest.period : '',
      latestPeriodDate: latest ? latest.reportDate : '',
      latestRevenueYoY: latest ? latest.revenueYoY : null,
      latestProfitYoY: latest ? (isNum(latest.deductedYoY) ? latest.deductedYoY : latest.netProfitYoY) : null,
      latestNotice: latest ? latest.noticeDate : '',
    },
  };
}

function tradingStats(kline, seriesRows) {
  const rows = Array.isArray(kline) ? kline : [];
  let closes = rows.map((r) => r.close).filter(isNum);
  let pcts = rows.slice(-61).map((r) => r.pct).filter(isNum);
  if (!closes.length && Array.isArray(seriesRows) && seriesRows.length) {
    // No daily kline: fall back to the valuation series, which carries a close
    // per trading day and is enough for volatility and drawdown.
    const cs = seriesRows.map((r) => r.close).filter(isNum);
    const derived = [];
    for (let i = 1; i < cs.length; i++) if (cs[i - 1]) derived.push((cs[i] / cs[i - 1] - 1) * 100);
    closes = cs;
    pcts = derived.slice(-60);
  }
  const vol = pcts.length > 10 ? stdOf(pcts) * Math.sqrt(252) : null;
  const last = closes.slice(-60);
  let peak = null;
  let mdd = null;
  for (const close of last) {
    if (peak === null || close > peak) peak = close;
    const dd = peak ? (close / peak - 1) * 100 : 0;
    if (mdd === null || dd < mdd) mdd = dd;
  }
  return { vol60: round(vol, 1), mdd60: round(mdd, 2), bars: closes.length, lastPct: pcts.length ? round(pcts[pcts.length - 1], 2) : null };
}

function buildValuation(code, series, peers, quote, kline) {
  const rows = (series && series.rows) || [];
  const last = rows[rows.length - 1] || null;
  const pe = last && isNum(last.pe) && last.pe > 0 ? last.pe : isNum(quote && quote.pe) && quote.pe > 0 ? quote.pe : null;
  const pb = last && isNum(last.pb) && last.pb > 0 ? last.pb : isNum(quote && quote.pb) && quote.pb > 0 ? quote.pb : null;
  const peSeries = rows.map((r) => r.pe).filter((v) => isNum(v) && v > 0 && v < 3000);
  const pbSeries = rows.map((r) => r.pb).filter((v) => isNum(v) && v > 0 && v < 100);
  const klineCloses = (kline || []).slice(-250).map((r) => r.close).filter(isNum);
  const closes = klineCloses.length ? klineCloses : rows.slice(-250).map((r) => r.close).filter(isNum);
  const price = quote && isNum(quote.price) && quote.price > 0 ? quote.price : closes.length ? closes[closes.length - 1] : null;

  let peer = null;
  if (peers && Array.isArray(peers.list) && peers.list.length) {
    const list = peers.list;
    const peValues = list.map((p) => p.pe).filter((v) => isNum(v) && v > 0 && v < 300);
    const pbValues = list.map((p) => p.pb).filter((v) => isNum(v) && v > 0 && v < 50);
    const caps = list.map((p) => p.marketCap).filter((v) => isNum(v) && v > 0);
    const sortedByCap = list.filter((p) => isNum(p.marketCap)).sort((a, b) => b.marketCap - a.marketCap);
    const rank = sortedByCap.findIndex((p) => p.code === code);
    peer = {
      board: peers.board,
      tradeDate: peers.tradeDate,
      count: list.length,
      medianPe: round(median(peValues), 2),
      medianPb: round(median(pbValues), 2),
      medianCap: median(caps),
      rank: rank >= 0 ? rank + 1 : null,
      top: sortedByCap.slice(0, 6).map((p) => ({ code: p.code, name: p.name, marketCap: p.marketCap, pe: p.pe, pb: p.pb })),
      peRatio: null,
    };
    peer.peRatio = ratio(pe, peer.medianPe);
  }
  return {
    pe: round(pe, 2),
    pb: round(pb, 2),
    ps: last && isNum(last.ps) ? round(last.ps, 2) : null,
    close: last ? last.close : null,
    pePct: percentile(peSeries, pe),
    pbPct: percentile(pbSeries, pb),
    peMin: peSeries.length ? round(Math.min(...peSeries), 2) : null,
    peMax: peSeries.length ? round(Math.max(...peSeries), 2) : null,
    pbMin: pbSeries.length ? round(Math.min(...pbSeries), 2) : null,
    pbMax: pbSeries.length ? round(Math.max(...pbSeries), 2) : null,
    samples: rows.length,
    from: rows.length ? rows[0].date : '',
    to: rows.length && last ? last.date : '',
    pricePos: percentile(closes, price),
    high250: closes.length ? Math.max(...closes) : null,
    low250: closes.length ? Math.min(...closes) : null,
    peer,
  };
}

function buildGovernance(holders, announcements) {
  const scans = scanAnnouncements(announcements);
  const sumKey = (key) => scans.risks.filter((r) => r.key === key).reduce((s, r) => s + r.count, 0);
  return {
    controller: holders ? holders.controller : '',
    top1: holders ? holders.top1Ratio : null,
    top10: holders ? holders.top10Ratio : null,
    holderCount: holders ? holders.holderCount : null,
    holderChange: holders ? holders.holderChange : null,
    holderFocus: holders ? holders.holderFocus : '',
    instRatio: holders ? holders.instRatio : null,
    instCount: holders ? holders.instCount : null,
    topDate: holders ? holders.topDate : '',
    risks: scans.risks.filter((r) => r.count > 0),
    positives: scans.positives.filter((r) => r.count > 0),
    announcementCount: scans.total,
    riskTotal: scans.risks.reduce((s, r) => s + r.count, 0),
    legalCount: sumKey('legal'),
    reduceCount: sumKey('reduce'),
    pledgeCount: sumKey('pledge'),
  };
}

// ---------------------------------------------------------------------------
// Dimensions. Each returns { score, level, signals, basis, read, missing, basisText }.

function base(key, label) {
  return { key, label };
}

function finish(dim, parts, read, signals, missing) {
  const score = combine(parts);
  const level = levelOf(score);
  const basis = parts.filter((p) => isNum(p.score)).map((p) => `${p.label} ${Math.round(p.score)}/${p.max}`);
  return {
    key: dim.key,
    label: dim.label,
    score,
    level,
    read,
    signals: signals.filter(Boolean),
    basis,
    basisText: basis.join(' · '),
    missing: missing || [],
  };
}

function dimensionIndustry(ctx) {
  const dim = base('industry', '行业与赛道');
  const board = ctx.board || {};
  const signals = [
    board.name ? { label: '所属板块', value: board.name, tone: 'neutral' } : null,
    isNum(board.pct) ? { label: '板块今日', value: fmtPct(board.pct), tone: board.pct > 0 ? 'up' : board.pct < 0 ? 'down' : 'neutral' } : null,
    isNum(board.rank) ? { label: '板块市值排名', value: `${board.rank}/${board.total}`, tone: 'neutral' } : null,
    ctx.profile.chain ? { label: '产业链', value: ctx.profile.chain, tone: 'neutral' } : null,
    ctx.profile.province ? { label: '注册地', value: ctx.profile.province, tone: 'neutral' } : null,
  ];
  const read = board.name
    ? `所属 ${board.name} 板块${isNum(board.rank) ? `，板块市值在 ${board.total} 个一级行业里排第 ${board.rank}` : ''}${isNum(board.pct) ? `，今日 ${fmtPct(board.pct)}` : ''}。赛道空间、增速与竞争格局不在行情数据里，需要行业数据补。`
    : '行业分类未能取得；赛道空间与竞争格局需要行业数据补。';
  return finish(dim, [], read, signals, ['市场规模与增速', '竞争格局与集中度', '政策方向与周期位置']);
}

function dimensionProfit(ctx) {
  const dim = base('profit', '商业模式与盈利质量');
  const f = ctx.financials.summary;
  const gm = isNum(f.gmNow) ? f.gmNow : f.gmAvg;
  const nm = isNum(f.nmNow) ? f.nmNow : null;
  const parts = [
    { label: '毛利率', max: 28, score: band(gm, [{ min: 50, score: 28 }, { min: 40, score: 24 }, { min: 30, score: 19 }, { min: 20, score: 14 }, { min: 10, score: 8 }, { min: -999, score: 3 }]) },
    { label: '净利率', max: 22, score: band(nm, [{ min: 25, score: 22 }, { min: 18, score: 19 }, { min: 12, score: 15 }, { min: 6, score: 10 }, { min: 3, score: 6 }, { min: -999, score: 2 }]) },
    { label: '经营现金流/净利', max: 25, score: band(f.ocfToNpAvg, [{ min: 1.3, score: 25 }, { min: 1.1, score: 22 }, { min: 0.9, score: 18 }, { min: 0.7, score: 13 }, { min: 0.4, score: 7 }, { min: -999, score: 0 }]) },
    { label: '毛利率稳定', max: 15, score: band(isNum(f.gmRange) ? 10 - f.gmRange : null, [{ min: 7, score: 15 }, { min: 4, score: 12 }, { min: 0, score: 7 }, { min: -999, score: 3 }]) },
    { label: '应收周转', max: 10, score: band(isNum(f.arNow) ? -f.arNow : null, [{ min: -60, score: 10 }, { min: -120, score: 7 }, { min: -200, score: 4 }, { min: -1e9, score: 2 }]) },
  ];
  const cash = f.ocfToNpAvg;
  const cashText = isNum(cash) ? (cash >= 1 ? '利润基本转成了现金' : cash >= 0.7 ? '利润能转成现金，但不算宽裕' : '利润的现金含量偏低，要核对应收与存货') : '缺少现金流数据';
  const read = `毛利率 ${fmtNum(gm, 1)}%、净利率 ${fmtNum(nm, 1)}%；五年经营现金流/净利润均值 ${fmtNum(cash, 2)}×，${cashText}。`;
  const signals = [
    { label: '毛利率', value: fmtNum(gm, 1) + '%', tone: isNum(gm) && gm >= 30 ? 'up' : 'neutral' },
    { label: '净利率', value: fmtNum(nm, 1) + '%', tone: 'neutral' },
    { label: '现金流/净利', value: `${fmtNum(cash, 2)}×`, tone: isNum(cash) && cash < 0.7 ? 'down' : 'neutral' },
    isNum(f.gmRange) ? { label: '毛利波动', value: `${fmtNum(f.gmRange, 1)}pct`, tone: f.gmRange > 6 ? 'down' : 'neutral' } : null,
    isNum(f.arNow) ? { label: '应收天数', value: `${fmtNum(f.arNow, 0)} 天`, tone: f.arNow > 120 ? 'down' : 'neutral' } : null,
  ];
  return finish(dim, parts, read, signals, ['客户结构与集中度', '复购率/续约率', '定价权证据（提价历史）']);
}

function dimensionMoat(ctx) {
  const dim = base('moat', '竞争力与护城河');
  const f = ctx.financials.summary;
  const peer = ctx.valuation.peer;
  const cap = ctx.quote.marketCap;
  const capMultiple = peer && isNum(peer.medianCap) && peer.medianCap > 0 && isNum(cap) ? cap / peer.medianCap : null;
  const parts = [
    { label: '毛利率', max: 30, score: band(f.gmAvg, [{ min: 50, score: 30 }, { min: 40, score: 26 }, { min: 30, score: 20 }, { min: 20, score: 14 }, { min: 10, score: 8 }, { min: -999, score: 3 }]) },
    { label: 'ROE 低点', max: 25, score: band(f.roeMin, [{ min: 15, score: 25 }, { min: 10, score: 20 }, { min: 5, score: 13 }, { min: 0, score: 6 }, { min: -999, score: 0 }]) },
    { label: '毛利率稳定', max: 15, score: band(isNum(f.gmRange) ? 10 - f.gmRange : null, [{ min: 7, score: 15 }, { min: 4, score: 11 }, { min: 0, score: 7 }, { min: -999, score: 3 }]) },
    { label: '规模倍数', max: 20, score: band(capMultiple, [{ min: 5, score: 20 }, { min: 3, score: 17 }, { min: 2, score: 14 }, { min: 1, score: 11 }, { min: -999, score: 7 }]) },
    { label: '同行市值排名', max: 10, score: band(peer && isNum(peer.rank) && peer.count ? (1 - (peer.rank - 1) / Math.max(1, peer.count)) * 10 : null, [{ min: 7.5, score: 10 }, { min: 5, score: 8 }, { min: 2, score: 5 }, { min: -999, score: 3 }]) },
  ];
  const rankText = peer && isNum(peer.rank) ? `，市值在 ${peer.count} 家同业中排第 ${peer.rank}` : '';
  const read = `五年平均毛利率 ${fmtNum(f.gmAvg, 1)}%、最低 ROE ${fmtNum(f.roeMin, 1)}%${capMultiple ? `，市值是同业中位数的 ${fmtNum(capMultiple, 1)}×` : ''}${rankText}。`;
  const signals = [
    { label: '五年毛利率', value: fmtNum(f.gmAvg, 1) + '%', tone: 'neutral' },
    { label: 'ROE 低点', value: fmtNum(f.roeMin, 1) + '%', tone: isNum(f.roeMin) && f.roeMin >= 10 ? 'up' : f.roeMin < 5 ? 'down' : 'neutral' },
    capMultiple ? { label: '相对同业规模', value: `${fmtNum(capMultiple, 1)}×`, tone: 'neutral' } : null,
    peer && isNum(peer.rank) ? { label: '同业市值排名', value: `${peer.rank}/${peer.count}`, tone: 'neutral' } : null,
  ];
  return finish(dim, parts, read, signals, ['市占率与份额变化', '技术与专利壁垒', '牌照/渠道/网络效应证据']);
}

function dimensionFinancial(ctx) {
  const dim = base('financial', '财务健康');
  const f = ctx.financials.summary;
  const parts = [
    { label: 'ROE 均值', max: 30, score: band(f.roeAvg, [{ min: 25, score: 30 }, { min: 20, score: 27 }, { min: 15, score: 22 }, { min: 10, score: 16 }, { min: 5, score: 9 }, { min: -999, score: 3 }]) },
    { label: 'ROE 低点', max: 15, score: band(f.roeMin, [{ min: 15, score: 15 }, { min: 10, score: 12 }, { min: 5, score: 8 }, { min: 0, score: 4 }, { min: -999, score: 0 }]) },
    { label: '资产负债率', max: 20, score: band(isNum(f.debtNow) ? 70 - f.debtNow : null, [{ min: 40, score: 20 }, { min: 25, score: 17 }, { min: 10, score: 12 }, { min: 0, score: 7 }, { min: -10, score: 3 }, { min: -999, score: 1 }]) },
    { label: '流动比率', max: 15, score: band(f.currentRatio, [{ min: 2, score: 15 }, { min: 1.5, score: 13 }, { min: 1, score: 9 }, { min: 0.8, score: 5 }, { min: -999, score: 2 }]) },
    { label: '盈利为正', max: 10, score: isNum(f.profitLatest) && f.profitLatest > 0 ? (isNum(f.deductedLatest) && f.deductedLatest > 0 ? 10 : 6) : 0 },
    { label: '现金流为正', max: 10, score: f.years ? Math.round((f.ocfPositiveYears / f.years) * 10) : null },
  ];
  const debtText = isNum(f.debtNow) ? `资产负债率 ${fmtNum(f.debtNow, 1)}%` : '负债率缺失';
  const read = `五年 ROE 均值 ${fmtNum(f.roeAvg, 1)}%、最低 ${fmtNum(f.roeMin, 1)}%；${debtText}，流动比率 ${fmtNum(f.currentRatio, 2)}；经营现金流 ${f.ocfPositiveYears}/${f.years} 年为正。${ctx.financialSector ? '金融业负债率与流动比率口径和制造业不可直接横比。' : ''}`;
  const signals = [
    { label: 'ROE 五年均值', value: fmtNum(f.roeAvg, 1) + '%', tone: isNum(f.roeAvg) && f.roeAvg >= 15 ? 'up' : f.roeAvg < 8 ? 'down' : 'neutral' },
    { label: '资产负债率', value: fmtNum(f.debtNow, 1) + '%', tone: isNum(f.debtNow) && f.debtNow > 70 ? 'down' : 'neutral' },
    { label: '流动比率', value: fmtNum(f.currentRatio, 2), tone: isNum(f.currentRatio) && f.currentRatio < 1 ? 'down' : 'neutral' },
    { label: '现金流为正', value: `${f.ocfPositiveYears}/${f.years} 年`, tone: 'neutral' },
  ];
  return finish(dim, parts, read, signals, ['有息负债与到期结构', '审计意见', '少数股东权益与表外负债']);
}

function dimensionOperations(ctx) {
  const dim = base('operations', '经营与运营');
  const f = ctx.financials.summary;
  if (ctx.financialSector) {
    return finish(
      dim,
      [],
      `金融业没有应收/存货周转口径，运营效率要看成本收入比、不良率与净息差；总资产周转率 ${fmtNum(f.assetTurnover, 2)} 仅作规模参考。`,
      [{ label: '总资产周转', value: fmtNum(f.assetTurnover, 2), tone: 'neutral' }],
      ['成本收入比', '不良率与拨备覆盖', '净息差与存款成本', '人均产能'],
    );
  }
  const arTrend = isNum(f.arNow) && isNum(f.arThen) ? f.arNow - f.arThen : null;
  const parts = [
    { label: '应收天数', max: 30, score: band(isNum(f.arNow) ? -f.arNow : null, [{ min: -45, score: 30 }, { min: -90, score: 24 }, { min: -150, score: 16 }, { min: -240, score: 9 }, { min: -1e9, score: 3 }]) },
    { label: '存货天数', max: 30, score: band(isNum(f.invNow) ? -f.invNow : null, [{ min: -60, score: 30 }, { min: -120, score: 23 }, { min: -200, score: 15 }, { min: -365, score: 8 }, { min: -1e9, score: 3 }]) },
    { label: '总资产周转', max: 25, score: band(f.assetTurnover, [{ min: 1, score: 25 }, { min: 0.6, score: 19 }, { min: 0.3, score: 13 }, { min: 0.15, score: 8 }, { min: -999, score: 4 }]) },
    { label: '应收趋势', max: 15, score: band(isNum(arTrend) ? -arTrend : null, [{ min: 15, score: 15 }, { min: -15, score: 11 }, { min: -40, score: 7 }, { min: -1e9, score: 3 }]) },
  ];
  const read = `应收周转 ${fmtNum(f.arNow, 0)} 天、存货周转 ${fmtNum(f.invNow, 0)} 天、总资产周转率 ${fmtNum(f.assetTurnover, 2)}${isNum(arTrend) ? `；应收天数较五年前 ${arTrend > 0 ? '增加' : '减少'} ${fmtNum(Math.abs(arTrend), 0)} 天` : ''}。`;
  const signals = [
    { label: '应收天数', value: fmtNum(f.arNow, 0), tone: isNum(f.arNow) && f.arNow > 120 ? 'down' : 'neutral' },
    { label: '存货天数', value: fmtNum(f.invNow, 0), tone: isNum(f.invNow) && f.invNow > 180 ? 'down' : 'neutral' },
    { label: '总资产周转', value: fmtNum(f.assetTurnover, 2), tone: 'neutral' },
  ];
  return finish(dim, parts, read, signals, ['产能利用率', '订单/合同负债', '客户留存与满意度']);
}

function dimensionGrowth(ctx) {
  const dim = base('growth', '成长性与战略');
  const f = ctx.financials.summary;
  const yoy = isNum(f.latestProfitYoY) ? f.latestProfitYoY : f.latestRevenueYoY;
  const parts = [
    { label: '营收 CAGR', max: 30, score: band(f.revCagr, [{ min: 30, score: 30 }, { min: 20, score: 26 }, { min: 12, score: 21 }, { min: 5, score: 14 }, { min: 0, score: 8 }, { min: -999, score: 2 }]) },
    { label: '扣非 CAGR', max: 30, score: band(f.profitCagr, [{ min: 30, score: 30 }, { min: 20, score: 26 }, { min: 12, score: 21 }, { min: 5, score: 14 }, { min: 0, score: 8 }, { min: -999, score: 2 }]) },
    { label: '最新同比', max: 25, score: band(yoy, [{ min: 30, score: 25 }, { min: 15, score: 21 }, { min: 5, score: 16 }, { min: 0, score: 11 }, { min: -999, score: 4 }]) },
    { label: '正增长年数', max: 15, score: f.years ? Math.round((ctx.financials.annual.filter((r) => isNum(r.revenueYoY) && r.revenueYoY > 0).length / f.years) * 15) : null },
  ];
  const read = `营收五年复合 ${fmtPct(f.revCagr)}、扣非净利复合 ${fmtPct(f.profitCagr)}，最新报告期（${f.latestPeriod || '—'}）收入同比 ${fmtPct(f.latestRevenueYoY)}、扣非同比 ${fmtPct(f.latestProfitYoY)}。`;
  const signals = [
    { label: '营收 CAGR', value: fmtPct(f.revCagr), tone: isNum(f.revCagr) && f.revCagr > 0 ? 'up' : 'down' },
    { label: '扣非 CAGR', value: fmtPct(f.profitCagr), tone: isNum(f.profitCagr) && f.profitCagr > 0 ? 'up' : 'down' },
    { label: '最新收入同比', value: fmtPct(f.latestRevenueYoY), tone: isNum(f.latestRevenueYoY) && f.latestRevenueYoY > 0 ? 'up' : 'down' },
  ];
  return finish(dim, parts, read, signals, ['研发投入与研发费用率', '资本开支与新产能', '新业务收入占比', '并购整合效果']);
}

function dimensionGovernance(ctx) {
  const dim = base('governance', '管理与治理');
  const g = ctx.governance;
  const listed = ctx.profile.listed ? (Date.now() - new Date(ctx.profile.listed).getTime()) / 86400000 / 365.25 : null;
  const parts = [
    { label: '前十大集中度', max: 22, score: band(g.top10, [{ min: 30, score: 22 }, { min: 20, score: 18 }, { min: 0, score: 12 }, { min: -999, score: 8 }]) },
    { label: '股东户数变化', max: 15, score: band(isNum(g.holderChange) ? -g.holderChange : null, [{ min: 10, score: 15 }, { min: -10, score: 12 }, { min: -30, score: 8 }, { min: -1e9, score: 5 }]) },
    { label: '机构持股', max: 15, score: band(g.instRatio, [{ min: 30, score: 15 }, { min: 15, score: 12 }, { min: 5, score: 9 }, { min: -1, score: 6 }]) },
    { label: '负面公告', max: 25, score: g.riskTotal === 0 ? 25 : g.riskTotal <= 2 ? 17 : g.riskTotal <= 5 ? 9 : 2 },
    { label: '减持公告', max: 10, score: g.reduceCount === 0 ? 10 : g.reduceCount <= 2 ? 7 : g.reduceCount <= 5 ? 4 : 1 },
    { label: '上市年限', max: 8, score: band(listed, [{ min: 8, score: 8 }, { min: 5, score: 6 }, { min: 3, score: 4 }, { min: -1, score: 2 }]) },
  ];
  const negText = g.risks.length ? g.risks.map((r) => `${r.label} ${r.count}`).join('、') : '未检索到负面类公告';
  const read = `实际控制人 ${g.controller || '—'}；前十大股东合计 ${fmtNum(g.top10, 1)}%，股东户数较上期 ${fmtPct(g.holderChange, 1)}，机构持股 ${fmtNum(g.instRatio, 1)}%。近一年公告 ${g.announcementCount} 条，其中${negText}。`;
  const signals = [
    { label: '实际控制人', value: g.controller || '—', tone: 'neutral' },
    { label: '前十大合计', value: fmtNum(g.top10, 1) + '%', tone: 'neutral' },
    { label: '股东户数变化', value: fmtPct(g.holderChange, 1), tone: isNum(g.holderChange) && g.holderChange < 0 ? 'up' : 'neutral' },
    { label: '机构持股', value: fmtNum(g.instRatio, 1) + '%', tone: 'neutral' },
    { label: '负面公告', value: `${g.riskTotal} 条`, tone: g.riskTotal > 2 ? 'down' : 'neutral' },
  ];
  return finish(dim, parts, read, signals, ['关联交易明细', '内控审计意见', '诉讼/担保金额', '高管薪酬与激励']);
}

function dimensionRisk(ctx) {
  const dim = base('risk', '风险');
  const f = ctx.financials.summary;
  const g = ctx.governance;
  const t = ctx.trading;
  const parts = [
    { label: '负债率', max: 25, score: band(isNum(f.debtNow) ? 70 - f.debtNow : null, [{ min: 30, score: 25 }, { min: 15, score: 21 }, { min: 0, score: 15 }, { min: -10, score: 9 }, { min: -1e9, score: 4 }]) },
    { label: '波动率', max: 20, score: band(isNum(t.vol60) ? 100 - t.vol60 : null, [{ min: 70, score: 20 }, { min: 60, score: 16 }, { min: 45, score: 10 }, { min: 30, score: 5 }, { min: -1e9, score: 2 }]) },
    { label: '最大回撤', max: 15, score: band(isNum(t.mdd60) ? 100 + t.mdd60 : null, [{ min: 90, score: 15 }, { min: 80, score: 12 }, { min: 70, score: 8 }, { min: 55, score: 4 }, { min: -1e9, score: 1 }]) },
    { label: '法律类公告', max: 25, score: g.legalCount === 0 ? 25 : g.legalCount <= 2 ? 14 : g.legalCount <= 5 ? 6 : 1 },
    { label: '质押/减持', max: 15, score: band(-(g.pledgeCount + g.reduceCount), [{ min: -1, score: 15 }, { min: -2, score: 11 }, { min: -5, score: 7 }, { min: -1e9, score: 3 }]) },
  ];
  const score = combine(parts);
  const filled = finish(dim, parts, '', [], ['客户/供应商集中度', '商誉与减值', '或有负债与担保余额']);
  const riskLabel = !isNum(score) ? '数据不足' : score >= 75 ? '低' : score >= 55 ? '中低' : score >= 40 ? '中' : score >= 25 ? '中高' : '高';
  const read = `抗风险评分 ${isNum(score) ? score : '—'}，风险等级 ${riskLabel}：负债率 ${fmtNum(f.debtNow, 1)}%，60 日年化波动 ${fmtNum(t.vol60, 1)}%、最大回撤 ${fmtNum(t.mdd60, 1)}%，法律类公告 ${g.legalCount} 条、质押/减持 ${g.pledgeCount + g.reduceCount} 条。`;
  const signals = [
    { label: '风险等级', value: riskLabel, tone: isNum(score) && score < 40 ? 'down' : 'neutral' },
    { label: '60日波动', value: fmtNum(t.vol60, 1) + '%', tone: isNum(t.vol60) && t.vol60 > 55 ? 'down' : 'neutral' },
    { label: '最大回撤', value: fmtNum(t.mdd60, 1) + '%', tone: 'neutral' },
    { label: '法律类公告', value: `${g.legalCount} 条`, tone: g.legalCount > 0 ? 'down' : 'neutral' },
  ];
  return {
    ...filled,
    read,
    signals,
    level: { label: riskLabel, tone: isNum(score) && score < 40 ? 'weak' : isNum(score) && score >= 60 ? 'good' : 'neutral' },
    riskLevel: riskLabel,
  };
}

function dimensionValuation(ctx) {
  const dim = base('valuation', '估值与性价比');
  const v = ctx.valuation;
  const parts = [
    { label: 'PE 分位', max: 30, score: band(isNum(v.pePct) ? 100 - v.pePct : null, [{ min: 85, score: 30 }, { min: 70, score: 25 }, { min: 50, score: 18 }, { min: 30, score: 11 }, { min: 15, score: 6 }, { min: -1e9, score: 2 }]) },
    { label: 'PB 分位', max: 25, score: band(isNum(v.pbPct) ? 100 - v.pbPct : null, [{ min: 85, score: 25 }, { min: 70, score: 21 }, { min: 50, score: 15 }, { min: 30, score: 9 }, { min: 15, score: 5 }, { min: -1e9, score: 2 }]) },
    { label: '相对同业 PE', max: 20, score: band(isNum(v.peer && v.peer.peRatio) ? 1.6 - v.peer.peRatio : null, [{ min: 1, score: 20 }, { min: 0.75, score: 16 }, { min: 0.45, score: 12 }, { min: 0, score: 7 }, { min: -0.6, score: 3 }, { min: -1e9, score: 1 }]) },
    { label: '盈利为正', max: 10, score: v.pe === null ? 0 : 10 },
  ];
  const peerText = v.peer && isNum(v.peer.medianPe) ? `，同业中位 PE ${fmtNum(v.peer.medianPe, 1)}（${v.peer.count} 家）` : '';
  const read = `PE ${fmtNum(v.pe, 1)}（近三年 ${fmtNum(v.pePct, 0)}% 分位，区间 ${fmtNum(v.peMin, 1)}–${fmtNum(v.peMax, 1)}）、PB ${fmtNum(v.pb, 2)}（${fmtNum(v.pbPct, 0)}% 分位）${peerText}。价格处于近 250 日 ${fmtNum(v.pricePos, 0)}% 位置。`;
  const signals = [
    { label: 'PE', value: fmtNum(v.pe, 1), tone: 'neutral' },
    { label: 'PE 三年分位', value: isNum(v.pePct) ? `${fmtNum(v.pePct, 0)}%` : '—', tone: isNum(v.pePct) && v.pePct <= 30 ? 'up' : isNum(v.pePct) && v.pePct >= 75 ? 'down' : 'neutral' },
    { label: 'PB', value: fmtNum(v.pb, 2), tone: 'neutral' },
    { label: '同业中位 PE', value: fmtNum(v.peer && v.peer.medianPe, 1), tone: 'neutral' },
    { label: '价格位置', value: isNum(v.pricePos) ? `${fmtNum(v.pricePos, 0)}%` : '—', tone: 'neutral' },
  ];
  if (v.pe === null) signals.push({ label: '提示', value: '亏损期 PE 不适用', tone: 'gold' });
  return finish(dim, parts, read, signals, ['盈利预测与增速匹配（PEG）', 'EV/EBITDA', '股息率', '历史复盘：什么价位对应什么预期']);
}

function dimensionCulture(ctx) {
  const dim = base('culture', '组织与文化');
  const f = ctx.financials.summary;
  const emp = ctx.profile.employees;
  const perHead = emp && isNum(f.revenueLatest) ? f.revenueLatest / emp : null;
  const signals = [
    emp ? { label: '员工数', value: `${Math.round(emp).toLocaleString('en-US')} 人`, tone: 'neutral' } : null,
    isNum(perHead) ? { label: '人均营收', value: `${fmtNum(perHead / 1e4, 0)} 万`, tone: 'neutral' } : null,
  ];
  const read = `公开财务数据只能看到员工数${emp ? `（约 ${Math.round(emp).toLocaleString('en-US')} 人）` : ''}与人均营收；离职率、薪酬、晋升、管理层风格需要看员工评价与面试信息。`;
  return {
    ...finish(dim, [], read, signals, ['离职率与人员流动', '员工/前员工评价', '薪酬与晋升机制', '加班强度与培训体系']),
    dataGap: true,
  };
}

// ---------------------------------------------------------------------------
// Verdicts (the doc's 快速三问)

function verdictEarn(ctx) {
  const f = ctx.financials.summary;
  const dims = ctx.dims;
  const score = meanOf([dims.profit && dims.profit.score, dims.financial && dims.financial.score]);
  if (!isNum(f.profitLatest)) {
    return { key: 'earn', q: '赚钱吗？', tone: 'na', answer: '数据不足', text: '未取得年报利润数据，先看公告里的业绩预告/快报。', score: null };
  }
  if (f.profitLatest <= 0) {
    return {
      key: 'earn',
      q: '赚钱吗？',
      tone: 'weak',
      answer: '处于亏损期',
      text: `最近年报归母净利 ${fmtMoney(f.profitLatest)}；先分清亏损来自投入扩张还是主营收缩。`,
      score,
    };
  }
  const cash = f.ocfToNpAvg;
  const cashText = isNum(cash) ? (cash >= 1 ? '利润基本转成了现金' : cash >= 0.7 ? '利润能转成现金，但不算宽裕' : '利润的现金含量偏低') : '缺少现金流口径';
  return {
    key: 'earn',
    q: '赚钱吗？',
    tone: isNum(score) && score >= 60 ? 'good' : isNum(score) && score < 45 ? 'weak' : 'mid',
    answer: isNum(score) && score >= 60 ? '赚钱，质量尚可' : isNum(score) && score < 45 ? '赚钱但质量偏弱' : '能赚钱，质量中性',
    text: `近五年净利率均值 ${fmtNum(meanOf(ctx.financials.annual.map((r) => r.netMargin)), 1)}%、经营现金流/净利润 ${fmtNum(cash, 2)}×，${cashText}。`,
    score,
  };
}

function verdictSustain(ctx) {
  const f = ctx.financials.summary;
  const dims = ctx.dims;
  const score = meanOf([dims.moat && dims.moat.score, dims.growth && dims.growth.score]);
  const gm = f.gmAvg;
  const growth = f.revCagr;
  const pricey = isNum(gm) && gm >= 30;
  const growing = isNum(growth) && growth > 0;
  let answer;
  let text;
  if (!isNum(gm)) {
    if (isNum(growth)) {
      answer = growing ? '规模仍在增长（无毛利率口径）' : '增长停滞（无毛利率口径）';
      text = `金融业没有毛利率口径，改看营收复合 ${fmtPct(growth)} 与 ROE 均值 ${fmtNum(f.roeAvg, 1)}%。`;
    } else {
      answer = '数据不足';
      text = '缺少毛利率与增长数据，无法判断持续性。';
    }
  } else if (pricey && growing) {
    answer = '有定价权且仍在增长';
    text = `五年平均毛利率 ${fmtNum(gm, 1)}%，营收仍在增长（复合 ${fmtPct(growth)}），定价权与增长同时成立，下一步看份额有没有被抢走。`;
  } else if (pricey) {
    answer = '有定价权但增长停滞';
    text = `五年平均毛利率 ${fmtNum(gm, 1)}%，但营收复合 ${fmtPct(growth)}。护城河还在，增长停了，要回答新业务能不能接上。`;
  } else if (growing) {
    answer = '靠规模与增长支撑';
    text = `五年平均毛利率 ${fmtNum(gm, 1)}%（低于 30%），营收复合 ${fmtPct(growth)}。竞争力更可能来自规模、成本或渠道，需要用同行毛利率与份额变化确认。`;
  } else {
    answer = '护城河与增长都需要验证';
    text = `五年平均毛利率 ${fmtNum(gm, 1)}%、营收复合 ${fmtPct(growth)}，价格与规模都没有明显优势，先核对份额和客户留存。`;
  }
  return {
    key: 'sustain',
    q: '可持续吗？',
    tone: isNum(score) && score >= 60 ? 'good' : isNum(score) && score < 45 ? 'weak' : 'mid',
    answer,
    text,
    score,
  };
}

function verdictTrust(ctx) {
  const g = ctx.governance;
  const dims = ctx.dims;
  const score = meanOf([dims.governance && dims.governance.score, dims.risk && dims.risk.score]);
  let text;
  if (g.legalCount > 0) text = `近一年有 ${g.legalCount} 条立案/处罚/监管函类公告，先读原文再判断性质。`;
  else if (g.riskTotal === 0) text = `前十大股东 ${fmtNum(g.top10, 1)}%，股东户数较上期 ${fmtPct(g.holderChange, 1)}，近一年未检索到负面类公告。`;
  else text = `前十大股东 ${fmtNum(g.top10, 1)}%，近一年有 ${g.riskTotal} 条待关注公告（${g.risks.map((r) => r.label).join('、')}）。`;
  return {
    key: 'trust',
    q: '靠谱吗？',
    tone: isNum(score) && score >= 60 ? 'good' : isNum(score) && score < 45 ? 'weak' : 'mid',
    answer: g.legalCount > 0 ? '存在监管类事项' : isNum(score) && score >= 60 ? '治理未见明显异常' : '需要看治理细节',
    text,
    score,
  };
}

// ---------------------------------------------------------------------------
// Verification checklist

function buildVerify(ctx) {
  const cninfo = `http://www.cninfo.com.cn/new/disclosure/stock?stockCode=${ctx.code}&orgId=`;
  const search = `http://www.cninfo.com.cn/new/fulltextSearch?notautosubmit=&keyWord=${encodeURIComponent(ctx.profile.name || ctx.code)}`;
  const items = [
    { label: '最近年报「管理层讨论与分析」+ 审计意见', why: '战略、风险与会计口径只有原文有', where: '巨潮资讯', url: cninfo },
    { label: '前五大客户/供应商占比', why: '集中度往往是最被忽略的风险', where: '年报附注', url: search },
    { label: '经营现金流与净利润的差额构成', why: '应收、存货、预收决定利润的含金量', where: '现金流量表', url: cninfo },
    { label: '诉讼、被执行、行政处罚', why: '公告只覆盖已披露部分，执行信息更全', where: '裁判文书网 / 信用中国', url: 'https://www.creditchina.gov.cn/' },
    { label: '股权质押与减持明细', why: '判断大股东的资金压力', where: '巨潮公告', url: search },
    { label: '研发费用率与专利结构', why: '技术壁垒是否真的在加深', where: '年报', url: cninfo },
    { label: '同行 3–5 家的毛利率/ROE/应收对比', why: '纵向看趋势，横向才知道高低', where: '同板块公司', url: '' },
    { label: '互动易问答与调研纪要', why: '管理层如何解释关键数字', where: '互动易', url: 'https://irm.cninfo.com.cn/' },
  ];
  const purpose = ctx.purpose;
  if (purpose === 'job') {
    items.push({ label: '员工评价、离职率、社保缴纳', why: '组织文化与稳定性只能从人那里得到', where: '员工评价 / 招聘信息 / 社保公示', url: '' });
    items.push({ label: '近一年招聘岗位与裁员新闻', why: '扩张还是收缩，招聘量最直接', where: '招聘平台 / 新闻', url: '' });
  }
  if (purpose === 'partner') {
    items.push({ label: '招投标与履约记录、被执行人信息', why: '交付与信用历史', where: '公共资源交易平台 / 执行信息公开网', url: 'http://zxgk.court.gov.cn/' });
  }
  if (purpose === 'ma') {
    items.push({ label: '资产明细、或有负债、对外担保余额', why: '并购定价的底盘', where: '审计报告附注', url: cninfo });
  }
  if (purpose === 'regulator') {
    items.push({ label: '交易所问询函与公司回复', why: '监管关注点通常先出现在问询里', where: '交易所官网', url: '' });
  }
  return items;
}

// ---------------------------------------------------------------------------
// Assembly

function buildBoard(ctx) {
  const dapan = ctx.dapan;
  const stock = dapan && dapan.stocks ? dapan.stocks.get(ctx.code) : null;
  const boards = dapan && Array.isArray(dapan.boards) ? dapan.boards : [];
  const hit = stock ? boards.find((b) => b.name === stock.board) : null;
  const name = hit ? hit.name : stock ? stock.board : ctx.fallbackBoard || '';
  return {
    name,
    source: hit ? 'dapan' : stock ? 'dapan' : ctx.fallbackBoard ? 'f10' : '',
    pct: hit ? round(hit.changePct, 2) : null,
    rank: hit ? boards.indexOf(hit) + 1 : null,
    total: boards.length || null,
    stockCount: hit ? hit.stockCount : null,
    up: hit ? hit.up : null,
    down: hit ? hit.down : null,
  };
}

function oneLiner(model) {
  const scored = model.dimensions.filter((d) => isNum(d.score)).sort((a, b) => b.score - a.score);
  const strong = scored.filter((d) => d.score >= 60);
  const weak = scored.slice().reverse().filter((d) => d.score < 45);
  const bits = [];
  if (strong.length >= 2) bits.push(`强项在${strong[0].label}、${strong[1].label}`);
  else if (strong.length === 1) bits.push(`强项在${strong[0].label}`);
  if (weak.length) bits.push(`${weak[0].label}是主要短板`);
  else if (strong.length) bits.push('暂未看到明显短板');
  if (!bits.length) bits.push('数据覆盖有限，先按待核实清单补齐');
  if (isNum(model.valuation.pePct)) bits.push(`PE 处于近三年 ${Math.round(model.valuation.pePct)}% 分位`);
  return bits.join('；');
}

export function buildQuickRead(input) {
  const code = input.code;
  const profile = {
    code,
    name: (input.survey && input.survey.name) || (input.quote && input.quote.name) || code,
    orgName: (input.survey && input.survey.orgName) || '',
    chain: (input.survey && input.survey.chain) || '',
    industryCsrc: (input.survey && input.survey.industryCsrc) || '',
    province: (input.survey && input.survey.province) || '',
    chairman: (input.survey && input.survey.chairman) || '',
    controller: (input.holders && input.holders.controller) || '',
    employees: input.survey ? input.survey.employees : null,
    regCapital: input.survey ? input.survey.regCapital : null,
    listed: (input.survey && input.survey.listed) || '',
    founded: (input.survey && input.survey.founded) || '',
    website: (input.survey && input.survey.website) || '',
    profileText: (input.survey && input.survey.profileText) || '',
    businessScope: (input.survey && input.survey.businessScope) || '',
  };
  const financials = deriveFinancials(input.annual, input.latest);
  const financialSector = /银行|保险|证券|多元金融|金融服务|信托/.test(`${profile.industryCsrc} ${profile.chain}`);
  const trading = tradingStats(input.kline, input.series && input.series.rows);
  // Quote fields from the push feed can arrive zeroed (blocked field set).
  // Fall back to the last K-line close / valuation close instead of printing 0.00.
  const klineRows = Array.isArray(input.kline) ? input.kline : [];
  const seriesRows = (input.series && input.series.rows) || [];
  const lastKline = klineRows[klineRows.length - 1] || null;
  const lastSeries = seriesRows[seriesRows.length - 1] || null;
  const qIn = input.quote || {};
  const pickNum = (...values) => {
    for (const v of values) if (isNum(v) && v !== 0) return v;
    return null;
  };
  const quote = {
    price:
      round(pickNum(qIn.price, lastKline && lastKline.close, lastSeries && lastSeries.close), 2) || null,
    pct: round(pickNum(qIn.pct, lastKline && lastKline.pct, trading.lastPct), 2),
    marketCap: pickNum(qIn.totalMarketCap, lastSeries && lastSeries.marketCap),
    pe: round(pickNum(qIn.pe, lastSeries && lastSeries.pe), 2),
    pb: round(pickNum(qIn.pb, lastSeries && lastSeries.pb), 2),
    turnover: round(pickNum(qIn.turnover), 2),
    amount: pickNum(qIn.amount),
    concepts: (Array.isArray(qIn.concepts) ? qIn.concepts : []).slice(0, 8),
  };
  const valuation = buildValuation(code, input.series, input.peers, input.quote, input.kline);
  const governance = buildGovernance(input.holders, input.announcements);
  const board = buildBoard({
    code,
    profile,
    fallbackBoard: valuation.peer ? valuation.peer.board : input.survey ? input.survey.chain : '',
    dapan: input.dapan,
    quote: input.quote,
  });

  const ctx = { code, profile, quote, valuation, governance, board, financials, financialSector, trading, purpose: 'invest', dims: {} };
  const dims = {
    industry: dimensionIndustry(ctx),
    profit: dimensionProfit(ctx),
    moat: dimensionMoat(ctx),
    financial: dimensionFinancial(ctx),
    operations: dimensionOperations(ctx),
    governance: dimensionGovernance(ctx),
    growth: dimensionGrowth(ctx),
    risk: dimensionRisk(ctx),
    valuation: dimensionValuation(ctx),
    culture: dimensionCulture(ctx),
  };
  ctx.dims = dims;

  const dimensions = Object.keys(dims).map((key) => dims[key]);
  const purposes = PURPOSES.map((p) => {
    const ranked = dimensions
      .map((d) => ({ key: d.key, label: d.label, weight: p.weights[d.key] || 0, score: d.score, level: d.level }))
      .sort((a, b) => b.weight - a.weight);
    const weighted = dimensions.reduce((acc, d) => {
      const w = p.weights[d.key] || 0;
      if (!isNum(d.score) || !w) return acc;
      return { sum: acc.sum + d.score * w, weight: acc.weight + w };
    }, { sum: 0, weight: 0 });
    const total = weighted.weight ? Math.round(weighted.sum / weighted.weight) : null;
    return { ...p, total, dimensions: ranked };
  });

  const verdicts = [verdictEarn(ctx), verdictSustain(ctx), verdictTrust(ctx)];
  const model = {
    code,
    name: profile.name,
    profile,
    quote,
    valuation,
    financials,
    governance,
    board,
    trading,
    purposes,
    dimensions,
    verdicts,
    oneLiner: '',
    caveats: [],
  };
  model.oneLiner = oneLiner(model);
  model.caveats = [
    '评分是把财报指标按阈值分档后加总，只用于横向排序，不代表真实价值。',
    '行业对比来自东财 F10 同一板块、同一交易日的快照；板块只有十家以上时才做市值排名。',
    '公告检索只覆盖巨潮近一年披露，未披露的诉讼、被执行、担保不在其中。',
  ];
  return model;
}

// ---------------------------------------------------------------------------
// Markdown export (copy/paste into notes or a chat)

function buildMarkdown(model, purposeKey) {
  const purpose = model.purposes.find((p) => p.key === purposeKey) || model.purposes[0];
  const f = model.financials.summary;
  const v = model.valuation;
  const g = model.governance;
  const lines = [];
  lines.push(`# ${model.name}（${model.code}）· 公司速读`);
  lines.push('');
  lines.push(`> 目的：${purpose.label}（${purpose.intent}） · 生成于 ${new Date().toISOString().slice(0, 10)} · 数据来自公开接口，不构成投资建议`);
  lines.push('');
  lines.push(`**一句话**：${model.oneLiner}。`);
  lines.push('');
  lines.push('## 快速三问');
  for (const x of model.verdicts) lines.push(`- **${x.q}** ${x.answer}：${x.text}`);
  lines.push('');
  lines.push('## 维度评分（按目的权重排序）');
  lines.push('| 维度 | 权重 | 评分 | 结论 |');
  lines.push('| --- | --- | --- | --- |');
  for (const d of purpose.dimensions.filter((x) => x.weight > 0)) {
    lines.push(`| ${d.label} | ${d.weight} | ${isNum(d.score) ? d.score : '数据不足'} | ${d.level.label} |`);
  }
  lines.push('');
  lines.push('## 财务趋势（近五年年报）');
  lines.push('| 年度 | 营收 | 营收同比 | 归母净利 | 毛利率 | ROE | 经营现金流/净利 | 资产负债率 |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of model.financials.annual) {
    lines.push(`| ${r.period} | ${fmtMoney(r.revenue)} | ${fmtPct(r.revenueYoY, 1)} | ${fmtMoney(r.netProfit)} | ${fmtNum(r.grossMargin, 1)}% | ${fmtNum(r.roe, 1)}% | ${fmtNum(r.ocfToNp, 2)}× | ${fmtNum(r.debtRatio, 1)}% |`);
  }
  if (f.latestPeriod) lines.push('', `最新报告期 ${f.latestPeriod}：营收同比 ${fmtPct(f.latestRevenueYoY, 1)}，扣非同比 ${fmtPct(f.latestProfitYoY, 1)}。`);
  lines.push('');
  lines.push('## 估值');
  lines.push(`- PE ${fmtNum(v.pe, 1)}，近三年 ${fmtNum(v.pePct, 0)}% 分位（区间 ${fmtNum(v.peMin, 1)}–${fmtNum(v.peMax, 1)}）；PB ${fmtNum(v.pb, 2)}，${fmtNum(v.pbPct, 0)}% 分位。`);
  if (v.peer) lines.push(`- 同业中位 PE ${fmtNum(v.peer.medianPe, 1)}、PB ${fmtNum(v.peer.medianPb, 2)}（${v.peer.count} 家，${v.peer.tradeDate}）；公司市值排名 ${v.peer.rank}/${v.peer.count}。`);
  lines.push('');
  lines.push('## 治理与风险');
  lines.push(`- 实际控制人 ${g.controller || '—'}；前十大股东合计 ${fmtNum(g.top10, 1)}%（${g.topDate}）；股东户数较上期 ${fmtPct(g.holderChange, 1)}；机构持股 ${fmtNum(g.instRatio, 1)}%。`);
  lines.push(`- 近一年公告 ${g.announcementCount} 条：${g.risks.length ? g.risks.map((r) => `${r.label} ${r.count}`).join('、') : '未检索到负面类公告'}。`);
  if (g.positives.length) lines.push(`- 正向事项：${g.positives.map((r) => `${r.label} ${r.count}`).join('、')}。`);
  lines.push('');
  lines.push('## 待核实');
  for (const x of model.verify || []) lines.push(`- [ ] ${x.label}${x.where ? `（${x.where}）` : ''}：${x.why}`);
  lines.push('');
  lines.push('## 评分依据');
  for (const d of model.dimensions.filter((x) => isNum(x.score))) lines.push(`- ${d.label} ${d.score}（${d.basisText}）`);
  lines.push('');
  lines.push(`数据：巨潮资讯公告、东方财富行情/F10 财报与估值、dapan.app 板块热力。${model.caveats[0]}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Entry: fetch everything, degrade block by block

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(fallback), ms);
      promise.finally(() => clearTimeout(timer)).catch(() => {});
    }),
  ]);
}

export async function buildCompanyRead(rawCode, options = {}) {
  const code = normalizeCode(rawCode);
  const purpose = PURPOSES.some((p) => p.key === options.purpose) ? options.purpose : 'invest';
  const settle = (name, promise, fallback) =>
    promise.catch((err) => {
      console.warn(`[market-radar] read ${code} ${name} unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return fallback;
    });

  const surveyP = settle('survey', getSurvey(code), null);
  const annualP = settle('annual', getAnnualIndicators(code), []);
  const latestP = settle('latest', getLatestIndicators(code), []);
  const seriesP = settle('valuation', getValuationSeries(code), { rows: [], board: '', tradeDate: '' });
  const holdersP = settle('holders', getHolders(code), null);
  const annsP = settle('announcements', getCompanyAnnouncements(code, 365), []);
  const quoteP = settle('quote', getStockQuote(code), null);
  const klineP = settle('kline', getStockKline(code), []);
  const dapanP = withTimeout(settle('dapan', getDapan(), null), 6000, null);

  const [survey, annual, latest, series, holders, anns, quote, kline, dapan] = await Promise.all([
    surveyP,
    annualP,
    latestP,
    seriesP,
    holdersP,
    annsP,
    quoteP,
    klineP,
    dapanP,
  ]);
  const peers = await settle('peers', getPeerValuation(code, series.board, series.tradeDate), null);
  if (!survey && !quote && !annual.length) throw new Error(`未取得 ${code} 的公司资料或财报`);

  const input = { code, survey, annual, latest, series, peers, holders, announcements: anns, quote, kline, dapan };
  const ctxForVerify = { code, profile: { name: input.survey ? input.survey.name : '' }, purpose };
  const model = buildQuickRead(input);
  model.verify = buildVerify({ ...ctxForVerify, profile: model.profile });
  model.purpose = purpose;
  model.markdown = {};
  for (const p of PURPOSES) model.markdown[p.key] = buildMarkdown(model, p.key);
  return {
    ok: true,
    asOf: Date.now(),
    sources: [
      { name: '东方财富 F10', note: '公司资料、五年年报主要指标、股东与估值序列', url: 'https://emweb.securities.eastmoney.com/' },
      { name: '巨潮资讯', note: '近一年公告与原文', url: 'https://www.cninfo.com.cn/' },
      { name: 'dapan.app', note: '行业板块热力与市值排名', url: 'https://dapan.app/' },
    ],
    disclaimer: '评分是把公开财报指标按阈值分档后加总，只用于快速排序与提问，不构成投资建议。',
    ...model,
  };
}

export const _internal = { buildValuation, deriveFinancials, scanAnnouncements, buildMarkdown, band, fmtMoney };
