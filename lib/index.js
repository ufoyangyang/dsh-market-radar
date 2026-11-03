// dsh-market-radar host half: public-data aggregation + a tiny same-origin API.
// The browser half lives in lib/client.js and is served by dsh-client-modules.

import {
  getIndices,
  getIndexKline,
  getStockQuote,
  getStockKline,
  getMarketFundFlow,
  getSectorFundFlow,
  getDapan,
  getAnnouncementFeed,
  getStockUniverse,
  getCompanyAnnouncements,
  getNews,
  searchStocks,
  mapLimit,
  round,
} from './data.js';
import {
  buildMarket,
  buildNews,
  enrichAnnouncement,
  scoreAnnouncement,
  eventStudy,
  computeIndicators,
} from './analytics.js';

const PREFIX = '/dsh-market-radar/api';

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => {
      const timer = setTimeout(() => resolve(fallback), ms);
      promise.finally(() => clearTimeout(timer)).catch(() => {});
    }),
  ]);
}

function json(res, status, body) {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
  });
  res.end(text);
}

function fail(res, err, where) {
  const message = err instanceof Error ? err.message : String(err);
  json(res, 502, { ok: false, error: message, where, asOf: Date.now() });
}

async function buildDashboard() {
  const emptyDapan = { summary: {}, boards: [], stocks: new Map(), stockCount: 0, updatedAt: null };
  const settle = (name, promise, fallback) =>
    promise.catch((err) => {
      console.warn(`[market-radar] ${name} unavailable: ${err instanceof Error ? err.message : String(err)}`);
      return fallback;
    });
  const dapanPromise = settle('dapan', withTimeout(getDapan(), 20000, emptyDapan), emptyDapan);
  // dapan.app ships a ~1MB treemap. Starting it first and letting the smaller
  // Eastmoney calls fan out after a short stagger keeps the cold build near
  // 5s instead of letting the large transfer contend with six other sockets.
  await Promise.race([dapanPromise, new Promise((resolve) => setTimeout(resolve, 1200))]);
  const [indices, dapan, flow, sectorFlow, news, feed, indexKline] = await Promise.all([
    settle('indices', getIndices(), []),
    dapanPromise,
    settle('fund-flow', getMarketFundFlow(), { history: [], today: null }),
    settle('sector-flow', getSectorFundFlow(), { top: [], bottom: [], all: [] }),
    settle('news', getNews(), []),
    settle('announcements', getAnnouncementFeed(), []),
    settle('index-kline', getIndexKline(), []),
  ]);
  const market = buildMarket(indices, dapan, flow, sectorFlow);
  const newsPack = buildNews(news, dapan, indexKline);

  const candidates = (dapan.stocks.size ? feed.filter((a) => dapan.stocks.has(a.code)) : feed)
    .map((a) => {
      const stock = dapan.stocks.get(a.code) || null;
      return { ann: a, stock, prelim: scoreAnnouncement(a, stock ? { pct: stock.pct } : null, null) };
    })
    .sort((a, b) => b.prelim.score - a.prelim.score)
    .slice(0, 90);

  const eventTargets = candidates.slice(0, 18);
  const codes = Array.from(new Set(eventTargets.map((c) => c.ann.code))).slice(0, 12);
  const eventRows = await mapLimit(codes, 5, async (code) => {
    const kline = await getStockKline(code);
    return { code, kline };
  });
  const klineByCode = new Map();
  for (const row of eventRows) if (row && !row.__error) klineByCode.set(row.code, row.kline);

  const enriched = candidates
    .map((c) => {
      const kline = klineByCode.get(c.ann.code);
      const event = kline ? eventStudy(kline, indexKline, c.ann.time) : null;
      return enrichAnnouncement(c.ann, dapan, c.stock ? { pct: c.stock.pct } : null, event);
    })
    .sort((a, b) => b.scored.score - a.scored.score);

  // A single event often produces 3-5 near-duplicate filings (预案/摘要/风险提示).
  // Put at most two rows per company first so the impact table reflects the whole
  // market, then append the remaining rows for completeness.
  const perCode = new Map();
  const lead = [];
  const rest = [];
  for (const row of enriched) {
    const n = perCode.get(row.code) || 0;
    if (n < 2) {
      lead.push(row);
      perCode.set(row.code, n + 1);
    } else {
      rest.push(row);
    }
  }
  const ordered = lead.concat(rest);

  const byDirection = { positive: 0, negative: 0, neutral: 0 };
  for (const a of ordered) {
    if (a.scored.direction > 0) byDirection.positive++;
    else if (a.scored.direction < 0) byDirection.negative++;
    else byDirection.neutral++;
  }
  return {
    ok: true,
    asOf: Date.now(),
    updatedAt: dapan.updatedAt,
    market,
    news: newsPack,
    announcements: ordered,
    stats: {
      total: ordered.length,
      high: ordered.filter((a) => a.scored.level === '高').length,
      medium: ordered.filter((a) => a.scored.level === '中').length,
      uniqueStocks: new Set(ordered.map((a) => a.code)).size,
      byDirection,
    },
    sources: [
      { name: '巨潮资讯', note: '公告原文与披露时间', url: 'https://www.cninfo.com.cn/new/index' },
      { name: '大盘云图', note: 'A股热力、涨跌家数与成交额', url: 'https://dapan.app/' },
      { name: '东方财富', note: '指数、K线、资金流与要闻', url: 'https://quote.eastmoney.com/' },
    ],
    disclaimer: '影响分、情绪分与事件超额收益均为公开数据的启发式计算，不构成投资建议。',
  };
}

function quoteFromKline(code, kline) {
  const last = kline[kline.length - 1] || {};
  const prev = kline[kline.length - 2] || { close: last.open || last.close || 0 };
  const price = Number(last.close) || 0;
  const prevClose = Number(prev.close) || price;
  return {
    code,
    name: '',
    price,
    high: Number(last.high) || price,
    low: Number(last.low) || price,
    open: Number(last.open) || price,
    prevClose,
    volume: Number(last.volume) || 0,
    amount: Number(last.amount) || 0,
    volumeRatio: 0,
    totalShares: 0,
    floatShares: 0,
    totalMarketCap: 0,
    floatMarketCap: 0,
    industry: '',
    region: '',
    concepts: [],
    pe: 0,
    pb: 0,
    turnover: Number(last.turnover) || 0,
    change: Number(last.change) || price - prevClose,
    pct: Number(last.pct) || 0,
    amplitude: Number(last.amplitude) || 0,
    mainHistory: [],
  };
}

async function buildCompany(rawCode) {
  const code = String(rawCode || '').replace(/\D/g, '').slice(0, 6);
  if (!/^\d{6}$/.test(code)) throw new Error('公司代码必须是 6 位数字');
  // K-line is the spine: quote, index history, filings and the heatmap are
  // all enrichments. A flaky cninfo/dapan call must never blank the company
  // view, and the page is still useful from daily bars alone.
  const kline = await getStockKline(code);
  if (!kline.length) throw new Error(`未取得 ${code} 的日线数据`);
  const settle = (promise, fallback) => promise.catch((err) => {
    console.warn(`[market-radar] company ${code} enrichment unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return fallback;
  });
  const [quoteRaw, indexKlineRaw, annsFetched, dapanRaw] = await Promise.all([
    settle(getStockQuote(code), null),
    settle(getIndexKline(), []),
    settle(getCompanyAnnouncements(code, 365), []),
    withTimeout(getDapan(), 6000, null),
  ]);
  const quote = quoteRaw || quoteFromKline(code, kline);
  const indexKline = Array.isArray(indexKlineRaw) ? indexKlineRaw : [];
  const annsRaw = Array.isArray(annsFetched) ? annsFetched : [];
  const dapan = dapanRaw || { stocks: new Map(), boards: [] };
  const anns = annsRaw
    .map((a) => {
      const event = eventStudy(kline, indexKline, a.time);
      return enrichAnnouncement(a, dapan, quote, event);
    })
    .sort((a, b) => b.time - a.time);
  const indicators = computeIndicators(quote, kline, indexKline, annsRaw);
  const stock = dapan.stocks.get(code);
  const board = stock ? stock.board : quote.industry || '';
  const peers = stock
    ? (dapan.boards.find((b) => b.name === stock.board)?.leaders || [])
        .filter((p) => p.code !== code)
        .slice(0, 5)
        .map((p) => ({ code: p.code, name: p.name, pct: round(p.pct, 2), price: round(p.price, 2) }))
    : [];
  const klinePayload = kline.slice(-250).map((r) => [
    r.date,
    round(r.open, 2),
    round(r.close, 2),
    round(r.high, 2),
    round(r.low, 2),
    Math.round(r.volume || 0),
    round(r.amount, 0),
    round(r.pct, 2),
    round(r.turnover, 2),
  ]);
  return {
    ok: true,
    asOf: Date.now(),
    profile: {
      code: quote.code,
      name: quote.name,
      board,
      subBoard: stock ? stock.subBoard : '',
      industry: quote.industry,
      region: quote.region,
      concepts: quote.concepts.slice(0, 12),
      exchange: stock ? stock.exchange : code.startsWith('6') ? 'SH' : 'SZ',
    },
    quote: {
      price: round(quote.price, 2),
      pct: round(quote.pct, 2),
      change: round(quote.change, 2),
      open: round(quote.open, 2),
      high: round(quote.high, 2),
      low: round(quote.low, 2),
      prevClose: round(quote.prevClose, 2),
      amount: round(quote.amount, 0),
      volume: quote.volume,
      turnover: round(quote.turnover, 2),
      volumeRatio: round(quote.volumeRatio, 2),
      pe: quote.pe ? round(quote.pe, 2) : null,
      pb: quote.pb ? round(quote.pb, 2) : null,
      totalMarketCap: round(quote.totalMarketCap, 0),
      floatMarketCap: round(quote.floatMarketCap, 0),
      mainHistory: quote.mainHistory.slice(0, 5),
    },
    kline: klinePayload,
    indicators: indicators.list,
    indicatorSummary: indicators.summary,
    announcements: anns.slice(0, 30),
    peers,
    glossary: [
      {
        title: '事件研究法',
        text: '事件日超额收益 = 个股当日涨跌幅 − 沪深300 当日涨跌幅；CAR3 = 事件日及之后 3 个交易日累计超额收益。它剔除了大盘涨跌，用来观察“这条信息本身”带来的相对定价。',
      },
      {
        title: '影响分',
        text: '0–100 的启发式评分：公告类别基础权重（重组、监管风险、订单、业绩等）+ 市场反应幅度 + 量能确认 + 时效。分数高只代表信息与波动的共振强，不代表方向。',
      },
      {
        title: '方向标签',
        text: '利好 / 利空 / 中性由公告标题关键词判定；若市场反应与标签相反，会标注“市场不买账”或“利空钝化”。',
      },
      {
        title: '主力净流入',
        text: '东方财富口径的超大单 + 大单净买入额。它反映大额委托的方向，但不等于“国家队”或任何单一机构。',
      },
      {
        title: '相对强弱 RS',
        text: '个股区间涨幅减去沪深300 同期涨幅。正值表示跑赢大盘，负值表示跑输；用于区分“绝对上涨”和“相对强势”。',
      },
    ],
    disclaimer: '指标与事件收益由公开行情计算，可能存在延迟或复权差异，不构成投资建议。',
  };
}

async function buildSearch(query) {
  const rows = await searchStocks(query);
  return { ok: true, query, results: rows };
}

function wrap(fn) {
  return async (req, res) => {
    try {
      if (req.method !== 'GET') {
        json(res, 405, { ok: false, error: '只支持 GET' });
        return;
      }
      const result = await fn(req, res);
      if (result !== undefined) json(res, 200, result);
    } catch (err) {
      fail(res, err, 'upstream');
    }
  };
}

function queryOf(req) {
  try {
    return new URL(req.url || '/', 'http://127.0.0.1').searchParams;
  } catch {
    return new URLSearchParams();
  }
}

export default {
  name: 'dsh-market-radar',
  inject: ['webServer'],
  apply(ctx) {
    const disposers = [];
    const route = (path, handler) => {
      disposers.push(ctx.webServer.register({ kind: 'exact', path, handler: wrap(handler) }));
    };
    route(`${PREFIX}/dashboard`, () => buildDashboard());
    route(`${PREFIX}/company`, (req) => buildCompany(queryOf(req).get('code')));
    route(`${PREFIX}/search`, (req) => buildSearch(queryOf(req).get('q')));
    route(`${PREFIX}/health`, () => ({ ok: true, name: 'dsh-market-radar', asOf: Date.now() }));
    ctx.effect(() => () => {
      for (const dispose of disposers) {
        try {
          dispose();
        } catch {
          // ignore teardown races
        }
      }
    });
  },
};

export const _builders = { buildDashboard, buildCompany, buildSearch };
