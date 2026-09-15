// ══════════════════════════════════════════════════════════════
//  Registro de Ponto — Google Apps Script
//  Deploy como: "Webapp" → Executar como: você → Acesso: Qualquer pessoa
// ══════════════════════════════════════════════════════════════

// Configurações — ajuste conforme necessário
const CONFIG = {
  SHEET_NAME:  'Registros',       // Nome da aba na planilha
  TIMEZONE:    'America/Sao_Paulo', // Fuso horário de exibição (GMT-3)
  TS_COL:      1,             // Coluna A → timestamp do registro (criação/atualização)
  COMP_COL:    2,             // Coluna B → competência (data da jornada)
  INICIO_COL:  3,             // Coluna C → horário de início
  FIM_COL:     4,             // Coluna D → horário de fim
  SESSION_COL: 5,             // Coluna E → ID da sessão (chave técnica p/ correlacionar início/fim)
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
      if (!row[CONFIG.SESSION_COL - 1]) continue;  // linha vazia
      rows.push({
        timestamp:   row[CONFIG.TS_COL - 1],
        competencia: formatDate(row[CONFIG.COMP_COL - 1]),
        inicio:      row[CONFIG.INICIO_COL - 1],
        fim:         row[CONFIG.FIM_COL - 1],
        sessionId:   row[CONFIG.SESSION_COL - 1],
      });
    }

    return jsonResponse({ ok: true, records: rows });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ── POST: registra início/fim de uma sessão ────────────────────
// action 'start' → cria a linha com o horário de início
// action 'end'   → localiza a linha da sessão e preenche o horário de fim
//                  (se a linha de início não existir, cria uma linha completa)
function doPost(e) {
  try {
    const body        = JSON.parse(e.postData.contents);
    const action       = body.action;
    const sessionId    = String(body.sessionId || '');
    const competencia  = body.competencia;      // "YYYY-MM-DD"
    const inicio       = body.inicio;           // ISO string
    const fim          = body.fim;               // ISO string (só em 'end')

    if (!sessionId || !competencia || !inicio) {
      return jsonResponse({ ok: false, error: 'Campos obrigatórios: sessionId, competencia, inicio' });
    }

    const sheet   = getSheet();
    const now     = new Date();
    const rowIdx  = findSessionRow(sheet, sessionId);

    if (action === 'start') {
      if (rowIdx < 0) {
        sheet.appendRow([
          now,
          new Date(competencia + 'T12:00:00'),
          new Date(inicio),
          '',
          sessionId,
        ]);
      }
      // se a linha já existe, não duplica (idempotente para re-sincronizações)
    } else if (action === 'end') {
      if (rowIdx > 0) {
        sheet.getRange(rowIdx, CONFIG.TS_COL,   1, 1).setValue(now);
        sheet.getRange(rowIdx, CONFIG.FIM_COL,  1, 1).setValue(fim ? new Date(fim) : '');
      } else {
        // início não chegou a ser sincronizado — cria a linha já completa
        sheet.appendRow([
          now,
          new Date(competencia + 'T12:00:00'),
          new Date(inicio),
          fim ? new Date(fim) : '',
          sessionId,
        ]);
      }
    } else {
      return jsonResponse({ ok: false, error: 'action inválida (use "start" ou "end")' });
    }

    return jsonResponse({ ok: true, sessionId, action });
  } catch (err) {
    return jsonResponse({ ok: false, error: err.message });
  }
}

// ── Helpers ───────────────────────────────────────────────────
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // Garante que a planilha exiba os horários no fuso configurado (GMT-3),
  // independente do fuso padrão da conta Google que criou o documento.
  if (ss.getSpreadsheetTimeZone() !== CONFIG.TIMEZONE) {
    ss.setSpreadsheetTimeZone(CONFIG.TIMEZONE);
  }

  let sheet = ss.getSheetByName(CONFIG.SHEET_NAME);

  if (!sheet) {
    // Cria a aba se não existir e escreve o cabeçalho
    sheet = ss.insertSheet(CONFIG.SHEET_NAME);
    sheet.appendRow(['Timestamp', 'Competência', 'Início', 'Fim', 'ID Sessão']);
    sheet.getRange(1, 1, 1, 5).setFontWeight('bold');
    sheet.setColumnWidth(1, 150);
    sheet.setColumnWidth(2, 100);
    sheet.setColumnWidth(3, 150);
    sheet.setColumnWidth(4, 150);
    sheet.setColumnWidth(5, 140);
  }

  return sheet;
}

// Retorna o número da linha (1-based) cujo ID Sessão bate com sessionId, ou -1
function findSessionRow(sheet, sessionId) {
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (String(values[i][CONFIG.SESSION_COL - 1]) === sessionId) return i + 1;
  }
  return -1;
}

function formatDate(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d)) return String(value);
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function jsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
