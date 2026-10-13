/* ==========================================================================
   Квиз-калькулятор стоимости — app.js
   --------------------------------------------------------------------------
   Чистый JavaScript без фреймворков и без сборки.

   Как устроено:
     1. Загружаем настройки: Google Таблица (CSV) → кеш в localStorage →
        локальный config.json (или config.js, если сайт открыт двойным кликом).
     2. Приводим данные к единому виду (normalizeConfig).
     3. Рисуем страницу: шапка, первый экран, квиз, работы/отзывы, подвал.
     4. Квиз: один вопрос на экран, прогресс сохраняется в localStorage.
     5. Расчёт цены (calcPrice) — только по данным из настроек.
     6. Отправка заявки: Cloudflare Worker → Telegram, резерв — Web3Forms (e-mail),
        если всё сломалось — кнопки WhatsApp/Telegram с готовым текстом.

   Править этот файл для смены цен и текстов НЕ нужно — всё в таблице
   или в config.json.
   ========================================================================== */
'use strict';

(function () {
  /* ------------------------------------------------------------------------
     1. Константы
     ------------------------------------------------------------------------ */

  // Ключи localStorage. Если поменять структуру данных — увеличьте версию.
  var LS = {
    config: 'quiz:config:v1',
    progress: 'quiz:progress:v1',
    utm: 'quiz:utm:v1',
    lastLead: 'quiz:last-lead:v1'
  };

  var SHEET_TIMEOUT_MS = 5000;   // сколько ждём Google Таблицу
  var SEND_TIMEOUT_MS = 10000;   // сколько ждём ответ воркера / Web3Forms
  var PROGRESS_TTL_MS = 30 * 24 * 3600 * 1000; // прогресс хранится 30 дней
  var MIN_HUMAN_TIME_MS = 1500;  // быстрее человек форму не заполнит → это бот

  // Значения по умолчанию. Любое из них переопределяется в листе «Настройки»
  // или в config.json → settings. Описание каждого ключа — в README.md.
  var DEFAULT_SETTINGS = {
    company_name: 'Компания',
    logo_url: '',
    phone: '',
    whatsapp: '',
    telegram: '',
    primary_color: '#3A5BD9',
    hero_badge: '',
    hero_title: 'Рассчитайте стоимость за 1 минуту',
    hero_subtitle: '',
    hero_image: '',
    cta_text: 'Рассчитать стоимость',
    cta_note: '',
    benefit_1: '',
    benefit_2: '',
    benefit_3: '',
    gift_title: 'Ваш подарок',
    gift_text: '',
    gift_discount_percent: '',
    city: '',
    work_hours: '',
    currency: '₽',
    min_order: '',
    price_spread_percent: '15',
    price_round: '100',
    price_display: 'частично',
    multiplier_applies_to: 'площадь',
    price_note: 'Точную стоимость мастер назовёт после бесплатного замера',
    form_title: 'Ваш расчёт готов!',
    form_subtitle: 'Оставьте телефон — пришлём точную смету и закрепим за вами подарок',
    submit_text: 'Получить расчёт и подарок',
    require_name: 'нет',
    contact_methods: 'Звонок, WhatsApp, Telegram',
    policy_text: 'Я даю согласие на обработку персональных данных',
    policy_link_text: 'Политика конфиденциальности',
    policy_url: 'policy.html',
    thanks_title: 'Спасибо! Заявка принята',
    thanks_text: 'Мы свяжемся с вами в ближайшее время',
    messenger_greeting: 'Здравствуйте! Я рассчитал(а) стоимость на сайте.',
    worker_url: '',
    email_mode: 'выкл',
    web3forms_key: '',
    lead_cooldown_sec: '60',
    auto_advance: 'да',
    yandex_metrika_id: '',
    meta_title: '',
    meta_description: '',
    favicon_url: '',
    works_title: 'Наши работы и отзывы',
    footer_text: '',
    legal_name: '',
    inn: '',
    ogrn: '',
    legal_address: '',
    email: ''
  };

  // Заголовки столбцов в Google Таблице → внутренние ключи.
  // Можно писать по-русски или по-английски, регистр и знаки не важны.
  var HEADERS = {
    settings: {
      key: ['ключ', 'параметр', 'key'],
      value: ['значение', 'value']
    },
    questions: {
      step: ['шаг', 'номер шага', 'step'],
      title: ['вопрос', 'текст вопроса', 'title', 'question'],
      type: ['тип', 'тип вопроса', 'type'],
      required: ['обязательный', 'обязательно', 'required'],
      hint: ['подсказка', 'hint'],
      min: ['мин', 'минимум', 'min'],
      max: ['макс', 'максимум', 'max'],
      step_size: ['шаг ползунка', 'step size'],
      default: ['по умолчанию', 'default'],
      unit: ['единица', 'ед', 'unit'],
      role: ['роль', 'role']
    },
    options: {
      step: ['шаг', 'номер шага', 'step'],
      text: ['вариант', 'текст варианта', 'text', 'option'],
      image: ['картинка', 'фото', 'изображение', 'image'],
      price_type: ['тип цены', 'тип влияния на цену', 'влияние на цену', 'price type'],
      value: ['значение', 'цена', 'value'],
      description: ['описание', 'description'],
      unit: ['единица', 'ед', 'unit'],
      default_qty: ['кол во по умолчанию', 'количество по умолчанию', 'default qty'],
      max_qty: ['макс кол во', 'максимум штук', 'max qty']
    },
    reviews: {
      photo: ['фото', 'картинка', 'photo'],
      caption: ['подпись', 'caption'],
      name: ['имя', 'имя клиента', 'name'],
      text: ['отзыв', 'текст отзыва', 'text']
    }
  };

  // Иконки (SVG в стиле Lucide). Эмодзи как иконки не используем.
  var ICON = {
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
    arrowRight: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
    arrowLeft: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>',
    phone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/></svg>',
    gift: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5"/></svg>',
    pin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>',
    lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1"/></svg>',
    refresh: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 12a9 9 0 0 1 15-6.7L21 8M21 3v5h-5M21 12a9 9 0 0 1-15 6.7L3 16M3 21v-5h5"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>',
    whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.3-.4.2-.4.7-1.4.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.4.8 3.2.7.5-.1 1.5-.6 1.8-1.2.2-.6.2-1.1.1-1.2l-.5-.3Z"/></svg>',
    telegram: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.4 4.2 2.9 11.3c-1.3.5-1.2 1.3-.2 1.6l4.7 1.5 1.8 5.6c.2.6.4.8.9.8.4 0 .6-.2.9-.4l2.3-2.2 4.7 3.5c.9.5 1.5.2 1.7-.8l3.1-14.6c.3-1.3-.5-1.9-1.4-1.5Zm-3.3 3.3-8.8 8-.3 3.3-1.6-5 10.2-6.6c.5-.3.9 0 .5.3Z"/></svg>'
  };

  /* ------------------------------------------------------------------------
     2. Небольшие утилиты
     ------------------------------------------------------------------------ */

  // Безопасная работа с localStorage: в приватном режиме он может падать.
  var storage = {
    get: function (key) {
      try {
        var raw = window.localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
      } catch (e) { return null; }
    },
    set: function (key, value) {
      try { window.localStorage.setItem(key, JSON.stringify(value)); return true; } catch (e) { return false; }
    },
    remove: function (key) {
      try { window.localStorage.removeItem(key); } catch (e) { /* ничего */ }
    }
  };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  // Экранирование текста перед вставкой в HTML (защита от XSS из таблицы).
  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Пропускаем только безопасные ссылки: относительные, http(s), tel, mailto, tg.
  function safeUrl(url) {
    var u = String(url == null ? '' : url).trim();
    if (!u) return '';
    var scheme = u.match(/^([a-z][a-z0-9+.-]*):/i);
    if (!scheme) return u;
    return /^(https?|tel|mailto|tg)$/i.test(scheme[1]) ? u : '';
  }

  // Ссылки «Поделиться» из Google Диска превращаем в прямые ссылки на картинку.
  function imageUrl(url) {
    var u = safeUrl(url);
    var m = u.match(/drive\.google\.com\/(?:file\/d\/|open\?id=|uc\?(?:export=\w+&)?id=)([\w-]{10,})/);
    if (m) return 'https://drive.google.com/thumbnail?id=' + m[1] + '&sz=w1200';
    return u;
  }

  // Число из строки: понимает «1 200», «0,8», «15%», «1 200 ₽».
  function num(value, fallback) {
    if (fallback === undefined) fallback = NaN;
    if (typeof value === 'number') return isFinite(value) ? value : fallback;
    var s = String(value == null ? '' : value)
      .replace(/[\s\u00a0\u202f]/g, '')
      .replace(',', '.')
      .replace(/[^\d.\-]/g, '');
    if (s === '' || s === '-' || s === '.') return fallback;
    var n = parseFloat(s);
    return isFinite(n) ? n : fallback;
  }

  function clamp(n, min, max) { return Math.min(max, Math.max(min, n)); }

  // «да / yes / 1 / true / +» → true
  function isYes(value) { return /^(да|yes|y|true|1|\+|вкл|on)$/i.test(String(value == null ? '' : value).trim()); }

  // 23400 → «23 400»
  function fmt(n) { return Math.round(n).toLocaleString('ru-RU').replace(/\u202f/g, '\u00a0'); }

  // 23400 → «2X XXX» (первая цифра видна, остальные скрыты)
  function maskMoney(n) {
    var first = true;
    return fmt(n).replace(/\d/g, function (d) {
      if (first) { first = false; return d; }
      return 'X';
    });
  }

  function prefersReducedMotion() {
    return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  // Простой хеш строки — чтобы понять, что вопросы в таблице изменились.
  function hash(str) {
    var h = 0;
    for (var i = 0; i < str.length; i++) { h = (h * 31 + str.charCodeAt(i)) | 0; }
    return String(h >>> 0);
  }

  /* ------------------------------------------------------------------------
     3. Разбор CSV (как его отдаёт Google Таблица)
     ------------------------------------------------------------------------ */

  function parseCSV(text) {
    text = String(text || '').replace(/^\uFEFF/, '');
    // Разделитель: Google отдаёт запятую; если запятых нет, но есть «;» — Excel.
    var firstLine = text.split('\n')[0] || '';
    var sep = firstLine.indexOf(',') === -1 && firstLine.indexOf(';') !== -1 ? ';' : ',';
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
        } else {
          field += c;
        }
        continue;
      }
      if (c === '"') { inQuotes = true; }
      else if (c === sep) { row.push(field); field = ''; }
      else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
      else if (c !== '\r') { field += c; }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) { return r.some(function (cell) { return String(cell).trim() !== ''; }); });
  }

  function normHeader(h) {
    return String(h || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
  }

  // Таблица (массив строк) → массив объектов с внутренними ключами.
  function rowsToObjects(rows, sheet) {
    if (!rows.length) return [];
    var aliases = HEADERS[sheet];
    var map = rows[0].map(function (h) {
      var n = normHeader(h);
      for (var key in aliases) {
        if (aliases[key].some(function (a) { return normHeader(a) === n; })) return key;
      }
      return null;
    });
    return rows.slice(1).map(function (r) {
      var obj = {};
      map.forEach(function (key, i) { if (key) obj[key] = r[i] == null ? '' : String(r[i]).trim(); });
      return obj;
    });
  }

  /* ------------------------------------------------------------------------
     4. Приведение настроек к единому виду
     ------------------------------------------------------------------------ */

  function questionType(v) {
    var t = String(v || '').toLowerCase();
    if (/неск|multi|check/.test(t)) return 'multi';
    if (/полз|slider|range/.test(t)) return 'slider';
    if (/числ|number|ввод/.test(t)) return 'number';
    return 'single';
  }

  function priceType(v) {
    var t = String(v || '').toLowerCase().replace(/ё/g, 'е');
    if (/м2|м²|кв|m2|sqm|площад/.test(t)) return 'm2';
    if (/множ|коэф|mult/.test(t)) return 'mult';
    if (/фикс|надбав|fixed|fix/.test(t)) return 'fixed';
    if (/шт|piece|кол|ед|метр|unit/.test(t)) return 'piece';
    return 'none';
  }

  function questionRole(v) {
    var t = String(v || '').toLowerCase();
    if (/площад|area|база|base|объем|длин/.test(t)) return 'area';
    if (/сроч|urgen|когда/.test(t)) return 'urgency';
    return '';
  }

  // raw = { settings: {}, questions: [], options: [], reviews: [] }
  function normalizeConfig(raw) {
    raw = raw || {};
    var s = {};
    Object.keys(DEFAULT_SETTINGS).forEach(function (k) { s[k] = DEFAULT_SETTINGS[k]; });
    var rs = raw.settings || {};
    Object.keys(rs).forEach(function (k) {
      var key = String(k).trim();
      if (key) s[key] = rs[k] == null ? '' : String(rs[k]).trim();
    });

    // Варианты группируем по номеру шага
    var optsByStep = {};
    (raw.options || []).forEach(function (o) {
      var step = String(o.step == null ? '' : o.step).trim();
      var text = String(o.text == null ? '' : o.text).trim();
      if (!step || !text) return;
      (optsByStep[step] = optsByStep[step] || []).push(o);
    });

    var seen = {};
    var questions = [];
    (raw.questions || []).forEach(function (q, qi) {
      var id = String(q.step == null ? '' : q.step).trim();
      var title = String(q.title == null ? '' : q.title).trim();
      if (!id || !title || seen[id]) return;
      seen[id] = true;
      var type = questionType(q.type);
      var nq = {
        id: id,
        order: num(id, qi + 1),
        title: title,
        type: type,
        required: isYes(q.required),
        hint: String(q.hint || '').trim(),
        min: num(q.min),
        max: num(q.max),
        stepSize: num(q.step_size, 1),
        def: num(q.default),
        unit: String(q.unit || '').trim(),
        role: questionRole(q.role),
        options: []
      };
      if (!(nq.stepSize > 0)) nq.stepSize = 1;
      if (type === 'slider') {
        if (!isFinite(nq.min)) nq.min = 0;
        if (!isFinite(nq.max) || nq.max <= nq.min) nq.max = nq.min + 100;
        if (!isFinite(nq.def)) nq.def = nq.min;
        nq.def = clamp(nq.def, nq.min, nq.max);
        nq.required = true; // у ползунка всегда есть значение
      }
      if (type === 'single' || type === 'multi') {
        nq.options = (optsByStep[id] || []).map(function (o, i) {
          var pt = priceType(o.price_type);
          var val = num(o.value, pt === 'mult' ? 1 : 0);
          var defQty = Math.max(1, Math.round(num(o.default_qty, 1)));
          var maxQty = Math.max(defQty, Math.round(num(o.max_qty, 999)));
          return {
            id: id + '__' + i,
            text: String(o.text).trim(),
            image: imageUrl(o.image),
            desc: String(o.description || '').trim(),
            priceType: pt,
            value: val,
            unit: String(o.unit || '').trim() || 'шт',
            defQty: defQty,
            maxQty: maxQty
          };
        });
        if (!nq.options.length) {
          console.warn('[Квиз] У вопроса «' + title + '» (шаг ' + id + ') нет вариантов — вопрос пропущен.');
          return;
        }
      }
      questions.push(nq);
    });
    questions.sort(function (a, b) { return a.order - b.order; });

    // Если роль «площадь» нигде не указана — берём первый ползунок.
    if (!questions.some(function (q) { return q.role === 'area'; })) {
      var firstSlider = questions.filter(function (q) { return q.type === 'slider'; })[0];
      if (firstSlider) firstSlider.role = 'area';
    }

    var reviews = (raw.reviews || []).map(function (r) {
      return {
        photo: imageUrl(r.photo),
        caption: String(r.caption || '').trim(),
        name: String(r.name || '').trim(),
        text: String(r.text || '').trim()
      };
    }).filter(function (r) { return r.photo || r.text || r.caption; });

    var signature = hash(questions.map(function (q) {
      return q.id + ':' + q.type + ':' + q.options.map(function (o) { return o.text; }).join(',');
    }).join('|'));

    return { settings: s, questions: questions, reviews: reviews, signature: signature };
  }

  /* ------------------------------------------------------------------------
     5. Загрузка настроек: таблица → кеш → config.json / config.js
     ------------------------------------------------------------------------ */

  function fetchWithTimeout(url, options, ms) {
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, ms);
    var opts = Object.assign({}, options || {});
    if (ctrl) opts.signal = ctrl.signal;
    return fetch(url, opts).finally(function () { clearTimeout(timer); });
  }

  // Локальный config.json. Если страница открыта как файл (file://),
  // браузер не даёт прочитать JSON — тогда подключаем config.js (его копию).
  function loadLocalConfig() {
    return fetchWithTimeout('config.json', { cache: 'no-cache' }, 4000)
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(function () {
        if (window.QUIZ_CONFIG) return window.QUIZ_CONFIG;
        return new Promise(function (resolve) {
          var sc = document.createElement('script');
          sc.src = 'config.js';
          sc.onload = function () { resolve(window.QUIZ_CONFIG || null); };
          sc.onerror = function () { resolve(null); };
          document.head.appendChild(sc);
        });
      });
  }

  function fetchCSV(url) {
    return fetchWithTimeout(url, { cache: 'no-store' }, SHEET_TIMEOUT_MS).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.text();
    }).then(function (text) {
      // Если вместо CSV пришла HTML-страница (таблица не опубликована) — это ошибка.
      if (/^\s*<(!doctype|html)/i.test(text)) throw new Error('Получен HTML вместо CSV');
      return parseCSV(text);
    });
  }

  // Загружаем листы Google Таблицы. Обязательные: «Настройки», «Вопросы», «Варианты».
  function loadSheets(sheets, local) {
    var tasks = [
      fetchCSV(sheets.settings),
      fetchCSV(sheets.questions),
      fetchCSV(sheets.options),
      sheets.reviews ? fetchCSV(sheets.reviews).catch(function () { return null; }) : Promise.resolve(null)
    ];
    return Promise.all(tasks).then(function (res) {
      var settings = {};
      rowsToObjects(res[0], 'settings').forEach(function (row) {
        if (row.key) settings[row.key] = row.value == null ? '' : row.value;
      });
      var questions = rowsToObjects(res[1], 'questions');
      var options = rowsToObjects(res[2], 'options');
      if (!questions.length || !options.length) throw new Error('Листы «Вопросы» или «Варианты» пустые');
      var localSettings = (local && local.settings) || {};
      return {
        // Ключ есть в таблице → берём из таблицы (даже пустой). Нет → из config.json.
        settings: Object.assign({}, localSettings, settings),
        questions: questions,
        options: options,
        reviews: res[3] ? rowsToObjects(res[3], 'reviews') : ((local && local.reviews) || [])
      };
    });
  }

  function sheetsKey(sheets) {
    return hash([sheets.settings, sheets.questions, sheets.options, sheets.reviews].join('|'));
  }

  // Возвращает { raw, source, refresh? } — refresh: обещание свежих данных из таблицы.
  function loadConfig() {
    return loadLocalConfig().then(function (local) {
      var sheets = (local && local.sheets) || {};
      var hasSheets = !!(sheets.settings && sheets.questions && sheets.options);
      var cached = storage.get(LS.config);

      if (!hasSheets) {
        if (local) { storage.set(LS.config, { key: 'local', raw: local, ts: Date.now() }); return { raw: local, source: 'config.json' }; }
        if (cached && cached.raw) return { raw: cached.raw, source: 'кеш' };
        return { raw: null, source: 'нет данных' };
      }

      var key = sheetsKey(sheets);
      var fresh = loadSheets(sheets, local).then(function (raw) {
        storage.set(LS.config, { key: key, raw: raw, ts: Date.now() });
        return raw;
      });

      // Есть кеш этой же таблицы → показываем сразу, а свежие данные подтянем фоном.
      if (cached && cached.key === key && cached.raw) {
        return { raw: cached.raw, source: 'кеш', refresh: fresh.catch(function (e) { console.warn('[Квиз] Таблица недоступна:', e.message); return null; }) };
      }
      return fresh.then(function (raw) {
        return { raw: raw, source: 'Google Таблица' };
      }).catch(function (e) {
        console.warn('[Квиз] Таблица недоступна, используем запасной вариант:', e.message);
        if (cached && cached.raw && cached.key !== 'local') return { raw: cached.raw, source: 'кеш' };
        return { raw: local, source: 'config.json' };
      });
    });
  }

  /* ------------------------------------------------------------------------
     6. Цвета бренда: вся палитра считается от одного основного цвета
     ------------------------------------------------------------------------ */

  function parseHex(hex) {
    var m = String(hex || '').trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
    if (!m) return null;
    var h = m[1].length === 3 ? m[1].replace(/./g, '$&$&') : m[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  function rgbToHsl(rgb) {
    var r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h = 0, s = 0, l = (max + min) / 2;
    if (max !== min) {
      var d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
    }
    return [h, s * 100, l * 100];
  }

  function hslToRgb(h, s, l) {
    s /= 100; l /= 100;
    var k = function (n) { return (n + h / 30) % 12; };
    var a = s * Math.min(l, 1 - l);
    var f = function (n) { return l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); };
    return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
  }

  function rgbToHex(rgb) {
    return '#' + rgb.map(function (v) { return ('0' + clamp(v, 0, 255).toString(16)).slice(-2); }).join('');
  }

  function luminance(rgb) {
    var c = rgb.map(function (v) { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }

  function contrast(a, b) {
    var la = luminance(a), lb = luminance(b);
    return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
  }

  function applyTheme(color) {
    var rgb = parseHex(color) || parseHex(DEFAULT_SETTINGS.primary_color);
    var hsl = rgbToHsl(rgb);
    var h = hsl[0], s = hsl[1], l = hsl[2];
    var white = [255, 255, 255];
    var dark = [17, 20, 28];

    // Текст на кнопке: белый или тёмный — что контрастнее.
    var onPrimary = contrast(rgb, white) >= contrast(rgb, dark) ? '#ffffff' : '#11141c';

    // Цвет для ссылок/рамок фокуса на белом фоне: затемняем до контраста 4.5:1.
    var inkL = l;
    var ink = rgb;
    while (contrast(ink, white) < 4.6 && inkL > 5) { inkL -= 2; ink = hslToRgb(h, s, inkL); }

    var sat = Math.min(s, 85);
    var vars = {
      '--c-primary': rgbToHex(rgb),
      '--c-primary-hover': rgbToHex(hslToRgb(h, s, Math.max(l - 8, 5))),
      '--c-on-primary': onPrimary,
      '--c-primary-ink': rgbToHex(ink),
      '--c-primary-soft': rgbToHex(hslToRgb(h, Math.min(sat, 80), 96.5)),
      '--c-primary-soft-2': rgbToHex(hslToRgb(h, Math.min(sat, 70), 90)),
      '--c-bg': rgbToHex(hslToRgb(h, Math.min(sat, 30), 98)),
      '--c-ink': rgbToHex(hslToRgb(h, Math.min(sat, 30), 12)),
      '--c-muted': rgbToHex(hslToRgb(h, Math.min(sat, 14), 37)),
      '--c-line': rgbToHex(hslToRgb(h, Math.min(sat, 24), 89)),
      '--shadow-hsl': Math.round(h) + ' ' + Math.round(Math.min(sat, 40)) + '% 22%'
    };
    var root = document.documentElement.style;
    Object.keys(vars).forEach(function (k) { root.setProperty(k, vars[k]); });
    var meta = $('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', vars['--c-primary']);
  }

  /* ------------------------------------------------------------------------
     7. SEO-теги и Яндекс Метрика
     ------------------------------------------------------------------------ */

  function setMeta(selector, attr, value) {
    if (!value) return;
    var el = $(selector);
    if (el) el.setAttribute(attr, value);
  }

  function applyMeta(s) {
    var title = s.meta_title || (s.hero_title + ' — ' + s.company_name);
    var desc = s.meta_description || s.hero_subtitle;
    if (document.body.dataset.page !== 'policy') document.title = title;
    setMeta('meta[name="description"]', 'content', desc);
    setMeta('meta[property="og:title"]', 'content', title);
    setMeta('meta[property="og:description"]', 'content', desc);
    if (s.favicon_url) setMeta('link[rel="icon"]', 'href', safeUrl(s.favicon_url));
  }

  var metrikaId = '';

  function initMetrika(id) {
    id = String(id || '').trim();
    if (!/^\d+$/.test(id)) return;
    metrikaId = id;
    /* Официальный код Яндекс Метрики (без вебвизора: он может записывать телефон). */
    (function (m, e, t, r, i) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * new Date();
      var k = e.createElement(t);
      var a = e.getElementsByTagName(t)[0];
      k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, 'script', 'https://mc.yandex.ru/metrika/tag.js', 'ym');
    window.ym(Number(id), 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false });
  }

  var goalsSent = {};
  // Цели: quiz_start, quiz_step_N, quiz_form, lead_sent, lead_failed
  function goal(name) {
    if (goalsSent[name]) return;
    goalsSent[name] = true;
    try { if (metrikaId && window.ym) window.ym(Number(metrikaId), 'reachGoal', name); } catch (e) { /* ничего */ }
  }

  /* ------------------------------------------------------------------------
     8. Расчёт стоимости
     ------------------------------------------------------------------------
     Итог = площадь × (сумма цен «за м²») × множители
          + фиксированные надбавки
          + количество × цена за штуку
     Если в настройках multiplier_applies_to = «всё» — множители применяются
     ко всей сумме (удобно для окон и кухонь).
     ------------------------------------------------------------------------ */

  // Выбранные варианты вопроса: [{ opt, qty }]
  function selectedOptions(q, answer) {
    if (q.type === 'single') {
      var o = q.options.filter(function (x) { return x.id === answer; })[0];
      return o ? [{ opt: o, qty: 1 }] : [];
    }
    if (q.type === 'multi' && answer && typeof answer === 'object') {
      return q.options.filter(function (x) { return x.id in answer; }).map(function (x) {
        var qty = x.priceType === 'piece' ? clamp(Math.round(num(answer[x.id], x.defQty)), 1, x.maxQty) : 1;
        return { opt: x, qty: qty };
      });
    }
    return [];
  }

  function calcPrice(cfg, answers) {
    var s = cfg.settings;
    var area = 0, hasArea = false, perUnit = 0, mult = 1, fixed = 0, pieces = 0;
    var areaQuestion = cfg.questions.some(function (q) { return q.role === 'area'; });

    cfg.questions.forEach(function (q) {
      var a = answers[q.id];
      if (q.type === 'slider' || q.type === 'number') {
        if (q.role === 'area') {
          var v = num(a);
          if (isFinite(v) && v > 0) {
            if (isFinite(q.min)) v = Math.max(v, q.min);
            if (isFinite(q.max)) v = Math.min(v, q.max);
            area = v;
            hasArea = true;
          }
        }
        return;
      }
      selectedOptions(q, a).forEach(function (sel) {
        var o = sel.opt;
        if (o.priceType === 'm2') perUnit += o.value;
        else if (o.priceType === 'mult') mult *= o.value > 0 ? o.value : 1;
        else if (o.priceType === 'fixed') fixed += o.value;
        else if (o.priceType === 'piece') pieces += o.value * sel.qty;
      });
    });

    var applyToAll = /вс|all/i.test(String(s.multiplier_applies_to || ''));
    var total = applyToAll
      ? (area * perUnit + fixed + pieces) * mult
      : area * perUnit * mult + fixed + pieces;
    if (!isFinite(total) || total < 0) total = 0;

    var minOrder = Math.max(0, num(s.min_order, 0));
    var spread = clamp(num(s.price_spread_percent, 15), 0, 90) / 100;
    var round = Math.max(1, num(s.price_round, 100));
    var ready = total > 0 && (hasArea || !areaQuestion);

    var base = minOrder > 0 ? Math.max(total, minOrder) : total;
    var low = base * (1 - spread);
    var high = base * (1 + spread);
    if (minOrder > 0) low = Math.max(low, minOrder);
    low = Math.floor(low / round) * round;
    high = Math.ceil(high / round) * round;
    if (high < low) high = low;

    return {
      ready: ready, total: base, raw: total, low: low, high: high,
      area: area, perUnit: perUnit, mult: mult, fixed: fixed, pieces: pieces,
      minApplied: minOrder > 0 && total < minOrder
    };
  }

  function priceMode(s) {
    var v = String(s.price_display || '').toLowerCase();
    if (/скры|hid|нет/.test(v)) return 'hidden';
    if (/част|partial|mask/.test(v)) return 'partial';
    return 'full';
  }

  // Текст цены. revealed = true после отправки заявки (тогда всегда полностью).
  function priceText(price, s, revealed) {
    if (!price.ready) return '';
    var cur = s.currency || '₽';
    var mode = revealed ? 'full' : priceMode(s);
    if (mode === 'hidden') return '';
    if (mode === 'partial') return 'от ' + maskMoney(price.low) + ' ' + cur;
    if (price.low === price.high) return fmt(price.low) + ' ' + cur;
    return 'от ' + fmt(price.low) + ' до ' + fmt(price.high) + ' ' + cur;
  }

  /* ------------------------------------------------------------------------
     9. Состояние квиза и сохранение прогресса
     ------------------------------------------------------------------------ */

  var cfg = null;          // нормализованные настройки
  var state = {
    index: 0,              // 0..N-1 — вопросы, N — форма контактов
    answers: {},
    done: false,           // показан экран «Спасибо»
    result: null,          // { ok, lead }
    startedAt: 0
  };
  var formShownAt = 0;            // когда показали форму контактов
  var advanceTimer = null;

  function S() { return cfg.settings; }
  function Q() { return cfg.questions; }

  function saveProgress() {
    if (state.done) return;
    storage.set(LS.progress, { sig: cfg.signature, index: state.index, answers: state.answers, ts: Date.now() });
  }

  function restoreProgress() {
    var p = storage.get(LS.progress);
    if (!p || p.sig !== cfg.signature || !p.ts || Date.now() - p.ts > PROGRESS_TTL_MS) return false;
    var answers = {};
    Q().forEach(function (q) {
      var a = p.answers ? p.answers[q.id] : undefined;
      if (a === undefined || a === null) return;
      if (q.type === 'single' && q.options.some(function (o) { return o.id === a; })) answers[q.id] = a;
      if (q.type === 'multi' && typeof a === 'object') {
        var clean = {};
        q.options.forEach(function (o) { if (o.id in a) clean[o.id] = a[o.id]; });
        answers[q.id] = clean;
      }
      if ((q.type === 'slider' || q.type === 'number') && isFinite(num(a))) answers[q.id] = num(a);
    });
    state.answers = answers;
    state.index = clamp(Math.round(num(p.index, 0)), 0, Q().length);
    return state.index > 0 || Object.keys(answers).length > 0;
  }

  function isAnswered(q) {
    var a = state.answers[q.id];
    if (q.type === 'single') return !!a;
    if (q.type === 'multi') return !!a && Object.keys(a).length > 0;
    return isFinite(num(a));
  }

  // Текст ошибки или '' если всё хорошо
  function validateStep(q) {
    var a = state.answers[q.id];
    if (q.type === 'single' && q.required && !a) return 'Выберите один из вариантов';
    if (q.type === 'multi' && q.required && !(a && Object.keys(a).length)) return 'Выберите хотя бы один вариант';
    if (q.type === 'number' || q.type === 'slider') {
      var v = num(a);
      if (!isFinite(v)) return q.required ? 'Введите число' : '';
      if (isFinite(q.min) && v < q.min) return 'Минимальное значение — ' + fmt(q.min) + (q.unit ? ' ' + q.unit : '');
      if (isFinite(q.max) && v > q.max) return 'Максимальное значение — ' + fmt(q.max) + (q.unit ? ' ' + q.unit : '');
    }
    return '';
  }

  // Ответы в человекочитаемом виде: [{ q, a }]
  function answersList() {
    return Q().map(function (q) {
      var a = state.answers[q.id];
      var text = '—';
      if (q.type === 'single' || q.type === 'multi') {
        var sel = selectedOptions(q, a);
        if (sel.length) {
          text = sel.map(function (x) {
            return x.opt.text + (x.opt.priceType === 'piece' && q.type === 'multi' ? ' — ' + x.qty + ' ' + x.opt.unit : '');
          }).join('; ');
        } else if (q.type === 'multi') {
          text = 'ничего не выбрано';
        }
      } else if (isFinite(num(a))) {
        text = String(num(a)).replace('.', ',') + (q.unit ? ' ' + q.unit : '');
      }
      return { q: q.title, a: text, role: q.role };
    });
  }

  /* ------------------------------------------------------------------------
     10. Отрисовка страницы
     ------------------------------------------------------------------------ */

  function phoneHref(phone) {
    var d = String(phone || '').replace(/\D/g, '');
    if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
    return d ? 'tel:+' + d : '';
  }

  // «79991234567», «+7 999…», «wa.me/7999…», «…?phone=7999…» → цифры номера
  function whatsappNumber(v) {
    var s = String(v || '');
    var m = s.match(/wa\.me\/(\d+)/) || s.match(/phone=(\d+)/);
    var d = m ? m[1] : s.replace(/\D/g, '');
    if (d.length === 11 && d[0] === '8') d = '7' + d.slice(1);
    return d.length >= 10 ? d : '';
  }

  function whatsappLink(v, text) {
    var n = whatsappNumber(v);
    if (!n) return '';
    return 'https://wa.me/' + n + (text ? '?text=' + encodeURIComponent(text) : '');
  }

  // «@name», «name», «t.me/name», «https://t.me/name» → ссылка t.me (с текстом, если можно)
  function telegramLink(v, text) {
    var s = String(v || '').trim();
    if (!s) return '';
    var m = s.match(/^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]{4,})\/?$/) || s.match(/^@?([A-Za-z0-9_]{4,})$/);
    if (m) return 'https://t.me/' + m[1] + (text ? '?text=' + encodeURIComponent(text) : '');
    return safeUrl(s); // ссылка-приглашение и т.п. — отдаём как есть, без текста
  }

  function placeholderHTML(text) {
    var letter = esc(String(text || '?').trim().charAt(0).toUpperCase() || '?');
    return '<span class="ph" aria-hidden="true"><span class="ph__letter">' + letter + '</span></span>';
  }

  function renderHeader() {
    var s = S();
    var el = $('#site-header');
    if (!el) return;
    var isPolicy = document.body.dataset.page === 'policy';
    var logo = safeUrl(s.logo_url);
    var tel = phoneHref(s.phone);
    el.innerHTML =
      '<div class="container header__inner">' +
        '<a class="brand" href="' + (isPolicy ? 'index.html' : '#top') + '">' +
          (logo
            ? '<img class="brand__logo" src="' + esc(logo) + '" alt="" width="40" height="40" data-fallback-hide>'
            : '<span class="brand__mark" aria-hidden="true">' + esc(s.company_name.charAt(0)) + '</span>') +
          '<span class="brand__name">' + esc(s.company_name) + '</span>' +
        '</a>' +
        (tel
          ? '<div class="header__contact">' +
              (s.work_hours ? '<span class="header__hours">' + esc(s.work_hours) + '</span>' : '') +
              '<a class="header__phone" href="' + esc(tel) + '" aria-label="Позвонить: ' + esc(s.phone) + '">' +
                '<span class="header__phone-icon">' + ICON.phone + '</span>' +
                '<span class="header__phone-text">' + esc(s.phone) + '</span>' +
              '</a>' +
            '</div>'
          : '') +
      '</div>';
  }

  function benefitHTML(raw) {
    if (!raw) return '';
    var parts = String(raw).split('|');
    var title = parts[0].trim();
    var sub = (parts[1] || '').trim();
    return '<li class="benefit"><span class="benefit__icon">' + ICON.check + '</span>' +
      '<span class="benefit__text"><b>' + esc(title) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</span></li>';
  }

  function renderHero(resumed) {
    var s = S();
    var el = $('#hero-inner');
    if (!el) return;
    var benefits = [s.benefit_1, s.benefit_2, s.benefit_3].map(benefitHTML).join('');
    var cta = resumed && state.index > 0
      ? 'Продолжить расчёт — шаг ' + Math.min(state.index + 1, Q().length + 1)
      : s.cta_text;
    el.innerHTML =
      '<div class="hero__content">' +
        (s.hero_badge ? '<p class="hero__badge">' + ICON.pin + '<span>' + esc(s.hero_badge) + '</span></p>' : '') +
        '<h1 class="hero__title" id="hero-title">' + esc(s.hero_title) + '</h1>' +
        (s.hero_subtitle ? '<p class="hero__subtitle">' + esc(s.hero_subtitle) + '</p>' : '') +
        '<div class="hero__cta">' +
          '<button type="button" class="btn btn--primary btn--lg" data-action="start">' + esc(cta) + ICON.arrowRight + '</button>' +
          (s.cta_note ? '<p class="hero__note">' + esc(s.cta_note) + '</p>' : '') +
        '</div>' +
        (s.gift_text ? '<p class="hero__gift"><span class="hero__gift-icon">' + ICON.gift + '</span><span><b>' + esc(s.gift_title) + ':</b> ' + esc(s.gift_text) + '</span></p>' : '') +
        (benefits ? '<ul class="benefits">' + benefits + '</ul>' : '') +
      '</div>' +
      '<div class="hero__media" id="hero-media" hidden></div>';

    // Картинку первого экрана грузим только на широких экранах — бережём мобильный трафик.
    var img = safeUrl(s.hero_image);
    if (img && window.matchMedia && window.matchMedia('(min-width: 960px)').matches) {
      var media = $('#hero-media');
      media.innerHTML = '<img src="' + esc(img) + '" alt="' + esc(s.company_name) + ': пример работы" width="640" height="480" fetchpriority="high" data-fallback-hide>';
      media.hidden = false;
    }
  }

  function renderQuizShell() {
    var root = $('#quiz-root');
    root.innerHTML =
      '<div class="quiz__card">' +
        '<div class="quiz__main">' +
          '<div class="quiz__progress" id="q-progress"></div>' +
          '<div class="quiz__stage" id="q-stage"></div>' +
          '<div class="quiz__nav" id="q-nav">' +
            '<button type="button" class="btn btn--ghost" data-nav="back">' + ICON.arrowLeft + '<span>Назад</span></button>' +
            '<button type="button" class="btn btn--primary" data-nav="next"><span>Далее</span>' + ICON.arrowRight + '</button>' +
          '</div>' +
        '</div>' +
        '<aside class="quiz__aside" id="q-aside" aria-label="Подарок и предварительная стоимость"></aside>' +
      '</div>';
  }

  function renderProgress() {
    var el = $('#q-progress');
    var n = Q().length;
    if (state.done) { el.innerHTML = ''; el.hidden = true; return; }
    el.hidden = false;
    var i = state.index;
    var label = i < n ? 'Шаг ' + (i + 1) + ' из ' + n : 'Последний шаг — контакты';
    var pct = Math.round((i / n) * 100);
    if (i >= n) pct = 100;
    el.innerHTML =
      '<div class="progress__meta"><span>' + label + '</span><span>' + pct + '%</span></div>' +
      '<div class="progress__bar" role="progressbar" aria-label="Прогресс расчёта" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + pct + '" aria-valuetext="' + esc(label) + '">' +
        '<span style="width:' + pct + '%"></span>' +
      '</div>';
  }

  function renderNav() {
    var nav = $('#q-nav');
    var n = Q().length;
    if (state.done) { nav.hidden = true; return; }
    nav.hidden = false;
    var back = $('[data-nav="back"]', nav);
    var next = $('[data-nav="next"]', nav);
    back.style.visibility = state.index > 0 ? 'visible' : 'hidden';
    back.disabled = state.index === 0;
    next.hidden = state.index >= n;
    $('span', next).textContent = state.index === n - 1 ? 'К результату' : 'Далее';
    nav.classList.toggle('quiz__nav--form', state.index >= n);
  }

  function optionHTML(q, o, selected, grid, oi) {
    var multi = q.type === 'multi';
    var isSel = Object.prototype.hasOwnProperty.call(selected, o.id);
    var domId = 'o' + q.id.replace(/\W/g, '') + '-' + oi;
    var media = '';
    if (grid) {
      media = '<span class="opt__media">' + (o.image
        ? '<img src="' + esc(o.image) + '" alt="' + esc(o.text) + '" loading="lazy" decoding="async" width="400" height="300" data-fallback="' + esc(o.text) + '">'
        : placeholderHTML(o.text)) + '</span>';
    }
    var qty = '';
    if (multi && o.priceType === 'piece') {
      var val = isSel ? selected[o.id] : o.defQty;
      qty =
        '<div class="qty"' + (isSel ? '' : ' hidden') + '>' +
          '<span class="qty__label" id="' + domId + '-ql">Количество</span>' +
          '<div class="qty__ctrl">' +
            '<button type="button" class="qty__btn" data-qty="-1" data-for="' + esc(o.id) + '" aria-label="Уменьшить: ' + esc(o.text) + '">−</button>' +
            '<input class="qty__input" type="number" inputmode="numeric" min="1" max="' + o.maxQty + '" step="1" value="' + esc(val) + '" data-qty-input="' + esc(o.id) + '" aria-labelledby="' + domId + '-ql ' + domId + '-t">' +
            '<span class="qty__unit">' + esc(o.unit) + '</span>' +
            '<button type="button" class="qty__btn" data-qty="1" data-for="' + esc(o.id) + '" aria-label="Увеличить: ' + esc(o.text) + '">+</button>' +
          '</div>' +
        '</div>';
    }
    return '<div class="opt' + (isSel ? ' is-selected' : '') + (grid ? ' opt--card' : ' opt--row') + '" data-opt-wrap="' + esc(o.id) + '">' +
      '<button type="button" class="opt__btn" data-opt="' + esc(o.id) + '" aria-pressed="' + isSel + '" aria-labelledby="' + domId + '-t"' + (o.desc ? ' aria-describedby="' + domId + '-d"' : '') + '>' +
        media +
        '<span class="opt__body"><span class="opt__text" id="' + domId + '-t">' + esc(o.text) + '</span>' +
          (o.desc ? '<span class="opt__desc" id="' + domId + '-d">' + esc(o.desc) + '</span>' : '') +
        '</span>' +
        '<span class="opt__mark' + (multi ? ' opt__mark--square' : '') + '" aria-hidden="true">' + ICON.check + '</span>' +
      '</button>' + qty +
    '</div>';
  }

  function questionHTML(q) {
    var a = state.answers[q.id];
    var body = '';
    var describedBy = q.hint ? ' aria-describedby="step-hint"' : '';

    if (q.type === 'single' || q.type === 'multi') {
      var grid = q.options.some(function (o) { return o.image; });
      var selected = {};
      if (q.type === 'single' && a) selected[a] = 1;
      if (q.type === 'multi' && a) selected = a;
      // Если у вариантов есть количество — на узком экране показываем их строками, иначе «−/+» не влезут
      var hasQty = q.type === 'multi' && q.options.some(function (o) { return o.priceType === 'piece'; });
      body = '<div class="options ' + (grid ? 'options--grid' : 'options--list') + (hasQty ? ' options--qty' : '') + '" data-count="' + q.options.length + '" role="group" aria-labelledby="step-title"' + describedBy + '>' +
        q.options.map(function (o, i) { return optionHTML(q, o, selected, grid, i); }).join('') + '</div>';
    } else if (q.type === 'slider') {
      var v = isFinite(num(a)) ? num(a) : q.def;
      var fill = ((v - q.min) / (q.max - q.min)) * 100;
      body =
        '<div class="range">' +
          '<div class="range__value">' +
            '<input class="range__input" type="number" inputmode="decimal" id="range-input" min="' + q.min + '" max="' + q.max + '" step="' + q.stepSize + '" value="' + v + '" aria-label="' + esc(q.title) + (q.unit ? ', ' + esc(q.unit) : '') + '" data-range-input>' +
            (q.unit ? '<span class="range__unit">' + esc(q.unit) + '</span>' : '') +
          '</div>' +
          '<input class="range__slider" type="range" min="' + q.min + '" max="' + q.max + '" step="' + q.stepSize + '" value="' + v + '" style="--fill:' + fill + '%" aria-labelledby="step-title"' + describedBy + ' aria-valuetext="' + esc(v + (q.unit ? ' ' + q.unit : '')) + '" data-range>' +
          '<div class="range__scale" aria-hidden="true"><span>' + fmt(q.min) + ' ' + esc(q.unit) + '</span><span>' + fmt(q.max) + ' ' + esc(q.unit) + '</span></div>' +
        '</div>';
    } else {
      var nv = isFinite(num(a)) ? num(a) : (isFinite(q.def) ? q.def : '');
      body =
        '<div class="number">' +
          '<button type="button" class="number__btn" data-num="-1" aria-label="Уменьшить">−</button>' +
          '<input class="number__input" type="number" inputmode="decimal" id="number-input"' +
            (isFinite(q.min) ? ' min="' + q.min + '"' : '') + (isFinite(q.max) ? ' max="' + q.max + '"' : '') +
            ' step="' + q.stepSize + '" value="' + esc(nv) + '" aria-labelledby="step-title"' + describedBy + ' data-number>' +
          (q.unit ? '<span class="number__unit">' + esc(q.unit) + '</span>' : '') +
          '<button type="button" class="number__btn" data-num="1" aria-label="Увеличить">+</button>' +
        '</div>';
    }

    return '<div class="step">' +
      '<h2 class="step__title" id="step-title" tabindex="-1" data-focus>' + esc(q.title) +
        (q.required ? '' : ' <span class="step__optional">необязательно</span>') + '</h2>' +
      (q.hint ? '<p class="step__hint" id="step-hint">' + esc(q.hint) + '</p>' : '') +
      body +
      '<p class="step__error" id="step-error" role="alert"></p>' +
    '</div>';
  }

  function contactMethods() {
    return String(S().contact_methods || '').split(/[,;]/).map(function (x) { return x.trim(); }).filter(Boolean);
  }

  function formHTML() {
    var s = S();
    var price = calcPrice(cfg, state.answers);
    var pText = priceText(price, s, false);
    var estimate = price.ready
      ? '<div class="estimate">' +
          '<span class="estimate__label">Предварительная стоимость</span>' +
          (pText ? '<b class="estimate__value">' + esc(pText) + '</b>' : '<b class="estimate__value">Рассчитана — пришлём после отправки</b>') +
          (s.price_note ? '<small class="estimate__note">' + esc(s.price_note) + '</small>' : '') +
        '</div>'
      : '';
    var methods = contactMethods();
    var requireName = isYes(s.require_name);
    var policy = safeUrl(s.policy_url) || 'policy.html';
    var consentHref = policy + (policy.indexOf('#') === -1 ? '#consent' : '');

    return '<div class="step step--form">' +
      '<h2 class="step__title" id="step-title" tabindex="-1" data-focus>' + esc(s.form_title) + '</h2>' +
      (s.form_subtitle ? '<p class="step__hint">' + esc(s.form_subtitle) + '</p>' : '') +
      estimate +
      '<form class="lead-form" id="lead-form" novalidate>' +
        '<div class="field">' +
          '<label class="field__label" for="f-name">Ваше имя' + (requireName ? ' <span class="req" aria-hidden="true">*</span>' : '') + '</label>' +
          '<input class="field__input ym-disable-keys" id="f-name" name="client_name" type="text" autocomplete="name" maxlength="60" placeholder="Например, Анна"' + (requireName ? ' required aria-required="true"' : '') + ' aria-describedby="f-name-err">' +
          '<p class="field__error" id="f-name-err"></p>' +
        '</div>' +
        '<div class="field">' +
          '<label class="field__label" for="f-phone">Телефон <span class="req" aria-hidden="true">*</span></label>' +
          '<input class="field__input ym-disable-keys" id="f-phone" name="client_phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+7 (___) ___-__-__" required aria-required="true" aria-describedby="f-phone-err">' +
          '<p class="field__error" id="f-phone-err"></p>' +
        '</div>' +
        (methods.length
          ? '<fieldset class="field field--chips"><legend class="field__label">Как удобнее связаться?</legend><div class="chips">' +
              methods.map(function (m, i) {
                return '<label class="chip"><input type="radio" name="contact" value="' + esc(m) + '"' + (i === 0 ? ' checked' : '') + '><span>' + esc(m) + '</span></label>';
              }).join('') +
            '</div></fieldset>'
          : '') +
        '<div class="field field--consent">' +
          '<label class="consent">' +
            '<input type="checkbox" name="consent" id="f-consent" required aria-required="true" aria-describedby="f-consent-err">' +
            '<span>' + esc(s.policy_text) + '. ' +
              '<a href="' + esc(consentHref) + '" target="_blank" rel="noopener">Текст согласия</a> · ' +
              '<a href="' + esc(policy) + '" target="_blank" rel="noopener">' + esc(s.policy_link_text) + '</a>' +
            '</span>' +
          '</label>' +
          '<p class="field__error" id="f-consent-err"></p>' +
        '</div>' +
        // Ловушка для спам-ботов: человек это поле не видит и не заполняет.
        '<div class="hp" aria-hidden="true"><label>Ваш сайт<input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>' +
        '<p class="form__error" id="form-error" role="alert"></p>' +
        '<button type="submit" class="btn btn--primary btn--lg btn--block" id="submit-btn"><span>' + esc(s.submit_text) + '</span>' + ICON.arrowRight + '</button>' +
        '<p class="form__secure">' + ICON.lock + '<span>Без спама. Номер нужен только для связи по расчёту</span></p>' +
      '</form>' +
    '</div>';
  }

  function messengerText(lead) {
    var s = S();
    var lines = [s.messenger_greeting, '', 'Мои ответы:'];
    lead.answers.forEach(function (x) { lines.push('— ' + x.q + ' ' + x.a); });
    if (lead.price) lines.push('', 'Предварительная стоимость: ' + lead.price);
    if (lead.name) lines.push('Имя: ' + lead.name);
    if (lead.phone) lines.push('Телефон: ' + lead.phone);
    return lines.join('\n');
  }

  function thanksHTML() {
    var s = S();
    var res = state.result || { ok: false, lead: null };
    var lead = res.lead;
    var price = calcPrice(cfg, state.answers);
    var pText = priceText(price, s, true);
    var text = lead ? messengerText(lead) : '';
    var wa = whatsappLink(s.whatsapp, text);
    var tg = telegramLink(s.telegram, text);
    var tel = phoneHref(s.phone);

    var buttons = '';
    if (wa) buttons += '<a class="btn btn--wa" href="' + esc(wa) + '" target="_blank" rel="noopener">' + ICON.whatsapp + '<span>Написать в WhatsApp</span></a>';
    if (tg) buttons += '<a class="btn btn--tg" href="' + esc(tg) + '" target="_blank" rel="noopener">' + ICON.telegram + '<span>Написать в Telegram</span></a>';
    if (!res.ok && tel) buttons += '<a class="btn btn--ghost" href="' + esc(tel) + '">' + ICON.phone + '<span>Позвонить: ' + esc(s.phone) + '</span></a>';

    return '<div class="thanks">' +
      (res.ok
        ? '<span class="thanks__icon">' + ICON.check + '</span>' +
          '<h2 class="step__title" tabindex="-1" data-focus>' + esc(s.thanks_title) + '</h2>' +
          (s.thanks_text ? '<p class="thanks__text">' + esc(s.thanks_text) + '</p>' : '')
        : '<div class="notice notice--warn" role="alert">' + ICON.alert +
            '<div><h2 class="step__title" tabindex="-1" data-focus>Заявка почти у нас</h2>' +
            '<p>Не получилось отправить её автоматически. Нажмите кнопку ниже — текст заявки уже готов, останется только отправить.</p></div>' +
          '</div>') +
      (pText
        ? '<div class="estimate estimate--big"><span class="estimate__label">Предварительная стоимость</span>' +
            '<b class="estimate__value">' + esc(pText) + '</b>' +
            (s.price_note ? '<small class="estimate__note">' + esc(s.price_note) + '</small>' : '') +
          '</div>'
        : '') +
      (s.gift_text
        ? '<p class="thanks__gift"><span class="hero__gift-icon">' + ICON.gift + '</span><span><b>' + esc(s.gift_title) + (res.ok ? ' закреплён за вами:' : ' — сохраним за вами после отправки:') + '</b> ' + esc(s.gift_text) + '</span></p>'
        : '') +
      (buttons
        ? '<p class="thanks__lead">' + (res.ok ? 'Хотите быстрее? Напишите нам — ваши ответы уже в сообщении:' : 'Отправьте заявку удобным способом:') + '</p>' +
          '<div class="btn-row">' + buttons + '</div>'
        : '') +
      (text ? '<button type="button" class="btn btn--link" data-action="copy">' + ICON.copy + '<span>Скопировать текст заявки</span></button>' : '') +
      '<button type="button" class="btn btn--link" data-action="restart">' + ICON.refresh + '<span>Пройти расчёт заново</span></button>' +
    '</div>';
  }

  function renderAside() {
    var el = $('#q-aside');
    if (!el) return;
    var s = S();
    var n = Q().length;
    var answered = Q().filter(isAnswered).length;
    var progress = state.done || state.index >= n ? 1 : (n ? answered / n : 0);
    var pct = Math.round(progress * 100);
    var discountMax = num(s.gift_discount_percent, 0);
    var status;
    if (state.done) status = state.result && state.result.ok ? 'Подарок закреплён за вами' : 'Подарок сохранится, когда заявка дойдёт до нас';
    else if (progress >= 1) status = 'Подарок открыт! Осталось оставить контакты';
    else if (discountMax > 0) status = 'Уже накоплено: ' + Math.round(discountMax * progress) + '% из ' + discountMax + '%';
    else status = 'Подарок открыт на ' + pct + '%';

    var price = calcPrice(cfg, state.answers);
    var pText = priceText(price, s, state.done);
    var priceBlock;
    if (price.ready && pText) priceBlock = '<b class="aside-price__value">' + esc(pText) + '</b>';
    else if (price.ready) priceBlock = '<span class="aside-price__hint">Стоимость рассчитана — покажем после отправки заявки</span>';
    else priceBlock = '<span class="aside-price__hint">Ответьте на вопросы — здесь появится стоимость</span>';

    el.innerHTML =
      (s.gift_text
        ? '<div class="gift">' +
            '<div class="gift__head"><span class="gift__icon">' + ICON.gift + '</span>' +
              '<div><p class="gift__title">' + esc(s.gift_title) + '</p><p class="gift__text">' + esc(s.gift_text) + '</p></div>' +
            '</div>' +
            '<div class="meter" aria-hidden="true"><span style="width:' + pct + '%"></span></div>' +
            '<p class="gift__status" aria-live="polite">' + esc(status) + '</p>' +
          '</div>'
        : '') +
      '<div class="aside-price"><span class="aside-price__label">Предварительно</span>' + priceBlock + '</div>';
  }

  function renderStep(dir, focus) {
    var stage = $('#q-stage');
    var q = Q()[state.index];
    if (state.done) stage.innerHTML = thanksHTML();
    else if (q) {
      // У ползунка значение есть сразу — сохраняем его как ответ.
      if (q.type === 'slider' && !isFinite(num(state.answers[q.id]))) state.answers[q.id] = q.def;
      stage.innerHTML = questionHTML(q);
    } else stage.innerHTML = formHTML();

    stage.classList.remove('anim-fwd', 'anim-back');
    if (dir && !prefersReducedMotion()) {
      void stage.offsetWidth; // перезапуск CSS-анимации
      stage.classList.add(dir > 0 ? 'anim-fwd' : 'anim-back');
    }
    $('#quiz-root').classList.toggle('is-done', state.done);
    renderProgress();
    renderNav();
    renderAside();
    if (!q && !state.done) { formShownAt = Date.now(); bindForm(); }

    if (focus) {
      var h = $('[data-focus]', stage);
      if (h) h.focus({ preventScroll: true });
      scrollQuizIntoView();
    }
  }

  function scrollQuizIntoView() {
    var root = $('#quiz-root');
    var r = root.getBoundingClientRect();
    if (r.top < 0 || r.top > window.innerHeight * 0.45) {
      root.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    }
  }

  function renderWorks() {
    var el = $('#works');
    if (!el) return;
    var items = cfg.reviews;
    if (!items.length) { el.hidden = true; el.innerHTML = ''; return; }
    el.hidden = false;
    el.innerHTML =
      '<div class="container">' +
        '<h2 class="section-title">' + esc(S().works_title) + '</h2>' +
        '<div class="works__track">' +
          items.map(function (r) {
            var alt = r.caption || (r.name ? 'Работа для клиента: ' + r.name : 'Пример работы');
            return '<figure class="work">' +
              (r.photo ? '<div class="work__media"><img src="' + esc(r.photo) + '" alt="' + esc(alt) + '" loading="lazy" decoding="async" width="600" height="450" data-fallback="' + esc(r.caption || r.name || 'Фото') + '"></div>' : '') +
              '<figcaption class="work__body">' +
                (r.caption ? '<p class="work__caption">' + esc(r.caption) + '</p>' : '') +
                (r.text ? '<blockquote class="work__text">«' + esc(r.text) + '»</blockquote>' : '') +
                (r.name ? '<p class="work__name">' + esc(r.name) + '</p>' : '') +
              '</figcaption>' +
            '</figure>';
          }).join('') +
        '</div>' +
      '</div>';
  }

  function renderFooter() {
    var s = S();
    var el = $('#site-footer');
    if (!el) return;
    var tel = phoneHref(s.phone);
    var wa = whatsappLink(s.whatsapp);
    var tg = telegramLink(s.telegram);
    var legal = [s.legal_name, s.inn ? 'ИНН ' + s.inn : '', s.ogrn ? 'ОГРН ' + s.ogrn : ''].filter(Boolean).join(', ');
    var where = [s.city, s.work_hours].filter(Boolean).join(' · ');
    var policy = safeUrl(s.policy_url) || 'policy.html';
    el.innerHTML =
      '<div class="container footer__inner">' +
        '<div class="footer__col">' +
          '<p class="footer__brand">' + esc(s.company_name) + '</p>' +
          (where ? '<p>' + esc(where) + '</p>' : '') +
          (s.footer_text ? '<p>' + esc(s.footer_text) + '</p>' : '') +
        '</div>' +
        '<div class="footer__col footer__contacts">' +
          (tel ? '<a href="' + esc(tel) + '">' + ICON.phone + '<span>' + esc(s.phone) + '</span></a>' : '') +
          (wa ? '<a href="' + esc(wa) + '" target="_blank" rel="noopener">' + ICON.whatsapp + '<span>WhatsApp</span></a>' : '') +
          (tg ? '<a href="' + esc(tg) + '" target="_blank" rel="noopener">' + ICON.telegram + '<span>Telegram</span></a>' : '') +
        '</div>' +
        '<div class="footer__legal">' +
          (legal ? '<p>' + esc(legal) + '</p>' : '') +
          '<p><a href="' + esc(policy) + '">' + esc(s.policy_link_text) + '</a> · © ' + new Date().getFullYear() + ' ' + esc(s.company_name) + '</p>' +
        '</div>' +
      '</div>';
  }

  /* ------------------------------------------------------------------------
     11. Действия в квизе
     ------------------------------------------------------------------------ */

  function markStarted() {
    if (!state.startedAt) state.startedAt = Date.now();
    goal('quiz_start');
  }

  function goTo(index, dir) {
    clearTimeout(advanceTimer);
    var n = Q().length;
    state.index = clamp(index, 0, n);
    saveProgress();
    renderStep(dir, true);
    goal('quiz_step_' + (state.index + 1));
    if (state.index === n) goal('quiz_form');
  }

  function next() {
    var q = Q()[state.index];
    if (q) {
      var err = validateStep(q);
      if (err) { showStepError(err); return; }
    }
    markStarted();
    goTo(state.index + 1, 1);
  }

  function back() {
    if (state.index > 0) goTo(state.index - 1, -1);
  }

  function showStepError(msg) {
    var el = $('#step-error');
    if (!el) return;
    el.textContent = msg;
    el.classList.remove('shake');
    void el.offsetWidth;
    el.classList.add('shake');
  }

  function clearStepError() {
    var el = $('#step-error');
    if (el) el.textContent = '';
  }

  function findOption(q, id) {
    return q.options.filter(function (o) { return o.id === id; })[0];
  }

  function toggleOption(optId) {
    var q = Q()[state.index];
    if (!q) return;
    var o = findOption(q, optId);
    if (!o) return;
    markStarted();
    clearStepError();

    if (q.type === 'single') {
      state.answers[q.id] = optId;
      $all('[data-opt-wrap]').forEach(function (w) {
        var on = w.getAttribute('data-opt-wrap') === optId;
        w.classList.toggle('is-selected', on);
        $('[data-opt]', w).setAttribute('aria-pressed', String(on));
      });
      saveProgress();
      renderAside();
      if (isYes(S().auto_advance)) {
        clearTimeout(advanceTimer);
        advanceTimer = setTimeout(next, prefersReducedMotion() ? 120 : 380);
      }
      return;
    }

    // Несколько вариантов
    var cur = Object.assign({}, state.answers[q.id] || {});
    var on = !(optId in cur);
    if (on) cur[optId] = o.priceType === 'piece' ? o.defQty : 1;
    else delete cur[optId];
    state.answers[q.id] = cur;
    var wrap = $('[data-opt-wrap="' + cssEscape(optId) + '"]');
    if (wrap) {
      wrap.classList.toggle('is-selected', on);
      $('[data-opt]', wrap).setAttribute('aria-pressed', String(on));
      var qty = $('.qty', wrap);
      if (qty) {
        qty.hidden = !on;
        var inp = $('.qty__input', qty);
        if (inp && on) inp.value = cur[optId];
      }
    }
    saveProgress();
    renderAside();
  }

  function cssEscape(v) {
    return window.CSS && CSS.escape ? CSS.escape(v) : String(v).replace(/["\\]/g, '\\$&');
  }

  function setQty(optId, value) {
    var q = Q()[state.index];
    if (!q || q.type !== 'multi') return;
    var o = findOption(q, optId);
    var cur = state.answers[q.id];
    if (!o || !cur || !(optId in cur)) return;
    var v = clamp(Math.round(num(value, o.defQty)), 1, o.maxQty);
    cur[optId] = v;
    var inp = $('[data-qty-input="' + cssEscape(optId) + '"]');
    if (inp && String(inp.value) !== String(v)) inp.value = v;
    saveProgress();
    renderAside();
  }

  function setRange(value, source) {
    var q = Q()[state.index];
    if (!q) return;
    var v = num(value);
    if (!isFinite(v)) return;
    var clamped = clamp(v, q.min, q.max);
    // Пока человек печатает число — не мешаем ему, ограничим при выходе из поля.
    state.answers[q.id] = source === 'typing' ? v : clamped;
    var slider = $('[data-range]');
    var input = $('[data-range-input]');
    if (slider) {
      slider.value = clamped;
      slider.style.setProperty('--fill', ((clamped - q.min) / (q.max - q.min)) * 100 + '%');
      slider.setAttribute('aria-valuetext', clamped + (q.unit ? ' ' + q.unit : ''));
    }
    if (input && source !== 'typing') input.value = clamped;
    clearStepError();
    markStarted();
    saveProgress();
    renderAside();
  }

  function setNumber(value, commit) {
    var q = Q()[state.index];
    if (!q) return;
    var v = num(value);
    if (!isFinite(v)) { delete state.answers[q.id]; saveProgress(); renderAside(); return; }
    if (commit) {
      if (isFinite(q.min)) v = Math.max(v, q.min);
      if (isFinite(q.max)) v = Math.min(v, q.max);
      var inp = $('[data-number]');
      if (inp) inp.value = v;
    }
    state.answers[q.id] = v;
    clearStepError();
    markStarted();
    saveProgress();
    renderAside();
  }

  function restart() {
    state.answers = {};
    state.index = 0;
    state.done = false;
    state.result = null;
    storage.remove(LS.progress);
    renderStep(-1, true);
  }

  function copyText(text, btn) {
    var done = function () {
      var span = $('span', btn);
      if (span) { var old = span.textContent; span.textContent = 'Скопировано!'; setTimeout(function () { span.textContent = old; }, 2000); }
    };
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, function () { legacyCopy(text); done(); });
    } else { legacyCopy(text); done(); }
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ничего */ }
    document.body.removeChild(ta);
  }

  function bindQuizEvents() {
    var root = $('#quiz-root');

    root.addEventListener('click', function (e) {
      var t = e.target.closest('button, a');
      if (!t || !root.contains(t)) return;
      if (t.hasAttribute('data-opt')) { toggleOption(t.getAttribute('data-opt')); return; }
      if (t.hasAttribute('data-qty')) {
        var id = t.getAttribute('data-for');
        var q = Q()[state.index];
        var cur = q && state.answers[q.id];
        if (cur && id in cur) setQty(id, num(cur[id], 1) + Number(t.getAttribute('data-qty')));
        return;
      }
      if (t.hasAttribute('data-num')) {
        var qn = Q()[state.index];
        var base = num(state.answers[qn.id]);
        if (!isFinite(base)) base = isFinite(qn.def) ? qn.def : (isFinite(qn.min) ? qn.min : 0);
        else base += Number(t.getAttribute('data-num')) * qn.stepSize;
        setNumber(base, true);
        return;
      }
      var nav = t.getAttribute('data-nav');
      if (nav === 'next') { next(); return; }
      if (nav === 'back') { back(); return; }
      var action = t.getAttribute('data-action');
      if (action === 'restart') restart();
      if (action === 'copy' && state.result && state.result.lead) copyText(messengerText(state.result.lead), t);
    });

    root.addEventListener('input', function (e) {
      var t = e.target;
      if (t.hasAttribute('data-range')) setRange(t.value, 'slider');
      else if (t.hasAttribute('data-range-input')) setRange(t.value, 'typing');
      else if (t.hasAttribute('data-number')) setNumber(t.value, false);
    });

    root.addEventListener('change', function (e) {
      var t = e.target;
      if (t.hasAttribute('data-qty-input')) setQty(t.getAttribute('data-qty-input'), t.value);
      else if (t.hasAttribute('data-range-input')) setRange(t.value, 'commit');
      else if (t.hasAttribute('data-number')) setNumber(t.value, true);
    });

    // Enter в числовом поле = «Далее»
    root.addEventListener('keydown', function (e) {
      var t = e.target;
      if (e.key === 'Enter' && (t.hasAttribute('data-range-input') || t.hasAttribute('data-number'))) {
        e.preventDefault();
        if (t.hasAttribute('data-range-input')) setRange(t.value, 'commit'); else setNumber(t.value, true);
        next();
      }
    });
  }

  /* ------------------------------------------------------------------------
     12. Форма контактов: маска телефона, проверка, отправка
     ------------------------------------------------------------------------ */

  // Цифры номера без кода страны (максимум 10): «+7 (999) 123-45-67» → «9991234567»
  function phoneDigits(raw) {
    var s = String(raw || '');
    var d = s.replace(/\D/g, '');
    if (/^\s*\+\s*7/.test(s)) d = d.slice(1);               // наш префикс «+7»
    else if (d.length >= 11 && /^[78]/.test(d)) d = d.slice(1); // «8 999 …» или «7 999 …»
    if (d.length >= 11 && /^[78]/.test(d)) d = d.slice(1);      // вставили «8999…» после «+7 (»
    return d.slice(0, 10);
  }

  function formatPhone(digits) {
    if (!digits) return '';
    var out = '+7 (' + digits.slice(0, 3);
    if (digits.length > 3) out += ') ' + digits.slice(3, 6);
    if (digits.length > 6) out += '-' + digits.slice(6, 8);
    if (digits.length > 8) out += '-' + digits.slice(8, 10);
    return out;
  }

  // Маска +7 (___) ___-__-__ без сторонних библиотек
  function bindPhoneMask(input) {
    var prev = phoneDigits(input.value);
    input.addEventListener('focus', function () {
      if (!input.value) input.value = '+7 (';
    });
    input.addEventListener('blur', function () {
      if (!phoneDigits(input.value)) input.value = '';
    });
    input.addEventListener('input', function (e) {
      var raw = input.value;
      var caret = input.selectionStart == null ? raw.length : input.selectionStart;
      // Сколько цифр номера стоит до курсора (без «7» из префикса)
      var digitsBefore = raw.slice(0, caret).replace(/\D/g, '').length - (/^\s*\+\s*7/.test(raw) ? 1 : 0);
      var d = phoneDigits(raw);
      var type = e.inputType || '';
      // Стёрли скобку, пробел или дефис — значит, на самом деле хотели стереть цифру перед ними
      if (type === 'deleteContentBackward' && d === prev && digitsBefore > 0) {
        d = d.slice(0, digitsBefore - 1) + d.slice(digitsBefore);
        digitsBefore--;
      }
      prev = d;
      if (type.indexOf('delete') === 0 && !d) { input.value = ''; return; }
      input.value = formatPhone(d) || '+7 (';
      // Ставим курсор после той же по счёту цифры
      var pos = input.value.length;
      if (digitsBefore <= 0) pos = 4;
      else if (digitsBefore < d.length) {
        var count = 0;
        for (var i = 4; i < input.value.length; i++) {
          if (/\d/.test(input.value[i])) count++;
          if (count === digitsBefore) { pos = i + 1; break; }
        }
      }
      try { input.setSelectionRange(pos, pos); } catch (err) { /* ничего */ }
      setFieldError(input, '');
    });
  }

  function setFieldError(input, msg) {
    var err = document.getElementById(input.id + '-err');
    if (err) err.textContent = msg;
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  }

  function bindForm() {
    var form = $('#lead-form');
    if (!form) return;
    var phone = $('#f-phone', form);
    bindPhoneMask(phone);
    $('#f-name', form).addEventListener('input', function (e) { setFieldError(e.target, ''); });
    $('#f-consent', form).addEventListener('change', function (e) { setFieldError(e.target, ''); });
    form.addEventListener('submit', onSubmit);
  }

  // UTM-метки: запоминаем при заходе на сайт (последнее касание с метками).
  var UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'yclid', 'gclid'];

  function captureUtm() {
    var params;
    try { params = new URLSearchParams(window.location.search); } catch (e) { return; }
    var utm = {};
    UTM_KEYS.forEach(function (k) { var v = params.get(k); if (v) utm[k] = v.slice(0, 200); });
    var saved = storage.get(LS.utm);
    if (Object.keys(utm).length) {
      storage.set(LS.utm, { utm: utm, referrer: document.referrer || '', landing: window.location.href, ts: Date.now() });
    } else if (!saved && document.referrer) {
      storage.set(LS.utm, { utm: {}, referrer: document.referrer, landing: window.location.href, ts: Date.now() });
    }
  }

  function deviceInfo() {
    var ua = navigator.userAgent || '';
    var iPadOS = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    var tablet = /iPad|Tablet/i.test(ua) || iPadOS;
    var mobile = !tablet && /Mobi|Android|iPhone|iPod/i.test(ua);
    var os = /Android/.test(ua) ? 'Android'
      : (/iPhone|iPad|iPod/.test(ua) || iPadOS) ? 'iOS'
      : /Windows/.test(ua) ? 'Windows'
      : /Mac OS X/.test(ua) ? 'macOS'
      : /Linux/.test(ua) ? 'Linux' : 'другая ОС';
    var browser = /YaBrowser/.test(ua) ? 'Яндекс Браузер'
      : /Edg\//.test(ua) ? 'Edge'
      : /OPR\//.test(ua) ? 'Opera'
      : /SamsungBrowser/.test(ua) ? 'Samsung Internet'
      : /Firefox\//.test(ua) ? 'Firefox'
      : /Chrome\//.test(ua) ? 'Chrome'
      : /Safari\//.test(ua) ? 'Safari' : 'другой браузер';
    return (tablet ? 'Планшет' : mobile ? 'Телефон' : 'Компьютер') + ', ' + os + ', ' + browser +
      ', экран ' + window.screen.width + '×' + window.screen.height;
  }

  function buildLead(form) {
    var s = S();
    var price = calcPrice(cfg, state.answers);
    var answers = answersList();
    var urgency = answers.filter(function (x) { return x.role === 'urgency'; })[0];
    var utm = storage.get(LS.utm) || {};
    var contact = form.querySelector('input[name="contact"]:checked');
    return {
      company: s.company_name,
      name: form.elements.client_name.value.trim().slice(0, 60),
      phone: formatPhone(phoneDigits(form.elements.client_phone.value)),
      contact_method: contact ? contact.value : '',
      answers: answers.map(function (x) { return { q: x.q, a: x.a }; }),
      price: priceText(price, s, true),
      price_low: price.low,
      price_high: price.high,
      urgency: urgency ? urgency.a : '',
      client_time: new Date().toLocaleString('ru-RU'),
      device: deviceInfo(),
      page: window.location.href.split('#')[0],
      referrer: utm.referrer || document.referrer || '',
      utm: utm.utm || {},
      website: form.elements.website.value // ловушка: у людей всегда пусто
    };
  }

  function leadPlainText(lead) {
    var lines = [
      'Новая заявка с квиза — ' + lead.company,
      'Имя: ' + (lead.name || 'не указано'),
      'Телефон: ' + lead.phone,
      'Способ связи: ' + (lead.contact_method || '—'),
      'Стоимость: ' + (lead.price || '—'),
      'Срочность: ' + (lead.urgency || '—'),
      '',
      'Ответы:'
    ];
    lead.answers.forEach(function (x, i) { lines.push((i + 1) + '. ' + x.q + ' — ' + x.a); });
    lines.push('', 'Время клиента: ' + lead.client_time, 'Устройство: ' + lead.device, 'Страница: ' + lead.page);
    if (lead.referrer) lines.push('Откуда пришёл: ' + lead.referrer);
    var utm = Object.keys(lead.utm || {}).map(function (k) { return k + '=' + lead.utm[k]; }).join(', ');
    if (utm) lines.push('UTM: ' + utm);
    return lines.join('\n');
  }

  function postJSON(url, data) {
    return fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(data)
    }, SEND_TIMEOUT_MS).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (json) { return { ok: r.ok, json: json }; });
    }).catch(function () { return { ok: false, json: {} }; });
  }

  function sendToWorker(lead) {
    var url = safeUrl(S().worker_url);
    if (!/^https?:/i.test(url)) return Promise.resolve(false);
    return postJSON(url, lead).then(function (r) { return r.ok && r.json.ok !== false; });
  }

  function sendToEmail(lead) {
    var key = String(S().web3forms_key || '').trim();
    if (!key) return Promise.resolve(false);
    return postJSON('https://api.web3forms.com/submit', {
      access_key: key,
      subject: 'Заявка с квиза: ' + lead.phone + (lead.price ? ' — ' + lead.price : ''),
      from_name: lead.company || 'Квиз',
      name: lead.name || 'Без имени',
      phone: lead.phone,
      message: leadPlainText(lead),
      botcheck: ''
    }).then(function (r) { return r.ok && r.json.success !== false; });
  }

  // e-mail: «выкл» — не отправлять; «резерв» — только если Telegram не сработал; «всегда» — дублировать
  function emailMode() {
    var v = String(S().email_mode || '').toLowerCase();
    if (/всегда|always|дубл/.test(v)) return 'always';
    if (/резерв|backup|fallback|да|вкл/.test(v)) return 'backup';
    return 'off';
  }

  function sendLead(lead) {
    var mode = emailMode();
    var hasWorker = /^https?:/i.test(safeUrl(S().worker_url));
    var hasEmail = mode !== 'off' && !!String(S().web3forms_key || '').trim();
    if (!hasWorker && !hasEmail) {
      console.warn('[Квиз] Не настроен ни один канал отправки (worker_url / web3forms_key). Клиенту будут показаны кнопки мессенджеров.');
      return Promise.resolve(false);
    }
    if (mode === 'always') {
      return Promise.all([sendToWorker(lead), hasEmail ? sendToEmail(lead) : false]).then(function (r) { return r[0] || r[1]; });
    }
    return sendToWorker(lead).then(function (ok) {
      if (ok || !hasEmail) return ok;
      return sendToEmail(lead);
    });
  }

  function cooldownLeft() {
    var last = num(storage.get(LS.lastLead), 0);
    var cd = Math.max(0, num(S().lead_cooldown_sec, 60)) * 1000;
    return Math.ceil(Math.max(0, last + cd - Date.now()) / 1000);
  }

  function onSubmit(e) {
    e.preventDefault();
    var form = e.target;
    var s = S();
    var nameInput = form.elements.client_name;
    var phoneInput = form.elements.client_phone;
    var consent = form.elements.consent;
    var formError = $('#form-error');
    formError.textContent = '';
    var firstInvalid = null;

    if (isYes(s.require_name) && nameInput.value.trim().length < 2) {
      setFieldError(nameInput, 'Как к вам обращаться?');
      firstInvalid = firstInvalid || nameInput;
    }
    var digits = phoneDigits(phoneInput.value);
    if (digits.length !== 10) {
      setFieldError(phoneInput, digits.length ? 'Номер неполный — нужно 10 цифр после +7' : 'Укажите телефон, чтобы получить расчёт');
      firstInvalid = firstInvalid || phoneInput;
    } else if (!/^[3-9]/.test(digits)) {
      setFieldError(phoneInput, 'Проверьте номер: после +7 обычно идёт 9, 4, 8 или 3');
      firstInvalid = firstInvalid || phoneInput;
    }
    if (!consent.checked) {
      setFieldError(consent, 'Без согласия мы не можем принять заявку');
      firstInvalid = firstInvalid || consent;
    }
    if (firstInvalid) { firstInvalid.focus(); return; }

    var wait = cooldownLeft();
    if (wait > 0) {
      formError.textContent = 'Вы уже отправили заявку. Повторно можно через ' + wait + ' сек.';
      return;
    }

    var btn = $('#submit-btn');
    btn.disabled = true;
    btn.classList.add('is-loading');
    $('span', btn).textContent = 'Отправляем…';

    var lead = buildLead(form);
    var isBot = !!lead.website || Date.now() - formShownAt < MIN_HUMAN_TIME_MS;
    // Боту показываем «успех», но ничего не отправляем.
    var sending = isBot ? Promise.resolve(true) : sendLead(lead);

    sending.then(function (ok) {
      if (ok && !isBot) storage.set(LS.lastLead, Date.now());
      delete lead.website;
      state.result = { ok: ok, lead: lead };
      state.done = true;
      storage.remove(LS.progress);
      goal(ok ? 'lead_sent' : 'lead_failed');
      renderStep(1, true);
    });
  }

  /* ------------------------------------------------------------------------
     13. Картинки, которые не загрузились
     ------------------------------------------------------------------------ */

  function bindImageFallbacks() {
    document.addEventListener('error', function (e) {
      var img = e.target;
      if (!img || img.tagName !== 'IMG') return;
      if (img.hasAttribute('data-fallback-hide')) {
        var media = img.closest('.hero__media');
        if (media) media.hidden = true;
        else img.style.display = 'none';
        if (img.classList.contains('brand__logo')) {
          var mark = document.createElement('span');
          mark.className = 'brand__mark';
          mark.setAttribute('aria-hidden', 'true');
          mark.textContent = (cfg ? S().company_name : '?').charAt(0);
          img.replaceWith(mark);
        }
        return;
      }
      if (img.hasAttribute('data-fallback')) {
        var wrap = document.createElement('span');
        wrap.innerHTML = placeholderHTML(img.getAttribute('data-fallback'));
        img.replaceWith(wrap.firstChild);
      }
    }, true);
  }

  /* ------------------------------------------------------------------------
     14. Страница политики: подставляем реквизиты из настроек
     ------------------------------------------------------------------------ */

  function fillPolicy() {
    var s = S();
    $all('[data-s]').forEach(function (el) {
      var key = el.getAttribute('data-s');
      var origin = /^https?:/.test(window.location.origin) ? window.location.origin + '/' : '';
      var val = key === 'site' ? origin : s[key];
      if (val) {
        el.textContent = val;
        el.classList.remove('fill-me');
      } else {
        el.classList.add('fill-me');
      }
    });
  }

  /* ------------------------------------------------------------------------
     15. Запуск
     ------------------------------------------------------------------------ */

  function showFatal() {
    var root = $('#quiz-root');
    var hero = $('#hero-inner');
    if (hero) hero.innerHTML = '<div class="hero__content"><h1 class="hero__title">Калькулятор временно недоступен</h1><p class="hero__subtitle">Обновите страницу через минуту.</p></div>';
    if (root) root.innerHTML = '';
  }

  function renderAll(resumed) {
    applyTheme(S().primary_color);
    applyMeta(S());
    renderHeader();
    renderFooter();
    if (document.body.dataset.page === 'policy') { fillPolicy(); return; }
    renderHero(resumed);
    renderQuizShell();
    renderStep(0, false);
    renderWorks();
  }

  function start() {
    bindImageFallbacks();
    captureUtm();

    loadConfig().then(function (res) {
      if (!res.raw) { showFatal(); return; }
      cfg = normalizeConfig(res.raw);
      if (!Q().length && document.body.dataset.page !== 'policy') {
        console.error('[Квиз] В настройках нет ни одного вопроса.');
        showFatal();
        return;
      }
      console.info('[Квиз] Настройки загружены, источник: ' + res.source);
      var resumed = document.body.dataset.page !== 'policy' && restoreProgress();
      renderAll(resumed);
      document.documentElement.classList.add('is-ready');

      if (document.body.dataset.page !== 'policy') {
        bindQuizEvents();
        initMetrika(S().yandex_metrika_id);
        document.addEventListener('click', function (e) {
          var t = e.target.closest('[data-action="start"]');
          if (!t) return;
          markStarted();
          goal('quiz_step_' + (state.index + 1));
          scrollQuizIntoView();
          var h = $('[data-focus]', $('#q-stage'));
          if (h) h.focus({ preventScroll: true });
        });
      }

      // Свежие данные из таблицы пришли фоном: применяем, если клиент ещё не начал квиз.
      if (res.refresh) {
        res.refresh.then(function (raw) {
          if (!raw) return;
          var fresh = normalizeConfig(raw);
          var untouched = !state.startedAt && !Object.keys(state.answers).length && !state.done;
          if (untouched || fresh.signature === cfg.signature) {
            cfg = fresh;
            if (untouched) renderAll(false);
            else { applyTheme(S().primary_color); renderAside(); }
            console.info('[Квиз] Применены свежие данные из Google Таблицы');
          }
        });
      }
    }).catch(function (e) {
      console.error('[Квиз] Ошибка запуска:', e);
      showFatal();
    });
  }

  // Для проверки в консоли браузера и для автотестов
  window.QuizApp = {
    parseCSV: parseCSV,
    rowsToObjects: rowsToObjects,
    normalizeConfig: normalizeConfig,
    calcPrice: calcPrice,
    formatPhone: formatPhone,
    phoneDigits: phoneDigits,
    maskMoney: maskMoney,
    getState: function () { return { cfg: cfg, state: state }; }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
