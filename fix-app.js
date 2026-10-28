/* Розділ «Мої помилки»: робота над помилками з тренажера, завдань ЗНО й симуляцій НМТ.
   Ланцюжок для помилки з тренажера: розбір → те саме завдання (варіанти переставлено) → два схожі завдання на те саме правило.
   Для ЗНО й НМТ: розбір → те саме завдання ще раз. Помилка виправлена, коли всі кроки розв’язано правильно поспіль.
   Перший результат теми не змінюється: виправлення рахуємо окремо (s.fix). */
(function () {
  "use strict";

  window.MGFix = function (host) {
    const { esc } = host;
    const LIMIT = 10;          // помилок за одне заняття
    let sess = null;           // { list, pos, phase, last, fixed, skipped, title, requeued }
    let p = null;              // відповідь, яку учень зараз складає

    /* ── Стан виправлень ── */
    function fixStore() { const s = host.me(); if (!s) return null; s.fix = s.fix || {}; return s.fix; }
    const fstate = key => { const fx = fixStore(); return fx ? (fx[key] || (fx[key] = {})) : {}; };
    const isDone = key => { const fx = fixStore(); return !!(fx && fx[key] && fx[key].d); };

    /* Усі помилки учня: тренажер, ЗНО, НМТ. */
    function all() {
      const s = host.me(); if (!s) return [];
      const out = [];
      host.T.forEach(t => {
        const st = s.topics && s.topics[t.id]; if (!st || !st.r) return;
        const att = st.att || 1;
        for (let n = 0; n < st.r.length; n++) if (st.r[n] === "0")
          out.push({ key: "t:" + t.id + ":" + att + ":" + n, src: "t", topic: t.id, n, resp: st.ch ? st.ch[n] : undefined, group: "t:" + t.id });
      });
      host.Z.mistakes().forEach(m => out.push(Object.assign(m, { src: "z", group: "z:" + m.topic })));
      host.NM.mistakes().forEach(m => { if (!m.pending) out.push(Object.assign(m, { src: "n", group: "n:" + m.test })); });
      return out;
    }
    const openOf = list => list.filter(m => !isDone(m.key));
    function counts(group) {
      const list = all().filter(m => !group || m.group === group || m.src === group);
      const open = openOf(list).length;
      return { open, done: list.length - open, total: list.length };
    }
    function groupTitle(g) {
      const [src, id] = [g.slice(0, 1), g.slice(2)];
      if (src === "t") { const t = host.T.find(x => x.id === id); return t ? t.title : id; }
      if (src === "z") return host.Z.titleOf(id) || "Тема ЗНО";
      return host.NM.testTitle(id);
    }
    const SRC = { t: "Тренажер", z: "Завдання ЗНО", n: "Симуляція НМТ" };

    /* Кроки ланцюжка для помилки. null — дані ще завантажуються. */
    function stepsOf(m) {
      const f = fstate(m.key), seed = m.key + ":" + (f.t || 0);
      if (m.src === "t") {
        const topic = host.T.find(x => x.id === m.topic), task = host.tasksOf(m.topic)[m.n];
        const steps = [{ kind: "same", task: host.E.reshuffle(task, seed) }]
          .concat(host.E.similar(topic, task, m.resp, seed, 2).map(t => ({ kind: "sim", task: t })));
        return { orig: task, steps };
      }
      if (m.src === "z") {
        const data = host.Z.getTopic(m.topic);
        if (!data || typeof data !== "object") return data === "error" ? { error: true } : null;
        const task = data.tasks.find(x => String(x.id) === String(m.id));
        return task ? { orig: task, steps: [{ kind: "same", task }] } : { error: true };
      }
      const data = host.NM.getTest(m.test);
      if (!data || typeof data !== "object") return data === "error" ? { error: true } : null;
      const task = data.tasks[m.i];
      return task ? { orig: task, steps: [{ kind: "same", task }] } : { error: true };
    }

    /* ── Головна розділу ── */
    function homeHtml() {
      if (!host.loggedIn()) return host.gateHtml();
      host.Z.loadIndex(); host.NM.loadIndex();
      const list = all(), open = openOf(list), done = list.length - open.length;
      const pendingNmt = host.NM.mistakes().some(m => m.pending);
      let h = `<section class="fx-sum"><div class="overall-top"><span>Відкрито помилок: <b class="mono">${open.length}</b></span><span>Виправлено: <b class="mono">${done}</b>${list.length ? " з " + list.length : ""}</span></div>
        <div class="bar" aria-hidden="true"><b style="width:100%"></b><i style="width:${list.length ? done / list.length * 100 : 0}%"></i></div>`;
      if (open.length) h += `<div><button class="btn primary" data-fixstart="all">Почати роботу над помилками (${Math.min(LIMIT, open.length)})</button></div>`;
      h += `</section>`;
      h += `<details class="fx-how"${list.length ? "" : " open"}><summary>Як працює робота над помилками</summary><ol class="algo">
        <li><b>Розбір</b><span>Бачиш своє завдання, свою відповідь, правильну відповідь і пояснення правила. Теорія — одним дотиком.</span></li>
        <li><b>Те саме завдання</b><span>Розв’язуєш його ще раз; варіанти відповідей переставлено.</span></li>
        <li><b>Два схожі завдання</b><span>На те саме правило, але з іншими словами (для тренажера). Так перевіряємо, що правило зрозуміле.</span></li>
        <li><b>Помилку виправлено</b><span>Коли всі кроки правильні поспіль. Якщо знову помилка — розбір повториться з новими завданнями.</span></li>
      </ol><p class="hint" style="margin:0">Перший результат теми не змінюється: учитель бачить і його, і скільки помилок ти виправив.</p></details>`;
      if (!list.length) {
        h += `<div class="fx-empty"><b>${pendingNmt ? "Завантажую помилки…" : "Помилок поки немає"}</b><span>${pendingNmt ? "" : "Виконуй завдання тренажера, ЗНО чи симуляції НМТ — помилки автоматично з’являться тут, і ти зможеш над ними попрацювати."}</span></div>`;
        return h;
      }
      ["t", "z", "n"].forEach(src => {
        const groups = {};
        list.filter(m => m.src === src).forEach(m => { (groups[m.group] = groups[m.group] || []).push(m); });
        const keys = Object.keys(groups);
        if (!keys.length) return;
        h += `<section class="section"><div class="section-h"><h2>${SRC[src]}</h2></div><div class="cards">`;
        keys.forEach(g => {
          const o = openOf(groups[g]).length, d = groups[g].length - o;
          h += `<article class="card fx-card"><h3>${esc(groupTitle(g))}</h3>
            <div class="bar" aria-hidden="true"><b style="width:100%"></b><i style="width:${d / groups[g].length * 100}%"></i></div>
            <div class="meta"><span>Відкрито <b class="mono">${o}</b></span><span>Виправлено <b class="mono">${d}</b> з ${groups[g].length}</span></div>
            <div class="acts">${o ? `<button class="btn small primary" data-fixstart="${esc(g)}">Працювати (${Math.min(LIMIT, o)})</button>` : '<span class="badge100">✓ усе виправлено</span>'}</div></article>`;
        });
        h += "</div></section>";
      });
      if (pendingNmt) h += '<p class="hint">Завантажую помилки з симуляцій НМТ…</p>';
      return h;
    }

    /* ── Заняття ── */
    function start(scope) {
      const list = openOf(all()).filter(m => scope === "all" || m.group === scope);
      if (!list.length) { host.toast("Відкритих помилок тут немає"); return; }
      sess = { list: list.slice(0, LIMIT), pos: 0, phase: "review", last: null, fixed: 0, requeued: new Set(),
        title: scope === "all" ? "Усі помилки" : groupTitle(scope), scope };
      p = null;
      Object.assign(host.ui, { view: "fix" });
      host.render(); window.scrollTo(0, 0);
    }
    const cur = () => sess && sess.list[sess.pos];

    function pageHtml() {
      if (!sess || !host.loggedIn()) { host.ui.view = "home"; return null; }
      let h = `<div class="topbar"><div class="wrap"><div class="tb-row"><button class="btn small ghost" data-act="fixhome" aria-label="До розділу «Мої помилки»">← Мої помилки</button><span class="tb-title">Робота над помилками · ${esc(sess.title)}</span></div></div></div><main class="wrap" style="padding-top:0"><section class="tasks">`;
      const m = cur();
      if (!m) return h + summaryHtml() + "</section></main>";
      const ch = stepsOf(m);
      h += `<div class="fx-head"><span class="mono">Помилка ${sess.pos + 1} з ${sess.list.length}</span><span>${SRC[m.src]} · ${esc(groupTitle(m.group))}</span></div>`;
      if (!ch) return h + '<p class="empty">Завантажую завдання…</p></section></main>';
      if (ch.error) return h + `<p class="empty">Не вдалося завантажити це завдання.</p><div class="task-nav"><button class="btn primary grow" data-act="fixskip">Наступна помилка →</button></div></section></main>`;
      const f = fstate(m.key);
      h += stepper(ch.steps, f.s || 0);
      if (sess.phase === "review") h += reviewHtml(m, ch);
      else h += stepHtml(m, ch, f);
      return h + "</section></main>";
    }

    function stepper(steps, doneN) {
      const names = ["Розбір"].concat(steps.map((s, i) => s.kind === "same" ? "Те саме" : "Схоже " + i));
      const at = sess.last && sess.last.fixed ? names.length : sess.phase === "review" ? 0 : 1 + doneN;
      return '<ol class="fx-steps">' + names.map((n, i) => `<li class="${i < at ? "ok" : i === at ? "cur" : ""}">${n}</li>`).join("") + "</ol>";
    }

    function theoryBtns(m, task) {
      let refs = [];
      if (m.src === "t") refs = ["t:" + m.topic];
      else if (m.src === "z") refs = ["z:" + m.topic];
      else refs = task.th || [];
      const items = refs.map(r => host.theoryRef(r)).filter(Boolean);
      return items.length ? `<div class="rv-th">${items.map(r => `<button class="btn small" data-theory="${esc(r.ref)}">📖 Теорія: ${esc(r.title)}</button>`).join("")}</div>` : "";
    }
    function explainHtml(m, task) {
      if (m.src === "t") return task.note ? `<span>${task.note}</span>` : "";
      const ex = m.src === "z" ? (task.ex ? host.Z.md(task.ex) : "") : task.ex || "";
      return ex ? `<details class="zex" open><summary>Пояснення</summary><div class="zex-body">${ex}</div></details>` : "";
    }
    function viewTask(m, task, done, resp, pend) {
      if (m.src === "t") return { q: task.q, big: task.big || "", body: host.trainerBody(task, done, resp, pend), kind: host.typeName(task.t) };
      const v = host.Z.taskView(task, done, resp, pend || host.Z.newPend(task), m.src === "n");
      return { q: v.q, big: "", body: v.body, kind: task.type === "single" ? "Оберіть одну відповідь" : task.type === "multiple" ? "Оберіть кілька відповідей" : "Установіть відповідність" };
    }
    function rightLine(m, task) {
      if (m.src === "t") return host.correctHtml(task);
      return `<span>Правильна відповідь: <b>${esc(host.Z.answerText(task))}</b></span>`;
    }

    function reviewHtml(m, ch) {
      const f = fstate(m.key), task = ch.orig, known = m.resp !== undefined && m.resp !== null;
      const v = viewTask(m, task, true, known ? m.resp : undefined, null);
      let h = `<article class="task fx-review"><div class="task-head"><span class="kind">Розбір помилки${f.t ? " · спроба " + (f.t + 1) : ""}</span><span>${v.kind}</span></div>
        <h3 class="task-q">${v.q}</h3>${v.big ? `<div class="big">${v.big}</div>` : ""}${v.body}
        <div class="fb bad"><span class="verdict">${known ? "Тут була помилка" : "Тут була помилка (твоєї відповіді на цьому пристрої немає)"}</span>${rightLine(m, task)}${m.src === "t" ? explainHtml(m, task) : ""}</div>
        ${m.src !== "t" ? explainHtml(m, task) : ""}${theoryBtns(m, task)}
        <p class="hint" style="margin:0">${sess.requeued.has(m.key) && sess.list.indexOf(m) !== sess.pos ? "Ти відклав цю помилку — спробуймо ще раз. " : ""}${ch.steps.length > 1 ? "Далі — це саме завдання ще раз і " + (ch.steps.length - 1) + " схож" + (ch.steps.length - 1 === 1 ? "е" : "і") + " на те саме правило." : "Далі — це саме завдання ще раз."}</p>
        <div class="task-nav"><button class="btn primary grow" data-act="fixgo">Зрозуміло — спробувати →</button><button class="btn" data-act="fixskip">Пропустити</button></div></article>`;
      return h;
    }

    function stepHtml(m, ch, f) {
      const answered = sess.phase === "fb" && sess.last;
      const k = answered ? sess.last.k : Math.min(f.s || 0, ch.steps.length - 1), step = ch.steps[k], task = answered ? sess.last.task : step.task;
      if (!answered && (!p || p.key !== m.key + ":" + k + ":" + (f.t || 0))) {
        p = m.src === "t" ? host.trainerNewPend(task, "fix" + m.key) : host.Z.newPend(task);
        p.key = m.key + ":" + k + ":" + (f.t || 0);
        p.f = host.focusMark();
      }
      const v = viewTask(m, task, !!answered, answered ? sess.last.resp : undefined, answered ? null : p);
      const label = step.kind === "same" ? "Те саме завдання" : "Схоже завдання " + k + " з " + (ch.steps.length - 1);
      let h = `<article class="task" aria-live="polite"><div class="task-head"><span class="kind">${label}</span><span>${v.kind}</span></div>
        <h3 class="task-q">${v.q}</h3>${v.big ? `<div class="big">${v.big}</div>` : ""}${v.body}`;
      if (answered) {
        const ok = sess.last.ok, fixedNow = ok && sess.last.fixed;
        h += `<div class="fb ${ok ? "good" : "bad"}"><span class="verdict">${fixedNow ? "Правильно! Помилку виправлено ✓" : ok ? "Правильно!" : "Знову помилка — розберімо ще раз"}</span>${ok ? "" : rightLine(m, task)}${m.src === "t" ? explainHtml(m, task) : ""}</div>`;
        if (m.src !== "t" && !ok) h += explainHtml(m, task);
        if (!ok) h += theoryBtns(m, task);
        h += '<div class="task-nav">';
        if (fixedNow) h += `<button class="btn primary grow" data-act="fixnext">${sess.pos + 1 < sess.list.length ? "Наступна помилка →" : "Завершити"}</button>`;
        else if (ok) h += `<button class="btn primary grow" data-act="fixcont">Далі →</button>`;
        else h += `<button class="btn primary grow" data-act="fixagain">Розібрати ще раз</button><button class="btn" data-act="fixskip">Пропустити</button>`;
        h += "</div>";
      } else {
        const ready = m.src === "t" ? host.trainerReady(task, p) : host.Z.readyOf(task, p);
        h += `<div class="task-nav"><button class="btn primary grow" data-act="fixcheck" ${ready ? "" : "disabled"}>Зберегти відповідь</button></div>`;
      }
      return h + "</article>";
    }

    function summaryHtml() {
      const left = counts().open;
      return `<div class="done-card"><h3 style="font-size:18px">Заняття завершено</h3>
        <p style="margin:0">Виправлено помилок: <b>${sess.fixed}</b> з ${new Set(sess.list.map(m => m.key)).size}.${sess.requeued.size ? " Відкладено на потім: " + [...sess.requeued].filter(k => !isDone(k)).length + "." : ""}</p>
        <p style="margin:0">${left ? "Ще відкритих помилок: " + left + "." : "Усі помилки виправлено. Чудова робота!"}</p>
        <div class="task-nav">${left ? `<button class="btn primary" data-fixstart="${esc(sess.scope && counts(sess.scope).open ? sess.scope : "all")}">Працювати далі (${Math.min(LIMIT, sess.scope && counts(sess.scope).open ? counts(sess.scope).open : left)})</button>` : ""}<button class="btn" data-act="fixhome">До розділу</button></div></div>`;
    }

    /* ── Відповідь ── */
    function answer() {
      const m = cur(), ch = stepsOf(m); if (!ch || ch.error) return;
      const f = fstate(m.key), k = Math.min(f.s || 0, ch.steps.length - 1), task = ch.steps[k].task;
      const resp = m.src === "t" ? host.trainerResp(task, p) : host.Z.respOf(task, p);
      const ok = m.src === "t" ? host.E.check(task, resp) : host.Z.check(task, resp), fo = host.focusSince(p && p.f);
      let fixed = false;
      if (ok) {
        f.s = (f.s || 0) + 1;
        if (f.s >= ch.steps.length) { f.d = Date.now(); f.s = 0; fixed = true; sess.fixed++; }
      } else { f.t = (f.t || 0) + 1; f.s = 0; }
      sess.last = { ok, resp, fixed, task, k };
      sess.phase = "fb";
      logEvent(m, task, resp, ok, k, ch.steps.length, fixed, fo);
      host.saveLocal(); host.scheduleSync();
      if (fixed) host.toast("Помилку виправлено!");
      host.render();
    }
    function logEvent(m, task, resp, ok, k, total, fixed, fo) {
      fo = fo || {};
      const s = host.me(); if (!s) return;
      const st = m.src === "t" ? "t" : m.src;
      const topic = m.src === "t" || m.src === "z" ? m.topic : "nmt:" + m.test;
      const f = fstate(m.key);
      let q, ans, right;
      if (st === "t") { q = host.plain(task.q) + (task.big ? " — " + host.plain(task.big) : ""); ans = host.answerText(task, resp); right = host.rightText(task); }
      else { q = host.plain(m.src === "z" ? host.Z.md(task.q) : task.q).slice(0, 400); ans = typeof resp === "object" ? Object.keys(resp || {}).map(x => x + "–" + resp[x]).join(", ") : String(resp || ""); right = host.Z.answerText(task); }
      (s.queue = s.queue || []).push({ id: m.key + "|fix|" + (f.t || 0) + "|" + k + "|" + Date.now(), topic, att: 1, n: (m.src === "t" ? m.n : m.src === "n" ? m.i : 0) + 1,
        type: "fix", ok, at: Date.now(), q: "[Робота над помилками, крок " + (k + 1) + " з " + total + (fixed ? ", виправлено" : "") + "] " + q, ans, right, sec: fo.sec, away: fo.away, ex: fo.ex });
    }
    function next(skipped) {
      const m = cur();
      /* Пропущену помилку один раз повертаємо в кінець заняття. */
      if (skipped && m && !sess.requeued.has(m.key)) { sess.requeued.add(m.key); if (sess.list.length > 1) sess.list.push(m); }
      sess.pos++; sess.phase = "review"; sess.last = null; p = null;
      host.render(); window.scrollTo(0, 0);
    }

    /* ── Події ── */
    function onClick(b) {
      const d = b.dataset;
      if (d.fixstart) { start(d.fixstart); return true; }
      if (host.ui.view !== "fix" || !sess) return false;
      const act = d.act;
      if (act === "fixhome") { host.ui.view = "home"; host.setHome("fix"); sess = null; host.render(); window.scrollTo(0, 0); return true; }
      if (act === "fixgo") { sess.phase = "task"; p = null; host.render(); host.scrollTask(); return true; }
      if (act === "fixskip") { next(true); return true; }
      if (act === "fixnext") { next(false); return true; }
      if (act === "fixcont") { sess.phase = "task"; sess.last = null; p = null; host.render(); host.scrollTask(); return true; }
      if (act === "fixagain") { sess.phase = "review"; sess.last = null; p = null; host.render(); window.scrollTo(0, 0); return true; }
      if (act === "fixcheck") { answer(); return true; }
      if (sess.phase === "task" && p) {
        const m = cur();
        const handled = m.src === "t" ? host.trainerInput(b, p) : host.Z.input(b, p);
        if (handled) { host.render(); return true; }
      }
      return false;
    }

    /* ── Синхронізація й звіт ── */
    function payload() {
      const fx = fixStore(); if (!fx) return null;
      const keep = {};
      for (const k in fx) { const f = fx[k]; if (f.d || f.t) keep[k] = f.d ? { d: f.d } : { t: f.t }; }
      const list = all(), sum = { open: 0, done: 0 };
      ["t", "z", "n"].forEach(src => { sum[src] = { open: 0, done: 0 }; });
      list.forEach(m => { const key = isDone(m.key) ? "done" : "open"; sum[key]++; sum[m.src][key]++; });
      if (!list.length && !Object.keys(keep).length) return null;
      return { map: keep, sum };
    }
    function merge(rec, fromServer) {
      if (!fromServer || typeof fromServer !== "object") return;
      rec.fix = rec.fix || {};
      for (const k in fromServer) {
        const a = rec.fix[k] || (rec.fix[k] = {}), b = fromServer[k] || {};
        if (b.d && !a.d) { a.d = b.d; a.s = 0; }
        if (b.t) a.t = Math.max(a.t || 0, b.t);
      }
    }
    function reportLines() {
      const c = counts();
      return c.total ? ["", "Робота над помилками: виправлено " + c.done + " з " + c.total] : [];
    }
    const openCount = group => counts(group).open;
    const quit = () => { sess = null; p = null; };

    return { homeHtml, pageHtml, onClick, payload, merge, reportLines, openCount, start, quit };
  };
})();
