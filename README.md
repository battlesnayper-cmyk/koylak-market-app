# Koʻylak bot + boshqaruv paneli

Bu loyiha uchtasini birlashtiradi:
1. **Telegram bot** — botga yozgan har bir mijozni avtomatik roʻyxatga oladi.
2. **Boshqaruv paneli (dashboard)** — faqat sizga tegishli, Gmail yoki email/parol bilan kirasiz. Mijozlarni koʻrasiz, xabar yuborasiz, va katalogni (kategoriya + fasonlar) boshqarasiz.
3. **Mini app** — mijozlar koʻradigan katalog, dashboarddagi maʼlumotlarni avtomatik oʻzida koʻrsatadi.

## 1-qadam: Bot yarating
1. Telegram'da **@BotFather** ga yozing → `/newbot` → ism va username bering.
2. Sizga token beradi (masalan `123456:ABC-DEF...`) — saqlab qoʻying.

## 2-qadam: `.env` faylni tayyorlang
`.env.example` faylidan nusxa oling va `.env` deb nomlang, quyidagilarni toʻldiring:

- `BOT_TOKEN` — BotFather bergan token
- `ADMIN_EMAIL` — sizning email (Gmail bilan kirsangiz ham, oddiy email/parol bilan kirsangiz ham shu email ishlatiladi)
- `ADMIN_PASSWORD` — email/parol orqali kirish uchun oʻzingiz oʻylab topgan parol
- `SESSION_SECRET` — istalgan uzun tasodifiy matn (masalan: `a8f3k2m9x7q1...`)

### Gmail orqali kirishni yoqish (ixtiyoriy)
Agar "Google orqali kirish" tugmasi ishlashini xohlasangiz:
1. [Google Cloud Console](https://console.cloud.google.com/) → yangi loyiha yarating.
2. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → turi: *Web application*.
3. **Authorized redirect URI** ga quyidagini yozing: `https://sizning-domeningiz.onrender.com/auth/google/callback`
4. Sizga **Client ID** va **Client Secret** beriladi — ularni `.env` fayldagi `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALLBACK_URL` qatorlariga yozing.
5. Kirishda faqat `ADMIN_EMAIL`da koʻrsatilgan Gmail hisobi qabul qilinadi — boshqa hech kim kira olmaydi.

> Agar Google sozlamalarini toʻldirmasangiz ham muammo emas — oddiy email/parol orqali kirish har doim ishlaydi.

## 3-qadam: Serverga joylashtiring (Render.com — bepul)
1. Bu papkani GitHub'ga yuklang.
2. [render.com](https://render.com) → **New + → Web Service** → repository'ni tanlang.
3. **Build Command:** `npm install`  **Start Command:** `npm start`
4. **Environment** boʻlimida `.env` faylidagi barcha qiymatlarni qoʻshing.
5. **Deploy** tugmasini bosing — bir necha daqiqada tayyor boʻladi, sizga havola beradi (masalan `https://atelye-market.onrender.com`).

## 4-qadam: Dashboardga kirish
`https://sizning-domeningiz.onrender.com/login.html` manziliga oʻting → Google orqali yoki email/parol bilan kiring.

**Dashboardda ikkita boʻlim bor:**
- **Mijozlar** — botga yozganlar roʻyxati, har biriga yoki hammaga birdan xabar yuborish
- **Katalog** — kategoriya qoʻshish/oʻchirish/tahrirlash, har bir kategoriya ichida fason qoʻshish (rasm, narx, eski narx, chegirma foizi, izoh). Fason qoʻshganda "obunachilarga xabar yubor" belgisini bossangiz, botga yozgan barcha mijozlarga avtomatik "Yangi model qoʻshildi" xabari ketadi.

## 5-qadam: Mini appni ulash (endi avtomatik)
Mini app (`public/koylak-market-demo.html`) endi backend bilan bir joyda joylashgan — alohida sozlash shart emas. Server ishga tushgach, asosiy manzilingiz (masalan `https://sizning-nom.onrender.com`) to‘g‘ridan-to‘g‘ri mini appni ochadi, va u avtomatik ravishda o‘zi bilan bir serverdagi katalog, banner va boshqa ma’lumotlarni oladi. Dashboardda qo‘shgan har bir kategoriya/fason darhol mini appda ko‘rinadi.

## 6-qadam: Mini appni botga bog‘lang
@BotFather → botingizni tanlang → **Menu Button** (yoki `/mybots` → Bot Settings → Menu Button) → URL sifatida asosiy manzilingizni bering (masalan `https://sizning-nom.onrender.com`).

## Maʼlumotlar qayerda saqlanadi?
- Mijozlar — `data/users.json`
- Katalog (kategoriya/fasonlar) — `data/catalog.json`
- Yuklangan rasmlar — `public/uploads/`

Bular oddiy fayllar, kichik va oʻrta biznes uchun yetarli. Katta hajmda oʻsishda haqiqiy bazaga (PostgreSQL) oʻtish mumkin.
