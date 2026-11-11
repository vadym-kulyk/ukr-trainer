/* Урок у класі: учитель зупиняє роботу учнів і показує тему чи завдання — на своєму екрані (проєктор)
   і, за бажанням, на пристроях учнів. Поверх тексту можна підкреслювати (як члени речення), виділяти маркером,
   обводити, закреслювати й малювати пером.
   Сторінка вчителя — сайт тренажера з адресою #show (потрібен вхід в адмін-панель на цьому ж пристрої, щоб керувати учнями).
   Стан уроку — у скрипті таблиці: учитель надсилає admin_class_set, учні раз на кілька секунд питають class_state.
   Позначки в тексті прив’язані до символів, тож на будь-якому екрані стоять там само; малюнки пером — до координат сторінки показу. */
(function () {
  "use strict";

  window.MGShow = function (host) {
    const { esc, T, S, E } = host;
    const API = host.apiUrl;
    const ALS = "mg-admin-session-v1", CLS_LS = "mg-show-classes", LS = "mg-show-v1";
    const ZTYPE = { single: "Оберіть одну відповідь", multiple: "Оберіть кілька відповідей", matching: "Установіть відповідність" };
    /* Інструменти: k — клас позначки в тексті; pen/mkr — малювання. */
    const TOOLS = [
      ["u-sub", "Підмет", "одна риса"], ["u-pred", "Присудок", "дві риси"], ["u-attr", "Означення", "хвиляста"],
      ["u-obj", "Додаток", "пунктир"], ["u-adv", "Обставина", "риска з крапкою"],
      ["hl", "Маркер", "виділити текст"], ["box", "Обвести", "рамка навколо слова"], ["st", "Закреслити", "показати помилку"],
      ["pen", "Перо", "малювати від руки"], ["mkr", "Фломастер", "широка прозора лінія"], ["erase", "Гумка", "торкніться позначки, щоб прибрати"]
    ];
    const COLORS = [["#e5484d", "червоний"], ["#2445c7", "синій"], ["#1e9e5a", "зелений"], ["#f5b800", "жовтий"], ["#8b3a9e", "фіолетовий"]];

    /* ───── Спільне: зміст слайда ───── */
    const zIdx = { d: null, p: null }, zTasks = {}, zTheory = {};
    function zIndex(cb) {
      if (zIdx.d) return zIdx.d;
      if (!zIdx.p) zIdx.p = fetch("zno/index.json").then(r => r.json()).then(d => { zIdx.d = d; cb && cb(); }).catch(() => { zIdx.p = null; });
      return null;
    }
    function zData(id, cb) {
      if (zTasks[id] && zTasks[id] !== "loading") return zTasks[id];
      if (!zTasks[id]) { zTasks[id] = "loading"; fetch("zno/t/" + id + ".json").then(r => r.json()).then(d => { zTasks[id] = d; cb && cb(); }).catch(() => { zTasks[id] = "error"; cb && cb(); }); }
      return zTasks[id] === "error" ? "error" : null;
    }
    function zTheoryOf(id, cb) {
      if (zTheory[id] && zTheory[id] !== "loading") return zTheory[id];
      if (!zTheory[id]) { zTheory[id] = "loading"; host.Z.theoryFor(id).then(x => { zTheory[id] = x; cb && cb(); }).catch(() => { zTheory[id] = { title: "", html: '<p class="empty">Не вдалося завантажити теорію.</p>' }; cb && cb(); }); }
      return null;
    }
    const secTitle = id => (S.find(x => x.id === id) || {}).title || "";
    /* Правильна відповідь тренажерного завдання у форматі відповіді учня — щоб показати її так, як після перевірки. */
    function rightResp(task) {
      if (task.t === "one" || task.t === "multi") return task.a;
      if (task.t === "sort") return task.items.map(it => it.c);
      if (task.t === "match") return task.left.map((_, k) => task.right.findIndex(r => r.li === k));
      if (task.t === "order") return task.items.map((_, k) => k);
      return undefined;
    }
    function countOf(s) {
      if (s.src === "t") return E.TOTAL;
      const d = zData(s.id); return d && d.tasks ? d.tasks.length : 0;
    }
    function titleOf(s) {
      if (s.src === "t") { const t = T.find(x => x.id === s.id); return t ? t.title : ""; }
      const ix = zIdx.d, t = ix && ix.topics.find(x => x.id === s.id); return t ? "ЗНО: " + t.title : "Тема ЗНО";
    }
    /* Повертає { html, ok }: ok = зміст повністю завантажено (лише тоді накладаємо позначки). */
    function docHtml(s, cb) {
      if (s.src === "t") {
        const t = T.find(x => x.id === s.id); if (!t) return { html: '<p class="empty">Тему не знайдено.</p>', ok: true };
        if (s.view !== "task") {
          const th = host.theoryCached(t.id);
          if (th == null) host.loadTheory(t.id).then(() => cb && cb());
          return { ok: th != null, html: `<article class="theory"><header class="t-cover"><div><span class="t-sec">${esc(t.sec)} ${esc(secTitle(t.sec))}</span><h2>${esc(t.title)}</h2></div></header>
            <div class="tbody">${th == null ? '<p class="empty">Завантажую теорію…</p>' : th}</div></article>` };
        }
        const task = host.tasksOf(t.id)[s.n]; if (!task) return { html: '<p class="empty">Завдання не знайдено.</p>', ok: true };
        let h = `<article class="task"><div class="task-head"><span class="mono">Завдання ${s.n + 1} / ${E.TOTAL}</span><span class="kind">${esc(host.typeName(task.t) || "")}</span></div>
          <h3 class="task-q">${task.q}</h3>${task.big ? `<div class="big">${task.big}</div>` : ""}`;
        h += host.trainerBody(task, !!s.rev, s.rev ? rightResp(task) : undefined, host.trainerNewPend(task, t.id));
        if (s.rev) h += `<div class="fb good"><span class="verdict">Розв’язок</span>${host.correctHtml(task)}${task.note ? `<span>${task.note}</span>` : ""}</div>`;
        return { html: h + "</article>", ok: true };
      }
      if (s.view !== "task") {
        const x = zTheoryOf(s.id, cb);
        if (!x) return { html: '<p class="empty">Завантажую теорію…</p>', ok: false };
        return { ok: true, html: `<article class="theory"><h2>${esc(x.title || titleOf(s))}</h2>${x.html}</article>` };
      }
      const d = zData(s.id, cb);
      if (d === "error") return { html: '<p class="empty">Не вдалося завантажити завдання.</p>', ok: true };
      if (!d) return { html: '<p class="empty">Завантажую завдання…</p>', ok: false };
      const task = d.tasks[s.n]; if (!task) return { html: '<p class="empty">Завдання не знайдено.</p>', ok: true };
      const p = { id: task.id, v: task.type === "multiple" ? [] : task.type === "matching" ? {} : null };
      const v = host.Z.taskView(task, !!s.rev, s.rev ? task.a : undefined, p);
      let h = `<article class="task zt"><div class="task-head"><span class="mono">Завдання ${s.n + 1} / ${d.tasks.length}</span><span class="kind">${ZTYPE[task.type] || ""}</span></div><div class="zq">${v.q}</div>${v.body}`;
      if (s.rev) h += `<div class="fb good"><span class="verdict">Правильна відповідь: ${esc(host.Z.answerText(task))}</span></div>${task.ex ? `<div class="sd-ex">${host.Z.md(task.ex)}</div>` : ""}`;
      return { html: h + "</article>", ok: true };
    }

    /* Слайд лише для показу: кнопки варіантів стають звичайними блоками (у кнопках текст не виділиш),
       згорнуті частини теорії розгортаємо — однаково у вчителя й учнів, тож позначки стоять на тих самих словах. */
    function freeze(root) {
      root.querySelectorAll("button").forEach(b => { const d = document.createElement("div"); d.className = (b.className + " sd-btn").trim(); d.innerHTML = b.innerHTML; b.replaceWith(d); });
      root.querySelectorAll("details").forEach(d => { d.open = true; });
      root.querySelectorAll("input, textarea, select").forEach(el => { el.disabled = true; el.tabIndex = -1; });
    }
    /* ───── Позначки в тексті: зміщення символів від початку слайда ───── */
    function textPos(root, node, off) { const r = document.createRange(); r.setStart(root, 0); r.setEnd(node, off); return r.toString().length; }
    const BLOCK = "p,div,ul,ol,li,table,thead,tbody,tr,td,th,h1,h2,h3,h4,h5,section,article,header,br,details,summary,figure";
    function markEl(m, i) { const w = document.createElement("span"); w.className = "mk mk-" + m.k; w.dataset.mi = i; w.style.setProperty("--mc", m.c); return w; }
    function applyMarks(root, marks) {
      marks.forEach((m, i) => {
        const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), segs = [];
        let pos = 0, r0 = null, r1 = null;
        for (let n = tw.nextNode(); n; n = tw.nextNode()) {
          const L = n.data.length, a = Math.max(m.s, pos), b = Math.min(m.e, pos + L);
          if (a < b) { if (!r0) r0 = [n, a - pos]; r1 = [n, b - pos]; if (n.data.trim()) segs.push([n, a - pos, b - pos]); }
          pos += L; if (pos >= m.e) break;
        }
        if (!r0) return;
        /* Цілим шматком, якщо позначка не перетинає меж абзаців (тоді рамка й лінія суцільні навіть через наголошену літеру). */
        try {
          const r = document.createRange(); r.setStart(r0[0], r0[1]); r.setEnd(r1[0], r1[1]);
          if (!r.cloneContents().querySelector(BLOCK)) { r.surroundContents(markEl(m, i)); return; }
        } catch (e) {}
        segs.forEach(([n, a, b]) => {
          let t = n; if (a > 0) t = t.splitText(a); if (b - a < t.data.length) t.splitText(b - a);
          const w = markEl(m, i); t.parentNode.insertBefore(w, t); w.appendChild(t);
        });
      });
    }
    /* Малюнки: точки в тисячних частках ширини слайда. */
    function drawInk(cv, wrap, strokes, live) {
      const W = wrap.offsetWidth, H = wrap.offsetHeight, dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); cv.style.width = W + "px"; cv.style.height = H + "px"; }
      const g = cv.getContext("2d"); g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
      const k = W / 1000;
      strokes.concat(live ? [live] : []).forEach(st => {
        const p = st.p; if (!p || p.length < 2) return;
        g.globalAlpha = st.k === "mkr" ? 0.35 : 1; g.strokeStyle = st.c; g.lineWidth = Math.max(1, st.w * k); g.lineCap = "round"; g.lineJoin = "round";
        g.beginPath(); g.moveTo(p[0] * k, p[1] * k);
        if (p.length === 2) g.lineTo(p[0] * k + 0.1, p[1] * k);
        for (let i = 2; i < p.length; i += 2) g.lineTo(p[i] * k, p[i + 1] * k);
        g.stroke();
      });
      g.globalAlpha = 1;
    }

    /* ═════════ Сторінка вчителя ═════════ */
    let sh = { src: "t", id: T[0].id, view: "theory", n: 0, rev: false, tool: "u-sub", color: COLORS[0][0], to: "all", msg: "", notes: {}, mode: "off", open: true };
    try { const x = JSON.parse(localStorage.getItem(LS) || "null"); if (x) sh = Object.assign(sh, x); } catch (e) {}
    let synced = false, sending = false, again = false, pushTimer = null, lastErr = "", liveStroke = null, mounted = null;
    const save = () => { try { const keys = Object.keys(sh.notes); if (keys.length > 40) keys.slice(0, keys.length - 40).forEach(k => delete sh.notes[k]); localStorage.setItem(LS, JSON.stringify(sh)); } catch (e) {} };
    const slideKey = s => s.src + ":" + s.id + ":" + s.view + (s.view === "task" ? ":" + s.n : "");
    const notes = () => sh.notes[slideKey(sh)] || (sh.notes[slideKey(sh)] = { mk: [], ink: [] });
    function admin() { try { const a = JSON.parse(localStorage.getItem(ALS) || "null"); return a && a.aexp > Date.now() ? a : null; } catch (e) { return null; } }
    function classes() { try { const c = JSON.parse(localStorage.getItem(CLS_LS) || "[]"); return Array.isArray(c) ? c : []; } catch (e) { return []; } }

    async function call(body) {
      const a = admin(); if (!a || !API) return null;
      try {
        const r = await fetch(API, { method: "POST", credentials: "omit", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(Object.assign(body, { atoken: a.atoken, aexp: a.aexp })) });
        return JSON.parse(await r.text());
      } catch (e) { return null; }
    }
    function payload() {
      const st = { mode: sh.mode, to: sh.to || "all", msg: sh.msg || "" };
      if (sh.mode === "show") {
        const wrap = document.getElementById("sd-wrap");
        st.show = { src: sh.src, id: sh.id, view: sh.view, n: sh.n, rev: sh.rev, w: wrap ? wrap.offsetWidth : 860, fy: scrollFrac() };
        const nt = notes(); st.mk = nt.mk; st.ink = nt.ink;
      }
      return st;
    }
    async function push() {
      clearTimeout(pushTimer); pushTimer = null;
      if (!admin() || !API) return;
      if (sending) { again = true; return; }
      sending = true;
      const d = await call({ action: "admin_class_set", st: payload() });
      sending = false;
      lastErr = !d ? "Немає зв’язку з сервером — повторюю…" : d.ok ? "" : d.error === "admin_auth" ? "Сесія адмін-панелі завершилась — увійдіть знову." : d.error === "too_big" ? "Забагато позначок на слайді — очистіть частину." : d.error === "unknown" || d.error === "auth" ? "Оновіть Code.gs у таблиці (потрібна версія 19)." : "Помилка: " + d.error;
      if (!d) setTimeout(() => { if (sh.mode !== "off") push(); }, 4000);
      statusPaint();
      if (again) { again = false; push(); }
    }
    const pushSoon = ms => { if (sh.mode === "off" && !pushTimer) return; clearTimeout(pushTimer); pushTimer = setTimeout(push, ms == null ? 350 : ms); };
    async function syncMode() {
      if (synced || !admin() || !API) return; synced = true;
      const d = await call({ action: "admin_class_get" });
      if (d && d.ok && d.st) { sh.mode = d.st.mode || "off"; if (d.st.to) sh.to = d.st.to; if (d.st.msg != null) sh.msg = d.st.msg; save(); if (host.ui.view === "show") render(); }
    }
    function scrollFrac() {
      const doc = document.getElementById("sd-wrap"), top = document.querySelector(".sh-top");
      if (!doc) return 0;
      const r = doc.getBoundingClientRect(), off = (top && getComputedStyle(top).position === "sticky" ? top.offsetHeight : 0) - r.top;
      return Math.max(0, Math.min(1, off / Math.max(1, r.height)));
    }

    function optionsHtml() {
      const cur = sh.src + ":" + sh.id;
      let h = "";
      S.forEach(sec => {
        const list = T.filter(t => t.sec === sec.id); if (!list.length) return;
        h += `<optgroup label="Тренажер · ${esc(sec.id + " " + sec.title)}">${list.map(t => `<option value="t:${t.id}" ${cur === "t:" + t.id ? "selected" : ""}>${esc(t.title)}</option>`).join("")}</optgroup>`;
      });
      const ix = zIndex(() => render());
      if (ix) ix.sections.forEach(sec => {
        const list = ix.topics.filter(t => t.sec === sec.id); if (!list.length) return;
        h += `<optgroup label="ЗНО · ${esc(sec.id + " " + sec.title)}">${list.map(t => `<option value="z:${t.id}" ${cur === "z:" + t.id ? "selected" : ""}>${esc(t.title)}</option>`).join("")}</optgroup>`;
      });
      else if (sh.src === "z") h += `<option value="z:${esc(sh.id)}" selected>Тема ЗНО</option>`;
      return h;
    }
    function toolsHtml() {
      return TOOLS.map(([k, l, hint]) => `<button type="button" class="btn sh-tool" data-sh="tool" data-t="${k}" aria-pressed="${sh.tool === k}" title="${esc(l + " — " + hint)}">${
        k.startsWith("u-") || k === "hl" || k === "box" || k === "st" ? `<span class="mk mk-${k}" style="--mc:${sh.color}">${l}</span>` : esc(l)}</button>`).join("")
        + `<span class="sh-cols" role="group" aria-label="Колір">${COLORS.map(([c, n]) => `<button type="button" class="sh-col" data-sh="color" data-c="${c}" style="background:${c}" aria-pressed="${sh.color === c}" aria-label="${n}" title="${n}"></button>`).join("")}</span>
        <button type="button" class="btn" data-sh="undo" title="Прибрати останню позначку">↶ Назад</button><button type="button" class="btn" data-sh="clear" title="Прибрати всі позначки з цього слайда">Очистити</button>`;
    }
    function classHtml() {
      const a = admin(), cl = classes();
      if (!API) return '<p class="hint">Таблицю результатів не підключено, тож зупиняти роботу учнів не вийде. Показ на екрані працює.</p>';
      if (!a) return `<p class="hint">Щоб зупиняти роботу учнів і показувати їм слайд, увійдіть в <a href="admin.html" target="_blank" rel="noopener">адмін-панель</a> на цьому пристрої, а потім поверніться сюди. Показ на власному екрані працює й без входу.</p>`;
      const toOpts = [["all", "Усім учням"]].concat(cl.map(c => ["class:" + c, "Клас " + c]));
      if (!toOpts.some(o => o[0] === sh.to)) toOpts.push([sh.to, sh.to.startsWith("class:") ? "Клас " + sh.to.slice(6) : "Вибрані учні"]);
      return `<div class="sh-row"><label class="sh-lab">Кому <select class="sh-sel sm" id="sh-to">${toOpts.map(([v, l]) => `<option value="${esc(v)}" ${sh.to === v ? "selected" : ""}>${esc(l)}</option>`).join("")}</select></label>
        <input class="sh-msg" id="sh-msg" maxlength="300" placeholder="Повідомлення учням (необов’язково)" value="${esc(sh.msg)}"></div>
        <div class="sh-row"><button type="button" class="btn ${sh.mode === "pause" ? "primary" : ""}" data-sh="mode" data-m="pause">⏸ Зупинити роботу</button>
        <button type="button" class="btn ${sh.mode === "show" ? "primary" : ""}" data-sh="mode" data-m="show">Показувати учням</button>
        <button type="button" class="btn" data-sh="mode" data-m="off" ${sh.mode === "off" ? "disabled" : ""}>▶ Відновити роботу</button>
        <span class="sh-status" id="sh-status"></span></div>`;
    }
    function statusPaint() {
      const el = document.getElementById("sh-status"); if (!el) return;
      const who = sh.to === "all" ? "усі учні" : sh.to.startsWith("class:") ? "клас " + sh.to.slice(6) : "вибрані учні";
      el.className = "sh-status" + (lastErr ? " err" : sh.mode !== "off" ? " on" : "");
      el.textContent = lastErr || (sh.mode === "pause" ? "Роботу зупинено: " + who + " бачать екран паузи." : sh.mode === "show" ? "Трансляція: " + who + " бачать цей слайд і ваші позначки." : "Учні працюють як звичайно.");
    }
    function pageHtml() {
      const n = sh.view === "task" ? countOf(sh) : 0;
      return `<div class="sh-top"><div class="wrap sh-in">
        <div class="sh-row"><button type="button" class="btn ghost" data-sh="exit" aria-label="Повернутися на сайт">← Сайт</button>
          <select class="sh-sel" id="sh-topic" aria-label="Тема">${optionsHtml()}</select>
          <div class="seg sh-seg" role="group" aria-label="Що показати"><button type="button" class="${sh.view !== "task" ? "on" : ""}" data-sh="view" data-v="theory">Теорія</button><button type="button" class="${sh.view === "task" ? "on" : ""}" data-sh="view" data-v="task">Завдання</button></div>
          ${sh.view === "task" ? `<span class="sh-nav"><button type="button" class="btn" data-sh="step" data-d="-1" aria-label="Попереднє завдання" ${sh.n <= 0 ? "disabled" : ""}>←</button><input class="sh-n" id="sh-n" type="number" inputmode="numeric" min="1" max="${n || 1}" value="${sh.n + 1}" aria-label="Номер завдання"><span class="muted">/ ${n || "…"}</span><button type="button" class="btn" data-sh="step" data-d="1" aria-label="Наступне завдання" ${n && sh.n >= n - 1 ? "disabled" : ""}>→</button></span>
          <button type="button" class="btn ${sh.rev ? "primary" : ""}" data-sh="rev">${sh.rev ? "Сховати відповідь" : "Показати відповідь"}</button>` : ""}
          <span class="spacer"></span><button type="button" class="btn ghost" data-sh="panel" aria-expanded="${sh.open}">${sh.open ? "Сховати панель ▲" : "Панель ▼"}</button></div>
        ${sh.open ? `<div class="sh-row sh-tools" role="toolbar" aria-label="Позначки">${toolsHtml()}</div><div class="sh-class">${classHtml()}</div>` : ""}
        <p class="hint sh-hint">${sh.tool === "pen" || sh.tool === "mkr" ? "Малюйте мишкою чи пальцем просто на слайді." : sh.tool === "erase" ? "Торкніться позначки або лінії, щоб прибрати її." : "Виділіть слова на слайді — позначка з’явиться сама."}</p>
      </div></div>
      <main class="sh-main"><div class="sd-wrap ${sh.tool === "pen" || sh.tool === "mkr" ? "draw" : ""} ${sh.tool === "erase" ? "erase" : ""}" id="sd-wrap"><div class="show-doc" id="sd-doc"></div><canvas class="sd-ink" id="sd-ink" aria-hidden="true"></canvas></div></main>`;
    }
    /* Зміст слайда з позначками; tries — дочекатися завантаження теорії чи завдань. */
    function mountDoc() {
      const doc = document.getElementById("sd-doc"), wrap = document.getElementById("sd-wrap"), cv = document.getElementById("sd-ink");
      if (!doc) return;
      const key = slideKey(sh), x = docHtml(sh, () => { if (host.ui.view === "show" && slideKey(sh) === key) { mountDoc(); refreshNav(); } });
      doc.innerHTML = x.html; freeze(doc);
      if (x.ok) applyMarks(doc, notes().mk);
      mounted = x.ok ? key : null;
      drawInk(cv, wrap, x.ok ? notes().ink : []);
    }
    function refreshNav() { if (sh.view === "task") { const n = countOf(sh); const inp = document.getElementById("sh-n"); if (inp && n) { inp.max = n; const m = inp.nextElementSibling; if (m) m.textContent = "/ " + n; } } }
    function render() {
      const app = host.app;
      const y = window.scrollY;
      app.innerHTML = pageHtml();
      mountDoc(); statusPaint();
      window.scrollTo(0, y);
      syncMode();
    }
    function go(patch, keepScroll) {
      Object.assign(sh, patch); save(); render();
      if (!keepScroll) window.scrollTo(0, 0);
      if (sh.mode === "show") pushSoon(150);
    }
    function addNote(kind, item) { item.t = Date.now(); notes()[kind].push(item); save(); mountDoc(); if (sh.mode === "show") pushSoon(); }

    function onClick(e) {
      if (host.ui.view !== "show") return;
      if (e.stopImmediatePropagation) e.stopImmediatePropagation(); // решта обробників сайту на сторінці показу не потрібна
      const b = e.target.closest("[data-sh]");
      if (!b) { if (sh.tool === "erase") eraseAt(e); return; }
      const d = b.dataset, a = d.sh;
      if (a === "exit") { history.replaceState(null, "", location.pathname + location.search); host.leave(); return; }
      if (a === "view") return go({ view: d.v, rev: false });
      if (a === "step") { const n = countOf(sh); return go({ n: Math.max(0, Math.min((n || 1) - 1, sh.n + Number(d.d))), rev: false }); }
      if (a === "rev") return go({ rev: !sh.rev }, true);
      if (a === "panel") { sh.open = !sh.open; save(); render(); return; }
      if (a === "tool") { sh.tool = d.t; save(); render(); return; }
      if (a === "color") { sh.color = d.c; save(); render(); return; }
      if (a === "undo") {
        const nt = notes(), lm = nt.mk.length ? nt.mk[nt.mk.length - 1].t : -1, li = nt.ink.length ? nt.ink[nt.ink.length - 1].t : -1;
        if (lm < 0 && li < 0) return;
        if (lm >= li) nt.mk.pop(); else nt.ink.pop();
        save(); mountDoc(); if (sh.mode === "show") pushSoon(); return;
      }
      if (a === "clear") { sh.notes[slideKey(sh)] = { mk: [], ink: [] }; save(); mountDoc(); if (sh.mode === "show") pushSoon(); return; }
      if (a === "mode") { sh.mode = d.m; save(); render(); lastErr = ""; push(); return; }
    }
    function onChange(e) {
      if (host.ui.view !== "show") return;
      const el = e.target;
      if (el.id === "sh-topic") { const [src, id] = el.value.split(":"); return go({ src, id, n: 0, rev: false }); }
      if (el.id === "sh-n") { const n = countOf(sh), v = Math.round(Number(el.value)) - 1; if (v >= 0 && (!n || v < n)) go({ n: v, rev: false }); else el.value = sh.n + 1; return; }
      if (el.id === "sh-to") { sh.to = el.value; save(); statusPaint(); if (sh.mode !== "off") push(); return; }
      if (el.id === "sh-msg") { sh.msg = el.value.trim(); save(); if (sh.mode !== "off") push(); }
    }
    /* Виділили текст на слайді — ставимо позначку вибраним інструментом. */
    function onSelectEnd() {
      if (host.ui.view !== "show" || !TEXT_TOOL(sh.tool)) return;
      setTimeout(() => {
        const sel = window.getSelection(), doc = document.getElementById("sd-doc");
        if (!sel || sel.isCollapsed || !doc || mounted !== slideKey(sh)) return;
        const r = sel.getRangeAt(0);
        if (!doc.contains(r.startContainer) || !doc.contains(r.endContainer)) return;
        const s = textPos(doc, r.startContainer, r.startOffset), en = textPos(doc, r.endContainer, r.endOffset);
        sel.removeAllRanges();
        if (en - s < 1 || !r.toString().trim()) return;
        addNote("mk", { s, e: en, k: sh.tool, c: sh.color });
      }, 0);
    }
    const TEXT_TOOL = t => t && (t.startsWith("u-") || t === "hl" || t === "box" || t === "st");
    function eraseAt(e) {
      const wrap = document.getElementById("sd-wrap"); if (!wrap || !wrap.contains(e.target)) return;
      const r = wrap.getBoundingClientRect(), k = 1000 / r.width, x = (e.clientX - r.left) * k, y = (e.clientY - r.top) * k, tol = 14 * k;
      const nt = notes();
      const hit = nt.ink.findIndex(st => { for (let i = 0; i < st.p.length; i += 2) if (Math.hypot(st.p[i] - x, st.p[i + 1] - y) < tol + st.w / 2) return true; return false; });
      if (hit >= 0) { nt.ink.splice(hit, 1); save(); mountDoc(); if (sh.mode === "show") pushSoon(); return; }
      const m = e.target.closest(".mk[data-mi]");
      if (m) { nt.mk.splice(Number(m.dataset.mi), 1); save(); mountDoc(); if (sh.mode === "show") pushSoon(); }
    }
    /* Малювання пером. */
    function penDown(e) {
      if (host.ui.view !== "show" || (sh.tool !== "pen" && sh.tool !== "mkr") || e.target.id !== "sd-ink") return;
      e.preventDefault();
      const cv = e.target, wrap = cv.parentNode, r = wrap.getBoundingClientRect(), k = 1000 / r.width;
      liveStroke = { k: sh.tool, c: sh.color, w: Math.round((sh.tool === "mkr" ? 18 : 3.5) * k * 10) / 10, p: [] };
      const add = ev => { const x = Math.round((ev.clientX - r.left) * k), y = Math.round((ev.clientY - r.top) * k), p = liveStroke.p; if (p.length && Math.hypot(p[p.length - 2] - x, p[p.length - 1] - y) < 2.5 * k) return; p.push(x, y); };
      add(e); drawInk(cv, wrap, notes().ink, liveStroke);
      try { cv.setPointerCapture(e.pointerId); } catch (er) {}
      const move = ev => { add(ev); drawInk(cv, wrap, notes().ink, liveStroke); };
      const up = () => { cv.removeEventListener("pointermove", move); cv.removeEventListener("pointerup", up); cv.removeEventListener("pointercancel", up); const st = liveStroke; liveStroke = null; if (st && st.p.length >= 2) addNote("ink", st); };
      cv.addEventListener("pointermove", move); cv.addEventListener("pointerup", up); cv.addEventListener("pointercancel", up);
    }
    function onKey(e) {
      if (host.ui.view !== "show" || /INPUT|SELECT|TEXTAREA/.test(e.target.tagName || "")) return;
      if (sh.view === "task" && (e.key === "ArrowRight" || e.key === "ArrowLeft")) { const n = countOf(sh), v = sh.n + (e.key === "ArrowRight" ? 1 : -1); if (v >= 0 && (!n || v < n)) go({ n: v, rev: false }); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") { e.preventDefault(); onClick({ target: { closest: () => ({ dataset: { sh: "undo" } }) } }); }
    }
    let scrollTimer = null;
    function onScroll() { if (host.ui.view !== "show" || sh.mode !== "show") return; clearTimeout(scrollTimer); scrollTimer = setTimeout(() => pushSoon(0), 500); }
    let resizeTimer = null;
    function onResize() {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => { if (host.ui.view === "show") { mountDoc(); if (sh.mode === "show") pushSoon(); } else if (ov.el) paintStudent(); }, 200);
    }

    /* ═════════ Учень: пауза й показ поверх сайту ═════════ */
    const ov = { v: "", st: null, el: null, timer: null, busy: false, fy: -1, shown: false };
    async function poll() {
      clearTimeout(ov.timer); ov.timer = null;
      if (!API || host.ui.view === "show" || !host.loggedIn()) return schedule(20000);
      if (document.hidden) return; // повернення на сторінку знову запускає перевірку
      if (ov.busy) return; ov.busy = true;
      let d = null;
      try {
        const s = host.me(), r = await fetch(API, { method: "POST", credentials: "omit", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify({ action: "class_state", key: host.currentKey(), cls: s && s.cls || "", v: ov.v }) });
        d = JSON.parse(await r.text());
      } catch (e) { d = null; }
      ov.busy = false;
      if (d && d.ok) {
        if (!d.same) { ov.v = d.v; ov.st = d; ov.fy = -1; paintStudent(); }
        schedule(d.nx || 8000);
      } else schedule(d && d.error === "unknown" ? 600000 : 15000); // старий Code.gs не знає class_state — не смикаємо сервер
    }
    function schedule(ms) { clearTimeout(ov.timer); ov.timer = setTimeout(poll, ms); }
    function paintStudent() {
      const st = ov.st, on = st && (st.mode === "pause" || st.mode === "show") && host.ui.view !== "show" && !host.exempt();
      if (!on) {
        if (ov.el) { ov.el.remove(); ov.el = null; document.documentElement.classList.remove("cls-lock"); }
        if (ov.shown && (!st || st.mode === "off")) { ov.shown = false; host.toast("Учитель відновив роботу — можна продовжувати."); }
        return;
      }
      ov.shown = true;
      if (!ov.el) { ov.el = document.createElement("div"); ov.el.className = "cls-ov"; ov.el.setAttribute("role", "dialog"); ov.el.setAttribute("aria-modal", "true"); document.body.appendChild(ov.el); document.documentElement.classList.add("cls-lock"); }
      ov.el.setAttribute("aria-label", st.mode === "pause" ? "Учитель зупинив роботу" : "Учитель показує слайд");
      if (st.mode === "pause") {
        ov.el.innerHTML = `<div class="cls-body"><div class="cls-pause"><div class="cls-ic" aria-hidden="true">⏸</div><h2>Учитель зупинив роботу</h2>
          ${st.msg ? `<p class="cls-msg">${esc(st.msg)}</p>` : ""}<p class="muted">Подивіться на вчителя або на дошку. Ваші відповіді збережено — продовжите, щойно вчитель відновить роботу.</p></div></div>`;
        return;
      }
      const s = st.show || {}, w = Number(s.w) || 860;
      const keepY = ov.el.querySelector(".cls-body") ? ov.el.querySelector(".cls-body").scrollTop : 0;
      ov.el.innerHTML = `<div class="cls-bar"><span>Учитель показує: ${esc(titleOf(s))}${s.view === "task" ? " · завдання " + (s.n + 1) : ""}</span>${st.msg ? `<span class="cls-msg">${esc(st.msg)}</span>` : ""}<span class="hint cls-note" hidden></span></div>
        <div class="cls-body"><div class="sd-fit"><div class="sd-wrap" id="cls-wrap"><div class="show-doc" id="cls-doc"></div><canvas class="sd-ink" id="cls-ink" aria-hidden="true"></canvas></div></div></div>`;
      const body = ov.el.querySelector(".cls-body"), fit = ov.el.querySelector(".sd-fit"), wrap = ov.el.querySelector("#cls-wrap"), doc = ov.el.querySelector("#cls-doc"), cv = ov.el.querySelector("#cls-ink");
      const v0 = ov.v, x = docHtml(s, () => { if (ov.v === v0 && ov.el) paintStudent(); });
      if (!zIdx.d && s.src === "z") zIndex(() => { if (ov.v === v0 && ov.el) paintStudent(); });
      doc.innerHTML = x.html; freeze(doc);
      if (x.ok) applyMarks(doc, st.mk || []);
      /* Точна копія слайда вчителя (та сама ширина, за потреби зменшена), щоб малюнки стояли на місці.
         На вузькому екрані текст перебудовуємо під ширину: підкреслення лишаються, малюнки видно лише на екрані в класі. */
      const avail = body.clientWidth - 32, exact = avail >= w * 0.7, sc = exact ? Math.min(1, avail / w) : 1;
      wrap.style.width = exact ? w + "px" : "100%";
      wrap.style.maxWidth = exact ? "none" : "";
      wrap.style.transform = sc < 1 ? `scale(${sc})` : "";
      fit.style.height = sc < 1 ? Math.ceil(wrap.offsetHeight * sc) + "px" : "";
      fit.style.width = exact ? Math.ceil(w * sc) + "px" : "";
      if (exact && x.ok) drawInk(cv, wrap, st.ink || []); else drawInk(cv, wrap, []);
      const note = ov.el.querySelector(".cls-note");
      if (!exact && (st.ink || []).length) { note.hidden = false; note.textContent = "Учитель малює на слайді — ці лінії видно на екрані в класі."; }
      const fy = Number(s.fy) || 0;
      if (fy !== ov.fy) { ov.fy = fy; body.scrollTop = fit.offsetTop + fy * wrap.offsetHeight * sc - 8; } else body.scrollTop = keepY;
    }

    /* ───── Підключення ───── */
    host.app.addEventListener("click", onClick);
    host.app.addEventListener("change", onChange);
    host.app.addEventListener("pointerdown", penDown);
    document.addEventListener("pointerup", onSelectEnd);
    document.addEventListener("keyup", e => { if (e.key && e.key.startsWith("Shift")) onSelectEnd(); });
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", () => { if (!document.hidden) poll(); });
    window.addEventListener("storage", e => { if (e.key === ALS && host.ui.view === "show") { synced = false; render(); } });

    return {
      render,
      start: () => { if (API) setTimeout(poll, 1500); },
      /* Після кожного перемальовування сайту: показати чи сховати паузу (наприклад, учень почав моніторингову роботу). */
      after: () => { if (ov.st) paintStudent(); },
      canSelectWord: () => host.ui.view !== "show"
    };
  };
})();
