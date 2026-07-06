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
    SUPABASE["☁️ Supabase\nPostgreSQL — auth, история, сценарии\nhnoubdyasgxdpplahpxu.supabase.co"]
    RESEND["✉️ Resend\nОтправка кода подтверждения email\nresend.com"]
    RAILWAY["☁️ Railway\nХостинг бэкенда (публично, HTTPS)\ntranslator-production-6a87.up.railway.app"]
    GITHUB["🐙 GitHub\nХранение исходного кода + автодеплой на Railway\ngithub.com/kotspilgrim/translator"]
    TAILSCALE["🔒 Tailscale VPN\nТолько для локальной разработки\n100.68.162.96"]
  end

  RU -->|"Голос / текст"| APP
  KO -->|"Голос / текст"| APP
  DEV -->|"Разрабатывает и деплоит"| APP
  APP -->|"POST /translate\nHTTPS, публично"| RAILWAY
  RAILWAY -->|"POST /chat/completions\nHTTPS"| OPENAI
  RAILWAY -->|"auth, история, сценарии\nHTTPS"| SUPABASE
  RAILWAY -->|"код подтверждения\nHTTPS"| RESEND
  DEV -->|"git push"| GITHUB
  GITHUB -->|"автодеплой на push в main"| RAILWAY
  APP -.->|"локальная разработка через"| TAILSCALE
```

---

## Уровень 2 — Контейнеры

Из каких процессов состоит система, на каком железе они работают.

```mermaid
graph TB
  subgraph phone["📱 Samsung Galaxy S24 — Android 14"]
    ANDROID["Android App\n─────────────────\nReact Native 0.76 / Expo SDK 52\nHermes JS Engine\n\n• UI для двух пользователей\n• Распознавание речи на устройстве\n  expo-speech-recognition\n• TTS — expo-speech\n• История — AsyncStorage"]
  end

  subgraph railway["☁️ Railway — производственный хостинг"]
    BACKEND["Backend API\n─────────────────\nNode.js / Express 4\nПорт: process.env.PORT (динамический)\n\n• POST /translate, /scenarios, /health\n• /auth/* — signup/login/verify/me\n• Валидация входных данных\n• Системные промпты по сценариям\n• Rate limit: 30 req/мин (/translate), 10 req/мин (/auth)"]

    PROMPTS["Файлы промптов\n─────────────────\nbackend/prompts/*.txt\n\n8 встроенных сценариев\n(stranger-on-street, v-magazine, v-restorane,\nv-banke, v-bolnitse, v-otele, v-transporte,\nv-vetklinike) + пользовательские"]
  end

  subgraph pc["💻 Windows 11 PC — только для разработки"]
    DEVBACKEND["Backend (dev copy)\n192.168.35.219 / 100.68.162.96:3000\nтот же код, для локальной итерации"]
  end

  subgraph cloud["☁️ Облако"]
    OPENAI["OpenAI GPT-4o\napi.openai.com:443"]
    SUPABASE["Supabase PostgreSQL\nusers, scenarios, translations"]
    RESEND["Resend\nemail-коды подтверждения"]
    GITHUB["GitHub\ngithub.com/kotspilgrim/translator"]
  end

  ANDROID -->|"POST /translate и др.\nHTTPS, публично\ntranslator-production-6a87.up.railway.app"| BACKEND
  BACKEND -->|"readFileSync()"| PROMPTS
  BACKEND -->|"chat.completions.create()\nHTTPS"| OPENAI
  BACKEND -->|"supabase.from().insert/select()\nHTTPS"| SUPABASE
  BACKEND -->|"resend.emails.send()\nHTTPS"| RESEND
  pc -.->|"git push"| GITHUB
  GITHUB -->|"автодеплой (Root Directory: backend)"| railway
  DEVBACKEND -.->|"Tailscale, только для разработки"| ANDROID
```

---

## Уровень 3А — Компоненты Android App

> ⚠️ **Диаграмма ниже устарела** и описывает раннюю версию `App.js`. С тех пор добавлены: экраны авторизации (SignIn/SignUp/VerifyCode) и гостевой режим, полноценный CRUD сценариев (создание/редактирование/удаление/закрепление через backend `/scenarios`), выбор исходного языка перевода (8 языков вместо фиксированного русского), локализация интерфейса на 9 языков (`frontend/i18n.js`), офлайн-перевод через `frontend/modules/mlkit-translate/` с экраном управления языковыми пакетами, тёмная/светлая тема, themed-уведомления вместо `Alert.alert`. Актуальное описание каждой из этих частей — в `CLAUDE.md` (там оно поддерживается по ходу разработки); полная переотрисовка диаграммы ниже — отдельная задача, не сделанная в рамках этого обновления.

Что происходит внутри `frontend/App.js` (снимок на момент первой версии).

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
  REQ["HTTP Request\nPOST /translate | /auth/*"]

  subgraph backend["Backend — backend/server.js + auth.js + email.js"]
    direction TB
    MW["Middleware\n─────────\nhelmet — security headers\ncors origin=false\nexpress.json limit=32kb"]
    RL["Rate Limiters\n─────────\n/translate, /scenarios, /health: 30/мин\n/auth/*: 10/мин (authLimiter)"]
    ROUTE["POST /translate\n─────────\nВалидация:\n• text обязателен\n• fromLang/toLang: 9 языков\n  (ALLOWED_LANGS)\n• max 1000 символов"]
    PL["Prompt Loader\n─────────\ngetSystemPrompt()\nЧитает prompts/сценарий.txt\nПодставляет fromLang, toLang"]
    OAI["OpenAI Client\n─────────\ngpt-4o\ntemperature=0.3\nsystem+user message"]
    SB["Supabase Logger\n─────────\nfire-and-forget INSERT\noriginal_text, translated_text\nfrom_lang, to_lang, scenario"]
    AUTH["Auth Router — auth.js\n─────────\nsignup / verify-email / resend-code\nlogin / me (JWT, requireAuth)\nbcrypt hash, 6-значный код, 10 мин TTL"]
    EMAIL["Email Sender — email.js\n─────────\nsendVerificationCode()\nconsole.log всегда + Resend,\nесли задан RESEND_API_KEY"]
  end

  RESP["HTTP Response\n{translation} | {token, user}"]

  REQ --> MW --> RL
  RL --> ROUTE
  RL --> AUTH
  ROUTE --> PL
  PL --> OAI
  OAI --> RESP
  ROUTE --> SB
  AUTH --> EMAIL
  AUTH --> SB
  AUTH --> RESP
```

---

## Схема физического деплоя

```mermaid
graph TB
  subgraph phone["📱 Телефон"]
    DEVAPK["Dev-client APK (debug)\ncom.translator.app\nТребует Metro,\nдля повседневной разработки"]
    RELAPK["Release APK (standalone)\ncom.translator.app\nJS зашит в бандл,\nне требует Metro\narm64-v8a-only ≈42MB\n(полный universal ≈121MB)"]
    STT["On-device STT\nAndroid SpeechRecognizer"]
    JS["Hermes JS Engine"]
    DEVAPK --> JS
    RELAPK --> JS
    JS --> STT
  end

  subgraph network["Сеть — только для локальной разработки"]
    TS["🔒 Tailscale VPN\nPC: 100.68.162.96\n\nЛокальный бэкенд для итерации"]
    USB["🔌 USB — ADB Reverse\nadb reverse tcp:8090 tcp:8090\nadb reverse tcp:3000 tcp:3000"]
  end

  subgraph pc["💻 Windows 11 PC — только разработка"]
    BE["Node.js Backend (dev copy)\n:3000\nLAN: 192.168.35.219\nTailscale: 100.68.162.96"]
    METRO["Metro Bundler\n:8090 (не 8081 — см. CLAUDE.md)\nтолько для dev-client"]
    GITL["Git repo\nC:\\Projects\\translator\nbranch: main"]
    ENV[".env\nOPENAI_API_KEY, SUPABASE_*\nJWT_SECRET, RESEND_API_KEY, EMAIL_FROM"]
    BE --- ENV
  end

  subgraph railway_deploy["☁️ Railway — продакшн"]
    RWBE["Backend (production)\nprocess.env.PORT\ntranslator-production-6a87.up.railway.app\nRoot Directory: backend\nАвтодеплой из GitHub main"]
  end

  subgraph cloud["☁️ Облако"]
    OPENAI_C["OpenAI\napi.openai.com:443"]
    SUPABASE_C["Supabase\n*.supabase.co"]
    RESEND_C["Resend\nresend.com"]
    GITHUB_C["GitHub\ngithub.com/kotspilgrim/translator"]
  end

  phone -->|"Продакшн: BACKEND_URL = Railway\nHTTPS, публично, из любой сети"| RWBE
  phone -.->|"Разработка: через Tailscale"| TS
  TS -.-> pc
  phone -.->|"Разработка: через USB"| USB
  USB -.-> METRO
  USB -.-> BE
  RWBE -->|"HTTPS"| OPENAI_C
  RWBE -->|"HTTPS"| SUPABASE_C
  RWBE -->|"HTTPS"| RESEND_C
  pc -.->|"HTTPS (dev copy)"| OPENAI_C
  pc -->|"git push"| GITHUB_C
  GITHUB_C -->|"автодеплой"| RWBE
  GITL --- pc
```

---

## Процесс разработки — последовательность

```mermaid
sequenceDiagram
  participant Dev as 👨‍💻 Разработчик
  participant Git as 🐙 GitHub
  participant Metro as Metro :8090
  participant ADB as ADB USB/Wi-Fi
  participant Phone as 📱 Телефон
  participant BE as Backend (dev copy) :3000
  participant GPT as OpenAI GPT-4o

  Note over Dev,GPT: ── Первичная сборка (при изменении нативного кода) ──

  Dev->>Dev: expo prebuild --platform android
  Note right of Dev: Генерирует android/ из app.json
  Dev->>Phone: npm run android (adb install dev-client APK)
  Phone->>ADB: Подключается по USB или Wi-Fi (wireless debugging)
  Dev->>ADB: adb reverse tcp:8090 tcp:8090
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

  Note over Dev,GPT: ── Публикация бэкенда ──

  Dev->>Git: git add / git commit / git push (main)
  Git->>Git: Railway подхватывает push,\nпересобирает и передеплоивает backend/ автоматически
```

---

## Конфигурация — все ключевые значения

| Параметр | Файл | Значение |
|---|---|---|
| **Backend URL (продакшн)** | `frontend/App.js:37` | `https://translator-production-6a87.up.railway.app` |
| Backend URL (Tailscale, dev) | `frontend/App.js:37` (закомментированная альтернатива) | `http://100.68.162.96:3000` |
| Backend URL (USB-dev) | — | `http://localhost:3000` |
| LAN IP компьютера | `ipconfig` | `192.168.35.219` |
| Tailscale IP компьютера | Tailscale dashboard | `100.68.162.96` |
| Backend порт (Railway) | `backend/server.js` | `process.env.PORT` (динамический, Railway сам назначает) |
| Backend порт (локально) | `backend/server.js` | `3000` (фолбэк, если `PORT` не задан) |
| Metro порт | `frontend/package.json` scripts | `8090` (не 8081 — см. CLAUDE.md, конфликт с Docker Desktop) |
| Android package | `frontend/app.json` | `com.translator.app` |
| Android versionCode | `frontend/app.json` | `1` |
| Expo SDK | `frontend/package.json` | `52` |
| Railway: Root Directory | Railway Dashboard → Settings | `backend` |
| OpenAI ключ | `backend/.env` + Railway Variables | `OPENAI_API_KEY=sk-proj-...` |
| Supabase URL | `backend/.env` + Railway Variables | `SUPABASE_URL=https://hnoubdyasgxdpplahpxu.supabase.co` |
| Resend API-ключ | `backend/.env` + Railway Variables | `RESEND_API_KEY=re_...` (опционально — без него код падает только в консоль) |
| Git remote | `git remote -v` | `https://github.com/kotspilgrim/translator.git` |

---

## Структура файлов

```
translator/
├── backend/
│   ├── server.js               ← Express: /translate, /scenarios, /health
│   ├── auth.js                 ← /auth/*: signup, verify-email, resend-code, login, me
│   ├── email.js                ← sendVerificationCode() — console.log + Resend
│   ├── supabaseClient.js        ← общий Supabase-клиент (server.js и auth.js)
│   ├── scenarios.json           ← реестр сценариев {id, name, file, builtIn}
│   ├── migrations/              ← SQL-миграции, выполняются вручную в Supabase
│   ├── .env                    ← секреты (не коммитить)
│   ├── .env.example             ← шаблон без значений
│   ├── package.json
│   └── prompts/                 ← 8 встроенных сценариев + пользовательские
│       ├── stranger-on-street.txt
│       ├── v-magazine.txt
│       ├── v-restorane.txt
│       ├── v-banke.txt
│       ├── v-bolnitse.txt
│       ├── v-otele.txt
│       ├── v-transporte.txt
│       └── v-vetklinike.txt
│
├── frontend/
│   ├── App.js                  ← весь UI и логика (SignIn/SignUp/History/…)
│   ├── i18n.js                  ← переводы интерфейса (9 языков) + имена сценариев
│   ├── app.json                 ← конфиг Expo: иконки, плагины, права, versionCode
│   ├── eas.json                 ← профиль production (app-bundle, autoIncrement)
│   ├── package.json
│   ├── modules/mlkit-translate/ ← локальный Expo-модуль, офлайн-перевод (Kotlin)
│   ├── assets/
│   │   ├── icon.png            ← иконка 1024×1024
│   │   ├── adaptive-icon.png   ← адаптивная иконка Android
│   │   └── splash-icon.png
│   └── android/                 ← генерируется expo prebuild, не в git
│
├── PRIVACY.md                   ← черновик политики конфиденциальности (для Play Console)
├── CLAUDE.md                    ← инструкции для Claude Code
└── ARCHITECTURE.md              ← этот документ
```
