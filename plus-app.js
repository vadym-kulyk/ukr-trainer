/* Щоденна розминка, мотивація (серія днів, тижнева ціль, нагороди), діагностика з планом і прогноз балу НМТ.
   Дані — у s.plus (синхронізується з таблицею, аркуш «Службове: дані учнів»):
     days  { "2026-11-04": кількість відповідей }         — для серії й тижневої цілі
     goal  { w: 50 }                                      — тижнева ціль
     wu    { box: { "topic:n": [коробка 1–5, день] }, done: { день: відповідей } } — інтервальне повторення (система Лейтнера)
     diag  { v, at, cur, res: { topic: "1" | "0" }, sec, done } — діагностика
     badges { id: час отримання } */
(function () {
  "use strict";

  window.MGPlus = function (host) {
    const { esc, E, T } = host;
    const DAY = 86400000, WU_N = 10;
    const GAP = [0, 1, 3, 7, 14, 30];          // через скільки днів повторювати завдання з коробки 1–5
    const pad = n => String(n).padStart(2, "0");
    const dk = t => { const d = new Date(t); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };
    const dnum = t => { const d = new Date(t); return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / DAY); };
    const today = () => dnum(Date.now());
    let sess = null, p = null, checked = false, nmtIndex = null;

    function plus() {
      const s = host.me(); if (!s) return null;
      s.plus = s.plus || {};
      const x = s.plus;
      x.days = x.days || {}; x.goal = x.goal || { w: 50 }; x.badges = x.badges || {};
      x.wu = x.wu || { box: {}, done: {} }; x.wu.box = x.wu.box || {}; x.wu.done = x.wu.done || {};
      return x;
    }

    /* ── Активність, серія, тижнева ціль ── */
    function countEvents(events) {
      const x = plus(); if (!x || !events || !events.length) return;
      events.forEach(ev => { const k = dk(ev.at || Date.now()); x.days[k] = (x.days[k] || 0) + 1; });
      const keys = Object.keys(x.days).sort();
      if (keys.length > 400) keys.slice(0, keys.length - 400).forEach(k => { delete x.days[k]; });
      badgeCheck();
    }
    function streak() {
      const x = plus(); if (!x) return 0;
      let n = 0, t = Date.now();
      if (!x.days[dk(t)]) t -= DAY;            // сьогодні ще не займався — серія не обривається до кінця дня
      while (x.days[dk(t)]) { n++; t -= DAY; }
      return n;
    }
    function bestStreak() {
      const x = plus(); if (!x) return 0;
      const ds = Object.keys(x.days).filter(k => x.days[k] > 0).sort().map(k => dnum(new Date(k + "T12:00:00").getTime()));
      let best = 0, run = 0, prev = null;
      ds.forEach(d => { run = prev !== null && d === prev + 1 ? run + 1 : 1; best = Math.max(best, run); prev = d; });
      return best;
    }
    function weekCount() {
      const x = plus(); if (!x) return 0;
      const now = new Date(), wd = (now.getDay() + 6) % 7; // понеділок = 0
      let sum = 0;
      for (let i = 0; i <= wd; i++) sum += x.days[dk(now.getTime() - i * DAY)] || 0;
      return sum;
    }
    const total = () => { const x = plus(); return x ? Object.values(x.days).reduce((a, b) => a + b, 0) : 0; };

    /* ── Нагороди ── */
    const BADGES = [
      ["first", "1", "Перший крок", "Перша відповідь"],
      ["a100", "100", "Сотня", "100 відповідей"],
      ["a500", "500", "П’ятсот", "500 відповідей"],
      ["a1000", "1000", "Тисячник", "1000 відповідей"],
      ["s3", "3", "Три дні поспіль", "Серія 3 дні"],
      ["s7", "7", "Тиждень поспіль", "Серія 7 днів"],
      ["s30", "30", "Місяць поспіль", "Серія 30 днів"],
      ["goal", "ціль", "Ціль тижня", "Виконати тижневу ціль"],
      ["t1", "1", "Перша тема", "Завершити тему (100 завдань)"],
      ["t5", "5", "П’ять тем", "Завершити 5 тем"],
      ["tall", "усі", "Усі теми", "Завершити всі теми тренажера"],
      ["perfect", "100%", "Бездоганно", "Тема на 100 %"],
      ["th1", "1", "Знаю правило", "Пройти тренування теорії в темі"],
      ["th10", "10", "Теоретик", "Тренування теорії в 10 темах"],
      ["wu7", "×7", "Розминка ×7", "7 днів щоденної розминки"],
      ["diag", "план", "Знаю, з чого почати", "Пройти діагностику"],
      ["fix10", "10", "Працюю над помилками", "Виправити 10 помилок"],
    ];
    function earned() {
      const x = plus(), s = host.me(); if (!x || !s) return {};
      const st = T.map(t => host.topicStats(t.id)), full = st.filter(z => z.a === 100).length;
      const thDone = Object.values(x.th || {}).filter(z => z && z.m && Object.keys(z.m).length >= 20).length;
      const n = total(), best = bestStreak();
      return {
        first: n >= 1, a100: n >= 100, a500: n >= 500, a1000: n >= 1000,
        s3: best >= 3, s7: best >= 7, s30: best >= 30, goal: weekCount() >= (x.goal.w || 50),
        t1: full >= 1, t5: full >= 5, tall: full >= T.length, perfect: st.some(z => z.c === 100),
        th1: thDone >= 1, th10: thDone >= 10, wu7: Object.keys(x.wu.done).filter(k => x.wu.done[k] >= WU_N).length >= 7,
        diag: !!(x.diag && x.diag.done), fix10: host.fixDone() >= 10
      };
    }
    function badgeCheck() {
      const x = plus(); if (!x) return;
      const e = earned(), fresh = [];
      BADGES.forEach(([id, ic, title]) => { if (e[id] && !x.badges[id]) { x.badges[id] = Date.now(); fresh.push(ic + " " + title); } });
      if (fresh.length) host.toast("Нова нагорода: " + fresh.join(", "));
    }

    /* ── Щоденна розминка (інтервальне повторення) ── */
    function warmupItems() {
      const x = plus(), s = host.me(); if (!x || !s) return [];
      const d0 = today(), box = x.wu.box, out = [];
      const due = Object.keys(box).filter(k => box[k][1] <= d0).sort((a, b) => box[a][0] - box[b][0] || box[a][1] - box[b][1]);
      due.forEach(k => out.push(k));
      if (out.length < WU_N) {
        // Нові для розминки: спершу помилки з тем, потім правильні відповіді давніших тем.
        const r = E.rngFrom("wu-" + d0 + "-" + host.currentKey()), wrong = [], right = [];
        T.forEach(t => {
          const st = s.topics && s.topics[t.id]; if (!st || !st.r) return;
          for (let n = 0; n < st.r.length; n++) {
            const k = t.id + ":" + n; if (box[k]) continue;
            if (st.r[n] === "0") wrong.push(k); else if (st.r[n] === "1") right.push(k);
          }
        });
        // Помилки діагностики — теж у розминку (корисно, поки тем ще не проходили).
        if (x.diag && x.diag.res) diagItems(x.diag.v).forEach(it => { const k = it.topic + ":" + it.n; if (x.diag.res[it.key] === "0" && !box[k] && wrong.indexOf(k) < 0) wrong.push(k); });
        E.shuffle(r, wrong).concat(E.shuffle(r, right)).some(k => { out.push(k); return out.length >= WU_N; });
      }
      // Чергуємо теми, щоб не було кількох завдань поспіль з однієї.
      const by = {}; out.slice(0, WU_N).forEach(k => { const t = k.split(":")[0]; (by[t] = by[t] || []).push(k); });
      const mix = []; let any = true;
      for (let i = 0; any; i++) { any = false; Object.keys(by).forEach(t => { if (by[t][i]) { mix.push(by[t][i]); any = true; } }); }
      return mix.map((k, i) => {
        const [topic, n] = [k.split(":")[0], +k.split(":")[1]], tObj = T.find(z => z.id === topic), base = host.tasksOf(topic)[n];
        const b = box[k] ? box[k][0] : 0, seed = k + ":" + d0;
        let task = null;
        if (b >= 2 && tObj) { try { task = E.similar(tObj, base, null, seed, 1)[0]; } catch (e) { task = null; } }
        if (!task) task = E.reshuffle(base, seed);
        return { key: k, topic, n, task: Object.assign({}, task, { n: i }), box: b };
      });
    }
    function wuState() {
      const x = plus(); if (!x) return { due: 0, doneToday: 0 };
      const d0 = today(), due = Object.keys(x.wu.box).filter(k => x.wu.box[k][1] <= d0).length;
      return { due, doneToday: x.wu.done[dk(Date.now())] || 0, inBox: Object.keys(x.wu.box).length };
    }

    /* ── Діагностика ── */
    function diagItems(v) {
      return T.map((t, i) => {
        const list = host.tasksOf(t.id), idx = Math.abs(hashN(t.id + ":" + v)) % list.length;
        return { key: t.id, topic: t.id, n: idx, task: Object.assign({}, list[idx], { n: i }) };
      });
    }
    function hashN(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }

    /* ── Прогноз НМТ ── */
    function loadNmt() {
      if (nmtIndex) return nmtIndex;
      nmtIndex = "loading";
      fetch("nmt/index.json").then(r => r.json()).then(d => { nmtIndex = d; host.render(); }).catch(() => { nmtIndex = { scale: {} }; });
      return null;
    }
    function forecast() {
      const s = host.me(), x = plus(); if (!s || !x) return null;
      let n = 0, ok = 0, covered = 0;
      T.forEach(t => { const st = host.topicStats(t.id); if (st.a) { n += st.a; ok += st.c; covered++; } });
      Object.values(s.zno || {}).forEach(z => Object.values(z.res || {}).forEach(v => { if (v) { n++; if (v === "1") ok++; } }));
      if (x.diag && x.diag.res) Object.values(x.diag.res).forEach(v => { n++; if (v === "1") ok++; });
      const sims = [];
      Object.values(s.nmt || {}).forEach(z => (z.hist || []).forEach(hh => { if (hh && hh.p != null) sims.push(hh); }));
      sims.sort((a, b) => (a.at || 0) - (b.at || 0));
      const idx = typeof nmtIndex === "object" && nmtIndex ? nmtIndex : null;
      const sc = pts => { if (!idx || !idx.scale) return null; const k = Math.max(0, Math.min(45, Math.round(pts))); return k < 8 ? 0 : idx.scale[k] || null; };
      if (n < 30) return { enough: false, n, sims, sc };
      const pr = ok / n, se = Math.sqrt(pr * (1 - pr) / n), gap = 1 - covered / T.length;
      const lo = Math.max(0, pr - 1.96 * se - 0.12 * gap - 0.05), hi = Math.min(1, pr + 1.96 * se + 0.05);
      return { enough: true, n, pr, covered, pts: pr * 45, lo: lo * 45, hi: hi * 45, sims, sc };
    }

    /* ── Картка «Сьогодні» на головній ── */
    function todayHtml() {
      if (!host.loggedIn()) return "";
      const x = plus(), sk = streak(), wk = weekCount(), goal = x.goal.w || 50, w = wuState(), e = earned();
      const nb = BADGES.filter(b => e[b[0]]).length, f = forecast(); loadNmt();
      const wuDone = w.doneToday >= WU_N;
      const diagDone = x.diag && x.diag.done, diagRun = x.diag && !x.diag.done && x.diag.res && Object.keys(x.diag.res).length;
      let fc = "Прогноз НМТ";
      if (f && f.enough && f.sc(f.pts) != null) fc = "Прогноз НМТ: ~" + (f.sc(f.pts) || "< поріг");
      return `<section class="today" aria-label="Сьогодні">
        <div class="td-top">
          <div class="td-stat"><div><b class="mono">${sk}</b><span>${sk === 1 ? "день" : sk >= 2 && sk <= 4 ? "дні" : "днів"} поспіль</span></div></div>
          <div class="td-stat td-goal"><div><b class="mono">${wk}<small> / ${goal}</small></b><span>ціль тижня</span><div class="bar" aria-hidden="true"><b style="width:${Math.min(100, wk / goal * 100)}%"></b></div></div></div>
        </div>
        <div class="td-acts">
          <button class="btn ${wuDone ? "" : "primary"}" data-pl="wu">${wuDone ? "✓ Розминку виконано · ще 10" : "Щоденна розминка · " + WU_N + " завдань"}</button>
          <button class="btn" data-pl="${diagDone ? "plan" : "diag"}">${diagDone ? "Мій план" : diagRun ? "Продовжити діагностику" : "Діагностика · 15 хв"}</button>
          <button class="btn" data-pl="forecast">${esc(fc)}</button>
          <button class="btn" data-pl="badges">Нагороди ${nb}/${BADGES.length}</button>
        </div></section>`;
    }

    /* ── Сторінки ── */
    const top = (title) => `<div class="topbar"><div class="wrap"><div class="tb-row"><button class="btn small ghost" data-pl="home" aria-label="На головну">← Головна</button><span class="tb-title">${esc(title)}</span></div></div></div>`;
    function pageHtml() {
      if (!host.loggedIn()) return top("Тренажер") + `<main class="wrap">${host.gateHtml()}</main>`;
      const v = host.ui.pv;
      if (v === "run" && sess) return top(sess.title) + `<main class="wrap" style="padding-top:0">${runHtml()}</main>`;
      if (v === "plan") return top("Мій план") + `<main class="wrap">${planHtml()}</main>`;
      if (v === "forecast") return top("Прогноз балу НМТ") + `<main class="wrap">${forecastHtml()}</main>`;
      if (v === "badges") return top("Нагороди й цілі") + `<main class="wrap">${badgesHtml()}</main>`;
      if (v === "diag") return top("Діагностика") + `<main class="wrap">${diagIntro()}</main>`;
      return null;
    }
    function diagIntro() {
      const x = plus(), d = x.diag;
      const going = d && !d.done && d.res && Object.keys(d.res).length;
      return `<section class="card pl-card"><h2>Діагностика</h2>
        <p>${T.length} завдань — по одному з кожної теми тренажера. Це займе близько 15 хвилин. Відповідайте самостійно: результат покаже, з яких тем почати.</p>
        <p class="hint">Діагностика не змінює прогрес тем. Пройти її знову можна будь-коли.</p>
        <div class="task-nav"><button class="btn primary" data-pl="diag-go">${going ? "Продовжити (" + Object.keys(d.res).length + " / " + T.length + ")" : d && d.done ? "Пройти ще раз" : "Почати"}</button>
        ${d && d.done ? '<button class="btn" data-pl="plan">Мій план</button>' : ""}</div></section>`;
    }

    function startWarmup() {
      const items = warmupItems();
      if (!items.length) { host.toast("Спершу виконайте кілька завдань у темах або пройдіть діагностику"); return; }
      sess = { kind: "wu", title: "Щоденна розминка", items, pos: 0, res: [], start: Date.now() };
      p = null; checked = false; host.ui.view = "plus"; host.ui.pv = "run"; host.render(); window.scrollTo(0, 0);
    }
    function startDiag() {
      const x = plus();
      if (!x.diag || x.diag.done) x.diag = { v: ((x.diag && x.diag.v) || 0) + 1, at: Date.now(), res: {}, sec: 0, done: false };
      const items = diagItems(x.diag.v), pos = items.findIndex(it => !x.diag.res[it.key]);
      sess = { kind: "diag", title: "Діагностика", items, pos: pos < 0 ? 0 : pos, res: [], start: Date.now() };
      p = null; checked = false; host.ui.view = "plus"; host.ui.pv = "run"; host.saveLocal(); host.render(); window.scrollTo(0, 0);
    }

    function runHtml() {
      const it = sess.items[sess.pos];
      if (!it) return summaryHtml();
      const task = it.task, t = T.find(z => z.id === it.topic);
      if (!p || p.key !== it.key + sess.pos) { p = host.trainerNewPend(task, "pl" + it.topic); p.key = it.key + sess.pos; p.f = host.focusMark(); checked = false; }
      const done = checked, resp = done ? p.resp : undefined;
      const nOk = sess.res.filter(Boolean).length;
      let h = `<section class="tasks"><div class="tprog"><div class="tprog-top"><span>${sess.kind === "wu" ? "Розминка" : "Діагностика"}: <b class="mono">${sess.pos + (done ? 1 : 0)}</b> з ${sess.items.length}</span><span class="score mono">${nOk} ✓</span></div>
        <div class="bar" aria-hidden="true"><b style="width:${(sess.pos + (done ? 1 : 0)) / sess.items.length * 100}%"></b></div></div>
        <article class="task" aria-live="polite"><div class="task-head"><span class="mono">${esc(t ? t.sec + " · " + t.title : "")}</span><span class="kind">${sess.kind === "wu" ? (it.box ? "повторення · коробка " + it.box : "нове для розминки") : host.typeName(task.t)}</span></div>
        <h3 class="task-q">${task.q}</h3>${task.big ? `<div class="big">${task.big}</div>` : ""}`;
      h += host.trainerBody(task, done, resp, p);
      if (done) {
        h += `<div class="fb ${p.ok ? "good" : "bad"}"><span class="verdict">${p.ok ? "Правильно!" : "Помилка"}</span>${!p.ok ? host.correctHtml(task) : ""}${task.note ? `<span>${task.note}</span>` : ""}
          ${sess.kind === "wu" ? `<span class="hint">${p.ok ? "Завдання повернеться через " + GAP[Math.min(5, (it.box || 0) + 1)] + " дн." : "Повторимо завтра."}</span>` : ""}</div>`;
      }
      const can = !done && host.trainerReady(task, p);
      h += `<div class="task-nav">${done ? `<button class="btn primary grow" data-pl="next">${sess.pos < sess.items.length - 1 ? "Далі →" : "Підсумок"}</button>` : `<button class="btn primary grow" data-pl="check" ${can ? "" : "disabled"}>Перевірити</button>`}</div></article>
        <div class="foot-acts"><button class="btn small" data-pl="home">Завершити й вийти</button></div></section>`;
      return h;
    }
    function summaryHtml() {
      const ok = sess.res.filter(Boolean).length, n = sess.res.length;
      if (sess.kind === "diag") return planHtml(true);
      return `<section class="card pl-card"><h2>Розминку завершено: ${ok} з ${n}</h2>
        <p>${ok === n ? "Чудово! Усі завдання правильно." : "Завдання з помилками повторимо завтра — так правило закріплюється найкраще."}</p>
        <p class="hint">Серія: ${streak()} · ціль тижня: ${weekCount()} / ${plus().goal.w || 50}</p>
        <div class="task-nav"><button class="btn primary" data-pl="wu">Ще 10 завдань</button><button class="btn" data-pl="home">На головну</button></div></section>`;
    }

    function planHtml(fresh) {
      const x = plus(), d = x.diag, S = host.S;
      const st = id => host.topicStats(id);
      const weak = [], strong = [], untested = [];
      T.forEach(t => {
        const a = st(t.id), acc = a.a ? a.c / a.a : null, dres = d && d.res ? d.res[t.id] : undefined;
        // Слабка тема: помилка в діагностиці або точність нижче 70 % (від 10 відповідей).
        if ((acc !== null && a.a >= 10 && acc < 0.7) || (dres === "0" && !(a.a >= 10 && acc >= 0.8))) weak.push({ t, acc, a, dres });
        else if (dres === "1" || (acc !== null && a.a >= 10)) strong.push({ t, acc, a, dres });
        else untested.push({ t, acc, a, dres });
      });
      const row = (o, kind) => `<div class="pl-row"><div><b>${esc(o.t.sec)} · ${esc(o.t.title)}</b><span class="hint">${o.dres ? "діагностика: " + (o.dres === "1" ? "✓" : "✗") + " · " : ""}${o.a.a ? "виконано " + o.a.a + "/100, точність " + Math.round(o.acc * 100) + " %" : "ще не починали"}</span></div>
        <div class="pl-btns"><button class="btn small" data-open="${o.t.id}" data-tab="theory">Теорія</button><button class="btn small ${kind === "weak" ? "primary" : ""}" data-open="${o.t.id}" data-tab="tasks">${o.a.a ? "Продовжити" : "Почати"}</button></div></div>`;
      const ok = d && d.res ? Object.values(d.res).filter(v => v === "1").length : 0;
      let h = "";
      if (fresh || (d && d.done)) h += `<section class="card pl-card"><h2>${fresh ? "Діагностику завершено" : "Результат діагностики"}: ${ok} з ${T.length}</h2>
        <p>${fresh ? "План нижче складено за діагностикою й вашим прогресом у темах." : "Пройдено " + new Date(d.at).toLocaleDateString("uk-UA") + "."}</p>
        <div class="task-nav"><button class="btn" data-pl="diag">Пройти діагностику ще раз</button></div></section>`;
      else h += `<section class="card pl-card"><h2>Мій план</h2><p>Пройдіть діагностику, щоб план був точнішим.</p><div class="task-nav"><button class="btn primary" data-pl="diag">Діагностика · 15 хв</button></div></section>`;
      const sec = list => S.map(sc => { const l = list.filter(o => o.t.sec === sc.id); return l.length ? `<h3 class="pl-sec">${esc(sc.id)} ${esc(sc.title)}</h3>` + l.map(o => row(o, list === weak ? "weak" : "")).join("") : ""; }).join("");
      h += `<section class="pl-group"><h2>1. Почніть із цих тем <span class="pill red">${weak.length}</span></h2>${weak.length ? sec(weak) : '<p class="hint">Слабких тем не знайдено. Так тримати!</p>'}</section>`;
      if (untested.length) h += `<section class="pl-group"><h2>2. Ще не перевірено <span class="pill">${untested.length}</span></h2>${sec(untested)}</section>`;
      if (strong.length) h += `<section class="pl-group"><h2>${untested.length ? 3 : 2}. Добре знаєте — повторюйте в розминці <span class="pill green">${strong.length}</span></h2>${sec(strong)}</section>`;
      return h;
    }

    function forecastHtml() {
      const f = forecast();
      if (!nmtIndex || nmtIndex === "loading") { loadNmt(); return '<p class="empty">Завантажую шкалу НМТ…</p>'; }
      let h = `<section class="card pl-card"><h2>Прогноз балу НМТ</h2>`;
      if (!f || !f.enough) h += `<p>Для прогнозу потрібно щонайменше <b>30 відповідей</b> у темах тренажера, завданнях ЗНО чи діагностиці. Зараз: ${f ? f.n : 0}.</p><div class="task-nav"><button class="btn primary" data-pl="diag">Пройти діагностику</button></div>`;
      else {
        const mid = f.sc(f.pts), lo = f.sc(f.lo), hi = f.sc(f.hi), fmt = v => v ? v : "нижче порогу";
        h += `<div class="fc-big"><span class="lbl">Орієнтовно, за шкалою 100–200</span><b class="mono">${fmt(mid)}</b><span class="hint">ймовірний діапазон: ${fmt(lo)} — ${fmt(hi)}</span></div>
          <div class="nmt-scalebar" aria-hidden="true"><i style="width:${f.pts / 45 * 100}%"></i></div>
          <ul class="fc-facts"><li>Точність ваших відповідей: <b>${Math.round(f.pr * 100)} %</b> (${f.n} відповідей)</li>
          <li>Тем тренажера з відповідями: <b>${f.covered} з ${T.length}</b>${f.covered < T.length ? " — що більше тем, то точніший прогноз" : ""}</li>
          <li>Якби НМТ було сьогодні з такою точністю: ≈ <b>${Math.round(f.pts)}</b> тестових балів із 45</li></ul>`;
      }
      if (f && f.sims.length) {
        const best = Math.max(...f.sims.map(x => x.s || 0)), last = f.sims[f.sims.length - 1];
        h += `<h3>Ваші симуляції НМТ</h3><p>Найкращий результат: <b>${best || "поріг не подолано"}</b>, останній: <b>${last.s || "поріг не подолано"}</b> (${last.p} тест. балів). Симуляція — найточніший прогноз: вона повторює формат НМТ.</p>`;
      } else h += `<p class="hint">Найточніше покаже <b>симуляція НМТ</b> — 30 завдань за 60 хвилин, як на іспиті.</p>`;
      h += `<p class="hint">Як рахуємо: частку правильних відповідей переводимо в тестові бали (максимум 45) і далі в шкалу 100–200 за офіційною таблицею переведення. Завдання тренажера відрізняються від НМТ, тож це лише орієнтир.</p>
        <div class="task-nav"><button class="btn" data-home-go="nmt">До симуляції НМТ</button><button class="btn" data-pl="plan">Мій план</button></div></section>`;
      return h;
    }

    function badgesHtml() {
      const x = plus(), e = earned(), goal = x.goal.w || 50, wk = weekCount();
      let h = `<section class="card pl-card"><h2>Ціль тижня</h2><p>Цього тижня: <b>${wk}</b> з ${goal} відповідей.</p>
        <div class="bar" aria-hidden="true"><b style="width:${Math.min(100, wk / goal * 100)}%"></b></div>
        <div class="goal-opts" role="group" aria-label="Тижнева ціль">${[30, 50, 100, 200].map(g => `<button class="btn small ${g === goal ? "primary" : ""}" data-goal="${g}" aria-pressed="${g === goal}">${g}</button>`).join("")}</div>
        <p class="hint">Серія зараз: ${streak()} · найдовша: ${bestStreak()} · усього відповідей: ${total()}</p></section>`;
      h += `<section class="badges">${BADGES.map(([id, ic, title, how]) => `<div class="bdg ${e[id] ? "on" : ""}"><span class="bdg-ic" aria-hidden="true">${ic}</span><b>${esc(title)}</b><span class="hint">${esc(how)}${x.badges[id] ? " · " + new Date(x.badges[id]).toLocaleDateString("uk-UA") : ""}</span></div>`).join("")}</section>`;
      return h;
    }

    /* ── Події ── */
    function onClick(b) {
      const d = b.dataset;
      if (d.homeGo) { sess = null; host.setHome(d.homeGo); host.ui.view = "home"; host.render(); window.scrollTo(0, 0); return true; }
      if (d.goal) { plus().goal = { w: +d.goal }; badgeCheck(); host.saveLocal(); host.scheduleSync(); host.render(); return true; }
      if (d.pl === undefined) {
        if (host.ui.view === "plus" && host.ui.pv === "run" && sess && p && !checked && host.trainerInput(b, p)) { host.render(); return true; }
        return false;
      }
      const go = pv => { host.ui.view = "plus"; host.ui.pv = pv; host.render(); window.scrollTo(0, 0); };
      if (d.pl === "home") { sess = null; p = null; host.ui.view = "home"; host.render(); window.scrollTo(0, 0); return true; }
      if (d.pl === "wu") { startWarmup(); return true; }
      if (d.pl === "diag") { go("diag"); return true; }
      if (d.pl === "diag-go") { startDiag(); return true; }
      if (d.pl === "plan" || d.pl === "forecast" || d.pl === "badges") { go(d.pl); return true; }
      if (d.pl === "check" && sess) {
        const it = sess.items[sess.pos], task = it.task, resp = host.trainerResp(task, p), ok = E.check(task, resp), fo = host.focusSince(p.f);
        p.resp = resp; p.ok = ok; checked = true; sess.res.push(ok);
        const x = plus(), s = host.me();
        if (sess.kind === "wu") {
          const cur = x.wu.box[it.key] ? x.wu.box[it.key][0] : 0, nb = ok ? Math.min(5, cur + 1) : 1;
          x.wu.box[it.key] = [nb, today() + (ok ? GAP[nb] : 1)];
          const k = dk(Date.now()); x.wu.done[k] = (x.wu.done[k] || 0) + 1;
          const keys = Object.keys(x.wu.done).sort(); if (keys.length > 120) keys.slice(0, keys.length - 120).forEach(z => { delete x.wu.done[z]; });
        } else {
          x.diag.res[it.key] = ok ? "1" : "0"; x.diag.sec = (x.diag.sec || 0) + fo.sec;
          if (Object.keys(x.diag.res).length >= T.length) { x.diag.done = true; x.diag.at = Date.now(); }
        }
        (s.queue = s.queue || []).push({ id: host.currentKey() + "|" + sess.kind + "|" + it.key + "|" + Date.now(), topic: it.topic, att: 1, n: it.n + 1, type: sess.kind, ok, at: Date.now(),
          q: host.plain(task.q) + (task.big ? " — " + host.plain(task.big) : ""), ans: host.answerText(task, resp), right: host.rightText(task), sec: fo.sec, away: fo.away, ex: fo.ex });
        badgeCheck(); host.saveLocal(); host.scheduleSync(); host.render(); return true;
      }
      if (d.pl === "next" && sess) {
        if (sess.kind === "diag") { const x = plus(), j = sess.items.findIndex((z, k) => k > sess.pos && !x.diag.res[z.key]); sess.pos = j >= 0 ? j : sess.items.length; }
        else sess.pos++;
        p = null; checked = false; host.render(); host.scrollTask(); return true;
      }
      return false;
    }

    return { todayHtml, pageHtml, onClick, countEvents, badgeCheck, streak, weekCount, forecast };
  };
})();
