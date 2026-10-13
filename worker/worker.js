/* ==========================================================================
   Cloudflare Worker: принимает заявки с квиза и пересылает их в Telegram
   --------------------------------------------------------------------------
   Зачем он нужен: токен Telegram-бота нельзя хранить на сайте — его увидит
   любой посетитель. Воркер хранит токен у себя (в переменных окружения),
   а сайт отправляет заявку воркеру.

   Переменные окружения (Cloudflare → ваш воркер → Settings → Variables and Secrets):
     TELEGRAM_BOT_TOKEN  — токен бота от @BotFather (тип Secret!)
     TELEGRAM_CHAT_ID    — куда слать заявки. Можно несколько через запятую:
                           123456789,-1001234567890
     ALLOWED_ORIGINS     — адреса вашего сайта через запятую, например:
                           https://potolki.ru,https://ivan.github.io
                           Пусто — принимать с любого сайта (только для проверки!).
     TIMEZONE            — часовой пояс для времени заявки, по умолчанию Europe/Moscow

   Бесплатного тарифа Cloudflare (100 000 запросов в день) хватит с огромным запасом.
   ========================================================================== */

// Ограничение частоты: не больше 5 заявок с одного IP за 10 минут.
// Счётчик живёт в памяти воркера — это защита «от дурака», а не от целенаправленной атаки.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_MAX = 5;
const hits = new Map();

const MAX_BODY_BYTES = 20000;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowed = isAllowedOrigin(origin, env);
    const cors = corsHeaders(origin, allowed);

    // Предварительный запрос браузера (CORS)
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    }

    // Проверка «жив ли воркер»: откройте адрес воркера в браузере
    if (request.method === 'GET') {
      const configured = Boolean(env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID);
      return json({ ok: true, service: 'quiz-leads', telegram: configured ? 'настроен' : 'НЕ настроен' }, 200, cors);
    }

    if (request.method !== 'POST') return json({ ok: false, error: 'method_not_allowed' }, 405, cors);
    if (!allowed) return json({ ok: false, error: 'origin_not_allowed' }, 403, cors);
    if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
      return json({ ok: false, error: 'telegram_not_configured' }, 500, cors);
    }

    // Читаем заявку
    let data;
    try {
      const raw = await request.text();
      if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: 'too_large' }, 413, cors);
      data = JSON.parse(raw);
    } catch (e) {
      return json({ ok: false, error: 'bad_json' }, 400, cors);
    }
    if (!data || typeof data !== 'object') return json({ ok: false, error: 'bad_data' }, 400, cors);

    // Ловушка для ботов заполнена — делаем вид, что всё хорошо, но ничего не шлём
    if (data.website) return json({ ok: true }, 200, cors);

    const phoneDigits = String(data.phone || '').replace(/\D/g, '');
    if (phoneDigits.length < 10 || phoneDigits.length > 15) {
      return json({ ok: false, error: 'bad_phone' }, 400, cors);
    }

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (isRateLimited(ip)) return json({ ok: false, error: 'rate_limited' }, 429, cors);

    const text = buildMessage(data, request, env, phoneDigits);
    const chatIds = String(env.TELEGRAM_CHAT_ID).split(',').map((s) => s.trim()).filter(Boolean);
    const results = await Promise.all(chatIds.map((id) => sendTelegram(env.TELEGRAM_BOT_TOKEN, id, text)));
    const ok = results.some(Boolean);
    return json({ ok }, ok ? 200 : 502, cors);
  },
};

/* ---------- Проверка адреса сайта ---------- */

function allowedList(env) {
  return String(env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((s) => s.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function isAllowedOrigin(origin, env) {
  const list = allowedList(env);
  if (!list.length || list.includes('*')) return true;
  return list.includes(origin);
}

function corsHeaders(origin, allowed) {
  return {
    'Access-Control-Allow-Origin': allowed && origin ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Accept',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

/* ---------- Ограничение частоты ---------- */

function isRateLimited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (list.length >= RATE_MAX) {
    hits.set(ip, list);
    return true;
  }
  list.push(now);
  hits.set(ip, list);
  // Чистим старые записи, чтобы память не росла
  if (hits.size > 5000) {
    for (const [key, times] of hits) {
      if (!times.some((t) => now - t < RATE_WINDOW_MS)) hits.delete(key);
    }
  }
  return false;
}

/* ---------- Текст сообщения ---------- */

// Экранирование для parse_mode=HTML в Telegram
function h(value, max = 300) {
  return String(value == null ? '' : value)
    .slice(0, max)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function buildMessage(d, request, env, phoneDigits) {
  const tz = env.TIMEZONE || 'Europe/Moscow';
  let when;
  try {
    when = new Date().toLocaleString('ru-RU', { timeZone: tz, dateStyle: 'short', timeStyle: 'short' });
  } catch (e) {
    when = new Date().toISOString();
  }

  // Номер в международном формате для ссылок
  let intl = phoneDigits;
  if (intl.length === 10) intl = '7' + intl;
  if (intl.length === 11 && intl[0] === '8') intl = '7' + intl.slice(1);

  const lines = [];
  lines.push(`🔥 <b>Новая заявка с квиза</b>${d.company ? ' — ' + h(d.company, 80) : ''}`);
  lines.push('');
  lines.push(`👤 <b>Имя:</b> ${h(d.name || 'не указано', 80)}`);
  lines.push(`📞 <b>Телефон:</b> ${h(d.phone, 40)}`);
  lines.push(`💬 <b>Способ связи:</b> ${h(d.contact_method || '—', 40)}`);
  lines.push(`💰 <b>Стоимость:</b> ${h(d.price || '—', 80)}`);
  lines.push(`⏱ <b>Срочность:</b> ${h(d.urgency || '—', 80)}`);
  lines.push(`↪️ <a href="https://wa.me/${intl}">Написать в WhatsApp</a> · <a href="https://t.me/+${intl}">в Telegram</a>`);

  if (Array.isArray(d.answers) && d.answers.length) {
    lines.push('');
    lines.push('📋 <b>Ответы:</b>');
    d.answers.slice(0, 30).forEach((a, i) => {
      lines.push(`${i + 1}. ${h(a && a.q, 150)} — <b>${h(a && a.a, 300)}</b>`);
    });
  }

  lines.push('');
  lines.push(`🕒 ${h(when)} (${h(tz)})`);
  if (d.device) lines.push(`📱 ${h(d.device, 150)}`);

  const cf = request.cf || {};
  const geo = [cf.city, cf.region, cf.country].filter(Boolean).join(', ');
  if (geo) lines.push(`📍 По IP: ${h(geo, 120)}`);

  const utm = d.utm && typeof d.utm === 'object'
    ? Object.keys(d.utm).slice(0, 10).map((k) => `${h(k, 30)}=${h(d.utm[k], 120)}`).join(', ')
    : '';
  if (utm) lines.push(`🎯 UTM: ${utm}`);
  if (d.referrer) lines.push(`🌐 Откуда: ${h(d.referrer, 200)}`);
  if (d.page) lines.push(`🔗 Страница: ${h(d.page, 200)}`);

  // Лимит Telegram — 4096 символов
  let text = lines.join('\n');
  if (text.length > 4000) text = text.slice(0, 3990) + '…';
  return text;
}

/* ---------- Отправка в Telegram ---------- */

async function sendTelegram(token, chatId, text) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML', disable_web_page_preview: true }),
    });
    if (!res.ok) console.log('Telegram error', chatId, res.status, await res.text());
    return res.ok;
  } catch (e) {
    console.log('Telegram fetch failed', chatId, String(e));
    return false;
  }
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
