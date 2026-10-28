/**
 * Приймач результатів для «Мовного тренажера Midgard».
 * Вставте цей код у Google Таблицю: Розширення → Apps Script, потім
 * Розгорнути → Нове розгортання → Веб-застосунок (доступ: «Усі»).
 * Аркуш «Результати»: кожен учень — один рядок, оновлюється після кожної відповіді.
 *   Стовпець «Прогрес» — шкала з 20 поділок: довжина показує, скільки виконано, колір — частку правильних
 *   (червоний < 30 %, помаранчевий < 50 %, жовтий < 70 %, салатовий < 85 %, зелений ≥ 85 %),
 *   блідо-червона частина — помилки; поруч підпис «виконано % · правильно %».
 *   Відсотки в стовпцях тем мають кольорову заливку. Аркуш «НМТ» має шкалу найкращого балу 100–200.
 * Стовпець «Робота над помилками» — скільки помилок учень виправив у розділі «Мої помилки» (перший результат теми не змінюється).
 * Аркуш «Спроби»: кожна відповідь учня — окремий рядок (і кроки роботи над помилками).
 * Аркуш «ЗНО»: прогрес у темах банку завдань ЗНО (відсоток правильних у кожній темі).
 * Аркуш «НМТ»: результати симуляцій НМТ (бал за шкалою 100–200, тестовий бал, кількість спроб).
 * Аркуш «Профілі»: облікові записи учнів (ім’я, клас, захищений PIN-код).
 * Аркуші «Повідомлення», «Відповіді учнів», «Призначення» ведуться з адмін-панелі (admin.html).
 *   Пароль адміністратора: меню таблиці «Тренажер» → «Задати пароль адміністратора».
 *   Забув PIN? Очистіть клітинку «PIN (хеш)» у рядку учня — під час наступного входу
 *   учень задасть новий PIN.
 */

const SHEET_NAME = 'Результати';
const LOG_SHEET = 'Спроби';
const SERVICE_VERSION = 10;
const ZNO_SHEET = 'ЗНО';
const NMT_SHEET = 'НМТ';
const PROFILE_SHEET = 'Профілі';
const PROFILE_HEADER = ['Ключ', 'Учень', 'Клас', 'PIN (хеш)', 'Сіль', 'Створено', 'Останній вхід'];
const MAX_FAILS = 8;
const LOG_HEADER = ['Час', 'Учень', 'Тема', 'Спроба теми №', 'Завдання №', 'Тип завдання', 'Результат', 'Запитання', 'Відповідь учня', 'Правильна відповідь',
  'Час на завдання, с', 'Виходів зі сторінки', 'Поза сторінкою, с'];
const TYPE_NAMES = { one: 'одна відповідь', multi: 'кілька відповідей', sort: 'розподіл за групами', match: 'відповідність', order: 'порядок',
  single: 'ЗНО: одна відповідь', multiple: 'ЗНО: кілька відповідей', matching: 'ЗНО: відповідність', nmt: 'НМТ: симуляція', fix: 'робота над помилками' };
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

// Стовпці: Ключ | Учень | Оновлено | Прогрес (шкала) | Разом % | Виконано | теми тренажера (% правильних) | Робота над помилками | Дані
const HEADER = ['Ключ', 'Учень', 'Оновлено', 'Прогрес', 'Разом, %', 'Виконано завдань']
  .concat(TOPICS.map(t => t[1]))
  .concat(['Робота над помилками', 'Дані (не змінювати)']);
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
    values: [key, display, updated, '', total, answered].concat(perTopic).concat([fixText_(stored._fixSum), JSON.stringify(stored)]),
    bar: progressBar_(correct, answered, all)
  };
}

/** Підсумок роботи над помилками: «виправлено 12 з 30 (тренажер 10/20, ЗНО 2/6, НМТ 0/4)». */
function fixText_(sum) {
  if (!sum || !(sum.open + sum.done)) return '';
  const part = (name, x) => x && (x.open + x.done) ? name + ' ' + x.done + '/' + (x.open + x.done) : '';
  const parts = [part('тренажер', sum.t), part('ЗНО', sum.z), part('НМТ', sum.n)].filter(Boolean);
  return 'виправлено ' + sum.done + ' з ' + (sum.open + sum.done) + (parts.length ? ' (' + parts.join(', ') + ')' : '');
}

/** Поєднує позначки виправлених помилок: виправлене лишається виправленим, кількість спроб — більша. */
function mergeFix_(a, b) {
  const out = Object.assign({}, a || {});
  Object.keys(b || {}).slice(0, 5000).forEach(k => {
    const x = out[k] || {}, y = b[k] || {};
    const d = Number(x.d) || Number(y.d) || 0, t = Math.max(Number(x.t) || 0, Number(y.t) || 0);
    out[String(k).slice(0, 80)] = d ? { d } : { t };
  });
  return out;
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
  } else if (sh.getLastColumn() < LOG_HEADER.length) {
    // Старий журнал без стовпців зосередженості: дописуємо заголовки.
    sh.getRange(1, 1, 1, LOG_HEADER.length).setValues([LOG_HEADER]).setFontWeight('bold');
  }
  return sh;
}

/** Невід’ємне ціле число або порожньо (для старих версій сайту, що не надсилають час). */
function num_(v) {
  if (v === undefined || v === null || v === '' || isNaN(Number(v))) return '';
  return Math.max(0, Math.round(Number(v)));
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
    txt_(ev.right),
    num_(ev.sec),
    num_(ev.ex),
    num_(ev.away)
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
  const stored = readStored_(rs, findRow_(rs, key));
  return { ok: true, key, token: token_(key), name: String(vals[1]), cls: String(vals[2]), topics: topicsOut_(stored), zno: znoOut_(key), nmt: readNmt_(key), fix: stored._fix || {}, v: SERVICE_VERSION };
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
  if (d.fix && typeof d.fix === 'object') {
    stored._fix = mergeFix_(stored._fix, d.fix.map);
    if (d.fix.sum) stored._fixSum = d.fix.sum;
  }
  writeRow_(sh, rowNum, buildResults_(p.key, display, new Date(), stored));
  saveZno_(d, p, display);
  saveNmt_(d, p, display);
  return { ok: true, logged, v: SERVICE_VERSION };
}

function doPost(e) {
  let d;
  try { d = JSON.parse(e.postData.contents); } catch (err) { return out_({ ok: false, error: 'server', detail: 'bad json' }); }
  // Читання статистики й вхід адміністратора нічого не записують у спільні аркуші,
  // тож не стоять у черзі за збереженнями учнів.
  if (d.action === 'admin_data' || d.action === 'admin_login') {
    try { return out_(admin_(d)); } catch (err) { return out_({ ok: false, error: 'server', detail: String(err) }); }
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (String(d.action || '').indexOf('admin_') === 0) { const res = admin_(d); if (res.ok) extrasDrop_(); return out_(res); }
    if (d.action === 'register' || d.action === 'login') {
      const res = d.action === 'register' ? register_(d) : login_(d);
      if (res.ok) Object.assign(res, studentExtras_(res.key, res.cls));
      return out_(res);
    }
    if (d.action === 'load' || d.action === 'save' || d.action === 'reply') {
      const p = auth_(d);
      if (!p) return out_({ ok: false, error: 'auth' });
      if (d.action === 'reply') return out_(Object.assign(studentReply_(d, p), studentExtras_(p.key, p.cls)));
      if (Array.isArray(d.read) && d.read.length) markRead_(p.key, d.read);
      if (d.action === 'load') {
        const sh = sheet_();
        const stored = readStored_(sh, findRow_(sh, p.key));
        return out_(Object.assign({ ok: true, topics: topicsOut_(stored), zno: znoOut_(p.key), nmt: readNmt_(p.key), fix: stored._fix || {}, v: SERVICE_VERSION }, studentExtras_(p.key, p.cls)));
      }
      return out_(Object.assign(save_(d, p), studentExtras_(p.key, p.cls, d.exv)));
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


/* ═════════════════════════ Адміністратор, повідомлення, призначення ═════════════════════════ */

const MSG_SHEET = 'Повідомлення';
const MSG_HEADER = ['ID', 'Час', 'Кому', 'Отримувачі (код)', 'Заголовок', 'Текст', 'Важливе', 'Прочитали (ключі)'];
const REPLY_SHEET = 'Відповіді учнів';
const REPLY_HEADER = ['ID', 'Час', 'Ключ', 'Учень', 'До повідомлення', 'Текст', 'Прочитано вчителем'];
const ASSIGN_SHEET = 'Призначення';
const ASSIGN_HEADER = ['ID', 'Час', 'Назва', 'Кому', 'Отримувачі (код)', 'Теми (коди)', 'Термін', 'Примітка'];
const ADMIN_TTL = 12 * 60 * 60 * 1000; // сесія адміністратора — 12 годин

/** Меню в таблиці: пароль адміністратора й перебудова аркушів. */
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Тренажер')
    .addItem('Задати пароль адміністратора', 'adminSetPassword')
    .addItem('Перебудувати аркуші результатів', 'rebuildAll')
    .addItem('Перерахувати статистику адмін-панелі', 'adminRebuildStats')
    .addToUi();
}

function adminSetPassword() {
  const ui = SpreadsheetApp.getUi();
  const a = ui.prompt('Пароль адміністратора', 'Впишіть новий пароль (щонайменше 8 символів). З ним ви входитимете в адмін-панель admin.html.', ui.ButtonSet.OK_CANCEL);
  if (a.getSelectedButton() !== ui.Button.OK) return;
  const pw = a.getResponseText();
  if (pw.length < 8) { ui.alert('Пароль закороткий: потрібно щонайменше 8 символів.'); return; }
  const b = ui.prompt('Пароль адміністратора', 'Повторіть пароль.', ui.ButtonSet.OK_CANCEL);
  if (b.getSelectedButton() !== ui.Button.OK) return;
  if (b.getResponseText() !== pw) { ui.alert('Паролі не збігаються. Спробуйте ще раз.'); return; }
  const salt = Utilities.getUuid();
  PropertiesService.getScriptProperties().setProperties({ ADMIN_SALT: salt, ADMIN_HASH: hash_(salt + '|' + pw) });
  CacheService.getScriptCache().remove('fail_admin');
  ui.alert('Пароль збережено. Відкрийте admin.html на сайті тренажера й увійдіть.');
}

function adminToken_(exp) {
  const h = PropertiesService.getScriptProperties().getProperty('ADMIN_HASH') || '';
  return hash_(secret_() + '|admin|' + exp + '|' + h).replace(/[^A-Za-z0-9]/g, '').slice(0, 40);
}
function adminOk_(d) {
  const exp = Number(d.aexp) || 0;
  return exp > Date.now() && exp < Date.now() + ADMIN_TTL + 60000 && String(d.atoken || '') === adminToken_(exp);
}

function simpleSheet_(name, header) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.appendRow(header);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, header.length).setFontWeight('bold');
  }
  return sh;
}
function rows_(sh, width) {
  const last = sh.getLastRow();
  return last < 2 ? [] : sh.getRange(2, 1, last - 1, width).getValues();
}
const newId_ = p => p + Date.now().toString(36) + Math.floor(Math.random() * 1e6).toString(36);
const iso_ = v => v instanceof Date ? v.getTime() : (Number(v) || 0);

/** Чи адресовано повідомлення (призначення) цьому учневі. code: all | class:7-А | keys:k1,k2 */
function addressed_(code, key, cls) {
  code = String(code || '');
  if (code === 'all') return true;
  if (code.indexOf('class:') === 0) return code.slice(6).split(',').some(c => c.trim().toUpperCase() === String(cls || '').toUpperCase());
  if (code.indexOf('keys:') === 0) return code.slice(5).split(',').indexOf(key) >= 0;
  return false;
}

/* ───── Кеш повідомлень і призначень ─────
   Учні отримують повідомлення з кожним збереженням прогресу. Щоб не читати три аркуші щоразу,
   тримаємо їх у кеші скрипта. Кеш скидаємо, коли вчитель щось змінює, учень відповідає чи читає
   повідомлення, а без змін — що 10 хвилин (на випадок ручного редагування аркушів). */
const EX_KEY = 'ex1';
const EX_TTL = 600;
const CHUNK = 25000; // символів в одному записі кешу (обмеження — 100 КБ)

function cacheGetBig_(k) {
  const c = CacheService.getScriptCache(), n = Number(c.get(k + '_n') || 0);
  if (!n) return null;
  const keys = []; for (let i = 0; i < n; i++) keys.push(k + '_' + i);
  const all = c.getAll(keys);
  let s = '';
  for (let i = 0; i < n; i++) { if (all[keys[i]] == null) return null; s += all[keys[i]]; }
  return s;
}
function cachePutBig_(k, s, ttl) {
  const c = CacheService.getScriptCache(), o = {};
  let n = 0;
  for (let i = 0; i < s.length; i += CHUNK) o[k + '_' + (n++)] = s.slice(i, i + CHUNK);
  try { c.putAll(o, ttl); c.put(k + '_n', String(n), ttl); } catch (e) { c.remove(k + '_n'); }
}
function extrasDrop_() { CacheService.getScriptCache().remove(EX_KEY + '_n'); }

function extrasData_() {
  const cached = cacheGetBig_(EX_KEY);
  if (cached) { try { return JSON.parse(cached); } catch (e) {} }
  const m = rows_(simpleSheet_(MSG_SHEET, MSG_HEADER), MSG_HEADER.length).filter(r => r[0])
    .map(r => [String(r[0]), iso_(r[1]), String(r[3] || ''), String(r[4] || ''), String(r[5] || ''), r[6] ? 1 : 0, String(r[7] || '').split(',').filter(Boolean)]).slice(-500);
  const rp = rows_(simpleSheet_(REPLY_SHEET, REPLY_HEADER), REPLY_HEADER.length).filter(r => r[0])
    .map(r => [String(r[0]), iso_(r[1]), String(r[2]), String(r[4] || ''), String(r[5] || '')]).slice(-5000);
  const a = rows_(simpleSheet_(ASSIGN_SHEET, ASSIGN_HEADER), ASSIGN_HEADER.length).filter(r => r[0])
    .map(r => [String(r[0]), iso_(r[1]), String(r[2] || ''), String(r[4] || ''), String(r[5] || ''), iso_(r[6]), String(r[7] || '')]);
  const o = { m, r: rp, a };
  o.h = hash_(JSON.stringify(o)).replace(/[^A-Za-z0-9]/g, '').slice(0, 12);
  cachePutBig_(EX_KEY, JSON.stringify(o), EX_TTL);
  return o;
}

/** Повідомлення, відповіді й призначення для учня (додаємо до відповідей load/save/login).
    exv — мітка версії, яку сайт отримав минулого разу: якщо нічого не змінилося, списки не надсилаємо. */
function studentExtras_(key, cls, exv) {
  if (!key) return {};
  const x = extrasData_();
  if (exv && String(exv) === x.h) return { exv: x.h };
  const msgs = x.m.filter(r => addressed_(r[2], key, cls))
    .map(r => ({ id: r[0], at: r[1], title: r[3], text: r[4], imp: !!r[5], read: r[6].indexOf(key) >= 0 }))
    .slice(-50);
  const replies = x.r.filter(r => r[2] === key).map(r => ({ id: r[0], at: r[1], msg: r[3], text: r[4] })).slice(-100);
  const assign = x.a.filter(r => addressed_(r[3], key, cls))
    .map(r => ({ id: r[0], at: r[1], title: r[2], items: r[4].split(',').filter(Boolean), due: r[5], note: r[6] }));
  return { msgs, replies, assign, exv: x.h };
}

function markRead_(key, ids) {
  // Спершу перевіряємо за кешем: якщо все вже позначено, аркуш не відкриваємо.
  const known = {};
  extrasData_().m.forEach(r => { known[r[0]] = r[6].indexOf(key) >= 0; });
  const want = {};
  let any = false;
  ids.slice(0, 100).forEach(id => { id = String(id); if (known[id] === false) { want[id] = true; any = true; } });
  if (!any) return;
  const sh = simpleSheet_(MSG_SHEET, MSG_HEADER), rows = rows_(sh, MSG_HEADER.length);
  rows.forEach((r, i) => {
    if (!want[String(r[0])]) return;
    const readers = String(r[7] || '').split(',').filter(Boolean);
    if (readers.indexOf(key) < 0) { readers.push(key); sh.getRange(i + 2, 8).setValue(readers.join(',')); }
  });
  extrasDrop_();
}

function studentReply_(d, p) {
  const text = txt_(d.text, 1000).trim();
  if (!text) return { ok: false, error: 'empty' };
  const c = CacheService.getScriptCache(), cid = 'rp_' + String(d.cid || '').slice(0, 60);
  if (d.cid && c.get(cid)) return { ok: true };
  if (d.cid) c.put(cid, '1', 6 * 60 * 60);
  simpleSheet_(REPLY_SHEET, REPLY_HEADER).appendRow([newId_('r'), new Date(), p.key, p.name + ' (' + p.cls + ')', txt_(d.msg, 40), text, '']);
  extrasDrop_();
  return { ok: true };
}

/* ───── Дії адміністратора ───── */
function admin_(d) {
  if (d.action === 'admin_login') {
    const props = PropertiesService.getScriptProperties();
    const h = props.getProperty('ADMIN_HASH'), salt = props.getProperty('ADMIN_SALT');
    if (!h) return { ok: false, error: 'no_admin' };
    const c = CacheService.getScriptCache(), fails = Number(c.get('fail_admin') || 0);
    if (fails >= 10) return { ok: false, error: 'locked' };
    if (hash_(salt + '|' + String(d.password || '')) !== h) { c.put('fail_admin', String(fails + 1), 15 * 60); return { ok: false, error: 'bad_password' }; }
    c.remove('fail_admin');
    const exp = Date.now() + ADMIN_TTL;
    return { ok: true, atoken: adminToken_(exp), aexp: exp, v: SERVICE_VERSION };
  }
  if (!adminOk_(d)) return { ok: false, error: 'admin_auth' };
  switch (d.action) {
    case 'admin_data': return adminData_();
    case 'admin_msg_send': return adminMsgSend_(d);
    case 'admin_msg_delete': return deleteById_(simpleSheet_(MSG_SHEET, MSG_HEADER), d.id);
    case 'admin_reply_read': return adminReplyRead_(d);
    case 'admin_assign_save': return adminAssignSave_(d);
    case 'admin_assign_delete': return deleteById_(simpleSheet_(ASSIGN_SHEET, ASSIGN_HEADER), d.id);
    case 'admin_reset_pin': return adminResetPin_(d);
    case 'admin_delete_student': return adminDeleteStudent_(d);
  }
  return { ok: false, error: 'unknown' };
}

function deleteById_(sh, id) {
  const rows = rows_(sh, 1);
  for (let i = rows.length - 1; i >= 0; i--) if (String(rows[i][0]) === String(id)) { sh.deleteRow(i + 2); return { ok: true }; }
  return { ok: false, error: 'not_found' };
}

function recipients_(to) {
  to = to || {};
  if (to.type === 'all') return 'all';
  if (to.type === 'class') { const list = (to.classes || []).map(c => txt_(c, 12).toUpperCase()).filter(Boolean); return list.length ? 'class:' + list.join(',') : ''; }
  if (to.type === 'keys') { const list = (to.keys || []).map(k => txt_(k, 100)).filter(Boolean).slice(0, 500); return list.length ? 'keys:' + list.join(',') : ''; }
  return '';
}

function adminMsgSend_(d) {
  const code = recipients_(d.to), title = txt_(d.title, 120).trim(), text = txt_(d.text, 4000).trim();
  if (!code) return { ok: false, error: 'no_recipients' };
  if (!text) return { ok: false, error: 'empty' };
  const id = newId_('m');
  simpleSheet_(MSG_SHEET, MSG_HEADER).appendRow([id, new Date(), txt_(d.toLabel, 200), code, title, text, d.important ? 'так' : '', '']);
  return { ok: true, id };
}

function adminReplyRead_(d) {
  const sh = simpleSheet_(REPLY_SHEET, REPLY_HEADER), rows = rows_(sh, REPLY_HEADER.length);
  const want = {}; (d.ids || []).forEach(id => { want[String(id)] = true; });
  rows.forEach((r, i) => { if (want[String(r[0])] && !r[6]) sh.getRange(i + 2, 7).setValue('так'); });
  return { ok: true };
}

function adminAssignSave_(d) {
  const code = recipients_(d.to), title = txt_(d.title, 120).trim();
  const items = (d.items || []).map(x => txt_(x, 40)).filter(x => /^[tzn]:[A-Za-z0-9_]+$/.test(x)).slice(0, 60);
  if (!code) return { ok: false, error: 'no_recipients' };
  if (!items.length) return { ok: false, error: 'no_items' };
  const due = Number(d.due) ? new Date(Number(d.due)) : '';
  const row = [d.id || newId_('a'), new Date(), title || 'Завдання від учителя', txt_(d.toLabel, 200), code, items.join(','), due, txt_(d.note, 1000)];
  const sh = simpleSheet_(ASSIGN_SHEET, ASSIGN_HEADER);
  if (d.id) {
    const rows = rows_(sh, 1);
    for (let i = 0; i < rows.length; i++) if (String(rows[i][0]) === String(d.id)) { sh.getRange(i + 2, 1, 1, row.length).setValues([row]); return { ok: true, id: d.id }; }
  }
  sh.appendRow(row);
  return { ok: true, id: row[0] };
}

function adminResetPin_(d) {
  const ps = profileSheet_(), row = findRow_(ps, String(d.key || ''));
  if (row < 0) return { ok: false, error: 'not_found' };
  ps.getRange(row, 4, 1, 2).setValues([['', '']]);
  CacheService.getScriptCache().remove('fail_' + d.key);
  return { ok: true };
}

function adminDeleteStudent_(d) {
  const key = String(d.key || '');
  if (!key) return { ok: false, error: 'not_found' };
  [profileSheet_(), sheet_(), znoSheet_(), nmtSheet_()].forEach(sh => { const r = findRow_(sh, key); if (r > 0) sh.deleteRow(r); });
  return { ok: true };
}

/** Повний знімок для адмін-панелі: профілі, прогрес, активність із журналу, повідомлення, призначення. */
function adminData_() {
  const tz = Session.getScriptTimeZone() || 'Europe/Kyiv';
  const dayOf = t => Utilities.formatDate(new Date(t), tz, 'yyyy-MM-dd');
  const students = {};
  rows_(profileSheet_(), PROFILE_HEADER.length).forEach(r => {
    if (!r[0]) return;
    students[r[0]] = { key: String(r[0]), name: String(r[1]), cls: String(r[2]), created: iso_(r[5]), lastLogin: iso_(r[6]), pin: !!r[3] };
  });
  const readData = (sh, col) => { const out = {}; rows_(sh, col).forEach(r => { if (!r[0]) return; let v = {}; try { v = JSON.parse(r[col - 1] || '{}'); } catch (e) {} out[r[0]] = { updated: iso_(r[2]), data: v }; }); return out; };
  const res = readData(sheet_(), DATA_COL), zno = readData(znoSheet_(), ZNO_DATA_COL), nmt = readData(nmtSheet_(), NMT_DATA_COL);
  Object.keys(students).forEach(k => {
    const st = students[k], r = res[k] ? res[k].data : {}, att = r._att || {};
    st.updated = Math.max(res[k] ? res[k].updated : 0, zno[k] ? zno[k].updated : 0, nmt[k] ? nmt[k].updated : 0);
    st.topics = {};
    TOPICS.forEach(([id]) => { if (r[id]) st.topics[id] = { r: r[id], att: Number(att[id]) || 1 }; });
    st.fix = r._fixSum || null;
    st.zno = {}; const z = zno[k] ? zno[k].data : {};
    Object.keys(z).forEach(id => { if (z[id] && z[id].s) st.zno[id] = z[id].s; });
    st.nmt = nmt[k] ? nmt[k].data : {};
  });

  // Журнал «Спроби»: активність по днях і учнях, орієнтовний час роботи, найчастіші хибні відповіді.
  // Підсумки рахуються наростаюче (logAgg_): щоразу обробляються лише нові рядки журналу.
  const byName = {}; Object.keys(students).forEach(k => { const s = students[k]; byName[s.name + ' (' + s.cls + ')'] = s; });
  const { agg, partial } = logAgg_();
  const cut = dayOf(Date.now() - AGG_DAYS * 86400000);
  const days = {}, wrong = {};
  Object.keys(agg.days).forEach(dk => {
    if (dk < cut) return;
    const x = agg.days[dk];
    days[dk] = { a: x.a, ok: x.ok, fix: x.fix, users: Object.keys(x.u).filter(n => byName[n]).length };
  });
  Object.keys(agg.st).forEach(name => {
    const s = byName[name], x = agg.st[name];
    if (!s) return;
    const dd = {}; Object.keys(x.days).forEach(dk => { if (dk >= cut) dd[dk] = x.days[dk]; });
    s.act = { last: x.last, n: x.n, ok: x.ok, fix: x.fix, mins: Math.round(x.mins), days: dd };
    if (x.focus) s.act.focus = x.focus;
  });
  Object.keys(agg.wrong).forEach(k => {
    const w = agg.wrong[k], top = Object.keys(w).sort((a, b) => w[b] - w[a]).slice(0, 4);
    const o = {}; top.forEach(a => { o[a] = w[a]; }); wrong[k] = o;
  });

  const msgs = rows_(simpleSheet_(MSG_SHEET, MSG_HEADER), MSG_HEADER.length).filter(r => r[0]).map(r => ({
    id: String(r[0]), at: iso_(r[1]), toLabel: String(r[2]), code: String(r[3]), title: String(r[4]), text: String(r[5]), imp: !!r[6],
    readers: String(r[7] || '').split(',').filter(Boolean) }));
  const replies = rows_(simpleSheet_(REPLY_SHEET, REPLY_HEADER), REPLY_HEADER.length).filter(r => r[0]).map(r => ({
    id: String(r[0]), at: iso_(r[1]), key: String(r[2]), name: String(r[3]), msg: String(r[4]), text: String(r[5]), seen: !!r[6] }));
  const assign = rows_(simpleSheet_(ASSIGN_SHEET, ASSIGN_HEADER), ASSIGN_HEADER.length).filter(r => r[0]).map(r => ({
    id: String(r[0]), at: iso_(r[1]), title: String(r[2]), toLabel: String(r[3]), code: String(r[4]), items: String(r[5]).split(',').filter(Boolean), due: iso_(r[6]), note: String(r[7]) }));

  return { ok: true, v: SERVICE_VERSION, now: Date.now(), tz, partial, logRows: agg.row - 1, students: Object.keys(students).map(k => students[k]), days, wrong, msgs, replies, assign,
    meta: { topics: TOPICS, zno: ZNO_TOPICS, nmt: NMT_TESTS, znoUnique: ZNO_UNIQUE, perTopic: TASKS_PER_TOPIC },
    sheetUrl: SpreadsheetApp.getActiveSpreadsheet().getUrl() };
}


/* ───── Наростаючі підсумки журналу «Спроби» ─────
   Готові підсумки й номер останнього обробленого рядка лежать на прихованому службовому аркуші.
   Наступного разу читаємо лише рядки, додані відтоді, тож час не росте разом із журналом.
   Якщо рядки журналу видалили чи переставили (останній оброблений рядок не збігається), рахуємо все заново. */
const AGG_SHEET = 'Службове: статистика';
const AGG_VER = 1;
const AGG_DAYS = 120;   // скільки днів показувати в графіках активності
const AGG_BATCH = 5000; // рядків журналу за одне читання

function aggLoad_() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(AGG_SHEET);
  if (!sh || sh.getLastRow() < 1) return null;
  // Кожен шматок починається з «j», щоб таблиця не сприйняла його як число, дату чи формулу.
  const json = sh.getRange(1, 1, sh.getLastRow(), 1).getValues().map(r => String(r[0]).slice(1)).join('');
  try { const o = JSON.parse(json); return o && o.ver === AGG_VER ? o : null; } catch (e) { return null; }
}

function aggSave_(o) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(AGG_SHEET);
  if (!sh) { sh = ss.insertSheet(AGG_SHEET); try { sh.hideSheet(); } catch (e) {} }
  const s = JSON.stringify(o), parts = [];
  for (let i = 0; i < s.length; i += 40000) parts.push(['j' + s.slice(i, i + 40000)]);
  sh.clearContents();
  sh.getRange(1, 1, parts.length, 1).setValues(parts);
}

const aggFp_ = r => iso_(r[0]) + '|' + String(r[1]);

function logAgg_() {
  const tz = Session.getScriptTimeZone() || 'Europe/Kyiv';
  const memo = {}; // дата за годиною: formatDate повільний, а рядків журналу — десятки тисяч
  const dayOf = t => { const h = Math.floor(t / 3600000); return memo[h] || (memo[h] = Utilities.formatDate(new Date(h * 3600000), tz, 'yyyy-MM-dd')); };
  const ls = logSheet_(), last = ls.getLastRow();
  let agg = aggLoad_();
  if (agg && agg.row > 1 && (agg.row > last || aggFp_(ls.getRange(agg.row, 1, 1, 2).getValues()[0]) !== agg.fp)) agg = null;
  if (!agg) agg = { ver: AGG_VER, row: 1, fp: '', days: {}, st: {}, wrong: {} };

  const titleToId = {};
  TOPICS.forEach(([id, t]) => { titleToId[t] = id; });
  ZNO_TOPICS.forEach(([id, t]) => { titleToId['ЗНО ' + t] = id; });
  const hasFocus = ls.getMaxColumns() >= 13;
  const start = Date.now();
  let changed = false, partial = false;

  while (agg.row < last) {
    if (Date.now() - start > 200000) { partial = true; break; } // решту доробимо наступного разу
    const from = agg.row + 1, n = Math.min(AGG_BATCH, last - agg.row);
    const main = ls.getRange(from, 1, n, 7).getValues(), ans = ls.getRange(from, 9, n, 1).getValues();
    const foc = hasFocus ? ls.getRange(from, 11, n, 3).getValues() : [];
    main.forEach((r, i) => {
      const t = iso_(r[0]); if (!t) return;
      const name = String(r[1]), type = String(r[5]), ok = String(r[6]).indexOf('✓') >= 0, isFix = type === TYPE_NAMES.fix, isNmt = type === TYPE_NAMES.nmt;
      const dk = dayOf(t), dd = agg.days[dk] || (agg.days[dk] = { a: 0, ok: 0, fix: 0, u: {} });
      if (isFix) dd.fix++; else if (!isNmt) { dd.a++; if (ok) dd.ok++; }
      if (name) dd.u[name] = 1;
      if (name) {
        const a = agg.st[name] || (agg.st[name] = { last: 0, n: 0, ok: 0, fix: 0, mins: 0, days: {}, prev: 0 });
        if (isFix) a.fix++; else if (!isNmt) { a.n++; if (ok) a.ok++; }
        a.last = Math.max(a.last, t);
        a.days[dk] = (a.days[dk] || 0) + 1;
        a.mins += a.prev && t > a.prev && t - a.prev <= 5 * 60000 ? (t - a.prev) / 60000 : 0.5;
        a.prev = t;
        // Зосередженість: час на завдання й виходи зі сторінки (надсилає сайт від версії 15).
        const fr = foc[i];
        if (!isNmt && fr && fr[0] !== '' && fr[0] !== null) {
          const sec = Number(fr[0]) || 0, ex = Number(fr[1]) || 0, away = Number(fr[2]) || 0;
          const f = a.focus || (a.focus = { timed: 0, sec: 0, away: 0, exits: 0, exAns: 0, exOk: 0, fast: 0, fastOk: 0, recent: [] });
          f.timed++; f.sec += sec; f.away += away; f.exits += ex;
          if (ex > 0) {
            f.exAns++; if (ok) f.exOk++;
            f.recent.push({ at: t, topic: String(r[2]), n: Number(r[4]) || 0, ok, ex, away, sec, fix: isFix });
            if (f.recent.length > 20) f.recent.shift();
          }
          if (sec < 3) { f.fast++; if (ok) f.fastOk++; }
        }
      }
      if (!ok && !isFix && !isNmt) {
        const id = titleToId[r[2]], num = Number(r[4]);
        if (id && num) {
          const k = id + '|' + num, w = agg.wrong[k] || (agg.wrong[k] = {}), a2 = txt_(ans[i][0], 80);
          if (a2) {
            w[a2] = (w[a2] || 0) + 1;
            const ks = Object.keys(w);
            if (ks.length > 30) ks.sort((x, y) => w[y] - w[x]).slice(15).forEach(x => { delete w[x]; });
          }
        }
      }
    });
    agg.row = from + n - 1;
    agg.fp = aggFp_(main[n - 1]);
    changed = true;
  }

  if (changed) {
    const cut = dayOf(Date.now() - AGG_DAYS * 86400000);
    Object.keys(agg.days).forEach(dk => { if (dk < cut) delete agg.days[dk]; });
    Object.keys(agg.st).forEach(nm => { const dd = agg.st[nm].days; Object.keys(dd).forEach(dk => { if (dk < cut) delete dd[dk]; }); });
    // Два вікна панелі можуть рахувати одночасно: зберігає те, що першим отримало блокування.
    const lock = LockService.getDocumentLock();
    if (lock && lock.tryLock(0)) { try { aggSave_(agg); } finally { lock.releaseLock(); } }
  }
  return { agg, partial };
}

/** Меню «Тренажер»: перерахувати статистику адмін-панелі з нуля (наприклад, після ручного редагування журналу). */
function adminRebuildStats() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(AGG_SHEET);
  if (sh) sh.clearContents();
  extrasDrop_();
  logAgg_();
  try { SpreadsheetApp.getUi().alert('Статистику перераховано.'); } catch (e) {}
}
