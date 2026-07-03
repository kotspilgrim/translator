import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ActivityIndicator,
  ScrollView, FlatList, Modal, TextInput, Keyboard,
  KeyboardAvoidingView, Platform, Animated, Easing,
} from 'react-native';

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

// ── Config ───────────────────────────────────────────────────────────────────
const BACKEND_URL   = 'http://100.68.162.96:3000';
const HISTORY_KEY   = 'translation_history';
const PINNED_KEY    = 'translator_pinned_scenarios';
const THEME_KEY     = 'translator_theme';
const HISTORY_TTL   = 24 * 60 * 60 * 1000;
const SILENCE_MS    = 7000;
const MAX_PINNED    = 3;

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

// Placeholders — text content only, not rotation
const PH_RU        = 'Коснитесь кнопки микрофона, чтобы перейти в голосовой режим, или текстовой области, чтобы ввести текст для перевода.';
const PH_KO_WAIT   = '상대방의 발화가 끝날 때까지\n기다려 주세요';
const PH_KO_ACTIVE = '음성 통역 또는 텍스트 번역으로 대화 할 수 있습니다.\n음성으로 대화하려면 마이크 버튼을,\n텍스트로 대화하려면 텍스트 영역을 누르세요.';
const PH_RU_WAIT   = 'Ожидайте ответ собеседника';

const fmtTime = ts => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};

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
  },
};

// Light theme gets subtle card shadows (matches the design's white-on-light-grey
// surfaces); dark theme stays flat-on-black exactly as before.
const SHADOW_SM = { elevation: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 };
const SHADOW_MD = { elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8 };
const SHADOW_LG = { elevation: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.16, shadowRadius: 24 };
const shadow = (theme, preset) => (theme === 'light' ? preset : null);

// ── History screen ───────────────────────────────────────────────────────────
function HistoryScreen({ history, scenarios, initialScenarioId, onBack, theme }) {
  const c = COLORS[theme];
  const S = useMemo(() => makeStyles(c, theme), [c, theme]);

  const [viewId,   setViewId]   = useState(initialScenarioId);
  const [showDrop, setShowDrop] = useState(false);

  const viewName = scenarios.find(s => s.id === viewId)?.name || 'Сценарий';
  const filtered = history.filter(i => i.scenarioId === viewId);

  return (
    <View style={S.histCont}>
      <StatusBar style={c.statusBarStyle} />
      <View style={S.histHead}>
        <TouchableOpacity onPress={onBack} style={S.backBtn}>
          <MI name="arrow-back" size={24} color={c.textStrong} />
        </TouchableOpacity>
        <Text style={S.histTitle}>История</Text>
      </View>

      <TouchableOpacity style={S.histScenChip} onPress={() => setShowDrop(v => !v)}>
        <MI name="push-pin" size={13} color={c.pinAccent} />
        <Text style={S.histScenChipTxt} numberOfLines={1}>{viewName}</Text>
        <MI name="expand-more" size={16} color={c.iconDim} />
      </TouchableOpacity>

      {showDrop && (
        <View style={S.histScenDrop}>
          <ScrollView style={{ maxHeight: 260 }} showsVerticalScrollIndicator={false}>
            {scenarios.map(s => (
              <TouchableOpacity
                key={s.id}
                style={[S.histScenOpt, s.id === viewId && S.histScenOptOn]}
                onPress={() => { setViewId(s.id); setShowDrop(false); }}
              >
                <Text style={[S.histScenOptTxt, s.id === viewId && S.histScenOptTxtOn]} numberOfLines={1}>
                  {s.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {filtered.length === 0 ? (
        <View style={S.histEmpty}>
          <Text style={S.histEmptyTxt}>Нет переводов за последние 24 часа</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={i => i.id}
          contentContainerStyle={S.histList}
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
                  <Text style={[S.chatTime, { color: timeColor }]}>{fmtTime(item.timestamp)}</Text>
                </View>
              </View>
            );
          }}
        />
      )}
    </View>
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

  const [screen,     setScreen]     = useState('main');
  const [showMenu,   setShowMenu]   = useState(false);

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

  // ── Scenarios (source of truth: backend) ───────────────────────────────────
  const [scenarios,   setScenarios]   = useState(FALLBACK_SCENARIOS);
  const [scenarioId,  setScenarioId]  = useState(FALLBACK_SCENARIOS[0].id);
  const scenarioIdRef = useRef(scenarioId);
  useEffect(() => { scenarioIdRef.current = scenarioId; }, [scenarioId]);
  const scenario = scenarios.find(s => s.id === scenarioId)?.name || '';

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
    setConnMsg('проверка…');
    const started = Date.now();
    try {
      const ctrl = new AbortController();
      const tid  = setTimeout(() => ctrl.abort(), 8000);
      const resp = await fetch(`${BACKEND_URL}/health`, { signal: ctrl.signal });
      clearTimeout(tid);
      const data = await resp.json().catch(() => ({}));
      if (resp.ok && data.ok) {
        setConnStatus('ok');
        setConnMsg(`${Date.now() - started} мс`);
      } else {
        setConnStatus('bad');
        setConnMsg('нет связи');
      }
    } catch {
      setConnStatus('bad');
      setConnMsg('нет связи');
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
  const fetchScenarios = async () => {
    try {
      const resp = await fetch(`${BACKEND_URL}/scenarios`);
      const data = await resp.json();
      if (Array.isArray(data) && data.length) {
        setScenarios(data);
        return data;
      }
    } catch {}
    return null;
  };

  useEffect(() => { fetchScenarios(); }, []);

  // ── Pinned scenarios (local, max 3) ─────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(PINNED_KEY);
        if (raw) setPinnedIds(JSON.parse(raw));
      } catch {}
    })();
  }, []);

  const togglePin = id => {
    setPinnedIds(prev => {
      if (prev.includes(id)) {
        const next = prev.filter(x => x !== id);
        AsyncStorage.setItem(PINNED_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      }
      if (prev.length >= MAX_PINNED) {
        setPinToast(true);
        setTimeout(() => setPinToast(false), 1500);
        return prev;
      }
      const next = [...prev, id];
      AsyncStorage.setItem(PINNED_KEY, JSON.stringify(next)).catch(() => {});
      return next;
    });
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
    if (!name || !prompt) { setCreateError('Заполните оба поля'); return; }
    setCreateSaving(true);
    setCreateError('');
    try {
      const resp = await fetch(`${BACKEND_URL}/scenarios`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, prompt }),
      });
      const data = await resp.json();
      if (resp.ok) {
        await fetchScenarios();
        setScenarioId(data.id);
        setCreateName(''); setCreatePrompt('');
        setSheetView('list');
      } else {
        setCreateError(data.error || 'Не удалось создать сценарий');
      }
    } catch {
      setCreateError('Нет соединения с сервером');
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
      const resp = await fetch(`${BACKEND_URL}/scenarios/${s.id}`);
      const data = await resp.json();
      if (resp.ok) setEditPrompt(data.prompt || '');
      else setEditError(data.error || 'Не удалось загрузить промпт');
    } catch {
      setEditError('Нет соединения с сервером');
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });
      const data = await resp.json();
      if (resp.ok) {
        await fetchScenarios();
        setSheetView('list');
      } else {
        setEditError(data.error || 'Не удалось сохранить');
      }
    } catch {
      setEditError('Нет соединения с сервером');
    }
    setEditSaving(false);
  };

  const handleDeleteScenario = async () => {
    if (!deleteTarget) return;
    const { id } = deleteTarget;
    try {
      const resp = await fetch(`${BACKEND_URL}/scenarios/${id}`, { method: 'DELETE' });
      if (resp.ok || resp.status === 204) {
        const updated = await fetchScenarios();
        setPinnedIds(prev => {
          const next = prev.filter(x => x !== id);
          AsyncStorage.setItem(PINNED_KEY, JSON.stringify(next)).catch(() => {});
          return next;
        });
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
          {s.name}
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
        const fromLang = bubble === 'ru' ? 'русский'   : 'корейский';
        const toLang   = bubble === 'ru' ? 'корейский' : 'русский';
        doTranslate(text, fromLang, toLang, bubble);
      }
    }
  });

  useSpeechRecognitionEvent('error', () => { setRecognizing(false); killSilenceTimer(); });

  // ── Translation ────────────────────────────────────────────────────────────
  const doTranslate = async (text, fromLang, toLang, sourceBubble) => {
    setTranslating(true);
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 15000);
    try {
      const resp = await fetch(`${BACKEND_URL}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify({ text, fromLang, toLang, context: scenarioIdRef.current }),
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
    } catch { clearTimeout(tid); }
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
      lang: bubble === 'ru' ? 'ru-RU' : 'ko-KR',
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
    if (text) doTranslate(text, 'русский', 'корейский', 'ru');
  };

  const handleKoSubmit = () => {
    const text = koText.trim();
    Keyboard.dismiss();
    closeTypingMode();
    if (text) doTranslate(text, 'корейский', 'русский', 'ko');
  };

  // ── Derived state ──────────────────────────────────────────────────────────
  // Show "wait" placeholder in the OPPOSITE bubble while the other person records
  const ruShowWait = recognizing && activeBubble === 'ko';
  const koShowWait = recognizing && activeBubble === 'ru';

  const ruPlaceholder = (ruShowWait || activeBubble === 'ko') ? PH_RU_WAIT : PH_RU;
  const koPlaceholder = activeBubble === 'ko' ? PH_KO_ACTIVE : PH_KO_WAIT;

  const micRecording = bubble => recognizing && activeBubble === bubble;

  if (screen === 'history') {
    return (
      <HistoryScreen
        history={history}
        scenarios={scenarios}
        initialScenarioId={scenarioId}
        onBack={() => setScreen('main')}
        theme={theme}
      />
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={S.root}>
      <StatusBar style={c.statusBarStyle} />

      <KeyboardAvoidingView
        style={S.kav}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        {/* ── Korean mic — physically at very top ── */}
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

        {/* ── Korean bubble (rotated 180° for face-to-face) — flips over the
             horizontal axis, like a card turning top-to-bottom ── */}
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

        {/* ── Gutter: scenario + history between bubbles ── */}
        <View style={S.gutter}>
          <TouchableOpacity style={S.scenBtn} onPress={() => setShowPicker(true)}>
            <Text style={S.scenTxt} numberOfLines={1}>{scenario}</Text>
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
              <Text style={S.bubbleWaitPh}>{PH_RU_WAIT}</Text>
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
            onPress={() => handleSpeak(ruText, 'ru-RU')}
            disabled={!ruText}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <MI name="volume-up" size={16} color={c.iconMid} />
          </TouchableOpacity>
        </TouchableOpacity>

        {/* ── Russian mic — physically at bottom ── */}
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
            <Text style={S.menuBrand}>RU ⇄ KO Переводчик</Text>
            <Text style={S.menuSub}>{BACKEND_URL.replace('http://', '')}</Text>

            <TouchableOpacity style={S.menuItem} onPress={() => { setShowMenu(false); setShowPicker(true); }}>
              <MI name="list" size={20} color={c.menuIcon} />
              <Text style={S.menuItemTxt}>Сценарии</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.menuItem} onPress={() => { setShowMenu(false); setScreen('history'); }}>
              <MI name="history" size={20} color={c.menuIcon} />
              <Text style={S.menuItemTxt}>История</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.menuItem} onPress={() => { setShowMenu(false); testConnection(); }}>
              <MI name="network-check" size={20} color={c.menuIcon} />
              <Text style={S.menuItemTxt}>Проверить связь</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[S.menuItem, S.menuItemDivider]} onPress={() => { setShowMenu(false); toggleTheme(); }}>
              <MI name={theme === 'dark' ? 'light-mode' : 'dark-mode'} size={20} color={c.themeToggleIcon} />
              <Text style={S.menuItemTxt}>{theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
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
                  <Text style={S.sheetTitle}>Сценарий</Text>
                  <TouchableOpacity onPress={closePicker} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <MI name="close" size={22} color={c.sheetClose} />
                  </TouchableOpacity>
                </View>

                <ScrollView style={S.sheetList} showsVerticalScrollIndicator={false}>
                  {pinnedScenarios.length > 0 && (
                    <>
                      <View style={S.sheetSectionLbl}>
                        <MI name="push-pin" size={12} color={c.pinAccent} />
                        <Text style={[S.sheetSectionLblTxt, { color: c.pinAccent }]}>Закреплено ({pinnedScenarios.length}/{MAX_PINNED})</Text>
                      </View>
                      {pinnedScenarios.map(s => renderScenarioRow(s, true))}
                    </>
                  )}
                  {restScenarios.length > 0 && (
                    <>
                      <Text style={S.sheetSectionPlainTxt}>Остальные</Text>
                      {restScenarios.map(s => renderScenarioRow(s, false))}
                    </>
                  )}
                </ScrollView>

                {pinToast && <Text style={S.pinToast}>Можно закрепить не более {MAX_PINNED}</Text>}

                <TouchableOpacity style={S.addBtn} onPress={() => setSheetView('create')}>
                  <MI name="add" size={20} color={c.iconDim} />
                  <Text style={S.addBtnTxt}>Добавить сценарий</Text>
                </TouchableOpacity>
              </>
            )}

            {sheetView === 'create' && (
              <>
                <View style={S.subHead}>
                  <TouchableOpacity onPress={() => setSheetView('list')} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <MI name="arrow-back" size={22} color={c.backIcon} />
                  </TouchableOpacity>
                  <Text style={S.subHeadTitle}>Новый сценарий</Text>
                </View>

                <Text style={S.fieldLbl}>Название</Text>
                <TextInput
                  style={S.fieldInput}
                  value={createName}
                  onChangeText={setCreateName}
                  placeholder="Например: На рынке"
                  placeholderTextColor={c.fieldPh}
                />

                <Text style={S.fieldLbl}>Промпт</Text>
                <TextInput
                  style={S.fieldTextarea}
                  value={createPrompt}
                  onChangeText={setCreatePrompt}
                  placeholder={'Опишите контекст и стиль перевода.\n{fromLang} и {toLang} подставятся автоматически.'}
                  placeholderTextColor={c.fieldPh}
                  multiline
                  textAlignVertical="top"
                />

                {!!createError && <Text style={S.fieldError}>{createError}</Text>}

                <View style={S.formActions}>
                  <TouchableOpacity style={S.btnNeutral} onPress={() => setSheetView('list')} disabled={createSaving}>
                    <Text style={S.btnNeutralTxt}>Отмена</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.btnSave} onPress={handleCreateScenario} disabled={createSaving}>
                    {createSaving
                      ? <ActivityIndicator color={c.btnSaveText} size="small" />
                      : <Text style={S.btnSaveTxt}>Создать</Text>}
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
                  <Text style={S.subHeadTitle} numberOfLines={1}>{editingScenario.name}</Text>
                </View>

                <Text style={S.fieldLbl}>Промпт</Text>
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

                <View style={S.formActions}>
                  <TouchableOpacity style={S.btnNeutral} onPress={() => setSheetView('list')} disabled={editSaving}>
                    <Text style={S.btnNeutralTxt}>Отмена</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.btnSave} onPress={handleSaveEdit} disabled={editSaving || editLoading}>
                    {editSaving
                      ? <ActivityIndicator color={c.btnSaveText} size="small" />
                      : <Text style={S.btnSaveTxt}>Сохранить</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {deleteTarget && (
              <View style={S.confirmScrim}>
                <View style={S.confirmCard}>
                  <Text style={S.confirmTitle}>Удалить сценарий?</Text>
                  <Text style={S.confirmText}>
                    «{deleteTarget.name}» и его промпт будут удалены без возможности восстановить.
                  </Text>
                  <View style={S.formActions}>
                    <TouchableOpacity style={S.btnNeutral} onPress={() => setDeleteTarget(null)}>
                      <Text style={S.btnNeutralTxt}>Нет</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={S.btnDanger} onPress={handleDeleteScenario}>
                      <Text style={S.btnDangerTxt}>Да</Text>
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
  histList:     { padding: 16, paddingBottom: 40 },
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
  sheetItemTxt:     { color: c.sheetItemText, fontSize: 17 },
  sheetItemTxtOn:   { color: c.sheetItemTextOn, fontWeight: '600' },
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
  });
}
