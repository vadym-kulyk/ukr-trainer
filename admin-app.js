/* Адмін-панель вчителя: статистика по учнях, темах, завданнях і класах; повідомлення й призначення.
   Дані — дія admin_data скрипта Google Таблиці (google-apps-script/Code.gs). Тексти завдань тренажера будуємо
   тим самим генератором (engine.js), завдання ЗНО й тести НМТ читаємо з zno/ та nmt/. */
(function () {
  "use strict";
  const API = (window.MG_CONFIG && window.MG_CONFIG.resultsUrl || "").trim();
  const $ = s => document.querySelector(s);
  const root = $("#root");
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const T = window.TOPICS, SECS = window.SECTIONS, E = window.MGEngine, N = E.TOTAL;
  const LS = "mg-admin-session-v1";
  const DAY = 86400000;

  let session = null;
  try { session = JSON.parse(localStorage.getItem(LS) || "null"); } catch (e) { session = null; }
  if (session && !(session.aexp > Date.now())) session = null;

  let D = null, ZI = null, NI = null, loading = false, loadErr = "";
  let S = [];                       // учні з обчисленою статистикою (з урахуванням фільтра класу)
  const ui = { cls: "", sorts: {}, q: "", topicSrc: "t", taskSrc: "all", taskTopic: "", taskMin: 3, sel: null, stuTab: "t" };
  const compose = { type: "all", classes: new Set(), keys: new Set(), q: "", title: "", text: "", imp: false, busy: false };
  const asg = { id: "", title: "", items: new Set(), type: "class", classes: new Set(), keys: new Set(), q: "", due: "", note: "", iq: "", busy: false, open: false };
  const znoCache = {}, nmtCache = {}, taskCache = {};

  function toast(m) { const t = $("#toast"); t.textContent = m; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => { t.hidden = true; }, 2800); }

  async function api(body) {
    if (session) Object.assign(body, { atoken: session.atoken, aexp: session.aexp });
    for (let i = 0; i < 3; i++) {
      try {
        const r = await fetch(API, { method: "POST", credentials: "omit", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body) });
        const d = JSON.parse(await r.text());
        if (d && d.error === "admin_auth") { logout("Сесія завершилась. Увійдіть знову."); return null; }
        if (d && (d.ok || d.error !== "server")) return d;
      } catch (e) {}
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
    return null;
  }

  /* ───── Вхід ───── */
  let loginMsg = "";
  function loginHtml() {
    return `<form class="login" id="login"><img src="img/logo-wordmark.png" alt="Midgard"><h2>Адмін-панель</h2>
      ${API ? `<label class="field"><span>Пароль адміністратора</span><input class="input" id="pw" type="password" autocomplete="current-password" required></label>
      <button class="btn primary" type="submit">Увійти</button>` : '<p class="err">На сайті не підключено таблицю результатів (config.js → resultsUrl).</p>'}
      <p class="hint" id="lmsg">${esc(loginMsg) || "Пароль задається в Google Таблиці: меню «Тренажер» → «Задати пароль адміністратора»."}</p>
      <a class="hint" href="./">← На сайт тренажера</a></form>`;
  }
  async function doLogin(pw) {
    $("#lmsg").textContent = "Перевіряю…";
    const d = await api({ action: "admin_login", password: pw });
    if (!d) { $("#lmsg").textContent = "Немає зв’язку з сервером."; return; }
    if (!d.ok) {
      const M = { no_admin: "Пароль адміністратора ще не задано. У Google Таблиці: меню «Тренажер» → «Задати пароль адміністратора». Якщо меню немає — оновіть Code.gs і перезавантажте таблицю.",
        bad_password: "Неправильний пароль.", locked: "Забагато спроб. Зачекайте 15 хвилин.", unknown: "Оновіть Code.gs у таблиці (потрібна версія 8 або новіша)." };
      $("#lmsg").textContent = M[d.error] || ("Помилка: " + d.error); return;
    }
    session = { atoken: d.atoken, aexp: d.aexp };
    try { localStorage.setItem(LS, JSON.stringify(session)); } catch (e) {}
    loginMsg = ""; refresh();
  }
  function logout(msg) {
    session = null; D = null; loginMsg = msg || "";
    try { localStorage.removeItem(LS); } catch (e) {}
    render();
  }

  /* ───── Завантаження даних ───── */
  async function refresh() {
    loading = true; loadErr = ""; render();
    const [d, zi, ni] = await Promise.all([
      api({ action: "admin_data" }),
      ZI ? ZI : fetch("zno/index.json").then(r => r.json()).catch(() => null),
      NI ? NI : fetch("nmt/index.json").then(r => r.json()).catch(() => null)
    ]);
    loading = false;
    if (!session) return;
    if (!d || !d.ok) { loadErr = d && d.error === "unknown" ? "Оновіть Code.gs у таблиці до версії 8." : "Не вдалося завантажити дані. Перевірте інтернет і спробуйте ще раз."; render(); return; }
    D = d; ZI = zi; NI = ni;
    derive(); render();
  }

  /* ───── Обчислення ───── */
  const znoTopics = () => (ZI ? ZI.topics : []);
  const znoTopic = id => znoTopics().find(t => t.id === id);
  const nmtTest = id => NI && NI.tests.find(t => t.id === id);
  const topicTitle = id => { const t = T.find(x => x.id === id); return t ? t.title : id; };
  const itemTitle = code => {
    const [k, id] = [code.slice(0, 1), code.slice(2)];
    if (k === "t") return "Тренажер: " + topicTitle(id);
    if (k === "z") { const t = znoTopic(id); return "ЗНО: " + (t ? t.title : id); }
    const t = nmtTest(id); return "НМТ: " + (t ? t.title : id);
  };
  const classes = () => [...new Set((D ? D.students : []).map(s => s.cls))].sort((a, b) => a.localeCompare(b, "uk", { numeric: true }));

  function enrich(s) {
    const o = Object.assign({}, s);
    let a = 0, c = 0; o.tt = {};
    T.forEach(t => {
      const tp = s.topics[t.id]; if (!tp) return;
      let ta = 0, tc = 0; for (const ch of tp.r) { if (ch !== ".") ta++; if (ch === "1") tc++; }
      o.tt[t.id] = { a: ta, c: tc, r: tp.r, att: tp.att };
      a += ta; c += tc;
    });
    o.tr = { a, c, acc: a ? c / a : null, prog: a / (T.length * N) };
    const zu = new Map(); o.zt = {};
    for (const tid in s.zno || {}) {
      let za = 0, zc = 0;
      String(s.zno[tid]).split(";").forEach(p => { const m = p.match(/^(\d+):([01])$/); if (!m) return; za++; if (m[2] === "1") zc++; if (m[2] === "1" || !zu.has(m[1])) zu.set(m[1], m[2]); });
      o.zt[tid] = { a: za, c: zc };
    }
    let zok = 0; zu.forEach(v => { if (v === "1") zok++; });
    o.zn = { a: zu.size, c: zok, acc: zu.size ? zok / zu.size : null };
    let best = 0, tests = 0;
    for (const id in s.nmt || {}) { tests++; best = Math.max(best, Number(s.nmt[id].bs) || 0); }
    o.nm = { tests, best };
    o.act = s.act || { last: 0, n: 0, ok: 0, fix: 0, mins: 0, days: {} };
    o.seen = Math.max(o.act.last || 0, s.updated || 0, s.lastLogin || 0);
    o.week = sumDays(o.act.days, 7);
    o.fx = s.fix || null;
    const f = o.act.focus;
    o.fo = f && f.timed ? { timed: f.timed, exits: f.exits, exAns: f.exAns, exOk: f.exOk, fast: f.fast, fastOk: f.fastOk, recent: f.recent || [],
      focus: f.sec + f.away ? f.sec / (f.sec + f.away) : 1, exShare: f.exAns / f.timed, avgSec: f.sec / f.timed, fastShare: f.fast / f.timed, awayMin: f.away / 60 } : null;
    return o;
  }
  function sumDays(days, n) { let k = 0; for (let i = 0; i < n; i++) k += (days || {})[dayKey(D.now - i * DAY)] || 0; return k; }
  const dayKey = t => { const d = new Date(t); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
  function derive() { S = D.students.map(enrich).filter(s => !ui.cls || s.cls === ui.cls); }
  const all = () => D.students.map(enrich);

  /* Статистика завдань тренажера: [topic][n] → { a, w } */
  function trainerTaskStats(list) {
    const st = {};
    T.forEach(t => { st[t.id] = Array.from({ length: N }, () => ({ a: 0, w: 0 })); });
    list.forEach(s => { for (const id in s.tt) { const r = s.tt[id].r; for (let i = 0; i < N; i++) { if (r[i] === "1") st[id][i].a++; else if (r[i] === "0") { st[id][i].a++; st[id][i].w++; } } } });
    return st;
  }
  function znoTaskStats(list) {
    const st = {};
    list.forEach(s => { for (const tid in s.zno || {}) String(s.zno[tid]).split(";").forEach(p => {
      const m = p.match(/^(\d+):([01])$/); if (!m) return;
      const k = tid + "|" + m[1], x = st[k] || (st[k] = { tid, id: m[1], a: 0, w: 0 }); x.a++; if (m[2] === "0") x.w++;
    }); });
    return st;
  }
  function topicStats(list) {
    return T.map(t => {
      let started = 0, done = 0, a = 0, c = 0, full = 0;
      list.forEach(s => { const x = s.tt[t.id]; if (!x || !x.a) return; started++; a += x.a; c += x.c; if (x.a === N) full++; done += x.a; });
      return { id: t.id, t, started, full, avg: started ? done / started : 0, a, c, w: a - c, acc: a ? c / a : null };
    });
  }

  /* ───── Дрібниці відображення ───── */
  const pctTxt = v => v == null ? "—" : Math.round(v * 100) + "%";
  const lvl = v => v == null ? "" : v >= .85 ? "lvl4" : v >= .7 ? "lvl3" : v >= .5 ? "lvl2" : v >= .3 ? "lvl1" : "lvl0";
  const bar = (v, color) => `<div class="pbar"><i class="${color || lvl(v)}" style="width:${Math.max(0, Math.min(1, v || 0)) * 100}%"></i></div>`;
  const cellBar = (v, label, color) => `<div class="cellbar">${bar(v, color)}<span class="pct">${label != null ? label : pctTxt(v)}</span></div>`;
  const fmtDate = t => t ? new Date(t).toLocaleDateString("uk-UA", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";
  const fmtDT = t => t ? new Date(t).toLocaleString("uk-UA", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";
  function ago(t) {
    if (!t) return "ніколи";
    const d = Math.floor((startOfDay(D.now) - startOfDay(t)) / DAY);
    if (d <= 0) return "сьогодні"; if (d === 1) return "вчора";
    if (d < 5) return d + " дні тому"; if (d < 21) return d + " днів тому";
    return fmtDate(t);
  }
  const startOfDay = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const hours = m => m >= 60 ? (m / 60).toFixed(1).replace(".", ",") + " год" : Math.round(m) + " хв";
  const plain = h => { const d = document.createElement("div"); d.innerHTML = h || ""; return d.textContent.replace(/\s+/g, " ").trim(); };
  /* Зосередженість: тривожні ознаки (від 15 відповідей з вимірюванням часу). */
  const distracted = s => s.fo && s.fo.timed >= 15 && (s.fo.exShare >= .2 || s.fo.focus < .75);
  const guessing = s => s.fo && s.fo.timed >= 15 && s.fo.fastShare >= .3;
  const secTxt = v => v == null ? "—" : v < 60 ? Math.round(v) + " с" : (v / 60).toFixed(1).replace(".", ",") + " хв";
  const focusCell = s => s.fo ? cellBar(s.fo.focus, pctTxt(s.fo.focus)) : "—";
  const kpi = (v, l, e) => `<div class="kpi"><b>${v}</b><span>${l}</span>${e ? `<em>${e}</em>` : ""}</div>`;
  const nameLink = s => `<a href="#student/${encodeURIComponent(s.key)}">${esc(s.name)}</a>`;

  /* Сортована таблиця. cols: [{ k, t, v(row) → значення для сортування, h(row) → HTML, num }] */
  function table(id, cols, rows, opt) {
    opt = opt || {};
    const so = ui.sorts[id] || opt.sort || null;
    if (so) { const c = cols.find(x => x.k === so.k); if (c) rows = rows.slice().sort((a, b) => { const x = c.v(a), y = c.v(b); const r = x == null ? 1 : y == null ? -1 : typeof x === "string" ? x.localeCompare(y, "uk") : x - y; return so.d * r; }); }
    let h = `<div class="tbl-wrap"><table class="t" data-tbl="${id}"><thead><tr>${cols.map(c => `<th ${c.v ? `data-sort="${c.k}"` : ""} class="${so && so.k === c.k ? (so.d > 0 ? "asc" : "desc") : ""} ${c.num ? "num" : ""}">${c.t}</th>`).join("")}</tr></thead><tbody>`;
    if (!rows.length) h += `<tr><td colspan="${cols.length}" class="empty">${opt.empty || "Немає даних."}</td></tr>`;
    rows.slice(0, opt.limit || 1000).forEach((r, i) => { h += `<tr ${opt.link ? `class="click" data-href="${esc(opt.link(r))}"` : ""}>${cols.map(c => `<td class="${c.num ? "num" : ""} ${c.wrap ? "wrapcell" : ""}">${c.h ? c.h(r, i) : esc(c.v(r))}</td>`).join("")}</tr>`; });
    return h + "</tbody></table></div>";
  }

  function chartDays(days, n, opts) {
    opts = opts || {};
    const W = 720, H = 220, pad = 40, list = [];
    for (let i = n - 1; i >= 0; i--) { const k = dayKey(D.now - i * DAY); list.push({ k, v: days[k] || 0, v2: opts.second ? opts.second[k] || 0 : 0 }); }
    const max = Math.max(1, ...list.map(x => x.v)), bw = (W - pad) / n;
    let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(opts.label || "Активність по днях")}">`;
    list.forEach((x, i) => {
      const h = (H - 50) * x.v / max, X = pad + i * bw;
      svg += `<rect class="b" x="${X + 1}" y="${H - 26 - h}" width="${Math.max(2, bw - 3)}" height="${h}" rx="2"><title>${x.k}: ${x.v}</title></rect>`;
      if (opts.second && x.v2) { const h2 = (H - 50) * x.v2 / max; svg += `<rect class="b2" x="${X + 1}" y="${H - 26 - h2}" width="${Math.max(2, bw - 3)}" height="${h2}" rx="2"><title>${x.k}: ${x.v2}</title></rect>`; }
      const step = Math.ceil(n / 6);
      if ((n - 1 - i) % step === 0) svg += `<text x="${Math.min(W - 30, Math.max(30, X + bw / 2))}" y="${H - 2}" text-anchor="middle">${x.k.slice(8)}.${x.k.slice(5, 7)}</text>`;
    });
    svg += `<text x="2" y="20">${max}</text><line x1="${pad}" x2="${W}" y1="24" y2="24" stroke="currentColor" stroke-opacity=".12"/></svg>`;
    return svg;
  }

  /* ───── Тексти завдань ───── */
  function trainerTasks(id) { return taskCache[id] || (taskCache[id] = E.buildTasks(T.find(t => t.id === id))); }
  function trainerTaskHtml(task) {
    let h = `<div class="q">${task.q}</div>${task.big ? `<div class="big">${task.big}</div>` : ""}`;
    if (task.t === "one") h += "<ul>" + task.opts.map((o, k) => `<li class="${k === task.a ? "ok" : ""}">${o}${k === task.a ? " ✓" : ""}</li>`).join("") + "</ul>";
    if (task.t === "multi") h += "<ul>" + task.opts.map((o, k) => `<li class="${task.a.includes(k) ? "ok" : ""}">${o}${task.a.includes(k) ? " ✓" : ""}</li>`).join("") + "</ul>";
    if (task.t === "sort") h += "<ul>" + task.items.map(it => `<li>${it.html} → <span class="ok">${task.cats[it.c]}</span></li>`).join("") + "</ul>";
    if (task.t === "match") h += "<ul>" + task.left.map((l, k) => `<li>${l} — <span class="ok">${task.right.find(r => r.li === k).html}</span></li>`).join("") + "</ul>";
    if (task.t === "order") h += `<p class="ok">${task.items.map(esc).join(" ")}</p>`;
    if (task.note) h += `<div class="hint">${task.note}</div>`;
    return h;
  }
  function md(src) {
    let h = esc(src);
    h = h.replace(/&lt;u&gt;([^&]{1,2})&lt;\/u&gt;/g, '<span class="st">$1</span>').replace(/&lt;u&gt;/g, "<u>").replace(/&lt;\/u&gt;/g, "</u>");
    h = h.replace(/!\[[^\]]*\]\((img\/[^)\s]+)\)/g, (m, p) => '<img src="zno/' + p + '" alt="">');
    h = h.replace(/\*\*\*([^*]+)\*\*\*/g, "<b><i>$1</i></b>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/\*([^*]+)\*/g, "<i>$1</i>");
    return h.replace(/\n/g, "<br>");
  }
  function znoData(tid) {
    if (znoCache[tid]) return znoCache[tid] === "loading" ? null : znoCache[tid];
    znoCache[tid] = "loading";
    fetch("zno/t/" + tid + ".json").then(r => r.json()).then(d => { znoCache[tid] = d; render(); }).catch(() => { znoCache[tid] = { tasks: [] }; });
    return null;
  }
  function znoTaskHtml(task, raw) {
    const F = raw ? (x => x || "") : md;
    let h = `<div class="q">${F(task.q)}</div>`;
    const ans = Array.isArray(task.a) ? task.a : typeof task.a === "string" ? [task.a] : [];
    if (task.opts) h += "<ul>" + task.opts.map(([k, t]) => `<li class="${ans.includes(k) ? "ok" : ""}"><b>${esc(k)}</b> ${F(t)}${ans.includes(k) ? " ✓" : ""}</li>`).join("") + "</ul>";
    if (task.left) h += "<ul>" + task.left.map(([k, t]) => { const rk = task.a[k], r = (task.right || []).find(x => x[0] === rk); return `<li><b>${esc(k)}</b> ${F(t)} → <span class="ok">${esc(rk)}${r ? " " + F(r[1]) : ""}</span></li>`; }).join("") + "</ul>";
    if (task.ex) h += `<details class="more"><summary>Пояснення</summary><div class="small">${F(task.ex)}</div></details>`;
    return h;
  }
  function wrongList(key) {
    const w = D.wrong[key]; if (!w) return "";
    return `<div class="small"><b>Найчастіші хибні відповіді:</b> ${Object.keys(w).map(a => `<span class="tag red">${esc(a)} · ${w[a]}</span>`).join(" ")}</div>`;
  }

  /* ───── Адресати ───── */
  function addressed(code, s) {
    if (code === "all") return true;
    if (code.indexOf("class:") === 0) return code.slice(6).split(",").some(c => c.trim().toUpperCase() === String(s.cls).toUpperCase());
    if (code.indexOf("keys:") === 0) return code.slice(5).split(",").indexOf(s.key) >= 0;
    return false;
  }
  const recipientsOf = code => D.students.filter(s => addressed(code, s));
  function recipientsHtml(st, prefix) {
    const cls = classes();
    let h = `<div class="field"><span>Кому</span><div class="seg" role="group">${[["all", "Усім учням"], ["class", "Класу"], ["keys", "Окремим учням"]].map(([k, l]) => `<button type="button" class="${st.type === k ? "on" : ""}" data-rtype="${prefix}|${k}">${l}</button>`).join("")}</div></div>`;
    if (st.type === "class") h += `<div class="chips">${cls.map(c => `<button type="button" class="${st.classes.has(c) ? "on" : ""}" data-rcls="${prefix}|${esc(c)}">${esc(c)}</button>`).join("") || '<span class="hint">Класів ще немає.</span>'}</div>`;
    if (st.type === "keys") {
      const q = st.q.toLowerCase(), list = D.students.filter(s => !q || (s.name + " " + s.cls).toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name, "uk"));
      h += `<div class="row"><input class="input" style="flex:1 1 200px" placeholder="Пошук учня або класу" data-rq="${prefix}" value="${esc(st.q)}"><button type="button" class="btn sm" data-rall="${prefix}">Вибрати всіх у списку</button><button type="button" class="btn sm" data-rnone="${prefix}">Зняти всіх</button></div>
        <div class="picker">${list.map(s => `<label class="check"><input type="checkbox" data-rkey="${prefix}|${esc(s.key)}" ${st.keys.has(s.key) ? "checked" : ""}> ${esc(s.name)} <span class="muted">${esc(s.cls)}</span></label>`).join("") || '<span class="hint">Нікого не знайдено.</span>'}</div>
        <span class="hint">Вибрано: ${st.keys.size}</span>`;
    }
    return h;
  }
  function toPayload(st) {
    if (st.type === "all") return { to: { type: "all" }, toLabel: "Усім учням" };
    if (st.type === "class") return { to: { type: "class", classes: [...st.classes] }, toLabel: "Клас " + [...st.classes].join(", ") };
    const names = D.students.filter(s => st.keys.has(s.key)).map(s => s.name);
    return { to: { type: "keys", keys: [...st.keys] }, toLabel: names.length > 3 ? names.slice(0, 3).join(", ") + " та ще " + (names.length - 3) : names.join(", ") };
  }

  /* ───── Маршрути й шапка ───── */
  const route = () => (location.hash.slice(1) || "overview").split("/").map(decodeURIComponent);
  const NAV = [["overview", "Огляд"], ["students", "Учні"], ["topics", "Теми"], ["tasks", "Завдання"], ["classes", "Класи"], ["messages", "Повідомлення"], ["assign", "Призначення"], ["settings", "Налаштування"]];
  function shell(body) {
    const r = route()[0], unread = D ? D.replies.filter(x => !x.seen).length : 0;
    const cur = { student: "students", topic: "topics" }[r] || r;
    return `<header class="top"><div class="wrap"><div class="top-row"><img class="logo" src="img/logo-wordmark.png" alt="Midgard"><h1>Адмін-панель</h1><span class="spacer"></span>
      <button class="btn sm" data-act="refresh" title="Оновити дані">↻<span class="small"> Оновити</span></button></div>
      <nav class="nav" aria-label="Розділи">${NAV.map(([k, l]) => `<a href="#${k}" class="${cur === k ? "on" : ""}">${l}${k === "messages" && unread ? `<span class="badge">${unread}</span>` : ""}</a>`).join("")}</nav>
      ${D ? `<div class="filters"><label class="row small"><span class="muted">Клас:</span><select class="input" id="clsf"><option value="">усі класи</option>${classes().map(c => `<option ${ui.cls === c ? "selected" : ""}>${esc(c)}</option>`).join("")}</select></label>
      <span class="hint">Оновлено ${fmtDT(D.now)} · учнів: ${S.length}</span></div>` : ""}</div></header><main class="wrap">${body}</main>`;
  }

  function render() {
    if (!session) { root.innerHTML = loginHtml(); const pw = $("#pw"); if (pw) pw.focus(); return; }
    if (!D) { root.innerHTML = shell(loading ? '<div class="loading">Завантажую статистику…</div>' : `<div class="card"><p class="err">${esc(loadErr || "Немає даних.")}</p><div><button class="btn primary" data-act="refresh">Спробувати ще раз</button></div></div>`); return; }
    const [r, a1] = route();
    const V = { overview, students, student: () => studentPage(a1), topics, topic: () => topicPage(a1), tasks, classes: classesPage, messages, assign, settings }[r] || overview;
    const y = window.scrollY;
    root.innerHTML = shell(V());
    if (render.keepScroll) window.scrollTo(0, y);
    render.keepScroll = false;
  }

  /* ───── Огляд ───── */
  function overview() {
    const tot = S.reduce((o, s) => { o.a += s.tr.a; o.c += s.tr.c; o.za += s.zn.a; o.zc += s.zn.c; o.m += s.act.mins || 0; if (s.fx) { o.fd += s.fx.done || 0; o.ft += (s.fx.done || 0) + (s.fx.open || 0); } if (s.nm.best) { o.nb += s.nm.best; o.nn++; } return o; }, { a: 0, c: 0, za: 0, zc: 0, m: 0, fd: 0, ft: 0, nb: 0, nn: 0 });
    const active = S.filter(s => s.seen >= D.now - 7 * DAY).length;
    const days = {}; S.forEach(s => { for (const k in s.act.days) days[k] = (days[k] || 0) + s.act.days[k]; });
    let h = `<div class="stack"><div class="kpis">
      ${kpi(S.length, "учнів" + (ui.cls ? " у класі " + esc(ui.cls) : ""), "активні за 7 днів: " + active)}
      ${kpi(tot.a + tot.za, "відповідей", "тренажер " + tot.a + " · ЗНО " + tot.za)}
      ${kpi(pctTxt(tot.a ? tot.c / tot.a : null), "точність у тренажері", tot.c + " правильних")}
      ${kpi(pctTxt(tot.za ? tot.zc / tot.za : null), "точність у ЗНО", tot.za + " завдань")}
      ${kpi(tot.nn ? Math.round(tot.nb / tot.nn) : "—", "середній найкращий бал НМТ", tot.nn + " учнів проходили")}
      ${kpi(tot.ft ? tot.fd + " / " + tot.ft : "—", "виправлено помилок", tot.ft ? pctTxt(tot.fd / tot.ft) : "")}
      ${kpi(hours(tot.m), "час у тренажері", "орієнтовно, за журналом")}
      ${(() => { const l = S.filter(x => x.fo); if (!l.length) return ""; const fs = l.reduce((a, x) => a + x.fo.focus, 0) / l.length, ds = S.filter(distracted).length; return kpi(pctTxt(fs), "середня зосередженість", ds ? `<a href="#students">часто відволікаються: ${ds}</a>` : "часу на сторінці під час завдань"); })()}
      ${kpi(D.replies.filter(x => !x.seen).length, "нових відповідей учнів", `<a href="#messages">відкрити</a>`)}
    </div>
    <div class="card"><h3>Активність за 30 днів</h3>${chartDays(days, 30, { label: "Відповіді учнів по днях" })}<div class="legend"><span><i style="background:color-mix(in srgb, var(--violet) 55%, transparent)"></i>відповіді в тренажері й ЗНО</span></div></div>`;
    const ts = topicStats(S).filter(x => x.a >= 20).sort((a, b) => a.acc - b.acc).slice(0, 6);
    const need = S.filter(s => s.seen < D.now - 7 * DAY).sort((a, b) => a.seen - b.seen);
    const weak = S.filter(s => s.tr.a >= 30 && s.tr.acc < .6).sort((a, b) => a.tr.acc - b.tr.acc);
    const topW = S.slice().sort((a, b) => b.week - a.week).filter(s => s.week).slice(0, 6);
    h += `<div class="grid2">
      <div class="card"><h3>Найскладніші теми тренажера</h3>${ts.length ? table("ov-t", [
        { k: "t", t: "Тема", h: r => `<a href="#topic/t:${r.id}">${esc(r.t.title)}</a>` },
        { k: "acc", t: "Точність", h: r => cellBar(r.acc) },
        { k: "s", t: "Учнів", num: 1, h: r => r.started }], ts) : '<p class="empty">Ще замало відповідей (потрібно від 20 на тему).</p>'}</div>
      <div class="card"><h3>Найскладніші завдання</h3>${hardList(8, true)}<div><a class="btn sm" href="#tasks">Усі складні завдання →</a></div></div>
      <div class="card"><h3>Потребують уваги</h3>
        <h4>Не заходили понад 7 днів (${need.length})</h4>${need.length ? `<div class="chips">${need.slice(0, 20).map(s => `<a class="tag" href="#student/${encodeURIComponent(s.key)}">${esc(s.name)} · ${esc(s.cls)} · ${ago(s.seen)}</a>`).join("")}</div>` : '<p class="empty">Усі активні.</p>'}
        <h4>Низька точність (нижче 60 %)</h4>${weak.length ? `<div class="chips">${weak.slice(0, 20).map(s => `<a class="tag red" href="#student/${encodeURIComponent(s.key)}">${esc(s.name)} · ${pctTxt(s.tr.acc)}</a>`).join("")}</div>` : '<p class="empty">Немає.</p>'}
        <h4>Часто відволікаються під час завдань</h4>${(() => { const l = S.filter(distracted).sort((a, b) => b.fo.exShare - a.fo.exShare); return l.length ? `<div class="chips">${l.slice(0, 20).map(s => `<a class="tag red" href="#student/${encodeURIComponent(s.key)}">${esc(s.name)} · виходи у ${pctTxt(s.fo.exShare)} відповідей</a>`).join("")}</div>` : '<p class="empty">Немає.</p>'; })()}
        <h4>Відповідають надто швидко (менше 3 с)</h4>${(() => { const l = S.filter(guessing).sort((a, b) => b.fo.fastShare - a.fo.fastShare); return l.length ? `<div class="chips">${l.slice(0, 20).map(s => `<a class="tag red" href="#student/${encodeURIComponent(s.key)}">${esc(s.name)} · ${pctTxt(s.fo.fastShare)} відповідей</a>`).join("")}</div>` : '<p class="empty">Немає.</p>'; })()}
        ${overdueHtml()}</div>
      <div class="card"><h3>Найактивніші за 7 днів</h3>${topW.length ? table("ov-a", [
        { k: "n", t: "Учень", h: r => nameLink(r) + ` <span class="muted">${esc(r.cls)}</span>` },
        { k: "w", t: "Відповідей", num: 1, h: r => r.week }], topW) : '<p class="empty">Цього тижня ще ніхто не працював.</p>'}</div>
    </div>`;
    if (!ui.cls && classes().length > 1) h += `<div class="card"><h3>Класи</h3>${classTable()}</div>`;
    return h + "</div>";
  }
  function overdueHtml() {
    const list = D.assign.filter(a => a.due && a.due < D.now).map(a => ({ a, st: assignStats(a) })).filter(x => x.st.avg < 1);
    if (!list.length) return "";
    return `<h4>Прострочені призначення</h4><div class="chips">${list.map(x => `<a class="tag red" href="#assign">${esc(x.a.title)} · виконано ${pctTxt(x.st.avg)}</a>`).join("")}</div>`;
  }

  /* ───── Учні ───── */
  function students() {
    const q = ui.q.toLowerCase(), rows = S.filter(s => !q || (s.name + " " + s.cls).toLowerCase().includes(q));
    return `<div class="stack"><div class="row"><input class="input" style="flex:1 1 240px" id="sq" placeholder="Пошук за ім’ям або класом" value="${esc(ui.q)}">
      <button class="btn sm" data-act="csv-students">⬇ CSV</button></div>
      ${table("students", [
        { k: "name", t: "Учень", v: r => r.name, h: r => nameLink(r) },
        { k: "cls", t: "Клас", v: r => r.cls },
        { k: "seen", t: "Остання активність", v: r => r.seen, h: r => `<span class="${r.seen < D.now - 7 * DAY ? "err" : ""}">${ago(r.seen)}</span>` },
        { k: "prog", t: "Тренажер: виконано", v: r => r.tr.a, h: r => cellBar(r.tr.prog, r.tr.a + "/" + T.length * N, "lvl3") },
        { k: "acc", t: "Точність", v: r => r.tr.acc, h: r => cellBar(r.tr.acc) },
        { k: "zno", t: "ЗНО", v: r => r.zn.acc, h: r => r.zn.a ? cellBar(r.zn.acc, pctTxt(r.zn.acc) + " з " + r.zn.a) : "—" },
        { k: "nmt", t: "НМТ найкраще", v: r => r.nm.best || null, num: 1, h: r => r.nm.best || (r.nm.tests ? "поріг не подолано" : "—") },
        { k: "fix", t: "Помилки виправлено", v: r => r.fx ? r.fx.done : null, h: r => r.fx && (r.fx.done + r.fx.open) ? r.fx.done + " з " + (r.fx.done + r.fx.open) : "—" },
        { k: "foc", t: "Зосередженість", v: r => r.fo ? r.fo.focus : null, h: r => focusCell(r) },
        { k: "exa", t: "Відп. після виходу", v: r => r.fo ? r.fo.exShare : null, num: 1, h: r => r.fo ? `<span class="${distracted(r) ? "err" : ""}">${pctTxt(r.fo.exShare)}</span>` : "—" },
        { k: "avg", t: "Сер. час на завдання", v: r => r.fo ? r.fo.avgSec : null, num: 1, h: r => r.fo ? `<span class="${guessing(r) ? "err" : ""}">${secTxt(r.fo.avgSec)}</span>` : "—" },
        { k: "week", t: "За 7 днів", v: r => r.week, num: 1, h: r => r.week },
        { k: "mins", t: "Час", v: r => r.act.mins || 0, num: 1, h: r => hours(r.act.mins || 0) }
      ], rows, { sort: { k: "name", d: 1 }, link: r => "#student/" + encodeURIComponent(r.key), empty: "Учнів ще немає." })}</div>`;
  }

  function studentPage(key) {
    const s = all().find(x => x.key === key);
    if (!s) return `<div class="card"><p>Учня не знайдено.</p><a href="#students">← До списку учнів</a></div>`;
    const tsAll = T.map(t => ({ t, x: s.tt[t.id] || { a: 0, c: 0, r: "" } }));
    const started = tsAll.filter(x => x.x.a), weak = started.filter(x => x.x.a >= 10).sort((a, b) => a.x.c / a.x.a - b.x.c / b.x.a).slice(0, 5);
    const msgs = D.msgs.filter(m => addressed(m.code, s)).sort((a, b) => b.at - a.at), reps = D.replies.filter(r => r.key === s.key).sort((a, b) => b.at - a.at);
    let h = `<div class="stack"><div class="crumbs"><a href="#students">← Учні</a></div>
      <div class="card"><div class="row"><h2>${esc(s.name)}</h2><span class="tag violet">${esc(s.cls)}</span><span class="spacer"></span>
        <button class="btn sm primary noprint" data-msgto="${esc(s.key)}">✉ Написати</button><button class="btn sm noprint" data-act="print">🖨 Друк</button>
        <button class="btn sm noprint" data-resetpin="${esc(s.key)}">Скинути PIN</button><button class="btn sm danger noprint" data-delstu="${esc(s.key)}">Видалити</button></div>
        <div class="hint">Профіль створено ${fmtDate(s.created)} · останній вхід ${fmtDT(s.lastLogin)} · остання активність ${ago(s.seen)}${s.pin ? "" : " · <b>PIN скинуто — учень задасть новий під час входу</b>"}</div>
        <div class="kpis">${kpi(s.tr.a + "/" + T.length * N, "виконано в тренажері", pctTxt(s.tr.prog))}${kpi(pctTxt(s.tr.acc), "точність у тренажері")}${kpi(s.zn.a ? pctTxt(s.zn.acc) : "—", "точність у ЗНО", s.zn.a + " завдань")}
          ${kpi(s.nm.best || "—", "найкращий бал НМТ", s.nm.tests + " тестів")}${kpi(s.fx && (s.fx.done + s.fx.open) ? s.fx.done + "/" + (s.fx.done + s.fx.open) : "—", "виправлено помилок")}${kpi(hours(s.act.mins || 0), "час у тренажері", "за 7 днів: " + s.week + " відповідей")}</div></div>
      <div class="card"><h3>Активність за 60 днів</h3>${chartDays(s.act.days || {}, 60)}</div>
      ${focusCard(s)}`;
    if (weak.length) h += `<div class="card"><h3>Найслабші теми</h3><div class="chips">${weak.map(x => `<a class="tag red" href="#topic/t:${x.t.id}">${esc(x.t.title)} · ${pctTxt(x.x.c / x.x.a)}</a>`).join("")}</div></div>`;
    h += `<div class="card"><div class="row"><h3>Прогрес</h3><span class="spacer"></span><div class="seg">${[["t", "Тренажер"], ["z", "ЗНО"], ["n", "НМТ"], ["e", "Помилки"]].map(([k, l]) => `<button class="${ui.stuTab === k ? "on" : ""}" data-stab="${k}">${l}</button>`).join("")}</div></div>`;
    if (ui.stuTab === "t") h += table("stu-t-" + s.key, [
      { k: "sec", t: "Розділ", v: r => r.t.sec }, { k: "t", t: "Тема", v: r => r.t.title, h: r => `<a href="#topic/t:${r.t.id}">${esc(r.t.title)}</a>` },
      { k: "a", t: "Виконано", v: r => r.x.a, h: r => cellBar(r.x.a / N, r.x.a + "/100", "lvl3") },
      { k: "acc", t: "Точність", v: r => r.x.a ? r.x.c / r.x.a : null, h: r => r.x.a ? cellBar(r.x.c / r.x.a) : "—" },
      { k: "w", t: "Помилок", v: r => r.x.a - r.x.c, num: 1, h: r => r.x.a - r.x.c }, { k: "att", t: "Спроба", v: r => r.x.att || 0, num: 1, h: r => r.x.att || "—" }], tsAll);
    if (ui.stuTab === "z") h += table("stu-z-" + s.key, [
      { k: "t", t: "Тема ЗНО", v: r => r.title, h: r => `<a href="#topic/z:${r.id}">${esc(r.title)}</a>` },
      { k: "a", t: "Виконано", v: r => (s.zt[r.id] || {}).a || 0, h: r => { const x = s.zt[r.id]; return x ? cellBar(x.a / r.n, x.a + "/" + r.n, "lvl3") : "—"; } },
      { k: "acc", t: "Точність", v: r => { const x = s.zt[r.id]; return x && x.a ? x.c / x.a : null; }, h: r => { const x = s.zt[r.id]; return x && x.a ? cellBar(x.c / x.a) : "—"; } }], znoTopics());
    if (ui.stuTab === "n") h += table("stu-n-" + s.key, [
      { k: "t", t: "Тест", v: r => r.title, h: r => `<a href="#topic/n:${r.id}">${esc(r.title)}</a>` },
      { k: "b", t: "Найкраще", v: r => (s.nmt[r.id] || {}).bs || null, num: 1, h: r => { const x = s.nmt[r.id]; return x ? (x.bs || "поріг не подолано") + " <span class=\"muted\">(" + x.bp + "/45)</span>" : "—"; } },
      { k: "l", t: "Останнє", v: r => (s.nmt[r.id] || {}).s || null, num: 1, h: r => { const x = s.nmt[r.id]; return x ? (x.s || "—") + " <span class=\"muted\">(" + x.p + "/45)</span>" : "—"; } },
      { k: "n", t: "Спроб", v: r => (s.nmt[r.id] || {}).n || 0, num: 1, h: r => (s.nmt[r.id] || {}).n || "—" },
      { k: "d", t: "Коли", v: r => (s.nmt[r.id] || {}).at || 0, h: r => s.nmt[r.id] ? fmtDate(s.nmt[r.id].at) : "—" }], NI ? NI.tests : []);
    if (ui.stuTab === "e") h += studentMistakes(s);
    h += `</div>`;
    const myAsg = D.assign.filter(a => addressed(a.code, s));
    if (myAsg.length) h += `<div class="card"><h3>Призначення</h3>${table("stu-a-" + s.key, [
      { k: "t", t: "Назва", v: r => r.title }, { k: "d", t: "Термін", v: r => r.due || 0, h: r => r.due ? `<span class="${r.due < D.now && itemsProgress(s, r.items) < 1 ? "err" : ""}">${fmtDate(r.due)}</span>` : "—" },
      { k: "p", t: "Виконано", v: r => itemsProgress(s, r.items), h: r => cellBar(itemsProgress(s, r.items)) }], myAsg)}</div>`;
    h += `<div class="card"><h3>Повідомлення й відповіді</h3>${msgs.length || reps.length ? `<div class="list">${msgs.slice(0, 20).map(m => `<div class="item"><div class="meta"><b>${esc(m.title || "Повідомлення")}</b><span>${fmtDT(m.at)}</span><span>${esc(m.toLabel)}</span>${m.readers.includes(s.key) ? '<span class="tag green">прочитано</span>' : '<span class="tag red">не прочитано</span>'}</div><div class="text">${esc(m.text)}</div></div>`).join("")}
      ${reps.map(r => `<div class="item ${r.seen ? "" : "unread"}"><div class="meta"><b>Відповідь учня</b><span>${fmtDT(r.at)}</span></div><div class="text">${esc(r.text)}</div></div>`).join("")}</div>` : '<p class="empty">Повідомлень ще немає.</p>'}</div></div>`;
    return h;
  }
  function focusCard(s) {
    const f = s.fo;
    if (!f) return `<div class="card"><h3>Зосередженість</h3><p class="empty">Ще немає відповідей із вимірюванням часу (з’являться після нових відповідей учня).</p></div>`;
    const flags = [];
    if (distracted(s)) flags.push('<span class="tag red">часто виходить зі сторінки під час завдань</span>');
    if (guessing(s)) flags.push('<span class="tag red">багато дуже швидких відповідей — можливо, навмання</span>');
    if (!flags.length && f.timed >= 15) flags.push('<span class="tag green">працює зосереджено</span>');
    let h = `<div class="card"><h3>Зосередженість ${flags.join(" ")}</h3>
      <div class="kpis">${kpi(pctTxt(f.focus), "часу на сторінці", "решта — поза сайтом: " + hours(f.awayMin))}
        ${kpi(f.exits, "виходів зі сторінки", "під час " + f.exAns + " з " + f.timed + " відповідей (" + pctTxt(f.exShare) + ")")}
        ${kpi(f.exAns ? pctTxt(f.exOk / f.exAns) : "—", "правильних після виходу", "порівняйте з точністю " + pctTxt(s.tr.acc))}
        ${kpi(secTxt(f.avgSec), "середній час на завдання")}
        ${kpi(pctTxt(f.fastShare), "відповідей швидше 3 с", f.fast ? "з них правильних " + pctTxt(f.fastOk / f.fast) : "")}</div>`;
    if (f.recent.length) h += `<details class="more"><summary>Останні відповіді, під час яких учень виходив зі сторінки (${f.recent.length})</summary>${table("foc-" + s.key, [
      { k: "at", t: "Коли", v: r => r.at, h: r => fmtDT(r.at) }, { k: "t", t: "Тема", v: r => r.topic, h: r => esc(r.topic) + (r.fix ? ' <span class="tag violet">робота над помилками</span>' : "") },
      { k: "n", t: "№", v: r => r.n, num: 1, h: r => r.n }, { k: "ok", t: "Результат", v: r => r.ok ? 1 : 0, h: r => r.ok ? '<span class="tag green">правильно</span>' : '<span class="tag red">помилка</span>' },
      { k: "ex", t: "Виходів", v: r => r.ex, num: 1, h: r => r.ex }, { k: "aw", t: "Поза сторінкою", v: r => r.away, num: 1, h: r => secTxt(r.away) },
      { k: "sec", t: "На сторінці", v: r => r.sec, num: 1, h: r => secTxt(r.sec) }], f.recent, { sort: { k: "at", d: -1 } })}</details>`;
    return h + `<p class="hint" style="margin:0">Сайт бачить лише, коли сторінка зникає з екрана (інша вкладка чи застосунок, згорнутий браузер, вимкнений екран), але не що учень робив поза сайтом. Це сигнал для розмови, а не доказ.</p></div>`;
  }
  function studentMistakes(s) {
    const blocks = [];
    T.forEach(t => {
      const x = s.tt[t.id]; if (!x || x.a === x.c) return;
      const tasks = trainerTasks(t.id), idx = []; for (let i = 0; i < N; i++) if (x.r[i] === "0") idx.push(i);
      blocks.push(`<details class="more"><summary>${esc(t.title)} — помилок: ${idx.length}</summary><div class="list" style="margin-top:8px">${idx.map(i => `<div class="task-view"><div class="meta small muted">Завдання ${i + 1}</div>${trainerTaskHtml(tasks[i])}${wrongList(t.id + "|" + (i + 1))}</div>`).join("")}</div></details>`);
    });
    return blocks.length ? `<p class="hint">Завдання тренажера, у яких учень помилився (з правильною відповіддю). Найчастіші хибні відповіді — по всіх учнях.</p><div class="list">${blocks.join("")}</div>` : '<p class="empty">Помилок у тренажері немає.</p>';
  }

  /* ───── Теми ───── */
  function topics() {
    let h = `<div class="stack"><div class="row"><div class="seg">${[["t", "Тренажер"], ["z", "ЗНО"], ["n", "НМТ"]].map(([k, l]) => `<button class="${ui.topicSrc === k ? "on" : ""}" data-tsrc="${k}">${l}</button>`).join("")}</div><span class="spacer"></span><button class="btn sm" data-act="csv-topics">⬇ CSV</button></div>`;
    if (ui.topicSrc === "t") h += table("topics-t", [
      { k: "sec", t: "Розділ", v: r => r.t.sec }, { k: "t", t: "Тема", v: r => r.t.title, h: r => `<a href="#topic/t:${r.id}">${esc(r.t.title)}</a>` },
      { k: "s", t: "Почали", v: r => r.started, num: 1, h: r => r.started + " з " + S.length },
      { k: "f", t: "Завершили", v: r => r.full, num: 1, h: r => r.full },
      { k: "avg", t: "Середнє виконання", v: r => r.avg, h: r => r.started ? cellBar(r.avg / N, Math.round(r.avg) + "/100", "lvl3") : "—" },
      { k: "acc", t: "Точність", v: r => r.acc, h: r => cellBar(r.acc) }, { k: "w", t: "Помилок", v: r => r.w, num: 1, h: r => r.w }],
      topicStats(S), { link: r => "#topic/t:" + r.id });
    if (ui.topicSrc === "z") h += table("topics-z", [
      { k: "sec", t: "Розділ", v: r => r.sec }, { k: "t", t: "Тема", v: r => r.title, h: r => `<a href="#topic/z:${r.id}">${esc(r.title)}</a>` },
      { k: "n", t: "Завдань", v: r => r.n, num: 1, h: r => r.n }, { k: "s", t: "Почали", v: r => r.started, num: 1, h: r => r.started },
      { k: "avg", t: "Середнє виконання", v: r => r.avg, h: r => r.started ? cellBar(r.avg, pctTxt(r.avg), "lvl3") : "—" },
      { k: "acc", t: "Точність", v: r => r.acc, h: r => cellBar(r.acc) }],
      znoTopics().map(t => { let st = 0, done = 0, a = 0, c = 0; S.forEach(s => { const x = s.zt[t.id]; if (!x || !x.a) return; st++; done += x.a / t.n; a += x.a; c += x.c; }); return Object.assign({}, t, { started: st, avg: st ? done / st : 0, acc: a ? c / a : null }); }),
      { link: r => "#topic/z:" + r.id });
    if (ui.topicSrc === "n") h += table("topics-n", [
      { k: "t", t: "Тест", v: r => r.title, h: r => `<a href="#topic/n:${r.id}">${esc(r.title)}</a>` },
      { k: "s", t: "Проходили", v: r => r.st, num: 1, h: r => r.st }, { k: "att", t: "Спроб", v: r => r.att, num: 1, h: r => r.att },
      { k: "avg", t: "Середній найкращий", v: r => r.avg || null, num: 1, h: r => r.avg ? Math.round(r.avg) : "—" },
      { k: "max", t: "Найкращий", v: r => r.max || null, num: 1, h: r => r.max || "—" },
      { k: "pass", t: "Подолали поріг", v: r => r.pass, num: 1, h: r => r.st ? r.pass + " з " + r.st : "—" }],
      (NI ? NI.tests : []).map(t => { let st = 0, att = 0, sum = 0, n = 0, max = 0, pass = 0; S.forEach(s => { const x = (s.nmt || {})[t.id]; if (!x) return; st++; att += x.n || 0; if (x.bs) { sum += x.bs; n++; max = Math.max(max, x.bs); pass++; } }); return Object.assign({}, t, { st, att, avg: n ? sum / n : 0, max, pass }); }),
      { link: r => "#topic/n:" + r.id });
    return h + "</div>";
  }

  function heatColor(a, w) { if (!a) return ""; const e = w / a; return `background:color-mix(in srgb, ${e > .5 ? "#d93025" : e > .3 ? "#f57c00" : e > .15 ? "#f9ab00" : "#1e8e3e"} ${Math.round(25 + 55 * Math.min(1, a / 5))}%, transparent)`; }
  function topicPage(code) {
    const [k, id] = [String(code || "").slice(0, 1), String(code || "").slice(2)];
    if (k === "t") return trainerTopicPage(id);
    if (k === "z") return znoTopicPage(id);
    if (k === "n") return nmtTestPage(id);
    return "<p>Тему не знайдено.</p>";
  }
  function trainerTopicPage(id) {
    const t = T.find(x => x.id === id); if (!t) return "<p>Тему не знайдено.</p>";
    const st = trainerTaskStats(S)[id], tasks = trainerTasks(id), ts = topicStats(S).find(x => x.id === id);
    const sel = ui.sel && ui.sel.topic === "t:" + id ? ui.sel.i : null;
    let h = `<div class="stack"><div class="crumbs"><a href="#topics">← Теми</a></div><div class="card"><h2>${esc(t.title)}</h2><span class="hint">Тренажер · розділ ${esc(t.sec)} · <a href="./" target="_blank">відкрити на сайті</a></span>
      <div class="kpis">${kpi(ts.started + " з " + S.length, "почали тему")}${kpi(ts.full, "виконали всі 100")}${kpi(pctTxt(ts.acc), "точність")}${kpi(ts.w, "помилок усього")}</div></div>
      <div class="card"><h3>Карта завдань</h3><p class="hint">Колір — частка помилок (зелений → червоний), насиченість — скільки учнів відповіли. Натисніть номер, щоб побачити завдання.</p>
      <div class="heat">${st.map((x, i) => `<button class="${sel === i ? "sel" : ""}" style="${heatColor(x.a, x.w)}" data-heat="t:${id}|${i}" title="Завдання ${i + 1}: ${x.a ? Math.round(x.w / x.a * 100) + "% помилок, відповідей " + x.a : "ще без відповідей"}">${i + 1}</button>`).join("")}</div>`;
    if (sel != null) h += `<div class="task-view"><div class="row"><b>Завдання ${sel + 1}</b><span class="tag ${st[sel].a && st[sel].w / st[sel].a > .3 ? "red" : "green"}">${st[sel].a ? Math.round(st[sel].w / st[sel].a * 100) + "% помилок · " + st[sel].a + " відповідей" : "ще без відповідей"}</span></div>${trainerTaskHtml(tasks[sel])}${wrongList(id + "|" + (sel + 1))}</div>`;
    h += `</div><div class="card"><h3>Учні</h3>${table("tp-" + id, [
      { k: "n", t: "Учень", v: r => r.name, h: r => nameLink(r) }, { k: "c", t: "Клас", v: r => r.cls },
      { k: "a", t: "Виконано", v: r => (r.tt[id] || {}).a || 0, h: r => cellBar(((r.tt[id] || {}).a || 0) / N, ((r.tt[id] || {}).a || 0) + "/100", "lvl3") },
      { k: "acc", t: "Точність", v: r => { const x = r.tt[id]; return x && x.a ? x.c / x.a : null; }, h: r => { const x = r.tt[id]; return x && x.a ? cellBar(x.c / x.a) : "—"; } }], S, { sort: { k: "a", d: -1 } })}</div></div>`;
    return h;
  }
  function znoTopicPage(id) {
    const t = znoTopic(id); if (!t) return "<p>Тему не знайдено.</p>";
    const st = znoTaskStats(S), data = znoData(id), sel = ui.sel && ui.sel.topic === "z:" + id ? ui.sel.i : null;
    let h = `<div class="stack"><div class="crumbs"><a href="#topics">← Теми</a></div><div class="card"><h2>${esc(t.title)}</h2><span class="hint">ЗНО · ${t.n} завдань · колір — частка помилок</span></div>
      <div class="card"><h3>Карта завдань</h3><div class="heat">${t.ids.map((tid, i) => { const x = st[id + "|" + tid] || { a: 0, w: 0 }; return `<button class="${sel === i ? "sel" : ""}" style="${heatColor(x.a, x.w)}" data-heat="z:${id}|${i}" title="${x.a ? Math.round(x.w / x.a * 100) + "% помилок, відповідей " + x.a : "ще без відповідей"}">${i + 1}</button>`; }).join("")}</div>`;
    if (sel != null) {
      const x = st[id + "|" + t.ids[sel]] || { a: 0, w: 0 };
      h += `<div class="task-view"><div class="row"><b>Завдання ${sel + 1}</b><span class="tag">${x.a ? Math.round(x.w / x.a * 100) + "% помилок · " + x.a + " відповідей" : "ще без відповідей"}</span></div>${data ? znoTaskHtml(data.tasks[sel] || {}) : '<p class="hint">Завантажую…</p>'}${wrongList(id + "|" + (sel + 1))}</div>`;
    }
    return h + "</div></div>";
  }
  function nmtTestPage(id) {
    const t = nmtTest(id); if (!t) return "<p>Тест не знайдено.</p>";
    const rows = S.filter(s => (s.nmt || {})[id]);
    return `<div class="stack"><div class="crumbs"><a href="#topics">← Теми</a></div><div class="card"><h2>${esc(t.title)}</h2><span class="hint">Симуляція НМТ · ${t.n} завдань · максимум ${t.max} балів</span>
      ${table("nt-" + id, [{ k: "n", t: "Учень", v: r => r.name, h: r => nameLink(r) }, { k: "c", t: "Клас", v: r => r.cls },
        { k: "b", t: "Найкраще", v: r => r.nmt[id].bs || 0, num: 1, h: r => (r.nmt[id].bs || "поріг не подолано") + ` <span class="muted">(${r.nmt[id].bp}/45)</span>` },
        { k: "l", t: "Останнє", v: r => r.nmt[id].s || 0, num: 1, h: r => (r.nmt[id].s || "—") + ` <span class="muted">(${r.nmt[id].p}/45)</span>` },
        { k: "a", t: "Спроб", v: r => r.nmt[id].n || 0, num: 1, h: r => r.nmt[id].n || 0 },
        { k: "bl", t: "Виходів зі сторінки", v: r => r.nmt[id].blur || 0, num: 1, h: r => r.nmt[id].blur || 0 },
        { k: "d", t: "Коли", v: r => r.nmt[id].at || 0, h: r => fmtDT(r.nmt[id].at) }], rows, { sort: { k: "b", d: -1 }, empty: "Цей тест ще ніхто не проходив." })}
      <p class="hint">Відповіді на окремі завдання НМТ зберігаються лише на пристрої учня, тож тут — бали за спроби.</p></div></div>`;
  }

  /* ───── Найскладніші завдання ───── */
  function hardRows() {
    const out = [], min = ui.taskMin;
    if (ui.taskSrc !== "z") {
      const st = trainerTaskStats(S);
      T.forEach(t => { if (ui.taskTopic && ui.taskTopic !== "t:" + t.id) return; st[t.id].forEach((x, i) => { if (x.a >= min && x.w) out.push({ src: "t", tid: t.id, i, a: x.a, w: x.w, e: x.w / x.a, title: t.title }); }); });
    }
    if (ui.taskSrc !== "t") {
      const st = znoTaskStats(S);
      for (const k in st) {
        const x = st[k], tt = znoTopic(x.tid); if (!tt || x.a < min || !x.w) continue;
        if (ui.taskTopic && ui.taskTopic !== "z:" + x.tid) continue;
        out.push({ src: "z", tid: x.tid, i: tt.ids.indexOf(Number(x.id)) >= 0 ? tt.ids.indexOf(Number(x.id)) : tt.ids.map(String).indexOf(x.id), a: x.a, w: x.w, e: x.w / x.a, title: "ЗНО: " + tt.title });
      }
    }
    return out.sort((a, b) => b.e - a.e || b.w - a.w);
  }
  function taskPreview(r) {
    if (r.src === "t") { const t = trainerTasks(r.tid)[r.i]; return plain(t.q) + (t.big ? " — " + plain(t.big) : ""); }
    const d = znoData(r.tid); return d && d.tasks[r.i] ? plain(md(d.tasks[r.i].q)).slice(0, 160) : "Завдання " + (r.i + 1);
  }
  function hardList(limit, compact) {
    const rows = hardRows().slice(0, limit);
    if (!rows.length) return `<p class="empty">Ще замало відповідей (потрібно від ${ui.taskMin} на завдання).</p>`;
    return `<div class="list">${rows.map(r => `<details class="item"><summary class="row"><span class="tag red">${Math.round(r.e * 100)}%</span><span class="small muted">${esc(r.title)} · №${r.i + 1} · ${r.w} з ${r.a}</span></summary>
      <div class="task-view">${r.src === "t" ? trainerTaskHtml(trainerTasks(r.tid)[r.i]) : (znoData(r.tid) ? znoTaskHtml(znoData(r.tid).tasks[r.i] || {}) : '<p class="hint">Завантажую…</p>')}${wrongList(r.tid + "|" + (r.i + 1))}
      <a class="btn sm" href="#topic/${r.src}:${r.tid}">Тема →</a></div></details>`).join("")}</div>${compact ? "" : ""}`;
  }
  function tasks() {
    const opts = [`<option value="">усі теми</option>`].concat(T.map(t => `<option value="t:${t.id}" ${ui.taskTopic === "t:" + t.id ? "selected" : ""}>${esc(t.title)}</option>`), znoTopics().map(t => `<option value="z:${t.id}" ${ui.taskTopic === "z:" + t.id ? "selected" : ""}>ЗНО: ${esc(t.title)}</option>`));
    const rows = hardRows();
    return `<div class="stack"><div class="card"><div class="row"><div class="seg">${[["all", "Усі"], ["t", "Тренажер"], ["z", "ЗНО"]].map(([k, l]) => `<button class="${ui.taskSrc === k ? "on" : ""}" data-tksrc="${k}">${l}</button>`).join("")}</div>
      <select class="input" id="tktopic" style="width:auto;flex:1 1 180px">${opts.join("")}</select>
      <label class="row small"><span class="muted">мін. відповідей</span><select class="input" id="tkmin" style="width:auto">${[1, 2, 3, 5, 10, 20].map(n => `<option ${ui.taskMin === n ? "selected" : ""}>${n}</option>`).join("")}</select></label>
      <span class="spacer"></span><button class="btn sm" data-act="csv-tasks">⬇ CSV</button></div>
      <p class="hint">Завдання, у яких учні найчастіше помиляються. Відсоток — частка хибних відповідей. Розгорніть рядок, щоб побачити завдання, правильну й найчастіші хибні відповіді.</p></div>
      <div class="card"><h3>Знайдено: ${rows.length}</h3>${hardList(150)}</div></div>`;
  }

  /* ───── Класи ───── */
  function classStats() {
    return classes().map(c => {
      const list = all().filter(s => s.cls === c);
      const o = { c, n: list.length, active: list.filter(s => s.seen >= D.now - 7 * DAY).length, a: 0, k: 0, za: 0, zk: 0, nb: 0, nn: 0, fd: 0, ft: 0, m: 0 };
      list.forEach(s => { o.a += s.tr.a; o.k += s.tr.c; o.za += s.zn.a; o.zk += s.zn.c; if (s.nm.best) { o.nb += s.nm.best; o.nn++; } if (s.fx) { o.fd += s.fx.done || 0; o.ft += (s.fx.done || 0) + (s.fx.open || 0); } o.m += s.act.mins || 0; });
      return o;
    });
  }
  function classTable() {
    return table("classes", [
      { k: "c", t: "Клас", v: r => r.c, h: r => `<a href="#students" data-pickcls="${esc(r.c)}">${esc(r.c)}</a>` },
      { k: "n", t: "Учнів", v: r => r.n, num: 1, h: r => r.n }, { k: "act", t: "Активні 7 днів", v: r => r.active, num: 1, h: r => r.active },
      { k: "a", t: "Відповідей на учня", v: r => r.n ? r.a / r.n : 0, num: 1, h: r => r.n ? Math.round(r.a / r.n) : 0 },
      { k: "acc", t: "Точність тренажера", v: r => r.a ? r.k / r.a : null, h: r => cellBar(r.a ? r.k / r.a : null) },
      { k: "z", t: "Точність ЗНО", v: r => r.za ? r.zk / r.za : null, h: r => r.za ? cellBar(r.zk / r.za) : "—" },
      { k: "nb", t: "НМТ, сер. найкращий", v: r => r.nn ? r.nb / r.nn : null, num: 1, h: r => r.nn ? Math.round(r.nb / r.nn) : "—" },
      { k: "f", t: "Виправлено помилок", v: r => r.ft ? r.fd / r.ft : null, h: r => r.ft ? r.fd + " з " + r.ft : "—" },
      { k: "m", t: "Час", v: r => r.m, num: 1, h: r => hours(r.m) }], classStats());
  }
  function classesPage() {
    if (!classes().length) return '<div class="card"><p class="empty">Учнів ще немає.</p></div>';
    return `<div class="stack"><div class="card"><div class="row"><h3>Порівняння класів</h3><span class="spacer"></span><button class="btn sm" data-act="csv-classes">⬇ CSV</button></div>${classTable()}<p class="hint">Натисніть клас, щоб відфільтрувати всю панель за ним.</p></div></div>`;
  }

  /* ───── Повідомлення ───── */
  function messages() {
    const unread = D.replies.filter(r => !r.seen).sort((a, b) => b.at - a.at), seen = D.replies.filter(r => r.seen).sort((a, b) => b.at - a.at);
    const msgTitle = id => { const m = D.msgs.find(x => x.id === id); return m ? (m.title || plain(m.text).slice(0, 40)) : "повідомлення"; };
    let h = `<div class="stack"><div class="card"><h3>Нове повідомлення</h3>${recipientsHtml(compose, "m")}
      <label class="field"><span>Заголовок (необов’язково)</span><input class="input" id="mtitle" maxlength="120" value="${esc(compose.title)}"></label>
      <label class="field"><span>Текст</span><textarea class="input" id="mtext" maxlength="4000">${esc(compose.text)}</textarea></label>
      <label class="check"><input type="checkbox" id="mimp" ${compose.imp ? "checked" : ""}> Важливе — показати учневі одразу після входу</label>
      <div class="row"><button class="btn primary" data-act="send" ${compose.busy ? "disabled" : ""}>${compose.busy ? "Надсилаю…" : "Надіслати"}</button><span class="hint">Учні побачать повідомлення під дзвіночком 🔔 на сайті.</span></div></div>`;
    h += `<div class="card"><h3>Відповіді учнів ${unread.length ? `<span class="badge">${unread.length}</span>` : ""}</h3>${unread.length || seen.length ? `<div class="list">${unread.concat(seen.slice(0, 30)).map(r => `<div class="item ${r.seen ? "" : "unread"}"><div class="meta"><b><a href="#student/${encodeURIComponent(r.key)}">${esc(r.name)}</a></b><span>${fmtDT(r.at)}</span><span>на «${esc(msgTitle(r.msg))}»</span></div><div class="text">${esc(r.text)}</div>
      <div class="row">${r.seen ? "" : `<button class="btn sm" data-seen="${esc(r.id)}">Позначити прочитаним</button>`}<button class="btn sm" data-msgto="${esc(r.key)}">Відповісти</button></div></div>`).join("")}</div>
      ${unread.length > 1 ? `<div><button class="btn sm" data-act="seen-all">Позначити всі прочитаними</button></div>` : ""}` : '<p class="empty">Відповідей поки немає.</p>'}</div>`;
    const sent = D.msgs.slice().sort((a, b) => b.at - a.at);
    h += `<div class="card"><h3>Надіслані (${sent.length})</h3>${sent.length ? `<div class="list">${sent.map(m => {
      const rec = recipientsOf(m.code), read = rec.filter(s => m.readers.includes(s.key)), not = rec.filter(s => !m.readers.includes(s.key));
      return `<div class="item"><div class="meta"><b>${esc(m.title || "Без заголовка")}</b>${m.imp ? '<span class="tag red">важливе</span>' : ""}<span>${fmtDT(m.at)}</span><span>${esc(m.toLabel)}</span><span class="tag ${not.length ? "" : "green"}">прочитали ${read.length} з ${rec.length}</span></div>
        <div class="text">${esc(m.text)}</div>${not.length ? `<details class="more small"><summary>Ще не прочитали (${not.length})</summary>${not.map(s => esc(s.name) + " (" + esc(s.cls) + ")").join(", ")}</details>` : ""}
        <div class="row"><button class="btn sm danger" data-delmsg="${esc(m.id)}">Видалити</button></div></div>`;
    }).join("")}</div>` : '<p class="empty">Ви ще не надсилали повідомлень.</p>'}</div></div>`;
    return h;
  }

  /* ───── Призначення ───── */
  function itemProgress(s, code) {
    const [k, id] = [code.slice(0, 1), code.slice(2)];
    if (k === "t") { const x = s.tt[id]; return x ? x.a / N : 0; }
    if (k === "z") { const x = s.zt[id], t = znoTopic(id); return x && t ? Math.min(1, x.a / t.n) : 0; }
    return (s.nmt || {})[id] ? 1 : 0;
  }
  const itemsProgress = (s, items) => items.length ? items.reduce((a, c) => a + itemProgress(s, c), 0) / items.length : 0;
  function assignStats(a) {
    const rec = all().filter(s => addressed(a.code, s) && (!ui.cls || s.cls === ui.cls));
    const ps = rec.map(s => itemsProgress(s, a.items));
    return { rec, avg: ps.length ? ps.reduce((x, y) => x + y, 0) / ps.length : 0, done: ps.filter(p => p >= 1).length };
  }
  function assign() {
    let h = `<div class="stack">`;
    if (!asg.open) h += `<div><button class="btn primary" data-act="asg-new">+ Нове призначення</button></div>`;
    else {
      const iq = asg.iq.toLowerCase(), match = t => !iq || t.toLowerCase().includes(iq);
      const box = (code, title) => match(title) ? `<label class="check"><input type="checkbox" data-aitem="${code}" ${asg.items.has(code) ? "checked" : ""}> ${esc(title)}</label>` : "";
      let pick = "";
      SECS.forEach(sec => { const list = T.filter(t => t.sec === sec.id).map(t => box("t:" + t.id, t.title)).join(""); if (list) pick += `<div class="grp">Тренажер · ${esc(sec.id)} ${esc(sec.title)}</div>${list}`; });
      if (ZI) ZI.sections.forEach(sec => { const list = ZI.topics.filter(t => t.sec === sec.id).map(t => box("z:" + t.id, t.title)).join(""); if (list) pick += `<div class="grp">ЗНО · ${esc(sec.id)} ${esc(sec.title)}</div>${list}`; });
      if (NI) { const list = NI.tests.map(t => box("n:" + t.id, t.title)).join(""); if (list) pick += `<div class="grp">Симуляції НМТ</div>${list}`; }
      h += `<div class="card"><h3>${asg.id ? "Редагування призначення" : "Нове призначення"}</h3>
        <label class="field"><span>Назва</span><input class="input" id="atitle" maxlength="120" placeholder="Напр.: Домашнє завдання на тиждень" value="${esc(asg.title)}"></label>
        <div class="field"><span>Теми й тести (вибрано: ${asg.items.size})</span><input class="input" id="aiq" placeholder="Пошук теми" value="${esc(asg.iq)}"><div class="picker">${pick || '<span class="hint">Нічого не знайдено.</span>'}</div></div>
        ${asg.items.size ? `<div class="chips">${[...asg.items].map(c => `<span class="tag violet">${esc(itemTitle(c))}</span>`).join("")}</div>` : ""}
        ${recipientsHtml(asg, "a")}
        <div class="row"><label class="field"><span>Термін</span><input class="input" type="date" id="adue" value="${esc(asg.due)}"></label></div>
        <label class="field"><span>Примітка для учнів</span><textarea class="input" id="anote" maxlength="1000" style="min-height:70px">${esc(asg.note)}</textarea></label>
        <div class="row"><button class="btn primary" data-act="asg-save" ${asg.busy ? "disabled" : ""}>${asg.busy ? "Зберігаю…" : "Зберегти й надіслати"}</button><button class="btn" data-act="asg-cancel">Скасувати</button></div></div>`;
    }
    const list = D.assign.slice().sort((a, b) => (a.due || 9e15) - (b.due || 9e15));
    if (!list.length) h += '<div class="card"><p class="empty">Призначень ще немає. Створіть призначення — учні побачать його на головній сторінці тренажера з прогресом і терміном.</p></div>';
    list.forEach(a => {
      const st = assignStats(a), overdue = a.due && a.due < D.now;
      h += `<div class="card"><div class="row"><h3>${esc(a.title)}</h3>${a.due ? `<span class="tag ${overdue ? "red" : ""}">до ${fmtDate(a.due)}${overdue ? " · прострочено" : ""}</span>` : ""}<span class="tag">${esc(a.toLabel)}</span><span class="spacer"></span>
        <button class="btn sm" data-asgedit="${esc(a.id)}">Змінити</button><button class="btn sm danger" data-asgdel="${esc(a.id)}">Видалити</button></div>
        ${a.note ? `<div class="hint">${esc(a.note)}</div>` : ""}<div class="chips">${a.items.map(c => `<span class="tag violet">${esc(itemTitle(c))}</span>`).join("")}</div>
        <div class="kpis">${kpi(pctTxt(st.avg), "середнє виконання")}${kpi(st.done + " з " + st.rec.length, "виконали повністю")}</div>
        <details class="more"><summary>Прогрес учнів</summary>${table("asg-" + a.id, [{ k: "n", t: "Учень", v: r => r.name, h: r => nameLink(r) }, { k: "c", t: "Клас", v: r => r.cls },
          { k: "p", t: "Разом", v: r => itemsProgress(r, a.items), h: r => cellBar(itemsProgress(r, a.items)) }].concat(a.items.map((c, j) => ({ k: "i" + j, t: esc(itemTitle(c).replace(/^[^:]+: /, "")).slice(0, 26), v: r => itemProgress(r, c), h: r => pctTxt(itemProgress(r, c)) }))), st.rec, { sort: { k: "p", d: 1 }, empty: "Немає адресатів." })}</details></div>`;
    });
    return h + "</div>";
  }

  /* ───── Налаштування ───── */
  function settings() {
    return `<div class="stack"><div class="card"><h3>Дані</h3><div class="row">
      <a class="btn" href="${esc(D.sheetUrl)}" target="_blank" rel="noopener">Відкрити Google Таблицю ↗</a>
      <button class="btn" data-act="csv-students">⬇ Учні (CSV)</button><button class="btn" data-act="csv-topics">⬇ Теми (CSV)</button>
      <button class="btn" data-act="csv-tasks">⬇ Складні завдання (CSV)</button><button class="btn" data-act="csv-classes">⬇ Класи (CSV)</button></div>
      <p class="hint">CSV відкривається в Excel чи Google Таблицях. Фільтр класу враховується.</p></div>
      <div class="card"><h3>Сесія</h3><p class="hint">Вхід дійсний до ${fmtDT(session.aexp)}. Змінити пароль: у Google Таблиці меню «Тренажер» → «Задати пароль адміністратора» (усі входи в панель після цього завершаться).</p>
      <div><button class="btn danger" data-act="logout">Вийти з панелі</button></div></div>
      <div class="card"><h3>Довідка</h3><ul class="small">
        <li><b>Точність</b> — частка правильних серед виконаних завдань (тренажер — поточна спроба теми).</li>
        <li><b>Час у тренажері</b> — орієнтовний: сума проміжків між відповідями до 5 хвилин.</li>
        <li><b>Зосередженість</b> — частка часу на сторінці від показу завдання до відповіді. <b>Виходи</b> — скільки разів сторінка зникала з екрана (інша вкладка чи застосунок, згорнутий браузер, вимкнений екран). Що учень робив поза сайтом, браузер не повідомляє; розділений екран і другий пристрій не відстежуються. Позначки «часто відволікаються» (виходи у 20 % відповідей або зосередженість нижче 75 %) і «надто швидко» (30 % відповідей швидше 3 с) з’являються від 15 відповідей.</li>
        <li><b>Скинути PIN</b> — учень під час наступного входу задасть новий PIN-код.</li>
        <li><b>Найчастіші хибні відповіді</b> — з журналу «Спроби», по всіх учнях.</li>
        <li>Повідомлення й призначення учні отримують під час входу або збереження прогресу (кожні кілька секунд роботи).</li></ul></div></div>`;
  }

  /* ───── CSV ───── */
  function csv(name, head, rows) {
    const q = v => { v = v == null ? "" : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
    const text = "﻿" + [head].concat(rows).map(r => r.map(q).join(";")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    a.download = name + "-" + dayKey(Date.now()) + ".csv"; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  const p100 = v => v == null ? "" : Math.round(v * 1000) / 10;
  const CSV = {
    "csv-students": () => csv("uchni", ["Учень", "Клас", "Остання активність", "Тренажер виконано", "Тренажер точність %", "ЗНО виконано", "ЗНО точність %", "НМТ найкращий", "Помилок виправлено", "Помилок усього", "Відповідей за 7 днів", "Хвилин",
      "Зосередженість %", "Виходів зі сторінки", "Відповідей після виходу %", "Сер. час на завдання, с", "Відповідей швидше 3 с %"],
      S.map(s => [s.name, s.cls, s.seen ? new Date(s.seen).toLocaleString("uk-UA") : "", s.tr.a, p100(s.tr.acc), s.zn.a, p100(s.zn.acc), s.nm.best || "", s.fx ? s.fx.done : "", s.fx ? s.fx.done + s.fx.open : "", s.week, s.act.mins || 0,
        s.fo ? p100(s.fo.focus) : "", s.fo ? s.fo.exits : "", s.fo ? p100(s.fo.exShare) : "", s.fo ? Math.round(s.fo.avgSec) : "", s.fo ? p100(s.fo.fastShare) : ""])),
    "csv-topics": () => csv("temy", ["Розділ", "Тема", "Почали", "Завершили", "Середнє виконання", "Точність %", "Помилок"], topicStats(S).map(r => [r.t.sec, r.t.title, r.started, r.full, Math.round(r.avg), p100(r.acc), r.w])),
    "csv-tasks": () => csv("skladni-zavdannia", ["Тема", "№", "Завдання", "Помилок %", "Хибних", "Відповідей", "Найчастіші хибні"], hardRows().map(r => [r.title, r.i + 1, taskPreview(r), Math.round(r.e * 100), r.w, r.a, Object.keys(D.wrong[r.tid + "|" + (r.i + 1)] || {}).join(" | ")])),
    "csv-classes": () => csv("klasy", ["Клас", "Учнів", "Активні 7 днів", "Відповідей", "Точність тренажера %", "Точність ЗНО %", "НМТ сер. найкращий", "Виправлено помилок", "Хвилин"],
      classStats().map(r => [r.c, r.n, r.active, r.a, p100(r.a ? r.k / r.a : null), p100(r.za ? r.zk / r.za : null), r.nn ? Math.round(r.nb / r.nn) : "", r.ft ? r.fd + "/" + r.ft : "", Math.round(r.m)]))
  };

  /* ───── Події ───── */
  root.addEventListener("submit", e => { if (e.target.id === "login") { e.preventDefault(); doLogin($("#pw").value); } });
  root.addEventListener("input", e => {
    const el = e.target, id = el.id;
    if (id === "sq") { ui.q = el.value; rerenderKeepFocus("sq"); return; }
    if (id === "mtitle") compose.title = el.value;
    if (id === "mtext") compose.text = el.value;
    if (id === "atitle") asg.title = el.value;
    if (id === "anote") asg.note = el.value;
    if (id === "adue") asg.due = el.value;
    if (id === "aiq") { asg.iq = el.value; rerenderKeepFocus("aiq"); return; }
    if (el.dataset.rq) { (el.dataset.rq === "m" ? compose : asg).q = el.value; rerenderKeepFocus(null, el.dataset.rq); }
  });
  function rerenderKeepFocus(id, rq) {
    render.keepScroll = true; render();
    const el = id ? document.getElementById(id) : root.querySelector(`[data-rq="${rq}"]`);
    if (el) { el.focus(); const v = el.value; el.setSelectionRange(v.length, v.length); }
  }
  root.addEventListener("change", e => {
    const el = e.target;
    if (el.id === "clsf") { ui.cls = el.value; derive(); render(); return; }
    if (el.id === "mimp") { compose.imp = el.checked; return; }
    if (el.id === "tktopic") { ui.taskTopic = el.value; render.keepScroll = true; render(); return; }
    if (el.id === "tkmin") { ui.taskMin = Number(el.value); render.keepScroll = true; render(); return; }
    if (el.dataset.rkey) { const [p, k] = splitOnce(el.dataset.rkey); const st = p === "m" ? compose : asg; if (el.checked) st.keys.add(k); else st.keys.delete(k); render.keepScroll = true; render(); return; }
    if (el.dataset.aitem) { if (el.checked) asg.items.add(el.dataset.aitem); else asg.items.delete(el.dataset.aitem); render.keepScroll = true; render(); }
  });
  const splitOnce = s => { const i = s.indexOf("|"); return [s.slice(0, i), s.slice(i + 1)]; };
  root.addEventListener("toggle", e => { if (e.target.tagName === "DETAILS" && e.target.open) { /* ЗНО-тексти довантажуються під час рендеру */ } }, true);
  root.addEventListener("click", async e => {
    const tr = e.target.closest("tr[data-href]");
    if (tr && !e.target.closest("a, button")) { location.hash = tr.dataset.href.slice(1); return; }
    const th = e.target.closest("th[data-sort]");
    if (th) { const id = th.closest("table").dataset.tbl, k = th.dataset.sort, cur = ui.sorts[id]; ui.sorts[id] = { k, d: cur && cur.k === k ? -cur.d : 1 }; render.keepScroll = true; render(); return; }
    const b = e.target.closest("button, a[data-pickcls]"); if (!b) return;
    const d = b.dataset;
    if (d.pickcls) { ui.cls = d.pickcls; derive(); return; }
    if (d.act === "refresh") { refresh(); return; }
    if (d.act === "logout") { logout(); return; }
    if (d.act === "print") { window.print(); return; }
    if (CSV[d.act]) { CSV[d.act](); return; }
    if (d.stab) { ui.stuTab = d.stab; render.keepScroll = true; render(); return; }
    if (d.tsrc) { ui.topicSrc = d.tsrc; render(); return; }
    if (d.tksrc) { ui.taskSrc = d.tksrc; ui.taskTopic = ""; render(); return; }
    if (d.heat) { const [t, i] = splitOnce(d.heat); ui.sel = { topic: t, i: Number(i) }; render.keepScroll = true; render(); return; }
    if (d.rtype) { const [p, k] = splitOnce(d.rtype); (p === "m" ? compose : asg).type = k; render.keepScroll = true; render(); return; }
    if (d.rcls) { const [p, c] = splitOnce(d.rcls); const st = p === "m" ? compose : asg; if (st.classes.has(c)) st.classes.delete(c); else st.classes.add(c); render.keepScroll = true; render(); return; }
    if (d.rall) { const st = d.rall === "m" ? compose : asg, q = st.q.toLowerCase(); D.students.filter(s => !q || (s.name + " " + s.cls).toLowerCase().includes(q)).forEach(s => st.keys.add(s.key)); render.keepScroll = true; render(); return; }
    if (d.rnone) { (d.rnone === "m" ? compose : asg).keys.clear(); render.keepScroll = true; render(); return; }
    if (d.msgto) { compose.type = "keys"; compose.keys = new Set([d.msgto]); compose.q = ""; location.hash = "messages"; setTimeout(() => { const t = $("#mtext"); if (t) t.focus(); }, 50); return; }
    if (d.act === "send") {
      const pl = toPayload(compose);
      if ((compose.type === "class" && !compose.classes.size) || (compose.type === "keys" && !compose.keys.size)) { toast("Оберіть, кому надіслати"); return; }
      if (!compose.text.trim()) { toast("Впишіть текст повідомлення"); return; }
      compose.busy = true; render.keepScroll = true; render();
      const r = await api(Object.assign({ action: "admin_msg_send", title: compose.title, text: compose.text, important: compose.imp }, pl));
      compose.busy = false;
      if (r && r.ok) { toast("Повідомлення надіслано"); compose.title = ""; compose.text = ""; compose.imp = false; await refreshQuiet(); }
      else { toast("Не вдалося надіслати"); render.keepScroll = true; render(); }
      return;
    }
    if (d.seen) { await api({ action: "admin_reply_read", ids: [d.seen] }); await refreshQuiet(); return; }
    if (d.act === "seen-all") { await api({ action: "admin_reply_read", ids: D.replies.filter(r => !r.seen).map(r => r.id) }); await refreshQuiet(); return; }
    if (d.delmsg) { if (!confirm("Видалити повідомлення? Учні більше його не бачитимуть.")) return; await api({ action: "admin_msg_delete", id: d.delmsg }); await refreshQuiet(); toast("Видалено"); return; }
    if (d.resetpin) { const s = D.students.find(x => x.key === d.resetpin); if (!confirm("Скинути PIN-код учня " + s.name + "? Під час наступного входу учень задасть новий.")) return; const r = await api({ action: "admin_reset_pin", key: d.resetpin }); toast(r && r.ok ? "PIN скинуто" : "Не вдалося"); await refreshQuiet(); return; }
    if (d.delstu) {
      const s = D.students.find(x => x.key === d.delstu);
      const typed = prompt("Буде видалено профіль і весь прогрес учня «" + s.name + "» (журнал «Спроби» лишиться). Це не можна скасувати.\nЩоб підтвердити, впишіть прізвище учня:");
      if (!typed || !s.name.toLowerCase().includes(typed.trim().toLowerCase()) || typed.trim().length < 2) { if (typed !== null) toast("Прізвище не збігається — нічого не видалено"); return; }
      const r = await api({ action: "admin_delete_student", key: d.delstu }); toast(r && r.ok ? "Учня видалено" : "Не вдалося"); location.hash = "students"; await refreshQuiet(); return;
    }
    if (d.act === "asg-new") { Object.assign(asg, { id: "", title: "", items: new Set(), type: ui.cls ? "class" : "all", classes: new Set(ui.cls ? [ui.cls] : []), keys: new Set(), q: "", due: "", note: "", iq: "", open: true }); render(); return; }
    if (d.act === "asg-cancel") { asg.open = false; render(); return; }
    if (d.asgedit) {
      const a = D.assign.find(x => x.id === d.asgedit); if (!a) return;
      const type = a.code === "all" ? "all" : a.code.indexOf("class:") === 0 ? "class" : "keys";
      Object.assign(asg, { id: a.id, title: a.title, items: new Set(a.items), type, classes: new Set(type === "class" ? a.code.slice(6).split(",") : []), keys: new Set(type === "keys" ? a.code.slice(5).split(",") : []),
        q: "", iq: "", due: a.due ? dayKey(a.due) : "", note: a.note, open: true });
      render(); window.scrollTo(0, 0); return;
    }
    if (d.asgdel) { if (!confirm("Видалити призначення?")) return; await api({ action: "admin_assign_delete", id: d.asgdel }); await refreshQuiet(); toast("Видалено"); return; }
    if (d.act === "asg-save") {
      if (!asg.items.size) { toast("Оберіть хоча б одну тему"); return; }
      if ((asg.type === "class" && !asg.classes.size) || (asg.type === "keys" && !asg.keys.size)) { toast("Оберіть, кому призначити"); return; }
      asg.busy = true; render.keepScroll = true; render();
      const due = asg.due ? new Date(asg.due + "T23:59:00").getTime() : 0;
      const r = await api(Object.assign({ action: "admin_assign_save", id: asg.id, title: asg.title, items: [...asg.items], due, note: asg.note }, toPayload(asg)));
      asg.busy = false;
      if (r && r.ok) { asg.open = false; toast("Призначення збережено"); await refreshQuiet(); } else { toast("Не вдалося зберегти"); render(); }
    }
  });
  async function refreshQuiet() {
    const d = await api({ action: "admin_data" });
    if (d && d.ok) { D = d; derive(); }
    render.keepScroll = true; render();
  }
  window.addEventListener("hashchange", () => { ui.sel = null; render(); window.scrollTo(0, 0); });

  if (session) refresh(); else render();
})();
