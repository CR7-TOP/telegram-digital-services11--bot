import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';
import dotenv from 'dotenv';
import http from 'http';
import { MongoClient } from 'mongodb'; 

dotenv.config();

// ==========================================
// ⚠️ إعدادات تحويل العملة (الدولار للمصري) ⚠️
// ==========================================
const USD_TO_EGP_RATE = 50; // سعر الدولار لتحويل منتجات المزود الثاني

// ==========================================
// إعدادات الاتصال بقاعدة بيانات MongoDB
// ==========================================
const MONGODB_URI = "mongodb+srv://ahmwogod24920s_db_user:LwAbx06XOKBWel9j@cluster0.sjxm2ga.mongodb.net/xprostore?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(MONGODB_URI);
let dbCollection = null;
let pendingSaves = []; 

let usersDb = {};
let globalMarkupPercent = 15;
let customMarkups = {};
let pendingDeposits = []; 
let promoCodes = {}; 
let flashSale = { active: false, discount: 0, expiresAt: 0 }; 
let vouchers = {}; 
let adminAuditLogs = []; 
let maintenanceMode = false; 
let bulkQuantityStates = {}; 

let customProductMarkups = {}; 
let localInventory = {}; 

async function connectDB() {
    if (!dbCollection) {
        await client.connect();
        const database = client.db("xprostore");
        dbCollection = database.collection("botData");
        console.log("✅ متصل بقاعدة بيانات MongoDB السحابية بنجاح!");
    }
}

async function loadDatabase() {
    try {
        await connectDB();
        const data = await dbCollection.findOne({ _id: "main_data" });
        if (data) {
            usersDb = data.usersDb || {};
            globalMarkupPercent = data.globalMarkupPercent !== undefined ? data.globalMarkupPercent : 15;
            customMarkups = data.customMarkups || {};
            pendingDeposits = data.pendingDeposits || [];
            promoCodes = data.promoCodes || {};
            flashSale = data.flashSale || { active: false, discount: 0, expiresAt: 0 };
            vouchers = data.vouchers || {};
            adminAuditLogs = data.adminAuditLogs || [];
            maintenanceMode = data.maintenanceMode || false;
            customProductMarkups = data.customProductMarkups || {};
            localInventory = data.localInventory || {};
        }
    } catch (error) {
        console.error('❌ خطأ في تحميل قاعدة البيانات:', error);
    }
}

function saveDatabase() {
    try {
        const data = { usersDb, globalMarkupPercent, customMarkups, pendingDeposits, promoCodes, flashSale, vouchers, adminAuditLogs, maintenanceMode, customProductMarkups, localInventory };
        const savePromise = connectDB().then(() => {
            return dbCollection.updateOne({ _id: "main_data" }, { $set: data }, { upsert: true });
        }).catch(e => console.error('DB Save Error:', e));
        
        pendingSaves.push(savePromise); 
    } catch (e) {}
}

const PORT = 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.write('البوت يعمل بكفاءة وقاعدة البيانات السحابية متصلة 🚀');
    res.end();
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Web server started on port ${PORT}`);
    setInterval(() => {
        http.get(`http://localhost:${PORT}`, (res) => {}).on('error', (err) => {});
    }, 4 * 60 * 1000); 
}).on('error', (err) => {});

process.on('uncaughtException', (err) => {});
process.on('unhandledRejection', (reason, promise) => {});

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';
let vodafoneCashNumber = process.env.VODAFONE_NUMBER || '01228098689'; 

const adminLoginStates = {};
const adminSession = {}; 
const depositStates = {};
const broadcastStates = {}; 
const promoCodeStates = {}; 
const searchStates = {}; 
const adminInputStates = {}; 
const userRequestLocks = {};
const categoryCacheTime = 60000; 
let lastCategoriesFetchTime = 0;

function logAdminAction(adminId, action) {
  try {
    const logEntry = { adminId, action, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) };
    adminAuditLogs.push(logEntry);
    saveDatabase();
  } catch (e) {}
}

function notifyAdmin(text) {
    try {
        for (let tgId in usersDb) {
            if (String(usersDb[tgId].uid) === '1001') {
                bot.telegram.sendMessage(tgId, text, { parse_mode: 'HTML' }).catch(() => {});
            }
        }
    } catch(e) {}
}

setInterval(() => {
  try {
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0) {
        let totalDaySpent = 0;
        for (let id in usersDb) {
            if (usersDb[id].orders) {
                const todayStr = now.toLocaleDateString();
                usersDb[id].orders.forEach(o => {
                    if (o.date.includes(todayStr)) totalDaySpent += parseFloat(o.price || 0);
                });
            }
        }
        notifyAdmin('📊 التقرير المالي اليومي التلقائي:\n\n💰 إجمالي المشتريات اليوم: <b>' + totalDaySpent.toFixed(2) + ' EGP</b>\n📈 نسبة الربح العامة الحالية: ' + globalMarkupPercent + '%');
    }
  } catch(e) {}
}, 60000);

function initUser(userId) {
  try {
    if (!usersDb[userId]) {
      let isUnique = false; let newUid;
      while (!isUnique) {
        newUid = Math.floor(1000000000 + Math.random() * 9000000000);
        isUnique = true;
        for (let tgId in usersDb) { if (String(usersDb[tgId].uid) === String(newUid)) { isUnique = false; break; } }
      }
      usersDb[userId] = { uid: newUid, balance: 0, orders: [], walletHistory: [], isBanned: false, totalSpent: 0, isVip: false, referrals: 0, referredBy: null }; 
      saveDatabase(); 
    } else {
        if (!usersDb[userId].orders) usersDb[userId].orders = [];
        if (!usersDb[userId].walletHistory) usersDb[userId].walletHistory = [];
        if (usersDb[userId].isBanned === undefined) usersDb[userId].isBanned = false;
        if (usersDb[userId].totalSpent === undefined) usersDb[userId].totalSpent = 0;
        if (usersDb[userId].isVip === undefined) usersDb[userId].isVip = false;
        if (usersDb[userId].referrals === undefined) usersDb[userId].referrals = 0;
        if (usersDb[userId].referredBy === undefined) usersDb[userId].referredBy = null;
    }
  } catch(e) {}
}

function getUserByUid(targetUid) {
  for (let telegramId in usersDb) {
    if (String(usersDb[telegramId].uid) === String(targetUid)) return { telegramId, user: usersDb[telegramId] };
  }
  return null;
}

const apiClient1 = axios.create({
  baseURL: 'https://xprostore.store/api/v1',
  headers: { 'Authorization': 'Bearer ' + process.env.PROVIDER_API_KEY, 'Content-Type': 'application/json' },
  timeout: 8000
});

const apiClient2 = axios.create({
  baseURL: 'https://zfourstore.up.railway.app/api/v1',
  headers: { 'X-API-Key': process.env.PROVIDER2_API_KEY, 'Content-Type': 'application/json' },
  timeout: 8000
});

function generateStableId(nameStr) {
    let hash = 0;
    for (let i = 0; i < nameStr.length; i++) {
        let char = nameStr.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; 
    }
    return Math.abs(hash).toString();
}

function detectCategoryFromName(name) {
    let n = name.toLowerCase();
    if (n.includes('gemini')) return 'جيميناي';
    if (n.includes('gpt')) return 'شات GPT';
    if (n.includes('canva')) return 'كانفا';
    if (n.includes('adobe')) return 'ادوبي';
    if (n.includes('duolingo')) return 'دوولينجو';
    if (n.includes('capcut')) return 'كاب كات';
    if (n.includes('spotify')) return 'Spotify';
    if (n.includes('netflix')) return 'Netflix';
    if (n.includes('crunchyroll')) return 'Crunchyroll';
    if (n.includes('microsoft') || n.includes('office')) return 'مايكروسوفت';
    if (n.includes('coursera')) return 'edX Premium';
    if (n.includes('prime')) return 'Prime Video';
    if (n.includes('notion')) return 'نوشن';
    if (n.includes('api')) return 'خدمات API';
    return 'أخرى';
}

async function fetchAllServices() {
    let services = [];
    
    try {
        const res1 = await apiClient1.get('/services?limit=1000');
        let s1 = res1.data.data || res1.data.services || res1.data;
        if (Array.isArray(s1)) {
            s1.forEach(item => { 
                item.providerSource = 'api1'; 
                item.name = item.name || item.name_ar || item.title || "خدمة";
                item.id = String(item.id || item.service_id || generateStableId(item.name));
            });
            services.push(...s1);
        }
    } catch(e) {}

    try {
        const res2 = await apiClient2.get('/products');
        let s2 = res2.data.data || res2.data.products || res2.data.services || res2.data;
        
        if (!Array.isArray(s2) && typeof s2 === 'object') {
            for (let key in s2) { if (Array.isArray(s2[key])) { s2 = s2[key]; break; } }
        }

        if (Array.isArray(s2)) {
            s2.forEach(item => { 
                item.providerSource = 'api2'; 
                item.name = item.name || item.title || item.name_ar || "خدمة بدون اسم";
                item.id = String(item.id || item.product_id || item.service_id || item.uuid || item.code || generateStableId(item.name));
                item.category = item.category || item.category_name || detectCategoryFromName(item.name);

                let rawPriceUSD = parseFloat(item.price || item.rate || item.price_amount || 0);
                let egpPrice = (rawPriceUSD * USD_TO_EGP_RATE).toFixed(2);
                item.price = egpPrice;
                item.price_amount = egpPrice; 
            });
            services.push(...s2);
        }
    } catch(e) {}

    return services;
}

// ⚠️ تعديل الشراء لإرسال المتغيرات بالمسميات الدقيقة اللي طلبها السيرفر ⚠️
async function placeOrderWithBestProvider(srv, qty) {
    const source = srv.providerSource || 'api1';
    const parsedQty = parseInt(qty) || 1;

    // تحويل الـ ID لرقم صحيح لو أمكن عشان بعض السيرفرات بترفض الـ Strings
    const srvIdConverted = !isNaN(srv.id) ? parseInt(srv.id) : srv.id;

    if (source === 'api2') {
         // نرسل productId كما تم طلبه في رسالة الخطأ
         return await apiClient2.post('/order', { 
             service_id: srvIdConverted, 
             product_id: srvIdConverted,
             productId: srvIdConverted, // 👈 التعديل السحري هنا
             quantity: parsedQty 
         });
    } else {
         return await apiClient1.post('/orders', { 
             service_id: srvIdConverted, 
             quantity: parsedQty 
         });
    }
}

const preferredCategoriesOrder = [
    'شات GPT', 'كانفا', 'E SIM', 'جيميناي', 'Netflix', 'Spotify', 'كاب كات', 
    'ادوبي', 'دوولينجو', 'تيليجرام', 'مايكروسوفت', 'نوشن', 'اكسبريس VPN', 
    'HMA VPN', 'جيميل', 'ايكلاود', 'جروك', 'Leonardo.Ai', 'Zoom', 'iLovePDF', 
    'Envato', 'Grammarly', 'edX Premium', 'HBO MAX', 'Prime Video', 
    'Crunchyroll', 'Peacock', 'Autodesk', 'JetBrains', 'Miro', 'Framer', 
    'Avira', 'خدمات API', 'أخرى'
];

const categoryEmojis = {
  'شات GPT': '🤖', 'جيميناي': '✨', 'كاب كات': '✂', 'جروك': '🌌', 'ادوبي': '🎨', 'كانفا': '🖌', 'نوشن': '📝', 'Leonardo.Ai': '🤖',
  'دوولينجو': '🦉', 'تيليجرام': '✈', 'مايكروسوفت': '💻', 'Miro': '🗺', 'Zoom': '📹', 'iLovePDF': '📄', 'Envato': '🍃', 'Grammarly': '✍',
  'Autodesk': '🏗', 'JetBrains': '💻', 'edX Premium': '🎓', 'Peacock': '🦚', 'HBO MAX': '🎬', 'Paramount+': '⛰', 'Framer': '⚡',
  'Avira': '☂️', 'HMA VPN': '🌍', 'اكسبريس VPN': '🛡', 'جيميل': '📧', 'ايكلاود': '☁', 'E SIM': '📱', 'Spotify': '🎧', 'Netflix': '🍿', 'Crunchyroll': '🍘', 'Prime Video': '🎬',
  'خدمات API': '🔌', 'أخرى': '📦'
};

let cachedServices = [];

function getMainMenu() {
  let keyboard = [
    ['🛍 الخدمات', '🔍 بحث عن خدمة'],
    ['🛒 طلباتي', '💰 حسابي', '📜 سجل المحفظة'],
    ['💳 شحن المحفظة (فودافون كاش)', '🎟 استخدام كود خصم'],
    ['🔗 دعوة الأصدقاء (اربح 2%)', '📞 الدعم الفني']
  ];
  return Markup.keyboard(keyboard).resize();
}

bot.start((ctx) => {
  try {
    const userId = ctx.from.id; initUser(userId); 
    if (usersDb[userId].isBanned) return ctx.reply('❌ عذراً، تم حظرك من استخدام هذا البوت.').catch(()=>{});
    if (maintenanceMode && String(usersDb[userId].uid) !== '1001') return ctx.reply('🛠 **المتجر في حالة صيانة حالياً**\nنعمل على تحديث الخدمات، عودوا قريباً جداً!', { parse_mode: 'Markdown' }).catch(()=>{});

    const isNewUser = !usersDb[userId].referredBy && userId;
    const payload = ctx.startPayload;
    if (isNewUser && payload && payload.startsWith('ref_')) {
        const referrerUid = payload.split('_')[1];
        const referrer = getUserByUid(referrerUid);
        if (referrer && String(referrerUid) !== String(usersDb[userId].uid)) {
            usersDb[userId].referredBy = referrer.telegramId; 
            referrer.user.referrals += 1;
            saveDatabase();
            bot.telegram.sendMessage(referrer.telegramId, `🔔 قام صديق بالتسجيل عبر رابط الدعوة الخاص بك! ستكسب **2%** من كل عملية شحن يقوم بها.`).catch(()=>{});
        }
    }

    ctx.reply('أهلاً بك في متجر الخدمات الرقمية! 🚀\n🆔 رقم الحساب الفريد الخاص بك: `' + usersDb[userId].uid + '`', { parse_mode: 'Markdown', ...getMainMenu() }).catch(()=>{});
  } catch (err) {}
});

function calculateRetailPrice(service, user, quantity = 1) {
  try {
    const originalPrice = parseFloat(service.price_amount || service.price || 0);
    const cat = getServiceCategory(service);

    let markup = parseFloat(globalMarkupPercent) || 0;

    if (customMarkups && customMarkups[cat] !== undefined) {
        markup = parseFloat(customMarkups[cat]);
    }

    const srvIdStr = String(service.id);
    if (customProductMarkups && customProductMarkups[srvIdStr] !== undefined) {
        markup = parseFloat(customProductMarkups[srvIdStr]);
    }

    if (user && user.isVip) markup = Math.max(0, markup - 5);

    let finalPrice = originalPrice * (1 + (markup / 100));

    if (flashSale.active && Date.now() < flashSale.expiresAt) {
        finalPrice = finalPrice - (finalPrice * (flashSale.discount / 100));
    }

    return (finalPrice * quantity).toFixed(2);
  } catch(e) {
    return '0.00';
  }
}

bot.hears(/^💰 حسابي$/, (ctx) => {
  try {
    const userId = ctx.from.id; initUser(userId); const user = usersDb[userId];
    if (user.isBanned) return ctx.reply('❌ تم حظرك.').catch(()=>{});
    const vipTag = user.isVip ? '👑 (VIP)' : '👤 (عادي)';
    ctx.reply('👤 **حسابي الشخصي:**\n\n🆔 رقم الحساب: `' + user.uid + '`\n🔰 مستوى الحساب: ' + vipTag + '\n💳 الرصيد الحالي: *' + parseFloat(user.balance).toFixed(2) + ' EGP*\n🛍 إجمالي المشتريات: ' + user.totalSpent.toFixed(2) + ' EGP', { parse_mode: 'Markdown' }).catch(()=>{});
  } catch(e){}
});

bot.hears(/^🛒 طلباتي$/, (ctx) => {
    try {
      const userId = ctx.from.id; initUser(userId);
      if (usersDb[userId].isBanned) return;
      const userOrders = usersDb[userId].orders || [];
      if (userOrders.length === 0) return ctx.reply('🛒 لم تقم بأي عمليات شراء حتى الآن.').catch(()=>{});
      const lastOrders = userOrders.slice(-5).reverse();
      let message = '🛒 **آخر عمليات الشراء الخاصة بك:**\n\n';
      lastOrders.forEach(order => { message += '🛍 **الخدمة:** ' + order.name + '\n💰 **السعر:** ' + order.price + ' EGP\n🕒 **التاريخ:** ' + order.date + '\n━━━━━━━━━━━━\n'; });
      ctx.reply(message, { parse_mode: 'Markdown' }).catch(()=>{});
    } catch(e){}
});

bot.hears(/^📜 سجل المحفظة$/, (ctx) => {
    try {
      const userId = ctx.from.id; initUser(userId);
      if (usersDb[userId].isBanned) return;
      const history = usersDb[userId].walletHistory || [];
      if (history.length === 0) return ctx.reply('📜 لا توجد معاملات مالية مسجلة حتى الآن.').catch(()=>{});
      let msg = '📜 **سجل المعاملات المالية (آخر 10 عمليات):**\n\n';
      history.slice(-10).reverse().forEach(item => {
          msg += '🔹 ' + item.type + ': *' + item.amount + ' EGP*\n🕒 ' + item.date + '\n━━━━━━━━━━━━\n';
      });
      ctx.reply(msg, { parse_mode: 'Markdown' }).catch(()=>{});
    } catch(e){}
});

bot.hears(/^📞 الدعم الفني$/, (ctx) => {
    try {
      const userId = ctx.from.id; initUser(userId);
      if (usersDb[userId].isBanned) return;
      ctx.reply('📞 **تواصل مع الدعم الفني:**\n\nيرجى اختيار طريقة التواصل المناسبة لك:', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
          [Markup.button.url('✈️ تواصل تليجرام', 'https://t.me/Ahmed_3mk_0')],
          [Markup.button.url('📱 تواصل واتساب', 'https://wa.me/201282110755')]
        ])
      }).catch(()=>{});
    } catch(e){}
});

bot.hears(/^🔗 دعوة الأصدقاء \(اربح 2%\)$/, (ctx) => {
    try {
      const userId = ctx.from.id; initUser(userId);
      if (usersDb[userId].isBanned) return;
      const refLink = 'https://t.me/' + ctx.botInfo.username + '?start=ref_' + usersDb[userId].uid;
      ctx.reply('🎁 **نظام دعوة الأصدقاء المربح:**\n\nشارِك رابط الدعوة مع أصدقائك، وكلما قام أحدهم **بشحن محفظته**، ستحصل أنت فوراً على **2%** من قيمة شحنه تضاف لرصيدك تلقائياً!\n\n🔗 رابط الدعوة الخاص بك:\n`' + refLink + '`\n\n👥 عدد الأشخاص الذين دعوتهم: ' + usersDb[userId].referrals, {parse_mode: 'Markdown'}).catch(()=>{});
    } catch(e){}
});

bot.hears(/^🔍 بحث عن خدمة$/, (ctx) => {
    try {
      const userId = ctx.from.id; initUser(userId);
      if (usersDb[userId].isBanned) return;
      searchStates[userId] = true;
      ctx.reply('🔍 أرسل اسم الخدمة التي تبحث عنها (مثال: Canva أو نتفلكس) أو اكتب `Ahmed/` لتسجيل دخول الأدمن:').catch(()=>{});
    } catch(e){}
});

bot.hears(/^💳 شحن المحفظة \(فودافون كاش\)$/, (ctx) => {
  try {
    const userId = ctx.from.id; initUser(userId);
    if (usersDb[userId].isBanned) return;
    depositStates[userId] = { step: 'WAIT_AMOUNT' };
    ctx.reply('💳 **شحن المحفظة عبر فودافون كاش**\n\nمن فضلك أكتب **المبلغ** الذي قمت بتحويله بالجنيه المصري (مثال: 100):').catch(()=>{});
  } catch(e){}
});

function sendDepositNotification(req) {
  try {
    notifyAdmin(`🔔 <b>طلب شحن محفظة جديد!</b>\n\n👤 المستخدم (ID): <code>${req.userUid}</code>\n💰 المبلغ المطلوب: <b>${req.amount} EGP</b>\n📱 الرقم المحول منه: <code>${req.senderNumber}</code>\n\nيرجى المراجعة من قسم (طلبات الشحن المعلقة):`);
  } catch(e) {}
}

function showAdminPanel(ctx) {
  try {
    let totalUsers = 0; let totalBalances = 0; let totalStoreSpent = 0; let totalOrdersCount = 0;
    for (let id in usersDb) { 
        totalUsers++; totalBalances += parseFloat(usersDb[id].balance || 0); totalStoreSpent += parseFloat(usersDb[id].totalSpent || 0); totalOrdersCount += (usersDb[id].orders ? usersDb[id].orders.length : 0);
    }

    const flashStatus = (flashSale.active && Date.now() < flashSale.expiresAt) ? '⚡ (نشط حالياً)' : '❌ (متوقف)';
    const maintStatus = maintenanceMode ? '🛠️ (مفعل - المتجر مغلق للصيانة)' : '✅ (متوقف - المتجر يعمل)';

    const text = '👑 **لوحة تحكم الأدمن (الآيدي: 1001)**\n\n' +
                 '📊 **الإحصائيات المتقدمة:**\n' +
                 '👥 إجمالي العملاء: ' + totalUsers + '\n' +
                 '💰 إجمالي أرصدة العملاء: ' + totalBalances.toFixed(2) + ' EGP\n' +
                 '🛍️ إجمالي المشتريات بالمتجر: ' + totalStoreSpent.toFixed(2) + ' EGP\n' +
                 '📦 إجمالي الطلبات المنفذة: ' + totalOrdersCount + '\n\n' +
                 '📈 نسبة الربح العامة: ' + globalMarkupPercent + '%\n' +
                 '⚡ حالة الخصم المؤقت: ' + flashStatus + '\n' +
                 '🛑 وضع الصيانة: ' + maintStatus + '\n' +
                 '📱 رقم الكاش: `' + vodafoneCashNumber + '`';

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('💳 طلبات الشحن المعلقة (' + (pendingDeposits ? pendingDeposits.length : 0) + ')', 'admin_pending_deposits')],
        [Markup.button.callback('💰 فحص رصيد المزود', 'admin_check_api_balance'), Markup.button.callback('🟢 فحص حالة المزود (API)', 'admin_check_api_status')],
        [Markup.button.callback('🎯 نسبة ربح لمنتج', 'admin_search_markup'), Markup.button.callback('📦 مخزن المنتجات المحلي', 'admin_search_stock')],
        [Markup.button.callback('📊 تعديل النسبة العامة', 'admin_set_global_markup'), Markup.button.callback('🎯 تعديل نسبة قسم', 'admin_set_custom_markup')],
        [Markup.button.callback('⚡ خصم مؤقت (Flash Sale)', 'admin_flash_sale'), Markup.button.callback('🎫 توليد كروت شحن', 'admin_create_voucher')],
        [Markup.button.callback('✉ مراسلة عميل بالـ ID', 'admin_msg_by_id'), Markup.button.callback('👥 شحن رصيد بالـ ID', 'admin_charge_by_id')], 
        [Markup.button.callback('🛠️ تبديل وضع الصيانة', 'admin_toggle_maintenance'), Markup.button.callback('📝 سجل نشاط الأدمن', 'admin_view_logs')],
        [Markup.button.callback('📂 عرض حسابات العملاء', 'admin_view_users')],
        [Markup.button.callback('🚫 حظر مستخدم', 'admin_ban_user'), Markup.button.callback('✅ فك حظر مستخدم', 'admin_unban_user')],
        [Markup.button.callback('📢 إرسال رسالة (إذاعة)', 'admin_broadcast'), Markup.button.callback('🎟️ إنشاء كود خصم', 'admin_create_promo')],
        [Markup.button.callback('🚪 تسجيل خروج', 'admin_logout')]
      ]);

    if(ctx.callbackQuery) { ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard }).catch(()=>{}); }
    else { ctx.reply(text, { parse_mode: 'Markdown', ...keyboard }).catch(()=>{}); }
  } catch(e){}
}

bot.action('admin_search_markup', (ctx) => {
    adminInputStates[ctx.from.id] = 'WAIT_SEARCH_MARKUP';
    ctx.editMessageText('🔍 أرسل اسم المنتج الذي تريد تحديد **نسبة ربح مخصصة** له:').catch(()=>{});
});
bot.action('admin_search_stock', (ctx) => {
    adminInputStates[ctx.from.id] = 'WAIT_SEARCH_STOCK';
    ctx.editMessageText('📦 أرسل اسم المنتج الذي تريد إدارة مخزونه المحلي:').catch(()=>{});
});

bot.action(/setmarkup_(.+)/, (ctx) => {
    adminInputStates[ctx.from.id] = 'WAIT_SET_MARKUP_' + ctx.match[1];
    ctx.editMessageText('📈 أرسل النسبة المئوية للربح لهذا المنتج فقط (مثال: اكتب 50 لربح 50%).\n\n🗑️ لإلغاء النسبة المخصصة وجعل المنتج يتبع النسبة العامة، اكتب كلمة: `حذف`', {parse_mode: 'Markdown'}).catch(()=>{});
});
bot.action(/addstock_(.+)/, (ctx) => {
    adminInputStates[ctx.from.id] = 'WAIT_ADD_STOCK_' + ctx.match[1];
    ctx.editMessageText('📦 **إدارة المخزن المحلي لهذا المنتج:**\n\n➕ **للإضافة:** أرسل رسالة تحتوي على البيانات كاملة (مهما كان عدد سطورها سيتم اعتبارها كعنصر واحد).\n👀 **للعرض:** أرسل كلمة `عرض` لمعرفة محتويات المخزن.\n🗑️ **للحذف:** أرسل كلمة `حذف الكل` لتفريغ مخزن هذا المنتج بالكامل.', {parse_mode: 'Markdown'}).catch(()=>{});
});

bot.action('admin_pending_deposits', (ctx) => {
    try {
        if (!pendingDeposits || pendingDeposits.length === 0) return ctx.editMessageText('💳 **طلبات الشحن المعلقة:**\n\nلا توجد طلبات شحن معلقة حالياً.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]])).catch(()=>{});
        let msg = '💳 **طلبات الشحن المعلقة (' + pendingDeposits.length + '):**\n\n';
        let inlineButtons = [];
        pendingDeposits.forEach((req, idx) => {
            msg += '👤 ID: `' + req.userUid + '`\n💰 المبلغ: *' + req.amount + ' EGP*\n📱 الرقم: `' + req.senderNumber + '`\n━━━━━━━━━━━━\n';
            inlineButtons.push([ Markup.button.callback('✅ موافقة (' + req.amount + 'ج)', 'approve_dep_' + req.userId + '_' + req.amount), Markup.button.callback('❌ رفض', 'reject_dep_' + req.userId) ]);
        });
        inlineButtons.push([Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]);
        ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineButtons) }).catch(()=>{});
    } catch(e) {}
});

bot.action('admin_check_api_balance', async (ctx) => {
    try {
        ctx.editMessageText('⏳ جاري الاتصال بالمزودين...').catch(()=>{});
        let msg = '💰 **أرصدة المزودين:**\n\n';
        try { const res1 = await apiClient1.get('/me/wallet'); msg += `🔹 المزود الأول: *${parseFloat(res1.data?.data?.balance || res1.data?.balance || 0).toFixed(2)} EGP*\n`; } 
        catch(e) { msg += `🔹 المزود الأول: خطأ ❌\n`; }
        try { const res2 = await apiClient2.get('/balance'); msg += `🔹 المزود الثاني: *$${parseFloat(res2.data?.data?.balance || res2.data?.balance || 0).toFixed(2)}*\n`; } 
        catch(e) { msg += `🔹 المزود الثاني: خطأ ❌\n`; }
        ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
    } catch(e) {}
});

bot.action('admin_check_api_status', async (ctx) => {
    try {
        ctx.editMessageText('⏳ جاري فحص استجابة سيرفرات المزودين...').catch(()=>{});
        let msg = '🟢 **حالة سيرفرات المزودين (API):**\n\n';
        try { const start1 = Date.now(); await apiClient1.get('/services?limit=1'); msg += `🔹 المزود الأول: يعمل ✅ (${Date.now() - start1}ms)\n`; } 
        catch(e) { msg += `🔹 المزود الأول: متعطل ❌\n`; }
        try { const start2 = Date.now(); await apiClient2.get('/products'); msg += `🔹 المزود الثاني: يعمل ✅ (${Date.now() - start2}ms)\n`; } 
        catch(e) { msg += `🔹 المزود الثاني: متعطل ❌\n`; }
        ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
    } catch(e) {}
});

bot.action('admin_toggle_maintenance', (ctx) => {
    try {
      maintenanceMode = !maintenanceMode; saveDatabase(); logAdminAction(ctx.from.id, 'تغيير وضع الصيانة');
      showAdminPanel(ctx); ctx.answerCbQuery('تم التغيير بنجاح').catch(()=>{});
    } catch(e){}
});

bot.action('admin_view_logs', (ctx) => {
    try {
      let msg = '📝 **سجل نشاط الأدمن (آخر 15 حركة):**\n\n';
      if (adminAuditLogs.length === 0) msg += 'لا توجد حركات مسجلة بعد.';
      else { adminAuditLogs.slice(-15).reverse().forEach(log => { msg += '🔹 الأدمن: `' + log.adminId + '`\n📌 الحركة: ' + log.action + '\n🕒 ' + log.date + '\n━━━━━━━━━━━━\n'; }); }
      ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
    } catch(e){}
});

bot.action('back_to_admin', (ctx) => { try { showAdminPanel(ctx); } catch(e){} });
bot.action('admin_logout', (ctx) => { adminSession[ctx.from.id] = false; adminLoginStates[ctx.from.id] = null; ctx.editMessageText('✅ تم تسجيل الخروج.').catch(()=>{}); });

bot.action('admin_view_users', (ctx) => {
  try {
    let userList = '👥 **قائمة العملاء:**\n\n'; let count = 0;
    for (let tgId in usersDb) { 
        const bStatus = usersDb[tgId].isBanned ? ' [محظور]' : '';
        userList += '👤 ID: `' + usersDb[tgId].uid + '` | الرصيد: ' + parseFloat(usersDb[tgId].balance).toFixed(2) + ' EGP' + bStatus + '\n'; count++; 
    }
    if (count === 0) userList = 'لا يوجد عملاء.';
    if (userList.length > 4000) userList = userList.substring(0, 4000) + '\n...';
    ctx.editMessageText(userList, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{}); 
    ctx.answerCbQuery().catch(()=>{});
  } catch(e){}
});

bot.action('admin_set_global_markup', (ctx) => {
    adminInputStates[ctx.from.id] = 'WAIT_GLOBAL_MARKUP';
    ctx.editMessageText('📊 **تعديل النسبة العامة:**\n\nأرسل الآن نسبة الربح الجديدة بالأرقام فقط (مثال: 15):', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_set_custom_markup', (ctx) => {
    adminInputStates[ctx.from.id] = 'WAIT_CUSTOM_MARKUP';
    ctx.editMessageText('🎯 **تعديل نسبة قسم معين:**\n\nأرسل اسم القسم والنسبة هكذا:\n`اسم_القسم النسبة`\n\n🗑️ لمسح جميع نسب الأقسام والعودة للنسبة العامة، اكتب: `حذف الكل`', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_flash_sale', (ctx) => {
    adminInputStates[ctx.from.id] = 'WAIT_FLASH_SALE';
    ctx.editMessageText('⚡ **إعداد خصم مؤقت:**\n\nأرسل نسبة الخصم وعدد الساعات هكذا:\n`النسبة الساعات`', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_create_voucher', (ctx) => {
    adminInputStates[ctx.from.id] = 'WAIT_VOUCHER_CREATE';
    ctx.editMessageText('🎫 **توليد كروت شحن (قسائم):**\n\nأرسل القيمة والمبلغ هكذا:\n`الكود القيمة`', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_msg_by_id', (ctx) => {
    adminInputStates[ctx.from.id] = 'WAIT_USER_MSG';
    ctx.editMessageText('✉️ **مراسلة عميل عبر الـ ID:**\n\nأرسل الآيدي والرسالة هكذا:\n`الآيدي الرسالة`', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_ban_user', (ctx) => { ctx.editMessageText('لحظر مستخدم، أرسل الأمر:\n`/ban الـID`', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{}); });
bot.action('admin_unban_user', (ctx) => { ctx.editMessageText('لكسر الحظر، أرسل الأمر:\n`/unban الـID`', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{}); });
bot.action('admin_broadcast', (ctx) => { broadcastStates[ctx.from.id] = true; ctx.editMessageText('📢 أرسل رسالة الإذاعة (أو اضغط رجوع):', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{}); });
bot.action('admin_create_promo', (ctx) => { ctx.editMessageText('/promo [الكود] [المبلغ]', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{}); });
bot.action('admin_charge_by_id', (ctx) => { ctx.editMessageText('/charge الـID المبلغ', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{}); });

bot.on('text', async (ctx, next) => {
  try {
    const userId = ctx.from.id; initUser(userId);
    if (usersDb[userId].isBanned) return;
    const text = ctx.message.text;

    if (text.trim() === 'Ahmed/') {
        adminLoginStates[userId] = 'WAIT_EMAIL';
        return ctx.reply('🔐 **تسجيل دخول الأدمن**\n\nيرجى إرسال البريد الإلكتروني (Email):').catch(()=>{});
    }

    if (adminSession[userId] && adminInputStates[userId]) {
        const state = adminInputStates[userId];
        delete adminInputStates[userId];

        if (state === 'WAIT_SEARCH_MARKUP' || state === 'WAIT_SEARCH_STOCK') {
            const query = text.toLowerCase();
            if (!cachedServices || cachedServices.length === 0) cachedServices = await fetchAllServices();
            const results = cachedServices.filter(s => (s.name_ar || s.name || s.title || '').toLowerCase().includes(query));
            if(results.length === 0) return ctx.reply('❌ لا توجد نتائج مطابقة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            
            const prefix = state === 'WAIT_SEARCH_MARKUP' ? 'setmarkup_' : 'addstock_';
            let buttons = results.slice(0, 15).map(srv => [Markup.button.callback((srv.name_ar || srv.name || srv.title) + ` (${srv.providerSource})`, prefix + srv.id)]);
            buttons.push([Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]);
            return ctx.reply('🔍 اختر المنتج من القائمة:', Markup.inlineKeyboard(buttons));
        }

        if (state.startsWith('WAIT_SET_MARKUP_')) {
            const srvId = String(state.split('WAIT_SET_MARKUP_')[1]);

            if (text.trim() === 'حذف') {
                delete customProductMarkups[srvId];
                saveDatabase();
                return ctx.reply('✅ تم مسح النسبة المخصصة! المنتج سيعود لاستخدام النسبة العامة للمتجر.', {parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]])});
            }

            const percent = parseFloat(text);
            if (isNaN(percent)) return ctx.reply('❌ يرجى إدخال رقم صحيح أو كلمة "حذف".', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            
            customProductMarkups[srvId] = percent;
            saveDatabase();
            logAdminAction(userId, `تحديد نسبة ربح للمنتج ${srvId} بـ ${percent}%`);
            return ctx.reply(`✅ تم تحديد نسبة الربح للمنتج بنجاح: *${percent}%*\n(سيرتفع السعر تلقائياً إذا ارتفع سعره في المصدر)`, {parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]])});
        }

        if (state.startsWith('WAIT_ADD_STOCK_')) {
            const srvId = String(state.split('WAIT_ADD_STOCK_')[1]);

            if (text.trim() === 'عرض') {
                if (!localInventory[srvId] || localInventory[srvId].length === 0) {
                    return ctx.reply('📦 المخزن فارغ تماماً لهذا المنتج.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));
                }
                let stockList = localInventory[srvId].map((item, idx) => `📦 **عنصر رقم ${idx + 1}:**\n${item}`).join('\n\n━━━━━━━━━━━━\n\n');
                return ctx.reply(`📦 **المخزن الحالي لهذا المنتج (${localInventory[srvId].length} عنصر):**\n\n${stockList}`, {parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]])});
            }

            if (text.trim() === 'حذف الكل') {
                localInventory[srvId] = [];
                saveDatabase();
                logAdminAction(userId, `تفريغ مخزن المنتج ${srvId}`);
                return ctx.reply('✅ تم تفريغ المخزن لهذا المنتج بنجاح!', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));
            }

            const item = text.trim();
            if (!localInventory[srvId]) localInventory[srvId] = [];
            localInventory[srvId].push(item);
            saveDatabase();
            logAdminAction(userId, `إضافة 1 عنصر למخزن المنتج ${srvId}`);
            return ctx.reply(`✅ تم حفظ الرسالة بالكامل كـ **عنصر واحد** في المخزن.\nإجمالي المخزون الحالي لهذا المنتج: *${localInventory[srvId].length}*`, {parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]])});
        }

        if (state === 'WAIT_USER_MSG') {
            const firstSpace = text.indexOf(' ');
            if (firstSpace === -1) return ctx.reply('❌ صيغة غير صحيحة.');
            const targetUid = text.substring(0, firstSpace).trim();
            const msgText = text.substring(firstSpace + 1).trim();
            const targetUser = getUserByUid(targetUid);
            if (!targetUser) return ctx.reply('❌ لم يتم العثور على مستخدم.');
            await bot.telegram.sendMessage(targetUser.telegramId, `📩 **رسالة من إدارة المتجر:**\n\n${msgText}`, { parse_mode: 'Markdown' }).catch(()=>{});
            return ctx.reply('✅ تم إرسال الرسالة.');
        }

        if (state === 'WAIT_GLOBAL_MARKUP') {
            const val = parseFloat(text);
            if (isNaN(val)) return ctx.reply('❌ يرجى إدخال رقم صحيح.');
            globalMarkupPercent = val; saveDatabase();
            return ctx.reply('✅ تم التحديث لتصبح: ' + globalMarkupPercent + '%');
        }

        if (state === 'WAIT_CUSTOM_MARKUP') {
            if (text.trim() === 'حذف الكل') {
                customMarkups = {};
                saveDatabase();
                logAdminAction(userId, 'مسح جميع نسب الأقسام المخصصة');
                return ctx.reply('✅ تم مسح جميع النسب المخصصة للأقسام!\nكل الأقسام ستتبع الآن النسبة العامة للمتجر.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            }

            const lines = text.split('\n'); let updatedCount = 0; let reportMsg = '📊 **تقرير تحديث نسب الأقسام:**\n\n';
            for (let line of lines) {
                line = line.trim(); if (!line) continue;
                const lastSpace = line.lastIndexOf(' '); if (lastSpace === -1) continue;
                const catName = line.substring(0, lastSpace).trim();
                const percent = parseFloat(line.substring(lastSpace + 1));
                if (isNaN(percent)) continue;
                let matchedCat = catName;
                if (cachedServices && cachedServices.length > 0) {
                    const found = cachedServices.find(s => getServiceCategory(s).toLowerCase().includes(catName.toLowerCase()));
                    if (found) matchedCat = getServiceCategory(found);
                }
                customMarkups[matchedCat] = percent; updatedCount++;
                reportMsg += '✅ ' + matchedCat + ' ⟵' + percent + '%\n';
            }
            if (updatedCount === 0) return ctx.reply('❌ خطأ في الصيغة.');
            saveDatabase(); return ctx.reply(reportMsg);
        }

        if (state === 'WAIT_FLASH_SALE') {
            const parts = text.split(' ');
            if (parts.length < 2) return ctx.reply('❌ صيغة غير صحيحة.');
            const discountVal = parseFloat(parts[0]); const hoursVal = parseFloat(parts[1]);
            if (discountVal === 0 && hoursVal === 0) {
                flashSale = { active: false, discount: 0, expiresAt: 0 }; saveDatabase();
                return ctx.reply('✅ تم إلغاء الخصم.');
            }
            flashSale = { active: true, discount: discountVal, expiresAt: Date.now() + (hoursVal * 60 * 60 * 1000) }; saveDatabase();
            for (let tgId in usersDb) {
                if (String(usersDb[tgId].uid) !== '1001' && !usersDb[tgId].isBanned) {
                    bot.telegram.sendMessage(tgId, `⚡ **عروض التخفيضات (Flash Sale)!**\n\n🎉 خصم **${discountVal}%** على كل الخدمات لمدة **${hoursVal} ساعة**!`, { parse_mode: 'Markdown' }).catch(() => {});
                }
            }
            return ctx.reply('⚡ **تم تفعيل الخصم بنجاح!**');
        }

        if (state === 'WAIT_VOUCHER_CREATE') {
            const parts = text.split(' ');
            if (parts.length < 2) return ctx.reply('❌ صيغة غير صحيحة.');
            const code = parts[0].toUpperCase(); const amount = parseFloat(parts[1]);
            if (isNaN(amount)) return ctx.reply('❌ القيمة غير صحيحة.');
            vouchers[code] = { amount, isUsed: false }; saveDatabase();
            return ctx.reply(`✅ تم إنشاء كارت الشحن!\n🎟 الكود: \`${code}\`\n💰 القيمة: *${amount} EGP*`, { parse_mode: 'Markdown' });
        }
    }

    if (searchStates[userId]) {
        delete searchStates[userId]; const query = text.toLowerCase();
        if (!cachedServices || cachedServices.length === 0) cachedServices = await fetchAllServices();
        const results = cachedServices.filter(s => (s.name_ar || s.name || s.title || '').toLowerCase().includes(query));
        if(results.length === 0) return ctx.reply('❌ لا توجد نتائج مطابقة.').catch(()=>{});
        let buttons = results.slice(0, 15).map(srv => [Markup.button.callback((srv.name_ar || srv.name || srv.title) + ' - ' + calculateRetailPrice(srv, usersDb[userId]) + ' EGP', 'confirm_' + srv.id)]);
        return ctx.reply('🔍 نتائج البحث:', Markup.inlineKeyboard(buttons)).catch(()=>{});
    }

    if (adminLoginStates[userId] === 'WAIT_EMAIL') {
      if (text.trim() === ADMIN_EMAIL) { adminLoginStates[userId] = 'WAIT_PASS'; return ctx.reply('🔒 أرسل كلمة المرور:').catch(()=>{}); } 
      else { adminLoginStates[userId] = null; return ctx.reply('❌ بريد خاطئ.').catch(()=>{}); }
    }
    if (adminLoginStates[userId] === 'WAIT_PASS') {
      if (text.trim() === ADMIN_PASS) {
        adminLoginStates[userId] = null; adminSession[userId] = true;
        initUser(userId); usersDb[userId].uid = 1001; saveDatabase();
        ctx.reply('✅ تم تسجيل الدخول.').catch(()=>{}); return showAdminPanel(ctx);
      } else { adminLoginStates[userId] = null; return ctx.reply('❌ كلمة مرور خاطئة.').catch(()=>{}); }
    }

    if (broadcastStates[userId]) {
        if (text.trim() === 'إلغاء') { delete broadcastStates[userId]; return ctx.reply('✅ تم الإلغاء.'); }
        for (let tgId in usersDb) {
            if (String(usersDb[tgId].uid) !== '1001') bot.telegram.sendMessage(tgId, '📢 **إذاعة:**\n\n' + text).catch(() => {});
        }
        delete broadcastStates[userId]; return ctx.reply('✅ تم الإرسال للجميع.');
    }

    if (depositStates[userId]) {
      const state = depositStates[userId];
      if (state.step === 'WAIT_AMOUNT') {
        const amount = parseFloat(text);
        if (isNaN(amount) || amount <= 0) return ctx.reply('❌ أدخل مبلغاً صحيحاً:').catch(()=>{});
        state.amount = amount; state.step = 'WAIT_NUMBER';
        return ctx.reply('💳 حول (' + amount + ' EGP) على رقم فودافون كاش:\n📱 `' + vodafoneCashNumber + '`\n\n**ثم أرسل الرقم الذي حوّلت منه:**', { parse_mode: 'Markdown' }).catch(()=>{});
      } else if (state.step === 'WAIT_NUMBER') {
        const amount = state.amount; delete depositStates[userId]; initUser(userId);
        const reqData = { userId, userUid: usersDb[userId].uid, amount, senderNumber: text }; 
        ctx.reply('⏳ تم إرسال طلب الشحن للإدارة بنجاح، سيتم المراجعة والإضافة قريباً.').catch(()=>{});
        pendingDeposits.push(reqData); saveDatabase(); sendDepositNotification(reqData); return;
      }
    }

    return next();
  } catch(e) {}
});

bot.hears(/^🎟 استخدام كود خصم$/, (ctx) => { 
    try {
      const userId = ctx.from.id; initUser(userId);
      if (usersDb[userId].isBanned) return;
      ctx.reply('أرسل كود الخصم أو القسيمة الآن:').catch(()=>{}); 
    } catch(e){}
});

bot.hears(/^[A-Za-z0-9]+$/, (ctx, next) => {
    try {
      const userId = ctx.from.id; initUser(userId);
      if (usersDb[userId].isBanned) return;

      const textCode = ctx.message.text.toUpperCase();

      if (vouchers[textCode]) {
          if (vouchers[textCode].isUsed) return ctx.reply('❌ عذراً، كارت الشحن هذا تم استخدامه مسبقاً.').catch(()=>{});
          const amount = vouchers[textCode].amount; vouchers[textCode].isUsed = true;
          usersDb[userId].balance += amount;
          usersDb[userId].walletHistory.push({ type: 'شحن كارت (' + textCode + ')', amount: amount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
          saveDatabase(); return ctx.reply('🎉 **تم شحن محفظتك بنجاح!**\n💰 تمت إضافة: *' + amount + ' EGP*', { parse_mode: 'Markdown' }).catch(()=>{});
      }
      if (promoCodes[textCode]) {
          if (promoCodes[textCode].usedBy.includes(userId)) return ctx.reply('❌ استخدمت الكود مسبقاً.').catch(()=>{});
          const amount = promoCodes[textCode].amount; usersDb[userId].balance += amount;
          usersDb[userId].walletHistory.push({ type: 'كود خصم (' + textCode + ')', amount: amount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
          promoCodes[textCode].usedBy.push(userId); saveDatabase();
          return ctx.reply('🎉 تمت إضافة *' + amount + ' EGP* لرصيدك.', { parse_mode: 'Markdown' }).catch(()=>{});
      }
      return next();
    } catch(e) {}
});

bot.action(/approve_dep_(\d+)_([\d.]+)/, async (ctx) => {
  try {
    const targetUserId = ctx.match[1]; const amount = parseFloat(ctx.match[2]);
    initUser(targetUserId); usersDb[targetUserId].balance += amount; 
    usersDb[targetUserId].walletHistory.push({ type: 'شحن فودافون كاش', amount: amount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
    pendingDeposits = pendingDeposits.filter(d => String(d.userId) !== String(targetUserId)); saveDatabase();
    
    const referrerTelegramId = usersDb[targetUserId].referredBy;
    if (referrerTelegramId && usersDb[referrerTelegramId]) {
        const bonus = amount * 0.02; usersDb[referrerTelegramId].balance += bonus;
        usersDb[referrerTelegramId].walletHistory.push({ type: 'عمولة إحالة 2%', amount: bonus, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
        bot.telegram.sendMessage(referrerTelegramId, `🎉 **عمولة دعوة أصدقاء جديدة!**\n💰 حصلت على: *${bonus.toFixed(2)} EGP*`, { parse_mode: 'Markdown' }).catch(() => {});
    }
    ctx.editMessageText(`✅ تمت الموافقة وإضافة مبلغ *${amount} EGP* للمستخدم.`, { parse_mode: 'Markdown' }).catch(()=>{});
    bot.telegram.sendMessage(targetUserId, `🎉 **تم شحن محفظتك بنجاح!**\n💰 تمت إضافة: *${amount} EGP*`, { parse_mode: 'Markdown' }).catch(() => {});
  } catch(err) {}
});

bot.action(/reject_dep_(\d+)/, async (ctx) => {
  try {
    const targetUserId = ctx.match[1];
    pendingDeposits = pendingDeposits.filter(d => String(d.userId) !== String(targetUserId)); saveDatabase();
    ctx.editMessageText('❌ تم رفض الطلب.').catch(()=>{});
    bot.telegram.sendMessage(targetUserId, '❌ عذراً، تم رفض طلب الشحن لعدم صحة بيانات التحويل.').catch(() => {});
  } catch(err) {}
});

bot.hears(/^🛍 الخدمات$/, showCategories);
bot.action('main_categories', showCategories);

function getServiceCategory(s) {
  try {
    let cat = s.category_name || s.category_ar || s.category_title || (typeof s.category === 'object' ? (s.category?.name || s.category?.name_ar || s.category?.title) : s.category);
    return cat ? String(cat).trim() : 'أخرى';
  } catch(e) { return 'أخرى'; }
}

async function showCategories(ctx) {
  const userId = ctx.from.id;
  try {
    initUser(userId);
    if (usersDb[userId].isBanned) return ctx.reply('🛠 المتجر في حالة صيانة حالياً.').catch(()=>{});
    if (maintenanceMode && String(usersDb[userId].uid) !== '1001') return ctx.reply('🛠 المتجر في حالة صيانة حالياً.').catch(()=>{});

    if (userRequestLocks[userId]) { return ctx.answerCbQuery('⚠️ انتظر لحظة...', { show_alert: false }).catch(()=>{}); }
    userRequestLocks[userId] = true; setTimeout(() => { delete userRequestLocks[userId]; }, 1500);

    let loadingMsgId = null;
    if(ctx.callbackQuery) { await ctx.answerCbQuery().catch(()=>{}); ctx.editMessageText('⏳ جاري جلب الأقسام...').catch(()=>{}); } 
    else { const msg = await ctx.reply('⏳ جاري جلب الأقسام...').catch(()=>{}); if(msg) loadingMsgId = msg.message_id; }

    if (cachedServices.length === 0 || (Date.now() - lastCategoriesFetchTime > categoryCacheTime)) {
        cachedServices = await fetchAllServices(); lastCategoriesFetchTime = Date.now();
    }

    if (cachedServices.length === 0) {
        const errorMsg = '⚠️ فشل جلب الخدمات، يرجى المحاولة بعد قليل.';
        if(ctx.callbackQuery) return ctx.editMessageText(errorMsg).catch(()=>{});
        else if(loadingMsgId) return ctx.telegram.editMessageText(ctx.chat.id, loadingMsgId, null, errorMsg).catch(()=>{});
        else return ctx.reply(errorMsg).catch(()=>{});
    }

    let fetchedCategories = [];
    cachedServices.forEach(s => {
      let catStr = getServiceCategory(s);
      if (catStr && !fetchedCategories.includes(catStr)) fetchedCategories.push(catStr);
    });

    let categories = [];
    
    preferredCategoriesOrder.forEach(cat => {
        if (fetchedCategories.includes(cat)) categories.push(cat);
    });

    fetchedCategories.forEach(cat => {
        if (!categories.includes(cat) && cat !== 'أخرى') categories.push(cat);
    });

    if (fetchedCategories.includes('أخرى') && !categories.includes('أخرى')) categories.push('أخرى');

    let buttons = [];
    for (let i = 0; i < categories.length; i += 2) {
      const row = [];
      row.push(Markup.button.callback((categoryEmojis[categories[i]] || '📦') + ' ' + categories[i], 'cat_' + encodeURIComponent(categories[i])));
      if (i + 1 < categories.length) row.push(Markup.button.callback((categoryEmojis[categories[i+1]] || '📦') + ' ' + categories[i+1], 'cat_' + encodeURIComponent(categories[i+1])));
      buttons.push(row);
    }
    buttons.push([Markup.button.callback('🏠 القائمة الرئيسية', 'main_menu')]);
    const keyboard = Markup.inlineKeyboard(buttons);

    if(ctx.callbackQuery) { return ctx.editMessageText('اختر الفئة:', keyboard).catch(()=>{}); } 
    else if(loadingMsgId) { return ctx.telegram.editMessageText(ctx.chat.id, loadingMsgId, null, 'اختر الفئة:', keyboard).catch(()=>{}); } 
    else { return ctx.reply('اختر الفئة:', keyboard).catch(()=>{}); }

  } catch (error) {
    delete userRequestLocks[userId];
    if(ctx.callbackQuery) ctx.editMessageText('❌ حدث خطأ مؤقت، يرجى المحاولة مجدداً.').catch(()=>{});
  }
}

bot.action(/cat_(.+)/, async (ctx) => {
  try {
    const userId = ctx.from.id; initUser(userId);
    if (usersDb[userId].isBanned) return;

    const selectedCategory = decodeURIComponent(ctx.match[1]);
    
    if (!cachedServices || cachedServices.length === 0) { cachedServices = await fetchAllServices(); }

    const categoryServices = cachedServices.filter(s => {
      let cat = getServiceCategory(s);
      return cat === selectedCategory || cat.toLowerCase().includes(selectedCategory.toLowerCase()) || selectedCategory.toLowerCase().includes(cat.toLowerCase());
    });

    if (categoryServices.length === 0) return ctx.answerCbQuery('لا توجد خدمات.', { show_alert: true }).catch(()=>{});

    let buttons = categoryServices.map(srv => [Markup.button.callback((srv.name_ar || srv.name || srv.title) + ' - ' + calculateRetailPrice(srv, usersDb[userId], 1) + ' EGP', 'confirm_' + srv.id)]);
    buttons.push([Markup.button.callback('🔙 رجوع للأقسام', 'main_categories')]);

    ctx.editMessageText(`📦 خدمات قسم *${selectedCategory}*:`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
  } catch(err) {}
});

bot.action('main_menu', (ctx) => {
  try {
    const userId = ctx.from.id; initUser(userId);
    if (usersDb[userId].isBanned) return;
    ctx.deleteMessage().catch(()=>{}); ctx.reply('القائمة الرئيسية 🚀', getMainMenu()).catch(()=>{});
  } catch(e){}
});

bot.action(/confirm_(.+)/, async (ctx) => {
  try {
     const userId = ctx.from.id; initUser(userId);
     if (usersDb[userId].isBanned) return;

     if (!cachedServices || cachedServices.length === 0) { cachedServices = await fetchAllServices(); }

     const srvId = ctx.match[1];
     const srv = cachedServices.find(s => String(s.id) === String(srvId));
     if(!srv) return ctx.answerCbQuery('الخدمة غير موجودة').catch(()=>{});

     bulkQuantityStates[userId] = { srvId: String(srv.id), qty: 1 };
     const price = calculateRetailPrice(srv, usersDb[userId], 1);
     const srvName = srv.name_ar || srv.name || srv.title;

     ctx.editMessageText(`⚠ اختر الكمية المطلوبة لـ:\n\n🛍️ *${srvName}*\n💰 السعر للقطعة: ${price} EGP\n🔢 الكمية الحالية: 1`, 
        {
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([
              [Markup.button.callback('➖ 1-', 'qty_dec_' + srv.id), Markup.button.callback('➕ 1+', 'qty_inc_' + srv.id)],
              [Markup.button.callback('✅ تأكيد الشراء', 'buy_' + srv.id)],
              [Markup.button.callback('❌ إلغاء', 'main_categories')]
          ])
        }
     ).catch(()=>{});
  } catch(err){}
});

bot.action(/qty_inc_(.+)/, async (ctx) => {
    try {
      const userId = ctx.from.id; const srvId = ctx.match[1];
      if (!bulkQuantityStates[userId]) bulkQuantityStates[userId] = { srvId, qty: 1 };
      bulkQuantityStates[userId].qty += 1;
      await updateQuantityPrompt(ctx, srvId, bulkQuantityStates[userId].qty);
    } catch(e){}
});

bot.action(/qty_dec_(.+)/, async (ctx) => {
    try {
      const userId = ctx.from.id; const srvId = ctx.match[1];
      if (!bulkQuantityStates[userId]) bulkQuantityStates[userId] = { srvId, qty: 1 };
      if (bulkQuantityStates[userId].qty > 1) bulkQuantityStates[userId].qty -= 1;
      await updateQuantityPrompt(ctx, srvId, bulkQuantityStates[userId].qty);
    } catch(e){}
});

async function updateQuantityPrompt(ctx, srvId, qty) {
    try {
      const userId = ctx.from.id;
      if (!cachedServices || cachedServices.length === 0) { cachedServices = await fetchAllServices(); }
      const srv = cachedServices.find(s => String(s.id) === String(srvId));
      if (!srv) return;
      const price = calculateRetailPrice(srv, usersDb[userId], qty);
      const srvName = srv.name_ar || srv.name || srv.title;

      ctx.editMessageText(`⚠️ اختر الكمية المطلوبة لـ:\n\n🛍 *${srvName}*\n💰 السعر الإجمالي (${qty} قطعة): *${price} EGP*\n🔢 الكمية الحالية: ${qty}`, 
         {
           parse_mode: 'Markdown',
           ...Markup.inlineKeyboard([
               [Markup.button.callback('➖ 1-', 'qty_dec_' + srv.id), Markup.button.callback('➕ 1+', 'qty_inc_' + srv.id)],
               [Markup.button.callback('✅ تأكيد الشراء', 'buy_' + srv.id)],
               [Markup.button.callback('❌ إلغاء', 'main_categories')]
           ])
         }
      ).catch(()=>{});
    } catch(e){}
}

function extractUsefulData(obj) {
    if (!obj) return null;
    if (typeof obj === 'string') return obj;
    let extracted = [];
    
    function deepExtract(currentObj) {
        if (typeof currentObj === 'string') {
            if (currentObj.trim().length > 5 && !/^[0-9]+(\.[0-9]+)?$/.test(currentObj)) {
                extracted.push(currentObj);
            }
        } else if (Array.isArray(currentObj)) {
            currentObj.forEach(deepExtract);
        } else if (typeof currentObj === 'object' && currentObj !== null) {
            for (let key in currentObj) {
                if (['id', 'order_id', 'status', 'created_at', 'updated_at', 'service_id', 'quantity', 'price', 'user_id', 'api', 'api_id', 'api_order_id', 'api_service_id'].includes(key)) {
                    continue;
                }
                deepExtract(currentObj[key]);
            }
        }
    }
    
    deepExtract(obj);
    if (extracted.length === 0) return null;
    return [...new Set(extracted)].join('\n');
}

bot.action(/buy_(.+)/, async (ctx) => {
  try {
     const userId = ctx.from.id; initUser(userId);
     if (usersDb[userId].isBanned) return;

     if (!cachedServices || cachedServices.length === 0) { cachedServices = await fetchAllServices(); }

     const srvId = ctx.match[1];
     const srv = cachedServices.find(s => String(s.id) === String(srvId));
     if (!srv) return ctx.answerCbQuery('الخدمة غير موجودة').catch(()=>{});

     const qty = bulkQuantityStates[userId]?.qty || 1;
     const retailPrice = parseFloat(calculateRetailPrice(srv, usersDb[userId], qty));
     const userBalance = usersDb[userId].balance;
     const name = srv.name_ar || srv.name || srv.title;

     if (userBalance < retailPrice) {
       const diff = (retailPrice - userBalance).toFixed(2);
       return ctx.editMessageText(`❌ **رصيدك غير كافٍ لإتمام الطلب!**\n\n💳 رصيدك الحالي: *${userBalance.toFixed(2)} EGP*\n💰 المبلغ المطلـوب: *${retailPrice.toFixed(2)} EGP*\n⚠️ متبقي عليك: *${diff} EGP* فقط لشراء الخدمة.\n\nاشحن الفرق الآن وتابع طلبك فوراً!`,
         {
           parse_mode: 'Markdown',
           ...Markup.inlineKeyboard([
               [Markup.button.callback('💳 شحن المحفظة (فودافون كاش)', 'main_categories')],
               [Markup.button.callback('🔙 رجوع للأقسام', 'main_categories')]
           ])
         }
       ).catch(()=>{});
     }

     await ctx.editMessageText('⏳ جاري تنفيذ الطلب واستخراج بيانات الخدمة...').catch(()=>{});

     const hasLocalStock = localInventory[String(srv.id)] && localInventory[String(srv.id)].length >= qty;

     if (hasLocalStock) {
         const deliveredItems = localInventory[String(srv.id)].splice(0, qty);
         
         usersDb[userId].balance -= retailPrice;
         usersDb[userId].totalSpent += retailPrice;
         usersDb[userId].walletHistory.push({ type: `شراء محلي (${name})`, amount: -retailPrice, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
         usersDb[userId].orders.push({ name: `${name} (${qty}x)`, price: retailPrice, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
         saveDatabase();

         let deliveryMsg = `📦 <b>رقم الطلب:</b> #LOCAL-${Math.floor(1000 + Math.random() * 9000)}\n\n` +
                           `🛍️ <b>الخدمة:</b> ${name}\n🔢 <b>الكمية:</b> ${qty}\n🟢 <b>الحالة:</b> مكتمل فوراً\n💰 <b>المدفوع:</b> ${retailPrice} EGP\n\n` +
                           `📋 <b>العناصر المسلمة:</b>\n<code>${deliveredItems.join('\n\n')}</code>`;

         await ctx.editMessageText(deliveryMsg, { parse_mode: 'HTML', disable_web_page_preview: true, ...Markup.inlineKeyboard([[Markup.button.callback('🏠 القائمة الرئيسية', 'main_menu')]])}).catch(()=>{});
         notifyAdmin(`👑 <b>عملية بيع من المخزن المحلي:</b>\n🛍 ${name}\n💰 ${retailPrice} EGP\n📦 متبقي في المخزن لهذا المنتج: ${localInventory[String(srv.id)].length}`);
         return; 
     }

     try {
        const orderResponse = await placeOrderWithBestProvider(srv, qty);

        usersDb[userId].balance -= retailPrice;
        usersDb[userId].totalSpent += retailPrice;
        usersDb[userId].walletHistory.push({ type: `شراء (${name} - ${qty}x)`, amount: -retailPrice, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });

        if (!usersDb[userId].isVip && usersDb[userId].totalSpent >= 500) {
            usersDb[userId].isVip = true;
            bot.telegram.sendMessage(userId, '👑 **تهانينا!**\nتمت ترقية حسابك إلى **VIP** لتحقيقك مشتريات بـ 500 EGP. ستحصل على أسعار مخفضة تلقائياً!').catch(()=>{});
        }
        usersDb[userId].orders.push({ name: `${name} (${qty}x)`, price: retailPrice, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
        saveDatabase(); 

        let orderId = orderResponse.data?.order?.id || orderResponse.data?.id || orderResponse.data?.order_id || Math.floor(10000 + Math.random() * 90000);
        let rawDetails = null;

        await new Promise(resolve => setTimeout(resolve, 3000));

        try {
            const source = srv.providerSource || 'api1';
            const clientApi = source === 'api2' ? apiClient2 : apiClient1;
            
            const fetchOrderPath = source === 'api2' ? `/order/${orderId}` : `/orders/${orderId}`;
            
            const getOrderRes = await clientApi.get(fetchOrderPath);
            const orderData = getOrderRes.data?.data || getOrderRes.data?.order || getOrderRes.data;
            rawDetails = extractUsefulData(orderData);
        } catch(e) {
            console.log('تأخير في المزود لجلب الطلب: ' + orderId);
        }

        if (!rawDetails || rawDetails.trim() === '') {
            rawDetails = extractUsefulData(orderResponse.data?.order || orderResponse.data?.data || orderResponse.data);
        }

        let deliveryMsg = `📦 <b>رقم الطلب:</b> #${orderId}\n\n` +
                          `🛍️ <b>الخدمة:</b> ${name}\n` +
                          `🔢 <b>الكمية:</b> ${qty}\n\n` +
                          `🟢 <b>الحالة:</b> مكتمل\n\n` +
                          `💰 <b>المبلغ المخصوم:</b> ${retailPrice} EGP\n\n`;

        if (rawDetails && rawDetails !== '{}' && rawDetails !== 'null' && rawDetails.trim() !== '') {
            const safeRawText = String(rawDetails).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            deliveryMsg += `📋 <b>العناصر المسلمة:</b>\n${safeRawText}\n\n` +
                           `📌 <b>البيانات المسلمة (اضغط للنسخ):</b>\n<code>${safeRawText}</code>`;
        } else {
            deliveryMsg += `📋 <b>العناصر المسلمة:</b>\n✅ تم تنفيذ الطلب بنجاح.`;
        }

        await ctx.editMessageText(deliveryMsg, { 
            parse_mode: 'HTML',
            disable_web_page_preview: true,
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 العودة إلى الطلبات', 'main_menu'), Markup.button.callback('🏠 القائمة الرئيسية', 'main_menu')]
            ])
        }).catch(()=>{});

        const adminLogMsg = `👑 <b>إشعار شراء جديد:</b>\n\n` +
                            `📦 <b>رقم الطلب:</b> #${orderId}\n` +
                            `🛍 <b>الخدمة:</b> ${name}\n` +
                            `👤 <b>المشتري (ID):</b> <code>${usersDb[userId].uid}</code>\n` +
                            `💰 <b>المدفوع:</b> ${retailPrice} EGP\n\n` +
                            (rawDetails ? `📌 <b>البيانات:</b>\n<code>${String(rawDetails).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>` : '');
        notifyAdmin(adminLogMsg);

     } catch (error) {
        let apiErrorMsg = error.response?.data?.message || error.response?.data?.error || error.response?.data || error.message || "عطل غير معروف";
        if (typeof apiErrorMsg === 'object') {
            apiErrorMsg = JSON.stringify(apiErrorMsg);
        }
        await ctx.editMessageText(`❌ فشل الشراء من المزود الأساسي.\n\n⚠️ السبب: ${apiErrorMsg}\n\nلم يتم خصم أي مبلغ من محفظتك.`, Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للأقسام', 'main_categories')]])).catch(()=>{});
     }
  } catch (err){
      console.error('Buy General Error:', err.message);
  }
});

// ==========================================
// التحديث الخاص بـ Vercel لضمان عمل قاعدة البيانات
// ==========================================
export default async function handler(req, res) {
  if (req.method === 'POST') {
    pendingSaves = []; // تصفير العمليات المعلقة
    await loadDatabase(); // تحميل أحدث البيانات من السحابة

    await bot.handleUpdate(req.body); // تنفيذ أمر البوت

    // الانتظار حتى تنتهي كل عمليات الحفظ السحابية قبل قفل الاتصال
    if (pendingSaves.length > 0) {
        await Promise.all(pendingSaves);
    }
    res.status(200).send('OK');
  } else {
    res.status(200).send('Bot is running on Vercel with MongoDB! 🚀');
  }
}
