# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A bilingual Russian-Korean voice translator. Two people hold one phone between them — the Russian speaker at the bottom, the Korean speaker at the top. Each speaks (or types) in their own language; speech is recognized on-device, sent to a Node.js backend, translated by GPT-4o with optional scenario context, and displayed on screen. After each translation the direction auto-flips so the other person can respond immediately.

**Two translation directions:** RU→KO and KO→RU.

## Repository Structure

```
backend/          Node.js/Express translation server (OpenAI GPT-4o)
frontend/         React Native app (Expo SDK 52 + expo-speech-recognition)
ARCHITECTURE.md   C4 diagrams (context, containers, components, deployment)
REQUIREMENTS.md   User Stories (US-01..US-11) and Use Cases (UC-01..UC-06)
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

- **Language validation:** `fromLang` and `toLang` must be exactly `'русский'` or `'корейский'` (Russian words, not language codes)
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

### Frontend (`frontend/App.js`)

Two screens managed via `screen` state (`'main'` | `'history'`).

**Main screen layout (top → bottom):**
1. Menu button — floating, physical top-left corner (`top: 58, left: 14`, sibling of the `KeyboardAvoidingView` so it isn't clipped by its `paddingTop`); opens a left drawer (Сценарии / История / Проверить связь)
2. Korean mic button + flip button (physical top, Korean person's side)
3. Korean bubble (dark panel, text rotated 180° by default)
4. Gutter: scenario selector + history button
5. Russian bubble (dark panel)
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

**Conversation flow:** idle → recording → translating → waiting → (direction flips) → idle

**Korean typing overlay:** when `typingBubble === 'ko'`, a panel slides from the physical top of the screen so the Korean person can type without flipping the phone.

**Korean bubble flip animation:** toggling the flip button animates `koFlipAnim` (`Animated.Value`, 0↔1, 380ms, `Easing.inOut(Easing.ease)`, `useNativeDriver: true`) instead of snapping the `rotate` style instantly.

- The mic icon (`AnimatedMI`, a `Text`-based icon wrapped in `Animated.createAnimatedComponent`) just spins flat: `rotateZ` interpolated `0deg → 180deg`.
- The bubble itself visually flips over the **horizontal axis** (`rotateX`), not a flat in-plane spin. A pure `rotateX(180deg)` only mirrors content vertically (backwards, unreadable) — it is *not* equivalent to the old `rotate(180deg)`. To land on the same correct resting orientation (point-reflection: upside down, correctly shaped, readable from the opposite side of the table) while still visually flipping through the horizontal axis, the bubble's transform pairs `rotateX` (continuous `0deg → 180deg`) with a `rotateY` that **snaps** `0deg → 180deg` at the exact midpoint (`inputRange: [0, 0.499, 0.5, 1]`). At that midpoint `rotateX = 90deg`, so the panel is edge-on/zero-height and the snap is invisible. `rotateY(180) ∘ rotateX(180)` composes to exactly `rotate(180deg)` (verified numerically — see git history for the check), so text and the clear/TTS buttons end up exactly where they were before; only the transition path changed. `perspective: 1000` is first in the transform array for the 3D depth effect. If touching this again, don't drop the `rotateY` compensation — a bare `rotateX` flip looks fine mid-motion but silently breaks legibility at rest.

**History:** saved to `AsyncStorage` under `'translation_history'`, one array shared across all scenarios — each entry carries a `scenarioId`. On mount, entries older than 24 h are pruned. History screen filters by a `viewId` state (initialized from the main screen's current `scenarioId`), with a scenario chip + dropdown at the top to switch which scenario's history is displayed without leaving the screen. RU messages purple right, KO messages dark gray left.

**Scenarios:** list comes from the backend (`GET /scenarios`), not AsyncStorage — see the backend section above for the registry and CRUD endpoints. The picker sheet (`showPicker` Modal) has three sub-views via `sheetView` state:
- `'list'` — pinned section, then the rest; each row has a pin toggle (☆ `push-pin` icon), an edit (pencil) icon open to every scenario, and a delete icon shown only when `builtIn:false`
- `'create'` — two fields, name + prompt, `POST /scenarios`
- `'edit'` — fetches the live prompt via `GET /scenarios/:id`, saves via `PUT /scenarios/:id`

Deleting asks for confirmation first: tapping the trash icon sets `deleteTarget`, which renders a small "Удалить сценарий? Да/Нет" card over the sheet instead of deleting immediately.

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

- **Tailscale IP** (`100.68.162.96`) — works on any network as long as Tailscale is active on both Windows host and Android phone
- **LAN IP** (`192.168.35.219`) — fallback if Tailscale is down, same Wi-Fi only
- **USB dev** — run `adb reverse tcp:3000 tcp:3000` and set URL to `http://localhost:3000`

**Backend `.env`** must have:
```
OPENAI_API_KEY=sk-...
SUPABASE_URL=https://...supabase.co        # optional
SUPABASE_SERVICE_KEY=eyJ...               # optional
```

## ADB — Development Tips

**Connect device for hot reload (Wi-Fi firewall bypass):**
```bash
adb reverse tcp:8081 tcp:8081
adb reverse tcp:8082 tcp:8082
adb reverse tcp:3000 tcp:3000   # if using localhost backend
```

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
- **Google ML Kit Translation** (`@react-native-ml-kit/translation`) is the practical on-device alternative for offline translation (supports RU↔KO, free, ~30 MB model download)

## Future Roadmap (not yet implemented)

- **Play Store release:** `eas build --platform android --profile production` → upload AAB → Google Play Console
- **OTA updates:** `eas update --branch production` for JS-only changes (no Play Store submission needed)
- **Backend to cloud:** deploy `backend/` to Railway (`railway up`) to remove Tailscale dependency — set `BACKEND_URL` to public HTTPS domain
- **Offline fallback:** hybrid mode — GPT-4o when online, ML Kit when offline
