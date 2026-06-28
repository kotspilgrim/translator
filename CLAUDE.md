# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

A bilingual Russian-Korean voice translator. The user speaks via microphone; speech is recognized on-device, sent to a Node.js backend, translated by GPT-4o with optional conversation context, and displayed on screen. Two directions: RU→KO and KO→RU.

## Repository Structure

```
backend/    Node.js/Express translation server (OpenAI GPT-4o)
frontend/   React Native app (Expo + expo-speech-recognition)
```

## Commands

### Backend

```bash
cd backend
cp .env.example .env   # then fill in OPENAI_API_KEY
npm install
npm start              # runs on http://0.0.0.0:3000
```

### Frontend

The frontend uses `expo-dev-client` (not Expo Go), so a native build is required before first run.

```bash
cd frontend
npm install
npm run android        # build and launch on connected Android device/emulator
npm start              # start Metro bundler (after native build exists)
```

## Architecture

**Backend** (`backend/server.js`): Single Express route `POST /translate` accepting `{ text, fromLang, toLang, context }`. Calls OpenAI `gpt-4o` with a Russian-language system prompt that includes the conversation context. Returns `{ translation }`.

**Frontend** (`frontend/App.js`): Two screens managed via a `screen` state (`'main'` | `'history'`).

- **Main screen** layout: dark Korean-text panel (top, faces the Korean person) → scenario selector → dynamic content area → bottom toolbar (`💬` history | `RU→KO` direction toggle | `🎤` mic).
- **Conversation flow**: idle → recording (speech recognized into `interimText`) → translating → waiting. After each translation the direction auto-flips (`ru-ko` ↔ `ko-ru`) so the other person can respond without tapping anything extra. Long-press the top panel to reset the full conversation.
- **History screen**: `FlatList` of chat bubbles. Russian-speaker messages (purple, right); Korean-speaker messages (dark gray, left). Each bubble shows the original phrase and its translation.
- **History persistence**: entries are saved to `AsyncStorage` under `'translation_history'`. On mount the app prunes entries older than 24 hours. `histRef` (a `useRef` mirror of the `history` state) is used inside async callbacks to avoid stale-closure reads.
- **`dirRef`**: mirrors `direction` state so speech-recognition event callbacks always read the current direction without closure staleness.

## Critical Config

**`BACKEND_URL` in `frontend/App.js`** points to the backend. Backend runs on the Windows host, port 3000.

```js
const BACKEND_URL = 'http://100.68.162.96:3000'; // Tailscale IP — works on any network
```

The Tailscale IP (`100.68.162.96`) is stable and works regardless of Wi-Fi network, as long as Tailscale is active on both the Windows host and the Android phone. If Tailscale is unavailable, fall back to the local Wi-Fi IP (`ipconfig` → Wi-Fi IPv4).

**Backend `.env`** must have:
```
OPENAI_API_KEY=sk-...
```

## Android Permissions

`RECORD_AUDIO` is declared in `frontend/app.json`. The app requests microphone and speech recognition permissions at runtime before starting recognition.
