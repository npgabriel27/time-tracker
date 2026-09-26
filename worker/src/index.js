import webpush from 'web-push';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function checkAuth(request, env) {
  return request.headers.get('X-Auth-Token') === env.SHARED_SECRET;
}

function parseTimeToMinutes(hhmm, fallback) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || ''));
  if (!m) return fallback;
  const h = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  if (h < 0 || h > 23 || mm < 0 || mm > 59) return fallback;
  return h * 60 + mm;
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }
    if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
    if (!checkAuth(request, env)) return json({ error: 'unauthorized' }, 401);

    const url = new URL(request.url);
    let body;
    try { body = await request.json(); } catch (_) { return json({ error: 'invalid json' }, 400); }

    if (url.pathname === '/register') {
      const { subscription, goalMs, startReminderTime, timezone, notifyEnabled } = body;
      if (!subscription || !subscription.endpoint) return json({ error: 'missing subscription' }, 400);
      await env.PUSH_KV.put('sub', JSON.stringify(subscription));
      await env.PUSH_KV.put('settings', JSON.stringify({
        goalMs: goalMs ?? 8 * 3600000,
        startReminderTime: startReminderTime || '09:15',
        timezone: timezone || 'America/Sao_Paulo',
        notifyEnabled: notifyEnabled !== false,
      }));
      return json({ ok: true });
    }

    if (url.pathname === '/state') {
      const { isRunning, sessionStartMs, todayMs, sessionBelongsToday } = body;
      await env.PUSH_KV.put('state', JSON.stringify({
        isRunning: !!isRunning,
        sessionStartMs: sessionStartMs ?? null,
        todayMs: todayMs ?? 0,
        sessionBelongsToday: sessionBelongsToday !== false,
        updatedAt: Date.now(),
      }));
      return json({ ok: true });
    }

    return json({ error: 'not found' }, 404);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(env));
  },
};

async function handleScheduled(env) {
  const [subRaw, settingsRaw, stateRaw, flagsRaw] = await Promise.all([
    env.PUSH_KV.get('sub'),
    env.PUSH_KV.get('settings'),
    env.PUSH_KV.get('state'),
    env.PUSH_KV.get('flags'),
  ]);
  if (!subRaw || !settingsRaw || !stateRaw) return; // nada registrado ainda

  const sub = JSON.parse(subRaw);
  const settings = JSON.parse(settingsRaw);
  const state = JSON.parse(stateRaw);
  if (!settings.notifyEnabled) return;

  const tz = settings.timezone || 'America/Sao_Paulo';
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short',
  }).formatToParts(now).reduce((acc, p) => { acc[p.type] = p.value; return acc; }, {});
  const todayLocal = `${parts.year}-${parts.month}-${parts.day}`;
  const hourLocal = parseInt(parts.hour, 10) % 24; // alguns engines retornam "24" à meia-noite com hour12:false
  const minuteLocal = parseInt(parts.minute, 10);
  const isWeekend = parts.weekday === 'Sat' || parts.weekday === 'Sun';

  let flags = flagsRaw ? JSON.parse(flagsRaw) : null;
  const isNewDay = !flags || flags.date !== todayLocal;
  if (isNewDay) {
    flags = { date: todayLocal, goalNotified: false, startNotified: false };
  }

  // Sessão em aberto só entra no total de hoje se tiver começado hoje —
  // um turno de madrugada ainda aberto pertence ao dia anterior até a saída
  // ser batida, então não deve contar (nem disparar a meta) no dia novo.
  const currentTodayMs = (state.isRunning && state.sessionStartMs && state.sessionBelongsToday !== false)
    ? state.todayMs + (Date.now() - state.sessionStartMs)
    : state.todayMs;

  let changed = isNewDay;

  if (!flags.goalNotified && currentTodayMs >= settings.goalMs) {
    const ok = await sendPush(env, sub, {
      title: 'Meta diária batida! 🎯',
      body: `Você atingiu sua meta de ${(settings.goalMs / 3600000).toFixed(1)}h hoje.`,
      tag: 'goal',
      url: './index.html',
    });
    if (ok) { flags.goalNotified = true; changed = true; }
  }

  const thresholdMinutes = parseTimeToMinutes(settings.startReminderTime, 9 * 60 + 15);
  const nowMinutes = hourLocal * 60 + minuteLocal;
  if (!flags.startNotified && !isWeekend && nowMinutes >= thresholdMinutes
      && currentTodayMs === 0 && !state.isRunning) {
    const ok = await sendPush(env, sub, {
      title: 'Ainda não iniciou hoje',
      body: `Já são ${String(hourLocal).padStart(2, '0')}:${String(minuteLocal).padStart(2, '0')} e nenhum registro foi iniciado.`,
      tag: 'start-reminder',
      url: './index.html',
    });
    if (ok) { flags.startNotified = true; changed = true; }
  }

  if (changed) await env.PUSH_KV.put('flags', JSON.stringify(flags));
}

async function sendPush(env, subscription, payload) {
  const vapidDetails = {
    subject: env.VAPID_SUBJECT,
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };
  try {
    // API de baixo nível: só monta a assinatura VAPID + payload criptografado,
    // sem I/O — evitamos o sendNotification() padrão pois ele usa o módulo
    // `https` do Node, cujo shim em Workers (nodejs_compat) é menos maduro
    // que o fetch() nativo.
    const requestDetails = webpush.generateRequestDetails(
      subscription, JSON.stringify(payload), { vapidDetails, TTL: 3600 }
    );
    const res = await fetch(requestDetails.endpoint, {
      method: requestDetails.method,
      headers: requestDetails.headers,
      body: requestDetails.body,
    });
    if (res.status === 404 || res.status === 410) {
      await env.PUSH_KV.delete('sub'); // subscription expirada — para de tentar até re-registrar
      return false;
    }
    return res.ok;
  } catch (e) {
    console.error('push send failed', e);
    return false;
  }
}
