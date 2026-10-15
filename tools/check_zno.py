#!/usr/bin/env python3
"""Перевірка цілісності даних: банк ЗНО (zno/), тести НМТ (nmt/), теорія тренажера (theory/), Code.gs.

Запуск: python3 tools/check_zno.py  — код виходу 0, якщо помилок немає.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Z = os.path.join(ROOT, "zno")
errors = []


def err(msg):
    errors.append(msg)


def imgs(text):
    return re.findall(r"!\[[^\]]*\]\(([^)]+)\)", text or "")


def check_html(path):
    """Грубий контроль парності тегів у теорії."""
    s = open(path, encoding="utf-8").read()
    for tag in ("b", "i", "u", "p", "li", "ul", "ol", "table", "tr", "td", "th", "div", "span", "h3", "h4", "em"):
        o = len(re.findall(r"<%s[\s>]" % tag, s))
        c = len(re.findall(r"</%s>" % tag, s))
        if o != c:
            err("%s: <%s> відкрито %d, закрито %d" % (os.path.basename(path), tag, o, c))
    if "<script" in s.lower():
        err("%s: містить <script>" % os.path.basename(path))


index = json.load(open(os.path.join(Z, "index.json"), encoding="utf-8"))
trainer_ids = set(re.findall(r'\bid:\s*["\']([a-z_0-9]+)["\']', open(os.path.join(ROOT, "data.js"), encoding="utf-8").read()
                             + open(os.path.join(ROOT, "data-extra.js"), encoding="utf-8").read()))
seen_ids, total = set(), 0
for t in index["topics"]:
    tid = t["id"]
    data = json.load(open(os.path.join(Z, "t", tid + ".json"), encoding="utf-8"))
    tasks = data["tasks"]
    if len(tasks) != t["n"] or [x["id"] for x in tasks] != t["ids"]:
        err("%s: розбіжність індексу й файлу теми" % tid)
    if len({x["id"] for x in tasks}) != len(tasks):
        err("%s: повторювані id усередині теми" % tid)
    total += len(tasks)
    seen_ids.update(x["id"] for x in tasks)
    if not t.get("theory") and not t.get("trainer"):
        err("%s (%s): немає теорії" % (tid, t["title"]))
    if t.get("theory"):
        p = os.path.join(ROOT, t["theory"])
        if not os.path.exists(p):
            err("%s: немає файлу %s" % (tid, t["theory"]))
        else:
            check_html(p)
    for tr in t.get("trainer") or []:
        if tr not in trainer_ids:
            err("%s: невідома тема тренажера %s" % (tid, tr))
    for x in tasks:
        k = "%s/%s" % (tid, x["id"])
        texts = [x["q"], x.get("ex", "")]
        if x["type"] in ("single", "multiple"):
            keys = [o[0] for o in x["opts"]]
            texts += [o[1] for o in x["opts"]]
            ans = [x["a"]] if x["type"] == "single" else x["a"]
            if not ans or any(a not in keys for a in ans):
                err("%s: відповідь %r поза варіантами %r" % (k, x["a"], keys))
            if len(set(keys)) != len(keys):
                err("%s: повторювані ключі варіантів" % k)
        elif x["type"] == "matching":
            lk = [o[0] for o in x["left"]]
            rk = [o[0] for o in x["right"]]
            texts += [o[1] for o in x["left"] + x["right"]]
            if sorted(x["a"].keys()) != sorted(lk):
                err("%s: ключі відповіді не збігаються з лівою колонкою" % k)
            if any(v not in rk for v in x["a"].values()):
                err("%s: відповідь поза правою колонкою" % k)
        else:
            err("%s: невідомий тип %s" % (k, x["type"]))
        for t_ in texts:
            for im in imgs(t_):
                if not os.path.exists(os.path.join(Z, im)):
                    err("%s: немає картинки %s" % (k, im))

if total != index["total"] or len(seen_ids) != index["unique"]:
    err("підсумки індексу не збігаються: %d/%d, %d/%d" % (total, index["total"], len(seen_ids), index["unique"]))

gs = open(os.path.join(ROOT, "google-apps-script", "Code.gs"), encoding="utf-8").read()
for t in index["topics"]:
    if t["id"] not in gs:
        err("Code.gs: немає теми %s" % t["id"])

# ── Теорія тренажера ──
for tid in sorted(trainer_ids):
    p = os.path.join(ROOT, "theory", tid + ".html")
    if not os.path.exists(p):
        err("theory/%s.html: немає файлу теорії" % tid)
    else:
        check_html(p)

# ── Тести НМТ ──
nmt_index = json.load(open(os.path.join(ROOT, "nmt", "index.json"), encoding="utf-8"))
zno_ids = {t["id"] for t in index["topics"]}
scale = {int(k): v for k, v in nmt_index["scale"].items()}
if min(scale) != 8 or scale[45] != 200 or any(scale[a] > scale[b] for a, b in zip(sorted(scale), sorted(scale)[1:])):
    err("nmt: таблиця переведення має бути зростаючою, 8 → 100 … 45 → 200")
for t in nmt_index["tests"]:
    data = json.load(open(os.path.join(ROOT, "nmt", "t", t["id"] + ".json"), encoding="utf-8"))
    tasks = data["tasks"]
    if len(tasks) != 30:
        err("nmt/%s: %d завдань замість 30" % (t["id"], len(tasks)))
    maxp = 0
    for i, x in enumerate(tasks, 1):
        k = "nmt/%s #%d" % (t["id"], i)
        texts = [x["q"], x.get("ex", "")]
        if x["type"] == "single":
            keys = [o[0] for o in x["opts"]]
            texts += [o[1] for o in x["opts"]]
            if x["a"] not in keys:
                err("%s: відповідь поза варіантами" % k)
            maxp += 1
        elif x["type"] == "matching":
            lk = [o[0] for o in x["left"]]; rk = [o[0] for o in x["right"]]
            texts += [o[1] for o in x["left"] + x["right"]]
            if sorted(x["a"]) != sorted(lk) or any(v not in rk for v in x["a"].values()):
                err("%s: відповідь не відповідає колонкам" % k)
            maxp += len(lk)
        else:
            err("%s: невідомий тип" % k)
        for t_ in texts:
            for src in re.findall(r'src="([^"]+)"', t_):
                if not src.startswith("data:") and not os.path.exists(os.path.join(ROOT, src)):
                    err("%s: немає картинки %s" % (k, src))
            if re.search(r"<script|on\w+=", t_, re.I):
                err("%s: небезпечна розмітка" % k)
        if not x.get("th"):
            err("%s: немає прив’язки до теорії" % k)
        for ref in x.get("th", []):
            kind, rid = ref.split(":")
            if (kind == "z" and rid not in zno_ids) or (kind == "t" and rid not in trainer_ids):
                err("%s: невідома тема теорії %s" % (k, ref))
    if maxp != t["max"] or maxp != 45:
        err("nmt/%s: максимум %d балів замість 45" % (t["id"], maxp))
    if t["id"] not in gs:
        err("Code.gs: немає тесту НМТ %s" % t["id"])

if errors:
    print("\n".join(errors))
    print("ПОМИЛОК: %d" % len(errors))
    sys.exit(1)
print("OK: ЗНО — тем %d, завдань %d (унікальних %d), теорій %d; НМТ — тестів %d; теорій тренажера %d" % (
    len(index["topics"]), total, len(seen_ids), sum(1 for t in index["topics"] if t.get("theory")), len(nmt_index["tests"]), len(trainer_ids)))
