/* site.js — tema, revelação ao rolar e troca de tela da simulação */
(function () {
  'use strict';
  var root = document.documentElement;

  document.getElementById('theme').addEventListener('click', function () {
    var cur = root.getAttribute('data-theme');
    if (!cur) cur = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('radar-site-tema', next); } catch (e) {}
  });

  /* Menu do celular: abre a lista de seções com uma linha de contexto em cada uma. */
  var mb = document.getElementById('menu-btn'), mm = document.getElementById('menu-m');
  if (mb && mm) {
    var setMenu = function (open) { mb.setAttribute('aria-expanded', open); mm.hidden = !open; };
    mb.addEventListener('click', function () { setMenu(mm.hidden); });
    mm.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !mm.hidden) { setMenu(false); mb.focus(); } });
    document.addEventListener('click', function (e) { if (!mm.hidden && !e.target.closest('.top')) setMenu(false); });
  }

  var items = document.querySelectorAll('.reveal');
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -8% 0px' });
    items.forEach(function (el) { io.observe(el); });
  } else {
    items.forEach(function (el) { el.classList.add('in'); });
  }

  var SHOTS = {
    triagem: { src: 'img/radar-triagem.png', alt: 'Tela de triagem do Radar: fila de pendências à esquerda e, à direita, o caso aberto com a comparação RNP × ANS, o campo divergente em destaque e os dados para a correção.' },
    indicadores: { src: 'img/radar-indicadores.png', alt: 'Tela de indicadores do Radar: aderência ANS × RNP, pendências por situação e por tipo de divergência.' }
  };
  var img = document.getElementById('shot-img');
  document.querySelectorAll('[data-shot]').forEach(function (b) {
    b.addEventListener('click', function () {
      var s = SHOTS[b.dataset.shot]; img.src = s.src; img.alt = s.alt;
      document.querySelectorAll('[data-shot]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
    });
  });

  /* Glossário: filtra termos e definições enquanto se digita, ignorando acentos e maiúsculas. */
  var q = document.getElementById('glos-q');
  if (q) {
    var norm = function (s) { return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); };
    var termos = document.querySelectorAll('.glos dl > div');
    var count = document.getElementById('glos-count'), vazio = document.getElementById('glos-empty');
    var filtrar = function () {
      var t = norm(q.value.trim()), n = 0;
      termos.forEach(function (d) { var ok = !t || norm(d.textContent).indexOf(t) >= 0; d.hidden = !ok; if (ok) n++; });
      document.querySelectorAll('.glos-group').forEach(function (g) { g.hidden = !g.querySelector('dl > div:not([hidden])'); });
      count.textContent = t ? n + (n === 1 ? ' termo' : ' termos') : termos.length + ' termos';
      vazio.hidden = n > 0;
    };
    q.addEventListener('input', filtrar);
    filtrar();
  }
})();
