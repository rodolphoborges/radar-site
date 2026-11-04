/* ==========================================================================
   app.js — Telas da ferramenta (Bases → Triagem → Fechamento, Indicadores, Regras)
   ========================================================================== */
(function () {
  'use strict';
  var M = window.Motor, S = M.SITUACOES;

  /* ---------- Utilidades ---------- */
  function $(s, el) { return (el || document).querySelector(s); }
  function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function fmt(n) { return Number(n || 0).toLocaleString('pt-BR'); }
  function pct(x, d) { return (x * 100).toLocaleString('pt-BR', { minimumFractionDigits: d == null ? 1 : d, maximumFractionDigits: d == null ? 1 : d }) + '%'; }
  function fmtCnpj(c) { return c && c.length === 14 ? c.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : (c || '—'); }
  function store(k, v) { try { if (v === undefined) return JSON.parse(localStorage.getItem(k) || 'null'); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { return null; } }
  function toast(msg) {
    var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600);
  }
  function pill(sit) { var s = S[sit]; return '<span class="pill t-' + s.tone + '">' + esc(s.label) + '</span>'; }
  function dots(pres) { return '<span class="dots" aria-label="Presente em ' + pres.filter(Boolean).length + ' de ' + pres.length + ' meses">' + pres.map(function (p) { return '<i class="' + (p ? 'on' : '') + '"></i>'; }).join('') + '</span>'; }

  var STATUS = [
    { id: 'afazer', label: 'A fazer' }, { id: 'analise', label: 'Em análise' },
    { id: 'feito', label: 'Feito' }, { id: 'descartado', label: 'Descartado' }
  ];
  function statusLabel(id) { for (var i = 0; i < STATUS.length; i++) if (STATUS[i].id === id) return STATUS[i].label; return 'A fazer'; }

  /* ---------- Estado ---------- */
  var st = {
    source: 'demo', sourceNote: '',
    rnpFiles: [], ansFile: null,
    rnp: [], ans: [], result: null,
    onlyHosp: true, dec: {}, filter: 'pend', q: '', uf: '', fstatus: '', limit: 150, sel: null
  };
  function decKey() { return 'transforma:dec:' + st.source + ':' + (st.result ? st.result.latest : ''); }
  function loadDec() { st.dec = store(decKey()) || {}; }
  function saveDec() { store(decKey(), st.dec); }
  function getDec(k) { return st.dec[k] || { status: 'afazer', checks: [], protocolo: '', nota: '' }; }
  function cyclesKey() { return 'transforma:ciclos:' + st.source; }

  /* Perfis de uso. Valem neste navegador: sem servidor não há login, então o perfil
     organiza a tela, mas não é controle de acesso (ver issue #15). */
  var PERFIS = {
    analista: { label: 'Analista', views: ['bases', 'triagem', 'fechamento', 'indicadores', 'regras'], decide: true, regras: false },
    gestor: { label: 'Gestor de regras', views: ['bases', 'triagem', 'fechamento', 'indicadores', 'regras'], decide: true, regras: true },
    visualizacao: { label: 'Visualização', views: ['indicadores', 'triagem'], decide: false, regras: false }
  };
  st.perfilFixo = /^#visualizacao$/.test(location.hash || '');
  st.perfil = st.perfilFixo ? 'visualizacao' : (PERFIS[store('radar:perfil')] ? store('radar:perfil') : 'analista');
  function P() { return PERFIS[st.perfil]; }

  /* Regras: o padrão vem de js/regras.js; ajustes feitos na aba Regras ficam neste navegador. */
  var REGRAS_KEY = 'radar:regras';
  function loadRegras() { var r = store(REGRAS_KEY); st.regrasLocal = !!r; st.regras = M.normRegras(r || M.REGRAS_PADRAO); }
  loadRegras();

  /* ---------- Preparação dos arquivos ---------- */
  function prepFile(raw, kind) {
    var names = Object.keys(raw.sheets), best = names[0], bestScore = -1;
    names.forEach(function (n) {
      var rows = raw.sheets[n], h = M.detectHeader(rows, kind), map = M.guessMapping(rows[h] || [], kind);
      var score = Object.keys(map).filter(function (k) { return map[k] >= 0; }).length;
      if (score > bestScore) { bestScore = score; best = n; }
    });
    var f = { name: raw.name, sheets: raw.sheets, kind: kind };
    selectSheet(f, best);
    return f;
  }
  function selectSheet(f, name) {
    f.sheet = name;
    var rows = f.sheets[name] || [];
    f.headerIdx = M.detectHeader(rows, f.kind);
    f.headers = (rows[f.headerIdx] || []).map(function (h, i) { return String(h || ('Coluna ' + (i + 1))); });
    f.map = M.guessMapping(f.headers, f.kind);
    f.nrows = Math.max(0, rows.length - f.headerIdx - 1);
    if (f.kind === 'rnp' && f.map.comp < 0) f.comp = M.normComp(f.name) || '';
  }

  function runCross() {
    var errs = [];
    if (!st.rnpFiles.length) errs.push('Adicione ao menos um arquivo do RPS Total (RNP).');
    if (!st.ansFile) errs.push('Adicione a foto da ANS (CSV do RPSWEB).');
    st.rnpFiles.forEach(function (f) {
      if (f.map.cnpj < 0) errs.push(f.name + ': indique a coluna de CNPJ.');
      if (f.map.comp < 0 && !f.comp) errs.push(f.name + ': indique a competência (mês) do arquivo.');
    });
    if (st.ansFile && st.ansFile.map.cnpj < 0) errs.push(st.ansFile.name + ': indique a coluna de CNPJ.');
    /* sem a coluna de tipo, toda linha passaria por hospital */
    if (st.onlyHosp) st.rnpFiles.concat(st.ansFile || []).forEach(function (f) {
      if (f.map.classif < 0) errs.push(f.name + ': indique a coluna de tipo/classificação ou desmarque “Considerar só a rede hospitalar”.');
    });
    if (errs.length) return errs;
    var rnp = [];
    st.rnpFiles.forEach(function (f) { rnp = rnp.concat(M.toRnp(f.sheets[f.sheet].slice(f.headerIdx + 1), f.map, f.comp)); });
    var a = st.ansFile, ans = M.toAns(a.sheets[a.sheet].slice(a.headerIdx + 1), a.map);
    var res = M.cross(rnp, ans, { somenteHospital: st.onlyHosp, regras: st.regras });
    if (res.erro) return [res.erro];
    st.rnp = rnp; st.ans = ans; st.result = res; st.sel = null; st.filter = 'pend'; st.limit = 150;
    loadDec();
    return null;
  }

  function loadDemo() {
    var d = window.DemoData.build();
    st.source = 'demo';
    st.sourceNote = 'Base sintética · 2.502 hospitais · dez/25 a ago/26';
    st.rnpFiles = [prepFile({ name: 'demo_Base_RPSTOTAL.csv', sheets: { 'Base RPSTOTAL': d.rnp } }, 'rnp')];
    st.ansFile = prepFile({ name: 'demo_RPSWEB_ANS.csv', sheets: { 'RPSWEB_ANS': d.ans } }, 'ans');
    runCross();
  }

  /* ---------- Topo ---------- */
  function renderTop() {
    var r = st.result;
    $('#ctx').innerHTML =
      (st.source === 'demo'
        ? '<span class="chip demo" title="Nomes, CNPJs e CNES fictícios">Demonstração · dados fictícios</span>'
        : st.source === 'painel' ? '<span class="chip real" title="' + esc(st.sourceNote) + '">Painel do ciclo</span>'
        : '<span class="chip real">Dados carregados · ficam só neste navegador</span>') +
      (r ? '<span class="chip">Competência <b class="num">' + M.compLabel(r.latest) + '</b></span>' : '') +
      (st.perfilFixo ? '<span class="chip">Visualização</span>'
        : '<label class="chip perfil">Perfil <select id="perfil" aria-label="Perfil de uso">' + Object.keys(PERFIS).map(function (k) { return '<option value="' + k + '"' + (k === st.perfil ? ' selected' : '') + '>' + PERFIS[k].label + '</option>'; }).join('') + '</select></label>');
    var vis = P().views;
    VIEWS.forEach(function (x) { $('#t-' + x).hidden = vis.indexOf(x) < 0; });
    var ro = !P().decide;
    $('#t-triagem').innerHTML = ro ? 'Operacional <span class="badge" id="badge-triagem" hidden></span>' : '<span class="step">2</span>Triagem <span class="badge" id="badge-triagem" hidden></span>';
    document.querySelector('.tabs .sep').hidden = ro;
    var pend = r ? r.items.filter(function (i) { return i.situacao !== 'ok' && ['feito', 'descartado'].indexOf(getDec(i.key).status) < 0; }).length : 0;
    $('#badge-triagem').textContent = fmt(pend);
    $('#badge-triagem').hidden = !r;
  }

  /* ---------- Passo 1: Bases ---------- */
  function fileCard(f, idx) {
    var sheetSel = Object.keys(f.sheets).length > 1
      ? '<label class="small">Aba <select data-sheet="' + idx + '">' + Object.keys(f.sheets).map(function (n) { return '<option' + (n === f.sheet ? ' selected' : '') + '>' + esc(n) + '</option>'; }).join('') + '</select></label>' : '';
    var compInp = f.kind === 'rnp' && f.map.comp < 0
      ? '<label class="small">Competência <input type="month" data-comp="' + idx + '" value="' + esc(f.comp) + '"></label>' : '';
    var rm = '<button class="btn" data-rm="' + idx + '" aria-label="Remover ' + esc(f.name) + '">Remover</button>';
    var opts = '<option value="-1">— não usar —</option>' + f.headers.map(function (h, i) { return '<option value="' + i + '">' + esc(h) + '</option>'; }).join('');
    var map = M.FIELDS[f.kind].map(function (fd) {
      var miss = f.map[fd.id] < 0;
      return '<tr class="' + (miss ? 'miss' : '') + '"><td>' + esc(fd.label) + (fd.req ? ' <span class="req" title="obrigatório">*</span>' : '') + '</td><td><select data-map="' + idx + '" data-field="' + fd.id + '" aria-label="Coluna para ' + esc(fd.label) + '">' + opts.replace('value="' + f.map[fd.id] + '"', 'value="' + f.map[fd.id] + '" selected') + '</select></td></tr>';
    }).join('');
    return '<div class="file"><div><b>' + esc(f.name) + '</b><div class="meta">' + fmt(f.nrows) + ' linhas · cabeçalho na linha ' + (f.headerIdx + 1) + '</div></div>' + rm +
      '<div class="row" style="grid-column:1/-1">' + sheetSel + compInp + '</div>' +
      '<details style="grid-column:1/-1"><summary class="small">Colunas reconhecidas (' + M.FIELDS[f.kind].filter(function (fd) { return f.map[fd.id] >= 0; }).length + ' de ' + M.FIELDS[f.kind].length + ')</summary><table class="map">' + map + '</table></details></div>';
  }
  function renderBases() {
    var v = $('#v-bases'), r = st.result;
    var files = st.rnpFiles.map(function (f, i) { return fileCard(f, 'r' + i); }).join('');
    v.innerHTML =
      '<div class="head"><div><h1>1 · Bases do mês</h1><p>Carregue o RPS Total (um arquivo por mês ou a Base RPSTOTAL já empilhada) e a foto da ANS exportada do RPSWEB. Os arquivos são lidos neste navegador e não são enviados a lugar nenhum.</p></div>' +
      '<div class="row"><button class="btn" id="btn-demo">Usar dados de demonstração</button></div></div>' +
      (st.source === 'demo' ? '<div class="banner"><span><b>Você está vendo a demonstração.</b> Os hospitais, CNPJs e CNES abaixo são fictícios, com volumes calibrados pela documentação. Para usar os seus dados, solte os arquivos nas áreas abaixo.</span></div>' : '') +
      '<div class="grid2">' +
        '<section class="panel"><h2>RPS Total · Rede Nacional de Prestadores</h2><p>Um ou mais arquivos, ou a aba <i>Base RPSTOTAL</i> da planilha consolidada. Janela recomendada: 8 a 9 meses.</p>' +
        '<label class="drop" id="drop-rnp" tabindex="0"><strong>Soltar arquivos do RNP</strong><span class="small muted">.xlsx, .xls ou .csv · vários de uma vez</span><input type="file" id="in-rnp" multiple accept=".csv,.xlsx,.xls,.xlsm" hidden></label>' +
        '<div class="files">' + files + '</div></section>' +
        '<section class="panel"><h2>Foto da ANS · RPSWEB</h2><p>CSV de prestadores ativos exportado do RPSWEB, ou a aba <i>RPSWEB_ANS</i> da planilha consolidada. Use a extração mais recente.</p>' +
        '<label class="drop" id="drop-ans" tabindex="0"><strong>Soltar a foto da ANS</strong><span class="small muted">um arquivo · .xlsx ou .csv</span><input type="file" id="in-ans" accept=".csv,.xlsx,.xls,.xlsm" hidden></label>' +
        '<div class="files">' + (st.ansFile ? fileCard(st.ansFile, 'a') : '') + '</div></section>' +
      '</div>' +
      '<section class="panel"><div class="row" style="justify-content:space-between"><label class="row small"><input type="checkbox" id="opt-hosp"' + (st.onlyHosp ? ' checked' : '') + '> Considerar só a rede hospitalar (classificação contendo “hospital”)</label>' +
      '<button class="btn primary" id="btn-cross">Cruzar bases e abrir a triagem</button></div><div id="cross-msg"></div>' +
      (r ? '<p class="small muted" style="margin-top:.6rem">Último cruzamento: ' + r.comps.length + ' competências (' + M.compLabel(r.comps[0]) + ' a ' + M.compLabel(r.latest) + '), ' + fmt(r.totais.rnpHospitais) + ' hospitais divulgados no mês, ' + fmt(r.totais.ansAtivos) + ' ativos na ANS.</p>' : '') +
      '</section>';
    bindDrop('rnp'); bindDrop('ans');
  }
  function bindDrop(kind) {
    var d = $('#drop-' + kind), inp = $('#in-' + kind);
    d.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inp.click(); } });
    ['dragenter', 'dragover'].forEach(function (ev) { d.addEventListener(ev, function (e) { e.preventDefault(); d.classList.add('over'); }); });
    ['dragleave', 'drop'].forEach(function (ev) { d.addEventListener(ev, function (e) { e.preventDefault(); d.classList.remove('over'); }); });
    d.addEventListener('drop', function (e) { addFiles(kind, e.dataTransfer.files); });
    inp.addEventListener('change', function () { addFiles(kind, inp.files); });
  }
  function addFiles(kind, list) {
    var arr = Array.prototype.slice.call(list || []);
    if (!arr.length) return;
    if (st.source === 'demo') { st.rnpFiles = []; st.ansFile = null; st.result = null; st.source = 'real'; st.sourceNote = ''; }
    $('#cross-msg').innerHTML = '<p class="small muted">Lendo ' + arr.length + ' arquivo(s)…</p>';
    Promise.all(arr.map(window.IO.readFile)).then(function (raws) {
      raws.forEach(function (raw) {
        var f = prepFile(raw, kind);
        if (kind === 'rnp') st.rnpFiles.push(f); else st.ansFile = f;
      });
      renderAll();
    }).catch(function (e) {
      $('#cross-msg').innerHTML = '<div class="banner err">' + esc(e.message || e) + '</div>';
    });
  }

  /* ---------- Passo 2: Triagem ---------- */
  var GROUPS = [
    { g: 'Precisam de ação', ids: ['alterar', 'investigar', 'excluir', 'incluir'] },
    { g: 'Acompanhar', ids: ['observar', 'aguardar', 'passivo'] },
    { g: 'Sem pendência', ids: ['ok'] }
  ];
  function visible() {
    var r = st.result; if (!r) return [];
    var q = st.q.trim().toLowerCase(), qd = q.replace(/\D/g, '');
    return r.items.filter(function (i) {
      if (st.filter === 'pend' ? i.situacao === 'ok' : st.filter !== 'all' && i.situacao !== st.filter) return false;
      if (st.uf && i.uf !== st.uf) return false;
      if (st.fstatus && getDec(i.key).status !== st.fstatus) return false;
      if (q && i.nome.toLowerCase().indexOf(q) < 0 && !(qd.length >= 4 && ((i.cnpj || '').indexOf(qd) >= 0 || (i.cnes || '').indexOf(qd) >= 0))) return false;
      return true;
    });
  }
  function renderTriagem() {
    var v = $('#v-triagem'), r = st.result;
    if (!r) { v.innerHTML = painelBar() || '<div class="banner">Carregue as bases no passo 1 para gerar a fila.</div>'; return; }
    var c = r.cont, pendTot = r.items.length - c.ok;
    var fb = function (id, label, n, tone) {
      return '<button class="fbtn" data-f="' + id + '" aria-pressed="' + (st.filter === id) + '"><span>' + (tone ? '<span class="pill t-' + tone + '">' + esc(label) + '</span>' : esc(label)) + '</span><span class="n">' + fmt(n) + '</span></button>';
    };
    var side = fb('pend', 'Todas as pendências', pendTot) + GROUPS.map(function (gr) {
      return '<p class="fgroup">' + gr.g + '</p>' + gr.ids.map(function (id) { return fb(id, S[id].label, c[id], S[id].tone); }).join('');
    }).join('');
    var ufs = Array.from(new Set(r.items.map(function (i) { return i.uf; }).filter(Boolean))).sort();
    var list = visible(), shown = list.slice(0, st.limit);
    var rows = shown.map(function (i) {
      var d = getDec(i.key);
      return '<tr data-k="' + esc(i.key) + '" class="' + (st.sel === i.key ? 'sel' : '') + '" tabindex="0">' +
        '<td><div class="nm">' + esc(i.nome) + '</div><div class="sub mono">' + fmtCnpj(i.cnpj) + ' · CNES ' + esc(i.cnes || '—') + '</div></td>' +
        '<td>' + esc(i.uf || '—') + '</td><td>' + pill(i.situacao) + '</td>' +
        '<td class="hide-sm small">' + esc(i.motivo) + '</td>' +
        '<td class="hide-sm">' + dots(i.pres) + '</td>' +
        '<td><span class="st ' + d.status + '">' + statusLabel(d.status) + '</span></td></tr>';
    }).join('');
    v.innerHTML =
      (P().decide ? '<div class="head"><div><h1>2 · Triagem</h1><p>Cada linha é um hospital em que o RNP e a ANS não batem pela chave composta (CNPJ, CNES e operadora intermediária). Abra o caso, confira, siga o checklist e registre a decisão.</p></div></div>'
        : '<div class="head"><div><h1>Operacional · ' + M.compLabel(r.latest) + '</h1><p>A fila de trabalho da analista: cada hospital em que RNP e ANS não batem, a situação e a decisão registrada.</p></div></div>' + painelBar()) +
      (st.source === 'demo' ? '<div class="banner"><span><b>Demonstração com dados fictícios.</b> A lógica de cruzamento é a mesma que roda sobre os arquivos reais.</span></div>' : '') +
      '<div class="triage"><nav class="filters" aria-label="Filtrar por situação">' + side + '</nav><div style="min-width:0">' +
      '<div class="tools"><input type="search" id="q" placeholder="Buscar hospital, CNPJ ou CNES" value="' + esc(st.q) + '" aria-label="Buscar">' +
      '<select id="f-uf" aria-label="UF"><option value="">Todas as UFs</option>' + ufs.map(function (u) { return '<option' + (u === st.uf ? ' selected' : '') + '>' + u + '</option>'; }).join('') + '</select>' +
      '<select id="f-st" aria-label="Decisão"><option value="">Qualquer decisão</option>' + STATUS.map(function (s) { return '<option value="' + s.id + '"' + (s.id === st.fstatus ? ' selected' : '') + '>' + s.label + '</option>'; }).join('') + '</select>' +
      '<span class="small muted num">' + fmt(list.length) + ' casos</span></div>' +
      '<div class="tablewrap"><table class="list"><thead><tr><th>Hospital</th><th>UF</th><th>Situação</th><th class="hide-sm">Motivo</th><th class="hide-sm" title="Presença no RNP, mês a mês (' + M.compLabel(r.comps[0]) + ' a ' + M.compLabel(r.latest) + ')">Divulgação</th><th>Decisão</th></tr></thead><tbody>' +
      (rows || '<tr><td colspan="6" class="muted">Nenhum caso com esses filtros.</td></tr>') + '</tbody></table>' +
      (list.length > shown.length ? '<div class="more"><button class="btn" id="btn-more">Mostrar mais ' + fmt(Math.min(150, list.length - shown.length)) + '</button></div>' : '') +
      '</div></div></div>';
    $('#q').addEventListener('input', function (e) { st.q = e.target.value; st.limit = 150; renderTriagemKeepFocus(); });
    $('#f-uf').addEventListener('change', function (e) { st.uf = e.target.value; renderTriagem(); });
    $('#f-st').addEventListener('change', function (e) { st.fstatus = e.target.value; renderTriagem(); });
  }
  function renderTriagemKeepFocus() {
    var pos = $('#q').selectionStart; renderTriagem(); var q = $('#q'); q.focus(); try { q.setSelectionRange(pos, pos); } catch (e) {}
  }

  /* ---------- Detalhe do caso ---------- */
  function openCase(k) {
    st.sel = k;
    var r = st.result, it = r.items.find(function (i) { return i.key === k; }); if (!it) return;
    var d = getDec(k), s = S[it.situacao], a = it.ans || {}, n = it.rnp || {};
    var diffF = {}; it.diffs.forEach(function (x) { diffF[x.campo] = 1; });
    var rowsCmp = [['CNPJ', fmtCnpj(n.cnpj), fmtCnpj(a.cnpj)], ['CNES', n.cnes, a.cnes], ['Operadora intermediária', n.opInter ? 'Registro ' + n.opInter + (n.codUnimed ? ' · cód. Unimed ' + n.codUnimed : '') : '', a.opInter],
      ['Urgência/emergência', n.urg, a.urg], ['UF', n.uf, a.uf], ['Município', n.municipio, a.municipio], ['Classificação', n.classif, a.classif], ['Nome', n.nome, a.nome]];
    var cmp = rowsCmp.map(function (x) { return '<tr class="' + (diffF[x[0]] ? 'diff' : '') + '"><td>' + x[0] + '</td><td>' + esc(x[1] || '—') + '</td><td>' + esc(x[2] || '—') + '</td></tr>'; }).join('');
    var tl = r.comps.map(function (c, i) { return '<div><i class="' + (it.pres[i] ? 'on' : '') + '"></i>' + M.compLabel(c).slice(0, 3) + '</div>'; }).join('');
    var ck = (r.regras.checklist[it.situacao] || []).map(function (t, i) { return '<label><input type="checkbox" data-ck="' + i + '"' + (d.checks[i] ? ' checked' : '') + (P().decide ? '' : ' disabled') + '> <span>' + esc(t) + '</span></label>'; }).join('');
    var list = visible(), idx = list.findIndex(function (i) { return i.key === k; });
    var box = $('#detail');
    box.innerHTML =
      '<div class="dhead"><div><h2>' + esc(it.nome) + '</h2><p class="small muted mono">' + fmtCnpj(it.cnpj) + ' · CNES ' + esc(it.cnes || '—') + ' · ' + esc([it.municipio, it.uf].filter(Boolean).join('/')) + '</p><div style="margin-top:.4rem">' + pill(it.situacao) + '</div></div>' +
      '<button class="icon-btn" id="d-close" aria-label="Fechar"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<p>' + esc(it.motivo) + '</p>' +
      '<div class="action"><b>Ação sugerida:</b> ' + esc(r.regras.acoes[it.situacao] || s.acao) + '</div>' +
      '<section><h3>RNP × ANS</h3><div style="overflow-x:auto"><table class="cmp"><thead><tr><th>Campo</th><th>RNP (' + M.compLabel(r.latest) + ')</th><th>ANS</th></tr></thead><tbody>' + cmp + '</tbody></table></div></section>' +
      fixBlock(it) + cnesLinks(it) +
      '<section><h3>Divulgação no RNP</h3><div class="timeline" style="margin-top:.4rem">' + tl + '</div></section>' +
      (ck ? '<section><h3>Antes de decidir</h3><div class="check" style="margin-top:.4rem">' + ck + '</div></section>' : '') +
      '<section class="form"><h3>Decisão</h3><div class="seg" role="group" aria-label="Decisão">' + STATUS.map(function (x) { return '<button data-status="' + x.id + '" aria-pressed="' + (d.status === x.id) + '"' + (P().decide ? '' : ' disabled') + '>' + x.label + '</button>'; }).join('') + '</div>' +
      '<label>Protocolo ANS / arquivo PTA<input id="d-prot"' + (P().decide ? '' : ' readonly') + ' value="' + esc(d.protocolo) + '" placeholder="ex.: 002_04102024_52558095000167.RPA"></label>' +
      '<label>Observação<textarea id="d-nota"' + (P().decide ? '' : ' readonly') + ' placeholder="O que foi verificado e por quê">' + esc(d.nota) + '</textarea></label></section>' +
      '<div class="row"><span style="margin-left:auto"></span><button class="btn" id="d-prev"' + (idx <= 0 ? ' disabled' : '') + '>Anterior</button><button class="btn primary" id="d-next"' + (idx < 0 || idx >= list.length - 1 ? ' disabled' : '') + '>Próximo caso</button></div>';
    box.hidden = false; $('#scrim').hidden = false;
    function upd(fn) { var cur = getDec(k); cur = JSON.parse(JSON.stringify(cur)); fn(cur); cur.at = new Date().toISOString(); st.dec[k] = cur; saveDec(); renderTop(); }
    box.querySelectorAll('[data-status]').forEach(function (b) { b.addEventListener('click', function () {
      upd(function (c) { c.status = b.dataset.status; });
      box.querySelectorAll('[data-status]').forEach(function (x) { x.setAttribute('aria-pressed', x === b); });
      refreshRow(k);
    }); });
    box.querySelectorAll('[data-ck]').forEach(function (b) { b.addEventListener('change', function () { upd(function (c) { c.checks[+b.dataset.ck] = b.checked; }); }); });
    $('#d-prot').addEventListener('input', function (e) { upd(function (c) { c.protocolo = e.target.value; }); });
    $('#d-nota').addEventListener('input', function (e) { upd(function (c) { c.nota = e.target.value; }); });
    box.querySelectorAll('[data-copy]').forEach(function (b) { b.addEventListener('click', function () { copyText(b.dataset.copy, 'Copiado: ' + b.dataset.copy); }); });
    $('#d-close').addEventListener('click', closeCase);
    $('#d-prev').addEventListener('click', function () { openCase(list[idx - 1].key); });
    $('#d-next').addEventListener('click', function () { openCase(list[idx + 1].key); });
    document.querySelectorAll('.list tr.sel').forEach(function (x) { x.classList.remove('sel'); });
    var tr = document.querySelector('.list tr[data-k="' + CSS.escape(k) + '"]'); if (tr) tr.classList.add('sel');
    $('#d-close').focus();
  }
  /* Consulta no CNES/DATASUS já com o valor do caso: um botão por CNES ou CNPJ distinto. */
  var CNES_URL = 'https://cnes.datasus.gov.br/pages/estabelecimentos/consulta.jsp?search=';
  function cnesLinks(it) {
    var n = it.rnp || {}, a = it.ans || {}, seen = {}, out = [];
    function add(v, txt) { if (!v || seen[v]) return; seen[v] = 1; out.push('<a class="btn" href="' + CNES_URL + encodeURIComponent(v) + '" target="_blank" rel="noopener">' + esc(txt) + '</a>'); }
    add(n.cnes, 'CNES ' + n.cnes + (a.cnes && a.cnes !== n.cnes ? ' (RNP)' : ''));
    add(a.cnes, 'CNES ' + a.cnes + (n.cnes && a.cnes !== n.cnes ? ' (ANS)' : ''));
    if (!out.length || it.diffs.some(function (d) { return d.campo === 'CNPJ'; })) { add(n.cnpj, 'CNPJ ' + fmtCnpj(n.cnpj) + (a.cnpj && a.cnpj !== n.cnpj ? ' (RNP)' : '')); add(a.cnpj, 'CNPJ ' + fmtCnpj(a.cnpj) + (n.cnpj && a.cnpj !== n.cnpj ? ' (ANS)' : '')); }
    return out.length ? '<section><h3>Conferir no CNES (DATASUS)</h3><p class="small muted">Abre a consulta pública já pesquisando o valor do caso.</p><div class="row" style="margin-top:.4rem">' + out.join('') + '</div></section>' : '';
  }
  /* Valores a levar para a ANS (RPA ou plataforma), com botão de copiar. */
  function fixBlock(it) {
    if (!it.diffs.length || it.situacao !== 'alterar') return '';
    var rows = it.diffs.map(function (d) {
      var novo = d.campo === 'CNPJ' ? fmtCnpj(d.rnp) : d.rnp;
      return '<tr><td>' + esc(d.campo) + '</td><td>' + esc(d.campo === 'CNPJ' ? fmtCnpj(d.ans) : d.ans || '—') + '</td><td><b>' + esc(novo || '—') + '</b></td><td>' + (novo ? '<button class="btn sm" data-copy="' + esc(novo) + '" aria-label="Copiar ' + esc(d.campo) + '">Copiar</button>' : '') + '</td></tr>';
    }).join('');
    return '<section><h3>Dados para a correção</h3><p class="small muted">Valor do RNP proposto para a ANS. Confirme no CNES antes de transmitir.</p><div style="overflow-x:auto"><table class="cmp"><thead><tr><th>Campo</th><th>Hoje na ANS</th><th>Corrigir para</th><th></th></tr></thead><tbody>' + rows + '</tbody></table></div></section>';
  }
  function copyText(txt, okMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { toast(okMsg || 'Copiado.'); }, function () { toast('Não foi possível copiar. Valor: ' + txt); });
    else toast('Valor: ' + txt);
  }
  function refreshRow(k) {
    var tr = document.querySelector('.list tr[data-k="' + CSS.escape(k) + '"]'); if (!tr) return;
    var d = getDec(k); tr.lastElementChild.innerHTML = '<span class="st ' + d.status + '">' + statusLabel(d.status) + '</span>';
  }
  function closeCase() {
    var k = st.sel; st.sel = null; $('#detail').hidden = true; $('#scrim').hidden = true;
    var tr = k && document.querySelector('.list tr[data-k="' + CSS.escape(k) + '"]'); if (tr) { tr.classList.remove('sel'); tr.focus(); }
  }

  /* ---------- Painel do ciclo (para o perfil Visualização) ---------- */
  /* Fotografia do cruzamento com as decisões: quem só visualiza abre este arquivo,
     sem precisar das bases originais. */
  function painelJson() {
    return JSON.stringify({ tipo: 'radar-painel', formato: 1, geradoEm: new Date().toISOString(), origem: st.source, nota: st.sourceNote,
      result: st.result, dec: st.dec, ciclos: store(cyclesKey()) || [] });
  }
  function openPainel(txt) {
    var p; try { p = JSON.parse(txt); } catch (e) { return toast('Arquivo inválido. Use o painel exportado no Fechamento.'); }
    if (!p || p.tipo !== 'radar-painel' || !p.result || !p.result.items) return toast('Este arquivo não é um painel do Radar.');
    st.source = 'painel'; st.result = p.result; st.dec = p.dec || {}; st.rnpFiles = []; st.ansFile = null; st.sel = null; st.filter = 'pend'; st.limit = 150;
    st.sourceNote = 'Painel de ' + M.compLabel(p.result.latest) + ' gerado em ' + new Date(p.geradoEm).toLocaleString('pt-BR') + (p.origem === 'demo' ? ' (dados fictícios)' : '');
    store(cyclesKey(), p.ciclos || []);
    renderTop(); render(current); toast(st.sourceNote + '.');
  }
  function painelBar() {
    if (P().decide) return '';
    return '<div class="banner"><span>' + (st.source === 'painel' ? '<b>' + esc(st.sourceNote) + '.</b> ' : st.source === 'demo' ? '<b>Você está vendo a demonstração.</b> ' : '') +
      'Perfil de visualização: consulta sem alterar decisões. ' + (st.source === 'painel' ? 'Para ver outro mês, abra outro painel.' : 'Para ver um ciclo real, abra o painel exportado pela analista no Fechamento.') + '</span>' +
      '<label class="btn" tabindex="0" style="margin-left:auto">Abrir painel do ciclo<input type="file" id="in-painel" accept=".json" hidden></label></div>';
  }

  /* ---------- Passo 3: Fechamento ---------- */
  function exportRows() {
    var r = st.result;
    var head = ['competencia', 'situacao', 'tipo', 'nome', 'cnpj', 'cnes', 'uf', 'municipio', 'motivo', 'campos_divergentes', 'meses_no_rnp', 'acao_sugerida', 'decisao', 'protocolo', 'observacao', 'decidido_em'];
    return [head].concat(r.items.filter(function (i) { return i.situacao !== 'ok'; }).map(function (i) {
      var d = getDec(i.key);
      return [r.latest, S[i.situacao].label, i.tipo, i.nome, i.cnpj, i.cnes, i.uf, i.municipio, i.motivo, i.diffs.map(function (x) { return x.campo + ': RNP ' + x.rnp + ' / ANS ' + x.ans; }).join(' | '), i.pres.filter(Boolean).length, r.regras.acoes[i.situacao] || S[i.situacao].acao, statusLabel(d.status), d.protocolo, d.nota, d.at || ''];
    }));
  }
  function renderFechamento() {
    var v = $('#v-fechamento'), r = st.result;
    if (!r) { v.innerHTML = '<div class="banner">Carregue as bases no passo 1.</div>'; return; }
    var pend = r.items.filter(function (i) { return i.situacao !== 'ok'; });
    var cnt = { afazer: 0, analise: 0, feito: 0, descartado: 0 };
    pend.forEach(function (i) { cnt[getDec(i.key).status]++; });
    var acao = pend.filter(function (i) { return ['alterar', 'investigar', 'excluir', 'incluir'].indexOf(i.situacao) >= 0; });
    var acaoAberta = acao.filter(function (i) { return ['afazer', 'analise'].indexOf(getDec(i.key).status) >= 0; }).length;
    function lote(sit, titulo) {
      var xs = pend.filter(function (i) { return i.situacao === sit && getDec(i.key).status === 'feito'; });
      return '<li><b>' + titulo + '</b> · <span class="num">' + xs.length + '</span>' + (xs.length ? '<ul>' + xs.slice(0, 12).map(function (i) { var d = getDec(i.key); return '<li>' + esc(i.nome) + ' <span class="muted mono">' + fmtCnpj(i.cnpj) + (d.protocolo ? ' · ' + esc(d.protocolo) : ' · sem protocolo') + '</span></li>'; }).join('') + (xs.length > 12 ? '<li class="muted">e mais ' + (xs.length - 12) + '</li>' : '') + '</ul>' : '') + '</li>';
    }
    var cycles = store(cyclesKey()) || [];
    v.innerHTML =
      '<div class="head"><div><h1>3 · Fechamento de ' + M.compLabel(r.latest) + '</h1><p>Confira o que foi decidido, exporte o resultado para o controle (substitui a aba “Análise do mês”) e feche o ciclo para registrar os indicadores.</p></div></div>' +
      '<div class="kpis">' +
        '<div class="kpi"><span>Pendências do mês</span><b>' + fmt(pend.length) + '</b><small>' + fmt(acao.length) + ' pedem ação</small></div>' +
        '<div class="kpi"><span>Feitas</span><b>' + fmt(cnt.feito) + '</b><small>com movimento ou correção</small></div>' +
        '<div class="kpi"><span>Descartadas</span><b>' + fmt(cnt.descartado) + '</b><small>conferidas, sem ação</small></div>' +
        '<div class="kpi"><span>Em aberto</span><b>' + fmt(cnt.afazer + cnt.analise) + '</b><small>' + fmt(cnt.analise) + ' em análise</small></div>' +
      '</div>' +
      (acaoAberta ? '<div class="banner"><span><b>' + fmt(acaoAberta) + ' casos que pedem ação ainda estão em aberto.</b> Você pode fechar o ciclo assim mesmo; eles aparecem de novo no próximo cruzamento se a divergência continuar.</span></div>' : '<div class="banner ok"><span><b>Todos os casos que pedem ação têm decisão.</b></span></div>') +
      '<div class="grid2"><section class="panel"><h2>Movimentos a registrar</h2><p>Casos marcados como feitos, agrupados pelo canal de envio.</p><ul class="lote" style="padding-left:1.1rem;margin:.7rem 0 0">' +
        lote('incluir', 'Inclusões · RPI via PTA') + lote('alterar', 'Alterações cadastrais · RPA via PTA ou ofício') + lote('excluir', 'Exclusões · plataforma ANS (RN 585)') + lote('investigar', 'Investigações concluídas') +
      '</ul></section>' +
      '<section class="panel"><h2>Exportar</h2><p>CSV com separador “;”, abre direto no Excel. Inclui situação, campos divergentes, decisão, protocolo e observação.</p>' +
        '<div class="row" style="margin-top:.7rem"><button class="btn primary" id="btn-exp">Baixar pendências (CSV)</button><button class="btn" id="btn-copy">Copiar CSV</button></div>' +
        '<h2 style="margin-top:1.2rem">Painel para visualização</h2><p>Gera um arquivo com o cruzamento e as decisões do mês. Quem tem o perfil Visualização abre esse arquivo e vê os indicadores e a fila operacional, sem as bases e sem poder alterar nada.</p>' +
        '<div class="row" style="margin-top:.7rem"><button class="btn" id="btn-painel">Exportar painel (.json)</button></div>' +
        '<textarea class="copybox" id="copybox" hidden readonly aria-label="CSV para copiar"></textarea>' +
        '<h2 style="margin-top:1.2rem">Fechar o ciclo</h2><p>Guarda os números de ' + M.compLabel(r.latest) + ' neste navegador para a tendência dos indicadores.</p>' +
        '<div class="row" style="margin-top:.7rem"><button class="btn" id="btn-close">Fechar ciclo de ' + M.compLabel(r.latest) + '</button></div>' +
        (cycles.length ? '<p class="small muted" style="margin-top:.5rem">Ciclos fechados: ' + cycles.map(function (c) { return M.compLabel(c.comp); }).join(', ') + '</p>' : '') +
      '</section></div>';
    $('#btn-exp').addEventListener('click', function () {
      var ok = window.IO.download('transforma_pendencias_' + r.latest + '.csv', window.IO.toCSV(exportRows()));
      toast(ok ? 'Arquivo gerado.' : 'O download foi bloqueado. Use “Copiar CSV”.');
    });
    $('#btn-painel').addEventListener('click', function () {
      var ok = window.IO.download('radar_painel_' + r.latest + '.json', painelJson());
      toast(ok ? 'Painel gerado. Envie o arquivo para quem só visualiza.' : 'O download foi bloqueado neste ambiente.');
    });
    $('#btn-copy').addEventListener('click', function () {
      var txt = window.IO.toCSV(exportRows()).replace(/^﻿/, ''), box = $('#copybox');
      var fallback = function () { box.hidden = false; box.value = txt; box.select(); toast('Selecionado. Use Ctrl+C para copiar.'); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(function () { toast('CSV copiado. Cole no Excel.'); }, fallback); else fallback();
    });
    $('#btn-close').addEventListener('click', function () {
      var cs = (store(cyclesKey()) || []).filter(function (c) { return c.comp !== r.latest; });
      cs.push({ regras: r.regras.versao + (st.regrasLocal ? ' (ajustada neste navegador)' : ''), comp: r.latest, aderencia: r.totais.aderencia, pendencias: pend.length, acao: acao.length, feitas: cnt.feito, descartadas: cnt.descartado, abertas: cnt.afazer + cnt.analise, tipos: r.tipos, fechadoEm: new Date().toISOString() });
      cs.sort(function (a, b) { return a.comp < b.comp ? -1 : 1; });
      store(cyclesKey(), cs); toast('Ciclo de ' + M.compLabel(r.latest) + ' fechado.'); renderFechamento();
    });
  }

  /* ---------- Indicadores ---------- */
  function bars(entries, max) {
    max = max || Math.max.apply(null, entries.map(function (e) { return e[1]; }).concat([1]));
    return '<div class="bars">' + entries.map(function (e) {
      return '<div class="bar" title="' + esc(e[0]) + ': ' + fmt(e[1]) + '"><span class="lbl">' + (e[2] || esc(e[0])) + '</span><span class="track"><span class="fill" style="width:' + (e[1] / max * 100).toFixed(1) + '%"></span></span><span class="v">' + fmt(e[1]) + '</span></div>';
    }).join('') + '</div>';
  }
  function trend(cs) {
    if (cs.length < 2) return '<p class="muted small">A tendência aparece a partir do segundo ciclo fechado. ' + (cs.length ? 'Já fechado: ' + M.compLabel(cs[0].comp) + ' com aderência de ' + pct(cs[0].aderencia) + '.' : 'Feche o primeiro ciclo no passo 3.') + '</p>';
    var W = 560, H = 180, P = { l: 44, r: 16, t: 14, b: 26 }, vals = cs.map(function (c) { return c.aderencia * 100; });
    var lo = Math.floor(Math.min.apply(null, vals) - 1), hi = Math.min(100, Math.ceil(Math.max.apply(null, vals) + 1));
    var x = function (i) { return P.l + i * (W - P.l - P.r) / (cs.length - 1); }, y = function (v) { return P.t + (hi - v) / (hi - lo || 1) * (H - P.t - P.b); };
    var pts = vals.map(function (v, i) { return x(i).toFixed(1) + ',' + y(v).toFixed(1); }).join(' ');
    var grid = [lo, (lo + hi) / 2, hi].map(function (g) { return '<line x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y(g) + '" y2="' + y(g) + '" stroke="var(--line)"/><text x="' + (P.l - 6) + '" y="' + (y(g) + 4) + '" text-anchor="end" font-size="11" fill="var(--ink-3)">' + g.toFixed(0) + '%</text>'; }).join('');
    var lab = cs.map(function (c, i) { return '<text x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle" font-size="11" fill="var(--ink-3)">' + M.compLabel(c.comp) + '</text><circle cx="' + x(i) + '" cy="' + y(vals[i]) + '" r="' + (i === cs.length - 1 ? 5 : 3.5) + '" fill="var(--brand)" stroke="var(--surface)" stroke-width="2"><title>' + M.compLabel(c.comp) + ': ' + pct(c.aderencia) + '</title></circle>'; }).join('');
    return '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" role="img" aria-label="Aderência por ciclo fechado">' + grid + '<polyline points="' + pts + '" fill="none" stroke="var(--brand)" stroke-width="2"/>' + lab + '</svg>';
  }
  function renderIndicadores() {
    var v = $('#v-indicadores'), r = st.result;
    if (!r) { v.innerHTML = '<div class="banner">Carregue as bases no passo 1.</div>'; return; }
    var t = r.totais, c = r.cont;
    var acao = c.alterar + c.investigar + c.excluir + c.incluir;
    var ufCount = {}; r.items.forEach(function (i) { if (i.situacao !== 'ok' && i.situacao !== 'passivo') ufCount[i.uf || '—'] = (ufCount[i.uf || '—'] || 0) + 1; });
    var ufs = Object.keys(ufCount).map(function (u) { return [u, ufCount[u]]; }).sort(function (a, b) { return b[1] - a[1]; }).slice(0, 8);
    var tipos = Object.keys(r.tipos).map(function (k) { return [k, r.tipos[k]]; }).sort(function (a, b) { return b[1] - a[1]; });
    var sits = Object.keys(S).filter(function (s) { return s !== 'ok'; }).map(function (s) { return [S[s].label, c[s], pill(s)]; });
    var cs = store(cyclesKey()) || [];
    v.innerHTML =
      painelBar() + '<div class="head"><div><h1>Indicadores · ' + M.compLabel(r.latest) + '</h1><p>Calculados a partir do cruzamento carregado, sem números digitados à mão. Para a coordenação acompanhar a aderência da rede registrada na ANS à rede divulgada.</p></div></div>' +
      (st.source === 'demo' ? '<div class="banner"><span><b>Demonstração:</b> estes números vêm da base fictícia e não descrevem a operadora.</span></div>' : '') +
      '<div class="kpis">' +
        '<div class="kpi"><span>Aderência ANS × RNP</span><b>' + pct(t.aderencia) + '</b><small>' + fmt(c.ok) + ' de ' + fmt(t.ansAtivos) + ' hospitais ativos na ANS sem divergência</small></div>' +
        '<div class="kpi"><span>Pedem ação</span><b>' + fmt(acao) + '</b><small>alterar, investigar, excluir ou incluir</small></div>' +
        '<div class="kpi"><span>Em acompanhamento</span><b>' + fmt(c.observar + c.aguardar) + '</b><small>saídas recentes e estabilização</small></div>' +
        '<div class="kpi"><span>Passivo sem divulgação</span><b>' + fmt(c.passivo) + '</b><small>ativos na ANS, ausentes do RNP em ' + r.comps.length + ' meses</small></div>' +
      '</div>' +
      '<div class="grid2">' +
        '<section class="panel"><h2>Pendências por situação</h2><p>Fila completa do mês, exceto os conformes.</p><div style="margin-top:.8rem">' + bars(sits) + '</div></section>' +
        '<section class="panel"><h2>Divergências por tipo</h2><p>Motivo de cada pendência, incluindo o passivo.</p><div style="margin-top:.8rem">' + bars(tipos) + '</div></section>' +
        '<section class="panel"><h2>UFs com mais pendências</h2><p>Sem contar o passivo.</p><div style="margin-top:.8rem">' + bars(ufs) + '</div></section>' +
        '<section class="panel"><h2>Aderência por ciclo fechado</h2><p>Um ponto por mês fechado no passo 3.</p><div style="margin-top:.8rem">' + trend(cs) + '</div></section>' +
      '</div>' +
      '<section class="panel"><h2>O que ainda não é medido aqui</h2><div class="prose small" style="margin-top:.5rem"><ul>' +
        '<li><b>Tempo de correção:</b> passa a ser calculado quando houver dois ciclos fechados com o mesmo caso.</li>' +
        '<li><b>Chamados e ofícios da ANS:</b> vêm de fora das bases; registre o protocolo no caso para cruzar depois.</li>' +
        '<li><b>Valor financeiro:</b> fica no material da banca até as premissas serem validadas (issues #1 a #5).</li></ul></div></section>';
  }

  /* ---------- Regras ---------- */
  var CMP_LABEL = { cnes: 'CNES', opInter: 'Operadora intermediária', urg: 'Urgência/emergência', uf: 'UF' };
  var CK_ORDER = ['alterar', 'investigar', 'excluir', 'incluir', 'observar', 'aguardar', 'passivo'];
  function regrasJs(rg) {
    return '/* regras.js — Regras oficiais do Radar de Integridade ANS.\n' +
      '   Gerado pela aba Regras em ' + new Date().toLocaleString('pt-BR') + '. Substitua dashboard/js/regras.js por este arquivo. */\n' +
      'window.RADAR_REGRAS = ' + JSON.stringify(rg, null, 2) + ';\n';
  }
  function renderRegras() {
    var rg = st.regras, PD = M.REGRAS_PADRAO, pode = P().regras, c = st.result ? st.result.cont : {};
    function dif(v, d) { return v !== d ? ' <span class="pill t-warn">padrão: ' + esc(String(d)) + '</span>' : ''; }
    var tp = st.result ? st.result.tipos : {};
    function hoje(n) { return st.result ? '<span class="small muted">Hoje: ' + fmt(n) + ' caso(s)</span>' : ''; }
    function tog(k) { return '<label class="switch"><input type="checkbox" data-rgon="' + k + '"' + (rg.ativas[k] ? ' checked' : '') + '><span>' + (rg.ativas[k] ? 'Ativa' : 'Desligada') + '</span></label>' + (rg.ativas[k] !== PD.ativas[k] ? '<span class="pill t-warn">padrão: ' + (PD.ativas[k] ? 'ativa' : 'desligada') + '</span>' : ''); }
    var sempre = '<span class="pill t-ok">Sempre ativa</span>';
    var REG = [
      { nome: 'Chave composta', sits: ['alterar'], on: sempre, fonte: 'Entrevista de 27/08 (“se qualquer uma mudar, é B.O.”)',
        desc: 'Compara o RNP com a ANS pelo CNPJ e pelos campos marcados. Diferença em qualquer um vira “Alterar cadastro”.',
        n: (c.alterar || 0) - (tp['CNPJ divergente'] || 0),
        param: '<div class="row">' + Object.keys(CMP_LABEL).map(function (k) { return '<label class="chk"><input type="checkbox" data-rgcmp="' + k + '"' + (rg.comparar[k] ? ' checked' : '') + '> ' + CMP_LABEL[k] + '</label>'; }).join('') + '</div>' },
      { nome: 'Troca de CNPJ', sits: ['alterar'], on: tog('trocaCnpj'), n: tp['CNPJ divergente'] || 0, fonte: 'Planilha de análise atual',
        desc: 'Mesmo CNES na ANS com outro CNPJ: provável troca de CNPJ do local de atendimento, tratada como alteração.' },
      { nome: 'Duplicidade no RNP', sits: ['investigar'], on: tog('duplicidade'), n: c.investigar || 0, fonte: 'Casos pintados de amarelo na planilha atual',
        desc: 'O mesmo CNPJ divulgado no mês com CNES ou intermediária diferentes vai para “Investigar”.' },
      { nome: 'Saída do RNP', sits: ['excluir', 'observar'], on: sempre, n: (c.excluir || 0) + (c.observar || 0), fonte: 'Proposta, validar com a analista (issue #28)', validar: true,
        desc: 'Ativo na ANS e ausente do RNP: abaixo do limite fica em “Observar saída”; a partir dele, “Candidato a exclusão”.',
        param: '<label class="field">Cargas seguidas ausente' + dif(rg.cargasParaExclusao, PD.cargasParaExclusao) + '<input type="number" min="1" max="24" id="rg-exc" value="' + rg.cargasParaExclusao + '"></label>' },
      { nome: 'Estabilização', sits: ['incluir', 'aguardar'], on: sempre, n: (c.incluir || 0) + (c.aguardar || 0), fonte: 'Reunião de 14/08 e ata de 27/08',
        desc: 'Hospital novo no RNP só vira “Candidato a inclusão” depois das divulgações seguidas exigidas. Antes disso fica “Em estabilização”.',
        param: '<label class="field">Divulgações seguidas' + dif(rg.mesesEstabilizacao, PD.mesesEstabilizacao) + '<input type="number" min="1" max="24" id="rg-est" value="' + rg.mesesEstabilizacao + '"></label>' },
      { nome: 'Passivo de higienização', sits: ['passivo'], on: tog('passivo'), n: c.passivo || 0, fonte: 'Documentação (~95 hospitais)',
        desc: 'Ativo na ANS e sem nenhuma divulgação na janela carregada.' },
      { nome: 'Rede hospitalar', sits: [], on: sempre, fonte: 'Escopo do MVP',
        desc: 'Considera só registros cuja classificação contém “hospital”. Liga e desliga no passo 1, por carga.' },
      { nome: 'Gate SIB', sits: ['incluir'], on: '<span class="pill t-neutral">Manual</span>', fonte: 'Reunião de 14/08', validar: true,
        desc: 'Inclusão em produto sem vidas gera taxa de ~R$ 1.400 por produto. Sem a base SIB no cruzamento, fica como item do checklist.' }
    ];
    var cards = REG.map(function (x) {
      return '<div class="rule"><div class="rule-on">' + x.on + '</div><div class="rule-body"><h3>' + esc(x.nome) + ' ' + x.sits.map(pill).join(' ') + (x.validar ? ' <span class="pill t-warn">a validar</span>' : '') + '</h3>' +
        '<p>' + esc(x.desc) + '</p><p class="small muted">Fonte: ' + esc(x.fonte) + '</p></div><div class="rule-param">' + (x.param || '') + (x.n != null ? hoje(x.n) : '') + '</div></div>';
    }).join('');
    $('#v-regras').innerHTML =
      '<div class="head"><div><h1>Gestão de regras</h1><p>Cada regra do cruzamento, de onde veio, se está ativa e com que parâmetro. As mudanças refazem a triagem na hora.</p></div></div>' +
      (!pode ? '<div class="banner"><span><b>Somente consulta.</b> Para alterar, use o perfil “Gestor de regras” no topo.</span></div>' : '') +
      (st.regrasLocal ? '<div class="banner"><span><b>Regras ajustadas neste navegador (versão ' + esc(rg.versao) + ').</b> Para valer para todos, use “Exportar regras.js” e substitua <code>dashboard/js/regras.js</code> no repositório.</span></div>' : '') +
      '<form id="rg-form" onsubmit="return false"><fieldset class="bare"' + (pode ? '' : ' disabled') + '>' +
      '<section class="panel"><h2>Regras do cruzamento</h2><div class="rules-list">' + cards + '</div></section>' +
      '<section class="panel"><h2>Ações e checklists por situação</h2><p class="small muted">A ação sugerida aparece no topo de cada caso. O checklist tem um item por linha; mudar a ordem pode trocar marcações já feitas no mês.</p>' +
        '<div class="grid2" style="margin-top:.6rem">' +
          CK_ORDER.map(function (k) { return '<div class="sitbox"><div>' + pill(k) + '</div><label class="field">Ação sugerida<input data-rgac="' + k + '" value="' + esc(rg.acoes[k]) + '"></label><label class="field">Checklist<textarea rows="4" data-rgck="' + k + '">' + esc((rg.checklist[k] || []).join('\n')) + '</textarea></label></div>'; }).join('') +
        '</div></section>' +
      (pode ? '<section class="panel"><label class="field">O que mudou e por quê (vai para o histórico)<input id="rg-why" placeholder="ex.: analista confirmou exclusão só após 3 cargas"></label>' +
        '<div class="row" style="margin-top:.8rem"><button class="btn primary" id="rg-save" type="button">Salvar e recalcular</button><button class="btn" id="rg-reset" type="button"' + (st.regrasLocal ? '' : ' disabled') + '>Voltar ao padrão do arquivo</button>' +
        '<span style="margin-left:auto"></span><label class="btn" tabindex="0">Importar regras<input type="file" id="rg-imp" accept=".js,.json" hidden></label></div></section>' : '') +
      '</fieldset></form>' +
      '<section class="panel"><h2>Versão e histórico</h2><p class="small muted">Arquivo do repositório: versão ' + esc(PD.versao) + '. Em uso: ' + esc(rg.versao) + '.</p>' +
        '<div class="row" style="margin-top:.6rem"><button class="btn" id="rg-exp" type="button">Exportar regras.js</button></div>' +
        '<textarea class="copybox" id="rg-copy" hidden readonly aria-label="regras.js para copiar"></textarea>' +
        (rg.historico.length ? '<ul class="small" style="margin-top:.6rem">' + rg.historico.slice().reverse().map(function (h) { return '<li><b>' + esc(h.data) + '</b> · ' + esc(h.mudanca) + '</li>'; }).join('') + '</ul>' : '') +
      '</section>' +
      '<div class="grid2"><section class="panel"><h2>Privacidade</h2><div class="prose small" style="margin-top:.5rem"><p>Os arquivos são lidos neste navegador. Nada é enviado a servidor. As decisões ficam guardadas só neste navegador, por competência. Para compartilhar, exporte o CSV ou o painel no passo 3.</p></div></section>' +
      '<section class="panel"><h2>Formato esperado</h2><div class="prose small" style="margin-top:.5rem"><ul><li><b>RNP:</b> colunas como Versão, Código Unimed, Registro ANS, CNPJ/CPF, CNES, Nome Prestador, UF, Tipo Prestador.</li><li><b>ANS:</b> CSV do RPSWEB com o preâmbulo original (Reg. ANS, Data da Extração) e colunas Razão Social, CNES, CNPJ/CPF, Operadora Intermediária, Data Fim do Serviço.</li><li>Nomes de coluna diferentes podem ser ajustados no passo 1.</li></ul></div></section></div>';
    document.querySelectorAll('[data-rgon]').forEach(function (c) { c.addEventListener('change', function () { c.nextElementSibling.textContent = c.checked ? 'Ativa' : 'Desligada'; }); });

    function readForm() {
      var out = { versao: rg.versao, mesesEstabilizacao: +$('#rg-est').value, cargasParaExclusao: +$('#rg-exc').value, comparar: {}, checklist: {}, historico: rg.historico.slice() };
      document.querySelectorAll('[data-rgcmp]').forEach(function (c) { out.comparar[c.dataset.rgcmp] = c.checked; });
      out.ativas = {}; document.querySelectorAll('[data-rgon]').forEach(function (c) { out.ativas[c.dataset.rgon] = c.checked; });
      out.acoes = {}; document.querySelectorAll('[data-rgac]').forEach(function (c) { out.acoes[c.dataset.rgac] = c.value; });
      document.querySelectorAll('[data-rgck]').forEach(function (t) { out.checklist[t.dataset.rgck] = t.value.split('\n').map(function (x) { return x.trim(); }).filter(Boolean); });
      return out;
    }
    function apply(r, msg) {
      st.regras = M.normRegras(r); st.regrasLocal = true; store(REGRAS_KEY, st.regras);
      var errs = st.rnpFiles.length && st.ansFile ? runCross() : null;
      renderTop(); renderRegras(); toast(errs ? errs[0] : msg + ' ' + fmt(st.result.totais.pendencias) + ' pendências.');
    }
    if (!pode) { $('#rg-exp').addEventListener('click', exportar); return; }
    $('#rg-save').addEventListener('click', function () {
      var r = readForm(), why = $('#rg-why').value.trim(), today = new Date().toISOString().slice(0, 10);
      r.versao = today; r.historico.push({ data: today, mudanca: why || 'Ajuste feito na aba Regras.' });
      apply(r, 'Regras salvas e cruzamento refeito:');
    });
    $('#rg-reset').addEventListener('click', function () {
      store(REGRAS_KEY, null); try { localStorage.removeItem(REGRAS_KEY); } catch (e) {}
      loadRegras(); if (st.rnpFiles.length && st.ansFile) runCross(); renderTop(); renderRegras(); toast('Regras do arquivo restauradas.');
    });
    $('#rg-exp').addEventListener('click', exportar);
    function exportar() {
      var txt = regrasJs(pode ? readForm() : rg), box = $('#rg-copy');
      var ok = (function () { try { var u = URL.createObjectURL(new Blob([txt], { type: 'text/javascript' })), l = document.createElement('a'); l.href = u; l.download = 'regras.js'; document.body.appendChild(l); l.click(); l.remove(); setTimeout(function () { URL.revokeObjectURL(u); }, 2000); return true; } catch (e) { return false; } })();
      box.hidden = false; box.value = txt;
      toast(ok ? 'regras.js gerado. O conteúdo também está na caixa abaixo.' : 'Download bloqueado. Copie o conteúdo da caixa abaixo.');
    }
    $('#rg-imp').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      f.text().then(function (t) {
        var i = t.indexOf('{'), j = t.lastIndexOf('}'), r;
        try { r = JSON.parse(t.slice(i, j + 1)); } catch (err) { return toast('Não consegui ler. Use um arquivo gerado por “Exportar regras.js”.'); }
        apply(r, 'Regras importadas:');
      });
    });
  }

  /* ---------- Navegação ---------- */
  var VIEWS = ['bases', 'triagem', 'fechamento', 'indicadores', 'regras'];
  var current = 'triagem';
  function go(view, push) {
    var vis = P().views;
    if (vis.indexOf(view) < 0) view = st.perfil === 'visualizacao' ? 'indicadores' : 'triagem';
    current = view;
    VIEWS.forEach(function (x) { $('#v-' + x).hidden = x !== view; var t = $('#t-' + x); t.setAttribute('aria-selected', x === view); t.tabIndex = x === view ? 0 : -1; });
    if (st.sel) closeCase();
    render(view);
    if (push !== false && !st.perfilFixo) { try { history.replaceState(null, '', '#' + view); } catch (e) {} }
    document.title = { bases: 'Bases', triagem: P().decide ? 'Triagem' : 'Operacional', fechamento: 'Fechamento', indicadores: 'Indicadores', regras: 'Regras' }[view] + ' · Radar de Integridade ANS';
    window.scrollTo(0, 0);
  }
  function render(view) {
    ({ bases: renderBases, triagem: renderTriagem, fechamento: renderFechamento, indicadores: renderIndicadores, regras: renderRegras })[view]();
  }
  function renderAll() { renderTop(); render(current); }

  /* ---------- Eventos delegados ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-f],[data-k],#btn-more,#btn-demo,#btn-cross,[data-rm],.tab,#theme,#scrim');
    if (!t) return;
    if (t.classList.contains('tab')) return go(t.dataset.view);
    if (t.id === 'theme') return toggleTheme();
    if (t.id === 'scrim') return closeCase();
    if (t.dataset.f) { st.filter = t.dataset.f; st.limit = 150; return renderTriagem(); }
    if (t.dataset.k && t.tagName === 'TR') return openCase(t.dataset.k);
    if (t.id === 'btn-more') { st.limit += 150; return renderTriagem(); }
    if (t.id === 'btn-demo') { loadDemo(); toast('Demonstração carregada.'); return go('triagem'); }
    if (t.dataset.rm) { var id = t.dataset.rm; if (id === 'a') st.ansFile = null; else st.rnpFiles.splice(+id.slice(1), 1); return renderBases(); }
    if (t.id === 'btn-cross') {
      var errs = runCross();
      if (errs) { $('#cross-msg').innerHTML = '<div class="banner err" style="margin-top:.7rem"><span>' + errs.map(esc).join('<br>') + '</span></div>'; return; }
      renderTop(); toast('Cruzamento concluído: ' + fmt(st.result.totais.pendencias) + ' pendências.'); return go('triagem');
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target, f;
    function fileOf(id) { return id === 'a' ? st.ansFile : st.rnpFiles[+id.slice(1)]; }
    if (t.dataset.sheet) { selectSheet(fileOf(t.dataset.sheet), t.value); return renderBases(); }
    if (t.dataset.map) { f = fileOf(t.dataset.map); f.map[t.dataset.field] = +t.value; if (t.dataset.field === 'comp' && +t.value < 0 && !f.comp) f.comp = M.normComp(f.name); return renderBases(); }
    if (t.dataset.comp) { fileOf(t.dataset.comp).comp = t.value; }
    if (t.id === 'opt-hosp') st.onlyHosp = t.checked;
    if (t.id === 'perfil') { st.perfil = t.value; store('radar:perfil', st.perfil); renderTop(); toast('Perfil: ' + P().label + '.'); return go(current); }
    if (t.id === 'in-painel' && t.files[0]) { t.files[0].text().then(openPainel, function () { toast('Não consegui ler o arquivo.'); }); }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && st.sel) closeCase();
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches && e.target.matches('tr[data-k]')) { e.preventDefault(); openCase(e.target.dataset.k); }
    if (e.target.classList && e.target.classList.contains('tab') && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
      var vv = VIEWS.filter(function (x) { return P().views.indexOf(x) >= 0; }), i = vv.indexOf(e.target.dataset.view) + (e.key === 'ArrowRight' ? 1 : -1);
      if (i >= 0 && i < vv.length) { go(vv[i]); $('#t-' + vv[i]).focus(); }
    }
  });

  function toggleTheme() {
    var rootEl = document.documentElement, cur = rootEl.getAttribute('data-theme');
    if (!cur) cur = window.matchMedia && matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    var next = cur === 'dark' ? 'light' : 'dark';
    rootEl.setAttribute('data-theme', next); store('transforma:tema', next);
  }
  (function () { var t = store('transforma:tema'); if (t === 'dark' || t === 'light') document.documentElement.setAttribute('data-theme', t); })();

  /* ---------- Início ---------- */
  loadDemo();
  renderTop();
  var h = (location.hash || '').replace('#', '');
  go(VIEWS.indexOf(h) >= 0 ? h : (st.perfil === 'visualizacao' ? 'indicadores' : 'triagem'), false);
})();
