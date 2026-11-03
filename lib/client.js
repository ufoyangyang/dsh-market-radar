window.__ModuleLoader__.load({
  id: "dsh-market-radar",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    var React = require("react");
    var h = React.createElement;
    var useState = React.useState;
    var useEffect = React.useEffect;
    var useMemo = React.useMemo;
    var useCallback = React.useCallback;
    var useRef = React.useRef;

    var API = "/dsh-market-radar/api";

    // ---------------------------------------------------------------------
    // formatting helpers
    var CN = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];

    function pad(n) {
      return n < 10 ? "0" + n : "" + n;
    }
    function fmtPct(v, digits) {
      if (v === null || v === undefined || !isFinite(v)) return "—";
      return (v > 0 ? "+" : "") + Number(v).toFixed(digits === undefined ? 2 : digits) + "%";
    }
    function fmtNum(v, digits) {
      if (v === null || v === undefined || !isFinite(v)) return "—";
      return Number(v).toFixed(digits === undefined ? 2 : digits);
    }
    function fmtMoney(v) {
      if (v === null || v === undefined || !isFinite(v)) return "—";
      var abs = Math.abs(v);
      if (abs >= 1e12) return (v / 1e12).toFixed(2) + "万亿";
      if (abs >= 1e8) return (v / 1e8).toFixed(2) + "亿";
      if (abs >= 1e4) return (v / 1e4).toFixed(2) + "万";
      return Number(v).toFixed(0);
    }
    function fmtAmount(v) {
      return fmtMoney(v);
    }
    function fmtPrice(v) {
      if (v === null || v === undefined || !isFinite(v)) return "—";
      return Number(v).toFixed(2);
    }
    function fmtTime(ts) {
      if (!ts) return "—";
      var d = new Date(ts);
      return pad(d.getMonth() + 1) + "-" + pad(d.getDate()) + " " + pad(d.getHours()) + ":" + pad(d.getMinutes());
    }
    function fmtDate(ts) {
      if (!ts) return "—";
      var d = new Date(ts);
      return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }
    function timeAgo(ts) {
      if (!ts) return "";
      var s = Math.max(0, (Date.now() - ts) / 1000);
      if (s < 60) return "刚刚";
      if (s < 3600) return Math.floor(s / 60) + " 分钟前";
      if (s < 86400) return Math.floor(s / 3600) + " 小时前";
      return Math.floor(s / 86400) + " 天前";
    }
    function toneOf(v) {
      if (v === null || v === undefined || !isFinite(v)) return "neutral";
      return v > 0 ? "up" : v < 0 ? "down" : "neutral";
    }
    function clamp(n, lo, hi) {
      return Math.max(lo, Math.min(hi, n));
    }
    function sum(arr) {
      return arr.reduce(function (a, b) {
        return a + b;
      }, 0);
    }

    // ---------------------------------------------------------------------
    // style
    var CSS = `
.mr-root{--mr-bg:#070b12;--mr-panel:#0c1320;--mr-card:#101a29;--mr-card2:#0b1421;--mr-line:#1c2a3d;--mr-line2:#26384f;--mr-text:#e8f0fb;--mr-mut:#8093ad;--mr-dim:#5d7089;--mr-up:#ff5d6c;--mr-down:#2ed3a7;--mr-gold:#f5c451;--mr-cyan:#5eead4;--mr-blue:#6ea8ff;height:100%;overflow-y:auto;overflow-x:hidden;padding:18px 22px 44px;box-sizing:border-box;background:radial-gradient(1100px 520px at 18% -10%,#132338 0%,transparent 52%),radial-gradient(900px 460px at 92% 0%,#1a1f33 0%,transparent 48%),var(--mr-bg);color:var(--mr-text);font-family:"PingFang SC","Microsoft YaHei","Segoe UI",system-ui,-apple-system,sans-serif;font-size:13px;line-height:1.45;font-variant-numeric:tabular-nums}
.mr-root *{box-sizing:border-box}
.mr-root::-webkit-scrollbar{width:10px}
.mr-root::-webkit-scrollbar-thumb{background:#23344a;border-radius:10px;border:2px solid var(--mr-bg)}
.mr-top{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:12px}
.mr-brand{display:flex;align-items:center;gap:12px;min-width:0}
.mr-logo{width:40px;height:40px;border-radius:13px;display:grid;place-items:center;color:#8ffff0;background:linear-gradient(145deg,#123b46,#10202f 70%);border:1px solid #1e4b52;box-shadow:0 0 22px rgba(94,234,212,.12),inset 0 0 18px rgba(94,234,212,.06);flex:none}
.mr-name{font-size:19px;font-weight:750;letter-spacing:.4px;display:flex;align-items:center;gap:8px}
.mr-name em{font-style:normal;font-size:10px;font-weight:600;letter-spacing:1px;color:#0a1119;background:var(--mr-cyan);border-radius:4px;padding:2px 5px;transform:translateY(-1px)}
.mr-sub{font-size:11.5px;color:var(--mr-mut);margin-top:2px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.mr-live{width:6px;height:6px;border-radius:50%;background:var(--mr-down);box-shadow:0 0 0 0 rgba(46,211,167,.55);animation:mrPulse 2.2s infinite}
@keyframes mrPulse{0%{box-shadow:0 0 0 0 rgba(46,211,167,.5)}70%{box-shadow:0 0 0 7px rgba(46,211,167,0)}100%{box-shadow:0 0 0 0 rgba(46,211,167,0)}}
.mr-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.mr-search{position:relative}
.mr-search input{width:236px;height:34px;border-radius:10px;border:1px solid var(--mr-line);background:#0a111c;color:var(--mr-text);padding:0 12px 0 32px;font-size:12.5px;outline:none;transition:border .15s,box-shadow .15s;font-family:inherit}
.mr-search input:focus{border-color:#2b5a63;box-shadow:0 0 0 3px rgba(94,234,212,.08)}
.mr-search .mr-search-ico{position:absolute;left:10px;top:50%;transform:translateY(-50%);color:var(--mr-dim);pointer-events:none;display:flex}
.mr-search-pop{position:absolute;z-index:60;top:40px;left:0;width:320px;max-height:320px;overflow:auto;background:#0c1522;border:1px solid var(--mr-line2);border-radius:12px;box-shadow:0 18px 50px rgba(0,0,0,.55);padding:6px}
.mr-search-row{display:flex;justify-content:space-between;gap:10px;padding:8px 10px;border-radius:8px;cursor:pointer;align-items:center}
.mr-search-row:hover{background:#142235}
.mr-search-row .mr-sr-name{font-weight:600}
.mr-search-row .mr-sr-code{font-size:11px;color:var(--mr-mut);margin-left:6px}
.mr-search-row .mr-sr-pct{font-size:12px}
.mr-btn{height:34px;display:inline-flex;align-items:center;gap:6px;padding:0 12px;border-radius:10px;border:1px solid var(--mr-line);background:#0b1320;color:var(--mr-mut);font-size:12px;cursor:pointer;transition:all .15s;font-family:inherit;white-space:nowrap}
.mr-btn:hover{border-color:#2b4a5f;color:var(--mr-text);background:#101c2b}
.mr-btn.primary{background:linear-gradient(135deg,#1c4a51,#12333c);border-color:#2b6a6e;color:#c9fff7}
.mr-btn.primary:hover{background:linear-gradient(135deg,#236069,#16414a)}
.mr-btn:disabled{opacity:.55;cursor:wait}
.mr-tabs{display:flex;gap:4px;border-bottom:1px solid var(--mr-line);margin:14px 0 16px;overflow-x:auto}
.mr-tab{position:relative;padding:10px 16px 11px;border:0;background:transparent;color:var(--mr-mut);font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap;border-radius:9px 9px 0 0}
.mr-tab:hover{color:var(--mr-text);background:#0e1825}
.mr-tab.active{color:#fff;background:linear-gradient(180deg,rgba(94,234,212,.10),rgba(94,234,212,0))}
.mr-tab.active:after{content:"";position:absolute;left:12px;right:12px;bottom:-1px;height:2px;border-radius:2px;background:linear-gradient(90deg,var(--mr-cyan),var(--mr-blue))}
.mr-tab .mr-tab-count{font-size:10px;color:#0a1119;background:var(--mr-gold);border-radius:8px;padding:1px 5px;margin-left:5px;font-weight:700}
.mr-grid{display:grid;gap:14px}
.mr-grid.cols-3{grid-template-columns:1.12fr .94fr .94fr}
.mr-grid.cols-2{grid-template-columns:1.35fr .95fr}
.mr-card{background:linear-gradient(165deg,rgba(17,27,42,.96),rgba(11,18,30,.96));border:1px solid var(--mr-line);border-radius:15px;padding:14px 16px;min-width:0;box-shadow:0 6px 26px rgba(0,0,0,.18);position:relative;overflow:hidden}
.mr-card:before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(120deg,rgba(94,234,212,.035),transparent 38%);opacity:.8}
.mr-card-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:12px;position:relative;z-index:1}
.mr-card-title{font-size:13px;font-weight:700;letter-spacing:.3px;display:flex;align-items:center;gap:7px}
.mr-card-title .mr-tick{width:3px;height:13px;border-radius:2px;background:linear-gradient(180deg,var(--mr-cyan),var(--mr-blue))}
.mr-card-sub{font-size:11px;color:var(--mr-dim)}
.mr-idx-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:9px;margin-bottom:14px}
.mr-idx{background:linear-gradient(160deg,#101b2b,#0a1220);border:1px solid var(--mr-line);border-radius:13px;padding:10px 12px;position:relative;overflow:hidden}
.mr-idx:after{content:"";position:absolute;right:-18px;top:-18px;width:58px;height:58px;border-radius:50%;background:radial-gradient(circle,rgba(94,234,212,.10),transparent 68%)}
.mr-idx-name{font-size:11px;color:var(--mr-mut);display:flex;justify-content:space-between;gap:6px}
.mr-idx-price{font-size:17px;font-weight:750;margin-top:4px;letter-spacing:.3px}
.mr-idx-pct{font-size:11.5px;font-weight:650;margin-top:1px}
.mr-idx-meta{font-size:10px;color:var(--mr-dim);margin-top:5px;display:flex;justify-content:space-between;gap:4px}
.mr-up{color:var(--mr-up)!important}.mr-down{color:var(--mr-down)!important}.mr-neutral{color:var(--mr-mut)!important}
.mr-gold{color:var(--mr-gold)!important}.mr-cyan{color:var(--mr-cyan)!important}
.mr-sent{display:flex;gap:14px;align-items:center}
.mr-gauge{width:190px;flex:none}
.mr-gauge svg{width:100%;height:auto;display:block}
.mr-gauge-score{font-size:26px;font-weight:800;fill:var(--mr-text)}
.mr-gauge-label{font-size:10px;fill:var(--mr-mut)}
.mr-sent-info{flex:1;min-width:0}
.mr-sent-label{font-size:16px;font-weight:750;margin-bottom:2px}
.mr-sent-desc{font-size:11px;color:var(--mr-mut);margin-bottom:10px;line-height:1.5}
.mr-comp{display:grid;grid-template-columns:58px 1fr 42px;gap:7px;align-items:center;margin:6px 0;font-size:10.5px}
.mr-comp-name{color:var(--mr-mut);white-space:nowrap}
.mr-comp-bar{height:4px;border-radius:4px;background:#162335;overflow:hidden}
.mr-comp-bar i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#2b6d78,var(--mr-cyan))}
.mr-comp-val{text-align:right;color:var(--mr-dim)}
.mr-comp-detail{grid-column:2/4;font-size:9.5px;color:var(--mr-dim);margin-top:-4px}
.mr-breadth-top{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;margin-bottom:9px}
.mr-big{font-size:24px;font-weight:800;letter-spacing:.2px;line-height:1.1}
.mr-small{font-size:10.5px;color:var(--mr-mut)}
.mr-stack{display:flex;height:9px;border-radius:6px;overflow:hidden;background:#162335;margin:7px 0 6px}
.mr-stack i{display:block;height:100%}
.mr-stack-legend{display:flex;justify-content:space-between;font-size:10px;color:var(--mr-mut)}
.mr-kv{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:11px}
.mr-kv-item{background:#0b1421;border:1px solid #182941;border-radius:10px;padding:8px 10px}
.mr-kv-item .mr-k{font-size:10px;color:var(--mr-dim)}
.mr-kv-item .mr-v{font-size:13px;font-weight:700;margin-top:2px}
.mr-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}
.mr-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:6px;background:#132235;border:1px solid #1e334c;color:#a8bad0;font-size:10px;white-space:nowrap}
.mr-chip.up{color:#ffb3ba;background:rgba(255,93,108,.10);border-color:rgba(255,93,108,.24)}
.mr-chip.down{color:#8ff4d6;background:rgba(46,211,167,.10);border-color:rgba(46,211,167,.24)}
.mr-chip.gold{color:#ffe3a1;background:rgba(245,196,81,.10);border-color:rgba(245,196,81,.25)}
.mr-flow-main{display:flex;align-items:baseline;gap:8px;margin:1px 0 2px}
.mr-flow-main .mr-big{font-size:23px}
.mr-flow-bars{display:flex;align-items:flex-end;gap:3px;height:38px;margin:10px 0 4px;border-bottom:1px solid #182941;padding-bottom:2px}
.mr-flow-bar{flex:1;min-width:2px;border-radius:2px 2px 0 0;background:#2b6d78;opacity:.55;transition:opacity .15s}
.mr-flow-bar.pos{background:var(--mr-up)}.mr-flow-bar.neg{background:var(--mr-down)}
.mr-flow-bar:hover{opacity:1}
.mr-flow-list{margin-top:8px}
.mr-flow-row{display:grid;grid-template-columns:64px 1fr 58px;gap:7px;align-items:center;font-size:10.5px;margin:5px 0}
.mr-flow-row .mr-fr-name{color:var(--mr-mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mr-flow-row .mr-fr-bar{height:5px;background:#152337;border-radius:4px;overflow:hidden;position:relative}
.mr-flow-row .mr-fr-bar i{position:absolute;top:0;bottom:0;border-radius:4px;background:var(--mr-up)}
.mr-flow-row.neg .mr-fr-bar i{background:var(--mr-down)}
.mr-flow-row .mr-fr-val{text-align:right;font-weight:600}
.mr-treemap-wrap{margin-top:2px}
.mr-treemap{position:relative;width:100%;height:318px;border-radius:10px;overflow:hidden;background:#0a1220;border:1px solid #16263b}
.mr-tile{position:absolute;border:1px solid rgba(7,11,18,.72);border-radius:4px;padding:5px 6px;overflow:hidden;cursor:pointer;text-align:left;font-family:inherit;color:#f3f8ff;transition:filter .15s,transform .15s;display:flex;flex-direction:column;justify-content:flex-start;gap:1px;min-width:0}
.mr-tile:hover{filter:brightness(1.25);z-index:4;box-shadow:inset 0 0 0 1px rgba(255,255,255,.35)}
.mr-tile-name{font-size:11px;font-weight:700;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 1px 2px rgba(0,0,0,.5)}
.mr-tile-pct{font-size:10px;font-weight:650;opacity:.95}
.mr-tile-meta{font-size:8.5px;opacity:.62;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mr-legend{display:flex;align-items:center;gap:5px;font-size:9.5px;color:var(--mr-dim)}
.mr-legend i{display:block;width:9px;height:9px;border-radius:2px}
.mr-news-list{display:flex;flex-direction:column;gap:7px;position:relative;z-index:1}
.mr-news-item{padding:9px 10px;border-radius:10px;background:#0b1421;border:1px solid #172941;cursor:pointer;transition:border .15s,background .15s}
.mr-news-item:hover{border-color:#2a4b62;background:#0e1a29}
.mr-news-meta{display:flex;align-items:center;gap:6px;font-size:9.5px;color:var(--mr-dim);margin-bottom:4px;flex-wrap:wrap}
.mr-pill{display:inline-flex;align-items:center;padding:1px 6px;border-radius:5px;background:rgba(245,196,81,.12);color:#ffd985;border:1px solid rgba(245,196,81,.22);font-size:9px;font-weight:600;white-space:nowrap}
.mr-pill.blue{background:rgba(110,168,255,.12);color:#bcd6ff;border-color:rgba(110,168,255,.25)}
.mr-news-title{font-size:12px;font-weight:600;line-height:1.4;color:#e4edf9;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.mr-news-reaction{display:flex;gap:6px;flex-wrap:wrap;margin-top:5px;font-size:9.5px;color:var(--mr-dim)}
.mr-news-reaction b{font-weight:600}
.mr-news-more{font-size:10.5px;color:var(--mr-dim);text-align:right;padding:6px 2px 0}
.mr-ann-list{display:flex;flex-direction:column;gap:6px;position:relative;z-index:1}
.mr-ann-row{display:grid;grid-template-columns:36px 1fr auto;gap:9px;align-items:center;padding:8px 9px;border-radius:10px;background:#0b1421;border:1px solid #172941;cursor:pointer;transition:all .15s}
.mr-ann-row:hover{border-color:#2a4b62;background:#0e1a29;transform:translateX(1px)}
.mr-score-ring{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font-size:11px;font-weight:800;border:2px solid #24415a;background:#0a1220;flex:none}
.mr-score-ring.high{border-color:rgba(255,93,108,.6);color:#ffb3ba;box-shadow:0 0 12px rgba(255,93,108,.10)}
.mr-score-ring.mid{border-color:rgba(245,196,81,.55);color:#ffe3a1}
.mr-score-ring.low{border-color:#2a4058;color:#9db1c8}
.mr-ann-main{min-width:0}
.mr-ann-title{font-size:11.5px;font-weight:600;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mr-ann-sub{display:flex;gap:6px;align-items:center;margin-top:3px;font-size:9.5px;color:var(--mr-dim);flex-wrap:wrap}
.mr-ann-right{text-align:right;font-size:10px;white-space:nowrap}
.mr-ann-right .mr-ar-pct{font-weight:700;font-size:11.5px}
.mr-ann-right .mr-ar-car{color:var(--mr-dim);margin-top:2px}
.mr-section{margin-top:14px}
.mr-table-wrap{overflow-x:auto;border:1px solid var(--mr-line);border-radius:12px;background:#0a1220}
.mr-table{width:100%;border-collapse:collapse;font-size:11.5px;min-width:760px}
.mr-table th{position:sticky;top:0;background:#0d1726;color:var(--mr-mut);font-weight:600;text-align:left;padding:9px 10px;border-bottom:1px solid var(--mr-line);font-size:10.5px;white-space:nowrap;z-index:2}
.mr-table td{padding:8px 10px;border-bottom:1px solid #142235;vertical-align:middle}
.mr-table tr:last-child td{border-bottom:0}
.mr-table tbody tr{cursor:pointer;transition:background .12s}
.mr-table tbody tr:hover{background:#0f1b2b}
.mr-td-title{max-width:430px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#dbe7f5}
.mr-td-company{font-weight:600;white-space:nowrap}
.mr-td-company small{display:block;color:var(--mr-dim);font-weight:400;font-size:9.5px}
.mr-bar-cell{width:78px}
.mr-bar-cell .mr-mini-bar{height:4px;border-radius:4px;background:#17263a;overflow:hidden}
.mr-bar-cell .mr-mini-bar i{display:block;height:100%;border-radius:4px;background:linear-gradient(90deg,#b0535e,var(--mr-up))}
.mr-filterbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:0 0 12px}
.mr-filterbar select,.mr-filterbar input{height:32px;border-radius:9px;border:1px solid var(--mr-line);background:#0a111c;color:var(--mr-text);font-size:11.5px;padding:0 10px;outline:none;font-family:inherit}
.mr-filterbar input{width:200px}
.mr-filterbar select:focus,.mr-filterbar input:focus{border-color:#2b5a63}
.mr-stat-chips{display:flex;gap:6px;flex-wrap:wrap;margin-left:auto}
.mr-stat-chip{font-size:10px;color:var(--mr-mut);background:#0d1726;border:1px solid #1b2c42;border-radius:7px;padding:4px 8px}
.mr-stat-chip b{color:var(--mr-text)}
.mr-empty{padding:44px 16px;text-align:center;color:var(--mr-dim);font-size:12px;border:1px dashed #22364d;border-radius:12px;background:#0a1220}
.mr-empty b{display:block;color:var(--mr-mut);font-size:13px;margin-bottom:6px}
.mr-loading{padding:60px 20px;text-align:center;color:var(--mr-mut)}
.mr-spinner{width:22px;height:22px;border:2px solid #1e334b;border-top-color:var(--mr-cyan);border-radius:50%;margin:0 auto 10px;animation:mrspin .8s linear infinite}
@keyframes mrspin{to{transform:rotate(360deg)}}
.mr-err{margin:16px 0;padding:14px 16px;border:1px solid rgba(255,93,108,.3);background:rgba(255,93,108,.06);border-radius:12px;color:#ffc3c8;font-size:12px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}
.mr-skel{background:linear-gradient(90deg,#101b2b 25%,#15263a 37%,#101b2b 63%);background-size:400% 100%;animation:mrsheen 1.4s ease infinite;border-radius:8px}
@keyframes mrsheen{0%{background-position:100% 0}100%{background-position:0 0}}
.mr-co-head{display:flex;gap:16px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;margin-bottom:14px}
.mr-co-id{display:flex;gap:12px;align-items:flex-start;min-width:0}
.mr-back{width:32px;height:32px;border-radius:9px;border:1px solid var(--mr-line);background:#0b1320;color:var(--mr-mut);cursor:pointer;display:grid;place-items:center;flex:none;font-family:inherit}
.mr-back:hover{color:var(--mr-text);border-color:#2b4a5f}
.mr-co-name{font-size:21px;font-weight:800;letter-spacing:.3px;display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.mr-co-name small{font-size:11px;color:var(--mr-dim);font-weight:500;letter-spacing:.4px}
.mr-co-tags{display:flex;gap:5px;flex-wrap:wrap;margin-top:7px;max-width:760px}
.mr-co-quote{text-align:right;flex:none}
.mr-co-price{font-size:31px;font-weight:800;line-height:1;letter-spacing:.5px}
.mr-co-pct{font-size:12.5px;font-weight:700;margin-top:5px}
.mr-co-meta{font-size:10px;color:var(--mr-dim);margin-top:5px}
.mr-metric-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px;margin-bottom:14px}
.mr-metric{background:#0c1624;border:1px solid #1a2c43;border-radius:11px;padding:9px 11px}
.mr-metric .mr-k{font-size:10px;color:var(--mr-dim);white-space:nowrap}
.mr-metric .mr-v{font-size:14px;font-weight:700;margin-top:2px;white-space:nowrap}
.mr-chart-card{padding-bottom:10px}
.mr-chart-tools{display:flex;gap:4px}
.mr-range{height:24px;padding:0 8px;border-radius:6px;border:1px solid #1c2e46;background:#0b1421;color:var(--mr-dim);font-size:10px;cursor:pointer;font-family:inherit}
.mr-range.active{color:#0a1119;background:var(--mr-cyan);border-color:var(--mr-cyan);font-weight:700}
.mr-chart-box{position:relative;width:100%;margin-top:2px}
.mr-chart-box svg{width:100%;height:auto;display:block;overflow:visible}
.mr-chart-tip{position:absolute;z-index:5;transform:translateX(-50%);background:rgba(9,15,24,.96);border:1px solid #2a465f;border-radius:9px;padding:7px 9px;font-size:10px;line-height:1.55;color:#dbe7f5;pointer-events:none;white-space:nowrap;box-shadow:0 8px 24px rgba(0,0,0,.45)}
.mr-chart-tip b{color:#fff}
.mr-chart-legend{display:flex;gap:12px;align-items:center;font-size:10px;color:var(--mr-dim);margin-top:6px;flex-wrap:wrap}
.mr-chart-legend i{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:4px;vertical-align:-1px}
.mr-ind-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}
.mr-ind{background:#0c1624;border:1px solid #192b42;border-radius:11px;padding:10px 11px;min-height:104px;display:flex;flex-direction:column;transition:border .15s}
.mr-ind:hover{border-color:#2a4b62}
.mr-ind-top{display:flex;align-items:center;justify-content:space-between;gap:5px;font-size:10px;color:var(--mr-mut);white-space:nowrap}
.mr-ind-value{font-size:17px;font-weight:800;margin:5px 0 4px;letter-spacing:.2px}
.mr-ind-explain{font-size:9.5px;color:var(--mr-dim);line-height:1.45;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;margin-top:auto}
.mr-info{width:13px;height:13px;border-radius:50%;border:1px solid #2a4058;display:inline-grid;place-items:center;font-size:8px;color:var(--mr-dim);cursor:help;flex:none}
.mr-event-list{display:flex;flex-direction:column;gap:8px}
.mr-event{display:grid;grid-template-columns:10px 1fr auto;gap:10px;padding:10px 11px;border-radius:11px;background:#0b1421;border:1px solid #172941}
.mr-event-dot{width:7px;height:7px;border-radius:50%;margin-top:5px;background:var(--mr-gold);box-shadow:0 0 0 4px rgba(245,196,81,.08)}
.mr-event-body{min-width:0}
.mr-event-title{font-size:11.5px;font-weight:600;line-height:1.4;color:#e1ebf8;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.mr-event-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:5px;font-size:9.5px;color:var(--mr-dim)}
.mr-event-link{font-size:10px;color:var(--mr-cyan);text-decoration:none;white-space:nowrap;align-self:center;opacity:.85}
.mr-event-link:hover{text-decoration:underline;opacity:1}
.mr-glossary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
.mr-gloss{background:#0b1421;border:1px solid #172941;border-radius:10px;padding:10px 12px}
.mr-gloss b{font-size:11px;color:#dbe7f5;display:block;margin-bottom:3px}
.mr-gloss p{font-size:10px;color:var(--mr-mut);line-height:1.55;margin:0}
.mr-peer-table{width:100%;border-collapse:collapse;font-size:11px}
.mr-peer-table th{color:var(--mr-dim);font-weight:500;text-align:left;padding:6px 8px;border-bottom:1px solid #172941;font-size:10px}
.mr-peer-table td{padding:7px 8px;border-bottom:1px solid #131f31}
.mr-peer-table tr:last-child td{border-bottom:0}
.mr-hero{max-width:640px;margin:8vh auto 0;text-align:center}
.mr-hero-icon{width:62px;height:62px;border-radius:20px;display:grid;place-items:center;margin:0 auto 16px;background:linear-gradient(145deg,#123b46,#0c1a27);border:1px solid #1e4b52;color:#8ffff0;box-shadow:0 0 40px rgba(94,234,212,.12)}
.mr-hero h2{font-size:21px;margin:0 0 7px;font-weight:800;letter-spacing:.4px}
.mr-hero p{font-size:12px;color:var(--mr-mut);line-height:1.6;margin:0 0 18px}
.mr-hero .mr-search input{width:100%;height:42px;font-size:13px;border-radius:12px}
.mr-hero .mr-search-pop{width:100%;top:48px}
.mr-hot{margin-top:22px;text-align:left}
.mr-hot-title{font-size:10px;color:var(--mr-dim);letter-spacing:1px;margin:0 0 8px;text-transform:uppercase}
.mr-hot-chips{display:flex;gap:6px;flex-wrap:wrap}
.mr-hot-chip{padding:5px 9px;border-radius:8px;border:1px solid #1c2e46;background:#0b1421;color:#b8c8dc;font-size:10.5px;cursor:pointer;font-family:inherit;transition:all .15s}
.mr-hot-chip:hover{border-color:#2b5a63;color:#fff;background:#10202d}
.mr-footer{margin-top:22px;padding-top:12px;border-top:1px solid #142235;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;font-size:9.5px;color:#52657c;line-height:1.6}
.mr-footer a{color:#6f8aa2;text-decoration:none}
.mr-footer a:hover{color:var(--mr-cyan)}
.mr-source{display:flex;gap:5px;flex-wrap:wrap}
.mr-source span{padding:1px 5px;border:1px solid #1c2e46;border-radius:4px}
.mr-banner{display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:9px;background:rgba(245,196,81,.06);border:1px solid rgba(245,196,81,.18);color:#e7cf9b;font-size:10.5px;margin-bottom:12px}
.mr-banner b{color:#ffd985}
@media (max-width:1180px){.mr-idx-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.mr-grid.cols-3{grid-template-columns:1fr 1fr}.mr-grid.cols-3 .mr-card:first-child{grid-column:1/-1}.mr-ind-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.mr-metric-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:860px){.mr-root{padding:14px 14px 34px}.mr-idx-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mr-grid.cols-3,.mr-grid.cols-2{grid-template-columns:1fr}.mr-grid.cols-3 .mr-card:first-child{grid-column:auto}.mr-sent{flex-direction:column;align-items:stretch}.mr-gauge{width:170px;margin:0 auto}.mr-ind-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mr-glossary{grid-template-columns:1fr}.mr-metric-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.mr-search input{width:190px}.mr-co-quote{text-align:left}}
@media (max-width:560px){.mr-idx-grid{grid-template-columns:1fr 1fr}.mr-ind-grid{grid-template-columns:1fr}.mr-metric-grid{grid-template-columns:1fr 1fr}.mr-kv{grid-template-columns:1fr 1fr}.mr-top{align-items:flex-start}.mr-actions{width:100%}.mr-search{flex:1}.mr-search input{width:100%}.mr-co-price{font-size:27px}}
`;

    function injectCss() {
      if (typeof document === "undefined") return;
      if (document.getElementById("mr-market-radar-style")) return;
      var style = document.createElement("style");
      style.id = "mr-market-radar-style";
      style.textContent = CSS;
      document.head.appendChild(style);
    }

    // ---------------------------------------------------------------------
    // icons
    function IconRadar(props) {
      var size = props && props.size ? props.size : 20;
      var active = props && props.active;
      return h(
        "svg",
        {
          width: size,
          height: size,
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: 1.6,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          style: { opacity: active ? 1 : 0.9 },
        },
        h("circle", { cx: 12, cy: 12, r: 9.2, opacity: 0.35 }),
        h("circle", { cx: 12, cy: 12, r: 5.7, opacity: 0.55 }),
        h("circle", { cx: 12, cy: 12, r: 2.1, fill: "currentColor", stroke: "none" }),
        h("path", { d: "M12 12 L19.5 4.8" }),
        h("path", { d: "M18.9 3.9 a1.9 1.9 0 1 1 -2.1 2.1", opacity: 0.75 }),
      );
    }
    function IconSearch(props) {
      var size = props && props.size ? props.size : 14;
      return h(
        "svg",
        { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" },
        h("circle", { cx: 11, cy: 11, r: 7 }),
        h("path", { d: "M20 20 L16 16" }),
      );
    }
    function IconRefresh(props) {
      var size = props && props.size ? props.size : 13;
      return h(
        "svg",
        { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        h("path", { d: "M20 11a8 8 0 1 0 -2.3 6" }),
        h("path", { d: "M20 4v7h-7" }),
      );
    }
    function IconBack(props) {
      return h(
        "svg",
        { width: 15, height: 15, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" },
        h("path", { d: "M15 18l-6-6 6-6" }),
      );
    }
    function IconExternal() {
      return h(
        "svg",
        { width: 10, height: 10, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" },
        h("path", { d: "M14 4h6v6M20 4l-9 9M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" }),
      );
    }

    // ---------------------------------------------------------------------
    // small primitives
    function Card(props) {
      return h(
        "section",
        { className: "mr-card " + (props.className || "") },
        h(
          "div",
          { className: "mr-card-head" },
          h("div", { className: "mr-card-title" }, h("span", { className: "mr-tick" }), props.title),
          props.right || (props.sub ? h("div", { className: "mr-card-sub" }, props.sub) : null),
        ),
        props.children,
      );
    }
    function Pct(props) {
      var v = props.value;
      return h("span", { className: "mr-" + toneOf(v) }, fmtPct(v));
    }
    function ScoreRing(props) {
      var score = props.score || 0;
      var cls = score >= 75 ? "high" : score >= 55 ? "mid" : "low";
      return h("div", { className: "mr-score-ring " + cls, title: "信息影响分 " + score + " / 100" }, score);
    }
    function Pill(props) {
      return h("span", { className: "mr-pill " + (props.tone || "") }, props.children);
    }
    function DirectionChip(props) {
      var d = props.direction;
      var cls = d > 0 ? "up" : d < 0 ? "down" : "";
      return h("span", { className: "mr-chip " + cls }, props.label || (d > 0 ? "利好" : d < 0 ? "利空" : "中性"));
    }
    function InfoDot(props) {
      return h("span", { className: "mr-info", title: props.text }, "?");
    }
    function Skeleton(props) {
      return h("div", { className: "mr-skel", style: props.style || {} });
    }

    // ---------------------------------------------------------------------
    // search
    function SearchBox(props) {
      var valueState = useState(props.value || "");
      var value = valueState[0];
      var setValue = valueState[1];
      var rowsState = useState([]);
      var rows = rowsState[0];
      var setRows = rowsState[1];
      var openState = useState(false);
      var open = openState[0];
      var setOpen = openState[1];
      var timer = useRef(null);
      var boxRef = useRef(null);

      useEffect(() => {
        function onDoc(e) {
          if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
        }
        document.addEventListener("mousedown", onDoc);
        return function () {
          document.removeEventListener("mousedown", onDoc);
        };
      }, []);

      function run(q) {
        if (!q || q.trim().length === 0) {
          setRows([]);
          return;
        }
        fetch(API + "/search?q=" + encodeURIComponent(q.trim()))
          .then(function (r) {
            return r.json();
          })
          .then(function (j) {
            setRows(j && j.ok ? j.results || [] : []);
            setOpen(true);
          })
          .catch(function () {
            setRows([]);
          });
      }
      function onChange(e) {
        var q = e.target.value;
        setValue(q);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(function () {
          run(q);
        }, 220);
      }
      function choose(item) {
        setOpen(false);
        setValue(item.name + " " + item.code);
        if (props.onSelect) props.onSelect(item.code, item);
      }
      function onKeyDown(e) {
        if (e.key === "Enter" && rows.length) choose(rows[0]);
        if (e.key === "Escape") setOpen(false);
      }
      return h(
        "div",
        { className: "mr-search", ref: boxRef },
        h("span", { className: "mr-search-ico" }, h(IconSearch, { size: 14 })),
        h("input", {
          value: value,
          onChange: onChange,
          onKeyDown: onKeyDown,
          onFocus: function () {
            if (rows.length) setOpen(true);
          },
          placeholder: props.placeholder || "搜索公司代码 / 名称",
          "aria-label": "搜索公司",
        }),
        open && rows.length
          ? h(
              "div",
              { className: "mr-search-pop" },
              rows.map(function (r) {
                return h(
                  "div",
                  { key: r.code, className: "mr-search-row", onClick: function () { choose(r); } },
                  h(
                    "div",
                    null,
                    h("span", { className: "mr-sr-name" }, r.name),
                    h("span", { className: "mr-sr-code" }, r.code),
                    r.board ? h("span", { className: "mr-chip", style: { marginLeft: 6 } }, r.board) : null,
                  ),
                  h("span", { className: "mr-sr-pct mr-" + toneOf(r.pct) }, fmtPct(r.pct)),
                );
              }),
            )
          : null,
      );
    }

    // ---------------------------------------------------------------------
    // gauge / treemap / chart
    function Gauge(props) {
      var score = clamp(Number(props.score) || 0, 0, 100);
      var angle = Math.PI - (score / 100) * Math.PI;
      var cx = 100;
      var cy = 100;
      var r = 76;
      var needle = 55;
      var nx = cx + Math.cos(angle) * needle;
      var ny = cy - Math.sin(angle) * needle;
      var color = score < 38 ? "#5eead4" : score < 66 ? "#f5c451" : "#ff5d6c";
      var len = Math.PI * r;
      return h(
        "div",
        { className: "mr-gauge" },
        h(
          "svg",
          { viewBox: "0 0 200 128" },
          h("path", { d: "M 24 100 A 76 76 0 0 1 176 100", fill: "none", stroke: "#1a2b40", strokeWidth: 12, strokeLinecap: "round" }),
          h("path", {
            d: "M 24 100 A 76 76 0 0 1 176 100",
            fill: "none",
            stroke: color,
            strokeWidth: 12,
            strokeLinecap: "round",
            strokeDasharray: (len * score) / 100 + " " + len,
            style: { filter: "drop-shadow(0 0 5px " + color + "55)" },
          }),
          h("line", { x1: cx, y1: cy, x2: nx, y2: ny, stroke: "#e8f0fb", strokeWidth: 2.3, strokeLinecap: "round" }),
          h("circle", { cx: cx, cy: cy, r: 3.4, fill: "#e8f0fb" }),
          h("text", { x: 100, y: 83, textAnchor: "middle", className: "mr-gauge-score" }, score),
          h("text", { x: 100, y: 116, textAnchor: "middle", className: "mr-gauge-label" }, props.label || ""),
          h("text", { x: 24, y: 122, textAnchor: "middle", fill: "#52657c", fontSize: 8 }, "0"),
          h("text", { x: 176, y: 122, textAnchor: "middle", fill: "#52657c", fontSize: 8 }, "100"),
        ),
      );
    }

    function treemapLayout(items, x, y, w, h) {
      if (!items.length) return [];
      if (items.length === 1) return [{ item: items[0].item, x: x, y: y, w: w, h: h }];
      var total = sum(items.map(function (i) { return Math.max(1, i.value || 1); }));
      var acc = 0;
      var split = 1;
      for (var i = 0; i < items.length; i++) {
        acc += Math.max(1, items[i].value || 1);
        if (acc >= total / 2) {
          split = Math.max(1, i + 1);
          break;
        }
      }
      if (split >= items.length) split = items.length - 1;
      var a = items.slice(0, split);
      var b = items.slice(split);
      if (!b.length) return [{ item: items[0].item, x: x, y: y, w: w, h: h }];
      var ratio = Math.min(0.92, Math.max(0.08, acc / total));
      if (w >= h) {
        return treemapLayout(a, x, y, w * ratio, h).concat(treemapLayout(b, x + w * ratio, y, w * (1 - ratio), h));
      }
      return treemapLayout(a, x, y, w, h * ratio).concat(treemapLayout(b, x, y + h * ratio, w, h * (1 - ratio)));
    }

    function heatColor(pct) {
      var x = clamp((pct || 0) / 5, -1, 1);
      if (x >= 0) return "rgba(255,93,108," + (0.08 + x * 0.47).toFixed(2) + ")";
      return "rgba(46,211,167," + (0.08 + -x * 0.47).toFixed(2) + ")";
    }

    function Treemap(props) {
      var boards = (props.boards || []).slice(0, 31);
      var rects = useMemo(
        function () {
          var items = boards
            .map(function (b) {
              return { item: b, value: Math.max(1, b.value || 1) };
            })
            .sort(function (a, b) {
              return b.value - a.value;
            });
          return treemapLayout(items, 0, 0, 100, 100);
        },
        [boards],
      );
      return h(
        "div",
        { className: "mr-treemap" },
        rects.map(function (r) {
          var b = r.item;
          var area = r.w * r.h;
          var font = Math.max(8.5, Math.min(12.5, Math.sqrt(area) / 2.9));
          var showMeta = r.h > 9 && r.w > 13;
          return h(
            "button",
            {
              key: b.code || b.name,
              className: "mr-tile",
              onClick: function () {
                if (props.onSelect) props.onSelect(b.name);
              },
              title: b.name + " " + fmtPct(b.changePct) + " · 成交 " + fmtMoney(b.turnover),
              style: {
                left: r.x + "%",
                top: r.y + "%",
                width: r.w + "%",
                height: r.h + "%",
                background: "linear-gradient(145deg," + heatColor(b.changePct) + ",rgba(10,17,28,.88))",
              },
            },
            h("span", { className: "mr-tile-name", style: { fontSize: font } }, b.name),
            h("span", { className: "mr-tile-pct", style: { fontSize: Math.max(8.5, font - 1.5) } }, fmtPct(b.changePct)),
            showMeta ? h("span", { className: "mr-tile-meta" }, fmtMoney(b.turnover)) : null,
          );
        }),
      );
    }

    function PriceChart(props) {
      var rowsAll = props.rows || [];
      var rangeState = useState(120);
      var range = rangeState[0];
      var setRange = rangeState[1];
      var hoverState = useState(null);
      var hover = hoverState[0];
      var setHover = hoverState[1];
      var boxRef = useRef(null);
      var rows = rowsAll.slice(-range);
      var W = 900;
      var H = 318;
      var padL = 44;
      var padR = 14;
      var padT = 14;
      var padB = 28;
      var priceH = 226;
      var volTop = 256;
      var volH = 38;
      var n = rows.length;
      var closes = rows.map(function (r) { return r[2]; });
      var min = closes.length ? Math.min.apply(null, closes) : 0;
      var max = closes.length ? Math.max.apply(null, closes) : 1;
      var pad = (max - min) * 0.09 || 1;
      min -= pad;
      max += pad;
      function xOf(i) {
        return padL + (n <= 1 ? 0 : (i / (n - 1)) * (W - padL - padR));
      }
      function yOf(v) {
        return padT + ((max - v) / (max - min || 1)) * priceH;
      }
      var line = rows
        .map(function (r, i) {
          return (i ? "L" : "M") + xOf(i).toFixed(1) + "," + yOf(r[2]).toFixed(1);
        })
        .join(" ");
      var area = line + " L " + xOf(n - 1).toFixed(1) + "," + (padT + priceH) + " L " + xOf(0).toFixed(1) + "," + (padT + priceH) + " Z";
      var volMax = Math.max.apply(null, rows.map(function (r) { return r[5] || 0; }).concat([1]));
      var gridVals = [0, 0.25, 0.5, 0.75, 1].map(function (t) { return min + (max - min) * t; });
      var xTicks = n ? [0, 0.25, 0.5, 0.75, 1].map(function (t) { return Math.round(t * (n - 1)); }) : [];
      var markerMap = {};
      (props.markers || []).forEach(function (m) {
        if (!m || !m.date) return;
        var idx = rows.findIndex(function (r) { return r[0] === m.date; });
        if (idx >= 0) {
          if (!markerMap[idx]) markerMap[idx] = [];
          markerMap[idx].push(m);
        }
      });
      function onMove(e) {
        if (!boxRef.current || !n) return;
        var rect = e.currentTarget.getBoundingClientRect();
        var px = ((e.clientX - rect.left) / rect.width) * W;
        var i = Math.round(((px - padL) / (W - padL - padR)) * (n - 1));
        setHover(clamp(i, 0, n - 1));
      }
      var hov = hover !== null && rows[hover] ? rows[hover] : null;
      return h(
        "div",
        { className: "mr-chart-box", ref: boxRef },
        h(
          "div",
          { className: "mr-chart-tools", style: { display: "flex", justifyContent: "flex-end", gap: 4, marginBottom: 2 } },
          [60, 120, 250].map(function (r) {
            return h(
              "button",
              { key: r, className: "mr-range " + (range === r ? "active" : ""), onClick: function () { setRange(r); } },
              r + "日",
            );
          }),
        ),
        h(
          "div",
          { style: { position: "relative" } },
          h(
            "svg",
            { viewBox: "0 0 " + W + " " + H, onMouseMove: onMove, onMouseLeave: function () { setHover(null); } },
            h(
              "defs",
              null,
              h(
                "linearGradient",
                { id: "mr-area-grad", x1: "0", y1: "0", x2: "0", y2: "1" },
                h("stop", { offset: "0%", stopColor: "#5eead4", stopOpacity: "0.22" }),
                h("stop", { offset: "100%", stopColor: "#5eead4", stopOpacity: "0" }),
              ),
            ),
            gridVals.map(function (v, i) {
              return h(
                "g",
                { key: "g" + i },
                h("line", { x1: padL, x2: W - padR, y1: yOf(v), y2: yOf(v), stroke: "#16263a", strokeWidth: 1, strokeDasharray: i === 0 ? "0" : "3 4" }),
                h("text", { x: 4, y: yOf(v) + 3, fill: "#53667d", fontSize: 9 }, v.toFixed(2)),
              );
            }),
            rows.map(function (r, i) {
              var bh = ((r[5] || 0) / volMax) * volH;
              return h("rect", {
                key: "v" + i,
                x: xOf(i) - Math.max(1, (W - padL - padR) / n / 2.8),
                y: volTop + volH - bh,
                width: Math.max(1, (W - padL - padR) / n / 1.8),
                height: Math.max(1, bh),
                fill: (r[7] || 0) >= 0 ? "rgba(255,93,108,.45)" : "rgba(46,211,167,.45)",
                rx: 1,
              });
            }),
            h("path", { d: area, fill: "url(#mr-area-grad)" }),
            h("path", { d: line, fill: "none", stroke: "#5eead4", strokeWidth: 1.8, strokeLinejoin: "round", strokeLinecap: "round" }),
            xTicks.map(function (i, k) {
              if (!rows[i]) return null;
              return h("text", { key: "x" + k, x: xOf(i), y: H - 8, textAnchor: k === 0 ? "start" : k === xTicks.length - 1 ? "end" : "middle", fill: "#53667d", fontSize: 9 }, rows[i][0].slice(5));
            }),
            Object.keys(markerMap).map(function (key) {
              var idx = Number(key);
              var r = rows[idx];
              var ms = markerMap[key];
              var positive = ms.some(function (m) { return m.direction > 0; });
              return h(
                "g",
                { key: "m" + key, style: { cursor: "pointer" }, onClick: function () { if (props.onMarker) props.onMarker(ms[0]); } },
                h("circle", { cx: xOf(idx), cy: yOf(r[2]), r: 4.6, fill: positive ? "#ff5d6c" : "#2ed3a7", stroke: "#08101a", strokeWidth: 1.5 }),
                h("circle", { cx: xOf(idx), cy: yOf(r[2]), r: 8, fill: "none", stroke: positive ? "rgba(255,93,108,.35)" : "rgba(46,211,167,.35)", strokeWidth: 1 }),
              );
            }),
            hover !== null && rows[hover]
              ? h("line", { x1: xOf(hover), x2: xOf(hover), y1: padT, y2: volTop + volH, stroke: "#5eead4", strokeWidth: 0.8, strokeDasharray: "3 3", opacity: 0.7 })
              : null,
          ),
          hov
            ? h(
                "div",
                {
                  className: "mr-chart-tip",
                  style: { left: clamp((xOf(hover) / W) * 100, 12, 88) + "%", top: 4 },
                },
                h("div", null, h("b", null, hov[0])),
                h("div", null, "收盘 " + fmtPrice(hov[2]) + "  ", h("span", { className: "mr-" + toneOf(hov[7]) }, fmtPct(hov[7]))),
                h("div", null, "成交 " + fmtMoney(hov[6]) + " · 换手 " + fmtNum(hov[8], 2) + "%"),
              )
            : null,
        ),
        h(
          "div",
          { className: "mr-chart-legend" },
          h("span", null, h("i", { style: { background: "#5eead4" } }), "收盘价"),
          h("span", null, h("i", { style: { background: "#ff5d6c" } }), "利好公告"),
          h("span", null, h("i", { style: { background: "#2ed3a7" } }), "利空公告"),
          h("span", null, "共 " + rows.length + " 个交易日 · 点击圆点查看事件"),
        ),
      );
    }

    // ---------------------------------------------------------------------
    // overview pieces
    function IndexStrip(props) {
      var idx = props.indices || [];
      if (!idx.length) {
        return h("div", { className: "mr-idx-grid" }, [0, 1, 2, 3, 4, 5].map(function (i) {
          return h("div", { key: i, className: "mr-idx" }, h(Skeleton, { style: { height: 42 } }));
        }));
      }
      return h(
        "div",
        { className: "mr-idx-grid" },
        idx.map(function (i) {
          return h(
            "div",
            { key: i.code, className: "mr-idx" },
            h(
              "div",
              { className: "mr-idx-name" },
              h("span", null, i.name),
              h("span", null, i.code),
            ),
            h("div", { className: "mr-idx-price" }, fmtPrice(i.price)),
            h("div", { className: "mr-idx-pct mr-" + toneOf(i.pct) }, fmtPct(i.pct) + "  " + (i.change > 0 ? "+" : "") + fmtNum(i.change, 2)),
            h(
              "div",
              { className: "mr-idx-meta" },
              h("span", null, "高 " + fmtPrice(i.high)),
              h("span", null, "低 " + fmtPrice(i.low)),
              h("span", null, fmtMoney(i.amount)),
            ),
          );
        }),
      );
    }

    function SentimentCard(props) {
      var s = props.sentiment || { score: 0, label: "—", components: [] };
      return h(
        Card,
        { title: "市场情绪", sub: "涨跌家数 · 指数 · 量能 · 涨跌停 · 资金" },
        h(
          "div",
          { className: "mr-sent" },
          h(Gauge, { score: s.score, label: s.label }),
          h(
            "div",
            { className: "mr-sent-info" },
            h("div", { className: "mr-sent-label mr-" + (s.score >= 66 ? "up" : s.score < 38 ? "down" : "gold") }, s.label),
            h("div", { className: "mr-sent-desc" }, "0–100 综合分。低于 38 偏冷，高于 66 偏热；它描述的是市场温度，不是买卖信号。"),
            (s.components || []).map(function (c) {
              return h(
                "div",
                { key: c.key, className: "mr-comp" },
                h("span", { className: "mr-comp-name" }, c.label),
                h("span", { className: "mr-comp-bar" }, h("i", { style: { width: clamp(c.value, 0, 100) + "%" } })),
                h("span", { className: "mr-comp-val" }, c.value),
                h("span", { className: "mr-comp-detail" }, c.detail),
              );
            }),
          ),
        ),
      );
    }

    function BreadthCard(props) {
      var b = props.breadth || { advance: 0, flat: 0, decline: 0, total: 0, limitUp: 0, limitDown: 0 };
      var t = props.turnover || { amount: 0, delta: 0, deltaRatio: 0 };
      var total = b.advance + b.flat + b.decline || 1;
      var aw = (b.advance / total) * 100;
      var fw = (b.flat / total) * 100;
      var dw = (b.decline / total) * 100;
      return h(
        Card,
        { title: "涨跌与量能", sub: "全 A 股 " + (b.total || total).toLocaleString() + " 只" },
        h(
          "div",
          { className: "mr-breadth-top" },
          h("div", null, h("div", { className: "mr-big mr-up" }, b.advance), h("div", { className: "mr-small" }, "上涨")),
          h("div", null, h("div", { className: "mr-big", style: { color: "#8aa0b8" } }, b.flat), h("div", { className: "mr-small" }, "平盘")),
          h("div", null, h("div", { className: "mr-big mr-down" }, b.decline), h("div", { className: "mr-small" }, "下跌")),
        ),
        h(
          "div",
          { className: "mr-stack" },
          h("i", { style: { width: aw + "%", background: "linear-gradient(90deg,#b64b58,#ff5d6c)" } }),
          h("i", { style: { width: fw + "%", background: "#334a63" } }),
          h("i", { style: { width: dw + "%", background: "linear-gradient(90deg,#1c9f81,#2ed3a7)" } }),
        ),
        h(
          "div",
          { className: "mr-stack-legend" },
          h("span", { className: "mr-up" }, "涨 " + aw.toFixed(0) + "%"),
          h("span", null, "平 " + fw.toFixed(0) + "%"),
          h("span", { className: "mr-down" }, "跌 " + dw.toFixed(0) + "%"),
        ),
        h(
          "div",
          { className: "mr-kv" },
          h(
            "div",
            { className: "mr-kv-item" },
            h("div", { className: "mr-k", "title": "昨日全市场成交额" }, "两市成交额"),
            h("div", { className: "mr-v" }, fmtAmount(t.amount)),
            h("div", { className: "mr-small" }, (t.delta >= 0 ? "较昨同期 +" : "较昨同期 ") + fmtAmount(t.delta)),
          ),
          h(
            "div",
            { className: "mr-kv-item" },
            h("div", { className: "mr-k", "title": "按涨跌停价近似统计，含 ST 与 20cm 板块" }, "涨跌停"),
            h(
              "div",
              { className: "mr-v" },
              h("span", { className: "mr-up" }, b.limitUp),
              h("span", { style: { color: "#52657c", margin: "0 4px" } }, "/"),
              h("span", { className: "mr-down" }, b.limitDown),
            ),
            h("div", { className: "mr-small" }, "涨停 / 跌停（近似）"),
          ),
        ),
        h(
          "div",
          { className: "mr-chips" },
          h("span", { className: "mr-chip" }, "上涨占比 " + ((b.advance / total) * 100).toFixed(1) + "%"),
          h("span", { className: "mr-chip " + (t.deltaRatio >= 0 ? "up" : "down") }, "量能 " + (t.deltaRatio >= 0 ? "+" : "") + (t.deltaRatio * 100).toFixed(1) + "%"),
        ),
      );
    }

    function FlowCard(props) {
      var flow = props.flow || {};
      var today = flow.today || { main: 0, superLarge: 0, large: 0, medium: 0, small: 0 };
      var history = flow.history || [];
      var sectors = flow.sectors || { top: [], bottom: [] };
      var maxAbs = Math.max.apply(null, history.map(function (x) { return Math.abs(x.main || 0); }).concat([1]));
      var maxSector = Math.max.apply(null, (sectors.top || []).concat(sectors.bottom || []).map(function (x) { return Math.abs(x.main || 0); }).concat([1]));
      var main = today.main || 0;
      return h(
        Card,
        { title: "资金走向", sub: "主力 = 超大单 + 大单" },
        h(
          "div",
          { className: "mr-flow-main" },
          h("span", { className: "mr-big mr-" + toneOf(main) }, (main > 0 ? "+" : "") + fmtAmount(main)),
          h("span", { className: "mr-small" }, "主力净流入"),
        ),
        h(
          "div",
          { className: "mr-flow-bars" },
          history.map(function (x, i) {
            var v = x.main || 0;
            var hgt = Math.max(3, (Math.abs(v) / maxAbs) * 34);
            return h("div", {
              key: i,
              className: "mr-flow-bar " + (v >= 0 ? "pos" : "neg"),
              style: { height: hgt + "px" },
              title: x.date + " " + fmtAmount(v),
            });
          }),
        ),
        h("div", { className: "mr-small" }, "近 " + history.length + " 个交易日主力净流入（柱高为绝对值）"),
        h(
          "div",
          { className: "mr-flow-list" },
          (sectors.top || []).slice(0, 4).map(function (s) {
            return h(
              "div",
              { key: "in" + s.code, className: "mr-flow-row" },
              h("span", { className: "mr-fr-name", title: s.name }, s.name),
              h("span", { className: "mr-fr-bar" }, h("i", { style: { left: "50%", width: (Math.abs(s.main) / maxSector) * 50 + "%" } })),
              h("span", { className: "mr-fr-val mr-up" }, "+" + fmtAmount(s.main)),
            );
          }),
          (sectors.bottom || []).slice(0, 2).map(function (s) {
            return h(
              "div",
              { key: "out" + s.code, className: "mr-flow-row neg" },
              h("span", { className: "mr-fr-name", title: s.name }, s.name),
              h("span", { className: "mr-fr-bar" }, h("i", { style: { right: "50%", width: (Math.abs(s.main) / maxSector) * 50 + "%" } })),
              h("span", { className: "mr-fr-val mr-down" }, fmtAmount(s.main)),
            );
          }),
        ),
        h(
          "div",
          { className: "mr-chips" },
          h("span", { className: "mr-chip " + (props.style && props.style.largeVsSmall >= 0 ? "up" : "down") }, "大盘/小盘 " + (props.style && props.style.largeVsSmall !== null ? fmtPct(props.style.largeVsSmall) : "—")),
          h("span", { className: "mr-chip " + (props.style && props.style.growthVsValue >= 0 ? "up" : "down") }, "成长/价值 " + (props.style && props.style.growthVsValue !== null ? fmtPct(props.style.growthVsValue) : "—")),
          h("span", { className: "mr-chip" }, "主力净占比 " + fmtNum(today.mainPct, 2) + "%"),
        ),
      );
    }

    function NewsCard(props) {
      var news = props.news || { policy: [], market: [], tags: [] };
      return h(
        Card,
        {
          title: "政策与要闻",
          right: h("span", { className: "mr-card-sub" }, "按政策级别 + 关键词 + 市场反应排序"),
        },
        (news.tags || []).length
          ? h(
              "div",
              { className: "mr-chips", style: { marginBottom: 9 } },
              news.tags.slice(0, 6).map(function (t) {
                return h("span", { key: t.name, className: "mr-chip gold" }, t.name + " " + t.count);
              }),
            )
          : null,
        h(
          "div",
          { className: "mr-news-list" },
          (news.policy || []).slice(0, 5).map(function (n) {
            return h(
              "div",
              { key: n.id, className: "mr-news-item", onClick: function () { if (n.url) window.open(n.url, "_blank", "noopener"); } },
              h(
                "div",
                { className: "mr-news-meta" },
                n.tags && n.tags.length ? h("span", { className: "mr-pill" }, n.tags[0]) : h("span", { className: "mr-pill blue" }, n.isPolicy ? "政策" : "要闻"),
                h("span", null, n.source || ""),
                h("span", null, timeAgo(n.time)),
                h("span", { style: { marginLeft: "auto" }, className: "mr-gold" }, "影响 " + n.score),
              ),
              h("div", { className: "mr-news-title" }, n.title),
              h(
                "div",
                { className: "mr-news-reaction" },
                n.indexPct !== null ? h("span", null, "沪深300 ", h("b", { className: "mr-" + toneOf(n.indexPct) }, fmtPct(n.indexPct))) : null,
                (n.affected || []).slice(0, 3).map(function (a) {
                  return h("span", { key: a.name }, a.name + " ", h("b", { className: "mr-" + toneOf(a.pct) }, fmtPct(a.pct)));
                }),
              ),
            );
          }),
          (news.market || []).slice(0, 3).map(function (n) {
            return h(
              "div",
              { key: n.id, className: "mr-news-item", style: { padding: "7px 10px" }, onClick: function () { if (n.url) window.open(n.url, "_blank", "noopener"); } },
              h("div", { className: "mr-news-title", style: { fontSize: 11, WebkitLineClamp: 1 } }, n.title),
              h("div", { className: "mr-news-meta", style: { marginBottom: 0, marginTop: 3 } }, h("span", null, n.source || ""), h("span", null, timeAgo(n.time))),
            );
          }),
          !(news.policy || []).length && !(news.market || []).length ? h("div", { className: "mr-empty" }, "要闻源暂时不可用，稍后自动重试") : null,
        ),
      );
    }

    function TopAnnouncements(props) {
      var rows = (props.rows || []).slice(0, 7);
      return h(
        Card,
        { title: "高影响公告", right: h("button", { className: "mr-btn", onClick: props.onMore, style: { height: 26, padding: "0 8px", fontSize: 10 } }, "查看全部 " + (props.total || rows.length)) },
        h(
          "div",
          { className: "mr-ann-list" },
          rows.length
            ? rows.map(function (a) {
                return h(
                  "div",
                  { key: a.id, className: "mr-ann-row", onClick: function () { props.onCompany(a.code); } },
                  h(ScoreRing, { score: a.scored ? a.scored.score : 0 }),
                  h(
                    "div",
                    { className: "mr-ann-main" },
                    h("div", { className: "mr-ann-title", title: a.title }, a.title),
                    h(
                      "div",
                      { className: "mr-ann-sub" },
                      h("span", { style: { color: "#b9cbe0", fontWeight: 600 } }, a.name),
                      h("span", null, a.board || ""),
                      a.scored ? h(DirectionChip, { direction: a.scored.direction, label: a.scored.directionLabel }) : null,
                      a.scored && a.scored.note ? h("span", { className: "mr-chip gold" }, a.scored.note) : null,
                    ),
                  ),
                  h(
                    "div",
                    { className: "mr-ann-right" },
                    h("div", { className: "mr-ar-pct mr-" + toneOf(a.pct) }, fmtPct(a.pct)),
                    h("div", { className: "mr-ar-car" }, a.event && a.event.car3 !== null ? "CAR3 " + fmtPct(a.event.car3) : "事件待观察"),
                  ),
                );
              })
            : h("div", { className: "mr-empty" }, h("b", null, "公告源暂时未返回数据"), "巨潮资讯可能正在限流，稍后刷新；行情、资金与要闻不受影响。"),
        ),
      );
    }

    // ---------------------------------------------------------------------
    // overview
    function Overview(props) {
      var d = props.data;
      var m = d.market || {};
      return h(
        "div",
        null,
        h(IndexStrip, { indices: m.indices }),
        h(
          "div",
          { className: "mr-grid cols-3" },
          h(SentimentCard, { sentiment: m.sentiment }),
          h(BreadthCard, { breadth: m.breadth, turnover: m.turnover }),
          h(FlowCard, { flow: m.flow, style: m.style }),
        ),
        h(
          "div",
          { className: "mr-grid cols-2 mr-section" },
          h(
            Card,
            {
              title: "板块热力",
              right: h(
                "div",
                { className: "mr-legend" },
                h("i", { style: { background: "rgba(46,211,167,.55)" } }),
                "跌",
                h("i", { style: { background: "rgba(255,93,108,.55)", marginLeft: 7 } }),
                "涨",
                h("span", { style: { marginLeft: 8 } }, "面积≈市值"),
              ),
            },
            h(Treemap, { boards: m.boards, onSelect: props.onBoard }),
            h(
              "div",
              { className: "mr-chips" },
              h("span", { className: "mr-chip" }, "板块 " + ((m.boards || []).length || 0)),
              h("span", { className: "mr-chip" }, "点击色块筛选该板块公告"),
              d.updatedAt ? h("span", { className: "mr-chip" }, "热力 " + fmtTime(Date.parse(d.updatedAt) || d.updatedAt)) : null,
            ),
          ),
          h(NewsCard, { news: d.news }),
        ),
        h(
          "div",
          { className: "mr-grid cols-2 mr-section" },
          h(TopAnnouncements, {
            rows: d.announcements,
            total: d.stats ? d.stats.total : 0,
            onCompany: props.onCompany,
            onMore: props.onMore,
          }),
          h(
            Card,
            { title: "今日情报概览", sub: "公告 × 情绪 × 资金" },
            h(
              "div",
              { className: "mr-kv", style: { gridTemplateColumns: "1fr 1fr" } },
              h("div", { className: "mr-kv-item" }, h("div", { className: "mr-k" }, "高影响公告"), h("div", { className: "mr-v mr-up" }, d.stats ? d.stats.high : 0)),
              h("div", { className: "mr-kv-item" }, h("div", { className: "mr-k" }, "覆盖公司"), h("div", { className: "mr-v" }, d.stats ? d.stats.uniqueStocks : 0)),
              h("div", { className: "mr-kv-item" }, h("div", { className: "mr-k" }, "利好 / 利空"), h("div", { className: "mr-v" }, h("span", { className: "mr-up" }, d.stats ? d.stats.byDirection.positive : 0), h("span", { style: { color: "#52657c", margin: "0 4px" } }, "/"), h("span", { className: "mr-down" }, d.stats ? d.stats.byDirection.negative : 0))),
              h("div", { className: "mr-kv-item" }, h("div", { className: "mr-k" }, "市场情绪"), h("div", { className: "mr-v mr-gold" }, m.sentiment ? m.sentiment.label : "—")),
            ),
            h(
              "div",
              { className: "mr-small", style: { marginTop: 12, lineHeight: 1.7 } },
              "影响分把公告类别、事件窗口超额收益与量能放在同一把尺子上。它是研究线索，不是买卖建议；点击任意公告可进入公司透视，查看指标解释与公告原文。",
            ),
            h(
              "div",
              { className: "mr-chips", style: { marginTop: 10 } },
              h("span", { className: "mr-chip" }, "数据延迟约 1–3 分钟"),
              h("span", { className: "mr-chip" }, "红涨绿跌"),
              h("span", { className: "mr-chip" }, "事件窗 = 沪深300 调整后"),
            ),
          ),
        ),
      );
    }

    // ---------------------------------------------------------------------
    // announcements view
    function AnnouncementsView(props) {
      var d = props.data;
      var rows = d.announcements || [];
      var boardState = useState(props.initialBoard || "全部");
      var board = boardState[0];
      var setBoard = boardState[1];
      useEffect(
        function () {
          if (props.initialBoard) {
            setBoard(props.initialBoard);
            setLimit(30);
          }
        },
        [props.initialBoard],
      );
      var levelState = useState("全部");
      var level = levelState[0];
      var setLevel = levelState[1];
      var dirState = useState("全部");
      var dir = dirState[0];
      var setDir = dirState[1];
      var qState = useState("");
      var q = qState[0];
      var setQ = qState[1];
      var limitState = useState(30);
      var limit = limitState[0];
      var setLimit = limitState[1];
      var boards = ["全部"].concat((d.market && d.market.boards ? d.market.boards : []).map(function (b) { return b.name; }));
      var filtered = useMemo(
        function () {
          return rows.filter(function (a) {
            if (board !== "全部" && a.board !== board) return false;
            if (level !== "全部" && a.scored.level !== level) return false;
            if (dir !== "全部") {
              if (dir === "利好" && a.scored.direction <= 0) return false;
              if (dir === "利空" && a.scored.direction >= 0) return false;
              if (dir === "中性" && a.scored.direction !== 0) return false;
            }
            if (q) {
              var s = (a.code + " " + a.name + " " + a.title + " " + (a.board || "")).toLowerCase();
              if (s.indexOf(q.toLowerCase()) < 0) return false;
            }
            return true;
          });
        },
        [rows, board, level, dir, q],
      );
      var shown = filtered.slice(0, limit);
      return h(
        "div",
        null,
        h(
          "div",
          { className: "mr-filterbar" },
          h("select", { value: level, onChange: function (e) { setLevel(e.target.value); setLimit(30); } }, ["全部", "高", "中", "低"].map(function (x) { return h("option", { key: x, value: x }, "影响 " + x); })),
          h("select", { value: dir, onChange: function (e) { setDir(e.target.value); setLimit(30); } }, ["全部", "利好", "利空", "中性"].map(function (x) { return h("option", { key: x, value: x }, x); })),
          h("select", { value: board, onChange: function (e) { setBoard(e.target.value); setLimit(30); } }, boards.map(function (x) { return h("option", { key: x, value: x }, x === "全部" ? "全部板块" : x); })),
          h("input", { value: q, onChange: function (e) { setQ(e.target.value); setLimit(30); }, placeholder: "筛选公司 / 公告标题" }),
          h(
            "div",
            { className: "mr-stat-chips" },
            h("span", { className: "mr-stat-chip" }, "命中 ", h("b", null, filtered.length)),
            h("span", { className: "mr-stat-chip" }, "高影响 ", h("b", null, rows.filter(function (a) { return a.scored.level === "高"; }).length)),
            h("span", { className: "mr-stat-chip" }, "利好 ", h("b", null, rows.filter(function (a) { return a.scored.direction > 0; }).length)),
            h("span", { className: "mr-stat-chip" }, "利空 ", h("b", null, rows.filter(function (a) { return a.scored.direction < 0; }).length)),
          ),
        ),
        h(
          "div",
          { className: "mr-table-wrap" },
          h(
            "table",
            { className: "mr-table" },
            h(
              "thead",
              null,
              h(
                "tr",
                null,
                h("th", { style: { width: 48 } }, "评分"),
                h("th", { style: { width: 66 } }, "时间"),
                h("th", { style: { width: 128 } }, "公司"),
                h("th", null, "公告 / 事件"),
                h("th", { style: { width: 80 } }, "板块"),
                h("th", { style: { width: 70 } }, "今日"),
                h("th", { style: { width: 76 } }, "CAR3"),
                h("th", { style: { width: 54 } }, "方向"),
              ),
            ),
            h(
              "tbody",
              null,
              shown.length
                ? shown.map(function (a) {
                    return h(
                      "tr",
                      { key: a.id, onClick: function () { props.onCompany(a.code); } },
                      h("td", null, h("span", { className: "mr-score-ring " + (a.scored.score >= 75 ? "high" : a.scored.score >= 55 ? "mid" : "low"), style: { width: 30, height: 30, fontSize: 10 } }, a.scored.score)),
                      h("td", { style: { color: "#7f93ad", whiteSpace: "nowrap" } }, fmtTime(a.time)),
                      h("td", { className: "mr-td-company" }, a.name, h("small", null, a.code)),
                      h("td", { className: "mr-td-title", title: a.title }, a.title),
                      h("td", null, h("span", { className: "mr-chip" }, a.board || "—")),
                      h("td", null, h("span", { className: "mr-" + toneOf(a.pct) }, fmtPct(a.pct))),
                      h("td", null, a.event && a.event.car3 !== null ? h("span", { className: "mr-" + toneOf(a.event.car3) }, fmtPct(a.event.car3)) : h("span", { style: { color: "#52657c" } }, "待观察")),
                      h("td", null, h("span", { className: "mr-chip " + (a.scored.direction > 0 ? "up" : a.scored.direction < 0 ? "down" : "") }, a.scored.directionLabel)),
                    );
                  })
                : h("tr", null, h("td", { colSpan: 8 }, h("div", { className: "mr-empty" }, h("b", null, "没有符合条件的公告"), "调整筛选条件，或稍后刷新。当前公告源可能被限流。")))
            ),
          ),
        ),
        filtered.length > limit
          ? h(
              "div",
              { style: { textAlign: "center", marginTop: 12 } },
              h("button", { className: "mr-btn", onClick: function () { setLimit(limit + 30); } }, "显示更多（" + (filtered.length - limit) + "）"),
            )
          : null,
        h(
          "div",
          { className: "mr-small", style: { marginTop: 10, lineHeight: 1.7 } },
          "公告来源：巨潮资讯 / 东方财富公告索引。影响分为启发式评分：类别权重 + 事件窗超额收益 + 量能 + 时效；CAR3 为事件日及之后 3 个交易日相对沪深300 的累计超额收益。",
        ),
      );
    }

    // ---------------------------------------------------------------------
    // company view
    function CompanySearchHero(props) {
      var d = props.data;
      var hot = [];
      var seen = {};
      (d.announcements || []).forEach(function (a) {
        if (!seen[a.code] && hot.length < 10) {
          seen[a.code] = 1;
          hot.push(a);
        }
      });
      return h(
        "div",
        { className: "mr-hero" },
        h("div", { className: "mr-hero-icon" }, h(IconRadar, { size: 32 })),
        h("h2", null, "公司透视"),
        h("p", null, "输入代码或名称，查看价格结构、估值、资金、公告事件与每一项指标的解释。"),
        h(SearchBox, { onSelect: props.onCompany, placeholder: "例如 300750 / 宁德时代" }),
        h(
          "div",
          { className: "mr-hot" },
          h("div", { className: "mr-hot-title" }, "高影响公告公司"),
          h(
            "div",
            { className: "mr-hot-chips" },
            hot.map(function (a) {
              return h("button", { key: a.code, className: "mr-hot-chip", onClick: function () { props.onCompany(a.code); } }, a.name + " " + a.code, h("span", { className: "mr-" + toneOf(a.pct), style: { marginLeft: 5 } }, fmtPct(a.pct)));
            }),
          ),
        ),
        h(
          "div",
          { className: "mr-hot" },
          h("div", { className: "mr-hot-title" }, "板块龙头"),
          h(
            "div",
            { className: "mr-hot-chips" },
            (d.market && d.market.boards ? d.market.boards : []).slice(0, 8).map(function (b) {
              return b.leaders && b.leaders[0]
                ? h("button", { key: b.code, className: "mr-hot-chip", onClick: function () { props.onCompany(b.leaders[0].code); } }, b.leaders[0].name + " · " + b.name)
                : null;
            }),
          ),
        ),
      );
    }

    function CompanyHeader(props) {
      var c = props.company;
      var p = c.profile || {};
      var q = c.quote || {};
      return h(
        "div",
        { className: "mr-co-head" },
        h(
          "div",
          { className: "mr-co-id" },
          h("button", { className: "mr-back", onClick: props.onBack, title: "返回" }, h(IconBack)),
          h(
            "div",
            null,
            h("div", { className: "mr-co-name" }, p.name, h("small", null, p.code + " · " + (p.exchange || ""))),
            h(
              "div",
              { className: "mr-co-tags" },
              p.board ? h("span", { className: "mr-chip gold" }, p.board) : null,
              p.subBoard && p.subBoard !== p.board ? h("span", { className: "mr-chip" }, p.subBoard) : null,
              p.industry ? h("span", { className: "mr-chip" }, p.industry) : null,
              (p.concepts || []).slice(0, 7).map(function (x) { return h("span", { key: x, className: "mr-chip" }, x); }),
            ),
          ),
        ),
        h(
          "div",
          { className: "mr-co-quote" },
          h("div", { className: "mr-co-price mr-" + toneOf(q.pct) }, fmtPrice(q.price)),
          h("div", { className: "mr-co-pct mr-" + toneOf(q.pct) }, fmtPct(q.pct) + "  " + (q.change > 0 ? "+" : "") + fmtNum(q.change, 2)),
          h("div", { className: "mr-co-meta" }, "成交 " + fmtMoney(q.amount) + " · 换手 " + fmtNum(q.turnover, 2) + "% · 量比 " + fmtNum(q.volumeRatio, 2)),
        ),
      );
    }

    function CompanyView(props) {
      var code = props.code;
      var state = useState({ loading: true, data: null, error: null });
      var s = state[0];
      var setS = state[1];
      var focusState = useState(null);
      var focus = focusState[0];
      var setFocus = focusState[1];

      useEffect(
        function () {
          if (!code) return;
          var cancelled = false;
          setS({ loading: true, data: null, error: null });
          setFocus(null);
          fetch(API + "/company?code=" + encodeURIComponent(code))
            .then(function (r) { return r.json(); })
            .then(function (j) {
              if (cancelled) return;
              if (!j || !j.ok) throw new Error(j && j.error ? j.error : "加载失败");
              setS({ loading: false, data: j, error: null });
            })
            .catch(function (e) {
              if (!cancelled) setS({ loading: false, data: null, error: e.message || "加载失败" });
            });
          return function () { cancelled = true; };
        },
        [code],
      );

      if (s.loading) {
        return h(
          "div",
          null,
          h(Skeleton, { style: { height: 70, marginBottom: 12 } }),
          h(Skeleton, { style: { height: 250, marginBottom: 12 } }),
          h("div", { className: "mr-ind-grid" }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (i) { return h(Skeleton, { key: i, style: { height: 92 } }); })),
        );
      }
      if (s.error) {
        return h("div", { className: "mr-err" }, h("span", null, "公司数据加载失败：" + s.error), h("button", { className: "mr-btn", onClick: props.onBack }, "返回"));
      }
      var c = s.data;
      var q = c.quote || {};
      var markers = (c.announcements || [])
        .filter(function (a) { return a.event && a.event.eventDate; })
        .map(function (a) { return { date: a.event.eventDate, direction: a.scored.direction, announcement: a }; });
      return h(
        "div",
        null,
        h(CompanyHeader, { company: c, onBack: props.onBack }),
        h(
          "div",
          { className: "mr-metric-grid" },
          h("div", { className: "mr-metric" }, h("div", { className: "mr-k" }, "市盈率 PE(动)"), h("div", { className: "mr-v" }, fmtNum(q.pe, 2))),
          h("div", { className: "mr-metric" }, h("div", { className: "mr-k" }, "市净率 PB"), h("div", { className: "mr-v" }, fmtNum(q.pb, 2))),
          h("div", { className: "mr-metric" }, h("div", { className: "mr-k" }, "总市值"), h("div", { className: "mr-v" }, fmtMoney(q.totalMarketCap))),
          h("div", { className: "mr-metric" }, h("div", { className: "mr-k" }, "换手率"), h("div", { className: "mr-v" }, fmtNum(q.turnover, 2) + "%")),
          h("div", { className: "mr-metric" }, h("div", { className: "mr-k" }, "量比"), h("div", { className: "mr-v" }, fmtNum(q.volumeRatio, 2))),
          h("div", { className: "mr-metric" }, h("div", { className: "mr-k" }, "主力净流入(5日)"), h("div", { className: "mr-v mr-" + toneOf(c.indicatorSummary.main5) }, fmtMoney(c.indicatorSummary.main5))),
        ),
        h(
          "div",
          { className: "mr-grid cols-2" },
          h(
            Card,
            { title: "价格与公告事件", sub: "前复权 · 日线", className: "mr-chart-card" },
            h(PriceChart, {
              rows: c.kline || [],
              markers: markers,
              onMarker: function (m) { setFocus(m.announcement); },
            }),
            focus
              ? h(
                  "div",
                  { className: "mr-banner", style: { marginTop: 8, marginBottom: 0 } },
                  h("b", null, fmtDate(focus.time)),
                  h("span", { style: { color: "#dbe7f5" } }, focus.title),
                  h("span", { style: { marginLeft: "auto" } }, focus.event && focus.event.car3 !== null ? "CAR3 " + fmtPct(focus.event.car3) : ""),
                )
              : null,
          ),
          h(
            Card,
            { title: "事件影响快照", sub: "市场调整后收益" },
            c.indicatorSummary.lastEvent
              ? h(
                  "div",
                  null,
                  h("div", { className: "mr-kv", style: { gridTemplateColumns: "1fr 1fr" } },
                    h("div", { className: "mr-kv-item" }, h("div", { className: "mr-k" }, "事件日"), h("div", { className: "mr-v", style: { fontSize: 12 } }, c.indicatorSummary.lastEvent.eventDate)),
                    h("div", { className: "mr-kv-item" }, h("div", { className: "mr-k" }, "事件日超额 D0"), h("div", { className: "mr-v mr-" + toneOf(c.indicatorSummary.lastEvent.d0) }, fmtPct(c.indicatorSummary.lastEvent.d0))),
                    h("div", { className: "mr-kv-item" }, h("div", { className: "mr-k" }, "CAR3"), h("div", { className: "mr-v mr-" + toneOf(c.indicatorSummary.lastEvent.car3) }, fmtPct(c.indicatorSummary.lastEvent.car3))),
                    h("div", { className: "mr-kv-item" }, h("div", { className: "mr-k" }, "公告前5日漂移"), h("div", { className: "mr-v mr-" + toneOf(c.indicatorSummary.lastEvent.pre5) }, fmtPct(c.indicatorSummary.lastEvent.pre5))),
                  ),
                  h("div", { className: "mr-small", style: { marginTop: 10, lineHeight: 1.7 } },
                    "事件日按公告披露时间对齐：15:00 后披露顺延到下一交易日。D0 与 CAR3 都减去了沪深300 同期涨跌，用来隔离大盘影响。",
                  ),
                  h("div", { className: "mr-chips" }, h("span", { className: "mr-chip" }, "量比 " + fmtNum(c.indicatorSummary.lastEvent.volRatio, 2)), h("span", { className: "mr-chip " + (c.indicatorSummary.lastEvent.pending ? "gold" : "") }, c.indicatorSummary.lastEvent.pending ? "事件窗未走完" : "事件窗已完成")),
                )
              : h("div", { className: "mr-empty" }, "近一年没有可对齐的公告事件"),
          ),
        ),
        h(
          "div",
          { className: "mr-section" },
          h(Card, { title: "指标卡片", sub: "每个指标都附一句解释" },
            h("div", { className: "mr-ind-grid" },
              (c.indicators || []).map(function (i) {
                return h(
                  "div",
                  { key: i.key, className: "mr-ind" },
                  h("div", { className: "mr-ind-top" }, h("span", null, i.label), h(InfoDot, { text: i.explain })),
                  h("div", { className: "mr-ind-value mr-" + (i.tone || "neutral") }, i.display),
                  h("div", { className: "mr-ind-explain" }, i.explain),
                );
              }),
            ),
          ),
        ),
        h(
          "div",
          { className: "mr-grid cols-2 mr-section" },
          h(
            Card,
            { title: "公告与事件时间线", sub: "近一年 · 按披露时间倒序" },
            h(
              "div",
              { className: "mr-event-list" },
              (c.announcements || []).slice(0, 14).map(function (a) {
                var e = a.event;
                return h(
                  "div",
                  { key: a.id, className: "mr-event" },
                  h("div", { className: "mr-event-dot", style: { background: a.scored.direction > 0 ? "#ff5d6c" : a.scored.direction < 0 ? "#2ed3a7" : "#f5c451" } }),
                  h(
                    "div",
                    { className: "mr-event-body" },
                    h("div", { className: "mr-event-meta" },
                      h("span", { className: "mr-chip " + (a.scored.direction > 0 ? "up" : a.scored.direction < 0 ? "down" : "") }, a.scored.directionLabel),
                      h("span", null, "影响 " + a.scored.score),
                      h("span", null, fmtDate(a.time) + " " + fmtTime(a.time).slice(6)),
                      a.scored.note ? h("span", { className: "mr-chip gold" }, a.scored.note) : null,
                    ),
                    h("div", { className: "mr-event-title", title: a.title }, a.title),
                    e
                      ? h("div", { className: "mr-event-meta" },
                          h("span", null, "D0 ", h("b", { className: "mr-" + toneOf(e.d0) }, fmtPct(e.d0))),
                          h("span", null, "CAR3 ", h("b", { className: "mr-" + toneOf(e.car3) }, fmtPct(e.car3))),
                          h("span", null, "前5日 ", h("b", { className: "mr-" + toneOf(e.pre5) }, fmtPct(e.pre5))),
                          h("span", null, "量比 " + fmtNum(e.volRatio, 2)),
                        )
                      : h("div", { className: "mr-event-meta" }, "事件窗口待形成"),
                  ),
                  a.url ? h("a", { className: "mr-event-link", href: a.url, target: "_blank", rel: "noopener" }, "原文 ", h(IconExternal)) : null,
                );
              }),
            ),
          ),
          h(
            Card,
            { title: "同板块对比", sub: "按市值权重靠前的活跃股" },
            (c.peers || []).length
              ? h(
                  "table",
                  { className: "mr-peer-table" },
                  h("thead", null, h("tr", null, h("th", null, "公司"), h("th", null, "现价"), h("th", null, "涨跌幅"))),
                  h("tbody", null, (c.peers || []).map(function (p) {
                    return h("tr", { key: p.code, style: { cursor: "pointer" }, onClick: function () { props.onCompany(p.code); } },
                      h("td", null, p.name, h("span", { style: { color: "#52657c", marginLeft: 6, fontSize: 9 } }, p.code)),
                      h("td", null, fmtPrice(p.price)),
                      h("td", { className: "mr-" + toneOf(p.pct) }, fmtPct(p.pct)),
                    );
                  })),
                )
              : h("div", { className: "mr-empty" }, "暂无同板块数据"),
          ),
        ),
        h(
          "div",
          { className: "mr-section" },
          h(Card, { title: "指标解释", sub: "口径与局限" },
            h("div", { className: "mr-glossary" },
              (c.glossary || []).map(function (g) {
                return h("div", { key: g.title, className: "mr-gloss" }, h("b", null, g.title), h("p", null, g.text));
              }),
            ),
          ),
        ),
      );
    }

    // ---------------------------------------------------------------------
    // root panel
    function Panel() {
      var dashState = useState({ loading: true, data: null, error: null, ts: 0 });
      var dash = dashState[0];
      var setDash = dashState[1];
      var tabState = useState("overview");
      var tab = tabState[0];
      var setTab = tabState[1];
      var selectedState = useState(null);
      var selected = selectedState[0];
      var setSelected = selectedState[1];
      var boardFilterState = useState("");
      var boardFilter = boardFilterState[0];
      var setBoardFilter = boardFilterState[1];
      var rootRef = useRef(null);

      var load = useCallback(function (silent) {
        if (!silent) setDash(function (s) { return Object.assign({}, s, { loading: true, error: null }); });
        fetch(API + "/dashboard")
          .then(function (r) { return r.json(); })
          .then(function (j) {
            if (!j || !j.ok) throw new Error(j && j.error ? j.error : "加载失败");
            setDash({ loading: false, data: j, error: null, ts: Date.now() });
          })
          .catch(function (e) {
            setDash(function (s) { return Object.assign({}, s, { loading: false, error: e.message || "加载失败" }); });
          });
      }, []);

      useEffect(function () {
        load(false);
        var timer = setInterval(function () { load(true); }, 90000);
        return function () { clearInterval(timer); };
      }, [load]);

      function openCompany(code) {
        setSelected(code);
        setTab("company");
        if (rootRef.current) rootRef.current.scrollTop = 0;
      }
      function openBoard(name) {
        setBoardFilter(name);
        setTab("announcements");
      }
      var d = dash.data;
      var badge = d && d.stats ? d.stats.high : 0;
      return h(
        "div",
        { className: "mr-root", ref: rootRef },
        h(
          "div",
          { className: "mr-top" },
          h(
            "div",
            { className: "mr-brand" },
            h("div", { className: "mr-logo" }, h(IconRadar, { size: 23 })),
            h(
              "div",
              null,
              h("div", { className: "mr-name" }, "情报雷达", h("em", null, "BETA")),
              h(
                "div",
                { className: "mr-sub" },
                h("span", { className: "mr-live" }),
                h("span", null, "巨潮公告 × A股大盘 × 资金情绪"),
                d && d.asOf ? h("span", null, "更新 " + fmtTime(d.asOf)) : null,
              ),
            ),
          ),
          h(
            "div",
            { className: "mr-actions" },
            h(SearchBox, { onSelect: openCompany, placeholder: "搜索公司代码 / 名称" }),
            h("button", { className: "mr-btn", onClick: function () { load(false); }, disabled: dash.loading, title: "刷新" }, h(IconRefresh), dash.loading ? "刷新中" : "刷新"),
          ),
        ),
        dash.error && !d
          ? h("div", { className: "mr-err" }, h("span", null, "数据加载失败：" + dash.error), h("button", { className: "mr-btn primary", onClick: function () { load(false); } }, "重试"))
          : null,
        h(
          "div",
          { className: "mr-tabs", role: "tablist" },
          h("button", { className: "mr-tab " + (tab === "overview" ? "active" : ""), onClick: function () { setTab("overview"); } }, "大盘概览"),
          h("button", { className: "mr-tab " + (tab === "announcements" ? "active" : ""), onClick: function () { setTab("announcements"); } }, "公告雷达", badge ? h("span", { className: "mr-tab-count" }, badge) : null),
          h("button", { className: "mr-tab " + (tab === "company" ? "active" : ""), onClick: function () { setTab("company"); } }, "公司透视"),
        ),
        dash.loading && !d
          ? h(
              "div",
              null,
              h("div", { className: "mr-idx-grid" }, [0, 1, 2, 3, 4, 5].map(function (i) { return h("div", { key: i, className: "mr-idx" }, h(Skeleton, { style: { height: 52 } })); })),
              h("div", { className: "mr-loading" }, h("div", { className: "mr-spinner" }), "正在汇总公告、行情与资金数据…"),
            )
          : tab === "overview"
            ? (d ? h(Overview, { data: d, onCompany: openCompany, onBoard: openBoard, onMore: function () { setTab("announcements"); } }) : null)
            : tab === "announcements"
              ? (d ? h(AnnouncementsView, { data: d, onCompany: openCompany, initialBoard: boardFilter }) : null)
              : selected
                ? h(CompanyView, { code: selected, onCompany: openCompany, onBack: function () { setSelected(null); setTab("company"); } })
                : d
                  ? h(CompanySearchHero, { data: d, onCompany: openCompany })
                  : null,
        h(
          "div",
          { className: "mr-footer" },
          h(
            "div",
            null,
            h("div", null, "数据仅用于研究，不构成投资建议。公告、行情与资金流均来自公开接口，可能存在延迟、复权或口径差异。"),
            h("div", { className: "mr-source", style: { marginTop: 4 } }, (d && d.sources ? d.sources : []).map(function (s) {
              return h("span", { key: s.name, title: s.note }, s.name);
            })),
          ),
          h("div", { style: { textAlign: "right" } }, "dsh-market-radar · 本地插件"),
        ),
      );
    }

    // ---------------------------------------------------------------------
    // register
    function apply(ctx) {
      injectCss();
      ctx.slots.inject("sidebar.panellist", function () {
        return ctx.slots.register(
          {
            name: "sidebar.panellist",
            id: "market-radar",
            order: 28,
            label: "情报雷达",
          },
          IconRadar,
        );
      });
      ctx.slots.inject("main", function () {
        return ctx.slots.register(
          {
            name: "main",
            key: "market-radar",
          },
          Panel,
        );
      });
    }

    var inject = ["slots"];
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
