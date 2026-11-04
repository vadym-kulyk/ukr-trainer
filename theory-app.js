/* «Тренування теорії»: завдання на знання самого правила в кожній темі тренажера.
   Завдання будуємо зі сторінки теорії (theory/<id>.html): гілки ментальної карти, формули правила, кроки алгоритму,
   таблиці, мнемоніки, пастки й «Перевір себе». Тому вони завжди відповідають теорії й не вигадують нового.
   Прогрес — окремо від 100 завдань теми: s.plus.th[topic] = { v: спроба, m: { ключ: "1" | "0" }, ch: { ключ: відповідь } }. */
(function () {
  "use strict";

  window.MGTheory = function (host) {
    const { esc, E } = host;
    const MAX = 30;
    const cache = {};
    let cur = {}, pend = null, wrongMode = {}, pendKey = null;

    /* ── Допоміжне ── */
    const txt = el => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
    const strip = s => s.replace(/\s*\([^)]*\)\s*/g, " ").replace(/\s+/g, " ").trim();
    const uniq = a => [...new Set(a.filter(Boolean))];
    function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
    function oneTask(r, src, q, right, wrong, note, big) {
      const others = E.shuffle(r, uniq(wrong).filter(x => x !== right)).slice(0, 3);
      if (!others.length) return null;
      const opts = E.shuffle(r, [right].concat(others));
      return { t: "one", src, q, big, opts: opts.map(esc), a: opts.indexOf(right), note, key: hash(src + "|" + q + "|" + right) };
    }

    /* ── Побудова завдань зі сторінки теорії ── */
    function build(topicId, html, seed) {
      const doc = new DOMParser().parseFromString("<div>" + html + "</div>", "text/html");
      const root = doc.body.firstElementChild;
      const r = E.rngFrom("th:" + topicId + ":" + seed);
      const pools = {};
      const add = (type, t) => { if (t) (pools[type] = pools[type] || []).push(t); };

      // 1. Ментальна карта: до якої гілки належить приклад; розподіл за гілками; так чи ні.
      const br = [...root.querySelectorAll(".mm-b")].map(b => ({ label: txt(b.querySelector("b")), leaves: [...b.querySelectorAll("li")].map(txt) })).filter(b => b.label && b.leaves.length);
      const labels = br.map(b => b.label);
      if (br.length >= 3) {
        br.forEach((b, i) => {
          const leaf = b.leaves[i % b.leaves.length];
          add("map", oneTask(r, "Ментальна карта", "До якої гілки ментальної карти належить: «" + esc(leaf) + "»?", b.label, labels, "Гілка <b>" + esc(b.label) + "</b>: " + b.leaves.map(esc).join("; ") + "."));
        });
        for (let i = 0; i + 1 < br.length && i < 6; i += 2) {
          const pair = [br[i], br[i + 1]];
          const items = E.shuffle(r, pair.flatMap((b, c) => b.leaves.slice(0, 3).map(l => ({ html: esc(l), c }))));
          if (items.length >= 3) pools.sort = (pools.sort || []).concat([{ t: "sort", src: "Ментальна карта", q: "Розподіліть твердження за гілками ментальної карти.", cats: pair.map(b => esc(b.label)), items,
            note: pair.map(b => "<b>" + esc(b.label) + "</b>: " + b.leaves.map(esc).join("; ")).join(". ") + ".", key: hash("sort|" + pair.map(b => b.label).join("|")) }]);
        }
        E.shuffle(r, br.map((b, i) => i)).slice(0, 4).forEach((i, k) => {
          const b = br[i], truth = k % 2 === 0, other = br[(i + 1 + Math.floor(r() * (br.length - 1))) % br.length];
          const shown = truth ? b : other, leaf = b.leaves[b.leaves.length - 1];
          if (shown === b && !truth) return;
          const opts = ["Так, правильно", "Ні, це інша гілка"];
          add("tf", { t: "one", src: "Ментальна карта", q: "Правда чи ні? «" + esc(leaf) + "» — це гілка «" + esc(shown.label) + "».", opts, a: truth ? 0 : 1,
            note: "«" + esc(leaf) + "» належить до гілки <b>" + esc(b.label) + "</b>.", key: hash("tf|" + leaf + "|" + shown.label) });
        });
      }

      // 2. Формула правила: який результат.
      const rows = [...root.querySelectorAll(".fscheme .frow")].map(f => {
        const res = f.querySelector(".fx.res"); if (!res) return null;
        const parts = [...f.childNodes].filter(n => n.nodeType === 1 && n.tagName !== "EM");
        const idx = parts.indexOf(res);
        return { left: parts.slice(0, idx).map(n => n.tagName === "I" ? " " + txt(n) + " " : "[" + txt(n) + "]").join(""), res: txt(res), ex: txt(f.querySelector("em")) };
      }).filter(Boolean);
      const resAll = uniq(rows.map(x => x.res));
      if (resAll.length >= 2) rows.forEach(x => add("formula", oneTask(r, "Формула правила", "Завершіть формулу правила:", x.res, resAll, x.ex ? "Приклад: <i>" + esc(x.ex) + "</i>." : "", esc(x.left.replace(/\[|\]/g, "")) + " …")));

      // 3. Алгоритм: порядок кроків.
      const steps = [...root.querySelectorAll(".algo li")].map(li => txt(li.querySelector("b"))).filter(s => s && s.length <= 80);
      if (steps.length >= 3) {
        const items = steps.slice(0, 5);
        add("algo", { t: "order", src: "Алгоритм", q: "Розташуйте кроки алгоритму в правильному порядку.", items, note: items.map((s, i) => (i + 1) + ") " + esc(s)).join(" "), key: hash("algo|" + items.join("|")) });
      }

      // 4. «Перевір себе»: чому так пишемо.
      const qz = [...root.querySelectorAll(".quiz details")].map(d => {
        const sum = txt(d.querySelector("summary")), body = d.querySelector("div"); if (!body) return null;
        const word = txt(body.querySelector("b")), full = txt(body), i = full.indexOf("—");
        return word && i > 0 ? { sum, word, why: full.slice(i + 1).trim().replace(/\.$/, "") } : null;
      }).filter(Boolean);
      const whys = uniq(qz.map(x => x.why));
      if (whys.length >= 3) qz.forEach(x => add("why", oneTask(r, "Перевір себе", "«" + esc(x.sum) + "» → <b>" + esc(x.word) + "</b>. Чому?", x.why, whys, "<b>" + esc(x.word) + "</b> — " + esc(x.why) + ".")));

      // 5. Пастки: яке написання правильне.
      [...root.querySelectorAll(".trap .pairs > div")].forEach(d => {
        const bad = strip(txt(d.querySelector("s"))), good = strip(txt(d.querySelector("ins")));
        if (!bad || !good || bad === good) return;
        const opts = E.shuffle(r, [good, bad]);
        add("trap", { t: "one", src: "Пастки НМТ", q: "Яке написання правильне?", opts: opts.map(esc), a: opts.indexOf(good), note: "Правильно: <b>" + esc(txt(d.querySelector("ins"))) + "</b>.", key: hash("trap|" + good) });
      });

      // 6. Мнемоніки: що допомагає запам’ятати.
      const mn = [...root.querySelectorAll(".mnemo")].map(m => {
        const spans = m.querySelectorAll(":scope > span");
        return { title: txt(m.querySelector(":scope > b")), say: txt(m.querySelector(".say")), expl: txt(spans[spans.length - 1]) };
      }).filter(m => m.title && m.expl && m.expl !== m.say);
      const expls = uniq(mn.map(m => m.expl));
      if (expls.length >= 3) mn.forEach(m => add("mnemo", oneTask(r, "Мнемоніка", "Підказка «" + esc(m.title) + "»" + (m.say ? ": <i>" + esc(m.say) + "</i>" : "") + ". Що вона допомагає запам’ятати?", m.expl, expls, "")));

      // 7. Таблиці: відповідність «випадок — приклади».
      [...root.querySelectorAll("table.tbl")].forEach(tb => {
        const trs = [...tb.querySelectorAll("tr")].filter(tr => tr.querySelectorAll("td").length >= 2);
        if (trs.length < 3 || trs.length > 14) return;
        const pairs = []; const seen = new Set();
        // Стовпець із прикладами: «Приклади» або «Неправильно» (у таблицях помилок), інакше — останній.
        const heads = [...tb.querySelectorAll("tr th")].map(txt);
        let col = heads.findIndex(h => /^приклад/i.test(h) || /^неправильно/i.test(h));
        trs.forEach(tr => {
          const td = tr.querySelectorAll("td"), c = col > 0 && col < td.length ? col : td.length - 1;
          const left = txt(td[0]), right = txt(td[c]).split(/[;,]/).slice(0, 2).join(",").trim();
          if (!left || !right || /^[….]/.test(left) || left.length > 70 || seen.has(left) || seen.has(right)) return;
          seen.add(left); seen.add(right); pairs.push([left, right.length > 70 ? right.slice(0, 68) + "…" : right]);
        });
        for (let i = 0; i + 2 < pairs.length + 1 && i < 9; i += 3) {
          const ch = pairs.slice(i, i + 3); if (ch.length < 3) break;
          const right = E.shuffle(r, ch.map((p, k) => ({ html: esc(p[1]), li: k })));
          if (right.every((x, k) => x.li === k)) right.push(right.shift());
          add("table", { t: "match", src: "Таблиця правила", q: heads.length >= 2 ? "Поєднайте: «" + esc(heads[0]) + "» — «" + esc(heads[col > 0 ? col : heads.length - 1]) + "»." : "Поєднайте правило з прикладами.", left: ch.map(p => esc(p[0])), right,
            note: ch.map(p => "<b>" + esc(p[0]) + "</b> — " + esc(p[1])).join("; ") + ".", key: hash("tbl|" + ch.map(p => p[0]).join("|")) });
        }
      });

      // 8. Головне правило: пропущене ключове слово.
      const ruleWords = uniq([...root.querySelectorAll(".rule span b, .fork-b > b")].map(txt).filter(w => w.length <= 30));
      [...root.querySelectorAll(".rule")].slice(0, 2).forEach(rule => {
        const span = rule.querySelector("span"); if (!span) return;
        const bs = [...span.querySelectorAll("b")].filter(b => txt(b).length <= 30);
        if (!bs.length) return;
        const b = bs[Math.floor(r() * bs.length)], word = txt(b), clone = span.cloneNode(true);
        [...clone.querySelectorAll("b")].find(x => txt(x) === word).textContent = "…";
        add("rule", oneTask(r, "Головне правило", "Вставте пропущене слово в головне правило.", word, ruleWords, "", esc(txt(clone))));
      });

      // Перемішуємо типи «по колу», щоб завдання чергувалися.
      const order = ["map", "formula", "why", "trap", "sort", "mnemo", "algo", "table", "tf", "rule"];
      Object.keys(pools).forEach(k => { pools[k] = E.shuffle(r, pools[k]); });
      const out = [], used = new Set();
      for (let round = 0; out.length < MAX; round++) {
        let any = false;
        for (const k of order) {
          const t = (pools[k] || [])[round];
          if (t && !used.has(t.key)) { used.add(t.key); out.push(t); any = true; if (out.length >= MAX) break; }
        }
        if (!any) break;
      }
      out.forEach((t, i) => { t.n = i; });
      return out;
    }

    /* ── Стан ── */
    function st(id) {
      const s = host.me(); if (!s) return { v: 1, m: {}, ch: {} };
      s.plus = s.plus || {}; s.plus.th = s.plus.th || {};
      return s.plus.th[id] || (s.plus.th[id] = { v: 1, m: {}, ch: {} });
    }
    function tasksOf(id) {
      const html = host.theoryOf(id); if (html == null) return null;
      const v = st(id).v, k = id + ":" + v;
      return cache[k] || (cache[k] = build(id, html, v));
    }
    function stats(id) {
      const list = tasksOf(id), m = st(id).m;
      if (!list) { const vals = Object.values(m); return { n: 0, a: vals.length, ok: vals.filter(x => x === "1").length }; }
      let a = 0, ok = 0; list.forEach(t => { if (m[t.key]) { a++; if (m[t.key] === "1") ok++; } });
      return { n: list.length, a, ok };
    }
    function visible(id) {
      const list = tasksOf(id) || [];
      return wrongMode[id] ? list.filter(t => wrongMode[id].has(t.key)) : list;
    }

    /* ── Вигляд ── */
    function pageHtml(t) {
      if (!host.loggedIn()) return host.gateHtml();
      const list = tasksOf(t.id);
      if (list == null) return '<section class="tasks"><p class="empty">Завантажую теорію…</p></section>';
      if (!list.length) return '<section class="tasks"><p class="empty">Для цієї теми ще немає завдань на теорію.</p></section>';
      const s = st(t.id), sm = stats(t.id), vis = visible(t.id);
      let i = cur[t.id] || 0; if (i >= vis.length) i = 0;
      const pct = sm.n ? Math.round(sm.a / sm.n * 100) : 0, cpct = sm.n ? Math.round(sm.ok / sm.n * 100) : 0;
      let h = `<section class="tasks"><div class="tprog th-intro">
        <p class="th-lead">Завдання на саме правило: коли й чому так пишемо. Усі питання — з теорії цієї теми: ментальна карта, формула, алгоритм, мнемоніки й пастки.</p>
        <div class="tprog-top"><span>Виконано <b class="mono">${sm.a}</b> з ${sm.n}</span><span class="score mono">${sm.a ? Math.round(sm.ok / sm.a * 100) : 0}% правильно</span></div>
        <div class="bar" role="progressbar" aria-label="Прогрес тренування теорії" aria-valuemin="0" aria-valuemax="${sm.n}" aria-valuenow="${sm.a}"><b style="width:${pct}%"></b><i style="width:${cpct}%"></i></div>
        ${wrongMode[t.id] ? `<p class="hint">Режим «лише помилки»: ${vis.length} завд. <button class="btn small ghost" data-th="all">Показати всі</button></p>` : ""}</div>`;
      const allDone = vis.every(x => s.m[x.key]);
      if (allDone && !pendKey) {
        const wrong = list.filter(x => s.m[x.key] === "0").length;
        h += `<div class="done-card"><h3 style="font-size:18px">${wrongMode[t.id] ? "Помилки пройдено" : "Тренування теорії завершено"}: ${sm.ok} з ${sm.n}</h3>
          <p style="margin:0">${wrong ? "Перечитайте теорію там, де були помилки, і пройдіть їх ще раз." : "Бездоганно! Правило ви знаєте."}</p>
          <div class="task-nav">${wrong ? `<button class="btn primary" data-th="wrong">Лише помилки (${wrong})</button>` : ""}<button class="btn" data-th="again">Пройти ще раз</button><button class="btn" data-tabto="theory">До теорії</button></div></div>`;
        return h + "</section>";
      }
      h += card(t, vis, i, s);
      h += `<div class="foot-acts"><button class="btn small ghost" data-th="again">Почати тренування заново</button></div>`;
      return h + "</section>";
    }
    function card(t, vis, i, s) {
      const task = vis[i], done = !!s.m[task.key], resp = done ? s.ch[task.key] : undefined;
      if (!pend || pend.key !== task.key) { pend = host.trainerNewPend(task, "th" + t.id); pend.key = task.key; if (!done) pend.f = host.focusMark(); }
      let h = `<article class="task" aria-live="polite"><div class="task-head"><span class="mono">Питання ${i + 1} / ${vis.length}</span><span class="kind">${esc(task.src)}</span></div>
        <h3 class="task-q">${task.q}</h3>${task.big ? `<div class="big">${task.big}</div>` : ""}`;
      h += host.trainerBody(task, done, resp, pend);
      if (done) {
        const ok = s.m[task.key] === "1";
        h += `<div class="fb ${ok ? "good" : "bad"}"><span class="verdict">${ok ? "Правильно!" : "Помилка"}</span>${!ok ? host.correctHtml(task) : ""}${task.note ? `<span>${task.note}</span>` : ""}
          <span><button class="btn small ghost" data-tabto="theory">Перечитати теорію</button></span></div>`;
      }
      const can = !done && host.trainerReady(task, pend);
      h += `<div class="task-nav"><button class="btn" data-th="prev" ${i === 0 ? "disabled" : ""} aria-label="Попереднє питання">←</button>`;
      h += done ? `<button class="btn primary grow" data-th="next">${i < vis.length - 1 ? "Далі →" : "Підсумок"}</button>` : `<button class="btn primary grow" data-th="check" ${can ? "" : "disabled"}>Перевірити</button>`;
      h += `<button class="btn" data-th="skip" ${i === vis.length - 1 ? "disabled" : ""} aria-label="Наступне питання">→</button></div></article>`;
      return h;
    }

    /* ── Події ── */
    function onClick(b) {
      const t = host.ui.view === "topic" && host.ui.tab === "theorytrain" ? host.T.find(x => x.id === host.ui.topic) : null;
      if (!t) return false;
      const d = b.dataset, vis = visible(t.id), s = st(t.id);
      let i = cur[t.id] || 0;
      if (d.th === undefined) {
        if (!pend || !vis[i] || s.m[vis[i].key]) return false;
        if (host.trainerInput(b, pend)) { host.render(); return true; }
        return false;
      }
      if (d.th === "check") {
        const task = vis[i]; if (!task || s.m[task.key]) return true;
        const resp = host.trainerResp(task, pend), ok = E.check(task, resp), fo = host.focusSince(pend && pend.f);
        s.m[task.key] = ok ? "1" : "0"; s.ch[task.key] = resp; pendKey = task.key;
        const me = host.me();
        (me.queue = me.queue || []).push({ id: host.currentKey() + "|th|" + t.id + "|" + s.v + "|" + task.key + "|" + Date.now(), topic: t.id, att: s.v, n: task.n + 1, type: "th", ok, at: Date.now(),
          q: host.plain(task.q) + (task.big ? " — " + host.plain(task.big) : ""), ans: host.answerText(task, resp), right: host.rightText(task), sec: fo.sec, away: fo.away, ex: fo.ex });
        host.saveLocal(); host.scheduleSync(); host.render(); return true;
      }
      if (d.th === "next") { pendKey = null; const nx = vis.findIndex((x, k) => k > i && !s.m[x.key]); cur[t.id] = nx >= 0 ? nx : Math.min(i + 1, vis.length); if (cur[t.id] >= vis.length) cur[t.id] = vis.length - 1; pend = null; host.render(); host.scrollTask(); return true; }
      if (d.th === "prev") { pendKey = null; cur[t.id] = Math.max(0, i - 1); pend = null; host.render(); host.scrollTask(); return true; }
      if (d.th === "skip") { pendKey = null; cur[t.id] = Math.min(vis.length - 1, i + 1); pend = null; host.render(); host.scrollTask(); return true; }
      if (d.th === "again") { s.v = (s.v || 1) + 1; s.m = {}; s.ch = {}; cur[t.id] = 0; wrongMode[t.id] = null; pend = null; pendKey = null; host.saveLocal(); host.scheduleSync(); host.render(); window.scrollTo(0, 0); return true; }
      if (d.th === "wrong") {
        const list = tasksOf(t.id) || [], keys = new Set(list.filter(x => s.m[x.key] === "0").map(x => x.key));
        keys.forEach(k => { delete s.m[k]; delete s.ch[k]; });
        wrongMode[t.id] = keys; cur[t.id] = 0; pend = null; pendKey = null; host.saveLocal(); host.render(); window.scrollTo(0, 0); return true;
      }
      if (d.th === "all") { wrongMode[t.id] = null; cur[t.id] = 0; pend = null; pendKey = null; host.render(); return true; }
      return false;
    }
    /* Позначка після перевірки: щоб картка не перескочила на підсумок, поки учень читає пояснення. */
    function leave() { pendKey = null; pend = null; }

    return { pageHtml, onClick, stats, leave, tasksOf, build };
  };
})();
