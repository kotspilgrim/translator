# Архитектура приложения Translator

> Двуязычный голосовой переводчик RU↔KO.
> Документ описывает архитектуру на трёх уровнях: контекст → контейнеры → компоненты,
> а также схему деплоя и процесс разработки.

---

## Уровень 1 — Контекст системы

Кто использует систему и с какими внешними сервисами она работает.

```mermaid
graph TB
  subgraph people["Пользователи"]
    RU["👤 Русскоговорящий\nГоворит / печатает по-русски"]
    KO["👤 Кореец\nГоворит / печатает по-корейски"]
    DEV["👨‍💻 Разработчик\nkotspilgrim"]
  end

  subgraph system["🟦 Translator System"]
    APP["Translator App\nAndroid-приложение + Node.js бекенд"]
  end

  subgraph external["Внешние системы"]
    OPENAI["☁️ OpenAI API\nGPT-4o — переводит текст\napi.openai.com"]
    SUPABASE["☁️ Supabase\nPostgreSQL — хранит историю переводов\nhnoubdyasgxdpplahpxu.supabase.co"]
    GITHUB["🐙 GitHub\nХранение исходного кода\ngithub.com/kotspilgrim/translator"]
    TAILSCALE["🔒 Tailscale VPN\nЗащищённая сеть телефон↔ПК\n100.68.162.96"]
  end

  RU -->|"Голос / текст"| APP
  KO -->|"Голос / текст"| APP
  DEV -->|"Разрабатывает и деплоит"| APP
  APP -->|"POST /chat/completions\nHTTPS"| OPENAI
  APP -->|"INSERT translations\nHTTPS"| SUPABASE
  DEV -->|"git push / git pull"| GITHUB
  APP -->|"Трафик идёт через"| TAILSCALE
```

---

## Уровень 2 — Контейнеры

Из каких процессов состоит система, на каком железе они работают.

```mermaid
graph TB
  subgraph phone["📱 Samsung Galaxy S24 — Android 14"]
    ANDROID["Android App\n─────────────────\nReact Native 0.76 / Expo SDK 52\nHermes JS Engine\n\n• UI для двух пользователей\n• Распознавание речи на устройстве\n  expo-speech-recognition\n• TTS — expo-speech\n• История — AsyncStorage"]
  end

  subgraph pc["💻 Windows 11 PC — 192.168.35.219 / 100.68.162.96"]
    BACKEND["Backend API\n─────────────────\nNode.js 24 / Express 4\nПорт: 3000\n\n• POST /translate\n• Валидация входных данных\n• Системные промпты по сценариям\n• Rate limit: 30 req/мин"]

    PROMPTS["Файлы промптов\n─────────────────\nbackend/prompts/*.txt\n\nstranger-on-street.txt\nv-magazine.txt\nv-restorane.txt\n..."]
  end

  subgraph cloud["☁️ Облако"]
    OPENAI["OpenAI GPT-4o\napi.openai.com:443"]
    SUPABASE["Supabase PostgreSQL\ntable: translations"]
    GITHUB["GitHub\ngithub.com/kotspilgrim/translator"]
  end

  ANDROID -->|"POST /translate\n{text, fromLang, toLang, context}\nHTTP через Tailscale\n100.68.162.96:3000"| BACKEND
  BACKEND -->|"readFileSync()"| PROMPTS
  BACKEND -->|"chat.completions.create()\nHTTPS"| OPENAI
  BACKEND -->|"supabase.from().insert()\nHTTPS"| SUPABASE
  pc -->|"git push"| GITHUB
```

---

## Уровень 3А — Компоненты Android App

Что происходит внутри `frontend/App.js`.

```mermaid
graph TB
  subgraph app["Android App — frontend/App.js"]
    direction TB

    SCR["Screen Manager\nuseState main|history\nПереключает экраны"]

    subgraph main["Главный экран"]
      KO_PANEL["Korean Panel\n─────────\nВерхняя панель повёрнута 180°\nkoRotated state\nКнопка поворота screen-rotation"]
      RU_PANEL["Russian Panel\n─────────\nНижняя панель\nInline TextInput редактирование"]
      SCENARIO["Scenario Picker\n─────────\nModal + ScrollView\n7 встроенных + свои сценарии\nСохраняет в AsyncStorage"]
      GUTTER["Gutter\n─────────\nСтрока между пузырями:\nсценарий + кнопка истории"]
    end

    subgraph logic["Логика"]
      MIC["Mic Handler\n─────────\nexpo-speech-recognition\nhandleMic(ru|ko)\ndirRef — без closure-staleness"]
      TRANSLATE["Translate Function\n─────────\ndoTranslate()\nfetch() → POST /translate\nАвтоматически меняет направление"]
      TTS["TTS\n─────────\nexpo-speech\nhandleSpeak(text, lang)\nru-RU / ko-KR"]
      HISTORY["History Manager\n─────────\nAsyncStorage\nОчищает записи старше 24 ч\nhistRef зеркалит state"]
    end

    subgraph ui_utils["UI"]
      ICONS["MI Icon Component\n─────────\nexpo-font + String.fromCodePoint\nПрямой рендер глифов Material Icons\nMinуя @expo/vector-icons рендерер"]
      HIST_SCR["History Screen\n─────────\nFlatList пузырей\nRU — фиолетовые справа\nKO — серые слева"]
    end
  end

  SCR --> main
  SCR --> HIST_SCR
  KO_PANEL -->|"onPress mic"| MIC
  RU_PANEL -->|"onPress mic"| MIC
  MIC -->|"onResult transcript"| TRANSLATE
  TRANSLATE -->|"сохраняет"| HISTORY
  KO_PANEL -->|"onPress speaker"| TTS
  RU_PANEL -->|"onPress speaker"| TTS
  HIST_SCR -->|"читает"| HISTORY
  main --> ICONS
  GUTTER --> SCENARIO
```

---

## Уровень 3Б — Компоненты Backend

Что происходит внутри `backend/server.js`.

```mermaid
graph LR
  REQ["HTTP Request\nPOST /translate"]

  subgraph backend["Backend — backend/server.js"]
    direction TB
    MW["Middleware\n─────────\nhelmet — security headers\ncors origin=false\nexpress.json limit=32kb"]
    RL["Rate Limiter\n─────────\n30 запросов / 60 сек\nexpress-rate-limit"]
    ROUTE["POST /translate\n─────────\nВалидация:\n• text обязателен\n• fromLang / toLang:\n  только русский|корейский\n• max 1000 символов"]
    PL["Prompt Loader\n─────────\ngetSystemPrompt()\nЧитает prompts/сценарий.txt\nПодставляет fromLang, toLang"]
    OAI["OpenAI Client\n─────────\ngpt-4o\ntemperature=0.3\nsystem+user message"]
    SB["Supabase Logger\n─────────\nfire-and-forget INSERT\noriginal_text, translated_text\nfrom_lang, to_lang, scenario"]
  end

  RESP["HTTP Response\n{translation}"]

  REQ --> MW --> RL --> ROUTE
  ROUTE --> PL
  PL --> OAI
  OAI --> RESP
  ROUTE --> SB
```

---

## Схема физического деплоя

```mermaid
graph TB
  subgraph phone["📱 Samsung Galaxy S24"]
    APK["APK\ncom.translator.app\nexpo-dev-client build"]
    STT["On-device STT\nAndroid SpeechRecognizer"]
    JS["Hermes JS Engine\nвыполняет App.js bundle"]
    APK --> JS --> STT
  end

  subgraph network["Сеть"]
    TS["🔒 Tailscale VPN\nPC: 100.68.162.96\nPhone: 100.x.x.x\n\nРаботает на любой Wi-Fi сети"]
    USB["🔌 USB — ADB Reverse\nadb reverse tcp:8081 tcp:8081\nadb reverse tcp:8082 tcp:8082\nadb reverse tcp:3000 tcp:3000\n\nДля разработки без Wi-Fi"]
  end

  subgraph pc["💻 Windows 11 PC"]
    BE["Node.js Backend\n:3000\nLAN: 192.168.35.219\nTailscale: 100.68.162.96"]
    METRO["Metro Bundler\n:8081\nтолько в режиме разработки"]
    GITL["Git repo\nC:\\Projects\\translator\nbranch: main"]
    ENV[".env\nOPENAI_API_KEY\nSUPABASE_URL\nSUPABASE_SERVICE_KEY"]
    BE --- ENV
  end

  subgraph cloud["☁️ Облако"]
    OPENAI_C["OpenAI\napi.openai.com:443"]
    SUPABASE_C["Supabase\n*.supabase.co"]
    GITHUB_C["GitHub\ngithub.com/kotspilgrim/translator"]
  end

  phone <-->|"Продакшн: через Tailscale\n100.68.162.96:3000"| TS
  TS <--> pc
  phone <-.->|"Разработка: через USB"| USB
  USB <-.-> METRO
  USB <-.-> BE
  pc -->|"HTTPS"| OPENAI_C
  pc -->|"HTTPS"| SUPABASE_C
  pc -->|"git push"| GITHUB_C
  GITL --- pc
```

---

## Процесс разработки — последовательность

```mermaid
sequenceDiagram
  participant Dev as 👨‍💻 Разработчик
  participant Git as 🐙 GitHub
  participant Metro as Metro :8081
  participant ADB as ADB USB
  participant Phone as 📱 Samsung S24
  participant BE as Backend :3000
  participant GPT as OpenAI GPT-4o

  Note over Dev,GPT: ── Первичная сборка (при изменении нативного кода) ──

  Dev->>Dev: expo prebuild --platform android
  Note right of Dev: Генерирует android/ из app.json
  Dev->>Phone: npm run android (adb install APK)
  Phone->>ADB: Подключается по USB
  Dev->>ADB: adb reverse tcp:8081 tcp:8081
  Phone->>Metro: Загружает JS bundle

  Note over Dev,GPT: ── Цикл JS-разработки (без пересборки) ──

  Dev->>Dev: Редактирует App.js
  Metro-->>Phone: Fast Refresh автоматически
  Note right of Phone: Изменения видны мгновенно

  Note over Dev,GPT: ── Runtime: перевод речи ──

  Phone->>Phone: Пользователь нажимает 🎤
  Phone->>Phone: STT → текст (on-device)
  Phone->>BE: POST /translate\n{text, fromLang, toLang, context}
  BE->>BE: Читает prompts/сценарий.txt
  BE->>GPT: chat.completions.create()
  GPT-->>BE: {choices[0].message.content}
  BE-->>Phone: {translation}
  Phone->>Phone: Показывает текст + TTS озвучка

  Note over Dev,GPT: ── Сохранение работы ──

  Dev->>Git: git add / git commit / git push
```

---

## Конфигурация — все ключевые значения

| Параметр | Файл | Значение |
|---|---|---|
| Backend URL (Tailscale) | `frontend/App.js:25` | `http://100.68.162.96:3000` |
| Backend URL (USB-dev) | `frontend/App.js:25` | `http://localhost:3000` |
| LAN IP компьютера | `ipconfig` | `192.168.35.219` |
| Tailscale IP компьютера | Tailscale dashboard | `100.68.162.96` |
| Backend порт | `backend/server.js:13` | `3000` |
| Metro порт | по умолчанию | `8081` |
| Android package | `frontend/app.json` | `com.translator.app` |
| Expo SDK | `frontend/package.json` | `52` |
| OpenAI ключ | `backend/.env` | `OPENAI_API_KEY=sk-proj-...` |
| Supabase URL | `backend/.env` | `SUPABASE_URL=https://hnoubdyasgxdpplahpxu.supabase.co` |
| Git remote | `git remote -v` | `https://github.com/kotspilgrim/translator.git` |

---

## Структура файлов

```
translator/
├── backend/
│   ├── server.js              ← Express, маршрут POST /translate
│   ├── .env                   ← секреты (не коммитить)
│   ├── .env.example           ← шаблон без значений
│   ├── package.json
│   └── prompts/
│       ├── stranger-on-street.txt
│       ├── v-magazine.txt
│       ├── v-restorane.txt
│       ├── v-banke.txt
│       ├── v-bolnitse.txt
│       ├── v-otele.txt
│       └── v-transporte.txt
│
├── frontend/
│   ├── App.js                 ← весь UI и логика (~600 строк)
│   ├── app.json               ← конфиг Expo: иконки, плагины, права
│   ├── package.json
│   ├── assets/
│   │   ├── icon.png           ← иконка 1024×1024
│   │   ├── adaptive-icon.png  ← адаптивная иконка Android
│   │   └── splash-icon.png
│   └── android/               ← генерируется expo prebuild (не трогать)
│
├── CLAUDE.md                  ← инструкции для Claude Code
└── ARCHITECTURE.md            ← этот документ
```
