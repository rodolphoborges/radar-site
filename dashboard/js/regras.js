/* ==========================================================================
   regras.js — Regras oficiais do Radar de Integridade ANS
   --------------------------------------------------------------------------
   Este é o único arquivo a editar quando uma regra mudar. Mude o valor,
   atualize a "versao" com a data e registre o motivo em "historico".
   Também dá para ajustar na aba Regras do próprio dashboard e usar
   "Exportar regras.js" para gerar este arquivo já preenchido.
   ========================================================================== */
window.RADAR_REGRAS = {
  versao: '2026-10-06',

  /* Divulgações seguidas no RNP antes de um hospital novo virar candidato a inclusão.
     Fonte: reunião de 14/08 e ata de 27/08. */
  mesesEstabilizacao: 3,

  /* Cargas seguidas ausente do RNP para virar candidato a exclusão.
     Proposta ainda a validar com a analista (issue #28). Abaixo disso: "observar". */
  cargasParaExclusao: 2,

  /* Campos comparados entre RNP e ANS. CNPJ é sempre comparado (é a chave). */
  comparar: {
    cnes: true,      // CNES
    opInter: true,   // Operadora intermediária
    urg: true,       // Urgência/emergência
    uf: true         // UF
  },

  /* Regras que podem ser ligadas ou desligadas. */
  ativas: {
    trocaCnpj: true,    // mesmo CNES na ANS com outro CNPJ vira "Alterar cadastro"
    duplicidade: true,  // mesmo CNPJ com CNES ou intermediária diferentes no mês vira "Investigar"
    passivo: true       // ativo na ANS e nunca divulgado no RNP vira "Sem divulgação no RNP"
  },

  /* Ação sugerida mostrada em cada caso. */
  acoes: {
    alterar: 'RPA (XML via PTA) ou ofício à Unimed de origem',
    investigar: 'Conferir no RNP e no CNES antes de qualquer movimento',
    excluir: 'Exclusão na plataforma ANS (RN 585) após ler a documentação',
    incluir: 'RPI (XML via PTA), se o produto tiver vidas no SIB',
    observar: 'Aguardar a próxima carga: pode ser flutuação do PTU A400',
    aguardar: 'Aguardar as divulgações seguidas exigidas antes de incluir',
    passivo: 'Passivo de higienização: avaliar exclusão sem taxa',
    ok: 'Nada a fazer'
  },

  /* Itens do "Antes de decidir" em cada situação, na ordem em que aparecem. */
  checklist: {
    incluir: [
      'CNES ativo e classificado como hospital (com leitos)',
      '3 divulgações seguidas confirmadas no RNP',
      'Produto de destino com vidas no SIB (evita taxa ~R$ 1.400/produto)',
      'Conferido de novo no RNP no dia da transmissão'
    ],
    excluir: [
      'Documentação ou ofício da Unimed de origem lido',
      'Relatório de exclusão hospitalar da Unimed do Brasil confirma',
      'Avaliada substituição exigida pela RN 585',
      'Conferido de novo no RNP no dia da exclusão'
    ],
    alterar: [
      'Divergência confirmada na fonte oficial (CNES / Receita)',
      'Definido quem corrige: ANS (RPA) ou Unimed de origem',
      'Conferido de novo no RNP no dia da transmissão'
    ],
    investigar: [
      'Histórico de divulgação conferido no RNP',
      'CNES e CNPJ conferidos no DATASUS',
      'Situação final definida'
    ],
    observar: ['Conferir na próxima carga do RPS Total'],
    aguardar: ['Conferir na próxima carga do RPS Total'],
    passivo: [
      'Verificar utilização do hospital nos produtos',
      'Avaliar mudança de natureza (exclusão sem taxa)'
    ]
  },

  historico: [
    { data: '2026-10-06', mudanca: 'Primeira versão, extraída da documentação do projeto.' }
  ]
};
