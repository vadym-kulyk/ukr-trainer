/* Додаткові розділи адмін-панелі: «Урок наживо», моніторингові роботи, аналіз помилок за правилами,
   динаміка (тиждень до тижня, ефект призначення), розумні призначення, звіт для батьків, тренування й мотивація учня. */
(function () {
  "use strict";

  window.MGAdminPlus = function (h) {
    const { esc, T, SECS, E, N, DAY } = h;
    const ctl = { open: false, id: "", title: "", topics: new Set(), per: 2, min: 30, show: true, due: "", note: "", type: "class", classes: new Set(), keys: new Set(), q: "", iq: "", busy: false };
    let live = null, liveTimer = null, liveBusy = false, parentLinks = {};

    /* ── Допоміжне ── */
    const D = () => h.D(), S = () => h.S();
    const dk = t => h.dayKey(t);
    const weekStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime(); };
    /* Відповіді й правильні за тиждень: dn — { день: [відповідей, правильних] }. back = 0 — цей тиждень. */
    function weekSum(dn, back) {
      const st = weekStart(D().now) - back * 7 * DAY; let n = 0, ok = 0, days = 0;
      for (let i = 0; i < 7; i++) { const x = (dn || {})[dk(st + i * DAY)]; if (x) { n += x[0]; ok += x[1]; days++; } }
      return { n, ok, acc: n ? ok / n : null, days };
    }
    const mergeDn = list => { const o = {}; list.forEach(s => { const dn = (s.act && s.act.dn) || {}; for (const k in dn) { const x = o[k] || (o[k] = [0, 0]); x[0] += dn[k][0]; x[1] += dn[k][1]; } }); return o; };
    const arrow = (a, b, pct) => { if (a == null || b == null) return ""; const d = a - b; if (Math.abs(d) < (pct ? 0.005 : 0.5)) return '<span class="dl eq">→ без змін</span>'; return `<span class="dl ${d > 0 ? "up" : "down"}">${d > 0 ? "▲" : "▼"} ${pct ? Math.abs(Math.round(d * 100)) + " п.п." : Math.abs(Math.round(d))}</span>`; };
    function streakOf(days) {
      if (!days) return 0;
      let n = 0, t = D().now; if (!days[dk(t)]) t -= DAY;
      while (days[dk(t)]) { n++; t -= DAY; }
      return n;
    }

    /* ── Динаміка ── */
    function dynamicsCard(list, title) {
      const dn = mergeDn(list), w0 = weekSum(dn, 0), w1 = weekSum(dn, 1);
      const weeks = []; for (let i = 7; i >= 0; i--) weeks.push(Object.assign({ i, st: weekStart(D().now) - i * 7 * DAY }, weekSum(dn, i)));
      const W = 720, H = 180, pad = 34, bw = (W - pad) / weeks.length, maxN = Math.max(1, ...weeks.map(w => w.n));
      let svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Відповіді й точність по тижнях">`;
      weeks.forEach((w, k) => {
        const x = pad + k * bw, hh = (H - 46) * w.n / maxN;
        svg += `<rect class="b" x="${x + 4}" y="${H - 24 - hh}" width="${bw - 8}" height="${hh}" rx="3"><title>${h.fmtDate(w.st)}: ${w.n} відповідей, точність ${h.pctTxt(w.acc)}</title></rect>`;
        if (w.acc != null) svg += `<circle class="dot" cx="${x + bw / 2}" cy="${H - 24 - (H - 46) * w.acc}" r="5"><title>точність ${h.pctTxt(w.acc)}</title></circle>`;
        svg += `<text x="${x + bw / 2}" y="${H - 4}" text-anchor="middle">${new Date(w.st).getDate()}.${String(new Date(w.st).getMonth() + 1).padStart(2, "0")}</text>`;
      });
      svg += `<text x="2" y="18">${maxN}</text></svg>`;
      return `<div class="card"><h3>${esc(title || "Динаміка")}</h3>
        <div class="kpis">${h.kpi(w0.n + " " + arrow(w0.n, w1.n), "відповідей цього тижня", "минулого: " + w1.n)}${h.kpi(h.pctTxt(w0.acc) + " " + arrow(w0.acc, w1.acc, true), "точність цього тижня", "минулого: " + h.pctTxt(w1.acc))}${h.kpi(w0.days + " " + arrow(w0.days, w1.days), "днів з активністю", "минулого: " + w1.days)}</div>
        ${svg}<p class="hint">Стовпчики — кількість відповідей за тиждень (тренажер і ЗНО), точки — точність. Наведіть на стовпчик, щоб побачити число.</p></div>`;
    }
    /* Ефект призначення: точність у темах призначення до й після його створення (лише тренажер і ЗНО). */
    function assignEffect(a, rec) {
      const ids = a.items.filter(c => c[0] === "t" || c[0] === "z").map(c => c.slice(2)), cut = dk(a.at);
      if (!ids.length) return "";
      let b = [0, 0], f = [0, 0];
      rec.forEach(s => { const tp = (s.act && s.act.tp) || {}; ids.forEach(id => { const x = tp[id] || {}; for (const k in x) { const z = k < cut ? b : f; z[0] += x[k][0]; z[1] += x[k][1]; } }); });
      if (!b[0] && !f[0]) return "";
      return h.kpi(`${b[0] ? h.pctTxt(b[1] / b[0]) : "—"} → ${f[0] ? h.pctTxt(f[1] / f[0]) : "—"}`, "точність у темах: до → після", `відповідей: ${b[0]} → ${f[0]}`);
    }

    /* ── Розумні призначення ── */
    function suggestions() {
      const list = S(), byCls = {};
      list.forEach(s => { (byCls[s.cls] = byCls[s.cls] || []).push(s); });
      const out = [];
      Object.keys(byCls).forEach(cls => {
        T.forEach(t => {
          const weak = byCls[cls].filter(s => { const x = s.tt[t.id]; return x && x.a >= 10 && x.c / x.a < 0.5; });
          const diag = byCls[cls].filter(s => { const dg = s.plus && s.plus.diag; const x = s.tt[t.id]; return dg && dg.res && dg.res[t.id] === "0" && !(x && x.a >= 10) && !weak.includes(s); });
          const who = weak.concat(diag);
          if (who.length >= 2 || (who.length && byCls[cls].length <= 3)) {
            const already = D().assign.some(a => a.items.includes("t:" + t.id) && a.at > D().now - 14 * DAY && who.every(s => h.addressed(a.code, s)));
            if (!already) out.push({ cls, t, weak, diag, who });
          }
        });
      });
      return out.sort((a, b) => b.who.length - a.who.length).slice(0, 12);
    }
    function suggestionsHtml(limit) {
      const sg = suggestions().slice(0, limit || 12);
      if (!sg.length) return limit ? "" : '<div class="card"><h3>💡 Розумні призначення</h3><p class="empty">Зараз нема тем, які варто призначити: немає груп учнів із точністю нижче 50 % (від 10 відповідей) чи помилками в діагностиці.</p></div>';
      return `<div class="card"><h3>💡 Розумні призначення</h3><p class="hint">Панель шукає учнів, яким тема дається важко: точність нижче 50 % (від 10 відповідей) або помилка в діагностиці, якщо тему ще не проходили.</p>
        <div class="list">${sg.map((x, i) => `<div class="item sg"><div class="meta"><b>${esc(x.cls)}: ${esc(x.t.title)}</b><span class="tag red">${x.who.length} учн.</span></div>
          <div class="text">${x.weak.length ? `Точність нижче 50 %: ${x.weak.map(s => esc(s.name) + " (" + h.pctTxt(s.tt[x.t.id].c / s.tt[x.t.id].a) + ")").join(", ")}. ` : ""}${x.diag.length ? `Помилка в діагностиці: ${x.diag.map(s => esc(s.name)).join(", ")}.` : ""}</div>
          <div><button class="btn sm primary" data-sgi="${i}">Призначити цим учням</button></div></div>`).join("")}</div></div>`;
    }

    /* ── Аналіз за правилами ── */
    function ruleRows(list) {
      const st = h.trainerTaskStats(list), rows = {};
      T.forEach(t => {
        const tasks = h.trainerTasks(t.id), grp = t.groups || {};
        tasks.forEach((task, i) => {
          const x = st[t.id][i]; if (!x.a || !task.src || !task.src.length) return;
          const wgt = 1 / task.src.length;
          task.src.forEach(sr => {
            const g = grp[sr.g] || {}, cats = g.cats || g.fills, cat = cats && cats[sr.c] != null ? cats[sr.c] : null;
            const rule = (g.rule || g.ask || t.title).replace(/<[^>]+>/g, "");
            const key = t.id + "|" + rule + "|" + (cat || "");
            const r = rows[key] || (rows[key] = { t, rule, cat, a: 0, w: 0, ex: new Set() });
            r.a += x.a * wgt; r.w += x.w * wgt; if (r.ex.size < 6 && sr.w) r.ex.add(sr.w);
          });
        });
      });
      return Object.values(rows).filter(r => r.a >= 1).map(r => Object.assign(r, { e: r.w / r.a }));
    }
    function rulesPage() {
      const rows = ruleRows(S()), ui = h.ui;
      const topicSel = `<label class="row small"><span class="muted">Тема:</span><select class="input" id="rltopic"><option value="">усі теми</option>${T.map(t => `<option value="${t.id}" ${ui.ruleTopic === t.id ? "selected" : ""}>${esc(t.title)}</option>`).join("")}</select></label>`;
      const list = rows.filter(r => (!ui.ruleTopic || r.t.id === ui.ruleTopic) && r.a >= (ui.ruleMin || 3));
      return `<div class="stack"><div class="card"><h3>Найпроблемніші правила</h3><p class="hint">Кожне завдання тренажера побудоване на конкретному правилі (група прикладів у темі). Тут помилки учнів зведено за правилами, а не за окремими завданнями. Якщо в завданні кілька слів із різних правил, відповідь розподіляємо між ними порівну.</p>
        <div class="row">${topicSel}<label class="row small"><span class="muted">Мінімум відповідей:</span><select class="input" id="rlmin">${[1, 3, 5, 10, 20].map(v => `<option ${(ui.ruleMin || 3) === v ? "selected" : ""}>${v}</option>`).join("")}</select></label></div></div>
        ${h.table("rules", [
          { k: "t", t: "Тема", v: r => r.t.title, h: r => `<a href="#topic/t:${r.t.id}">${esc(r.t.title)}</a>` },
          { k: "r", t: "Правило", v: r => r.rule, wrap: 1, h: r => esc(r.rule) + (r.cat ? ` <span class="tag violet">${esc(r.cat)}</span>` : "") + (r.ex.size ? `<div class="hint">приклади: ${[...r.ex].map(esc).join(", ")}</div>` : "") },
          { k: "a", t: "Відповідей", num: 1, v: r => Math.round(r.a), h: r => Math.round(r.a) },
          { k: "e", t: "Помилок", v: r => r.e, h: r => h.cellBar(1 - r.e, h.pctTxt(r.e)) }], list, { sort: { k: "e", d: -1 }, empty: "Ще замало відповідей." })}
        <p class="hint">Теми без поділу на правила (наголос, звуки, лексика) показано в розділі «Завдання».</p></div>`;
    }
    function topRulesHtml(n) {
      const rows = ruleRows(S()).filter(r => r.a >= 5).sort((a, b) => b.e - a.e).slice(0, n || 5);
      if (!rows.length) return "";
      return `<div class="card"><div class="row"><h3>Найпроблемніші правила</h3><span class="spacer"></span><a href="#rules">Усі →</a></div><div class="list">${rows.map(r => `<div class="item"><div class="meta"><b>${esc(r.t.title)}</b><span class="tag red">${h.pctTxt(r.e)} помилок</span><span>${Math.round(r.a)} відп.</span></div><div class="text">${esc(r.rule)}${r.cat ? " → «" + esc(r.cat) + "»" : ""}</div></div>`).join("")}</div></div>`;
    }

    /* ── Урок наживо: таблиця «учні × завдання» ── */
    const LV = { min: 20, grp: "", sort: "att", open: null, proj: false };
    const SIDE = ["тренування теорії", "щоденна розминка", "діагностика", "моніторингова робота", "робота над помилками", "НМТ: симуляція"];
    async function pollLive() {
      if (liveBusy) return; liveBusy = true;
      const d = await h.api({ action: "admin_live", min: LV.min }); liveBusy = false;
      if (d && d.ok) { live = d; if (h.route()[0] === "live") liveRender(); }
    }
    /* Перемальовуємо, не скидаючи прокрутку таблиці й відкритого завдання. */
    function liveRender() {
      const w = document.querySelector(".lg-wrap"), m = document.querySelector(".lmodal-box");
      const sx = w ? w.scrollLeft : 0, sy = m ? m.scrollTop : 0;
      h.render.keepScroll = true; h.render();
      const w2 = document.querySelector(".lg-wrap"), m2 = document.querySelector(".lmodal-box");
      if (w2) w2.scrollLeft = sx; if (m2) m2.scrollTop = sy;
    }
    function liveStart() { if (!liveTimer) { pollLive(); liveTimer = setInterval(() => { if (h.route()[0] !== "live") { clearInterval(liveTimer); liveTimer = null; return; } if (!document.hidden) pollLive(); }, 20000); } }
    document.addEventListener("keydown", e => {
      if (!LV.open || h.route()[0] !== "live") return;
      if (e.key === "Escape") { LV.open = null; liveRender(); }
      else if ((e.key === "ArrowRight" || e.key === "ArrowLeft") && !/INPUT|SELECT|TEXTAREA/.test((e.target.tagName || ""))) liveStep(e.key === "ArrowRight" ? 1 : -1);
    });

    /* Групи = тема (+ окремий вид роботи: тренування теорії, розминка…). У кожній — стовпці-завдання й клітинки учнів. */
    function liveModel() {
      const now = live.now, cls = h.ui.cls, G = {};
      const students = live.list.filter(x => !cls || x.cls === cls).map(x => {
        let tailWrong = 0; for (let i = x.seq.length - 1; i >= 0 && !x.seq[i]; i--) tailWrong++;
        const idle = now - x.last, status = idle < 2 * 60000 ? "on" : idle < 8 * 60000 ? "idle" : "off";
        const flags = [];
        if (tailWrong >= 3) flags.push("застряг: " + tailWrong + " помилки поспіль");
        if (x.ex >= 3) flags.push("виходи зі сторінки: " + x.ex);
        if (x.n >= 6 && x.ok / x.n < 0.4) flags.push("низька точність");
        return Object.assign({}, x, { status, flags, idle });
      });
      students.forEach(x => (x.ev || []).slice().sort((p, q) => p[0] - q[0]).forEach(([t, ti, n, yi, ok, ans]) => {
        const title = live.tp[ti] || "", type = live.ty[yi] || "", side = SIDE.includes(type);
        const gk = title + (side ? " · " + type : "");
        const g = G[gk] || (G[gk] = { key: gk, title, side: side ? type : "", cols: {}, rows: {}, last: 0, recent: new Set() });
        g.last = Math.max(g.last, t); if (now - t < 5 * 60000) g.recent.add(x.name);
        if (!n) return;
        const c = g.cols[n] || (g.cols[n] = { n, ti, yi, ok: 0, no: 0 });
        const r = g.rows[x.name] || (g.rows[x.name] = { s: x, cells: {}, ok: 0, a: 0, last: 0 });
        const prev = r.cells[n];
        if (prev) { if (prev.ok) c.ok--; else c.no--; r.a--; if (prev.ok) r.ok--; }
        r.cells[n] = { ok, ans, t, tries: prev ? prev.tries + 1 : 1, first: prev ? prev.first : ok };
        if (ok) c.ok++; else c.no++; r.a++; if (ok) r.ok++; r.last = Math.max(r.last, t);
      }));
      const groups = Object.values(G).filter(g => Object.keys(g.cols).length).sort((a, b) => b.recent.size - a.recent.size || Object.keys(b.rows).length - Object.keys(a.rows).length || b.last - a.last);
      return { students, groups };
    }
    /* Як відкрити завдання: тренажер — з рушія, ЗНО — з файлу теми, решта — текст із журналу. */
    function liveTask(g, n) {
      const c = g.cols[n], q = live.qs[c.ti + "|" + c.yi + "|" + n] || ["", ""];
      const id = (live.tid || [])[c.ti] || "";
      if (!g.side && id.startsWith("t:")) { const task = h.trainerTasks(id.slice(2))[n - 1]; if (task) return h.trainerTaskHtml(task); }
      if (!g.side && id.startsWith("z:")) { const d = h.znoData(id.slice(2)); if (!d) return '<p class="hint">Завантажую завдання…</p>'; if (d.tasks[n - 1]) return h.znoTaskHtml(d.tasks[n - 1]); }
      return `<div class="q">${esc(q[0] || "Текст завдання не збережено")}</div>${q[1] ? `<p>Правильна відповідь: <span class="ok">${esc(q[1])}</span></p>` : ""}`;
    }
    function liveCurGroup() { const M = liveModel(); const g = M.groups.find(x => x.key === LV.grp) || M.groups[0]; return g ? g.key : ""; }
    function liveStep(dir) {
      if (!LV.open || !live) return;
      const g = liveModel().groups.find(x => x.key === LV.open.g); if (!g) return;
      const ns = Object.keys(g.cols).map(Number).sort((a, b) => a - b), i = ns.indexOf(LV.open.n) + dir;
      if (i >= 0 && i < ns.length) { LV.open = { g: g.key, n: ns[i], who: "" }; LV.reveal = false; liveRender(); const m = document.querySelector(".lmodal-box"); if (m) m.scrollTop = 0; }
    }
    function liveModal(g) {
      const n = LV.open.n, c = g.cols[n]; if (!c) return "";
      const ns = Object.keys(g.cols).map(Number).sort((a, b) => a - b), i = ns.indexOf(n);
      const rows = Object.values(g.rows), done = rows.filter(r => r.cells[n]);
      const right = done.filter(r => r.cells[n].ok), wrong = done.filter(r => !r.cells[n].ok);
      const byAns = {}; wrong.forEach(r => { const a = r.cells[n].ans || "без відповіді"; (byAns[a] = byAns[a] || []).push(r.s.name); });
      const fixed = right.filter(r => r.cells[n].tries > 1 && !r.cells[n].first);
      const who = LV.open.who && g.rows[LV.open.who];
      const nm = s => LV.proj ? "" : esc(s);
      return `<div class="lmodal${LV.proj ? " proj" : ""}" role="dialog" aria-modal="true" aria-label="Завдання №${n}">
        <button class="lmodal-bg" data-lgclose="1" aria-label="Закрити"></button>
        <div class="lmodal-box">
          <div class="row lm-head"><b>${esc(g.title)}${g.side ? ` <span class="muted">· ${esc(g.side)}</span>` : ""} · №${n}</b><span class="spacer"></span>
            <button class="btn sm" data-lgstep="-1" ${i > 0 ? "" : "disabled"} aria-label="Попереднє завдання">←</button>
            <button class="btn sm" data-lgstep="1" ${i < ns.length - 1 ? "" : "disabled"} aria-label="Наступне завдання">→</button>
            <button class="btn sm ${LV.proj ? "primary" : ""}" data-lgproj="1" title="Для показу на екрані: великий шрифт, без імен">🖥 Показ класу</button>
            <button class="btn sm" data-lgclose="1" aria-label="Закрити">✕</button></div>
          ${who && who.cells[n] && !LV.proj ? `<div class="lm-who ${who.cells[n].ok ? "ok" : "no"}">${esc(who.s.name)}: ${who.cells[n].ok ? "✓ правильно" : "✗ відповідь «" + esc(who.cells[n].ans || "—") + "»"}${who.cells[n].tries > 1 ? ` <span class="muted">(спроб: ${who.cells[n].tries})</span>` : ""}</div>` : ""}
          <div class="task-view${LV.proj && !LV.reveal ? " hide-ans" : ""}">${liveTask(g, n).replace(/ ✓/g, '<span class="okm"> ✓</span>')}</div>
          ${LV.proj ? `<div class="row"><button class="btn sm ${LV.reveal ? "" : "primary"}" data-lgreveal="1">${LV.reveal ? "Сховати відповідь" : "👁 Показати відповідь"}</button></div>` : ""}
          <div class="lm-stat"><span class="tag green">✓ ${right.length}</span><span class="tag red">✗ ${wrong.length}</span><span class="tag">ще не відповіли: ${Math.max(0, rows.length - done.length)}</span></div>
          ${wrong.length && (!LV.proj || LV.reveal) ? `<div><h4>Хибні відповіді</h4><div class="list">${Object.entries(byAns).sort((a, b) => b[1].length - a[1].length).map(([a, ws]) => `<div class="item"><div><b>«${esc(a)}»</b> <span class="tag red">${ws.length}</span></div>${LV.proj ? "" : `<div class="small muted">${ws.map(esc).join(", ")}</div>`}</div>`).join("")}</div></div>` : ""}
          ${!LV.proj && right.length ? `<p class="small"><b>Правильно:</b> ${right.map(r => nm(r.s.name) + (fixed.includes(r) ? " (з другої спроби)" : "")).join(", ")}</p>` : ""}
          ${!LV.proj && wrong.some(r => r.s.key) ? `<div class="row"><button class="btn sm" data-lgmsg="1">✉ Написати тим, хто помилився (${wrong.filter(r => r.s.key).length})</button></div>` : ""}
          <p class="hint lm-keys">Стрілки ← → на клавіатурі гортають завдання, Esc закриває.</p>
        </div></div>`;
    }
    function livePage() {
      liveStart();
      if (!live) return '<div class="loading">Завантажую, хто зараз працює…</div>';
      const now = live.now, M = liveModel(), students = M.students;
      const g = M.groups.find(x => x.key === LV.grp) || M.groups[0];
      const running = live.running.filter(r => { const s = D().students.find(z => z.key === r.key); return !h.ui.cls || (s && s.cls === h.ui.cls); });
      const onNow = students.filter(r => r.status === "on").length, attn = students.filter(r => r.flags.length).length;
      let out = `<div class="stack"><div class="card"><div class="row"><h3>🔴 Урок наживо</h3><span class="spacer"></span>
        <label class="row small"><span class="muted">за</span><select class="input" id="lvmin" style="width:auto">${[20, 45, 90].map(m => `<option value="${m}" ${LV.min === m ? "selected" : ""}>${m} хв</option>`).join("")}</select></label>
        <span class="hint">оновлено ${h.fmtDT(now)} · кожні 20 с</span><button class="btn sm" data-act="live-now" aria-label="Оновити">↻</button></div>
        <div class="kpis">${h.kpi(onNow + " / " + students.length, "учнів онлайн", "відповідали за 2 хв")}${h.kpi(attn, "потребують уваги")}${h.kpi(running.length, "пишуть моніторингову")}</div></div>`;
      if (running.length) out += `<div class="card"><h3>📝 Пишуть моніторингову роботу</h3><div class="chips">${running.map(r => { const t = live.tests.find(z => z.id === r.id); const left = t ? Math.round((r.started + t.min * 60000 - now) / 60000) : null; return `<span class="tag ${left != null && left < 0 ? "red" : "violet"}">${esc(r.name)} · ${esc(t ? t.title : "")} · ${left == null ? "" : left >= 0 ? "залишилось " + left + " хв" : "час вийшов"}</span>`; }).join("")}</div></div>`;
      if (!g) return out + `<div class="card"><p class="empty">За останні ${LV.min} хвилин ніхто не відповідав.</p></div></div>`;
      out += `<div class="card"><div class="chips lg-groups" role="tablist">${M.groups.map(x => `<button class="${x === g ? "on" : ""}" data-lggrp="${esc(x.key)}">${esc(x.title)}${x.side ? ` · ${esc(x.side)}` : ""} <span class="lg-cnt">${Object.keys(x.rows).length}</span></button>`).join("")}</div>`;
      const ns = Object.keys(g.cols).map(Number).sort((a, b) => a - b);
      const rows = Object.values(g.rows).sort(LV.sort === "name" ? (a, b) => a.s.name.localeCompare(b.s.name, "uk")
        : LV.sort === "pct" ? (a, b) => a.ok / a.a - b.ok / b.a || a.s.name.localeCompare(b.s.name, "uk")
        : (a, b) => b.s.flags.length - a.s.flags.length || a.ok / a.a - b.ok / b.a);
      const short = nm => h.ui.cls ? nm.replace(/ \([^)]*\)$/, "") : nm;
      const pc = r => Math.round(r.ok / r.a * 100), band = p => p >= 75 ? "hi" : p >= 50 ? "mid" : "lo";
      out += `<div class="row lg-tools"><div class="seg">${[["att", "Увага"], ["name", "Ім’я"], ["pct", "Результат"]].map(([k, l]) => `<button class="${LV.sort === k ? "on" : ""}" data-lgsort="${k}">${l}</button>`).join("")}</div>
        <span class="hint">Натисніть номер завдання, щоб відкрити його й пояснити класу; клітинку — щоб побачити відповідь учня.</span></div>
        <div class="lg-wrap"><table class="lg"><thead><tr><th class="lg-nm" scope="col">Учень</th><th class="lg-pc" scope="col">%</th>
        ${ns.map(n => { const c = g.cols[n], all = c.ok + c.no; return `<th scope="col"><button class="lg-h" data-lgopen="${n}" title="Відкрити завдання №${n}"><span>${n}</span><span class="lg-hs ${c.no > c.ok ? "no" : ""}">${c.ok}/${all}</span></button></th>`; }).join("")}</tr></thead><tbody>
        ${rows.map(r => { const p = pc(r); return `<tr><th class="lg-nm" scope="row"><span class="ldot ${r.s.status}" aria-hidden="true"></span>${r.s.key ? `<a href="#student/${encodeURIComponent(r.s.key)}" title="${esc(r.s.name)}">${esc(short(r.s.name))}</a>` : esc(short(r.s.name))}${r.s.flags.length ? ` <span class="lg-flag" title="${esc(r.s.flags.join("; "))}">⚠</span>` : ""}</th>
          <td class="lg-pc ${band(p)}">${p}%</td>
          ${ns.map(n => { const c = r.cells[n]; return c ? `<td class="${c.ok ? "c1" : "c0"}"><button data-lgcell="${n}" data-lgwho="${esc(r.s.name)}" aria-label="${esc(r.s.name)}, завдання ${n}: ${c.ok ? "правильно" : "помилка"}">${c.ok ? "✓" : "✗"}${c.tries > 1 ? `<sup>${c.tries}</sup>` : ""}</button></td>` : `<td class="ce"></td>`; }).join("")}</tr>`; }).join("")}
        </tbody></table></div>`;
      const elsewhere = students.filter(s => !g.rows[s.name]);
      if (elsewhere.length) out += `<p class="small muted">Працюють над іншим: ${elsewhere.map(s => `${esc(s.name)} — ${esc(s.topic)}`).join("; ")}</p>`;
      const flagged = students.filter(s => s.flags.length);
      if (flagged.length) out += `<div class="chips">${flagged.map(s => `<span class="tag red">${esc(s.name)}: ${esc(s.flags.join(", "))}</span>`).join("")}</div>`;
      out += `</div>`;
      if (LV.open && LV.open.g === g.key) out += liveModal(g);
      return out + "</div>";
    }
    /* ── Моніторингові роботи ── */
    const resultsOf = id => (D().tresults || []).filter(r => r.id === id);
    function testsPage() {
      let out = `<div class="stack">`;
      out += ctl.open ? ctlForm() : `<div><button class="btn primary" data-act="ctl-new">+ Нова моніторингова робота</button></div>`;
      const list = (D().tests || []).slice().sort((a, b) => b.at - a.at);
      if (!list.length && !ctl.open) out += `<div class="card"><p class="empty">Моніторингових робіт ще немає. Створіть моніторингову роботу: оберіть теми, кількість завдань і час. Учні побачать її на головній сторінці тренажера.</p></div>`;
      list.forEach(t => {
        const rec = h.all().filter(s => h.addressed(t.code, s) && (!h.ui.cls || s.cls === h.ui.cls)), res = resultsOf(t.id), done = res.filter(r => r.done && rec.some(s => s.key === r.key));
        const avg = done.length ? done.reduce((a, r) => a + r.score / (r.max || 1), 0) / done.length : null;
        out += `<div class="card"><div class="row"><h3><a href="#test/${encodeURIComponent(t.id)}">${esc(t.title)}</a></h3><span class="tag">${esc(t.toLabel)}</span><span class="tag violet">${t.items.length} завд. · ${t.min} хв</span>${t.due ? `<span class="tag ${t.due < D().now ? "red" : ""}">до ${h.fmtDate(t.due)}</span>` : ""}<span class="spacer"></span>
          <a class="btn sm" href="#test/${encodeURIComponent(t.id)}">Результати</a><button class="btn sm danger" data-ctldel="${esc(t.id)}">Видалити</button></div>
          <div class="kpis">${h.kpi(done.length + " з " + rec.length, "здали")}${h.kpi(h.pctTxt(avg), "середній результат")}${h.kpi(res.filter(r => !r.done).length, "почали, але не здали")}</div></div>`;
      });
      return out + "</div>";
    }
    function ctlForm() {
      const iq = ctl.iq.toLowerCase();
      let pick = "";
      SECS.forEach(sec => {
        const rows = T.filter(t => t.sec === sec.id && (!iq || t.title.toLowerCase().includes(iq))).map(t => `<label class="check"><input type="checkbox" data-ctltopic="${t.id}" ${ctl.topics.has(t.id) ? "checked" : ""}> ${esc(t.title)}</label>`).join("");
        if (rows) pick += `<div class="grp">${esc(sec.id)} ${esc(sec.title)}</div>${rows}`;
      });
      const n = ctl.topics.size * ctl.per;
      return `<div class="card"><h3>Нова моніторингова робота</h3>
        <label class="field"><span>Назва</span><input class="input" id="ktitle" maxlength="120" placeholder="Напр.: Моніторингова робота «Не з різними частинами мови»" value="${esc(ctl.title)}"></label>
        <div class="field"><span>Теми тренажера (вибрано: ${ctl.topics.size})</span><input class="input" id="kiq" placeholder="Пошук теми" value="${esc(ctl.iq)}"><div class="picker">${pick || '<span class="hint">Нічого не знайдено.</span>'}</div></div>
        <div class="row"><label class="field"><span>Завдань з кожної теми</span><select class="input" id="kper">${[1, 2, 3, 4, 5, 6, 8, 10].map(v => `<option ${ctl.per === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
          <label class="field"><span>Час, хвилин</span><input class="input" type="number" id="kmin" min="1" max="240" value="${ctl.min}"></label>
          <label class="field"><span>Термін</span><input class="input" type="date" id="kdue" value="${esc(ctl.due)}"></label></div>
        <label class="check"><input type="checkbox" id="kshow" ${ctl.show ? "checked" : ""}> Показати учням правильні відповіді після здачі</label>
        ${h.recipientsHtml(ctl, "k")}
        <label class="field"><span>Примітка для учнів</span><textarea class="input" id="knote" maxlength="1000" style="min-height:60px">${esc(ctl.note)}</textarea></label>
        <p class="hint">Разом: <b>${n}</b> завдань. Завдання вибираються випадково з тем і однакові для всіх учнів. Оцінка — за 12-бальною шкалою пропорційно до правильних відповідей.</p>
        <div class="row"><button class="btn primary" data-act="ctl-save" ${ctl.busy ? "disabled" : ""}>${ctl.busy ? "Зберігаю…" : "Зберегти й надіслати"}</button><button class="btn" data-act="ctl-cancel">Скасувати</button></div></div>`;
    }
    function testPage(id) {
      const t = (D().tests || []).find(x => x.id === id);
      if (!t) return `<div class="card"><p>Моніторингову роботу не знайдено.</p><a href="#tests">← До моніторингових робіт</a></div>`;
      const rec = h.all().filter(s => h.addressed(t.code, s) && (!h.ui.cls || s.cls === h.ui.cls)), res = resultsOf(id);
      const rows = rec.map(s => ({ s, r: res.find(x => x.key === s.key) || null }));
      const done = rows.filter(x => x.r && x.r.done);
      const avg = done.length ? done.reduce((a, x) => a + x.r.score / (x.r.max || 1), 0) / done.length : null;
      const avgG = done.length ? done.reduce((a, x) => a + x.r.grade, 0) / done.length : null;
      const avgT = done.length ? done.reduce((a, x) => a + (x.r.done - x.r.started), 0) / done.length / 60000 : null;
      let out = `<div class="stack"><div class="crumbs"><a href="#tests">← Моніторингові роботи</a></div><div class="card"><div class="row"><h2>${esc(t.title)}</h2><span class="tag">${esc(t.toLabel)}</span><span class="tag violet">${t.items.length} завд. · ${t.min} хв</span><span class="spacer"></span><button class="btn sm noprint" data-act="ctl-csv" data-id="${esc(t.id)}">⬇ CSV</button><button class="btn sm noprint" data-act="print">🖨 Друк</button></div>
        <div class="kpis">${h.kpi(done.length + " з " + rec.length, "здали")}${h.kpi(h.pctTxt(avg), "середній результат")}${h.kpi(avgG == null ? "—" : avgG.toFixed(1).replace(".", ","), "середня оцінка")}${h.kpi(avgT == null ? "—" : Math.round(avgT) + " хв", "середній час")}</div></div>`;
      out += `<div class="card"><h3>Результати</h3>${h.table("ctl-" + t.id, [
        { k: "n", t: "Учень", v: x => x.s.name, h: x => h.nameLink(x.s) }, { k: "c", t: "Клас", v: x => x.s.cls },
        { k: "st", t: "Стан", v: x => x.r ? (x.r.done ? 2 : 1) : 0, h: x => x.r ? (x.r.done ? `<span class="tag green">здано</span>${x.r.late ? ' <span class="tag red">запізнення</span>' : ""}` : '<span class="tag red">почав, не здав</span>') : '<span class="tag">не починав</span>' },
        { k: "sc", t: "Бали", num: 1, v: x => x.r && x.r.done ? x.r.score : null, h: x => x.r && x.r.done ? x.r.score + "/" + x.r.max : "—" },
        { k: "p", t: "%", v: x => x.r && x.r.done ? x.r.score / (x.r.max || 1) : null, h: x => x.r && x.r.done ? h.cellBar(x.r.score / (x.r.max || 1)) : "—" },
        { k: "g", t: "Оцінка", num: 1, v: x => x.r && x.r.done ? x.r.grade : null, h: x => x.r && x.r.done ? "<b>" + x.r.grade + "</b>" : "—" },
        { k: "tm", t: "Час", num: 1, v: x => x.r && x.r.done ? x.r.done - x.r.started : null, h: x => x.r && x.r.done ? Math.round((x.r.done - x.r.started) / 60000) + " хв" : "—" },
        { k: "ex", t: "Виходів", num: 1, v: x => x.r ? x.r.ex : null, h: x => x.r && x.r.done ? (x.r.ex ? `<span class="${x.r.ex >= 3 ? "err" : ""}">${x.r.ex}</span>` : "0") : "—" },
        { k: "a", t: "", v: null, h: x => x.r ? `<button class="btn sm" data-ctlreset="${esc(t.id)}|${esc(x.s.key)}" title="Дозволити пройти ще раз">Скинути спробу</button>` : "" }], rows, { sort: { k: "p", d: -1 } })}</div>`;
      // Складність кожного завдання.
      const items = t.items.map((it, i) => { const okN = done.filter(x => x.r.okStr[i] === "1").length; return { it, i, okN, acc: done.length ? okN / done.length : null }; });
      out += `<div class="card"><h3>Завдання моніторингової роботи</h3><p class="hint">Частка учнів, які розв’язали завдання правильно. Розгорніть, щоб побачити текст і відповідь.</p>
        ${items.slice().sort((a, b) => (a.acc ?? 2) - (b.acc ?? 2)).map(x => { const task = h.trainerTasks(x.it[0])[x.it[1]]; return `<details class="more"><summary><b>№${x.i + 1}</b> · ${esc(h.topicTitle(x.it[0]))} · завдання ${x.it[1] + 1} — ${x.acc == null ? "ще немає відповідей" : h.pctTxt(x.acc) + " правильно"}</summary>${task ? h.trainerTaskHtml(task) : ""}</details>`; }).join("")}</div>`;
      return out + "</div>";
    }

    /* ── Картки на сторінці учня ── */
    function studentCards(s) {
      const p = s.plus || {}, th = p.th || {}, diag = p.diag;
      let out = dynamicsCard([s], "Динаміка: тиждень до тижня");
      const thRows = T.map(t => ({ t, x: th[t.id] })).filter(r => r.x && r.x[0]);
      const st = streakOf(p.days), goal = p.goal && p.goal.w;
      const wk = (() => { let n = 0; const ws = weekStart(D().now); for (let i = 0; i < 7; i++) n += (p.days || {})[dk(ws + i * DAY)] || 0; return n; })();
      out += `<div class="card"><h3>Тренування, мотивація, діагностика</h3><div class="kpis">${h.kpi("🔥 " + st, "днів поспіль")}${h.kpi(goal ? wk + " / " + goal : "—", "ціль тижня")}${h.kpi(p.badges ? Object.keys(p.badges).length : 0, "нагород")}
        ${h.kpi(diag && diag.res ? Object.values(diag.res).filter(v => v === "1").length + " / " + Object.keys(diag.res).length : "—", "діагностика", diag && diag.done ? "пройдено " + h.fmtDate(diag.at) : diag ? "не завершено" : "не проходив")}
        ${h.kpi(p.wu ? p.wu.n : 0, "завдань у розминці", p.wu && p.wu.done ? "днів розминки: " + Object.keys(p.wu.done).length : "")}${h.kpi(s.act && s.act.xs ? (s.act.xs["тренування теорії"] || 0) : 0, "відповідей у тренуванні теорії")}</div>
        ${diag && diag.res ? `<details class="more"><summary>Помилки в діагностиці (${Object.values(diag.res).filter(v => v === "0").length})</summary><div class="chips">${T.filter(t => diag.res[t.id] === "0").map(t => `<span class="tag red">${esc(t.title)}</span>`).join("") || '<span class="hint">Без помилок.</span>'}</div></details>` : ""}
        ${thRows.length ? `<details class="more"><summary>Тренування теорії за темами (${thRows.length})</summary>${h.table("th-" + s.key, [{ k: "t", t: "Тема", v: r => r.t.title }, { k: "a", t: "Відповідей", num: 1, v: r => r.x[0], h: r => r.x[0] }, { k: "c", t: "Правильно", v: r => r.x[1] / r.x[0], h: r => h.cellBar(r.x[1] / r.x[0]) }], thRows)}</details>` : ""}</div>`;
      const ctlRes = (D().tresults || []).filter(r => r.key === s.key && r.done);
      if (ctlRes.length) out += `<div class="card"><h3>Моніторингові роботи</h3>${h.table("sctl-" + s.key, [
        { k: "t", t: "Моніторингова робота", v: r => { const t = (D().tests || []).find(z => z.id === r.id); return t ? t.title : "—"; }, h: r => { const t = (D().tests || []).find(z => z.id === r.id); return t ? `<a href="#test/${encodeURIComponent(t.id)}">${esc(t.title)}</a>` : "—"; } },
        { k: "d", t: "Здано", v: r => r.done, h: r => h.fmtDT(r.done) }, { k: "s", t: "Бали", num: 1, v: r => r.score, h: r => r.score + "/" + r.max }, { k: "g", t: "Оцінка", num: 1, v: r => r.grade, h: r => "<b>" + r.grade + "</b>" }], ctlRes)}</div>`;
      const pl = parentLinks[s.key];
      out += `<div class="card noprint"><h3>👪 Звіт для батьків</h3><p class="hint">Окреме посилання лише на цього учня: прогрес, активність, моніторингові роботи й призначення. Без входу і без даних інших учнів. Сторінку можна роздрукувати або зберегти як PDF.</p>
        ${pl ? `<div class="row"><input class="input" style="flex:1 1 260px" readonly value="${esc(pl)}" id="plink-${esc(s.key)}"><button class="btn sm" data-plcopy="${esc(s.key)}">Копіювати</button><a class="btn sm" href="${esc(pl)}" target="_blank" rel="noopener">Відкрити ↗</a><button class="btn sm danger" data-plrenew="${esc(s.key)}">Нове посилання</button></div><p class="hint">«Нове посилання» вимикає старе.</p>`
        : `<div><button class="btn sm primary" data-plget="${esc(s.key)}">Отримати посилання</button></div>`}</div>`;
      return out;
    }

    /* ── Події ── */
    async function onClick(b) {
      const d = b.dataset;
      if (d.act === "live-now") { pollLive(); return true; }
      if (d.lggrp !== undefined) { LV.grp = d.lggrp; LV.open = null; liveRender(); return true; }
      if (d.lgsort) { LV.sort = d.lgsort; liveRender(); return true; }
      if (d.lgopen) { LV.reveal = false; LV.open = { g: liveCurGroup(), n: +d.lgopen, who: "" }; liveRender(); return true; }
      if (d.lgcell) { LV.open = { g: liveCurGroup(), n: +d.lgcell, who: d.lgwho || "" }; liveRender(); return true; }
      if (d.lgclose) { LV.open = null; liveRender(); return true; }
      if (d.lgstep) { liveStep(+d.lgstep); return true; }
      if (d.lgproj) { LV.proj = !LV.proj; LV.reveal = false; liveRender(); return true; }
      if (d.lgreveal) { LV.reveal = !LV.reveal; liveRender(); return true; }
      if (d.lgmsg) {
        const g = liveModel().groups.find(x => x.key === (LV.open && LV.open.g)); if (!g) return true;
        const keys = Object.values(g.rows).filter(r => r.cells[LV.open.n] && !r.cells[LV.open.n].ok && r.s.key).map(r => r.s.key);
        const n = LV.open.n; LV.open = null; h.msgTo(keys, "Завдання №" + n + " — " + g.title, "Подивись ще раз завдання №" + n + " у темі «" + g.title + "». "); return true;
      }
      if (d.sgi !== undefined) {
        const x = suggestions()[+d.sgi]; if (!x) return true;
        const due = new Date(D().now + 7 * DAY);
        Object.assign(h.asg, { id: "", title: "Повторення: " + x.t.title, items: new Set(["t:" + x.t.id]), type: "keys", classes: new Set(), keys: new Set(x.who.map(s => s.key)), q: "", iq: "",
          due: h.dayKey(due.getTime()), note: "Ця тема дається важко — попрацюй над нею: спершу теорія й «Тренування теорії», потім завдання.", open: true });
        location.hash = "assign"; setTimeout(() => window.scrollTo(0, 0), 30); h.render(); return true;
      }
      if (d.act === "ctl-new") { Object.assign(ctl, { open: true, id: "", title: "", topics: new Set(), per: 2, min: 30, show: true, due: "", note: "", type: h.ui.cls ? "class" : "all", classes: new Set(h.ui.cls ? [h.ui.cls] : []), keys: new Set(), q: "", iq: "" }); h.render(); return true; }
      if (d.act === "ctl-cancel") { ctl.open = false; h.render(); return true; }
      if (d.act === "ctl-save") {
        if (!ctl.topics.size) { h.toast("Оберіть хоча б одну тему"); return true; }
        if ((ctl.type === "class" && !ctl.classes.size) || (ctl.type === "keys" && !ctl.keys.size)) { h.toast("Оберіть, кому призначити"); return true; }
        const items = [];
        [...ctl.topics].forEach(id => { const idx = E.shuffle(Math.random, Array.from({ length: N }, (_, i) => i)).slice(0, ctl.per); idx.forEach(i => items.push([id, i])); });
        ctl.busy = true; h.render.keepScroll = true; h.render();
        const due = ctl.due ? new Date(ctl.due + "T23:59:00").getTime() : 0;
        const r = await h.api(Object.assign({ action: "admin_test_save", title: ctl.title, items, min: ctl.min, show: ctl.show, due, note: ctl.note }, h.toPayload(ctl)));
        ctl.busy = false;
        if (r && r.ok) { ctl.open = false; h.toast("Моніторингову роботу збережено й надіслано"); await h.refreshQuiet(); } else { h.toast("Не вдалося зберегти"); h.render(); }
        return true;
      }
      if (d.ctldel) { if (!confirm("Видалити моніторингову роботу? Учні більше її не бачитимуть (результати лишаться в таблиці).")) return true; await h.api({ action: "admin_test_delete", id: d.ctldel }); await h.refreshQuiet(); h.toast("Видалено"); return true; }
      if (d.ctlreset) {
        const [id, key] = [d.ctlreset.slice(0, d.ctlreset.indexOf("|")), d.ctlreset.slice(d.ctlreset.indexOf("|") + 1)];
        if (!confirm("Скинути спробу? Учень зможе пройти моніторингову роботу ще раз, поточний результат буде видалено.")) return true;
        await h.api({ action: "admin_test_reset", id, key }); await h.refreshQuiet(); h.toast("Спробу скинуто"); return true;
      }
      if (d.act === "ctl-csv") {
        const t = (D().tests || []).find(x => x.id === d.id); if (!t) return true;
        const rec = h.all().filter(s => h.addressed(t.code, s)), res = resultsOf(t.id);
        h.csv("kontrolna", ["Учень", "Клас", "Стан", "Бали", "З", "%", "Оцінка", "Хвилин", "Виходів", "Запізнення"].concat(t.items.map((_, i) => "№" + (i + 1))),
          rec.map(s => { const r = res.find(x => x.key === s.key); return [s.name, s.cls, r ? (r.done ? "здано" : "почав") : "не починав", r && r.done ? r.score : "", r && r.done ? r.max : "", r && r.done ? Math.round(r.score / r.max * 100) : "", r && r.done ? r.grade : "", r && r.done ? Math.round((r.done - r.started) / 60000) : "", r ? r.ex : "", r && r.late ? "так" : ""].concat(t.items.map((_, i) => r && r.done ? (r.okStr[i] === "1" ? 1 : 0) : "")); }));
        return true;
      }
      if (d.plget || d.plrenew) {
        const key = d.plget || d.plrenew;
        if (d.plrenew && !confirm("Створити нове посилання? Старе перестане працювати.")) return true;
        const r = await h.api({ action: "admin_parent_link", key, renew: !!d.plrenew });
        if (r && r.ok) { parentLinks[key] = new URL("parent.html?r=" + encodeURIComponent(r.t), location.href).href; h.render.keepScroll = true; h.render(); }
        else h.toast("Не вдалося отримати посилання. Оновіть Code.gs до версії 12.");
        return true;
      }
      if (d.plcopy) { const el = document.getElementById("plink-" + d.plcopy); try { await navigator.clipboard.writeText(el.value); h.toast("Скопійовано"); } catch (e) { el.select(); h.toast("Виділено — скопіюйте вручну"); } return true; }
      return false;
    }
    function onInput(el) {
      if (el.id === "ktitle") { ctl.title = el.value; return true; }
      if (el.id === "knote") { ctl.note = el.value; return true; }
      if (el.id === "kmin") { ctl.min = Math.max(1, Math.min(240, +el.value || 30)); return true; }
      if (el.id === "kiq") { ctl.iq = el.value; h.rerenderKeepFocus("kiq"); return true; }
      return false;
    }
    function onChange(el) {
      if (el.dataset.ctltopic) { if (el.checked) ctl.topics.add(el.dataset.ctltopic); else ctl.topics.delete(el.dataset.ctltopic); h.render.keepScroll = true; h.render(); return true; }
      if (el.id === "kper") { ctl.per = +el.value; h.render.keepScroll = true; h.render(); return true; }
      if (el.id === "kdue") { ctl.due = el.value; return true; }
      if (el.id === "kshow") { ctl.show = el.checked; return true; }
      if (el.id === "lvmin") { LV.min = +el.value; live = null; h.render.keepScroll = true; h.render(); pollLive(); return true; }
      if (el.id === "rltopic") { h.ui.ruleTopic = el.value; h.render.keepScroll = true; h.render(); return true; }
      if (el.id === "rlmin") { h.ui.ruleMin = +el.value; h.render.keepScroll = true; h.render(); return true; }
      return false;
    }

    return {
      ctl, nav: [["live", "Урок наживо"], ["tests", "Моніторингові роботи"], ["rules", "Правила"]],
      routes: { live: livePage, tests: testsPage, test: testPage, rules: rulesPage },
      studentCards, dynamicsCard, assignEffect, suggestionsHtml, topRulesHtml, onClick, onInput, onChange
    };
  };
})();
