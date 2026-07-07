require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const TelegramBot = require('node-telegram-bot-api');

const PORT = process.env.PORT || 3000;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('.env faylga ADMIN_EMAIL va ADMIN_PASSWORD qoʻshing (.env.example ga qarang).');
  process.exit(1);
}

// ====== MA'LUMOTLAR FAYLLARI ======
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const CATALOG_FILE = path.join(__dirname, 'data', 'catalog.json');
const CONFIG_FILE = path.join(__dirname, 'data', 'config.json');
if (!fs.existsSync(path.dirname(USERS_FILE))) fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, '{}');
if (!fs.existsSync(CATALOG_FILE)) fs.writeFileSync(CATALOG_FILE, JSON.stringify({ categories: [] }));
if (!fs.existsSync(CONFIG_FILE)) fs.writeFileSync(CONFIG_FILE, JSON.stringify({
  botToken: process.env.BOT_TOKEN || '',
  adminChatId: process.env.ADMIN_CHAT_ID || '',
  contactUsername: '',
  appName: 'Atelye Market',
  promo: { eyebrow: 'Fasl chegirmasi', title: '-20% gacha', text: 'Kelinchak va kechki libos toʻplamida' }
}));

const loadUsers = () => JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8'));
const saveUsers = (u) => fs.writeFileSync(USERS_FILE, JSON.stringify(u, null, 2));
const loadCatalog = () => JSON.parse(fs.readFileSync(CATALOG_FILE, 'utf-8'));
const saveCatalog = (c) => fs.writeFileSync(CATALOG_FILE, JSON.stringify(c, null, 2));
const loadConfig = () => JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
const saveConfig = (c) => fs.writeFileSync(CONFIG_FILE, JSON.stringify(c, null, 2));

const uploadsDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadsDir,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname.replace(/\s+/g, '_')),
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // fayl boshiga 8 MB gacha
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Faqat rasm fayllari (JPG, PNG, WEBP va h.k.) qabul qilinadi'));
  },
});

// ====== TELEGRAM BOT (dashboard orqali token kiritilib, dinamik ishga tushiriladi) ======
let bot = null;
let botUsername = null;
let ADMIN_CHAT_ID = loadConfig().adminChatId || process.env.ADMIN_CHAT_ID || '';
const replyMap = new Map(); // forward qilingan xabar id -> asl mijoz chat_id

function attachBotHandlers(instance) {
  instance.on('message', (msg) => {
    // 0) /myid — shaxsiy chat ID'ni topish uchun (Sozlamalar bo'limiga kiritish uchun kerak)
    if (msg.text === '/myid') {
      instance.sendMessage(msg.chat.id, 'Sizning chat ID: ' + msg.chat.id);
      return;
    }

    // 1) agar bu SIZDAN (admin) kelgan va biror forward qilingan xabarga "Reply" bo'lsa —
    //    javobni to'g'ridan-to'g'ri o'sha mijozga yuboramiz
    if (ADMIN_CHAT_ID && String(msg.chat.id) === String(ADMIN_CHAT_ID) && msg.reply_to_message) {
      const targetChatId = replyMap.get(msg.reply_to_message.message_id);
      if (targetChatId) {
        instance
          .sendMessage(targetChatId, msg.text || '')
          .then(() => instance.sendMessage(ADMIN_CHAT_ID, '✔ Mijozga yuborildi'))
          .catch((e) => instance.sendMessage(ADMIN_CHAT_ID, '❌ Yuborilmadi: ' + e.message));
        return;
      }
    }

    // 2) oddiy mijoz xabari — ro'yxatga olamiz
    const users = loadUsers();
    const id = String(msg.chat.id);
    users[id] = {
      chat_id: msg.chat.id,
      first_name: msg.from.first_name || '',
      last_name: msg.from.last_name || '',
      username: msg.from.username || '',
      last_message: msg.text || '(matn emas: rasm/fayl)',
      last_time: new Date().toISOString(),
      first_seen: users[id] ? users[id].first_seen : new Date().toISOString(),
    };
    saveUsers(users);

    if (msg.text === '/start') {
      instance.sendMessage(
        msg.chat.id,
        "Assalomu alaykum! Xush kelibsiz 🌿\nSavolingiz yoki buyurtmangiz bo'lsa shu yerga yozavering, tez orada javob beramiz."
      );
    }

    // 3) agar bu mijozdan kelgan xabar bo'lsa (admin o'zi emas) — sizga forward qilamiz
    if (ADMIN_CHAT_ID && String(msg.chat.id) !== String(ADMIN_CHAT_ID)) {
      instance
        .forwardMessage(ADMIN_CHAT_ID, msg.chat.id, msg.message_id)
        .then((fwd) => replyMap.set(fwd.message_id, msg.chat.id))
        .catch((e) => console.error('Forward xato:', e.message));
    }
  });
  instance.on('polling_error', (e) => console.error('Polling xatosi:', e.message));
}

async function startBot(token) {
  const candidate = new TelegramBot(token, { polling: false });
  const me = await candidate.getMe(); // token noto'g'ri bo'lsa shu yerda xato chiqadi
  if (bot) {
    try { bot.stopPolling(); } catch (e) {}
  }
  candidate.startPolling();
  attachBotHandlers(candidate);
  bot = candidate;
  botUsername = me.username;
  saveConfig({ ...loadConfig(), botToken: token });
  return me;
}

function stopBot() {
  if (bot) {
    try { bot.stopPolling(); } catch (e) {}
  }
  bot = null;
  botUsername = null;
}

// dastur ishga tushganda, agar oldin saqlangan token bo'lsa — avtomatik ulanadi
(async () => {
  const cfg = loadConfig();
  if (cfg.botToken) {
    try {
      await startBot(cfg.botToken);
      console.log('Bot faollashtirildi: @' + botUsername);
    } catch (e) {
      console.error('Saqlangan token bilan botni ishga tushirib bo\'lmadi:', e.message);
    }
  }
})();

function notifySubscribers(text) {
  if (!bot) return 0;
  const users = loadUsers();
  const ids = Object.keys(users);
  ids.forEach((id, i) => {
    setTimeout(() => {
      bot.sendMessage(id, text).catch((e) => console.error('Yuborishda xato', id, e.message));
    }, i * 60);
  });
  return ids.length;
}

// ====== GMAIL / EMAIL LOGIN ======
passport.serializeUser((email, done) => done(null, email));
passport.deserializeUser((email, done) => done(null, email));

if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: process.env.GOOGLE_CALLBACK_URL,
      },
      (accessToken, refreshToken, profile, done) => {
        const email = profile.emails && profile.emails[0] && profile.emails[0].value;
        if (email && email.toLowerCase() === ADMIN_EMAIL.toLowerCase()) {
          return done(null, email);
        }
        return done(null, false);
      }
    )
  );
}

const app = express();
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'atelye-maxfiy-kalit',
    resave: false,
    saveUninitialized: false,
  })
);
app.use(passport.initialize());
app.use(passport.session());

function requireAuth(req, res, next) {
  if (req.isAuthenticated && req.isAuthenticated()) return next();
  return res.status(401).json({ error: 'Tizimga kirish kerak' });
}

// ---- auth yo'llari ----
app.post('/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (
    email &&
    password &&
    email.toLowerCase() === ADMIN_EMAIL.toLowerCase() &&
    password === ADMIN_PASSWORD
  ) {
    req.login(email, (err) => {
      if (err) return res.status(500).json({ error: 'Xatolik yuz berdi' });
      return res.json({ ok: true });
    });
  } else {
    res.status(401).json({ error: "Email yoki parol noto'g'ri" });
  }
});

app.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));
app.get(
  '/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/login.html' }),
  (req, res) => res.redirect('/dashboard.html')
);

app.post('/auth/logout', (req, res) => {
  req.logout(() => {});
  res.json({ ok: true });
});

app.get('/auth/me', (req, res) => {
  res.json({ loggedIn: !!(req.isAuthenticated && req.isAuthenticated()) });
});

// ---- statik fayllar ----
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'koylak-market-demo.html')));
app.get('/dashboard.html', requireAuth, (req, res) =>
  res.sendFile(path.join(__dirname, 'public', 'dashboard.html'))
);
app.use(express.static(path.join(__dirname, 'public')));

// ====== BOT SOZLAMALARI API (admin) ======
app.get('/api/bot-status', requireAuth, (req, res) => {
  res.json({ active: !!bot, username: botUsername });
});

app.post('/api/bot-token', requireAuth, async (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'Token kerak' });
  try {
    const me = await startBot(token.trim());
    res.json({ ok: true, username: me.username });
  } catch (e) {
    res.status(400).json({ error: "Token notoʻgʻri yoki botga ulanib boʻlmadi: " + e.message });
  }
});

app.post('/api/bot-deactivate', requireAuth, (req, res) => {
  stopBot();
  saveConfig({ ...loadConfig(), botToken: '' });
  res.json({ ok: true });
});

app.get('/api/admin-chat-id', requireAuth, (req, res) => {
  res.json({ adminChatId: ADMIN_CHAT_ID });
});

app.post('/api/admin-chat-id', requireAuth, (req, res) => {
  const { chatId } = req.body;
  if (!chatId) return res.status(400).json({ error: 'chatId kerak' });
  ADMIN_CHAT_ID = String(chatId).trim();
  saveConfig({ ...loadConfig(), adminChatId: ADMIN_CHAT_ID });
  res.json({ ok: true });
});

// ====== ALOQA USERNAME (mini app shu yerdan o'qiydi — kirish talab qilinmaydi) ======
app.get('/api/contact-username', (req, res) => {
  res.json({ contactUsername: loadConfig().contactUsername || '' });
});

app.post('/api/contact-username', requireAuth, (req, res) => {
  const { username } = req.body;
  saveConfig({ ...loadConfig(), contactUsername: (username || '').replace('@', '').trim() });
  res.json({ ok: true });
});

// ====== ILOVA NOMI (mini app shu yerdan o'qiydi — kirish talab qilinmaydi) ======
app.get('/api/app-name', (req, res) => {
  res.json({ appName: loadConfig().appName || 'Atelye Market' });
});

app.post('/api/app-name', requireAuth, (req, res) => {
  const { appName } = req.body;
  saveConfig({ ...loadConfig(), appName: (appName || '').trim() || 'Atelye Market' });
  res.json({ ok: true });
});

// ====== REKLAMA BANNERI (mini app shu yerdan o'qiydi — kirish talab qilinmaydi) ======
app.get('/api/promo', (req, res) => {
  res.json(loadConfig().promo || { eyebrow: '', title: '', text: '' });
});

app.post('/api/promo', requireAuth, (req, res) => {
  const { eyebrow, title, text } = req.body;
  saveConfig({ ...loadConfig(), promo: { eyebrow: eyebrow || '', title: title || '', text: text || '' } });
  res.json({ ok: true });
});

// ====== KATALOG API (mini app shu yerdan o'qiydi — kirish talab qilinmaydi) ======
app.get('/api/catalog', (req, res) => res.json(loadCatalog()));

// ====== MIJOZLAR API (admin) ======
app.get('/api/users', requireAuth, (req, res) => {
  const users = loadUsers();
  const list = Object.values(users).sort((a, b) => new Date(b.last_time) - new Date(a.last_time));
  res.json(list);
});

app.post('/api/send', requireAuth, upload.single('photo'), async (req, res) => {
  if (!bot) return res.status(400).json({ error: 'Bot hali faollashtirilmagan (Sozlamalar boʻlimiga qarang)' });
  const { chat_id, text } = req.body;
  if (!chat_id) return res.status(400).json({ error: 'chat_id kerak' });
  if (!text && !req.file) return res.status(400).json({ error: 'Xabar matni yoki rasm kerak' });
  try {
    if (req.file) {
      await bot.sendPhoto(chat_id, fs.createReadStream(req.file.path), { caption: text || '' });
    } else {
      await bot.sendMessage(chat_id, text);
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/broadcast', requireAuth, upload.single('photo'), async (req, res) => {
  if (!bot) return res.status(400).json({ error: 'Bot hali faollashtirilmagan (Sozlamalar boʻlimiga qarang)' });
  const { text } = req.body;
  if (!text && !req.file) return res.status(400).json({ error: "Xabar matni yoki rasm kerak" });
  const users = loadUsers();
  const ids = Object.keys(users);
  let sent = 0;
  for (const id of ids) {
    try {
      if (req.file) {
        await bot.sendPhoto(id, fs.createReadStream(req.file.path), { caption: text || '' });
      } else {
        await bot.sendMessage(id, text);
      }
      sent++;
      await new Promise((r) => setTimeout(r, 60));
    } catch (e) {
      console.error('Yuborishda xato', id, e.message);
    }
  }
  res.json({ ok: true, sent, total: ids.length });
});

// ====== KATALOG BOSHQARUVI API (admin) ======
app.post('/api/categories', requireAuth, upload.single('cover'), (req, res) => {
  const { name, coverUrl } = req.body;
  if (!name) return res.status(400).json({ error: 'Kategoriya nomi kerak' });
  const cover = req.file ? '/uploads/' + req.file.filename : coverUrl || '';
  const catalog = loadCatalog();
  const id = 'cat_' + Date.now();
  catalog.categories.push({ id, name, cover, items: [] });
  saveCatalog(catalog);
  res.json({ ok: true, id });
});

app.put('/api/categories/:id', requireAuth, upload.single('cover'), (req, res) => {
  const catalog = loadCatalog();
  const cat = catalog.categories.find((c) => c.id === req.params.id);
  if (!cat) return res.status(404).json({ error: 'Kategoriya topilmadi' });
  if (req.body.name) cat.name = req.body.name;
  if (req.file) cat.cover = '/uploads/' + req.file.filename;
  else if (req.body.coverUrl) cat.cover = req.body.coverUrl;
  saveCatalog(catalog);
  res.json({ ok: true });
});

app.delete('/api/categories/:id', requireAuth, (req, res) => {
  const catalog = loadCatalog();
  catalog.categories = catalog.categories.filter((c) => c.id !== req.params.id);
  saveCatalog(catalog);
  res.json({ ok: true });
});

app.post('/api/categories/:catId/items', requireAuth, upload.array('photos', 3), (req, res) => {
  const catalog = loadCatalog();
  const cat = catalog.categories.find((c) => c.id === req.params.catId);
  if (!cat) return res.status(404).json({ error: 'Kategoriya topilmadi' });

  let photos = [];
  if (req.files && req.files.length) {
    photos = req.files.map((f) => '/uploads/' + f.filename);
  } else if (req.body.photoUrl) {
    photos = req.body.photoUrl.split(',').map((s) => s.trim()).filter(Boolean);
  }
  const item = {
    id: 'item_' + Date.now(),
    name: req.body.name || '',
    price: req.body.price || '',
    oldPrice: req.body.oldPrice || '',
    discount: Number(req.body.discount) || 0,
    photo: photos[0] || '',
    photos,
    note: req.body.note || '',
  };
  cat.items.push(item);
  saveCatalog(catalog);

  let notified = 0;
  if (req.body.notify === 'true') {
    notified = notifySubscribers(`✨ Yangi model qoʻshildi: ${item.name}\n${item.price}`);
  }
  res.json({ ok: true, item, notified });
});

app.put('/api/items/:catId/:itemId', requireAuth, upload.array('photos', 3), (req, res) => {
  const catalog = loadCatalog();
  const cat = catalog.categories.find((c) => c.id === req.params.catId);
  if (!cat) return res.status(404).json({ error: 'Kategoriya topilmadi' });
  const item = cat.items.find((i) => i.id === req.params.itemId);
  if (!item) return res.status(404).json({ error: 'Fason topilmadi' });

  if (req.files && req.files.length) {
    item.photos = req.files.map((f) => '/uploads/' + f.filename);
    item.photo = item.photos[0];
  } else if (req.body.photoUrl) {
    item.photos = req.body.photoUrl.split(',').map((s) => s.trim()).filter(Boolean);
    item.photo = item.photos[0] || item.photo;
  }
  if (req.body.name) item.name = req.body.name;
  if (req.body.price) item.price = req.body.price;
  if (req.body.oldPrice !== undefined) item.oldPrice = req.body.oldPrice;
  if (req.body.discount !== undefined) item.discount = Number(req.body.discount) || 0;
  if (req.body.note !== undefined) item.note = req.body.note;

  saveCatalog(catalog);
  res.json({ ok: true, item });
});

app.delete('/api/items/:catId/:itemId', requireAuth, (req, res) => {
  const catalog = loadCatalog();
  const cat = catalog.categories.find((c) => c.id === req.params.catId);
  if (!cat) return res.status(404).json({ error: 'Kategoriya topilmadi' });
  cat.items = cat.items.filter((i) => i.id !== req.params.itemId);
  saveCatalog(catalog);
  res.json({ ok: true });
});

// ====== YUKLASH XATOLARINI CHIROYLI QAYTARISH ======
app.use((err, req, res, next) => {
  if (err && err.message) {
    const isTooBig = err.code === 'LIMIT_FILE_SIZE';
    return res.status(400).json({
      error: isTooBig ? "Rasm hajmi juda katta (8 MB dan oshmasligi kerak)" : err.message,
    });
  }
  next();
});

app.listen(PORT, () => console.log(`Dashboard http://localhost:${PORT} portida ishlamoqda`));
