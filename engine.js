/* Генератор завдань: для кожної теми детерміновано будує 100 завдань із банку матеріалу. */
(function (root) {
  const TOTAL = 100;
  const VOW = "аеєиіїоуюяАЕЄИІЇОУЮЯ";

  function seedFrom(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }
  function rngFrom(str) {
    let a = seedFrom(str);
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const ri = (r, n) => Math.floor(r() * n);
  const pick = (r, a) => a[ri(r, a.length)];
  function shuffle(r, a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = ri(r, i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function sample(r, a, n) { return shuffle(r, a).slice(0, n); }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const q = s => "«" + s + "»";
  const dot = s => /[.!?…]$/.test(s) ? s : s + ".";
  const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

  /* One-choice task with options shuffled; `correct` is the index in `opts` before shuffling. */
  function oneTask(r, base, opts, correct) {
    const idx = opts.map((_, i) => i), order = base.keepOrder ? idx : shuffle(r, idx);
    return Object.assign({ t: "one", opts: order.map(i => opts[i]), a: order.indexOf(correct) }, base);
  }

  /* ───────── gap / classification items ───────── */
  function normItems(topic) {
    const groups = topic.groups || {};
    return (topic.items && topic.kind !== "variants" ? topic.items : []).map(x => {
      const g = groups[x[0]];
      const fills = x[4] !== undefined && x[4] !== "" ? x[4].split("|") : (g.fills || g.cats);
      return { g: x[0], grp: g, w: x[1], c: x[2], n: x[3] || "", f: fills };
    }).filter(it => it.grp);
  }
  const gapHtml = it => it.grp.cls ? esc(it.w) : esc(it.w).replace("_", '<span class="gap">…</span>');
  const full = (it, k) => it.w.replace("_", it.f[k]);
  const fullHtml = (it, k) => esc(full(it, k));
  const labelOf = (it, k) => it.grp.cats[k];
  function explain(it) {
    const right = it.grp.cls ? it.w + " — " + it.grp.cats[it.c] : full(it, it.c);
    return "<b>" + esc(right) + "</b>" + (it.n ? " — " + esc(dot(it.n)) : "") + " " + esc(it.grp.rule);
  }
  function wrongK(r, it) {
    const ks = it.f.map((_, k) => k).filter(k => k !== it.c && full(it, k) !== full(it, it.c));
    return ks.length ? pick(r, ks) : -1;
  }

  function gapGens(items) {
    const byG = {};
    items.forEach(it => { (byG[it.g] = byG[it.g] || []).push(it); });
    const gids = Object.keys(byG);
    const spellIt = items.filter(it => !it.grp.cls);
    const spellG = gids.filter(g => !byG[g][0].grp.cls && byG[g].length >= 4);
    const multiG = gids.filter(g => !byG[g][0].grp.mono && new Set(byG[g].map(i => i.c)).size >= 2 && byG[g].length >= 6);
    const gens = [];

    gens.push(function letter(r) {
      const it = pick(r, items);
      const head = it.grp.cls ? it.grp.ask : it.grp.ask;
      return oneTask(r, { key: "L" + it.w, q: head, big: gapHtml(it), note: explain(it) },
        it.grp.cats.map(esc), it.c);
    });
    if (multiG.length) gens.push(function sort(r) {
      const g = pick(r, multiG), pool = byG[g];
      const chosen = sample(r, pool, Math.min(5, pool.length));
      if (new Set(chosen.map(i => i.c)).size < 2) return null;
      return { t: "sort", key: "S" + chosen.map(i => i.w).sort().join("|"), q: pool[0].grp.cls ? "Розподіліть приклади за групами." : "Розподіліть слова за групами: що треба вставити?",
        cats: pool[0].grp.cats.map(esc), items: chosen.map(i => ({ html: gapHtml(i), c: i.c })),
        note: chosen.map(i => "<b>" + esc(i.grp.cls ? i.w : full(i, i.c)) + "</b> — " + esc(i.grp.cats[i.c])).join("; ") + ". " + esc(pool[0].grp.rule) };
    });
    if (spellIt.length) gens.push(function spell(r) {
      const it = pick(r, spellIt);
      const forms = [], seen = new Set();
      it.f.forEach((_, k) => { const s = full(it, k); if (!seen.has(s)) { seen.add(s); forms.push({ s, k }); } });
      if (forms.length < 2) return null;
      return oneTask(r, { key: "W" + it.w, q: "Укажіть правильно написаний варіант.", note: explain(it) },
        forms.map(x => esc(x.s)), forms.findIndex(x => x.k === it.c));
    });
    if (spellG.length) gens.push(function hunt(r) {
      const g = pick(r, spellG), chosen = sample(r, byG[g], 4), bad = ri(r, 4);
      const k = wrongK(r, chosen[bad]); if (k < 0) return null;
      const opts = chosen.map((it, i) => i === bad ? fullHtml(it, k) : fullHtml(it, it.c));
      return { t: "one", key: "H" + chosen.map(i => i.w).join("|"), q: "У якому варіанті допущено помилку?", opts, a: bad,
        note: "Помилка: " + esc(dot(full(chosen[bad], k))) + " Правильно: " + explain(chosen[bad]) };
    });
    if (multiG.length) gens.push(function multi(r) {
      const g = pick(r, multiG), chosen = sample(r, byG[g], 6);
      const k = pick(r, chosen).c, a = chosen.map((it, i) => it.c === k ? i : -1).filter(i => i >= 0);
      if (a.length < 1 || a.length > 5) return null;
      const grp = chosen[0].grp;
      return { t: "multi", key: "M" + k + chosen.map(i => i.w).sort().join("|"),
        q: grp.cls ? "Позначте всі приклади, де " + esc(grp.cats[k]) + "." : "Позначте всі варіанти, де треба вставити " + q(esc(grp.cats[k])) + ".",
        opts: chosen.map(gapHtml), a, note: chosen.filter(i => i.c === k).map(i => "<b>" + esc(i.grp.cls ? i.w : full(i, i.c)) + "</b>").join(", ") + ". " + esc(grp.rule) };
    });
    if (spellIt.length) gens.push(function tf(r) {
      const it = pick(r, spellIt), ok = r() < 0.5;
      const k = ok ? it.c : wrongK(r, it); if (k < 0) return null;
      return oneTask(r, { key: "T" + full(it, k), q: "Чи правильно написано?", big: fullHtml(it, k), note: explain(it), keepOrder: true },
        ["Правильно", "З помилкою"], ok ? 0 : 1);
    });
    if (multiG.length) gens.push(function odd(r) {
      const g = pick(r, multiG), pool = byG[g];
      const cs = [...new Set(pool.map(i => i.c))], A = pick(r, cs);
      const As = pool.filter(i => i.c === A), Bs = pool.filter(i => i.c !== A);
      if (As.length < 3 || !Bs.length) return null;
      const chosen = sample(r, As, 3).concat([pick(r, Bs)]);
      const order = shuffle(r, [0, 1, 2, 3]), b = order.indexOf(3);
      const grp = pool[0].grp, oddIt = chosen[3];
      return { t: "one", key: "O" + chosen.map(i => i.w).sort().join("|"),
        q: grp.cls ? "Який приклад зайвий у цьому ряду?" : "Знайдіть зайве: де треба вставити інше?",
        opts: order.map(i => gapHtml(chosen[i])), a: b,
        note: "Зайве — <b>" + esc(oddIt.grp.cls ? oddIt.w : full(oddIt, oddIt.c)) + "</b> (" + esc(grp.cats[oddIt.c]) + "), в інших — " + esc(grp.cats[A]) + ". " + esc(grp.rule) };
    });
    if (spellG.length) gens.push(function onlyRight(r) {
      const g = pick(r, spellG), chosen = sample(r, byG[g], 4), good = ri(r, 4);
      const opts = [];
      for (let i = 0; i < 4; i++) {
        if (i === good) opts.push(fullHtml(chosen[i], chosen[i].c));
        else { const k = wrongK(r, chosen[i]); if (k < 0) return null; opts.push(fullHtml(chosen[i], k)); }
      }
      return { t: "one", key: "R" + chosen.map(i => i.w).join("|"), q: "Укажіть варіант, написаний правильно.", opts, a: good, note: explain(chosen[good]) };
    });
    if (multiG.length) gens.push(function row(r) {
      const g = pick(r, multiG), pool = byG[g];
      const cs = [...new Set(pool.map(i => i.c))], A = pick(r, cs);
      const As = pool.filter(i => i.c === A), Bs = pool.filter(i => i.c !== A);
      if (As.length < 6 || Bs.length < 3) return null;
      const used = new Set(), take = (arr, n) => { const res = sample(r, arr.filter(i => !used.has(i)), n); res.forEach(i => used.add(i)); return res; };
      const rows = [take(As, 3)];
      for (let k = 0; k < 3; k++) { const bs = take(Bs, 1 + ri(r, 2)); const as = take(As, 3 - bs.length); if (bs.length < 1 || as.length + bs.length < 3) return null; rows.push(shuffle(r, as.concat(bs))); }
      const order = shuffle(r, [0, 1, 2, 3]);
      const grp = pool[0].grp;
      return { t: "one", key: "Rw" + A + rows[0].map(i => i.w).sort().join("|"),
        q: grp.cls ? "У якому рядку всі приклади — " + esc(grp.cats[A]) + "?" : "У якому рядку в усіх словах треба вставити " + q(esc(grp.cats[A])) + "?",
        opts: order.map(i => rows[i].map(gapHtml).join(", ")), a: order.indexOf(0), wide: true,
        note: rows[0].map(i => "<b>" + esc(i.grp.cls ? i.w : full(i, i.c)) + "</b>").join(", ") + ". " + esc(grp.rule) };
    });
    return gens;
  }

  /* ───────── variants ───────── */
  function variantGens(topic) {
    const V = topic.items.map(x => ({ ok: x[0], bad: x[1], n: x[2] || "" }));
    const ex = v => "Правильно: <b>" + esc(v.ok) + "</b>" + (v.n ? " (" + esc(v.n.replace(/\.$/, "")) + ")." : ".");
    return [
      function choose(r) { const v = pick(r, V); return oneTask(r, { key: "C" + v.ok, q: "Укажіть правильний варіант.", note: ex(v) }, [v.ok].concat(v.bad).map(esc), 0); },
      function hunt(r) {
        const ch = sample(r, V, 4), b = ri(r, 4);
        return { t: "one", key: "H" + ch.map(v => v.ok).join("|"), q: "У якому варіанті є помилка?", opts: ch.map((v, i) => esc(i === b ? pick(r, v.bad) : v.ok)), a: b, note: ex(ch[b]) };
      },
      function tf(r) {
        const v = pick(r, V), ok = r() < 0.5, s = ok ? v.ok : pick(r, v.bad);
        return oneTask(r, { key: "T" + s, q: "Чи правильно написано?", big: esc(s), note: ex(v), keepOrder: true }, ["Правильно", "З помилкою"], ok ? 0 : 1);
      },
      function right(r) {
        const ch = sample(r, V, 4), g = ri(r, 4);
        return { t: "one", key: "R" + ch.map(v => v.ok).join("|"), q: "Укажіть варіант без помилки.", opts: ch.map((v, i) => esc(i === g ? v.ok : pick(r, v.bad))), a: g, note: ex(ch[g]) };
      },
      function multi(r) {
        const ch = sample(r, V, 6), flags = ch.map(() => r() < 0.5);
        const a = flags.map((f, i) => f ? i : -1).filter(i => i >= 0);
        if (a.length < 1 || a.length > 5) return null;
        return { t: "multi", key: "M" + ch.map((v, i) => (flags[i] ? "+" : "-") + v.ok).sort().join("|"), q: "Позначте всі варіанти без помилок.",
          opts: ch.map((v, i) => esc(flags[i] ? v.ok : pick(r, v.bad))), a, note: ch.filter((_, i) => !flags[i]).map(v => "<b>" + esc(v.ok) + "</b>").join(", ") + " — так правильно пишемо варіанти з помилками." };
      }
    ];
  }

  /* ───────── pairs ───────── */
  function pairGens(topic) {
    const P = topic.pairs.map(p => ({ a: p[0], b: p[1] }));
    const ant = !!topic.antonym, phr = !!topic.phrase;
    const S = (topic.synonyms || []).map(p => ({ a: p[0], b: p[1] }));
    const gens = [
      function match(r) {
        const ch = sample(r, P, 4), right = shuffle(r, ch.map((p, i) => ({ html: esc(p.b), li: i })));
        return { t: "match", key: "P" + ch.map(p => p.a).sort().join("|"),
          q: ant ? "Поєднайте слова-антоніми." : phr ? "Поєднайте фразеологізм з його значенням." : "Поєднайте слово з його значенням.",
          left: ch.map(p => esc(p.a)), right, note: ch.map(p => "<b>" + esc(p.a) + "</b> — " + esc(p.b)).join("; ") + "." };
      },
      function ab(r) {
        const p = pick(r, P), others = sample(r, P.filter(x => x !== p && x.b !== p.b), 3);
        return oneTask(r, { key: "A" + p.a, q: ant ? "Доберіть антонім до слова." : phr ? "Що означає фразеологізм?" : "Що означає слово?", big: esc(p.a),
          note: "<b>" + esc(p.a) + "</b> — " + esc(p.b) + "." }, [p.b].concat(others.map(x => x.b)).map(esc), 0);
      },
      function ba(r) {
        const p = pick(r, P), others = sample(r, P.filter(x => x !== p && x.a !== p.a), 3);
        return oneTask(r, { key: "B" + p.b, q: ant ? "Доберіть антонім до слова." : phr ? "Який фразеологізм має таке значення?" : "Яке слово має таке значення?", big: esc(p.b),
          note: "<b>" + esc(p.a) + "</b> — " + esc(p.b) + "." }, [p.a].concat(others.map(x => x.a)).map(esc), 0);
      },
      function tf(r) {
        const p = pick(r, P), ok = r() < 0.5, b = ok ? p.b : pick(r, P.filter(x => x !== p)).b;
        return oneTask(r, { key: "T" + p.a + b, keepOrder: true,
          q: ant ? "Чи є ці слова антонімами?" : phr ? "Чи правильно пояснено фразеологізм?" : "Чи правильно пояснено значення?",
          big: ant ? esc(p.a) + " — " + esc(b) : "<b>" + esc(p.a) + "</b> — " + esc(b), note: "<b>" + esc(p.a) + "</b> — " + esc(p.b) + "." },
          ant ? ["Так", "Ні"] : ["Правильно", "Неправильно"], ok ? 0 : 1);
      }
    ];
    if (phr) gens.push(function order(r) {
      const p = pick(r, P.filter(x => x.a.split(" ").length >= 3));
      return { t: "order", key: "Or" + p.a, q: "Складіть фразеологізм зі значенням " + q(esc(p.b)) + ".", items: p.a.split(" "), note: "<b>" + esc(p.a) + "</b> — " + esc(p.b) + "." };
    });
    if (ant && S.length) {
      gens.push(function odd(r) {
        const ch = sample(r, P, 3), s = pick(r, S);
        const all = ch.concat([s]), order = shuffle(r, [0, 1, 2, 3]);
        return { t: "one", key: "O" + s.a + ch.map(p => p.a).sort().join("|"), q: "Яка пара слів НЕ є антонімами?",
          opts: order.map(i => esc(all[i].a) + " — " + esc(all[i].b)), a: order.indexOf(3),
          note: "<b>" + esc(s.a) + " — " + esc(s.b) + "</b> — це синоніми (близькі за значенням)." };
      });
      gens.push(function multi(r) {
        const na = 2 + ri(r, 3), ch = sample(r, P, na).map(p => ({ p, ant: true })).concat(sample(r, S, 6 - na).map(p => ({ p, ant: false })));
        const mix = shuffle(r, ch);
        return { t: "multi", key: "M" + mix.map(x => x.p.a).sort().join("|"), q: "Позначте всі пари антонімів.",
          opts: mix.map(x => esc(x.p.a) + " — " + esc(x.p.b)), a: mix.map((x, i) => x.ant ? i : -1).filter(i => i >= 0),
          note: "Синоніми: " + mix.filter(x => !x.ant).map(x => esc(x.p.a) + " — " + esc(x.p.b)).join("; ") + "." };
      });
    }
    return gens;
  }

  /* ───────── stress ───────── */
  function parseStress(w) {
    let pos = -1; const vs = [];
    for (let i = 0; i < w.length; i++) {
      const ch = w[i];
      if (VOW.includes(ch)) { vs.push(i); if (ch !== ch.toLowerCase() && pos < 0) pos = i; }
    }
    return { low: w.toLowerCase(), pos, vs };
  }
  const stressHtml = (low, p) => esc(low.slice(0, p)) + '<span class="st">' + esc(low[p]) + "</span>" + esc(low.slice(p + 1));
  function stressGens(topic) {
    const W = topic.words.map(parseStress).filter(x => x.pos >= 0);
    const multiVow = W.filter(x => x.vs.length >= 2);
    const wrongPos = (r, x) => pick(r, x.vs.filter(v => v !== x.pos));
    const ex = x => "Правильно: <b>" + stressHtml(x.low, x.pos) + "</b>.";
    const sylCat = n => n <= 2 ? 0 : n === 3 ? 1 : 2;
    const CATS = ["2 склади", "3 склади", "4 і більше"];
    return [
      function choose(r) {
        const x = pick(r, multiVow), wr = sample(r, x.vs.filter(v => v !== x.pos), 2);
        return oneTask(r, { key: "C" + x.low, q: "Укажіть слово з правильним наголосом.", note: ex(x) }, [x.pos].concat(wr).map(p => stressHtml(x.low, p)), 0);
      },
      function hunt(r) {
        const ch = sample(r, multiVow, 4), b = ri(r, 4);
        return { t: "one", key: "H" + ch.map(x => x.low).join("|"), q: "У якому слові наголос позначено НЕПРАВИЛЬНО?",
          opts: ch.map((x, i) => stressHtml(x.low, i === b ? wrongPos(r, x) : x.pos)), a: b, note: ex(ch[b]) };
      },
      function syl(r) {
        const x = pick(r, W), n = x.vs.length;
        const opts = [...new Set([n, n + 1, Math.max(1, n - 1), n + 2])].slice(0, 4).sort((a, b) => a - b);
        return { t: "one", key: "Y" + x.low, q: "Скільки складів у слові?", big: esc(x.low), opts: opts.map(String), a: opts.indexOf(n), note: "У слові " + n + " голосн" + (n === 1 ? "ий" : n < 5 ? "і" : "их") + ", тож і складів " + n + "." };
      },
      function tf(r) {
        const x = pick(r, multiVow), ok = r() < 0.5, p = ok ? x.pos : wrongPos(r, x);
        return oneTask(r, { key: "T" + x.low + p, q: "Чи правильно поставлено наголос?", big: stressHtml(x.low, p), note: ex(x), keepOrder: true }, ["Правильно", "Неправильно"], ok ? 0 : 1);
      },
      function right(r) {
        const ch = sample(r, multiVow, 4), g = ri(r, 4);
        return { t: "one", key: "R" + ch.map(x => x.low).join("|"), q: "У якому слові наголос позначено правильно?",
          opts: ch.map((x, i) => stressHtml(x.low, i === g ? x.pos : wrongPos(r, x))), a: g, note: ex(ch[g]) };
      },
      function pos(r) {
        const x = pick(r, multiVow), n = x.vs.indexOf(x.pos) + 1, max = Math.max(3, x.vs.length);
        const opts = []; for (let i = 1; i <= Math.min(max, 4); i++) opts.push(i + "-й");
        return { t: "one", key: "P" + x.low, q: "На який склад падає наголос?", big: esc(x.low), opts, a: n - 1, keepOrder: true, note: ex(x) + " Наголошений склад — " + n + "-й." };
      },
      function sort(r) {
        const ch = sample(r, W, 5);
        if (new Set(ch.map(x => sylCat(x.vs.length))).size < 2) return null;
        return { t: "sort", key: "S" + ch.map(x => x.low).sort().join("|"), q: "Розподіліть слова за кількістю складів.", cats: CATS,
          items: ch.map(x => ({ html: esc(x.low), c: sylCat(x.vs.length) })), note: ch.map(x => esc(x.low) + " — " + x.vs.length).join("; ") + "." };
      }
    ];
  }

  /* ───────── sounds ───────── */
  function soundGens(topic) {
    const W = topic.words.map(x => ({ w: x[0], l: x[1], s: x[2], n: x[3], c: x[2] > x[1] ? 0 : x[2] < x[1] ? 1 : 2 }));
    const CATS = ["звуків більше, ніж букв", "букв більше, ніж звуків", "звуків і букв порівну"];
    const ex = x => "<b>" + esc(x.w) + "</b>: букв — " + x.l + ", звуків — " + x.s + " (" + esc(x.n) + ").";
    const nums = (r, v) => { const s = new Set([v]); const cand = shuffle(r, [v - 1, v + 1, v + 2, v - 2].filter(n => n >= 1)); for (const c of cand) { if (s.size >= 4) break; s.add(c); } return [...s].sort((a, b) => a - b); };
    return [
      function cs(r) { const x = pick(r, W), o = nums(r, x.s); return { t: "one", key: "S" + x.w, q: "Скільки звуків у слові?", big: esc(x.w), opts: o.map(String), a: o.indexOf(x.s), note: ex(x) }; },
      function sort(r) {
        const ch = sample(r, W, 5); if (new Set(ch.map(x => x.c)).size < 2) return null;
        return { t: "sort", key: "So" + ch.map(x => x.w).sort().join("|"), q: "Розподіліть слова за співвідношенням звуків і букв.", cats: CATS, items: ch.map(x => ({ html: esc(x.w), c: x.c })), note: ch.map(ex).join(" ") };
      },
      function cl(r) { const x = pick(r, W), o = nums(r, x.l); return { t: "one", key: "L" + x.w, q: "Скільки букв у слові?", big: esc(x.w), opts: o.map(String), a: o.indexOf(x.l), note: ex(x) }; },
      function multi(r) {
        const ch = sample(r, W, 6), k = pick(r, ch).c, a = ch.map((x, i) => x.c === k ? i : -1).filter(i => i >= 0);
        if (a.length < 1 || a.length > 5) return null;
        return { t: "multi", key: "M" + k + ch.map(x => x.w).sort().join("|"), q: "Позначте всі слова, у яких " + CATS[k] + ".", opts: ch.map(x => esc(x.w)), a, note: ch.map(ex).join(" ") };
      },
      function tf(r) {
        const x = pick(r, W), ok = r() < 0.5, s = ok ? x.s : x.s + (r() < 0.5 && x.s > 2 ? -1 : 1);
        return oneTask(r, { key: "T" + x.w + s, q: "Чи правильне твердження?", big: "У слові " + q(esc(x.w)) + " букв — " + x.l + ", звуків — " + s + ".", note: ex(x), keepOrder: true }, ["Правильне", "Неправильне"], ok ? 0 : 1);
      },
      function which(r) {
        const k = ri(r, 3), A = W.filter(x => x.c === k), B = W.filter(x => x.c !== k);
        const ch = [pick(r, A)].concat(sample(r, B, 3)), order = shuffle(r, [0, 1, 2, 3]);
        return { t: "one", key: "W" + k + ch.map(x => x.w).sort().join("|"), q: "У якому слові " + CATS[k] + "?", opts: order.map(i => esc(ch[i].w)), a: order.indexOf(0), note: ch.map(ex).join(" ") };
      }
    ];
  }

  /* ───────── fixed (hand-written) ───────── */
  function fixedTask(r, f, i) {
    const base = { key: "F" + i, q: f.q, note: f.note ? esc(f.note) : "", big: f.w ? esc(f.w) : "" };
    if (f.t === "one") return oneTask(r, base, f.opts.map(esc), f.a || 0);
    if (f.t === "order") return Object.assign(base, { t: "order", items: f.items, note: f.note ? "<b>" + esc(f.note) + "</b>" : "" });
    if (f.t === "match") {
      const right = shuffle(r, f.pairs.map((p, i) => ({ html: esc(p[1]), li: i })));
      return Object.assign(base, { t: "match", left: f.pairs.map(p => esc(p[0])), right, note: f.pairs.map(p => "<b>" + esc(p[0]) + "</b> — " + esc(p[1])).join("; ") + "." });
    }
    return null;
  }

  function buildTasks(topic) {
    const r = rngFrom("mg-ukr-" + topic.id + "-v1");
    let gens = [];
    if (topic.kind === "gap") gens = gapGens(normItems(topic));
    else if (topic.kind === "variants") gens = variantGens(topic);
    else if (topic.kind === "pairs") { gens = pairGens(topic); if (topic.items) gens = gens.concat(gapGens(normItems(topic))); }
    else if (topic.kind === "stress") gens = stressGens(topic);
    else if (topic.kind === "sounds") gens = soundGens(topic);
    const fixed = (topic.fixed || []).map((f, i) => fixedTask(r, f, i)).filter(Boolean);
    const need = TOTAL - fixed.length, out = [], seen = new Set();
    let tries = 0;
    while (out.length < need && tries < 20000) {
      const g = gens[tries % gens.length]; tries++;
      let t = null; try { t = g(r); } catch (e) { t = null; }
      if (!t || seen.has(t.key)) continue;
      seen.add(t.key); t.gen = g.name; out.push(t);
    }
    fixed.forEach((t, k) => { const pos = Math.min(out.length, Math.round((k + 0.5) * TOTAL / fixed.length)); out.splice(pos, 0, t); });
    return out.slice(0, TOTAL).map((t, i) => Object.assign(t, { n: i }));
  }

  function check(t, resp) {
    if (resp == null) return false;
    if (t.t === "one") return resp === t.a;
    if (t.t === "multi") { const a = [...resp].sort((x, y) => x - y); return a.length === t.a.length && a.every((v, i) => v === t.a[i]); }
    if (t.t === "sort") return t.items.every((it, i) => resp[i] === it.c);
    if (t.t === "match") return t.left.every((_, i) => resp[i] != null && t.right[resp[i]] && t.right[resp[i]].li === i);
    if (t.t === "order") return resp.length === t.items.length && resp.map(i => t.items[i]).join(" ") === t.items.join(" ");
    return false;
  }

  root.MGEngine = { buildTasks, check, rngFrom, shuffle, TOTAL };
})(typeof window !== "undefined" ? window : this);
