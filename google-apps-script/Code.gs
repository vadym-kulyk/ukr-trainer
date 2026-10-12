/**
 * Приймач результатів для «Мовного тренажера Midgard».
 * Вставте цей код у Google Таблицю: Розширення → Apps Script, потім
 * Розгорнути → Нове розгортання → Веб-застосунок (доступ: «Усі»).
 * Аркуш «Результати»: кожен учень — один рядок, оновлюється після кожної відповіді.
 * Аркуш «Спроби»: кожна відповідь учня — окремий рядок.
 * Аркуш «Профілі»: облікові записи учнів (ім’я, клас, захищений PIN-код).
 *   Забув PIN? Очистіть клітинку «PIN (хеш)» у рядку учня — під час наступного входу
 *   учень задасть новий PIN.
 */

const SHEET_NAME = 'Результати';
const LOG_SHEET = 'Спроби';
const SERVICE_VERSION = 4;
const PROFILE_SHEET = 'Профілі';
const PROFILE_HEADER = ['Ключ', 'Учень', 'Клас', 'PIN (хеш)', 'Сіль', 'Створено', 'Останній вхід'];
const MAX_FAILS = 8;
const LOG_HEADER = ['Час', 'Учень', 'Тема', 'Спроба теми №', 'Завдання №', 'Тип завдання', 'Результат', 'Запитання', 'Відповідь учня', 'Правильна відповідь'];
const TYPE_NAMES = { one: 'одна відповідь', multi: 'кілька відповідей', sort: 'розподіл за групами', match: 'відповідність', order: 'порядок' };
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
  ['comp_hyph', '1.2 Складні слова через дефіс']
];
// Стовпці: Ключ | Учень | Оновлено | Разом % | Виконано | 19 тем (% правильних) | Дані
const HEADER = ['Ключ', 'Учень', 'Оновлено', 'Разом, %', 'Виконано завдань']
  .concat(TOPICS.map(t => t[1]))
  .concat(['Дані (не змінювати)']);
const DATA_COL = HEADER.length;
const DATA_TITLE = HEADER[HEADER.length - 1];

function sheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) sh = ss.insertSheet(SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADER);
    sh.setFrozenRows(1);
    sh.setFrozenColumns(2);
    sh.getRange(1, 1, 1, HEADER.length).setFontWeight('bold').setWrap(true);
    sh.hideColumns(1);
    sh.hideColumns(DATA_COL);
  }
  migrate_(sh);
  return sh;
}

/** Якщо додано нові теми, переносимо стовпець «Дані» в кінець і оновлюємо заголовок. */
function migrate_(sh) {
  const lastCol = sh.getLastColumn();
  const header = sh.getRange(1, 1, 1, lastCol).getValues()[0];
  const oldCol = header.indexOf(DATA_TITLE) + 1;
  if (oldCol === DATA_COL && lastCol === DATA_COL) return;
  if (oldCol > 0 && oldCol !== DATA_COL) {
    const rows = sh.getLastRow() - 1;
    if (rows > 0) {
      const data = sh.getRange(2, oldCol, rows, 1).getValues();
      if (sh.getMaxColumns() < DATA_COL) sh.insertColumnsAfter(sh.getMaxColumns(), DATA_COL - sh.getMaxColumns());
      sh.getRange(2, DATA_COL, rows, 1).setValues(data);
      sh.getRange(2, oldCol, rows, 1).clearContent();
    }
    sh.showColumns(oldCol);
  }
  if (sh.getMaxColumns() < DATA_COL) sh.insertColumnsAfter(sh.getMaxColumns(), DATA_COL - sh.getMaxColumns());
  sh.getRange(1, 1, 1, HEADER.length).setValues([HEADER]).setFontWeight('bold').setWrap(true);
  sh.hideColumns(DATA_COL);
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
  const rows = events.slice(0, 300).filter(ev => ev && titles[ev.topic]).map(ev => [
    ev.at ? new Date(Number(ev.at)) : new Date(),
    name,
    titles[ev.topic],
    Number(ev.att) || 1,
    Number(ev.n) || '',
    TYPE_NAMES[ev.type] || txt_(ev.type, 30),
    ev.ok ? '✓ правильно' : '✗ помилка',
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
  return { ok: true, key, token: token_(key), name, cls, topics: topicsOut_(readStored_(rs, rowNum)), v: SERVICE_VERSION };
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
  return { ok: true, key, token: token_(key), name: String(vals[1]), cls: String(vals[2]), topics: topicsOut_(readStored_(rs, findRow_(rs, key))), v: SERVICE_VERSION };
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
  let answered = 0, correct = 0;
  const perTopic = TOPICS.map(([id]) => {
    const a = cleanR_(stored[id]) || '.'.repeat(TASKS_PER_TOPIC);
    const b = incoming[id] ? cleanR_(incoming[id].r) : null;
    // Сайт перед надсиланням уже об’єднав прогрес із таблицею, тож новий стан теми
    // (зокрема після «Почати тему заново») приймаємо як є; теми, яких немає в запиті, лишаються.
    const merged = b || a;
    stored[id] = merged;
    if (incoming[id]) att[id] = Math.max(Number(att[id]) || 1, Number(incoming[id].att) || 1);
    const done = merged.replace(/\./g, '').length;
    const ok = merged.replace(/[^1]/g, '').length;
    answered += done; correct += ok;
    return done ? ok : '';
  });
  stored._att = att;
  const total = Math.round(correct / (TOPICS.length * TASKS_PER_TOPIC) * 1000) / 10;
  const row = [p.key, display, new Date(), total, answered].concat(perTopic).concat([JSON.stringify(stored)]);
  if (rowNum > 0) sh.getRange(rowNum, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
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
        return out_({ ok: true, topics: topicsOut_(readStored_(sh, findRow_(sh, p.key))), v: SERVICE_VERSION });
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
