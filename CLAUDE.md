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

Single Express route `POST /translate` accepting `{ text, fromLang, toLang, context }`.

- **Language validation:** `fromLang` and `toLang` must be exactly `'русский'` or `'корейский'` (Russian words, not language codes)
- **Prompt loading:** reads `backend/prompts/<scenario>.txt`, substitutes `{fromLang}` and `{toLang}` placeholders
- **Security:** helmet, CORS (`origin: false`), rate limit (30 req/min), max text 1000 chars
- **Supabase logging:** if `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` are in `.env`, each translation is fire-and-forget inserted into the `translations` table
- **Returns:** `{ translation }` or `{ error }` with appropriate HTTP status

Scenario → prompt file mapping in `SCENARIO_FILES` constant at the top of `server.js`.

### Frontend (`frontend/App.js`)

Two screens managed via `screen` state (`'main'` | `'history'`).

**Main screen layout (top → bottom):**
1. Korean mic button + flip button (physical top, Korean person's side)
2. Korean bubble (dark panel, text rotated 180° by default)
3. Gutter: scenario selector + history button
4. Russian bubble (dark panel)
5. Russian mic button (physical bottom)

**Key state:**
- `koRotated` — boolean, controls 180° rotation of Korean panel; toggled by flip button; default `true`
- `activeBubble` — `null | 'ru' | 'ko'` — which side is currently active
- `activeBubbleRef` — `useRef` mirror of `activeBubble` for async callbacks
- `dirRef` — mirrors `direction` state so speech-recognition event callbacks always read current direction without closure staleness
- `histRef` — mirrors `history` state for async callbacks (same stale-closure reason)
- `typingBubble` — `null | 'ru' | 'ko'` — which side is in text-input mode

**Conversation flow:** idle → recording → translating → waiting → (direction flips) → idle

**Korean typing overlay:** when `typingBubble === 'ko'`, a panel slides from the physical top of the screen so the Korean person can type without flipping the phone.

**History:** saved to `AsyncStorage` under `'translation_history'`. On mount, entries older than 24 h are pruned. History screen: FlatList of chat bubbles — RU messages purple right, KO messages dark gray left.

**Scenarios:** saved to `AsyncStorage` under `'translator_scenarios'`. 7 built-in + user-created. Deletable (user-created only).

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

**Icon names use hyphens** (not underscores): `volume-up`, `arrow-back`, `expand-more`, `screen-rotation`.

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
