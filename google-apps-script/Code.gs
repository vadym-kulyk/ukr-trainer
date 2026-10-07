/**
 * Приймач результатів для «Мовного тренажера Midgard».
 * Вставте цей код у Google Таблицю: Розширення → Apps Script, потім
 * Розгорнути → Нове розгортання → Веб-застосунок (доступ: «Усі»).
 * Аркуш «Результати»: кожен учень — один рядок, оновлюється після кожної відповіді.
 * Аркуш «Спроби»: кожна відповідь учня — окремий рядок.
 */

const SHEET_NAME = 'Результати';
const LOG_SHEET = 'Спроби';
const SERVICE_VERSION = 2;
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
  ['phraseo', '1.3 Фразеологія']
];
// Стовпці: Ключ | Учень | Оновлено | Разом % | Виконано | 19 тем (% правильних) | Дані
const HEADER = ['Ключ', 'Учень', 'Оновлено', 'Разом, %', 'Виконано завдань']
  .concat(TOPICS.map(t => t[1]))
  .concat(['Дані (не змінювати)']);
const DATA_COL = HEADER.length;

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
  return sh;
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

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const d = JSON.parse(e.postData.contents);
    const key = String(d.key || '').slice(0, 100);
    const name = String(d.name || '').replace(/^[=+\-@]+/, '').slice(0, 100);
    if (!key || !name) return out_({ ok: false, error: 'no name' });

    const logged = appendEvents_(name, d.events);
    const sh = sheet_();
    const rowNum = findRow_(sh, key);
    // Об’єднуємо з тим, що вже є в таблиці: виконане завдання не стає невиконаним.
    let stored = {};
    if (rowNum > 0) {
      try { stored = JSON.parse(sh.getRange(rowNum, DATA_COL).getValue() || '{}'); } catch (err) { stored = {}; }
    }
    const incoming = d.topics || {};
    const att = stored._att || {};
    let answered = 0, correct = 0;
    const perTopic = TOPICS.map(([id]) => {
      const a = cleanR_(stored[id]) || '.'.repeat(TASKS_PER_TOPIC);
      const b = incoming[id] ? cleanR_(incoming[id].r) : null;
      // Сайт уже об’єднав прогрес із таблицею під час завантаження, тож новий стан теми
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
    const row = [key, name, new Date(), total, answered].concat(perTopic).concat([JSON.stringify(stored)]);
    if (rowNum > 0) sh.getRange(rowNum, 1, 1, row.length).setValues([row]);
    else sh.appendRow(row);
    return out_({ ok: true, logged });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

/** Повертає збережений прогрес учня, щоб продовжити на іншому пристрої. */
function doGet(e) {
  const key = String((e && e.parameter && e.parameter.key) || '');
  if (!key) return out_({ ok: true, service: 'mg-ukr-trainer', v: SERVICE_VERSION });
  const sh = sheet_();
  const rowNum = findRow_(sh, key);
  if (rowNum < 0) return out_({ ok: true, v: SERVICE_VERSION, topics: {} });
  let stored = {};
  try { stored = JSON.parse(sh.getRange(rowNum, DATA_COL).getValue() || '{}'); } catch (err) {}
  const topics = {};
  const att = stored._att || {};
  TOPICS.forEach(([id]) => { if (stored[id]) topics[id] = { r: stored[id], att: Number(att[id]) || 1 }; });
  return out_({ ok: true, v: SERVICE_VERSION, topics });
}
