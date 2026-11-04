/* ==========================================================================
   io.js — Leitura de arquivos no navegador (nada sai da máquina)
   CSV (UTF-8 ou Windows-1252, separador ; , ou tab) e XLSX via SheetJS,
   carregado sob demanda só quando um .xlsx é aberto.
   ========================================================================== */
(function (root) {
  'use strict';

  var SHEETJS = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
  var sheetjsPromise = null;
  function loadSheetJS() {
    if (root.XLSX) return Promise.resolve(root.XLSX);
    if (!sheetjsPromise) {
      sheetjsPromise = new Promise(function (ok, fail) {
        var s = document.createElement('script');
        s.src = SHEETJS;
        s.onload = function () { ok(root.XLSX); };
        s.onerror = function () { sheetjsPromise = null; fail(new Error('Não foi possível carregar o leitor de Excel (sem internet?). Salve a aba como CSV e tente de novo.')); };
        document.head.appendChild(s);
      });
    }
    return sheetjsPromise;
  }

  function decode(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('windows-1252').decode(buf); }
  }

  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    var sample = text.slice(0, 5000).split(/\r?\n/).slice(0, 15).join('\n');
    var seps = [';', ',', '\t'], sep = ';', best = -1;
    seps.forEach(function (s) { var n = sample.split(s).length; if (n > best) { best = n; sep = s; } });
    var rows = [], row = [], cell = '', q = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; }
        else cell += c;
      } else if (c === '"') q = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
      else if (c !== '\r') cell += c;
    }
    if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
    return rows;
  }

  /* Devolve { name, sheets: { nomeDaAba: linhas[][] } } */
  function readFile(file) {
    return file.arrayBuffer().then(function (buf) {
      if (/\.xlsx?$|\.xlsm$/i.test(file.name)) {
        return loadSheetJS().then(function (X) {
          var wb = X.read(buf, { type: 'array', dense: true, cellDates: false });
          var sheets = {};
          wb.SheetNames.forEach(function (n) { sheets[n] = X.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: '' }); });
          return { name: file.name, sheets: sheets };
        });
      }
      return { name: file.name, sheets: { 'CSV': parseCSV(decode(buf)) } };
    });
  }

  function toCSV(rows) {
    return '﻿' + rows.map(function (r) {
      return r.map(function (v) { v = v == null ? '' : String(v); return /[";\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }).join(';');
    }).join('\r\n');
  }
  function download(name, text) {
    try {
      var url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
      var a = document.createElement('a'); a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      return true;
    } catch (e) { return false; }
  }

  root.IO = { readFile: readFile, parseCSV: parseCSV, toCSV: toCSV, download: download };
})(window);
