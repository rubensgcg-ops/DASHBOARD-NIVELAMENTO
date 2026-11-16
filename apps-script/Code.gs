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
 * apenas as colunas do dashboard (Avaliado, Nome, Nível, Papel).
 */

// Nomes exatos das abas usadas pelo seletor do dashboard
const SHEET_NAMES = ['Terça', 'Quinta'];

// Script VINCULADO à planilha: deixe vazio (usa a planilha onde o script mora).
// Script INDEPENDENTE (script.google.com): cole aqui o ID da planilha.
const SPREADSHEET_ID = '';

// Opcional: se preencher, o site precisa enviar ?token=... (use o mesmo valor em DATA_TOKEN)
const TOKEN = '';

// Segundos de cache para não ler a planilha a cada requisição
const CACHE_SECONDS = 10;

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
    if (cached) return respond_(JSON.parse(cached), callback);
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

  return respond_(payload, callback);
}

/**
 * Lê as colunas A..D (Avaliado, Nome, Nível, Papel) e devolve
 * somente quem ainda não foi avaliado — ou seja, a fila da aula.
 */
function readSheet_(sheetName) {
  var ss = SPREADSHEET_ID
    ? SpreadsheetApp.openById(SPREADSHEET_ID)
    : SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(sheetName);
  if (!sh) return { error: 'sheet_not_found', sheet: sheetName };

  var lastRow = sh.getLastRow();
  var rows = [];

  if (lastRow >= 2) {
    var values = sh.getRange(2, 1, lastRow - 1, 4).getValues();

    values.forEach(function (r) {
      var nome = String(r[1] || '').trim();
      if (!nome) return;
      if (isTrue_(r[0])) return;

      rows.push({
        nome: nome,
        nivel: String(r[2] || '').trim(),
        papel: String(r[3] || '').trim()
      });
    });
  }

  return { sheet: sheetName, updated: new Date().toISOString(), rows: rows };
}

function isTrue_(value) {
  return value === true || String(value).toLowerCase() === 'true';
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