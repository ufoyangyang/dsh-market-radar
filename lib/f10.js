// Company fundamentals for the "快速了解一个公司" view.
// Everything here is a public Eastmoney F10 / datacenter feed: company survey,
// annual + latest-period main indicators, valuation history and industry peers.
// Each getter is cached separately so one slow feed cannot blank the whole read.

import { UA, cached, num, round, requestJSON } from './data.js';

const F10_HEADERS = {
  'user-agent': UA,
  referer: 'https://emweb.securities.eastmoney.com/',
  connection: 'close',
};
const DC_HEADERS = { 'user-agent': UA, referer: 'https://data.eastmoney.com/', connection: 'close' };
const F10 = 'https://emweb.securities.eastmoney.com/PC_HSF10';
const DC = 'https://datacenter-web.eastmoney.com/api/data/v1/get';

const DAY = 86400000;
const HOUR = 3600000;

export function normalizeCode(raw) {
  const code = String(raw || '').replace(/\D/g, '').slice(0, 6);
  if (!/^\d{6}$/.test(code)) throw new Error('公司代码必须是 6 位数字');
  return code;
}

function f10Code(code) {
  return /^(6|9)/.test(code) ? `SH${code}` : `SZ${code}`;
}

function secuCode(code) {
  return /^(6|9)/.test(code) ? `${code}.SH` : `${code}.SZ`;
}

function dateOnly(value) {
  return String(value || '').slice(0, 10);
}

function toYear(value) {
  const y = Number(String(value || '').slice(0, 4));
  return Number.isFinite(y) ? y : null;
}

// ---------------------------------------------------------------------------
// Company survey (name, industry chain, business scope, listing info)

export function getSurvey(code) {
  return cached(
    `f10:survey:${code}`,
    DAY,
    async () => {
      const json = await requestJSON(`${F10}/CompanySurvey/PageAjax?code=${f10Code(code)}`, {
        headers: F10_HEADERS,
        timeout: 12000,
      });
      const jb = (json && json.jbzl && json.jbzl[0]) || {};
      const fx = (json && json.fxxg && json.fxxg[0]) || {};
      return {
        code,
        name: jb.SECURITY_NAME_ABBR || '',
        orgName: jb.ORG_NAME || '',
        orgNameEn: jb.ORG_NAME_EN || '',
        chain: jb.EM2016 || '',
        industryCsrc: jb.INDUSTRYCSRC1 || '',
        securityType: jb.SECURITY_TYPE || '',
        market: jb.TRADE_MARKET || '',
        province: jb.PROVINCE || '',
        chairman: jb.CHAIRMAN || '',
        president: jb.PRESIDENT || '',
        secretary: jb.SECRETARY || '',
        legalPerson: jb.LEGAL_PERSON || '',
        employees: num(jb.EMP_NUM),
        regCapital: num(jb.REG_CAPITAL),
        website: jb.ORG_WEB || '',
        email: jb.ORG_EMAIL || '',
        address: jb.ADDRESS || '',
        auditor: jb.ACCOUNTFIRM_NAME || '',
        profileText: jb.ORG_PROFILE || '',
        businessScope: jb.BUSINESS_SCOPE || '',
        founded: dateOnly(fx.FOUND_DATE),
        listed: dateOnly(fx.LISTING_DATE),
        issuePrice: num(fx.ISSUE_PRICE),
        totalIssueNum: num(fx.TOTAL_ISSUE_NUM),
      };
    },
    7 * DAY,
  );
}

// ---------------------------------------------------------------------------
// Main indicators. type=1 returns annual reports (9 years), type=0 returns the
// latest reporting periods (quarterly). Both share the same field names.

function mapMainRow(row) {
  const revenue = num(row.TOTALOPERATEREVE);
  const netProfit = num(row.PARENTNETPROFIT);
  const ocfRatio = num(row.JYXJLYYSR); // operating cash flow / revenue, as a fraction
  const ocf = revenue !== null && ocfRatio !== null ? revenue * ocfRatio : null;
  return {
    period: row.REPORT_DATE_NAME || row.REPORT_TYPE || '',
    reportDate: dateOnly(row.REPORT_DATE),
    year: toYear(row.REPORT_DATE),
    reportType: row.REPORT_TYPE || '',
    noticeDate: dateOnly(row.NOTICE_DATE),
    eps: num(row.EPSJB),
    bps: num(row.BPS),
    revenue,
    revenueYoY: num(row.TOTALOPERATEREVETZ),
    netProfit,
    netProfitYoY: num(row.PARENTNETPROFITTZ),
    deducted: num(row.KCFJCXSYJLR),
    deductedYoY: num(row.KCFJCXSYJLRTZ),
    grossMargin: num(row.XSMLL),
    netMargin: num(row.XSJLL),
    roe: num(row.ROEJQ),
    roic: num(row.ROIC),
    ocf,
    ocfRatio: ocfRatio === null ? null : ocfRatio * 100,
    ocfToNp: ocf !== null && netProfit ? ocf / netProfit : null,
    debtRatio: num(row.ZCFZL),
    currentRatio: num(row.LD),
    quickRatio: num(row.SD),
    arDays: num(row.YSZKZZTS),
    invDays: num(row.CHZZTS),
    assetTurnDays: num(row.ZZCZZTS),
    assetTurnover: num(row.TOAZZL),
    cashRatio: num(row.XJLLB),
  };
}

export function getAnnualIndicators(code) {
  return cached(
    `f10:annual:${code}`,
    6 * HOUR,
    async () => {
      const json = await requestJSON(`${F10}/NewFinanceAnalysis/ZYZBAjaxNew?type=1&code=${f10Code(code)}`, {
        headers: F10_HEADERS,
        timeout: 14000,
      });
      const rows = Array.isArray(json && json.data) ? json.data : [];
      return rows.map(mapMainRow).filter((r) => r.reportDate && r.revenue !== null).sort((a, b) => a.reportDate.localeCompare(b.reportDate));
    },
    2 * DAY,
  );
}

export function getLatestIndicators(code) {
  return cached(
    `f10:latest:${code}`,
    2 * HOUR,
    async () => {
      const json = await requestJSON(`${F10}/NewFinanceAnalysis/ZYZBAjaxNew?type=0&code=${f10Code(code)}`, {
        headers: F10_HEADERS,
        timeout: 14000,
      });
      const rows = Array.isArray(json && json.data) ? json.data : [];
      return rows.map(mapMainRow).filter((r) => r.reportDate).sort((a, b) => b.reportDate.localeCompare(a.reportDate));
    },
    3 * DAY,
  );
}

// ---------------------------------------------------------------------------
// Valuation history: one row per trading day with PE(TTM), PB(MRQ), PS(TTM).
// 780 rows ≈ three trading years, enough for a percentile without a heavy page.

const VALUE_COLUMNS = 'SECUCODE,SECURITY_NAME_ABBR,TRADE_DATE,PE_TTM,PB_MRQ,PS_TTM,CLOSE_PRICE,TOTAL_MARKET_CAP,BOARD_NAME';

export function getValuationSeries(code) {
  return cached(
    `dc:value:${code}`,
    6 * HOUR,
    async () => {
      const filter = encodeURIComponent(`(SECUCODE="${secuCode(code)}")`);
      const url =
        `${DC}?reportName=RPT_VALUEANALYSIS_DET&columns=${VALUE_COLUMNS}&filter=${filter}` +
        `&pageSize=780&pageNumber=1&sortColumns=TRADE_DATE&sortTypes=-1&source=WEB&client=WEB`;
      const json = await requestJSON(url, { headers: DC_HEADERS, timeout: 16000 });
      const rows = (json && json.result && json.result.data) || [];
      const series = rows
        .map((r) => ({
          date: dateOnly(r.TRADE_DATE),
          pe: num(r.PE_TTM),
          pb: num(r.PB_MRQ),
          ps: num(r.PS_TTM),
          close: num(r.CLOSE_PRICE),
          marketCap: num(r.TOTAL_MARKET_CAP),
          board: r.BOARD_NAME || '',
        }))
        .filter((r) => r.date)
        .sort((a, b) => a.date.localeCompare(b.date));
      return {
        rows: series,
        board: (rows[0] && rows[0].BOARD_NAME) || '',
        tradeDate: series.length ? series[series.length - 1].date : '',
      };
    },
    3 * DAY,
  );
}

// Peers that share the F10 industry board on the same trade date, so the
// comparison uses one valuation snapshot instead of a mix of dates.
export function getPeerValuation(code, board, tradeDate) {
  if (!board || !tradeDate) return Promise.resolve(null);
  return cached(
    `dc:peers:${board}:${tradeDate}`,
    6 * HOUR,
    async () => {
      const filter = encodeURIComponent(`(BOARD_NAME="${board}")(TRADE_DATE='${tradeDate}')`);
      const url =
        `${DC}?reportName=RPT_VALUEANALYSIS_DET&columns=${VALUE_COLUMNS}&filter=${filter}` +
        `&pageSize=300&pageNumber=1&sortColumns=TOTAL_MARKET_CAP&sortTypes=-1&source=WEB&client=WEB`;
      const json = await requestJSON(url, { headers: DC_HEADERS, timeout: 16000 });
      const rows = (json && json.result && json.result.data) || [];
      const list = rows
        .map((r) => ({
          code: String(r.SECUCODE || '').slice(0, 6),
          name: r.SECURITY_NAME_ABBR || '',
          marketCap: num(r.TOTAL_MARKET_CAP),
          pe: num(r.PE_TTM),
          pb: num(r.PB_MRQ),
          board,
        }))
        .filter((r) => /^\d{6}$/.test(r.code));
      return { board, tradeDate, count: list.length, list };
    },
    3 * DAY,
  );
}

// ---------------------------------------------------------------------------
// Shareholders: holder count trend, top-10 concentration, institutions.

export function getHolders(code) {
  return cached(
    `f10:holders:${code}`,
    3 * DAY,
    async () => {
      const json = await requestJSON(`${F10}/ShareholderResearch/PageAjax?code=${f10Code(code)}`, {
        headers: F10_HEADERS,
        timeout: 14000,
      });
      const gdrs = Array.isArray(json && json.gdrs) ? json.gdrs : [];
      const sdgd = Array.isArray(json && json.sdgd) ? json.sdgd : [];
      const jgcc = Array.isArray(json && json.jgcc) ? json.jgcc : [];
      const sjkzr = Array.isArray(json && json.sjkzr) ? json.sjkzr : [];
      const latestTopDate = sdgd.length ? sdgd[0].END_DATE : '';
      const top = sdgd.filter((r) => r.END_DATE === latestTopDate);
      const top10Ratio = top.reduce((s, r) => s + (num(r.HOLD_NUM_RATIO) || 0), 0);
      return {
        controller: (sjkzr[0] && sjkzr[0].HOLDER_NAME) || '',
        topDate: dateOnly(latestTopDate),
        top: top.map((r) => ({
          name: r.HOLDER_NAME || '',
          rank: num(r.HOLDER_RANK),
          ratio: num(r.HOLD_NUM_RATIO),
          change: r.HOLD_NUM_CHANGE || '',
        })),
        top1Ratio: top.length ? num(top[0].HOLD_NUM_RATIO) : null,
        top10Ratio: top.length ? round(top10Ratio, 2) : null,
        holderCount: gdrs.length ? num(gdrs[0].HOLDER_TOTAL_NUM) : null,
        holderChange: gdrs.length ? num(gdrs[0].TOTAL_NUM_RATIO) : null,
        holderFocus: (gdrs[0] && gdrs[0].HOLD_FOCUS) || '',
        holderDate: dateOnly(gdrs.length ? gdrs[0].END_DATE : ''),
        instRatio: jgcc.length ? num(jgcc[0].TOTAL_SHARES_RATIO) : null,
        instCount: jgcc.length ? num(jgcc[0].TOTAL_ORG_NUM) : null,
        instDate: dateOnly(jgcc.length ? jgcc[0].REPORT_DATE : ''),
      };
    },
    7 * DAY,
  );
}

export function percentile(values, value) {
  const xs = (values || []).filter((v) => Number.isFinite(v));
  if (!xs.length || !Number.isFinite(value)) return null;
  let below = 0;
  for (const v of xs) if (v <= value) below++;
  return round((below / xs.length) * 100, 1);
}

export function median(values) {
  const xs = (values || []).filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (!xs.length) return null;
  const mid = Math.floor(xs.length / 2);
  return xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2;
}
