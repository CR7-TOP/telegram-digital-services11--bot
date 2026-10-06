import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';
import http from 'http';

dotenv.config();

// ----------------------------------------------------
// 1. خادم ويب (Web Server) ثابت ومربوط بـ 0.0.0.0 لإظهار الرابط في Replit + نظام الإيقاظ الذاتي
// ----------------------------------------------------
const PORT = 3000;
const server = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.write('البوت يعمل بكفاءة ومستيقظ 24/7 🚀');
    res.end();
});

server.listen(PORT, '0.0.0.0', () => {
    console.log(`✅ Web server started on port ${PORT}`);
    
    // نظام الإيقاظ الذاتي (Self-Ping) لمنع توقف السيرفر على ريبلت
    setInterval(() => {
        http.get(`http://localhost:${PORT}`, (res) => {
            // صمت إيجابي للحفاظ على النشاط
        }).on('error', (err) => {
            // تجاهل أخطاء الاتصال الداخلي المؤقتة
        });
    }, 4 * 60 * 1000); // يرسل لنفسه طلب كل 4 دقائق
}).on('error', (err) => {
    console.log('⚠️ خطأ في السيرفر، ولكن البوت سيستمر في العمل.');
});

// ----------------------------------------------------
// 2. حماية قصوى لمنع انهيار السيرفر تحت أي ضغط
// ----------------------------------------------------
process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception Handled:', err.message);
});
process.on('unhandledRejection', (reason, promise) => {
    console.error('⚠️ Unhandled Rejection Handled:', reason);
});

const bot = new Telegraf(process.env.BOT_TOKEN);

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_PASS = process.env.ADMIN_PASS;
let vodafoneCashNumber = process.env.VODAFONE_NUMBER || '01228098689'; 

const adminLoginStates = {};
const adminSession = {}; 
const depositStates = {};
const broadcastStates = {}; 
const promoCodeStates = {}; 
const searchStates = {}; 
const supportStates = {}; 
const adminReplyStates = {}; 
const userSpamControl = {}; 
const adminInputStates = {}; 

const userRequestLocks = {};
const categoryCacheTime = 60000; 
let lastCategoriesFetchTime = 0;

const DB_FILE = './database.json';

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

function loadDatabase() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      usersDb = data.usersDb || {};
      globalMarkupPercent = data.globalMarkupPercent !== undefined ? data.globalMarkupPercent : 15;
      customMarkups = data.customMarkups || {};
      pendingDeposits = data.pendingDeposits || [];
      promoCodes = data.promoCodes || {};
      flashSale = data.flashSale || { active: false, discount: 0, expiresAt: 0 };
      vouchers = data.vouchers || {};
      adminAuditLogs = data.adminAuditLogs || [];
      maintenanceMode = data.maintenanceMode || false;
      console.log('✅ تم تحميل قاعدة البيانات بنجاح!');
    }
  } catch (error) {
    console.error('❌ خطأ في قراءة قاعدة البيانات:', error);
  }
}

function saveDatabase() {
  try {
    const data = { usersDb, globalMarkupPercent, customMarkups, pendingDeposits, promoCodes, flashSale, vouchers, adminAuditLogs, maintenanceMode };
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
  } catch (e) {}
}

loadDatabase();

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
      let isUnique = false;
      let newUid;
      while (!isUnique) {
        newUid = Math.floor(1000000000 + Math.random() * 9000000000);
        isUnique = true;
        for (let tgId in usersDb) {
          if (String(usersDb[tgId].uid) === String(newUid)) {
            isUnique = false; break;
          }
        }
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

const apiClient = axios.create({
  baseURL: 'https://xprostore.store/api/v1',
  headers: {
    'Authorization': 'Bearer ' + process.env.PROVIDER_API_KEY,
    'Content-Type': 'application/json'
  },
  timeout: 8000
});

const categoryEmojis = {
  'شات GPT': '🤖', 'جيميناي': '✨', 'كاب كات': '✂', 'جروك': '🌌',
  'ادوبي': '🎨', 'كانفا': '🖌', 'نوشن': '📝', 'Leonardo.Ai': '🤖',
  'دوولينجو': '🦉', 'تيليجرام': '✈', 'مايكروسوفت': '💻', 'Miro': '🗺',
  'Zoom': '📹', 'iLovePDF': '📄', 'Envato': '🍃', 'Grammarly': '✍️',
  'Autodesk': '🏗', 'JetBrains': '💻', 'edX Premium': '🎓',
  'Peacock': '🦚', 'HBO MAX': '🎬', 'Paramount+': '⛰', 'Framer': '⚡',
  'Avira': '☂️', 'HMA VPN': '🌍', 'اكسبريس VPN': '🛡️️', 'جيميل': '📧',
  'ايكلاود': '☁', 'E SIM': '📱'
};

let cachedServices = [];

function getMainMenu() {
  let keyboard = [
    ['🛍 الخدمات', '🔍 بحث عن خدمة'],
    ['🛒 طلباتي', '💰 حسابي', '📜 سجل المحفظة'],
    ['💳 شحن المحفظة (فودافون كاش)', '🎟 استخدام كود خصم'],
    ['🔗 دعوة الأصدقاء (اربح 2%)', '🎫 تذاكر الدعم الفني'],
    ['👑 لوحة تحكم الأدمن']
  ];
  return Markup.keyboard(keyboard).resize();
}

bot.start((ctx) => {
  try {
    const userId = ctx.from.id;
    initUser(userId); 

    if (usersDb[userId].isBanned) return ctx.reply('❌ عذراً، تم حظرك من استخدام هذا البوت.').catch(()=>{});

    if (maintenanceMode && String(usersDb[userId].uid) !== '1001') {
        return ctx.reply('🛠 **المتجر في حالة صيانة حالياً**\nنعمل على تحديث الخدمات، عودوا قريباً جداً!', { parse_mode: 'Markdown' }).catch(()=>{});
    }

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

    ctx.reply('أهلاً بك في متجر الخدمات الرقمية! 🚀\n🆔 رقم الحساب الفريد الخاص بك: `' + usersDb[userId].uid + '`', {
      parse_mode: 'Markdown',
      ...getMainMenu()
    }).catch(()=>{});
  } catch (err) {}
});

function calculateRetailPrice(service, user, quantity = 1) {
  try {
    const originalPrice = parseFloat(service.price_amount || service.price || 0);
    const cat = getServiceCategory(service);

    let markup = globalMarkupPercent;
    if (customMarkups[cat] !== undefined) markup = customMarkups[cat];
    if (user && user.isVip) markup = Math.max(0, markup - 5);

    let finalPrice = originalPrice * (1 + markup / 100);

    if (flashSale.active && Date.now() < flashSale.expiresAt) {
        const discountAmount = finalPrice * (flashSale.discount / 100);
        finalPrice = finalPrice - discountAmount;
    } else if (flashSale.active && Date.now() >= flashSale.expiresAt) {
        flashSale.active = false;
        saveDatabase();
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

bot.hears(/^🎫 تذاكر الدعم الفني$/, (ctx) => {
    try {
      const userId = ctx.from.id; initUser(userId);
      if (usersDb[userId].isBanned) return;
      supportStates[userId] = true;
      ctx.reply('🎫 **نظام تذاكر الدعم الفني:**\n\nمن فضلك أرسل رسالتك أو مشكلتك الآن، وسيتم تحويلها مباشرة إلى فريق الدعم، وسنرد عليك في أقرب وقت:').catch(()=>{});
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
      ctx.reply('🔍 أرسل اسم الخدمة التي تبحث عنها (مثال: Canva أو نتفلكس):').catch(()=>{});
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
    notifyAdmin('🔔 <b>طلب شحن محفظة جديد!</b>\n\n👤 المستخدم (ID): <code>' + req.userUid + '</code>\n💰 المبلغ المطلوب: <b>' + req.amount + ' EGP</b>\n📱 الرقم المحول منه: <code>' + req.senderNumber + '</code>\n\nيرجى المراجعة من قسم (طلبات الشحن المعلقة):');
  } catch(e) {}
}

function showAdminPanel(ctx) {
  try {
    let totalUsers = 0; let totalBalances = 0; let totalStoreSpent = 0; let totalOrdersCount = 0;
    for (let id in usersDb) { 
        totalUsers++; 
        totalBalances += parseFloat(usersDb[id].balance || 0); 
        totalStoreSpent += parseFloat(usersDb[id].totalSpent || 0);
        totalOrdersCount += (usersDb[id].orders ? usersDb[id].orders.length : 0);
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
        [Markup.button.callback('📊 تعديل النسبة العامة', 'admin_set_global_markup'), Markup.button.callback('🎯 تعديل نسبة قسم', 'admin_set_custom_markup')],
        [Markup.button.callback('⚡ خصم مؤقت (Flash Sale)', 'admin_flash_sale'), Markup.button.callback('🎫 توليد كروت شحن', 'admin_create_voucher')],
        [Markup.button.callback('🛠️ تبديل وضع الصيانة', 'admin_toggle_maintenance'), Markup.button.callback('📝 سجل نشاط الأدمن', 'admin_view_logs')],
        [Markup.button.callback('👥 شحن رصيد بالـ ID', 'admin_charge_by_id'), Markup.button.callback('📂 عرض حسابات العملاء', 'admin_view_users')],
        [Markup.button.callback('🚫 حظر مستخدم', 'admin_ban_user'), Markup.button.callback('✅ فك حظر مستخدم', 'admin_unban_user')],
        [Markup.button.callback('📢 إرسال رسالة (إذاعة)', 'admin_broadcast'), Markup.button.callback('🎟️ إنشاء كود خصم', 'admin_create_promo')],
        [Markup.button.callback('🚪 تسجيل خروج', 'admin_logout')]
      ]);

    if(ctx.callbackQuery) { ctx.editMessageText(text, { parse_mode: 'Markdown', ...keyboard }).catch(()=>{}); }
    else { ctx.reply(text, { parse_mode: 'Markdown', ...keyboard }).catch(()=>{}); }
  } catch(e){}
}

bot.hears(/^👑 لوحة تحكم الأدمن$/, (ctx) => {
  try {
    const userId = ctx.from.id; if (adminSession[userId]) return showAdminPanel(ctx);
    adminLoginStates[userId] = 'WAIT_EMAIL'; ctx.reply('🔐 **تسجيل دخول الأدمن**\n\nيرجى إرسال البريد الإلكتروني (Email):').catch(()=>{});
  } catch(e){}
});

bot.action('admin_pending_deposits', (ctx) => {
    try {
        if (!pendingDeposits || pendingDeposits.length === 0) {
            return ctx.editMessageText('💳 **طلبات الشحن المعلقة:**\n\nلا توجد طلبات شحن معلقة حالياً.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]])).catch(()=>{});
        }
        let msg = '💳 **طلبات الشحن المعلقة (' + pendingDeposits.length + '):**\n\n';
        let inlineButtons = [];
        pendingDeposits.forEach((req, idx) => {
            msg += '👤 ID: `' + req.userUid + '`\n💰 المبلغ: *' + req.amount + ' EGP*\n📱 الرقم: `' + req.senderNumber + '`\n━━━━━━━━━━━━\n';
            inlineButtons.push([
                Markup.button.callback('✅ موافقة (' + req.amount + 'ج - ID: ' + req.userUid + ')', 'approve_dep_' + req.userId + '_' + req.amount),
                Markup.button.callback('❌ رفض', 'reject_dep_' + req.userId)
            ]);
        });
        inlineButtons.push([Markup.button.callback('🔙 رجوع', 'back_to_admin')]);
        ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(inlineButtons) }).catch(()=>{});
    } catch(e) {}
});

bot.action('admin_check_api_balance', async (ctx) => {
    try {
        ctx.editMessageText('⏳ جاري الاتصال بالمزود...').catch(()=>{});
        const res = await apiClient.get('/me/wallet');
        const balance = res.data.data?.balance || res.data?.balance || 'غير متوفر';
        ctx.editMessageText('💰 **رصيدك الأساسي في الموقع:**\n\n*' + parseFloat(balance).toFixed(2) + '*', {
            parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]])
        }).catch(()=>{});
    } catch(e) {
        ctx.editMessageText('❌ فشل الاتصال.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]])).catch(()=>{});
    }
});

bot.action('admin_check_api_status', async (ctx) => {
    try {
        ctx.editMessageText('⏳ جاري فحص استجابة سيرفر المزود...').catch(()=>{});
        const start = Date.now();
        await apiClient.get('/services?limit=1');
        const latency = Date.now() - start;
        ctx.editMessageText('🟢 **حالة سيرفر المزود (API):**\n\n✅ السيرفر يعمل بكفاءة تامة!\n⚡ سرعة الاستجابة (Latency): *' + latency + 'ms*', {
            parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]])
        }).catch(()=>{});
    } catch(e) {
        ctx.editMessageText('❌ سيرفر المزود لا يستجيب أو هناك عطل تقني حالياً!', {
            parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]])
        }).catch(()=>{});
    }
});

bot.action('admin_toggle_maintenance', (ctx) => {
    try {
      maintenanceMode = !maintenanceMode;
      saveDatabase();
      logAdminAction(ctx.from.id, 'تغيير وضع الصيانة إلى: ' + (maintenanceMode ? 'مفعل' : 'متوقف'));
      showAdminPanel(ctx);
      ctx.answerCbQuery('تم ' + (maintenanceMode ? 'تفعيل' : 'إلغاء') + ' وضع الصيانة.').catch(()=>{});
    } catch(e){}
});

bot.action('admin_view_logs', (ctx) => {
    try {
      let msg = '📝 **سجل نشاط الأدمن (آخر 15 حركة):**\n\n';
      if (adminAuditLogs.length === 0) msg += 'لا توجد حركات مسجلة بعد.';
      else {
          adminAuditLogs.slice(-15).reverse().forEach(log => {
              msg += '🔹 الأدمن: `' + log.adminId + '`\n📌 الحركة: ' + log.action + '\n🕒 ' + log.date + '\n━━━━━━━━━━━━\n';
          });
      }
      if (msg.length > 4000) msg = msg.substring(0, 4000) + '\n...';
      ctx.reply(msg, { parse_mode: 'Markdown' }).catch(()=>{});
      ctx.answerCbQuery().catch(()=>{});
    } catch(e){}
});

bot.action('back_to_admin', (ctx) => { try { showAdminPanel(ctx); } catch(e){} });
bot.action('admin_logout', (ctx) => { 
  try {
    adminSession[ctx.from.id] = false; adminLoginStates[ctx.from.id] = null; ctx.editMessageText('✅ تم تسجيل الخروج.').catch(()=>{}); 
  } catch(e){}
});

bot.action('admin_view_users', (ctx) => {
  try {
    let userList = '👥 **قائمة العملاء:**\n\n'; let count = 0;
    for (let tgId in usersDb) { 
        const bStatus = usersDb[tgId].isBanned ? ' [محظور]' : '';
        userList += '👤 ID: `' + usersDb[tgId].uid + '` | الرصيد: ' + parseFloat(usersDb[tgId].balance).toFixed(2) + ' EGP' + bStatus + '\n'; 
        count++; 
    }
    if (count === 0) userList = 'لا يوجد عملاء.';
    if (userList.length > 4000) userList = userList.substring(0, 4000) + '\n...';
    ctx.reply(userList, { parse_mode: 'Markdown' }).catch(()=>{}); ctx.answerCbQuery().catch(()=>{});
  } catch(e){}
});

bot.action('admin_set_global_markup', (ctx) => {
    try {
      adminInputStates[ctx.from.id] = 'WAIT_GLOBAL_MARKUP';
      ctx.editMessageText('📊 **تعديل النسبة العامة:**\n\nأرسل الآن نسبة الربح الجديدة بالأرقام فقط (مثال: 15):', { parse_mode: 'Markdown' }).catch(()=>{});
    } catch(e){}
});

bot.action('admin_set_custom_markup', (ctx) => {
    try {
      adminInputStates[ctx.from.id] = 'WAIT_CUSTOM_MARKUP';
      ctx.editMessageText('🎯 **تعديل نسبة قسم معين:**\n\nأرسل اسم القسم والنسبة هكذا (أو لستة أسطر):\n`اسم_القسم النسبة`\n(مثال:\nكانفا 60\nجروك 50)', { parse_mode: 'Markdown' }).catch(()=>{});
    } catch(e){}
});

bot.action('admin_flash_sale', (ctx) => {
    try {
      adminInputStates[ctx.from.id] = 'WAIT_FLASH_SALE';
      ctx.editMessageText('⚡ **إعداد خصم مؤقت (Flash Sale):**\n\nأرسل نسبة الخصم وعدد الساعات هكذا:\n`نسبة_الخصم عدد_الساعات`\n(مثال: `10 24` يعني خصم 10% لمدة 24 ساعة)', { parse_mode: 'Markdown' }).catch(()=>{});
    } catch(e){}
});

bot.action('admin_create_voucher', (ctx) => {
    try {
      adminInputStates[ctx.from.id] = 'WAIT_VOUCHER_CREATE';
      ctx.editMessageText('🎫 **توليد كروت شحن (قسائم):**\n\nأرسل القيمة والمبلغ هكذا:\n`الكود القيمة`\n(مثال: `MEDX50 50` أو `VIP100 100`)', { parse_mode: 'Markdown' }).catch(()=>{});
    } catch(e){}
});

bot.action('admin_ban_user', (ctx) => { ctx.editMessageText('لحظر مستخدم، أرسل الأمر:\n`/ban الـID`', { parse_mode: 'Markdown' }).catch(()=>{}); });
bot.action('admin_unban_user', (ctx) => { ctx.editMessageText('لكسر الحظر عن مستخدم، أرسل الأمر:\n`/unban الـID`', { parse_mode: 'Markdown' }).catch(()=>{}); });

bot.action('admin_broadcast', (ctx) => { broadcastStates[ctx.from.id] = true; ctx.editMessageText('📢 أرسل رسالة الإذاعة (أو "إلغاء"):').catch(()=>{}); });
bot.action('admin_create_promo', (ctx) => { ctx.editMessageText('/promo [الكود] [المبلغ]', { parse_mode: 'Markdown' }).catch(()=>{}); });
bot.action('admin_charge_by_id', (ctx) => { ctx.editMessageText('/charge الـID المبلغ', { parse_mode: 'Markdown' }).catch(()=>{}); });

bot.on('text', async (ctx, next) => {
  try {
    const userId = ctx.from.id;
    initUser(userId);
    if (usersDb[userId].isBanned) return;

    const text = ctx.message.text;

    if (adminSession[userId] && adminInputStates[userId]) {
        const state = adminInputStates[userId];
        delete adminInputStates[userId];

        if (state === 'WAIT_GLOBAL_MARKUP') {
            const val = parseFloat(text);
            if (isNaN(val)) return ctx.reply('❌ يرجى إدخال رقم صحيح.').catch(()=>{});
            globalMarkupPercent = val;
            saveDatabase();
            logAdminAction(userId, 'تعديل النسبة العامة إلى: ' + val + '%');
            return ctx.reply('✅ تم تحديث نسبة الربح العامة لتصبح: ' + globalMarkupPercent + '%').catch(()=>{});
        }

        if (state === 'WAIT_CUSTOM_MARKUP') {
            const lines = text.split('\n');
            let updatedCount = 0;
            let reportMsg = '📊 **تقرير تحديث نسب الأقسام:**\n\n';

            for (let line of lines) {
                line = line.trim();
                if (!line) continue;
                const lastSpace = line.lastIndexOf(' ');
                if (lastSpace === -1) continue;

                const catName = line.substring(0, lastSpace).trim();
                const percent = parseFloat(line.substring(lastSpace + 1));
                if (isNaN(percent)) continue;

                let matchedCat = catName;
                if (cachedServices && cachedServices.length > 0) {
                    const found = cachedServices.find(s => getServiceCategory(s).toLowerCase().includes(catName.toLowerCase()));
                    if (found) {
                        matchedCat = getServiceCategory(found);
                    }
                }

                customMarkups[matchedCat] = percent;
                updatedCount++;
                reportMsg += '✅ ' + matchedCat + ' ⟵' + percent + '%\n';
            }

            if (updatedCount === 0) {
                return ctx.reply('❌ لم يتم التعرف على أي قسم. أرسل هكذا:\n`اسم_القسم النسبة`', { parse_mode: 'Markdown' }).catch(()=>{});
            }

            saveDatabase();
            logAdminAction(userId, 'تعديل نسب عدة أقسام دفعة واحدة');
            return ctx.reply(reportMsg, { parse_mode: 'Markdown' }).catch(()=>{});
        }

        if (state === 'WAIT_FLASH_SALE') {
            const parts = text.split(' ');
            if (parts.length < 2) return ctx.reply('❌ صيغة غير صحيحة. استخدم: `الخصم الساعات`').catch(()=>{});
            const discountVal = parseFloat(parts[0]);
            const hoursVal = parseFloat(parts[1]);

            if (discountVal === 0 && hoursVal === 0) {
                flashSale = { active: false, discount: 0, expiresAt: 0 };
                saveDatabase();
                logAdminAction(userId, 'إلغاء الخصم المؤقت');
                return ctx.reply('✅ تم إلغاء الخصم المؤقت بنجاح.').catch(()=>{});
            }

            if (isNaN(discountVal) || isNaN(hoursVal)) return ctx.reply('❌ يرجى إدخال أرقام صحيحة.').catch(()=>{});

            flashSale = {
                active: true,
                discount: discountVal,
                expiresAt: Date.now() + (hoursVal * 60 * 60 * 1000)
            };
            saveDatabase();
            logAdminAction(userId, 'تفعيل خصم مؤقت بقيمة ' + discountVal + '% لمدة ' + hoursVal + ' ساعة');

            for (let tgId in usersDb) {
                if (String(usersDb[tgId].uid) !== '1001' && !usersDb[tgId].isBanned) {
                    bot.telegram.sendMessage(
                        tgId, 
                        '⚡ **عروض التخفيضات الكبرى (Flash Sale)!**\n\n🎉 تم تفعيل خصم مؤقت بنسبة **' + discountVal + '%** على كافة الخدمات!\n⏳ العرض ساري لمدة **' + hoursVal + ' ساعة** فقط.\n\nاستغل الفرصة واطلب خدماتك الآن! 🛍️',
                        { parse_mode: 'Markdown' }
                    ).catch(() => {});
                }
            }

            return ctx.reply('⚡ **تم تفعيل الخصم المؤقت وإرسال الإشعارات لكافة العملاء بنجاح!**\n\n🎁 نسبة الخصم: ' + discountVal + '%\n⏳ المدة: ' + hoursVal + ' ساعة').catch(()=>{});
        }

        if (state === 'WAIT_VOUCHER_CREATE') {
            const parts = text.split(' ');
            if (parts.length < 2) return ctx.reply('❌ صيغة غير صحيحة. استخدم: `الكود القيمة`').catch(()=>{});
            const code = parts[0].toUpperCase();
            const amount = parseFloat(parts[1]);
            if (isNaN(amount)) return ctx.reply('❌ القيمة المالية غير صحيحة.').catch(()=>{});
            vouchers[code] = { amount, isUsed: false };
            saveDatabase();
            logAdminAction(userId, 'إنشاء بطاقة شحن بقيمة ' + amount + ' EGP بكود: ' + code);
            return ctx.reply('✅ تم إنشاء كارت الشحن بنجاح!\n🎟 الكود: `' + code + '`\n💰 القيمة: *' + amount + ' EGP*', { parse_mode: 'Markdown' }).catch(()=>{});
        }
    }

    if (supportStates[userId]) {
        delete supportStates[userId];
        const userUid = usersDb[userId].uid;
        notifyAdmin('🎫 <b>تذكرة دعم فني جديدة!</b>\n\n👤 من المستخدم (ID): <code>' + userUid + '</code>\n✉ النص:\n' + text + '\n\nللرد، استخدم الأمر:\n<code>/reply ' + userUid + ' [رسالتك]</code>');
        return ctx.reply('✅ تم إرسال رسالتك إلى فريق الدعم بنجاح، سيتم الرد عليك قريباً.').catch(()=>{});
    }

    if (searchStates[userId]) {
        delete searchStates[userId];
        const query = text.toLowerCase();
        if (!cachedServices || cachedServices.length === 0) {
            try {
                const res = await apiClient.get('/services?limit=1000');
                cachedServices = res.data.data || res.data.services || res.data;
                if (!Array.isArray(cachedServices)) cachedServices = Object.values(cachedServices);
            } catch(e) {}
        }
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
        if (text.trim() === 'إلغاء') { delete broadcastStates[userId]; return ctx.reply('✅ تم الإلغاء.').catch(()=>{}); }
        for (let tgId in usersDb) {
            if (String(usersDb[tgId].uid) !== '1001') bot.telegram.sendMessage(tgId, '📢 **إذاعة:**\n\n' + text).catch(() => {});
        }
        delete broadcastStates[userId]; return ctx.reply('✅ تم الإرسال للجميع.').catch(()=>{});
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
        pendingDeposits.push(reqData);
        saveDatabase();
        sendDepositNotification(reqData);
        return;
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
          const amount = vouchers[textCode].amount;
          vouchers[textCode].isUsed = true;
          usersDb[userId].balance += amount;
          usersDb[userId].walletHistory.push({ type: 'شحن كارت (' + textCode + ')', amount: amount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
          saveDatabase();
          return ctx.reply('🎉 **مبروك! تم شحن محفظتك بنجاح عبر كارت الشحن.**\n💰 تمت إضافة: *' + amount + ' EGP*', { parse_mode: 'Markdown' }).catch(()=>{});
      }

      if (promoCodes[textCode]) {
          if (promoCodes[textCode].usedBy.includes(userId)) return ctx.reply('❌ استخدمت الكود مسبقاً.').catch(()=>{});
          const amount = promoCodes[textCode].amount; 
          usersDb[userId].balance += amount;
          usersDb[userId].walletHistory.push({ type: 'كود خصم (' + textCode + ')', amount: amount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
          promoCodes[textCode].usedBy.push(userId); 
          saveDatabase();
          return ctx.reply('🎉 تمت إضافة *' + amount + ' EGP* لرصيدك.', { parse_mode: 'Markdown' }).catch(()=>{});
      }
      return next();
    } catch(e) {}
});

bot.action(/approve_dep_(\d+)_([\d.]+)/, async (ctx) => {
  try {
    const targetUserId = ctx.match[1]; 
    const amount = parseFloat(ctx.match[2]);

    initUser(targetUserId); 
    usersDb[targetUserId].balance += amount; 
    usersDb[targetUserId].walletHistory.push({ type: 'شحن فودافون كاش', amount: amount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });

    // حذف الطلب نهائياً من القائمة المعلقة بمجرد الموافقة
    pendingDeposits = pendingDeposits.filter(d => String(d.userId) !== String(targetUserId));
    saveDatabase();

    const referrerTelegramId = usersDb[targetUserId].referredBy;
    if (referrerTelegramId && usersDb[referrerTelegramId]) {
        const bonus = amount * 0.02; 
        usersDb[referrerTelegramId].balance += bonus;
        usersDb[referrerTelegramId].walletHistory.push({ type: 'عمولة إحالة 2%', amount: bonus, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });

        bot.telegram.sendMessage(
            referrerTelegramId, 
            '🎉 **عمولة دعوة أصدقاء جديدة!**\n\nقام صديقك الذي دعوته بشحن محفظته بمبلغ *' + amount + ' EGP*.\n💰 حصلت على عمولة **2%** بقيمة: *' + bonus.toFixed(2) + ' EGP* أضيفت لمحفظتك!', 
            { parse_mode: 'Markdown' }
        ).catch(() => {});
    }

    ctx.editMessageText('✅ تمت الموافقة وإضافة مبلغ *' + amount + ' EGP* للمستخدم وحذف الطلب من المعلقات.', { parse_mode: 'Markdown' }).catch(()=>{});
    bot.telegram.sendMessage(targetUserId, '🎉 **تم شحن محفظتك بنجاح!**\n💰 تمت إضافة: *' + amount + ' EGP*', { parse_mode: 'Markdown' }).catch(() => {});
  } catch(err) {}
});

bot.action(/reject_dep_(\d+)/, async (ctx) => {
  try {
    const targetUserId = ctx.match[1];
    // حذف الطلب نهائياً من القائمة المعلقة بمجرد الرفض
    pendingDeposits = pendingDeposits.filter(d => String(d.userId) !== String(targetUserId));
    saveDatabase();

    ctx.editMessageText('❌ تم رفض الطلب وإزالته من القائمة المعلقة.').catch(()=>{});
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
    if (usersDb[userId].isBanned) return;
    if (maintenanceMode && String(usersDb[userId].uid) !== '1001') return ctx.reply('🛠 المتجر في حالة صيانة حالياً.').catch(()=>{});

    if (userRequestLocks[userId]) {
        if (ctx.callbackQuery) {
            return ctx.answerCbQuery('⚠️ يجري معالجة طلبك، انتظر لحظة...', { show_alert: false }).catch(()=>{});
        }
        return;
    }
    userRequestLocks[userId] = true;
    setTimeout(() => { delete userRequestLocks[userId]; }, 1500);

    let loadingMsgId = null;
    if(ctx.callbackQuery) { 
        await ctx.answerCbQuery().catch(()=>{});
        ctx.editMessageText('⏳ جاري جلب الأقسام، يرجى الانتظار...').catch(()=>{}); 
    } 
    else { 
        const msg = await ctx.reply('⏳ جاري جلب الأقسام، يرجى الانتظار...').catch(()=>{}); 
        if(msg) loadingMsgId = msg.message_id; 
    }

    if (cachedServices.length === 0 || (Date.now() - lastCategoriesFetchTime > categoryCacheTime)) {
        try {
            const res = await apiClient.get('/services?limit=1000');
            let services = res.data.data || res.data.services || res.data;
            if (!Array.isArray(services)) services = Object.values(services);
            cachedServices = services;
            lastCategoriesFetchTime = Date.now();
        } catch (apiErr) {
            if(ctx.callbackQuery) {
                return ctx.editMessageText('⚠️ الضغط على السيرفر مرتفع حالياً، يرجى المحاولة بعد قليل.').catch(()=>{});
            } else if(loadingMsgId) {
                return ctx.telegram.editMessageText(ctx.chat.id, loadingMsgId, null, '⚠️ الضغط على السيرفر مرتفع حالياً، يرجى المحاولة بعد قليل.').catch(()=>{});
            } else {
                return ctx.reply('⚠️ الضغط على السيرفر مرتفع حالياً، يرجى المحاولة بعد قليل.').catch(()=>{});
            }
        }
    }

    let categories = Object.keys(categoryEmojis);
    cachedServices.forEach(s => {
      let catStr = getServiceCategory(s);
      if (catStr && !categories.includes(catStr) && catStr !== 'أخرى') categories.push(catStr);
    });

    let buttons = [];
    for (let i = 0; i < categories.length; i += 2) {
      const row = [];
      row.push(Markup.button.callback((categoryEmojis[categories[i]] || '📦') + ' ' + categories[i], 'cat_' + encodeURIComponent(categories[i])));
      if (i + 1 < categories.length) row.push(Markup.button.callback((categoryEmojis[categories[i+1]] || '📦') + ' ' + categories[i+1], 'cat_' + encodeURIComponent(categories[i+1])));
      buttons.push(row);
    }
    buttons.push([Markup.button.callback('🏠 القائمة الرئيسية', 'main_menu')]);
    const keyboard = Markup.inlineKeyboard(buttons);

    if(ctx.callbackQuery) {
        return ctx.editMessageText('اختر الفئة:', keyboard).catch(()=>{});
    } else if(loadingMsgId) {
        return ctx.telegram.editMessageText(ctx.chat.id, loadingMsgId, null, 'اختر الفئة:', keyboard).catch(()=>{});
    } else {
        return ctx.reply('اختر الفئة:', keyboard).catch(()=>{});
    }

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
    const categoryServices = cachedServices.filter(s => {
      let cat = getServiceCategory(s);
      return cat === selectedCategory || cat.toLowerCase().includes(selectedCategory.toLowerCase()) || selectedCategory.toLowerCase().includes(cat.toLowerCase());
    });

    if (categoryServices.length === 0) return ctx.answerCbQuery('لا توجد خدمات.', { show_alert: true }).catch(()=>{});

    let buttons = categoryServices.map(srv => [Markup.button.callback((srv.name_ar || srv.name || srv.title) + ' - ' + calculateRetailPrice(srv, usersDb[userId], 1) + ' EGP', 'confirm_' + srv.id)]);
    buttons.push([Markup.button.callback('🔙 رجوع للأقسام', 'main_categories')]);

    ctx.editMessageText('📦 خدمات قسم *' + selectedCategory + '*:', { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
  } catch(err) {}
});

bot.action('main_menu', (ctx) => {
  try {
    const userId = ctx.from.id; initUser(userId);
    if (usersDb[userId].isBanned) return;
    ctx.deleteMessage().catch(()=>{}); ctx.reply('القائمة الرئيسية 🚀', getMainMenu()).catch(()=>{});
  } catch(e){}
});

bot.action(/confirm_(\d+)/, (ctx) => {
  try {
     const userId = ctx.from.id; initUser(userId);
     if (usersDb[userId].isBanned) return;

     const srv = cachedServices.find(s => s.id == ctx.match[1]);
     if(!srv) return ctx.answerCbQuery('الخدمة غير موجودة').catch(()=>{});

     bulkQuantityStates[userId] = { srvId: srv.id, qty: 1 };
     const price = calculateRetailPrice(srv, usersDb[userId], 1);
     const srvName = srv.name_ar || srv.name || srv.title;

     ctx.editMessageText('⚠️️ اختر الكمية المطلوبة لـ:\n\n🛍️ *' + srvName + '*\n💰 السعر للقطعة: ' + price + ' EGP\n🔢 الكمية الحالية: 1', 
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

bot.action(/qty_inc_(\d+)/, (ctx) => {
    try {
      const userId = ctx.from.id;
      const srvId = ctx.match[1];
      if (!bulkQuantityStates[userId]) bulkQuantityStates[userId] = { srvId, qty: 1 };
      bulkQuantityStates[userId].qty += 1;
      updateQuantityPrompt(ctx, srvId, bulkQuantityStates[userId].qty);
    } catch(e){}
});

bot.action(/qty_dec_(\d+)/, (ctx) => {
    try {
      const userId = ctx.from.id;
      const srvId = ctx.match[1];
      if (!bulkQuantityStates[userId]) bulkQuantityStates[userId] = { srvId, qty: 1 };
      if (bulkQuantityStates[userId].qty > 1) bulkQuantityStates[userId].qty -= 1;
      updateQuantityPrompt(ctx, srvId, bulkQuantityStates[userId].qty);
    } catch(e){}
});

function updateQuantityPrompt(ctx, srvId, qty) {
    try {
      const userId = ctx.from.id;
      const srv = cachedServices.find(s => s.id == srvId);
      if (!srv) return;
      const price = calculateRetailPrice(srv, usersDb[userId], qty);
      const srvName = srv.name_ar || srv.name || srv.title;

      ctx.editMessageText('⚠️ اختر الكمية المطلوبة لـ:\n\n🛍 *' + srvName + '*\n💰 السعر الإجمالي (' + qty + ' قطعة): *' + price + ' EGP*\n🔢 الكمية الحالية: ' + qty, 
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

bot.action(/buy_(\d+)/, async (ctx) => {
  try {
     const userId = ctx.from.id; initUser(userId);
     if (usersDb[userId].isBanned) return;

     const srv = cachedServices.find(s => s.id == ctx.match[1]);
     if (!srv) return ctx.answerCbQuery('الخدمة غير موجودة').catch(()=>{});

     const qty = bulkQuantityStates[userId]?.qty || 1;
     const retailPrice = parseFloat(calculateRetailPrice(srv, usersDb[userId], qty));
     const userBalance = usersDb[userId].balance;
     const name = srv.name_ar || srv.name || srv.title;

     if (userBalance < retailPrice) {
       const diff = (retailPrice - userBalance).toFixed(2);
       return ctx.editMessageText('❌ **رصيدك غير كافٍ لإتمام الطلب!**\n\n💳 رصيدك الحالي: *' + userBalance.toFixed(2) + ' EGP*\n💰 المبلغ المطلـوب: *' + retailPrice.toFixed(2) + ' EGP*\n⚠️ متبقي عليك: *' + diff + ' EGP* فقط لشراء الخدمة.\n\nاشحن الفرق الآن وتابع طلبك فوراً!',
         {
           parse_mode: 'Markdown',
           ...Markup.inlineKeyboard([
               [Markup.button.callback('💳 شحن المحفظة (فودافون كاش)', 'main_categories')],
               [Markup.button.callback('🔙 رجوع للأقسام', 'main_categories')]
           ])
         }
       ).catch(()=>{});
     }

     await ctx.editMessageText('⏳ جاري تنفيذ الطلب وإرسال تفاصيل الخدمة...').catch(()=>{});

     try {
        const orderResponse = await apiClient.post('/orders', { service_id: srv.id, quantity: qty }, { headers: { 'Idempotency-Key': Date.now().toString() } });

        usersDb[userId].balance -= retailPrice;
        usersDb[userId].totalSpent += retailPrice;

        usersDb[userId].walletHistory.push({ type: 'شراء (' + name + ' - ' + qty + 'x)', amount: -retailPrice, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });

        if (!usersDb[userId].isVip && usersDb[userId].totalSpent >= 500) {
            usersDb[userId].isVip = true;
            await bot.telegram.sendMessage(userId, '👑 **تهانينا!**\nتمت ترقية حسابك إلى **VIP** لتحقيقك مشتريات بـ 500 EGP. ستحصل على أسعار مخفضة تلقائياً!').catch(()=>{});
        }

        usersDb[userId].orders.push({ name: name + ' (' + qty + 'x)', price: retailPrice, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
        saveDatabase(); 

        const orderIdRandom = orderResponse.data?.order?.id || orderResponse.data?.id || Math.floor(10000 + Math.random() * 90000);

        await ctx.editMessageText('✅ **تم تنفيذ طلبك بنجاح!**\n\n🛍 الخدمة: ' + name + '\n🔢 الكمية: ' + qty + '\n💰 إجمالي المدفوع: ' + retailPrice + ' EGP\n💳 الرصيد المتبقي: ' + (usersDb[userId].balance.toFixed ? usersDb[userId].balance.toFixed(2) : usersDb[userId].balance) + ' EGP', { parse_mode: 'Markdown' }).catch(()=>{});

        // استخراج بيانات التفعيل والأكواد بدقة تامة من استجابة المزود
        const responseData = orderResponse.data;
        let rawDetails = null;

        if (responseData) {
            if (typeof responseData === 'string') {
                rawDetails = responseData;
            } else {
                const targetObj = responseData.order || responseData.data || responseData;
                if (typeof targetObj === 'object' && targetObj !== null) {
                    rawDetails = targetObj.details || 
                                 targetObj.account || 
                                 targetObj.credentials || 
                                 targetObj.code || 
                                 targetObj.note || 
                                 targetObj.message || 
                                 targetObj.text || 
                                 targetObj.answer || 
                                 targetObj.content ||
                                 targetObj.result;
                    
                    if (!rawDetails) {
                        for (let key in targetObj) {
                            if (typeof targetObj[key] === 'string' && targetObj[key].length > 0 && key !== 'status' && key !== 'id') {
                                rawDetails = targetObj[key];
                                break;
                            }
                        }
                    }
                    if (!rawDetails) {
                        rawDetails = JSON.stringify(targetObj, null, 2);
                    }
                } else {
                    rawDetails = String(targetObj);
                }
            }
        }

        let deliveryMsg = '📦 **رقم الطلب:** #' + orderIdRandom + '\n\n' +
                          '🛍️ **الخدمة:** ' + name + '\n' +
                          '🔢 **الكمية:** ' + qty + '\n' +
                          '🟢 **الحالة:** مكتمل\n' +
                          '💰 **المبلغ المدفوع:** ' + retailPrice + ' EGP\n';

        if (rawDetails && rawDetails !== '{}' && rawDetails !== 'null') {
            const safeRawText = String(rawDetails).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
            deliveryMsg += '\n📋 **العناصر المسلمة:**\n' + safeRawText + '\n\n📌 **البيانات المسلمة:**\n<code>' + safeRawText + '</code>';
        } else {
            deliveryMsg += '\n✅ تم إرسال الطلب بنجاح للمزود، وجاري معالجته وتسليمه لك.';
        }

        // إرسال الكود وبيانات التسليم للزبون مباشرة
        await bot.telegram.sendMessage(userId, deliveryMsg, { 
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([
                [Markup.button.callback('🔙 العودة إلى الطلبات', 'main_menu'), Markup.button.callback('🏠 القائمة الرئيسية', 'main_menu')]
            ])
        });

        // إرسال إشعار شراء متطابق للبوت الأم (للأدمن 1001) حتى لو كان أوفلاين
        const adminLogMsg = '📦 <b>رقم الطلب:</b> #' + orderIdRandom + '\n\n' +
                            '🛍️ <b>الخدمة:</b> ' + name + '\n' +
                            '👤 <b>المشتري (ID):</b> <code>' + usersDb[userId].uid + '</code>\n' +
                            '🔢 <b>الكمية:</b> ' + qty + '\n' +
                            '🟢 <b>الحالة:</b> مكتمل\n' +
                            '💰 <b>المبلغ المدفوع:</b> ' + retailPrice + ' EGP\n\n' +
                            (rawDetails ? '📌 <b>البيانات المسلمة:</b>\n<code>' + String(rawDetails).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') + '</code>' : '');
        
        notifyAdmin(adminLogMsg);

     } catch (error) {
        console.error('Buy API Error:', error.message);
        await ctx.editMessageText('❌ فشل الشراء من المزود أو أن الرصيد غير كافٍ في حساب المزود. لم يتم خصم أي مبلغ من محفظتك.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للأقسام', 'main_categories')]])).catch(()=>{});
     }
  } catch (err){
      console.error('Buy General Error:', err.message);
  }
});

bot.hears(/^📞 الدعم$/, (ctx) => {
  try {
    const userId = ctx.from.id; initUser(userId);
    if (usersDb[userId].isBanned) return;
    ctx.reply('للتواصل مع الدعم الفني:\nللتواصل المباشر عبر تليجرام:\nhttps://t.me/Ahmed_3mk_0').catch(()=>{});
  } catch(e){}
});

export default async function handler(req, res) {
  if (req.method === 'POST') {
    await bot.handleUpdate(req.body);
    res.status(200).send('OK');
  } else {
    res.status(200).send('Bot is running on Vercel webhook!');
  }
}
