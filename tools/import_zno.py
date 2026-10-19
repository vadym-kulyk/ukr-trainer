#!/usr/bin/env python3
"""Імпорт банку завдань ЗНО в тренажер.

Читає ukrmova.json (масив тем {section, topic, url, tasks}) і картинки з папки img/,
записує:
  zno/index.json        — розділи, теми, кількість завдань, файли теорії;
  zno/t/<id>.json       — завдання однієї теми (сайт завантажує їх лише при відкритті теми);
  zno/img/*             — картинки;
  google-apps-script/Code.gs — оновлює список тем ЗНО між маркерами.

Запуск (повторюваний):
  python3 tools/import_zno.py /шлях/до/zno
де /шлях/до/zno — папка з ukrmova.json та img/ (наприклад, гілка
claude/vibrant-wozniak-tmfnkk репозиторію vadym-kulyk/ukrainian).
"""
import hashlib
import json
import pathlib
import re
import shutil
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "zno"

# Теми тренажера, чию теорію показуємо в однойменних темах ЗНО.
TRAINER_THEORY = {
    "Склад. Наголос": ["stress"],
    "Співвідношення звуків і букв": ["sounds"],
    "Правопис літер, що позначають ненаголошені голосні е, и, о": ["eio", "unst_ph"],
    "Правопис префіксів": ["prefix"],
    "Спрощення в групах приголосних": ["simpl"],
    "Зміни приголосних при творенні слів": ["change", "alt_cons"],
    "Апостроф": ["apos"],
    "Мʼякий знак": ["soft"],
    "Сполучення йо, ьо": ["yo"],
    "Подвоєння літер": ["double", "nn_adj", "nn_part"],
    "Правопис слів іншомовного походження": ["foreign"],
    "Велика буква та лапки у власних назвах": ["caps"],
    "Складні слова": ["comp_tog", "comp_hyph"],
    "Правопис не з різними частинами мови": ["ne"],
    "Основні випадки чергування у–в, і–й": ["uv"],
    "Лексичне значення слова": ["meaning"],
    "Антоніми": ["antonym"],
    "Лексична помилка": ["lexerr"],
    "Фразеологія": ["phraseo"],
}


def topic_id(section, topic):
    """Стабільний ідентифікатор теми: не залежить від порядку тем у файлі."""
    return "z" + hashlib.md5((section + "|" + topic).encode("utf-8")).hexdigest()[:6]


def section_id(section):
    m = re.match(r"(\d+\.\d+)\.?\s*(.*)", section)
    return (m.group(1), m.group(2)) if m else (section, section)


def norm_task(t):
    """Приводить завдання до єдиного вигляду, який розуміє сайт."""
    out = {"id": t["id"], "type": t["type"], "q": t.get("question", ""), "ex": t.get("explanation", "")}
    if t["type"] in ("single", "multiple"):
        out["opts"] = [[o["key"], o["text"]] for o in t["options"]]
        out["a"] = t["answer"]
    elif t["type"] == "matching":
        out["titles"] = t.get("titles") or ["", ""]
        left = t.get("left") or []
        if not left:
            # Номери 1–4 вписано прямо в текст питання — показуємо лише номери.
            left = [{"key": k, "text": ""} for k in sorted(t["answer"], key=lambda x: int(x))]
        out["left"] = [[o["key"], o["text"]] for o in left]
        out["right"] = [[o["key"], o["text"]] for o in t["right"]]
        out["a"] = t["answer"]
    else:
        raise ValueError("невідомий тип завдання %r (id %s)" % (t["type"], t["id"]))
    return out


def images_in(task):
    s = json.dumps(task, ensure_ascii=False)
    return set(re.findall(r"!\[[^\]]*\]\((img/[^)]+)\)", s))


def update_code_gs(topics, unique):
    path = ROOT / "google-apps-script" / "Code.gs"
    src = path.read_text(encoding="utf-8")
    lines = ",\n".join("  ['%s', '%s %s']" % (t["id"], t["sec"], t["title"].replace("'", "’")) for t in topics)
    block = "// ZNO-TOPICS-START (оновлює tools/import_zno.py)\nconst ZNO_TOPICS = [\n" + lines + "\n];\nconst ZNO_UNIQUE = %d;\n// ZNO-TOPICS-END" % unique
    new, n = re.subn(r"// ZNO-TOPICS-START.*?// ZNO-TOPICS-END", block, src, flags=re.S)
    if n != 1:
        raise SystemExit("У Code.gs немає маркерів ZNO-TOPICS-START / ZNO-TOPICS-END")
    path.write_text(new, encoding="utf-8")


def main():
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    src = pathlib.Path(sys.argv[1])
    data = json.loads((src / "ukrmova.json").read_text(encoding="utf-8"))

    (OUT / "t").mkdir(parents=True, exist_ok=True)
    for old in (OUT / "t").glob("*.json"):
        old.unlink()

    sections, topics, used_imgs, unique = [], [], set(), set()
    for block in data:
        sid, stitle = section_id(block["section"])
        if not any(s["id"] == sid for s in sections):
            sections.append({"id": sid, "title": stitle})
        tid = topic_id(block["section"], block["topic"])
        tasks = [norm_task(t) for t in block["tasks"]]
        for t in tasks:
            unique.add(t["id"])
            used_imgs |= images_in(t)
        (OUT / "t" / (tid + ".json")).write_text(
            json.dumps({"id": tid, "title": block["topic"], "tasks": tasks}, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8")
        theory_file = OUT / "theory" / (tid + ".html")
        topics.append({
            "id": tid, "sec": sid, "title": block["topic"], "n": len(tasks),
            "ids": [t["id"] for t in tasks],
            "trainer": TRAINER_THEORY.get(block["topic"], []),
            "theory": ("zno/theory/" + tid + ".html") if theory_file.exists() else None,
        })

    # Картинки: копіюємо лише ті, на які є посилання.
    (OUT / "img").mkdir(parents=True, exist_ok=True)
    missing = []
    for rel in sorted(used_imgs):
        s = src / rel
        if s.exists():
            shutil.copy2(s, OUT / rel)
        else:
            missing.append(rel)

    index = {"source": "ukrmova.json", "sections": sections, "topics": topics,
             "total": sum(t["n"] for t in topics), "unique": len(unique)}
    (OUT / "index.json").write_text(json.dumps(index, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    update_code_gs(topics, len(unique))

    print("розділів: %d, тем: %d, завдань: %d (унікальних %d), картинок: %d"
          % (len(sections), len(topics), index["total"], len(unique), len(used_imgs) - len(missing)))
    no_theory = [t["title"] for t in topics if not t["theory"] and not t["trainer"]]
    if no_theory:
        print("без теорії (%d): %s" % (len(no_theory), "; ".join(no_theory)))
    if missing:
        print("НЕМАЄ картинок:", ", ".join(missing))
        sys.exit(1)


if __name__ == "__main__":
    main()
