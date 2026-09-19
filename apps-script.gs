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
  TIMEZONE:   'America/Sao_Paulo', // Fuso horário de exibição (GMT-3)
  DEFAULT_DAYS: 400,              // Janela padrão (em dias) retornada pelo GET — cobre relatórios de meses passados
};

const HEADER = ['Timestamp', 'Data', 'Tipo', 'Horário', 'ID', 'Origem'];
const TS_COL = 1, DATA_COL = 2, TIPO_COL = 3, HORARIO_COL = 4, ID_COL = 5, ORIGEM_COL = 6;

// ── GET: retorna o histórico recente como JSON ─────────────────
// ?days=45  → limita aos últimos N dias (padrão 45)
function doGet(e) {
  try {
    const sheet = getSheet();
    const data  = sheet.getDataRange().getValues();
    const days  = parseInt((e && e.parameter && e.parameter.days) || CONFIG.DEFAULT_DAYS, 10);
    const cutoff = isoDate(new Date(Date.now() - days * 86400000));

    const rows = [];
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      const id  = row[ID_COL - 1];
      if (!id) continue; // linha vazia
      const competencia = formatDate(row[DATA_COL - 1]);
      if (competencia < cutoff) continue;
      rows.push({
        timestamp:   row[TS_COL - 1],
        competencia: competencia,
        tipo:        String(row[TIPO_COL - 1] || '').toLowerCase(),
        horario:     toIso(row[HORARIO_COL - 1]),
        id:          String(id),
        origem:      String(row[ORIGEM_COL - 1] || 'ponto'),
      });
    }

    return jsonResponse({ ok: true, records: rows });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ── POST: registra, edita ou apaga uma batida ────────────────────
// body.action: 'punch' (padrão) | 'update' | 'delete'
//  - 'punch'  → { id, tipo, horario, competencia, origem? } cria uma linha nova
//               (idempotente por 'id' — reenviar não duplica; usado tanto pelo
//               fluxo normal de Registrar Ponto quanto para lançar uma batida
//               manual/esquecida com horário retroativo)
//  - 'update' → { id, tipo, horario, competencia } corrige uma linha existente
//  - 'delete' → { id } remove a linha
function doPost(e) {
  try {
    const body   = JSON.parse(e.postData.contents);
    const action = body.action || 'punch';

    if (action === 'update') return handleUpdate(body);
    if (action === 'delete') return handleDelete(body);
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

// ── Helpers ───────────────────────────────────────────────────
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
