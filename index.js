import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';
import dotenv from 'dotenv';
import http from 'http';
import { MongoClient } from 'mongodb'; 

dotenv.config();

// ==========================================
// ⚠️ إعدادات عامة
// ==========================================
const USD_TO_EGP_RATE = 50; 
const ADMIN_CHANNEL_ID = process.env.ADMIN_CHANNEL_ID || '-1004393113868'; 
let publicSalesChannels = process.env.PUBLIC_SALES_CHANNEL ? [process.env.PUBLIC_SALES_CHANNEL] : []; 
let forceSubscribeChannels = []; 

// ==========================================
// 🛡️ إعدادات الاتصال بقاعدة بيانات MongoDB 
// ==========================================
const MONGODB_URI = "mongodb+srv://ahmwogod24920s_db_user:LwAbx06XOKBWel9j@cluster0.sjxm2ga.mongodb.net/xprostore?retryWrites=true&w=majority&appName=Cluster0";
let cachedClient = null;
let dbCollection = null;
let pendingSaves = []; 
let isDbConnected = false;

// 💾 المتغيرات العالمية
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
let adCampaigns = {}; 
let hiddenServices = []; 
let fixedPrices = {}; 
let vodafoneCashNumber = process.env.VODAFONE_NUMBER || '01228098689'; 
let instapayAccount = 'غير محدد'; 

let abandonedCarts = {}; 
let usedReceipts = []; 
let stockAlerts = {}; 
let dropGroupId = ''; 
let ratings = {}; 

let botStates = {
    deposit: {}, broadcast: {}, promo: {}, search: {}, adminInput: {}, adminLogin: {}, adminSession: {}, lastReportDate: "", buyQty: {}, ordersPage: {}, tempStock: {}, adminTempCats: {}, lastAdminCat: {}, lastAdminCatFixed: {}, transfer: {}
};

const userRequestLocks = {};

// ==========================================
// 🛠️ دوال مساعدة عامة
// ==========================================
function getShortHash(str) {
    let hash = 0;
    const s = String(str);
    for (let i = 0; i < s.length; i++) {
        hash = ((hash << 5) - hash) + s.charCodeAt(i);
        hash |= 0; 
    }
    return Math.abs(hash).toString(36);
}

function isAdmin(userId) {
    const idStr = String(userId);
    return (usersDb[idStr] && String(usersDb[idStr].uid) === '1001') || (botStates && botStates.adminSession && botStates.adminSession[idStr]);
}

function broadcastSale(serviceName, qty, price, userUid, paymentMethod, srvId, botUsername) {
    if (!publicSalesChannels || publicSalesChannels.length === 0) return;
    try {
        const maskedUid = String(userUid).substring(0, 3) + '****';
        const msg = `🛒 <b>عملية شراء ناجحة وموثقة!</b>\n\n👤 <b>مشتري:</b> <code>${maskedUid}</code>\n📦 <b>المنتج:</b> ${serviceName}\n🔢 <b>الكمية:</b> ${qty}\n💳 <b>طريقة الدفع:</b> ${paymentMethod}\n🪙 <b>القيمة الإجمالية:</b> ${price} EGP\n💳 <b>طريقة الشراء:</b> ${paymentMethod}\n🕒 <b>الوقت:</b> ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}\n\n✨ <b>شكراً لثقتكم في متجرنا!</b>`;
        
        let keyboard = {};
        if (srvId && botUsername && botUsername !== 'undefined') {
            keyboard = Markup.inlineKeyboard([
                [Markup.button.url('🛒 شراء نفس المنتج', `https://t.me/${botUsername}?start=buy_auto`)]
            ]);
        }

        publicSalesChannels.forEach(channel => {
            bot.telegram.sendMessage(channel, msg, {parse_mode: 'HTML', ...keyboard}).catch(()=>{});
        });
    } catch(e) { console.error("Broadcast error:", e.message); }
}

async function connectDB() {
    try {
        if (cachedClient && isDbConnected) {
            return;
        }
        if (!cachedClient) {
            cachedClient = new MongoClient(MONGODB_URI, { 
                maxPoolSize: 10,
                serverSelectionTimeoutMS: 5000, 
                connectTimeoutMS: 5000,
                socketTimeoutMS: 5000
            });
            await cachedClient.connect();
        }
        const database = cachedClient.db("xprostore");
        dbCollection = database.collection("botData");
        isDbConnected = true;
        console.log("✅ متصل بقاعدة بيانات MongoDB السحابية بنجاح!");
    } catch (e) {
        console.error("DB Connection Error:", e.message);
        isDbConnected = false;
    }
}

const categoryCacheTime = 300000; 
let lastCategoriesFetchTime = 0;
let cachedServices = [];

async function loadDatabase() {
    await connectDB();
    if (!dbCollection) return;
    
    if (cachedServices.length === 0) {
        try {
            const svcData = await dbCollection.findOne({ _id: "services_cache" });
            if (svcData && svcData.services && svcData.services.length > 0) {
                cachedServices = svcData.services;
                lastCategoriesFetchTime = svcData.lastFetch || Date.now();
            }
        } catch(e) { console.error("Error loading services cache:", e.message); }
    }

    if (Object.keys(usersDb).length > 0) return; 

    try {
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
            adCampaigns = data.adCampaigns || {}; 
            hiddenServices = data.hiddenServices || [];
            fixedPrices = data.fixedPrices || {};
            if (data.vodafoneCashNumber) vodafoneCashNumber = data.vodafoneCashNumber;
            if (data.instapayAccount) instapayAccount = data.instapayAccount;
            
            abandonedCarts = data.abandonedCarts || {}; 
            usedReceipts = data.usedReceipts || [];
            stockAlerts = data.stockAlerts || {};
            ratings = data.ratings || {}; 
            if (data.dropGroupId !== undefined) dropGroupId = data.dropGroupId;
            
            if (data.publicSalesChannels !== undefined) {
                publicSalesChannels = Array.isArray(data.publicSalesChannels) ? data.publicSalesChannels : [data.publicSalesChannel];
            }
            if (data.forceSubscribeChannels !== undefined) {
                forceSubscribeChannels = Array.isArray(data.forceSubscribeChannels) ? data.forceSubscribeChannels : [data.forceSubscribeChannel];
            }
            
            const loadedStates = data.botStates || {};
            botStates = {
                deposit: loadedStates.deposit || {}, broadcast: loadedStates.broadcast || {}, promo: loadedStates.promo || {}, search: loadedStates.search || {},
                adminInput: loadedStates.adminInput || {}, adminLogin: loadedStates.adminLogin || {}, adminSession: loadedStates.adminSession || {}, lastReportDate: loadedStates.lastReportDate || "",
                buyQty: loadedStates.buyQty || {}, ordersPage: loadedStates.ordersPage || {}, tempStock: loadedStates.tempStock || {}, adminTempCats: loadedStates.adminTempCats || {},
                lastAdminCat: loadedStates.lastAdminCat || {}, lastAdminCatFixed: loadedStates.lastAdminCatFixed || {}, transfer: loadedStates.transfer || {}
            };
        }
    } catch(e) { console.error("Error loading main data:", e.message); }
}

function saveDatabase() {
    try {
        const data = { usersDb, globalMarkupPercent, customMarkups, pendingDeposits, promoCodes, flashSale, vouchers, adminAuditLogs, maintenanceMode, customProductMarkups, localInventory, botStates, adCampaigns, hiddenServices, fixedPrices, vodafoneCashNumber, instapayAccount, abandonedCarts, usedReceipts, stockAlerts, publicSalesChannels, forceSubscribeChannels, ratings, dropGroupId }; 
        const savePromise = connectDB().then(() => {
            if (dbCollection) {
                return dbCollection.updateOne({ _id: "main_data" }, { $set: data }, { upsert: true });
            }
        }).catch(e => console.error('DB Save Error:', e.message));
        pendingSaves.push(savePromise); 
    } catch (e) { console.error('Local save error:', e.message); }
}

if (process.env.NODE_ENV !== 'production' && !process.env.VERCEL) {
    const PORT = 3000;
    const server = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.write('البوت يعمل بكفاءة وقاعدة البيانات السحابية متصلة 🚀');
        res.end();
    });
    server.listen(PORT, '0.0.0.0', () => {});
}

process.on('uncaughtException', (err) => { console.error('Uncaught Exception:', err); });
process.on('unhandledRejection', (reason, promise) => { console.error('Unhandled Rejection:', reason); });

const bot = new Telegraf(process.env.BOT_TOKEN);
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin';

bot.use(async (ctx, next) => {
    try {
        const now = Math.floor(Date.now() / 1000);
        if (ctx.message && ctx.message.text && ctx.message.date) {
            if (now - ctx.message.date > 180) return; 
        }
        return await next();
    } catch (e) {
        console.error("Middleware Error:", e.message);
    }
});

bot.catch((err, ctx) => {
    console.error(`Ooops, encountered an error for ${ctx.updateType}`, err.message);
});

bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== 'private') return; 
    return await next();
});

function clearUserStates(userId) {
    try {
        const idStr = String(userId);
        if (botStates && botStates.deposit) delete botStates.deposit[idStr];
        if (botStates && botStates.promo) delete botStates.promo[idStr];
        if (botStates && botStates.search) delete botStates.search[idStr];
        if (botStates && botStates.buyQty) delete botStates.buyQty[idStr]; 
        if (botStates && botStates.tempStock) delete botStates.tempStock[idStr];
        if (botStates && botStates.adminInput) delete botStates.adminInput[idStr]; 
        if (botStates && botStates.broadcast) delete botStates.broadcast[idStr];
        if (botStates && botStates.adminTempCats) delete botStates.adminTempCats[idStr];
        if (botStates && botStates.lastAdminCat) delete botStates.lastAdminCat[idStr];
        if (botStates && botStates.lastAdminCatFixed) delete botStates.lastAdminCatFixed[idStr];
        if (botStates && botStates.transfer) delete botStates.transfer[idStr];
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
        
        if (botStates && botStates.lastReportDate !== currentDate) {
            if (botStates.lastReportDate !== "") {
                let totalSpent = 0; let totalProfit = 0;
                for (let id in usersDb) {
                    if (usersDb[id].orders) {
                        usersDb[id].orders.forEach(o => {
                            if (o.date && o.date.includes(botStates.lastReportDate)) {
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
setInterval(checkAndSendDailyReport, 60 * 60 * 1000); 

function initUser(userId) {
  try {
    const idStr = String(userId);
    if (!usersDb) usersDb = {};
    if (!usersDb[idStr]) {
      let isUnique = false; let newUid;
      while (!isUnique) {
        newUid = Math.floor(1000000000 + Math.random() * 9000000000);
        isUnique = true;
        for (let tgId in usersDb) { if (String(usersDb[tgId].uid) === String(newUid)) { isUnique = false; break; } }
      }
      usersDb[idStr] = { uid: newUid, balance: 0, orders: [], walletHistory: [], isBanned: false, totalSpent: 0, isVip: false, referrals: 0, referredBy: null, tempCategories: [], source: null }; 
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
        if (usersDb[idStr].source === undefined) usersDb[idStr].source = null;
        if (usersDb[idStr].cart) delete usersDb[idStr].cart; 
    }
  } catch(e) {}
}

function getUserByUid(targetUid) {
  for (let telegramId in usersDb) {
    if (String(usersDb[telegramId].uid) === String(targetUid)) return { telegramId, user: usersDb[telegramId] };
  }
  return null;
}

// =======================================================
// 🌐 3 مزودين للخدمات 
// =======================================================
const API_TIMEOUT = 5000; 
const apiClient1 = axios.create({ baseURL: 'https://xprostore.store/api/v1', headers: { 'Authorization': 'Bearer ' + process.env.PROVIDER_API_KEY, 'Content-Type': 'application/json' }, timeout: API_TIMEOUT });
const apiClient2 = axios.create({ baseURL: 'https://zfourstore.up.railway.app/api/v1', headers: { 'X-API-Key': process.env.PROVIDER2_API_KEY, 'Content-Type': 'application/json' }, timeout: API_TIMEOUT });
const API_KEY_3 = 'ch_live_uOAaG2beDDH3TrfeERZB_wpekZnzmZmtuOHhromDw4w';
const apiClient3 = axios.create({ baseURL: 'https://cupponhub.shop/reseller/api', headers: { 'X-API-Key': API_KEY_3, 'Content-Type': 'application/json' }, timeout: API_TIMEOUT });

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
    let n = String(name || '').toLowerCase();
    if (n.includes('gemini') || n.includes('جيميناي')) return 'Gemini';
    if (n.includes('gpt') || n.includes('chatgpt') || n.includes('شات gpt')) return 'ChatGPT';
    if (n.includes('canva') || n.includes('كانفا')) return 'Canva';
    if (n.includes('adobe') || n.includes('ادوبي')) return 'Adobe';
    if (n.includes('duolingo') || n.includes('دوولينجو')) return 'Duolingo';
    if (n.includes('capcut') || n.includes('كاب كات')) return 'CapCut';
    if (n.includes('spotify')) return 'Spotify';
    if (n.includes('youtube')) return 'YouTube';
    if (n.includes('netflix') || n.includes('نتفلكس')) return 'Netflix';
    if (n.includes('crunchyroll')) return 'Crunchyroll';
    if (n.includes('microsoft') || n.includes('office') || n.includes('مايكروسوفت') || n.includes('windows')) return 'Microsoft';
    if (n.includes('coursera') || n.includes('كورسيرا') || n.includes('edx')) return 'Coursera';
    if (n.includes('notion') || n.includes('نوشن')) return 'Notion';
    if (n.includes('claude')) return 'Claude';
    if (n.includes('grok') || n.includes('جروك')) return 'Grok';
    if (n.includes('perplexity')) return 'Perplexity';
    if (n.includes('nordvpn') || n.includes('nord')) return 'NordVPN';
    if (n.includes('express') || n.includes('اكسبريس')) return 'ExpressVPN';
    if (n.includes('hma')) return 'HMA VPN';
    if (n.includes('apple') || n.includes('music')) return 'Apple Music';
    if (n.includes('elevenlabs')) return 'ElevenLabs';
    if (n.includes('leonardo')) return 'Leonardo';
    if (n.includes('cursor')) return 'Cursor';
    if (n.includes('lovable')) return 'Lovable';
    if (n.includes('replit')) return 'Replit';
    if (n.includes('figma')) return 'Figma';
    if (n.includes('bolt')) return 'Bolt';
    if (n.includes('kling')) return 'Kling';
    if (n.includes('gamma')) return 'Gamma';
    if (n.includes('manus')) return 'Manus';
    if (n.includes('wispr')) return 'Wispr Flow';
    if (n.includes('quillbot')) return 'QuillBot';
    if (n.includes('higgsfield')) return 'Higgsfield';
    if (n.includes('proton')) return 'Proton';
    if (n.includes('n8n')) return 'n8n';
    if (n.includes('railway')) return 'Railway';
    if (n.includes('autodesk') || n.includes('auto cad')) return 'Autodesk';
    if (n.includes('framer')) return 'Framer';
    if (n.includes('email') || n.includes('gmail') || n.includes('جيميل')) return 'Gmail';
    if (n.includes('icloud') || n.includes('ايكلاود')) return 'iCloud';
    if (n.includes('zoom') || n.includes('زوم')) return 'Zoom';
    if (n.includes('pdf') || n.includes('ilovepdf')) return 'iLovePDF';
    if (n.includes('avira') || n.includes('افيرا')) return 'Avira';
    if (n.includes('miro') || n.includes('ميرو')) return 'Miro';
    if (n.includes('jetbrains')) return 'JetBrains';
    if (n.includes('sim') || n.includes('e sim')) return 'eSIM';
    if (n.includes('grammarly')) return 'Grammarly';
    if (/\bapi\b/i.test(n) || n.includes('خدمات برمجة')) return 'API Services';
    return 'أخرى';
}

function detectServiceEmoji(name) {
    const n = String(name || '').toLowerCase();
    if (n.includes('gemini') || n.includes('جيميناي')) return '✨ ';
    if (n.includes('chatgpt') || n.includes('gpt')) return '❇️ ';
    if (n.includes('canva') || n.includes('كانفا')) return '🖌️ ';
    if (n.includes('adobe') || n.includes('ادوبي')) return '🅰️ ';
    if (n.includes('netflix') || n.includes('نتفلكس')) return '🍿 ';
    if (n.includes('youtube') || n.includes('يوتيوب')) return '▶️ ';
    if (n.includes('spotify')) return '🎧 ';
    if (n.includes('microsoft') || n.includes('windows')) return '🪟 ';
    if (n.includes('vpn')) return '🛡️ ';
    if (n.includes('zoom')) return '📹 ';
    if (n.includes('duolingo')) return '🦉 ';
    if (n.includes('capcut')) return '✂️ ';
    if (n.includes('crunchyroll')) return '🍘 ';
    if (n.includes('coursera')) return '🎓 ';
    if (n.includes('notion')) return '📓 ';
    if (n.includes('claude')) return '🧠 ';
    if (n.includes('grok')) return '✖️ ';
    if (n.includes('perplexity')) return '💠 ';
    if (n.includes('apple music')) return '🎵 ';
    if (n.includes('elevenlabs')) return '🎙️ ';
    if (n.includes('leonardo')) return '🖼️ ';
    if (n.includes('figma')) return '🪄 ';
    if (n.includes('kling')) return '🎞️ ';
    if (n.includes('gamma')) return '📊 ';
    if (n.includes('quillbot')) return '🤖 ';
    if (n.includes('proton')) return '🔒 ';
    if (n.includes('railway')) return '🚂 ';
    if (n.includes('autodesk')) return '🏗️ ';
    if (n.includes('framer')) return '🖼️ ';
    if (n.includes('gmail') || n.includes('email')) return '📧 ';
    if (n.includes('icloud')) return '☁️ ';
    if (n.includes('pdf')) return '📄 ';
    if (n.includes('avira')) return '☂️ ';
    if (n.includes('miro')) return '🗺️ ';
    if (n.includes('sim')) return '📱 ';
    if (n.includes('api')) return '🔌 ';
    return '📦 ';
}

function getServiceCategory(srv) {
    if (srv.category && srv.category !== 'أخرى') return srv.category;
    if (srv.category_name && srv.category_name !== 'أخرى') return srv.category_name;
    const nameStr = srv.name_ar || srv.name || srv.title || '';
    return detectCategoryFromName(nameStr);
}

const preferredCategoriesOrder = [
    'ChatGPT', 'Netflix', 'YouTube', 'Spotify', 'Canva', 'CapCut', 'Microsoft', 
    'Gemini', 'Claude', 'Adobe', 'Grammarly', 'Duolingo', 'Zoom', 'Gmail', 'iCloud', 
    'ExpressVPN', 'NordVPN', 'Apple Music', 'Notion', 'iLovePDF', 'Coursera', 'Prime Video', 'Crunchyroll', 
    'Perplexity', 'eSIM', 'ElevenLabs', 'Leonardo', 'Figma', 'QuillBot', 'Proton', 'Cursor', 'Grok', 'Replit', 
    'JetBrains', 'Autodesk', 'Avira', 'HMA VPN', 
    'Gamma', 'Bolt', 'Framer', 'Kling', 'Miro', 'Lovable', 'n8n', 'Railway', 'Higgsfield', 'Wispr Flow', 'Manus', 
    'API Services', 'أخرى'
];

function sortServicesByImportance(servicesList) {
    return servicesList.sort((a, b) => {
        const catA = getServiceCategory(a);
        const catB = getServiceCategory(b);
        let indexA = preferredCategoriesOrder.indexOf(catA);
        let indexB = preferredCategoriesOrder.indexOf(catB);
        
        if (indexA === -1) indexA = 999;
        if (indexB === -1) indexB = 999;

        if (indexA !== indexB) {
            return indexA - indexB; 
        }
        
        const nameA = String(a.name_ar || a.name || a.title || '').toLowerCase();
        const nameB = String(b.name_ar || b.name || b.title || '').toLowerCase();
        return nameA.localeCompare(nameB, 'ar');
    });
}

const categoryEmojis = {
  'ChatGPT': '❇️', 'Claude': '🧠', 'Gemini': '✨', 'Grok': '✖️', 'Notion': '📓', 'Perplexity': '💠', 
  'Cursor': '🖱️', 'CapCut': '✂️', 'Canva': '🖌️', 'YouTube': '▶️', 'Spotify': '🎧', 'Adobe': '🅰️', 
  'Microsoft': '🪟', 'Figma': '🪄', 'Grammarly': '✍️', 'Duolingo': '🦉', 'Lovable': '❤️', 
  'Apple Music': '🎵', 'Coursera': '🎓', 'ElevenLabs': '🎙️', 'Gamma': '📊', 'Kling': '🎞️', 
  'Leonardo': '🖼️', 'Autodesk': '🏗️', 'Bolt': '⚡', 'Gmail': '📧', 'Framer': '🖼️', 
  'Higgsfield': '🚀', 'Manus': '📝', 'n8n': '⚙️', 'NordVPN': '🛡️', 'ExpressVPN': '🛡️', 
  'HMA VPN': '🌍', 'Proton': '🔒', 'QuillBot': '🤖', 'Railway': '🚂', 'Replit': '💻', 
  'Wispr Flow': '🌊', 'Netflix': '🍿', 'Crunchyroll': '🍘', 'Prime Video': '🎬', 
  'eSIM': '📱', 'iLovePDF': '📄', 'Avira': '☂️', 'Miro': '🗺️', 'JetBrains': '💻', 
  'iCloud': '☁️', 'Zoom': '📹', 'API Services': '🔌', 'أخرى': '📦'
};

const extractArray = (data) => {
    if (!data) return null;
    if (Array.isArray(data)) return data;
    if (typeof data === 'object' && data !== null) {
        if (Array.isArray(data.data)) return data.data;
        if (Array.isArray(data.services)) return data.services;
        if (Array.isArray(data.products)) return data.products;
        for (let key in data) {
            if (Array.isArray(data[key])) return data[key];
        }
    }
    return null;
};

async function fetchAllServices() {
    let services = [];
    const p1 = apiClient1.get('/services?limit=1000').catch(e => { console.error("❌ XPro Error:", e.message); throw e; });
    const p2 = apiClient2.get('/products').catch(e => { console.error("❌ ZFour Error:", e.message); throw e; });
    const p3 = apiClient3.get('/?action=products').catch(e => { console.error("❌ CupponHub Error:", e.message); throw e; });

    const results = await Promise.allSettled([p1, p2, p3]);

    if (results[0].status === 'fulfilled') {
        try {
            let s1 = extractArray(results[0].value.data);
            if (s1) {
                s1.forEach(item => {
                    item.providerSource = 'api1';
                    item.name = item.name || item.name_ar || item.title || "خدمة بدون اسم";
                    item.id = String(item.id || item.service_id || generateStableId(item.name));
                    item.internal_id = '1' + getShortHash(item.id);
                });
                services.push(...s1);
            }
        } catch(e) {}
    }

    if (results[1].status === 'fulfilled') {
        try {
            let s2 = extractArray(results[1].value.data);
            if (s2) {
                s2.forEach(item => {
                    item.providerSource = 'api2';
                    item.name = item.name || item.title || item.name_ar || "خدمة بدون اسم";
                    item.id = String(item.id || item.product_id || item.service_id || item.uuid || item.code || generateStableId(item.name));
                    item.internal_id = '2' + getShortHash(item.id);
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

    if (results[2].status === 'fulfilled') {
        try {
            let s3 = extractArray(results[2].value.data);
            if (s3) {
                s3.forEach(item => {
                    item.providerSource = 'api3';
                    item.name = item.name || item.name_ar || item.title || "خدمة بدون اسم";
                    let uniqueId = item.key || item.id || item.product_id || generateStableId(item.name);
                    item.id = String(uniqueId);
                    item.internal_id = '3' + getShortHash(item.id);
                    item.category = detectCategoryFromName(item.name) !== 'أخرى' ? detectCategoryFromName(item.name) : (item.category || item.category_name || 'أخرى');
                    let rawPriceUSD = parseFloat(item.price_usdt_from || item.price || item.rate || item.price_amount || 0);
                    let egpPrice = (rawPriceUSD * USD_TO_EGP_RATE).toFixed(2);
                    item.price = egpPrice;
                    item.price_amount = egpPrice;
                });
                services.push(...s3);
            }
        } catch(e) {}
    }

    return services;
}

let fetchPromise = null;
async function backgroundServiceUpdate() {
    if (fetchPromise) return fetchPromise; 
    fetchPromise = (async () => {
        try {
            const services = await fetchAllServices();
            if (services && services.length > 0) {
                cachedServices = services;
                lastCategoriesFetchTime = Date.now();
                if (dbCollection) {
                    await dbCollection.updateOne(
                        { _id: "services_cache" }, 
                        { $set: { services: cachedServices, lastFetch: lastCategoriesFetchTime } }, 
                        { upsert: true }
                    ).catch(e => console.error("DB Cache Error:", e.message));
                }
            }
        } catch (e) {
            console.error("Critical Update Error:", e.message);
        } finally {
            fetchPromise = null; 
        }
    })();
    return fetchPromise;
}

async function placeOrderWithBestProvider(srv, qty) {
    const source = srv.providerSource || 'api1';
    const parsedQty = parseInt(qty) || 1;
    const srvIdConverted = !isNaN(srv.id) ? parseInt(srv.id) : srv.id;

    if (source === 'api2') {
         return await apiClient2.post('/order', { service_id: srvIdConverted, product_id: srvIdConverted, productId: srvIdConverted, quantity: parsedQty });
    } else if (source === 'api3') {
         return await apiClient3.post('/?action=purchase', { product: srv.key || String(srv.id), quantity: parsedQty }, { headers: { 'Idempotency-Key': 'shop-order-' + Date.now() + '-' + Math.floor(Math.random() * 1000) } });
    } else {
         return await apiClient1.post('/orders', { service_id: srvIdConverted, quantity: parsedQty });
    }
}

function getMainMenu() {
  let keyboard = [
    ['🛍 الخدمات', '🔍 بحث عن خدمة'],
    ['🛒 طلباتي', '📜 سجل المحفظة'],
    ['💰 حسابي', '💸 تحويل رصيد'],
    ['💳 شحن الحساب', '🎟 استخدام كود خصم'],
    ['🔗 دعوة الأصدقاء (اربح 2%)', '📞 الدعم الفني']
  ];
  return Markup.keyboard(keyboard).resize();
}

bot.use(async (ctx, next) => {
    const userId = ctx.from?.id;
    if (userId && forceSubscribeChannels && forceSubscribeChannels.length > 0 && !isAdmin(userId)) {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'check_sub') return await next(); 
        let isSubscribed = true;
        let missingChannels = [];
        for (let channelObj of forceSubscribeChannels) {
            let cid = typeof channelObj === 'string' ? channelObj : channelObj.chatId;
            try {
                const member = await ctx.telegram.getChatMember(cid, userId);
                if (!['member', 'administrator', 'creator'].includes(member.status)) { isSubscribed = false; missingChannels.push(channelObj); }
            } catch(e) { isSubscribed = false; missingChannels.push(channelObj); }
        }
        if (!isSubscribed) {
            const subMsg = '⚠️ <b>أهلاً بك في متجر أحمد!</b>\n\nبرجاء الاشتراك في قنواتنا أولاً لتتمكن من استخدام البوت وطلب الخدمات.\n\n👇 اشترك الآن ثم اضغط على "تحقق من الاشتراك ✅"';
            let buttons = [];
            missingChannels.forEach((ch, idx) => {
                let clink = typeof ch === 'string' ? (ch.startsWith('@') ? `https://t.me/${ch.replace('@','')}` : null) : ch.link;
                if (clink) buttons.push([Markup.button.url(`📢 القناة رقم ${idx + 1} ↗️`, clink)]);
                else buttons.push([Markup.button.callback(`📢 القناة رقم ${idx + 1} (تواصل مع الدعم)`, 'noop')]);
            });
            buttons.push([Markup.button.callback('تحقق من الاشتراك ✅', 'check_sub')]);
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery('برجاء الاشتراك أولاً!').catch(()=>{});
                await ctx.editMessageText(subMsg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
                return;
            } else {
                await ctx.reply(subMsg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
                return;
            }
        }
    }
    return await next(); 
});

function safeHtml(text) { return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

async function processBuyAction(ctx, userId, srvInternalId) {
    try {
         initUser(userId); 
         if (!usersDb[userId] || usersDb[userId].isBanned) return;
         
         if (!cachedServices || cachedServices.length === 0) {
             let loadingMsg;
             if (ctx.callbackQuery) loadingMsg = await ctx.editMessageText('⏳ لحظات جاري تجهيز الخدمة...').catch(()=>{});
             else loadingMsg = await ctx.reply('⏳ لحظات جاري تجهيز الخدمة...').catch(()=>{});
             await backgroundServiceUpdate();
         }
         
         const srv = cachedServices.find(s => s.internal_id === srvInternalId || String(s.id) === String(srvInternalId));
         
         if(!srv) {
             if (ctx.callbackQuery) await ctx.editMessageText('❌ الخدمة غير متوفرة حالياً.', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للأقسام', 'main_categories')]]) }).catch(()=>{});
             else await ctx.reply('❌ الخدمة غير متوفرة حالياً.').catch(()=>{});
             return;
         }

         let price = "0.00"; try { price = calculateRetailPrice(srv, usersDb[userId], 1); } catch(e){}
         const srvName = srv.name_ar || srv.name || srv.title || 'خدمة';

         if (!abandonedCarts) abandonedCarts = {};
         abandonedCarts[userId] = { time: Date.now(), srvName: srvName }; saveDatabase();

         const safeName = safeHtml(srvName);
         const txt = `⚠️ <b>إدخال الكمية المطلوبة:</b>\n\n🛍 <b>الخدمة:</b> ${safeName}\n💰 السعر للقطعة: <b>${price} EGP</b>\n\n✍️ <b>من فضلك، أرسل الكمية المطلوبة الآن في رسالة (أرقام فقط):</b>`;
         const keyboard = Markup.inlineKeyboard([[Markup.button.callback('❌ إلغاء العملية', 'cancel_action')]]);
         
         let msg;
         if (ctx.callbackQuery) msg = await ctx.editMessageText(txt, {parse_mode: 'HTML', ...keyboard}).catch(e => { return null; });
         else msg = await ctx.reply(txt, {parse_mode: 'HTML', ...keyboard}).catch(e => { return null; });

         if (msg && msg.message_id) {
             if (!botStates) botStates = {};
             if (!botStates.buyQty) botStates.buyQty = {};
             botStates.buyQty[userId] = { srvId: String(srv.id), msgId: msg.message_id };
             saveDatabase();
         }
    } catch(err) {
        let errMsg = err.message || "مجهول";
        if (ctx.callbackQuery) await ctx.editMessageText("❌ حدث خطأ داخلي: " + errMsg).catch(()=>{});
        else await ctx.reply("❌ حدث خطأ داخلي: " + errMsg).catch(()=>{});
    }
}

bot.start(async (ctx) => {
  try {
    const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
    if (usersDb[userId] && usersDb[userId].isBanned) return await ctx.reply('❌ عذراً، تم حظرك من استخدام هذا البوت.').catch(()=>{});
    if (maintenanceMode && String(usersDb[userId].uid) !== '1001') return await ctx.reply('🛠 **المتجر في حالة صيانة حالياً**\nنعمل على تحديث الخدمات، عودوا قريباً جداً!', { parse_mode: 'Markdown' }).catch(()=>{});

    let payload = null;
    if (ctx.message && ctx.message.text) {
        const parts = ctx.message.text.split(' ');
        if (parts.length > 1) payload = parts[1];
    }
    if (payload) {
        if (payload.startsWith('buy_')) {
            if (cachedServices.length === 0) {
                 await ctx.reply('⏳ جاري تجهيز الخدمة...').catch(()=>{});
                 await backgroundServiceUpdate();
            }
            await processBuyAction(ctx, userId, payload.split('buy_')[1]); 
            return; 
        }
        if (payload.startsWith('ref_') && !usersDb[userId].referredBy && !usersDb[userId].source) {
            const referrerUid = payload.split('_')[1];
            const referrer = getUserByUid(referrerUid);
            if (referrer && String(referrerUid) !== String(usersDb[userId].uid)) {
                usersDb[userId].referredBy = referrer.telegramId; referrer.user.referrals += 1; saveDatabase();
                bot.telegram.sendMessage(referrer.telegramId, `🔔 قام صديق بالتسجيل عبر رابط الدعوة الخاص بك! ستكسب **2%** من كل عملية شحن يقوم بها.`).catch(()=>{});
            }
        } else if (payload.startsWith('ad_') && !usersDb[userId].source) {
            adCampaigns[payload] = (adCampaigns[payload] || 0) + 1; usersDb[userId].source = payload; saveDatabase();
        }
    }
    await ctx.reply('أهلاً بك مجدداً في متجر أحمد! 🚀\n🆔 رقم الحساب الفريد الخاص بك: `' + usersDb[userId].uid + '`', { parse_mode: 'Markdown', ...getMainMenu() }).catch(()=>{});
  } catch (err) {}
});

bot.action('check_sub', async (ctx) => {
    const userId = String(ctx.from.id); initUser(userId);
    if (!forceSubscribeChannels || forceSubscribeChannels.length === 0) {
        ctx.deleteMessage().catch(()=>{}); return await ctx.reply('أهلاً بك مجدداً في متجر أحمد! 🚀\n🆔 رقم الحساب الفريد الخاص بك: `' + usersDb[userId].uid + '`', { parse_mode: 'Markdown', ...getMainMenu() }).catch(()=>{});
    }
    try {
        let isSubbedToAll = true;
        for (let channelObj of forceSubscribeChannels) {
            let cid = typeof channelObj === 'string' ? channelObj : channelObj.chatId;
            try { const member = await ctx.telegram.getChatMember(cid, userId); if (!['member', 'administrator', 'creator'].includes(member.status)) { isSubbedToAll = false; break; } } catch(e) { isSubbedToAll = false; break; }
        }
        if (isSubbedToAll) {
            await ctx.answerCbQuery('✅ شكراً لاشتراكك! يمكنك الآن استخدام متجر أحمد.', {show_alert: true}).catch(()=>{}); ctx.deleteMessage().catch(()=>{});
            await ctx.reply('أهلاً بك مجدداً في متجر أحمد! 🚀\n🆔 رقم الحساب الفريد الخاص بك: `' + usersDb[userId].uid + '`', { parse_mode: 'Markdown', ...getMainMenu() }).catch(()=>{});
        } else { await ctx.answerCbQuery('❌ عذراً، برجاء الاشتراك في جميع القنوات أولاً!', { show_alert: true }).catch(()=>{}); }
    } catch (e) { await ctx.answerCbQuery('❌ حدث خطأ، تأكد أن البوت مرفوع كأدمن في القنوات.').catch(()=>{}); }
});

function calculateRetailPrice(service, user, quantity = 1) {
  try {
    const srvIdStr = String(service.id);
    if (fixedPrices && fixedPrices[srvIdStr] !== undefined) {
        let fp = parseFloat(fixedPrices[srvIdStr]);
        if (flashSale && flashSale.active && Date.now() < flashSale.expiresAt) fp = fp - (fp * (flashSale.discount / 100));
        return (fp * quantity).toFixed(2);
    }
    const originalPrice = parseFloat(service.price_amount || service.price || 0);
    const cat = getServiceCategory(service);
    let markup = parseFloat(globalMarkupPercent) || 0;
    if (customMarkups && customMarkups[cat] !== undefined) markup = parseFloat(customMarkups[cat]);
    if (customProductMarkups && customProductMarkups[srvIdStr] !== undefined) markup = parseFloat(customProductMarkups[srvIdStr]); 
    if (user && user.isVip) markup = Math.max(0, markup - 5);
    let finalPrice = originalPrice * (1 + (markup / 100));
    if (flashSale && flashSale.active) {
        if (Date.now() < flashSale.expiresAt) finalPrice = finalPrice - (finalPrice * (flashSale.discount / 100));
        else { flashSale.active = false; saveDatabase(); }
    }
    return (finalPrice * quantity).toFixed(2);
  } catch(e) { return '0.00'; }
}

async function showProfile(ctx) {
    const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
    const user = usersDb[userId];
    if (user.isBanned) return await ctx.reply('❌ تم حظرك.').catch(()=>{});
    const vipTag = user.isVip ? '👑 (VIP)' : '👤 (عادي)';
    await ctx.reply('👤 **حسابي الشخصي:**\n\n🆔 رقم الحساب: `' + user.uid + '`\n🔰 مستوى الحساب: ' + vipTag + '\n💳 الرصيد الحالي: *' + parseFloat(user.balance).toFixed(2) + ' EGP*\n🛍 إجمالي المشتريات: ' + user.totalSpent.toFixed(2) + ' EGP', { parse_mode: 'Markdown' }).catch(()=>{});
}

async function showDepositFlow(ctx) {
    const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
    if (usersDb[userId].isBanned) return;
    const hasPending = pendingDeposits.some(p => p.userId === userId);
    if(hasPending) return await ctx.reply('❌ **لا يمكنك تقديم طلب شحن جديد!**\nلديك بالفعل طلب شحن قيد المراجعة.', {parse_mode: 'Markdown'}).catch(()=>{});
    
    await ctx.reply('💳 **اختر طريقة الشحن المناسبة لك:**', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔴 شحن بالمحفظة (فودافون كاش)', 'dep_method_vfcash')],
            [Markup.button.callback('🟣 انستاباي (InstaPay)', 'dep_method_instapay')]
        ])
    }).catch(()=>{});
}

bot.action(/^dep_method_(.+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    const method = ctx.match[1];
    const userId = String(ctx.from.id);
    if (!botStates) botStates = {};
    if (!botStates.deposit) botStates.deposit = {};
    botStates.deposit[userId] = { step: 'WAIT_AMOUNT', method: method };
    saveDatabase();
    let methodText = method === 'vfcash' ? 'فودافون كاش' : 'انستاباي';
    await ctx.editMessageText(`💳 **شحن الحساب عبر (${methodText})**\n\nمن فضلك أكتب **المبلغ** اللي هتحوله بالجنيه المصري (مثال: 100):`, {parse_mode: 'Markdown'}).catch(()=>{});
});

async function showOrdersMain(ctx) {
    const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
    if (usersDb[userId].isBanned) return;
    const orders = usersDb[userId].orders || [];
    if (orders.length === 0) return await ctx.reply('🛒 لم تقم بأي عمليات شراء حتى الآن.').catch(()=>{});
    const { text, keyboard } = getOrdersPage(userId, 1);
    await ctx.reply(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
}

async function showSupport(ctx) {
    const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
    if (usersDb[userId].isBanned) return;
    await ctx.reply('📞 **تواصل مع الدعم الفني مباشرة:**\n\n✈️ تليجرام: @Ahmed_3mk_0\n📱 واتساب: [اضغط هنا للمحادثة](https://wa.me/201282110755)', { parse_mode: 'Markdown', disable_web_page_preview: true }).catch(()=>{});
}

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
        let safeName = safeHtml(order.name);
        text += `🛍 ${safeName} - مكتمل\n`;
        let buttonText = `🛍 ${order.name}`;
        if (buttonText.length > 35) buttonText = buttonText.substring(0, 33) + '..';
        buttons.push([Markup.button.callback(buttonText, `ord_det_${actualIndex}`)]);
    });

    let paginationRow = [];
    if (currentPage > 1) paginationRow.push(Markup.button.callback('▶️ السابق', `ord_pg_${currentPage - 1}`));
    paginationRow.push(Markup.button.callback(`صفحة ${currentPage} من ${totalPages}`, 'noop'));
    if (currentPage < totalPages) paginationRow.push(Markup.button.callback('التالي ◀️', `ord_pg_${currentPage + 1}`));
    if (totalPages > 1) buttons.push(paginationRow);
    buttons.push([Markup.button.callback('🏠 القائمة الرئيسية', 'main_menu')]);
    return { text, keyboard: Markup.inlineKeyboard(buttons) };
}

bot.hears(/سجل المحفظة/, async (ctx) => {
    try {
      const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
      if (usersDb[userId].isBanned) return;
      const history = usersDb[userId].walletHistory || [];
      if (history.length === 0) return await ctx.reply('📜 لا توجد معاملات مالية مسجلة حتى الآن.').catch(()=>{});
      let msg = '📜 **سجل المعاملات المالية (آخر 10 عمليات):**\n\n';
      history.slice(-10).reverse().forEach(item => { msg += '🔹 ' + item.type + ': *' + parseFloat(item.amount).toFixed(2) + ' EGP*\n🕒 ' + item.date + '\n━━━━━━━━━━━━\n'; });
      await ctx.reply(msg, { parse_mode: 'Markdown' }).catch(()=>{});
    } catch(e){}
});

bot.hears(/تحويل رصيد/, async (ctx) => {
    try {
        const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
        if (usersDb[userId].isBanned) return;
        if (!botStates) botStates = {}; if (!botStates.transfer) botStates.transfer = {};
        botStates.transfer[userId] = { step: 'WAIT_UID' }; saveDatabase();
        await ctx.reply('💸 **تحويل رصيد لصديق:**\n\nيرجى إرسال الـ **ID** (رقم الحساب الفريد) للشخص الذي تريد التحويل إليه:').catch(()=>{});
    } catch(e){}
});

bot.hears(/استخدام كود خصم/, async (ctx) => {
    try {
      const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
      if (usersDb[userId].isBanned) return;
      if (!botStates) botStates = {}; if (!botStates.promo) botStates.promo = {};
      botStates.promo[userId] = true; saveDatabase();
      await ctx.reply('🎟️ **استخدام كود خصم أو قسيمة شحن:**\n\nمن فضلك أرسل الكود الآن في رسالة:', {parse_mode: 'Markdown'}).catch(()=>{});
    } catch(e){}
});

bot.hears(/دعوة الأصدقاء/, async (ctx) => {
    try {
      const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
      if (usersDb[userId].isBanned) return;
      const refLink = 'https://t.me/' + ctx.botInfo.username + '?start=ref_' + usersDb[userId].uid;
      await ctx.reply('🎁 **نظام دعوة الأصدقاء المربح:**\n\nشارِك رابط الدعوة مع أصدقائك، وكلما قام أحدهم **بشحن محفظته**، ستحصل أنت فوراً على **2%** من قيمة شحنه تضاف لرصيدك تلقائياً!\n\n🔗 رابط الدعوة الخاص بك:\n`' + refLink + '`\n\n👥 عدد الأشخاص الذين دعوتهم: ' + usersDb[userId].referrals, {parse_mode: 'Markdown'}).catch(()=>{});
    } catch(e){}
});

bot.hears(/بحث عن خدمة/, async (ctx) => {
    try {
      const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
      if (usersDb[userId].isBanned) return;
      if (!botStates) botStates = {}; if (!botStates.search) botStates.search = {};
      botStates.search[userId] = true; saveDatabase();
      await ctx.reply('🔍 أرسل اسم الخدمة التي تبحث عنها (مثال: Canva أو نتفلكس) أو اكتب `Ahmed/` لتسجيل دخول الأدمن:').catch(()=>{});
    } catch(e){}
});

async function buildCategoriesList() {
    let fetchedCategories = [];
    cachedServices.forEach(s => {
      if (hiddenServices && hiddenServices.includes(String(s.id))) return;
      let catStr = getServiceCategory(s);
      if (catStr && !fetchedCategories.includes(catStr)) fetchedCategories.push(catStr);
    });

    let categories = [];
    preferredCategoriesOrder.forEach(cat => { if (fetchedCategories.includes(cat)) categories.push(cat); });
    fetchedCategories.forEach(cat => { if (!categories.includes(cat) && cat !== 'أخرى') categories.push(cat); });
    if (fetchedCategories.includes('أخرى') && !categories.includes('أخرى')) categories.push('أخرى');
    return categories;
}

// ==========================================
// 🚀 دالة عرض الأقسام الرئيسية 
// ==========================================
async function showCategories(ctx) {
  const userId = String(ctx.from.id);
  try {
    initUser(userId); clearUserStates(userId);
    if (usersDb[userId].isBanned) return await ctx.reply('❌ عذراً، تم حظرك من استخدام هذا البوت.').catch(()=>{});
    if (maintenanceMode && String(usersDb[userId].uid) !== '1001') return await ctx.reply('🛠 **المتجر في حالة صيانة حالياً**\nنعمل على تحديث الخدمات، عودوا قريباً جداً!', { parse_mode: 'Markdown' }).catch(()=>{});

    let loadingMsg;
    if (cachedServices.length === 0) {
        if(ctx.callbackQuery) loadingMsg = await ctx.editMessageText('⏳ جاري تجهيز الأقسام وربط السيرفرات لأول مرة...').catch(()=>{});
        else loadingMsg = await ctx.reply('⏳ جاري تجهيز الأقسام وربط السيرفرات لأول مرة...').catch(()=>{});
        await backgroundServiceUpdate(); 
    } else if (Date.now() - lastCategoriesFetchTime > categoryCacheTime) {
        backgroundServiceUpdate(); 
    }

    if (cachedServices.length === 0) {
        const errorMsg = '⚠️ تعذر جلب الخدمات حالياً، يرجى المحاولة بعد قليل.';
        const retryKeyboard = Markup.inlineKeyboard([[Markup.button.callback('🔄 إعادة المحاولة', 'main_categories')]]);
        if(ctx.callbackQuery) return await ctx.editMessageText(errorMsg, { ...retryKeyboard }).catch(()=>{});
        else if (loadingMsg) return await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, null, errorMsg, { ...retryKeyboard }).catch(()=>{});
        else return await ctx.reply(errorMsg, { ...retryKeyboard }).catch(()=>{});
    }

    const categories = await buildCategoriesList();
    let buttons = [];
    for (let i = 0; i < categories.length; i += 2) {
      const row = [];
      row.push(Markup.button.callback((categoryEmojis[categories[i]] || '📦') + ' ' + categories[i], 'cat_' + i + '_1'));
      if (i + 1 < categories.length) row.push(Markup.button.callback((categoryEmojis[categories[i+1]] || '📦') + ' ' + categories[i+1], 'cat_' + (i + 1) + '_1'));
      buttons.push(row);
    }
    buttons.push([Markup.button.callback('🏠 القائمة الرئيسية', 'main_menu')]);
    const keyboard = Markup.inlineKeyboard(buttons);

    if (!usersDb[userId].tempCategories) usersDb[userId].tempCategories = [];
    usersDb[userId].tempCategories = categories; saveDatabase();

    if(loadingMsg && !ctx.callbackQuery) await ctx.telegram.editMessageText(ctx.chat.id, loadingMsg.message_id, null, 'اختر الفئة:', { ...keyboard }).catch(()=>{});
    else if(ctx.callbackQuery) return await ctx.editMessageText('اختر الفئة:', { ...keyboard }).catch(()=>{});
    else return await ctx.reply('اختر الفئة:', { ...keyboard }).catch(()=>{});
  } catch (error) {
    const retryBtn = Markup.inlineKeyboard([[Markup.button.callback('🔄 إعادة المحاولة', 'main_categories')]]);
    if(ctx.callbackQuery) await ctx.editMessageText('❌ حدث خطأ مؤقت أثناء جلب الأقسام، يرجى المحاولة مجدداً.', { ...retryBtn }).catch(()=>{});
    else await ctx.reply('❌ حدث خطأ مؤقت أثناء جلب الأقسام، يرجى المحاولة مجدداً.', { ...retryBtn }).catch(()=>{});
  }
}

bot.command('products', showCategories);
bot.command('wallet', showDepositFlow);
bot.command('profile', showProfile);
bot.command('history', showOrdersMain);
bot.command('support', showSupport);

bot.hears(/حسابي/, showProfile);
bot.hears(/شحن الحساب/, showDepositFlow); 
bot.hears(/طلباتي/, showOrdersMain);
bot.hears(/الدعم الفني/, showSupport);
bot.hears(/الخدمات/, showCategories);

bot.action('main_categories', async (ctx) => { ctx.answerCbQuery().catch(()=>{}); await showCategories(ctx); });
bot.action('main_menu', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
      const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
      if (usersDb[userId].isBanned) return;
      ctx.deleteMessage().catch(()=>{}); 
      await ctx.reply('القائمة الرئيسية 🚀', getMainMenu()).catch(()=>{});
    } catch(e){}
});

// ==========================================
// 🚀 أوامر الأدمن
// ==========================================
bot.action('admin_force_refresh', async (ctx) => {
    ctx.answerCbQuery('⏳ جاري سحب أحدث الخدمات بالقوة من المزودين...').catch(()=>{});
    try {
        fetchPromise = null; 
        await backgroundServiceUpdate(); 
        await ctx.reply('✅ **تم بنجاح!**\nتم سحب وتحديث جميع الخدمات من المزودين الثلاثة وتخزينها.', { parse_mode: 'HTML' }).catch(()=>{});
    } catch (e) { await ctx.reply('❌ حدث خطأ أثناء التحديث اليدوي. حاول مجدداً.').catch(()=>{}); }
});

async function showAdminPanel(ctx) {
  try {
    const userIdStr = String(ctx.from ? ctx.from.id : (ctx.chat ? ctx.chat.id : ""));
    if (!isAdmin(userIdStr)) return;

    if (botStates && botStates.adminInput) delete botStates.adminInput[userIdStr];
    if (botStates && botStates.broadcast) delete botStates.broadcast[userIdStr];
    if (botStates && botStates.tempStock) delete botStates.tempStock[userIdStr];
    if (botStates && botStates.adminTempCats) delete botStates.adminTempCats[userIdStr];
    if (botStates && botStates.lastAdminCat) delete botStates.lastAdminCat[userIdStr];
    if (botStates && botStates.lastAdminCatFixed) delete botStates.lastAdminCatFixed[userIdStr];
    saveDatabase();

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

    const text = `👑 <b>لوحة تحكم الأدمن</b>\n\n` +
                 `📊 <b>الإحصائيات المتقدمة:</b>\n` +
                 `👥 إجمالي العملاء: ${totalUsers}\n` +
                 `💰 إجمالي أرصدة العملاء: ${totalBalances.toFixed(2)} EGP\n` +
                 `🛍️ إجمالي المشتريات بالمتجر: ${totalStoreSpent.toFixed(2)} EGP\n` +
                 `📦 إجمالي الطلبات المنفذة: ${totalOrdersCount}\n\n` +
                 `📈 نسبة الربح العامة: ${globalMarkupPercent}%\n` +
                 `⚡ حالة الخصم المؤقت: ${flashStatus}\n` +
                 `🛑 وضع الصيانة: ${maintStatus}\n` +
                 `📱 رقم الكاش: <code>${vodafoneCashNumber}</code>\n` +
                 `🟣 حساب انستاباي: <code>${instapayAccount}</code>\n` +
                 `📢 قنوات المبيعات: <code>${publicSalesChannels && publicSalesChannels.length > 0 ? publicSalesChannels.length + ' قناة' : 'غير محددة'}</code>\n` +
                 `🔒 الاشتراك الإجباري: <code>${forceSubscribeChannels && forceSubscribeChannels.length > 0 ? forceSubscribeChannels.length + ' قناة' : 'غير مفعل'}</code>`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('⚙️ إدارة خدمات المزودين (إخفاء / أسعار)', 'admin_manage_providers')],
        [Markup.button.callback('📉 إعلان انخفاض سعر (دروب)', 'admin_price_drop'), Markup.button.callback('🔔 فحص وإرسال تذكيرات', 'admin_scan_renewals')],
        [Markup.button.callback('🎁 إرسال كود دروب', 'admin_send_drop'), Markup.button.callback('⚙️ جروب الدروب', 'admin_set_drop_group')],
        [Markup.button.callback('🔄 تحديث وسحب الخدمات يدوياً', 'admin_force_refresh')],
        [Markup.button.callback('📱 تغيير رقم الكاش', 'admin_change_wallet'), Markup.button.callback('🏦 تغيير حساب انستاباي', 'admin_change_instapay')],
        [Markup.button.callback('📢 إضافة قناة مبيعات', 'admin_set_sales_channel'), Markup.button.callback('🔒 إضافة قناة اشتراك إجباري', 'admin_set_force_sub')],
        [Markup.button.callback('💳 طلبات الشحن (' + (pendingDeposits ? pendingDeposits.length : 0) + ')', 'admin_pending_deposits')],
        [Markup.button.callback('💰 فحص رصيد المزود', 'admin_check_api_balance'), Markup.button.callback('🟢 فحص حالة المزود (API)', 'admin_check_api_status')],
        [Markup.button.callback('🎯 نسبة ربح لمنتج', 'admin_search_markup'), Markup.button.callback('📦 مخزن المنتجات المحلي', 'admin_search_stock')],
        [Markup.button.callback('🔗 معرف الـ API لجميع الخدمات', 'admin_services_api_pg_1')],
        [Markup.button.callback('📊 تعديل النسبة العامة', 'admin_set_global_markup'), Markup.button.callback('🎯 تعديل نسبة قسم', 'admin_set_custom_markup')],
        [Markup.button.callback('⚡ خصم مؤقت (Flash Sale)', 'admin_flash_sale'), Markup.button.callback('🎫 توليد كروت شحن', 'admin_create_promo')],
        [Markup.button.callback('✉ مراسلة عميل بالـ ID', 'admin_msg_by_id'), Markup.button.callback('👥 شحن رصيد بالـ ID', 'admin_charge_by_id')], 
        [Markup.button.callback('🛠️ تبديل وضع الصيانة', 'admin_toggle_maintenance'), Markup.button.callback('📝 سجل نشاط الأدمن', 'admin_view_logs')],
        [Markup.button.callback('📂 عرض حسابات العملاء', 'admin_view_users_pg_1'), Markup.button.callback('💸 تقرير الأرباح', 'admin_profit_report')],
        [Markup.button.callback('🚫 حظر مستخدم', 'admin_ban_user'), Markup.button.callback('✅ فك حظر مستخدم', 'admin_unban_user')],
        [Markup.button.callback('📢 إرسال رسالة (إذاعة)', 'admin_broadcast'), Markup.button.callback('📈 إحصائيات الإعلانات', 'admin_ad_stats')],
        [Markup.button.callback('🚪 تسجيل خروج', 'admin_logout')]
      ]);

    if(ctx.callbackQuery) {
        if (ctx.callbackQuery.message && ctx.callbackQuery.message.photo) {
            await ctx.deleteMessage().catch(()=>{}); await ctx.reply(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
        } else {
            await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
        }
    }
    else { await ctx.reply(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{}); }
  } catch(e){}
}

bot.action(/^admin_/, async (ctx, next) => {
    if(!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ غير مصرح لك', {show_alert: true});
    return await next();
});
bot.action(/^approve_dep_|^reject_dep_/, async (ctx, next) => {
    if(!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ غير مصرح لك', {show_alert: true});
    return await next();
});

bot.action('admin_set_global_markup', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_GLOBAL_MARKUP'; saveDatabase();
    await ctx.editMessageText('📊 **تعديل نسبة الربح العامة:**\n\nأرسل النسبة الجديدة (أرقام فقط، مثلا: 20):', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_set_custom_markup', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_CUSTOM_MARKUP'; saveDatabase();
    await ctx.editMessageText('🎯 **تعديل نسبة الربح لقسم محدد:**\n\nأرسل اسم القسم (أو جزء منه) ثم مسافة ثم النسبة الجديدة.\n\nمثال:\n<code>Canva 50\nNetflix 30</code>\n\n🗑️ لمسح جميع النسب المخصصة والعودة للنسبة العامة، أرسل: <code>حذف الكل</code>', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_flash_sale', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_FLASH_SALE'; saveDatabase();
    await ctx.editMessageText('⚡ **إعداد خصم مؤقت (Flash Sale):**\n\nأرسل نسبة الخصم المئوية ثم مسافة ثم عدد الساعات.\nمثال (خصم 20% لمدة 5 ساعات): <code>20 5</code>\n\n🛑 لإيقاف الخصم الحالي أرسل: <code>0 0</code>', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_search_markup', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_SEARCH_MARKUP'; saveDatabase();
    await ctx.editMessageText('🎯 **تحديد نسبة ربح لمنتج معين:**\n\nأرسل اسم المنتج للبحث عنه (مثال: Canva):', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_search_stock', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_SEARCH_STOCK'; saveDatabase();
    await ctx.editMessageText('📦 **المخزن المحلي (تسليم فوري):**\n\nأرسل اسم المنتج للبحث عنه وإضافته للمخزن (مثال: Canva):', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_charge_by_id', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_CHARGE_USER'; saveDatabase();
    await ctx.editMessageText('👥 **شحن رصيد لعميل بالـ ID:**\n\nأرسل الآيدي والمبلغ هكذا (بينهم مسافة):\n<code>الآيدي المبلغ</code>\n(مثال: <code>1001 50</code>)', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_manage_providers', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    const buttons = [
        [Markup.button.callback('⚙️ مزود 1 (XProStore)', 'prv_1'), Markup.button.callback('⚙️ مزود 2 (ZFour)', 'prv_2')],
        [Markup.button.callback('⚙️ مزود 3 (CupponHub)', 'prv_3')],
        [Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]
    ];
    await ctx.editMessageText('⚙️ <b>إدارة خدمات المزودين:</b>\nاختر المزود الذي تريد التحكم في خدماته:', { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
});

bot.action(/^prv_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    const prvNum = ctx.match[1];
    let label = prvNum === '3' ? '3 (CupponHub)' : prvNum;
    const buttons = [
        [Markup.button.callback('👁️ إخفاء / إظهار خدمات', `prv_list_hide_${prvNum}_1`)],
        [Markup.button.callback('💲 تحديد أسعار ثابتة', `prv_list_price_${prvNum}_1`)],
        [Markup.button.callback('🔙 رجوع للمزودين', 'admin_manage_providers')]
    ];
    await ctx.editMessageText(`🛠️ <b>التحكم في مزود (${label}):</b>\nماذا تريد أن تفعل بخدمات هذا المزود؟`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
});

async function renderProviderServices(ctx, providerNum, actionType, page, isTextContext = false) {
    if (cachedServices.length === 0) {
        if (!isTextContext && ctx.callbackQuery) {
            await ctx.editMessageText('⏳ لحظات، جاري جلب الخدمات...').catch(()=>{});
        }
        await backgroundServiceUpdate();
    }
    const providerId = `api${providerNum}`;
    let services = cachedServices.filter(s => s.providerSource === providerId);
    services = sortServicesByImportance(services);

    let label = providerNum === '3' ? '3 (CupponHub)' : providerNum;

    if (services.length === 0) {
         const emptyMsg = `❌ لا توجد خدمات حالياً في المزود (${label}).`;
         const btn = Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', `prv_${providerNum}`)]]);
         if (isTextContext || !ctx.callbackQuery) return ctx.reply(emptyMsg, { ...btn }).catch(()=>{});
         return ctx.editMessageText(emptyMsg, { ...btn }).catch(()=>{});
    }

    const itemsPerPage = 15;
    const totalPages = Math.ceil(services.length / itemsPerPage) || 1;
    const currentPage = Math.min(Math.max(page, 1), totalPages);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageItems = services.slice(startIndex, startIndex + itemsPerPage);

    let buttons = pageItems.map(srv => {
        let btnText = ''; let cbData = '';
        if (actionType === 'hide') {
            const isHidden = hiddenServices.includes(String(srv.id));
            btnText = (isHidden ? '🔴 مخفي: ' : '🟢 ظاهر: ') + (srv.name_ar || srv.name || srv.title).substring(0, 25);
            cbData = `prv_tog_hide_${srv.internal_id}_${providerNum}_${currentPage}`; 
        } else if (actionType === 'price') {
            const fp = fixedPrices[String(srv.id)];
            btnText = (fp ? `[${fp}ج] ` : '⏳ ') + (srv.name_ar || srv.name || srv.title).substring(0, 25);
            cbData = `prv_setfixed_${srv.internal_id}_${providerNum}_${currentPage}`; 
        }
        return [Markup.button.callback(btnText, cbData)];
    });

    let paginationRow = [];
    if (currentPage > 1) paginationRow.push(Markup.button.callback('▶️ السابق', `prv_list_${actionType}_${providerNum}_${currentPage - 1}`));
    paginationRow.push(Markup.button.callback(`📄 ${currentPage}/${totalPages}`, 'noop'));
    if (currentPage < totalPages) paginationRow.push(Markup.button.callback('التالي ◀️', `prv_list_${actionType}_${providerNum}_${currentPage + 1}`));

    if (totalPages > 1) buttons.push(paginationRow);
    buttons.push([Markup.button.callback('🔙 رجوع لخيارات المزود', `prv_${providerNum}`)]);

    const title = actionType === 'hide' ? '👁️ إخفاء/إظهار الخدمات' : '💲 تحديد أسعار ثابتة';
    const finalMsg = `🛠️ <b>${title} (مزود ${label}):</b>\nاختر الخدمة لتعديلها:\n*(القائمة تتحدث في نفس اللحظة ولا تغلق)*`;
    
    if (isTextContext || !ctx.callbackQuery) {
        await ctx.reply(finalMsg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
    } else {
        await ctx.editMessageText(finalMsg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
    }
}

bot.action(/^prv_list_(hide|price)_(\d+)_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    const actionType = ctx.match[1];
    const prvNum = ctx.match[2];
    const page = parseInt(ctx.match[3]);
    await renderProviderServices(ctx, prvNum, actionType, page);
});

bot.action(/^prv_tog_hide_(.+)_(\d+)_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery('تم تحديث حالة الخدمة! 🔄').catch(()=>{});
    const srvInternal = ctx.match[1];
    const prvNum = ctx.match[2];
    const page = parseInt(ctx.match[3]);
    
    const srv = cachedServices.find(s => s.internal_id === srvInternal);
    if (!srv) return;
    const srvId = srv.id;

    if (hiddenServices.includes(srvId)) { hiddenServices = hiddenServices.filter(id => id !== srvId); } 
    else { hiddenServices.push(srvId); }
    saveDatabase();
    await renderProviderServices(ctx, prvNum, 'hide', page);
});

bot.action(/^prv_setfixed_(.+)_(\d+)_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    const srvInternal = ctx.match[1];
    const prvNum = ctx.match[2];
    const pg = ctx.match[3];
    
    const srv = cachedServices.find(s => s.internal_id === srvInternal);
    if (!srv) return;
    const srvId = srv.id;

    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = `WAIT_PRV_FIXED_${srvId}_${prvNum}_${pg}`;
    saveDatabase();
    await ctx.editMessageText('💲 أرسل السعر الثابت الجديد للمنتج بالجنيه المصري (مثال: 150).\n\n🗑️ لإلغاء السعر الثابت والعودة للنسبة، اكتب: <code>حذف</code>\n🔙 للرجوع دون تعديل، اكتب: <code>رجوع</code>', {parse_mode: 'HTML'}).catch(()=>{});
});

bot.action(/^admin_services_api_pg_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery('⏳ جاري جلب الخدمات...').catch(()=>{});
    try {
        if (!cachedServices || cachedServices.length === 0) {
            await ctx.editMessageText('⏳ جاري التحميل... اضغط مرة أخرى بعد قليل.').catch(()=>{});
            backgroundServiceUpdate();
            return;
        }
        const visibleServices = cachedServices.filter(s => !hiddenServices.includes(String(s.id)));
        if (visibleServices.length === 0) return await ctx.editMessageText('❌ لا توجد خدمات ظاهرة حالياً.', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});

        const page = parseInt(ctx.match[1]) || 1;
        const itemsPerPage = 15;
        const totalPages = Math.ceil(visibleServices.length / itemsPerPage) || 1;
        const currentPage = Math.min(Math.max(page, 1), totalPages);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const pageItems = visibleServices.slice(startIndex, startIndex + itemsPerPage);

        let msg = `🔗 <b>الخدمات الظاهرة للعملاء مع الـ API (صفحة ${currentPage}/${totalPages}):</b>\n\n`;
        pageItems.forEach((srv, idx) => {
            const actualIndex = startIndex + idx + 1;
            const srvName = srv.name_ar || srv.name || srv.title || 'خدمة';
            const apiSource = srv.providerSource || 'api1';
            let apiLabel = 'API 1';
            if (apiSource === 'api2') apiLabel = 'API 2';
            if (apiSource === 'api3') apiLabel = 'API 3';

            msg += `🔹 ${actualIndex}. <b>${safeHtml(srvName)}</b>\n   📌 المعرف: <code>[${apiLabel}]</code>\n━━━━━━━━━━━━\n`;
        });

        let paginationRow = [];
        if (currentPage > 1) paginationRow.push(Markup.button.callback('▶️ السابق', `admin_services_api_pg_${currentPage - 1}`));
        paginationRow.push(Markup.button.callback(`📄 ${currentPage}/${totalPages}`, 'noop'));
        if (currentPage < totalPages) paginationRow.push(Markup.button.callback('التالي ◀️', `admin_services_api_pg_${currentPage + 1}`));
        let buttons = []; if (totalPages > 1) buttons.push(paginationRow);
        buttons.push([Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]);

        await ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
    } catch (e) { await ctx.editMessageText('❌ حدث خطأ أثناء جلب الخدمات.', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{}); }
});

bot.action('admin_price_drop', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_PD_SEARCH'; saveDatabase();
    await ctx.editMessageText('📉 **إعلان انخفاض سعر (Price Drop):**\n\nأرسل اسم المنتج الذي تريد تخفيض سعره ونشره في القناة للبحث عنه:', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action(/^pdsel_(.+)$/, async (ctx) => {
    const srvId = ctx.match[1];
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = `WAIT_PD_PRICE_${srvId}`; saveDatabase();
    await ctx.editMessageText('💰 أرسل السعر الجديد للمنتج بالجنيه المصري (سيتم حسابه وتحديثه كـ سعر ثابت تلقائياً):', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_set_drop_group', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_DROP_GROUP'; saveDatabase();
    await ctx.editMessageText(`⚙️ **تحديد جروب الدروبات:**\n\nالجروب الحالي: <code>${dropGroupId || 'غير محدد'}</code>\n\nأرسل ID الجروب العام الخاص بك (يجب أن يبدأ بـ -100):`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_send_drop', async (ctx) => {
    if (!dropGroupId) return ctx.answerCbQuery('❌ يرجى تحديد ID الجروب أولاً من (جروب الدروب)!', {show_alert: true}).catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_DROP_AMOUNT'; saveDatabase();
    await ctx.editMessageText('🎁 **إرسال دروب سريع للجروب:**\n\nأرسل الآن المبلغ المراد توزيعه كهدية لأسرع عميل بالجنيه المصري (مثال: <code>50</code>):', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_scan_renewals', async (ctx) => {
    ctx.answerCbQuery('⏳ جاري فحص جميع الطلبات...').catch(()=>{});
    let sentCount = 0; const now = Date.now(); const twentySevenDays = 27 * 24 * 60 * 60 * 1000; const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    for (let uid in usersDb) {
        let user = usersDb[uid];
        if (!user.orders) continue;
        for (let i = 0; i < user.orders.length; i++) {
            let order = user.orders[i];
            if (order.timestamp && !order.reminded) {
                const diff = now - order.timestamp;
                if (diff >= twentySevenDays && diff < thirtyDays) {
                    order.reminded = true;
                    bot.telegram.sendMessage(uid, `⚠️ **تذكير تجديد اشتراك!**\n\nمرحباً، اشتراكك في الخدمة: **${safeHtml(order.name)}** يوشك على الانتهاء.\n\nاضغط على الزر بالأسفل لتجديده الآن بضغطة واحدة وتجنب الانقطاع! 🚀`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🛒 تجديد الاشتراك الفوري', `buyact_${order.srvId}`)]]) }).catch(()=>{});
                    sentCount++;
                }
            }
        }
    }
    saveDatabase();
    await ctx.editMessageText(`✅ **تم الانتهاء من الفحص!**\n\nتم إرسال إشعارات التجديد التلقائية إلى <b>${sentCount}</b> عميل بنجاح.`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_change_wallet', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_NEW_WALLET'; saveDatabase();
    await ctx.editMessageText('📱 **تغيير رقم الاستقبال (الكاش):**\n\nأرسل الرقم الجديد لمحفظة فودافون كاش الخاص بك:', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_change_instapay', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_NEW_INSTAPAY'; saveDatabase();
    await ctx.editMessageText('🏦 **تغيير حساب انستاباي:**\n\nأرسل اليوزرنيم أو عنوان الدفع الخاص بحساب انستاباي الجديد:', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_set_sales_channel', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_SALES_CHANNEL'; saveDatabase();
    await ctx.editMessageText('📢 **إضافة قنوات المبيعات الحية:**\n\nيمكنك إضافة أكثر من قناة بإرسالهم واحدة تلو الأخرى.\n\nفقط أرسل **رابط القناة** مباشرة (مثال: <code>https://t.me/AhmedStore</code>).\n\n🛑 لحذف جميع قنوات المبيعات أرسل كلمة: <code>إيقاف</code>', { parse_mode: 'HTML', disable_web_page_preview: true, ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_set_force_sub', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_FORCE_SUB'; saveDatabase();
    await ctx.editMessageText('🔒 **إضافة قنوات الاشتراك الإجباري:**\n\nيمكنك إضافة أكثر من قناة بالدخول لهذا الإعداد وإرسالهم واحدة تلو الأخرى.\n\n✨ **أرسل رابط القناة مباشرة** (سواء كانت عامة أو خاصة البوت سيتعرف عليها).\nمثال: <code>https://t.me/AhmedStore</code>\n\n⚠️ **تنبيه:** يجب رفع البوت كـ(مشرف) في القناة أولاً.\n\n🛑 لإلغاء وحذف جميع القنوات أرسل كلمة: <code>إيقاف</code>', { parse_mode: 'HTML', disable_web_page_preview: true, ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});


bot.action('admin_ad_stats', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        let msg = '📈 **إحصائيات الحملات الإعلانية:**\n\n';
        if (!adCampaigns || Object.keys(adCampaigns).length === 0) msg += 'لا توجد بيانات أو حملات حتى الآن.';
        else { for (let camp in adCampaigns) { msg += `🔹 إعلان (${camp}): دخول ${adCampaigns[camp]} عميل جديد\n`; } }
        await ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
    } catch (e) {}
});

bot.action('admin_profit_report', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        let totalProfit = 0; let todayProfit = 0; let yesterdayProfit = 0;
        const now = new Date(); const todayStr = now.toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo' });
        const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000); const yesterdayStr = yesterday.toLocaleDateString('ar-EG', { timeZone: 'Africa/Cairo' });

        for (let id in usersDb) {
            const user = usersDb[id];
            if (user.orders && user.orders.length > 0) {
                user.orders.forEach(order => {
                    let profit = 0;
                    if (order.profit !== undefined && !isNaN(parseFloat(order.profit))) profit = parseFloat(order.profit); 
                    else { const price = parseFloat(order.price || 0); profit = isNaN(price) ? 0 : price - (price / (1 + (globalMarkupPercent / 100))); }
                    totalProfit += profit;
                    if (order.date && order.date.includes(todayStr)) todayProfit += profit;
                    else if (order.date && order.date.includes(yesterdayStr)) yesterdayProfit += profit;
                });
            }
        }
        const msg = `💸 **تقرير أرباح المتجر:**\n\n📅 **أرباح اليوم:** <b>${todayProfit.toFixed(2)} EGP</b>\n📆 **أرباح أمس:** <b>${yesterdayProfit.toFixed(2)} EGP</b>\n📈 **إجمالي الأرباح الكلية:** <b>${totalProfit.toFixed(2)} EGP</b>\n\n*(ملاحظة: الأرباح القديمة محسوبة بشكل تقديري، أما أرباح الطلبات الجديدة يتم حسابها بدقة 100%).*`;
        await ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
    } catch (e) {}
});

bot.action('admin_pending_deposits', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        let msg = ''; let inlineButtons = [];
        if (!pendingDeposits || pendingDeposits.length === 0) {
            msg = '💳 <b>طلبات الشحن المعلقة:</b>\n\nلا توجد طلبات شحن معلقة حالياً.';
            inlineButtons.push([Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]);
        } else {
            msg = '💳 <b>طلبات الشحن المعلقة (' + pendingDeposits.length + '):</b>\n\n';
            pendingDeposits.forEach((req, idx) => {
                const methodLabel = req.method === 'instapay' ? '🟣 انستاباي' : '🔴 فودافون كاش';
                msg += `👤 ID: <code>${req.userUid}</code>\n💰 المبلغ: <b>${req.amount} EGP</b>\n💳 الطريقة: <b>${methodLabel}</b>\n📸 <b>(الإثبات مرفق)</b>\n━━━━━━━━━━━━\n`;
                inlineButtons.push([ Markup.button.callback('✅ موافقة (' + req.amount + 'ج)', `approve_dep_${req.userId}_${req.amount}`), Markup.button.callback('❌ رفض', `reject_dep_${req.userId}`) ]);
            });
            inlineButtons.push([Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]);
        }
        if (ctx.callbackQuery.message && ctx.callbackQuery.message.photo) {
            await ctx.deleteMessage().catch(()=>{}); await ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(inlineButtons) }).catch(()=>{});
        } else { await ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(inlineButtons) }).catch(()=>{}); }
    } catch(e) {}
});

bot.action('admin_check_api_balance', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        await ctx.editMessageText('⏳ جاري الاتصال بالمزودين (1, 2, 3)...').catch(()=>{});
        let msg = '💰 **أرصدة المزودين:**\n\n';
        try { const res1 = await apiClient1.get('/me/wallet'); msg += `🔹 المزود 1: <b>${parseFloat(res1.data?.data?.balance || res1.data?.balance || 0).toFixed(2)} EGP</b>\n`; } catch(e) { msg += `🔹 المزود 1: خطأ ❌\n`; }
        try { const res2 = await apiClient2.get('/balance'); msg += `🔹 المزود 2: <b>$${parseFloat(res2.data?.data?.balance || res2.data?.balance || 0).toFixed(2)}</b>\n`; } catch(e) { msg += `🔹 المزود 2: خطأ ❌\n`; }
        
        try { 
            const res3 = await apiClient3.get('/?action=balance'); 
            msg += `🔹 المزود 3 (CupponHub): <b>${parseFloat(res3.data?.balance_usdt || res3.data?.data?.balance || 0).toFixed(2)} USDT</b>\n`; 
        } catch(e) { 
            msg += `🔹 المزود 3 (CupponHub): خطأ ❌\n`; 
        }
        
        await ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
    } catch(e) {}
});

bot.action('admin_check_api_status', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        await ctx.editMessageText('⏳ جاري فحص استجابة سيرفرات المزودين...').catch(()=>{});
        let msg = '🟢 **حالة سيرفرات المزودين (API):**\n\n';
        
        try { const start1 = Date.now(); await apiClient1.get('/services?limit=1'); msg += `🔹 المزود 1: يعمل ✅ (${Date.now() - start1}ms)\n`; } catch(e) { msg += `🔹 المزود 1: متعطل ❌\n`; }
        try { const start2 = Date.now(); await apiClient2.get('/products'); msg += `🔹 المزود 2: يعمل ✅ (${Date.now() - start2}ms)\n`; } catch(e) { msg += `🔹 المزود 2: متعطل ❌\n`; }
        
        try { 
            const start3 = Date.now(); 
            await apiClient3.get('/?action=products'); 
            msg += `🔹 المزود 3 (CupponHub): يعمل ✅ (${Date.now() - start3}ms)\n`; 
        } catch(e) { 
            msg += `🔹 المزود 3 (CupponHub): متعطل ❌ (${e.response?.status || e.message})\n`; 
        }
        
        await ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
    } catch(e) {}
});

bot.action('admin_toggle_maintenance', async (ctx) => {
    ctx.answerCbQuery('تم التغيير بنجاح').catch(()=>{});
    try { maintenanceMode = !maintenanceMode; saveDatabase(); logAdminAction(ctx.from.id, 'تغيير وضع الصيانة'); await showAdminPanel(ctx); } catch(e){}
});

bot.action('admin_view_logs', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
      let msg = '📝 **سجل نشاط الأدمن (آخر 15 حركة):**\n\n';
      if (adminAuditLogs.length === 0) msg += 'لا توجد حركات مسجلة بعد.';
      else { adminAuditLogs.slice(-15).reverse().forEach(log => { msg += '🔹 الأدمن: <code>' + log.adminId + '</code>\n📌 الحركة: ' + log.action + '\n🕒 ' + log.date + '\n━━━━━━━━━━━━\n'; }); }
      await ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
    } catch(e){}
});

bot.action('back_to_admin', async (ctx) => { ctx.answerCbQuery().catch(()=>{}); try { await showAdminPanel(ctx); } catch(e){} });

bot.action('admin_logout', async (ctx) => { 
    ctx.answerCbQuery().catch(()=>{}); botStates.adminSession[ctx.from.id] = false; botStates.adminLogin[ctx.from.id] = null; 
    if (usersDb[ctx.from.id] && String(usersDb[ctx.from.id].uid) === '1001') { usersDb[ctx.from.id].uid = Math.floor(1000000000 + Math.random() * 9000000000); }
    saveDatabase(); await ctx.editMessageText('✅ تم تسجيل الخروج بنجاح وعاد حسابك كعميل عادي.').catch(()=>{}); 
});

async function renderUsersPage(ctx, page) {
    try {
        let allUsers = [];
        for (let tgId in usersDb) { allUsers.push({ tgId, ...usersDb[tgId] }); }
        const itemsPerPage = 20; const totalUsers = allUsers.length; const totalPages = Math.ceil(totalUsers / itemsPerPage) || 1;
        const currentPage = Math.min(Math.max(page, 1), totalPages);
        const startIndex = (currentPage - 1) * itemsPerPage; const endIndex = Math.min(startIndex + itemsPerPage, totalUsers);
        const pageItems = allUsers.slice(startIndex, endIndex);

        let msg = `👥 <b>قائمة العملاء (صفحة ${currentPage}/${totalPages}):</b>\n\n`;
        if (totalUsers === 0) msg += 'لا يوجد عملاء حتى الآن.';
        else { pageItems.forEach(u => { const bStatus = u.isBanned ? ' 🔴 [محظور]' : ''; msg += `👤 ID: <code>${u.uid}</code> | الرصيد: <b>${parseFloat(u.balance).toFixed(2)} EGP</b>${bStatus}\n`; }); }

        let paginationRow = [];
        if (currentPage > 1) paginationRow.push(Markup.button.callback('▶️ السابق', `admin_view_users_pg_${currentPage - 1}`));
        paginationRow.push(Markup.button.callback(`📄 ${currentPage}/${totalPages}`, 'noop'));
        if (currentPage < totalPages) paginationRow.push(Markup.button.callback('التالي ◀️', `admin_view_users_pg_${currentPage + 1}`));

        let buttons = []; if (totalPages > 1) buttons.push(paginationRow);
        buttons.push([Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]);
        await ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
    } catch (e) {}
}

bot.action('admin_view_users_pg_1', async (ctx) => { ctx.answerCbQuery().catch(()=>{}); await renderUsersPage(ctx, 1); });
bot.action(/^admin_view_users_pg_(\d+)$/, async (ctx) => { ctx.answerCbQuery().catch(()=>{}); const page = parseInt(ctx.match[1]); await renderUsersPage(ctx, page); });

// ==========================================================
// 🚀 فتح الأقسام فورا بدون أخطاء `ReferenceError`
// ==========================================================
bot.action(/^cat_(\d+)(?:_(\d+))?$/, async (ctx) => {
  ctx.answerCbQuery().catch(()=>{}); 
  try {
    const userId = String(ctx.from.id); initUser(userId);
    if (usersDb[userId].isBanned) return;

    const catIndex = parseInt(ctx.match[1]);
    const page = parseInt(ctx.match[2]) || 1; 
    let selectedCategory = usersDb[userId].tempCategories ? usersDb[userId].tempCategories[catIndex] : null;
    
    // بناء الأقسام تلقائياً لو الذاكرة طارت عشان البوت ميهنجش
    if (!selectedCategory) { 
        if (cachedServices.length === 0) await backgroundServiceUpdate();
        let fetchedCategories = [];
        cachedServices.forEach(s => {
            if (hiddenServices && hiddenServices.includes(String(s.id))) return;
            let catStr = getServiceCategory(s);
            if (catStr && !fetchedCategories.includes(catStr)) fetchedCategories.push(catStr);
        });
        let categories = [];
        preferredCategoriesOrder.forEach(cat => { if (fetchedCategories.includes(cat)) categories.push(cat); });
        fetchedCategories.forEach(cat => { if (!categories.includes(cat) && cat !== 'أخرى') categories.push(cat); });
        if (fetchedCategories.includes('أخرى') && !categories.includes('أخرى')) categories.push('أخرى');
        
        usersDb[userId].tempCategories = categories;
        saveDatabase();
        selectedCategory = categories[catIndex];
    }

    if (!selectedCategory) {
        return await ctx.editMessageText('⚠️ يرجى تحديث الأقسام من القائمة الرئيسية.', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'main_categories')]]) }).catch(()=>{});
    }

    if (cachedServices.length === 0) {
        await ctx.editMessageText('⏳ جاري جلب الخدمات من السيرفر السحابي...').catch(()=>{});
        await backgroundServiceUpdate(); 
    } else if (Date.now() - lastCategoriesFetchTime > categoryCacheTime) {
        backgroundServiceUpdate(); 
    }

    let categoryServices = cachedServices.filter(s => {
      if (hiddenServices && hiddenServices.includes(String(s.id))) return false;
      let cat = getServiceCategory(s);
      return cat === selectedCategory || cat.toLowerCase().includes(selectedCategory.toLowerCase()) || selectedCategory.toLowerCase().includes(cat.toLowerCase());
    });
    
    categoryServices = sortServicesByImportance(categoryServices);

    const itemsPerPage = 12; 
    const totalPages = Math.ceil(categoryServices.length / itemsPerPage) || 1;
    const currentPage = Math.min(Math.max(page, 1), totalPages);
    const startIndex = (currentPage - 1) * itemsPerPage;
    const pageItems = categoryServices.slice(startIndex, startIndex + itemsPerPage);

    if (pageItems.length === 0) return await ctx.editMessageText('لا توجد خدمات حالياً في هذا القسم.', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'main_categories')]]) }).catch(()=>{});

    let buttons = pageItems.map(srv => {
        let srvName = srv.name_ar || srv.name || srv.title || 'خدمة';
        let emoji = detectServiceEmoji(srvName);
        let cleanName = srvName;
        if (cleanName.length > 26) cleanName = cleanName.substring(0, 24) + '..';
        let price = "0.00";
        try { price = calculateRetailPrice(srv, usersDb[userId], 1); } catch(e){}
        
        let ratingStr = '';
        if (ratings[srv.id] && ratings[srv.id].count > 0) {
            const avg = (ratings[srv.id].totalStars / ratings[srv.id].count).toFixed(1);
            ratingStr = ` (⭐ ${avg})`;
        }
        
        return [
            Markup.button.callback(`🛒 ${emoji}${cleanName}${ratingStr} -${price} EGP`, `buyact_${srv.internal_id}`)
        ];
    });

    let paginationRow = [];
    if (currentPage > 1) paginationRow.push(Markup.button.callback('▶️ السابق', `cat_${catIndex}_${currentPage - 1}`));
    if (totalPages > 1) paginationRow.push(Markup.button.callback(`📄 ${currentPage}/${totalPages}`, 'noop'));
    if (currentPage < totalPages) paginationRow.push(Markup.button.callback('التالي ◀️', `cat_${catIndex}_${currentPage + 1}`));

    if (paginationRow.length > 0) buttons.push(paginationRow);
    buttons.push([Markup.button.callback('🔙 رجوع للأقسام', 'main_categories')]);

    await ctx.editMessageText(`📦 خدمات قسم <b>${selectedCategory}</b>:`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
  } catch(err) {
      console.error(err);
  }
});

bot.action('cancel_action', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{}); 
    clearUserStates(ctx.from.id);
    await ctx.deleteMessage().catch(()=>{});
});

bot.action(/^notify_stock_(.+)$/, async (ctx) => {
    ctx.answerCbQuery('تم تفعيل إشعار التوفر! 🔔').catch(()=>{});
    try {
        const srvInternalId = ctx.match[1];
        const srv = cachedServices.find(s => s.internal_id === srvInternalId);
        if (!srv) return;
        
        const userId = String(ctx.from.id);
        if (!stockAlerts[srv.id]) stockAlerts[srv.id] = [];
        if (!stockAlerts[srv.id].includes(userId)) stockAlerts[srv.id].push(userId);
        saveDatabase();
        await ctx.editMessageText('🔔 **تم تفعيل الإشعار بنجاح!**\nسنرسل لك رسالة تلقائية فور قيام الإدارة بإضافة كميات جديدة من هذه الخدمة.', {parse_mode: 'HTML'}).catch(()=>{});
    } catch (e) {}
});

bot.action(/^rate_(\d+)_(.+)$/, async (ctx) => {
    ctx.answerCbQuery('شكراً لتقييمك!').catch(()=>{});
    const stars = parseInt(ctx.match[1]);
    const srvInternalId = ctx.match[2];
    
    const srv = cachedServices.find(s => s.internal_id === srvInternalId);
    if (!srv) return;

    if (!ratings[srv.id]) ratings[srv.id] = { totalStars: 0, count: 0 };
    ratings[srv.id].totalStars += stars;
    ratings[srv.id].count += 1;
    saveDatabase();
    await ctx.editMessageText(`✅ **شكراً لتقييمك الرائع!**\nتقييمك للخدمة: ${'⭐'.repeat(stars)}\nرأيك يهمنا ويساعد العملاء الآخرين.`, {parse_mode: 'HTML'}).catch(()=>{});
});

bot.action(/^buyact_(.+)$/, async (ctx) => {
  ctx.answerCbQuery().catch(()=>{}); 
  try {
     const userId = String(ctx.from.id);
     initUser(userId); 
     const srvInternalId = ctx.match[1];
     
     if (!cachedServices || cachedServices.length === 0) {
         await ctx.editMessageText('⏳ لحظات جاري تجهيز الخدمة...').catch(()=>{});
         await backgroundServiceUpdate(); 
     }
     
     await processBuyAction(ctx, userId, srvInternalId); 
  } catch(err){
      console.error("Buy action error:", err);
  }
});

bot.action('confirm_stock_add', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    const userId = String(ctx.from.id);
    const temp = botStates.tempStock[userId];
    
    if (!temp) return await ctx.editMessageText('❌ انتهت صلاحية هذا الأمر أو تم تنفيذه مسبقاً.').catch(()=>{});

    const srvId = temp.srvId;
    const item = temp.itemText;

    if (!localInventory[srvId]) localInventory[srvId] = [];
    localInventory[srvId].push(item);
    
    if (stockAlerts[srvId] && stockAlerts[srvId].length > 0) {
        let srvName = "الخدمة المطلوبة";
        if (cachedServices && cachedServices.length > 0) {
            const srv = cachedServices.find(s => String(s.id) === String(srvId));
            if (srv) srvName = srv.name_ar || srv.name || srv.title;
        }
        stockAlerts[srvId].forEach(uId => {
            bot.telegram.sendMessage(uId, `🔔 **خبر سار!**\nالخدمة التي كنت تنتظرها <b>${srvName}</b> أصبحت متوفرة الآن في المتجر! سارع بالطلب قبل نفاذ الكمية.`, {parse_mode: 'HTML'}).catch(()=>{});
        });
        stockAlerts[srvId] = []; 
    }
    
    delete botStates.tempStock[userId];
    saveDatabase();
    logAdminAction(userId, `إضافة 1 عنصر للمخزن المحلي ${srvId}`);

    await ctx.editMessageText(`✅ تم حفظ العنصر بنجاح!\n📦 إجمالي المخزون الحالي للمنتج: ${localInventory[srvId].length}\n\n(يمكنك إرسال العنصر التالي مباشرة، أو اضغط "رجوع" للعودة)`, { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('cancel_stock_add', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    const userId = String(ctx.from.id);
    if (botStates.tempStock && botStates.tempStock[userId]) {
        delete botStates.tempStock[userId];
        saveDatabase();
    }
    await ctx.editMessageText('❌ تم إلغاء إضافة العنصر.\nيمكنك إرسال عنصر جديد أو الضغط على "رجوع" للعودة.', { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

function extractUsefulData(obj) {
    if (!obj) return null;
    if (typeof obj === 'string' || typeof obj === 'number') return String(obj);
    let extracted = [];
    const ignoreKeys = ['id', 'order', 'orders', 'order_id', 'status', 'created_at', 'updated_at', 'service_id', 'quantity', 'price', 'user_id', 'api', 'api_id', 'api_order_id', 'api_service_id', 'currency', 'charge', 'remains', 'start_count', 'link', 'cost', 'old_charge', 'unit_usdt', 'total_usdt', 'balance_after', 'stock_left', 'price_version_id', 'price_source', 'product', 'key'];
    
    function deepExtract(currentObj) {
        if (currentObj === null || currentObj === undefined) return;
        if (typeof currentObj === 'string' || typeof currentObj === 'number') {
            let str = String(currentObj).trim();
            if (str.length > 0 && str !== '0' && str !== '0.00' && str !== '0.0') {
                extracted.push(str);
            }
        } else if (Array.isArray(currentObj)) {
            currentObj.forEach(item => {
                if (typeof item === 'string') {
                    extracted.push(item);
                } else {
                    deepExtract(item);
                }
            });
        } else if (typeof currentObj === 'object') {
            for (let k in currentObj) {
                if (ignoreKeys.includes(k.toLowerCase())) continue;
                deepExtract(currentObj[k]);
            }
        }
    }
    
    deepExtract(obj);
    if (extracted.length === 0) return null;
    return [...new Set(extracted)].join('\n\n');
}

async function publishPriceDrop(ctx, userId, state, fileId) {
    const srvIdStr = state.replace('WAIT_PD_IMG_', '');
    const lastUnderscore = srvIdStr.lastIndexOf('_');
    const srvId = srvIdStr.substring(0, lastUnderscore);
    const price = parseFloat(srvIdStr.substring(lastUnderscore + 1));

    if (!publicSalesChannels || publicSalesChannels.length === 0) {
        return await ctx.reply('❌ يرجى تحديد قناة المبيعات أولاً من لوحة التحكم لنشر الإعلان.');
    }

    if (cachedServices.length === 0) await backgroundServiceUpdate();
    const srv = cachedServices.find(s => String(s.id) === srvId);
    if (!srv) return await ctx.reply('❌ الخدمة غير موجودة.');

    const oldPrice = parseFloat(calculateRetailPrice(srv, null, 1));
    
    fixedPrices[srvId] = price;
    if (botStates && botStates.adminInput) delete botStates.adminInput[userId];
    saveDatabase();

    const discount = oldPrice > 0 ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
    const srvName = srv.name_ar || srv.name || srv.title;

    const safeName = safeHtml(srvName);
    const msgText = `🔥 <b>توفرت كميات جديدة الآن!</b> 🎉\n\n📦 <b>${safeName}</b>\n📊 <b>الكمية المتوفرة:</b> كمية محدودة!\n💰 <b>السعر القديم:</b> <s>${oldPrice} EGP</s>\n✨ <b>السعر الجديد:</b> ${price} EGP\n🏷 <b>نسبة الخصم:</b> ${discount}%\n\n🔥 <b>الكمية محدودة!</b>\n⚡ <b>سارع بالطلب الآن قبل نفاذ الكمية!</b>`;

    const me = await ctx.telegram.getMe().catch(() => ({username: 'AhmedStoreBot'}));
    const botUsername = me.username;
    
    const keyboard = Markup.inlineKeyboard([
         [Markup.button.url('🛒 شراء الآن', `https://t.me/${botUsername}?start=buy_auto`)]
    ]);

    try {
        for (let channel of publicSalesChannels) {
            if (fileId) {
                await bot.telegram.sendPhoto(channel, fileId, {caption: msgText, parse_mode: 'HTML', ...keyboard}).catch(()=>{});
            } else {
                await bot.telegram.sendMessage(channel, msgText, {parse_mode: 'HTML', ...keyboard}).catch(()=>{});
            }
        }
        await ctx.reply(`✅ تم نشر الإعلان وتخفيض السعر بنجاح إلى ${price} EGP!`, { ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) });
    } catch (e) {
        await ctx.reply('❌ فشل النشر في بعض القنوات.');
    }
}

bot.on('photo', async (ctx, next) => {
    try {
        const userId = String(ctx.from.id); initUser(userId);
        
        const state = botStates.adminInput ? botStates.adminInput[userId] : null;
        
        if (isAdmin(userId) && state && state.startsWith('WAIT_PD_IMG_')) {
            const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            await publishPriceDrop(ctx, userId, state, fileId);
            return;
        }
        
        if (botStates.broadcast && botStates.broadcast[userId] && isAdmin(userId)) {
            const caption = ctx.message.caption || '';
            let fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            
            let parts = caption.split('|').map(s => s.trim());
            let msgText = parts[0] || 'إعلان من الإدارة';
            let markup = null;
            if (parts.length >= 3) markup = Markup.inlineKeyboard([[Markup.button.url(parts[1], parts[2])]]);

            await ctx.reply('⏳ جاري إرسال الإذاعة المصورة لجميع العملاء...').catch(()=>{});
            let count = 0;
            for (let tgId in usersDb) {
                if (String(usersDb[tgId].uid) !== '1001') {
                    bot.telegram.sendPhoto(tgId, fileId, { caption: msgText, parse_mode: 'HTML', ...(markup ? markup : {}) }).catch(() => {});
                    count++; if (count % 20 === 0) await new Promise(r => setTimeout(r, 1000)); 
                }
            }
            delete botStates.broadcast[userId]; saveDatabase(); 
            await ctx.reply('✅ تم الإرسال للجميع بنجاح.');
            return;
        }

        if (botStates.deposit && botStates.deposit[userId] && botStates.deposit[userId].step === 'WAIT_RECEIPT') {
            const amount = botStates.deposit[userId].amount;
            const photoObj = ctx.message.photo[ctx.message.photo.length - 1];
            const fileId = photoObj.file_id;
            const fileUniqueId = photoObj.file_unique_id; 
            
            if (usedReceipts.includes(fileUniqueId)) {
                await ctx.reply('⚠️ <b>تحذير أمني:</b>\nتم اكتشاف أن هذا الإيصال تم استخدامه مسبقاً! يرجى إرسال إيصال جديد وعدم تكرار المحاولة لتجنب حظر حسابك نهائياً.', {parse_mode: 'HTML'}).catch(()=>{});
                return;
            }
            
            usedReceipts.push(fileUniqueId);
            
            const reqData = { userId, userUid: usersDb[userId].uid, amount, receipt: fileId, method: botStates.deposit[userId].method };
            delete botStates.deposit[userId]; saveDatabase();
            
            pendingDeposits.push(reqData); saveDatabase();
            
            await ctx.reply('✅ <b>تم استلام طلبك وإثبات الدفع!</b>\n⏳ جاري مراجعته من الإدارة وسيتم إضافة الرصيد لمحفظتك قريباً.', {parse_mode: 'HTML'}).catch(()=>{});
            
            for (let tgId in usersDb) {
                if (String(usersDb[tgId].uid) === '1001') {
                    const methodLabel = reqData.method === 'instapay' ? '🟣 انستاباي' : '🔴 فودافون كاش';
                    bot.telegram.sendPhoto(tgId, fileId, {
                        caption: `🔔 <b>طلب شحن يدوي للمراجعة</b>\n\n👤 المستخدم: <code>${reqData.userUid}</code>\n💰 المبلغ المطلوب: <b>${reqData.amount} EGP</b>\n💳 الطريقة: <b>${methodLabel}</b>`,
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('✅ موافقة', `approve_dep_${reqData.userId}_${reqData.amount}`), Markup.button.callback('❌ رفض', `reject_dep_${reqData.userId}`)]
                        ])
                    }).catch(()=>{});
                }
            }
            return;
        }
    } catch(e) {}
    
    return await next();
});

// ==========================================
// 🚀 نظام تشغيل Vercel الآمن والمحمي بالكامل 
// ==========================================
export default async function handler(req, res) {
  if (req.method === 'POST') {
    let responded = false;
    
    const safeRes = () => {
        if (!responded && !res.headersSent) {
            responded = true;
            res.status(200).send('OK');
        }
    };

    // وقت كافي جداً (9 ثواني) للبوت يقرأ ويسحب قبل ما Vercel يقفل
    const timeoutId = setTimeout(safeRes, 9000);

    try {
        await loadDatabase(); 

        if (req.body && req.body.secret === 'AHMED_VFCASH_100') {
            const smsText = req.body.message || '';
            if (smsText.includes('تم استلام') && smsText.includes('جنيه')) {
                const amountMatch = smsText.match(/مبلغ\s*([\d\.]+)\s*جنيه/);
                const phoneMatch = smsText.match(/01[0125][0-9]{8}/);

                if (amountMatch && phoneMatch) {
                    const receivedAmount = parseFloat(amountMatch[1]);
                    const senderPhone = phoneMatch[1];
                    const pendingIndex = pendingDeposits.findIndex(p => p.senderNumber === senderPhone && parseFloat(p.amount) === receivedAmount);

                    if (pendingIndex !== -1) {
                        const reqData = pendingDeposits[pendingIndex];
                        const targetUserId = reqData.userId;
                        
                        if(usersDb[targetUserId]) {
                            usersDb[targetUserId].balance += receivedAmount;
                            usersDb[targetUserId].walletHistory.push({ type: 'شحن فودافون كاش (آلي)', amount: receivedAmount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
                            pendingDeposits.splice(pendingIndex, 1);
                            saveDatabase();

                            bot.telegram.sendMessage(targetUserId, `🎉 **تم تأكيد الدفع آلياً بنجاح!**\n💰 تمت إضافة: *${receivedAmount} EGP* لمحفظتك.\n✅ رصيدك الحالي: *${usersDb[targetUserId].balance.toFixed(2)} EGP*\n\nتقدر دلوقتي تشتري أي خدمة من المتجر 🚀`, { parse_mode: 'Markdown' }).catch(()=>{});
                            notifyAdmin(`🤖 <b>تأكيد دفع آلي ناجح! (بدون تدخلك)</b>\n\n👤 المستخدم: <code>${reqData.userUid}</code>\n💰 المبلغ: <b>${receivedAmount} EGP</b>\n📱 من رقم: <code>${senderPhone}</code>\n✅ تمت إضافة الرصيد للعميل بنجاح.`);
                        }
                    }
                }
            }
            safeRes();
            return;
        }

        if (req.body && req.body.update_id) {
            await bot.handleUpdate(req.body);
        }

    } catch (e) {
        console.error('Vercel Handler Error:', e.message);
    } finally {
        clearTimeout(timeoutId);
        
        if (pendingSaves.length > 0) {
            try { await Promise.allSettled(pendingSaves); } catch(e) {}
            pendingSaves = [];
        }
        
        safeRes();
    }
  } else {
    res.status(200).send('Bot is running flawlessly on Vercel with MongoDB! 🚀');
  }
}
