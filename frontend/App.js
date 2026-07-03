import { useState, useRef, useEffect, useCallback } from 'react';
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

// ── History screen ───────────────────────────────────────────────────────────
function HistoryScreen({ history, scenarios, initialScenarioId, onBack }) {
  const [viewId,   setViewId]   = useState(initialScenarioId);
  const [showDrop, setShowDrop] = useState(false);

  const viewName = scenarios.find(s => s.id === viewId)?.name || 'Сценарий';
  const filtered = history.filter(i => i.scenarioId === viewId);

  return (
    <View style={S.histCont}>
      <StatusBar style="light" />
      <View style={S.histHead}>
        <TouchableOpacity onPress={onBack} style={S.backBtn}>
          <MI name="arrow-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={S.histTitle}>История</Text>
      </View>

      <TouchableOpacity style={S.histScenChip} onPress={() => setShowDrop(v => !v)}>
        <MI name="push-pin" size={13} color="#f0b429" />
        <Text style={S.histScenChipTxt} numberOfLines={1}>{viewName}</Text>
        <MI name="expand-more" size={16} color="#8a8a8a" />
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
            return (
              <View style={[S.chatWrap, isRu ? S.chatRight : S.chatLeft]}>
                <View style={[S.chatBub, isRu ? S.chatBubRu : S.chatBubKo]}>
                  <Text style={S.chatOrig}>{item.originalText}</Text>
                  <MI name="south" size={14} color="rgba(255,255,255,0.35)" style={S.chatSep} />
                  <Text style={S.chatTrans}>{item.translatedText}</Text>
                  <Text style={S.chatTime}>{fmtTime(item.timestamp)}</Text>
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
    <View key={s.id} style={[S.sheetItem, scenarioId === s.id && S.sheetItemOn, isPinned && S.sheetItemPinned]}>
      <TouchableOpacity
        style={S.pinIconBtn}
        onPress={() => togglePin(s.id)}
        hitSlop={{ top: 8, right: 4, bottom: 8, left: 8 }}
      >
        <MI name="push-pin" size={16} color={isPinned ? '#f0b429' : '#5a5a5a'} />
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
        <MI name="edit" size={17} color="#7d7d7d" />
      </TouchableOpacity>
      {!s.builtIn && (
        <TouchableOpacity
          style={S.sheetIconBtn}
          onPress={() => setDeleteTarget({ id: s.id, name: s.name })}
          hitSlop={{ top: 8, right: 8, bottom: 8, left: 4 }}
        >
          <MI name="delete" size={18} color="#8a8a8a" />
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
      />
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <View style={S.root}>
      <StatusBar style="light" />

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
              size={26} color="#e6e6e6"
              style={{ transform: [{ rotate: koFlipIconRotate }] }}
            />
          </TouchableOpacity>
          <TouchableOpacity style={S.flipBtn} onPress={() => setKoRotated(r => !r)}>
            <MI name="screen-rotation" size={20} color="#cfcfcf" />
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
              <ActivityIndicator color="#4fc3f7" size="large" />
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
            <MI name="close" size={16} color="#666" />
          </TouchableOpacity>
          {/* TTS — top-left in rotated space */}
          <TouchableOpacity
            style={[S.ttsBtn, !koText && S.ttsBtnDim]}
            onPress={() => handleSpeak(koText, 'ko-KR')}
            disabled={!koText}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <MI name="volume-up" size={16} color="#cfcfcf" />
          </TouchableOpacity>
        </AnimatedTouchable>

        {/* ── Gutter: scenario + history between bubbles ── */}
        <View style={S.gutter}>
          <TouchableOpacity style={S.scenBtn} onPress={() => setShowPicker(true)}>
            <Text style={S.scenTxt} numberOfLines={1}>{scenario}</Text>
            <MI name="expand-more" size={20} color="#666" />
          </TouchableOpacity>
          <TouchableOpacity style={S.histBtn} onPress={() => setScreen('history')}>
            <MI name="history" size={20} color="#cfcfcf" />
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
              <ActivityIndicator color="#4fc3f7" size="large" />
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
                placeholderTextColor="#333"
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
            <MI name="close" size={16} color="#666" />
          </TouchableOpacity>
          {/* TTS */}
          <TouchableOpacity
            style={[S.ttsBtn, !ruText && S.ttsBtnDim]}
            onPress={() => handleSpeak(ruText, 'ru-RU')}
            disabled={!ruText}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <MI name="volume-up" size={16} color="#cfcfcf" />
          </TouchableOpacity>
        </TouchableOpacity>

        {/* ── Russian mic — physically at bottom ── */}
        <View style={S.ruMicRow}>
          <TouchableOpacity
            style={[S.micBtn, micRecording('ru') && S.micBtnRec, translating && S.micBtnDim]}
            onPress={() => handleMic('ru')}
            disabled={translating}
          >
            <MI name={micRecording('ru') ? 'stop' : 'mic'} size={26} color="#e6e6e6" />
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
                connStatus === 'ok'       ? '#4ade80' :
                connStatus === 'bad'      ? '#f87171' :
                connStatus === 'checking' ? '#4fc3f7' : '#9fb8c4'
              }
            />
            {connStatus !== 'idle' && (
              <View style={S.testPill}>
                <Text style={[
                  S.testPillTxt,
                  connStatus === 'ok'  && S.testPillOk,
                  connStatus === 'bad' && S.testPillBad,
                ]}>
                  {connMsg}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* ── Menu button — physical top-left corner ── */}
      <TouchableOpacity style={S.menuBtn} onPress={() => setShowMenu(true)}>
        <MI name="menu" size={20} color="#cfcfcf" />
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
              <MI name="list" size={20} color="#8f8f8f" />
              <Text style={S.menuItemTxt}>Сценарии</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.menuItem} onPress={() => { setShowMenu(false); setScreen('history'); }}>
              <MI name="history" size={20} color="#8f8f8f" />
              <Text style={S.menuItemTxt}>История</Text>
            </TouchableOpacity>
            <TouchableOpacity style={S.menuItem} onPress={() => { setShowMenu(false); testConnection(); }}>
              <MI name="network-check" size={20} color="#8f8f8f" />
              <Text style={S.menuItemTxt}>Проверить связь</Text>
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
              placeholderTextColor="#444"
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
                    <MI name="close" size={22} color="#777" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={S.sheetList} showsVerticalScrollIndicator={false}>
                  {pinnedScenarios.length > 0 && (
                    <>
                      <View style={S.sheetSectionLbl}>
                        <MI name="push-pin" size={12} color="#f0b429" />
                        <Text style={S.sheetSectionLblTxt}>Закреплено ({pinnedScenarios.length}/{MAX_PINNED})</Text>
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
                  <MI name="add" size={20} color="#666" />
                  <Text style={S.addBtnTxt}>Добавить сценарий</Text>
                </TouchableOpacity>
              </>
            )}

            {sheetView === 'create' && (
              <>
                <View style={S.subHead}>
                  <TouchableOpacity onPress={() => setSheetView('list')} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <MI name="arrow-back" size={22} color="#ccc" />
                  </TouchableOpacity>
                  <Text style={S.subHeadTitle}>Новый сценарий</Text>
                </View>

                <Text style={S.fieldLbl}>Название</Text>
                <TextInput
                  style={S.fieldInput}
                  value={createName}
                  onChangeText={setCreateName}
                  placeholder="Например: На рынке"
                  placeholderTextColor="#555"
                />

                <Text style={S.fieldLbl}>Промпт</Text>
                <TextInput
                  style={S.fieldTextarea}
                  value={createPrompt}
                  onChangeText={setCreatePrompt}
                  placeholder={'Опишите контекст и стиль перевода.\n{fromLang} и {toLang} подставятся автоматически.'}
                  placeholderTextColor="#555"
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
                      ? <ActivityIndicator color="#4ade80" size="small" />
                      : <Text style={S.btnSaveTxt}>Создать</Text>}
                  </TouchableOpacity>
                </View>
              </>
            )}

            {sheetView === 'edit' && editingScenario && (
              <>
                <View style={S.subHead}>
                  <TouchableOpacity onPress={() => setSheetView('list')} hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <MI name="arrow-back" size={22} color="#ccc" />
                  </TouchableOpacity>
                  <Text style={S.subHeadTitle} numberOfLines={1}>{editingScenario.name}</Text>
                </View>

                <Text style={S.fieldLbl}>Промпт</Text>
                {editLoading ? (
                  <ActivityIndicator color="#4fc3f7" style={{ marginVertical: 20 }} />
                ) : (
                  <TextInput
                    style={[S.fieldTextarea, { minHeight: 180 }]}
                    value={editPrompt}
                    onChangeText={setEditPrompt}
                    multiline
                    textAlignVertical="top"
                    placeholderTextColor="#555"
                  />
                )}

                {!!editError && <Text style={S.fieldError}>{editError}</Text>}

                <View style={S.formActions}>
                  <TouchableOpacity style={S.btnNeutral} onPress={() => setSheetView('list')} disabled={editSaving}>
                    <Text style={S.btnNeutralTxt}>Отмена</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={S.btnSave} onPress={handleSaveEdit} disabled={editSaving || editLoading}>
                    {editSaving
                      ? <ActivityIndicator color="#4ade80" size="small" />
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
const S = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0f0f0f' },
  kav:  { flex: 1, paddingTop: 48, paddingBottom: 12 },

  // Menu button + drawer
  menuBtn: {
    position: 'absolute', top: 58, left: 14, zIndex: 20, elevation: 6,
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2e2e2e',
    justifyContent: 'center', alignItems: 'center',
  },
  menuScrim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 90, elevation: 20,
  },
  menuDrawer: {
    width: '74%', height: '100%', backgroundColor: '#161616',
    borderRightWidth: 1, borderRightColor: '#242424',
    paddingTop: 56, paddingHorizontal: 18,
  },
  menuBrand: { color: '#fff', fontSize: 16, fontWeight: '700' },
  menuSub:   { color: '#555', fontSize: 11, marginTop: 2, marginBottom: 20 },
  menuItem:  { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  menuItemTxt: { color: '#c9c9c9', fontSize: 15 },

  // Mic rows
  koMicRow: { height: 58, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  ruMicRow: { height: 58, justifyContent: 'center', alignItems: 'center', position: 'relative' },

  // Flip button
  flipBtn: {
    position: 'absolute', right: 14,
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#2e2e2e',
    justifyContent: 'center', alignItems: 'center',
  },
  flipIcon: { fontSize: 18 },
  micBtn: {
    width: 54, height: 54, borderRadius: 27,
    backgroundColor: '#202020', borderWidth: 2, borderColor: '#2e2e2e',
    justifyContent: 'center', alignItems: 'center',
  },
  micBtnRec: { backgroundColor: '#7f1d1d', borderColor: '#ef4444' },
  micBtnDim: { opacity: 0.3 },
  micIcon:        { fontSize: 24 },

  // Test connection button — offset into the corner so it can't be hit by accident
  testBtn: {
    position: 'absolute', right: 14,
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#1a1a1a', borderWidth: 1.5, borderColor: '#2e2e2e',
    justifyContent: 'center', alignItems: 'center',
  },
  testBtnOk:       { borderColor: '#4ade80' },
  testBtnBad:      { borderColor: '#f87171' },
  testBtnChecking: { borderColor: '#4fc3f7' },
  testPill: {
    position: 'absolute', bottom: '100%', marginBottom: 6, alignSelf: 'center',
    backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#2e2e2e', borderRadius: 20,
    paddingHorizontal: 10, paddingVertical: 4,
  },
  testPillTxt: { fontSize: 10, color: '#9a9a9a' },
  testPillOk:  { color: '#4ade80' },
  testPillBad: { color: '#f87171' },

  // Bubbles
  bubble: {
    flex: 1, marginHorizontal: 14, marginVertical: 8,
    backgroundColor: '#161616',
    borderRadius: 20, borderWidth: 2, borderColor: '#1e1e1e',
    overflow: 'hidden',
  },
  bubbleActive: { borderColor: '#ffffff' },
  bubbleBody: {
    flex: 1, justifyContent: 'center', alignItems: 'center', padding: 18,
  },
  bubbleScroll: { flexGrow: 1, justifyContent: 'center', alignItems: 'center' },
  bubbleTxt: { color: '#fff', fontSize: 22, lineHeight: 34, textAlign: 'center' },
  bubblePh:  { color: '#2a2a2a', fontSize: 15, lineHeight: 25, textAlign: 'center' },
  // "Waiting" placeholder is slightly more visible than normal placeholder
  bubbleWaitPh: { color: '#3a3a3a', fontSize: 16, lineHeight: 26, textAlign: 'center' },
  bubbleInput: {
    color: '#fff', fontSize: 20, lineHeight: 30,
    textAlign: 'center', width: '100%', flex: 1,
  },

  // Buttons inside bubble
  clearBtn: {
    position: 'absolute', top: 10, right: 12,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#252525', justifyContent: 'center', alignItems: 'center',
  },
  clearTxt: { color: '#555', fontSize: 13 },
  ttsBtn: {
    position: 'absolute', top: 10, left: 12,
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#252525', justifyContent: 'center', alignItems: 'center',
  },
  ttsBtnDim: { opacity: 0.2 },
  ttsTxt: { fontSize: 14 },

  // Gutter between bubbles
  gutter: {
    height: 54, flexDirection: 'row',
    alignItems: 'center', paddingHorizontal: 14, gap: 10,
  },
  scenBtn: {
    flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#1a1a1a', borderRadius: 12,
    borderWidth: 1, borderColor: '#252525',
    paddingHorizontal: 14, height: 38,
  },
  scenTxt:  { color: '#bbb', fontSize: 14, flex: 1, marginRight: 6 },
  scenChev: { color: '#555', fontSize: 12 },
  histBtn: {
    width: 38, height: 38, borderRadius: 19,
    backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center',
  },
  histBtnTxt: { fontSize: 17 },

  // Korean typing overlay — appears at physical top so Korean person
  // can type without flipping the phone
  koBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
    zIndex: 100,
  },
  koPanel: {
    backgroundColor: '#161616',
    borderBottomLeftRadius: 24, borderBottomRightRadius: 24,
    paddingTop: 56, paddingBottom: 28, paddingHorizontal: 24,
    minHeight: 190,
    justifyContent: 'flex-end',
    elevation: 12,
  },
  koPanelHint: {
    color: '#444', fontSize: 12, textAlign: 'center', marginBottom: 14,
  },
  koPanelInput: {
    color: '#fff', fontSize: 22, lineHeight: 32,
    textAlign: 'center', minHeight: 60,
    textAlignVertical: 'center',
  },

  // History screen
  histCont:  { flex: 1, backgroundColor: '#0f0f0f', paddingTop: 48 },
  histHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingBottom: 14, paddingTop: 10,
    borderBottomWidth: 1, borderBottomColor: '#1a1a1a',
  },
  backBtn:   { padding: 8, marginRight: 8 },
  backTxt:   { color: '#fff', fontSize: 22 },
  histTitle: { color: '#fff', fontSize: 18, fontWeight: '700' },
  histScenChip: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
    backgroundColor: '#1a1a1a', borderWidth: 1, borderColor: '#242424',
    borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7,
    marginHorizontal: 16, marginTop: 12,
  },
  histScenChipTxt: { color: '#e8d9ad', fontSize: 12.5, maxWidth: 220 },
  histScenDrop: {
    marginHorizontal: 16, marginTop: 6, backgroundColor: '#1e1e1e',
    borderWidth: 1, borderColor: '#2a2a2a', borderRadius: 12, padding: 5,
  },
  histScenOpt:     { paddingVertical: 10, paddingHorizontal: 10, borderRadius: 8 },
  histScenOptOn:   { backgroundColor: '#262626' },
  histScenOptTxt:  { color: '#b0b0b0', fontSize: 13 },
  histScenOptTxtOn:{ color: '#fff', fontWeight: '600' },
  histList:     { padding: 16, paddingBottom: 40 },
  histEmpty:    { flex: 1, justifyContent: 'center', alignItems: 'center' },
  histEmptyTxt: { color: '#444', fontSize: 16 },
  chatWrap:     { marginBottom: 10, flexDirection: 'row' },
  chatRight:    { justifyContent: 'flex-end' },
  chatLeft:     { justifyContent: 'flex-start' },
  chatBub:      { maxWidth: '78%', borderRadius: 18, padding: 14 },
  chatBubRu:    { backgroundColor: '#5b21b6', borderBottomRightRadius: 4 },
  chatBubKo:    { backgroundColor: '#1f1f1f', borderBottomLeftRadius: 4 },
  chatOrig:     { color: '#fff', fontSize: 15, lineHeight: 22 },
  chatSep:      { color: 'rgba(255,255,255,0.3)', fontSize: 11, marginVertical: 3 },
  chatTrans:    { color: 'rgba(255,255,255,0.65)', fontSize: 13, lineHeight: 19, fontStyle: 'italic' },
  chatTime:     { color: 'rgba(255,255,255,0.3)', fontSize: 10, marginTop: 6, textAlign: 'right' },

  // Scenario picker
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#191919', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    paddingTop: 8, paddingHorizontal: 20, paddingBottom: 44, maxHeight: '82%',
  },
  sheetHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#2a2a2a', marginBottom: 8,
  },
  sheetTitle:    { color: '#888', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.2 },
  sheetCloseTxt: { color: '#666', fontSize: 20 },
  sheetList:     { maxHeight: 340 },
  sheetSectionLbl: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 6, paddingTop: 10, paddingBottom: 4,
  },
  sheetSectionLblTxt: {
    fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.8, color: '#f0b429',
  },
  sheetSectionPlainTxt: {
    fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.8, color: '#666',
    paddingHorizontal: 6, paddingTop: 14, paddingBottom: 4,
  },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, marginBottom: 2,
  },
  sheetItemOn:      { backgroundColor: '#252525' },
  sheetItemPinned:  { backgroundColor: '#201a0c' },
  sheetItemLabel:   { flex: 1, paddingVertical: 14, paddingHorizontal: 4 },
  sheetItemTxt:     { color: '#aaa', fontSize: 17 },
  sheetItemTxtOn:   { color: '#fff', fontWeight: '600' },
  pinIconBtn:    { width: 34, height: 40, justifyContent: 'center', alignItems: 'center' },
  sheetIconBtn:  { width: 34, height: 40, justifyContent: 'center', alignItems: 'center' },
  pinToast:      { textAlign: 'center', color: '#f87171', fontSize: 11, marginTop: 4, marginBottom: 2 },
  addBtn: {
    marginTop: 12, paddingVertical: 14, alignItems: 'center',
    borderRadius: 12, borderWidth: 1, borderColor: '#2a2a2a', borderStyle: 'dashed',
    flexDirection: 'row', justifyContent: 'center', gap: 8,
  },
  addBtnTxt: { color: '#555', fontSize: 16 },

  // Scenario create / edit sub-views
  subHead: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#2a2a2a', marginBottom: 12,
  },
  subHeadTitle: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1 },
  fieldLbl: {
    fontSize: 10.5, textTransform: 'uppercase', letterSpacing: 0.8,
    color: '#666', marginBottom: 6, marginTop: 4,
  },
  fieldInput: {
    backgroundColor: '#232323', borderWidth: 1, borderColor: '#333', borderRadius: 10,
    color: '#fff', fontSize: 15, paddingHorizontal: 13, paddingVertical: 11,
  },
  fieldTextarea: {
    backgroundColor: '#232323', borderWidth: 1, borderColor: '#333', borderRadius: 10,
    color: '#e0e0e0', fontSize: 13.5, lineHeight: 20, padding: 12, minHeight: 130,
  },
  fieldError: { color: '#f87171', fontSize: 12, marginTop: 8 },
  formActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  btnNeutral: {
    flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
    backgroundColor: '#232323', borderWidth: 1, borderColor: '#333',
  },
  btnNeutralTxt: { color: '#9a9a9a', fontSize: 14.5, fontWeight: '600' },
  btnSave: {
    flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
    backgroundColor: '#1a4020', borderWidth: 1, borderColor: '#2a5c34',
  },
  btnSaveTxt: { color: '#4ade80', fontSize: 14.5, fontWeight: '700' },
  btnDanger: {
    flex: 1, paddingVertical: 13, borderRadius: 12, alignItems: 'center',
    backgroundColor: '#3a1414', borderWidth: 1, borderColor: '#5c2323',
  },
  btnDangerTxt: { color: '#f87171', fontSize: 14.5, fontWeight: '700' },

  // Delete confirmation
  confirmScrim: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center',
    padding: 24, borderRadius: 28,
  },
  confirmCard: {
    width: '100%', backgroundColor: '#1e1e1e', borderWidth: 1, borderColor: '#2e2e2e',
    borderRadius: 16, padding: 18,
  },
  confirmTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 8 },
  confirmText:  { color: '#9a9a9a', fontSize: 12.5, lineHeight: 19 },
});
