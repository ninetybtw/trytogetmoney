/* Копия config.json для просмотра сайта без сервера (двойной клик по index.html).
   Браузер не разрешает читать config.json с диска, а этот файл — может.
   Если меняете config.json — замените всё после «window.QUIZ_CONFIG =» его содержимым. */
window.QUIZ_CONFIG = {
  "_readme": "Запасные настройки сайта. Если заполнен раздел sheets (ссылки на опубликованную Google Таблицу), сайт берёт данные оттуда, а этот файл использует, только если таблица недоступна. Описание всех полей — в README.md.",
  "sheets": {
    "settings": "",
    "questions": "",
    "options": "",
    "reviews": ""
  },
  "settings": {
    "company_name": "ПотолокПро",
    "logo_url": "img/logo.svg",
    "phone": "+7 (999) 123-45-67",
    "whatsapp": "79991234567",
    "telegram": "potolokpro_demo",
    "primary_color": "#3A5BD9",
    "hero_badge": "Натяжные потолки в Москве и области",
    "hero_title": "Рассчитайте стоимость натяжного потолка за 1 минуту",
    "hero_subtitle": "Ответьте на 6 простых вопросов — покажем цену и закрепим за вами подарок. Звоним, только если вы сами попросите.",
    "hero_image": "img/hero.svg",
    "cta_text": "Рассчитать стоимость",
    "cta_note": "Бесплатно · 1 минута · без регистрации",
    "benefit_1": "Гарантия 15 лет|на полотно и монтаж",
    "benefit_2": "Замер бесплатно|в удобный день, даже в выходные",
    "benefit_3": "Монтаж за 1 день|без пыли и переезда мебели",
    "gift_title": "Ваш подарок",
    "gift_text": "Скидка 10% + светильник в подарок",
    "gift_discount_percent": "10",
    "city": "Москва и область",
    "work_hours": "Ежедневно 9:00–21:00",
    "currency": "₽",
    "min_order": "9900",
    "price_spread_percent": "15",
    "price_round": "100",
    "price_display": "частично",
    "multiplier_applies_to": "площадь",
    "price_note": "Точную стоимость мастер назовёт после бесплатного замера",
    "form_title": "Ваш расчёт готов!",
    "form_subtitle": "Оставьте телефон — пришлём точную смету и закрепим за вами подарок",
    "submit_text": "Получить расчёт и подарок",
    "require_name": "нет",
    "contact_methods": "Звонок, WhatsApp, Telegram",
    "policy_text": "Я даю согласие на обработку персональных данных",
    "policy_link_text": "Политика конфиденциальности",
    "policy_url": "policy.html",
    "thanks_title": "Спасибо! Заявка принята",
    "thanks_text": "Мастер перезвонит в течение 15 минут в рабочее время и согласует день бесплатного замера.",
    "messenger_greeting": "Здравствуйте! Я рассчитал(а) стоимость натяжного потолка на сайте.",
    "worker_url": "",
    "email_mode": "выкл",
    "web3forms_key": "",
    "lead_cooldown_sec": "60",
    "auto_advance": "да",
    "yandex_metrika_id": "",
    "meta_title": "Калькулятор натяжных потолков — ПотолокПро",
    "meta_description": "Рассчитайте стоимость натяжного потолка за 1 минуту. Бесплатный замер, гарантия 15 лет, монтаж за 1 день.",
    "favicon_url": "img/favicon.svg",
    "works_title": "Наши работы и отзывы",
    "footer_text": "",
    "legal_name": "",
    "inn": "",
    "ogrn": "",
    "legal_address": "",
    "email": ""
  },
  "questions": [
    {
      "step": "1",
      "title": "Сколько помещений нужно сделать?",
      "type": "один вариант",
      "required": "да",
      "hint": "Посчитайте все комнаты, где нужен потолок",
      "role": ""
    },
    {
      "step": "2",
      "title": "Какая общая площадь потолков?",
      "type": "ползунок",
      "required": "да",
      "hint": "Примерно — достаточно сложить площади комнат. Точно измерит мастер",
      "min": "5",
      "max": "200",
      "step_size": "1",
      "default": "20",
      "unit": "м²",
      "role": "площадь"
    },
    {
      "step": "3",
      "title": "Какое полотно вам нравится?",
      "type": "один вариант",
      "required": "да",
      "hint": "Не уверены — выбирайте матовое, это самый популярный вариант",
      "role": ""
    },
    {
      "step": "4",
      "title": "Что добавить к потолку?",
      "type": "несколько вариантов",
      "required": "нет",
      "hint": "Можно выбрать несколько или пропустить этот шаг",
      "role": ""
    },
    {
      "step": "5",
      "title": "Нужен ли демонтаж старого потолка?",
      "type": "один вариант",
      "required": "да",
      "hint": "",
      "role": ""
    },
    {
      "step": "6",
      "title": "Когда планируете монтаж?",
      "type": "один вариант",
      "required": "да",
      "hint": "Ближайшие даты замера разбирают быстро",
      "role": "срочность"
    }
  ],
  "options": [
    {
      "step": "1",
      "text": "1 помещение",
      "image": "",
      "price_type": "фикс",
      "value": "0",
      "description": ""
    },
    {
      "step": "1",
      "text": "2 помещения",
      "image": "",
      "price_type": "фикс",
      "value": "1500",
      "description": ""
    },
    {
      "step": "1",
      "text": "3 помещения",
      "image": "",
      "price_type": "фикс",
      "value": "3000",
      "description": ""
    },
    {
      "step": "1",
      "text": "4 и больше",
      "image": "",
      "price_type": "фикс",
      "value": "4500",
      "description": ""
    },
    {
      "step": "3",
      "text": "Матовое",
      "image": "img/canvas-matte.svg",
      "price_type": "за м2",
      "value": "590",
      "description": "Как идеально ровная побелка"
    },
    {
      "step": "3",
      "text": "Глянцевое",
      "image": "img/canvas-glossy.svg",
      "price_type": "за м2",
      "value": "690",
      "description": "Зеркальный блеск, комната кажется выше"
    },
    {
      "step": "3",
      "text": "Сатиновое",
      "image": "img/canvas-satin.svg",
      "price_type": "за м2",
      "value": "750",
      "description": "Мягкий перламутровый отлив"
    },
    {
      "step": "3",
      "text": "Тканевое",
      "image": "img/canvas-fabric.svg",
      "price_type": "за м2",
      "value": "1450",
      "description": "Премиум: «дышит», не боится холода"
    },
    {
      "step": "4",
      "text": "Точечные светильники",
      "image": "img/extra-spots.svg",
      "price_type": "за штуку",
      "value": "450",
      "description": "Установка и подключение",
      "unit": "шт",
      "default_qty": "6",
      "max_qty": "60"
    },
    {
      "step": "4",
      "text": "Световые линии",
      "image": "img/extra-lines.svg",
      "price_type": "за штуку",
      "value": "2500",
      "description": "Цена за погонный метр",
      "unit": "м",
      "default_qty": "3",
      "max_qty": "60"
    },
    {
      "step": "4",
      "text": "Парящий потолок",
      "image": "img/extra-floating.svg",
      "price_type": "множитель",
      "value": "1,25",
      "description": "Подсветка по всему периметру"
    },
    {
      "step": "4",
      "text": "Ниша под шторы",
      "image": "img/extra-niche.svg",
      "price_type": "за штуку",
      "value": "1900",
      "description": "Скрытый карниз, цена за метр",
      "unit": "м",
      "default_qty": "3",
      "max_qty": "40"
    },
    {
      "step": "4",
      "text": "Обход трубы",
      "image": "img/extra-pipe.svg",
      "price_type": "за штуку",
      "value": "350",
      "description": "Аккуратная обработка вокруг трубы",
      "unit": "шт",
      "default_qty": "1",
      "max_qty": "20"
    },
    {
      "step": "5",
      "text": "Да, нужен демонтаж",
      "image": "",
      "price_type": "за м2",
      "value": "150",
      "description": "Снимем старый потолок и вывезем мусор"
    },
    {
      "step": "5",
      "text": "Нет, потолок чистый",
      "image": "",
      "price_type": "нет",
      "value": "0",
      "description": ""
    },
    {
      "step": "5",
      "text": "Не знаю — подскажет мастер",
      "image": "",
      "price_type": "нет",
      "value": "0",
      "description": ""
    },
    {
      "step": "6",
      "text": "В ближайшую неделю",
      "image": "",
      "price_type": "нет",
      "value": "0",
      "description": ""
    },
    {
      "step": "6",
      "text": "В этом месяце",
      "image": "",
      "price_type": "нет",
      "value": "0",
      "description": ""
    },
    {
      "step": "6",
      "text": "Через 1–3 месяца",
      "image": "",
      "price_type": "нет",
      "value": "0",
      "description": ""
    },
    {
      "step": "6",
      "text": "Пока присматриваюсь",
      "image": "",
      "price_type": "нет",
      "value": "0",
      "description": ""
    }
  ],
  "reviews": [
    {
      "photo": "img/work-1.svg",
      "caption": "Гостиная 24 м², глянец + световые линии",
      "name": "Марина, ЖК «Символ»",
      "text": "Сделали за один день, мебель даже не пришлось выносить. Линии смотрятся как в журнале."
    },
    {
      "photo": "img/work-2.svg",
      "caption": "Спальня 14 м², сатин + парящий контур",
      "name": "Алексей, Химки",
      "text": "Цена на замере совпала с калькулятором, светильник подарили, как и обещали."
    },
    {
      "photo": "img/work-3.svg",
      "caption": "Кухня 9 м², матовое полотно + 6 светильников",
      "name": "Ольга, Люберцы",
      "text": ""
    },
    {
      "photo": "img/work-4.svg",
      "caption": "Детская 12 м², тканевый потолок",
      "name": "Игорь и Света, Москва",
      "text": "Брали тканевый — никакого запаха, ребёнок спит в комнате с первого дня."
    }
  ]
};
