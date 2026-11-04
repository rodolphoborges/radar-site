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

  /* Flyer no celular: até 760 px, a tela inicial é o menu e cada item abre uma página curta.
     As páginas agrupam seções existentes; links internos (#secao) abrem a página que a contém. */
  var PAGES = {
    videos: { t: 'Vídeos', s: ['videos'] },
    prototipo: { t: 'Simulação', s: ['prototipo'] },
    problema: { t: 'O problema', s: ['problema', 'impacto', 'evidencias'] },
    como: { t: 'Como funciona', s: ['como'] },
    perguntas: { t: 'Perguntas', s: ['perguntas', 'valor', 'roadmap', 'pedido'] },
    glossario: { t: 'Glossário', s: ['glossario'] }
  };
  var DONO = {};
  Object.keys(PAGES).forEach(function (p) { PAGES[p].s.forEach(function (id) { DONO[id] = p; }); });
  var fly = document.getElementById('flyer'), back = document.getElementById('fly-back'), ftitle = document.getElementById('fly-title');
  var estreito = window.matchMedia ? matchMedia('(max-width: 760px)') : null;
  var secoes = document.querySelectorAll('main > section');
  var mostrar = function () {
    if (!fly) return;
    var on = estreito && estreito.matches;
    root.classList.toggle('fly', !!on);
    fly.hidden = !on; back.hidden = !on;
    secoes.forEach(function (sec) { sec.classList.remove('fly-on'); });
    back.classList.remove('fly-on');
    if (!on) return;
    var id = (location.hash || '').slice(1), pg = DONO[id];
    if (!pg) {
      root.classList.add('fly-home'); fly.classList.add('fly-on');
      window.scrollTo(0, 0); return;
    }
    root.classList.remove('fly-home');
    back.classList.add('fly-on'); ftitle.textContent = PAGES[pg].t;
    PAGES[pg].s.forEach(function (sid) { var el = document.getElementById(sid); if (el) { el.classList.add('fly-on'); el.querySelectorAll('.reveal').forEach(function (r) { r.classList.add('in'); }); } });
    var alvo = document.getElementById(id);
    var primeiro = id === pg;
    if (primeiro) window.scrollTo(0, 0);
    else if (alvo) setTimeout(function () { var y = alvo.getBoundingClientRect().top + window.scrollY - 120; window.scrollTo(0, y); }, 0);
  };
  window.addEventListener('hashchange', mostrar);
  if (estreito) { if (estreito.addEventListener) estreito.addEventListener('change', mostrar); else if (estreito.addListener) estreito.addListener(mostrar); }
  var brand = document.querySelector('.brand');
  if (brand) brand.addEventListener('click', function (e) { if (root.classList.contains('fly')) { e.preventDefault(); if (location.hash && location.hash !== '#inicio') location.hash = '#inicio'; else mostrar(); } });
  mostrar();

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
