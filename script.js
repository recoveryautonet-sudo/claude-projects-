/* =====================================================================
   Юнит-Экономика PRO  —  script.js
   Чистый JavaScript. Без внешних библиотек. Работает офлайн.
   Хранение проектов: IndexedDB.  Настройки интерфейса: LocalStorage.
   ===================================================================== */
(function () {
"use strict";

/* =========================================================
   0. УТИЛИТЫ
   ========================================================= */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const el = (tag, attrs = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") n.className = v;
    else if (k === "html") n.innerHTML = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    n.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return n;
};
const num = (x) => { const n = parseFloat(String(x).replace(",", ".")); return isFinite(n) ? n : 0; };
const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
const uid = () => "p_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const nfRu = (max = 2) => new Intl.NumberFormat("ru-RU", { minimumFractionDigits: 0, maximumFractionDigits: max });
function money(x, dec) {
  if (!isFinite(x)) return "—";
  const d = dec === undefined ? (UI.roundRub ? 0 : 2) : dec;
  return nfRu(d).format(x) + " ₽";
}
function moneyC(x, cur) {
  if (!isFinite(x)) return "—";
  const sym = { CNY: "¥", USD: "$", EUR: "€", RUB: "₽" }[cur] || cur;
  return nfRu(2).format(x) + " " + sym;
}
const numfmt = (x, d = 2) => isFinite(x) ? nfRu(d).format(x) : "—";
const pct = (x, d = 1) => isFinite(x) ? nfRu(d).format(x) + " %" : "—";
const dateStr = (ts) => new Date(ts).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

const CUR_LIST = ["CNY", "USD", "EUR", "RUB"];
const ACCENTS = ["#4f7cff", "#2ecc8f", "#f0b429", "#ff5c6c", "#a06bff", "#19b5d6", "#ff8a3d", "#e84393", "#26de81", "#778ca3"];

/* =========================================================
   1. ПРЕСЕТЫ МАРКЕТПЛЕЙСОВ (типовые значения, редактируются)
   ========================================================= */
const MP_LIST = [
  { id: "wb",   name: "Wildberries" },
  { id: "ozon", name: "Ozon" },
  { id: "ya",   name: "Яндекс Маркет" },
  { id: "mega", name: "Мегамаркет" },
];
const MP_PRESETS = {
  wb:   { sellPrice: 1490, commissionPct: 22, logistics: 75, returnLogistics: 60, storage: 2.0, acceptance: 15, acquiringPct: 1.5, advertising: 40, drrPct: 8, promoPct: 3, discountPct: 0, buyoutPct: 88, utilization: 33, defectPct: 1.5, lossPct: 1 },
  ozon: { sellPrice: 1590, commissionPct: 18, logistics: 90, returnLogistics: 70, storage: 3.0, acceptance: 20, acquiringPct: 1.5, advertising: 45, drrPct: 9, promoPct: 3, discountPct: 0, buyoutPct: 90, utilization: 35, defectPct: 1.5, lossPct: 1 },
  ya:   { sellPrice: 1550, commissionPct: 15, logistics: 80, returnLogistics: 65, storage: 2.5, acceptance: 18, acquiringPct: 1.3, advertising: 35, drrPct: 7, promoPct: 2, discountPct: 0, buyoutPct: 91, utilization: 30, defectPct: 1.2, lossPct: 1 },
  mega: { sellPrice: 1520, commissionPct: 12, logistics: 85, returnLogistics: 65, storage: 2.5, acceptance: 18, acquiringPct: 1.3, advertising: 30, drrPct: 6, promoPct: 2, discountPct: 0, buyoutPct: 89, utilization: 30, defectPct: 1.2, lossPct: 1 },
};

/* =========================================================
   2. СХЕМА ПОЛЕЙ ПРОЕКТА (значения по умолчанию + подсказки)
   Тип: text, num, pct, cur(валютное), select, check
   ========================================================= */
function F(k, label, opts = {}) { return Object.assign({ k, label, type: "num", def: 0 }, opts); }

const SETTINGS_FIELDS = [
  F("vatRate", "Ставка НДС", { type: "pct", def: 20, tip: "Исходящий и таможенный НДС. ОСНО: обычно 20%, льготно 10%." }),
  F("profitRate", "Налог на прибыль", { type: "pct", def: 25, tip: "С 2025 г. ставка налога на прибыль для ОСНО — 25%." }),
  F("targetRos", "Целевая чистая рент-сть", { type: "pct", def: 20, tip: "Используется для расчёта рекомендуемой цены." }),
];

// Блоки. module: имя поля-флага в data, при false секция показывает подсказку включения.
const SECTIONS = [
  { id: "dashboard", num: "★", icon: "📊", title: "Дашборд собственника", custom: "dashboard" },
  {
    id: "settings", num: "⚙", icon: "⚙️", title: "Параметры проекта",
    desc: "Включите направления бизнеса и задайте налоговые ставки. Отключённые блоки скрываются из расчёта.",
    custom: "settings",
  },
  {
    id: "b1", num: "1", icon: "🛒", title: "Закупка товара",
    desc: "Стоимость товара у поставщика и сопутствующие закупочные расходы. Закупка за рубежом не облагается российским НДС (НДС возникает на таможне).",
    groups: [
      { title: "Идентификация", fields: [
        F("name", "Наименование товара", { type: "text", def: "" }),
        F("sku", "SKU / артикул", { type: "text", def: "" }),
        F("category", "Категория", { type: "text", def: "" }),
        F("supplier", "Поставщик", { type: "text", def: "" }),
        F("link", "Ссылка на товар", { type: "text", def: "" }),
        F("moq", "MOQ (мин. партия)", { def: 500, unit: "шт", tip: "Минимальный объём заказа у поставщика." }),
      ]},
      { title: "Цена и валюта", fields: [
        F("purchasePrice", "Цена закупки", { type: "cur", def: 12, tip: "Цена за единицу у поставщика в валюте закупки." }),
        F("currency", "Валюта закупки", { type: "select", def: "CNY", options: CUR_LIST.map(c => ({ v: c, t: c })) }),
        F("rate", "Курс к рублю", { def: 12.5, unit: "₽", tip: "Курс валюты закупки к рублю. Вводится вручную (без интернета)." }),
        F("samplesCost", "Стоимость образцов", { type: "cur", def: 200, tip: "Разовые расходы на образцы (в валюте закупки), распределяются на партию." }),
      ]},
      { title: "Посредники и контроль качества", fields: [
        F("mediatorPct", "Комиссия посредника", { type: "pct", def: 2, tip: "% от стоимости товара." }),
        F("agentPct", "Комиссия агента", { type: "pct", def: 3, tip: "% от стоимости товара (байер/фулфилмент в Китае)." }),
        F("qualityCheck", "Проверка качества", { unit: "₽", def: 3000, tip: "На партию." }),
        F("photoReport", "Фотоотчёт", { unit: "₽", def: 1500, tip: "На партию." }),
        F("inspection", "Инспекция производства", { unit: "₽", def: 8000, tip: "На партию." }),
        F("packaging", "Упаковка (за ед.)", { unit: "₽", def: 5, tip: "Доп. упаковка на единицу." }),
        F("purchaseExtra", "Доп. расходы", { unit: "₽", def: 0, tip: "Прочие закупочные расходы на партию." }),
      ]},
    ],
    subtotal: (r) => [["Себестоимость закупки (партия)", money(r.purchaseBatch)], ["На единицу", money(r.purchaseBatch / r.units)]],
  },
  {
    id: "b2", num: "2", icon: "📐", title: "Характеристики товара",
    desc: "Вес и габариты определяют объём и расчётный (тарифицируемый) вес для логистики.",
    groups: [
      { title: "Вес и габариты (на единицу)", fields: [
        F("weightNet", "Вес нетто", { unit: "кг", def: 0.2 }),
        F("weightGross", "Вес брутто", { unit: "кг", def: 0.28, tip: "С упаковкой. Используется в логистике." }),
        F("length", "Длина", { unit: "см", def: 20 }),
        F("width", "Ширина", { unit: "см", def: 15 }),
        F("height", "Высота", { unit: "см", def: 8 }),
        F("volumeManual", "Объём (ручной)", { unit: "м³", def: 0, tip: "0 = вычислить автоматически из габаритов." }),
      ]},
      { title: "Партия", fields: [
        F("unitsPerBox", "Количество в коробке", { unit: "шт", def: 50 }),
        F("boxesCount", "Количество коробок", { unit: "шт", def: 20 }),
        F("unitsBatchManual", "Единиц в партии (ручн.)", { unit: "шт", def: 0, tip: "0 = коробки × штук в коробке." }),
      ]},
    ],
    subtotal: (r) => [
      ["Единиц в партии", numfmt(r.units, 0) + " шт"],
      ["Объём единицы", numfmt(r.volU, 4) + " м³"],
      ["Объём партии", numfmt(r.volBatch, 3) + " м³"],
      ["Вес партии брутто", numfmt(r.grossBatch, 1) + " кг"],
    ],
  },
  {
    id: "b3", num: "3", icon: "🚚", title: "Логистика по Китаю",
    module: "modImport",
    desc: "Расходы внутри Китая до отправки на международную доставку (на партию).",
    groups: [
      { title: "Расходы по Китаю (на партию)", fields: [
        F("chinaToWarehouse", "Доставка до склада агента", { unit: "₽", def: 2000 }),
        F("chinaConsolidation", "Консолидация", { unit: "₽", def: 1500 }),
        F("chinaCargoPack", "Упаковка груза", { unit: "₽", def: 1000 }),
        F("chinaPallet", "Паллетирование", { unit: "₽", def: 800 }),
        F("chinaInsurance", "Страхование", { unit: "₽", def: 500 }),
        F("chinaStorage", "Хранение", { unit: "₽", def: 600 }),
        F("chinaExtra", "Доп. расходы", { unit: "₽", def: 0 }),
      ]},
    ],
    subtotal: (r) => [["Логистика по Китаю (партия)", money(r.chinaLog)], ["На единицу", money(r.chinaLog / r.units)]],
  },
  {
    id: "b4", num: "4", icon: "✈️", title: "Международная логистика",
    module: "modImport",
    desc: "Тариф за кг и за м³, минимальный тариф, страховка и сроки для каждого способа. Стоимость берётся по большему из «вес × тариф» и «объём × тариф» (расчётный вес).",
    custom: "logistics",
  },
  {
    id: "b5", num: "5", icon: "🛃", title: "Таможня",
    module: "modImport",
    desc: "Таможенная стоимость считается по CIF (товар + доставка + страховка). Пошлина включается в себестоимость, таможенный НДС — входящий НДС к вычету (в себестоимость не входит).",
    groups: [
      { title: "Декларирование", fields: [
        F("hsCode", "Код ТН ВЭД", { type: "text", def: "3926909709" }),
        F("dutyPct", "Пошлина", { type: "pct", def: 10, tip: "Ставка ввозной пошлины по коду ТН ВЭД." }),
        F("dutyManual", "Пошлина (сумма, ручн.)", { unit: "₽", def: 0, tip: "0 = рассчитать от таможенной стоимости." }),
        F("customsFee", "Таможенный сбор", { unit: "₽", def: 6000, tip: "Сбор за таможенные операции (по стоимости партии)." }),
      ]},
      { title: "Услуги и разрешительные документы (с НДС)", fields: [
        F("broker", "Услуги брокера", { unit: "₽", def: 15000 }),
        F("certification", "Сертификация", { unit: "₽", def: 18000 }),
        F("declaration", "Декларация соответствия", { unit: "₽", def: 6000 }),
        F("refusalLetter", "Отказное письмо", { unit: "₽", def: 4000 }),
        F("marking", "Честный Знак (за ед.)", { unit: "₽", def: 2, tip: "Стоимость кода маркировки на единицу." }),
        F("labTests", "Лабораторные испытания", { unit: "₽", def: 12000 }),
        F("customsOther", "Прочие платежи", { unit: "₽", def: 0 }),
      ]},
    ],
    subtotal: (r) => [
      ["Таможенная стоимость (CIF)", money(r.cif)],
      ["Пошлина", money(r.duty)],
      ["Таможенный НДС (к вычету)", money(r.importVat)],
      ["Таможенные расходы в себестоимости", money(r.customsCost)],
    ],
  },
  {
    id: "b6", num: "6", icon: "🏭", title: "Контрактное производство РФ",
    module: "modManuf",
    desc: "Себестоимость изготовления товара в России (на единицу). Учитывается процент брака. Затраты с НДС — НДС к вычету.",
    groups: [
      { title: "Себестоимость изготовления (за ед.)", fields: [
        F("mRaw", "Стоимость сырья", { unit: "₽", def: 40 }),
        F("mPackaging", "Стоимость упаковки", { unit: "₽", def: 8 }),
        F("mLabels", "Стоимость этикеток", { unit: "₽", def: 3 }),
        F("mContainer", "Стоимость тары", { unit: "₽", def: 12 }),
        F("mManufacturing", "Стоимость изготовления", { unit: "₽", def: 25 }),
        F("mFilling", "Стоимость фасовки", { unit: "₽", def: 6 }),
      ]},
      { title: "Параметры", fields: [
        F("mMoq", "MOQ производства", { unit: "шт", def: 1000 }),
        F("mDefectPct", "Процент брака", { type: "pct", def: 3 }),
        F("mTransport", "Транспорт до склада", { unit: "₽", def: 5000, tip: "На партию." }),
      ]},
    ],
    subtotal: (r) => [["Производство на единицу", money(r.manufUnit)], ["На партию", money(r.manufBatch)]],
  },
  {
    id: "b7", num: "7", icon: "🎨", title: "Акриловые краски",
    module: "modPaints",
    desc: "Калькуляция банки и набора. Выберите единицу учёта (банка или набор) — она пойдёт в расчёт прибыльности.",
    groups: [
      { title: "Банка", fields: [
        F("paintUnit", "Единица учёта", { type: "select", def: "jar", options: [{ v: "jar", t: "Банка" }, { v: "set", t: "Набор" }] }),
        F("jarVolume", "Объём банки", { unit: "мл", def: 100 }),
        F("jarWeight", "Вес банки (тара)", { unit: "г", def: 35 }),
        F("fillWeight", "Вес наполнения", { unit: "г", def: 110 }),
      ]},
      { title: "Себестоимость банки (за шт)", fields: [
        F("pDispersion", "Акриловая дисперсия", { unit: "₽", def: 18 }),
        F("pPigment", "Пигмент", { unit: "₽", def: 9 }),
        F("pAdditives", "Добавки", { unit: "₽", def: 4 }),
        F("pJar", "Банка", { unit: "₽", def: 14 }),
        F("pLid", "Крышка", { unit: "₽", def: 5 }),
        F("pLabel", "Этикетка", { unit: "₽", def: 3 }),
        F("pBox", "Индивидуальная коробка", { unit: "₽", def: 6 }),
      ]},
      { title: "Набор цветов", fields: [
        F("setJars", "Банок в наборе", { unit: "шт", def: 6 }),
        F("setKit", "Комплектация набора", { unit: "₽", def: 15, tip: "Кисти, палитра и пр. на набор." }),
        F("setBox", "Коробка набора", { unit: "₽", def: 25 }),
      ]},
    ],
    subtotal: (r) => [["Себестоимость банки", money(r.paintJar)], ["Себестоимость набора", money(r.paintSet)], ["В расчёт идёт", money(r.paintUnitCost)]],
  },
  {
    id: "b8", num: "8", icon: "🏢", title: "Расходы ООО",
    desc: "Постоянные (накладные) расходы в месяц. Распределяются на единицу в Блоке 9.",
    groups: [
      { title: "Постоянные расходы (в месяц)", fields: [
        F("oRent", "Аренда помещения", { unit: "₽", def: 60000 }),
        F("oWarehouse", "Аренда склада", { unit: "₽", def: 40000 }),
        F("oSalary", "Зарплата сотрудников", { unit: "₽", def: 180000 }),
        F("oInsurance", "Страховые взносы", { unit: "₽", def: 54000, tip: "Взносы с ФОТ (≈30%)." }),
        F("oAccounting", "Бухгалтерия", { unit: "₽", def: 15000 }),
        F("oBank", "Банковское обслуживание", { unit: "₽", def: 3000 }),
        F("oInternet", "Интернет", { unit: "₽", def: 2000 }),
        F("oPhone", "Телефония", { unit: "₽", def: 1500 }),
        F("oSoftware", "Программное обеспечение", { unit: "₽", def: 5000 }),
        F("oAdvertising", "Интернет-реклама (общая)", { unit: "₽", def: 50000, tip: "Маркетинг бренда вне маркетплейса." }),
        F("oDepreciation", "Амортизация оборудования", { unit: "₽", def: 8000 }),
        F("oOther", "Прочие расходы", { unit: "₽", def: 10000 }),
      ]},
    ],
    subtotal: (r) => [["Постоянные расходы в месяц", money(r.fixedMonthly)], ["На единицу (по плану)", money(r.fixedPerUnit)]],
  },
  {
    id: "b9", num: "9", icon: "➗", title: "Распределение постоянных расходов",
    desc: "Постоянные расходы делятся на план продаж. Базу распределения (месяц/год) выбираете здесь.",
    groups: [
      { title: "План продаж", fields: [
        F("salesPlanMonth", "План продаж в месяц", { unit: "шт", def: 400 }),
        F("salesPlanYear", "План продаж в год", { unit: "шт", def: 4800 }),
        F("allocBasis", "База распределения", { type: "select", def: "month", options: [{ v: "month", t: "По месяцу" }, { v: "year", t: "По году" }] }),
      ]},
    ],
    subtotal: (r) => [
      ["Накладные на единицу", money(r.fixedPerUnit)],
      ["Накладные на коробку", money(r.fixedPerUnit * num(STATE.data.unitsPerBox))],
      ["Накладные на партию", money(r.fixedPerUnit * r.units)],
      ["Накладные на месяц", money(r.fixedMonthly)],
    ],
  },
  {
    id: "b10", num: "10", icon: "🛍️", title: "Маркетплейсы",
    desc: "Выберите маркетплейс и модель. Значения предзаполнены типовыми — отредактируйте под себя. Учитывается процент выкупа и обратная логистика возвратов.",
    custom: "marketplace",
  },
  {
    id: "b11", num: "11", icon: "🧾", title: "Налоги (ОСНО)",
    desc: "Входящий и исходящий НДС, НДС к уплате, налог на прибыль. НДС не включается в себестоимость автоматически.",
    custom: "taxes",
  },
  { id: "b12", num: "12", icon: "📈", title: "Финансовая аналитика", custom: "analytics" },
  { id: "b13", num: "13", icon: "🎯", title: "Сценарии", custom: "scenarios" },
  { id: "b14", num: "14", icon: "⚖️", title: "Сравнение товаров", custom: "compare" },
  { id: "b16", num: "16", icon: "📉", title: "Визуализация", custom: "charts" },
  { id: "b15", num: "15", icon: "📤", title: "Отчёты и экспорт", custom: "reports" },
];

// Плоский словарь определений всех полей (для дефолтов и подсказок)
const FIELD_DEFS = {};
for (const f of SETTINGS_FIELDS) FIELD_DEFS[f.k] = f;
for (const s of SECTIONS) for (const g of (s.groups || [])) for (const f of g.fields) FIELD_DEFS[f.k] = f;
// доп. поля логистики (рендерятся кастомно)
const LOGI_METHODS = [
  { id: "air", name: "Авиа", days: 12 },
  { id: "auto", name: "Авто", days: 25 },
  { id: "rail", name: "ЖД", days: 30 },
  { id: "sea", name: "Морем", days: 45 },
];

/* =========================================================
   3. ДЕФОЛТНЫЙ ПРОЕКТ
   ========================================================= */
function defaultData() {
  const d = {
    // модули
    modImport: true, modManuf: false, modPaints: false, modReady: false, deductVat: true,
    // логистика
    method: "auto",
    air:  { kg: 5.5, m3: 0,   min: 8000,  insPct: 0.5, days: 12, divisor: 6000 },
    auto: { kg: 2.2, m3: 170, min: 12000, insPct: 0.4, days: 25 },
    rail: { kg: 1.8, m3: 150, min: 15000, insPct: 0.4, days: 30 },
    sea:  { kg: 0.9, m3: 120, min: 18000, insPct: 0.3, days: 45 },
    // маркетплейсы
    activeMp: "wb", activeModel: "FBO",
    mpData: JSON.parse(JSON.stringify(MP_PRESETS)),
    // сценарии
    scenarios: {
      pess: { price: 0.92, volume: 0.6, buyout: 0.85, cost: 1.12 },
      opt:  { price: 1.06, volume: 1.4, buyout: 1.08, cost: 0.92 },
    },
  };
  for (const k in FIELD_DEFS) if (!(k in d)) d[k] = FIELD_DEFS[k].def;
  return d;
}
function newProject(name) {
  const now = Date.now();
  return { id: uid(), name: name || "Новый товар", createdAt: now, updatedAt: now, schema: 1, data: defaultData() };
}

/* =========================================================
   4. ДВИЖОК РАСЧЁТА
   ========================================================= */
function calc(data) {
  const v = num(data.vatRate), pr = num(data.profitRate), deduct = !!data.deductVat;
  const vsplit = (g, bears) => (deduct && bears && v > 0) ? { net: g / (1 + v / 100), vat: g - g / (1 + v / 100) } : { net: g, vat: 0 };

  /* --- Количества, вес, объём (Блок 2) --- */
  const unitsPerBox = num(data.unitsPerBox), boxes = num(data.boxesCount);
  let units = num(data.unitsBatchManual) > 0 ? num(data.unitsBatchManual) : unitsPerBox * boxes;
  if (units <= 0) units = 1;
  const volU = num(data.volumeManual) > 0 ? num(data.volumeManual) : (num(data.length) * num(data.width) * num(data.height)) / 1e6;
  const volBatch = volU * units;
  const grossU = num(data.weightGross);
  const grossBatch = grossU * units;

  /* --- Блок 1: закупка --- */
  const rate = num(data.rate) || 1;
  const goodsU = num(data.purchasePrice) * rate;
  const goodsBatch = goodsU * units;
  const mediator = goodsBatch * num(data.mediatorPct) / 100;
  const agent = goodsBatch * num(data.agentPct) / 100;
  const samples = num(data.samplesCost) * rate;
  const purchaseExtras = mediator + agent + samples + num(data.qualityCheck) + num(data.photoReport) +
    num(data.inspection) + num(data.packaging) * units + num(data.purchaseExtra);
  const purchaseBatch = goodsBatch + purchaseExtras;

  /* --- Блок 3: логистика по Китаю --- */
  const chinaLog = num(data.chinaToWarehouse) + num(data.chinaConsolidation) + num(data.chinaCargoPack) +
    num(data.chinaPallet) + num(data.chinaInsurance) + num(data.chinaStorage) + num(data.chinaExtra);

  /* --- Блок 4: международная логистика --- */
  const m = data.method, mp4 = data[m] || data.auto;
  let freight = 0, chargeKg = grossBatch, volKg = 0;
  if (m === "air") {
    volKg = volBatch * 1e6 / (num(mp4.divisor) || 6000);   // объёмный вес
    chargeKg = Math.max(grossBatch, volKg);
    freight = Math.max(chargeKg * num(mp4.kg), num(mp4.min));
  } else {
    const byKg = grossBatch * num(mp4.kg);
    const byM3 = volBatch * num(mp4.m3);
    freight = Math.max(byKg, byM3, num(mp4.min));
    chargeKg = grossBatch;
  }
  const intlInsurance = (goodsBatch + freight) * num(mp4.insPct) / 100;
  const intlTotal = freight + intlInsurance;
  const deliveryDays = num(mp4.days);

  /* --- Блок 5: таможня (CIF) --- */
  const cif = goodsBatch + chinaLog + intlTotal;
  const dutyPctV = num(data.dutyPct);
  const duty = num(data.dutyManual) > 0 ? num(data.dutyManual) : cif * dutyPctV / 100;
  const importVat = (cif + duty) * v / 100;                 // входящий НДС (к вычету)
  const fee = num(data.customsFee);
  const csv = [num(data.broker), num(data.certification), num(data.declaration),
    num(data.refusalLetter), num(data.labTests), num(data.marking) * units, num(data.customsOther)]
    .map(g => vsplit(g, true));
  const customsServicesNet = csv.reduce((s, x) => s + x.net, 0);
  const customsServicesVat = csv.reduce((s, x) => s + x.vat, 0);
  const customsCost = duty + fee + customsServicesNet;       // без таможенного НДС
  const importLandedBatch = data.modImport ? (purchaseBatch + chinaLog + intlTotal + customsCost) : 0;
  const importInputVat = data.modImport ? (importVat + customsServicesVat) : 0;

  /* --- Блок 6: производство РФ --- */
  let manufUnit = 0, manufBatch = 0, manufVat = 0;
  if (data.modManuf) {
    const base = num(data.mRaw) + num(data.mPackaging) + num(data.mLabels) + num(data.mContainer) +
      num(data.mManufacturing) + num(data.mFilling);
    manufUnit = base / (1 - clamp(num(data.mDefectPct) / 100, 0, 0.95));
    const sU = vsplit(manufUnit, true);
    const sT = vsplit(num(data.mTransport), true);
    manufBatch = sU.net * units + sT.net;
    manufVat = sU.vat * units + sT.vat;
  }

  /* --- Блок 7: акриловые краски --- */
  const paintJar = num(data.pDispersion) + num(data.pPigment) + num(data.pAdditives) +
    num(data.pJar) + num(data.pLid) + num(data.pLabel) + num(data.pBox);
  const paintSet = paintJar * num(data.setJars) + num(data.setKit) + num(data.setBox);
  let paintUnitCost = 0, paintsBatch = 0, paintsVat = 0;
  if (data.modPaints) {
    paintUnitCost = data.paintUnit === "set" ? paintSet : paintJar;
    const s = vsplit(paintUnitCost, true);
    paintsBatch = s.net * units; paintsVat = s.vat * units;
  }

  /* --- Готовая продукция РФ (по Блоку 1 как внутр. закупка с НДС) --- */
  let readyBatch = 0, readyVat = 0;
  if (data.modReady) {
    const s = vsplit(goodsBatch + num(data.packaging) * units + num(data.purchaseExtra), true);
    readyBatch = s.net + mediator + agent; readyVat = s.vat;
  }

  /* --- Базовая себестоимость единицы (нетто, без возмещаемого НДС) --- */
  const landedBatchNet = importLandedBatch + manufBatch + paintsBatch + readyBatch;
  const landedUnit = landedBatchNet / units;
  const supplyInputVatUnit = (importInputVat + manufVat + paintsVat + readyVat) / units;

  /* --- Блок 8/9: постоянные расходы --- */
  const fixedMonthly = num(data.oRent) + num(data.oWarehouse) + num(data.oSalary) + num(data.oInsurance) +
    num(data.oAccounting) + num(data.oBank) + num(data.oInternet) + num(data.oPhone) +
    num(data.oSoftware) + num(data.oAdvertising) + num(data.oDepreciation) + num(data.oOther);
  const planMonth = Math.max(1, num(data.salesPlanMonth));
  const planYear = Math.max(1, num(data.salesPlanYear) || planMonth * 12);
  const fixedPerUnit = data.allocBasis === "year" ? (fixedMonthly * 12) / planYear : fixedMonthly / planMonth;

  /* --- Блок 10/11: маркетплейс + НДС + прибыль --- */
  const mp = data.mpData[data.activeMp] || MP_PRESETS.wb;
  const lossF = 1 / ((1 - clamp(num(mp.defectPct) / 100, 0, .95)) * (1 - clamp(num(mp.lossPct) / 100, 0, .95)));

  function econ(sellPrice) {
    const eff = sellPrice * (1 - num(mp.discountPct) / 100 - num(mp.promoPct) / 100);
    const bf = clamp(num(mp.buyoutPct) / 100, 0.01, 1);
    const retPer = (1 - bf) / bf;                            // возвратов на 1 выкупленную
    const commission = eff * num(mp.commissionPct) / 100;
    const acquiring = eff * num(mp.acquiringPct) / 100;
    const logistics = num(mp.logistics) * (1 / bf);          // прямая логистика на все отправки
    const retLog = num(mp.returnLogistics) * retPer;         // обратная логистика возвратов
    const storage = num(mp.storage);
    const acceptance = num(mp.acceptance);
    const adCost = num(mp.advertising) + eff * num(mp.drrPct) / 100;
    const utilization = num(mp.utilization) * retPer;
    const mpGross = commission + acquiring + logistics + retLog + storage + acceptance + adCost + utilization;
    const mpV = vsplit(mpGross, true);
    const outVat = eff * v / (100 + v);
    const revNet = eff - outVat;
    const inputVat = supplyInputVatUnit + mpV.vat;
    const landedNetLoss = landedUnit * lossF;
    const cogsVarNet = landedNetLoss + mpV.net;
    const grossProfit = revNet - landedNetLoss;
    const marginal = revNet - cogsVarNet;
    const operating = marginal - fixedPerUnit;
    const tax = Math.max(0, operating) * pr / 100;
    const net = operating - tax;
    const vatPay = outVat - inputVat;
    return { eff, bf, retPer, commission, acquiring, logistics, retLog, storage, acceptance, adCost, utilization,
      mpGross, mpNet: mpV.net, mpVat: mpV.vat, outVat, inputVat, vatPay, revNet, revGross: eff,
      landedNetLoss, cogsVarNet, grossProfit, marginal, operating, tax, net };
  }
  const E = econ(num(mp.sellPrice));

  /* --- Решатели цены (монотонность по цене) --- */
  function solve(targetFn) {
    let lo = 0.01, hi = Math.max(10, num(mp.sellPrice) * 25);
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (targetFn(econ(mid)) >= 0) hi = mid; else lo = mid;
    }
    return (lo + hi) / 2;
  }
  const minPrice = solve(e => e.net);                                       // чистая прибыль = 0
  const recoPrice = solve(e => e.net - e.revNet * num(data.targetRos) / 100); // ROS = цель

  /* --- Метрики (Блок 12) --- */
  const unitCostFull = E.landedNetLoss + E.mpNet + fixedPerUnit;
  const ros = E.revNet > 0 ? E.net / E.revNet * 100 : 0;
  const marginPct = E.revNet > 0 ? E.marginal / E.revNet * 100 : 0;
  const roi = E.landedNetLoss > 0 ? E.net / E.landedNetLoss * 100 : 0;
  const romi = E.adCost > 0 ? E.marginal / E.adCost * 100 : 0;
  const breakeven = E.marginal > 0 ? fixedMonthly / E.marginal : Infinity;  // шт/мес
  const batchInvestment = landedBatchNet;
  const profitMonth = E.net * planMonth;
  const profitYear = profitMonth * 12;
  const payback = profitMonth > 0 ? batchInvestment / profitMonth : Infinity; // мес на возврат вложений в партию
  const maxDiscount = num(mp.sellPrice) > 0 ? clamp((num(mp.sellPrice) - minPrice) / num(mp.sellPrice) * 100, 0, 100) : 0;

  return {
    units, volU, volBatch, grossBatch, grossU,
    goodsU, goodsBatch, purchaseBatch, chinaLog,
    freight, intlInsurance, intlTotal, chargeKg, volKg, deliveryDays, method: m,
    cif, duty, importVat, fee, customsCost, customsServicesNet, importLandedBatch, importInputVat,
    manufUnit, manufBatch, paintJar, paintSet, paintUnitCost, paintsBatch,
    landedUnit, landedBatchNet, supplyInputVatUnit,
    fixedMonthly, fixedPerUnit, planMonth, planYear,
    mp, E, lossF,
    unitCostFull, ros, marginPct, roi, romi, breakeven, batchInvestment,
    profitMonth, profitYear, payback, minPrice, recoPrice, maxDiscount,
  };
}

/* применить сценарий (множители) к копии data */
function applyScenario(data, key) {
  if (key === "base") return data;
  const sc = data.scenarios[key === "pess" ? "pess" : "opt"];
  const d = JSON.parse(JSON.stringify(data));
  const mp = d.mpData[d.activeMp];
  mp.sellPrice = num(mp.sellPrice) * sc.price;
  mp.buyoutPct = clamp(num(mp.buyoutPct) * sc.buyout, 0, 100);
  d.salesPlanMonth = num(d.salesPlanMonth) * sc.volume;
  d.rate = num(d.rate) * sc.cost;
  for (const mth of ["air", "auto", "rail", "sea"]) { d[mth].kg *= sc.cost; d[mth].m3 *= sc.cost; d[mth].min *= sc.cost; }
  return d;
}

/* =========================================================
   5. ХРАНИЛИЩЕ
   ========================================================= */
const DB = (() => {
  const NAME = "ue_pro_db", STORE = "projects", VER = 1;
  let dbp = null;
  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      const rq = indexedDB.open(NAME, VER);
      rq.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      };
      rq.onsuccess = () => res(rq.result);
      rq.onerror = () => rej(rq.error);
    });
    return dbp;
  }
  const tx = async (mode, fn) => {
    const db = await open();
    return new Promise((res, rej) => {
      const t = db.transaction(STORE, mode), st = t.objectStore(STORE);
      const r = fn(st);
      t.oncomplete = () => res(r && r.result !== undefined ? r.result : r);
      t.onerror = () => rej(t.error);
    });
  };
  return {
    available: () => "indexedDB" in window,
    getAll: () => tx("readonly", st => st.getAll()),
    get: (id) => tx("readonly", st => st.get(id)),
    put: (p) => tx("readwrite", st => st.put(p)),
    del: (id) => tx("readwrite", st => st.delete(id)),
  };
})();

// Резервное хранилище (если IndexedDB недоступен) — LocalStorage
const LS_PROJECTS = "ue_pro_projects_fallback";
const LSStore = {
  read: () => { try { return JSON.parse(localStorage.getItem(LS_PROJECTS) || "[]"); } catch { return []; } },
  write: (a) => localStorage.setItem(LS_PROJECTS, JSON.stringify(a)),
};
const Store = {
  useDB: DB.available(),
  async getAll() { return this.useDB ? (await DB.getAll()) : LSStore.read(); },
  async put(p) { if (this.useDB) return DB.put(p); const a = LSStore.read().filter(x => x.id !== p.id); a.push(p); LSStore.write(a); },
  async del(id) { if (this.useDB) return DB.del(id); LSStore.write(LSStore.read().filter(x => x.id !== id)); },
};

// Настройки интерфейса — LocalStorage
const UI = Object.assign({ theme: "dark", section: "dashboard", roundRub: false, lastProjectId: null, capital: 1000000, scenario: "base", compare: [] },
  (() => { try { return JSON.parse(localStorage.getItem("ue_pro_ui") || "{}"); } catch { return {}; } })());
const saveUI = debounce(() => localStorage.setItem("ue_pro_ui", JSON.stringify(UI)), 200);

/* =========================================================
   6. СОСТОЯНИЕ
   ========================================================= */
const STATE = { project: null, data: null, dirty: false, results: null, projectsCache: [] };

function setDirty(on = true) {
  STATE.dirty = on;
  const s = $("#saveState");
  if (!s) return;
  s.textContent = on ? "не сохранено" : "сохранено";
  s.className = "savestate " + (on ? "dirty" : "saved");
}

async function saveProject(silent) {
  if (!STATE.project) return;
  STATE.project.data = STATE.data;
  STATE.project.updatedAt = Date.now();
  await Store.put(STATE.project);
  setDirty(false);
  UI.lastProjectId = STATE.project.id; saveUI();
  if (!silent) toast("Проект сохранён", "good");
  await refreshProjectsCache();
}

async function refreshProjectsCache() { STATE.projectsCache = await Store.getAll(); }

function loadProjectObj(p) {
  STATE.project = p;
  // дополнить отсутствующие поля дефолтами (миграция)
  STATE.data = Object.assign(defaultData(), p.data || {});
  STATE.data.mpData = Object.assign(JSON.parse(JSON.stringify(MP_PRESETS)), p.data?.mpData || {});
  $("#projectName").value = p.name || "";
  setDirty(false);
  UI.lastProjectId = p.id; saveUI();
  render();
}

/* =========================================================
   7. РЕНДЕР: оболочка, навигация, summary
   ========================================================= */
function buildNav() {
  const ul = $("#navList"); ul.innerHTML = "";
  for (const s of SECTIONS) {
    if (s.id === "settings") ul.append(el("li", { class: "nav__sep" }));
    const off = s.module && !STATE.data[s.module];
    const item = el("li", {
      class: "nav__item" + (UI.section === s.id ? " active" : ""),
      onclick: () => { UI.section = s.id; saveUI(); render(); if (window.innerWidth <= 860) closeSidebar(); },
    },
      el("span", { class: "nav__num" }, s.num),
      el("span", { class: "nav__lbl" }, s.title),
      off ? el("span", { class: "nav__off" }, "выкл") : null,
    );
    ul.append(item);
  }
}

function refreshComputed() {
  STATE.results = calc(STATE.data);
  renderSummary(STATE.results);
}

// Живой пересчёт текущего раздела с сохранением фокуса/каретки в активном поле
const liveUpdate = debounce(() => {
  const a = document.activeElement;
  const k = a && a.dataset ? a.dataset.k : null;
  const pos = (a && typeof a.selectionStart === "number") ? a.selectionStart : null;
  render();
  if (k) {
    const sel = (window.CSS && CSS.escape) ? CSS.escape(k) : k;
    const n = document.querySelector('[data-k="' + sel + '"]');
    if (n) { n.focus(); if (pos != null) { try { n.setSelectionRange(pos, pos); } catch (e) {} } }
  }
}, 220);

function renderSummary(r) {
  const s = $("#summary"); if (!s) return;
  const net = r.E.net;
  const cls = net > 0 ? "good" : net < 0 ? "bad" : "warn";
  s.innerHTML = "";
  s.append(
    el("div", { class: "kpi " + cls },
      el("div", { class: "kpi__label" }, "Чистая прибыль с единицы"),
      el("div", { class: "kpi__value" }, money(net)),
      el("div", { class: "kpi__sub" }, `Маржа ${pct(r.marginPct)} · Рент-сть ${pct(r.ros)}`)),
    el("div", { class: "kpi-row" },
      el("div", { class: "kpi" }, el("div", { class: "kpi__label" }, "Себестоимость ед."), el("div", { class: "kpi__value" }, money(r.unitCostFull))),
      el("div", { class: "kpi" }, el("div", { class: "kpi__label" }, "Цена продажи"), el("div", { class: "kpi__value" }, money(num(r.mp.sellPrice))))),
    el("div", { class: "kpi-row" },
      el("div", { class: "kpi " + (r.roi > 0 ? "good" : "bad") }, el("div", { class: "kpi__label" }, "ROI"), el("div", { class: "kpi__value" }, pct(r.roi))),
      el("div", { class: "kpi" }, el("div", { class: "kpi__label" }, "Окупаемость"), el("div", { class: "kpi__value" }, isFinite(r.payback) ? numfmt(r.payback, 1) + " мес" : "∞"))),
    el("div", { class: "kpi-row" },
      el("div", { class: "kpi" }, el("div", { class: "kpi__label" }, "Прибыль / мес"), el("div", { class: "kpi__value" }, money(r.profitMonth, 0))),
      el("div", { class: "kpi" }, el("div", { class: "kpi__label" }, "Безубыточность"), el("div", { class: "kpi__value" }, isFinite(r.breakeven) ? numfmt(r.breakeven, 0) + " шт" : "∞"))),
    el("div", { class: "kpi" },
      el("div", { class: "kpi__label" }, "Мин. цена / Рекомендуемая"),
      el("div", { class: "kpi__value", style: "font-size:18px" }, money(r.minPrice, 0) + " / " + money(r.recoPrice, 0)),
      el("div", { class: "kpi__sub" }, "Макс. скидка без убытка: " + pct(r.maxDiscount))),
  );
}

/* ---- основной рендер раздела ---- */
function render() {
  buildNav();
  const view = $("#view"); view.innerHTML = "";
  const s = SECTIONS.find(x => x.id === UI.section) || SECTIONS[0];

  // модульная секция выключена
  if (s.module && !STATE.data[s.module]) {
    view.append(sectionHead(s), moduleOffCard(s));
    refreshComputed(); return;
  }
  view.append(sectionHead(s));
  const r = calc(STATE.data); STATE.results = r;

  if (s.custom) { CUSTOM[s.custom](view, r); }
  else {
    for (const g of s.groups) view.append(groupCard(g));
    if (s.subtotal) {
      const rows = s.subtotal(r);
      view.append(el("div", { class: "card" },
        el("div", { class: "card__title" }, "Итоги раздела"),
        el("div", { class: "grid" }, rows.map(([l, val]) =>
          el("div", { class: "subtotal" }, el("span", { class: "muted" }, l), el("b", {}, val))))));
    }
  }
  renderSummary(r);
}

function sectionHead(s) {
  return el("div", {},
    el("div", { class: "section-head" }, el("h2", {}, `${s.icon} ${s.title}`)),
    s.desc ? el("p", { class: "section-desc" }, s.desc) : null);
}
function moduleOffCard(s) {
  return el("div", { class: "card" },
    el("div", { class: "empty" },
      el("div", { class: "empty__icon" }, s.icon),
      el("p", {}, "Этот блок выключен в параметрах проекта."),
      el("button", { class: "btn btn--primary", onclick: () => { STATE.data[s.module] = true; setDirty(); render(); } }, "Включить блок")));
}

function groupCard(g) {
  const card = el("div", { class: "card" }, el("div", { class: "card__title" }, g.title, g.hint ? el("span", { class: "hint" }, g.hint) : null));
  const grid = el("div", { class: "grid" });
  for (const f of g.fields) grid.append(fieldEl(f));
  card.append(grid);
  return card;
}

function fieldEl(f, value, onInput) {
  const val = value !== undefined ? value : STATE.data[f.k];
  const lbl = el("label", {}, f.label, f.tip ? el("span", { class: "tip", title: f.tip }, "?") : null);
  let input;
  if (f.type === "select") {
    input = el("select", { "data-k": f.k }, f.options.map(o => {
      const opt = el("option", { value: o.v }, o.t); if (String(val) === String(o.v)) opt.selected = true; return opt;
    }));
  } else if (f.type === "text") {
    input = el("input", { type: "text", "data-k": f.k, value: val ?? "", autocomplete: "off" });
  } else {
    input = el("input", { type: "number", step: "any", "data-k": f.k, value: val ?? 0, class: f.unit ? "has-unit" : "" });
  }
  const structural = f.k.startsWith("mod") || f.k === "allocBasis" || f.k === "paintUnit";
  const handler = onInput || ((e) => {
    const t = e.target;
    STATE.data[f.k] = (f.type === "text" || f.type === "select") ? t.value : num(t.value);
    if (f.k === "name") STATE.project.name = t.value;
    setDirty();
    if (structural) render(); else liveUpdate();
  });
  input.addEventListener(f.type === "select" ? "change" : "input", handler);
  const wrap = el("div", { class: "input-wrap" }, input, (f.unit && f.type !== "select" && f.type !== "text") ? el("span", { class: "unit" }, f.unit) : null);
  return el("div", { class: "field" }, lbl, wrap);
}

/* =========================================================
   8. КАСТОМНЫЕ РАЗДЕЛЫ
   ========================================================= */
const CUSTOM = {};

CUSTOM.settings = (view, r) => {
  const mods = [
    ["modImport", "Импорт из Китая", "Блоки 1–5: закупка, логистика, таможня."],
    ["modManuf", "Контрактное производство РФ", "Блок 6: изготовление в России."],
    ["modPaints", "Акриловые краски", "Блок 7: банки и наборы."],
    ["modReady", "Готовая продукция РФ", "Закупка готового товара в РФ (по Блоку 1, с НДС)."],
  ];
  const card = el("div", { class: "card" }, el("div", { class: "card__title" }, "Направления бизнеса (модули)"));
  for (const [k, name, hint] of mods) {
    card.append(el("label", { class: "checkline", style: "margin:8px 0" },
      el("input", { type: "checkbox", checked: STATE.data[k] || false, onchange: (e) => { STATE.data[k] = e.target.checked; setDirty(); render(); } }),
      el("span", {}, el("b", {}, name), " — ", el("span", { class: "muted small" }, hint))));
  }
  const tax = el("div", { class: "card" }, el("div", { class: "card__title" }, "Налоги и расчёт"));
  const grid = el("div", { class: "grid" });
  for (const f of SETTINGS_FIELDS) grid.append(fieldEl(f));
  grid.append(el("div", { class: "field" },
    el("label", {}, "Возмещать входящий НДС"),
    el("label", { class: "checkline" }, el("input", { type: "checkbox", checked: STATE.data.deductVat, onchange: (e) => { STATE.data.deductVat = e.target.checked; setDirty(); refreshComputed(); } }), el("span", {}, "Да, услуги с НДС → к вычету"))));
  tax.append(grid);
  view.append(card, tax, el("div", { class: "help-box" },
    "Методология: входящий НДС (таможенный + с услуг) принимается к вычету и не входит в себестоимость; "
    + "исходящий НДС выделяется из цены; налог на прибыль считается с операционной прибыли."));
};

CUSTOM.logistics = (view, r) => {
  const card = el("div", { class: "card" }, el("div", { class: "card__title" }, "Способ доставки"));
  const chips = el("div", { class: "chips" });
  for (const mth of LOGI_METHODS) {
    chips.append(el("div", { class: "chip" + (STATE.data.method === mth.id ? " active" : ""), onclick: () => { STATE.data.method = mth.id; setDirty(); render(); } }, mth.name));
  }
  card.append(chips);
  view.append(card);

  for (const mth of LOGI_METHODS) {
    const d = STATE.data[mth.id];
    const active = STATE.data.method === mth.id;
    const c = el("div", { class: "card" + (active ? "" : " tag-off") }, el("div", { class: "card__title" }, `${mth.name} ${active ? "· выбрано" : ""}`));
    const grid = el("div", { class: "grid" });
    const fields = [
      { k: "kg", label: "Стоимость за кг", unit: "₽" },
      ...(mth.id === "air" ? [] : [{ k: "m3", label: "Стоимость за м³", unit: "₽" }]),
      { k: "min", label: "Минимальный тариф", unit: "₽" },
      { k: "insPct", label: "Страховка", unit: "%" },
      { k: "days", label: "Срок доставки", unit: "дн" },
      ...(mth.id === "air" ? [{ k: "divisor", label: "Делитель объёма", unit: "" }] : []),
    ];
    for (const f of fields) {
      grid.append(fieldEl({ k: mth.id + "." + f.k, label: f.label, unit: f.unit, type: "num" }, d[f.k],
        (e) => { d[f.k] = num(e.target.value); setDirty(); liveUpdate(); }));
    }
    c.append(grid);
    view.append(c);
  }
  view.append(el("div", { class: "card" },
    el("div", { class: "card__title" }, "Итог по выбранному способу"),
    el("div", { class: "grid" }, [
      ["Расчётный вес", numfmt(r.chargeKg, 1) + " кг" + (r.method === "air" ? ` (объёмный ${numfmt(r.volKg, 1)} кг)` : "")],
      ["Фрахт", money(r.freight)],
      ["Страховка", money(r.intlInsurance)],
      ["Итого логистика (партия)", money(r.intlTotal)],
      ["На единицу", money(r.intlTotal / r.units)],
      ["Срок доставки", numfmt(r.deliveryDays, 0) + " дн"],
    ].map(([l, val]) => el("div", { class: "subtotal" }, el("span", { class: "muted" }, l), el("b", {}, val))))));
};

CUSTOM.marketplace = (view, r) => {
  // выбор МП и модели
  const top = el("div", { class: "card" }, el("div", { class: "card__title" }, "Площадка и модель"));
  const mpchips = el("div", { class: "chips", style: "margin-bottom:10px" });
  for (const m of MP_LIST) mpchips.append(el("div", { class: "chip" + (STATE.data.activeMp === m.id ? " active" : ""), onclick: () => { STATE.data.activeMp = m.id; setDirty(); render(); } }, m.name));
  const modelchips = el("div", { class: "chips" });
  for (const md of ["FBO", "FBS", "realFBS"]) modelchips.append(el("div", { class: "chip" + (STATE.data.activeModel === md ? " active" : ""), onclick: () => { STATE.data.activeModel = md; setDirty(); refreshComputed(); render(); } }, md));
  top.append(el("div", { class: "muted small", style: "margin-bottom:6px" }, "Маркетплейс:"), mpchips, el("div", { class: "muted small", style: "margin:8px 0 6px" }, "Модель:"), modelchips);
  view.append(top);

  const mp = STATE.data.mpData[STATE.data.activeMp];
  const mpFields = [
    ["sellPrice", "Цена продажи", "₽", "Розничная цена на витрине (с НДС)."],
    ["commissionPct", "Комиссия МП", "%", "Комиссия площадки по категории."],
    ["logistics", "Логистика (за ед.)", "₽", "Прямая логистика до покупателя."],
    ["returnLogistics", "Логистика возврата", "₽", "Стоимость обратной логистики."],
    ["storage", "Хранение", "₽", "За единицу (FBO)."],
    ["acceptance", "Приёмка", "₽", "За единицу."],
    ["acquiringPct", "Эквайринг", "%", "Комиссия за приём платежей."],
    ["advertising", "Реклама (за ед.)", "₽", "Фиксированная рекламная нагрузка."],
    ["drrPct", "ДРР", "%", "Доля рекламных расходов от цены."],
    ["promoPct", "Акции", "%", "Снижение цены по акциям."],
    ["discountPct", "Скидки", "%", "Постоянная скидка."],
    ["buyoutPct", "Процент выкупа", "%", "Доля заказов, которые покупатель забирает."],
    ["utilization", "Утилизация", "₽", "Стоимость утилизации возврата."],
    ["defectPct", "Процент брака", "%", ""],
    ["lossPct", "Процент потерь", "%", ""],
  ];
  const card = el("div", { class: "card" }, el("div", { class: "card__title" }, MP_LIST.find(m => m.id === STATE.data.activeMp).name + " · " + STATE.data.activeModel,
    el("button", { class: "btn btn--sm btn--ghost hint", onclick: () => { Object.assign(mp, JSON.parse(JSON.stringify(MP_PRESETS[STATE.data.activeMp]))); setDirty(); render(); } }, "Сбросить к типовым")));
  const grid = el("div", { class: "grid" });
  for (const [k, label, unit, tip] of mpFields) {
    grid.append(fieldEl({ k, label, unit, tip, type: "num" }, mp[k], (e) => { mp[k] = num(e.target.value); setDirty(); liveUpdate(); }));
  }
  card.append(grid);
  view.append(card);

  const E = r.E;
  view.append(el("div", { class: "card" }, el("div", { class: "card__title" }, "Юнит-экономика на площадке"),
    breakdownList([
      ["Цена (после скидок)", E.eff, "neutral"],
      ["− Исходящий НДС", -E.outVat, "neg"],
      ["− Комиссия", -E.commission, "neg"],
      ["− Эквайринг", -E.acquiring, "neg"],
      ["− Логистика (с учётом выкупа)", -E.logistics, "neg"],
      ["− Логистика возвратов", -E.retLog, "neg"],
      ["− Хранение/приёмка", -(E.storage + E.acceptance), "neg"],
      ["− Реклама/ДРР", -E.adCost, "neg"],
      ["− Утилизация", -E.utilization, "neg"],
      ["+ Возмещение НДС (вход.)", E.inputVat, "pos"],
      ["− Себестоимость товара", -E.landedNetLoss, "neg"],
      ["− Накладные расходы", -r.fixedPerUnit, "neg"],
      ["− Налог на прибыль", -E.tax, "neg"],
      ["= Чистая прибыль", E.net, E.net >= 0 ? "pos" : "neg"],
    ])));
};

CUSTOM.taxes = (view, r) => {
  const E = r.E;
  view.append(
    el("div", { class: "card" }, el("div", { class: "card__title" }, "НДС (на единицу)"),
      el("div", { class: "grid" }, [
        ["Исходящий НДС (с продажи)", money(E.outVat)],
        ["Входящий НДС (таможня + услуги)", money(E.inputVat)],
        ["НДС к уплате", money(E.vatPay)],
      ].map(([l, val]) => el("div", { class: "subtotal" }, el("span", { class: "muted" }, l), el("b", {}, val))))),
    el("div", { class: "card" }, el("div", { class: "card__title" }, "Прибыль и налог (на единицу)"),
      el("div", { class: "grid" }, [
        ["Операционная прибыль до налога", money(E.operating)],
        ["Налог на прибыль (" + pct(num(STATE.data.profitRate)) + ")", money(E.tax)],
        ["Чистая прибыль", money(E.net)],
        ["Страховые взносы (в постоянных)", money(num(STATE.data.oInsurance))],
      ].map(([l, val]) => el("div", { class: "subtotal" }, el("span", { class: "muted" }, l), el("b", {}, val))))),
    el("div", { class: "card" }, el("div", { class: "card__title" }, "НДС за месяц (план " + numfmt(r.planMonth, 0) + " шт)"),
      el("div", { class: "grid" }, [
        ["Исходящий НДС / мес", money(E.outVat * r.planMonth, 0)],
        ["Входящий НДС / мес", money(E.inputVat * r.planMonth, 0)],
        ["НДС к уплате / мес", money(E.vatPay * r.planMonth, 0)],
        ["Налог на прибыль / мес", money(E.tax * r.planMonth, 0)],
      ].map(([l, val]) => el("div", { class: "subtotal" }, el("span", { class: "muted" }, l), el("b", {}, val))))),
    el("div", { class: "help-box" }, "НДС не включается в себестоимость: исходящий выделяется из цены, входящий принимается к вычету. Налог на прибыль — с операционной прибыли."));
};

CUSTOM.analytics = (view, r) => {
  const E = r.E;
  const metrics = [
    ["Себестоимость единицы (полная)", money(r.unitCostFull), "Товар + расходы МП + накладные."],
    ["Себестоимость партии", money(r.batchInvestment), "Вложения в закупку и доставку партии."],
    ["Валовая прибыль", money(E.grossProfit), "Выручка (нетто) − себестоимость товара."],
    ["Маржинальная прибыль", money(E.marginal), "Выручка (нетто) − переменные расходы."],
    ["Чистая прибыль", money(E.net), "После всех расходов и налогов."],
    ["Рентабельность (ROS)", pct(r.ros), "Чистая прибыль / выручка."],
    ["ROI", pct(r.roi), "Чистая прибыль / вложения в товар."],
    ["ROMI", pct(r.romi), "Маржинальная прибыль / расходы на рекламу."],
    ["Точка безубыточности", isFinite(r.breakeven) ? numfmt(r.breakeven, 0) + " шт/мес" : "∞", "Объём, покрывающий постоянные расходы."],
    ["Срок окупаемости", isFinite(r.payback) ? numfmt(r.payback, 1) + " мес" : "∞", "Возврат вложений в партию."],
    ["Прибыль за месяц", money(r.profitMonth, 0), "По плану продаж."],
    ["Прибыль за год", money(r.profitYear, 0), ""],
    ["Необходимый объём продаж", isFinite(r.breakeven) ? numfmt(r.breakeven, 0) + " шт/мес" : "∞", "Для выхода в ноль."],
    ["Минимальная цена продажи", money(r.minPrice), "Нулевая чистая прибыль."],
    ["Рекомендуемая цена", money(r.recoPrice), "Для целевой рент-сти " + pct(num(STATE.data.targetRos)) + "."],
    ["Максимальная скидка без убытка", pct(r.maxDiscount), "От текущей цены."],
  ];
  const grid = el("div", { class: "grid" });
  for (const [l, val, hint] of metrics) {
    grid.append(el("div", { class: "kpi" }, el("div", { class: "kpi__label" }, l), el("div", { class: "kpi__value", style: "font-size:20px" }, val), hint ? el("div", { class: "kpi__sub" }, hint) : null));
  }
  view.append(el("div", { class: "card" }, el("div", { class: "card__title" }, "Финансовые показатели"), grid));

  // структура себестоимости
  const parts = costParts(r);
  view.append(el("div", { class: "card" }, el("div", { class: "card__title" }, "Структура себестоимости единицы"), breakdownBars(parts)));
};

CUSTOM.scenarios = (view, r) => {
  const card = el("div", { class: "card" }, el("div", { class: "card__title" }, "Множители сценариев"),
    el("p", { class: "muted small" }, "Базовый = 1.0. Пессимистичный и оптимистичный задаются множителями к цене, объёму, проценту выкупа и стоимости закупки/логистики."));
  const tbl = el("table", { class: "tbl" });
  tbl.append(el("thead", {}, el("tr", {}, ["Параметр", "Пессимистичный", "Оптимистичный"].map(h => el("th", {}, h)))));
  const tb = el("tbody");
  const rows = [["price", "Цена"], ["volume", "Объём продаж"], ["buyout", "% выкупа"], ["cost", "Закупка/логистика"]];
  for (const [k, label] of rows) {
    tb.append(el("tr", {}, el("td", {}, label),
      el("td", {}, mkScInput("pess", k)), el("td", {}, mkScInput("opt", k))));
  }
  tbl.append(tb); card.append(el("div", { class: "table-wrap" }, tbl));
  view.append(card);

  // сравнение сценариев
  const scs = [["pess", "Пессимистичный"], ["base", "Базовый"], ["opt", "Оптимистичный"]];
  const data = scs.map(([key, name]) => ({ name, key, r: calc(applyScenario(STATE.data, key)) }));
  const t2 = el("table", { class: "tbl" });
  t2.append(el("thead", {}, el("tr", {}, el("th", {}, "Показатель"), ...data.map(d => el("th", {}, d.name)))));
  const metricRows = [
    ["Цена продажи", d => money(num(d.r.mp.sellPrice), 0)],
    ["Чистая прибыль / ед", d => money(d.r.E.net)],
    ["Маржа", d => pct(d.r.marginPct)],
    ["ROI", d => pct(d.r.roi)],
    ["Прибыль / мес", d => money(d.r.profitMonth, 0)],
    ["Прибыль / год", d => money(d.r.profitYear, 0)],
    ["Окупаемость", d => isFinite(d.r.payback) ? numfmt(d.r.payback, 1) + " мес" : "∞"],
    ["Безубыточность", d => isFinite(d.r.breakeven) ? numfmt(d.r.breakeven, 0) + " шт" : "∞"],
  ];
  const tb2 = el("tbody");
  for (const [l, fn] of metricRows) {
    tb2.append(el("tr", {}, el("td", {}, l), ...data.map(d => {
      const v = fn(d); const neg = /^-|−/.test(v) || (l.includes("прибыль") && d.r.E.net < 0);
      return el("td", { class: neg ? "neg" : "" }, v);
    })));
  }
  t2.append(tb2);
  view.append(el("div", { class: "card" }, el("div", { class: "card__title" }, "Сравнение сценариев"), el("div", { class: "table-wrap" }, t2),
    chartScenario(data)));
};
function mkScInput(scope, k) {
  const inp = el("input", { type: "number", step: "0.01", value: STATE.data.scenarios[scope][k] });
  inp.addEventListener("input", e => { STATE.data.scenarios[scope][k] = num(e.target.value); setDirty(); });
  inp.addEventListener("change", () => render());
  return inp;
}

CUSTOM.compare = (view, r) => {
  const all = STATE.projectsCache;
  const card = el("div", { class: "card" }, el("div", { class: "card__title" }, "Выбор товаров для сравнения (до 20)",
    el("span", { class: "hint" }, UI.compare.length + " выбрано")));
  if (!all.length) card.append(el("div", { class: "empty" }, "Нет сохранённых проектов. Сохраните проект, чтобы сравнивать."));
  const chips = el("div", { class: "chips" });
  for (const p of all) {
    const on = UI.compare.includes(p.id);
    chips.append(el("div", { class: "chip" + (on ? " active" : ""), onclick: () => {
      if (on) UI.compare = UI.compare.filter(x => x !== p.id);
      else if (UI.compare.length < 20) UI.compare.push(p.id);
      else return toast("Максимум 20 товаров", "warn");
      saveUI(); render();
    } }, p.name));
  }
  card.append(chips); view.append(card);

  const chosen = all.filter(p => UI.compare.includes(p.id));
  if (!chosen.length) { view.append(el("div", { class: "help-box" }, "Выберите товары выше для сравнения по прибыли, ROI, окупаемости и рентабельности.")); return; }
  const rows = chosen.map(p => ({ p, r: calc(Object.assign(defaultData(), p.data)) }));

  const sortBtns = el("div", { class: "toolbar", style: "margin-bottom:10px" },
    el("span", { class: "muted small" }, "Сортировать:"),
    ...[["net", "по прибыли"], ["roi", "по ROI"], ["payback", "по окупаемости"], ["ros", "по рент-сти"]].map(([k, t]) =>
      el("button", { class: "btn btn--sm", onclick: () => { UI.cmpSort = k; saveUI(); render(); } }, t)));
  const key = UI.cmpSort || "net";
  rows.sort((a, b) => key === "payback" ? a.r.payback - b.r.payback : (b.r.E.net && key === "net" ? b.r.E.net - a.r.E.net : b.r[key] - a.r[key]));

  const tbl = el("table", { class: "tbl" });
  tbl.append(el("thead", {}, el("tr", {}, ["Товар", "Себест.", "Цена", "Чист. приб/ед", "Маржа", "ROI", "Окуп.", "Приб/мес"].map(h => el("th", {}, h)))));
  const tb = el("tbody");
  for (const { p, r: rr } of rows) {
    tb.append(el("tr", {},
      el("td", {}, p.name),
      el("td", {}, money(rr.unitCostFull, 0)),
      el("td", {}, money(num(rr.mp.sellPrice), 0)),
      el("td", { class: rr.E.net >= 0 ? "pos" : "neg" }, money(rr.E.net)),
      el("td", {}, pct(rr.marginPct)),
      el("td", { class: rr.roi >= 0 ? "pos" : "neg" }, pct(rr.roi)),
      el("td", {}, isFinite(rr.payback) ? numfmt(rr.payback, 1) : "∞"),
      el("td", {}, money(rr.profitMonth, 0))));
  }
  tbl.append(tb);
  view.append(sortBtns, el("div", { class: "card" }, el("div", { class: "card__title" }, "Таблица сравнения"), el("div", { class: "table-wrap" }, tbl)),
    el("div", { class: "card" }, el("div", { class: "card__title" }, "Чистая прибыль с единицы"), chartBars(rows.map(x => ({ label: x.p.name, value: x.r.E.net })))));
};

CUSTOM.charts = (view, r) => {
  view.append(
    el("div", { class: "chart-grid" },
      el("div", { class: "chart-card" }, el("div", { class: "card__title" }, "Структура себестоимости"), chartDonut(costParts(r))),
      el("div", { class: "chart-card" }, el("div", { class: "card__title" }, "Структура расходов на единицу"), breakdownBars(costParts(r))),
      el("div", { class: "chart-card" }, el("div", { class: "card__title" }, "Точка безубыточности"), chartBreakeven(r)),
      el("div", { class: "chart-card" }, el("div", { class: "card__title" }, "Прибыль по сценариям"),
        chartScenario([["pess", "Пессим."], ["base", "Базовый"], ["opt", "Оптим."]].map(([k, name]) => ({ name, r: calc(applyScenario(STATE.data, k)) })))),
      chartByMp(),
      el("div", { class: "chart-card" }, el("div", { class: "card__title" }, "Окупаемость вложений"), chartPayback(r)),
    ));
};

CUSTOM.reports = (view, r) => {
  view.append(el("div", { class: "card" }, el("div", { class: "card__title" }, "Экспорт текущего проекта"),
    el("div", { class: "toolbar" },
      el("button", { class: "btn btn--primary", onclick: exportExcel }, "📊 Excel (.xls)"),
      el("button", { class: "btn", onclick: exportCSV }, "📄 CSV"),
      el("button", { class: "btn", onclick: () => window.print() }, "🖨️ PDF (печать)"),
      el("button", { class: "btn", onclick: exportJSON }, "🗂️ JSON проекта"),
      el("button", { class: "btn", onclick: () => $("#importFile").click() }, "📥 Импорт JSON"),
    ),
    el("p", { class: "muted small", style: "margin-top:10px" }, "Excel/CSV содержат полную калькуляцию и метрики. PDF формируется через печать браузера (сохраните как PDF). JSON — перенос проекта между устройствами.")));

  // печатный отчёт
  view.append(reportTable(r));
};

/* =========================================================
   9. ВСПОМОГАТЕЛЬНЫЕ: разбивка себестоимости, списки, бары
   ========================================================= */
function costParts(r) {
  const E = r.E, d = STATE.data;
  const arr = [
    ["Товар (закупка)", d.modImport ? r.goodsBatch / r.units : 0],
    ["Логистика Китай", d.modImport ? r.chinaLog / r.units : 0],
    ["Межд. логистика", d.modImport ? r.intlTotal / r.units : 0],
    ["Таможня (пошлина+услуги)", d.modImport ? r.customsCost / r.units : 0],
    ["Производство РФ", r.manufBatch / r.units],
    ["Краски (материалы)", d.modPaints ? r.paintsBatch / r.units : 0],
    ["Расходы маркетплейса", E.mpNet],
    ["Накладные ООО", r.fixedPerUnit],
    ["Налог на прибыль", E.tax],
  ].filter(x => x[1] > 0.001).map(([label, value], i) => ({ label, value, color: ACCENTS[i % ACCENTS.length] }));
  return arr;
}
function breakdownList(rows) {
  const wrap = el("div", { class: "breakdown" });
  for (const [label, value, sign] of rows) {
    wrap.append(el("div", { class: "breakdown__row" },
      el("span", { style: "flex:1" }, label),
      el("span", { class: "breakdown__val mono " + (sign === "pos" ? "pos" : sign === "neg" ? "neg" : "") }, money(value))));
  }
  return wrap;
}
function breakdownBars(parts) {
  const max = Math.max(...parts.map(p => p.value), 1);
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const wrap = el("div", { class: "breakdown" });
  for (const p of parts) {
    wrap.append(el("div", { class: "breakdown__row" },
      el("span", { style: "width:170px" }, p.label),
      el("span", { class: "breakdown__bar" }, el("i", { style: `width:${p.value / max * 100}%;background:${p.color}` })),
      el("span", { class: "breakdown__val mono" }, money(p.value)),
      el("span", { class: "breakdown__pct" }, pct(p.value / total * 100, 0))));
  }
  return wrap;
}

/* =========================================================
   10. ГРАФИКИ (SVG, без библиотек)
   ========================================================= */
function svgEl(w, h) {
  const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  s.setAttribute("viewBox", `0 0 ${w} ${h}`); s.setAttribute("class", "chart-svg"); s.dataset.w = w; s.dataset.h = h;
  return s;
}
function SE(tag, attrs) { const n = document.createElementNS("http://www.w3.org/2000/svg", tag); for (const k in attrs) n.setAttribute(k, attrs[k]); return n; }

function chartDonut(parts) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1;
  const w = 360, h = 240, cx = 120, cy = 120, R = 90, r = 52;
  const s = svgEl(w, h);
  let a0 = -Math.PI / 2;
  for (const p of parts) {
    const a1 = a0 + (p.value / total) * Math.PI * 2;
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    const x0 = cx + R * Math.cos(a0), y0 = cy + R * Math.sin(a0), x1 = cx + R * Math.cos(a1), y1 = cy + R * Math.sin(a1);
    const xi0 = cx + r * Math.cos(a1), yi0 = cy + r * Math.sin(a1), xi1 = cx + r * Math.cos(a0), yi1 = cy + r * Math.sin(a0);
    s.append(SE("path", { d: `M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} L${xi0} ${yi0} A${r} ${r} 0 ${large} 0 ${xi1} ${yi1} Z`, fill: p.color }));
    a0 = a1;
  }
  s.append(SE("text", { x: cx, y: cy - 4, "text-anchor": "middle", "font-size": "12", fill: "currentColor" }));
  const t = SE("text", { x: cx, y: cy + 4, "text-anchor": "middle", "font-size": "14", "font-weight": "700" }); t.textContent = money(total, 0); t.setAttribute("fill", "currentColor");
  s.append(t);
  const wrap = el("div", {}, s);
  const lg = el("div", { class: "legend" });
  for (const p of parts) lg.append(el("div", { class: "legend__item" }, el("span", { class: "legend__dot", style: "background:" + p.color }), `${p.label} — ${pct(p.value / total * 100, 0)}`));
  wrap.append(lg);
  return wrap;
}

function chartBars(items) {
  const w = 520, h = 60 + items.length * 34, pad = 8, labelW = 150, max = Math.max(...items.map(i => Math.abs(i.value)), 1);
  const s = svgEl(w, h);
  items.forEach((it, i) => {
    const y = 20 + i * 34;
    const bw = (w - labelW - 80) * (Math.abs(it.value) / max);
    const lbl = SE("text", { x: 0, y: y + 13, "font-size": "12" }); lbl.textContent = it.label.length > 20 ? it.label.slice(0, 19) + "…" : it.label; s.append(lbl);
    s.append(SE("rect", { x: labelW, y, width: Math.max(2, bw), height: 18, rx: 4, fill: it.value >= 0 ? "var(--good)" : "var(--bad)" }));
    const vt = SE("text", { x: labelW + bw + 6, y: y + 13, "font-size": "11" }); vt.textContent = money(it.value, 0); s.append(vt);
  });
  return s;
}

function chartScenario(data) {
  const items = data.map((d, i) => ({ label: d.name, value: d.r.profitMonth, color: [ACCENTS[3], ACCENTS[0], ACCENTS[1]][i] }));
  const w = 380, h = 220, pad = 30, max = Math.max(...items.map(i => Math.abs(i.value)), 1), base = h - 30;
  const s = svgEl(w, h);
  s.append(SE("line", { x1: pad, y1: base, x2: w - 10, y2: base, class: "axis" }));
  const bw = (w - pad - 20) / items.length - 16;
  items.forEach((it, i) => {
    const x = pad + 8 + i * ((w - pad - 20) / items.length);
    const bh = (Math.abs(it.value) / max) * (base - 20);
    s.append(SE("rect", { x, y: it.value >= 0 ? base - bh : base, width: bw, height: bh, rx: 4, fill: it.color }));
    const lt = SE("text", { x: x + bw / 2, y: base + 16, "text-anchor": "middle", "font-size": "11" }); lt.textContent = it.label; s.append(lt);
    const vt = SE("text", { x: x + bw / 2, y: (it.value >= 0 ? base - bh - 6 : base + bh + 14), "text-anchor": "middle", "font-size": "11", "font-weight": "700" }); vt.textContent = money(it.value, 0); s.append(vt);
  });
  return s;
}

function chartBreakeven(r) {
  const w = 380, h = 240, padL = 46, padB = 30, be = isFinite(r.breakeven) ? r.breakeven : r.planMonth * 2;
  const maxQ = Math.max(be * 1.6, r.planMonth * 1.3, 10);
  const price = num(r.mp.sellPrice), varCost = r.E.cogsVarNet, fixed = r.fixedMonthly;
  const maxRub = Math.max(price * maxQ, 1);
  const X = q => padL + (q / maxQ) * (w - padL - 10);
  const Y = v => (h - padB) - (v / maxRub) * (h - padB - 14);
  const s = svgEl(w, h);
  for (let i = 0; i <= 4; i++) { const y = 14 + i * (h - padB - 14) / 4; s.append(SE("line", { x1: padL, y1: y, x2: w - 10, y2: y, class: "grid-line" })); }
  s.append(SE("line", { x1: padL, y1: h - padB, x2: w - 10, y2: h - padB, class: "axis" }));
  s.append(SE("line", { x1: padL, y1: 14, x2: padL, y2: h - padB, class: "axis" }));
  // выручка
  s.append(SE("line", { x1: X(0), y1: Y(0), x2: X(maxQ), y2: Y(price * maxQ), stroke: "var(--good)", "stroke-width": 2 }));
  // суммарные затраты = fixed + varCost*q
  s.append(SE("line", { x1: X(0), y1: Y(fixed), x2: X(maxQ), y2: Y(fixed + varCost * maxQ), stroke: "var(--bad)", "stroke-width": 2 }));
  // точка безубыточности
  if (isFinite(r.breakeven) && r.breakeven <= maxQ) {
    s.append(SE("line", { x1: X(be), y1: 14, x2: X(be), y2: h - padB, class: "grid-line" }));
    s.append(SE("circle", { cx: X(be), cy: Y(price * be), r: 4, fill: "var(--primary)" }));
    const t = SE("text", { x: X(be), y: 12, "text-anchor": "middle", "font-size": "11", "font-weight": "700" }); t.textContent = numfmt(be, 0) + " шт"; s.append(t);
  }
  const wrap = el("div", {}, s, el("div", { class: "legend" },
    el("div", { class: "legend__item" }, el("span", { class: "legend__dot", style: "background:var(--good)" }), "Выручка"),
    el("div", { class: "legend__item" }, el("span", { class: "legend__dot", style: "background:var(--bad)" }), "Затраты"),
    el("div", { class: "legend__item" }, el("span", { class: "legend__dot", style: "background:var(--primary)" }), "Точка безубыточности")));
  return wrap;
}

function chartPayback(r) {
  const w = 380, h = 220, padL = 46, padB = 26, months = 12;
  const inv = r.batchInvestment, perMonth = r.profitMonth;
  const maxV = Math.max(inv * 1.2, perMonth * months, 1);
  const X = mth => padL + (mth / months) * (w - padL - 10);
  const Y = v => (h - padB) - (v / maxV) * (h - padB - 14);
  const s = svgEl(w, h);
  s.append(SE("line", { x1: padL, y1: h - padB, x2: w - 10, y2: h - padB, class: "axis" }));
  s.append(SE("line", { x1: padL, y1: 14, x2: padL, y2: h - padB, class: "axis" }));
  s.append(SE("line", { x1: X(0), y1: Y(inv), x2: X(months), y2: Y(inv), stroke: "var(--bad)", "stroke-width": 1.5, "stroke-dasharray": "4 4" }));
  let d = `M${X(0)} ${Y(0)}`;
  for (let mth = 1; mth <= months; mth++) d += ` L${X(mth)} ${Y(perMonth * mth)}`;
  s.append(SE("path", { d, fill: "none", stroke: "var(--good)", "stroke-width": 2 }));
  if (isFinite(r.payback) && r.payback <= months) s.append(SE("circle", { cx: X(r.payback), cy: Y(inv), r: 4, fill: "var(--primary)" }));
  const lab = SE("text", { x: padL + 4, y: Y(inv) - 5, "font-size": "11" }); lab.textContent = "Вложения " + money(inv, 0); s.append(lab);
  return el("div", {}, s, el("div", { class: "muted small" }, isFinite(r.payback) ? `Окупаемость партии ≈ ${numfmt(r.payback, 1)} мес` : "Окупаемость не достигается"));
}

function chartByMp() {
  const items = MP_LIST.map(m => {
    const d = JSON.parse(JSON.stringify(STATE.data)); d.activeMp = m.id;
    return { label: m.name, value: calc(d).E.net };
  });
  return el("div", { class: "chart-card" }, el("div", { class: "card__title" }, "Прибыль с единицы по маркетплейсам"), chartBars(items));
}

/* =========================================================
   11. ПЕЧАТНЫЙ ОТЧЁТ + ЭКСПОРТ
   ========================================================= */
function reportRows(r) {
  const E = r.E, d = STATE.data;
  return [
    ["Проект", STATE.project.name],
    ["Товар / SKU", (d.name || "—") + " / " + (d.sku || "—")],
    ["Маркетплейс / модель", MP_LIST.find(m => m.id === d.activeMp).name + " / " + d.activeModel],
    ["—", ""],
    ["Единиц в партии, шт", numfmt(r.units, 0)],
    ["Себестоимость закупки, ₽", numfmt(r.purchaseBatch, 2)],
    ["Логистика Китай, ₽", numfmt(r.chinaLog, 2)],
    ["Межд. логистика, ₽", numfmt(r.intlTotal, 2)],
    ["Таможенная стоимость (CIF), ₽", numfmt(r.cif, 2)],
    ["Пошлина, ₽", numfmt(r.duty, 2)],
    ["Таможенный НДС (к вычету), ₽", numfmt(r.importVat, 2)],
    ["Таможенные расходы, ₽", numfmt(r.customsCost, 2)],
    ["—", ""],
    ["Себестоимость единицы (товар), ₽", numfmt(r.landedUnit, 2)],
    ["Накладные на единицу, ₽", numfmt(r.fixedPerUnit, 2)],
    ["Полная себестоимость единицы, ₽", numfmt(r.unitCostFull, 2)],
    ["Цена продажи, ₽", numfmt(num(r.mp.sellPrice), 2)],
    ["—", ""],
    ["Исходящий НДС, ₽", numfmt(E.outVat, 2)],
    ["Входящий НДС, ₽", numfmt(E.inputVat, 2)],
    ["НДС к уплате, ₽", numfmt(E.vatPay, 2)],
    ["Налог на прибыль, ₽", numfmt(E.tax, 2)],
    ["—", ""],
    ["Валовая прибыль, ₽", numfmt(E.grossProfit, 2)],
    ["Маржинальная прибыль, ₽", numfmt(E.marginal, 2)],
    ["Чистая прибыль с единицы, ₽", numfmt(E.net, 2)],
    ["Рентабельность (ROS), %", numfmt(r.ros, 1)],
    ["ROI, %", numfmt(r.roi, 1)],
    ["ROMI, %", numfmt(r.romi, 1)],
    ["Точка безубыточности, шт/мес", isFinite(r.breakeven) ? numfmt(r.breakeven, 0) : "∞"],
    ["Срок окупаемости, мес", isFinite(r.payback) ? numfmt(r.payback, 1) : "∞"],
    ["Прибыль за месяц, ₽", numfmt(r.profitMonth, 2)],
    ["Прибыль за год, ₽", numfmt(r.profitYear, 2)],
    ["Минимальная цена, ₽", numfmt(r.minPrice, 2)],
    ["Рекомендуемая цена, ₽", numfmt(r.recoPrice, 2)],
    ["Макс. скидка без убытка, %", numfmt(r.maxDiscount, 1)],
  ];
}
function reportTable(r) {
  const tbl = el("table", { class: "tbl" });
  tbl.append(el("thead", {}, el("tr", {}, el("th", {}, "Показатель"), el("th", {}, "Значение"))));
  const tb = el("tbody");
  for (const [k, val] of reportRows(r)) {
    if (k === "—") { tb.append(el("tr", {}, el("td", { colspan: 2, style: "height:6px;border:none" }, ""))); continue; }
    tb.append(el("tr", {}, el("td", {}, k), el("td", { class: "mono" }, val)));
  }
  tbl.append(tb);
  return el("div", { class: "card" },
    el("div", { class: "print-only", style: "margin-bottom:8px" }, el("h2", {}, "Юнит-Экономика PRO — " + STATE.project.name), el("div", { class: "muted small" }, "Отчёт от " + dateStr(Date.now()))),
    el("div", { class: "card__title" }, "Сводный отчёт"), el("div", { class: "table-wrap" }, tbl));
}

function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const a = el("a", { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
function exportCSV() {
  const r = calc(STATE.data);
  const rows = reportRows(r).filter(x => x[0] !== "—");
  const csv = "﻿" + rows.map(([k, v]) => `"${String(k).replace(/"/g, '""')}";"${String(v).replace(/"/g, '""')}"`).join("\r\n");
  download(safeName() + ".csv", csv, "text/csv;charset=utf-8");
  toast("CSV выгружен", "good");
}
function exportExcel() {
  const r = calc(STATE.data);
  const rows = reportRows(r).filter(x => x[0] !== "—");
  const cells = rows.map(([k, v]) => {
    const numv = parseFloat(String(v).replace(/\s/g, "").replace(",", "."));
    const isNum = isFinite(numv) && /^[-\d]/.test(String(v).trim()) && !/[/]/.test(String(v));
    return `<Row><Cell><Data ss:Type="String">${esc(k)}</Data></Cell><Cell><Data ss:Type="${isNum ? "Number" : "String"}">${isNum ? numv : esc(v)}</Data></Cell></Row>`;
  }).join("");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
<Styles><Style ss:ID="h"><Font ss:Bold="1" ss:Size="13"/></Style>
<Style ss:ID="t"><Font ss:Bold="1"/><Interior ss:Color="#DCE6FF" ss:Pattern="Solid"/></Style></Styles>
<Worksheet ss:Name="Калькуляция"><Table>
<Row><Cell ss:StyleID="h"><Data ss:Type="String">Юнит-Экономика PRO — ${esc(STATE.project.name)}</Data></Cell></Row>
<Row><Cell><Data ss:Type="String">Отчёт от ${esc(dateStr(Date.now()))}</Data></Cell></Row>
<Row></Row>
<Row ss:StyleID="t"><Cell><Data ss:Type="String">Показатель</Data></Cell><Cell><Data ss:Type="String">Значение</Data></Cell></Row>
${cells}
</Table></Worksheet></Workbook>`;
  download(safeName() + ".xls", xml, "application/vnd.ms-excel");
  toast("Excel выгружен", "good");
}
function exportJSON() {
  STATE.project.data = STATE.data;
  download(safeName() + ".json", JSON.stringify(STATE.project, null, 2), "application/json");
  toast("Проект выгружен в JSON", "good");
}
function esc(s) { return String(s).replace(/[<>&]/g, c => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c])); }
function safeName() { return (STATE.project.name || "project").replace(/[^\wа-яё\- ]/gi, "").trim() || "project"; }

/* =========================================================
   12. ДАШБОРД
   ========================================================= */
CUSTOM.dashboard = (view, r) => {
  const all = STATE.projectsCache.length ? STATE.projectsCache : (STATE.project ? [STATE.project] : []);
  const calced = all.map(p => ({ p, r: calc(Object.assign(defaultData(), p.data)) }));
  const invested = calced.reduce((s, x) => s + x.r.batchInvestment, 0);
  const profMonth = calced.reduce((s, x) => s + x.r.profitMonth, 0);
  const profYear = profMonth * 12;
  const avgMargin = calced.length ? calced.reduce((s, x) => s + x.r.marginPct, 0) / calced.length : 0;
  const best = calced.slice().sort((a, b) => b.r.E.net - a.r.E.net)[0];
  const worst = calced.slice().sort((a, b) => a.r.E.net - b.r.E.net)[0];
  const working = num(UI.capital) - invested;

  const cap = el("div", { class: "card" }, el("div", { class: "card__title" }, "Оборотный капитал"),
    el("div", { class: "grid" },
      el("div", { class: "field" }, el("label", {}, "Стартовый капитал, ₽"),
        el("div", { class: "input-wrap" }, el("input", { type: "number", value: UI.capital, oninput: (e) => { UI.capital = num(e.target.value); saveUI(); render(); } }), el("span", { class: "unit" }, "₽")))));

  const kpis = el("div", { class: "grid" },
    kpiCard("Вложенные средства", money(invested, 0), `${all.length} проект(ов)`),
    kpiCard("Остаток оборотного капитала", money(working, 0), working < 0 ? "превышение!" : "доступно", working < 0 ? "bad" : "good"),
    kpiCard("Прибыль текущего месяца", money(profMonth, 0), "по планам продаж", profMonth >= 0 ? "good" : "bad"),
    kpiCard("Прибыль года", money(profYear, 0), "прогноз", profYear >= 0 ? "good" : "bad"),
    kpiCard("Средняя маржинальность", pct(avgMargin), "по портфелю"),
    kpiCard("Лучший товар", best ? best.p.name : "—", best ? money(best.r.E.net) + " / ед" : "", "good"),
    kpiCard("Худший товар", worst ? worst.p.name : "—", worst ? money(worst.r.E.net) + " / ед" : "", worst && worst.r.E.net < 0 ? "bad" : ""),
    kpiCard("Текущий проект", STATE.project ? STATE.project.name : "—", money(r.E.net) + " / ед", r.E.net >= 0 ? "good" : "bad"),
  );
  view.append(cap, el("div", { class: "card" }, el("div", { class: "card__title" }, "Показатели бизнеса"), kpis));

  if (calced.length > 1) {
    view.append(el("div", { class: "card" }, el("div", { class: "card__title" }, "Прибыль с единицы по товарам"),
      chartBars(calced.map(x => ({ label: x.p.name, value: x.r.E.net })))));
  }
  view.append(el("div", { class: "help-box" }, "Все проекты хранятся локально (IndexedDB) только в этом браузере. Делайте экспорт JSON для резервной копии."));
};
function kpiCard(label, value, sub, cls = "") {
  return el("div", { class: "kpi " + cls }, el("div", { class: "kpi__label" }, label), el("div", { class: "kpi__value", style: "font-size:20px" }, value), sub ? el("div", { class: "kpi__sub" }, sub) : null);
}

/* =========================================================
   13. МОДАЛКИ, ТОСТЫ
   ========================================================= */
function toast(msg, type = "") {
  const t = el("div", { class: "toast " + type }, msg);
  $("#toasts").append(t);
  setTimeout(() => { t.style.opacity = "0"; setTimeout(() => t.remove(), 300); }, 2600);
}
function modal(title, bodyNode, footNodes) {
  $("#modalTitle").textContent = title;
  const b = $("#modalBody"); b.innerHTML = ""; b.append(bodyNode);
  const f = $("#modalFoot"); f.innerHTML = ""; (footNodes || []).forEach(n => f.append(n));
  $("#modal").hidden = false;
}
function closeModal() { $("#modal").hidden = true; }

async function showProjects() {
  await refreshProjectsCache();
  const list = el("div", { class: "plist" });
  const items = STATE.projectsCache.slice().sort((a, b) => b.updatedAt - a.updatedAt);
  if (!items.length) list.append(el("div", { class: "empty" }, "Нет проектов"));
  for (const p of items) {
    const rr = calc(Object.assign(defaultData(), p.data));
    list.append(el("div", { class: "pitem" + (STATE.project && p.id === STATE.project.id ? " current" : "") },
      el("div", { class: "pitem__main", onclick: async () => { closeModal(); const full = await Store.getAll(); loadProjectObj(full.find(x => x.id === p.id)); toast("Проект загружен"); } },
        el("div", { class: "pitem__name" }, p.name),
        el("div", { class: "pitem__meta" }, "изм. " + dateStr(p.updatedAt))),
      el("div", { class: "pitem__kpi" }, el("div", { class: rr.E.net >= 0 ? "pos" : "neg" }, money(rr.E.net) + "/ед"), el("div", { class: "muted small" }, "ROI " + pct(rr.roi))),
      el("div", { class: "pitem__actions" },
        el("button", { class: "btn btn--sm", title: "Дублировать", onclick: () => duplicateProject(p.id) }, "⧉"),
        el("button", { class: "btn btn--sm btn--danger", title: "Удалить", onclick: () => deleteProject(p.id) }, "🗑"))));
  }
  modal("Проекты (" + items.length + ")", list, [
    el("button", { class: "btn", onclick: () => $("#importFile").click() }, "📥 Импорт JSON"),
    el("button", { class: "btn btn--primary", onclick: () => { closeModal(); createProject(); } }, "＋ Новый проект"),
  ]);
}

/* =========================================================
   14. ОПЕРАЦИИ С ПРОЕКТАМИ
   ========================================================= */
async function createProject() {
  if (STATE.dirty) await saveProject(true);
  const p = newProject("Новый товар " + new Date().toLocaleDateString("ru-RU"));
  await Store.put(p);
  await refreshProjectsCache();
  loadProjectObj(p);
  UI.section = "settings"; saveUI(); render();
  toast("Создан новый проект", "good");
}
async function duplicateProject(id) {
  const all = await Store.getAll();
  const src = all.find(x => x.id === id); if (!src) return;
  const copy = JSON.parse(JSON.stringify(src));
  copy.id = uid(); copy.name = src.name + " (копия)"; copy.createdAt = copy.updatedAt = Date.now();
  await Store.put(copy); await refreshProjectsCache();
  toast("Проект дублирован", "good");
  showProjects();
}
async function deleteProject(id) {
  const all = await Store.getAll();
  const p = all.find(x => x.id === id); if (!p) return;
  if (!confirm(`Удалить проект «${p.name}»? Действие необратимо.`)) return;
  await Store.del(id); await refreshProjectsCache();
  if (STATE.project && STATE.project.id === id) {
    const rest = STATE.projectsCache;
    if (rest.length) loadProjectObj(rest[0]); else { const np = newProject("Новый товар"); await Store.put(np); await refreshProjectsCache(); loadProjectObj(np); }
  }
  toast("Проект удалён");
  showProjects();
}
function importJSON(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const obj = JSON.parse(reader.result);
      const arr = Array.isArray(obj) ? obj : [obj];
      for (const p of arr) {
        if (!p || !p.data) throw new Error("bad");
        p.id = uid(); p.name = (p.name || "Импорт") ; p.createdAt = p.createdAt || Date.now(); p.updatedAt = Date.now();
        await Store.put(p);
      }
      await refreshProjectsCache();
      loadProjectObj((await Store.getAll()).sort((a, b) => b.updatedAt - a.updatedAt)[0]);
      toast("Импортировано проектов: " + arr.length, "good");
      closeModal();
    } catch { toast("Ошибка импорта: неверный файл", "bad"); }
  };
  reader.readAsText(file);
}

/* =========================================================
   15. ТЕМА, САЙДБАР, СОБЫТИЯ
   ========================================================= */
function applyTheme() { document.body.dataset.theme = UI.theme; $("meta[name=theme-color]")?.setAttribute("content", UI.theme === "dark" ? "#0e1117" : "#3461e8"); }
function toggleTheme() { UI.theme = UI.theme === "dark" ? "light" : "dark"; saveUI(); applyTheme(); }
function openSidebar() { $("#sidebar").classList.add("open"); $("#sidebarBackdrop").classList.add("show"); }
function closeSidebar() { $("#sidebar").classList.remove("open"); $("#sidebarBackdrop").classList.remove("show"); }

let deferredPrompt = null;
function setupInstall() {
  const btn = $("#btnInstall");
  if (!btn) return;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  // Chrome/Edge (Android и ПК): системное событие установки
  window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); deferredPrompt = e; btn.hidden = false; });
  window.addEventListener("appinstalled", () => { deferredPrompt = null; btn.hidden = true; toast("Приложение установлено", "good"); });
  // iOS Safari не поддерживает beforeinstallprompt — показываем кнопку с инструкцией
  if (isIOS && !standalone) btn.hidden = false;
  if (standalone) btn.hidden = true; // уже установлено
  btn.onclick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      try { await deferredPrompt.userChoice; } catch (e) {}
      deferredPrompt = null; btn.hidden = true;
    } else if (isIOS) {
      modal("Установка на iPhone / iPad",
        el("div", {},
          el("p", { style: "margin:0 0 8px" }, "В Safari нажмите кнопку «Поделиться» (квадрат со стрелкой вверх) → «На экран «Домой»."),
          el("p", { class: "muted small" }, "На iOS установка веб-приложения доступна только через браузер Safari.")),
        [el("button", { class: "btn btn--primary", onclick: closeModal }, "Понятно")]);
    } else {
      toast("Откройте сайт в Chrome или Edge (по https) — кнопка установки появится автоматически", "warn");
    }
  };
}

function wireEvents() {
  $("#btnTheme").onclick = toggleTheme;
  $("#btnNew").onclick = createProject;
  $("#btnSave").onclick = () => saveProject(false);
  $("#btnProjects").onclick = showProjects;
  $("#btnMenu").onclick = openSidebar;
  $("#sidebarBackdrop").onclick = closeSidebar;
  $("#projectName").addEventListener("input", e => { STATE.project.name = e.target.value; STATE.data.name = e.target.value; setDirty(); });
  $$("[data-close]").forEach(b => b.onclick = closeModal);
  $("#importFile").addEventListener("change", e => { if (e.target.files[0]) importJSON(e.target.files[0]); e.target.value = ""; });
  document.addEventListener("keydown", e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); saveProject(false); }
    if (e.key === "Escape") closeModal();
  });
  // автосохранение каждые 30 секунд
  setInterval(() => { if (STATE.dirty) saveProject(true); }, 30000);
  window.addEventListener("beforeunload", e => { if (STATE.dirty) { saveProject(true); } });
}

/* =========================================================
   16. ДЕМО-ПРОЕКТ + ИНИЦИАЛИЗАЦИЯ
   ========================================================= */
function demoProject() {
  const p = newProject("Демо: Органайзер настольный (Китай → WB)");
  p.data.name = "Органайзер настольный бамбуковый";
  p.data.sku = "ORG-BMB-01"; p.data.category = "Дом и сад"; p.data.supplier = "Ningbo Trade Co.";
  return p;
}

async function init() {
  applyTheme();
  wireEvents();
  setupInstall();
  await refreshProjectsCache();
  if (!STATE.projectsCache.length) {
    const demo = demoProject();
    await Store.put(demo);
    await refreshProjectsCache();
  }
  // загрузить последний или первый
  let p = STATE.projectsCache.find(x => x.id === UI.lastProjectId) || STATE.projectsCache.sort((a, b) => b.updatedAt - a.updatedAt)[0];
  loadProjectObj(p);
  // спрятать сплэш
  setTimeout(() => { $("#splash").classList.add("hide"); }, 350);

  // регистрация сервис-воркера (офлайн)
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
  }
}

document.addEventListener("DOMContentLoaded", init);
})();
