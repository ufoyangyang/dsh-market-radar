// Data access for dsh-market-radar.
// All upstream feeds are public; every fetch is bounded, retried once and cached.
// Nothing here writes outside the plugin process.

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const EM_HEADERS = { 'user-agent': UA, referer: 'https://quote.eastmoney.com/', connection: 'close' };
const CNINFO_HEADERS = {
  'user-agent': UA,
  'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
  'x-requested-with': 'XMLHttpRequest',
  referer: 'https://www.cninfo.com.cn/new/commonUrl?url=disclosure/list/search',
};
const DAPAN_HEADERS = { 'user-agent': UA, referer: 'https://dapan.app/' };
const NEWS_HEADERS = { 'user-agent': UA, referer: 'https://finance.eastmoney.com/' };

const cache = new Map();
const inflight = new Map();

function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return undefined;
  if (hit.expires <= Date.now()) {
    // Keep a successful value around while its stale window is still open:
    // an upstream hiccup should degrade to the last good snapshot, not to
    // an empty treemap or a blank index row.
    if (hit.staleUntil > Date.now()) return undefined;
    cache.delete(key);
    return undefined;
  }
  return hit.value;
}

function cacheStale(key) {
  const hit = cache.get(key);
  return hit && hit.staleUntil > Date.now() ? hit.value : undefined;
}

export function cached(key, ttlMs, fn, staleMs = 0) {
  const hit = cacheGet(key);
  if (hit !== undefined) return Promise.resolve(hit);
  if (inflight.has(key)) return inflight.get(key);
  const task = Promise.resolve()
    .then(fn)
    .then((value) => {
      const now = Date.now();
      cache.set(key, { value, expires: now + ttlMs, staleUntil: now + ttlMs + staleMs });
      if (cache.size > 240) {
        const cutoff = now;
        for (const [k, v] of cache) if (v.staleUntil <= cutoff) cache.delete(k);
      }
      return value;
    })
    .catch((err) => {
      const stale = staleMs > 0 ? cacheStale(key) : undefined;
      if (stale !== undefined) {
        console.warn(`[market-radar] ${key} upstream failed, serving cached snapshot: ${err instanceof Error ? err.message : String(err)}`);
        return stale;
      }
      throw err;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, task);
  return task;
}

export function clearCache(prefix = '') {
  for (const key of cache.keys()) if (!prefix || key.startsWith(prefix)) cache.delete(key);
}

async function request(url, options = {}, attempt = 0) {
  const { timeout = 9000, retry = true, ...rest } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await fetch(url, { ...rest, signal: controller.signal, redirect: 'follow' });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`HTTP ${res.status} ${url.slice(0, 120)}`);
      err.status = res.status;
      err.body = text.slice(0, 240);
      throw err;
    }
    return text;
  } catch (err) {
    if (retry && attempt < 1 && !String(err && err.message).includes('HTTP 404')) {
      await new Promise((r) => setTimeout(r, 350 + attempt * 500));
      return request(url, options, attempt + 1);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

export async function requestJSON(url, options = {}) {
  const text = await request(url, options);
  try {
    return JSON.parse(text);
  } catch (err) {
    const parsed = text.replace(/^\uFEFF/, '').trim();
    const start = parsed.indexOf('{');
    const end = parsed.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(parsed.slice(start, end + 1));
    throw new Error(`Bad JSON from ${url.slice(0, 120)}: ${text.slice(0, 120)}`);
  }
}

export async function mapLimit(items, limit, mapper) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = new Array(Math.max(1, Math.min(limit, items.length))).fill(0).map(async () => {
    for (;;) {
      const i = cursor++;
      if (i >= items.length) return;
      try {
        out[i] = await mapper(items[i], i);
      } catch (err) {
        out[i] = { __error: err instanceof Error ? err.message : String(err) };
      }
    }
  });
  await Promise.all(workers);
  return out;
}

export function num(value, fallback = null) {
  if (value === null || value === undefined || value === '' || value === '-') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function round(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const p = 10 ** digits;
  return Math.round(value * p) / p;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function beijingDate(ts) {
  if (!ts) return null;
  return new Date(Number(ts) + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function beijingHour(ts) {
  return new Date(Number(ts) + 8 * 3600 * 1000).getUTCHours();
}

function daysAgo(n) {
  return new Date(Date.now() - n * 86400000 + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

function marketOf(code) {
  const c = String(code || '');
  if (/^(6|9)/.test(c)) return { secid: `1.${c}`, market: 'SH' };
  return { secid: `0.${c}`, market: 'SZ' };
}

function parseKlines(rows) {
  return (rows || [])
    .map((line) => {
      const p = String(line).split(',');
      if (p.length < 11) return null;
      return {
        date: p[0],
        open: num(p[1]),
        close: num(p[2]),
        high: num(p[3]),
        low: num(p[4]),
        volume: num(p[5]),
        amount: num(p[6]),
        amplitude: num(p[7]),
        pct: num(p[8]),
        change: num(p[9]),
        turnover: num(p[10]),
      };
    })
    .filter(Boolean);
}

// ---------------------------------------------------------------------------
// Eastmoney quotes / indices / klines / fund flow

export function getIndices() {
  return cached('em:indices', 25000, async () => {
    const secids = '1.000001,0.399001,0.399006,1.000300,1.000905,0.899050';
    const url =
      'https://push2.eastmoney.com/api/qt/ulist.np/get?secids=' +
      encodeURIComponent(secids) +
      '&fields=f2,f3,f4,f5,f6,f12,f14,f15,f16,f17,f18';
    const json = await requestJSON(url, { headers: EM_HEADERS });
    const diff = json && json.data && Array.isArray(json.data.diff) ? json.data.diff : [];
    return diff.map((d) => ({
      code: d.f12,
      name: d.f14,
      price: num(d.f2, 0) / 100,
      pct: num(d.f3, 0) / 100,
      change: num(d.f4, 0) / 100,
      amount: num(d.f6, 0),
      high: num(d.f15, 0) / 100,
      low: num(d.f16, 0) / 100,
      open: num(d.f17, 0) / 100,
      prevClose: num(d.f18, 0) / 100,
    }));
  }, 4 * 60 * 1000);
}

export function getIndexKline() {
  return cached('em:kline:000300', 90000, async () => {
    const beg = daysAgo(420).replace(/-/g, '');
    const url =
      'https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=1.000300&fields1=f1,f2,f3,f4,f5,f6' +
      '&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=' +
      beg +
      '&end=20500101';
    const json = await requestJSON(url, { headers: EM_HEADERS });
    const rows = json && json.data && json.data.klines ? json.data.klines : [];
    return parseKlines(rows);
  });
}

export function getStockKline(code) {
  return cached(`em:kline:${code}`, 90000, async () => {
    const { secid } = marketOf(code);
    const beg = daysAgo(420).replace(/-/g, '');
    const url =
      `https://push2his.eastmoney.com/api/qt/stock/kline/get?secid=${secid}&fields1=f1,f2,f3,f4,f5,f6` +
      '&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61&klt=101&fqt=1&beg=' +
      beg +
      '&end=20500101';
    const json = await requestJSON(url, { headers: EM_HEADERS });
    const rows = json && json.data && json.data.klines ? json.data.klines : [];
    return parseKlines(rows);
  });
}

const QUOTE_FIELDS =
  'f43,f44,f45,f46,f47,f48,f50,f57,f58,f59,f60,f84,f85,f116,f117,f127,f128,f129,f162,f167,f168,f169,f170,f171,f178';

export function getStockQuote(code) {
  return cached(`em:quote:${code}`, 30000, async () => {
    const { secid } = marketOf(code);
    const url = `https://push2.eastmoney.com/api/qt/stock/get?secid=${secid}&fields=${QUOTE_FIELDS}`;
    const json = await requestJSON(url, { headers: EM_HEADERS });
    const d = json && json.data;
    if (!d) throw new Error(`无行情数据 ${code}`);
    let mainHistory = [];
    try {
      mainHistory = JSON.parse(d.f178 || '[]');
    } catch {
      mainHistory = [];
    }
    return {
      code: d.f57 || code,
      name: d.f58 || '',
      price: num(d.f43, 0) / 100,
      high: num(d.f44, 0) / 100,
      low: num(d.f45, 0) / 100,
      open: num(d.f46, 0) / 100,
      prevClose: num(d.f60, 0) / 100,
      volume: num(d.f47, 0),
      amount: num(d.f48, 0),
      volumeRatio: num(d.f50, 0) / 100,
      totalShares: num(d.f84, 0),
      floatShares: num(d.f85, 0),
      totalMarketCap: num(d.f116, 0),
      floatMarketCap: num(d.f117, 0),
      industry: d.f127 || '',
      region: d.f128 || '',
      concepts: String(d.f129 || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      pe: num(d.f162, 0) / 100,
      pb: num(d.f167, 0) / 100,
      turnover: num(d.f168, 0) / 100,
      change: num(d.f169, 0) / 100,
      pct: num(d.f170, 0) / 100,
      amplitude: num(d.f171, 0) / 100,
      mainHistory: Array.isArray(mainHistory) ? mainHistory : [],
    };
  }, 6 * 60 * 1000);
}

function parseFlowLine(line) {
  const p = String(line).split(',');
  if (p.length < 6) return null;
  return {
    date: p[0],
    main: num(p[1], 0),
    small: num(p[2], 0),
    medium: num(p[3], 0),
    large: num(p[4], 0),
    superLarge: num(p[5], 0),
    mainPct: num(p[6], 0),
    close: num(p[11]),
    pct: num(p[12]),
  };
}

export function getMarketFundFlow() {
  return cached('em:fflow:1.000001', 45000, async () => {
    const fields =
      '&fields1=f1,f2,f3,f7&fields2=f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63';
    const todayJson = await requestJSON(
      'https://push2.eastmoney.com/api/qt/stock/fflow/kline/get?lmt=0&klt=101&secid=1.000001' + fields,
      { headers: EM_HEADERS },
    ).catch((err) => { console.warn('[radar] intraday flow failed:', err && err.message); return null; });
    const historyJson = await requestJSON(
      'https://push2his.eastmoney.com/api/qt/stock/fflow/daykline/get?lmt=0&klt=101&secid=1.000001' + fields,
      { headers: EM_HEADERS },
    );
    const rows = historyJson && historyJson.data && historyJson.data.klines ? historyJson.data.klines : [];
    const history = rows.map(parseFlowLine).filter(Boolean);
    if (process.env.RADAR_DEBUG) console.log('[radar] todayJson', JSON.stringify(todayJson && todayJson.data));
    const todayRows =
      todayJson && todayJson.data && todayJson.data.klines ? todayJson.data.klines : [];
    const today = todayRows.map(parseFlowLine).filter(Boolean).pop() || history[history.length - 1] || null;
    return { history, today };
  }, 10 * 60 * 1000);
}

export function getSectorFundFlow() {
  return cached('em:sectorflow', 60000, async () => {
    const base =
      'https://push2.eastmoney.com/api/qt/clist/get?np=1&fltt=2&invt=2&fid=f62' +
      '&fs=m:90+t:2&fields=f12,f14,f2,f3,f62,f184,f66,f69,f72,f75,f78,f81,f84,f87&pz=100&po=1';
    let inJson = null;
    for (let i = 0; i < 3 && !inJson; i++) {
      try {
        inJson = await requestJSON(base + '&pn=1', { headers: EM_HEADERS });
      } catch {
        await new Promise((r) => setTimeout(r, 450 + i * 350));
      }
    }
    if (!inJson) throw new Error('sector flow unavailable');
    let outJson = null;
    for (let i = 0; i < 2 && !outJson; i++) {
      try {
        outJson = await requestJSON(base + '&pn=5', { headers: EM_HEADERS });
      } catch {
        await new Promise((r) => setTimeout(r, 450 + i * 350));
      }
    }
    const rowsOf = (json) => {
      const diff = json && json.data && Array.isArray(json.data.diff) ? json.data.diff : [];
      return diff.map((d) => ({
        code: d.f12,
        name: d.f14,
        pct: num(d.f3, 0),
        main: num(d.f62, 0),
        mainPct: num(d.f184, 0),
        superLarge: num(d.f66, 0),
        large: num(d.f72, 0),
        medium: num(d.f78, 0),
        small: num(d.f84, 0),
      }));
    };
    const inflows = rowsOf(inJson);
    const outflows = rowsOf(outJson)
      .slice()
      .sort((a, b) => (a.main || 0) - (b.main || 0));
    return {
      top: inflows.slice(0, 10),
      bottom: outflows.slice(0, 8),
      all: inflows,
    };
  }, 10 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// dapan.app heatmap

export function getDapan() {
  return cached('dapan:treemap', 50000, async () => {
    const json = await requestJSON('https://dapan.app/api/heatmap/treemap', {
      headers: DAPAN_HEADERS,
      timeout: 18000,
      retry: false,
    });
    const nodes = Array.isArray(json.nodes) ? json.nodes : [];
    const boards = [];
    const stocks = new Map();
    for (const node of nodes) {
      const kids = Array.isArray(node.children) ? node.children : [];
      let value = 0;
      let changeWeighted = 0;
      let turnover = 0;
      let up = 0;
      let down = 0;
      const leaders = [];
      for (const k of kids) {
        const code = String(k.code || '').split('.')[0];
        if (!/^\d{6}$/.test(code)) continue;
        const cap = num(k.value, 0);
        const pct = num(k.changePct, 0);
        value += cap;
        changeWeighted += pct * cap;
        turnover += num(k.turnoverAmount, 0);
        if (pct > 0.05) up++;
        else if (pct < -0.05) down++;
        const item = {
          code,
          name: k.name,
          board: k.boardName || node.name,
          subBoard: k.subBoardName || '',
          price: num(k.price, 0),
          pct,
          marketCap: cap,
          turnover: num(k.turnoverAmount, 0),
          exchange: k.exchange || '',
        };
        stocks.set(code, item);
        leaders.push(item);
      }
      leaders.sort((a, b) => b.pct - a.pct);
      boards.push({
        code: node.code,
        name: node.name,
        value,
        stockCount: kids.length,
        changePct: value ? changeWeighted / value : 0,
        turnover,
        up,
        down,
        leaders: leaders.slice(0, 4),
        heavy: leaders.slice().sort((a, b) => b.marketCap - a.marketCap).slice(0, 3),
      });
    }
    boards.sort((a, b) => b.value - a.value);
    return {
      updatedAt: json.updatedAt || null,
      summary: json.summary || {},
      boards,
      stocks,
      stockCount: json.stockCount || stocks.size,
      boardCount: json.boardCount || boards.length,
      source: json.source || 'dapan.app',
    };
  }, 20 * 60 * 1000);
}

// ---------------------------------------------------------------------------
// cninfo announcements

function cninfoBody({ pageNum = 1, pageSize = 30, searchkey = '', category = '', stock = '', days = 7 }) {
  const params = new URLSearchParams();
  params.set('pageNum', String(pageNum));
  params.set('pageSize', String(pageSize));
  params.set('column', 'szse');
  params.set('tabName', 'fulltext');
  params.set('plate', '');
  params.set('stock', stock);
  params.set('searchkey', searchkey);
  params.set('secid', '');
  params.set('category', category);
  params.set('trade', '');
  params.set('seDate', `${daysAgo(days)}~${daysAgo(0)}`);
  params.set('sortName', 'time');
  params.set('sortType', 'desc');
  params.set('isHLtitle', 'true');
  return params.toString();
}

function normalizeAnnouncement(a) {
  const id = String(a.announcementId || '');
  const adjunct = String(a.adjunctUrl || '');
  return {
    id,
    code: String(a.secCode || ''),
    name: stripHtml(a.secName),
    title: stripHtml(a.announcementTitle),
    time: Number(a.announcementTime) || 0,
    date: beijingDate(a.announcementTime),
    hour: beijingHour(a.announcementTime),
    url: adjunct ? `https://static.cninfo.com.cn/${adjunct.replace(/^\/+/, '')}` : '',
    type: a.announcementType || '',
    column: a.columnId || '',
    pageColumn: a.pageColumn || '',
  };
}

async function queryCninfo(options) {
  const body = cninfoBody(options);
  const json = await requestJSON('https://www.cninfo.com.cn/new/hisAnnouncement/query', {
    method: 'POST',
    headers: CNINFO_HEADERS,
    body,
    timeout: 4500,
    retry: false,
  });
  return (json.announcements || []).map(normalizeAnnouncement).filter((a) => a.code && a.title);
}

const ANN_KEYWORDS = [
  '重大资产重组',
  '收购',
  '控制权',
  '重大合同',
  '中标',
  '业绩预告',
  '业绩快报',
  '回购',
  '增持',
  '减持',
  '问询',
  '立案',
  '处罚',
  '停产',
  '订单',
  '战略合作',
  '风险提示',
  '解禁',
  '诉讼',
];

const ANN_CATEGORIES = [
  ['category_fxts_szsh', 7],
  ['category_yjygjxz_szsh', 7],
  ['category_gqbd_szsh', 7],
];

export function getAnnouncementFeed() {
  return cached('cninfo:feed:v2', 90000, async () => {
    const merged = new Map();
    const add = (rows) => {
      for (const a of rows || []) {
        if (!a || !a.id || !a.code) continue;
        const key = `${a.code}|${String(a.title).replace(/\s+/g, '').slice(0, 42)}`;
        if (!merged.has(key)) merged.set(key, a);
      }
    };

    // Eastmoney's A-share notice index is fast and reliable; it also gives us a
    // usable fallback when cninfo's WAF throttles a burst of keyword queries.
    try {
      const nodes = [0, 1, 2, 3, 5, 6, 7];
      const batches = await Promise.all(
        nodes.map((node) =>
          getEastmoneyAnnouncements({ pageSize: node === 0 ? 80 : 40, node }).catch(() => []),
        ),
      );
      for (const rows of batches) add(rows);
    } catch {
      // keep going
    }

    // cninfo is the primary disclosure source. Keep this deliberately small:
    // two broad, high-signal queries rather than a keyword storm.
    if (!isCninfoBlocked()) {
      const cninfoTasks = [
        () => queryCninfo({ category: 'category_fxts_szsh', days: 7 }),
        () => queryCninfo({ searchkey: '重大合同', days: 7 }),
        () => queryCninfo({ category: 'category_yjygjxz_szsh', days: 7 }),
      ];
      for (const task of cninfoTasks) {
        if (isCninfoBlocked()) break;
        try {
          add(await task());
        } catch (err) {
          if (err && err.status === 403) blockCninfo();
        }
        await new Promise((r) => setTimeout(r, 900));
      }
    }

    return Array.from(merged.values()).sort((a, b) => b.time - a.time);
  });
}

let cninfoBlockedUntil = 0;
function isCninfoBlocked() {
  return Date.now() < cninfoBlockedUntil;
}
function blockCninfo() {
  cninfoBlockedUntil = Date.now() + 8 * 60 * 1000;
}

export function getEastmoneyAnnouncements({ pageSize = 100, code = '', node = 0 } = {}) {
  const key = `em:ann:${code || 'all'}:${node}:${pageSize}`;
  return cached(key, 90000, async () => {
    const stock = code ? `&stock_list=${encodeURIComponent(code)}` : '';
    const url =
      `https://np-anotice-stock.eastmoney.com/api/security/ann?sr=-1&page_size=${pageSize}` +
      `&page_index=1&ann_type=A&client_source=web&f_node=${node}&s_node=0${stock}`;
    const json = await requestJSON(url, { headers: { 'user-agent': UA, referer: 'https://data.eastmoney.com/notices/' } });
    const list = json && json.data && Array.isArray(json.data.list) ? json.data.list : [];
    return list
      .map((n) => {
        const codes = Array.isArray(n.codes) ? n.codes : [];
        const aShare = codes.find((c) => /^\d{6}$/.test(String(c.stock_code || ''))) || codes[0] || {};
        const codeText = String(aShare.stock_code || '');
        if (!/^\d{6}$/.test(codeText)) return null;
        const rawTime = String(n.display_time || n.notice_date || '').replace(' ', 'T');
        const fixed = rawTime.replace(/:(\d{3})$/, '.$1');
        const ts = Date.parse(fixed + (fixed.includes('+') ? '' : '+08:00'));
        return {
          id: String(n.art_code || ''),
          code: codeText,
          name: stripHtml(aShare.short_name || ''),
          title: stripHtml(n.title || n.title_ch || ''),
          time: Number.isFinite(ts) ? ts : Date.now(),
          date: Number.isFinite(ts) ? beijingDate(ts) : beijingDate(Date.now()),
          hour: Number.isFinite(ts) ? beijingHour(ts) : 12,
          url: `https://data.eastmoney.com/notices/detail/${codeText}/${n.art_code}.html`,
          type: (n.columns || []).map((c) => c.column_name).filter(Boolean).join(' / '),
          source: '东方财富',
        };
      })
      .filter(Boolean);
  });
}

export function getStockUniverse() {
  return cached('cninfo:stocks', 3600000, async () => {
    const json = await requestJSON('https://www.cninfo.com.cn/new/data/szse_stock.json', {
      headers: { 'user-agent': UA, referer: 'https://www.cninfo.com.cn/' },
      timeout: 5000,
    });
    const list = Array.isArray(json.stockList) ? json.stockList : [];
    return list.map((s) => ({
      code: String(s.code || ''),
      name: stripHtml(s.zwjc),
      pinyin: String(s.pinyin || ''),
      orgId: String(s.orgId || ''),
      category: s.category || '',
    }));
  });
}

export function getCompanyAnnouncements(code, days = 365) {
  return cached(`cninfo:company:${code}:${days}`, 300000, async () => {
    if (!isCninfoBlocked()) {
      let orgId = '';
      try {
        const universe = await Promise.race([
          getStockUniverse(),
          new Promise((resolve) => setTimeout(() => resolve([]), 3200)),
        ]);
        const hit = Array.isArray(universe) ? universe.find((s) => s.code === code) : null;
        if (hit) orgId = hit.orgId;
      } catch {
        // best effort
      }
      if (!isCninfoBlocked()) {
        try {
          const stock = orgId ? `${code},${orgId}` : code;
          const rows = await queryCninfo({ stock, days, pageSize: 30 });
          const own = rows.filter((a) => a.code === code);
          if (own.length) return own;
        } catch (err) {
          if (err && err.status === 403) blockCninfo();
        }
      }
    }
    try {
      return await getEastmoneyAnnouncements({ pageSize: 50, code });
    } catch {
      return [];
    }
  });
}

// ---------------------------------------------------------------------------
// News

export function getNews() {
  return cached('em:news:344', 120000, async () => {
    const url =
      'https://np-listapi.eastmoney.com/comm/web/getNewsByColumns?client=web&biz=web_news_col' +
      '&column=344&order=1&needInteractData=0&page_index=1&page_size=50&req_trace=' +
      Math.floor(Math.random() * 1e12);
    const json = await requestJSON(url, { headers: NEWS_HEADERS });
    const list = json && json.data && Array.isArray(json.data.list) ? json.data.list : [];
    return list.map((n) => {
      const stamp = String(n.showTime || '').replace(' ', 'T') + '+08:00';
      const ts = Date.parse(stamp);
      return {
        id: String(n.code || n.uniqueUrl || n.url || ''),
        title: stripHtml(n.title),
        summary: stripHtml(n.summary || n.digest || ''),
        url: n.url || n.uniqueUrl || '',
        source: n.mediaName || '东方财富',
        time: Number.isFinite(ts) ? ts : Date.now(),
        date: Number.isFinite(ts) ? beijingDate(ts) : beijingDate(Date.now()),
      };
    });
  });
}

// ---------------------------------------------------------------------------
// Search

/** Last successful heatmap snapshot, without waiting on dapan. */
export function peekDapan() {
  const hit = cache.get('dapan:treemap');
  return hit && hit.staleUntil > Date.now() ? hit.value : null;
}

export async function searchStocks(query) {
  const q = String(query || '').trim();
  if (!q) return [];
  // Search must not wait on the 1MB treemap. The cninfo universe is the
  // authoritative code/name/pinyin index; the heatmap only decorates rows
  // with a live price when a snapshot happens to be warm.
  let universe = [];
  try {
    universe = await getStockUniverse();
  } catch {
    universe = [];
  }
  const dapan = peekDapan() || { stocks: new Map() };
  const upper = q.toUpperCase();
  const scored = [];
  for (const s of universe) {
    let score = 0;
    if (s.code === q) score = 120;
    else if (s.code.startsWith(q)) score = 90;
    else if (s.name === q) score = 100;
    else if (s.name.includes(q)) score = 70;
    else if (s.pinyin && s.pinyin.toUpperCase().includes(upper)) score = 55;
    if (!score) continue;
    const live = dapan.stocks.get(s.code);
    scored.push({
      code: s.code,
      name: s.name,
      board: live ? live.board : '',
      subBoard: live ? live.subBoard : '',
      price: live ? live.price : null,
      pct: live ? live.pct : null,
      marketCap: live ? live.marketCap : 0,
      turnover: live ? live.turnover : 0,
      exchange: live ? live.exchange : '',
      pinyin: s.pinyin,
      score,
    });
  }
  if (!scored.length && dapan.stocks.size) {
    for (const s of dapan.stocks.values()) {
      if (s.code.startsWith(q) || s.name.includes(q)) scored.push({ ...s, score: 30 });
    }
  }
  return scored.sort((a, b) => b.score - a.score || b.marketCap - a.marketCap).slice(0, 12);
}

export const _internal = {
  beijingDate,
  beijingHour,
  daysAgo,
  stripHtml,
  marketOf,
  parseKlines,
};
