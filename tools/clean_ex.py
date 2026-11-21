"""Прибирає з пояснень ЗНО й НМТ шаблонні фрази, щоб пояснення починалося з суті.

Видаляє: рядок «ТЕМА: …», речення «(Це) завдання перевіряє / передбачає …»,
загальні поради «У подібних завданнях …», «Готуючись до НМТ …», вступ «Проаналізуймо запропоновані варіанти.», підсумковий рядок
«Відповідь: Б.» (правильну відповідь сайт і так показує над поясненням).
Запуск: python3 tools/clean_ex.py [--dry]  (повторний запуск нічого не змінює).
"""
import json, glob, re, sys, collections

DRY = "--dry" in sys.argv
SENT = re.compile(r"(?<=[.!?])\s+(?=[А-ЯҐЄІЇA-Z«*<])")
TOPIC = re.compile(r"^\W*ТЕМА\b", re.I)
BOILER = re.compile(r"^\W*(Це\s+)?(З|з)авдання\s+(перевіряє|передбачає|спрямован|має на меті|виявляє|визначає рівень)|^\W*(У|В) подібних завданнях|^\W*Готуючись до (НМТ|ЗНО)", re.I)
FILLER = re.compile(r"^\W*(Проаналізуймо|Проаналізуємо|Розгляньмо|Розглянемо)\b[^:]{0,70}[.!]\W*$")
ANSWER = re.compile(r"^\W*(Правильн\w+\s+)?(В|в)ідповід\w*\s*[:–—-]?\s*[А-ДA-E0-9\s,–—-]{1,20}\W*$")
removed = collections.Counter()
samples = collections.defaultdict(list)

def plain(s):
    return re.sub(r"<[^>]+>|\*", "", s).strip()

def clean_text(units, join):
    """units — рядки (ЗНО) або абзаци <p> (НМТ); повертає новий список."""
    out = []
    for u in units:
        p = plain(u)
        if not p:
            out.append(u); continue
        if TOPIC.match(p):
            removed["тема"] += 1; samples["тема"].append(p[:90]); continue
        if ANSWER.match(p) and len(p) < 45:
            removed["відповідь"] += 1; samples["відповідь"].append(p); continue
        if FILLER.match(p):
            removed["вступ"] += 1; samples["вступ"].append(p); continue
        if BOILER.match(p):
            parts = SENT.split(p)
            keep = [x for x in parts if not BOILER.match(x)]
            removed["шаблон"] += 1; samples["шаблон"].append(" | ".join(x[:80] for x in parts if BOILER.match(x)))
            if not keep: continue
            if plain(u) != u:  # була розмітка — не ріжемо її, лишаємо як є, якщо речень кілька
                if len(parts) > 1:
                    removed["шаблон: лишено (розмітка)"] += 1; out.append(u); continue
                continue
            out.append(" ".join(keep)); continue
        out.append(u)
    return out

def clean_zno(ex):
    lines = ex.split("\n")
    return "\n".join(clean_text(lines, "\n")).strip("\n")

PARA = re.compile(r"(<p\b[^>]*>.*?</p>)", re.S)
def clean_nmt(ex):
    parts = PARA.split(ex)
    paras = [x for x in parts]
    res = []
    for x in paras:
        if PARA.fullmatch(x or ""):
            inner = re.sub(r"^<p\b[^>]*>|</p>$", "", x)
            c = clean_text([inner], "")
            if c: res.append(x if c[0] == inner else "<p>" + c[0] + "</p>")
        elif x.strip(): res.append(x.strip())
    return " ".join(res).strip()

changed = 0
for d, fn in (("zno", clean_zno), ("nmt", clean_nmt)):
    for f in sorted(glob.glob(d + "/t/*.json")):
        raw = open(f, encoding="utf-8").read()
        j = json.loads(raw); mod = False
        for t in j.get("tasks", []):
            new = fn(t.get("ex") or "")
            if new and new != t["ex"]:
                t["ex"] = new; mod = True; changed += 1
        if mod and not DRY:
            open(f, "w", encoding="utf-8").write(json.dumps(j, ensure_ascii=False, separators=(",", ":")))
print("змінено пояснень:", changed, dict(removed))
if DRY:
    for k, v in samples.items():
        c = collections.Counter(v)
        print("\n==", k, len(v)); [print("  ", n, s) for s, n in c.most_common(12)]
