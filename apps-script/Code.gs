/**
 * DASHBOARD-NIVELAMENTO — endpoint de dados
 *
 * Cole este arquivo em: planilha -> Extensões -> Apps Script.
 * Depois: Implantar -> Nova implantação -> Tipo "App da Web"
 *   - Executar como: Eu
 *   - Quem tem acesso: Qualquer pessoa
 * Copie a URL que termina em /exec e cole em DATA_ENDPOINT no index.html.
 *
 * A planilha continua privada: o script roda com a sua conta e devolve
 * apenas os dados da fila (nome, nível, papel e turma).
 *
 * O script encontra o cabeçalho e as colunas pelo texto do cabeçalho,
 * então a ordem das colunas pode mudar (Nome, Nível, Papel, Turma, Avaliado...).
 * Se não houver cabeçalho, assume o layout antigo: A=Avaliado, B=Nome,
 * C=Nível, D=Papel, E=Turma, com dados a partir da linha 2.
 */

// Abas usadas pelo seletor do dashboard (a aba "Dados Alunos Nivelamento" é ignorada)
const SHEET_NAMES = ['Terça', 'Quinta'];

// Script VINCULADO à planilha: deixe vazio (usa a planilha onde o script mora).
// Script INDEPENDENTE (script.google.com): cole aqui o ID da planilha.
const SPREADSHEET_ID = '';

// Opcional: se preencher, o site precisa enviar ?token=... (use o mesmo valor em DATA_TOKEN)
const TOKEN = '';

// Segundos de cache para não ler a planilha a cada requisição.
// Valores baixos = atualização mais rápida no telão; 0 desliga o cache.
// Com 7s aqui e o site consultando a cada 3s, a defasagem fica em ~4-11s.
const CACHE_SECONDS = 7;

// Quantas linhas no topo são inspecionadas para achar o cabeçalho
const HEADER_SEARCH_ROWS = 10;

// Layout usado quando não há cabeçalho reconhecível
const LEGACY_COLUMNS = { avaliado: 0, nome: 1, nivel: 2, papel: 3, turma: 4 };

function doGet(e) {
  var p = (e && e.parameter) || {};
  var callback = sanitizeCallback_(p.callback);

  if (TOKEN && p.token !== TOKEN) {
    return respond_({ error: 'unauthorized' }, callback);
  }

  var sheetName = (p.sheet && SHEET_NAMES.indexOf(p.sheet) !== -1) ? p.sheet : SHEET_NAMES[0];

  var cache = null;
  var cacheKey = 'rows:' + sheetName;
  try {
    cache = CacheService.getScriptCache();
    var cached = cache.get(cacheKey);
    if (cached) {
      var cachedPayload = JSON.parse(cached);
      if (isDebug_(p)) cachedPayload.debug = debugInfo_(cachedPayload.sheet);
      return respond_(cachedPayload, callback);
    }
  } catch (err) {
    cache = null;
  }

  var payload = readSheet_(sheetName);

  if (!payload.error && cache) {
    try {
      cache.put(cacheKey, JSON.stringify(payload), CACHE_SECONDS);
    } catch (err) {
      // cache é só otimização, ignora falha
    }
  }

  if (isDebug_(p)) payload.debug = debugInfo_(payload.sheet);

  return respond_(payload, callback);
}

/**
 * Devolve a fila: quem tem nome preenchido e ainda não foi marcado como avaliado.
 */
function readSheet_(sheetName) {
  var ss = spreadsheet_();
  if (!ss) return { error: 'spreadsheet_not_found' };

  var sh = findSheet_(ss, sheetName);
  if (!sh) return { error: 'sheet_not_found', sheet: sheetName, sheets: sheetNames_(ss) };

  var values = sh.getDataRange().getValues();
  if (!values.length) return { sheet: sh.getName(), updated: new Date().toISOString(), rows: [] };

  var headerIndex = findHeaderRow_(values);
  var cols = headerIndex >= 0 ? mapColumns_(values[headerIndex]) : LEGACY_COLUMNS;
  var startRow = headerIndex >= 0 ? headerIndex + 1 : 1;

  var rows = [];

  for (var i = startRow; i < values.length; i++) {
    var line = values[i];
    var nome = text_(line[cols.nome]);
    if (!nome) continue;
    if (isChecked_(line[cols.avaliado])) continue;

    rows.push({
      nome: nome,
      nivel: text_(line[cols.nivel]),
      papel: text_(line[cols.papel]),
      turma: cols.turma >= 0 ? text_(line[cols.turma]) : ''
    });
  }

  return {
    sheet: sh.getName(),
    updated: new Date().toISOString(),
    header: headerIndex >= 0 ? headerIndex + 1 : 1,
    columns: cols,
    rows: rows
  };
}

function spreadsheet_() {
  try {
    return SPREADSHEET_ID
      ? SpreadsheetApp.openById(SPREADSHEET_ID)
      : SpreadsheetApp.getActiveSpreadsheet();
  } catch (err) {
    return null;
  }
}

// Aceita "Terça", "terca", "TERÇA", " Terça "...
function findSheet_(ss, sheetName) {
  var exact = ss.getSheetByName(sheetName);
  if (exact) return exact;

  var target = normalize_(sheetName);
  var sheets = ss.getSheets();

  for (var i = 0; i < sheets.length; i++) {
    if (normalize_(sheets[i].getName()) === target) return sheets[i];
  }

  return null;
}

function sheetNames_(ss) {
  return ss.getSheets().map(function (s) { return s.getName(); });
}

function findHeaderRow_(values) {
  var limit = Math.min(values.length, HEADER_SEARCH_ROWS);

  for (var i = 0; i < limit; i++) {
    var line = values[i] || [];
    for (var j = 0; j < line.length; j++) {
      if (normalize_(line[j]).indexOf('nome') !== -1) return i;
    }
  }

  return -1;
}

function mapColumns_(headerRow) {
  var cols = { avaliado: -1, nome: -1, nivel: -1, papel: -1, turma: -1 };

  headerRow.forEach(function (cell, index) {
    var h = normalize_(cell);
    if (!h) return;

    if (cols.nome < 0 && h.indexOf('nome') !== -1) {
      cols.nome = index;
    } else if (cols.nivel < 0 && (h.indexOf('nivel') !== -1 || h.indexOf('level') !== -1)) {
      cols.nivel = index;
    } else if (cols.papel < 0 && (h.indexOf('papel') !== -1 || h.indexOf('funcao') !== -1)) {
      cols.papel = index;
    } else if (cols.turma < 0 && (h.indexOf('turma') !== -1 || h.indexOf('classe') !== -1)) {
      cols.turma = index;
    } else if (cols.turma < 0 && h.indexOf('horario') !== -1) {
      // Aba com o horário como identificação da turma (ex.: "Terça 18:00")
      cols.turma = index;
    } else if (cols.avaliado < 0 && (
      h.indexOf('avalia') !== -1 ||
      h.indexOf('danc') !== -1 ||
      h.indexOf('feito') !== -1 ||
      h.indexOf('presenc') !== -1 ||
      h.indexOf('check') !== -1 ||
      h === 'ok'
    )) {
      cols.avaliado = index;
    }
  });

  if (cols.nome < 0) cols.nome = LEGACY_COLUMNS.nome;
  if (cols.nivel < 0) cols.nivel = LEGACY_COLUMNS.nivel;
  if (cols.papel < 0) cols.papel = LEGACY_COLUMNS.papel;
  if (cols.turma < 0) cols.turma = LEGACY_COLUMNS.turma;
  if (cols.avaliado < 0) cols.avaliado = LEGACY_COLUMNS.avaliado;

  return cols;
}

function text_(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function isChecked_(value) {
  if (value === true || value === 1) return true;
  var v = normalize_(value);
  return v === 'true' || v === 'sim' || v === 'x' || v === 'ok' || v === 'feito' || v === '1';
}

function normalize_(value) {
  return text_(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function isDebug_(params) {
  return params && (params.debug === '1' || params.debug === 'true');
}

// Só para conferir o que o script está lendo: ?debug=1
function debugInfo_(sheetName) {
  var ss = spreadsheet_();
  if (!ss) return { error: 'spreadsheet_not_found' };

  var sh = findSheet_(ss, sheetName);
  if (!sh) return { error: 'sheet_not_found', sheets: sheetNames_(ss) };

  var values = sh.getDataRange().getValues();
  var preview = values.slice(0, 3).map(function (line) {
    return line.map(text_);
  });

  return {
    sheet: sh.getName(),
    rowsTotal: values.length,
    preview: preview
  };
}

function sanitizeCallback_(callback) {
  if (!callback) return null;
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(callback) ? callback : null;
}

function respond_(obj, callback) {
  var json = JSON.stringify(obj);

  if (callback) {
    return ContentService
      .createTextOutput(callback + '(' + json + ');')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService
    .createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}