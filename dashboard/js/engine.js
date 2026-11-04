/* ==========================================================================
   engine.js — Motor de cruzamento ANS × RNP (puro, sem DOM)
   Reproduz o método da analista (reunião 14/08 e 27/08):
     1. empilha N competências do RPS Total (RNP)
     2. conta presença de cada prestador por mês (regra dos 3 meses)
     3. cruza o mês mais recente com a foto RPSWEB da ANS pela chave composta
        (código Unimed/registro da intermediária + CNPJ + CNES)
     4. classifica cada caso numa situação com ação sugerida
   ========================================================================== */
(function (root) {
  'use strict';

  /* ---------- Campos e sinônimos de cabeçalho ---------- */
  var FIELDS = {
    rnp: [
      { id: 'comp', label: 'Competência (mês)', syn: ['versao', 'competencia', 'mesreferencia', 'mes', 'periodo'] },
      { id: 'cnpj', label: 'CNPJ', req: true, syn: ['cnpjcpf01', 'cnpjcpf', 'cnpj', 'cpfcnpj'] },
      { id: 'cnes', label: 'CNES', syn: ['cnes', 'codigocnes'] },
      { id: 'nome', label: 'Nome do prestador', syn: ['nomeprestador', 'razaosocial', 'nomefantasia', 'nome'] },
      { id: 'codUnimed', label: 'Código Unimed', syn: ['codigounimed', 'codunimed', 'codigodaunimed'] },
      { id: 'opInter', label: 'Registro ANS da Unimed (intermediária)', syn: ['registroans', 'regans', 'registroansunimed', 'operadoraintermediaria'] },
      { id: 'codPrest', label: 'Código do prestador', syn: ['codigoprestador', 'codprestador'] },
      { id: 'uf', label: 'UF', syn: ['uf', 'ufprestador', 'estado'] },
      { id: 'municipio', label: 'Município', syn: ['municipio', 'nomedomunicipio', 'cidade'] },
      { id: 'classif', label: 'Tipo / classificação', syn: ['tipoprestador', 'classificacaoestabelecimento', 'classificacao', 'tipo'] },
      { id: 'urg', label: 'Urgência/emergência', syn: ['urgenciaemergencia', 'urgencia', 'atendeurgencia'] }
    ],
    ans: [
      { id: 'cnpj', label: 'CNPJ', req: true, syn: ['cnpjcpf01', 'cnpjcpf', 'cnpj', 'cpfcnpj'] },
      { id: 'cnes', label: 'CNES', syn: ['cnes'] },
      { id: 'nome', label: 'Razão social', syn: ['razaosocial', 'nome', 'nomefantasia'] },
      { id: 'opInter', label: 'Operadora intermediária', syn: ['operadoraintermediaria', 'intermediaria'] },
      { id: 'uf', label: 'UF', syn: ['uf'] },
      { id: 'municipio', label: 'Município', syn: ['municipio'] },
      { id: 'classif', label: 'Classificação', syn: ['classificacao', 'classificacaoestabelecimento'] },
      { id: 'urg', label: 'Urgência/emergência', syn: ['urgenciaemergencia', 'urgencia'] },
      { id: 'dataFim', label: 'Data fim do serviço', syn: ['datafimdoservico', 'datafimservico', 'datafim'] }
    ]
  };

  var SITUACOES = {
    alterar:   { label: 'Alterar cadastro',        tone: 'danger', acao: 'RPA (XML via PTA) ou ofício à Unimed de origem', ordem: 1 },
    investigar:{ label: 'Investigar',              tone: 'danger', acao: 'Conferir no RNP e no CNES antes de qualquer movimento', ordem: 2 },
    excluir:   { label: 'Candidato a exclusão',    tone: 'warn',   acao: 'Exclusão na plataforma ANS (RN 585) após ler a documentação', ordem: 3 },
    incluir:   { label: 'Candidato a inclusão',    tone: 'warn',   acao: 'RPI (XML via PTA), se o produto tiver vidas no SIB', ordem: 4 },
    observar:  { label: 'Observar saída',          tone: 'info',   acao: 'Aguardar a próxima carga: pode ser flutuação do PTU A400', ordem: 5 },
    aguardar:  { label: 'Em estabilização',        tone: 'info',   acao: 'Aguardar as divulgações seguidas exigidas antes de incluir', ordem: 6 },
    passivo:   { label: 'Sem divulgação no RNP',   tone: 'neutral',acao: 'Passivo de higienização: avaliar exclusão sem taxa', ordem: 7 },
    ok:        { label: 'Conforme',                tone: 'ok',     acao: 'Nada a fazer', ordem: 8 }
  };

  /* Regras ajustáveis. O padrão oficial fica em js/regras.js (window.RADAR_REGRAS);
     o bloco abaixo só vale se esse arquivo não for carregado. */
  var REGRAS_EMBUTIDAS = {
    versao: 'embutida',
    mesesEstabilizacao: 3,
    cargasParaExclusao: 2,
    comparar: { cnes: true, opInter: true, urg: true, uf: true },
    ativas: { trocaCnpj: true, duplicidade: true, passivo: true },
    acoes: {},
    checklist: {
      incluir: ['CNES ativo e classificado como hospital (com leitos)', '3 divulgações seguidas confirmadas no RNP', 'Produto de destino com vidas no SIB (evita taxa ~R$ 1.400/produto)', 'Conferido de novo no RNP no dia da transmissão'],
      excluir: ['Documentação ou ofício da Unimed de origem lido', 'Relatório de exclusão hospitalar da Unimed do Brasil confirma', 'Avaliada substituição exigida pela RN 585', 'Conferido de novo no RNP no dia da exclusão'],
      alterar: ['Divergência confirmada na fonte oficial (CNES / Receita)', 'Definido quem corrige: ANS (RPA) ou Unimed de origem', 'Conferido de novo no RNP no dia da transmissão'],
      investigar: ['Histórico de divulgação conferido no RNP', 'CNES e CNPJ conferidos no DATASUS', 'Situação final definida'],
      observar: ['Conferir na próxima carga do RPS Total'],
      aguardar: ['Conferir na próxima carga do RPS Total'],
      passivo: ['Verificar utilização do hospital nos produtos', 'Avaliar mudança de natureza (exclusão sem taxa)']
    }
  };
  var REGRAS_PADRAO = normRegras(root.RADAR_REGRAS || REGRAS_EMBUTIDAS);
  var CHECKLIST = REGRAS_PADRAO.checklist;

  /* Completa e valida um conjunto de regras (vindo do arquivo, do navegador ou de importação). */
  function normRegras(r) {
    r = r || {};
    var b = REGRAS_EMBUTIDAS, cmp = r.comparar || {}, ck = r.checklist || {}, at = r.ativas || {}, ac = r.acoes || {};
    function int(v, d) { v = parseInt(v, 10); return v >= 1 && v <= 24 ? v : d; }
    var out = {
      versao: String(r.versao || b.versao),
      mesesEstabilizacao: int(r.mesesEstabilizacao, b.mesesEstabilizacao),
      cargasParaExclusao: int(r.cargasParaExclusao, b.cargasParaExclusao),
      comparar: {}, ativas: {}, acoes: {}, checklist: {},
      historico: Array.isArray(r.historico) ? r.historico : []
    };
    Object.keys(b.comparar).forEach(function (k) { out.comparar[k] = cmp[k] == null ? b.comparar[k] : !!cmp[k]; });
    Object.keys(b.ativas).forEach(function (k) { out.ativas[k] = at[k] == null ? b.ativas[k] : !!at[k]; });
    Object.keys(SITUACOES).forEach(function (k) { out.acoes[k] = ac[k] && String(ac[k]).trim() ? String(ac[k]).trim() : SITUACOES[k].acao; });
    Object.keys(b.checklist).forEach(function (k) {
      out.checklist[k] = Array.isArray(ck[k]) ? ck[k].map(String).filter(function (x) { return x.trim(); }) : b.checklist[k].slice();
    });
    return out;
  }

  /* ---------- Normalização ---------- */
  function normHeader(h) {
    return String(h == null ? '' : h).normalize('NFD').replace(/[̀-ͯ]/g, '')
      .toLowerCase().replace(/[^a-z0-9]/g, '');
  }
  function digits(v) { return String(v == null ? '' : v).replace(/\D/g, ''); }
  /* Dígito verificador de CPF/CNPJ (módulo 11). */
  function dv(d, pesos) {
    var s = 0; for (var i = 0; i < pesos.length; i++) s += +d[i] * pesos[i];
    var r = s % 11; return r < 2 ? 0 : 11 - r;
  }
  var P_CNPJ = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2], P_CPF = [10, 9, 8, 7, 6, 5, 4, 3, 2];
  function cnpjValido(d) {
    return d.length === 14 && !/^(\d)\1+$/.test(d) && dv(d, P_CNPJ) === +d[12] && dv(d, [6].concat(P_CNPJ)) === +d[13];
  }
  function cpfValido(d) {
    return d.length === 11 && !/^(\d)\1+$/.test(d) && dv(d, P_CPF) === +d[9] && dv(d, [11].concat(P_CPF)) === +d[10];
  }
  function normCnpj(v) {
    var d = digits(v);
    if (!d) return '';
    if (d.length > 11 && d.length < 14) return ('00000000000000' + d).slice(-14);
    /* Até 11 dígitos pode ser CPF ou CNPJ que perdeu zeros à esquerda no Excel: decide pelos verificadores. */
    if (d.length <= 11) {
      var c = ('00000000000000' + d).slice(-14);
      if (cnpjValido(c) && !cpfValido(('00000000000' + d).slice(-11))) return c;
    }
    return d;
  }
  /* Converte "31/12/2027", "2027-12-31" ou número de série do Excel em "AAAA-MM-DD"; '' se não reconhecer. */
  function normData(v) {
    var s = String(v == null ? '' : v).trim(), m;
    if (!s) return '';
    if (/^\d{5}(\.\d+)?$/.test(s) && +s > 20000 && +s < 80000) return new Date(Math.round((+s - 25569) * 864e5)).toISOString().slice(0, 10);
    if ((m = s.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})/))) return m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2);
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2);
    return '';
  }
  function normCnes(v) { var d = digits(v); return d ? ('0000000' + d).slice(-7) : ''; }
  function normYN(v) {
    var s = normHeader(v);
    if (!s) return '';
    if (s[0] === 's' || s === '1' || s === 'true') return 'S';
    if (s[0] === 'n' || s === '0' || s === 'false') return 'N';
    if (s.indexOf('urgencia') === 0) return 'S';
    return s.toUpperCase();
  }
  function normText(v) { return String(v == null ? '' : v).trim(); }
  function normUF(v) { return normText(v).toUpperCase().slice(0, 2); }

  var MESES = { jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12 };
  /* Converte "08/2026", "2026-08", "ago/26", "Agosto_26", número de série do Excel… em "AAAA-MM". */
  function normComp(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'number' && v > 20000 && v < 80000) {
      var d = new Date(Math.round((v - 25569) * 864e5));
      return d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2);
    }
    if (v instanceof Date) return v.getFullYear() + '-' + ('0' + (v.getMonth() + 1)).slice(-2);
    var s = normHeader(v), m;
    /* data completa "dd/mm/aaaa": sem este teste "01/08/2026" virava jan/2008 */
    if ((m = String(v).match(/(?:^|\D)(\d{1,2})[\/.\-](\d{1,2})[\/.\-](20\d\d)(?!\d)/))) {
      var mo = +m[2]; if (mo >= 1 && mo <= 12) return m[3] + '-' + ('0' + mo).slice(-2);
    }
    if ((m = String(v).match(/(20\d\d)\D{0,2}(\d{1,2})(?!\d)/))) return m[1] + '-' + ('0' + m[2]).slice(-2);
    if ((m = String(v).match(/(?:^|\D)(\d{1,2})\D{1,2}(20\d\d|\d\d)(?!\d)/))) {
      var mm = +m[1]; if (mm >= 1 && mm <= 12) return (m[2].length === 2 ? '20' + m[2] : m[2]) + '-' + ('0' + mm).slice(-2);
    }
    if ((m = s.match(/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*(20\d\d|\d\d)/))) {
      var y = m[2].length === 2 ? '20' + m[2] : m[2];
      return y + '-' + ('0' + MESES[m[1]]).slice(-2);
    }
    return '';
  }
  function compLabel(c) {
    if (!c) return '—';
    var p = c.split('-'), n = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
    return n[+p[1] - 1] + '/' + p[0].slice(2);
  }
  function compAdd(c, k) {
    var p = c.split('-'), t = (+p[0]) * 12 + (+p[1] - 1) + k;
    return Math.floor(t / 12) + '-' + ('0' + (t % 12 + 1)).slice(-2);
  }

  /* ---------- Detecção de cabeçalho e de colunas ---------- */
  /* rows: array de arrays. Procura, nas 40 primeiras linhas, a que mais casa com sinônimos
     (o CSV do RPSWEB traz linhas de preâmbulo: Reg. ANS, Data da Extração, N Resultados). */
  function detectHeader(rows, kind) {
    var all = FIELDS[kind].reduce(function (a, f) { return a.concat(f.syn); }, []);
    var best = 0, bestScore = -1;
    for (var i = 0; i < Math.min(rows.length, 40); i++) {
      var score = 0;
      (rows[i] || []).forEach(function (c) { if (all.indexOf(normHeader(c)) >= 0) score++; });
      if (score > bestScore) { bestScore = score; best = i; }
    }
    return best;
  }
  function guessMapping(headers, kind) {
    var norm = headers.map(normHeader), map = {}, used = {};
    FIELDS[kind].forEach(function (f) {
      for (var s = 0; s < f.syn.length; s++) {
        for (var i = 0; i < norm.length; i++) {
          if (!used[i] && norm[i] === f.syn[s]) { map[f.id] = i; used[i] = 1; return; }
        }
      }
      map[f.id] = -1;
    });
    return map;
  }

  /* ---------- Normalização de linhas ---------- */
  function pick(row, map, id) { var i = map[id]; return i == null || i < 0 ? '' : row[i]; }
  function toRnp(rows, map, fixedComp) {
    var out = [];
    rows.forEach(function (r) {
      var cnpj = normCnpj(pick(r, map, 'cnpj'));
      var cnes = normCnes(pick(r, map, 'cnes'));
      if (!cnpj && !cnes) return;
      out.push({
        comp: map.comp >= 0 ? normComp(pick(r, map, 'comp')) : fixedComp,
        cnpj: cnpj, cnes: cnes,
        nome: normText(pick(r, map, 'nome')),
        codUnimed: digits(pick(r, map, 'codUnimed')),
        opInter: digits(pick(r, map, 'opInter')),
        codPrest: normText(pick(r, map, 'codPrest')),
        uf: normUF(pick(r, map, 'uf')),
        municipio: normText(pick(r, map, 'municipio')),
        classif: normText(pick(r, map, 'classif')),
        urg: normYN(pick(r, map, 'urg'))
      });
    });
    return out;
  }
  function toAns(rows, map) {
    var out = [];
    rows.forEach(function (r) {
      var cnpj = normCnpj(pick(r, map, 'cnpj')), cnes = normCnes(pick(r, map, 'cnes'));
      if (!cnpj && !cnes) return;
      out.push({
        cnpj: cnpj, cnes: cnes,
        nome: normText(pick(r, map, 'nome')),
        opInter: normText(pick(r, map, 'opInter')),
        uf: normUF(pick(r, map, 'uf')),
        municipio: normText(pick(r, map, 'municipio')),
        classif: normText(pick(r, map, 'classif')),
        urg: normYN(pick(r, map, 'urg')),
        dataFim: normText(pick(r, map, 'dataFim'))
      });
    });
    return out;
  }

  function isHospital(classif) {
    var s = normHeader(classif);
    return !s || s.indexOf('hosp') >= 0 || s.indexOf('assistenciahospitalar') >= 0;
  }
  /* Registro ANS da intermediária: compara só dígitos (6 dígitos do registro). */
  function sameInter(rnpReg, ansText) {
    var a = digits(rnpReg), b = digits(ansText);
    if (!a || !b) return true;
    return b.indexOf(a) >= 0 || a.indexOf(b) >= 0;
  }
  /* Mesmo CNPJ pode ter mais de um registro na ANS (um por local ou intermediária): fica o que casa pela chave composta. */
  function bestAns(list, r) {
    if (!list) return null;
    function find(fn) { for (var i = 0; i < list.length; i++) if (fn(list[i])) return list[i]; return null; }
    return find(function (a) { return a.cnes === r.cnes && sameInter(r.opInter, a.opInter); }) ||
      find(function (a) { return a.cnes === r.cnes; }) ||
      find(function (a) { return sameInter(r.opInter, a.opInter); }) || list[0];
  }
  function ansKey(a) { return a.cnpj || ('cnes:' + a.cnes); }

  /* ---------- Cruzamento ---------- */
  /* opts: { somenteHospital: bool, ate: 'AAAA-MM' (competência de corte; padrão = última), regras: ver normRegras,
     hoje: 'AAAA-MM-DD' (referência para a data fim do serviço na ANS; padrão = data atual) } */
  var ERRO_TIPO = 'indique a coluna de tipo/classificação ou desmarque “Considerar só a rede hospitalar”.';
  function cross(rnp, ans, opts) {
    opts = opts || {};
    var RG = normRegras(opts.regras || REGRAS_PADRAO), C = RG.comparar, ON = RG.ativas, EST = RG.mesesEstabilizacao, EXC = RG.cargasParaExclusao;
    var somenteHosp = opts.somenteHospital !== false, hoje = opts.hoje || new Date().toISOString().slice(0, 10);
    function semTipo(xs) { return xs.length && !xs.some(function (x) { return x.classif; }); }
    /* sem a classificação, todo prestador do RPS Total passaria por hospital */
    if (somenteHosp && semTipo(rnp)) return { erro: 'Base RNP sem tipo de prestador: ' + ERRO_TIPO };
    if (somenteHosp && semTipo(ans)) return { erro: 'Foto da ANS sem classificação: ' + ERRO_TIPO };
    /* data fim futura ainda é registro ativo; valor irreconhecível conta como encerrado */
    function ativo(a) { if (!a.dataFim) return true; var f = normData(a.dataFim); return !!f && f >= hoje; }
    var R = rnp.filter(function (r) { return r.comp && (!somenteHosp || isHospital(r.classif)); });
    var comps = Array.from(new Set(R.map(function (r) { return r.comp; }))).sort();
    if (opts.ate) comps = comps.filter(function (c) { return c <= opts.ate; });
    if (!comps.length) return { erro: 'Nenhuma competência encontrada na base RNP. Mapeie a coluna de competência ou informe o mês de cada arquivo.' };
    var latest = comps[comps.length - 1];
    var compIdx = {}; comps.forEach(function (c, i) { compIdx[c] = i; });

    var A = ans.filter(function (a) { return ativo(a) && (!somenteHosp || isHospital(a.classif)); });

    /* RNP agrupado por CNPJ (ou CNES quando não há CNPJ) */
    var g = {};
    R.forEach(function (r) {
      if (compIdx[r.comp] == null) return;
      var k = r.cnpj || ('cnes:' + r.cnes);
      var e = g[k] || (g[k] = { key: k, pres: comps.map(function () { return false; }), last: null, lastComp: '', latestRows: [] });
      e.pres[compIdx[r.comp]] = true;
      if (r.comp >= e.lastComp) { e.lastComp = r.comp; e.last = r; }
      if (r.comp === latest) e.latestRows.push(r);
    });
    var ansByCnpj = {}, ansByCnes = {};
    A.forEach(function (a) {
      if (a.cnpj) (ansByCnpj[a.cnpj] = ansByCnpj[a.cnpj] || []).push(a);
      if (a.cnes) (ansByCnes[a.cnes] = ansByCnes[a.cnes] || []).push(a);
    });

    var items = [], seenAns = {};
    function streak(pres) { var n = 0; for (var i = pres.length - 1; i >= 0 && pres[i]; i--) n++; return n; }
    function absentStreak(pres) { var n = 0; for (var i = pres.length - 1; i >= 0 && !pres[i]; i--) n++; return n; }

    Object.keys(g).forEach(function (k) {
      var e = g[k], r = e.last, inLatest = e.pres[e.pres.length - 1];
      var a = r.cnpj ? bestAns(ansByCnpj[r.cnpj], r) : null;
      if (a) seenAns[ansKey(a)] = 1;
      var it = { key: k, nome: r.nome || (a && a.nome) || '(sem nome)', cnpj: r.cnpj, cnes: r.cnes, uf: r.uf || (a && a.uf), municipio: r.municipio || (a && a.municipio),
        pres: e.pres, rnp: r, ans: a, diffs: [], situacao: 'ok', motivo: '', tipo: '' };

      if (inLatest) {
        /* duplicidade no mês: mesmo CNPJ com CNES ou intermediária diferentes */
        var dist = {}; e.latestRows.forEach(function (x) { dist[x.cnes + '|' + x.opInter] = 1; });
        var dup = ON.duplicidade && Object.keys(dist).length > 1;
        if (a) {
          if (C.cnes && r.cnes && a.cnes && r.cnes !== a.cnes) it.diffs.push({ campo: 'CNES', rnp: r.cnes, ans: a.cnes, tipo: 'CNES divergente' });
          if (C.opInter && !sameInter(r.opInter, a.opInter)) it.diffs.push({ campo: 'Operadora intermediária', rnp: r.opInter, ans: a.opInter, tipo: 'Operadora intermediária' });
          if (C.urg && r.urg && a.urg && r.urg !== a.urg) it.diffs.push({ campo: 'Urgência/emergência', rnp: r.urg, ans: a.urg, tipo: 'Urgência/emergência' });
          if (C.uf && r.uf && a.uf && r.uf !== a.uf) it.diffs.push({ campo: 'UF', rnp: r.uf, ans: a.uf, tipo: 'Endereço' });
          if (dup) { it.situacao = 'investigar'; it.tipo = 'Duplicidade no RNP'; it.motivo = 'O mesmo CNPJ aparece ' + e.latestRows.length + ' vezes no mês com CNES ou intermediária diferentes.'; }
          else if (it.diffs.length) { it.situacao = 'alterar'; it.tipo = it.diffs[0].tipo; it.motivo = it.diffs.map(function (d) { return d.campo; }).join(', ') + ' diferente entre RNP e ANS.'; }
          else { it.situacao = 'ok'; it.motivo = 'ANS igual ao RNP na chave composta.'; }
        } else {
          var byCnes = ON.trocaCnpj && r.cnes && ansByCnes[r.cnes] ? ansByCnes[r.cnes][0] : null;
          var s = streak(e.pres);
          if (byCnes) {
            seenAns[ansKey(byCnes)] = 1; it.ans = byCnes; it.situacao = 'alterar'; it.tipo = 'CNPJ divergente';
            it.diffs.push({ campo: 'CNPJ', rnp: r.cnpj, ans: byCnes.cnpj, tipo: 'CNPJ divergente' });
            it.motivo = 'Mesmo CNES na ANS com outro CNPJ: provável troca de CNPJ do local de atendimento.';
          } else if (s >= EST) {
            it.situacao = 'incluir'; it.tipo = 'Ausente na ANS';
            it.motivo = 'Divulgado há ' + s + ' meses seguidos no RNP e ausente na ANS.';
          } else {
            it.situacao = 'aguardar'; it.tipo = 'Ausente na ANS';
            it.motivo = 'Divulgado há ' + s + ' de ' + EST + ' meses exigidos para estabilizar.';
          }
          if (dup && it.situacao !== 'alterar') { it.situacao = 'investigar'; it.tipo = 'Duplicidade no RNP'; it.motivo = 'O mesmo CNPJ aparece com CNES ou intermediária diferentes no mês.'; }
        }
      } else {
        if (!a) return; /* saiu do RNP e nunca esteve na ANS: nada a fazer */
        var ab = absentStreak(e.pres);
        it.uf = it.uf || a.uf;
        if (ab >= EXC) { it.situacao = 'excluir'; it.tipo = 'Saiu do RNP'; it.motivo = 'Ausente do RNP há ' + ab + ' cargas (última divulgação: ' + compLabel(e.lastComp) + ') e ativo na ANS.'; }
        else { it.situacao = 'observar'; it.tipo = 'Saiu do RNP'; it.motivo = 'Ausente há ' + ab + ' carga' + (ab > 1 ? 's' : '') + ' (exclusão a partir de ' + EXC + '). Pode ser flutuação do PTU A400.'; }
      }
      items.push(it);
    });

    /* Na ANS e nunca divulgado na janela: passivo de higienização */
    if (ON.passivo) A.forEach(function (a) {
      var ak = ansKey(a);
      if (seenAns[ak]) return;
      seenAns[ak] = 1;
      items.push({ key: 'ans:' + ak, nome: a.nome || '(sem nome)', cnpj: a.cnpj, cnes: a.cnes, uf: a.uf, municipio: a.municipio,
        pres: comps.map(function () { return false; }), rnp: null, ans: a, diffs: [], situacao: 'passivo', tipo: 'Sem divulgação',
        motivo: 'Ativo na ANS e sem nenhuma divulgação no RNP em ' + comps.length + ' meses.' });
    });

    items.sort(function (x, y) { return SITUACOES[x.situacao].ordem - SITUACOES[y.situacao].ordem || x.nome.localeCompare(y.nome); });

    var cont = {}; Object.keys(SITUACOES).forEach(function (s) { cont[s] = 0; });
    var tipos = {};
    items.forEach(function (i) { cont[i.situacao]++; if (i.situacao !== 'ok') tipos[i.tipo] = (tipos[i.tipo] || 0) + 1; });
    var naAns = A.length;
    var conformes = cont.ok;
    return {
      regras: RG, comps: comps, latest: latest, items: items, cont: cont, tipos: tipos,
      totais: { rnpHospitais: Object.keys(g).filter(function (k) { return g[k].pres[g[k].pres.length - 1]; }).length, ansAtivos: naAns,
        aderencia: naAns ? conformes / naAns : 0, pendencias: items.length - conformes }
    };
  }

  root.Motor = {
    FIELDS: FIELDS, SITUACOES: SITUACOES, CHECKLIST: CHECKLIST,
    REGRAS_PADRAO: REGRAS_PADRAO, normRegras: normRegras,
    normHeader: normHeader, normComp: normComp, normData: normData, normCnpj: normCnpj, compLabel: compLabel, compAdd: compAdd,
    detectHeader: detectHeader, guessMapping: guessMapping, toRnp: toRnp, toAns: toAns,
    cross: cross, sameInter: sameInter
  };
})(typeof window !== 'undefined' ? window : globalThis);
