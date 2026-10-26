/* Розділ «Симуляція НМТ»: 30 завдань, 60 хвилин, збереження відповідей, підсумок у тестових балах і за шкалою 100–200.
   Дані — nmt/index.json і nmt/t/<id>.json (створює tools/import_nmt.py). */
(function () {
  "use strict";

  window.MGNmt = function (host) {
    const { esc } = host;
    let index = null, indexErr = false, loadingIndex = null;
    const cache = {};
    let modal = null, pick = null, tick = null;

    function loadIndex() {
      if (index || loadingIndex) return loadingIndex;
      loadingIndex = fetch("nmt/index.json").then(r => r.json()).then(d => { index = d; host.render(); })
        .catch(() => { indexErr = true; loadingIndex = null; host.render(); });
      return loadingIndex;
    }
    function loadTest(id) {
      if (cache[id]) return;
      cache[id] = "loading";
      fetch("nmt/t/" + id + ".json").then(r => r.json()).then(d => { d.tasks.forEach(markStress); cache[id] = d; host.render(); })
        .catch(() => { cache[id] = "error"; host.render(); });
    }
    const meta = id => index && index.tests.find(t => t.id === id);
    /* Підкреслені одиничні літери (наголос, звук) — у яскравий спільний стиль .st. */
    const stressify = h => String(h || "").replace(/<u>((?:<[bi]>)*)([^<]{1,2})((?:<\/[bi]>)*)<\/u>/g, '<span class="st">$2</span>');
    function markStress(t) {
      t.q = stressify(t.q); t.ex = stressify(t.ex);
      ["opts", "left", "right"].forEach(k => { if (t[k]) t[k] = t[k].map(([a, b]) => [a, stressify(b)]); });
    }

    /* ── Стан ── */
    function tstate(id, create) {
      const s = host.me(); if (!s) return null;
      s.nmt = s.nmt || {};
      if (!s.nmt[id] && create) s.nmt[id] = { att: 0, hist: [] };
      return s.nmt[id] || null;
    }
    const now = () => Date.now();
    function liveRun(id) {
      const st = tstate(id);
      return st && st.run && !st.run.done ? st.run : null;
    }
    const left = run => Math.max(0, run.end - now());
    function scale(p) { return index && index.scale[p] ? index.scale[p] : 0; }
    function best(st) { return (st && st.hist || []).reduce((b, h) => (!b || h.p > b.p ? h : b), null); }
    function mmss(ms) { const s = Math.ceil(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60; return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); }

    function points(task, resp) {
      if (resp == null) return 0;
      if (task.type === "single") return resp === task.a ? 1 : 0;
      return task.left.reduce((n, [lk]) => n + (resp[lk] && resp[lk] === task.a[lk] ? 1 : 0), 0);
    }
    const maxOf = task => task.type === "single" ? 1 : task.left.length;
    const same = (a, b) => JSON.stringify(a == null ? null : a) === JSON.stringify(b == null ? null : b);
    function complete(task, resp) { return task.type === "single" ? !!resp : !!resp && task.left.every(([lk]) => resp[lk]); }

    /* ── Головна розділу ── */
    function homeHtml() {
      if (!index) { loadIndex(); return indexErr ? '<p class="empty">Не вдалося завантажити тести НМТ. Перевірте інтернет і оновіть сторінку.</p>' : '<p class="empty">Завантажую тести НМТ…</p>'; }
      let h = `<section class="zsum nmt-intro">
        <p class="nmt-src">Завдання й пояснення взято з <a href="https://zno.osvita.ua/ukrainian/" target="_blank" rel="noopener">ЗНО-онлайн (zno.osvita.ua)</a>, розділ «Національний мультитест з української мови».</p>
        <h2 class="nmt-h">Симуляція НМТ з української мови</h2>
        <ul class="nmt-facts"><li><b>30</b> завдань</li><li><b>60</b> хвилин</li><li><b>45</b> тестових балів максимум</li><li>шкала <b>100–200</b></li></ul>
        <p style="margin:0">Усе як на справжньому тесті: таймер, кнопка «Зберегти відповідь», підсумок лише наприкінці. Під час тесту словник і теорія вимкнені. Після тесту — розбір кожного завдання з поясненням і теорією.</p></section>`;
      const groups = [["train", "Тренувальні тести НМТ"], ["author", "Авторські тести"]];
      groups.forEach(([g, title]) => {
        const list = index.tests.filter(t => t.group === g);
        if (!list.length) return;
        h += `<section class="section"><div class="section-h"><h2>${esc(title)}</h2><span class="mono">${list.length}</span></div><div class="cards">`;
        list.forEach(t => {
          const st = tstate(t.id), run = st && liveRun(t.id), b = best(st), last = st && st.hist && st.hist[st.hist.length - 1];
          let status = '<span>Ще не проходили</span>';
          if (run && left(run) > 0) status = `<span class="nmt-live">Триває · залишилось ${Math.ceil(left(run) / 60000)} хв</span>`;
          else if (b) status = `<span>Найкраще: <b class="mono">${b.s || "—"}</b>${b.s ? "" : " (поріг не подолано)"} · ${b.p}/${t.max}</span>`;
          h += `<article class="card"><h3>${esc(t.title)}</h3>
            <div class="meta"><span>${t.n} завдань · 60 хв</span><span>Спроб: <b class="mono">${(st && st.hist && st.hist.length) || 0}</b></span></div>
            <div class="meta">${status}</div>
            <div class="acts">${last ? `<button class="btn small" data-nopen="${t.id}" data-nstage="result">Результат</button>` : ""}<button class="btn small primary" data-nopen="${t.id}" data-nstage="${run ? "exam" : "rules"}">${run ? "Продовжити" : last ? "Пройти ще раз" : "Почати"}</button></div>
            <a class="nmt-link" href="${esc(t.src)}" target="_blank" rel="noopener">Джерело: zno.osvita.ua ↗</a></article>`;
        });
        h += "</div></section>";
      });
      return h;
    }

    /* ── Сторінка тесту ── */
    function pageHtml() {
      const ui = host.ui;
      if (!index) { loadIndex(); return '<main class="wrap"><p class="empty">Завантажую…</p></main>'; }
      const t = meta(ui.ntest);
      if (!t) { ui.view = "home"; return null; }
      if (!host.loggedIn()) return topbar(t) + `<main class="wrap" style="padding-top:0">${host.gateHtml()}</main>`;
      loadTest(t.id);
      const data = cache[t.id];
      if (!data || data === "loading") return topbar(t) + '<main class="wrap"><p class="empty">Завантажую тест…</p></main>';
      if (data === "error") return topbar(t) + '<main class="wrap"><p class="empty">Не вдалося завантажити тест. Перевірте інтернет.</p></main>';
      const run = liveRun(t.id);
      if (run && left(run) <= 0) finish(t, data, true);
      if (liveRun(t.id)) ui.nstage = "exam";
      else if (ui.nstage === "exam") ui.nstage = "result";
      const st = tstate(t.id, true);
      if (ui.nstage === "result" && !(st.hist && st.hist.length)) ui.nstage = "rules";
      if (ui.nstage === "exam") return examHtml(t, data, liveRun(t.id));
      stopTick();
      if (ui.nstage === "start") return topbar(t) + startHtml(t);
      if (ui.nstage === "result") return topbar(t) + resultHtml(t, data, st);
      return topbar(t) + rulesHtml(t);
    }
    function topbar(t) {
      return `<div class="topbar"><div class="wrap"><div class="tb-row"><button class="btn small ghost" data-act="home" aria-label="До списку тестів">← Тести</button><span class="tb-title">НМТ · ${esc(t.title)}</span></div></div></div>`;
    }
    function srcLine(t) {
      return `<p class="nmt-src">Завдання: <a href="${esc(t.src)}" target="_blank" rel="noopener">${esc(t.title)} на zno.osvita.ua</a></p>`;
    }
    function rulesHtml(t) {
      const name = host.fullName ? host.fullName() : "";
      let h = `<main class="wrap"><article class="nmt-paper">${srcLine(t)}
        <h2>Шановний учаснику / Шановна учаснице!</h2>
        <p>Перевірте своє ім’я: <b>${esc(name)}</b>. Якщо воно неправильне, вийдіть із профілю й увійдіть під своїм.</p>
        <div class="nmt-rule"><b>Тест з української мови</b><span>30 завдань · 60 хвилин · від 0 до 45 тестових балів</span></div>
        <div class="nmt-rule"><b>Завдання 1–25</b><span>одна правильна відповідь із кількох. Правильна відповідь — 1 бал.</span></div>
        <div class="nmt-rule"><b>Завдання 26–30</b><span>«логічні пари»: до кожного рядка з цифрою доберіть відповідник з буквою. Кожна правильна пара — 1 бал, за завдання — до 4 балів.</span></div>
        <h3>Як працювати</h3>
        <ol class="algo">
          <li><b>Оберіть відповідь і натисніть «Зберегти відповідь»</b><span>Незбережену відповідь не буде зараховано. Збережені завдання зафарбовуються на панелі з номерами.</span></li>
          <li><b>Відповідь можна змінити</b><span>Оберіть інший варіант і знову натисніть «Зберегти відповідь» — зараховується остання збережена.</span></li>
          <li><b>Стежте за таймером угорі</b><span>Його можна сховати кнопкою з оком. Коли час мине, тест завершиться автоматично.</span></li>
          <li><b>Натисніть «Завершити роботу над тестом»</b><span>Після цього повернутися до завдань неможливо. Зараховуються лише збережені відповіді.</span></li>
        </ol>
        <div class="nmt-warn"><b>Заборонено</b><span>перемикати вкладки, згортати вікно, відкривати інші програми. Ми рахуємо кожен вихід зі сторінки тесту — учитель це побачить. Словник і теорія під час тесту вимкнені.</span></div>
        <p>Після тесту ви одразу побачите тестовий бал і бал за шкалою 100–200 (за офіційною таблицею переведення 2026 року), а також розбір кожного завдання з поясненням.</p>
        <div><button class="btn primary" data-act="nagree">Я погоджуюсь з правилами тесту</button></div></article></main>`;
      if (modal === "agree") h += dialog("Чи дійсно Ви погоджуєтеся з Правилами проходження тесту?", "", `<button class="btn primary" data-act="nagree-yes">Так</button><button class="btn" data-act="nmodal-close">Ні</button>`);
      return h;
    }
    function startHtml(t) {
      return `<main class="wrap"><article class="nmt-paper nmt-start"><h2>Тест «${esc(t.title)}» обмежений у часі (60 хвилин)</h2>
        <p>Тест містить 30 завдань з української мови. На виконання відведено <b>60 хвилин</b>. Слідкуйте за таймером.</p>
        <p>Як тільки Ви натиснете кнопку «Розпочати роботу над тестом», <b>автоматично розпочнеться відлік часу</b>. Таймер не зупиняється, навіть якщо закрити сторінку.</p>
        <p><b>ЗАБОРОНЕНО:</b> перемикати вкладки, згортати вікно, відкривати сторонні програми.</p>
        <div><button class="btn primary" data-act="nbegin">Розпочати роботу над тестом →</button></div></article></main>`;
    }
    function dialog(title, body, buttons) {
      return `<div class="nmt-modal" role="dialog" aria-modal="true" aria-labelledby="nmt-dlg-h"><div class="nmt-dlg"><h3 id="nmt-dlg-h">${title}</h3>${body}<div class="nmt-dlg-acts">${buttons}</div></div></div>`;
    }

    /* ── Тест ── */
    function examHtml(t, data, run) {
      const ui = host.ui;
      startTick(t, data);
      const savedN = data.tasks.filter((x, i) => run.saved[i] != null).length;
      let h = `<div class="nx-bar"><div class="nx-in">
        <div class="nx-title"><b>НМТ-симуляція</b><span>${esc(t.title)} · ${esc(host.fullName ? host.fullName() : "")}</span></div>
        <button class="nx-time ${run.hideTime ? "hid" : ""}" data-act="ntime" aria-label="${run.hideTime ? "Показати таймер" : "Сховати таймер"}"><span id="nx-clock" class="mono">${run.hideTime ? "••:••" : mmss(left(run))}</span><span class="nx-eye" aria-hidden="true">${run.hideTime ? "◎" : "◉"}</span></button>
        <button class="btn small nx-fin" data-act="nfinish">Завершити роботу над тестом</button></div>
        <div class="nx-grid" role="navigation" aria-label="Завдання">${data.tasks.map((x, i) => `<button class="nx-c ${run.saved[i] != null ? "sv" : ""} ${run.draft[i] != null && !same(run.draft[i], run.saved[i]) ? "dr" : ""}" data-ngo="${i}" aria-label="Завдання ${i + 1}${run.saved[i] != null ? ", збережено" : ""}">${i + 1}</button>`).join("")}</div>
        <div class="nx-count">Збережено <b class="mono">${savedN}</b> з ${data.tasks.length}</div></div>
        <main class="wrap nx-main">`;
      let lastType = "";
      data.tasks.forEach((task, i) => {
        if (task.type !== lastType) {
          lastType = task.type;
          h += task.type === "single"
            ? '<div class="nx-instr">Завдання мають кілька варіантів відповіді, з яких лише <b>ОДИН</b> правильний. Виберіть правильний варіант та <b>ЗБЕРЕЖІТЬ</b>.</div>'
            : '<div class="nx-instr">До кожного рядка, позначеного <b>ЦИФРОЮ</b>, доберіть один відповідник, позначений <b>БУКВОЮ</b>. Торкніться картки з буквою, а потім рамки біля цифри (або навпаки), та <b>ЗБЕРЕЖІТЬ</b>.</div>';
        }
        h += examTask(task, i, run);
      });
      h += `<div class="nx-end"><button class="btn primary" data-act="nfinish">Завершити роботу над тестом</button></div></main>`;
      if (modal === "finish") {
        const unsaved = [], changed = [];
        data.tasks.forEach((x, i) => { if (run.saved[i] == null) unsaved.push(i + 1); else if (run.draft[i] != null && !same(run.draft[i], run.saved[i])) changed.push(i + 1); });
        let body = '<p>Переконайтеся, що Ви натиснули «Зберегти відповідь» біля кожного виконаного завдання. Ви можете повернутися до будь-якого завдання та надати й зберегти відповідь.</p>';
        if (unsaved.length) body += `<div class="nmt-alert"><b>Не надано або не збережено відповіді до таких завдань:</b><span>${unsaved.join(", ")}</span></div>`;
        if (changed.length) body += `<div class="nmt-alert"><b>Змінено, але не збережено:</b><span>${changed.join(", ")} (буде зараховано попередню збережену відповідь)</span></div>`;
        h += dialog("Ви впевнені, що бажаєте завершити роботу над тестом?", body, `<button class="btn danger" data-act="nfinish-yes">Завершити роботу над тестом</button><button class="btn primary" data-act="nmodal-close">Ні, повернутися до виконання</button>`);
      }
      return h;
    }
    function examTask(task, i, run) {
      const d = run.draft[i] != null ? run.draft[i] : run.saved[i];
      const isSaved = run.saved[i] != null, dirty = run.draft[i] != null && !same(run.draft[i], run.saved[i]);
      let h = `<section class="nq ${isSaved && !dirty ? "is-saved" : ""}" id="nq-${i}"><h3 class="nq-h">Завдання ${i + 1}</h3><div class="nq-q">${task.q}</div>`;
      if (task.type === "single") {
        h += '<div class="nq-opts" role="radiogroup">' + task.opts.map(([k, txt]) =>
          `<button class="nq-opt ${d === k ? "on" : ""}" role="radio" aria-checked="${d === k}" data-nsel="${i}|${esc(k)}"><span class="nq-radio" aria-hidden="true"></span><span class="nq-k">${esc(k)}</span><span class="nq-t">${txt}</span></button>`).join("") + "</div>";
      } else h += matchHtml(task, i, d || {}, false);
      const can = complete(task, run.draft[i] != null ? run.draft[i] : null) && dirty;
      h += `<div class="nq-save"><button class="btn ${can ? "primary" : ""}" data-nsave="${i}" ${can ? "" : "disabled"}>Зберегти відповідь</button>${isSaved ? `<span class="nq-st ${dirty ? "warn" : ""}">${dirty ? "Зміни не збережено" : "✓ Відповідь збережено"}</span>` : task.type === "matching" && run.draft[i] && !complete(task, run.draft[i]) ? '<span class="nq-st">Заповніть усі рядки</span>' : ""}</div></section>`;
      return h;
    }
    /* Відповідність: ліві рядки з рамками й картки з буквами. review = показ правильних відповідей. */
    function matchHtml(task, i, v, review) {
      const [tl, tr] = task.titles || ["", ""];
      const used = new Set(Object.values(v));
      let h = `<div class="nm"><div class="nm-col">${tl ? `<div class="zcol-title">${esc(tl)}</div>` : ""}`;
      task.left.forEach(([lk, txt]) => {
        const rk = v[lk], card = rk && task.right.find(r => r[0] === rk);
        let cls = "";
        if (review) cls = rk === task.a[lk] ? "ok" : rk ? "no" : "miss";
        const picked = pick && pick.i === i && pick.lk === lk;
        h += `<div class="nm-row"><div class="nm-left"><span class="nm-key">${esc(lk)}</span><span class="nm-t">${txt}</span></div>
          ${review ? `<div class="nm-slot filled ${cls}"><span class="nm-key b">${esc(rk || "—")}</span>${rk !== task.a[lk] ? `<span class="nm-right-ans">правильно: <b>${esc(task.a[lk])}</b></span>` : ""}</div>`
            : `<button class="nm-slot ${card ? "filled" : ""} ${picked ? "picked" : ""}" data-nslot="${i}|${esc(lk)}" aria-label="Відповідь для ${esc(lk)}: ${rk ? esc(rk) : "порожньо"}">${card ? `<span class="nm-key b">${esc(rk)}</span><span class="nm-t sm">${card[1]}</span><span class="nm-x" aria-hidden="true">×</span>` : '<span class="nm-ph">Перетягніть або торкніться картки</span>'}</button>`}</div>`;
      });
      h += `</div><div class="nm-col nm-cards">${tr ? `<div class="zcol-title">${esc(tr)}</div>` : ""}`;
      task.right.forEach(([rk, txt]) => {
        const picked = pick && pick.i === i && pick.rk === rk;
        h += review ? `<div class="nm-card"><span class="nm-key b">${esc(rk)}</span><span class="nm-t">${txt}</span></div>`
          : `<button class="nm-card ${used.has(rk) ? "used" : ""} ${picked ? "picked" : ""}" draggable="true" data-ncard="${i}|${esc(rk)}"><span class="nm-key b">${esc(rk)}</span><span class="nm-t">${txt}</span></button>`;
      });
      return h + "</div></div>";
    }

    function startTick(t, data) {
      if (tick) return;
      tick = setInterval(() => {
        const run = liveRun(t.id), el = document.getElementById("nx-clock");
        if (!run || host.ui.view !== "nmt") { stopTick(); return; }
        const ms = left(run);
        if (el && !run.hideTime) el.textContent = mmss(ms);
        if (el) el.closest(".nx-time").classList.toggle("low", ms < 5 * 60000);
        if (ms <= 0) { stopTick(); finish(t, data, true); host.render(); host.toast("Час вичерпано. Тест завершено."); }
      }, 1000);
    }
    function stopTick() { if (tick) { clearInterval(tick); tick = null; } }

    function finish(t, data, auto) {
      const st = tstate(t.id, true), run = st.run;
      if (!run || run.done) return;
      let p = 0;
      data.tasks.forEach((task, i) => { p += points(task, run.saved[i]); });
      const s = scale(p), end = Math.min(now(), run.end);
      const rec = { at: end, p, s, max: t.max, dur: Math.round((end - run.start) / 1000), blur: run.blur || 0, ans: run.saved, att: run.att, auto: !!auto };
      st.hist = (st.hist || []).concat(rec).slice(-10);
      delete st.run;
      modal = null; pick = null;
      const ss = host.me();
      (ss.queue = ss.queue || []).push({
        id: host.currentKey() + "|nmt|" + t.id + "|" + rec.att, topic: "nmt:" + t.id, att: rec.att, n: 0, type: "nmt", ok: s > 0, at: end,
        q: "Симуляція НМТ: " + t.title, ans: p + "/" + t.max + " → " + (s || "поріг не подолано") + "; час " + Math.ceil(rec.dur / 60) + " хв; виходів зі сторінки: " + rec.blur + (auto ? "; завершено таймером" : ""),
        right: "макс. " + t.max
      });
      host.ui.nstage = "result"; host.ui.nreview = -1;
      host.saveLocal(); host.scheduleSync(true);
    }

    /* ── Результат і розбір ── */
    function resultHtml(t, data, st) {
      const ui = host.ui, rec = st.hist[st.hist.length - 1];
      const by = { single: [0, 0], matching: [0, 0] };
      data.tasks.forEach((task, i) => { by[task.type][0] += points(task, rec.ans[i]); by[task.type][1] += maxOf(task); });
      const passed = rec.s > 0;
      let h = `<main class="wrap nmt-res">${srcLine(t)}<section class="nmt-score ${passed ? "pass" : "fail"}">
        <div class="nmt-big"><span class="lbl">Бал за шкалою 100–200</span><b class="mono">${passed ? rec.s : "—"}</b>${passed ? "" : '<span class="nmt-fail">Поріг не подолано: потрібно щонайменше 8 тестових балів</span>'}</div>
        <div class="nmt-big"><span class="lbl">Тестовий бал</span><b class="mono">${rec.p}<small>/${rec.max}</small></b></div>
        <ul class="nmt-break"><li>Завдання 1–25: <b class="mono">${by.single[0]}</b> з ${by.single[1]}</li><li>Завдання 26–30 (пари): <b class="mono">${by.matching[0]}</b> з ${by.matching[1]}</li>
          <li>Час: <b class="mono">${mmss(rec.dur * 1000)}</b>${rec.auto ? " (час вичерпано)" : ""}</li><li>Виходів зі сторінки: <b class="mono">${rec.blur}</b></li></ul>
        <div class="nmt-scalebar" aria-hidden="true"><i style="width:${rec.p / rec.max * 100}%"></i></div></section>`;
      if ((st.hist || []).length > 1) h += `<p class="hint" style="margin:0">Спроб: ${st.hist.length}. Найкращий результат: ${best(st).s || "—"} (${best(st).p}/${rec.max}).</p>`;
      h += `<div class="nx-grid res">${data.tasks.map((task, i) => { const p = points(task, rec.ans[i]), m = maxOf(task); return `<a class="nx-c ${p === m ? "ok" : p ? "part" : "no"}" href="#nr-${i}" aria-label="Завдання ${i + 1}: ${p} з ${m}">${i + 1}</a>`; }).join("")}</div>
        <div class="legend"><span class="l1">правильно</span><span class="lp">частково</span><span class="l0">помилка або без відповіді</span></div>
        ${host.fixCount("n:" + t.id) ? `<div class="task-nav"><button class="btn primary" data-fixstart="n:${t.id}">Робота над помилками (${host.fixCount("n:" + t.id)})</button></div><p class="hint" style="margin:0">Помилки цієї спроби зібрано в розділі «Мої помилки»: розбір і повторне розв’язання з поясненням.</p>` : ""}
        <h2 class="nmt-h">Розбір завдань</h2>`;
      data.tasks.forEach((task, i) => { h += reviewTask(task, i, rec.ans[i]); });
      h += `<div class="task-nav"><button class="btn primary grow" data-nopen="${t.id}" data-nstage="rules">Пройти ще раз</button><button class="btn" data-act="home">До тестів</button></div></main>`;
      return h;
    }
    function reviewTask(task, i, resp) {
      const p = points(task, resp), m = maxOf(task);
      let h = `<section class="nq rv ${p === m ? "rv-ok" : p ? "rv-part" : "rv-no"}" id="nr-${i}"><div class="nq-hrow"><h3 class="nq-h">Завдання ${i + 1}</h3><span class="rv-pts mono">${p}/${m}</span></div><div class="nq-q">${task.q}</div>`;
      if (task.type === "single") {
        h += '<div class="nq-opts">' + task.opts.map(([k, txt]) => {
          const cls = k === task.a ? "ok" : k === resp ? "no" : "";
          return `<div class="nq-opt ${cls}"><span class="nq-k">${esc(k)}</span><span class="nq-t">${txt}</span>${k === task.a ? '<span class="tag">✓ правильна</span>' : k === resp ? '<span class="tag">ваша відповідь</span>' : ""}</div>`;
        }).join("") + "</div>";
        if (!resp) h += '<p class="rv-none">Відповідь не збережено.</p>';
      } else {
        h += matchHtml(task, i, resp || {}, true);
        if (!resp) h += '<p class="rv-none">Відповідь не збережено.</p>';
      }
      h += `<details class="zex" ${p === m ? "" : "open"}><summary>Пояснення</summary><div class="zex-body">${task.ex || "Пояснення до цього завдання немає."}</div></details>`;
      const refs = (task.th || []).map(r => host.theoryRef(r)).filter(Boolean);
      if (refs.length) h += `<div class="rv-th">${refs.map(r => `<button class="btn small" data-theory="${esc(r.ref)}">📖 Теорія: ${esc(r.title)}</button>`).join("")}</div>`;
      return h + "</section>";
    }

    /* ── Події ── */
    function onClick(b) {
      const d = b.dataset, ui = host.ui;
      if (d.nopen) {
        Object.assign(ui, { view: "nmt", ntest: d.nopen, nstage: d.nstage || "rules" });
        modal = null; pick = null; host.render(); window.scrollTo(0, 0); return true;
      }
      if (ui.view !== "nmt") return false;
      const t = meta(ui.ntest), data = cache[ui.ntest];
      if (d.act === "nmodal-close") { modal = null; host.render(); return true; }
      if (d.act === "nagree") { modal = "agree"; host.render(); return true; }
      if (d.act === "nagree-yes") { modal = null; ui.nstage = "start"; host.render(); window.scrollTo(0, 0); return true; }
      if (!t || !data || typeof data !== "object" || !host.loggedIn()) return false;
      if (d.act === "nbegin") {
        const st = tstate(t.id, true);
        st.att = (st.att || 0) + 1;
        st.run = { start: now(), end: now() + (index.minutes || 60) * 60000, draft: {}, saved: {}, blur: 0, att: st.att };
        ui.nstage = "exam"; host.saveLocal(); host.render(); window.scrollTo(0, 0); return true;
      }
      const run = liveRun(t.id);
      if (!run) return false;
      if (d.act === "ntime") { run.hideTime = !run.hideTime; host.saveLocal(); host.render(); return true; }
      if (d.act === "nfinish") { modal = "finish"; host.render(); return true; }
      if (d.act === "nfinish-yes") { finish(t, data, false); host.render(); window.scrollTo(0, 0); return true; }
      if (d.ngo !== undefined) { const el = document.getElementById("nq-" + d.ngo); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); return true; }
      if (d.nsel) { const [i, k] = d.nsel.split("|"); run.draft[i] = k; host.saveLocal(); host.render(); return true; }
      if (d.nsave !== undefined) {
        const i = d.nsave, task = data.tasks[i];
        if (run.draft[i] != null && complete(task, run.draft[i])) { run.saved[i] = JSON.parse(JSON.stringify(run.draft[i])); delete run.draft[i]; host.saveLocal(); host.render(); }
        return true;
      }
      if (d.ncard) { const [i, rk] = d.ncard.split("|"); matchPick(data, run, +i, { rk }); return true; }
      if (d.nslot) { const [i, lk] = d.nslot.split("|"); matchPick(data, run, +i, { lk }); return true; }
      return false;
    }
    /* Торкання картки й рамки в будь-якому порядку; торкання заповненої рамки без вибраної картки — очищає її. */
    function matchPick(data, run, i, part) {
      const task = data.tasks[i];
      const cur = JSON.parse(JSON.stringify(run.draft[i] != null ? run.draft[i] : run.saved[i] || {}));
      if (part.lk && !(pick && pick.i === i && pick.rk) && cur[part.lk]) { delete cur[part.lk]; run.draft[i] = cur; pick = null; host.saveLocal(); host.render(); return; }
      pick = pick && pick.i === i ? Object.assign({}, pick, part) : Object.assign({ i }, part);
      if (pick.lk && pick.rk) {
        for (const k in cur) if (cur[k] === pick.rk) delete cur[k];
        cur[pick.lk] = pick.rk; run.draft[i] = cur; pick = null; host.saveLocal();
      } else if (pick.rk) host.toast("Картка «" + pick.rk + "»: тепер торкніться рамки біля цифри");
      else if (pick.lk) host.toast("Рядок " + pick.lk + ": тепер торкніться картки з буквою");
      host.render();
      void task;
    }
    /* Перетягування карток мишею (на комп’ютері). */
    function bindDrag(root) {
      root.addEventListener("dragstart", e => { const c = e.target.closest && e.target.closest("[data-ncard]"); if (c) { e.dataTransfer.setData("text/plain", c.dataset.ncard); e.dataTransfer.effectAllowed = "move"; } });
      root.addEventListener("dragover", e => { if (e.target.closest && e.target.closest("[data-nslot]")) e.preventDefault(); });
      root.addEventListener("drop", e => {
        const s = e.target.closest && e.target.closest("[data-nslot]"); if (!s) return;
        e.preventDefault();
        const [ci, rk] = (e.dataTransfer.getData("text/plain") || "").split("|"), [si, lk] = s.dataset.nslot.split("|");
        if (ci !== si || host.ui.view !== "nmt") return;
        const data = cache[host.ui.ntest], run = liveRun(host.ui.ntest); if (!run || !data) return;
        pick = { i: +si, rk }; matchPick(data, run, +si, { lk });
      });
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "hidden" || host.ui.view !== "nmt") return;
      const run = liveRun(host.ui.ntest); if (run) { run.blur = (run.blur || 0) + 1; host.saveLocal(); }
    });
    const inExam = () => host.ui.view === "nmt" && !!liveRun(host.ui.ntest);
    /* Незавершений тест (після перезавантаження сторінки повертаємо учня до нього). */
    function activeRun() {
      const s = host.me(); if (!s || !s.nmt) return null;
      for (const id in s.nmt) if (s.nmt[id].run && !s.nmt[id].run.done) return id;
      return null;
    }

    /* ── Синхронізація ── */
    function payload() {
      const s = host.me(); if (!s || !s.nmt) return null;
      const out = {};
      for (const id in s.nmt) {
        const st = s.nmt[id], hist = st.hist || [];
        if (!hist.length) continue;
        const last = hist[hist.length - 1], b = best(st);
        out[id] = { p: last.p, s: last.s, bp: b.p, bs: b.s, n: hist.length, at: last.at, blur: last.blur };
      }
      return Object.keys(out).length ? out : null;
    }
    function merge(rec, fromServer) {
      if (!fromServer) return;
      rec.nmt = rec.nmt || {};
      for (const id in fromServer) {
        const v = fromServer[id], st = rec.nmt[id] || (rec.nmt[id] = { att: 0, hist: [] });
        if (!st.hist.length && v && v.n) {
          st.att = v.n;
          if (v.bp !== v.p) st.hist.push({ at: 0, p: v.bp, s: v.bs, max: 45, dur: 0, blur: 0, ans: {}, att: 0 });
          st.hist.push({ at: v.at || 0, p: v.p, s: v.s, max: 45, dur: 0, blur: v.blur || 0, ans: {}, att: v.n, remote: true });
        }
      }
    }
    function reportLines() {
      const s = host.me(); if (!s || !s.nmt || !index) return [];
      const lines = ["", "Симуляції НМТ:"];
      index.tests.forEach(t => { const st = s.nmt[t.id], b = best(st); if (b) lines.push(t.title + ": найкраще " + (b.s || "поріг не подолано") + " (" + b.p + "/" + t.max + "), спроб " + st.hist.length); });
      return lines.length > 2 ? lines : [];
    }

    /* ── Для розділу «Мої помилки»: завдання останньої спроби, за які отримано не всі бали ── */
    function getTest(id) { loadIndex(); loadTest(id); return cache[id]; }
    function mistakes() {
      const s = host.me(), out = [];
      if (!s || !s.nmt) return out;
      for (const id in s.nmt) {
        const hist = s.nmt[id].hist || [], last = hist[hist.length - 1];
        if (!last || last.remote || !last.ans) continue;
        const data = getTest(id);
        if (!data || typeof data !== "object") { out.push({ pending: true, test: id }); continue; }
        data.tasks.forEach((task, i) => {
          if (points(task, last.ans[i]) < maxOf(task)) out.push({ key: "n:" + id + ":" + (last.at || 0) + ":" + i, test: id, i, resp: last.ans[i] });
        });
      }
      return out;
    }
    const testTitle = id => { const t = meta(id); return t ? t.title : "Тест НМТ"; };

    return { homeHtml, pageHtml, onClick, payload, merge, reportLines, loadIndex, bindDrag, inExam, stopTick, activeRun,
      getTest, mistakes, testTitle, points, maxOf };
  };
})();
