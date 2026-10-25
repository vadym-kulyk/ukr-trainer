#!/usr/bin/env python3
"""Імпорт тренувальних та авторських тестів НМТ з української мови (zno.osvita.ua) у nmt/.

Запуск:
  python3 tools/import_nmt.py --fetch <тека-кешу>   # завантажити сторінки тестів і картинки, потім конвертувати
  python3 tools/import_nmt.py <тека-кешу>           # лише конвертувати вже завантажене

Результат:
  nmt/index.json      — перелік тестів і таблиця переведення балів у шкалу 100–200
  nmt/t/<id>.json     — завдання тесту (очищений HTML, відповіді, пояснення)
  nmt/img/            — картинки до завдань
"""
import hashlib, html, json, os, re, sys, time, urllib.request
from html.parser import HTMLParser

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "nmt")
BASE = "https://zno.osvita.ua"
UA = "Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/130 Safari/537.36"

TESTS = [("avtorskyj_test_ukr_mova_promovazno_2", "Авторський тест від Promova.zno №2", "author"),
         ("avtorskyj_test_ukr_mova_promovazno_1", "Авторський тест від Promova.zno №1", "author"),
         ("avtorskyj_test_ukr_mova_studentua_1", "Авторський тест від Student.ua", "author"),
         ("avtorsky_testj_ukrmova_anny_kachmar_1", "Авторський тест від школи «ЗНО на 200»", "author")]
TESTS += [("ukrmova_nmt_tr_v%d" % i, "Варіант %d" % i, "train") for i in range(29, 0, -1)]

# Офіційна таблиця переведення тестових балів з української мови до шкали 100–200
# (додаток до Порядку прийому 2026 р., наказ МОН № 373 від 26.02.2026). Менше 8 балів — поріг не подолано.
SCALE = {8: 100, 9: 105, 10: 110, 11: 120, 12: 125, 13: 130, 14: 134, 15: 136, 16: 138, 17: 140, 18: 142,
         19: 143, 20: 144, 21: 145, 22: 146, 23: 148, 24: 149, 25: 150, 26: 152, 27: 154, 28: 156, 29: 157,
         30: 159, 31: 160, 32: 162, 33: 163, 34: 165, 35: 167, 36: 170, 37: 172, 38: 175, 39: 177, 40: 180,
         41: 183, 42: 186, 43: 191, 44: 195, 45: 200}

LETTERS = dict(zip("abcde", "АБВГД"))
SHAPES = [(r"kvadrat", "□"), (r"kr[uy]g", "○"), (r"tre[uy]g", "△"), (r"romb", "◇"), (r"trapec", "⏢")]
ALLOWED = {"p", "br", "b", "strong", "i", "em", "u", "sup", "sub", "span", "table", "tbody", "thead", "tr",
           "td", "th", "ul", "ol", "li", "img", "div", "h3", "h4"}
DROP = {"script", "style", "noscript", "iframe", "form", "input", "button"}


# Прив’язка завдань до теорії: (регулярний вираз, посилання). z:<id> — тема ЗНО, t:<id> — тема тренажера.
TOPIC_RULES = [
    (r"наголос", "z:z8f399c"),
    (r"уподібн|однаков\w* звук|зміни звуків", "z:z5fd31e"),
    (r"уподібн|однаков\w* звук|зміни звуків", "t:assim_place"),
    (r"співвідношен\w* звук|звуків більше|звуків менше|букв\w* більше|позначають звук|звук\w* і букв", "z:z5fd31e"),
    (r"чергуван\w* голосн", "t:alt_vowels"),
    (r"чергуван\w* приголосн|змін\w* приголосн при творен|злиття приголосн", "z:z859941"),
    (r"спрощен", "z:zb2c5fc"),
    (r"ненаголошен", "z:z93f6b1"),
    (r"префікс", "z:z6059a6"),
    (r"апостроф", "z:z867fa3"),
    (r"м[’'ʼ]як\w* знак|знак\w* м[’'ʼ]якшення", "z:z444a6d"),
    (r"\bйо\b|\bьо\b", "z:z94e901"),
    (r"подвоєн|подовжен", "z:z28d931"),
    (r"іншомовн|запозичен", "z:z6fab61"),
    (r"велик\w* (літер|букв)|лапк", "z:zf195d1"),
    (r"разом, окремо|через дефіс|складн\w* слів|сполучний звук", "z:z4cf5b0"),
    (r"частк\w* не\b|\bне з ", "z:z001dd9"),
    (r"у[-–]в|і[-–]й|чергуван\w* у", "z:z716223"),
    (r"синонім(?!і\w* складн|і\w* речен|ія речен)", "z:z891618"),
    (r"антонім", "z:zbb8b5b"),
    (r"паронім|лексичн\w* помил|лексичн\w* норм", "z:za0c673"),
    (r"фразеолог", "z:z17087e"),
    (r"лексичн\w* значен|омонім|багатозначн", "z:zea2407"),
    (r"будов\w* слова|словотв|значущ\w* частин|суфікс|\bкор[еі]н", "z:z08b976"),
    (r"по батькові", "z:zf607c5"),
    (r"рід\w* іменник|рід незмінюван", "z:z6c5a6d"),
    (r"кличн|відмін\w* іменник|відмінков\w* (форм|закінчен)|(орудн|родов|давальн|місцев)\w* відмін|іменник", "z:zbbb104"),
    (r"прикметник|ступен\w* порівнян", "z:z880329"),
    (r"числівник", "z:z945e31"),
    (r"займенник", "z:z719e40"),
    (r"дієприкметник", "z:zdda23e"),
    (r"дієприслівник", "z:zb509b5"),
    (r"прислівник", "z:z369782"),
    (r"прийменник|керуван", "z:z5fd6f1"),
    (r"сполучник", "z:z2cd3c2"),
    (r"\bчастк", "z:za5487c"),
    (r"дієсл|наказов\w* спос|дієвідмін", "z:ze14a76"),
    (r"частин\w* мови", "z:zef33c9"),
    (r"деформован|первинний текст|первісн\w* текст|ознаки тексту|будова тексту|зв[’'ʼ]язн", "z:z73320f"),
    (r"пряма мова|прямою мовою|прямої мови|непрям\w* мов|цитат|діалог", "z:zd7efda"),
    (r"звертан|вставн", "z:z359546"),
    (r"прикладк|відокремлен\w* означен", "z:z3d89e0"),
    (r"відокремлен\w* обставин|дієприслівников\w* зворот", "z:zeff0df"),
    (r"відокремлен\w* додат|уточнювальн", "z:z72d05b"),
    (r"відокремлен", "z:z3d89e0"),
    (r"однорідн", "z:zedca4f"),
    (r"односкладн|безособов|називн\w* речен|неозначено-особов", "z:z31568c"),
    (r"підмет|присуд|граматичн\w* основ", "z:z348fa7"),
    (r"другорядн|означен|обставин", "z:ze0e2d5"),
    (r"складносурядн", "z:z2d83b6"),
    (r"безсполучников", "z:z81259b"),
    (r"різними видами зв", "z:ze59284"),
    (r"складнопідрядн|підрядн", "z:zeb0b79"),
    (r"словосполучен", "z:z094395"),
    (r"будов\w* (просто|речен)|побудован\w* речен|тип\w* речен|вид\w* речен|просте речення|складне речення|просте ускладнене", "z:ze89a5c"),
]


def topics_for(task):
    """Теми теорії для завдання: спершу за рядком «ТЕМА», а якщо він загальний — за текстом завдання й пояснення."""
    plain = lambda x: re.sub(r"<[^>]+>", " ", x or "").lower()
    m = re.search(r"тема\s*:?\s*(.*?)</(?:strong|p)>", task.get("ex", ""), re.I)
    tema = plain(m.group(1)) if m else ""
    body = plain(task["q"]) + " " + plain(json.dumps([task.get("opts"), task.get("left"), task.get("titles")], ensure_ascii=False)) + " " + plain(task.get("ex", ""))[:700]
    found = []
    for text in (tema, body):
        for rx, ref in TOPIC_RULES:
            if ref not in found and re.search(rx, text):
                found.append(ref)
        if found:
            break
    found = found[:2]
    # Завдання про вживання тире, де є випадок «між підметом і присудком», — ще й тема тренажера.
    if "тире" in plain(task["q"]) and "підмет" in body and "t:dash_sp" not in found:
        found.append("t:dash_sp")
    return found


def fetch(url, path):
    if os.path.exists(path) and os.path.getsize(path) > 0:
        return
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    with open(path, "wb") as f:
        f.write(data)
    time.sleep(1.0)


class Clean(HTMLParser):
    """Залишає безпечну розмітку, переписує картинки на локальні, фігури — на символи."""

    def __init__(self, img):
        super().__init__(convert_charrefs=True)
        self.img, self.out, self.skip = img, [], 0

    def handle_starttag(self, tag, attrs):
        if tag in DROP:
            self.skip += 1
            return
        if self.skip or tag not in ALLOWED:
            return
        a = dict(attrs)
        if tag == "img":
            src = a.get("src") or ""
            for pat, ch in SHAPES:
                if re.search(pat, src.rsplit("/", 1)[-1]):
                    self.out.append('<span class="zshape">%s</span>' % ch)
                    return
            local = self.img(src)
            if local:
                self.out.append('<img src="%s" alt="" loading="lazy">' % local)
            return
        if tag in ("h3", "h4"):
            tag = "p"
        extra = ""
        if tag in ("td", "th"):
            for k in ("colspan", "rowspan"):
                if a.get(k, "").isdigit():
                    extra += ' %s="%s"' % (k, a[k])
        if tag == "span":
            return  # прольоти без атрибутів не потрібні
        self.out.append("<%s%s>" % (tag, extra))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def handle_endtag(self, tag):
        if tag in DROP:
            self.skip = max(0, self.skip - 1)
            return
        if self.skip or tag not in ALLOWED or tag in ("img", "br", "span"):
            return
        if tag in ("h3", "h4"):
            tag = "p"
        self.out.append("</%s>" % tag)

    def handle_data(self, data):
        if not self.skip:
            self.out.append(html.escape(data, quote=False))


def clean(fragment, img):
    p = Clean(img)
    p.feed(fragment)
    p.close()
    s = "".join(p.out)
    s = s.replace("\xa0", " ")
    s = re.sub(r"<(p|div|li|td)>\s*</\1>", "", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = re.sub(r"(<br>\s*){3,}", "<br><br>", s)
    return s


def between(s, start, end):
    i = s.find(start)
    if i < 0:
        return ""
    i += len(start)
    j = s.find(end, i)
    return s[i:j if j >= 0 else len(s)]


def answers_block(card):
    """Ділянка з варіантами: для відповідності — дві колонки."""
    region = between(card, "<!--marker=", '<div class="clear mb10">')
    cols = re.split(r'<div class="answers col"[^>]*>', region)[1:]
    return cols if cols else [region]


def split_items(block):
    items = []
    for m in re.finditer(r'<div class="answer">\s*<span class="marker">([^<]*)</span>(.*?)</div>', block, re.S):
        items.append((m.group(1).strip(), m.group(2)))
    title = re.search(r'<div class="quest-title">(.*?)</div>', block, re.S)
    return (re.sub(r"<[^>]+>", "", title.group(1)).strip() if title else ""), items


def main():
    args = sys.argv[1:]
    do_fetch = "--fetch" in args
    args = [a for a in args if a != "--fetch"]
    if not args:
        sys.exit(__doc__)
    cache = args[0]
    os.makedirs(cache, exist_ok=True)
    os.makedirs(os.path.join(OUT, "t"), exist_ok=True)
    os.makedirs(os.path.join(OUT, "img"), exist_ok=True)
    used_imgs = set()

    def img(src):
        if src.startswith("data:"):
            return src if len(src) < 20000 else None
        if "banner" in src or "znotest" not in src:
            return None
        url = src if src.startswith("http") else BASE + src
        ext = os.path.splitext(url.split("?")[0])[1].lower() or ".png"
        name = hashlib.md5(url.encode()).hexdigest()[:12] + ext
        path = os.path.join(OUT, "img", name)
        if not os.path.exists(path):
            if not do_fetch:
                raise SystemExit("Немає картинки %s — запустіть з --fetch" % url)
            fetch(url, path)
        used_imgs.add(name)
        return "nmt/img/" + name

    index = []
    for slug, title, group in TESTS:
        page = os.path.join(cache, slug + ".html")
        if do_fetch:
            fetch("%s/multitest/tag-%s/" % (BASE, slug), page)
        s = open(page, encoding="utf-8").read()
        tasks = []
        for card in re.split(r'<div class="task-card', s)[1:]:
            tid = int(re.search(r'name="q\[id\]" value="(\d+)"', card).group(1))
            tip = re.search(r'q\[tip\]" id="q\d+-tip" value="(\d+)"', card).group(1)
            res = re.search(r'name="result" value="([^"]*)"', card).group(1)
            q = clean(between(card, '<div class="question">', '<!--marker='), img)
            q = re.sub(r"(</div>\s*)+$", "", q)
            ex_m = re.search(r'id="commentar_\d+" class="explanation"[^>]*>(.*?)</div>\s*<div class="description">', card, re.S)
            ex = clean(ex_m.group(1), img) if ex_m else ""
            ex = re.sub(r"^<strong>Пояснення</strong>(<br>)*", "", ex)
            blocks = answers_block(card)
            t = {"id": tid, "q": q, "ex": ex}
            if tip == "1":
                _, items = split_items(blocks[0])
                t["type"] = "single"
                t["opts"] = [[k, clean(v, img)] for k, v in items]
                t["a"] = LETTERS[res]
            elif tip == "4":
                lt, left = split_items(blocks[0])
                rt, right = split_items(blocks[1])
                t["type"] = "matching"
                t["titles"] = [lt, rt]
                t["left"] = [[k, clean(v, img)] for k, v in left]
                t["right"] = [[k, clean(v, img)] for k, v in right]
                t["a"] = {p[0]: LETTERS[p[1]] for p in res.split(";")}
            else:
                raise SystemExit("%s: невідомий тип %s" % (slug, tip))
            t["th"] = topics_for(t)
            tasks.append(t)
        if len(tasks) != 30:
            raise SystemExit("%s: %d завдань замість 30" % (slug, len(tasks)))
        tid = slug.replace("ukrmova_nmt_tr_", "").replace("avtorskyj_test_ukr_mova_", "a_").replace("avtorsky_testj_ukrmova_", "a_")
        data = {"id": tid, "title": title, "group": group, "src": "%s/multitest/tag-%s/" % (BASE, slug), "tasks": tasks}
        with open(os.path.join(OUT, "t", tid + ".json"), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
        maxp = sum(1 if x["type"] == "single" else len(x["a"]) for x in tasks)
        index.append({"id": tid, "title": title, "group": group, "src": data["src"], "n": len(tasks), "max": maxp})

    for name in os.listdir(os.path.join(OUT, "img")):
        if name not in used_imgs:
            os.remove(os.path.join(OUT, "img", name))
    with open(os.path.join(OUT, "index.json"), "w", encoding="utf-8") as f:
        json.dump({"tests": index, "scale": SCALE, "minutes": 60,
                   "source": "zno.osvita.ua"}, f, ensure_ascii=False, separators=(",", ":"))
    gs = os.path.join(ROOT, "google-apps-script", "Code.gs")
    code = open(gs, encoding="utf-8").read()
    a, b = code.index("// NMT-TESTS-START"), code.index("// NMT-TESTS-END")
    lines = ",\n".join("  [%s, %s]" % (json.dumps(t["id"]), json.dumps(("Авторський: " if t["group"] == "author" else "") + t["title"].replace("Авторський тест від ", ""), ensure_ascii=False)) for t in index)
    code = code[:a] + "// NMT-TESTS-START (оновлює tools/import_nmt.py)\nconst NMT_TESTS = [\n" + lines + "\n];\n" + code[b:]
    with open(gs, "w", encoding="utf-8") as f:
        f.write(code)
    print("тестів: %d, завдань: %d, картинок: %d" % (len(index), sum(t["n"] for t in index), len(used_imgs)))


if __name__ == "__main__":
    main()
