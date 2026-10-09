import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';
import dotenv from 'dotenv';
import http from 'http';
import { MongoClient } from 'mongodb'; 

dotenv.config();

// ==========================================
// ⚠️ إعدادات تحويل العملة (الدولار للمصري) ⚠️
// ==========================================
const USD_TO_EGP_RATE = 50; 

// ==========================================
// 🛡️ إعدادات الاتصال بقاعدة بيانات MongoDB 
// ==========================================
const MONGODB_URI = "mongodb+srv://ahmwogod24920s_db_user:LwAbx06XOKBWel9j@cluster0.sjxm2ga.mongodb.net/xprostore?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(MONGODB_URI);
let dbCollection = null;
let pendingSaves = []; 
let isDbConnected = false;

let usersDb = {};
let globalMarkupPercent = 15;
let customMarkups = {};
let pendingDeposits = []; 
let promoCodes = {}; 
let flashSale = { active: false, discount: 0, expiresAt: 0 }; 
let vouchers = {}; 
let adminAuditLogs = []; 
let maintenanceMode = false; 
let customProductMarkups = {}; 
let localInventory = {}; 

let botStates = {
    deposit: {}, broadcast: {}, promo: {}, search: {}, adminInput: {}, adminLogin: {}, adminSession: {}, lastReportDate: "", buyQty: {}, ordersPage: {} 
};

const userRequestLocks = {};

async function connectDB() {
    if (!isDbConnected) {
        try {
            if (!client.topology || !client.topology.isConnected()) {
                await client.connect();
            }
            const database = client.db("xprostore");
            dbCollection = database.collection("botData");
            isDbConnected = true;
            console.log("✅ متصل بقاعدة بيانات MongoDB السحابية بنجاح!");
        } catch (e) {
            console.error("DB Connection Error:", e);
        }
    }
}

async function loadDatabase() {
    await connectDB();
    if (!dbCollection) return;
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
        
        const loadedStates = data.botStates || {};
        botStates = {
            deposit: loadedStates.deposit || {},
            broadcast: loadedStates.broadcast || {},
            promo: loadedStates.promo || {},
            search: loadedStates.search || {},
            adminInput: loadedStates.adminInput || {},
            adminLogin: loadedStates.adminLogin || {},
            adminSession: loadedStates.adminSession || {},
            lastReportDate: loadedStates.lastReportDate || "",
            buyQty: loadedStates.buyQty || {},
            ordersPage: loadedStates.ordersPage || {}
        };
    }
}

function saveDatabase() {
    try {
        const data = { usersDb, globalMarkupPercent, customMarkups, pendingDeposits, promoCodes, flashSale, vouchers, adminAuditLogs, maintenanceMode, customProductMarkups, localInventory, botStates };
        const savePromise = connectDB().then(() => {
            if (dbCollection) {
                return dbCollection.updateOne({ _id: "main_data" }, { $set: data }, { upsert: true });
            }
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

process.on('uncaughtException', (err) => { console.error(err); });
process.on('unhandledRejection', (reason, promise) => { console.error(reason); });

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';
let vodafoneCashNumber = process.env.VODAFONE_NUMBER || '01228098689'; 

const categoryCacheTime = 60000; 
let lastCategoriesFetchTime = 0;
let cachedServices = [];

function clearUserStates(userId) {
    try {
        const idStr = String(userId);
        if (botStates.deposit) delete botStates.deposit[idStr];
        if (botStates.promo) delete botStates.promo[idStr];
        if (botStates.search) delete botStates.search[idStr];
        if (botStates.buyQty) delete botStates.buyQty[idStr]; 
        saveDatabase();
    } catch (e) {}
}

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

function checkAndSendDailyReport() {
    try {
        const now = new Date();
        const currentDate = now.toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo' });
        
        if (botStates.lastReportDate !== currentDate) {
            if (botStates.lastReportDate !== "") {
                let totalSpent = 0; let totalProfit = 0;
                for (let id in usersDb) {
                    if (usersDb[id].orders) {
                        usersDb[id].orders.forEach(o => {
                            if (o.date.includes(botStates.lastReportDate)) {
                                totalSpent += parseFloat(o.price || 0);
                                totalProfit += parseFloat(o.profit || (parseFloat(o.price || 0) - (parseFloat(o.price || 0) / (1 + (globalMarkupPercent / 100)))));
                            }
                        });
                    }
                }
                notifyAdmin(`📊 <b>التقرير المالي التلقائي ليوم (${botStates.lastReportDate}):</b>\n\n💰 إجمالي المشتريات: <b>${totalSpent.toFixed(2)} EGP</b>\n💸 صافي الأرباح: <b>${totalProfit.toFixed(2)} EGP</b>\n📈 نسبة الربح العامة: ${globalMarkupPercent}%`);
            }
            botStates.lastReportDate = currentDate;
            saveDatabase();
        }
    } catch(e) {}
}

function initUser(userId) {
  try {
    const idStr = String(userId);
    if (!usersDb[idStr]) {
      let isUnique = false; let newUid;
      while (!isUnique) {
        newUid = Math.floor(1000000000 + Math.random() * 9000000000);
        isUnique = true;
        for (let tgId in usersDb) { if (String(usersDb[tgId].uid) === String(newUid)) { isUnique = false; break; } }
      }
      usersDb[idStr] = { uid: newUid, balance: 0, orders: [], walletHistory: [], isBanned: false, totalSpent: 0, isVip: false, referrals: 0, referredBy: null, tempCategories: [] }; 
      saveDatabase(); 
    } else {
        if (!usersDb[idStr].orders) usersDb[idStr].orders = [];
        if (!usersDb[idStr].walletHistory) usersDb[idStr].walletHistory = [];
        if (usersDb[idStr].isBanned === undefined) usersDb[idStr].isBanned = false;
        if (usersDb[idStr].totalSpent === undefined) usersDb[idStr].totalSpent = 0;
        if (usersDb[idStr].isVip === undefined) usersDb[idStr].isVip = false;
        if (usersDb[idStr].referrals === undefined) usersDb[idStr].referrals = 0;
        if (usersDb[idStr].referredBy === undefined) usersDb[idStr].referredBy = null;
        if (!usersDb[idStr].tempCategories) usersDb[idStr].tempCategories = [];
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
  timeout: 4500
});

const apiClient2 = axios.create({
  baseURL: 'https://zfourstore.up.railway.app/api/v1',
  headers: { 'X-API-Key': process.env.PROVIDER2_API_KEY, 'Content-Type': 'application/json' },
  timeout: 4500
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
    if (/\bapi\b/i.test(n) || n.includes('خدمات برمجة')) return 'خدمات API';
    return 'أخرى';
}

function getServiceCategory(s) {
  try {
    let cat = s.category_name || s.category_ar || s.category_title || (typeof s.category === 'object' ? (s.category?.name || s.category?.name_ar || s.category?.title) : s.category);
    return cat ? String(cat).trim() : 'أخرى';
  } catch(e) { return 'أخرى'; }
}

async function fetchAllServices() {
    let services = [];
    const [res1Result, res2Result] = await Promise.allSettled([
        apiClient1.get('/services?limit=1000'),
        apiClient2.get('/products')
    ]);

    if (res1Result.status === 'fulfilled') {
        try {
            let s1 = res1Result.value.data?.data || res1Result.value.data?.services || res1Result.value.data;
            if (Array.isArray(s1)) {
                s1.forEach(item => { 
                    item.providerSource = 'api1'; 
                    item.name = item.name || item.name_ar || item.title || "خدمة";
                    item.id = String(item.id || item.service_id || generateStableId(item.name));
                });
                services.push(...s1);
            }
        } catch(e) {}
    }

    if (res2Result.status === 'fulfilled') {
        try {
            let s2 = res2Result.value.data?.data || res2Result.value.data?.products || res2Result.value.data?.services || res2Result.value.data;
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
    }
    return services;
}

async function placeOrderWithBestProvider(srv, qty) {
    const source = srv.providerSource || 'api1';
    const parsedQty = parseInt(qty) || 1;
    const srvIdConverted = !isNaN(srv.id) ? parseInt(srv.id) : srv.id;

    if (source === 'api2') {
         return await apiClient2.post('/order', { 
             service_id: srvIdConverted, 
             product_id: srvIdConverted,
             productId: srvIdConverted, 
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

function getMainMenu() {
  let keyboard = [
    ['🛍 الخدمات', '🔍 بحث عن خدمة'],
    ['🛒 طلباتي', '💰 حسابي', '📜 سجل المحفظة'],
    ['💳 شحن المحفظة (فودافون كاش)', '🎟 استخدام كود خصم'],
    ['🔗 دعوة الأصدقاء (اربح 2%)', '📞 الدعم الفني']
  ];
  return Markup.keyboard(keyboard).resize();
}

bot.use(async (ctx, next) => {
    checkAndSendDailyReport(); 
    return next();
});

bot.start((ctx) => {
  try {
    const userId = String(ctx.from.id); initUser(userId); 
    clearUserStates(userId);

    if (usersDb[userId].isBanned) return ctx.reply('❌ عذراً، تم حظرك من استخدام هذا البوت.').catch(()=>{});
    if (maintenanceMode && String(usersDb[userId].uid) !== '1001') return ctx.reply('🛠 **المتجر في حالة صيانة حالياً**\nنعمل على تحديث الخدمات، عودوا قريباً جداً!', { parse_mode: 'Markdown' }).catch(()=>{});

    const isNewUser = !usersDb[userId].referredBy && userId;
    let payload = null;
    if (ctx.message && ctx.message.text) {
        const parts = ctx.message.text.split(' ');
        if (parts.length > 1) payload = parts[1];
    }

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
  } catch (err) {
      console.error(err);
  }
});

function calculateRetailPrice(service, user, quantity = 1) {
  try {
    const originalPrice = parseFloat(service.price_amount || service.price || 0);
    const cat = getServiceCategory(service);

    let markup = parseFloat(globalMarkupPercent) || 0;
    if (customMarkups && customMarkups[cat] !== undefined) { markup = parseFloat(customMarkups[cat]); }

    const srvIdStr = String(service.id);
    if (customProductMarkups && customProductMarkups[srvIdStr] !== undefined) { markup = parseFloat(customProductMarkups[srvIdStr]); }

    if (user && user.isVip) markup = Math.max(0, markup - 5);
    let finalPrice = originalPrice * (1 + (markup / 100));

    if (flashSale && flashSale.active) {
        if (Date.now() < flashSale.expiresAt) {
            finalPrice = finalPrice - (finalPrice * (flashSale.discount / 100));
        } else {
            flashSale.active = false;
            saveDatabase();
        }
    }
    return (finalPrice * quantity).toFixed(2);
  } catch(e) {
    return '0.00';
  }
}

// ==========================================
// 🛡️ قسم القوائم الرئيسية (تم التعديل لتجاهل الإيموجي وحل مشكلة عدم الاستجابة) 🛡️
// ==========================================

bot.hears(/حسابي/, (ctx) => {
  try {
    const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
    const user = usersDb[userId];
    if (user.isBanned) return ctx.reply('❌ تم حظرك.').catch(()=>{});
    const vipTag = user.isVip ? '👑 (VIP)' : '👤 (عادي)';
    ctx.reply('👤 **حسابي الشخصي:**\n\n🆔 رقم الحساب: `' + user.uid + '`\n🔰 مستوى الحساب: ' + vipTag + '\n💳 الرصيد الحالي: *' + parseFloat(user.balance).toFixed(2) + ' EGP*\n🛍 إجمالي المشتريات: ' + user.totalSpent.toFixed(2) + ' EGP', { parse_mode: 'Markdown' }).catch(()=>{});
  } catch(e){}
});

function getOrdersPage(userId, page) {
    const orders = usersDb[userId].orders || [];
    const reversedOrders = [...orders].reverse(); 
    const totalOrders = reversedOrders.length;
    const itemsPerPage = 10;
    const totalPages = Math.ceil(totalOrders / itemsPerPage) || 1;
    const currentPage = Math.min(Math.max(page, 1), totalPages);

    if (!botStates.ordersPage) botStates.ordersPage = {};
    botStates.ordersPage[userId] = currentPage;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = Math.min(startIndex + itemsPerPage, totalOrders);
    const pageOrders = reversedOrders.slice(startIndex, endIndex);

    let text = `🛒 <b>طلباتي (${currentPage}/${totalPages}):</b>\n\n`;
    let buttons = [];

    pageOrders.forEach((order, index) => {
        const actualIndex = totalOrders - 1 - (startIndex + index);
        let safeName = order.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        text += `🛍 ${safeName} - مكتمل\n`;
        
        let buttonText = `🛍 ${safeName}`;
        if (buttonText.length > 35) buttonText = buttonText.substring(0, 33) + '..';
        
        buttons.push([Markup.button.callback(buttonText, `ord_det_${actualIndex}`)]);
    });

    let paginationRow = [];
    if (currentPage > 1) {
        paginationRow.push(Markup.button.callback('▶️ السابق', `ord_pg_${currentPage - 1}`));
    }
    paginationRow.push(Markup.button.callback(`صفحة ${currentPage} من ${totalPages}`, 'noop'));
    if (currentPage < totalPages) {
        paginationRow.push(Markup.button.callback('التالي ◀️', `ord_pg_${currentPage + 1}`));
    }

    if (totalPages > 1) buttons.push(paginationRow);
    buttons.push([Markup.button.callback('🏠 القائمة الرئيسية', 'main_menu')]);

    return { text, keyboard: Markup.inlineKeyboard(buttons) };
}

bot.hears(/طلباتي/, (ctx) => {
    try {
        const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
        if (usersDb[userId].isBanned) return;
        const orders = usersDb[userId].orders || [];
        if (orders.length === 0) return ctx.reply('🛒 لم تقم بأي عمليات شراء حتى الآن.').catch(()=>{});

        const { text, keyboard } = getOrdersPage(userId, 1);
        ctx.reply(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
    } catch(e){}
});

bot.hears(/سجل المحفظة/, (ctx) => {
    try {
      const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
      if (usersDb[userId].isBanned) return;
      const history = usersDb[userId].walletHistory || [];
      if (history.length === 0) return ctx.reply('📜 لا توجد معاملات مالية مسجلة حتى الآن.').catch(()=>{});
      let msg = '📜 **سجل المعاملات المالية (آخر 10 عمليات):**\n\n';
      history.slice(-10).reverse().forEach(item => {
          msg += '🔹 ' + item.type + ': *' + parseFloat(item.amount).toFixed(2) + ' EGP*\n🕒 ' + item.date + '\n━━━━━━━━━━━━\n';
      });
      ctx.reply(msg, { parse_mode: 'Markdown' }).catch(()=>{});
    } catch(e){}
});

bot.hears(/الدعم الفني/, (ctx) => {
    try {
      const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
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

bot.hears(/دعوة الأصدقاء/, (ctx) => {
    try {
      const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
      if (usersDb[userId].isBanned) return;
      const refLink = 'https://t.me/' + ctx.botInfo.username + '?start=ref_' + usersDb[userId].uid;
      ctx.reply('🎁 **نظام دعوة الأصدقاء المربح:**\n\nشارِك رابط الدعوة مع أصدقائك، وكلما قام أحدهم **بشحن محفظته**، ستحصل أنت فوراً على **2%** من قيمة شحنه تضاف لرصيدك تلقائياً!\n\n🔗 رابط الدعوة الخاص بك:\n`' + refLink + '`\n\n👥 عدد الأشخاص الذين دعوتهم: ' + usersDb[userId].referrals, {parse_mode: 'Markdown'}).catch(()=>{});
    } catch(e){}
});

bot.hears(/بحث عن خدمة/, (ctx) => {
    try {
      const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
      if (usersDb[userId].isBanned) return;
      botStates.search[userId] = true; saveDatabase();
      ctx.reply('🔍 أرسل اسم الخدمة التي تبحث عنها (مثال: Canva أو نتفلكس) أو اكتب `Ahmed/` لتسجيل دخول الأدمن:').catch(()=>{});
    } catch(e){}
});

bot.hears(/شحن المحفظة/, (ctx) => {
  try {
    const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
    if (usersDb[userId].isBanned) return;
    botStates.deposit[userId] = { step: 'WAIT_AMOUNT' }; saveDatabase();
    ctx.reply('💳 **شحن المحفظة عبر فودافون كاش**\n\nمن فضلك أكتب **المبلغ** الذي قمت بتحويله بالجنيه المصري (مثال: 100):').catch(()=>{});
  } catch(e){}
});

bot.hears(/استخدام كود خصم/, (ctx) => { 
    try {
      const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
      if (usersDb[userId].isBanned) return;
      botStates.promo[userId] = true; saveDatabase();
      ctx.reply('🎟️ **استخدام كود خصم أو قسيمة شحن:**\n\nمن فضلك أرسل الكود الآن في رسالة:', {parse_mode: 'Markdown'}).catch(()=>{}); 
    } catch(e){}
});

async function showCategories(ctx) {
  const userId = String(ctx.from.id);
  let loadingMsgId = null;
  try {
    initUser(userId); clearUserStates(userId);
    
    if (usersDb[userId].isBanned) return ctx.reply('❌ عذراً، تم حظرك من استخدام هذا البوت.').catch(()=>{});
    if (maintenanceMode && String(usersDb[userId].uid) !== '1001') return ctx.reply('🛠 **المتجر في حالة صيانة حالياً**\nنعمل على تحديث الخدمات، عودوا قريباً جداً!', { parse_mode: 'Markdown' }).catch(()=>{});

    if(ctx.callbackQuery) { 
        await ctx.answerCbQuery().catch(()=>{}); 
        await ctx.editMessageText('⏳ جاري جلب الأقسام...').catch(()=>{}); 
    } else { 
        const msg = await ctx.reply('⏳ جاري جلب الأقسام...').catch(()=>{}); 
        if(msg) loadingMsgId = msg.message_id; 
    }

    if (cachedServices.length === 0 || (Date.now() - lastCategoriesFetchTime > categoryCacheTime)) {
        cachedServices = await fetchAllServices(); 
        lastCategoriesFetchTime = Date.now();
    }

    if (cachedServices.length === 0) {
        const errorMsg = '⚠️ تعذر جلب الخدمات حالياً، يرجى المحاولة بعد قليل.';
        const retryKeyboard = Markup.inlineKeyboard([[Markup.button.callback('🔄 إعادة المحاولة', 'main_categories')]]);
        if(ctx.callbackQuery) return ctx.editMessageText(errorMsg, retryKeyboard).catch(()=>{});
        else if(loadingMsgId) return ctx.telegram.editMessageText(ctx.chat.id, loadingMsgId, null, errorMsg, retryKeyboard).catch(()=>{});
        else return ctx.reply(errorMsg, retryKeyboard).catch(()=>{});
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
      row.push(Markup.button.callback((categoryEmojis[categories[i]] || '📦') + ' ' + categories[i], 'cat_' + i));
      if (i + 1 < categories.length) row.push(Markup.button.callback((categoryEmojis[categories[i+1]] || '📦') + ' ' + categories[i+1], 'cat_' + (i + 1)));
      buttons.push(row);
    }
    buttons.push([Markup.button.callback('🏠 القائمة الرئيسية', 'main_menu')]);
    const keyboard = Markup.inlineKeyboard(buttons);

    usersDb[userId].tempCategories = categories;
    saveDatabase();

    if(ctx.callbackQuery) { 
        return ctx.editMessageText('اختر الفئة:', keyboard).catch(()=>{}); 
    } else if(loadingMsgId) { 
        return ctx.telegram.editMessageText(ctx.chat.id, loadingMsgId, null, 'اختر الفئة:', keyboard).catch(()=>{}); 
    } else { 
        return ctx.reply('اختر الفئة:', keyboard).catch(()=>{}); 
    }

  } catch (error) {
    console.error("showCategories Error:", error);
    const errMsg = '❌ حدث خطأ مؤقت أثناء جلب الأقسام، يرجى المحاولة مجدداً.';
    const retryBtn = Markup.inlineKeyboard([[Markup.button.callback('🔄 إعادة المحاولة', 'main_categories')]]);
    if(ctx.callbackQuery) {
        ctx.editMessageText(errMsg, retryBtn).catch(()=>{});
    } else if (loadingMsgId) {
        ctx.telegram.editMessageText(ctx.chat.id, loadingMsgId, null, errMsg, retryBtn).catch(()=>{});
    } else {
        ctx.reply(errMsg, retryBtn).catch(()=>{});
    }
  }
}

bot.hears(/الخدمات/, showCategories);
bot.action('main_categories', showCategories);

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

    const isFlashActive = flashSale && flashSale.active && Date.now() < flashSale.expiresAt;
    let flashStatus = '❌ (متوقف)';
    if (isFlashActive) {
        const remainingMinutes = Math.max(1, Math.ceil((flashSale.expiresAt - Date.now()) / (1000 * 60)));
        flashStatus = `⚡ (نشط حالياً - خصم ${flashSale.discount}% متبقي ${remainingMinutes} دقيقة)`;
    }
    const maintStatus = maintenanceMode ? '🛠️ (مفعل - المتجر مغلق للصيانة)' : '✅ (متوقف - المتجر يعمل)';

    const text = `👑 <b>لوحة تحكم الأدمن (الآيدي: 1001)</b>\n\n` +
                 `📊 <b>الإحصائيات المتقدمة:</b>\n` +
                 `👥 إجمالي العملاء: ${totalUsers}\n` +
                 `💰 إجمالي أرصدة العملاء: ${totalBalances.toFixed(2)} EGP\n` +
                 `🛍️ إجمالي المشتريات بالمتجر: ${totalStoreSpent.toFixed(2)} EGP\n` +
                 `📦 إجمالي الطلبات المنفذة: ${totalOrdersCount}\n\n` +
                 `📈 نسبة الربح العامة: ${globalMarkupPercent}%\n` +
                 `⚡ حالة الخصم المؤقت: ${flashStatus}\n` +
                 `🛑 وضع الصيانة: ${maintStatus}\n` +
                 `📱 رقم الكاش: <code>${vodafoneCashNumber}</code>`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('💳 طلبات الشحن المعلقة (' + (pendingDeposits ? pendingDeposits.length : 0) + ')', 'admin_pending_deposits')],
        [Markup.button.callback('💰 فحص رصيد المزود', 'admin_check_api_balance'), Markup.button.callback('🟢 فحص حالة المزود (API)', 'admin_check_api_status')],
        [Markup.button.callback('🎯 نسبة ربح لمنتج', 'admin_search_markup'), Markup.button.callback('📦 مخزن المنتجات المحلي', 'admin_search_stock')],
        [Markup.button.callback('📊 تعديل النسبة العامة', 'admin_set_global_markup'), Markup.button.callback('🎯 تعديل نسبة قسم', 'admin_set_custom_markup')],
        [Markup.button.callback('⚡ خصم مؤقت (Flash Sale)', 'admin_flash_sale'), Markup.button.callback('🎫 توليد كروت شحن', 'admin_create_promo')],
        [Markup.button.callback('✉ مراسلة عميل بالـ ID', 'admin_msg_by_id'), Markup.button.callback('👥 شحن رصيد بالـ ID', 'admin_charge_by_id')], 
        [Markup.button.callback('🛠️ تبديل وضع الصيانة', 'admin_toggle_maintenance'), Markup.button.callback('📝 سجل نشاط الأدمن', 'admin_view_logs')],
        [Markup.button.callback('📂 عرض حسابات العملاء', 'admin_view_users'), Markup.button.callback('💸 تقرير الأرباح', 'admin_profit_report')],
        [Markup.button.callback('🚫 حظر مستخدم', 'admin_ban_user'), Markup.button.callback('✅ فك حظر مستخدم', 'admin_unban_user')],
        [Markup.button.callback('📢 إرسال رسالة (إذاعة)', 'admin_broadcast'), Markup.button.callback('🚪 تسجيل خروج', 'admin_logout')]
      ]);

    if(ctx.callbackQuery) { ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{}); }
    else { ctx.reply(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{}); }
  } catch(e){}
}

bot.action('admin_profit_report', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        let totalProfit = 0; let todayProfit = 0; let yesterdayProfit = 0;
        const now = new Date();
        const todayStr = now.toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo' });
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const yesterdayStr = yesterday.toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo' });

        for (let id in usersDb) {
            const user = usersDb[id];
            if (user.orders && user.orders.length > 0) {
                user.orders.forEach(order => {
                    let profit = 0;
                    if (order.profit !== undefined && !isNaN(parseFloat(order.profit))) { 
                        profit = parseFloat(order.profit); 
                    } else { 
                        const price = parseFloat(order.price || 0); 
                        profit = isNaN(price) ? 0 : price - (price / (1 + (globalMarkupPercent / 100))); 
                    }
                    totalProfit += profit;
                    if (order.date.includes(todayStr)) { todayProfit += profit; } 
                    else if (order.date.includes(yesterdayStr)) { yesterdayProfit += profit; }
                });
            }
        }
        const msg = `💸 **تقرير أرباح المتجر:**\n\n📅 **أرباح اليوم:** *${todayProfit.toFixed(2)} EGP*\n📆 **أرباح أمس:** *${yesterdayProfit.toFixed(2)} EGP*\n📈 **إجمالي الأرباح الكلية:** *${totalProfit.toFixed(2)} EGP*\n\n*(ملاحظة: الأرباح القديمة محسوبة بشكل تقديري، أما أرباح الطلبات الجديدة يتم حسابها بدقة 100%).*`;
        ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
    } catch (e) { console.error(e); }
});

bot.action('admin_search_markup', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_SEARCH_MARKUP'; saveDatabase();
    ctx.editMessageText('🔍 أرسل اسم المنتج الذي تريد تحديد **نسبة ربح مخصصة** له:').catch(()=>{});
});
bot.action('admin_search_stock', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_SEARCH_STOCK'; saveDatabase();
    ctx.editMessageText('📦 أرسل اسم المنتج الذي تريد إدارة مخزونه المحلي:').catch(()=>{});
});

bot.action(/^setmarkup_(.+)$/, (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_SET_MARKUP_' + ctx.match[1]; saveDatabase();
    ctx.editMessageText('📈 أرسل النسبة المئوية للربح لهذا المنتج فقط (مثال: اكتب 50 لربح 50%).\n\n🗑️ لإلغاء النسبة المخصصة وجعل المنتج يتبع النسبة العامة، اكتب كلمة: `حذف`', {parse_mode: 'Markdown'}).catch(()=>{});
});
bot.action(/^addstock_(.+)$/, (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_ADD_STOCK_' + ctx.match[1]; saveDatabase();
    ctx.editMessageText('📦 **إدارة المخزن المحلي لهذا المنتج:**\n\n➕ **للإضافة:** أرسل العنصر كرسالة (تقدر تبعت أكتر من عنصر ورا بعض).\n👀 **للعرض:** أرسل كلمة `عرض` لمعرفة محتويات المخزن.\n🗑️ **للحذف:** أرسل كلمة `حذف الكل` لتفريغ مخزن هذا المنتج بالكامل.\n🔙 **للخروج:** أرسل كلمة `رجوع`', {parse_mode: 'Markdown'}).catch(()=>{});
});

bot.action('admin_pending_deposits', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
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
    ctx.answerCbQuery().catch(()=>{});
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
    ctx.answerCbQuery().catch(()=>{});
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
    ctx.answerCbQuery('تم التغيير بنجاح').catch(()=>{});
    try {
      maintenanceMode = !maintenanceMode; saveDatabase(); logAdminAction(ctx.from.id, 'تغيير وضع الصيانة');
      showAdminPanel(ctx);
    } catch(e){}
});

bot.action('admin_view_logs', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
      let msg = '📝 **سجل نشاط الأدمن (آخر 15 حركة):**\n\n';
      if (adminAuditLogs.length === 0) msg += 'لا توجد حركات مسجلة بعد.';
      else { adminAuditLogs.slice(-15).reverse().forEach(log => { msg += '🔹 الأدمن: `' + log.adminId + '`\n📌 الحركة: ' + log.action + '\n🕒 ' + log.date + '\n━━━━━━━━━━━━\n'; }); }
      ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
    } catch(e){}
});

bot.action('back_to_admin', (ctx) => { ctx.answerCbQuery().catch(()=>{}); try { showAdminPanel(ctx); } catch(e){} });
bot.action('admin_logout', (ctx) => { ctx.answerCbQuery().catch(()=>{}); botStates.adminSession[ctx.from.id] = false; botStates.adminLogin[ctx.from.id] = null; saveDatabase(); ctx.editMessageText('✅ تم تسجيل الخروج.').catch(()=>{}); });

bot.action('admin_view_users', (ctx) => {
  ctx.answerCbQuery().catch(()=>{});
  try {
    let userList = '👥 **قائمة العملاء:**\n\n'; let count = 0;
    for (let tgId in usersDb) { 
        const bStatus = usersDb[tgId].isBanned ? ' [محظور]' : '';
        userList += '👤 ID: `' + usersDb[tgId].uid + '` | الرصيد: ' + parseFloat(usersDb[tgId].balance).toFixed(2) + ' EGP' + bStatus + '\n'; count++; 
    }
    if (count === 0) userList = 'لا يوجد عملاء.';
    if (userList.length > 3900) userList = userList.substring(0, 3900) + '\n...';
    ctx.editMessageText(userList, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{}); 
  } catch(e){}
});

bot.action('admin_set_global_markup', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_GLOBAL_MARKUP'; saveDatabase();
    ctx.editMessageText('📊 **تعديل النسبة العامة:**\n\nأرسل الآن نسبة الربح الجديدة بالأرقام فقط (مثال: 15):', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_set_custom_markup', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_CUSTOM_MARKUP'; saveDatabase();
    ctx.editMessageText('🎯 **تعديل نسبة قسم معين:**\n\nأرسل اسم القسم والنسبة هكذا:\n`اسم_القسم النسبة`\n\n🗑️ لمسح جميع نسب الأقسام والعودة للنسبة العامة، اكتب: `حذف الكل`', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_flash_sale', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_FLASH_SALE'; saveDatabase();
    ctx.editMessageText('⚡ **إعداد خصم مؤقت (Flash Sale):**\n\nأرسل نسبة الخصم وعدد الساعات هكذا (بينهم مسافة):\n`النسبة الساعات`\n(مثال: `20 1` لخصم 20% لمدة ساعة واحدة)\n\n❌ لإلغاء الخصم الحالي، أرسل: `0 0`', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_charge_by_id', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_CHARGE_USER'; saveDatabase();
    ctx.editMessageText('💰 **شحن رصيد لعميل:**\n\nأرسل الآيدي والمبلغ هكذا (بينهم مسافة):\n`الآيدي المبلغ`\n(مثال: `123456789 50`)', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_create_promo', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_PROMO_CREATE'; saveDatabase();
    ctx.editMessageText('🎟️ **إنشاء كود خصم عام:**\n\nأرسل الكود والمبلغ هكذا (بينهم مسافة):\n`الكود المبلغ`\n(مثال: `WELCOME 20`)', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_create_voucher', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_VOUCHER_CREATE'; saveDatabase();
    ctx.editMessageText('🎫 **توليد كروت شحن (قسائم):**\n\nأرسل الكود والمبلغ هكذا (بينهم مسافة):\n`الكود المبلغ`\n(مثال: `VIP100 100`)', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_ban_user', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_BAN_USER'; saveDatabase();
    ctx.editMessageText('🚫 **حظر مستخدم:**\n\nأرسل الآيدي (ID) الخاص بالعميل لحظره نهائياً:', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_unban_user', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_UNBAN_USER'; saveDatabase();
    ctx.editMessageText('✅ **فك حظر مستخدم:**\n\nأرسل الآيدي (ID) الخاص بالعميل لفك الحظر عنه:', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_msg_by_id', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_USER_MSG'; saveDatabase();
    ctx.editMessageText('✉️ **مراسلة عميل عبر الـ ID:**\n\nأرسل الآيدي والرسالة هكذا:\n`الآيدي الرسالة`', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_broadcast', (ctx) => { 
    ctx.answerCbQuery().catch(()=>{});
    botStates.broadcast[ctx.from.id] = true; saveDatabase();
    ctx.editMessageText('📢 أرسل رسالة الإذاعة (أو اكتب `إلغاء`):', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{}); 
});

bot.action(/^ord_pg_(\d+)$/, (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        const userId = String(ctx.from.id);
        const page = parseInt(ctx.match[1]);
        const { text, keyboard } = getOrdersPage(userId, page);
        ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
    } catch(e){}
});

bot.action(/^ord_det_(\d+)$/, (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        const userId = String(ctx.from.id);
        const orderIndex = parseInt(ctx.match[1]);
        const order = usersDb[userId].orders[orderIndex];

        if (!order) return ctx.editMessageText('❌ الطلب غير موجود.').catch(()=>{});

        const safeName = order.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
        let detailsText = `📦 <b>تفاصيل الطلب:</b>\n\n` +
                          `🛍 <b>الخدمة:</b> ${safeName}\n` +
                          `💰 <b>السعر:</b> ${parseFloat(order.price).toFixed(2)} EGP\n` +
                          `🕒 <b>التاريخ:</b> ${order.date}\n` +
                          `🟢 <b>الحالة:</b> مكتمل\n\n`;

        if (order.details && order.details.trim() !== '') {
            detailsText += `📌 <b>البيانات المسلمة:</b>\n<code>${order.details}</code>\n`;
        }

        const returnPage = (botStates.ordersPage && botStates.ordersPage[userId]) ? botStates.ordersPage[userId] : 1;
        
        ctx.editMessageText(detailsText, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 رجوع للطلبات', `ord_pg_${returnPage}`)],
                [Markup.button.callback('🏠 القائمة الرئيسية', 'main_menu')]
            ])
        }).catch(()=>{});

    } catch(e){}
});

bot.action('noop', (ctx) => ctx.answerCbQuery().catch(()=>{}));

bot.action(/^cat_(\d+)$/, async (ctx) => {
  ctx.answerCbQuery().catch(()=>{});
  try {
    const userId = String(ctx.from.id); initUser(userId);
    if (usersDb[userId].isBanned) return;

    const catIndex = parseInt(ctx.match[1]);
    const selectedCategory = usersDb[userId].tempCategories ? usersDb[userId].tempCategories[catIndex] : null;
    
    if (!selectedCategory || !cachedServices || cachedServices.length === 0) { 
        cachedServices = await fetchAllServices(); 
        return ctx.editMessageText('⚠️ يرجى إعادة فتح الأقسام من البداية.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'main_categories')]])).catch(()=>{});
    }

    const categoryServices = cachedServices.filter(s => {
      let cat = getServiceCategory(s);
      return cat === selectedCategory || cat.toLowerCase().includes(selectedCategory.toLowerCase()) || selectedCategory.toLowerCase().includes(cat.toLowerCase());
    });

    if (categoryServices.length === 0) return ctx.editMessageText('لا توجد خدمات حالياً في هذا القسم.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'main_categories')]])).catch(()=>{});

    let buttons = categoryServices.map(srv => [Markup.button.callback((srv.name_ar || srv.name || srv.title) + ' - ' + calculateRetailPrice(srv, usersDb[userId], 1) + ' EGP', `buyact_${srv.id}`)]);
    buttons.push([Markup.button.callback('🔙 رجوع للأقسام', 'main_categories')]);

    ctx.editMessageText(`📦 خدمات قسم *${selectedCategory}*:`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
  } catch(err) {}
});

bot.action('cancel_action', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    clearUserStates(ctx.from.id);
    ctx.deleteMessage().catch(()=>{});
});

bot.action(/^buyact_(.+)$/, async (ctx) => {
  ctx.answerCbQuery().catch(()=>{});
  try {
     const userId = String(ctx.from.id); initUser(userId);
     if (usersDb[userId].isBanned) return;

     if (!cachedServices || cachedServices.length === 0) { cachedServices = await fetchAllServices(); }

     const srvId = ctx.match[1];
     const srv = cachedServices.find(s => String(s.id) === String(srvId));
     if(!srv) return ctx.editMessageText('الخدمة غير موجودة').catch(()=>{});

     const price = calculateRetailPrice(srv, usersDb[userId], 1);
     const srvName = srv.name_ar || srv.name || srv.title;

     const msg = await ctx.editMessageText(`⚠️ <b>إدخال الكمية المطلوبة:</b>\n\n🛍 <b>الخدمة:</b> ${srvName.replace(/</g, '&lt;').replace(/>/g, '&gt;')}\n💰 السعر للقطعة: <b>${price} EGP</b>\n\n✍️ <b>من فضلك، أرسل الكمية المطلوبة الآن في رسالة (أرقام فقط):</b>`, 
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([[Markup.button.callback('❌ إلغاء العملية', 'cancel_action')]])
        }
     ).catch(e => { if (!e.message.includes('not modified')) console.error(e); });

     if (msg) {
         botStates.buyQty[userId] = { srvId: String(srv.id), msgId: msg.message_id };
         saveDatabase();
     }
  } catch(err){}
});

function extractUsefulData(obj) {
    if (!obj) return null;
    if (typeof obj === 'string' || typeof obj === 'number') return String(obj);
    let extracted = [];
    const ignoreKeys = ['id', 'order', 'orders', 'order_id', 'status', 'created_at', 'updated_at', 'service_id', 'quantity', 'price', 'user_id', 'api', 'api_id', 'api_order_id', 'api_service_id', 'currency', 'charge', 'remains', 'start_count', 'link', 'cost', 'old_charge'];
    
    function deepExtract(currentObj) {
        if (currentObj === null || currentObj === undefined) return;
        if (typeof currentObj === 'string' || typeof currentObj === 'number') {
            let str = String(currentObj).trim();
            if (str.length > 0 && str !== '0' && str !== '0.00' && str !== '0.0') {
                extracted.push(str);
            }
        } else if (Array.isArray(currentObj)) {
            currentObj.forEach(deepExtract);
        } else if (typeof currentObj === 'object') {
            for (let key in currentObj) {
                if (ignoreKeys.includes(key.toLowerCase())) continue;
                deepExtract(currentObj[key]);
            }
        }
    }
    
    deepExtract(obj);
    if (extracted.length === 0) return null;
    return [...new Set(extracted)].join('\n');
}

// ==========================================
// 🛡️ صائد النصوص والحماية من فخ التجميد 🛡️
// ==========================================
bot.on('text', async (ctx, next) => {
  try {
    const userId = String(ctx.from.id); initUser(userId);
    if (usersDb[userId].isBanned) return;
    const text = ctx.message.text.trim();

    // 🛡️ القاطع الذكي: لو أرسل اليوزر اسم زرار من المنيو، نخرج من أي انتظار وننفذ الزرار فورا
    const menuCommands = ['الخدمات', 'طلباتي', 'حسابي', 'سجل المحفظة', 'شحن المحفظة', 'استخدام كود', 'دعوة الأصدقاء', 'الدعم الفني', 'بحث'];
    if (menuCommands.some(cmd => text.includes(cmd))) {
        clearUserStates(userId);
        return next(); // الذهاب للأوامر الرئيسية
    }

    if (botStates.buyQty && botStates.buyQty[userId]) {
        const srvId = botStates.buyQty[userId].srvId;
        const msgId = botStates.buyQty[userId].msgId;
        const qtyStr = text;
        
        if (!/^\d+$/.test(qtyStr) || parseInt(qtyStr) < 1) {
            return ctx.reply('❌ يرجى كتابة أرقام صحيحة وموجبة فقط للكمية (مثال: 1, 5, 10).').catch(()=>{});
        }
        
        const qty = parseInt(qtyStr);
        delete botStates.buyQty[userId];
        saveDatabase();

        if (userRequestLocks[userId]) {
            return ctx.reply('⚠️ جاري تنفيذ طلبك السابق، الرجاء الانتظار...').catch(()=>{});
        }
        userRequestLocks[userId] = true;

        try {
             if (!cachedServices || cachedServices.length === 0) { cachedServices = await fetchAllServices(); }
             const srv = cachedServices.find(s => String(s.id) === String(srvId));
             if (!srv) {
                 ctx.reply('❌ الخدمة غير موجودة أو تم حذفها من المزود.').catch(()=>{});
                 return;
             }

             if (Date.now() - lastCategoriesFetchTime > categoryCacheTime) {
                 cachedServices = await fetchAllServices();
                 lastCategoriesFetchTime = Date.now();
             }

             const retailPrice = parseFloat(calculateRetailPrice(srv, usersDb[userId], qty));
             
             const parseCost = parseFloat(srv.price_amount || srv.price || 0);
             const originalCost = isNaN(parseCost) ? 0 : parseCost * qty;
             const exactProfit = retailPrice - originalCost;
             
             const userBalance = usersDb[userId].balance;
             const name = srv.name_ar || srv.name || srv.title;
             const safeName = name.replace(/</g, '&lt;').replace(/>/g, '&gt;');

             if (userBalance < retailPrice) {
               const diff = (retailPrice - userBalance).toFixed(2);
               return ctx.reply(`❌ <b>رصيدك غير كافٍ لإتمام الطلب!</b>\n\n💳 رصيدك الحالي: <b>${userBalance.toFixed(2)} EGP</b>\n💰 المبلغ المطلـوب: <b>${retailPrice.toFixed(2)} EGP</b>\n⚠️ متبقي عليك: <b>${diff} EGP</b> فقط لشراء الخدمة.\n\nاشحن الفرق الآن وتابع طلبك فوراً!`,
                 {
                   parse_mode: 'HTML',
                   ...Markup.inlineKeyboard([
                       [Markup.button.callback('💳 شحن المحفظة (فودافون كاش)', 'main_categories')],
                       [Markup.button.callback('🔙 رجوع للأقسام', 'main_categories')]
                   ])
                 }
               ).catch(()=>{});
             }

             let processingMsg = await ctx.reply('⏳ جاري تنفيذ الطلب واستخراج بيانات الخدمة...').catch(()=>{});

             const hasLocalStock = localInventory[String(srv.id)] && localInventory[String(srv.id)].length >= qty;

             if (hasLocalStock) {
                 const deliveredItems = localInventory[String(srv.id)].splice(0, qty);
                 
                 usersDb[userId].balance -= retailPrice;
                 usersDb[userId].totalSpent += retailPrice;
                 usersDb[userId].walletHistory.push({ type: `شراء محلي (${name})`, amount: -retailPrice, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
                 
                 const safeDetails = deliveredItems.join('\n\n');
                 usersDb[userId].orders.push({ name: `${name} (${qty}x)`, price: retailPrice, profit: exactProfit, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }), details: safeDetails });
                 saveDatabase();

                 let deliveryMsg = `✅ <b>تم الشراء بنجاح</b>\n\n📦 <b>رقم الطلب:</b> #LOCAL-${Math.floor(1000 + Math.random() * 9000)}\n\n` +
                                   `🛍️ <b>الخدمة:</b> ${safeName}\n🔢 <b>الكمية:</b> ${qty}\n🟢 <b>الحالة:</b> مكتمل فوراً\n💰 <b>المدفوع:</b> ${retailPrice} EGP\n\n` +
                                   `📋 <b>العناصر المسلمة:</b>\n<code>${safeDetails.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`;

                 if(processingMsg) {
                     await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, null, deliveryMsg, { parse_mode: 'HTML', disable_web_page_preview: true, ...Markup.inlineKeyboard([[Markup.button.callback('🏠 القائمة الرئيسية', 'main_menu')]])}).catch(()=>{});
                 } else {
                     await ctx.reply(deliveryMsg, { parse_mode: 'HTML', disable_web_page_preview: true, ...Markup.inlineKeyboard([[Markup.button.callback('🏠 القائمة الرئيسية', 'main_menu')]])}).catch(()=>{});
                 }

                 notifyAdmin(`👑 <b>عملية بيع من المخزن المحلي:</b>\n🛍 ${safeName}\n💰 ${retailPrice} EGP\n📦 متبقي في المخزن: ${localInventory[String(srv.id)].length}`);
                 return; 
             }

             usersDb[userId].balance -= retailPrice;
             saveDatabase();

             try {
                const orderResponse = await placeOrderWithBestProvider(srv, qty);

                usersDb[userId].totalSpent += retailPrice;
                usersDb[userId].walletHistory.push({ type: `شراء (${name} - ${qty}x)`, amount: -retailPrice, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });

                if (!usersDb[userId].isVip && usersDb[userId].totalSpent >= 500) {
                    usersDb[userId].isVip = true;
                    bot.telegram.sendMessage(userId, '👑 **تهانينا!**\nتمت ترقية حسابك إلى **VIP** لتحقيقك مشتريات بـ 500 EGP. ستحصل على أسعار مخفضة تلقائياً!').catch(()=>{});
                }
                
                const currentOrder = { name: `${name} (${qty}x)`, price: retailPrice, profit: exactProfit, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }), details: "جاري المعالجة من المزود..." };
                usersDb[userId].orders.push(currentOrder);
                saveDatabase(); 

                let orderId = orderResponse.data?.order?.id || orderResponse.data?.id || orderResponse.data?.order_id || Math.floor(10000 + Math.random() * 90000);
                let rawDetails = null;

                await new Promise(resolve => setTimeout(resolve, 1500));

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

                let deliveryMsg = `✅ <b>تم الشراء بنجاح</b>\n\n📦 <b>رقم الطلب:</b> #${orderId}\n\n` +
                                  `🛍️ <b>الخدمة:</b> ${safeName}\n` +
                                  `🔢 <b>الكمية:</b> ${qty}\n\n` +
                                  `💰 <b>المبلغ المخصوم:</b> ${retailPrice} EGP\n\n`;

                if (rawDetails && rawDetails !== '{}' && rawDetails !== 'null' && rawDetails.trim() !== '') {
                    const safeRawText = String(rawDetails).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    deliveryMsg += `📋 <b>العناصر المسلمة:</b>\n${safeRawText}\n\n` +
                                   `📌 <b>البيانات المسلمة (اضغط للنسخ):</b>\n<code>${safeRawText}</code>`;
                    
                    const lastIndex = usersDb[userId].orders.length - 1;
                    if (lastIndex >= 0) { usersDb[userId].orders[lastIndex].details = safeRawText; saveDatabase(); }
                } else {
                    deliveryMsg += `📋 <b>العناصر المسلمة:</b>\n✅ تم تنفيذ الطلب بنجاح.`;
                }

                if(processingMsg) {
                    await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, null, deliveryMsg, { parse_mode: 'HTML', disable_web_page_preview: true, ...Markup.inlineKeyboard([[Markup.button.callback('🔙 العودة إلى الطلبات', 'main_menu'), Markup.button.callback('🏠 القائمة الرئيسية', 'main_menu')]])}).catch(()=>{});
                } else {
                    await ctx.reply(deliveryMsg, { parse_mode: 'HTML', disable_web_page_preview: true, ...Markup.inlineKeyboard([[Markup.button.callback('🔙 العودة إلى الطلبات', 'main_menu'), Markup.button.callback('🏠 القائمة الرئيسية', 'main_menu')]])}).catch(()=>{});
                }

                const adminLogMsg = `👑 <b>إشعار شراء جديد:</b>\n\n` +
                                    `📦 <b>رقم الطلب:</b> #${orderId}\n` +
                                    `🛍 <b>الخدمة:</b> ${safeName}\n` +
                                    `👤 <b>المشتري (ID):</b> <code>${usersDb[userId].uid}</code>\n` +
                                    `💰 <b>المدفوع:</b> ${retailPrice} EGP\n\n` +
                                    (rawDetails ? `📌 <b>البيانات:</b>\n<code>${String(rawDetails).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>` : '');
                notifyAdmin(adminLogMsg);

            } catch (error) {
                usersDb[userId].balance += retailPrice;
                
                const lastIndex = usersDb[userId].orders.length - 1;
                if (lastIndex >= 0) { 
                    usersDb[userId].orders[lastIndex].details = "❌ فشل الشراء وتم استرداد المبلغ بالكامل"; 
                    usersDb[userId].orders[lastIndex].profit = 0; 
                }
                saveDatabase();
                
                let apiErrorMsg = error.response?.data?.message || error.response?.data?.error || error.message || "عطل غير معروف";
                if (typeof apiErrorMsg === 'object') { apiErrorMsg = JSON.stringify(apiErrorMsg); }
                
                let failMsg = `❌ فشل الشراء من المزود الأساسي.\n\n⚠️ السبب: ${apiErrorMsg}\n\n✅ <b>تم استرجاع مبلغ (${retailPrice} EGP) إلى محفظتك بنجاح.</b>`;
                if(processingMsg) {
                    await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, null, failMsg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للأقسام', 'main_categories')]]) }).catch(()=>{});
                } else {
                    await ctx.reply(failMsg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للأقسام', 'main_categories')]]) }).catch(()=>{});
                }
            }
        } catch (err){
            console.error('Buy General Error:', err.message);
        } finally {
            delete userRequestLocks[userId];
        }
        return;
    }

    if (botStates.promo && botStates.promo[userId]) {
        delete botStates.promo[userId]; saveDatabase();
        const textCode = text.trim().toUpperCase();

        if (vouchers[textCode]) {
            if (vouchers[textCode].isUsed) return ctx.reply('❌ عذراً، كارت الشحن هذا تم استخدامه مسبقاً.').catch(()=>{});
            const amount = vouchers[textCode].amount; vouchers[textCode].isUsed = true;
            usersDb[userId].balance += amount;
            usersDb[userId].walletHistory.push({ type: 'شحن كارت (' + textCode + ')', amount: amount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
            saveDatabase(); 
            return ctx.reply(`🎉 **تم شحن محفظتك بنجاح!**\n💰 تمت إضافة: *${amount} EGP*\n💳 رصيدك الحالي: *${usersDb[userId].balance.toFixed(2)} EGP*`, { parse_mode: 'Markdown' }).catch(()=>{});
        }
        if (promoCodes[textCode]) {
            if (promoCodes[textCode].usedBy.map(String).includes(userId)) return ctx.reply('❌ لقد قمت باستخدام كود الخصم هذا مسبقاً.').catch(()=>{});
            const amount = promoCodes[textCode].amount; usersDb[userId].balance += amount;
            usersDb[userId].walletHistory.push({ type: 'كود خصم (' + textCode + ')', amount: amount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
            promoCodes[textCode].usedBy.push(userId); saveDatabase();
            return ctx.reply(`🎉 **كود خصم صحيح!**\n💰 تمت إضافة *${amount} EGP* لرصيدك.\n💳 رصيدك الحالي: *${usersDb[userId].balance.toFixed(2)} EGP*`, { parse_mode: 'Markdown' }).catch(()=>{});
        }

        return ctx.reply('❌ الكود الذي أدخلته غير صحيح أو منتهي الصلاحية.');
    }

    if (text === 'Ahmed/') {
        botStates.adminLogin[userId] = 'WAIT_EMAIL'; saveDatabase();
        return ctx.reply('🔐 **تسجيل دخول الأدمن**\n\nيرجى إرسال البريد الإلكتروني (Email):').catch(()=>{});
    }

    if (botStates.adminSession[userId] && botStates.adminInput[userId]) {
        const state = botStates.adminInput[userId];

        if (!state.startsWith('WAIT_ADD_STOCK_') && !state.startsWith('WAIT_BROADCAST')) {
            delete botStates.adminInput[userId];
        }

        if (state === 'WAIT_CHARGE_USER') {
            const parts = text.split(/\s+/);
            if (parts.length < 2) return ctx.reply('❌ صيغة غير صحيحة. استخدم: `الآيدي المبلغ`', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            const targetUid = parts[0].trim();
            const amount = parseFloat(parts[1]);
            if (isNaN(amount) || amount <= 0) return ctx.reply('❌ المبلغ غير صحيح.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));

            const targetUser = getUserByUid(targetUid);
            if (!targetUser) return ctx.reply('❌ لم يتم العثور على عميل بهذا الـ ID.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));

            targetUser.user.balance += amount;
            targetUser.user.walletHistory.push({ type: 'شحن من الإدارة', amount: amount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
            saveDatabase();
            logAdminAction(userId, `شحن ${amount} EGP للعميل ${targetUid}`);

            bot.telegram.sendMessage(targetUser.telegramId, `🎉 **تم شحن محفظتك من قِبل الإدارة!**\n💰 تمت إضافة: *${amount} EGP*\n💳 رصيدك الحالي: *${targetUser.user.balance.toFixed(2)} EGP*`, { parse_mode: 'Markdown' }).catch(()=>{});

            return ctx.reply(`✅ تم شحن رصيد العميل بنجاح!\n👤 العميل: \`${targetUid}\`\n💰 المبلغ: *${amount} EGP*`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
        }

        if (state === 'WAIT_PROMO_CREATE') {
            const parts = text.split(/\s+/); 
            if (parts.length < 2) return ctx.reply('❌ صيغة غير صحيحة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            const code = parts[0].toUpperCase(); const amount = parseFloat(parts[1]);
            if (isNaN(amount) || amount <= 0) return ctx.reply('❌ القيمة غير صحيحة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            promoCodes[code] = { amount, usedBy: [] }; saveDatabase();
            return ctx.reply(`✅ تم إنشاء كود الخصم!\n🎟 الكود: \`${code}\`\n💰 القيمة: *${amount} EGP*`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
        }

        if (state === 'WAIT_VOUCHER_CREATE') {
            const parts = text.split(/\s+/); 
            if (parts.length < 2) return ctx.reply('❌ صيغة غير صحيحة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            const code = parts[0].toUpperCase(); const amount = parseFloat(parts[1]);
            if (isNaN(amount) || amount <= 0) return ctx.reply('❌ القيمة غير صحيحة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            vouchers[code] = { amount, isUsed: false }; saveDatabase();
            return ctx.reply(`✅ تم إنشاء كارت الشحن!\n🎟 الكود: \`${code}\`\n💰 القيمة: *${amount} EGP*`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
        }

        if (state === 'WAIT_BAN_USER') {
            const targetUid = text;
            const targetUser = getUserByUid(targetUid);
            if (!targetUser) return ctx.reply('❌ لم يتم العثور على عميل.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));
            targetUser.user.isBanned = true; saveDatabase();
            return ctx.reply(`✅ تم حظر العميل \`${targetUid}\` بنجاح.`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
        }

        if (state === 'WAIT_UNBAN_USER') {
            const targetUid = text;
            const targetUser = getUserByUid(targetUid);
            if (!targetUser) return ctx.reply('❌ لم يتم العثور على عميل.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));
            targetUser.user.isBanned = false; saveDatabase();
            return ctx.reply(`✅ تم فك الحظر عن العميل \`${targetUid}\` بنجاح.`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
        }

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

            if (text === 'حذف') {
                delete customProductMarkups[srvId];
                saveDatabase();
                return ctx.reply('✅ تم مسح النسبة المخصصة! المنتج سيعود لاستخدام النسبة العامة للمتجر.', {parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]])});
            }

            const percent = parseFloat(text);
            if (isNaN(percent) || percent < 0) return ctx.reply('❌ يرجى إدخال رقم صحيح موجب أو كلمة "حذف".', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            
            customProductMarkups[srvId] = percent;
            saveDatabase();
            logAdminAction(userId, `تحديد نسبة ربح للمنتج ${srvId} بـ ${percent}%`);
            return ctx.reply(`✅ تم تحديد نسبة الربح للمنتج بنجاح: *${percent}%*\n(سيرتفع السعر تلقائياً إذا ارتفع سعره في المصدر)`, {parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]])});
        }

        if (state.startsWith('WAIT_ADD_STOCK_')) {
            const srvId = String(state.split('WAIT_ADD_STOCK_')[1]);

            if (text === 'إلغاء' || text === 'رجوع') {
                delete botStates.adminInput[userId];
                saveDatabase();
                return showAdminPanel(ctx);
            }

            if (text === 'عرض') {
                if (!localInventory[srvId] || localInventory[srvId].length === 0) {
                    return ctx.reply('📦 المخزن فارغ تماماً لهذا المنتج.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
                }
                let stockList = localInventory[srvId].map((item, idx) => `📦 **عنصر ${idx + 1}:**\n${item}`).join('\n\n');
                if (stockList.length > 3800) stockList = stockList.substring(0, 3800) + '\n\n... (يوجد المزيد لكن تم إخفاؤه لعدم تجاوز حد الرسائل)';
                return ctx.reply(`📦 **المخزن الحالي لهذا المنتج (${localInventory[srvId].length} عنصر):**\n\n${stockList}`, {parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]])});
            }

            if (text === 'حذف الكل') {
                localInventory[srvId] = [];
                saveDatabase();
                logAdminAction(userId, `تفريغ مخزن المنتج ${srvId}`);
                return ctx.reply('✅ تم تفريغ المخزن لهذا المنتج بنجاح!', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            }

            const item = text;
            if (!localInventory[srvId]) localInventory[srvId] = [];
            localInventory[srvId].push(item);
            saveDatabase();
            logAdminAction(userId, `إضافة 1 عنصر למخزن المنتج ${srvId}`);
            
            return ctx.reply(`✅ تم حفظ العنصر بنجاح!\n📦 إجمالي المخزون الحالي للمنتج: ${localInventory[srvId].length}\n\n(يمكنك إرسال العنصر التالي مباشرة، أو اضغط "رجوع" للعودة)`, Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
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
            if (isNaN(val) || val < 0) return ctx.reply('❌ يرجى إدخال رقم صحيح وموجب.');
            globalMarkupPercent = val; saveDatabase();
            return ctx.reply('✅ تم التحديث لتصبح: ' + globalMarkupPercent + '%');
        }

        if (state === 'WAIT_CUSTOM_MARKUP') {
            if (text === 'حذف الكل') {
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
                if (isNaN(percent) || percent < 0) continue;
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
            const parts = text.split(/\s+/);
            if (parts.length < 2) return ctx.reply('❌ صيغة غير صحيحة. أرسل: `النسبة الساعات` (مثال: `20 1`)', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
            const discountVal = parseFloat(parts[0]); const hoursVal = parseFloat(parts[1]);
            
            if (discountVal === 0 && hoursVal === 0) {
                flashSale = { active: false, discount: 0, expiresAt: 0 }; 
                saveDatabase();
                await ctx.reply('✅ تم إلغاء الخصم المؤقت.');
                return showAdminPanel(ctx);
            }

            if (isNaN(discountVal) || discountVal <= 0 || discountVal > 100 || isNaN(hoursVal) || hoursVal <= 0) {
                return ctx.reply('❌ أرقام غير صحيحة. يرجى إدخال نسبة بين 1 و 100 وعدد ساعات صحيح.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            }
            
            flashSale = { active: true, discount: discountVal, expiresAt: Date.now() + (hoursVal * 60 * 60 * 1000) }; 
            saveDatabase();

            for (let tgId in usersDb) {
                if (String(usersDb[tgId].uid) !== '1001' && !usersDb[tgId].isBanned) {
                    bot.telegram.sendMessage(tgId, `⚡ **عروض التخفيضات (Flash Sale)!**\n\n🎉 خصم **${discountVal}%** على كل الخدمات لمدة **${hoursVal} ساعة**!`, { parse_mode: 'Markdown' }).catch(() => {});
                }
            }
            await ctx.reply(`⚡ **تم تفعيل الخصم بنجاح!**\n🎁 نسبة الخصم: ${discountVal}%\n⏳ المدة: ${hoursVal} ساعة`);
            return showAdminPanel(ctx); 
        }
    }

    if (botStates.search && botStates.search[userId]) {
        delete botStates.search[userId]; saveDatabase();
        const query = text.toLowerCase();
        if (!cachedServices || cachedServices.length === 0) cachedServices = await fetchAllServices();
        const results = cachedServices.filter(s => (s.name_ar || s.name || s.title || '').toLowerCase().includes(query));
        if(results.length === 0) return ctx.reply('❌ لا توجد نتائج مطابقة.').catch(()=>{});
        let buttons = results.slice(0, 15).map(srv => [Markup.button.callback((srv.name_ar || srv.name || srv.title) + ' - ' + calculateRetailPrice(srv, usersDb[userId]) + ' EGP', `buyact_${srv.id}`)]);
        return ctx.reply('🔍 نتائج البحث:', Markup.inlineKeyboard(buttons)).catch(()=>{});
    }

    if (botStates.adminLogin && botStates.adminLogin[userId] === 'WAIT_EMAIL') {
      if (text === ADMIN_EMAIL) { botStates.adminLogin[userId] = 'WAIT_PASS'; saveDatabase(); return ctx.reply('🔒 أرسل كلمة المرور:').catch(()=>{}); } 
      else { botStates.adminLogin[userId] = null; saveDatabase(); return ctx.reply('❌ بريد خاطئ.').catch(()=>{}); }
    }
    if (botStates.adminLogin && botStates.adminLogin[userId] === 'WAIT_PASS') {
      if (text === ADMIN_PASS) {
        botStates.adminLogin[userId] = null; botStates.adminSession[userId] = true;
        initUser(userId); usersDb[userId].uid = 1001; saveDatabase();
        ctx.reply('✅ تم تسجيل الدخول.').catch(()=>{}); return showAdminPanel(ctx);
      } else { botStates.adminLogin[userId] = null; saveDatabase(); return ctx.reply('❌ كلمة مرور خاطئة.').catch(()=>{}); }
    }

    if (botStates.broadcast && botStates.broadcast[userId]) {
        if (text === 'إلغاء') { delete botStates.broadcast[userId]; saveDatabase(); return ctx.reply('✅ تم الإلغاء.'); }
        
        ctx.reply('⏳ جاري إرسال الإذاعة لجميع العملاء... (تتم ببطء لتجنب حظر تليجرام)').catch(()=>{});
        let count = 0;
        for (let tgId in usersDb) {
            if (String(usersDb[tgId].uid) !== '1001') {
                bot.telegram.sendMessage(tgId, '📢 **إذاعة:**\n\n' + text).catch(() => {});
                count++;
                if (count % 20 === 0) await new Promise(r => setTimeout(r, 1000)); 
            }
        }
        delete botStates.broadcast[userId]; saveDatabase(); 
        return ctx.reply('✅ تم الإرسال للجميع بنجاح.');
    }

    if (botStates.deposit && botStates.deposit[userId]) {
      const state = botStates.deposit[userId];
      if (state.step === 'WAIT_AMOUNT') {
        const amount = parseFloat(text);
        if (isNaN(amount) || amount <= 0) return ctx.reply('❌ أدخل مبلغاً صحيحاً وموجباً:').catch(()=>{});
        state.amount = amount; state.step = 'WAIT_NUMBER'; saveDatabase();
        return ctx.reply('💳 حول (' + amount + ' EGP) على رقم فودافون كاش:\n📱 `' + vodafoneCashNumber + '`\n\n**ثم أرسل الرقم الذي حوّلت منه:**', { parse_mode: 'Markdown' }).catch(()=>{});
      } else if (state.step === 'WAIT_NUMBER') {
        const amount = state.amount; delete botStates.deposit[userId]; initUser(userId);
        const reqData = { userId, userUid: usersDb[userId].uid, amount, senderNumber: text }; 
        ctx.reply('⏳ تم إرسال طلب الشحن للإدارة بنجاح، سيتم المراجعة والإضافة قريباً.').catch(()=>{});
        pendingDeposits.push(reqData); saveDatabase(); sendDepositNotification(reqData); return;
      }
    }

    return next();
  } catch(e) {}
});

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try {
        await loadDatabase(); 
    } catch (e) {
        console.error("Critical DB Failure, aborting request to protect data.");
        return res.status(500).send('DB Error'); 
    }
    
    await bot.handleUpdate(req.body); 

    if (pendingSaves.length > 0) {
        const saves = [...pendingSaves];
        pendingSaves = []; 
        await Promise.all(saves);
    }
    res.status(200).send('OK');
  } else {
    res.status(200).send('Bot is running on Vercel with MongoDB! 🚀');
  }
}

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    bot.launch().then(() => console.log('🚀 Bot launched via Long Polling!'));
}
