/* Перемикач теми: як у системі → світла → темна. Вибір зберігаємо на пристрої.
   Підключається в <head>, щоб тема застосувалася до першого показу сторінки. */
(function () {
  "use strict";
  var KEY = "dl-theme", ORDER = ["auto", "light", "dark"];
  var NAMES = { auto: "Як у системі", light: "Світла", dark: "Темна" };
  var root = document.documentElement;
  function read() { try { var t = localStorage.getItem(KEY); return t === "light" || t === "dark" ? t : "auto"; } catch (e) { return "auto"; } }
  function apply(t) {
    if (t === "auto") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", t);
    var bs = document.querySelectorAll("[data-theme-btn]");
    for (var i = 0; i < bs.length; i++) { bs[i].setAttribute("aria-label", "Тема оформлення: " + NAMES[t] + ". Натисніть, щоб змінити"); bs[i].title = "Тема: " + NAMES[t]; }
  }
  var cur = read();
  apply(cur);

  var IC = {
    auto: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="6.5"/><path d="M10 3.5v13a6.5 6.5 0 0 0 0-13z" fill="currentColor" stroke="none"/></svg>',
    light: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3.4"/><path d="M10 2.5v2M10 15.5v2M2.5 10h2M15.5 10h2M4.7 4.7l1.4 1.4M13.9 13.9l1.4 1.4M4.7 15.3l1.4-1.4M13.9 6.1l1.4-1.4"/></svg>',
    dark: '<svg class="ic" viewBox="0 0 20 20" aria-hidden="true"><path d="M15.5 12.6A6.5 6.5 0 0 1 7.4 4.5a6.5 6.5 0 1 0 8.1 8.1z"/></svg>'
  };
  function btn(cls) {
    var t = cur;
    return '<button type="button" class="theme-btn ' + (cls || "") + '" data-theme-btn aria-label="Тема оформлення: ' + NAMES[t] + '. Натисніть, щоб змінити" title="Тема: ' + NAMES[t] + '">' +
      ORDER.map(function (k) { return '<span class="th th-' + k + '">' + IC[k] + '<span class="lbl">' + NAMES[k] + "</span></span>"; }).join("") + "</button>";
  }

  /* Видно лише значок і назву поточної теми. */
  var css = document.createElement("style");
  css.textContent = ".theme-btn{display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 10px;border:1px solid var(--line);border-radius:6px;background:var(--bg);color:var(--text);font:500 13px/1 var(--f-text);white-space:nowrap;cursor:pointer;flex:none}" +
    ".theme-btn:hover{border-color:var(--text)}.theme-btn .th{display:none;align-items:center;gap:6px}.theme-btn .ic{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}" +
    ":root:not([data-theme]) .theme-btn .th-auto,:root[data-theme=light] .theme-btn .th-light,:root[data-theme=dark] .theme-btn .th-dark{display:inline-flex}" +
    "@media (max-width:560px){.theme-btn .lbl{display:none}.theme-btn{padding:0 8px}}@media print{.theme-btn{display:none}}";
  (document.head || root).appendChild(css);

  document.addEventListener("click", function (e) {
    var b = e.target.closest && e.target.closest("[data-theme-btn]");
    if (!b) return;
    e.preventDefault(); e.stopPropagation();
    cur = ORDER[(ORDER.indexOf(cur) + 1) % ORDER.length];
    try { if (cur === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, cur); } catch (err) { /* без сховища тема діє до перезавантаження */ }
    apply(cur);
  }, true);
  document.addEventListener("DOMContentLoaded", function () {
    var slots = document.querySelectorAll("[data-theme-slot]");
    for (var i = 0; i < slots.length; i++) slots[i].outerHTML = btn(slots[i].getAttribute("data-theme-slot"));
  });
  window.MGTheme = { btn: btn };
})();
