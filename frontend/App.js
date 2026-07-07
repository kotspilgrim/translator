import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ActivityIndicator,
  ScrollView, FlatList, Modal, TextInput, Keyboard,
  KeyboardAvoidingView, Platform, Animated, Easing, useWindowDimensions,
} from 'react-native';
import NetInfo from '@react-native-community/netinfo';

const AnimatedTouchable = Animated.createAnimatedComponent(TouchableOpacity);
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import { MaterialIcons } from '@expo/vector-icons';
import { useFonts } from 'expo-font';

const glyphs = MaterialIcons.getRawGlyphMap();
const MI = ({ name, size, color, style }) => (
  <Text style={[{ fontFamily: 'MaterialIcons', fontSize: size, color }, style]}>
    {String.fromCodePoint(glyphs[name])}
  </Text>
);

const AnimatedText = Animated.createAnimatedComponent(Text);
const AnimatedMI = ({ name, size, color, style }) => (
  <AnimatedText style={[{ fontFamily: 'MaterialIcons', fontSize: size, color }, style]}>
    {String.fromCodePoint(glyphs[name])}
  </AnimatedText>
);
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import MlkitTranslate from './modules/mlkit-translate/src/MlkitTranslateModule';
import { t, INTERFACE_LANGUAGES, SOURCE_LANGUAGES, LANG_LOCALE, LANG_RU_NAME, scenarioName } from './i18n';

// ── Config ───────────────────────────────────────────────────────────────────
const BACKEND_URL   = 'https://translator-production-6a87.up.railway.app';
const HISTORY_KEY   = 'translation_history';
const THEME_KEY     = 'translator_theme';
const AUTH_TOKEN_KEY = 'translator_auth_token';
const INTERFACE_LANG_KEY = 'translator_interface_lang';
const SOURCE_LANG_KEY    = 'translator_source_lang';
const HISTORY_TTL   = 24 * 60 * 60 * 1000;
const SILENCE_MS    = 7000;
const MAX_PINNED    = 3;
// A conversation only counts as the SAME context while consecutive turns are
// less than 2h apart — an idle gap of 2h+ means whatever was said before it
// is treated as a different conversation and dropped from the model's
// context, even though it's still well within the 24h HISTORY_TTL above.
const CONTEXT_SESSION_GAP = 2 * 60 * 60 * 1000;
// Caps how many recent turns get sent as context per request — bounds the
// prompt/token cost regardless of how long the in-session streak is.
const MAX_CONTEXT_TURNS   = 8;

// Used until GET /scenarios resolves (or if the backend is unreachable)
const FALLBACK_SCENARIOS = [
  { id: 'stranger-on-street', name: 'Незнакомец на улице',      builtIn: true },
  { id: 'v-magazine',         name: 'В магазине',               builtIn: true },
  { id: 'v-restorane',        name: 'В ресторане',              builtIn: true },
  { id: 'v-banke',            name: 'В банке',                  builtIn: true },
  { id: 'v-bolnitse',         name: 'В больнице',               builtIn: true },
  { id: 'v-otele',            name: 'В отеле',                  builtIn: true },
  { id: 'v-transporte',       name: 'В транспорте',             builtIn: true },
  { id: 'v-vetklinike',       name: 'В ветеринарной клинике',   builtIn: true },
];

// Placeholders — text content only, not rotation. The Korean side is fixed
// Korean regardless of interface language (see i18n.js); the Russian/source
// side's placeholders (PH_RU/PH_RU_WAIT) DO follow interfaceLang — they're
// chrome hints, not conversation content — via tr('phRu')/tr('phRuWait') below.
const PH_KO_WAIT   = '상대방의 발화가 끝날 때까지\n기다려 주세요';
const PH_KO_ACTIVE = '음성 통역 또는 텍스트 번역으로 대화 할 수 있습니다.\n음성으로 대화하려면 마이크 버튼을,\n텍스트로 대화하려면 텍스트 영역을 누르세요.';

const fmtTime = ts => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

// Mirrors backend/auth.js's checkPasswordRules exactly — this copy is only
// for live UI feedback, the backend re-validates regardless.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function checkPasswordRules(pw) {
  const password = typeof pw === 'string' ? pw : '';
  return {
    minLength:  password.length >= 8,
    upperLower: /[a-z]/.test(password) && /[A-Z]/.test(password),
    digit:      /\d/.test(password),
    special:    /[^A-Za-z0-9]/.test(password),
  };
}
const passwordRulesPassed = rules => Object.values(rules).filter(Boolean).length;

// ── Theme ────────────────────────────────────────────────────────────────────
// Two full palettes (dark = the app's original look, unchanged; light = the
// "Translator Current.dc.html" design). Every color used anywhere in the app
// is a named token here — components read `c.tokenName`, never a literal hex.
const COLORS = {
  dark: {
    statusBarStyle: 'light',
    bg: '#0f0f0f',

    ctrlBg: '#1a1a1a', ctrlBorder: '#2e2e2e',
    iconMid: '#cfcfcf', iconDim: '#666',

    scrimLight: 'rgba(0,0,0,0.6)',

    micBg: '#202020', micBorder: '#2e2e2e', micIcon: '#e6e6e6',
    micRecBg: '#7f1d1d', micRecBorder: '#ef4444', micRecIcon: '#e6e6e6',
    micDimOpacity: 0.3,

    testBorder: '#2e2e2e', testIconIdle: '#9fb8c4',
    testOk: '#4ade80', testBad: '#f87171', testChecking: '#4fc3f7',
    pillBg: '#1e1e1e', pillBorder: '#2e2e2e', pillText: '#9a9a9a',

    bubbleBg: '#161616', bubbleBorder: '#1e1e1e', bubbleBorderActive: '#ffffff',
    textStrong: '#ffffff', textPlaceholder: '#2a2a2a', textWaitPlaceholder: '#3a3a3a',
    bubbleInputPh: '#333', chipInsetBg: '#252525', ttsDimOpacity: 0.2,

    scenBg: '#1a1a1a', scenBorder: '#252525', scenText: '#bbb',

    koPanelBg: '#161616', koPanelHint: '#444', koPanelPh: '#444', koCursor: '#4fc3f7',

    histHeaderBorder: '#1a1a1a', histTitle: '#ffffff',
    histChipBg: '#1a1a1a', histChipBorder: '#242424', histChipText: '#e8d9ad',
    histDropBg: '#1e1e1e', histDropBorder: '#2a2a2a', histOptText: '#b0b0b0', histOptActiveBg: '#262626',
    histEmptyText: '#444',

    pinAccent: '#f0b429',

    chatRuBg: '#5b21b6', chatRuText: '#ffffff',
    chatRuSep: 'rgba(255,255,255,0.3)', chatRuTrans: 'rgba(255,255,255,0.65)', chatRuTime: 'rgba(255,255,255,0.3)',
    chatKoBg: '#1f1f1f', chatKoBorder: 'transparent', chatKoText: '#ffffff',
    chatKoSep: 'rgba(255,255,255,0.3)', chatKoTrans: 'rgba(255,255,255,0.65)', chatKoTime: 'rgba(255,255,255,0.3)',

    menuDrawerBg: '#161616', menuDrawerBorder: '#242424', menuBrand: '#ffffff', menuSub: '#555',
    menuIcon: '#8f8f8f', menuText: '#c9c9c9', menuDivider: '#242424', themeToggleIcon: '#f0b429',

    sheetBg: '#191919', sheetHeadBorder: '#2a2a2a', sheetTitle: '#888', sheetClose: '#777',
    sheetSectionPlain: '#666',
    sheetItemOnBg: '#252525',
    sheetItemText: '#aaa', sheetItemTextOn: '#ffffff',
    pinOff: '#5a5a5a', editIcon: '#7d7d7d', deleteIcon: '#8a8a8a',
    addBorder: '#2a2a2a', addText: '#555',

    subHeadBorder: '#2a2a2a', subHeadTitle: '#ffffff', backIcon: '#ccc',
    fieldLbl: '#666', fieldBg: '#232323', fieldBorder: '#333',
    fieldNameText: '#ffffff', fieldPromptText: '#e0e0e0', fieldPh: '#555',
    fieldError: '#f87171',
    btnNeutralBg: '#232323', btnNeutralBorder: '#333', btnNeutralText: '#9a9a9a',
    btnSaveBg: '#1a4020', btnSaveBorder: '#2a5c34', btnSaveText: '#4ade80',
    btnDangerBg: '#3a1414', btnDangerBorder: '#5c2323', btnDangerText: '#f87171',

    confirmScrim: 'rgba(0,0,0,0.65)', confirmBg: '#1e1e1e', confirmBorder: '#2e2e2e',
    confirmTitle: '#ffffff', confirmText: '#9a9a9a',

    koBackdrop: 'rgba(0,0,0,0.65)',

    // Auth screens (sign in / sign up / email code)
    linkColor: '#8ab4f8', warnColor: '#eab308',
    authBg: '#0f0f0f', authFieldBg: '#161616', authFieldBorder: '#2a2a2a',
    authFieldBorderError: '#ef4444',
    authPrimaryBg: '#ffffff', authPrimaryText: '#0f0f0f',
    authPrimaryBgDisabled: '#2a2a2a', authPrimaryTextDisabled: '#666',
    codeBoxBg: '#161616', codeBoxBorder: '#3a3a3a', codeBoxBorderActive: '#8ab4f8',
    codeBoxBgError: '#1e1414', codeBoxBorderError: '#ef4444',
  },
  light: {
    statusBarStyle: 'dark',
    bg: '#f4f4f7',

    ctrlBg: '#ffffff', ctrlBorder: '#e2e2e8',
    iconMid: '#555', iconDim: '#999',

    scrimLight: 'rgba(0,0,0,0.3)',

    micBg: '#ffffff', micBorder: '#e2e2e8', micIcon: '#333',
    micRecBg: '#fdecec', micRecBorder: '#ef4444', micRecIcon: '#dc2626',
    micDimOpacity: 0.3,

    testBorder: '#d0d0d8', testIconIdle: '#6a8794',
    testOk: '#16a34a', testBad: '#dc2626', testChecking: '#2563eb',
    pillBg: '#ffffff', pillBorder: '#e2e2e8', pillText: '#666',

    bubbleBg: '#ffffff', bubbleBorder: '#e5e5ea', bubbleBorderActive: '#111111',
    textStrong: '#111111', textPlaceholder: '#c2c2c8', textWaitPlaceholder: '#9a9aa2',
    bubbleInputPh: '#bbb', chipInsetBg: '#ececf0', ttsDimOpacity: 0.35,

    scenBg: '#ffffff', scenBorder: '#e2e2e8', scenText: '#333',

    koPanelBg: '#ffffff', koPanelHint: '#999', koPanelPh: '#ccc', koCursor: '#2563eb',

    histHeaderBorder: '#e5e5ea', histTitle: '#111111',
    histChipBg: '#ffffff', histChipBorder: '#e5e5ea', histChipText: '#8a6d1e',
    histDropBg: '#ffffff', histDropBorder: '#e5e5ea', histOptText: '#555', histOptActiveBg: '#ececf0',
    histEmptyText: '#999',

    pinAccent: '#e0a000',

    chatRuBg: '#6d28d9', chatRuText: '#ffffff',
    chatRuSep: 'rgba(255,255,255,0.4)', chatRuTrans: 'rgba(255,255,255,0.7)', chatRuTime: 'rgba(255,255,255,0.4)',
    chatKoBg: '#ffffff', chatKoBorder: '#e8e8ee', chatKoText: '#222222',
    chatKoSep: '#bbbbbb', chatKoTrans: '#777777', chatKoTime: '#aaaaaa',

    menuDrawerBg: '#ffffff', menuDrawerBorder: '#e5e5ea', menuBrand: '#111111', menuSub: '#aaa',
    menuIcon: '#888', menuText: '#333', menuDivider: '#eeeeee', themeToggleIcon: '#6d28d9',

    sheetBg: '#ffffff', sheetHeadBorder: '#eeeeee', sheetTitle: '#999', sheetClose: '#999',
    sheetSectionPlain: '#aaa',
    sheetItemOnBg: '#f0edfa',
    sheetItemText: '#333', sheetItemTextOn: '#111111',
    pinOff: '#c8c8ce', editIcon: '#999', deleteIcon: '#b0453f',
    addBorder: '#d5d5db', addText: '#999',

    subHeadBorder: '#eeeeee', subHeadTitle: '#111111', backIcon: '#555',
    fieldLbl: '#999', fieldBg: '#f4f4f6', fieldBorder: '#e2e2e8',
    fieldNameText: '#111111', fieldPromptText: '#333333', fieldPh: '#aaa',
    fieldError: '#d33333',
    btnNeutralBg: '#ececf0', btnNeutralBorder: '#e2e2e8', btnNeutralText: '#555',
    btnSaveBg: '#e4f7ea', btnSaveBorder: '#34a853', btnSaveText: '#1a7f37',
    btnDangerBg: '#fdecec', btnDangerBorder: '#ef4444', btnDangerText: '#d33333',

    confirmScrim: 'rgba(0,0,0,0.3)', confirmBg: '#ffffff', confirmBorder: '#e5e5ea',
    confirmTitle: '#111111', confirmText: '#666',

    koBackdrop: 'rgba(0,0,0,0.3)',

    // Auth screens (sign in / sign up / email code)
    linkColor: '#2563eb', warnColor: '#d97706',
    authBg: '#f4f4f7', authFieldBg: '#ffffff', authFieldBorder: '#e2e2e8',
    authFieldBorderError: '#ef4444',
    authPrimaryBg: '#111111', authPrimaryText: '#ffffff',
    authPrimaryBgDisabled: '#e2e2e8', authPrimaryTextDisabled: '#999',
    codeBoxBg: '#ffffff', codeBoxBorder: '#d8d8de', codeBoxBorderActive: '#2563eb',
    codeBoxBgError: '#fdecec', codeBoxBorderError: '#ef4444',
  },
};

// Light theme gets subtle card shadows (matches the design's white-on-light-grey
// surfaces); dark theme stays flat-on-black exactly as before.
const SHADOW_SM = { elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 };
const SHADOW_MD = { elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 };
const SHADOW_LG = { elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 24 };
const shadow = (theme, preset) => (theme === 'light' ? preset : null);

// ── History screen ───────────────────────────────────────────────────────────
function HistoryScreen({ history, scenarios, initialScenarioId, onBack, theme, lang }) {
  const c = COLORS[theme];
  const S = useMemo(() => makeStyles(c, theme), [c, theme]);
  const tr = (key, vars) => t(lang, key, vars);

  const [viewId,   setViewId]   = useState(initialScenarioId);
  const [showDrop, setShowDrop] = useState(false);

  const viewScenario = scenarios.find(s => s.id === viewId);
  const viewName = viewId === null ? tr('noScenarioTab') : (viewScenario ? scenarioName(lang, viewScenario) : tr('scenarioFallback'));
  const filtered = history.filter(i => i.scenarioId === viewId);

  return (
    <View style={S.histCont}>
      <StatusBar style={c.statusBarStyle} />
      <View style={S.histHead}>
        <TouchableOpacity onPress={onBack} style={S.backBtn}>
          <MI name="arrow-back" size={24} color={c.textStrong} />
        </TouchableOpacity>
        <Text style={S.histTitle}>{tr('historyTitle')}</Text>
      </View>

      <TouchableOpacity style={S.histScenChip} onPress={() => setShowDrop(v => !v)}>
        <MI name="push-pin" size={13} color={c.pinAccent} />
        <Text style={S.histScenChipTxt} numberOfLines={1}>{viewName}</Text>
        <MI name="expand-more" size={16} color={c.iconDim} />
      </TouchableOpacity>

      {showDrop && (
        <View style={S.histScenDrop}>
          <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
            <TouchableOpacity
              style={[S.histScenOpt, viewId === null && S.histScenOptOn]}
              onPress={() => { setViewId(null); setShowDrop(false); }}
            >
              <Text style={[S.histScenOptTxt, viewId === null && S.histScenOptTxtOn]} numberOfLines={1}>
                {tr('noScenarioTab')}
              </Text>
            </TouchableOpacity>
            {scenarios.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[S.histScenOpt, s.id === viewId && S.histScenOptOn]}
                onPress={() => { setViewId(s.id); setShowDrop(false); }}
              >
                <Text style={[S.histScenOptTxt, s.id === viewId && S.histScenOptTxtOn]} numberOfLines={1}>
                  {scenarioName(lang, s)}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {filtered.length === 0 ? (
        <View style={S.histEmpty}>
          <Text style={S.histEmptyTxt}>{tr('noHistory24h')}</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          contentContainerStyle={S.histList}
          inverted
          renderItem={({ item }) => {
            const isRu = item.direction === 'ru-ko';
            const bubStyle  = isRu ? S.chatBubRu : S.chatBubKo;
            const textColor = isRu ? c.chatRuText  : c.chatKoText;
            const sepColor  = isRu ? c.chatRuSep   : c.chatKoSep;
            const transColor= isRu ? c.chatRuTrans : c.chatKoTrans;
            const timeColor = isRu ? c.chatRuTime  : c.chatKoTime;
            return (
              <View style={[S.chatWrap, isRu ? S.chatRight : S.chatLeft]}>
                <View style={[S.chatBub, bubStyle]}>
                  <Text style={[S.chatOrig, { color: textColor }]}>{item.originalText}</Text>
                  <MI name="south" size={14} color={sepColor} style={S.chatSep} />
                  <Text style={[S.chatTrans, { color: transColor }]}>{item.translatedText}</Text>
                  <Text style={[S.chatTime, { color: timeColor }]}>
                    {item.offline ? `${tr('offlineTag')} · ` : ''}{fmtTime(item.timestamp)}
                  </Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

// ── Language packs (offline translation) ────────────────────────────────────
// Korean is always one side; the other is whichever source language is
// currently selected for the source bubble (see "Source language" below) —
// offline translation only ever runs between those two, so the pack list
// tracks the same pair instead of a fixed ru/ko.
function LanguagePacksScreen({ theme, onBack, lang, sourceLang }) {
  const c = COLORS[theme];
  const S = useMemo(() => makeStyles(c, theme), [c, theme]);
  const tr = (key, vars) => t(lang, key, vars);

  const OFFLINE_LANGUAGES = useMemo(() => ([
    SOURCE_LANGUAGES.find(l => l.code === sourceLang) || SOURCE_LANGUAGES[0],
    INTERFACE_LANGUAGES.find(l => l.code === 'ko'),
  ]), [sourceLang]);

  const [status, setStatus]   = useState({}); // { [code]: bool }
  const [busy, setBusy]       = useState({}); // { [code]: 'download'|'delete' }
  const [wifiOnly, setWifiOnly] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const refreshStatus = async () => {
    const entries = await Promise.all(
      OFFLINE_LANGUAGES.map(async l => [l.code, await MlkitTranslate.isModelDownloaded(l.code)])
    );
    setStatus(Object.fromEntries(entries));
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { await refreshStatus(); } catch { setError(tr('packsStatusFailed')); }
      setLoading(false);
    })();
  }, [sourceLang]);

  const handleDownload = async code => {
    setError('');
    setBusy(b => ({ ...b, [code]: 'download' }));
    try {
      await MlkitTranslate.downloadModel(code, wifiOnly);
      await refreshStatus();
    } catch {
      setError(tr('packsDownloadFailed'));
    }
    setBusy(b => ({ ...b, [code]: null }));
  };

  const handleDelete = async code => {
    setError('');
    setBusy(b => ({ ...b, [code]: 'delete' }));
    try {
      await MlkitTranslate.deleteModel(code);
      await refreshStatus();
    } catch {
      setError(tr('packsDeleteFailed'));
    }
    setBusy(b => ({ ...b, [code]: null }));
  };

  return (
    <View style={S.histCont}>
      <StatusBar style={c.statusBarStyle} />
      <View style={S.histHead}>
        <TouchableOpacity onPress={onBack} style={S.backBtn}>
          <MI name="arrow-back" size={24} color={c.textStrong} />
        </TouchableOpacity>
        <Text style={S.histTitle}>{tr('languagePacks')}</Text>
      </View>

      <Text style={S.packsHint}>{tr('packsHint')}</Text>

      {loading ? (
        <ActivityIndicator color={c.linkColor} style={{ marginTop: 30 }} />
      ) : (
        <View style={S.packsList}>
          {OFFLINE_LANGUAGES.map(l => {
            const downloaded = !!status[l.code];
            const busyAction = busy[l.code];
            return (
              <View key={l.code} style={S.packRow}>
                <View style={S.packInfo}>
                  <Text style={S.packName}>{l.label}</Text>
                  <Text style={[S.packStatus, downloaded && { color: c.btnSaveText }]}>
                    {downloaded ? tr('downloaded') : tr('notDownloaded')}
                  </Text>
                </View>
                {busyAction ? (
                  <ActivityIndicator color={c.linkColor} />
                ) : downloaded ? (
                  <TouchableOpacity style={S.packBtnDanger} onPress={() => handleDelete(l.code)}>
                    <MI name="delete-outline" size={18} color={c.btnDangerText} />
                    <Text style={S.packBtnDangerTxt}>{tr('delete')}</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={S.packBtnSave} onPress={() => handleDownload(l.code)}>
                    <MI name="download" size={18} color={c.btnSaveText} />
                    <Text style={S.packBtnSaveTxt}>{tr('download')}</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          <TouchableOpacity style={S.packWifiRow} onPress={() => setWifiOnly(w => !w)}>
            <MI name={wifiOnly ? 'check-box' : 'check-box-outline-blank'} size={20} color={c.iconMid} />
            <MI name="wifi" size={16} color={c.iconDim} />
            <Text style={S.packWifiTxt}>{tr('wifiOnly')}</Text>
          </TouchableOpacity>

          {!!error && (
            <View style={S.authErrorRow}>
              <MI name="error" size={14} color={c.fieldError} />
              <Text style={S.authErrorTxt}>{error}</Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

// ── Auth: shared bits ────────────────────────────────────────────────────────
function AuthThemeToggle({ theme, toggleTheme, c, S }) {
  return (
    <TouchableOpacity style={S.authThemeToggle} onPress={toggleTheme} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
      <MI name={theme === 'dark' ? 'light-mode' : 'dark-mode'} size={18} color={c.themeToggleIcon} />
    </TouchableOpacity>
  );
}

// Interface-language switch for the pre-login screens — shares the same
// INTERFACE_LANGUAGES/LanguageSheet as the logged-in menu drawer's picker, and
// writes to the same lifted `interfaceLang` state in App(), so a change here
// instantly applies everywhere else too (forgot-password, verify-code, etc.
// all read that same state via their own `lang` prop).
function AuthLangToggle({ lang, onChangeLang, c, S }) {
  const [show, setShow] = useState(false);
  return (
    <>
      <TouchableOpacity style={S.authLangBtn} onPress={() => setShow(true)} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <Text style={S.authLangBtnTxt}>{lang.toUpperCase()}</Text>
      </TouchableOpacity>
      <LanguageSheet
        visible={show}
        onClose={() => setShow(false)}
        options={INTERFACE_LANGUAGES}
        selected={lang}
        onSelect={onChangeLang}
        title={t(lang, 'menuInterfaceLanguage')}
        c={c} S={S}
      />
    </>
  );
}

// ── Sign in ──────────────────────────────────────────────────────────────────
function SignInScreen({ theme, toggleTheme, onSuccess, onNeedsVerification, onGoToSignUp, onGuest, onForgotPassword, notice, onConsumeNotice, lang, onChangeLang }) {
  const c = COLORS[theme];
  const S = useMemo(() => makeStyles(c, theme), [c, theme]);
  const tr = (key, vars) => t(lang, key, vars);

  // Consumed once on mount so a stale success banner can't reappear the next
  // time this screen is shown (e.g. after a later logout).
  const [localNotice] = useState(notice || '');
  useEffect(() => { if (notice) onConsumeNotice(); }, []);

  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  const handleSubmit = async () => {
    if (loading) return;
    setError('');
    setLoading(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await resp.json();
      if (resp.ok) {
        onSuccess(data.token, data.user);
      } else if (data.error === 'email_not_verified') {
        onNeedsVerification(data.userId, email.trim());
      } else {
        setError(data.error || tr('loginFailedDefault'));
      }
    } catch {
      setError(tr('noServerConnection'));
    }
    setLoading(false);
  };

  return (
    <View style={S.authScreen}>
      <StatusBar style={c.statusBarStyle} />
      <View style={S.authTopRightRow}>
        <AuthLangToggle lang={lang} onChangeLang={onChangeLang} c={c} S={S} />
        <AuthThemeToggle theme={theme} toggleTheme={toggleTheme} c={c} S={S} />
      </View>

      <View style={S.authLogoWrap}>
        <Text style={S.authTitle}>{tr('welcomeBack')}</Text>
        <Text style={S.authSubtitle}>{tr('signInSubtitle')}</Text>
      </View>

      {!!localNotice && (
        <View style={S.authNoticeRow}>
          <MI name="check-circle" size={14} color={c.btnSaveText} />
          <Text style={S.authNoticeTxt}>{localNotice}</Text>
        </View>
      )}

      <Text style={S.authFieldLbl}>{tr('emailLabel')}</Text>
      <View style={S.authFieldBox}>
        <TextInput
          style={S.authFieldInput}
          value={email}
          onChangeText={setEmail}
          placeholder="anna@example.com"
          placeholderTextColor={c.fieldPh}
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </View>

      <Text style={S.authFieldLbl}>{tr('passwordLabel')}</Text>
      <View style={S.authFieldBox}>
        <TextInput
          style={S.authFieldInput}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••••"
          placeholderTextColor={c.fieldPh}
          secureTextEntry={!showPassword}
        />
        <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <MI name={showPassword ? 'visibility' : 'visibility-off'} size={20} color={c.iconDim} />
        </TouchableOpacity>
      </View>

      {!!error && (
        <View style={S.authErrorRow}>
          <MI name="error" size={14} color={c.fieldError} />
          <Text style={S.authErrorTxt}>{error}</Text>
        </View>
      )}

      <TouchableOpacity onPress={onForgotPassword} style={S.authLinkEnd} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
        <Text style={S.authLink}>{tr('forgotPassword')}</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={[S.authPrimaryBtn, loading && S.authPrimaryBtnDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color={c.authPrimaryText} />
          : <Text style={S.authPrimaryBtnTxt}>{tr('loginBtn')}</Text>}
      </TouchableOpacity>

      <View style={S.authFooterRow}>
        <Text style={S.authFooterTxt}>{tr('noAccount')}</Text>
        <TouchableOpacity onPress={onGoToSignUp}>
          <Text style={S.authLinkBold}>{tr('signUpLink')}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={S.authGuestBtn} onPress={onGuest}>
        <Text style={S.authGuestBtnTxt}>{tr('guestBtn')}</Text>
        <Text style={S.authGuestBtnSub}>{tr('guestSub')}</Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Sign up ──────────────────────────────────────────────────────────────────
function SignUpScreen({ theme, toggleTheme, onNeedsVerification, onGoToSignIn, lang, onChangeLang }) {
  const c = COLORS[theme];
  const S = useMemo(() => makeStyles(c, theme), [c, theme]);
  const tr = (key, vars) => t(lang, key, vars);

  const [email,        setEmail]        = useState('');
  const [password,     setPassword]     = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [touched,      setTouched]      = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [error,        setError]        = useState('');

  const rules  = checkPasswordRules(password);
  const passed = passwordRulesPassed(rules);
  // 0-1 rules -> weak, 2-3 -> medium, 4 -> strong. Only the two extremes are
  // shown in the design (A2 all-green, A3 mostly-red) — medium is my own
  // reasonable fill-in for the tier the design doesn't depict.
  const tierColor = passed <= 1 ? c.fieldError : passed <= 3 ? c.warnColor : c.btnSaveText;
  const tierLabel = passed <= 1 ? tr('weakPassword') : passed <= 3 ? tr('mediumPassword') : tr('strongPassword');
  const emailValid = EMAIL_RE.test(email.trim());
  const canSubmit  = emailValid && passed === 4 && !loading;

  const requirements = [
    { key: 'minLength',  labelKey: 'reqMinLength' },
    { key: 'upperLower', labelKey: 'reqUpperLower' },
    { key: 'digit',      labelKey: 'reqDigit' },
    { key: 'special',    labelKey: 'reqSpecial' },
  ];

  const handleSubmit = async () => {
    setTouched(true);
    if (!canSubmit) return;
    setError('');
    setLoading(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/auth/signup`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), password }),
      });
      const data = await resp.json();
      if (resp.ok) {
        onNeedsVerification(data.userId, email.trim());
      } else {
        setError(data.error || tr('signupFailedDefault'));
      }
    } catch {
      setError(tr('noServerConnection'));
    }
    setLoading(false);
  };

  return (
    <View style={S.authScreen}>
      <StatusBar style={c.statusBarStyle} />
      <View style={S.authHeaderRow}>
        <TouchableOpacity onPress={onGoToSignIn} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <MI name="arrow-back" size={24} color={c.backIcon} />
        </TouchableOpacity>
        <Text style={S.authHeaderTitle}>{tr('createAccount')}</Text>
        <View style={S.authHeaderRightRow}>
          <AuthLangToggle lang={lang} onChangeLang={onChangeLang} c={c} S={S} />
          <AuthThemeToggle theme={theme} toggleTheme={toggleTheme} c={c} S={S} />
        </View>
      </View>

      <Text style={S.authFieldLbl}>{tr('emailLabel')}</Text>
      <View style={[S.authFieldBox, touched && !emailValid && S.authFieldBoxError]}>
        <TextInput
          style={S.authFieldInput}
          value={email}
          onChangeText={setEmail}
          placeholder="anna@example.com"
          placeholderTextColor={c.fieldPh}
          autoCapitalize="none"
          keyboardType="email-address"
        />
      </View>
      {touched && !emailValid && (
        <View style={S.authErrorRow}>
          <MI name="error" size={14} color={c.fieldError} />
          <Text style={S.authErrorTxt}>{tr('invalidEmail')}</Text>
        </View>
      )}

      <Text style={S.authFieldLbl}>{tr('passwordLabel')}</Text>
      <View style={[S.authFieldBox, touched && passed < 4 && S.authFieldBoxError]}>
        <TextInput
          style={S.authFieldInput}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••••••"
          placeholderTextColor={c.fieldPh}
          secureTextEntry={!showPassword}
        />
        <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <MI name={showPassword ? 'visibility' : 'visibility-off'} size={20} color={c.iconDim} />
        </TouchableOpacity>
      </View>

      <View style={S.strengthBarsRow}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={[S.strengthBar, { backgroundColor: i < passed ? tierColor : c.authFieldBorder }]} />
        ))}
      </View>
      {!!password && <Text style={[S.strengthLabel, { color: tierColor }]}>{tierLabel}</Text>}

      <View style={S.reqList}>
        {requirements.map(r => {
          const met = rules[r.key];
          const show = !!password; // neutral/dim until the user starts typing
          return (
            <View key={r.key} style={S.reqRow}>
              <MI
                name={show ? (met ? 'check-circle' : 'cancel') : 'check-circle'}
                size={17}
                color={show ? (met ? c.btnSaveText : c.fieldError) : c.iconDim}
              />
              <Text style={[S.reqTxt, { color: show ? (met ? c.iconDim : c.fieldError) : c.iconDim }]}>
                {tr(r.labelKey)}
              </Text>
            </View>
          );
        })}
      </View>

      {!!error && (
        <View style={S.authErrorRow}>
          <MI name="error" size={14} color={c.fieldError} />
          <Text style={S.authErrorTxt}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[S.authPrimaryBtn, !canSubmit && S.authPrimaryBtnDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color={c.authPrimaryText} />
          : <Text style={[S.authPrimaryBtnTxt, !canSubmit && S.authPrimaryBtnTxtDisabled]}>{tr('continueBtn')}</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ── Email verification code ─────────────────────────────────────────────────
const CODE_LENGTH   = 6;
const RESEND_COOLDOWN_S = 60;

function VerifyCodeScreen({ theme, userId, email, verifyEndpoint = '/auth/verify-email', resendEndpoint = '/auth/resend-code', onSuccess, onBack, lang }) {
  const c = COLORS[theme];
  const S = useMemo(() => makeStyles(c, theme), [c, theme]);
  const tr = (key, vars) => t(lang, key, vars);

  const [code,       setCode]       = useState('');
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [attemptsLeft, setAttemptsLeft] = useState(null);
  const [cooldown,   setCooldown]   = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown(s => s - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const submitCode = async fullCode => {
    setLoading(true);
    setError('');
    try {
      const resp = await fetch(`${BACKEND_URL}${verifyEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, code: fullCode }),
      });
      const data = await resp.json();
      if (resp.ok) {
        onSuccess(data);
      } else {
        setError(data.error || tr('invalidCodeDefault'));
        if (typeof data.attemptsRemaining === 'number') setAttemptsLeft(data.attemptsRemaining);
        setCode('');
      }
    } catch {
      setError(tr('noServerConnection'));
    }
    setLoading(false);
  };

  const handleChangeCode = text => {
    const digits = text.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) submitCode(digits);
  };

  const handleResend = async () => {
    if (cooldown > 0 || loading) return;
    setError('');
    setCode('');
    try {
      const resp = await fetch(`${BACKEND_URL}${resendEndpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (resp.ok) { setAttemptsLeft(null); setCooldown(RESEND_COOLDOWN_S); }
    } catch {}
  };

  const hasError = !!error;

  return (
    <View style={S.authScreen}>
      <StatusBar style={c.statusBarStyle} />
      <View style={[S.authHeaderRow, { marginBottom: 34 }]}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <MI name="arrow-back" size={24} color={c.backIcon} />
        </TouchableOpacity>
      </View>

      <View style={S.codeHintIcon}>
        <MI name="mark-email-read" size={28} color={c.linkColor} />
      </View>
      <Text style={S.authTitle}>{tr('enterCode')}</Text>
      <Text style={S.authSubtitle}>
        {tr('codeSentTo')}{'\n'}
        <Text style={{ color: c.textStrong }}>{email}</Text>
      </Text>

      {/* Tapping the boxes focuses the single hidden input below them —
          far more reliable in RN than juggling 6 refs with auto-advance. */}
      <TouchableOpacity activeOpacity={1} onPress={() => inputRef.current?.focus()} style={S.codeRow}>
        {Array.from({ length: CODE_LENGTH }).map((_, i) => {
          const digit = code[i];
          const isCursor = i === code.length && !hasError;
          return (
            <View key={i} style={[S.codeBox, hasError && S.codeBoxError, isCursor && S.codeBoxActive]}>
              {digit ? (
                <Text style={[S.codeDigit, hasError && { color: c.fieldError }]}>{digit}</Text>
              ) : isCursor ? (
                <View style={S.codeCursor} />
              ) : null}
            </View>
          );
        })}
      </TouchableOpacity>
      <TextInput
        ref={inputRef}
        value={code}
        onChangeText={handleChangeCode}
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        style={S.codeHiddenInput}
        autoFocus
      />

      {hasError && (
        <View style={[S.authErrorRow, { marginBottom: 24 }]}>
          <MI name="error" size={14} color={c.fieldError} />
          <Text style={S.authErrorTxt}>
            {error}{attemptsLeft != null ? tr('attemptsRemaining', { n: attemptsLeft }) : ''}
          </Text>
        </View>
      )}

      {loading && <ActivityIndicator color={c.linkColor} style={{ marginBottom: 20 }} />}

      {cooldown > 0 ? (
        <Text style={S.resendTxt}>{tr('resendIn')} <Text style={{ color: c.textStrong }}>0:{String(cooldown).padStart(2, '0')}</Text></Text>
      ) : (
        <TouchableOpacity onPress={handleResend}>
          <Text style={[S.resendTxt, S.authLink]}>{tr('resendCode')}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// ── Forgot password: email entry ────────────────────────────────────────────
function ForgotPasswordScreen({ theme, toggleTheme, onCodeSent, onNeedsVerification, onBack, lang }) {
  const c = COLORS[theme];
  const S = useMemo(() => makeStyles(c, theme), [c, theme]);
  const tr = (key, vars) => t(lang, key, vars);

  const [email,   setEmail]   = useState('');
  const [touched, setTouched] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const emailValid = EMAIL_RE.test(email.trim());
  const canSubmit   = emailValid && !loading;

  const handleSubmit = async () => {
    setTouched(true);
    if (!canSubmit) return;
    setError('');
    setLoading(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await resp.json();
      if (resp.ok) {
        onCodeSent(data.userId, email.trim());
      } else if (data.error === 'email_not_verified') {
        // This email never finished signup verification — there's no
        // password to reset yet, route into the existing signup-verify flow.
        onNeedsVerification(data.userId, email.trim());
      } else {
        setError(data.error || tr('resetRequestFailedDefault'));
      }
    } catch {
      setError(tr('noServerConnection'));
    }
    setLoading(false);
  };

  return (
    <View style={S.authScreen}>
      <StatusBar style={c.statusBarStyle} />
      <View style={S.authHeaderRow}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <MI name="arrow-back" size={24} color={c.backIcon} />
        </TouchableOpacity>
        <Text style={S.authHeaderTitle}>{tr('resetPasswordTitle')}</Text>
        <View style={{ marginLeft: 'auto' }}>
          <AuthThemeToggle theme={theme} toggleTheme={toggleTheme} c={c} S={S} />
        </View>
      </View>

      <View style={S.codeHintIcon}>
        <MI name="lock-reset" size={28} color={c.linkColor} />
      </View>
      <Text style={[S.authSubtitle, { textAlign: 'left', marginBottom: 28 }]}>{tr('resetPasswordSubtitle')}</Text>

      <Text style={S.authFieldLbl}>{tr('emailLabel')}</Text>
      <View style={[S.authFieldBox, touched && !emailValid && S.authFieldBoxError]}>
        <TextInput
          style={S.authFieldInput}
          value={email}
          onChangeText={setEmail}
          placeholder="anna@example.com"
          placeholderTextColor={c.fieldPh}
          autoCapitalize="none"
          keyboardType="email-address"
          autoFocus
        />
      </View>
      {touched && !emailValid && (
        <View style={S.authErrorRow}>
          <MI name="error" size={14} color={c.fieldError} />
          <Text style={S.authErrorTxt}>{tr('invalidEmail')}</Text>
        </View>
      )}

      {!!error && (
        <View style={S.authErrorRow}>
          <MI name="error" size={14} color={c.fieldError} />
          <Text style={S.authErrorTxt}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[S.authPrimaryBtn, !canSubmit && S.authPrimaryBtnDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color={c.authPrimaryText} />
          : <Text style={[S.authPrimaryBtnTxt, !canSubmit && S.authPrimaryBtnTxtDisabled]}>{tr('sendCodeBtn')}</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ── Reset password: new password entry (after the code is verified) ────────
function ResetPasswordScreen({ theme, toggleTheme, resetToken, onSuccess, onBack, lang }) {
  const c = COLORS[theme];
  const S = useMemo(() => makeStyles(c, theme), [c, theme]);
  const tr = (key, vars) => t(lang, key, vars);

  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword,    setShowPassword]    = useState(false);
  const [touched,         setTouched]         = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState('');

  const rules  = checkPasswordRules(password);
  const passed = passwordRulesPassed(rules);
  const tierColor = passed <= 1 ? c.fieldError : passed <= 3 ? c.warnColor : c.btnSaveText;
  const tierLabel = passed <= 1 ? tr('weakPassword') : passed <= 3 ? tr('mediumPassword') : tr('strongPassword');
  const passwordsMatch = password.length > 0 && password === confirmPassword;
  const canSubmit = passed === 4 && passwordsMatch && !loading;

  const requirements = [
    { key: 'minLength',  labelKey: 'reqMinLength' },
    { key: 'upperLower', labelKey: 'reqUpperLower' },
    { key: 'digit',      labelKey: 'reqDigit' },
    { key: 'special',    labelKey: 'reqSpecial' },
  ];

  const handleSubmit = async () => {
    setTouched(true);
    if (!canSubmit) return;
    setError('');
    setLoading(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resetToken, password }),
      });
      const data = await resp.json();
      if (resp.ok) {
        onSuccess();
      } else {
        setError(data.error || tr('resetPasswordFailedDefault'));
      }
    } catch {
      setError(tr('noServerConnection'));
    }
    setLoading(false);
  };

  return (
    <View style={S.authScreen}>
      <StatusBar style={c.statusBarStyle} />
      <View style={S.authHeaderRow}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <MI name="arrow-back" size={24} color={c.backIcon} />
        </TouchableOpacity>
        <Text style={S.authHeaderTitle}>{tr('newPasswordTitle')}</Text>
        <View style={{ marginLeft: 'auto' }}>
          <AuthThemeToggle theme={theme} toggleTheme={toggleTheme} c={c} S={S} />
        </View>
      </View>

      <Text style={[S.authSubtitle, { textAlign: 'left', marginBottom: 22 }]}>{tr('newPasswordSubtitle')}</Text>

      <Text style={S.authFieldLbl}>{tr('passwordLabel')}</Text>
      <View style={[S.authFieldBox, touched && passed < 4 && S.authFieldBoxError]}>
        <TextInput
          style={S.authFieldInput}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••••••"
          placeholderTextColor={c.fieldPh}
          secureTextEntry={!showPassword}
        />
        <TouchableOpacity onPress={() => setShowPassword(v => !v)} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
          <MI name={showPassword ? 'visibility' : 'visibility-off'} size={20} color={c.iconDim} />
        </TouchableOpacity>
      </View>

      <View style={S.strengthBarsRow}>
        {[0, 1, 2, 3].map(i => (
          <View key={i} style={[S.strengthBar, { backgroundColor: i < passed ? tierColor : c.authFieldBorder }]} />
        ))}
      </View>
      {!!password && <Text style={[S.strengthLabel, { color: tierColor }]}>{tierLabel}</Text>}

      <View style={S.reqList}>
        {requirements.map(r => {
          const met = rules[r.key];
          const show = !!password;
          return (
            <View key={r.key} style={S.reqRow}>
              <MI
                name={show ? (met ? 'check-circle' : 'cancel') : 'check-circle'}
                size={17}
                color={show ? (met ? c.btnSaveText : c.fieldError) : c.iconDim}
              />
              <Text style={[S.reqTxt, { color: show ? (met ? c.iconDim : c.fieldError) : c.iconDim }]}>
                {tr(r.labelKey)}
              </Text>
            </View>
          );
        })}
      </View>

      <Text style={S.authFieldLbl}>{tr('confirmPasswordLabel')}</Text>
      <View style={[S.authFieldBox, touched && !passwordsMatch && S.authFieldBoxError]}>
        <TextInput
          style={S.authFieldInput}
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          placeholder="••••••••••••"
          placeholderTextColor={c.fieldPh}
          secureTextEntry={!showPassword}
        />
      </View>
      {touched && !passwordsMatch && (
        <View style={S.authErrorRow}>
          <MI name="error" size={14} color={c.fieldError} />
          <Text style={S.authErrorTxt}>{tr('passwordsMismatch')}</Text>
        </View>
      )}

      {!!error && (
        <View style={S.authErrorRow}>
          <MI name="error" size={14} color={c.fieldError} />
          <Text style={S.authErrorTxt}>{error}</Text>
        </View>
      )}

      <TouchableOpacity
        style={[S.authPrimaryBtn, !canSubmit && S.authPrimaryBtnDisabled]}
        onPress={handleSubmit}
        disabled={loading}
      >
        {loading
          ? <ActivityIndicator color={c.authPrimaryText} />
          : <Text style={[S.authPrimaryBtnTxt, !canSubmit && S.authPrimaryBtnTxtDisabled]}>{tr('savePasswordBtn')}</Text>}
      </TouchableOpacity>
    </View>
  );
}

// ── Language picker sheet (shared: interface language + source language) ──
function LanguageSheet({ visible, onClose, options, selected, onSelect, title, c, S }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={S.overlay} activeOpacity={1} onPress={onClose}>
        <View style={S.sheet} onStartShouldSetResponder={() => true}>
          <View style={S.sheetHead}>
            <Text style={S.sheetTitle}>{title}</Text>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
              <MI name="close" size={22} color={c.sheetClose} />
            </TouchableOpacity>
          </View>
          <ScrollView style={S.sheetList} showsVerticalScrollIndicator={false}>
            {options.map(o => (
              <TouchableOpacity
                key={o.code}
                style={[S.sheetItem, selected === o.code && S.sheetItemOn]}
                onPress={() => { onSelect(o.code); onClose(); }}
              >
                <View style={[S.sheetItemLabel, S.langSheetItemLabel]}>
                  <Text style={[S.sheetItemTxt, selected === o.code && S.sheetItemTxtOn]}>{o.label}</Text>
                </View>
                {selected === o.code && <MI name="check" size={18} color={c.pinAccent} style={S.sheetCheckIcon} />}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

// ── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    MaterialIcons: require('@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.ttf'),
  });

  useEffect(() => {
    if (fontError) console.error('FONT ERROR:', fontError);
    if (fontsLoaded) console.log('FONT OK');
  }, [fontsLoaded, fontError]);

  // 'boot' while checking for a stored session, then one of
  // 'signin' | 'signup' | 'verify' | 'main' | 'history' | 'packs'
  const [screen,     setScreen]     = useState('boot');
  const [showMenu,   setShowMenu]   = useState(false);

  // Numeric (not flex:1) cap for the scenario create/edit form's scrollable
  // area — `sheet` only has maxHeight (hugs content, no fixed height), so a
  // flex:1 child has no determinate space to fill and collapses to zero.
  // A concrete pixel maxHeight sidesteps that: short content still hugs
  // (ScrollView sizes to content up to this cap), long content scrolls
  // internally while Отмена/Создать stay pinned below, always reachable.
  const { height: windowHeight } = useWindowDimensions();
  const formScrollMaxHeight = Math.round(windowHeight * 0.45);

  // ── Connectivity ─────────────────────────────────────────────────────────────
  // isOnlineRef mirrors isOnline for doTranslate/openScenarioPicker, which can
  // be called from stale closures (see scenarioIdRef precedent below).
  const [isOnline, setIsOnline] = useState(true);
  const isOnlineRef = useRef(true);
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const online = !!state.isConnected && state.isInternetReachable !== false;
      isOnlineRef.current = online;
      setIsOnline(online);
    });
    return unsubscribe;
  }, []);

  // ── Theme ───────────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState('dark');
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(THEME_KEY);
        if (saved === 'light' || saved === 'dark') setTheme(saved);
      } catch {}
    })();
  }, []);
  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      AsyncStorage.setItem(THEME_KEY, next).catch(() => {});
      return next;
    });
  };
  const c = COLORS[theme];
  const S = useMemo(() => makeStyles(c, theme), [c, theme]);

  // ── Interface language (chrome only — see i18n.js) ──────────────────────────
  const [interfaceLang, setInterfaceLang] = useState('ru');
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(INTERFACE_LANG_KEY);
        if (saved && INTERFACE_LANGUAGES.some(l => l.code === saved)) setInterfaceLang(saved);
      } catch {}
    })();
  }, []);
  const changeInterfaceLang = code => {
    setInterfaceLang(code);
    AsyncStorage.setItem(INTERFACE_LANG_KEY, code).catch(() => {});
  };
  const tr = (key, vars) => t(interfaceLang, key, vars);
  const [showInterfaceLangPicker, setShowInterfaceLangPicker] = useState(false);

  // ── Source language (Russian-bubble side; the other bubble is always Korean) ─
  const [sourceLang, setSourceLang] = useState('ru');
  const sourceLangRef = useRef('ru');
  useEffect(() => { sourceLangRef.current = sourceLang; }, [sourceLang]);
  useEffect(() => {
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(SOURCE_LANG_KEY);
        if (saved && SOURCE_LANGUAGES.some(l => l.code === saved)) setSourceLang(saved);
      } catch {}
    })();
  }, []);
  const changeSourceLang = code => {
    setSourceLang(code);
    AsyncStorage.setItem(SOURCE_LANG_KEY, code).catch(() => {});
  };
  const [showSourceLangPicker, setShowSourceLangPicker] = useState(false);

  // ── Auth ────────────────────────────────────────────────────────────────────
  const [authUser,     setAuthUser]     = useState(null);
  // JWT itself never needs to trigger a re-render (authUser already does that
  // for anything UI-visible) — a ref is enough, read by the /scenarios fetch
  // handlers below so scenario creation/edit/delete can send it.
  const authTokenRef = useRef(null);
  const [pendingVerify, setPendingVerify] = useState(null); // { userId, email }
  const [pendingReset, setPendingReset] = useState(null); // { userId, email } — forgot-password flow
  const [resetToken,   setResetToken]   = useState(null); // short-lived token from verify-reset-code
  const [authNotice,   setAuthNotice]   = useState(''); // one-shot banner shown on the sign-in screen
  // Guests skip login entirely and get straight to on-device translation —
  // no scenario context, since that requires an account (see openScenarioPicker).
  const [isGuest, setIsGuest] = useState(false);
  // Mirrors isGuest for doTranslate, which is read from the speech recognition
  // 'result' event callback and can otherwise close over a stale value
  // (same reasoning as scenarioIdRef/activeBubbleRef below).
  const isGuestRef = useRef(false);
  useEffect(() => { isGuestRef.current = isGuest; }, [isGuest]);

  const handleContinueAsGuest = () => {
    setIsGuest(true);
    setScreen('main');
  };

  const handleGuestSignIn = () => {
    setShowMenu(false);
    setIsGuest(false);
    setScreen('signin');
  };

  useEffect(() => {
    (async () => {
      let token = null;
      try { token = await AsyncStorage.getItem(AUTH_TOKEN_KEY); } catch {}
      if (!token) { setScreen('signin'); return; }
      try {
        // Without an explicit timeout, a fully offline device (no Wi-Fi, no
        // mobile data — exactly the case offline translation exists for)
        // leaves this fetch hanging on the OS route-lookup for a long time
        // instead of failing fast, stalling the boot screen indefinitely.
        const ctrl = new AbortController();
        const tid  = setTimeout(() => ctrl.abort(), 8000);
        const resp = await fetch(`${BACKEND_URL}/auth/me`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: ctrl.signal,
        });
        clearTimeout(tid);
        if (resp.ok) {
          const data = await resp.json();
          authTokenRef.current = token;
          setAuthUser(data.user);
          setScreen('main');
        } else {
          await AsyncStorage.removeItem(AUTH_TOKEN_KEY).catch(() => {});
          setScreen('signin');
        }
      } catch {
        // Can't confirm the token without the backend — assume it's still
        // good rather than force a re-login just because we're offline.
        authTokenRef.current = token;
        setScreen('main');
      }
    })();
  }, []);

  const handleAuthSuccess = async (token, user) => {
    authTokenRef.current = token;
    setAuthUser(user);
    setPendingVerify(null);
    try { await AsyncStorage.setItem(AUTH_TOKEN_KEY, token); } catch {}
    setScreen('main');
  };

  const handleLogout = async () => {
    setShowMenu(false);
    authTokenRef.current = null;
    setAuthUser(null);
    try { await AsyncStorage.removeItem(AUTH_TOKEN_KEY); } catch {}
    setScreen('signin');
  };

  // ── Scenarios (source of truth: backend) ───────────────────────────────────
  const [scenarios,   setScenarios]   = useState(FALLBACK_SCENARIOS);
  const [scenarioId,  setScenarioId]  = useState(null);
  const scenarioIdRef = useRef(scenarioId);
  useEffect(() => { scenarioIdRef.current = scenarioId; }, [scenarioId]);
  const scenario = scenarioName(interfaceLang, scenarios.find(s => s.id === scenarioId));

  // Scenario context requires an account (guests) and a live backend
  // (scenario prompts are fetched/edited server-side) — block the picker
  // and explain why instead of opening a sheet that can't do anything useful.
  // Uses a themed in-app card (scenarioNotice) instead of the native
  // Alert.alert, matching the rest of the app's dark/light design system.
  const [scenarioNotice, setScenarioNotice] = useState(null); // { title, text }
  const openScenarioPicker = () => {
    if (isGuest) {
      setScenarioNotice({ title: tr('scenarioNoticeAccountTitle'), text: tr('scenarioNoticeAccountText') });
      return;
    }
    if (!isOnline) {
      setScenarioNotice({ title: tr('scenarioNoticeOfflineTitle'), text: tr('scenarioNoticeOfflineText') });
      return;
    }
    setShowPicker(true);
  };

  const [pinnedIds, setPinnedIds] = useState([]);

  const [showPicker, setShowPicker] = useState(false);
  const [sheetView,  setSheetView]  = useState('list'); // 'list' | 'create' | 'edit'

  const [createName,    setCreateName]    = useState('');
  const [createPrompt,  setCreatePrompt]  = useState('');
  const [createSaving,  setCreateSaving]  = useState(false);
  const [createError,   setCreateError]   = useState('');

  const [editingScenario, setEditingScenario] = useState(null); // { id, name }
  const [editPrompt,      setEditPrompt]      = useState('');
  const [editLoading,     setEditLoading]     = useState(false);
  const [editSaving,      setEditSaving]      = useState(false);
  const [editError,       setEditError]       = useState('');

  const [deleteTarget, setDeleteTarget] = useState(null); // { id, name }
  const [pinToast,     setPinToast]     = useState(false);

  const [history, setHistory] = useState([]);
  const histRef = useRef([]);

  const [koRotated, setKoRotated] = useState(true);
  const koFlipAnim = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    Animated.timing(koFlipAnim, {
      toValue: koRotated ? 1 : 0,
      duration: 380,
      easing: Easing.inOut(Easing.ease),
      useNativeDriver: true,
    }).start();
  }, [koRotated]);
  // Mic icon spins flat (same as before, just smooth now).
  const koFlipIconRotate = koFlipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  // The bubble flips over the horizontal axis, like turning a card top-to-bottom.
  // A pure rotateX(180deg) only mirrors the content vertically (unreadable), so it's
  // paired with a rotateY that snaps 0deg -> 180deg at the exact midpoint (t = 0.5,
  // where rotateX = 90deg and the panel is edge-on/invisible, so the snap is unseen).
  // rotateY(180) + rotateX(180) composes to the same result as a plain rotate(180deg),
  // so the resting orientation (text, clear/TTS buttons) ends up exactly where it was
  // before — only the transition in between now swings through the horizontal axis.
  const koFlipBubbleX = koFlipAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });
  const koFlipBubbleY = koFlipAnim.interpolate({
    inputRange:  [0, 0.499, 0.5, 1],
    outputRange: ['0deg', '0deg', '180deg', '180deg'],
  });

  // null = neither selected; 'ru' | 'ko' = that side active
  const [activeBubble,  setActiveBubble]  = useState(null);
  const activeBubbleRef = useRef(null);

  const [ruText,      setRuText]      = useState('');
  const [koText,      setKoText]      = useState('');
  const [recognizing, setRecognizing] = useState(false);
  const [translating, setTranslating] = useState(false);

  // 'ru' → TextInput inside Russian bubble
  // 'ko' → overlay panel at physical top of screen (keyboard-from-top effect)
  const [typingBubble, setTypingBubble] = useState(null);
  // Mirrors typingBubble for the keyboardDidHide listener below, which is
  // registered once on mount and would otherwise close over a stale null.
  const typingBubbleRef = useRef(null);
  useEffect(() => { typingBubbleRef.current = typingBubble; }, [typingBubble]);

  // Prevents re-opening typing mode right after closing via onBlur (Russian bubble)
  const justClosedRef   = useRef(false);
  const justClosedTimer = useRef(null);

  const silenceTimer = useRef(null);

  // ── Connection test ──────────────────────────────────────────────────────
  const [connStatus, setConnStatus] = useState('idle'); // idle | checking | ok | bad
  const [connMsg,    setConnMsg]    = useState('');
  const connResetTimer = useRef(null);

  const testConnection = async () => {
    clearTimeout(connResetTimer.current);
    setConnStatus('checking');
    setConnMsg(tr('checking'));
    const started = Date.now();
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch(`${BACKEND_URL}/health`, { signal: ctrl.signal });
      clearTimeout(tid);
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.ok) {
        setConnStatus('ok');
        setConnMsg(tr('msSuffix', { ms: Date.now() - started }));
      } else {
        setConnStatus('bad');
        setConnMsg(tr('noConnection'));
      }
    } catch {
      setConnStatus('bad');
      setConnMsg(tr('noConnection'));
    }
    connResetTimer.current = setTimeout(() => setConnStatus('idle'), 2500);
  };

  // ── History ───────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(HISTORY_KEY);
        if (!raw) return;
        const cut  = Date.now() - HISTORY_TTL;
        const data = JSON.parse(raw).filter(i => i.timestamp > cut);
        histRef.current = data;
        setHistory(data);
      } catch {}
    })();
  }, []);

  const saveEntry = async entry => {
    const updated = [entry, ...histRef.current];
    histRef.current = updated;
    setHistory(updated);
    try { await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated)); } catch {}
  };

  // ── Scenarios: fetch from backend ───────────────────────────────────────────
  // /scenarios now requires a Bearer token for anything beyond the built-in
  // list (backend/scenarios.js is Supabase-backed, scoped by owner_id) — sent
  // whenever we have one, omitted for guests/logged-out (backend then only
  // returns built-ins, which is exactly what those callers should see).
  const authHeader = () => authTokenRef.current ? { Authorization: `Bearer ${authTokenRef.current}` } : {};

  const fetchScenarios = async () => {
    try {
      const resp = await fetch(`${BACKEND_URL}/scenarios`, { headers: authHeader() });
      const data = await resp.json();
      if (Array.isArray(data) && data.length) {
        setScenarios(data);
        return data;
      }
    } catch {}
    return null;
  };

  // Re-fetches whenever authUser changes (initial null → resolved user on
  // boot, or null → user on login, or user → null on logout) — not just once
  // on mount. Without this, the boot-time /auth/me check (async, network
  // round trip) races this effect: fetchScenarios sees authTokenRef.current
  // still null and fetches without the JWT, so it gets only the 8 built-ins,
  // and — since nothing ever re-triggered it — that's what stays in state
  // even after the token is confirmed and set, silently hiding every custom
  // scenario the logged-in user owns.
  useEffect(() => { fetchScenarios(); }, [authUser]);

  // ── Pinned scenarios (server-side, max 3) ───────────────────────────────────
  // Backed by users_scenarios_mapping via /scenarios/pinned + /scenarios/:id/pin
  // (backend/scenarios.js) so pins survive a reinstall/new device instead of
  // living only in this device's AsyncStorage. Pins are per-account, so
  // guests always see an empty list (fetchPinnedIds no-ops without a token);
  // re-fetched on the same authUser transitions as fetchScenarios, for the
  // same boot-race reason documented there.
  const fetchPinnedIds = async () => {
    if (!authTokenRef.current) { setPinnedIds([]); return; }
    try {
      const resp = await fetch(`${BACKEND_URL}/scenarios/pinned`, { headers: authHeader() });
      if (resp.ok) setPinnedIds(await resp.json());
    } catch {}
  };
  useEffect(() => { fetchPinnedIds(); }, [authUser]);

  // Optimistic toggle — flips local state immediately, reverts if the
  // backend call fails. scenario_id has `on delete cascade` on the mapping
  // table, so a deleted scenario's pin is cleaned up server-side on its own.
  const togglePin = async id => {
    if (pinnedIds.includes(id)) {
      setPinnedIds(prev => prev.filter(x => x !== id));
      try {
        const resp = await fetch(`${BACKEND_URL}/scenarios/${id}/pin`, { method: 'DELETE', headers: authHeader() });
        if (!resp.ok) setPinnedIds(prev => [...prev, id]);
      } catch {
        setPinnedIds(prev => [...prev, id]);
      }
      return;
    }
    if (pinnedIds.length >= MAX_PINNED) {
      setPinToast(true);
      setTimeout(() => setPinToast(false), 1500);
      return;
    }
    setPinnedIds(prev => [...prev, id]);
    try {
      const resp = await fetch(`${BACKEND_URL}/scenarios/${id}/pin`, { method: 'POST', headers: authHeader() });
      if (!resp.ok) setPinnedIds(prev => prev.filter(x => x !== id));
    } catch {
      setPinnedIds(prev => prev.filter(x => x !== id));
    }
  };

  // ── Scenario sheet: create / edit / delete ──────────────────────────────────
  const closePicker = () => {
    setShowPicker(false);
    setSheetView('list');
    setCreateName(''); setCreatePrompt(''); setCreateError('');
    setEditingScenario(null); setEditPrompt(''); setEditError('');
  };

  const handleCreateScenario = async () => {
    const name = createName.trim();
    const prompt = createPrompt.trim();
    if (!name || !prompt) { setCreateError(tr('fillBothFields')); return; }
    setCreateSaving(true);
    setCreateError('');
    try {
      const resp = await fetch(`${BACKEND_URL}/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ name, prompt }),
      });
      const data = await resp.json();
      if (resp.ok) {
        await fetchScenarios();
        setScenarioId(data.id);
        setCreateName(''); setCreatePrompt('');
        setSheetView('list');
      } else {
        setCreateError(data.error || tr('createFailedDefault'));
      }
    } catch {
      setCreateError(tr('noServerConnection'));
    }
    setCreateSaving(false);
  };

  const openEdit = async s => {
    setEditingScenario(s);
    setEditPrompt('');
    setEditError('');
    setSheetView('edit');
    setEditLoading(true);
    try {
      const resp = await fetch(`${BACKEND_URL}/scenarios/${s.id}`, { headers: authHeader() });
      const data = await resp.json();
      if (resp.ok) setEditPrompt(data.prompt || '');
      else setEditError(data.error || tr('loadPromptFailedDefault'));
    } catch {
      setEditError(tr('noServerConnection'));
    }
    setEditLoading(false);
  };

  const handleSaveEdit = async () => {
    const prompt = editPrompt.trim();
    if (!prompt || !editingScenario) return;
    setEditSaving(true);
    setEditError('');
    try {
      const resp = await fetch(`${BACKEND_URL}/scenarios/${editingScenario.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...authHeader() },
        body: JSON.stringify({ prompt }),
      });
      const data = await resp.json();
      if (resp.ok) {
        await fetchScenarios();
        setSheetView('list');
      } else {
        setEditError(data.error || tr('saveFailedDefault'));
      }
    } catch {
      setEditError(tr('noServerConnection'));
    }
    setEditSaving(false);
  };

  const handleDeleteScenario = async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    try {
      const resp = await fetch(`${BACKEND_URL}/scenarios/${id}`, { method: 'DELETE', headers: authHeader() });
      if (resp.ok || resp.status === 204) {
        const updated = await fetchScenarios();
        // Server-side cascade already drops the mapping row for the deleted
        // scenario (see backend/scenarios.js) — just mirror it locally.
        setPinnedIds(prev => prev.filter(x => x !== id));
        if (scenarioIdRef.current === id && updated?.length) setScenarioId(updated[0].id);
      }
    } catch {}
    setDeleteTarget(null);
  };

  const pinnedScenarios = scenarios.filter(s => pinnedIds.includes(s.id));
  const restScenarios   = scenarios.filter(s => !pinnedIds.includes(s.id));

  const renderScenarioRow = (s, isPinned) => (
    <View key={s.id} style={[S.sheetItem, scenarioId === s.id && S.sheetItemOn]}>
      <TouchableOpacity
        style={S.pinIconBtn}
        onPress={() => togglePin(s.id)}
        hitSlop={{ top: 8, right: 4, bottom: 8, left: 8 }}
      >
        <MI name="push-pin" size={16} color={isPinned ? c.pinAccent : c.pinOff} />
      </TouchableOpacity>
      <TouchableOpacity
        style={S.sheetItemLabel}
        onPress={() => { setScenarioId(s.id); closePicker(); }}
      >
        <Text style={[S.sheetItemTxt, scenarioId === s.id && S.sheetItemTxtOn]} numberOfLines={1}>
          {scenarioName(interfaceLang, s)}
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={S.sheetIconBtn}
        onPress={() => openEdit(s)}
        hitSlop={{ top: 8, right: 4, bottom: 8, left: 4 }}
      >
        <MI name="edit" size={17} color={c.editIcon} />
      </TouchableOpacity>
      {!s.builtIn && (
        <TouchableOpacity
          style={S.sheetIconBtn}
          onPress={() => setDeleteTarget({ id: s.id, name: s.name })}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 4 }}
        >
          <MI name="delete" size={18} color={c.deleteIcon} />
        </TouchableOpacity>
      )}
    </View>
  );

  // ── TTS ───────────────────────────────────────────────────────────────────
  const handleSpeak = (text, lang) => {
    Speech.stop();
    if (text) Speech.speak(text, { language: lang, rate: 0.85 });
  };

  useEffect(() => () => { Speech.stop(); }, []);

  // ── Silence timer ──────────────────────────────────────────────────────────
  const kickSilenceTimer = () => {
    clearTimeout(silenceTimer.current);
    silenceTimer.current = setTimeout(() => ExpoSpeechRecognitionModule.stop(), SILENCE_MS);
  };
  const killSilenceTimer = () => {
    clearTimeout(silenceTimer.current);
    silenceTimer.current = null;
  };

  // ── Speech events ──────────────────────────────────────────────────────────
  useSpeechRecognitionEvent('start', () => { setRecognizing(true); kickSilenceTimer(); });
  useSpeechRecognitionEvent('end',   () => { setRecognizing(false); killSilenceTimer(); });

  useSpeechRecognitionEvent('result', event => {
    const text   = event.results[0]?.transcript || '';
    const bubble = activeBubbleRef.current;
    if (bubble === 'ru') setRuText(text);
    else                 setKoText(text);

    if (!event.isFinal) {
      kickSilenceTimer();
    } else {
      killSilenceTimer();
      if (text) {
        const fromLang = bubble === 'ru' ? LANG_RU_NAME[sourceLangRef.current] : 'корейский';
        const toLang   = bubble === 'ru' ? 'корейский' : LANG_RU_NAME[sourceLangRef.current];
        doTranslate(text, fromLang, toLang, bubble);
      }
    }
  });

  useSpeechRecognitionEvent('error', () => { setRecognizing(false); killSilenceTimer(); });

  // ── Translation ────────────────────────────────────────────────────────────
  // Offline fallback: ML Kit translates directly between the bubble sides.
  // The Russian-bubble side uses whichever source language is currently
  // selected (sourceLangRef, see "Source language" above) — 'ko' is fixed for
  // the other side. No scenario context is applied (ML Kit has no concept of
  // a prompt), per the ask that offline mode work "without internet and
  // without context". Note: ML Kit's supported-language set does not include
  // Uzbek/Kazakh/Kyrgyz/Mongolian, so isModelDownloaded/translate will reject
  // those with ERR_MLKIT_TRANSLATE — same catch path as "pack not downloaded".
  const offlineTranslate = async (text, sourceBubble) => {
    const srcCode = sourceBubble === 'ru' ? sourceLangRef.current : 'ko';
    const tgtCode = sourceBubble === 'ru' ? 'ko' : sourceLangRef.current;
    const [sourceReady, targetReady] = await Promise.all([
      MlkitTranslate.isModelDownloaded(srcCode),
      MlkitTranslate.isModelDownloaded(tgtCode),
    ]);
    if (!sourceReady || !targetReady) {
      throw new Error('offline model not downloaded');
    }
    return MlkitTranslate.translate(text, srcCode, tgtCode);
  };

  const applyOfflineFallback = async (text, sourceBubble) => {
    try {
      const translation = await offlineTranslate(text, sourceBubble);
      if (sourceBubble === 'ru') setKoText(translation);
      else                       setRuText(translation);
      await saveEntry({
        id: String(Date.now()), originalText: text,
        translatedText: translation,
        direction: sourceBubble === 'ru' ? 'ru-ko' : 'ko-ru',
        scenarioId: scenarioIdRef.current,
        offline: true,
        timestamp: Date.now(),
      });
      const next = sourceBubble === 'ru' ? 'ko' : 'ru';
      setActiveBubble(next);
      activeBubbleRef.current = next;
    } catch {
      const msg = tr('offlineFallbackMsg');
      if (sourceBubble === 'ru') setKoText(msg); else setRuText(msg);
    }
  };

  // Walks histRef.current (newest-first, per saveEntry) for the given
  // scenario and returns only the current "session" — a contiguous run of
  // turns with no idle gap of CONTEXT_SESSION_GAP or more between them —
  // capped to the most recent MAX_CONTEXT_TURNS and returned oldest-first
  // for the prompt. An old conversation resumed after a long break is
  // deliberately excluded, even if it's still inside the 24h HISTORY_TTL.
  const getContextHistory = currentScenarioId => {
    const inSession = [];
    let prevTimestamp = Date.now();
    for (const entry of histRef.current) {
      if (entry.scenarioId !== currentScenarioId) continue;
      if (prevTimestamp - entry.timestamp >= CONTEXT_SESSION_GAP) break;
      inSession.push(entry);
      prevTimestamp = entry.timestamp;
      if (inSession.length >= MAX_CONTEXT_TURNS) break;
    }
    return inSession.reverse().map(e => ({
      original: e.originalText, translated: e.translatedText, direction: e.direction,
    }));
  };

  const doTranslate = async (text, fromLang, toLang, sourceBubble) => {
    setTranslating(true);
    if (!isOnlineRef.current) {
      // Known offline (NetInfo) — skip the network round trip entirely so
      // on-device translation lands in ~1s instead of waiting out the
      // backend timeout below before falling back.
      await applyOfflineFallback(text, sourceBubble);
      setTranslating(false);
      return;
    }
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 15000);
    try {
      // Context (scenario prompt + recent-turns history) only makes sense
      // when there's an actual scenario active — guests never have one
      // (context is always null for them), so there's nothing to build a
      // conversation session around either.
      const activeScenarioId = isGuestRef.current ? null : scenarioIdRef.current;
      const resp = await fetch(`${BACKEND_URL}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({
          text, fromLang, toLang,
          context: activeScenarioId,
          history: activeScenarioId ? getContextHistory(activeScenarioId) : [],
        }),
        signal: ctrl.signal,
      });
      clearTimeout(tid);
      const data = await resp.json();
      if (resp.ok && data.translation) {
        if (sourceBubble === 'ru') setKoText(data.translation);
        else                       setRuText(data.translation);
        await saveEntry({
          id: String(Date.now()), originalText: text,
          translatedText: data.translation,
          direction: sourceBubble === 'ru' ? 'ru-ko' : 'ko-ru',
          scenarioId: scenarioIdRef.current,
          timestamp: Date.now(),
        });
        const next = sourceBubble === 'ru' ? 'ko' : 'ru';
        setActiveBubble(next);
        activeBubbleRef.current = next;
      }
    } catch {
      // Backend unreachable/timed out — fall back to on-device translation
      // rather than just failing silently (hybrid mode from the roadmap).
      clearTimeout(tid);
      await applyOfflineFallback(text, sourceBubble);
    }
    setTranslating(false);
  };

  // ── Mic ───────────────────────────────────────────────────────────────────
  const handleMic = async bubble => {
    if (translating) return;
    if (typingBubble) { Keyboard.dismiss(); setTypingBubble(null); }

    if (recognizing) { ExpoSpeechRecognitionModule.stop(); return; }

    setActiveBubble(bubble);
    activeBubbleRef.current = bubble;

    const { granted } = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
    if (!granted) return;

    ExpoSpeechRecognitionModule.start({
      lang: bubble === 'ru' ? LANG_LOCALE[sourceLangRef.current] : 'ko-KR',
      interimResults: true,
      continuous: false,
    });
  };

  // ── Typing mode ────────────────────────────────────────────────────────────
  const closeTypingMode = useCallback(() => {
    setTypingBubble(null);
    clearTimeout(justClosedTimer.current);
    justClosedRef.current = true;
    justClosedTimer.current = setTimeout(() => { justClosedRef.current = false; }, 350);
  }, []);

  // Android's hardware back button (and some keyboards' own dismiss gesture)
  // hides the keyboard without blurring the focused TextInput, so the
  // TextInput's own onBlur never fires and typingBubble is left stuck at
  // 'ru' — the KO bubble/mic rows stay hidden even though the keyboard is
  // gone. Listening for the OS-level hide event closes typing mode
  // regardless of how the keyboard went away.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidHide', () => {
      if (typingBubbleRef.current) closeTypingMode();
    });
    return () => sub.remove();
  }, [closeTypingMode]);

  const handleBubbleTap = bubble => {
    if (recognizing || translating) return;

    if (justClosedRef.current) {
      if (activeBubble !== bubble) { setActiveBubble(bubble); activeBubbleRef.current = bubble; }
      return;
    }

    if (typingBubble) {
      Keyboard.dismiss();
      setTypingBubble(null);
      if (typingBubble !== bubble) { setActiveBubble(bubble); activeBubbleRef.current = bubble; }
      return;
    }

    if (activeBubble === bubble) {
      setTypingBubble(bubble);
    } else {
      setActiveBubble(bubble);
      activeBubbleRef.current = bubble;
    }
  };

  const handleRuSubmit = () => {
    const text = ruText.trim();
    closeTypingMode();
    Keyboard.dismiss();
    if (text) doTranslate(text, LANG_RU_NAME[sourceLangRef.current], 'корейский', 'ru');
  };

  const handleKoSubmit = () => {
    const text = koText.trim();
    Keyboard.dismiss();
    closeTypingMode();
    if (text) doTranslate(text, 'корейский', LANG_RU_NAME[sourceLangRef.current], 'ko');
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  // Show "wait" placeholder in the OPPOSITE bubble while the other person records
  const ruShowWait = recognizing && activeBubble === 'ko';
  const koShowWait = recognizing && activeBubble === 'ru';

  const ruPlaceholder = (ruShowWait || activeBubble === 'ko') ? tr('phRuWait') : tr('phRu');
  const koPlaceholder = activeBubble === 'ko' ? PH_KO_ACTIVE : PH_KO_WAIT;

  const micRecording = bubble => recognizing && activeBubble === bubble;

  if (screen === 'boot') {
    return (
      <View style={[S.authScreen, { alignItems: 'center', justifyContent: 'center' }]}>
        <StatusBar style={c.statusBarStyle} />
        <ActivityIndicator color={c.linkColor} size="large" />
      </View>
    );
  }

  if (screen === 'signin') {
    return (
      <SignInScreen
        theme={theme}
        toggleTheme={toggleTheme}
        onSuccess={handleAuthSuccess}
        onNeedsVerification={(userId, email) => { setPendingVerify({ userId, email }); setScreen('verify'); }}
        onGoToSignUp={() => setScreen('signup')}
        onGuest={handleContinueAsGuest}
        onForgotPassword={() => setScreen('forgotPassword')}
        notice={authNotice}
        onConsumeNotice={() => setAuthNotice('')}
        lang={interfaceLang}
        onChangeLang={changeInterfaceLang}
      />
    );
  }

  if (screen === 'signup') {
    return (
      <SignUpScreen
        theme={theme}
        toggleTheme={toggleTheme}
        onNeedsVerification={(userId, email) => { setPendingVerify({ userId, email }); setScreen('verify'); }}
        onGoToSignIn={() => setScreen('signin')}
        lang={interfaceLang}
        onChangeLang={changeInterfaceLang}
      />
    );
  }

  if (screen === 'verify' && pendingVerify) {
    return (
      <VerifyCodeScreen
        theme={theme}
        userId={pendingVerify.userId}
        email={pendingVerify.email}
        onSuccess={data => handleAuthSuccess(data.token, data.user)}
        onBack={() => { setPendingVerify(null); setScreen('signin'); }}
        lang={interfaceLang}
      />
    );
  }

  if (screen === 'forgotPassword') {
    return (
      <ForgotPasswordScreen
        theme={theme}
        toggleTheme={toggleTheme}
        onCodeSent={(userId, email) => { setPendingReset({ userId, email }); setScreen('resetVerify'); }}
        onNeedsVerification={(userId, email) => { setPendingVerify({ userId, email }); setScreen('verify'); }}
        onBack={() => setScreen('signin')}
        lang={interfaceLang}
      />
    );
  }

  if (screen === 'resetVerify' && pendingReset) {
    return (
      <VerifyCodeScreen
        theme={theme}
        userId={pendingReset.userId}
        email={pendingReset.email}
        verifyEndpoint="/auth/verify-reset-code"
        resendEndpoint="/auth/resend-reset-code"
        onSuccess={data => { setResetToken(data.resetToken); setScreen('resetNewPassword'); }}
        onBack={() => { setPendingReset(null); setScreen('signin'); }}
        lang={interfaceLang}
      />
    );
  }

  if (screen === 'resetNewPassword' && resetToken) {
    return (
      <ResetPasswordScreen
        theme={theme}
        toggleTheme={toggleTheme}
        resetToken={resetToken}
        onSuccess={() => {
          setPendingReset(null);
          setResetToken(null);
          setAuthNotice(tr('passwordChangedNotice'));
          setScreen('signin');
        }}
        onBack={() => { setResetToken(null); setScreen('signin'); }}
        lang={interfaceLang}
      />
    );
  }

  if (screen === 'history') {
    return (
      <HistoryScreen
        history={history}
        scenarios={scenarios}
        initialScenarioId={scenarioId}
        onBack={() => setScreen('main')}
        theme={theme}
        lang={interfaceLang}
      />
    );
  }

  if (screen === 'packs') {
    return <LanguagePacksScreen theme={theme} onBack={() => setScreen('main')} lang={interfaceLang} sourceLang={sourceLang} />;
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={S.root}>
      <StatusBar style={c.statusBarStyle} />

      <KeyboardAvoidingView
        style={[S.kav, typingBubble === 'ru' && S.kavTypingRu]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Korean mic — physically at very top ──
             Hidden while typing into the RU bubble: the Korean side is
             irrelevant mid-typing, and hiding it (plus its bubble below)
             lets the RU bubble grow into that space for long text. */}
        {typingBubble !== 'ru' && (
          <View style={S.koMicRow}>
            <TouchableOpacity
              style={[S.micBtn, micRecording('ko') && S.micBtnRec, translating && S.micBtnDim]}
              onPress={() => handleMic('ko')}
              disabled={translating}
            >
              <AnimatedMI
                name={micRecording('ko') ? 'stop' : 'mic'}
                size={26} color={micRecording('ko') ? c.micRecIcon : c.micIcon}
                style={{ transform: [{ rotate: koFlipIconRotate }] }}
              />
            </TouchableOpacity>
            <TouchableOpacity style={S.flipBtn} onPress={() => setKoRotated(r => !r)}>
              <MI name="screen-rotation" size={20} color={c.iconMid} />
            </TouchableOpacity>
          </View>
        )}

        {/* ── Korean bubble (rotated 180° for face-to-face) — flips over the
             horizontal axis, like a card turning top-to-bottom ── */}
        {typingBubble !== 'ru' && (
          <AnimatedTouchable
            style={[
              S.bubble,
              activeBubble === 'ko' && S.bubbleActive,
              { transform: [{ perspective: 1000 }, { rotateY: koFlipBubbleY }, { rotateX: koFlipBubbleX }] },
            ]}
            onPress={() => handleBubbleTap('ko')}
            activeOpacity={0.95}
          >
            <View style={S.bubbleBody}>
              {translating && activeBubble === 'ru' ? (
                <ActivityIndicator color={c.testChecking} size="large" />
              ) : koShowWait ? (
                <Text style={S.bubbleWaitPh}>{PH_KO_WAIT}</Text>
              ) : koText ? (
                <ScrollView contentContainerStyle={S.bubbleScroll} showsVerticalScrollIndicator={false}>
                  <Text style={S.bubbleTxt}>{koText}</Text>
                </ScrollView>
              ) : (
                <Text style={S.bubblePh}>{koPlaceholder}</Text>
              )}
            </View>
            {/* clear — top-right in rotated space */}
            <TouchableOpacity
              style={S.clearBtn}
              onPress={() => setKoText('')}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <MI name="close" size={16} color={c.iconDim} />
            </TouchableOpacity>
            {/* TTS — top-left in rotated space */}
            <TouchableOpacity
              style={[S.ttsBtn, !koText && S.ttsBtnDim]}
              onPress={() => handleSpeak(koText, 'ko-KR')}
              disabled={!koText}
              hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
            >
              <MI name="volume-up" size={16} color={c.iconMid} />
            </TouchableOpacity>
          </AnimatedTouchable>
        )}

        {/* ── Gutter: scenario + history between bubbles ── */}
        <View style={S.gutter}>
          <TouchableOpacity style={S.scenBtn} onPress={openScenarioPicker}>
            <Text style={S.scenTxt} numberOfLines={1}>{isGuest ? tr('noScenarioGuest') : (scenario || tr('noScenarioSelected'))}</Text>
            <MI name="expand-more" size={20} color={c.iconDim} />
          </TouchableOpacity>
          <TouchableOpacity style={S.histBtn} onPress={() => setScreen('history')}>
            <MI name="history" size={20} color={c.iconMid} />
          </TouchableOpacity>
        </View>

        {/* ── Russian bubble ── */}
        <TouchableOpacity
          style={[S.bubble, activeBubble === 'ru' && S.bubbleActive]}
          onPress={() => handleBubbleTap('ru')}
          activeOpacity={0.95}
        >
          <View style={S.bubbleBody}>
            {translating && activeBubble === 'ko' ? (
              <ActivityIndicator color={c.testChecking} size="large" />
            ) : ruShowWait ? (
              <Text style={S.bubbleWaitPh}>{tr('phRuWait')}</Text>
            ) : typingBubble === 'ru' ? (
              <TextInput
                value={ruText}
                onChangeText={setRuText}
                autoFocus
                multiline
                blurOnSubmit
                returnKeyType="done"
                onSubmitEditing={handleRuSubmit}
                onBlur={closeTypingMode}
                style={S.bubbleInput}
                placeholder={ruPlaceholder}
                placeholderTextColor={c.bubbleInputPh}
                textAlignVertical="center"
                textAlign="center"
              />
            ) : ruText ? (
              <ScrollView contentContainerStyle={S.bubbleScroll} showsVerticalScrollIndicator={false}>
                <Text style={S.bubbleTxt}>{ruText}</Text>
              </ScrollView>
            ) : (
              <Text style={S.bubblePh}>{ruPlaceholder}</Text>
            )}
          </View>
          {/* clear */}
          <TouchableOpacity
            style={S.clearBtn}
            onPress={() => setRuText('')}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <MI name="close" size={16} color={c.iconDim} />
          </TouchableOpacity>
          {/* TTS */}
          <TouchableOpacity
            style={[S.ttsBtn, !ruText && S.ttsBtnDim]}
            onPress={() => handleSpeak(ruText, LANG_LOCALE[sourceLang])}
            disabled={!ruText}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <MI name="volume-up" size={16} color={c.iconMid} />
          </TouchableOpacity>
          {/* Source-language selector — lives inside the speaker's own bubble
              (bottom-left corner) rather than the control row below, since it's
              a property of that bubble's content, same reasoning as clear/TTS. */}
          <TouchableOpacity style={S.langBtn} onPress={() => setShowSourceLangPicker(true)}>
            <Text style={S.langBtnTxt}>{sourceLang.toUpperCase()}</Text>
            <MI name="expand-more" size={14} color={c.iconDim} />
          </TouchableOpacity>
        </TouchableOpacity>

        {/* ── Russian mic — physically at bottom ──
             Hidden while typing: recording and typing are mutually exclusive
             input modes, and hiding this row gives the RU bubble above the
             full remaining height for comfortable long-text editing. */}
        {typingBubble !== 'ru' && (
          <View style={S.ruMicRow}>
            <TouchableOpacity
              style={[S.micBtn, micRecording('ru') && S.micBtnRec, translating && S.micBtnDim]}
              onPress={() => handleMic('ru')}
              disabled={translating}
            >
              <MI
                name={micRecording('ru') ? 'stop' : 'mic'}
                size={26} color={micRecording('ru') ? c.micRecIcon : c.micIcon}
              />
            </TouchableOpacity>

            {/* Test connection — kept in the corner, away from the mic, so it can't be hit by accident */}
            <TouchableOpacity
              style={[
                S.testBtn,
                connStatus === 'ok'       && S.testBtnOk,
                connStatus === 'bad'      && S.testBtnBad,
                connStatus === 'checking' && S.testBtnChecking,
              ]}
              onPress={testConnection}
              disabled={connStatus === 'checking'}
            >
              <MI
                name="network-check"
                size={16}
                color={
                  connStatus === 'ok'       ? c.testOk :
                  connStatus === 'bad'      ? c.testBad :
                  connStatus === 'checking' ? c.testChecking : c.testIconIdle
                }
              />
              {connStatus !== 'idle' && (
                <View style={S.testPill}>
                  <Text
                    numberOfLines={1}
                    style={[
                      S.testPillTxt,
                      connStatus === 'ok'  && S.testPillOk,
                      connStatus === 'bad' && S.testPillBad,
                    ]}
                  >
                    {connMsg}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>

      {/* ── Menu button — physical top-left corner ── */}
      <TouchableOpacity style={S.menuBtn} onPress={() => setShowMenu(true)}>
        <MI name="menu" size={20} color={c.iconMid} />
      </TouchableOpacity>

      {/* ── Menu drawer ──────────────────────────────────────────────────────── */}
      {showMenu && (
        <TouchableOpacity
          style={S.menuScrim}
          activeOpacity={1}
          onPress={() => setShowMenu(false)}
        >
          <View style={S.menuDrawer} onStartShouldSetResponder={() => true}>
            <Text style={S.menuBrand}>{tr('appBrand')}</Text>
            <Text style={S.menuSub}>{isGuest ? tr('guestLabel') : (authUser?.email || BACKEND_URL.replace('http://', ''))}</Text>

            <TouchableOpacity style={S.menuItem} onPress={() => { setShowMenu(false); openScenarioPicker(); }}>
              <MI name="list" size={20} color={c.menuIcon} />
              <Text style={S.menuItemTxt}>{tr('menuScenarios')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.menuItem} onPress={() => { setShowMenu(false); setScreen('history'); }}>
              <MI name="history" size={20} color={c.menuIcon} />
              <Text style={S.menuItemTxt}>{tr('menuHistory')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.menuItem} onPress={() => { setShowMenu(false); testConnection(); }}>
              <MI name="network-check" size={20} color={c.menuIcon} />
              <Text style={S.menuItemTxt}>{tr('menuTestConnection')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.menuItem} onPress={() => { setShowMenu(false); setScreen('packs'); }}>
              <MI name="download" size={20} color={c.menuIcon} />
              <Text style={S.menuItemTxt}>{tr('menuLanguagePacks')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.menuItem} onPress={() => { setShowMenu(false); setShowInterfaceLangPicker(true); }}>
              <MI name="language" size={20} color={c.menuIcon} />
              <Text style={S.menuItemTxt}>{tr('menuInterfaceLanguage')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[S.menuItem, S.menuItemDivider]} onPress={() => { setShowMenu(false); toggleTheme(); }}>
              <MI name={theme === 'dark' ? 'light-mode' : 'dark-mode'} size={20} color={c.themeToggleIcon} />
              <Text style={S.menuItemTxt}>{theme === 'dark' ? tr('lightTheme') : tr('darkTheme')}</Text>
            </TouchableOpacity>
            {/* Not in the design (its menu drawer wasn't updated for a logged-in
                state) — added because without it there'd be no way to log out. */}
            {isGuest ? (
              <TouchableOpacity style={S.menuItem} onPress={handleGuestSignIn}>
                <MI name="login" size={20} color={c.menuIcon} />
                <Text style={S.menuItemTxt}>{tr('menuLogin')}</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={S.menuItem} onPress={handleLogout}>
                <MI name="logout" size={20} color={c.menuIcon} />
                <Text style={S.menuItemTxt}>{tr('menuLogout')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      )}

      {/* ── Interface language picker ── */}
      <LanguageSheet
        visible={showInterfaceLangPicker}
        onClose={() => setShowInterfaceLangPicker(false)}
        options={INTERFACE_LANGUAGES}
        selected={interfaceLang}
        onSelect={changeInterfaceLang}
        title={tr('menuInterfaceLanguage')}
        c={c} S={S}
      />

      {/* ── Source-bubble language picker ── */}
      <LanguageSheet
        visible={showSourceLangPicker}
        onClose={() => setShowSourceLangPicker(false)}
        options={SOURCE_LANGUAGES}
        selected={sourceLang}
        onSelect={changeSourceLang}
        title={tr('sourceLanguage')}
        c={c} S={S}
      />

      {/* ── Scenario-unavailable notice (themed, replaces Alert.alert) ── */}
      {scenarioNotice && (
        <View style={S.noticeScrim}>
          <View style={S.confirmCard}>
            <Text style={S.confirmTitle}>{scenarioNotice.title}</Text>
            <Text style={S.confirmText}>{scenarioNotice.text}</Text>
            <TouchableOpacity style={S.noticeBtn} onPress={() => setScenarioNotice(null)}>
              <Text style={S.btnSaveTxt}>{tr('ok')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── Korean typing overlay ─────────────────────────────────────────────
          Appears at the PHYSICAL TOP of the screen (Korean person's side).
          The panel slides from the top so the Korean person can type without
          flipping the phone. The system keyboard appears at the bottom; the
          Korean person reads their text at the top panel nearest to them.     */}
      {typingBubble === 'ko' && (
        <TouchableOpacity
          style={S.koBackdrop}
          activeOpacity={1}
          onPress={() => { Keyboard.dismiss(); closeTypingMode(); }}
        >
          <View style={S.koPanel} onStartShouldSetResponder={() => true}>
            <Text style={S.koPanelHint}>한국어 텍스트 입력 · Enter로 전송</Text>
            <TextInput
              value={koText}
              onChangeText={setKoText}
              autoFocus
              multiline
              blurOnSubmit
              returnKeyType="done"
              onSubmitEditing={handleKoSubmit}
              style={S.koPanelInput}
              placeholder="텍스트를 입력하세요..."
              placeholderTextColor={c.koPanelPh}
              textAlignVertical="center"
              textAlign="center"
            />
          </View>
        </TouchableOpacity>
      )}

      {/* ── Scenario picker sheet ─────────────────────────────────────────── */}
      <Modal
        visible={showPicker}
        transparent
        animationType="slide"
        onRequestClose={closePicker}
      >
        <TouchableOpacity style={S.overlay} activeOpacity={1} onPress={closePicker}>
          <View style={S.sheet} onStartShouldSetResponder={() => true}>

            {sheetView === 'list' && (
              <>
                <View style={S.sheetHead}>
                  <Text style={S.sheetTitle}>{tr('scenarioSheetTitle')}</Text>
                  <TouchableOpacity onPress={closePicker} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <MI name="close" size={22} color={c.sheetClose} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[S.sheetItem, scenarioId === null && S.sheetItemOn]}
                  onPress={() => { setScenarioId(null); closePicker(); }}
                >
                  <View style={S.pinIconBtn} />
                  <View style={S.sheetItemLabel}>
                    <Text style={[S.sheetItemTxt, scenarioId === null && S.sheetItemTxtOn]}>{tr('noScenarioTab')}</Text>
                  </View>
                  {scenarioId === null && <MI name="check" size={18} color={c.pinAccent} style={S.sheetCheckIcon} />}
                </TouchableOpacity>

                <ScrollView style={S.sheetList} showsVerticalScrollIndicator={false}>
                  {pinnedScenarios.length > 0 && (
                    <>
                      <View style={S.sheetSectionLbl}>
                        <MI name="push-pin" size={12} color={c.pinAccent} />
                        <Text style={[S.sheetSectionLblTxt, { color: c.pinAccent }]}>{tr('pinnedSection', { n: pinnedScenarios.length, max: MAX_PINNED })}</Text>
                      </View>
                      {pinnedScenarios.map(s => renderScenarioRow(s, true))}
                    </>
                  )}
                  {restScenarios.length > 0 && (
                    <>
                      <Text style={S.sheetSectionPlainTxt}>{tr('restSection')}</Text>
                      {restScenarios.map(s => renderScenarioRow(s, false))}
                    </>
                  )}
                </ScrollView>

                {pinToast && <Text style={S.pinToast}>{tr('pinLimitToast', { max: MAX_PINNED })}</Text>}

                <TouchableOpacity style={S.addBtn} onPress={() => setSheetView('create')}>
                  <MI name="add" size={20} color={c.iconDim} />
                  <Text style={S.addBtnTxt}>{tr('addScenario')}</Text>
                </TouchableOpacity>
              </>
            )}

            {sheetView === 'create' && (
              <>
                <View style={S.subHead}>
                  <TouchableOpacity onPress={() => setSheetView('list')} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <MI name="arrow-back" size={22} color={c.backIcon} />
                  </TouchableOpacity>
                  <Text style={S.subHeadTitle}>{tr('newScenario')}</Text>
                </View>

                {/* Scrollable so a long prompt (up to 4000 chars) can't push the
                    Отмена/Создать buttons below the sheet's 82%-max-height and
                    out of reach — see the bug this fixed. */}
                <ScrollView style={[S.formScroll, { maxHeight: formScrollMaxHeight }]} keyboardShouldPersistTaps="handled">
                  <Text style={S.fieldLbl}>{tr('nameLabel')}</Text>
                  <TextInput
                    style={S.fieldInput}
                    value={createName}
                    onChangeText={setCreateName}
                    placeholder={tr('namePlaceholder')}
                    placeholderTextColor={c.fieldPh}
                  />

                  <Text style={S.fieldLbl}>{tr('promptLabel')}</Text>
                  <TextInput
                    style={S.fieldTextarea}
                    value={createPrompt}
                    onChangeText={setCreatePrompt}
                    placeholder={tr('promptPlaceholder')}
                    placeholderTextColor={c.fieldPh}
                    multiline
                    textAlignVertical="top"
                  />

                  {!!createError && <Text style={S.fieldError}>{createError}</Text>}
                </ScrollView>

                <View style={S.formActions}>
                  <TouchableOpacity style={S.btnNeutral} onPress={() => setSheetView('list')} disabled={createSaving}>
                    <Text style={S.btnNeutralTxt}>{tr('cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.btnSave} onPress={handleCreateScenario} disabled={createSaving}>
                    {createSaving
                      ? <ActivityIndicator color={c.btnSaveText} size="small" />
                      : <Text style={S.btnSaveTxt}>{tr('create')}</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {sheetView === 'edit' && editingScenario && (
              <>
                <View style={S.subHead}>
                  <TouchableOpacity onPress={() => setSheetView('list')} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <MI name="arrow-back" size={22} color={c.backIcon} />
                  </TouchableOpacity>
                  <Text style={S.subHeadTitle} numberOfLines={1}>{scenarioName(interfaceLang, editingScenario)}</Text>
                </View>

                <ScrollView style={[S.formScroll, { maxHeight: formScrollMaxHeight }]} keyboardShouldPersistTaps="handled">
                  <Text style={S.fieldLbl}>{tr('promptLabel')}</Text>
                  {editLoading ? (
                    <ActivityIndicator color={c.testChecking} style={{ marginVertical: 20 }} />
                  ) : (
                    <TextInput
                      style={[S.fieldTextarea, { minHeight: 180 }]}
                      value={editPrompt}
                      onChangeText={setEditPrompt}
                      multiline
                      textAlignVertical="top"
                      placeholderTextColor={c.fieldPh}
                    />
                  )}

                  {!!editError && <Text style={S.fieldError}>{editError}</Text>}
                </ScrollView>

                <View style={S.formActions}>
                  <TouchableOpacity style={S.btnNeutral} onPress={() => setSheetView('list')} disabled={editSaving}>
                    <Text style={S.btnNeutralTxt}>{tr('cancel')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.btnSave} onPress={handleSaveEdit} disabled={editSaving || editLoading}>
                    {editSaving
                      ? <ActivityIndicator color={c.btnSaveText} size="small" />
                      : <Text style={S.btnSaveTxt}>{tr('save')}</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {deleteTarget && (
              <View style={S.confirmScrim}>
                <View style={S.confirmCard}>
                  <Text style={S.confirmTitle}>{tr('deleteScenarioTitle')}</Text>
                  <Text style={S.confirmText}>
                    {tr('deleteScenarioText', { name: scenarioName(interfaceLang, deleteTarget) })}
                  </Text>
                  <View style={S.formActions}>
                    <TouchableOpacity style={S.btnNeutral} onPress={() => setDeleteTarget(null)}>
                      <Text style={S.btnNeutralTxt}>{tr('no')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={S.btnDanger} onPress={handleDeleteScenario}>
                      <Text style={S.btnDangerTxt}>{tr('yes')}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}

          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
// Built from the color tokens above so dark/light only ever differ in `c`.
// Layout numbers (sizes, padding, radii) are identical in both themes.
function makeStyles(c, theme) {
  return StyleSheet.create({
  root: { flex: 1, backgroundColor: c.bg },
  kav:  { flex: 1, paddingTop: 48, paddingBottom: 12 },
  // With the KO mic row + bubble hidden (typing into the RU bubble), the
  // gutter (scenario selector) becomes the KAV's first child and lands
  // directly under the floating menu button (absolute, top:58, height:36,
  // so it occupies y 58–94) — this pushes it down clear of that overlap.
  kavTypingRu: { paddingTop: 100 },

  // Menu button + drawer
  menuBtn: {
    position: 'absolute', top: 58, left: 14, zIndex: 20, elevation: 6,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: c.ctrlBg, borderWidth: 1, borderColor: c.ctrlBorder,
    justifyContent: 'center', alignItems: 'center',
    ...shadow(theme, SHADOW_SM),
  },
  menuScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: c.scrimLight, zIndex: 90, elevation: 20,
  },
  menuDrawer: {
    width: '74%', height: '100%', backgroundColor: c.menuDrawerBg,
    borderRightWidth: 1, borderRightColor: c.menuDrawerBorder,
    paddingTop: 56, paddingHorizontal: 18,
    ...shadow(theme, SHADOW_LG),
  },
  menuBrand: { color: c.menuBrand, fontSize: 16, fontWeight: '700' },
  menuSub:   { color: c.menuSub, fontSize: 11, marginTop: 2, marginBottom: 20 },
  menuItem:  { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  menuItemDivider: { borderTopWidth: 1, borderTopColor: c.menuDivider, marginTop: 6 },
  menuItemTxt: { color: c.menuText, fontSize: 15 },

  // Mic rows
  koMicRow: { height: 58, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  ruMicRow: { height: 58, justifyContent: 'center', alignItems: 'center', position: 'relative' },

  // Flip button
  flipBtn: {
    position: 'absolute', right: 14,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: c.ctrlBg, borderWidth: 1, borderColor: c.ctrlBorder,
    justifyContent: 'center', alignItems: 'center',
    ...shadow(theme, SHADOW_SM),
  },
  micBtn: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: c.micBg, borderWidth: 2, borderColor: c.micBorder,
    justifyContent: 'center', alignItems: 'center',
    ...shadow(theme, SHADOW_SM),
  },
  micBtnRec: { backgroundColor: c.micRecBg, borderColor: c.micRecBorder },
  micBtnDim: { opacity: c.micDimOpacity },

  // Test connection button — offset into the corner so it can't be hit by accident
  testBtn: {
    position: 'absolute', right: 14,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: c.ctrlBg, borderWidth: 1.5, borderColor: c.testBorder,
    justifyContent: 'center', alignItems: 'center',
    ...shadow(theme, SHADOW_SM),
  },
  testBtnOk:       { borderColor: c.testOk },
  testBtnBad:      { borderColor: c.testBad },
  testBtnChecking: { borderColor: c.testChecking },
  testPill: {
    // Fixed width anchored to the button's right edge — an absolutely
    // positioned pill with only `alignSelf: 'center'` and no explicit width
    // gets measured against the 34px button and wraps the text one letter
    // per line instead of rendering it horizontally.
    position: 'absolute', bottom: '100%', right: 0, marginBottom: 6, width: 120,
    alignItems: 'center',
    backgroundColor: c.pillBg, borderWidth: 1, borderColor: c.pillBorder, borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
    ...shadow(theme, SHADOW_SM),
  },
  testPillTxt: { fontSize: 10, color: c.pillText, textAlign: 'center' },
  testPillOk:  { color: c.testOk },
  testPillBad: { color: c.testBad },

  // Bubbles
  bubble: {
    flex: 1, marginHorizontal: 14, marginVertical: 8,
    backgroundColor: c.bubbleBg,
    borderRadius: 20, borderWidth: 2, borderColor: c.bubbleBorder,
    overflow: 'hidden',
    ...shadow(theme, SHADOW_MD),
  },
  bubbleActive: { borderColor: c.bubbleBorderActive },
  bubbleBody: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: 18,
  },
  bubbleScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  bubbleTxt: { color: c.textStrong, fontSize: 22, lineHeight: 34, textAlign: 'center' },
  bubblePh:  { color: c.textPlaceholder, fontSize: 15, lineHeight: 25, textAlign: 'center' },
  // "Waiting" placeholder is slightly more visible than normal placeholder
  bubbleWaitPh: { color: c.textWaitPlaceholder, fontSize: 16, lineHeight: 26, textAlign: 'center' },
  bubbleInput: {
    color: c.textStrong, fontSize: 20, lineHeight: 30,
    textAlign: 'center', width: '100%', flex: 1,
  },

  // Buttons inside bubble
  clearBtn: {
    position: 'absolute', top: 10, right: 12,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: c.chipInsetBg, justifyContent: 'center', alignItems: 'center',
  },
  ttsBtn: {
    position: 'absolute', top: 10, left: 12,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: c.chipInsetBg, justifyContent: 'center', alignItems: 'center',
  },
  ttsBtnDim: { opacity: c.ttsDimOpacity },

  // Source-language selector — bottom-left corner of the speaker's own bubble
  // (only the Russian/source bubble renders this; Korean's side is fixed).
  langBtn: {
    position: 'absolute', bottom: 10, left: 12,
    minHeight: 28, paddingHorizontal: 10, borderRadius: 14,
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: c.chipInsetBg, justifyContent: 'center',
  },
  langBtnTxt: { color: c.iconMid, fontSize: 12, fontWeight: '700' },

  // Gutter between bubbles
  gutter: {
    height: 54, flexDirection: 'row',
    alignItems: 'center', paddingHorizontal: 14, gap: 10,
  },
  scenBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: c.scenBg, borderRadius: 12,
    borderWidth: 1, borderColor: c.scenBorder,
    paddingHorizontal: 14, height: 38,
    ...shadow(theme, SHADOW_MD),
  },
  scenTxt:  { color: c.scenText, fontSize: 14, flex: 1, marginRight: 6 },
  histBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: c.ctrlBg, justifyContent: 'center', alignItems: 'center',
    ...shadow(theme, SHADOW_SM),
  },

  // Korean typing overlay — appears at physical top so Korean person
  // can type without flipping the phone
  koBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: c.koBackdrop,
    zIndex: 100,
  },
  koPanel: {
    backgroundColor: c.koPanelBg,
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    paddingTop: 56, paddingBottom: 28, paddingHorizontal: 24,
    minHeight: 190,
    justifyContent: 'flex-end',
    elevation: 12,
    ...shadow(theme, SHADOW_LG),
  },
  koPanelHint: {
    color: c.koPanelHint, fontSize: 12, textAlign: 'center', marginBottom: 14,
  },
  koPanelInput: {
    color: c.textStrong, fontSize: 22, lineHeight: 32,
    textAlign: 'center', minHeight: 60,
    textAlignVertical: 'center',
  },

  // History screen
  histCont:  { flex: 1, backgroundColor: c.bg, paddingTop: 48 },
  histHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 14, paddingTop: 10,
    borderBottomWidth: 1, borderBottomColor: c.histHeaderBorder,
  },
  backBtn:   { padding: 8, marginRight: 8 },
  histTitle: { color: c.histTitle, fontSize: 18, fontWeight: '700' },
  histScenChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: c.histChipBg, borderWidth: 1, borderColor: c.histChipBorder,
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    marginHorizontal: 16, marginTop: 12,
    ...shadow(theme, SHADOW_SM),
  },
  histScenChipTxt: { color: c.histChipText, fontSize: 12.5, maxWidth: 220 },
  histScenDrop: {
    marginHorizontal: 16, marginTop: 6, backgroundColor: c.histDropBg,
    borderWidth: 1, borderColor: c.histDropBorder, borderRadius: 12, padding: 5,
    ...shadow(theme, SHADOW_MD),
  },
  histScenOpt:     { paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8 },
  histScenOptOn:   { backgroundColor: c.histOptActiveBg },
  histScenOptTxt:  { color: c.histOptText, fontSize: 13 },
  histScenOptTxtOn:{ color: c.textStrong, fontWeight: '600' },
  // FlatList is `inverted` (chat-style, newest at the visual bottom) — the
  // content-space padding is drawn before the flip, so paddingTop here is
  // what actually shows at the visual bottom.
  histList:     { padding: 16, paddingTop: 40 },
  histEmpty:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  histEmptyTxt: { color: c.histEmptyText, fontSize: 16 },
  chatWrap:     { marginBottom: 10, flexDirection: 'row' },
  chatRight:    { justifyContent: 'flex-end' },
  chatLeft:     { justifyContent: 'flex-start' },
  chatBub:      { maxWidth: '78%', borderRadius: 18, padding: 14 },
  chatBubRu:    { backgroundColor: c.chatRuBg, borderBottomRightRadius: 4 },
  chatBubKo:    { backgroundColor: c.chatKoBg, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: c.chatKoBorder },
  chatOrig:     { fontSize: 15, lineHeight: 22 },
  chatSep:      { marginVertical: 3 },
  chatTrans:    { fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  chatTime:     { fontSize: 10, marginTop: 6, textAlign: 'right' },

  // Scenario picker
  overlay: { flex: 1, backgroundColor: c.scrimLight, justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: c.sheetBg, borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 8, paddingHorizontal: 20, paddingBottom: 44, maxHeight: '82%',
    ...shadow(theme, SHADOW_LG),
  },
  sheetHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: c.sheetHeadBorder, marginBottom: 8,
  },
  sheetTitle:    { color: c.sheetTitle, fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.2 },
  sheetList:     { maxHeight: 340 },
  sheetSectionLbl: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 6, paddingTop: 10, paddingBottom: 4,
  },
  sheetSectionLblTxt: {
    fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.8,
  },
  sheetSectionPlainTxt: {
    fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.8, color: c.sheetSectionPlain,
    paddingHorizontal: 6, paddingTop: 14, paddingBottom: 4,
  },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, marginBottom: 2,
  },
  sheetItemOn:      { backgroundColor: c.sheetItemOnBg },
  sheetItemLabel:   { flex: 1, paddingVertical: 14, paddingHorizontal: 4 },
  langSheetItemLabel: { paddingLeft: 14 },
  sheetItemTxt:     { color: c.sheetItemText, fontSize: 17 },
  sheetItemTxtOn:   { color: c.sheetItemTextOn, fontWeight: '600' },
  sheetCheckIcon:   { marginRight: 14 },
  pinIconBtn:    { width: 34, height: 40, justifyContent: 'center', alignItems: 'center' },
  sheetIconBtn:  { width: 34, height: 40, justifyContent: 'center', alignItems: 'center' },
  pinToast:      { textAlign: 'center', color: c.fieldError, fontSize: 11, marginTop: 4, marginBottom: 2 },
  addBtn: {
    marginTop: 12, paddingVertical: 14, alignItems: 'center',
    borderRadius: 12, borderWidth: 1, borderColor: c.addBorder, borderStyle: 'dashed',
    flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
  addBtnTxt: { color: c.addText, fontSize: 16 },

  // Scenario create / edit sub-views
  subHead: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: c.subHeadBorder, marginBottom: 12,
  },
  subHeadTitle: { color: c.subHeadTitle, fontSize: 15, fontWeight: '700', flex: 1 },
  // Lets the name/prompt fields scroll independently of subHead/formActions.
  // `maxHeight` (a numeric px cap passed at the call site, see
  // formScrollMaxHeight) — NOT flex:1 — is what makes this actually work:
  // `sheet` only has its own maxHeight (hugs content, no fixed/flex height),
  // so a flex:1 child has no determinate space to fill and collapses to
  // zero. A concrete cap sidesteps that — short content still hugs (sizes
  // to content up to the cap), long content scrolls internally instead of
  // pushing Отмена/Создать off-screen.
  formScroll: {},
  fieldLbl: {
    fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.8,
    color: c.fieldLbl, marginBottom: 6, marginTop: 4,
  },
  fieldInput: {
    backgroundColor: c.fieldBg, borderWidth: 1, borderColor: c.fieldBorder, borderRadius: 10,
    color: c.fieldNameText, fontSize: 15, paddingHorizontal: 13, paddingVertical: 11,
  },
  fieldTextarea: {
    backgroundColor: c.fieldBg, borderWidth: 1, borderColor: c.fieldBorder, borderRadius: 10,
    color: c.fieldPromptText, fontSize: 13.5, lineHeight: 20, padding: 12, minHeight: 130,
  },
  fieldError: { color: c.fieldError, fontSize: 12, marginTop: 8 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btnNeutral: {
    flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
    backgroundColor: c.btnNeutralBg, borderWidth: 1, borderColor: c.btnNeutralBorder,
  },
  btnNeutralTxt: { color: c.btnNeutralText, fontSize: 14.5, fontWeight: '600' },
  btnSave: {
    flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
    backgroundColor: c.btnSaveBg, borderWidth: 1, borderColor: c.btnSaveBorder,
  },
  btnSaveTxt: { color: c.btnSaveText, fontSize: 14.5, fontWeight: '700' },
  btnDanger: {
    flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
    backgroundColor: c.btnDangerBg, borderWidth: 1, borderColor: c.btnDangerBorder,
  },
  btnDangerTxt: { color: c.btnDangerText, fontSize: 14.5, fontWeight: '700' },

  // Delete confirmation
  confirmScrim: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: c.confirmScrim, justifyContent: 'center', alignItems: 'center',
    padding: 24, borderRadius: 28,
  },
  confirmCard: {
    width: '100%', backgroundColor: c.confirmBg, borderWidth: 1, borderColor: c.confirmBorder,
    borderRadius: 16, padding: 18,
    ...shadow(theme, SHADOW_LG),
  },
  confirmTitle: { color: c.confirmTitle, fontSize: 15, fontWeight: '700', marginBottom: 8 },
  confirmText:  { color: c.confirmText, fontSize: 12.5, lineHeight: 19 },

  // Themed notice card (scenario-unavailable) — same look as confirmCard, but
  // as a full-screen overlay rendered outside the scenario-picker Modal so it
  // can appear even when that Modal is closed.
  noticeScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: c.confirmScrim, justifyContent: 'center', alignItems: 'center',
    padding: 24, zIndex: 200, elevation: 30,
  },
  noticeBtn: {
    marginTop: 16, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
    backgroundColor: c.btnSaveBg, borderWidth: 1, borderColor: c.btnSaveBorder,
  },

  // ── Auth screens ────────────────────────────────────────────────────────
  authScreen: { flex: 1, backgroundColor: c.authBg, paddingTop: 94, paddingHorizontal: 26 },
  authThemeToggle: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
  authTopRightRow:    { position: 'absolute', top: 36, right: 24, flexDirection: 'row', alignItems: 'center', gap: 10 },
  authHeaderRightRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginLeft: 'auto' },
  authLangBtn: {
    minHeight: 28, paddingHorizontal: 10, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: c.chipInsetBg,
  },
  authLangBtnTxt: { color: c.iconMid, fontSize: 12, fontWeight: '700' },
  authLogoWrap: { alignItems: 'center', marginBottom: 38 },
  authTitle:    { color: c.textStrong, fontSize: 22, fontWeight: '700', textAlign: 'center' },
  authSubtitle: { color: c.iconDim, fontSize: 13, marginTop: 4, textAlign: 'center', lineHeight: 20 },
  authNoticeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16,
    backgroundColor: c.btnSaveBg, borderWidth: 1, borderColor: c.btnSaveBorder,
    borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12,
  },
  authNoticeTxt: { color: c.btnSaveText, fontSize: 12.5, flexShrink: 1 },

  authHeaderRow:   { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 28 },
  authHeaderTitle: { color: c.textStrong, fontSize: 20, fontWeight: '700' },

  authFieldLbl: { color: c.fieldLbl, fontSize: 12, marginBottom: 7 },
  authFieldBox: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: c.authFieldBg, borderWidth: 1, borderColor: c.authFieldBorder,
    borderRadius: 12, paddingHorizontal: 15, paddingVertical: 14, marginBottom: 16,
  },
  authFieldBoxError: { borderColor: c.authFieldBorderError, marginBottom: 7 },
  authFieldInput: { flex: 1, color: c.textStrong, fontSize: 15, padding: 0 },

  authErrorRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 16 },
  authErrorTxt: { color: c.fieldError, fontSize: 12, flexShrink: 1 },

  authLink:    { color: c.linkColor, fontSize: 13 },
  authLinkEnd: { alignSelf: 'flex-end', marginBottom: 26 },
  authLinkBold:{ color: c.linkColor, fontSize: 14, fontWeight: '600' },

  authPrimaryBtn: {
    paddingVertical: 15, borderRadius: 12, alignItems: 'center',
    backgroundColor: c.authPrimaryBg, marginBottom: 18,
  },
  authPrimaryBtnDisabled:     { backgroundColor: c.authPrimaryBgDisabled },
  authPrimaryBtnTxt:          { color: c.authPrimaryText, fontSize: 16, fontWeight: '700' },
  authPrimaryBtnTxtDisabled:  { color: c.authPrimaryTextDisabled },

  authFooterRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
  authFooterTxt: { color: c.iconDim, fontSize: 14 },

  authGuestBtn: {
    marginTop: 22, paddingVertical: 14, borderRadius: 12, alignItems: 'center',
    borderWidth: 1, borderColor: c.authFieldBorder,
  },
  authGuestBtnTxt: { color: c.textStrong, fontSize: 15, fontWeight: '600' },
  authGuestBtnSub: { color: c.iconDim, fontSize: 12, marginTop: 2 },

  // Password strength meter (sign up)
  strengthBarsRow: { flexDirection: 'row', gap: 5, marginBottom: 8 },
  strengthBar:     { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel:   { fontSize: 12, marginBottom: 14 },
  reqList: { gap: 8, marginBottom: 26 },
  reqRow:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  reqTxt:  { fontSize: 13 },

  // Email verification code
  codeHintIcon: {
    width: 56, height: 56, borderRadius: 16, backgroundColor: c.authFieldBg,
    borderWidth: 1, borderColor: c.authFieldBorder, alignItems: 'center', justifyContent: 'center',
    marginBottom: 22, alignSelf: 'center',
  },
  codeRow: { flexDirection: 'row', gap: 9, marginTop: 30, marginBottom: 26 },
  codeBox: {
    flex: 1, aspectRatio: 1, backgroundColor: c.codeBoxBg, borderWidth: 1,
    borderColor: c.codeBoxBorder, borderRadius: 12, alignItems: 'center', justifyContent: 'center',
  },
  codeBoxActive: { borderWidth: 2, borderColor: c.codeBoxBorderActive },
  codeBoxError:  { backgroundColor: c.codeBoxBgError, borderColor: c.codeBoxBorderError },
  codeDigit:  { color: c.textStrong, fontSize: 24, fontWeight: '600' },
  codeCursor: { width: 2, height: 24, backgroundColor: c.linkColor },
  // Off-screen but focusable — the 6 boxes above are pure display, driven by
  // this single input's value, which is far more reliable in RN than
  // juggling 6 separate refs with auto-advance focus logic.
  codeHiddenInput: { position: 'absolute', opacity: 0, height: 1, width: 1 },

  resendTxt: { textAlign: 'center', color: c.iconDim, fontSize: 13 },

  // Language packs (offline translation)
  packsHint: { color: c.iconDim, fontSize: 12.5, lineHeight: 19, padding: 16, paddingBottom: 4 },
  packsList: { padding: 16, gap: 10 },
  packRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: c.fieldBg, borderWidth: 1, borderColor: c.fieldBorder,
    borderRadius: 12, padding: 14,
  },
  packInfo:   { gap: 3 },
  packName:   { color: c.textStrong, fontSize: 15, fontWeight: '600' },
  packStatus: { color: c.iconDim, fontSize: 12 },
  packBtnSave: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: c.btnSaveBg, borderWidth: 1, borderColor: c.btnSaveBorder,
    borderRadius: 10, paddingVertical: 9, paddingHorizontal: 13,
  },
  packBtnSaveTxt: { color: c.btnSaveText, fontSize: 13, fontWeight: '600' },
  packBtnDanger: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: c.btnDangerBg, borderWidth: 1, borderColor: c.btnDangerBorder,
    borderRadius: 10, paddingVertical: 9, paddingHorizontal: 13,
  },
  packBtnDangerTxt: { color: c.btnDangerText, fontSize: 13, fontWeight: '600' },
  packWifiRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, padding: 4 },
  packWifiTxt: { color: c.scenText, fontSize: 13 },
  });
}
