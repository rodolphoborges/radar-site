/* ==========================================================================
   demo.js — Base sintética para demonstração (NÃO são dados reais)
   Gera planilhas no mesmo formato das reais (Base RPSTOTAL e CSV RPSWEB)
   para que a demonstração passe pelo mesmo caminho de importação.
   Volumes calibrados com a documentação: ~2.502 hospitais ativos na ANS,
   ~95 hospitais sem divulgação (passivo), 9 competências (dez/25 a ago/26).
   Todos os nomes, CNPJs e CNES são fictícios.
   ========================================================================== */
(function (root) {
  'use strict';

  function rng(seed) {
    return function () {
      seed |= 0; seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  var CIDADES = [['São Paulo', 'SP'], ['Campinas', 'SP'], ['Ribeirão Preto', 'SP'], ['Santos', 'SP'], ['Sorocaba', 'SP'], ['Belo Horizonte', 'MG'], ['Uberlândia', 'MG'], ['Juiz de Fora', 'MG'], ['Rio de Janeiro', 'RJ'], ['Niterói', 'RJ'], ['Salvador', 'BA'], ['Feira de Santana', 'BA'], ['Curitiba', 'PR'], ['Londrina', 'PR'], ['Porto Alegre', 'RS'], ['Caxias do Sul', 'RS'], ['Recife', 'PE'], ['Goiânia', 'GO'], ['Florianópolis', 'SC'], ['Joinville', 'SC'], ['Fortaleza', 'CE'], ['Crateús', 'CE'], ['Maceió', 'AL'], ['Natal', 'RN'], ['Belém', 'PA'], ['Manaus', 'AM'], ['Campo Grande', 'MS'], ['Dourados', 'MS'], ['Cuiabá', 'MT'], ['Vitória', 'ES'], ['São Luís', 'MA'], ['Teresina', 'PI'], ['João Pessoa', 'PB'], ['Aracaju', 'SE'], ['Palmas', 'TO'], ['Brasília', 'DF']];
  var NOMES = ['São Lucas', 'Santa Clara', 'Bom Jesus', 'São José', 'Santa Rita', 'Nossa Senhora das Graças', 'Vale Verde', 'Alto da Serra', 'Porto Azul', 'Madre Paulina', 'Rio Branco', 'Central', 'Novo Horizonte', 'São Cristóvão', 'Santa Helena', 'Sagrado Coração', 'Monte Sinai', 'Primavera', 'Bela Vista', 'Santo Antônio', 'Imaculada Conceição', 'Boa Esperança', 'São Bento', 'Regional', 'Da Criança', 'Do Trabalhador', 'Santa Marta', 'São Rafael', 'Aliança', 'Jardim América'];
  var PREF = ['Hospital', 'Hospital', 'Hospital', 'Santa Casa de Misericórdia', 'Hospital e Maternidade', 'Hospital Geral', 'Instituto Hospitalar'];

  function build() {
    var R = rng(20260827);
    function pickA(a) { return a[Math.floor(R() * a.length)]; }
    function num(n) { var s = ''; for (var i = 0; i < n; i++) s += Math.floor(R() * 10); return s; }

    var unimeds = [];
    for (var u = 0; u < 48; u++) unimeds.push({ cod: ('000' + (10 + u * 7)).slice(-3), reg: '3' + num(5), nome: 'UNIMED ' + CIDADES[u % CIDADES.length][0].toUpperCase() });

    var comps = ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'];
    var usedNames = {};
    function hosp() {
      var c = pickA(CIDADES), nm, tries = 0;
      do { nm = pickA(PREF) + ' ' + pickA(NOMES) + (R() < .5 ? ' de ' + c[0] : ''); tries++; } while (usedNames[nm] && tries < 6);
      if (usedNames[nm]) nm += ' ' + (Object.keys(usedNames).length % 97);
      usedNames[nm] = 1;
      var un = pickA(unimeds);
      return { nome: nm, cnpj: num(8) + '0001' + num(2), cnes: num(7), uf: c[1], mun: c[0], un: un, urg: R() < .7 ? 'S' : 'N', pres: comps.map(function () { return true; }) };
    }

    var H = [], i;
    var core = []; for (i = 0; i < 2395; i++) core.push(hosp());
    /* flutuação comum: alguns somem um mês no meio e voltam (não deve virar pendência) */
    for (i = 0; i < 60; i++) core[Math.floor(R() * core.length)].pres[2 + Math.floor(R() * 5)] = false;
    var k = 0;
    function take(n, fn) { for (var j = 0; j < n; j++) fn(core[k++]); }
    take(19, function (h) { h.ansInter = pickA(unimeds.filter(function (x) { return x !== h.un; })); });
    take(11, function (h) { h.ansCnes = num(7); });
    take(5, function (h) { h.ansUrg = h.urg === 'S' ? 'N' : 'S'; });
    take(3, function (h) { h.dup = true; });
    H = H.concat(core);

    /* troca de CNPJ: RNP com CNPJ novo, ANS com o antigo e mesmo CNES */
    for (i = 0; i < 2; i++) { var t = hosp(); t.ansCnpj = num(8) + '0001' + num(2); H.push(t); }
    /* novos no RNP, ausentes na ANS */
    [9, 6, 4, 3, 3, 5, 7].forEach(function (m) { var h = hosp(); h.noAns = true; h.pres = comps.map(function (c, j) { return j >= comps.length - m; }); H.push(h); });
    [1, 2, 1, 2, 1, 2].forEach(function (m) { var h = hosp(); h.noAns = true; h.pres = comps.map(function (c, j) { return j >= comps.length - m; }); H.push(h); });
    /* saíram do RNP e seguem ativos na ANS */
    [2, 3, 4, 2, 5, 3].forEach(function (m) { var h = hosp(); h.pres = comps.map(function (c, j) { return j < comps.length - m; }); H.push(h); });
    [1, 1, 1, 1].forEach(function () { var h = hosp(); h.pres = comps.map(function (c, j) { return j < comps.length - 1; }); H.push(h); });
    /* já encerrados na ANS (data fim preenchida): devem ser ignorados */
    for (i = 0; i < 3; i++) { var x = hosp(); x.pres = comps.map(function (c, j) { return j < 3; }); x.fim = '30/0' + (4 + i) + '/2026'; H.push(x); }
    /* passivo: na ANS, nunca divulgado na janela */
    for (i = 0; i < 95; i++) { var p = hosp(); p.pres = comps.map(function () { return false; }); H.push(p); }

    /* ---- Base RPSTOTAL (mesmas colunas da planilha consolidada) ---- */
    var rnpHead = ['Versão', 'Código Unimed', 'Nome Unimed', 'Registro ANS', 'CNPJ/CPF', 'CNES', 'Código Prestador', 'Nome Prestador', 'Município', 'UF', 'Tipo Prestador', 'Urgência Emergência'];
    var rnp = [rnpHead];
    H.forEach(function (h, n) {
      h.pres.forEach(function (on, j) {
        if (!on) return;
        var v = comps[j].slice(5) + '/' + comps[j].slice(0, 4);
        rnp.push([v, h.un.cod, h.un.nome, h.un.reg, h.cnpj, h.cnes, String(100000 + n), h.nome.toUpperCase(), h.mun, h.uf, 'HOSPITAL', h.urg]);
        if (h.dup && j === h.pres.length - 1) rnp.push([v, h.un.cod, h.un.nome, h.un.reg, h.cnpj, num(7), String(900000 + n), h.nome.toUpperCase(), h.mun, h.uf, 'HOSPITAL', h.urg]);
      });
    });

    /* ---- CSV RPSWEB (com preâmbulo, como o arquivo real) ---- */
    var ansHead = ['Razão Social', 'CNES', 'Classificação', 'CNPJ/CPF', 'UF', 'Município', 'Relação com a Operadora', 'Contratualização', 'Operadora Intermediária', 'Data de Contratualização', 'Disponibilidade de Serviços', 'Urgência/Emergência', 'Data Início do Serviço', 'Data Fim do Serviço'];
    var ans = [['Reg. Ans: 000000-0 (demonstração)'], ['Razão Social: OPERADORA DE DEMONSTRAÇÃO'], ['Data da Extração: 12/08/2026'], [], ansHead];
    H.forEach(function (h) {
      if (h.noAns) return;
      var inter = h.ansInter || h.un;
      ans.push([h.nome.toUpperCase(), h.ansCnes || h.cnes, 'ASSISTÊNCIA HOSPITALAR', h.ansCnpj || h.cnpj, h.uf, h.mun, 'Indireta', 'Contratualizado', inter.nome + ' (' + inter.reg + ')', '01/03/2019', 'Total', h.ansUrg || h.urg, '01/03/2019', h.fim || '']);
    });
    return { rnp: rnp, ans: ans };
  }

  root.DemoData = { build: build };
})(typeof window !== 'undefined' ? window : globalThis);
