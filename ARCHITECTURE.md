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
    RU["👤 Говорящий на исходном языке\nRU/EN/JA/ZH/UZ/KK/KY/MN — выбирается в приложении"]
    KO["👤 Кореец\nВторая сторона диалога — всегда корейский"]
    DEV["👨‍💻 Разработчик\nkotspilgrim"]
  end

  subgraph system["🟦 Translator System"]
    APP["Translator App\nAndroid-приложение + Node.js бекенд"]
  end

  subgraph external["Внешние системы"]
    OPENAI["☁️ OpenAI API\nGPT-4o — переводит текст\napi.openai.com"]
    SUPABASE["☁️ Supabase\nPostgreSQL — auth, сценарии, история\nhnoubdyasgxdpplahpxu.supabase.co"]
    RESEND["✉️ Resend\nОтправка кода подтверждения email\nresend.com"]
    RAILWAY["☁️ Railway\nХостинг бэкенда (публично, HTTPS)\ntranslator-production-6a87.up.railway.app"]
    GITHUB["🐙 GitHub\nИсходный код + автодеплой на Railway +\nавтоприменение миграций в Supabase\ngithub.com/kotspilgrim/translator"]
    TAILSCALE["🔒 Tailscale VPN\nТолько для локальной разработки\n100.68.162.96"]
  end

  RU -->|"Голос / текст"| APP
  KO -->|"Голос / текст"| APP
  DEV -->|"Разрабатывает и деплоит"| APP
  APP -->|"POST /translate, /scenarios, /auth/*\nHTTPS, публично"| RAILWAY
  RAILWAY -->|"POST /chat/completions\nHTTPS"| OPENAI
  RAILWAY -->|"auth, сценарии, история\nHTTPS"| SUPABASE
  RAILWAY -->|"код подтверждения\nHTTPS"| RESEND
  DEV -->|"git push"| GITHUB
  GITHUB -->|"автодеплой backend/ на push в main"| RAILWAY
  GITHUB -->|"автоприменение supabase/migrations/\n(Supabase GitHub integration)"| SUPABASE
  APP -.->|"локальная разработка через"| TAILSCALE
```

---

## Уровень 2 — Контейнеры

Из каких процессов состоит система, на каком железе они работают.

```mermaid
graph TB
  subgraph phone["📱 Android — телефон"]
    ANDROID["Android App\n─────────────────\nReact Native 0.76 / Expo SDK 52\nHermes JS Engine\n\n• Двусторонний UI (источник ⇄ корейский)\n• Распознавание речи на устройстве —\n  expo-speech-recognition\n• TTS — expo-speech\n• Офлайн-перевод — ML Kit (свой native-модуль)\n• История — AsyncStorage (24 ч)\n• Интерфейс на 9 языках — frontend/i18n.js"]
  end

  subgraph railway["☁️ Railway — производственный хостинг"]
    BACKEND["Backend API — backend/server.js\n─────────────────\nNode.js / Express 4\nПорт: process.env.PORT (динамический)\n\n• POST /translate — вызывает GPT-4o\n• /auth/* — signup/login/verify/me\n• /scenarios/* — делегируется scenarios.js\n• Rate limit: 30 req/мин (/translate),\n  10 req/мин (/auth)"]
  end

  subgraph pc["💻 Windows 11 PC — только для разработки"]
    DEVBACKEND["Backend (dev copy)\n192.168.35.219 / 100.68.162.96:3000\nтот же код, для локальной итерации"]
  end

  subgraph cloud["☁️ Облако"]
    OPENAI["OpenAI GPT-4o\napi.openai.com:443"]
    SUPABASE["Supabase PostgreSQL\nusers, scenarios, translations\n+ supabase/migrations/ (авто-применение)"]
    RESEND["Resend\nemail-коды подтверждения"]
    GITHUB["GitHub\ngithub.com/kotspilgrim/translator"]
  end

  ANDROID -->|"HTTPS, публично\ntranslator-production-6a87.up.railway.app"| BACKEND
  BACKEND -->|"chat.completions.create()\nHTTPS"| OPENAI
  BACKEND -->|"auth.js, scenarios.js:\nselect/insert/update/delete\nHTTPS"| SUPABASE
  BACKEND -->|"resend.emails.send()\nHTTPS"| RESEND
  pc -.->|"git push"| GITHUB
  GITHUB -->|"автодеплой (Root Directory: backend)"| railway
  GITHUB -->|"автоприменение миграций"| SUPABASE
  DEVBACKEND -.->|"Tailscale, только для разработки"| ANDROID
```

---

## Уровень 3А — Компоненты Android App

Что происходит внутри `frontend/App.js` (плюс `frontend/i18n.js` и `frontend/modules/mlkit-translate/`).

```mermaid
graph TB
  subgraph app["Android App"]
    direction TB

    SCR["Screen Manager\nscreen: boot|signin|signup|verify|main|history|packs\nboot: читает JWT из AsyncStorage,\nпроверяет GET /auth/me (таймаут 8с)"]

    subgraph auth_ui["Авторизация"]
      SIGNIN["SignInScreen\nemail/password"]
      SIGNUP["SignUpScreen\ncheckPasswordRules() — 4 правила,\nиндикатор надёжности"]
      VERIFY["VerifyCodeScreen\n6-значный код, автосабмит\nчерез скрытый TextInput"]
      GUEST["Гостевой режим\nisGuest — без сценариев,\ncontext: null всегда"]
    end

    subgraph main_ui["Главный экран"]
      KO_BUBBLE["Korean Bubble\nповорот 180° (koRotated),\nflip-анимация rotateX + rotateY"]
      SRC_BUBBLE["Source Bubble\nsourceLang — 8 языков,\nlangBtn-чип внутри бабла"]
      GUTTER["Gutter\nScenario Picker + кнопка истории"]
      MENU["Menu Drawer\nСценарии · История · Тест связи ·\nЯзыковые пакеты · Язык интерфейса · Тема · Выйти"]
      NOTICE["Scenario Notice\nthemed-карточка вместо Alert.alert —\nгость/офлайн блокируют пикер"]
    end

    subgraph i18n_logic["Локализация — frontend/i18n.js"]
      TR["tr(key) / t(interfaceLang, key)\n9 языков интерфейса (chrome only)"]
      LANGSHEET["LanguageSheet\nобщий модал: язык интерфейса\nи исходный язык перевода"]
      SCNAME["scenarioName()\nscenario.slug || scenario.id →\nпереведённое название"]
    end

    subgraph translate_logic["Перевод"]
      MIC["Mic Handler\nexpo-speech-recognition\nhandleMic(ru|ko), LANG_LOCALE"]
      DOTR["doTranslate()\nPOST /translate {text, fromLang,\ntoLang, context}"]
      OFFLINE["offlineTranslate()\nML Kit — mlkit-translate,\nбез сценария, без интернета"]
      TTS["TTS — expo-speech\nhandleSpeak(text, LANG_LOCALE)"]
      NETINFO["isOnline — NetInfo\nбыстрый переход на офлайн\nбез ожидания таймаута"]
    end

    subgraph scenario_logic["Сценарии (backend/scenarios.js)"]
      FETCHSC["fetchScenarios()\nGET /scenarios + JWT (если есть)"]
      CRUDSC["create/edit/delete\nPOST/PUT/DELETE + JWT"]
      PIN["Закреплённые\nAsyncStorage, до 3 шт."]
    end

    HIST_SCR["History Screen\nFlatList, фильтр по scenarioId,\nRU/источник справа, KO слева"]
    PACKS_SCR["Language Packs Screen\nML Kit — download/delete модели\n(источник + корейский)"]
  end

  SCR --> auth_ui
  SCR --> main_ui
  SCR --> HIST_SCR
  SCR --> PACKS_SCR
  GUEST --> NOTICE

  KO_BUBBLE --> MIC
  SRC_BUBBLE --> MIC
  MIC -->|"onResult transcript"| DOTR
  NETINFO -->|"офлайн → сразу"| OFFLINE
  DOTR -->|"ошибка сети / таймаут"| OFFLINE
  KO_BUBBLE --> TTS
  SRC_BUBBLE --> TTS

  GUTTER --> FETCHSC
  GUTTER --> NOTICE
  GUTTER --> SCNAME
  FETCHSC --> PIN
  MENU --> CRUDSC
  MENU --> LANGSHEET
  MENU --> TR

  HIST_SCR --> SCNAME
  PACKS_SCR --> OFFLINE
```

---

## Уровень 3Б — Компоненты Backend

Что происходит внутри `backend/server.js`, `backend/auth.js` и `backend/scenarios.js`.

```mermaid
graph LR
  REQ["HTTP Request"]

  subgraph backend["backend/server.js"]
    direction TB
    MW["Middleware\nhelmet, cors origin=false,\nexpress.json limit=32kb"]
    RL["Rate Limiters\n/translate,/scenarios,/health: 30/мин\n/auth/*: 10/мин"]
    ROUTE["POST /translate\nВалидация: 9 языков (ALLOWED_LANGS),\nmax 1000 символов"]
    OAI["OpenAI Client\ngpt-4o, temperature=0.3"]
    SB["Supabase Logger\nfire-and-forget INSERT\nв translations"]
  end

  subgraph auth_router["backend/auth.js — /auth"]
    direction TB
    AUTH["signup / verify-email / resend-code\nlogin / me\nJWT, requireAuth (экспортируется)"]
    EMAIL["Email Sender — email.js\nconsole.log всегда + Resend,\nесли задан RESEND_API_KEY"]
  end

  subgraph scenarios_router["backend/scenarios.js — /scenarios"]
    direction TB
    SGET["GET / , GET /:id\noptionalAuth — гостям: built_in,\nвошедшим: + свои (owner_id)"]
    SMUT["POST / PUT / DELETE\nrequireAuth + проверка owner_id"]
    GSP["getSystemPrompt()\nasync — читает scenario_prompt\nиз Supabase по id"]
  end

  SUPA[("Supabase\nusers · scenarios · translations")]

  RESP["HTTP Response"]

  REQ --> MW --> RL
  RL --> ROUTE
  RL --> AUTH
  RL --> SGET
  RL --> SMUT

  ROUTE --> GSP --> OAI --> RESP
  ROUTE --> SB --> SUPA

  AUTH --> EMAIL
  AUTH --> SUPA --> RESP
  SGET --> SUPA --> RESP
  SMUT --> SUPA --> RESP
```

---

## Схема физического деплоя

```mermaid
graph TB
  subgraph phone["📱 Телефон"]
    DEVAPK["Dev-client APK (debug)\ncom.translator.app\nТребует Metro,\nдля повседневной разработки"]
    RELAPK["Release APK (standalone)\ncom.translator.app\nJS зашит в бандл, не требует Metro\narm64-v8a-only ≈42MB\n(полный universal ≈121MB)"]
    STT["On-device STT\nAndroid SpeechRecognizer"]
    JS["Hermes JS Engine"]
    DEVAPK --> JS
    RELAPK --> JS
    JS --> STT
  end

  subgraph network["Сеть — только для локальной разработки"]
    TS["🔒 Tailscale VPN\nPC: 100.68.162.96\n\nЛокальный бэкенд для итерации"]
    USB["🔌 USB / Wi-Fi — ADB\nadb reverse tcp:8090 tcp:8090\nadb reverse tcp:3000 tcp:3000"]
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
    SUPABASE_C["Supabase\n*.supabase.co\nМиграции — авто из supabase/migrations/"]
    RESEND_C["Resend\nresend.com"]
    GITHUB_C["GitHub\ngithub.com/kotspilgrim/translator"]
  end

  phone -->|"Продакшн: BACKEND_URL = Railway\nHTTPS, публично, из любой сети"| RWBE
  phone -.->|"Разработка: через Tailscale"| TS
  TS -.-> pc
  phone -.->|"Разработка: через USB/Wi-Fi"| USB
  USB -.-> METRO
  USB -.-> BE
  RWBE -->|"HTTPS"| OPENAI_C
  RWBE -->|"HTTPS"| SUPABASE_C
  RWBE -->|"HTTPS"| RESEND_C
  pc -.->|"HTTPS (dev copy)"| OPENAI_C
  pc -.->|"HTTPS (dev copy)"| SUPABASE_C
  pc -->|"git push"| GITHUB_C
  GITHUB_C -->|"автодеплой"| RWBE
  GITHUB_C -->|"автоприменение миграций"| SUPABASE_C
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
  participant Supa as Supabase

  Note over Dev,Supa: ── Первичная сборка (при изменении нативного кода) ──

  Dev->>Dev: expo prebuild --platform android
  Note right of Dev: Генерирует android/ из app.json
  Dev->>Phone: npm run android (adb install dev-client APK)
  Phone->>ADB: Подключается по USB или Wi-Fi (wireless debugging)
  Dev->>ADB: adb reverse tcp:8090 tcp:8090
  Phone->>Metro: Загружает JS bundle

  Note over Dev,Supa: ── Цикл JS-разработки (без пересборки) ──

  Dev->>Dev: Редактирует App.js
  Metro-->>Phone: Fast Refresh автоматически
  Note right of Phone: Изменения видны мгновенно

  Note over Dev,Supa: ── Runtime: перевод речи ──

  Phone->>Phone: Пользователь нажимает 🎤
  Phone->>Phone: STT → текст (on-device)
  Phone->>BE: POST /translate\n{text, fromLang, toLang, context}
  BE->>Supa: getSystemPrompt() — select scenario_prompt
  BE->>GPT: chat.completions.create()
  GPT-->>BE: {choices[0].message.content}
  BE-->>Phone: {translation}
  Phone->>Phone: Показывает текст + TTS озвучка

  Note over Dev,Supa: ── Публикация бэкенда и схемы БД ──

  Dev->>Git: git add / git commit / git push (main)
  Git->>Git: Railway пересобирает и передеплоивает backend/
  Git->>Supa: Supabase применяет новые файлы\nsupabase/migrations/ (если есть)
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
| Supabase project ref | `supabase/config.toml` / CLI | `hnoubdyasgxdpplahpxu` |
| Supabase GitHub integration | Supabase Dashboard → Integrations | Working directory: `.` (корень репозитория) |
| OpenAI ключ | `backend/.env` + Railway Variables | `OPENAI_API_KEY=sk-proj-...` |
| Supabase URL | `backend/.env` + Railway Variables | `SUPABASE_URL=https://hnoubdyasgxdpplahpxu.supabase.co` |
| Resend API-ключ | `backend/.env` + Railway Variables | `RESEND_API_KEY=re_...` (опционально — без него код падает только в консоль) |
| Git remote | `git remote -v` | `https://github.com/kotspilgrim/translator.git` |

---

## Структура файлов

```
translator/
├── backend/
│   ├── server.js               ← Express: /translate, /health, монтирует auth.js и scenarios.js
│   ├── auth.js                 ← /auth/*: signup, verify-email, resend-code, login, me
│   ├── scenarios.js             ← /scenarios/*: CRUD поверх Supabase, экспортирует getSystemPrompt()
│   ├── email.js                ← sendVerificationCode() — console.log + Resend
│   ├── supabaseClient.js        ← общий Supabase-клиент (server.js, auth.js, scenarios.js)
│   ├── .env                    ← секреты (не коммитить)
│   ├── .env.example             ← шаблон без значений
│   ├── package.json
│   └── prompts/                 ← справочный текст промптов, БОЛЬШЕ НЕ читается кодом в рантайме
│       ├── stranger-on-street.txt
│       ├── v-magazine.txt
│       ├── v-restorane.txt
│       ├── v-banke.txt
│       ├── v-bolnitse.txt
│       ├── v-otele.txt
│       ├── v-transporte.txt
│       └── v-vetklinike.txt
│
├── supabase/
│   ├── config.toml               ← конфиг Supabase CLI (project_id: translator)
│   └── migrations/                ← SQL-миграции, авто-применяются на push в main
│       ├── 20260101000001_users_scenarios_auth.sql
│       ├── 20260101000002_email_verification_stub.sql
│       └── 20260101000003_scenarios_db_storage.sql
│
├── frontend/
│   ├── App.js                  ← весь UI и логика (SignIn/SignUp/History/Packs/…)
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
