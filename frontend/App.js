import { useState, useRef, useEffect, useCallback } from 'react';
import {
  StyleSheet, Text, View, TouchableOpacity, ActivityIndicator,
  ScrollView, FlatList, Modal, TextInput, Keyboard,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';

// ── Config ───────────────────────────────────────────────────────────────────
const BACKEND_URL   = 'http://100.68.162.96:3000';
const HISTORY_KEY   = 'translation_history';
const SCENARIOS_KEY = 'translator_scenarios';
const HISTORY_TTL   = 24 * 60 * 60 * 1000;
const SILENCE_MS    = 7000;

const DEFAULT_SCENARIOS = [
  { id: 'stranger-on-street', name: 'Незнакомец на улице' },
  { id: 'v-magazine',         name: 'В магазине'          },
  { id: 'v-restorane',        name: 'В ресторане'         },
  { id: 'v-banke',            name: 'В банке'             },
  { id: 'v-bolnitse',         name: 'В больнице'          },
  { id: 'v-otele',            name: 'В отеле'             },
  { id: 'v-transporte',       name: 'В транспорте'        },
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
function HistoryScreen({ history, onBack }) {
  return (
    <View style={S.histCont}>
      <StatusBar style="light" />
      <View style={S.histHead}>
        <TouchableOpacity onPress={onBack} style={S.backBtn}>
          <Text style={S.backTxt}>←</Text>
        </TouchableOpacity>
        <Text style={S.histTitle}>История (24 ч)</Text>
      </View>
      {history.length === 0 ? (
        <View style={S.histEmpty}>
          <Text style={S.histEmptyTxt}>Нет переводов за последние 24 часа</Text>
        </View>
      ) : (
        <FlatList
          data={history}
          keyExtractor={i => i.id}
          contentContainerStyle={S.histList}
          renderItem={({ item }) => {
            const isRu = item.direction === 'ru-ko';
            return (
              <View style={[S.chatWrap, isRu ? S.chatRight : S.chatLeft]}>
                <View style={[S.chatBub, isRu ? S.chatBubRu : S.chatBubKo]}>
                  <Text style={S.chatOrig}>{item.originalText}</Text>
                  <Text style={S.chatSep}>↓</Text>
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
  const [screen,     setScreen]     = useState('main');
  const [scenarios,  setScenarios]  = useState(DEFAULT_SCENARIOS);
  const [scenario,   setScenario]   = useState('Незнакомец на улице');
  const [showPicker, setShowPicker] = useState(false);
  const [showAdd,    setShowAdd]    = useState(false);
  const [addText,    setAddText]    = useState('');
  const [history,    setHistory]    = useState([]);
  const histRef = useRef([]);

  const [koRotated, setKoRotated] = useState(true);

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

  // ── Scenarios ─────────────────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(SCENARIOS_KEY);
        if (raw) {
          const saved = JSON.parse(raw);
          setScenarios(saved);
          if (saved.length && !saved.find(s => s.name === scenario)) {
            setScenario(saved[0].name);
          }
        } else {
          await AsyncStorage.setItem(SCENARIOS_KEY, JSON.stringify(DEFAULT_SCENARIOS));
        }
      } catch {}
    })();
  }, []);

  const persistScenarios = async list => {
    setScenarios(list);
    try { await AsyncStorage.setItem(SCENARIOS_KEY, JSON.stringify(list)); } catch {}
  };

  const handleAddScenario = async () => {
    const name = addText.trim();
    if (!name) return;
    const updated = [...scenarios, { id: 'custom-' + Date.now(), name }];
    await persistScenarios(updated);
    setAddText('');
    setShowAdd(false);
  };

  const handleDeleteScenario = async id => {
    const updated = scenarios.filter(s => s.id !== id);
    await persistScenarios(updated);
    const deleted = scenarios.find(s => s.id === id);
    if (deleted?.name === scenario && updated.length) setScenario(updated[0].name);
  };

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
        body:   JSON.stringify({ text, fromLang, toLang, context: scenario }),
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
    return <HistoryScreen history={history} onBack={() => setScreen('main')} />;
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
            <Text style={[S.micIcon, koRotated && S.micIconFlipped]}>
              {micRecording('ko') ? '⏹' : '🎤'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.flipBtn} onPress={() => setKoRotated(r => !r)}>
            <Text style={S.flipIcon}>🔄</Text>
          </TouchableOpacity>
        </View>

        {/* ── Korean bubble (rotated 180° for face-to-face) ── */}
        <TouchableOpacity
          style={[S.bubble, koRotated && S.bubbleKo, activeBubble === 'ko' && S.bubbleActive]}
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
            <Text style={S.clearTxt}>✕</Text>
          </TouchableOpacity>
          {/* TTS — top-left in rotated space */}
          <TouchableOpacity
            style={[S.ttsBtn, !koText && S.ttsBtnDim]}
            onPress={() => handleSpeak(koText, 'ko-KR')}
            disabled={!koText}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Text style={S.ttsTxt}>🔊</Text>
          </TouchableOpacity>
        </TouchableOpacity>

        {/* ── Gutter: scenario + history between bubbles ── */}
        <View style={S.gutter}>
          <TouchableOpacity style={S.scenBtn} onPress={() => setShowPicker(true)}>
            <Text style={S.scenTxt} numberOfLines={1}>{scenario}</Text>
            <Text style={S.scenChev}>▾</Text>
          </TouchableOpacity>
          <TouchableOpacity style={S.histBtn} onPress={() => setScreen('history')}>
            <Text style={S.histBtnTxt}>💬</Text>
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
            <Text style={S.clearTxt}>✕</Text>
          </TouchableOpacity>
          {/* TTS */}
          <TouchableOpacity
            style={[S.ttsBtn, !ruText && S.ttsBtnDim]}
            onPress={() => handleSpeak(ruText, 'ru-RU')}
            disabled={!ruText}
            hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
          >
            <Text style={S.ttsTxt}>🔊</Text>
          </TouchableOpacity>
        </TouchableOpacity>

        {/* ── Russian mic — physically at bottom ── */}
        <View style={S.ruMicRow}>
          <TouchableOpacity
            style={[S.micBtn, micRecording('ru') && S.micBtnRec, translating && S.micBtnDim]}
            onPress={() => handleMic('ru')}
            disabled={translating}
          >
            <Text style={S.micIcon}>{micRecording('ru') ? '⏹' : '🎤'}</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

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
        onRequestClose={() => { setShowPicker(false); setShowAdd(false); setAddText(''); }}
      >
        <TouchableOpacity
          style={S.overlay}
          activeOpacity={1}
          onPress={() => { setShowPicker(false); setShowAdd(false); setAddText(''); }}
        >
          <View style={S.sheet} onStartShouldSetResponder={() => true}>
            <View style={S.sheetHead}>
              <Text style={S.sheetTitle}>Сценарий</Text>
              <TouchableOpacity
                onPress={() => { setShowPicker(false); setShowAdd(false); setAddText(''); }}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
              >
                <Text style={S.sheetCloseTxt}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={S.sheetList} showsVerticalScrollIndicator={false}>
              {scenarios.map(s => (
                <View key={s.id} style={[S.sheetItem, scenario === s.name && S.sheetItemOn]}>
                  <TouchableOpacity
                    style={S.sheetItemLabel}
                    onPress={() => { setScenario(s.name); setShowPicker(false); setShowAdd(false); }}
                  >
                    <Text style={[S.sheetItemTxt, scenario === s.name && S.sheetItemTxtOn]}>
                      {s.name}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => handleDeleteScenario(s.id)}
                    hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                    style={S.sheetDelBtn}
                  >
                    <Text style={S.sheetDelTxt}>🗑</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            {showAdd ? (
              <View style={S.addRow}>
                <TextInput
                  style={S.addInput}
                  value={addText}
                  onChangeText={setAddText}
                  placeholder="Название сценария..."
                  placeholderTextColor="#555"
                  autoFocus
                  returnKeyType="done"
                  onSubmitEditing={handleAddScenario}
                />
                <TouchableOpacity style={S.addOkBtn} onPress={handleAddScenario}>
                  <Text style={S.addOkTxt}>✓</Text>
                </TouchableOpacity>
                <TouchableOpacity style={S.addCancelBtn} onPress={() => { setShowAdd(false); setAddText(''); }}>
                  <Text style={S.addCancelTxt}>✕</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={S.addBtn} onPress={() => setShowAdd(true)}>
                <Text style={S.addBtnTxt}>+ Добавить сценарий</Text>
              </TouchableOpacity>
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

  // Mic rows
  koMicRow: { height: 58, justifyContent: 'center', alignItems: 'center', position: 'relative' },
  ruMicRow: { height: 58, justifyContent: 'center', alignItems: 'center' },

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
  micIconFlipped: { transform: [{ rotate: '180deg' }] },

  // Bubbles
  bubble: {
    flex: 1, marginHorizontal: 14, marginVertical: 8,
    backgroundColor: '#161616',
    borderRadius: 20, borderWidth: 2, borderColor: '#1e1e1e',
    overflow: 'hidden',
  },
  bubbleKo:     { transform: [{ rotate: '180deg' }] },
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
    paddingTop: 8, paddingHorizontal: 20, paddingBottom: 44, maxHeight: '80%',
  },
  sheetHead: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#2a2a2a', marginBottom: 8,
  },
  sheetTitle:    { color: '#888', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1.2 },
  sheetCloseTxt: { color: '#666', fontSize: 20 },
  sheetList:     { maxHeight: 320 },
  sheetItem: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius: 12, marginBottom: 2, paddingRight: 8,
  },
  sheetItemOn:    { backgroundColor: '#252525' },
  sheetItemLabel: { flex: 1, paddingVertical: 14, paddingHorizontal: 12 },
  sheetItemTxt:   { color: '#aaa', fontSize: 17 },
  sheetItemTxtOn: { color: '#fff', fontWeight: '600' },
  sheetDelBtn:    { padding: 8 },
  sheetDelTxt:    { fontSize: 16 },
  addBtn: {
    marginTop: 12, paddingVertical: 14, alignItems: 'center',
    borderRadius: 12, borderWidth: 1, borderColor: '#2a2a2a', borderStyle: 'dashed',
  },
  addBtnTxt: { color: '#555', fontSize: 16 },
  addRow:    { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 8 },
  addInput: {
    flex: 1, backgroundColor: '#252525', borderRadius: 12,
    borderWidth: 1, borderColor: '#333', color: '#fff',
    fontSize: 16, paddingHorizontal: 14, paddingVertical: 11,
  },
  addOkBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1a5c2a', justifyContent: 'center', alignItems: 'center',
  },
  addOkTxt:     { color: '#4ade80', fontSize: 18, fontWeight: '700' },
  addCancelBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#2a1a1a', justifyContent: 'center', alignItems: 'center',
  },
  addCancelTxt: { color: '#f87171', fontSize: 16 },
});
