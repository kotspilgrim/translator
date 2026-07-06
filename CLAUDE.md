# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Context-drift canary

Begin every response in this repo with the word **Timur** on its own, as the very first thing in the message. This is a deliberate, user-requested check: if the word is missing, it means these project instructions weren't actually loaded/read for that turn (context drift, summarization, etc.) — the user relies on its presence to know CLAUDE.md is in effect.

## Project Overview

A bilingual Russian-Korean voice translator. Two people hold one phone between them — the Russian speaker at the bottom, the Korean speaker at the top. Each speaks (or types) in their own language; speech is recognized on-device, sent to a Node.js backend, translated by GPT-4o with optional scenario context, and displayed on screen. After each translation the direction auto-flips so the other person can respond immediately.

**Two translation directions:** RU→KO and KO→RU.

## Repository Structure

```
backend/          Node.js/Express translation server (OpenAI GPT-4o)
backend/auth.js           Signup/login/email-verification routes, requireAuth middleware
backend/supabaseClient.js Shared Supabase client (imported by server.js and auth.js)
backend/migrations/       Hand-run SQL migrations (Supabase SQL editor — no migration runner)
frontend/         React Native app (Expo SDK 52 + expo-speech-recognition)
frontend/modules/mlkit-translate/  Local Expo module: on-device RU/KO translation via Google ML Kit
ARCHITECTURE.md   C4 diagrams (context, containers, components, deployment)
REQUIREMENTS.md   User Stories (US-01..US-11) and Use Cases (UC-01..UC-06)
SECURITY_CHECKLIST.md  50-item vulnerability checklist, grouped by category, to test the app against
CLAUDE.md         This file
```

## Commands

### Backend

```bash
cd backend
cp .env.example .env   # fill in OPENAI_API_KEY (and optionally SUPABASE_*)
npm install
npm start              # runs on http://0.0.0.0:3000
```

### Frontend

The frontend uses `expo-dev-client` (not Expo Go) — a native build is required before first JS run.

```bash
cd frontend
npm install
npm run android        # full native build + install on connected device (slow, ~5 min)
npm start              # start Metro bundler only (after native build exists)
```

**When to use `npm run android` vs `npm start`:**
- `npm run android` — after any change to `app.json`, native modules, or when installing for the first time
- `npm start` — for JS-only changes (App.js, assets); Metro hot-reloads automatically

**Prebuild** (needed when `app.json` plugins change, e.g. adding expo-font):
```bash
npx expo prebuild --platform android   # regenerates android/ from app.json
npm run android                         # then rebuild
```

## Architecture

### Backend (`backend/server.js`)

`POST /translate` accepts `{ text, fromLang, toLang, context }` where `context` is a **scenario id** (not a display name).

- **Language validation:** `fromLang` and `toLang` must each be one of `ALLOWED_LANGS` — Russian words, not language codes: `русский`, `корейский`, `английский`, `японский`, `китайский`, `узбекский`, `казахский`, `киргизский`, `монгольский`. The second bubble is always Korean; the first can be any of the others (see "Source language selector" below) — the backend doesn't itself enforce that pairing, it just validates both values are known words.
- **Prompt loading:** resolves `context` against the scenario registry (see below), reads `backend/prompts/<file>`, substitutes `{fromLang}` and `{toLang}` placeholders. If the id isn't registered, `context` is used verbatim as free-text context (backward-compat fallback).
- **Security:** helmet, CORS (`origin: false`), rate limit (30 req/min, also applied to `/scenarios` and `/health`), max text 1000 chars
- **Supabase logging:** if `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` are in `.env`, each translation is fire-and-forget inserted into the `translations` table
- **Returns:** `{ translation }` or `{ error }` with appropriate HTTP status

**Scenario registry (`backend/scenarios.json`):** array of `{ id, name, file, builtIn }`. The backend is the source of truth — the frontend fetches this list on launch instead of storing it in AsyncStorage.

- `GET /scenarios` → `[{ id, name, builtIn }]`
- `GET /scenarios/:id` → `{ id, name, builtIn, prompt }` — reads the prompt file live off disk
- `POST /scenarios` `{ name, prompt }` → creates a new `builtIn:false` entry. `id` is generated server-side by transliterating `name` (Cyrillic → Latin slug via the `TRANSLIT` map in `server.js`) and de-duplicated (`-2`, `-3`, ...); never trust a client-supplied id for the filename. Writes `backend/prompts/<id>.txt`.
- `PUT /scenarios/:id` `{ name?, prompt? }` → edits in place; a `prompt` update overwrites the `.txt` file on disk. Works for built-in scenarios too (their prompts are editable, just not deletable).
- `DELETE /scenarios/:id` → 403 if `builtIn:true`; otherwise removes the registry entry and its prompt file.
- `GET /health` → cheap connectivity check via `openai.models.retrieve('gpt-4o')` (no chat-completion cost). `{ ok: true }` or `{ ok: false, error }`.

**Windows/Git Bash gotcha:** inline `curl -d '{"name":"На рынке"}'` mangles Cyrillic through the Windows console codepage before it reaches Node — this looks like a server bug (garbled name, wrong slug) but isn't. Write the JSON body to a UTF-8 file and use `curl --data-binary @file` when testing manually.

### Auth (`backend/auth.js`, mounted at `/auth`)

Email + password signup with email-code verification, backed by Supabase Postgres tables created by `backend/migrations/001_users_scenarios_auth.sql` and `002_email_verification_stub.sql` (run by hand in the Supabase SQL editor — this repo has no migration runner). `backend/supabaseClient.js` holds the one shared `supabase` client (`server.js` and `auth.js` both import it, avoiding a circular require). Every `/auth` route 503s up front if Supabase isn't configured — unlike translation logging, auth isn't optional.

- `POST /auth/signup` `{ email, password, name? }` — validates email format and 4 password rules (≥8 chars, upper+lower case, digit, special char — same rule set `frontend/App.js`'s `checkPasswordRules` mirrors for live UI feedback). Hashes with `bcryptjs`, generates a 6-digit code (10 min TTL, 5 max attempts), sends it via `sendVerificationCode()` (`backend/email.js`, see below) — the code is only ever written to `users.verification_code`, never returned in the API response. Signing up again with an unverified email resumes that row instead of erroring, so an abandoned signup isn't a dead end.
- `POST /auth/verify-email` `{ userId, code }` → sets `email_verified = true`, clears the code fields, returns `{ token, user }`.
- `POST /auth/resend-code` `{ userId }` — regenerates the code, resets attempts.
- `POST /auth/login` `{ email, password }` → `403 { error: 'email_not_verified', userId }` if the account hasn't verified yet (frontend uses this to redirect into the code screen instead of a dead-end error); otherwise `{ token, user }`.
- `GET /auth/me` — `requireAuth` middleware (reads `Authorization: Bearer <jwt>`) → current user; used by the frontend on boot to confirm a stored token is still valid. `auth.js` exports `requireAuth` for future routes that need to gate on login.
- JWT signed with `JWT_SECRET` (`.env`), 30-day expiry. `authLimiter` in `server.js` (10 req/min) is stricter than the 30/min translate limiter — brute-forcing a password or a 6-digit code is a different threat profile.

**Explicitly not wired up yet:** `/translate`, `/scenarios`, and history don't require login or filter by `user_id`/`scenario_id` — the columns exist on `translations` (migration 001) but nothing populates them. That's a deliberate follow-up, not an oversight; see the plan history in this repo's conversation log if you need the reasoning.

**Email delivery (`backend/email.js`):** `sendVerificationCode(to, code)` always `console.log`s the code first (harmless on a self-hosted box, keeps the old local-dev flow working), then — only if `RESEND_API_KEY` is set — sends via the [Resend](https://resend.com) SDK using `EMAIL_FROM` as the sender. Both env vars are optional: with neither set, behavior is identical to before this existed (console-only). A send failure is logged and swallowed rather than failing the request — the code is already in the DB, and `/auth/resend-code` exists precisely so the user can ask for another attempt. **`EMAIL_FROM` must be on a domain verified in the Resend dashboard** (DNS SPF/DKIM records) — without a verified domain, Resend's sandbox mode only delivers to the email address the Resend account itself signed up with, which won't work for real users.

### Frontend (`frontend/App.js`)

`screen` state machine: `'boot' | 'signin' | 'signup' | 'verify' | 'main' | 'history'`. On mount, `'boot'` reads `translator_auth_token` from `AsyncStorage`; if present it calls `GET /auth/me` (8s `AbortController` timeout — a fully offline device must not hang here) to confirm the token still works (`'main'` on success, `'signin'` on a rejected/missing token — but if the backend is simply unreachable or the request times out, it assumes the token is still good rather than force a re-login while offline). `SignInScreen`, `SignUpScreen`, `VerifyCodeScreen` are separate function components in this same file, following the `HistoryScreen` precedent (each takes `theme` as a prop and computes its own `c`/`S` via `useMemo(() => makeStyles(c, theme), [c, theme])`).

- **SignIn → signup link, or submits to `/auth/login`.** On `email_not_verified`, routes to `'verify'` instead of showing a bare error. A third option, **"Продолжить как гость / без контекстного перевода"**, calls `onGuest` (→ `handleContinueAsGuest`) to skip auth entirely — see "Guest mode" below.
- **SignUp** computes `checkPasswordRules(password)` live for the 4-bar strength meter + checklist (weak/medium/strong tiers — the design only shows the two extremes, medium is an interpolated fill-in). Submits to `/auth/signup` on success → `'verify'`.
- **VerifyCode**'s 6-digit entry is *one* invisible `TextInput` (`maxLength={6}`, opacity 0, 1×1px, positioned absolute) whose value drives 6 visual boxes — far more reliable in RN than 6 separate refs with auto-advance focus. Auto-submits once 6 digits are entered.
- `handleAuthSuccess(token, user)` stores the token in `AsyncStorage` and goes to `'main'`; `handleLogout()` clears it and returns to `'signin'`. The menu drawer's "Выйти" item isn't in the design (its menu drawer wasn't updated for a logged-in state) — added because there'd be no way to log out otherwise.

**Guest mode:** `handleContinueAsGuest` sets `isGuest = true` and jumps straight to `'main'` — no token, no `/auth` call. `isGuestRef` mirrors it for the same stale-closure reason as `scenarioIdRef` (read below). A guest never gets scenario context: `openScenarioPicker` (see "Scenarios" below) refuses to open the picker for guests, the scenario row shows a fixed "Без сценария (гость)" label instead of the real scenario name, and `doTranslate` forces `context: null` for guests regardless of what `scenarioIdRef` holds — so even if a guest somehow still had a `scenarioId` selected, it would never reach the backend. The menu drawer shows "Гость" in place of the email and swaps "Выйти" for "Войти" (`handleGuestSignIn`, which just flips `isGuest` back to `false` and returns to `'signin'` — it does not touch `AUTH_TOKEN_KEY`, so if a real session's token was never cleared, going guest and back to sign-in does not log that session out).

**Main screen layout (top → bottom):**
1. Menu button — floating, physical top-left corner (`top: 58, left: 14`, sibling of the `KeyboardAvoidingView` so it isn't clipped by its `paddingTop`); opens a left drawer (Сценарии / История / Проверить связь)
2. Korean mic button + flip button (physical top, Korean person's side)
3. Korean bubble (dark panel, text rotated 180° by default)
4. Gutter: scenario selector + history button
5. Russian bubble (dark panel) — bottom-left corner also holds the source-language selector chip (`langBtn`, showing the 2-letter code, e.g. "RU"), alongside the existing clear/TTS overlay buttons
6. Russian mic button + connection-test button (physical bottom) — the test button sits in the row's far corner (`position:absolute, right:14`), deliberately away from the mic so it can't be hit by accident

**Key state:**
- `koRotated` — boolean, controls 180° rotation of Korean panel; toggled by flip button; default `true`
- `activeBubble` — `null | 'ru' | 'ko'` — which side is currently active
- `activeBubbleRef` — `useRef` mirror of `activeBubble` for async callbacks
- `histRef` — mirrors `history` state for async callbacks (stale-closure reason)
- `scenarioId` / `scenarioIdRef` — id of the active scenario (looked up from `scenarios` for display name); the ref mirror exists because `doTranslate` and `saveEntry` are read from the speech-recognition `'result'` event callback, which can otherwise close over a stale id
- `scenarios` — `[{ id, name, builtIn }]`, fetched from `GET /scenarios` on mount; `FALLBACK_SCENARIOS` (hardcoded, matching the backend's seed data) is used until that resolves or if the backend is unreachable
- `pinnedIds` — up to `MAX_PINNED` (3) scenario ids, persisted in `AsyncStorage` under `'translator_pinned_scenarios'`; pinned scenarios render in their own section above the rest in the picker sheet
- `typingBubble` — `null | 'ru' | 'ko'` — which side is in text-input mode
- `isOnline` / `isOnlineRef` — connectivity state from `@react-native-community/netinfo`'s `NetInfo.addEventListener` (`state.isConnected && state.isInternetReachable !== false`); the ref mirror exists for the same reason as `scenarioIdRef` — `doTranslate` is read from the speech-recognition `'result'` event callback
- `interfaceLang` — one of `INTERFACE_LANGUAGES` (`frontend/i18n.js`), persisted under `'translator_interface_lang'`; drives the `tr(key, vars)` helper (`= (key, vars) => t(interfaceLang, key, vars)`) used for all UI chrome text. No ref mirror needed — nothing reads it from a stale async callback.
- `sourceLang` / `sourceLangRef` — one of `SOURCE_LANGUAGES` (`frontend/i18n.js`; everything in `INTERFACE_LANGUAGES` except Korean), persisted under `'translator_source_lang'`; the ref mirror exists for the same stale-closure reason as `scenarioIdRef` — `doTranslate`'s `fromLang`/`toLang`, the mic's STT locale, and offline `MlkitTranslate` language codes are all read from callbacks that can't rely on the latest render's closure

**Conversation flow:** idle → recording → translating → waiting → (direction flips) → idle

**Korean typing overlay:** when `typingBubble === 'ko'`, a panel slides from the physical top of the screen so the Korean person can type without flipping the phone.

**Korean bubble flip animation:** toggling the flip button animates `koFlipAnim` (`Animated.Value`, 0↔1, 380ms, `Easing.inOut(Easing.ease)`, `useNativeDriver: true`) instead of snapping the `rotate` style instantly.

- The mic icon (`AnimatedMI`, a `Text`-based icon wrapped in `Animated.createAnimatedComponent`) just spins flat: `rotateZ` interpolated `0deg → 180deg`.
- The bubble itself visually flips over the **horizontal axis** (`rotateX`), not a flat in-plane spin. A pure `rotateX(180deg)` only mirrors content vertically (backwards, unreadable) — it is *not* equivalent to the old `rotate(180deg)`. To land on the same correct resting orientation (point-reflection: upside down, correctly shaped, readable from the opposite side of the table) while still visually flipping through the horizontal axis, the bubble's transform pairs `rotateX` (continuous `0deg → 180deg`) with a `rotateY` that **snaps** `0deg → 180deg` at the exact midpoint (`inputRange: [0, 0.499, 0.5, 1]`). At that midpoint `rotateX = 90deg`, so the panel is edge-on/zero-height and the snap is invisible. `rotateY(180) ∘ rotateX(180)` composes to exactly `rotate(180deg)` (verified numerically — see git history for the check), so text and the clear/TTS buttons end up exactly where they were before; only the transition path changed. `perspective: 1000` is first in the transform array for the 3D depth effect. If touching this again, don't drop the `rotateY` compensation — a bare `rotateX` flip looks fine mid-motion but silently breaks legibility at rest.

**History:** saved to `AsyncStorage` under `'translation_history'`, one array shared across all scenarios — each entry carries a `scenarioId`. On mount, entries older than 24 h are pruned. History screen filters by a `viewId` state (initialized from the main screen's current `scenarioId`), with a scenario chip + dropdown at the top to switch which scenario's history is displayed without leaving the screen. RU messages purple right, KO messages dark gray left.

**Scenarios:** list comes from the backend (`GET /scenarios`), not AsyncStorage — see the backend section above for the registry and CRUD endpoints. The picker sheet (`showPicker` Modal) has three sub-views via `sheetView` state:
- `'list'` — pinned section, then the rest; each row has a pin toggle (`push-pin` icon, filled accent color when pinned — pinned status is indicated by icon color only, rows don't get a tinted background), an edit (pencil) icon open to every scenario, and a delete icon shown only when `builtIn:false`
- `'create'` — two fields, name + prompt, `POST /scenarios`
- `'edit'` — fetches the live prompt via `GET /scenarios/:id`, saves via `PUT /scenarios/:id`

Deleting asks for confirmation first: tapping the trash icon sets `deleteTarget`, which renders a small "Удалить сценарий? Да/Нет" card over the sheet instead of deleting immediately.

**Scenario context requires an account and a live backend.** Every entry point into the picker (the scenario row's `onPress` and the menu drawer's "Сценарии" item) goes through `openScenarioPicker`, which blocks and sets `scenarioNotice` (`{ title, text }`) instead of opening the sheet: an "account required" notice for guests, a "no connection" notice when `isOnline` is false. There's no third combined state — a guest is blocked regardless of connectivity, since scenario prompts are fetched/edited server-side either way. `scenarioNotice` renders as a themed card (`S.noticeScrim` + the same `S.confirmCard`/`confirmTitle`/`confirmText` styles the delete-confirmation card uses) at the root of the main screen — not a native `Alert.alert` — so it matches the rest of the app's dark/light design system and stays visible even though it's triggered before the picker `Modal` itself ever opens.

## Interface language (i18n)

`frontend/i18n.js` covers **UI chrome only** — menu items, screen titles/labels, buttons, form validation and error messages, the scenario picker sheet, the themed notices. It deliberately does **not** touch bubble content: recognized speech, translations, scenario names (all come from the backend/conversation itself), or the Korean typing overlay's hint/placeholder (`한국어 텍스트 입력 · Enter로 전송`, `텍스트를 입력하세요...`), since those are addressed to whichever person is actually speaking Korean, not to the reader of the interface.

- **`INTERFACE_LANGUAGES`** — 9 entries, native autonyms: Russian (default), English, 한국어, 日本語, 中文, Oʻzbekcha, Қазақша, Кыргызча, Монгол.
- **`S`** (the dictionary, keyed by string id → `{ ru, en, ko, ja, zh, uz, kk, ky, mn }`) and **`t(lang, key, vars)`** — `vars` fills `{placeholder}` tokens (e.g. `t(lang, 'attemptsRemaining', { n: 3 })`). Falls back to Russian, then the raw key, if a translation is missing.
- App-level state `interfaceLang` (persisted `'translator_interface_lang'`) plus a local `tr = (key, vars) => t(interfaceLang, key, vars)` closure is the pattern used in `App()`; every other screen component (`HistoryScreen`, `LanguagePacksScreen`, `SignInScreen`, `SignUpScreen`, `VerifyCodeScreen`) takes `lang` as a prop and defines its own identical `tr` closure — same pattern as each screen computing its own `c`/`S` from a `theme` prop.
- **Two exceptions inside "bubble content" that DO follow `interfaceLang`, because they're chrome (instructional hints/labels), not conversation content:** the Russian/source bubble's empty-state placeholders (`tr('phRu')`/`tr('phRuWait')`, replacing the old module-level `PH_RU`/`PH_RU_WAIT` constants — the Korean bubble's `PH_KO_WAIT`/`PH_KO_ACTIVE` stay fixed Korean, since that side's language never changes), and **built-in scenario display names**. The latter are resolved via `scenarioName(lang, scenario)` (`frontend/i18n.js`) against a `SCENARIO_NAMES` map keyed by the backend's scenario id (`stranger-on-street`, `v-magazine`, etc.) — every place a scenario name is rendered (gutter button, picker sheet rows, edit-view header, delete-confirmation text, history screen's chip/dropdown) goes through this helper instead of reading `scenario.name` directly. Custom (non-built-in) scenarios have no `SCENARIO_NAMES` entry, so the helper falls back to the raw name the user typed — free-text names aren't auto-translated.
- Changed from the menu drawer's "Язык интерфейса" item, which opens the shared `LanguageSheet` modal (see below) listing `INTERFACE_LANGUAGES`.
- Translation quality for uz/kk/ky/mn is best-effort (LLM-generated, not reviewed by a native speaker) — flag for review before treating it as production-grade copy.

**`LanguageSheet`** (`{ visible, onClose, options, selected, onSelect, title, c, S }`) is a small shared modal — a scrollable list of `{ code, label }` options with a checkmark on the selected row — reused for both the interface-language picker and the source-language picker below, styled with the same `S.overlay`/`S.sheet`/`S.sheetItem*` tokens as the scenario picker sheet.

## Source language selector

The **second bubble (top) is always Korean.** The first bubble (bottom, historically "the Russian bubble") can now speak/type in any of `SOURCE_LANGUAGES` (`frontend/i18n.js` — `INTERFACE_LANGUAGES` minus Korean: ru default, en, ja, zh, uz, kk, ky, mn), chosen via the `langBtn` chip anchored to the bottom-left corner *inside that bubble itself* (same overlay pattern as `clearBtn`/`ttsBtn` — shows the 2-letter code, opens the shared `LanguageSheet`). It lives inside the bubble rather than the mic row below because it's a property of that bubble's content, not a screen-level control. State: `sourceLang`/`sourceLangRef`, persisted `'translator_source_lang'`.

Changing it re-points every place that used to hardcode "Russian":
- **STT locale** — `frontend/i18n.js`'s `LANG_LOCALE` maps each code to a BCP-47 tag (`ru-RU`, `en-US`, `ja-JP`, `zh-CN`, `uz-UZ`, `kk-KZ`, `ky-KG`, `mn-MN`) passed to `ExpoSpeechRecognitionModule.start({ lang: ... })`.
- **TTS** — `handleSpeak(ruText, LANG_LOCALE[sourceLang])` instead of a hardcoded `'ru-RU'`.
- **Backend prompt language names** — `LANG_RU_NAME` maps each code to the Russian word the backend's prompt templates expect (`английский`, `японский`, etc. — `backend/server.js`'s `ALLOWED_LANGS`, see Backend section above). `doTranslate`'s `fromLang`/`toLang` args use `LANG_RU_NAME[sourceLangRef.current]` instead of the literal `'русский'`.
- **Offline `MlkitTranslate` codes** — `offlineTranslate` now resolves `srcCode`/`tgtCode` from `sourceLangRef.current` (Russian-bubble side) and `'ko'` (fixed) instead of assuming `'ru'`/`'ko'`. **Caveat:** Google ML Kit's on-device Translate does not support Uzbek, Kazakh, Kyrgyz, or Mongolian — `isModelDownloaded`/`translate` for those codes reject with `ERR_MLKIT_TRANSLATE` (native `UnsupportedLanguageException`), which surfaces through the exact same "pack not downloaded" catch path as a legitimately-missing pack. Offline translation for those four languages is effectively unavailable; only the online (`/translate`) path works for them.
- **Language Packs screen** — no longer a fixed ru/ko pair; `LanguagePacksScreen` now takes a `sourceLang` prop and computes its two rows as `[currently-selected source language, Korean]`, since offline translation only ever runs between those two. Switching the source-bubble language changes which pack pair is offered for download.
- **STT/TTS device support is not guaranteed** for uz/kk/ky/mn — Android's on-device speech recognizer and TTS engine depend on language packs the OS itself may not ship for these locales, independent of anything this app controls.

## Theming (dark / light)

Sourced from a Claude Design project ("Visualizing current state", `Translator Current.dc.html` — imported via the `DesignSync` MCP tool) that mocked up every screen in both a dark and a light palette.

- **`COLORS.dark` / `COLORS.light`** (top of `App.js`) are the only place colors are defined — every style and every inline `<MI color=...>` reads a named token off `c = COLORS[theme]` (e.g. `c.bubbleBg`, `c.pinAccent`). There should be no hex literal anywhere else in the file except the shadow presets (`SHADOW_SM/MD/LG`, which use `#000` — shadows are black in both themes).
- **`makeStyles(c, theme)`** replaces the old static `StyleSheet.create({...})` — it's a function now, called via `useMemo(() => makeStyles(c, theme), [c, theme])` in both `App` and `HistoryScreen`, so styles only recompute when the theme changes.
- **`theme`** state (`'dark' | 'light'`, default `'dark'`) persists to `AsyncStorage` under `'translator_theme'`. Toggled from the menu drawer's last item ("Светлая тема" / "Тёмная тема", icon `light-mode`/`dark-mode`), separated from the items above it by a top border (`menuItemDivider`).
- `<StatusBar style={c.statusBarStyle} />` switches status-bar icon color with the theme (`'light'` content on the dark theme, `'dark'` content on the light theme) — don't hardcode `style="light"` again, it'll make status bar icons invisible on the light background.
- Light theme adds subtle card shadows (`shadow(theme, SHADOW_SM|MD|LG)`, spread into the relevant style objects) that dark theme intentionally doesn't have — dark stays flat-on-black exactly as before.
- The history screen's chat bubbles are the one place colors are genuinely per-side *and* per-theme, not just per-theme: in dark, RU and KO bubbles are both light-text-on-dark; in light, the KO bubble flips to dark-text-on-white while RU stays white-text-on-purple. `HistoryScreen`'s `renderItem` picks `chatRuXxx`/`chatKoXxx` tokens explicitly per message side rather than sharing one generic style.

## Icons — Critical Implementation Detail

**Problem:** `@expo/vector-icons` does not auto-load fonts in bare/dev-client workflow. The `<MaterialIcons>` component renders blank circles even when the font file is present.

**Solution:** custom `MI` component that bypasses the library renderer entirely:

```js
import { MaterialIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';

const glyphs = MaterialIcons.getRawGlyphMap();
const MI = ({ name, size, color, style }) => (
  <Text style={[{ fontFamily: 'MaterialIcons', fontSize: size, color }, style]}>
    {String.fromCodePoint(glyphs[name])}
  </Text>
);

// In App():
const [fontsLoaded, fontError] = useFonts({
  MaterialIcons: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf'),
});
```

Font is loaded via `expo-font` config plugin in `app.json` (copies TTF to native assets during prebuild):

```json
["expo-font", {
  "fonts": ["./node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf"]
}]
```

**Icon names use hyphens** (not underscores): `volume-up`, `arrow-back`, `expand-more`, `screen-rotation`, `menu`, `push-pin`, `network-check`, `edit`, `list`. Before using a new glyph name, verify it exists in `frontend/node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialIcons.json` — this is the classic Material Icons set, not Material Symbols, so newer/renamed icons may be missing.

**Do NOT block render** on `fontsLoaded` — if font fails, app must still show. Remove any `if (!fontsLoaded) return null` guard.

## Critical Config

**`BACKEND_URL` in `frontend/App.js:25`:**

```js
const BACKEND_URL = 'http://100.68.162.96:3000'; // Tailscale IP
```

- **Tailscale IP** (`100.68.162.96`) — works on any network as long as Tailscale is active on both Windows host and Android phone; kept as the local-dev option even after the Railway deploy below
- **LAN IP** (`192.168.35.219`) — fallback if Tailscale is down, same Wi-Fi only
- **USB dev** — run `adb reverse tcp:3000 tcp:3000` and set URL to `http://localhost:3000`
- **Railway (public)** — once deployed (see Future Roadmap), swap to the Railway HTTPS domain for any build meant to work off the dev network (this is required for a Play Store release build — Android blocks plain-HTTP cleartext traffic by default in release builds, so the Tailscale/LAN `http://` options above only work in dev-client debug builds)

**Backend `.env`** must have:
```
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://...supabase.co        # required for /auth, optional for translation logging
SUPABASE_SERVICE_KEY=eyJ...               # required for /auth, optional for translation logging
JWT_SECRET=...                            # required for /auth — any long random string
RESEND_API_KEY=re_...                     # optional — verification codes fall back to console.log if unset
EMAIL_FROM=noreply@yourdomain.com         # must be on a domain verified in Resend
```

## ADB — Development Tips

**Connect device for hot reload (Wi-Fi firewall bypass):**
```bash
adb reverse tcp:8090 tcp:8090   # Metro — see "Metro port" below
adb reverse tcp:3000 tcp:3000   # if using localhost backend
```

**Wireless debugging (no USB cable):** if `adb devices` shows nothing and you're on Wi-Fi/Tailscale, USB-only setup doesn't apply — pair once via Android's own flow: Settings → Developer options → Wireless debugging → "Pair device with pairing code" gives an IP:port + 6-digit code. Run `adb pair <ip>:<pairing-port> <code>` (the pairing port is different from — and expires faster than — the one shown on the main Wireless debugging screen). Once paired, the device reconnects automatically over mDNS each session; re-pairing is only needed again after a Windows/phone reboot or Wi-Fi network change.

**Metro port:** `npm start` / `npm run android` are pinned to **8090** (`package.json` scripts) instead of Expo's default 8081, because Docker Desktop's backend process squats `8080–8085` on this machine — `expo`'s non-interactive CLI can't prompt for a fallback port and just silently skips starting the dev server (`Skipping dev server`) if 8081 is taken. If 8090 is ever occupied too, check `netstat -ano | grep LISTENING` before picking a replacement, and update it in one place — `frontend/package.json`'s `scripts`.

**Open React Native dev menu (to trigger Reload):**
```bash
adb shell input keyevent 82
```

**Wake screen:**
```bash
adb shell input keyevent 26
```

**Launch app:**
```bash
adb shell am start -n com.translator.app/.MainActivity
```

**Take screenshot:**
```bash
adb shell screencap -p /sdcard/screen.png
adb pull /sdcard/screen.png %TEMP%\screen.png
```

**⚠️ NEVER run** `adb shell pm clear com.sec.android.app.launcher` — this destroys the Samsung home screen layout and forces a factory reset of the launcher. Only clear the translator app's data: `adb shell pm clear com.translator.app`.

## Android Permissions

Declared in `frontend/app.json`:
- `android.permission.RECORD_AUDIO`
- Speech recognition and microphone permissions are also requested at runtime via `expo-speech-recognition`.

## App Icons

Icons were generated with `sharp` (Node.js) from SVG strings. Design: dark navy top half with Korean character "가" (sky blue, rotated 180°), white divider, near-white bottom half with Cyrillic "Я" (dark navy).

Files: `frontend/assets/icon.png`, `adaptive-icon.png`, `splash-icon.png` — all 1024×1024.

After changing icons, run `npx expo prebuild --platform android` to regenerate mipmap WebP files, then `npm run android` to install.

## Known Lessons Learned

- **`expo prebuild` is required** after any change to `app.json` plugins or icons — `npm run android` alone does NOT regenerate native assets
- **Metro port conflict:** kill with `Get-NetTCPConnection -LocalPort 8081 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`
- **JSX space matters:** `<MI name=` is valid; `<MIname=` is a SyntaxError — watch for this in editor paste
- **ADB reverse** must be re-run every time the USB cable is reconnected
- **Samsung Gauss / Galaxy AI** is NOT accessible from third-party apps — no public API or SDK exists
- **All the `@react-native-ml-kit/*`-style npm wrappers for on-device translation are unfit to depend on**: the actively-maintained one (`@react-native-ml-kit/translate-text`) ships its own `⚠ Don't use this in production` warning and exposes no model-management API at all; the packages that *do* expose download/delete (`react-native-mlkit-translate`) haven't been touched in 5 years and predate autolinking. `frontend/modules/mlkit-translate/` talks to Google's own (stable, non-alpha) `com.google.mlkit:translate` Android SDK directly instead — see "Offline translation" below.
- **Don't add `expo.autolinking.searchPaths` to `package.json`** to get a local module under `frontend/modules/` picked up — `expo-modules-autolinking`'s `nativeModulesDir` already defaults to `./modules` and merges it into the default search. Setting `searchPaths` explicitly *replaces* the default (which walks up `node_modules`) instead of adding to it, so every `node_modules`-installed Expo module (including `expo-modules-core` itself) stops resolving and the native build fails with `Unresolved reference: expo` in `MainActivity.kt`/`MainApplication.kt`. If a fresh local module isn't autolinking, look elsewhere first — it should just work.

## Offline translation

`frontend/modules/mlkit-translate/` is a **local Expo module** (Android-only, Kotlin) wrapping `com.google.mlkit:translate` directly — not a third-party RN wrapper (see "Known Lessons Learned" above for why). It exposes exactly four functions via `AsyncFunction`, bridged straight from `Task<T>.addOnSuccessListener/addOnFailureListener` to Expo's `Promise` (no `kotlinx-coroutines` dependency — earlier attempts at using `.await()` hit a Kotlin-metadata-version clash against this project's pinned Kotlin `1.9.25`, since `kotlinx-coroutines-play-services` 1.9+ requires Kotlin 2.x):

- `isModelDownloaded(languageCode)`, `downloadModel(languageCode, requireWifi)`, `deleteModel(languageCode)` — language-pack lifecycle, driven from the "Языковые пакеты" screen (`LanguagePacksScreen` in `App.js`, reached from the menu drawer).
- `translate(text, sourceLanguageCode, targetLanguageCode)` — assumes both models are already downloaded; it does **not** silently auto-download mid-translation (ML Kit's default would), since that would bypass the pack screen's Wi-Fi-only preference and use mobile data without asking.

Language codes are plain ISO strings. The Korean side is always `'ko'`; the other side is whichever `sourceLang` is currently selected (see "Source language selector" above) — `TranslateLanguage.fromLanguageTag()` on the native side resolves each one, and rejects with `ERR_MLKIT_TRANSLATE` for the handful ML Kit doesn't support (Uzbek/Kazakh/Kyrgyz/Mongolian, as of this SDK version).

**Fallback trigger:** two paths, both funnelling into the shared `applyOfflineFallback(text, sourceBubble)` helper. (1) If `isOnlineRef.current` is already `false` (NetInfo), `doTranslate` skips the `/translate` fetch entirely and goes straight to `offlineTranslate()` — this is what keeps a known-offline translation to roughly the ML Kit call's own latency instead of making the user wait out the 15s backend timeout. (2) If NetInfo *thinks* there's a connection but the fetch still fails or times out (its own 15s `AbortController`), the `catch` block falls back the same way — hybrid mode, exactly as this section used to describe as a roadmap item. Either way, if the on-device models aren't downloaded, the bubble shows a message pointing at the pack screen instead of failing silently.

**What's different offline:** no scenario context (ML Kit has no prompt concept — it's a direct phrase-to-phrase model, not an LLM), and history entries get `offline: true` so `HistoryScreen` can show a small "offline ·" tag (translated via `tr('offlineTag')`) next to the timestamp.

**Module scaffolding gotcha:** `npx create-expo-module --local` downloads the *current* `expo-module-template` from npm, which targets a newer Expo Modules Gradle convention (`plugins { id 'expo-module-gradle-plugin' }`) than what SDK 52's `expo-modules-core` (2.2.3, already vendored in this project) actually understands. Fresh local modules need their generated `android/build.gradle` rewritten to the older pattern every other module in `node_modules/expo-*/android/build.gradle` already uses (`apply from: ...ExpoModulesCorePlugin.gradle` + `applyKotlinExpoModulesCorePlugin()` + `useCoreDependencies()` + `useDefaultAndroidSdkVersions()`) — copy from an installed module like `expo-speech`, don't trust the freshly-scaffolded file as-is.

## Future Roadmap (not yet implemented)

- **Play Store release (in progress):** `backend/server.js` now reads `process.env.PORT` (Railway-ready), `frontend/app.json` has `android.versionCode`, `frontend/eas.json` exists (`production` profile, `app-bundle`, `autoIncrement: versionCode`), and a draft `PRIVACY.md` exists at the repo root (needs hosting at a public URL — e.g. GitHub Pages — before it can go into Play Console's Data Safety form). Recommended build path is a **local** `./gradlew bundleRelease` (this project's toolchain is already fully set up locally, including the custom `mlkit-translate` native module) rather than EAS cloud build, which needs its own account/keystore-in-the-cloud tradeoffs. Remaining steps are all account/manual: generate a release keystore (`keytool`), Google Play Console account ($25), store listing + content rating + Data Safety form, upload to Internal Testing before Production.
- **OTA updates:** `eas update --branch production` for JS-only changes (no Play Store submission needed)
- **Backend to cloud (in progress):** `backend/server.js`'s `PORT` already reads `process.env.PORT` for Railway compatibility. Remaining steps are account-side: create a Railway project connected to this repo's GitHub remote (`kotspilgrim/translator`), set **Root Directory to `backend`** (monorepo), add the `.env` vars in Railway's dashboard, then update `BACKEND_URL` (`frontend/App.js`) and the "Critical Config" section above to the resulting Railway HTTPS domain.
- **iOS build:** the app is Android-only so far — `mlkit-translate` is a Kotlin/Android-only Expo module (no iOS implementation), and `app.json`/`eas.json` have no iOS config. Needs an iOS-side translation module (or an iOS-specific offline fallback) before `expo run:ios`/`eas build --platform ios` are viable.
- **Wire up `scenario_id`/`user_id` on translations:** the columns exist on the `translations` table since migration 001, but `/translate` doesn't require login or populate them yet (see "Explicitly not wired up yet" in the Auth section) — needed before per-user scenario history/analytics is possible.
- **Beyond 9 source languages / non-Korean target:** the source-bubble side now supports 8 languages plus Korean as the fixed target (see "Source language selector" above) — but the *target* bubble is still hardcoded to Korean everywhere (UI layout, `LANG_RU_NAME`'s corейский assumption, offline module's `'ko'` constant). Making the target side selectable too would need a second `LanguageSheet`, a rethink of the fixed RU-bottom/KO-top physical layout, and dropping the "second bubble is always Korean" assumption baked into `doTranslate`/`offlineTranslate`/the backend prompt templates.
- **Native-speaker review of uz/kk/ky/mn copy:** both the interface-language strings (`frontend/i18n.js`) and the source-language labels are LLM-translated best-effort, not reviewed by a native speaker of Uzbek, Kazakh, Kyrgyz, or Mongolian.
- **Per-user daily request counter/limit:** `server.js`'s rate limiter (30 req/min) is global/IP-based, not per-account — there's no cap on how many translations a given signed-in user can make per day. Needs the `user_id` wiring above (translations aren't attributed to a user yet) plus a counter (e.g. a Supabase query or Redis) and a decision on what happens at the limit (hard block vs. offline-only fallback).
