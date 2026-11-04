/* Контрольні роботи від учителя: одна спроба, таймер, відповіді можна змінювати до здачі.
   Список контрольних приходить разом із повідомленнями (s.inbox.tests). Відповіді під час роботи — лише на пристрої (s.ctl),
   на сервер ідуть під час здачі; початок фіксує сервер (test_start), тож таймер не обійти перезавантаженням сторінки. */
(function () {
  "use strict";

  window.MGExam = function (host) {
    const { esc, E, T } = host;
    let p = null, tick = null, busy = false;

    const list = () => { const s = host.me(); return s && s.inbox && s.inbox.tests ? s.inbox.tests : []; };
    const testOf = id => list().find(t => t.id === id);
    function local(id) { const s = host.me(); s.ctl = s.ctl || {}; return s.ctl[id] || (s.ctl[id] = { ans: {}, cur: 0 }); }
    const taskOf = (it, i) => { const base = host.tasksOf(it[0])[it[1]]; return base ? Object.assign({}, base, { n: i }) : null; };
    const left = (t, st) => st.started ? st.started + t.min * 60000 - Date.now() : t.min * 60000;
    const mmss = ms => { ms = Math.max(0, ms); const m = Math.floor(ms / 60000), s = Math.floor(ms % 60000 / 1000); return m + ":" + String(s).padStart(2, "0"); };

    /* ── Картка на головній ── */
    function homeHtml() {
      if (!host.loggedIn()) return "";
      const ts = list().filter(t => !(t.res && t.res.done && t.res.done < Date.now() - 30 * 86400000));
      if (!ts.length) return "";
      return `<section class="asg ctl-home"><h2>📝 Контрольні роботи</h2>` + ts.map(t => {
        const st = local(t.id), r = t.res, closed = t.due && t.due < Date.now() && !(r && r.started);
        let state, btn;
        if (r && r.done) { state = `<span class="pill green">здано: ${r.score}/${r.max} · оцінка ${r.grade}</span>`; btn = t.show ? `<button class="btn small" data-ctl="open" data-id="${esc(t.id)}">Переглянути</button>` : ""; }
        else if (r && r.started || st.started) { const l = left(t, Object.assign({}, st, { started: (r && r.started) || st.started })); state = `<span class="pill red">триває · ${l > 0 ? "залишилось " + mmss(l) : "час вийшов"}</span>`; btn = `<button class="btn small primary" data-ctl="open" data-id="${esc(t.id)}">Продовжити</button>`; }
        else if (closed) { state = '<span class="pill">термін минув</span>'; btn = ""; }
        else { state = `<span class="pill">${t.items.length} завд. · ${t.min} хв</span>`; btn = `<button class="btn small primary" data-ctl="open" data-id="${esc(t.id)}">Почати</button>`; }
        return `<div class="asg-one"><div class="asg-head"><b>${esc(t.title)}</b>${state}${t.due ? `<span class="pill">до ${new Date(t.due).toLocaleDateString("uk-UA")}</span>` : ""}</div>${t.note ? `<p class="hint" style="margin:0">${esc(t.note)}</p>` : ""}<div>${btn}</div></div>`;
      }).join("") + "</section>";
    }

    /* ── Сторінка контрольної ── */
    function pageHtml() {
      const t = testOf(host.ui.ctl);
      const top = `<div class="topbar"><div class="wrap"><div class="tb-row"><button class="btn small ghost" data-ctl="home">← Головна</button><span class="tb-title">${t ? esc(t.title) : "Контрольна"}</span>${t && runOn(t) ? `<span class="ctl-timer mono" id="ctl-timer">${mmss(left(t, local(t.id)))}</span>` : ""}</div></div></div>`;
      if (!t) return top + '<main class="wrap"><p class="empty">Контрольну не знайдено. Можливо, учитель її видалив.</p></main>';
      const st = local(t.id), r = t.res;
      if (r && r.done) return top + `<main class="wrap">${resultHtml(t)}</main>`;
      if (!st.started && !(r && r.started)) return top + `<main class="wrap"><section class="card pl-card"><h2>📝 ${esc(t.title)}</h2>
        <ul class="fc-facts"><li><b>${t.items.length}</b> завдань, <b>${t.min}</b> хвилин</li><li>Спроба <b>одна</b>. Після початку таймер не зупиняється, навіть якщо закрити сторінку.</li>
        <li>Відповіді можна змінювати до здачі. Коли час вийде, роботу буде здано автоматично.</li><li>Виходи зі сторінки вчитель бачить.</li>${t.show ? "<li>Після здачі ви побачите правильні відповіді.</li>" : ""}</ul>
        ${t.note ? `<p class="hint">${esc(t.note)}</p>` : ""}<div class="task-nav"><button class="btn primary" data-ctl="start" ${busy ? "disabled" : ""}>${busy ? "Починаю…" : "Почати контрольну"}</button></div></section></main>`;
      if (!st.started && r && r.started) st.started = r.started;
      if (left(t, st) <= 0) { setTimeout(() => submit(t, true), 0); return top + '<main class="wrap"><p class="empty">Час вийшов. Здаю роботу…</p></main>'; }
      ensureTick(t);
      const i = Math.min(st.cur || 0, t.items.length - 1), task = taskOf(t.items[i], i);
      if (!p || p.i !== i || p.id !== t.id) { p = host.trainerNewPend(task, "ctl" + t.id); p.i = i; p.id = t.id; const a = st.ans[i]; if (a != null) restore(task, a); }
      const answered = Object.keys(st.ans).length;
      let h = `<main class="wrap" style="padding-top:0"><section class="tasks"><div class="tprog"><div class="tprog-top"><span>Відповіли на <b class="mono">${answered}</b> з ${t.items.length}</span></div>
        <div class="grid100 ctl-grid">${t.items.map((_, k) => `<button class="cell ${st.ans[k] != null ? "c1" : ""} ${k === i ? "cur" : ""}" data-ctl="go" data-i="${k}" aria-label="Завдання ${k + 1}${st.ans[k] != null ? ", є відповідь" : ""}">${k + 1}</button>`).join("")}</div></div>
        <article class="task"><div class="task-head"><span class="mono">Завдання ${i + 1} / ${t.items.length}</span><span class="kind">${host.typeName(task.t)}</span></div>
        <h3 class="task-q">${task.q}</h3>${task.big ? `<div class="big">${task.big}</div>` : ""}${host.trainerBody(task, false, undefined, p)}
        <div class="task-nav"><button class="btn" data-ctl="go" data-i="${i - 1}" ${i === 0 ? "disabled" : ""} aria-label="Попереднє">←</button>
        <button class="btn primary grow" data-ctl="save" ${host.trainerReady(task, p) ? "" : "disabled"}>${st.ans[i] != null ? "Змінити відповідь" : "Зберегти відповідь"}</button>
        <button class="btn" data-ctl="go" data-i="${i + 1}" ${i === t.items.length - 1 ? "disabled" : ""} aria-label="Наступне">→</button></div></article>
        <div class="foot-acts"><button class="btn ${answered === t.items.length ? "primary" : ""}" data-ctl="submit" ${busy ? "disabled" : ""}>${busy ? "Здаю…" : "Здати роботу"}</button></div>
        ${st.confirm ? `<div class="confirm"><b>Здати роботу?</b><span>${answered < t.items.length ? "Без відповіді: " + (t.items.length - answered) + " завд. " : ""}Після здачі змінити відповіді не можна.</span><div class="task-nav"><button class="btn danger" data-ctl="submit-yes">Так, здати</button><button class="btn" data-ctl="submit-no">Ще перевірю</button></div></div>` : ""}</section></main>`;
      return top + h;
    }
    const runOn = t => { const st = local(t.id); return !(t.res && t.res.done) && (st.started || (t.res && t.res.started)); };
    function restore(task, a) {
      if (task.t === "one") p.v = a;
      else if (task.t === "multi" || task.t === "sort" || task.t === "match") p.v = a.slice();
      else if (task.t === "order") p.v = a.slice();
    }
    function resultHtml(t) {
      const r = t.res;
      let h = `<section class="card pl-card"><h2>📝 Роботу здано</h2><div class="fc-big"><span class="lbl">Результат</span><b class="mono">${r.score} / ${r.max}</b><span class="hint">оцінка за 12-бальною шкалою: <b>${r.grade}</b>${r.late ? " · здано із запізненням" : ""}</span></div></section>`;
      if (!t.show || !r.okStr) return h + '<p class="hint">Правильні відповіді вчитель покаже згодом.</p>';
      const st = local(t.id);
      h += t.items.map((it, i) => {
        const task = taskOf(it, i), resp = st.ans[i], ok = r.okStr[i] === "1";
        return `<article class="task"><div class="task-head"><span class="mono">Завдання ${i + 1}</span><span class="kind">${ok ? "✓ правильно" : "✗ помилка"}</span></div><h3 class="task-q">${task.q}</h3>${task.big ? `<div class="big">${task.big}</div>` : ""}
          ${resp != null ? host.trainerBody(task, true, resp, host.trainerNewPend(task, "rv")) : '<p class="hint">Відповіді немає.</p>'}<div class="fb ${ok ? "good" : "bad"}">${!ok ? host.correctHtml(task) : ""}${task.note ? `<span>${task.note}</span>` : ""}</div></article>`;
      }).join("");
      return h;
    }

    function ensureTick(t) {
      if (tick) return;
      tick = setInterval(() => {
        const cur = testOf(host.ui.ctl);
        if (host.ui.view !== "ctl" || !cur || !runOn(cur)) { clearInterval(tick); tick = null; return; }
        const l = left(cur, local(cur.id)), el = document.getElementById("ctl-timer");
        if (el) { el.textContent = mmss(l); el.classList.toggle("warn", l < 120000); }
        if (l <= 0) { clearInterval(tick); tick = null; submit(cur, true); }
      }, 1000);
    }

    async function start(t) {
      busy = true; host.render();
      const s = host.me(), d = await host.api({ action: "test_start", key: host.currentKey(), token: s.token, id: t.id });
      busy = false;
      if (!d || !d.ok) { host.toast(d && d.error === "closed" ? "Термін контрольної минув" : "Не вдалося почати. Перевірте інтернет."); host.render(); return; }
      host.applyExtras(s, d);
      const st = local(t.id); st.started = d.started; st.mark = host.focusMark(); st.cur = 0;
      host.saveLocal(); host.render(); window.scrollTo(0, 0);
    }
    async function submit(t, auto) {
      if (busy) return;
      const st = local(t.id), s = host.me();
      const ok = t.items.map((it, i) => { const task = taskOf(it, i), a = st.ans[i]; return a != null && E.check(task, a) ? "1" : "0"; }).join("");
      const fo = st.mark ? host.focusSince(st.mark) : {};
      busy = true; st.confirm = false; host.render();
      const d = await host.api({ action: "test_submit", key: host.currentKey(), token: s.token, id: t.id, ok, ans: t.items.map((_, i) => st.ans[i] == null ? null : st.ans[i]), ex: fo.ex || 0, away: fo.away || 0 });
      busy = false;
      if (d && (d.ok || d.error === "done")) { host.applyExtras(s, d); host.saveLocal(); host.toast(auto ? "Час вийшов — роботу здано" : "Роботу здано"); }
      else { host.toast("Не вдалося здати. Перевірте інтернет — спробую ще раз."); setTimeout(() => { const cur = testOf(t.id); if (cur && runOn(cur)) submit(cur, auto); }, 8000); }
      host.render(); window.scrollTo(0, 0);
    }

    function onClick(b) {
      const d = b.dataset;
      if (d.ctl === undefined) {
        if (host.ui.view === "ctl" && p) { if (host.trainerInput(b, p)) { host.render(); return true; } }
        return false;
      }
      const t = testOf(d.id || host.ui.ctl);
      if (d.ctl === "home") { host.ui.view = "home"; p = null; host.render(); window.scrollTo(0, 0); return true; }
      if (d.ctl === "open" && t) { host.ui.view = "ctl"; host.ui.ctl = t.id; p = null; host.render(); window.scrollTo(0, 0); return true; }
      if (!t) return true;
      const st = local(t.id);
      if (d.ctl === "start") { start(t); return true; }
      if (d.ctl === "go") { const i = +d.i; if (i >= 0 && i < t.items.length) { st.cur = i; p = null; host.saveLocal(); host.render(); host.scrollTask(); } return true; }
      if (d.ctl === "save") {
        const i = st.cur || 0, task = taskOf(t.items[i], i);
        st.ans[i] = host.trainerResp(task, p);
        const nx = t.items.findIndex((_, k) => k > i && st.ans[k] == null);
        if (nx >= 0) { st.cur = nx; p = null; }
        host.saveLocal(); host.render(); host.scrollTask(); return true;
      }
      if (d.ctl === "submit") { st.confirm = true; host.render(); return true; }
      if (d.ctl === "submit-no") { st.confirm = false; host.render(); return true; }
      if (d.ctl === "submit-yes") { submit(t, false); return true; }
      return true;
    }

    return { homeHtml, pageHtml, onClick, running: () => list().some(t => runOn(t)) };
  };
})();
