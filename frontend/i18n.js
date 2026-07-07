// Interface i18n: menu/screen chrome only. Bubble content (recognized speech,
// translations, scenario names, the Korean typing overlay) is deliberately
// NOT covered here — those are tied to the conversation's actual languages,
// not the reader's interface preference. See CLAUDE.md "Interface language".

// Native autonyms — shown in language pickers regardless of current UI language.
export const INTERFACE_LANGUAGES = [
  { code: 'ru', label: 'Русский' },
  { code: 'en', label: 'English' },
  { code: 'ko', label: '한국어' },
  { code: 'ja', label: '日本語' },
  { code: 'zh', label: '中文' },
  { code: 'uz', label: 'Oʻzbekcha' },
  { code: 'kk', label: 'Қазақша' },
  { code: 'ky', label: 'Кыргызча' },
  { code: 'mn', label: 'Монгол' },
];

// Source-bubble languages — the second bubble is always Korean, so it's excluded here.
export const SOURCE_LANGUAGES = INTERFACE_LANGUAGES.filter(l => l.code !== 'ko');

// BCP-47 tags for on-device speech recognition (expo-speech-recognition) and
// TTS (expo-speech). Actual availability of ru/en/ja/zh depends on the
// device's installed voice/recognition packs; uz/kk/ky/mn are frequently
// missing entirely on stock Android — STT/TTS will simply fail to start for
// those, same as any unsupported locale on the OS.
export const LANG_LOCALE = {
  ru: 'ru-RU', en: 'en-US', ko: 'ko-KR', ja: 'ja-JP', zh: 'zh-CN',
  uz: 'uz-UZ', kk: 'kk-KZ', ky: 'ky-KG', mn: 'mn-MN',
};

// Russian-language names of each language, because backend/server.js's prompt
// templates are written in Russian and substitute {fromLang}/{toLang} as
// Russian words (e.g. "Переведи с {fromLang} на {toLang}") — this has nothing
// to do with the interface language above, it's just the prompt's own tongue.
export const LANG_RU_NAME = {
  ru: 'русский', en: 'английский', ko: 'корейский', ja: 'японский', zh: 'китайский',
  uz: 'узбекский', kk: 'казахский', ky: 'киргизский', mn: 'монгольский',
};

const S = {
  ok: { ru: 'Понятно', en: 'Got it', ko: '확인', ja: '了解', zh: '知道了', uz: 'Tushunarli', kk: 'Түсінікті', ky: 'Түшүнүктүү', mn: 'Ойлгож байна' },
  cancel: { ru: 'Отмена', en: 'Cancel', ko: '취소', ja: 'キャンセル', zh: '取消', uz: 'Bekor qilish', kk: 'Бас тарту', ky: 'Жокко чыгаруу', mn: 'Цуцлах' },
  save: { ru: 'Сохранить', en: 'Save', ko: '저장', ja: '保存', zh: '保存', uz: 'Saqlash', kk: 'Сақтау', ky: 'Сактоо', mn: 'Хадгалах' },
  create: { ru: 'Создать', en: 'Create', ko: '생성', ja: '作成', zh: '创建', uz: 'Yaratish', kk: 'Жасау', ky: 'Түзүү', mn: 'Үүсгэх' },
  delete: { ru: 'Удалить', en: 'Delete', ko: '삭제', ja: '削除', zh: '删除', uz: "O'chirish", kk: 'Жою', ky: 'Өчүрүү', mn: 'Устгах' },
  yes: { ru: 'Да', en: 'Yes', ko: '예', ja: 'はい', zh: '是', uz: 'Ha', kk: 'Иә', ky: 'Ооба', mn: 'Тийм' },
  no: { ru: 'Нет', en: 'No', ko: '아니요', ja: 'いいえ', zh: '否', uz: "Yo'q", kk: 'Жоқ', ky: 'Жок', mn: 'Үгүй' },
  back: { ru: 'Назад', en: 'Back', ko: '뒤로', ja: '戻る', zh: '返回', uz: 'Orqaga', kk: 'Артқа', ky: 'Артка', mn: 'Буцах' },
  noServerConnection: { ru: 'Нет соединения с сервером', en: 'No connection to the server', ko: '서버에 연결할 수 없습니다', ja: 'サーバーに接続できません', zh: '无法连接到服务器', uz: 'Server bilan aloqa yo\'q', kk: 'Серверге қосылу жоқ', ky: 'Сервер менен байланыш жок', mn: 'Сервертэй холбогдож чадсангүй' },
  exitConfirm: { ru: 'Для выхода из приложения нажмите назад ещё раз', en: 'Press back again to exit the app', ko: '앱을 종료하려면 뒤로 버튼을 한 번 더 누르세요', ja: 'もう一度戻るボタンを押すとアプリを終了します', zh: '再次按返回键退出应用', uz: 'Ilovadan chiqish uchun orqaga tugmasini yana bir marta bosing', kk: 'Қолданбадан шығу үшін артқа батырмасын тағы басыңыз', ky: 'Тиркемеден чыгуу үчүн артка баскычын дагы бир жолу басыңыз', mn: 'Аппаас гарахын тулд буцах товчийг дахин дарна уу' },

  // Auth: sign in
  welcomeBack: { ru: 'С возвращением', en: 'Welcome back', ko: '다시 오신 것을 환영합니다', ja: 'おかえりなさい', zh: '欢迎回来', uz: 'Xush kelibsiz', kk: 'Қайта келгеніңізге қуаныштымыз', ky: 'Кайра келгениңизге кубанычтабыз', mn: 'Тавтай морилно уу' },
  signInSubtitle: { ru: 'Войдите, чтобы продолжить', en: 'Sign in to continue', ko: '계속하려면 로그인하세요', ja: '続けるにはサインインしてください', zh: '登录以继续', uz: 'Davom etish uchun tizimga kiring', kk: 'Жалғастыру үшін кіріңіз', ky: 'Улантуу үчүн кириңиз', mn: 'Үргэлжлүүлэхийн тулд нэвтэрнэ үү' },
  emailLabel: { ru: 'Email', en: 'Email', ko: '이메일', ja: 'メール', zh: '邮箱', uz: 'Email', kk: 'Email', ky: 'Email', mn: 'И-мэйл' },
  passwordLabel: { ru: 'Пароль', en: 'Password', ko: '비밀번호', ja: 'パスワード', zh: '密码', uz: 'Parol', kk: 'Құпия сөз', ky: 'Сыр сөз', mn: 'Нууц үг' },
  forgotPassword: { ru: 'Забыли пароль?', en: 'Forgot password?', ko: '비밀번호를 잊으셨나요?', ja: 'パスワードをお忘れですか？', zh: '忘记密码？', uz: 'Parolni unutdingizmi?', kk: 'Құпия сөзді ұмыттыңыз ба?', ky: 'Сыр сөздү унутуп калдыңызбы?', mn: 'Нууц үгээ мартсан уу?' },
  loginBtn: { ru: 'Войти', en: 'Sign in', ko: '로그인', ja: 'サインイン', zh: '登录', uz: 'Kirish', kk: 'Кіру', ky: 'Кирүү', mn: 'Нэвтрэх' },
  loginFailedDefault: { ru: 'Не удалось войти', en: 'Could not sign in', ko: '로그인하지 못했습니다', ja: 'サインインできませんでした', zh: '登录失败', uz: 'Kirib bo\'lmadi', kk: 'Кіру мүмкін болмады', ky: 'Кирүү мүмкүн болбоду', mn: 'Нэвтэрч чадсангүй' },
  noAccount: { ru: 'Нет аккаунта? ', en: "Don't have an account? ", ko: '계정이 없으신가요? ', ja: 'アカウントをお持ちでないですか？ ', zh: '还没有账号？ ', uz: 'Hisobingiz yo\'qmi? ', kk: 'Аккаунтыңыз жоқ па? ', ky: 'Аккаунтуңуз жокпу? ', mn: 'Бүртгэлгүй байна уу? ' },
  signUpLink: { ru: 'Зарегистрироваться', en: 'Sign up', ko: '회원가입', ja: '新規登録', zh: '注册', uz: "Ro'yxatdan o'tish", kk: 'Тіркелу', ky: 'Каттоо', mn: 'Бүртгүүлэх' },
  guestBtn: { ru: 'Продолжить как гость', en: 'Continue as guest', ko: '게스트로 계속하기', ja: 'ゲストとして続ける', zh: '以访客身份继续', uz: 'Mehmon sifatida davom etish', kk: 'Қонақ ретінде жалғастыру', ky: 'Конок катары улантуу', mn: 'Зочноор үргэлжлүүлэх' },
  guestSub: { ru: 'без контекстного перевода', en: 'without contextual translation', ko: '맥락 기반 번역 없이', ja: 'コンテキスト翻訳なし', zh: '不使用情境翻译', uz: 'kontekstli tarjimasiz', kk: 'контекстік аудармасыз', ky: 'контексттик котормосуз', mn: 'агуулгын орчуулгагүйгээр' },

  // Auth: sign up
  createAccount: { ru: 'Создать аккаунт', en: 'Create account', ko: '계정 만들기', ja: 'アカウント作成', zh: '创建账号', uz: 'Hisob yaratish', kk: 'Аккаунт жасау', ky: 'Аккаунт түзүү', mn: 'Бүртгэл үүсгэх' },
  weakPassword: { ru: 'Слабый пароль', en: 'Weak password', ko: '약한 비밀번호', ja: '弱いパスワード', zh: '密码强度弱', uz: 'Zaif parol', kk: 'Әлсіз құпия сөз', ky: 'Алсыз сыр сөз', mn: 'Сул нууц үг' },
  mediumPassword: { ru: 'Средний пароль', en: 'Medium password', ko: '보통 비밀번호', ja: '普通のパスワード', zh: '密码强度中等', uz: 'O\'rtacha parol', kk: 'Орташа құпия сөз', ky: 'Орто сыр сөз', mn: 'Дунд зэргийн нууц үг' },
  strongPassword: { ru: 'Надёжный пароль', en: 'Strong password', ko: '강력한 비밀번호', ja: '強力なパスワード', zh: '密码强度高', uz: 'Kuchli parol', kk: 'Мықты құпия сөз', ky: 'Күчтүү сыр сөз', mn: 'Хүчтэй нууц үг' },
  reqMinLength: { ru: 'Минимум 8 символов', en: 'At least 8 characters', ko: '최소 8자 이상', ja: '8文字以上', zh: '至少8个字符', uz: 'Kamida 8 ta belgi', kk: 'Кемінде 8 таңба', ky: 'Жок дегенде 8 белги', mn: 'Хамгийн багадаа 8 тэмдэгт' },
  reqUpperLower: { ru: 'Заглавная и строчная буквы', en: 'Upper and lower case letters', ko: '대문자와 소문자', ja: '大文字と小文字', zh: '大小写字母', uz: 'Katta va kichik harflar', kk: 'Бас және кіші әріптер', ky: 'Баш жана кичине тамгалар', mn: 'Том, жижиг үсэг' },
  reqDigit: { ru: 'Хотя бы одна цифра', en: 'At least one digit', ko: '숫자 최소 1개', ja: '数字を1つ以上', zh: '至少一个数字', uz: 'Kamida bitta raqam', kk: 'Кемінде бір сан', ky: 'Жок дегенде бир сан', mn: 'Хамгийн багадаа нэг тоо' },
  reqSpecial: { ru: 'Спецсимвол (!@#$…)', en: 'Special character (!@#$…)', ko: '특수문자 (!@#$…)', ja: '記号 (!@#$…)', zh: '特殊符号 (!@#$…)', uz: 'Maxsus belgi (!@#$…)', kk: 'Арнайы таңба (!@#$…)', ky: 'Атайын белги (!@#$…)', mn: 'Тусгай тэмдэгт (!@#$…)' },
  invalidEmail: { ru: 'Введите корректный email', en: 'Enter a valid email', ko: '올바른 이메일을 입력하세요', ja: '正しいメールアドレスを入力してください', zh: '请输入有效的邮箱', uz: 'To\'g\'ri email kiriting', kk: 'Дұрыс email енгізіңіз', ky: 'Туура email киргизиңиз', mn: 'Зөв и-мэйл хаяг оруулна уу' },
  signupFailedDefault: { ru: 'Не удалось создать аккаунт', en: 'Could not create account', ko: '계정을 만들지 못했습니다', ja: 'アカウントを作成できませんでした', zh: '创建账号失败', uz: 'Hisob yaratib bo\'lmadi', kk: 'Аккаунт жасау мүмкін болмады', ky: 'Аккаунт түзүү мүмкүн болбоду', mn: 'Бүртгэл үүсгэж чадсангүй' },
  continueBtn: { ru: 'Продолжить', en: 'Continue', ko: '계속', ja: '続ける', zh: '继续', uz: 'Davom etish', kk: 'Жалғастыру', ky: 'Улантуу', mn: 'Үргэлжлүүлэх' },

  // Auth: verify code
  enterCode: { ru: 'Введите код', en: 'Enter the code', ko: '코드를 입력하세요', ja: 'コードを入力してください', zh: '请输入验证码', uz: 'Kodni kiriting', kk: 'Кодты енгізіңіз', ky: 'Кодду киргизиңиз', mn: 'Кодоо оруулна уу' },
  codeSentTo: { ru: 'Мы отправили 6-значный код на', en: 'We sent a 6-digit code to', ko: '6자리 코드를 다음 주소로 보냈습니다', ja: '6桁のコードを送信しました：', zh: '我们已将6位验证码发送至', uz: '6 xonali kodni yubordik:', kk: '6 таңбалы кодты жібердік:', ky: '6 сандык кодду жөнөттүк:', mn: '6 оронтой кодыг илгээлээ:' },
  invalidCodeDefault: { ru: 'Неверный код', en: 'Invalid code', ko: '코드가 올바르지 않습니다', ja: 'コードが正しくありません', zh: '验证码错误', uz: 'Kod noto\'g\'ri', kk: 'Код қате', ky: 'Код туура эмес', mn: 'Код буруу байна' },
  attemptsRemaining: { ru: '. Осталось {n} попытки', en: '. {n} attempts left', ko: '. {n}회 남았습니다', ja: '。残り{n}回', zh: '。剩余{n}次', uz: '. {n} urinish qoldi', kk: '. {n} әрекет қалды', ky: '. {n} аракет калды', mn: '. {n} оролдлого үлдлээ' },
  resendIn: { ru: 'Отправить повторно через', en: 'Resend in', ko: '재전송까지', ja: '再送信まで', zh: '重新发送倒计时', uz: 'Qayta yuborish', kk: 'Қайта жіберу', ky: 'Кайра жөнөтүү', mn: 'Дахин илгээх' },
  resendCode: { ru: 'Отправить код повторно', en: 'Resend code', ko: '코드 재전송', ja: 'コードを再送信', zh: '重新发送验证码', uz: 'Kodni qayta yuborish', kk: 'Кодты қайта жіберу', ky: 'Кодду кайра жөнөтүү', mn: 'Кодыг дахин илгээх' },

  // Auth: forgot / reset password
  resetPasswordTitle: { ru: 'Восстановление пароля', en: 'Password reset', ko: '비밀번호 재설정', ja: 'パスワードの再設定', zh: '重置密码', uz: 'Parolni tiklash', kk: 'Құпия сөзді қалпына келтіру', ky: 'Сыр сөздү калыбына келтирүү', mn: 'Нууц үг сэргээх' },
  resetPasswordSubtitle: { ru: 'Введите email, привязанный к аккаунту, — мы отправим код для сброса пароля.', en: 'Enter the email linked to your account — we\'ll send a code to reset your password.', ko: '계정에 연결된 이메일을 입력하세요 — 비밀번호 재설정 코드를 보내드립니다.', ja: 'アカウントに登録されたメールアドレスを入力してください。パスワード再設定用のコードをお送りします。', zh: '请输入与账号关联的邮箱——我们会发送重置密码的验证码。', uz: 'Hisobingizga bog\'langan email\'ni kiriting — parolni tiklash uchun kod yuboramiz.', kk: 'Аккаунтқа байланысты email енгізіңіз — құпия сөзді қалпына келтіру үшін код жібереміз.', ky: 'Аккаунтка байланыштуу email киргизиңиз — сыр сөздү калыбына келтирүү үчүн код жөнөтөбүз.', mn: 'Бүртгэлтэй холбоотой и-мэйл хаягаа оруулна уу — нууц үг сэргээх код илгээнэ.' },
  sendCodeBtn: { ru: 'Отправить код', en: 'Send code', ko: '코드 보내기', ja: 'コードを送信', zh: '发送验证码', uz: 'Kodni yuborish', kk: 'Кодты жіберу', ky: 'Кодду жөнөтүү', mn: 'Код илгээх' },
  resetRequestFailedDefault: { ru: 'Не удалось отправить код', en: 'Could not send the code', ko: '코드를 보내지 못했습니다', ja: 'コードを送信できませんでした', zh: '发送验证码失败', uz: 'Kodni yuborib bo\'lmadi', kk: 'Кодты жіберу мүмкін болмады', ky: 'Кодду жөнөтүү мүмкүн болбоду', mn: 'Код илгээж чадсангүй' },
  newPasswordTitle: { ru: 'Новый пароль', en: 'New password', ko: '새 비밀번호', ja: '新しいパスワード', zh: '新密码', uz: 'Yangi parol', kk: 'Жаңа құпия сөз', ky: 'Жаңы сыр сөз', mn: 'Шинэ нууц үг' },
  newPasswordSubtitle: { ru: 'Придумайте новый пароль для входа в аккаунт', en: 'Create a new password for your account', ko: '계정에 사용할 새 비밀번호를 만드세요', ja: 'アカウント用の新しいパスワードを作成してください', zh: '为您的账号设置新密码', uz: 'Hisobingiz uchun yangi parol yarating', kk: 'Аккаунтыңыз үшін жаңа құпия сөз жасаңыз', ky: 'Аккаунтуңуз үчүн жаңы сыр сөз түзүңүз', mn: 'Бүртгэлдээ шинэ нууц үг үүсгэнэ үү' },
  confirmPasswordLabel: { ru: 'Повторите пароль', en: 'Confirm password', ko: '비밀번호 확인', ja: 'パスワード（確認）', zh: '确认密码', uz: 'Parolni takrorlang', kk: 'Құпия сөзді қайталаңыз', ky: 'Сыр сөздү кайталаңыз', mn: 'Нууц үгээ давтана уу' },
  passwordsMismatch: { ru: 'Пароли не совпадают', en: 'Passwords don\'t match', ko: '비밀번호가 일치하지 않습니다', ja: 'パスワードが一致しません', zh: '两次密码不一致', uz: 'Parollar mos kelmadi', kk: 'Құпия сөздер сәйкес келмейді', ky: 'Сыр сөздөр дал келбейт', mn: 'Нууц үг таарахгүй байна' },
  savePasswordBtn: { ru: 'Сохранить пароль', en: 'Save password', ko: '비밀번호 저장', ja: 'パスワードを保存', zh: '保存密码', uz: 'Parolni saqlash', kk: 'Құпия сөзді сақтау', ky: 'Сыр сөздү сактоо', mn: 'Нууц үг хадгалах' },
  resetPasswordFailedDefault: { ru: 'Не удалось изменить пароль', en: 'Could not change the password', ko: '비밀번호를 변경하지 못했습니다', ja: 'パスワードを変更できませんでした', zh: '修改密码失败', uz: 'Parolni o\'zgartirib bo\'lmadi', kk: 'Құпия сөзді өзгерту мүмкін болмады', ky: 'Сыр сөздү өзгөртүү мүмкүн болбоду', mn: 'Нууц үгийг өөрчилж чадсангүй' },
  passwordChangedNotice: { ru: 'Пароль изменён. Войдите с новым паролем.', en: 'Password changed. Sign in with your new password.', ko: '비밀번호가 변경되었습니다. 새 비밀번호로 로그인하세요.', ja: 'パスワードが変更されました。新しいパスワードでサインインしてください。', zh: '密码已修改。请使用新密码登录。', uz: 'Parol o\'zgartirildi. Yangi parol bilan kiring.', kk: 'Құпия сөз өзгертілді. Жаңа құпия сөзбен кіріңіз.', ky: 'Сыр сөз өзгөртүлдү. Жаңы сыр сөз менен кириңиз.', mn: 'Нууц үг өөрчлөгдлөө. Шинэ нууц үгээрээ нэвтэрнэ үү.' },

  // History
  historyTitle: { ru: 'История', en: 'History', ko: '기록', ja: '履歴', zh: '历史记录', uz: 'Tarix', kk: 'Тарих', ky: 'Тарых', mn: 'Түүх' },
  scenarioFallback: { ru: 'Сценарий', en: 'Scenario', ko: '시나리오', ja: 'シナリオ', zh: '场景', uz: 'Ssenariy', kk: 'Сценарий', ky: 'Сценарий', mn: 'Хувилбар' },
  noHistory24h: { ru: 'Нет переводов за последние 24 часа', en: 'No translations in the last 24 hours', ko: '지난 24시간 동안 번역 기록이 없습니다', ja: '過去24時間の翻訳履歴はありません', zh: '最近24小时内没有翻译记录', uz: 'Oxirgi 24 soatda tarjima yo\'q', kk: 'Соңғы 24 сағатта аударма жоқ', ky: 'Акыркы 24 сааттын ичинде котормо жок', mn: 'Сүүлийн 24 цагт орчуулга байхгүй байна' },
  offlineTag: { ru: 'офлайн', en: 'offline', ko: '오프라인', ja: 'オフライン', zh: '离线', uz: 'oflayn', kk: 'офлайн', ky: 'оффлайн', mn: 'офлайн' },

  // Language packs
  languagePacks: { ru: 'Языковые пакеты', en: 'Language packs', ko: '언어 패키지', ja: '言語パック', zh: '语言包', uz: 'Til paketlari', kk: 'Тіл пакеттері', ky: 'Тил пакеттери', mn: 'Хэлний багц' },
  packsHint: { ru: 'Скачайте пакеты обоих языков, чтобы переводить без интернета и без учёта сценария — приложение переключится на них автоматически, если сервер недоступен.', en: 'Download both language packs to translate without internet and without a scenario — the app switches to them automatically if the server is unreachable.', ko: '인터넷 없이, 시나리오 없이 번역하려면 두 언어 패키지를 모두 다운로드하세요 — 서버에 연결할 수 없으면 앱이 자동으로 전환됩니다.', ja: 'インターネットなし・シナリオなしで翻訳するには両方の言語パックをダウンロードしてください。サーバーに接続できない場合、アプリは自動的に切り替わります。', zh: '下载两种语言包即可在无网络、无场景的情况下翻译——如果服务器不可用，应用会自动切换到离线模式。', uz: 'Internetsiz va ssenariysiz tarjima qilish uchun har ikkala til paketini yuklab oling — server ishlamasa, ilova avtomatik ravishda ularga o\'tadi.', kk: 'Интернетсіз және сценариясыз аудару үшін екі тілдің де пакетін жүктеп алыңыз — сервер қолжетімсіз болса, қолданба оларға автоматты түрде ауысады.', ky: 'Интернетсиз жана сценариссиз которуу үчүн эки тилдин тең пакетин жүктөп алыңыз — сервер жеткиликсиз болсо, тиркеме аларга автоматтык түрдө которулат.', mn: 'Интернэтгүй, хувилбаргүйгээр орчуулахын тулд хоёр хэлний багцыг татаж аваарай — сервер боломжгүй бол апп автоматаар тэдгээр рүү шилжинэ.' },
  downloaded: { ru: 'Скачан', en: 'Downloaded', ko: '다운로드됨', ja: 'ダウンロード済み', zh: '已下载', uz: 'Yuklab olindi', kk: 'Жүктелді', ky: 'Жүктөлдү', mn: 'Татагдсан' },
  notDownloaded: { ru: 'Не скачан', en: 'Not downloaded', ko: '다운로드되지 않음', ja: '未ダウンロード', zh: '未下载', uz: 'Yuklab olinmagan', kk: 'Жүктелмеген', ky: 'Жүктөлгөн жок', mn: 'Татагдаагүй' },
  download: { ru: 'Скачать', en: 'Download', ko: '다운로드', ja: 'ダウンロード', zh: '下载', uz: 'Yuklab olish', kk: 'Жүктеу', ky: 'Жүктөө', mn: 'Татах' },
  packsStatusFailed: { ru: 'Не удалось проверить статус пакетов', en: 'Could not check pack status', ko: '패키지 상태를 확인하지 못했습니다', ja: 'パックの状態を確認できませんでした', zh: '无法检查语言包状态', uz: 'Paket holatini tekshirib bo\'lmadi', kk: 'Пакет күйін тексеру мүмкін болмады', ky: 'Пакеттин абалын текшерүү мүмкүн болбоду', mn: 'Багцын төлөвийг шалгаж чадсангүй' },
  packsDownloadFailed: { ru: 'Не удалось скачать пакет — проверьте соединение', en: 'Could not download the pack — check your connection', ko: '패키지를 다운로드하지 못했습니다 — 연결을 확인하세요', ja: 'パックをダウンロードできませんでした。接続を確認してください', zh: '下载语言包失败——请检查网络连接', uz: 'Paketni yuklab bo\'lmadi — aloqani tekshiring', kk: 'Пакетті жүктеу мүмкін болмады — байланысты тексеріңіз', ky: 'Пакетти жүктөө мүмкүн болбоду — байланышты текшериңиз', mn: 'Багцыг татаж чадсангүй — холболтоо шалгана уу' },
  packsDeleteFailed: { ru: 'Не удалось удалить пакет', en: 'Could not delete the pack', ko: '패키지를 삭제하지 못했습니다', ja: 'パックを削除できませんでした', zh: '删除语言包失败', uz: 'Paketni o\'chirib bo\'lmadi', kk: 'Пакетті жою мүмкін болмады', ky: 'Пакетти өчүрүү мүмкүн болбоду', mn: 'Багцыг устгаж чадсангүй' },
  wifiOnly: { ru: 'Скачивать только по Wi-Fi', en: 'Download over Wi-Fi only', ko: 'Wi-Fi로만 다운로드', ja: 'Wi-Fiでのみダウンロード', zh: '仅通过Wi-Fi下载', uz: 'Faqat Wi-Fi orqali yuklab olish', kk: 'Тек Wi-Fi арқылы жүктеу', ky: 'Жалгыз Wi-Fi аркылуу жүктөө', mn: 'Зөвхөн Wi-Fi-аар татах' },

  // Main screen chrome
  appBrand: { ru: 'One to 한', en: 'One to 한', ko: 'One to 한', ja: 'One to 한', zh: 'One to 한', uz: 'One to 한', kk: 'One to 한', ky: 'One to 한', mn: 'One to 한' },
  guestLabel: { ru: 'Гость', en: 'Guest', ko: '게스트', ja: 'ゲスト', zh: '访客', uz: 'Mehmon', kk: 'Қонақ', ky: 'Конок', mn: 'Зочин' },
  noScenarioGuest: { ru: 'Без сценария (гость)', en: 'No scenario (guest)', ko: '시나리오 없음 (게스트)', ja: 'シナリオなし（ゲスト）', zh: '无场景（访客）', uz: 'Ssenariysiz (mehmon)', kk: 'Сценариясыз (қонақ)', ky: 'Сценариссиз (конок)', mn: 'Хувилбаргүй (зочин)' },
  noScenarioSelected: { ru: 'Выберите сценарий', en: 'Choose a scenario', ko: '시나리오를 선택하세요', ja: 'シナリオを選択してください', zh: '请选择场景', uz: 'Ssenariyni tanlang', kk: 'Сценарийді таңдаңыз', ky: 'Сценарийди тандаңыз', mn: 'Хувилбар сонгоно уу' },
  noScenarioTab: { ru: 'Без сценария', en: 'No scenario', ko: '시나리오 없음', ja: 'シナリオなし', zh: '无场景', uz: 'Ssenariysiz', kk: 'Сценариясыз', ky: 'Сценариссиз', mn: 'Хувилбаргүй' },
  menuScenarios: { ru: 'Сценарии', en: 'Scenarios', ko: '시나리오', ja: 'シナリオ', zh: '场景', uz: 'Ssenariylar', kk: 'Сценарийлер', ky: 'Сценарийлер', mn: 'Хувилбарууд' },
  menuHistory: { ru: 'История', en: 'History', ko: '기록', ja: '履歴', zh: '历史记录', uz: 'Tarix', kk: 'Тарих', ky: 'Тарых', mn: 'Түүх' },
  menuTestConnection: { ru: 'Проверить связь', en: 'Test connection', ko: '연결 확인', ja: '接続テスト', zh: '测试连接', uz: 'Aloqani tekshirish', kk: 'Байланысты тексеру', ky: 'Байланышты текшерүү', mn: 'Холболт шалгах' },
  menuLanguagePacks: { ru: 'Языковые пакеты', en: 'Language packs', ko: '언어 패키지', ja: '言語パック', zh: '语言包', uz: 'Til paketlari', kk: 'Тіл пакеттері', ky: 'Тил пакеттери', mn: 'Хэлний багц' },
  menuInterfaceLanguage: { ru: 'Язык интерфейса', en: 'Interface language', ko: '인터페이스 언어', ja: 'インターフェース言語', zh: '界面语言', uz: 'Interfeys tili', kk: 'Интерфейс тілі', ky: 'Интерфейс тили', mn: 'Интерфэйсийн хэл' },
  lightTheme: { ru: 'Светлая тема', en: 'Light theme', ko: '라이트 테마', ja: 'ライトテーマ', zh: '浅色主题', uz: 'Yorug\' mavzu', kk: 'Ашық тақырып', ky: 'Ачык тема', mn: 'Цайвар загвар' },
  darkTheme: { ru: 'Тёмная тема', en: 'Dark theme', ko: '다크 테마', ja: 'ダークテーマ', zh: '深色主题', uz: 'Qorong\'i mavzu', kk: 'Қараңғы тақырып', ky: 'Караңгы тема', mn: 'Бараан загвар' },
  menuLogin: { ru: 'Войти', en: 'Sign in', ko: '로그인', ja: 'サインイン', zh: '登录', uz: 'Kirish', kk: 'Кіру', ky: 'Кирүү', mn: 'Нэвтрэх' },
  menuLogout: { ru: 'Выйти', en: 'Sign out', ko: '로그아웃', ja: 'サインアウト', zh: '退出登录', uz: 'Chiqish', kk: 'Шығу', ky: 'Чыгуу', mn: 'Гарах' },
  sourceLanguage: { ru: 'Исходный язык', en: 'Source language', ko: '원본 언어', ja: '元の言語', zh: '源语言', uz: 'Manba til', kk: 'Бастапқы тіл', ky: 'Баштапкы тил', mn: 'Эх хэл' },

  // Scenario-unavailable notice (themed, replaces Alert.alert)
  scenarioNoticeAccountTitle: { ru: 'Только с аккаунтом', en: 'Account required', ko: '계정이 필요합니다', ja: 'アカウントが必要です', zh: '需要账号', uz: 'Faqat hisob bilan', kk: 'Тек аккаунтпен', ky: 'Жалгыз аккаунт менен', mn: 'Зөвхөн бүртгэлтэй' },
  scenarioNoticeAccountText: { ru: 'Войдите в аккаунт, чтобы использовать перевод по сценариям.', en: 'Sign in to an account to use scenario-based translation.', ko: '시나리오 기반 번역을 사용하려면 계정에 로그인하세요.', ja: 'シナリオ翻訳を使うにはアカウントにサインインしてください。', zh: '登录账号即可使用基于场景的翻译。', uz: 'Ssenariy bo\'yicha tarjimadan foydalanish uchun hisobingizga kiring.', kk: 'Сценарий бойынша аударманы пайдалану үшін аккаунтқа кіріңіз.', ky: 'Сценарий боюнча котормону колдонуу үчүн аккаунтка кириңиз.', mn: 'Хувилбарт суурилсан орчуулгыг ашиглахын тулд бүртгэлдээ нэвтэрнэ үү.' },
  scenarioNoticeOfflineTitle: { ru: 'Нет подключения', en: 'No connection', ko: '연결 없음', ja: '接続がありません', zh: '无网络连接', uz: 'Ulanish yo\'q', kk: 'Байланыс жоқ', ky: 'Байланыш жок', mn: 'Холболт байхгүй' },
  scenarioNoticeOfflineText: { ru: 'Сценарии доступны только при наличии интернета.', en: 'Scenarios are only available with an internet connection.', ko: '시나리오는 인터넷에 연결된 경우에만 사용할 수 있습니다.', ja: 'シナリオはインターネット接続時のみ利用できます。', zh: '场景仅在联网时可用。', uz: 'Ssenariylar faqat internet mavjud bo\'lganda ishlaydi.', kk: 'Сценарийлер тек интернет болғанда қолжетімді.', ky: 'Сценарийлер интернет болгондо гана жеткиликтүү.', mn: 'Хувилбарууд зөвхөн интернэттэй үед боломжтой.' },

  // Scenario picker sheet
  scenarioSheetTitle: { ru: 'Сценарий', en: 'Scenario', ko: '시나리오', ja: 'シナリオ', zh: '场景', uz: 'Ssenariy', kk: 'Сценарий', ky: 'Сценарий', mn: 'Хувилбар' },
  pinnedSection: { ru: 'Закреплено ({n}/{max})', en: 'Pinned ({n}/{max})', ko: '고정됨 ({n}/{max})', ja: 'ピン留め ({n}/{max})', zh: '已固定 ({n}/{max})', uz: 'Mahkamlangan ({n}/{max})', kk: 'Бекітілген ({n}/{max})', ky: 'Бекитилген ({n}/{max})', mn: 'Бэхэлсэн ({n}/{max})' },
  restSection: { ru: 'Остальные', en: 'Others', ko: '기타', ja: 'その他', zh: '其他', uz: 'Boshqalar', kk: 'Басқалары', ky: 'Башкалар', mn: 'Бусад' },
  pinLimitToast: { ru: 'Можно закрепить не более {max}', en: 'You can pin up to {max}', ko: '최대 {max}개까지 고정할 수 있습니다', ja: '最大{max}件までピン留めできます', zh: '最多可固定{max}个', uz: 'Ko\'pi bilan {max} tagacha mahkamlash mumkin', kk: 'Ең көбі {max} бекітуге болады', ky: 'Эң köбü {max} бекитүүгө болот', mn: 'Хамгийн ихдээ {max} хүртэл бэхлэх боломжтой' },
  addScenario: { ru: 'Добавить сценарий', en: 'Add scenario', ko: '시나리오 추가', ja: 'シナリオを追加', zh: '添加场景', uz: 'Ssenariy qo\'shish', kk: 'Сценарий қосу', ky: 'Сценарий кошуу', mn: 'Хувилбар нэмэх' },
  newScenario: { ru: 'Новый сценарий', en: 'New scenario', ko: '새 시나리오', ja: '新しいシナリオ', zh: '新建场景', uz: 'Yangi ssenariy', kk: 'Жаңа сценарий', ky: 'Жаңы сценарий', mn: 'Шинэ хувилбар' },
  nameLabel: { ru: 'Название', en: 'Name', ko: '이름', ja: '名前', zh: '名称', uz: 'Nomi', kk: 'Атауы', ky: 'Аталышы', mn: 'Нэр' },
  namePlaceholder: { ru: 'Например: На рынке', en: 'E.g.: At the market', ko: '예: 시장에서', ja: '例：市場で', zh: '例如：在市场', uz: 'Masalan: Bozorda', kk: 'Мысалы: Базарда', ky: 'Мисалы: Базарда', mn: 'Жишээ нь: Зах дээр' },
  promptLabel: { ru: 'Промпт', en: 'Prompt', ko: '프롬프트', ja: 'プロンプト', zh: '提示词', uz: 'Prompt', kk: 'Промпт', ky: 'Промпт', mn: 'Промпт' },
  promptPlaceholder: { ru: 'Опишите контекст и стиль перевода.\n{fromLang} и {toLang} подставятся автоматически.', en: 'Describe the context and translation style.\n{fromLang} and {toLang} are substituted automatically.', ko: '맥락과 번역 스타일을 설명하세요.\n{fromLang}와(과) {toLang}은(는) 자동으로 대입됩니다.', ja: '文脈と翻訳スタイルを記述してください。\n{fromLang}と{toLang}は自動的に置き換わります。', zh: '描述翻译的语境和风格。\n{fromLang}和{toLang}会自动替换。', uz: 'Kontekst va tarjima uslubini tasvirlang.\n{fromLang} va {toLang} avtomatik almashtiriladi.', kk: 'Аударманың контексті мен стилін сипаттаңыз.\n{fromLang} мен {toLang} автоматты түрде ауыстырылады.', ky: 'Котормонун контекстин жана стилин сүрөттөңүз.\n{fromLang} жана {toLang} автоматтык түрдө алмаштырылат.', mn: 'Орчуулгын нөхцөл байдал, хэв маягийг тайлбарлана уу.\n{fromLang}, {toLang} автоматаар орлогдоно.' },
  fillBothFields: { ru: 'Заполните оба поля', en: 'Fill in both fields', ko: '두 항목을 모두 입력하세요', ja: '両方の項目を入力してください', zh: '请填写两个字段', uz: 'Ikkala maydonni ham to\'ldiring', kk: 'Екі өрісті де толтырыңыз', ky: 'Эки талааны тең толтуруңуз', mn: 'Хоёр талбарыг бөглөнө үү' },
  createFailedDefault: { ru: 'Не удалось создать сценарий', en: 'Could not create scenario', ko: '시나리오를 만들지 못했습니다', ja: 'シナリオを作成できませんでした', zh: '创建场景失败', uz: 'Ssenariy yaratib bo\'lmadi', kk: 'Сценарий жасау мүмкін болмады', ky: 'Сценарий түзүү мүмкүн болбоду', mn: 'Хувилбар үүсгэж чадсангүй' },
  generateBtn: { ru: 'Сгенерировать', en: 'Generate', ko: '생성', ja: '生成', zh: '生成', uz: 'Yaratish', kk: 'Жасау', ky: 'Түзүү', mn: 'Үүсгэх' },
  generateNameRequired: { ru: 'Сначала введите название сценария', en: 'Enter a scenario name first', ko: '먼저 시나리오 이름을 입력하세요', ja: 'まずシナリオ名を入力してください', zh: '请先输入场景名称', uz: 'Avval ssenariy nomini kiriting', kk: 'Алдымен сценарий атауын енгізіңіз', ky: 'Адегенде сценарий атын киргизиңиз', mn: 'Эхлээд хувилбарын нэрийг оруулна уу' },
  generateNoLogic: { ru: 'Не удалось понять сценарий по этому названию — уточните его', en: 'Could not make sense of a scenario from this name — try being more specific', ko: '이 이름으로는 시나리오를 이해할 수 없습니다 — 더 구체적으로 입력해 보세요', ja: 'この名前からシナリオを理解できませんでした。もう少し具体的にしてください', zh: '无法根据该名称理解场景——请更具体一些', uz: 'Bu nomdan ssenariyni tushunib bo\'lmadi — aniqroq yozing', kk: 'Бұл атаудан сценарийді түсіну мүмкін болмады — нақтылаңыз', ky: 'Бул аттан сценарийди түшүнүү мүмкүн болбоду — тактаңыз', mn: 'Энэ нэрээс хувилбарыг ойлгож чадсангүй — тодруулна уу' },
  generateFailedDefault: { ru: 'Не удалось сгенерировать промпт', en: 'Could not generate the prompt', ko: '프롬프트를 생성하지 못했습니다', ja: 'プロンプトを生成できませんでした', zh: '生成提示词失败', uz: 'Promptni yaratib bo\'lmadi', kk: 'Промптты жасау мүмкін болмады', ky: 'Промптту түзүү мүмкүн болбоду', mn: 'Промптыг үүсгэж чадсангүй' },
  generateLimitReached: { ru: 'Дневной лимит генераций исчерпан — попробуйте завтра', en: 'Daily generation limit reached — try again tomorrow', ko: '오늘의 생성 한도에 도달했습니다 — 내일 다시 시도하세요', ja: '本日の生成上限に達しました。明日また試してください', zh: '今日生成次数已用完——请明天再试', uz: 'Kunlik generatsiya limiti tugadi — ertaga urinib ko\'ring', kk: 'Күндізгі генерация лимиті таусылды — ертең қайталап көріңіз', ky: 'Күндүк генерация лимити түгөндү — эртең кайра аракет кылыңыз', mn: 'Өдрийн үүсгэх хязгаарт хүрлээ — маргааш дахин оролдоно уу' },
  loadPromptFailedDefault: { ru: 'Не удалось загрузить промпт', en: 'Could not load the prompt', ko: '프롬프트를 불러오지 못했습니다', ja: 'プロンプトを読み込めませんでした', zh: '加载提示词失败', uz: 'Promptni yuklab bo\'lmadi', kk: 'Промптты жүктеу мүмкін болмады', ky: 'Промптту жүктөө мүмкүн болбоду', mn: 'Промптыг ачааллаж чадсангүй' },
  saveFailedDefault: { ru: 'Не удалось сохранить', en: 'Could not save', ko: '저장하지 못했습니다', ja: '保存できませんでした', zh: '保存失败', uz: 'Saqlab bo\'lmadi', kk: 'Сақтау мүмкін болмады', ky: 'Сактоо мүмкүн болбоду', mn: 'Хадгалж чадсангүй' },
  deleteScenarioTitle: { ru: 'Удалить сценарий?', en: 'Delete scenario?', ko: '시나리오를 삭제할까요?', ja: 'シナリオを削除しますか？', zh: '删除该场景？', uz: 'Ssenariyni o\'chirasizmi?', kk: 'Сценарийді жоясыз ба?', ky: 'Сценарийди өчүрөсүзбү?', mn: 'Хувилбарыг устгах уу?' },
  deleteScenarioText: { ru: '«{name}» и его промпт будут удалены без возможности восстановить.', en: '"{name}" and its prompt will be deleted permanently.', ko: '"{name}" 및 해당 프롬프트가 영구적으로 삭제됩니다.', ja: '「{name}」とそのプロンプトは完全に削除されます。', zh: '"{name}" 及其提示词将被永久删除。', uz: '"{name}" va uning prompti butunlay o\'chiriladi.', kk: '"{name}" және оның промпты қайтарылмастай жойылады.', ky: '"{name}" жана анын промпту кайра калыбына келтирилгис өчүрүлөт.', mn: '"{name}" болон түүний промпт бүрмөсгүй устгагдана.' },

  // Connection test
  checking: { ru: 'проверка…', en: 'checking…', ko: '확인 중…', ja: '確認中…', zh: '检查中…', uz: 'tekshirilmoqda…', kk: 'тексерілуде…', ky: 'текшерилүүдө…', mn: 'шалгаж байна…' },
  noConnection: { ru: 'нет связи', en: 'no connection', ko: '연결 없음', ja: '接続なし', zh: '无连接', uz: 'aloqa yo\'q', kk: 'байланыс жоқ', ky: 'байланыш жок', mn: 'холболт байхгүй' },
  msSuffix: { ru: '{ms} мс', en: '{ms} ms', ko: '{ms}ms', ja: '{ms}ms', zh: '{ms}毫秒', uz: '{ms} ms', kk: '{ms} мс', ky: '{ms} мс', mn: '{ms} мс' },

  offlineFallbackMsg: { ru: 'Нет связи, офлайн-пакет не скачан. Скачайте его в меню → Языковые пакеты.', en: 'No connection, and the offline pack isn\'t downloaded. Download it via menu → Language packs.', ko: '연결이 없고 오프라인 패키지가 다운로드되어 있지 않습니다. 메뉴 → 언어 패키지에서 다운로드하세요.', ja: '接続がなく、オフラインパックもダウンロードされていません。メニュー → 言語パックからダウンロードしてください。', zh: '没有网络连接，且离线语言包未下载。请在菜单 → 语言包 中下载。', uz: 'Aloqa yo\'q va oflayn paket yuklab olinmagan. Uni menyu → Til paketlari orqali yuklab oling.', kk: 'Байланыс жоқ және офлайн пакет жүктелмеген. Оны мәзір → Тіл пакеттері арқылы жүктеп алыңыз.', ky: 'Байланыш жок жана оффлайн пакет жүктөлгөн эмес. Аны меню → Тил пакеттери аркылуу жүктөп алыңыз.', mn: 'Холболт байхгүй бөгөөд офлайн багц татагдаагүй байна. Цэс → Хэлний багц-аар дамжуулан татаж аваарай.' },

  // Source-bubble placeholders — unlike the rest of "bubble content", these
  // are chrome (an instructional hint shown when the bubble is empty, not
  // conversation content), so they follow interfaceLang like everything else.
  // The Korean bubble's placeholders stay fixed Korean (PH_KO_WAIT/PH_KO_ACTIVE
  // in App.js) since that side's language never changes.
  phRu: { ru: 'Коснитесь кнопки микрофона, чтобы перейти в голосовой режим, или текстовой области, чтобы ввести текст для перевода.', en: 'Tap the microphone button to switch to voice mode, or the text area to type text to translate.', ko: '마이크 버튼을 눌러 음성 모드로 전환하거나, 텍스트 영역을 눌러 번역할 텍스트를 입력하세요.', ja: 'マイクボタンをタップして音声モードに切り替えるか、テキストエリアをタップして翻訳するテキストを入力してください。', zh: '点击麦克风按钮切换到语音模式，或点击文本区域输入要翻译的文字。', uz: "Ovozli rejimga o'tish uchun mikrofon tugmasini bosing yoki tarjima qilish uchun matn kiritish uchun matn maydonini bosing.", kk: 'Дауыстық режимге өту үшін микрофон түймесін басыңыз немесе аударатын мәтінді енгізу үшін мәтін өрісін түртіңіз.', ky: 'Үн режимине өтүү үчүн микрофон баскычын басыңыз же которула турган текстти киргизүү үчүн текст талаасын басыңыз.', mn: 'Дуут горимд шилжихийн тулд микрофоны товчийг дар, эсвэл орчуулах текст оруулахын тулд текстийн хэсгийг дар.' },
  phRuWait: { ru: 'Ожидайте ответ собеседника', en: 'Wait for the other person\'s reply', ko: '상대방의 응답을 기다려 주세요', ja: '相手の返信をお待ちください', zh: '请等待对方回复', uz: 'Suhbatdoshning javobini kuting', kk: 'Сұхбаттасушының жауабын күтіңіз', ky: 'Маектешиңиздин жообун күтүңүз', mn: 'Ярилцагчийн хариуг хүлээнэ үү' },
};

// Display names for the built-in (seeded) scenarios, keyed by the stable
// `slug` backend/scenarios.js attaches to built-in rows (see migration
// 003_scenarios_db_storage.sql) — NOT the Supabase `id`, which is a uuid and
// isn't stable across a seed re-run. Custom user-created scenarios have no
// slug (and no entry here) — scenarioName() falls back to the raw name,
// since free-text names typed by the user can't be auto-translated.
const SCENARIO_NAMES = {
  'stranger-on-street': { ru: 'Незнакомец на улице', en: 'Stranger on the street', ko: '길거리의 낯선 사람', ja: '道で出会う見知らぬ人', zh: '街上的陌生人', uz: "Ko'chadagi notanish odam", kk: 'Көшедегі бейтаныс адам', ky: 'Көчөдөгү бейтааныш адам', mn: 'Гудамжны танихгүй хүн' },
  'v-magazine':        { ru: 'В магазине', en: 'At the store', ko: '상점에서', ja: '店で', zh: '在商店', uz: "Do'konda", kk: 'Дүкенде', ky: 'Дүкөндө', mn: 'Дэлгүүрт' },
  'v-restorane':       { ru: 'В ресторане', en: 'At the restaurant', ko: '레스토랑에서', ja: 'レストランで', zh: '在餐厅', uz: 'Restoranda', kk: 'Мейрамханада', ky: 'Ресторанда', mn: 'Ресторанд' },
  'v-banke':           { ru: 'В банке', en: 'At the bank', ko: '은행에서', ja: '銀行で', zh: '在银行', uz: 'Bankda', kk: 'Банкте', ky: 'Банкта', mn: 'Банкинд' },
  'v-bolnitse':        { ru: 'В больнице', en: 'At the hospital', ko: '병원에서', ja: '病院で', zh: '在医院', uz: 'Kasalxonada', kk: 'Ауруханада', ky: 'Ооруканада', mn: 'Эмнэлэгт' },
  'v-otele':           { ru: 'В отеле', en: 'At the hotel', ko: '호텔에서', ja: 'ホテルで', zh: '在酒店', uz: 'Mehmonxonada', kk: 'Қонақүйде', ky: 'Мейманканада', mn: 'Зочид буудалд' },
  'v-transporte':      { ru: 'В транспорте', en: 'On public transport', ko: '대중교통에서', ja: '交通機関で', zh: '在交通工具上', uz: 'Transportda', kk: 'Көлікте', ky: 'Транспортто', mn: 'Тээвэрт' },
  'v-vetklinike':      { ru: 'В ветеринарной клинике', en: 'At the vet clinic', ko: '동물병원에서', ja: '動物病院で', zh: '在兽医诊所', uz: 'Veterinariya klinikasida', kk: 'Ветеринариялық клиникада', ky: 'Ветеринардык клиникада', mn: 'Мал эмнэлэгт' },
};

// scenario is { id, name, slug? } — slug is only present for built-ins.
// Falls back to the raw stored name for custom scenarios or any slug/id not
// in SCENARIO_NAMES.
export function scenarioName(lang, scenario) {
  if (!scenario) return '';
  const names = SCENARIO_NAMES[scenario.slug || scenario.id];
  return (names && (names[lang] || names.ru)) || scenario.name;
}

// t('key') or t('key', { n: 3 }) — {placeholders} in the string are replaced
// from vars. Falls back to Russian, then to the raw key, if a translation is missing.
export function t(lang, key, vars) {
  const entry = S[key];
  if (!entry) return key;
  let str = entry[lang] ?? entry.ru ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), v);
    }
  }
  return str;
}
