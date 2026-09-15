// ══════════════════════════════════════════════════════════════
//  Registro de Ponto — Google Apps Script
//  Deploy como: "Webapp" → Executar como: você → Acesso: Qualquer pessoa
// ══════════════════════════════════════════════════════════════

// Configurações — ajuste conforme necessário
const CONFIG = {
  SHEET_NAME: 'Registros',    // Nome da aba na planilha
  DATE_COL:   1,              // Coluna A → data
  HOURS_COL:  2,              // Coluna B → horas totais
  MS_COL:     3,              // Coluna C → milissegundos
  GOAL_COL:   4,              // Coluna D → meta (horas)
  SESSIONS_COL: 5,            // Coluna E → número de sessões
  UPDATED_COL:  6,            // Coluna F → última atualização
};

// ── GET: retorna o histórico como JSON ────────────────────────
function doGet(e) {
  try {
    const sheet = getSheet();
    const data  = sheet.getDataRange().getValues();
    const rows  = [];

    // Pula o cabeçalho (linha 1)
    for (let i = 1; i < data.length; i++) {
      const row = data[i];
      if (!row[0]) continue;  // linha vazia
      rows.push({
        date:       formatDate(row[CONFIG.DATE_COL - 1]),
        totalHours: row[CONFIG.HOURS_COL - 1],
        totalMs:    row[CONFIG.MS_COL - 1],
        goal:       row[CONFIG.GOAL_COL - 1],
        sessions:   row[CONFIG.SESSIONS_COL - 1],
        updatedAt:  row[CONFIG.UPDATED_COL - 1],
      });
    }

    return jsonResponse({ ok: true, records: rows });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ── POST: recebe um registro e salva/atualiza a linha ─────────
function doPost(e) {
  try {
    const body    = JSON.parse(e.postData.contents);
    const dateStr = body.date;            // "YYYY-MM-DD"
    const ms      = Number(body.totalMs);
    const hours   = Number(body.totalHours);
    const goalMs  = Number(body.goalMs);
    const sessions = Number(body.sessions);

    if (!dateStr || isNaN(ms)) {
      return jsonResponse({ ok: false, error: 'Campos obrigatórios: date, totalMs' });
    }

    const sheet    = getSheet();
    const goalH    = goalMs ? +(goalMs / 3600000).toFixed(4) : 8;
    const updatedAt = new Date().toISOString();

    // Procura se já existe uma linha para essa data
    const values   = sheet.getDataRange().getValues();
    let targetRow  = -1;

    for (let i = 1; i < values.length; i++) {
      const cellDate = formatDate(values[i][CONFIG.DATE_COL - 1]);
      if (cellDate === dateStr) { targetRow = i + 1; break; }
    }

    if (targetRow > 0) {
      // Atualiza linha existente
      sheet.getRange(targetRow, CONFIG.DATE_COL,     1, 1).setValue(new Date(dateStr + 'T12:00:00'));
      sheet.getRange(targetRow, CONFIG.HOURS_COL,    1, 1).setValue(hours);
      sheet.getRange(targetRow, CONFIG.MS_COL,       1, 1).setValue(ms);
      sheet.getRange(targetRow, CONFIG.GOAL_COL,     1, 1).setValue(goalH);
      sheet.getRange(targetRow, CONFIG.SESSIONS_COL, 1, 1).setValue(sessions);
      sheet.getRange(targetRow, CONFIG.UPDATED_COL,  1, 1).setValue(updatedAt);
    } else {
      // Insere nova linha
      sheet.appendRow([
        new Date(dateStr + 'T12:00:00'),
        hours,
        ms,
        goalH,
        sessions,
        updatedAt,
      ]);
    }

    return jsonResponse({ ok: true, date: dateStr, hours, sessions });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ── Helpers ───────────────────────────────────────────────────
function getSheet() {
  const ss    = SpreadsheetApp.getActiveSpreadsheet();
  let sheet   = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    // Cria a aba se não existir e escreve o cabeçalho
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow(['Data', 'Horas', 'Milissegundos', 'Meta (h)', 'Sessões', 'Atualizado em']);
    sheet.getRange(1, 1, 1, 6).setFontWeight('bold');
    sheet.setColumnWidth(1, 110);
    sheet.setColumnWidth(6, 180);
  }

  return sheet;
}

function formatDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d)) return String(value);
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
