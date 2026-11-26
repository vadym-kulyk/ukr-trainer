/* Перегляд відповідей учня для вчителя (admin.html) і батьків (parent.html).
   Дані — рядки журналу «Спроби»: [час, тема, спроба, № завдання, тип, результат, запитання, відповідь учня, правильна відповідь, секунд].
   load(src) повертає відповідь сервера { ok, rows, counts, more }. */
(function () {
  "use strict";
  const SRC = [["t", "Тренажер"], ["z", "Завдання ЗНО"], ["n", "Симуляції НМТ"], ["f", "Мої помилки"], ["x", "Розминка й інше"]];
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const fmtDT = t => t ? new Date(t).toLocaleString("uk-UA", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  const okOf = r => r[5].indexOf("✓") >= 0 || r[5] === "поріг подолано";

  const css = document.createElement("style");
  css.textContent = `
.av { display: grid; gap: 12px; min-width: 0; }
.av-tabs { display: flex; flex-wrap: wrap; gap: 6px; }
.av-tabs button { font: 600 14px inherit; font-family: inherit; border: 1px solid var(--line); background: var(--bg); color: var(--text); border-radius: 999px; padding: 7px 14px; cursor: pointer; }
.av-tabs button[aria-pressed="true"] { background: var(--lime); border-color: var(--lime); color: var(--on-lime); }
.av-tabs button span { opacity: .7; font-weight: 500; margin-left: 4px; }
.av-bar { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; font-size: 14px; }
.av-bar select { font: inherit; padding: 6px 8px; border-radius: 8px; border: 1px solid var(--line); background: var(--bg); color: var(--text); max-width: 100%; }
.av-bar label { display: inline-flex; gap: 6px; align-items: center; }
.av-grp { border: 1px solid var(--line); border-radius: 12px; background: var(--bg); min-width: 0; }
.av-grp > summary { cursor: pointer; padding: 12px 14px; display: flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; list-style: none; }
.av-grp > summary::-webkit-details-marker { display: none; }
.av-grp > summary::before { content: "▸"; color: var(--muted); }
.av-grp[open] > summary::before { content: "▾"; }
.av-grp > summary b { font-weight: 700; }
.av-sum { margin-left: auto; display: flex; gap: 6px; align-items: center; font-size: 13px; color: var(--muted); }
.av-pill { font-size: 12px; font-weight: 700; padding: 2px 8px; border-radius: 999px; white-space: nowrap; }
.av-pill.ok { background: var(--right-bg); color: var(--right); }
.av-pill.no { background: var(--wrong-bg); color: var(--wrong); }
.av-list { display: grid; gap: 0; border-top: 1px solid var(--line); }
.av-it { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 4px 10px; padding: 10px 14px; border-top: 1px solid var(--line); }
.av-it:first-child { border-top: 0; }
.av-n { font-weight: 800; font-size: 15px; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; }
.av-it.ok .av-n { background: var(--right-bg); color: var(--right); }
.av-it.no .av-n { background: var(--wrong-bg); color: var(--wrong); }
.av-q { font-size: 14px; color: var(--muted); overflow-wrap: anywhere; }
.av-a { font-size: 15px; overflow-wrap: anywhere; }
.av-a b { font-weight: 700; }
.av-it.ok .av-a b { color: var(--right); }
.av-it.no .av-a b { color: var(--wrong); }
.av-r { font-size: 14px; overflow-wrap: anywhere; }
.av-meta { font-size: 12px; color: var(--muted); }
.av-empty { color: var(--muted); margin: 0; }
.av-more { font-size: 13px; color: var(--muted); margin: 0; }`;
  document.head.appendChild(css);

  window.MGAnswers = function (load) {
    const st = { src: "t", topic: "", wrong: false, cache: {}, busy: {}, err: {}, open: {} };
    let el = null;

    function fetchSrc(src) {
      if (st.cache[src] || st.busy[src]) return;
      st.busy[src] = true; st.err[src] = "";
      Promise.resolve(load(src)).then(d => {
        st.busy[src] = false;
        if (d && d.ok) { st.cache[src] = d; st.counts = d.counts; }
        else st.err[src] = d && d.error === "link" ? "Посилання недійсне." : d && d.error === "unknown" ? "Оновіть скрипт у таблиці до версії 21." : "Не вдалося завантажити відповіді.";
        draw();
      });
    }

    /* Групи: одна тема й одна спроба (для НМТ — одна симуляція). Найновіші вгорі. */
    function groups(rows) {
      const map = new Map();
      rows.forEach(r => {
        const k = r[1] + "|" + r[2] + (st.src === "f" || st.src === "x" ? "|" + new Date(r[0]).toDateString() : "");
        let g = map.get(k); if (!g) { g = { k, topic: r[1], att: r[2], last: 0, items: [], summary: null }; map.set(k, g); }
        if (r[4] === "НМТ: симуляція") g.summary = r; else g.items.push(r);
        g.last = Math.max(g.last, r[0]);
      });
      return [...map.values()].sort((a, b) => b.last - a.last);
    }

    function itemHtml(r) {
      const ok = okOf(r);
      return `<div class="av-it ${ok ? "ok" : "no"}"><span class="av-n" title="${ok ? "правильно" : "помилка"}">${r[3] || "•"}</span><div>
        <div class="av-q">${esc(r[6])}</div>
        <div class="av-a">Відповідь учня: <b>${esc(r[7] || "—")}</b> ${ok ? "✓" : "✗"}</div>
        ${ok ? "" : `<div class="av-r">Правильно: ${esc(r[8])}</div>`}
        <div class="av-meta">${fmtDT(r[0])}${r[9] != null ? " · " + r[9] + " с на завдання" : ""}${st.src === "f" || st.src === "x" ? " · " + esc(r[4]) : ""}</div></div></div>`;
    }

    function draw() {
      if (!el) return;
      const d = st.cache[st.src], counts = st.counts || {};
      let h = `<div class="av-tabs" role="group" aria-label="Розділ">${SRC.map(([k, l]) => `<button type="button" data-avsrc="${k}" aria-pressed="${st.src === k}">${l}${counts[k] != null ? `<span>${counts[k]}</span>` : ""}</button>`).join("")}</div>`;
      if (!d) {
        h += st.err[st.src] ? `<p class="av-empty">${esc(st.err[st.src])} <button type="button" data-avretry>Спробувати ще раз</button></p>` : '<p class="av-empty">Завантажую відповіді…</p>';
        el.innerHTML = `<div class="av">${h}</div>`; fetchSrc(st.src); return;
      }
      const topics = [...new Set(d.rows.map(r => r[1]))].sort((a, b) => a.localeCompare(b, "uk"));
      if (st.topic && !topics.includes(st.topic)) st.topic = "";
      h += `<div class="av-bar"><label>Тема <select data-avtopic><option value="">усі теми</option>${topics.map(t => `<option ${st.topic === t ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></label>
        <label><input type="checkbox" data-avwrong ${st.wrong ? "checked" : ""}> лише помилки</label></div>`;
      const rows = d.rows.filter(r => !st.topic || r[1] === st.topic);
      const gs = groups(rows);
      if (!gs.length) h += '<p class="av-empty">У цьому розділі ще немає відповідей.</p>';
      gs.forEach((g, i) => {
        const items = g.items.slice().sort((a, b) => a[3] - b[3] || a[0] - b[0]), ok = items.filter(okOf).length, bad = items.length - ok;
        const shown = st.wrong ? items.filter(r => !okOf(r)) : items;
        if (st.wrong && !shown.length && !g.summary) return;
        const open = st.open[g.k] != null ? st.open[g.k] : i === 0;
        const sum = g.summary ? `<span class="av-pill ${okOf(g.summary) ? "ok" : "no"}">${esc(g.summary[7].split(";")[0])}</span>` : "";
        h += `<details class="av-grp" data-avk="${esc(g.k)}" ${open ? "open" : ""}><summary><b>${esc(g.topic)}</b>${st.src === "t" || st.src === "z" || st.src === "n" ? `<span class="av-meta">${st.src === "n" ? "спроба" : "спроба теми"} ${g.att}</span>` : ""}<span class="av-meta">${fmtDT(g.last)}</span>
          <span class="av-sum">${sum}${items.length ? `<span class="av-pill ok">✓ ${ok}</span><span class="av-pill no">✗ ${bad}</span>` : ""}</span></summary>
          ${shown.length ? `<div class="av-list">${shown.map(itemHtml).join("")}</div>` : g.summary ? '<p class="av-more" style="padding:0 14px 12px">Відповіді на окремі завдання цієї симуляції не збережено (тест пройдено до оновлення сайту).</p>' : ""}</details>`;
      });
      if (d.more) h += `<p class="av-more">Показано останні ${d.rows.length} відповідей. Усі відповіді — на аркуші «Спроби» в таблиці.</p>`;
      el.innerHTML = `<div class="av">${h}</div>`;
    }

    function onClick(e) {
      const b = e.target.closest("[data-avsrc]");
      if (b) { st.src = b.dataset.avsrc; st.topic = ""; draw(); return; }
      if (e.target.closest("[data-avretry]")) { st.err[st.src] = ""; draw(); }
    }
    function onChange(e) {
      if (e.target.matches("[data-avtopic]")) { st.topic = e.target.value; draw(); }
      else if (e.target.matches("[data-avwrong]")) { st.wrong = e.target.checked; draw(); }
    }
    function onToggle(e) { const g = e.target.closest && e.target.closest("[data-avk]"); if (g && e.target === g) st.open[g.dataset.avk] = g.open; }

    return {
      /* Вставити перегляд у контейнер (можна викликати після кожного перемальовування сторінки). */
      mount(node) {
        if (!node) return;
        el = node;
        if (!node.dataset.avBound) {
          node.dataset.avBound = "1";
          node.addEventListener("click", onClick);
          node.addEventListener("change", onChange);
          node.addEventListener("toggle", onToggle, true);
        }
        draw();
      },
      reset() { st.cache = {}; st.counts = null; draw(); }
    };
  };
})();
