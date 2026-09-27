// ══════════════════════════════════════════════════════════════
//  Registro de Ponto — Google Apps Script
//  Deploy como: "Webapp" → Executar como: você → Acesso: Qualquer pessoa
//
//  Modelo: uma linha por BATIDA (não por sessão). Cada punch é
//  "entrada" ou "saida" com um horário. O app deriva tudo o mais
//  (sessões, totais, projeções) a partir dessa sequência.
// ══════════════════════════════════════════════════════════════

const CONFIG = {
  SHEET_NAME: 'Registros',        // Nome da aba na planilha
  LEGACY_SHEET_NAME: 'Config',    // Aba com o saldo de banco de horas de antes do app
  TIMEZONE:   'America/Sao_Paulo', // Fuso horário de exibição (GMT-3)
  DEFAULT_DAYS: 400,              // Janela padrão (em dias) retornada pelo GET — cobre relatórios de meses passados
  RECENT_ROWS: 20,                // Linhas lidas no modo rápido (?mode=recent) — cobre alguns dias de batidas
};

const HEADER = ['Timestamp', 'Data', 'Tipo', 'Horário', 'ID', 'Origem'];
const TS_COL = 1, DATA_COL = 2, TIPO_COL = 3, HORARIO_COL = 4, ID_COL = 5, ORIGEM_COL = 6;

// ── GET: retorna o histórico como JSON ──────────────────────────
// ?mode=recent → só as últimas CONFIG.RECENT_ROWS linhas, lidas com getRange
//                (não getDataRange): custo fixo, não escala com o tamanho da
//                planilha. Usado antes de bater o ponto, quando só interessa
//                saber a última batida e o que já foi feito hoje.
// ?days=45     → (padrão) histórico completo, limitado aos últimos N dias
//                (padrão CONFIG.DEFAULT_DAYS) — usado pelas telas de
//                relatório/calendário/banco de horas, que precisam do
//                histórico inteiro carregado.
function doGet(e) {
  try {
    const sheet = getSheet();
    const mode  = (e && e.parameter && e.parameter.mode) || 'full';
    const rows  = mode === 'recent' ? readRecentRows(sheet) : readAllRows(sheet, e);

    return jsonResponse({ ok: true, records: rows, legacyBalanceMs: getLegacyBalanceHours() * 3600000 });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function readRecentRows(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  const startRow = Math.max(2, lastRow - CONFIG.RECENT_ROWS + 1);
  const data = sheet.getRange(startRow, 1, lastRow - startRow + 1, HEADER.length).getValues();
  return data.map(rowToRecord).filter(Boolean);
}

function readAllRows(sheet, e) {
  const data   = sheet.getDataRange().getValues();
  const days   = parseInt((e && e.parameter && e.parameter.days) || CONFIG.DEFAULT_DAYS, 10);
  const cutoff = isoDate(new Date(Date.now() - days * 86400000));

  const rows = [];
  for (let i = 1; i < data.length; i++) {
    const record = rowToRecord(data[i]);
    if (!record) continue;
    if (record.competencia < cutoff) continue;
    rows.push(record);
  }
  return rows;
}

function rowToRecord(row) {
  const id = row[ID_COL - 1];
  if (!id) return null; // linha vazia
  return {
    timestamp:   row[TS_COL - 1],
    competencia: formatDate(row[DATA_COL - 1]),
    tipo:        String(row[TIPO_COL - 1] || '').toLowerCase(),
    horario:     toIso(row[HORARIO_COL - 1]),
    id:          String(id),
    origem:      String(row[ORIGEM_COL - 1] || 'ponto'),
  };
}

// ── POST: registra, edita ou apaga uma batida ────────────────────
// body.action: 'punch' (padrão) | 'update' | 'delete' | 'setLegacy'
//  - 'punch'  → { id, tipo, horario, competencia, origem? } cria uma linha nova
//               (idempotente por 'id' — reenviar não duplica; usado tanto pelo
//               fluxo normal de Registrar Ponto quanto para lançar uma batida
//               manual/esquecida com horário retroativo)
//  - 'update' → { id, tipo, horario, competencia } corrige uma linha existente
//  - 'delete' → { id } remove a linha
//  - 'setLegacy' → { horas } define o saldo de banco de horas de antes do app
//                   (positivo = crédito, negativo = débito)
function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action || 'punch';

    if (action === 'update')    return handleUpdate(body);
    if (action === 'delete')    return handleDelete(body);
    if (action === 'setLegacy') return handleSetLegacy(body);
    return handlePunch(body);
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

function handlePunch(body) {
  const id          = String(body.id || '');
  const tipo        = String(body.tipo || '').toLowerCase();
  const horario     = body.horario;
  const competencia = body.competencia;
  const origem      = String(body.origem || 'ponto');

  if (!id || !horario || !competencia) {
    return jsonResponse({ ok: false, error: 'Campos obrigatórios: id, horario, competencia' });
  }
  if (tipo !== 'entrada' && tipo !== 'saida') {
    return jsonResponse({ ok: false, error: 'tipo inválido (use "entrada" ou "saida")' });
  }

  const sheet = getSheet();
  if (findRowById(sheet, id) > 0) {
    return jsonResponse({ ok: true, id: id, duplicate: true });
  }

  sheet.appendRow([
    new Date(),
    new Date(competencia + 'T12:00:00'),
    tipo,
    new Date(horario),
    id,
    origem,
  ]);

  return jsonResponse({ ok: true, id: id });
}

function handleUpdate(body) {
  const id          = String(body.id || '');
  const tipo        = String(body.tipo || '').toLowerCase();
  const horario     = body.horario;
  const competencia = body.competencia;

  if (!id || !horario || !competencia) {
    return jsonResponse({ ok: false, error: 'Campos obrigatórios: id, horario, competencia' });
  }
  if (tipo !== 'entrada' && tipo !== 'saida') {
    return jsonResponse({ ok: false, error: 'tipo inválido (use "entrada" ou "saida")' });
  }

  const sheet  = getSheet();
  const rowIdx = findRowById(sheet, id);
  if (rowIdx < 0) {
    return jsonResponse({ ok: false, error: 'registro não encontrado' });
  }

  sheet.getRange(rowIdx, TS_COL,      1, 1).setValue(new Date());
  sheet.getRange(rowIdx, DATA_COL,    1, 1).setValue(new Date(competencia + 'T12:00:00'));
  sheet.getRange(rowIdx, TIPO_COL,    1, 1).setValue(tipo);
  sheet.getRange(rowIdx, HORARIO_COL, 1, 1).setValue(new Date(horario));
  sheet.getRange(rowIdx, ORIGEM_COL,  1, 1).setValue('editado');

  return jsonResponse({ ok: true, id: id });
}

function handleDelete(body) {
  const id = String(body.id || '');
  if (!id) {
    return jsonResponse({ ok: false, error: 'Campo obrigatório: id' });
  }

  const sheet  = getSheet();
  const rowIdx = findRowById(sheet, id);
  if (rowIdx < 0) {
    return jsonResponse({ ok: true, id: id, alreadyDeleted: true });
  }

  sheet.deleteRow(rowIdx);
  return jsonResponse({ ok: true, id: id });
}

function handleSetLegacy(body) {
  const horas = Number(body.horas);
  if (isNaN(horas)) {
    return jsonResponse({ ok: false, error: 'Campo obrigatório: horas (número)' });
  }
  setLegacyBalanceHours(horas);
  return jsonResponse({ ok: true, legacyBalanceMs: horas * 3600000 });
}

// ── Helpers ───────────────────────────────────────────────────
// Aba "Config": guarda o saldo de banco de horas de uma época anterior ao
// app (ex.: controlado antes numa planilha manual). Fica fora da aba
// "Registros" pois não é uma batida — é um único valor somado direto ao
// banco de horas calculado. Editável tanto pela aba quanto pelo app.
function getLegacySheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CONFIG.LEGACY_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.LEGACY_SHEET_NAME);
    sheet.getRange('A1').setValue('Saldo legado (horas)').setFontWeight('bold');
    sheet.getRange('B1').setValue(0);
    sheet.setColumnWidth(1, 220);
  }
  return sheet;
}

function getLegacyBalanceHours() {
  const v = getLegacySheet().getRange('B1').getValue();
  const n = typeof v === 'number' ? v : parseFloat(v);
  return isNaN(n) ? 0 : n;
}

function setLegacyBalanceHours(horas) {
  getLegacySheet().getRange('B1').setValue(horas);
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  if (ss.getSpreadsheetTimeZone() !== CONFIG.TIMEZONE) {
    ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE);
  }

  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    writeHeader(sheet);
  } else {
    // Sheet de um modelo antigo (ou vazia) — realinha para o novo formato.
    const firstRow = sheet.getRange(1, 1, 1, HEADER.length).getValues()[0];
    const matches  = HEADER.every((h, i) => firstRow[i] === h);
    if (!matches) {
      sheet.clear();
      writeHeader(sheet);
    }
  }

  return sheet;
}

function writeHeader(sheet) {
  sheet.appendRow(HEADER);
  sheet.getRange(1, 1, 1, HEADER.length).setFontWeight('bold');
  sheet.setColumnWidth(1, 150);
  sheet.setColumnWidth(2, 100);
  sheet.setColumnWidth(3, 80);
  sheet.setColumnWidth(4, 150);
  sheet.setColumnWidth(5, 160);
  sheet.setColumnWidth(6, 90);
}

// Retorna o número da linha (1-based) cujo ID bate com id, ou -1
function findRowById(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  const ids = sheet.getRange(2, ID_COL, lastRow - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === id) return i + 2;
  }
  return -1;
}

function isoDate(d) {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d)) return String(value);
  return isoDate(d);
}

function toIso(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d)) return String(value);
  return d.toISOString();
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
