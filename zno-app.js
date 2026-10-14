/* Розділ «Завдання ЗНО»: список тем, теорія, завдання трьох типів (single, multiple, matching).
   Дані — zno/index.json і zno/t/<id>.json (створює tools/import_zno.py). */
(function () {
  "use strict";

  /* Розмітка в текстах завдань: <u>…</u>, ***…***, **…**, *…*, ![](img/…), \n. */
  function md(src, esc) {
    let h = esc(String(src == null ? "" : src));
    h = h.replace(/&lt;u&gt;/g, "<u>").replace(/&lt;\/u&gt;/g, "</u>");
    h = h.replace(/!\[[^\]]*\]\((img\/[^)\s]+)\)/g, (m, p) => '<img class="zimg" src="zno/' + p + '" alt="Ілюстрація до завдання" loading="lazy">');
    h = emphasis(h);
    // Позначки речень у завданнях на порядок речень: △ ○ ◇ □ ⏢.
    h = h.replace(/(^|\n)\s*([△○◇□⏢])\s*/g, '$1<span class="zshape">$2</span>');
    return h.replace(/\n/g, "<br>");
  }
  /* Перетворює послідовності * на <b>/<i> з правильною вкладеністю тегів. */
  function emphasis(h) {
    const parts = h.split(/(\*{1,3})/);
    const stack = [], out = [];
    const closeTag = t => "</" + t + ">", openTag = t => "<" + t + ">";
    const toggle = tag => {
      const at = stack.lastIndexOf(tag);
      if (at < 0) { stack.push(tag); out.push(openTag(tag)); return; }
      const above = stack.slice(at + 1);
      for (let i = stack.length - 1; i >= at; i--) out.push(closeTag(stack[i]));
      stack.length = at;
      above.forEach(t => { stack.push(t); out.push(openTag(t)); });
    };
    parts.forEach(p => {
      if (p === "***") { toggle("b"); toggle("i"); }
      else if (p === "**") toggle("b");
      else if (p === "*") toggle("i");
      else out.push(p);
    });
    for (let i = stack.length - 1; i >= 0; i--) out.push(closeTag(stack[i]));
    return out.join("").replace(/<(b|i)><\/\1>/g, "");
  }

  window.MGZno = function (host) {
    const { esc, $ } = host;
    const TYPE = { single: "Оберіть одну відповідь", multiple: "Оберіть кілька відповідей", matching: "Установіть відповідність" };
    let index = null, indexErr = false, loadingIndex = null;
    const topicCache = {}, theoryCache = {};
    const resetSet = new Set();
    let pend = null, confirmReset = false;
    const M = s => md(s, esc);
    const plain = s => { const d = document.createElement("div"); d.innerHTML = M(s); d.querySelectorAll("img").forEach(i => i.replaceWith("[зображення]")); return d.textContent.replace(/\s+/g, " ").trim(); };

    function loadIndex() {
      if (index || loadingIndex) return loadingIndex;
      loadingIndex = fetch("zno/index.json").then(r => r.json()).then(d => { index = d; host.setZnoUnique(d.unique); host.render(); })
        .catch(() => { indexErr = true; loadingIndex = null; host.render(); });
      return loadingIndex;
    }
    function loadTopic(id) {
      if (topicCache[id]) return;
      topicCache[id] = "loading";
      fetch("zno/t/" + id + ".json").then(r => r.json()).then(d => { topicCache[id] = d; host.render(); })
        .catch(() => { topicCache[id] = "error"; host.render(); });
    }
    function loadTheory(t) {
      if (!t.theory || theoryCache[t.id]) return;
      theoryCache[t.id] = "loading";
      fetch(t.theory).then(r => r.text()).then(x => { theoryCache[t.id] = x; host.render(); })
        .catch(() => { theoryCache[t.id] = "error"; host.render(); });
    }
    const topicMeta = id => index && index.topics.find(t => t.id === id);

    /* ── Прогрес ── */
    function zstate(id, create) {
      const s = host.me(); if (!s) return null;
      s.zno = s.zno || {};
      if (!s.zno[id] && create) s.zno[id] = { res: {}, ch: {}, att: 1 };
      return s.zno[id] || null;
    }
    function topicStat(t) {
      const st = zstate(t.id); let a = 0, c = 0;
      if (st) t.ids.forEach(id => { const v = st.res[id]; if (v) { a++; if (v === "1") c++; } });
      return { a, c, n: t.n, pct: t.n ? Math.round(c / t.n * 100) : 0 };
    }
    /* Загальний підсумок рахуємо за унікальними завданнями: те саме завдання в кількох темах — один раз. */
    function overall() {
      const s = host.me(), done = new Map();
      if (s && s.zno) for (const tid in s.zno) for (const id in s.zno[tid].res) {
        const v = s.zno[tid].res[id];
        if (v === "1" || !done.has(id)) done.set(id, v);
      }
      let ok = 0; done.forEach(v => { if (v === "1") ok++; });
      return { done: done.size, ok, total: (index && index.unique) || host.getZnoUnique() || 0 };
    }

    /* ── Головна розділу ── */
    function homeHtml() {
      if (!index) { loadIndex(); return indexErr ? '<p class="empty">Не вдалося завантажити завдання ЗНО. Перевірте інтернет і оновіть сторінку.</p>' : '<p class="empty">Завантажую завдання ЗНО…</p>'; }
      const o = overall();
      let h = `<section class="zsum"><div class="overall-top"><span>Завдання ЗНО: <b class="mono">${index.unique}</b> унікальних · тем: ${index.topics.length}</span>
        <span>Правильно: <b class="mono">${o.ok}</b> · <b class="mono">${o.total ? (o.ok / o.total * 100).toFixed(1) : "0.0"}%</b></span></div>
        <div class="bar" aria-hidden="true"><b style="width:${o.total ? o.done / o.total * 100 : 0}%"></b><i style="width:${o.total ? o.ok / o.total * 100 : 0}%"></i></div>
        <p class="hint" style="margin:0">Справжні завдання ЗНО з поясненнями. У кожній темі максимум 100 %: усі завдання теми правильно.</p></section>`;
      index.sections.forEach(sec => {
        const list = index.topics.filter(t => t.sec === sec.id);
        if (!list.length) return;
        h += `<section class="section"><div class="section-h"><span class="mono">${esc(sec.id)}</span><h2>${esc(sec.title)}</h2></div><div class="cards">`;
        list.forEach(t => {
          const st = topicStat(t), aw = t.n ? st.a / t.n * 100 : 0;
          h += `<article class="card"><h3>${esc(t.title)}</h3>
            <div class="bar" aria-hidden="true"><b style="width:${aw}%"></b><i style="width:${st.pct}%"></i></div>
            <div class="meta"><span>Виконано <b class="mono">${st.a}</b>/${t.n}</span><span>Результат <b class="mono">${st.pct}%</b> ${st.pct === 100 ? '<span class="badge100">100%</span>' : ""}</span></div>
            <div class="acts"><button class="btn small" data-zopen="${t.id}" data-tab="theory">Теорія</button><button class="btn small primary" data-zopen="${t.id}" data-tab="tasks">${st.a ? (st.a === t.n ? "Переглянути" : "Продовжити") : "Почати"}</button></div></article>`;
        });
        h += "</div></section>";
      });
      return h;
    }

    /* ── Сторінка теми ── */
    function topicHtml() {
      const ui = host.ui;
      if (!index) { loadIndex(); return '<main class="wrap"><p class="empty">Завантажую…</p></main>'; }
      const t = topicMeta(ui.ztopic);
      if (!t) { ui.view = "home"; return null; }
      let h = `<div class="topbar"><div class="wrap">
        <div class="tb-row"><button class="btn small ghost" data-act="home" aria-label="До списку тем">← Теми</button><span class="tb-title">ЗНО ${esc(t.sec)} · ${esc(t.title)}</span></div>
        <div class="tabs" role="tablist"><button class="tab" role="tab" aria-selected="${ui.tab === "theory"}" data-tabto="theory">Теорія</button><button class="tab" role="tab" aria-selected="${ui.tab === "tasks"}" data-tabto="tasks">Завдання (${t.n})</button></div>
      </div></div><main class="wrap" style="padding-top:0">`;
      h += ui.tab === "theory" ? theoryHtml(t) : tasksHtml(t);
      return h + "</main>";
    }
    function theoryHtml(t) {
      let body = "";
      const trainer = (t.trainer || []).map(id => host.trainerTopic(id)).filter(Boolean);
      if (t.theory) {
        loadTheory(t);
        const x = theoryCache[t.id];
        body += x === "loading" || !x ? '<p class="empty">Завантажую теорію…</p>' : x === "error" ? '<p class="empty">Не вдалося завантажити теорію.</p>' : `<div class="tbody">${x}</div>`;
      }
      trainer.forEach(tt => {
        body += `<section class="ztheory-part">${trainer.length > 1 || t.theory ? `<h3 class="ztheory-h">${esc(tt.title)}</h3>` : ""}<div class="tbody">${tt.theory}</div></section>`;
      });
      if (!body) body = '<p class="empty">Теорію до цієї теми ще готуємо.</p>';
      return `<article class="theory"><h2>${esc(t.title)}</h2>${body}<button class="btn primary to-tasks" data-tabto="tasks">До завдань →</button></article>`;
    }
    function tasksHtml(t) {
      if (!host.loggedIn()) return host.gateHtml();
      loadTopic(t.id);
      const data = topicCache[t.id];
      if (!data || data === "loading") return '<section class="tasks"><p class="empty">Завантажую завдання…</p></section>';
      if (data === "error") return '<section class="tasks"><p class="empty">Не вдалося завантажити завдання. Перевірте інтернет.</p></section>';
      const ui = host.ui, st = zstate(t.id, true), stat = topicStat(t);
      st.n = t.n;
      if (!(ui.zcur >= 0 && ui.zcur < data.tasks.length)) ui.zcur = firstOpen(data, st);
      let h = `<section class="tasks"><div class="tprog">
        <div class="tprog-top"><span>Виконано <b class="mono">${stat.a}</b> з ${t.n}</span><span class="score mono">${stat.pct}%</span></div>
        <div class="bar" role="progressbar" aria-label="Прогрес теми" aria-valuemin="0" aria-valuemax="${t.n}" aria-valuenow="${stat.a}"><b style="width:${stat.a / t.n * 100}%"></b><i style="width:${stat.pct}%"></i></div>
        <button class="btn small ghost map-toggle" data-act="map" aria-expanded="${!!ui.map}">${ui.map ? "Сховати карту завдань ▲" : "Карта завдань ▼"}</button>`;
      if (ui.map) {
        h += '<div class="grid100">';
        data.tasks.forEach((task, i) => { const v = st.res[task.id]; h += `<button class="cell ${v === "1" ? "c1" : v === "0" ? "c0" : ""} ${i === ui.zcur ? "cur" : ""}" data-zgo="${i}" aria-label="Завдання ${i + 1}">${i + 1}</button>`; });
        h += '</div><div class="legend"><span class="l1">правильно</span><span class="l0">помилка</span><span>не виконано</span></div>';
      }
      h += "</div>";
      if (stat.a === t.n && !ui.zreview) {
        h += `<div class="done-card"><h3 style="font-size:18px">Тему завершено: ${stat.pct}%</h3><p style="margin:0">${stat.pct === 100 ? "Бездоганно! Усі завдання правильно." : "Помилки можна переглянути в карті завдань. Щоб покращити результат, почніть тему заново."}</p>
          <div class="task-nav"><button class="btn" data-act="zreview">Переглянути відповіді</button><button class="btn" data-act="home">До тем</button></div></div>`;
      } else h += card(t, data.tasks[ui.zcur], ui.zcur, data.tasks.length, st);
      h += `<div class="foot-acts"><button class="btn small" data-act="finish">Завершити й вийти</button><button class="btn small ghost" data-act="zreset">Почати тему заново</button></div>`;
      if (confirmReset) h += `<div class="confirm"><b>Почати тему заново?</b><span>Усі відповіді цієї теми буде стерто.</span><div class="task-nav"><button class="btn danger" data-act="zreset-yes">Так, стерти</button><button class="btn" data-act="zreset-no">Скасувати</button></div></div>`;
      return h + "</section>";
    }
    function firstOpen(data, st) { const i = data.tasks.findIndex(x => !st.res[x.id]); return i < 0 ? 0 : i; }
    function nextOpen(data, st, from) {
      for (let k = 1; k <= data.tasks.length; k++) { const j = (from + k) % data.tasks.length; if (!st.res[data.tasks[j].id]) return j; }
      return -1;
    }

    /* ── Картка завдання ── */
    function card(t, task, i, n, st) {
      const done = !!st.res[task.id], resp = done ? st.ch[task.id] : undefined;
      if (!pend || pend.id !== task.id) pend = { id: task.id, v: task.type === "multiple" ? [] : task.type === "matching" ? {} : null };
      let h = `<article class="task zt" aria-live="polite"><div class="task-head"><span class="mono">Завдання ${i + 1} / ${n}</span><span class="kind">${TYPE[task.type]}</span></div>
        <div class="zq">${M(task.q)}</div>`;
      h += body(task, done, resp);
      if (done) {
        const ok = st.res[task.id] === "1";
        h += `<div class="fb ${ok ? "good" : "bad"}"><span class="verdict">${ok ? "Правильно!" : "Помилка"}</span>${ok ? "" : `<span>Правильна відповідь: <b>${esc(answerText(task))}</b></span>`}</div>`;
        h += `<details class="zex" open><summary>Пояснення</summary><div class="zex-body">${task.ex ? M(task.ex) : "Пояснення до цього завдання немає."}</div></details>`;
      }
      const ready = !done && (task.type === "multiple" ? pend.v.length > 0 : task.type === "matching" ? task.left.every(l => pend.v[l[0]]) : false);
      h += `<div class="task-nav"><button class="btn" data-act="zprev" ${i === 0 ? "disabled" : ""} aria-label="Попереднє завдання">←</button>`;
      if (!done && task.type !== "single") h += `<button class="btn primary grow" data-act="zcheck" ${ready ? "" : "disabled"}>Перевірити</button>`;
      else if (done) h += `<button class="btn primary grow" data-act="znext-open">${nextOpen(topicCache[t.id], st, i) >= 0 ? "Далі →" : "Готово"}</button>`;
      else h += `<span class="hint" style="align-self:center">Торкніться відповіді</span>`;
      h += `<button class="btn" data-act="znext" ${i === n - 1 ? "disabled" : ""} aria-label="Наступне завдання (пропустити)">→</button></div></article>`;
      return h;
    }
    function answerText(task) {
      if (task.type === "single") return task.a;
      if (task.type === "multiple") return task.a.join(", ");
      return task.left.map(l => l[0] + "–" + task.a[l[0]]).join(", ");
    }
    function body(task, done, resp) {
      const dis = done ? "disabled" : "";
      if (task.type === "single") {
        return '<div class="opts">' + task.opts.map(([k, txt]) => {
          let cls = "", tag = "";
          if (done) { if (k === task.a) { cls = "ok"; tag = "✓"; } else if (k === resp) { cls = "no"; tag = "✗"; } }
          return `<button class="opt zopt ${/!\[/.test(txt) ? "has-img" : ""} ${cls}" data-zone="${esc(k)}" ${dis}><span class="key">${esc(k)}</span><span class="otext">${M(txt)}</span>${tag ? `<span class="tag">${tag}</span>` : ""}</button>`;
        }).join("") + "</div>";
      }
      if (task.type === "multiple") {
        const chosen = done ? (resp || []) : pend.v;
        return '<div class="opts">' + task.opts.map(([k, txt]) => {
          const on = chosen.includes(k), right = task.a.includes(k);
          let cls = on ? "sel" : "", tag = "";
          if (done) { cls = right && on ? "ok" : on ? "no" : right ? "miss" : ""; tag = right && on ? "✓" : on ? "✗" : right ? "пропущено" : ""; }
          return `<button class="opt zopt ${cls}" data-zmulti="${esc(k)}" aria-pressed="${on}" ${dis}><span class="key">${esc(k)}</span><span class="otext">${M(txt)}</span>${tag ? `<span class="tag">${tag}</span>` : ""}</button>`;
        }).join("") + "</div>";
      }
      /* matching */
      const v = done ? (resp || {}) : pend.v;
      const [tl, tr] = task.titles || ["", ""];
      let h = "";
      h += `<div class="zright">${tr ? `<div class="zcol-title">${M(tr)}</div>` : ""}<ul>` + task.right.map(([k, txt]) => `<li><span class="key">${esc(k)}</span><span class="otext">${M(txt)}</span></li>`).join("") + "</ul></div>";
      h += `<div class="sort-list zmatch">${tl ? `<div class="zcol-title">${M(tl)}</div>` : ""}` + task.left.map(([lk, ltxt]) => {
        const chips = task.right.map(([rk]) => {
          let cls = v[lk] === rk ? "on" : "";
          if (done) cls = rk === task.a[lk] ? "ok" : v[lk] === rk ? "no" : "";
          return `<button class="${cls}" data-zmatch="${esc(lk)}|${esc(rk)}" aria-pressed="${v[lk] === rk}" ${dis}>${esc(rk)}</button>`;
        }).join("");
        return `<div class="sort-item${ltxt ? "" : " znum"}"><div class="w"><span class="key">${esc(lk)}</span>${ltxt ? `<span class="otext">${M(ltxt)}</span>` : ""}</div><div class="seg" role="group" aria-label="Відповідь для ${esc(lk)}">${chips}</div></div>`;
      }).join("") + "</div>";
      if (!done) h += '<span class="hint">Для кожного номера оберіть букву.</span>';
      return h;
    }
    function check(task, resp) {
      if (task.type === "single") return resp === task.a;
      if (task.type === "multiple") { const a = [...resp].sort(), b = [...task.a].sort(); return a.length === b.length && a.every((x, i) => x === b[i]); }
      return task.left.every(([lk]) => resp[lk] === task.a[lk]);
    }
    function respText(task, resp) {
      if (task.type === "single") return resp + ". " + plain((task.opts.find(o => o[0] === resp) || ["", ""])[1]);
      if (task.type === "multiple") return resp.join(", ");
      return task.left.map(([lk]) => lk + "–" + (resp[lk] || "?")).join(", ");
    }
    function answer(t, task, resp) {
      const st = zstate(t.id, true);
      if (st.res[task.id]) return;
      const ok = check(task, resp);
      st.res[task.id] = ok ? "1" : "0";
      st.ch[task.id] = resp;
      const s = host.me();
      (s.queue = s.queue || []).push({
        id: host.currentKey() + "|" + t.id + "|" + (st.att || 1) + "|" + task.id, topic: t.id, att: st.att || 1,
        n: host.ui.zcur + 1, type: task.type, ok, at: Date.now(),
        q: plain(task.q).slice(0, 400), ans: respText(task, resp), right: answerText(task)
      });
      pend = null; host.saveLocal(); host.scheduleSync(); host.render();
    }

    /* ── Події ── */
    function onClick(b) {
      const d = b.dataset, ui = host.ui;
      if (d.zopen) { Object.assign(ui, { view: "ztopic", ztopic: d.zopen, tab: d.tab, zcur: -1, zreview: false, map: false }); confirmReset = false; pend = null; host.render(); window.scrollTo(0, 0); return true; }
      if (ui.view !== "ztopic") return false;
      const t = topicMeta(ui.ztopic), data = topicCache[ui.ztopic];
      if (d.tabto) { ui.tab = d.tabto; host.render(); window.scrollTo(0, 0); return true; }
      if (d.act === "map") { ui.map = !ui.map; host.render(); return true; }
      if (d.act === "zreview") { ui.zreview = true; ui.zcur = 0; ui.map = true; host.render(); return true; }
      if (d.act === "zreset") { confirmReset = true; host.render(); return true; }
      if (d.act === "zreset-no") { confirmReset = false; host.render(); return true; }
      if (d.act === "zreset-yes") {
        const s = host.me(); s.zno = s.zno || {};
        const prev = (s.zno[ui.ztopic] && s.zno[ui.ztopic].att) || 1;
        s.zno[ui.ztopic] = { res: {}, ch: {}, att: prev + 1, n: t ? t.n : 0 };
        resetSet.add(ui.ztopic); confirmReset = false; ui.zcur = 0; ui.zreview = false; pend = null;
        host.saveLocal(); host.scheduleSync(true); host.render(); host.toast("Тему почато заново"); return true;
      }
      if (!t || !data || typeof data !== "object") return false;
      const n = data.tasks.length;
      if (d.zgo !== undefined) { ui.zcur = +d.zgo; ui.zreview = true; pend = null; host.render(); host.scrollTask(); return true; }
      if (d.act === "zprev") { ui.zcur = Math.max(0, ui.zcur - 1); ui.zreview = true; pend = null; host.render(); host.scrollTask(); return true; }
      if (d.act === "znext") { ui.zcur = Math.min(n - 1, ui.zcur + 1); ui.zreview = true; pend = null; host.render(); host.scrollTask(); return true; }
      if (d.act === "znext-open") { const j = nextOpen(data, zstate(t.id, true), ui.zcur); if (j < 0) ui.zreview = false; else ui.zcur = j; pend = null; host.render(); host.scrollTask(); return true; }
      if (!host.loggedIn()) return false;
      const task = data.tasks[ui.zcur];
      if (d.zone !== undefined) { answer(t, task, d.zone); return true; }
      if (d.zmulti !== undefined) { const ix = pend.v.indexOf(d.zmulti); if (ix >= 0) pend.v.splice(ix, 1); else pend.v.push(d.zmulti); host.render(); return true; }
      if (d.zmatch) { const [lk, rk] = d.zmatch.split("|"); pend.v[lk] = rk; host.render(); return true; }
      if (d.act === "zcheck") {
        if (task.type === "multiple" && pend.v.length) answer(t, task, pend.v.slice().sort());
        else if (task.type === "matching" && task.left.every(l => pend.v[l[0]])) answer(t, task, Object.assign({}, pend.v));
        return true;
      }
      return false;
    }

    /* ── Синхронізація з таблицею ── */
    function payload() {
      const s = host.me(); if (!s || !s.zno) return null;
      const zno = {};
      for (const tid in s.zno) {
        const st = s.zno[tid], ids = Object.keys(st.res);
        if (!ids.length && !resetSet.has(tid)) continue;
        const meta = topicMeta(tid);
        zno[tid] = { s: ids.map(id => id + ":" + st.res[id]).join(";"), n: (meta && meta.n) || st.n || 0 };
      }
      if (!Object.keys(zno).length) return null;
      const o = overall();
      return { zno, znoTotal: { ok: o.ok, done: o.done, total: o.total }, sentResets: [...resetSet] };
    }
    function sent(p) { (p.sentResets || []).forEach(id => resetSet.delete(id)); }
    function merge(rec, fromServer) {
      if (!fromServer) return;
      rec.zno = rec.zno || {};
      for (const tid in fromServer) {
        if (resetSet.has(tid)) continue;
        const st = rec.zno[tid] || (rec.zno[tid] = { res: {}, ch: {}, att: 1 });
        String(fromServer[tid] || "").split(";").forEach(pair => {
          const m = pair.match(/^(\d+):([01])$/);
          if (m && !st.res[m[1]]) st.res[m[1]] = m[2];
        });
      }
    }
    function reportLines() {
      if (!index) return [];
      const o = overall(), lines = ["", "Завдання ЗНО:"];
      index.topics.forEach(t => { const st = topicStat(t); if (st.a) lines.push(t.sec + " " + t.title + ": " + st.pct + "% (виконано " + st.a + "/" + t.n + ")"); });
      lines.push("ЗНО разом: " + o.ok + " з " + o.total + " унікальних завдань");
      return lines;
    }

    return { homeHtml, topicHtml, onClick, payload, sent, merge, reportLines, loadIndex, md: M };
  };
})();
