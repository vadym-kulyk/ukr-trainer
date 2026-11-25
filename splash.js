/* Титульна сторінка «Глибина»: літери абетки в кількох шарах, рухаються за курсором.
   Показуємо раз на день, лише на головній. ?splash у адресі показує її примусово.
   Підключається першим рядком <body>, щоб закрити сторінку до першого показу. */
(function () {
  "use strict";
  var KEY = "dl-splash", d = new Date(), today = d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate();
  var force = /[?&]splash\b/.test(location.search);
  try { if (!force && (location.hash || localStorage.getItem(KEY) === today)) return; } catch (e) { if (!force) return; }

  var still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  var css = document.createElement("style");
  css.textContent =
    "html.dl-splash-on{overflow:hidden}" +
    "#dl-splash{position:fixed;inset:0;z-index:1000;overflow:hidden;color:#fff;font-family:Onest,system-ui,sans-serif;" +
      "background:radial-gradient(ellipse at 50% 45%,#262e72 0%,#12163a 55%,#0a0d26 100%)}" +
    "#dl-splash .sl{position:absolute;inset:-10%;pointer-events:none;will-change:transform}" +
    "#dl-splash .sl span{position:absolute;font-family:Unbounded,sans-serif;line-height:1;user-select:none}" +
    "#dl-splash .sh{position:absolute;inset:0;display:grid;place-content:center;text-align:center;padding:20px;z-index:3}" +
    "#dl-splash h1{margin:0;font:900 clamp(48px,11vw,170px)/1.05 Unbounded,sans-serif;letter-spacing:-.05em;text-shadow:0 0 40px rgba(143,166,255,.5)}" +
    "#dl-splash h1 b{color:#ff8fc0;font-weight:inherit;text-shadow:0 0 40px rgba(255,143,192,.55)}" +
    "#dl-splash h2{margin:18px auto 10px;font:800 clamp(18px,2.4vw,28px)/1.2 Unbounded,sans-serif;max-width:22em;text-wrap:balance}" +
    "#dl-splash p{margin:0 auto 26px;color:#a7abd0;max-width:34em;font-size:17px;line-height:1.5}" +
    "#dl-splash button{justify-self:center;background:#fff;color:#12163a;padding:17px 36px;border:0;border-radius:99px;font:700 17px Unbounded,sans-serif;cursor:pointer}" +
    "#dl-splash button:hover{background:#ff8fc0}" +
    "#dl-splash button:focus-visible{outline:3px solid #fff;outline-offset:4px}";
  document.head.appendChild(css);

  var el = document.createElement("section");
  el.id = "dl-splash";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-modal", "true");
  el.setAttribute("aria-label", "Дослівно — вітання");
  el.innerHTML =
    '<div class="sl" data-z="10"></div><div class="sl" data-z="25"></div><div class="sl" data-z="50"></div><div class="sl" data-z="90"></div>' +
    '<div class="sh"><h1>Досл<b>і</b>вно</h1><h2>Занурся в мову глибше, ніж на уроці.</h2>' +
    "<p>50 тем із теорією за підручниками, 5000 завдань з поясненнями, банк ЗНО і симуляція НМТ з таймером.</p>" +
    '<button type="button">Почати</button></div>';
  document.documentElement.classList.add("dl-splash-on");
  document.body.insertBefore(el, document.body.firstChild);

  // далекі шари — дрібні й бліді, ближні — великі й розмиті; кілька рожевих літер
  var ABC = "АБВГҐДЕЄЖЗИІЇЙКЛМНОПРСТУФХЦЧШЩЬЮЯ";
  var layers = [].slice.call(el.querySelectorAll(".sl"));
  layers.forEach(function (L, k) {
    var n = [26, 16, 9, 5][k], size = [22, 44, 90, 220][k], op = [.3, .38, .45, .25][k], bl = [0, 0, 1.5, 8][k];
    for (var i = 0; i < n; i++) {
      var s = document.createElement("span"), pink = Math.random() < .08;
      s.textContent = ABC[Math.random() * ABC.length | 0];
      s.style.cssText = "left:" + Math.random() * 100 + "%;top:" + Math.random() * 100 + "%;font-size:" + size * (.7 + Math.random() * .6) + "px;font-weight:" + [600, 800, 900][Math.random() * 3 | 0] +
        ";color:" + (pink ? "rgba(255,143,192," + op + ")" : "rgba(143,166,255," + op + ")") + (bl ? ";filter:blur(" + bl + "px)" : "");
      L.appendChild(s);
    }
  });

  var mx = 0, my = 0, cx = 0, cy = 0, dolly = 0, alive = !still, leaving = false;
  function move(e) { mx = e.clientX / innerWidth - .5; my = e.clientY / innerHeight - .5; }
  addEventListener("pointermove", move);
  function frame(t) {
    if (!alive) return;
    cx += (mx - cx) * .06; cy += (my - cy) * .06;
    layers.forEach(function (L) {
      var z = +L.dataset.z, fx = Math.sin(t / 3000 + z) * z * .15;
      L.style.transform = "translate(" + (-cx * z * 2 + fx) + "px," + (-cy * z * 2) + "px) scale(" + (1 + dolly * z / 12) + ")";
      L.style.opacity = 1 - dolly * (z > 40 ? 1.6 : .9);
    });
    requestAnimationFrame(frame);
  }
  if (!still) {
    requestAnimationFrame(frame);
    layers.forEach(function (L, i) { L.animate([{ opacity: 0, transform: "scale(.6)" }, { opacity: 1 }], { duration: 1200, delay: i * 120, easing: "ease-out" }); });
  }

  // решта сторінки недоступна, доки відкрита титулка
  var hidden = [];
  function lock() { [].forEach.call(document.body.children, function (c) { if (c !== el && c.tagName !== "SCRIPT" && !c.inert) { c.inert = true; hidden.push(c); } }); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", lock); else lock();

  var btn = el.querySelector("button");
  btn.focus();
  function done() {
    alive = false; removeEventListener("pointermove", move); removeEventListener("keydown", key);
    hidden.forEach(function (c) { c.inert = false; });
    document.documentElement.classList.remove("dl-splash-on");
    el.remove();
  }
  function start() {
    if (leaving) return; leaving = true;
    try { localStorage.setItem(KEY, today); } catch (e) {}
    if (still) return done();
    // камера «пролітає» крізь шари літер
    el.querySelector(".sh").animate([{ opacity: 1, transform: "scale(1)" }, { opacity: 0, transform: "scale(2.2)" }], { duration: 650, easing: "cubic-bezier(.6,0,.9,.6)", fill: "forwards" });
    var t0 = performance.now();
    (function g(t) {
      var k = Math.min(1, (t - t0) / 800); dolly = k * k;
      if (k < 1) return requestAnimationFrame(g);
      alive = false;
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, fill: "forwards" }).finished.then(done);
    })(t0);
  }
  function key(e) { if (e.key === "Escape") start(); }
  btn.addEventListener("click", start);
  addEventListener("keydown", key);
})();
