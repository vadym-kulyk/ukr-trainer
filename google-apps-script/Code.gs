/**
 * Приймач результатів для «Мовного тренажера Midgard».
 * Вставте цей код у Google Таблицю: Розширення → Apps Script, потім
 * Розгорнути → Нове розгортання → Веб-застосунок (доступ: «Усі»).
 * Аркуш «Результати»: кожен учень — один рядок, оновлюється після кожної відповіді.
 *   Стовпець «Прогрес» — шкала з 20 поділок: довжина показує, скільки виконано, колір — частку правильних
 *   (червоний < 30 %, помаранчевий < 50 %, жовтий < 70 %, салатовий < 85 %, зелений ≥ 85 %),
 *   блідо-червона частина — помилки; поруч підпис «виконано % · правильно %».
 *   Відсотки в стовпцях тем мають кольорову заливку. Аркуш «НМТ» має шкалу найкращого балу 100–200.
 * Аркуш «Спроби»: кожна відповідь учня — окремий рядок.
 * Аркуш «ЗНО»: прогрес у темах банку завдань ЗНО (відсоток правильних у кожній темі).
 * Аркуш «НМТ»: результати симуляцій НМТ (бал за шкалою 100–200, тестовий бал, кількість спроб).
 * Аркуш «Профілі»: облікові записи учнів (ім’я, клас, захищений PIN-код).
 *   Забув PIN? Очистіть клітинку «PIN (хеш)» у рядку учня — під час наступного входу
 *   учень задасть новий PIN.
 */

const SHEET_NAME = 'Результати';
const LOG_SHEET = 'Спроби';
const SERVICE_VERSION = 6;
const ZNO_SHEET = 'ЗНО';
const NMT_SHEET = 'НМТ';
const PROFILE_SHEET = 'Профілі';
const PROFILE_HEADER = ['Ключ', 'Учень', 'Клас', 'PIN (хеш)', 'Сіль', 'Створено', 'Останній вхід'];
const MAX_FAILS = 8;
const LOG_HEADER = ['Час', 'Учень', 'Тема', 'Спроба теми №', 'Завдання №', 'Тип завдання', 'Результат', 'Запитання', 'Відповідь учня', 'Правильна відповідь'];
const TYPE_NAMES = { one: 'одна відповідь', multi: 'кілька відповідей', sort: 'розподіл за групами', match: 'відповідність', order: 'порядок',
  single: 'ЗНО: одна відповідь', multiple: 'ЗНО: кілька відповідей', matching: 'ЗНО: відповідність', nmt: 'НМТ: симуляція' };
const TASKS_PER_TOPIC = 100;
const TOPICS = [
  ['stress', '1.1 Склад. Наголос'],
  ['sounds', '1.1 Співвідношення звуків і букв'],
  ['eio', '1.2 Ненаголошені е, и, о'],
  ['prefix', '1.2 Правопис префіксів'],
  ['simpl', '1.2 Спрощення в групах приголосних'],
  ['change', '1.2 Зміни приголосних при творенні слів'],
  ['apos', '1.2 Апостроф'],
  ['soft', '1.2 М’який знак'],
  ['yo', '1.2 Сполучення йо, ьо'],
  ['double', '1.2 Подвоєння літер'],
  ['foreign', '1.2 Слова іншомовного походження'],
  ['caps', '1.2 Велика буква та лапки у власних назвах'],
  ['compound', '1.2 Складні слова'],
  ['ne', '1.2 Правопис не з різними частинами мови'],
  ['uv', '1.2 Чергування у–в, і–й'],
  ['meaning', '1.3 Лексичне значення слова'],
  ['antonym', '1.3 Антоніми'],
  ['lexerr', '1.3 Лексична помилка'],
  ['phraseo', '1.3 Фразеологія'],
  // Теми, додані пізніше, — в кінці, щоб не зсувати наявні стовпці.
  ['assim_place', '1.1 Уподібнення за місцем творення'],
  ['assim_manner', '1.1 Уподібнення за способом творення'],
  ['alt_vowels', '1.1 Чергування голосних'],
  ['alt_cons', '1.1 Чергування приголосних'],
  ['unst_ph', '1.1 Ненаголошені [е], [и], [о]'],
  ['nn_adj', '1.2 Н та нн у прикметниках'],
  ['nn_part', '1.2 Н та нн у дієприкметниках'],
  ['comp_tog', '1.2 Складні слова разом'],
  ['comp_hyph', '1.2 Складні слова через дефіс'],
  ['dash_sp', '1.6 Тире між підметом і присудком'],
  ['ne_verb', '1.2 Не з дієсловами й дієприслівниками'],
  ['ne_noun', '1.2 Не з іменниками й прикметниками'],
  ['ne_part', '1.2 Не з дієприкметниками'],
  ['ne_adv', '1.2 Не і ні з прислівниками, займенниками']
];
// ZNO-TOPICS-START (оновлює tools/import_zno.py)
const ZNO_TOPICS = [
  ['z8f399c', '1.1 Склад. Наголос'],
  ['z5fd31e', '1.1 Співвідношення звуків і букв'],
  ['z93f6b1', '1.2 Правопис літер, що позначають ненаголошені голосні е, и, о'],
  ['z6059a6', '1.2 Правопис префіксів'],
  ['zb2c5fc', '1.2 Спрощення в групах приголосних'],
  ['z859941', '1.2 Зміни приголосних при творенні слів'],
  ['z867fa3', '1.2 Апостроф'],
  ['z444a6d', '1.2 Мʼякий знак'],
  ['z94e901', '1.2 Сполучення йо, ьо'],
  ['z28d931', '1.2 Подвоєння літер'],
  ['z6fab61', '1.2 Правопис слів іншомовного походження'],
  ['zf195d1', '1.2 Велика буква та лапки у власних назвах'],
  ['z4cf5b0', '1.2 Складні слова'],
  ['z001dd9', '1.2 Правопис не з різними частинами мови'],
  ['z716223', '1.2 Основні випадки чергування у–в, і–й'],
  ['zea2407', '1.3 Лексичне значення слова'],
  ['z891618', '1.3 Синоніми'],
  ['zbb8b5b', '1.3 Антоніми'],
  ['za0c673', '1.3 Лексична помилка'],
  ['z17087e', '1.3 Фразеологія'],
  ['z08b976', '1.4 Будова слова. Словотвір'],
  ['zef33c9', '1.5 Класифікація частин мови'],
  ['z6c5a6d', '1.5 Іменник: рід і число іменників'],
  ['zbbb104', '1.5 Іменник: відмінювання іменників'],
  ['zf607c5', '1.5 Іменник: написання імен по батькові'],
  ['z880329', '1.5 Прикметник'],
  ['z945e31', '1.5 Числівник'],
  ['z719e40', '1.5 Займенник'],
  ['ze14a76', '1.5 Дієслово'],
  ['zdda23e', '1.5 Дієприкметник'],
  ['zb509b5', '1.5 Дієприслівник'],
  ['z369782', '1.5 Прислівник'],
  ['z5fd6f1', '1.5 Прийменник'],
  ['z2cd3c2', '1.5 Сполучник'],
  ['za5487c', '1.5 Частка'],
  ['z094395', '1.6 Словосполучення'],
  ['ze89a5c', '1.6 Класифікація речень'],
  ['z348fa7', '1.6 Головні члени речення'],
  ['ze0e2d5', '1.6 Другорядні члени речення'],
  ['z31568c', '1.6 Односкладні речення'],
  ['zedca4f', '1.6 Ускладнене речення: однорідні члени речення'],
  ['z359546', '1.6 Ускладнене речення: звертання, вставні слова, словосполучення, речення'],
  ['z3d89e0', '1.6 Відокремлені члени речення: відокремлене означення'],
  ['zeff0df', '1.6 Відокремлені члени речення: відокремлена обставина'],
  ['z72d05b', '1.6 Відокремлені члени речення: відокремлений додаток'],
  ['z2d83b6', '1.6 Складне речення: складносурядне речення'],
  ['zeb0b79', '1.6 Складне речення: складнопідрядне речення'],
  ['z81259b', '1.6 Складне речення: складне безсполучникове речення'],
  ['ze59284', '1.6 Складне речення: складне речення з різними видами зв’язку'],
  ['zd7efda', '1.6 Чуже мовлення'],
  ['z73320f', '1.6 Засоби міжфразової єдності']
];
const ZNO_UNIQUE = 2077;
// ZNO-TOPICS-END
const ZNO_HEADER = ['Ключ', 'Учень', 'Оновлено', 'Прогрес', 'ЗНО разом, %', 'Виконано завдань']
  .concat(ZNO_TOPICS.map(t => t[1]))
  .concat(['Дані (не змінювати)']);
const ZNO_DATA_COL = ZNO_HEADER.length;

// NMT-TESTS-START (оновлює tools/import_nmt.py)
const NMT_TESTS = [
  ["a_promovazno_2", "Авторський: Promova.zno №2"],
  ["a_promovazno_1", "Авторський: Promova.zno №1"],
  ["a_studentua_1", "Авторський: Student.ua"],
  ["a_anny_kachmar_1", "Авторський: школи «ЗНО на 200»"],
  ["v29", "Варіант 29"],
  ["v28", "Варіант 28"],
  ["v27", "Варіант 27"],
  ["v26", "Варіант 26"],
  ["v25", "Варіант 25"],
  ["v24", "Варіант 24"],
  ["v23", "Варіант 23"],
  ["v22", "Варіант 22"],
  ["v21", "Варіант 21"],
  ["v20", "Варіант 20"],
  ["v19", "Варіант 19"],
  ["v18", "Варіант 18"],
  ["v17", "Варіант 17"],
  ["v16", "Варіант 16"],
  ["v15", "Варіант 15"],
  ["v14", "Варіант 14"],
  ["v13", "Варіант 13"],
  ["v12", "Варіант 12"],
  ["v11", "Варіант 11"],
  ["v10", "Варіант 10"],
  ["v9", "Варіант 9"],
  ["v8", "Варіант 8"],
  ["v7", "Варіант 7"],
  ["v6", "Варіант 6"],
  ["v5", "Варіант 5"],
  ["v4", "Варіант 4"],
  ["v3", "Варіант 3"],
  ["v2", "Варіант 2"],
  ["v1", "Варіант 1"]
];
// NMT-TESTS-END
const NMT_HEADER = ['Ключ', 'Учень', 'Оновлено', 'Шкала', 'Найкращий бал (100–200)', 'Пройдено тестів']
  .concat(NMT_TESTS.map(t => t[1]))
  .concat(['Дані (не змінювати)']);
const NMT_DATA_COL = NMT_HEADER.length;

// Стовпці: Ключ | Учень | Оновлено | Прогрес (шкала) | Разом % | Виконано | теми тренажера (% правильних) | Дані
const HEADER = ['Ключ', 'Учень', 'Оновлено', 'Прогрес', 'Разом, %', 'Виконано завдань']
  .concat(TOPICS.map(t => t[1]))
  .concat(['Дані (не змінювати)']);
const DATA_COL = HEADER.length;
const DATA_TITLE = HEADER[HEADER.length - 1];
const BAR_COL = 4; // стовпець зі шкалою на аркушах «Результати», «ЗНО», «НМТ»

/* ───────── Шкали й кольори ───────── */

/** Колір за відсотком правильних: червоний → помаранчевий → жовтий → зелений. */
function levelColor_(pct) {
  if (pct >= 85) return '#1e8e3e';
  if (pct >= 70) return '#7cb342';
  if (pct >= 50) return '#f9ab00';
  if (pct >= 30) return '#f57c00';
  return '#d93025';
}

const BAR_LEN = 20; // кількість поділок шкали

/**
 * Горизонтальна шкала з символів «█», без формул (працює за будь-яких мовних налаштувань таблиці).
 * parts — [[кількість, колір], …]; решту до BAR_LEN заповнюємо світло-сірим «░».
 */
function richBar_(parts, label) {
  let text = '', styles = [];
  parts.forEach(([n, color]) => {
    if (n <= 0) return;
    styles.push([text.length, text.length + n, color]);
    text += '█'.repeat(n);
  });
  const rest = BAR_LEN - text.length;
  if (rest > 0) { styles.push([text.length, BAR_LEN, '#dadce0']); text += '░'.repeat(rest); }
  if (label) { styles.push([text.length, text.length + label.length + 1, '#5f6368']); text += ' ' + label; }
  const b = SpreadsheetApp.newRichTextValue().setText(text);
  styles.forEach(([from, to, color]) => b.setTextStyle(from, to, SpreadsheetApp.newTextStyle().setForegroundColor(color).build()));
  return b.build();
}

/**
 * Шкала прогресу: довжина — скільки виконано з усіх завдань,
 * колір першої частини — частка правильних серед виконаних, блідо-червона частина — помилки.
 */
function progressBar_(ok, done, total) {
  if (!total || !done) return null;
  let okN = Math.round(ok / total * BAR_LEN), doneN = Math.max(1, Math.round(done / total * BAR_LEN));
  if (ok > 0 && okN === 0) okN = 1;
  okN = Math.min(okN, doneN);
  const label = Math.round(done / total * 100) + ' % · ' + Math.round(ok / done * 100) + ' % правильно';
  return richBar_([[okN, levelColor_(ok / done * 100)], [doneN - okN, '#f28b82']], label);
}

/** Шкала балу НМТ: 100 — порожньо, 200 — повна; колір за балом. */
function scoreBar_(score) {
  if (!score) return null;
  const color = score >= 180 ? '#1e8e3e' : score >= 160 ? '#7cb342' : score >= 140 ? '#f9ab00' : score >= 120 ? '#f57c00' : '#d93025';
  return richBar_([[Math.max(1, Math.round((score - 100) / 100 * BAR_LEN)), color]], String(score));
}

/** Кольорова заливка відсотків: 0 — червоний, 50 — жовтий, 100 — зелений. */
function gradientRule_(range, min, mid, max) {
  return SpreadsheetApp.newConditionalFormatRule()
    .setGradientMinpointWithValue('#f4c7c3', SpreadsheetApp.InterpolationType.NUMBER, String(min))
    .setGradientMidpointWithValue('#fce8b2', SpreadsheetApp.InterpolationType.NUMBER, String(mid))
    .setGradientMaxpointWithValue('#b7e1cd', SpreadsheetApp.InterpolationType.NUMBER, String(max))
    .setRanges([range]).build();
}

/** Оформлення аркуша: закріплення, приховані службові стовпці, ширина шкали, заливка відсотків. */
function styleSheet_(sh, header, gradients) {
  const dataCol = header.length;
  sh.setFrozenRows(1);
  sh.setFrozenColumns(2);
  sh.getRange(1, 1, 1, dataCol).setValues([header]).setFontWeight('bold').setWrap(true).setVerticalAlignment('middle');
  sh.hideColumns(1);
  sh.hideColumns(dataCol);
  sh.setColumnWidth(BAR_COL, 290);
  sh.getRange(1, BAR_COL, sh.getMaxRows(), 1).setFontFamily('Arial').setFontSize(10);
  if (sh.getMaxRows() < 1000) sh.insertRowsAfter(sh.getMaxRows(), 1000 - sh.getMaxRows());
  const rows = sh.getMaxRows() - 1;
  sh.setConditionalFormatRules(gradients.map(g => gradientRule_(sh.getRange(2, g[0], rows, g[1] - g[0] + 1), g[2], g[3], g[4])));
}

/**
 * Повертає аркуш із потрібним заголовком. Якщо заголовок змінився (нові теми чи стовпці),
 * перебудовує всі рядки з прихованого стовпця «Дані», тож прогрес учнів не зсувається.
 */
function ensureSheet_(name, header, gradients, build) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  const dataCol = header.length;
  if (sh.getLastRow() === 0) {
    if (sh.getMaxColumns() < dataCol) sh.insertColumnsAfter(sh.getMaxColumns(), dataCol - sh.getMaxColumns());
    styleSheet_(sh, header, gradients);
    return sh;
  }
  const lastCol = sh.getLastColumn();
  const cur = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  if (cur.length === dataCol && cur.join('|') === header.join('|')) return sh;
  const oldData = cur.indexOf(DATA_TITLE), oldUpd = cur.indexOf('Оновлено');
  const n = sh.getLastRow() - 1;
  const old = n > 0 ? sh.getRange(2, 1, n, lastCol).getValues() : [];
  sh.clear();
  sh.setConditionalFormatRules([]);
  sh.showColumns(1, sh.getMaxColumns());
  if (sh.getMaxColumns() < dataCol) sh.insertColumnsAfter(sh.getMaxColumns(), dataCol - sh.getMaxColumns());
  styleSheet_(sh, header, gradients);
  old.forEach((r, i) => {
    let stored = {};
    try { stored = JSON.parse((oldData >= 0 && r[oldData]) || '{}'); } catch (err) { stored = {}; }
    const built = build(String(r[0]), String(r[1]), oldUpd >= 0 && r[oldUpd] ? r[oldUpd] : new Date(), stored);
    writeRow_(sh, i + 2, built);
  });
  return sh;
}

/** Записує рядок і шкалу. built = { values: [...], bar: RichTextValue або null }. */
function writeRow_(sh, rowNum, built) {
  if (rowNum < 0) rowNum = sh.getLastRow() + 1;
  if (rowNum > sh.getMaxRows()) sh.insertRowsAfter(sh.getMaxRows(), 100);
  const vals = built.values.slice();
  vals[BAR_COL - 1] = '';
  sh.getRange(rowNum, 1, 1, vals.length).setValues([vals]);
  const cell = sh.getRange(rowNum, BAR_COL);
  if (built.bar) cell.setRichTextValue(built.bar); else cell.clearContent();
}

/* ───────── Рядки аркушів ───────── */

function buildResults_(key, display, updated, stored) {
  let answered = 0, correct = 0;
  const perTopic = TOPICS.map(([id]) => {
    const r = cleanR_(stored[id]) || '.'.repeat(TASKS_PER_TOPIC);
    const done = r.replace(/\./g, '').length;
    const ok = r.replace(/[^1]/g, '').length;
    answered += done; correct += ok;
    return done ? ok : '';
  });
  const all = TOPICS.length * TASKS_PER_TOPIC;
  const total = Math.round(correct / all * 1000) / 10;
  return {
    values: [key, display, updated, '', total, answered].concat(perTopic).concat([JSON.stringify(stored)]),
    bar: progressBar_(correct, answered, all)
  };
}

function buildZno_(key, display, updated, stored) {
  const done = {};
  const perTopic = ZNO_TOPICS.map(([id]) => {
    const t = stored[id];
    if (!t || !t.s) return '';
    let ok = 0;
    t.s.split(';').forEach(pair => {
      const m = pair.match(/^(\d+):([01])$/);
      if (!m) return;
      if (m[2] === '1') ok++;
      if (m[2] === '1' || !(m[1] in done)) done[m[1]] = m[2];
    });
    return t.n ? Math.round(ok / t.n * 1000) / 10 : '';
  });
  const ids = Object.keys(done);
  const ok = ids.filter(id => done[id] === '1').length;
  const total = ZNO_UNIQUE ? Math.round(ok / ZNO_UNIQUE * 1000) / 10 : '';
  return {
    values: [key, display, updated, '', ids.length ? total : '', ids.length || ''].concat(perTopic).concat([JSON.stringify(stored)]),
    bar: progressBar_(ok, ids.length, ZNO_UNIQUE)
  };
}

function buildNmt_(key, display, updated, stored) {
  let done = 0, bestAll = '';
  const perTest = NMT_TESTS.map(([id]) => {
    const t = stored[id];
    if (!t) return '';
    done++;
    if (t.bs && (bestAll === '' || t.bs > bestAll)) bestAll = t.bs;
    return 'найкраще ' + (t.bs || 'поріг не подолано') + ' (' + t.bp + '/45); останнє ' + (t.s || 'поріг не подолано') + ' (' + t.p + '/45); спроб ' + t.n + (t.blur ? '; виходів зі сторінки ' + t.blur : '');
  });
  return {
    values: [key, display, updated, '', bestAll, done || ''].concat(perTest).concat([JSON.stringify(stored)]),
    bar: scoreBar_(bestAll)
  };
}

function sheet_() {
  return ensureSheet_(SHEET_NAME, HEADER, [[7, 6 + TOPICS.length, 0, 50, 100]], buildResults_);
}

function znoSheet_() {
  return ensureSheet_(ZNO_SHEET, ZNO_HEADER, [[7, 6 + ZNO_TOPICS.length, 0, 50, 100]], buildZno_);
}

function nmtSheet_() {
  return ensureSheet_(NMT_SHEET, NMT_HEADER, [[5, 5, 100, 150, 200]], buildNmt_);
}

/** Запустіть вручну в редакторі Apps Script, щоб одразу перебудувати всі аркуші (не обов’язково). */
function rebuildAll() {
  sheet_();
  znoSheet_();
  nmtSheet_();
}

function readNmt_(key) {
  const sh = nmtSheet_();
  const row = findRow_(sh, key);
  if (row < 0) return {};
  try { return JSON.parse(sh.getRange(row, NMT_DATA_COL).getValue() || '{}'); } catch (err) { return {}; }
}

/** Результат тесту: p — тестовий бал (0–45), s — бал 100–200 (0 — поріг не подолано), bp/bs — найкращі, n — спроб. */
function cleanNmt_(v) {
  if (!v || typeof v !== 'object') return null;
  const num = (x, max) => { x = Math.round(Number(x)); return isFinite(x) && x >= 0 && x <= max ? x : null; };
  const o = { p: num(v.p, 60), s: num(v.s, 200), bp: num(v.bp, 60), bs: num(v.bs, 200), n: num(v.n, 1000), at: Number(v.at) || 0, blur: num(v.blur, 100000) || 0 };
  return o.p === null || o.s === null || o.bp === null || o.bs === null || !o.n ? null : o;
}

function saveNmt_(d, p, display) {
  if (!d.nmt || typeof d.nmt !== 'object') return;
  const sh = nmtSheet_();
  const row = findRow_(sh, p.key);
  const stored = readNmt_(p.key);
  Object.keys(d.nmt).forEach(id => {
    if (!NMT_TESTS.some(t => t[0] === id)) return;
    const v = cleanNmt_(d.nmt[id]);
    if (!v) return;
    const old = stored[id];
    if (old && old.n > v.n) return;
    stored[id] = v;
  });
  writeRow_(sh, row, buildNmt_(p.key, display, new Date(), stored));
}

function readZno_(key) {
  const sh = znoSheet_();
  const row = findRow_(sh, key);
  if (row < 0) return {};
  try { return JSON.parse(sh.getRange(row, ZNO_DATA_COL).getValue() || '{}'); } catch (err) { return {}; }
}

/** Прогрес теми ЗНО — рядок «id:1;id:0;…» (1 — правильно, 0 — помилка). */
function cleanZno_(s) {
  s = String(s || '');
  return /^(\d+:[01];?)*$/.test(s) ? s.replace(/;$/, '') : null;
}

function saveZno_(d, p, display) {
  if (!d.zno || typeof d.zno !== 'object') return;
  const sh = znoSheet_();
  const row = findRow_(sh, p.key);
  const stored = readZno_(p.key);
  Object.keys(d.zno).forEach(id => {
    if (!ZNO_TOPICS.some(t => t[0] === id)) return;
    const s = cleanZno_(d.zno[id] && d.zno[id].s);
    if (s === null) return;
    stored[id] = { s: s, n: Number(d.zno[id].n) || 0 };
  });
  writeRow_(sh, row, buildZno_(p.key, display, new Date(), stored));
}

function znoOut_(key) {
  const stored = readZno_(key), out = {};
  Object.keys(stored).forEach(id => { if (stored[id] && stored[id].s != null) out[id] = stored[id].s; });
  return out;
}

function logSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(LOG_SHEET);
  if (!sh) sh = ss.insertSheet(LOG_SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(LOG_HEADER);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, LOG_HEADER.length).setFontWeight('bold');
  }
  return sh;
}

/** Текст від учня: обрізаємо й не даємо таблиці сприйняти його як формулу. */
function txt_(v, max) {
  return String(v == null ? '' : v).replace(/^[=+\-@]+/, '').slice(0, max || 500);
}

function appendEvents_(name, events) {
  if (!Array.isArray(events) || !events.length) return 0;
  const titles = {};
  TOPICS.forEach(([id, title]) => { titles[id] = title; });
  ZNO_TOPICS.forEach(([id, title]) => { titles[id] = 'ЗНО ' + title; });
  NMT_TESTS.forEach(([id, title]) => { titles['nmt:' + id] = 'НМТ ' + title; });
  const rows = events.slice(0, 300).filter(ev => ev && titles[ev.topic]).map(ev => [
    ev.at ? new Date(Number(ev.at)) : new Date(),
    name,
    titles[ev.topic],
    Number(ev.att) || 1,
    Number(ev.n) || '',
    TYPE_NAMES[ev.type] || txt_(ev.type, 30),
    ev.type === 'nmt' ? (ev.ok ? 'поріг подолано' : 'поріг не подолано') : ev.ok ? '✓ правильно' : '✗ помилка',
    txt_(ev.q),
    txt_(ev.ans),
    txt_(ev.right)
  ]);
  if (!rows.length) return 0;
  const sh = logSheet_();
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, LOG_HEADER.length).setValues(rows);
  return rows.length;
}

function out_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function cleanR_(r) {
  r = String(r || '');
  if (!/^[.01]+$/.test(r)) return null;
  return (r + '.'.repeat(TASKS_PER_TOPIC)).slice(0, TASKS_PER_TOPIC);
}

function findRow_(sh, key) {
  const last = sh.getLastRow();
  if (last < 2) return -1;
  const keys = sh.getRange(2, 1, last - 1, 1).getValues();
  for (let i = 0; i < keys.length; i++) if (keys[i][0] === key) return i + 2;
  return -1;
}

/* ───────── Профілі ───────── */

function profileSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(PROFILE_SHEET);
  if (!sh) sh = ss.insertSheet(PROFILE_SHEET);
  if (sh.getLastRow() === 0) {
    sh.appendRow(PROFILE_HEADER);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, PROFILE_HEADER.length).setFontWeight('bold');
    sh.hideColumns(1);
    sh.hideColumns(5);
  }
  return sh;
}

/** Такий самий ключ, як на сайті: малі літери, пробіли й апострофи → «_». */
function slug_(s) {
  return String(s).trim().toLowerCase().replace(/\s+/g, ' ')
    .replace(/[^\p{L}\p{N} ’'-]/gu, '').replace(/[ ’'-]+/g, '_').slice(0, 80);
}

function hash_(s) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8));
}

function secret_() {
  const p = PropertiesService.getScriptProperties();
  let s = p.getProperty('SECRET');
  if (!s) { s = Utilities.getUuid() + Utilities.getUuid(); p.setProperty('SECRET', s); }
  return s;
}

/** Токен сесії: підпис ключа секретом скрипта. Його не можна підробити без секрету. */
function token_(key) {
  return hash_(secret_() + '|' + key).replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
}

function cleanPart_(v) {
  return txt_(v, 40).trim().replace(/\s+/g, ' ');
}

function readStored_(sh, rowNum) {
  if (rowNum < 0) return {};
  try { return JSON.parse(sh.getRange(rowNum, DATA_COL).getValue() || '{}'); } catch (err) { return {}; }
}

function topicsOut_(stored) {
  const topics = {}, att = stored._att || {};
  TOPICS.forEach(([id]) => { if (stored[id]) topics[id] = { r: stored[id], att: Number(att[id]) || 1 }; });
  return topics;
}

function failCount_(key) {
  return Number(CacheService.getScriptCache().get('fail_' + key) || 0);
}

function addFail_(key) {
  const c = CacheService.getScriptCache();
  c.put('fail_' + key, String(failCount_(key) + 1), 15 * 60);
}

function register_(d) {
  const first = cleanPart_(d.first), last = cleanPart_(d.last), cls = cleanPart_(d.cls).toUpperCase().slice(0, 12);
  const pin = String(d.pin || '');
  if (!first || !last || !cls) return { ok: false, error: 'bad_name' };
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, error: 'bad_pin_format' };
  const name = first + ' ' + last;
  const key = slug_(name + ' ' + cls);
  const ps = profileSheet_();
  if (findRow_(ps, key) > 0) return { ok: false, error: 'exists' };
  const salt = Utilities.getUuid();
  ps.appendRow([key, name, cls, hash_(salt + '|' + pin), salt, new Date(), new Date()]);

  // Переносимо прогрес, збережений раніше лише за ім’ям (до появи профілів).
  const rs = sheet_();
  let rowNum = findRow_(rs, key);
  if (rowNum < 0) {
    const legacy = findRow_(rs, slug_(name));
    if (legacy > 0 && findRow_(ps, slug_(name)) < 0) {
      rs.getRange(legacy, 1, 1, 2).setValues([[key, name + ' (' + cls + ')']]);
      rowNum = legacy;
    }
  }
  return { ok: true, key, token: token_(key), name, cls, topics: topicsOut_(readStored_(rs, rowNum)), zno: znoOut_(key), nmt: readNmt_(key), v: SERVICE_VERSION };
}

function login_(d) {
  const first = cleanPart_(d.first), last = cleanPart_(d.last), cls = cleanPart_(d.cls).toUpperCase().slice(0, 12);
  const pin = String(d.pin || '');
  const name = first + ' ' + last;
  const key = slug_(name + ' ' + cls);
  const ps = profileSheet_();
  const row = findRow_(ps, key);
  if (row < 0) return { ok: false, error: 'not_found' };
  if (failCount_(key) >= MAX_FAILS) return { ok: false, error: 'locked' };
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, error: 'bad_pin_format' };
  const vals = ps.getRange(row, 1, 1, PROFILE_HEADER.length).getValues()[0];
  let pinHash = String(vals[3] || ''), salt = String(vals[4] || '');
  if (!pinHash) {
    // Учитель скинув PIN: цей вхід задає новий.
    salt = Utilities.getUuid();
    ps.getRange(row, 4, 1, 2).setValues([[hash_(salt + '|' + pin), salt]]);
  } else if (hash_(salt + '|' + pin) !== pinHash) {
    addFail_(key);
    return { ok: false, error: 'bad_pin' };
  }
  CacheService.getScriptCache().remove('fail_' + key);
  ps.getRange(row, 7).setValue(new Date());
  const rs = sheet_();
  return { ok: true, key, token: token_(key), name: String(vals[1]), cls: String(vals[2]), topics: topicsOut_(readStored_(rs, findRow_(rs, key))), zno: znoOut_(key), nmt: readNmt_(key), v: SERVICE_VERSION };
}

/** Перевіряє токен і повертає профіль учня або null. */
function auth_(d) {
  const key = String(d.key || '').slice(0, 100);
  if (!key || String(d.token || '') !== token_(key)) return null;
  const ps = profileSheet_();
  const row = findRow_(ps, key);
  if (row < 0) return null;
  const vals = ps.getRange(row, 1, 1, 3).getValues()[0];
  return { key, name: String(vals[1]), cls: String(vals[2]) };
}

/** Відкидає записи журналу, які вже надходили (на випадок повторного надсилання). */
function freshEvents_(events) {
  if (!Array.isArray(events)) return [];
  const c = CacheService.getScriptCache(), out = [];
  events.slice(0, 300).forEach(ev => {
    const id = ev && ev.id ? 'ev_' + String(ev.id).slice(0, 200) : null;
    if (id && c.get(id)) return;
    if (id) c.put(id, '1', 6 * 60 * 60);
    out.push(ev);
  });
  return out;
}

function save_(d, p) {
  const display = p.name + ' (' + p.cls + ')';
  const logged = appendEvents_(display, freshEvents_(d.events));
  const sh = sheet_();
  const rowNum = findRow_(sh, p.key);
  const stored = readStored_(sh, rowNum);
  const incoming = d.topics || {};
  const att = stored._att || {};
  TOPICS.forEach(([id]) => {
    const a = cleanR_(stored[id]) || '.'.repeat(TASKS_PER_TOPIC);
    const b = incoming[id] ? cleanR_(incoming[id].r) : null;
    // Сайт перед надсиланням уже об’єднав прогрес із таблицею, тож новий стан теми
    // (зокрема після «Почати тему заново») приймаємо як є; теми, яких немає в запиті, лишаються.
    stored[id] = b || a;
    if (incoming[id]) att[id] = Math.max(Number(att[id]) || 1, Number(incoming[id].att) || 1);
  });
  stored._att = att;
  writeRow_(sh, rowNum, buildResults_(p.key, display, new Date(), stored));
  saveZno_(d, p, display);
  saveNmt_(d, p, display);
  return { ok: true, logged, v: SERVICE_VERSION };
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const d = JSON.parse(e.postData.contents);
    if (d.action === 'register') return out_(register_(d));
    if (d.action === 'login') return out_(login_(d));
    if (d.action === 'load' || d.action === 'save') {
      const p = auth_(d);
      if (!p) return out_({ ok: false, error: 'auth' });
      if (d.action === 'load') {
        const sh = sheet_();
        return out_({ ok: true, topics: topicsOut_(readStored_(sh, findRow_(sh, p.key))), zno: znoOut_(p.key), nmt: readNmt_(p.key), v: SERVICE_VERSION });
      }
      return out_(save_(d, p));
    }
    return out_({ ok: false, error: 'auth' });
  } catch (err) {
    return out_({ ok: false, error: 'server', detail: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Перевірка, що скрипт працює. Прогрес без входу в профіль не видаємо. */
function doGet() {
  return out_({ ok: true, service: 'mg-ukr-trainer', v: SERVICE_VERSION });
}
