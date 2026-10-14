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
let publicSalesChannel = process.env.PUBLIC_SALES_CHANNEL || ''; 
let forceSubscribeChannel = ''; 

// ==========================================
// 🛡️ إعدادات الاتصال بقاعدة بيانات MongoDB 
// ==========================================
const MONGODB_URI = "mongodb+srv://ahmwogod24920s_db_user:LwAbx06XOKBWel9j@cluster0.sjxm2ga.mongodb.net/xprostore?retryWrites=true&w=majority&appName=Cluster0";
const client = new MongoClient(MONGODB_URI);
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

// 🆕 متغيرات الأنظمة الجديدة والسابقة
let usedReceipts = []; 
let stockAlerts = {}; 
let dropGroupId = ''; 
let ratings = {}; 

let botStates = {
    deposit: {}, broadcast: {}, promo: {}, search: {}, adminInput: {}, adminLogin: {}, adminSession: {}, lastReportDate: "", buyQty: {}, ordersPage: {}, tempStock: {}, adminTempCats: {}, lastAdminCat: {}, lastAdminCatFixed: {}, transfer: {}
};

const userRequestLocks = {};

// 🛡️ دالة التحقق من الأدمن 
function isAdmin(userId) {
    const idStr = String(userId);
    return (usersDb[idStr] && String(usersDb[idStr].uid) === '1001') || botStates.adminSession[idStr];
}

// 🆕 دالة النشر في قناة إثباتات الثقة (بالتنسيق الجديد والزر العميق)
function broadcastSale(serviceName, qty, price, userUid, paymentMethod, srvId, botUsername) {
    if (!publicSalesChannel || publicSalesChannel === '') return;
    try {
        const maskedUid = String(userUid).substring(0, 3) + '****';
        const msg = `🛒 <b>عملية شراء ناجحة وموثقة!</b>\n\n👤 <b>مشتري:</b> <code>${maskedUid}</code>\n📦 <b>المنتج:</b> ${serviceName}\n🔢 <b>الكمية:</b> ${qty}\n💳 <b>طريقة الدفع:</b> ${paymentMethod}\n🪙 <b>القيمة الإجمالية:</b> ${price} EGP\n💳 <b>طريقة الشراء:</b> ${paymentMethod}\n🕒 <b>الوقت:</b> ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}\n\n✨ <b>شكراً لثقتكم في متجرنا!</b>`;
        
        let keyboard = {};
        if (srvId && botUsername) {
            keyboard = Markup.inlineKeyboard([
                [Markup.button.url('🛒 شراء نفس المنتج', `https://t.me/${botUsername}?start=buy_${srvId}`)]
            ]);
        }

        bot.telegram.sendMessage(publicSalesChannel, msg, {parse_mode: 'HTML', ...keyboard}).catch(()=>{});
    } catch(e) {}
}

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
    
    if (Object.keys(usersDb).length > 0) return; 

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
        
        usedReceipts = data.usedReceipts || [];
        stockAlerts = data.stockAlerts || {};
        ratings = data.ratings || {}; 
        if (data.dropGroupId !== undefined) dropGroupId = data.dropGroupId;
        if (data.publicSalesChannel !== undefined) publicSalesChannel = data.publicSalesChannel; 
        if (data.forceSubscribeChannel !== undefined) forceSubscribeChannel = data.forceSubscribeChannel; 
        
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
            ordersPage: loadedStates.ordersPage || {},
            tempStock: loadedStates.tempStock || {},
            adminTempCats: loadedStates.adminTempCats || {},
            lastAdminCat: loadedStates.lastAdminCat || {},
            lastAdminCatFixed: loadedStates.lastAdminCatFixed || {},
            transfer: loadedStates.transfer || {}
        };
    }
}

function saveDatabase() {
    try {
        const data = { usersDb, globalMarkupPercent, customMarkups, pendingDeposits, promoCodes, flashSale, vouchers, adminAuditLogs, maintenanceMode, customProductMarkups, localInventory, botStates, adCampaigns, hiddenServices, fixedPrices, vodafoneCashNumber, usedReceipts, stockAlerts, publicSalesChannel, forceSubscribeChannel, ratings, dropGroupId }; 
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

const categoryCacheTime = 300000; 
let lastCategoriesFetchTime = 0;
let cachedServices = [];
let isFetchingServices = false;

function clearUserStates(userId) {
    try {
        const idStr = String(userId);
        if (botStates.deposit) delete botStates.deposit[idStr];
        if (botStates.promo) delete botStates.promo[idStr];
        if (botStates.search) delete botStates.search[idStr];
        if (botStates.buyQty) delete botStates.buyQty[idStr]; 
        if (botStates.tempStock) delete botStates.tempStock[idStr];
        if (botStates.adminInput) delete botStates.adminInput[idStr]; 
        if (botStates.broadcast) delete botStates.broadcast[idStr];
        if (botStates.adminTempCats) delete botStates.adminTempCats[idStr];
        if (botStates.lastAdminCat) delete botStates.lastAdminCat[idStr];
        if (botStates.lastAdminCatFixed) delete botStates.lastAdminCatFixed[idStr];
        if (botStates.transfer) delete botStates.transfer[idStr];
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

setInterval(() => {
    try {
        if (!ADMIN_CHANNEL_ID || ADMIN_CHANNEL_ID === '') return;
        const dbDump = JSON.stringify({ usersDb, globalMarkupPercent, customMarkups, pendingDeposits, promoCodes, flashSale, vouchers, adminAuditLogs, customProductMarkups, localInventory, botStates, adCampaigns, hiddenServices, fixedPrices, vodafoneCashNumber, usedReceipts, stockAlerts, publicSalesChannel, forceSubscribeChannel, ratings, dropGroupId }, null, 2); 
        const buffer = Buffer.from(dbDump, 'utf-8');
        bot.telegram.sendDocument(ADMIN_CHANNEL_ID, { source: buffer, filename: `XProStore_Backup_${new Date().toISOString().split('T')[0]}.json` }, { caption: `📦 نسخة احتياطية تلقائية لقاعدة البيانات\n📅 التاريخ: ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}` }).catch(()=>{});
    } catch (e) { console.error("Backup Error:", e); }
}, 24 * 60 * 60 * 1000);

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

const apiClient1 = axios.create({ baseURL: 'https://xprostore.store/api/v1', headers: { 'Authorization': 'Bearer ' + process.env.PROVIDER_API_KEY, 'Content-Type': 'application/json' }, timeout: 4500 });
const apiClient2 = axios.create({ baseURL: 'https://zfourstore.up.railway.app/api/v1', headers: { 'X-API-Key': process.env.PROVIDER2_API_KEY, 'Content-Type': 'application/json' }, timeout: 4500 });
const API_KEY_3 = process.env.PROVIDER3_API_KEY || 'dh_live_51fc2511f39790176ec4d956a92c10492a22858859ae0a79';
const apiClient3 = axios.create({ baseURL: 'https://dantehub.shop/api/public/v1', headers: { 'Authorization': 'Bearer ' + API_KEY_3, 'Content-Type': 'application/json' }, timeout: 4500 });

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

function getServiceCategory(s) {
  try {
    let cat = s.category_name || s.category_ar || s.category_title || (typeof s.category === 'object' ? (s.category?.name || s.category?.name_ar || s.category?.title) : s.category);
    if (cat) {
       let smartCat = detectCategoryFromName(cat) !== 'أخرى' ? detectCategoryFromName(cat) : detectCategoryFromName(s.name || s.title || '');
       if (smartCat !== 'أخرى') return smartCat;
       return String(cat).trim();
    }
    return 'أخرى';
  } catch(e) { return 'أخرى'; }
}

function detectServiceEmoji(name) {
    const n = name.toLowerCase();
    if(n.includes('apple') || n.includes('mac')) return '🎵';
    if(n.includes('video') || n.includes('netflix') || n.includes('youtube') || n.includes('prime')) return '▶️';
    if(n.includes('vpn') || n.includes('nord') || n.includes('proton') || n.includes('express')) return '🔒';
    if(n.includes('ai') || n.includes('gpt') || n.includes('bot') || n.includes('claude') || n.includes('gemini')) return '❇️';
    if(n.includes('pdf') || n.includes('doc') || n.includes('notion') || n.includes('manus')) return '📓';
    if(n.includes('cloud') || n.includes('drive') || n.includes('icloud')) return '☁️';
    if(n.includes('edu') || n.includes('learn') || n.includes('course') || n.includes('duolingo') || n.includes('coursera')) return '🎓';
    if(n.includes('game') || n.includes('play')) return '🎮';
    if(n.includes('code') || n.includes('api') || n.includes('dev') || n.includes('cursor') || n.includes('replit')) return '🖱️';
    if(n.includes('design') || n.includes('art') || n.includes('draw') || n.includes('figma') || n.includes('canva') || n.includes('adobe')) return '🎨';
    if(n.includes('voice') || n.includes('audio') || n.includes('eleven')) return '🎙️';
    if(n.includes('sim') || n.includes('mobile')) return '📱';
    if(n.includes('mail') || n.includes('email')) return '📧';
    if(n.includes('zoom') || n.includes('meeting')) return '📹';
    return '🔹'; 
}

async function fetchAllServices() {
    let services = [];
    const [res1Result, res2Result, res3Result] = await Promise.allSettled([
        apiClient1.get('/services?limit=1000'),
        apiClient2.get('/products'),
        apiClient3.get('/services?limit=1000') 
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

    let danteData = null;
    if (res3Result.status === 'fulfilled') {
        danteData = res3Result.value.data;
    } else {
        try { 
            const fallback = await apiClient3.get('/products?limit=1000'); 
            danteData = fallback.data; 
        } catch(e) {}
    }

    if (danteData) {
        try {
            let s3 = danteData.data || danteData.services || danteData.products || danteData;
            if (!Array.isArray(s3) && typeof s3 === 'object') {
                for (let key in s3) { if (Array.isArray(s3[key])) { s3 = s3[key]; break; } }
            }
            if (Array.isArray(s3)) {
                s3.forEach(item => { 
                    item.providerSource = 'api3'; 
                    item.name = item.name || item.name_ar || item.title || "خدمة بدون اسم";
                    item.id = String(item.id || item.service_id || item.product_id || item.uuid || item.code || generateStableId(item.name));
                    item.category = detectCategoryFromName(item.name) !== 'أخرى' ? detectCategoryFromName(item.name) : (item.category || item.category_name || 'أخرى');
                    let rawPriceUSD = parseFloat(item.price || item.rate || item.price_amount || 0);
                    
                    if (rawPriceUSD < 10) { 
                        let egpPrice = (rawPriceUSD * USD_TO_EGP_RATE).toFixed(2);
                        item.price = egpPrice;
                        item.price_amount = egpPrice;
                    }
                });
                services.push(...s3);
            }
        } catch(e) {}
    }

    return services;
}

async function backgroundServiceUpdate() {
    if (isFetchingServices) return;
    isFetchingServices = true;
    try {
        const services = await fetchAllServices();
        if (services && services.length > 0) {
            cachedServices = services;
            lastCategoriesFetchTime = Date.now();
        }
    } catch (e) {
        console.error(e);
    } finally {
        isFetchingServices = false;
    }
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
    } else if (source === 'api3') {
         return await apiClient3.post('/orders', { 
             service_id: srvIdConverted, 
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
    'ChatGPT', 'Netflix', 'YouTube', 'Spotify', 'Canva', 'CapCut', 'Microsoft', 
    'Gemini', 'Claude', 'Adobe', 'Grammarly', 'Duolingo', 'Zoom', 'Gmail', 'iCloud', 
    'ExpressVPN', 'NordVPN', 'Apple Music', 'Notion', 'iLovePDF', 'Coursera', 'Prime Video', 'Crunchyroll', 
    'Perplexity', 'eSIM', 'ElevenLabs', 'Leonardo', 'Figma', 'QuillBot', 'Proton', 'Cursor', 'Grok', 'Replit', 
    'JetBrains', 'Autodesk', 'Avira', 'HMA VPN', 
    'Gamma', 'Bolt', 'Framer', 'Kling', 'Miro', 'Lovable', 'n8n', 'Railway', 'Higgsfield', 'Wispr Flow', 'Manus', 
    'API Services', 'أخرى'
];

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

// 🛒 القائمة الرئيسية 
function getMainMenu() {
  let keyboard = [
    ['🛍 الخدمات', '🔍 بحث عن خدمة'],
    ['🛒 طلباتي', '📜 سجل المحفظة'],
    ['💰 حسابي', '💸 تحويل رصيد'],
    ['💳 شحن المحفظة (فودافون كاش)', '🎟 استخدام كود خصم'],
    ['🔗 دعوة الأصدقاء (اربح 2%)', '📞 الدعم الفني']
  ];
  return Markup.keyboard(keyboard).resize();
}

bot.use(async (ctx, next) => {
    checkAndSendDailyReport(); 
    
    const userId = ctx.from?.id;
    if (userId && forceSubscribeChannel && !isAdmin(userId)) {
        if (ctx.callbackQuery && ctx.callbackQuery.data === 'check_sub') {
            return next(); 
        }
        
        try {
            const member = await ctx.telegram.getChatMember(forceSubscribeChannel, userId);
            if (!['member', 'administrator', 'creator'].includes(member.status)) {
                const subMsg = '⚠️ <b>عذراً، يجب عليك الاشتراك في قناة البوت أولاً لتتمكن من استخدامه.</b>\n\nاشترك الآن ثم اضغط على "تحقق من الاشتراك ✅"';
                const channelUrl = `https://t.me/${forceSubscribeChannel.replace('@', '')}`;
                const keyboard = Markup.inlineKeyboard([
                    [Markup.button.url('⚙️ تعليمات بوت طلباتكم | تحديثات ↗️', channelUrl), Markup.button.callback('غير مشترك ❌', 'noop')],
                    [Markup.button.callback('تحقق من الاشتراك ✅', 'check_sub')]
                ]);
                
                if (ctx.callbackQuery) {
                    return ctx.editMessageText(subMsg, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
                } else {
                    return ctx.reply(subMsg, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
                }
            }
        } catch (e) {
            console.log("Force sub check error: ", e.message);
        }
    }
    
    return next();
});

// 🆕 دالة الشراء المشتركة (تستخدم من الأزرار ومن الروابط العميقة)
async function processBuyAction(ctx, userId, srvId) {
     initUser(userId); // 🛡️ تأمين قراءة بيانات العميل
     if (usersDb[userId].isBanned) return;
     
     if (cachedServices.length === 0) {
         if (ctx.callbackQuery) await ctx.editMessageText('⏳ لحظات جاري تجهيز الخدمة...').catch(()=>{});
         else await ctx.reply('⏳ لحظات جاري تجهيز الخدمة...').catch(()=>{});
         await backgroundServiceUpdate();
     }

     const srv = cachedServices.find(s => String(s.id) === String(srvId));
     if(!srv) {
         if (ctx.callbackQuery) return ctx.editMessageText('❌ الخدمة غير موجودة.').catch(()=>{});
         else return ctx.reply('❌ الخدمة غير موجودة.').catch(()=>{});
     }

     const price = calculateRetailPrice(srv, usersDb[userId], 1);
     const srvName = srv.name_ar || srv.name || srv.title;

     abandonedCarts[userId] = { time: Date.now(), srvName: srvName }; 
     saveDatabase();

     const txt = `⚠️ <b>إدخال الكمية المطلوبة:</b>\n\n🛍 <b>الخدمة:</b> ${srvName.replace(/</g, '&lt;').replace(/>/g, '&gt;')}\n💰 السعر للقطعة: <b>${price} EGP</b>\n\n✍️ <b>من فضلك، أرسل الكمية المطلوبة الآن في رسالة (أرقام فقط):</b>`;
     const keyboard = Markup.inlineKeyboard([[Markup.button.callback('❌ إلغاء العملية', 'cancel_action')]]);
     
     let msg;
     if (ctx.callbackQuery) {
         msg = await ctx.editMessageText(txt, {parse_mode: 'HTML', ...keyboard}).catch(e => { if (!e.message.includes('not modified')) console.error(e); });
     } else {
         msg = await ctx.reply(txt, {parse_mode: 'HTML', ...keyboard}).catch(()=>{});
     }

     if (msg) {
         botStates.buyQty[userId] = { srvId: String(srv.id), msgId: msg.message_id };
         saveDatabase();
     }
}

// 🛡️ تم التعديل لتكون async لمنع السيرفر من الإنغلاق
bot.start(async (ctx) => {
  try {
    const userId = String(ctx.from.id); 
    initUser(userId); 
    clearUserStates(userId);

    if (usersDb[userId].isBanned) return ctx.reply('❌ عذراً، تم حظرك من استخدام هذا البوت.').catch(()=>{});
    if (maintenanceMode && String(usersDb[userId].uid) !== '1001') return ctx.reply('🛠 **المتجر في حالة صيانة حالياً**\nنعمل على تحديث الخدمات، عودوا قريباً جداً!', { parse_mode: 'Markdown' }).catch(()=>{});

    let payload = null;
    if (ctx.message && ctx.message.text) {
        const parts = ctx.message.text.split(' ');
        if (parts.length > 1) payload = parts[1];
    }

    if (payload) {
        // 🆕 استقبال الرابط العميق وبدء الشراء فوراً (تم حل التعليقة هنا)
        if (payload.startsWith('buy_')) {
            const srvId = payload.split('buy_')[1];
            await processBuyAction(ctx, userId, srvId); // 🛡️ تم إضافة await لمنع Crash
            return; // 🛡️ يمنع إظهار رسالة الترحيب العادية لكي تظهر الخدمة فقط
        }

        if (payload.startsWith('ref_') && !usersDb[userId].referredBy && !usersDb[userId].source) {
            const referrerUid = payload.split('_')[1];
            const referrer = getUserByUid(referrerUid);
            if (referrer && String(referrerUid) !== String(usersDb[userId].uid)) {
                usersDb[userId].referredBy = referrer.telegramId; 
                referrer.user.referrals += 1;
                saveDatabase();
                bot.telegram.sendMessage(referrer.telegramId, `🔔 قام صديق بالتسجيل عبر رابط الدعوة الخاص بك! ستكسب **2%** من كل عملية شحن يقوم بها.`).catch(()=>{});
            }
        } else if (payload.startsWith('ad_') && !usersDb[userId].source) {
            adCampaigns[payload] = (adCampaigns[payload] || 0) + 1;
            usersDb[userId].source = payload;
            saveDatabase();
        }
    }

    ctx.reply('أهلاً بك في متجر الخدمات الرقمية! 🚀\n🆔 رقم الحساب الفريد الخاص بك: `' + usersDb[userId].uid + '`', { parse_mode: 'Markdown', ...getMainMenu() }).catch(()=>{});
  } catch (err) {
      console.error(err);
  }
});

bot.action('check_sub', async (ctx) => {
    const userId = String(ctx.from.id); initUser(userId);
    if (!forceSubscribeChannel) {
        ctx.deleteMessage().catch(()=>{});
        return ctx.reply('أهلاً بك مجدداً في متجر الخدمات الرقمية! 🚀\n🆔 رقم الحساب الفريد الخاص بك: `' + usersDb[userId].uid + '`', { parse_mode: 'Markdown', ...getMainMenu() }).catch(()=>{});
    }
    try {
        const member = await ctx.telegram.getChatMember(forceSubscribeChannel, userId);
        if (['member', 'administrator', 'creator'].includes(member.status)) {
            await ctx.answerCbQuery('✅ شكراً لاشتراكك! يمكنك الآن استخدام البوت.', {show_alert: true}).catch(()=>{});
            ctx.deleteMessage().catch(()=>{});
            ctx.reply('أهلاً بك مجدداً في المتجر! 🚀\n🆔 رقم الحساب الفريد الخاص بك: `' + usersDb[userId].uid + '`', { parse_mode: 'Markdown', ...getMainMenu() }).catch(()=>{});
        } else {
            ctx.answerCbQuery('❌ عذراً، لم تقم بالاشتراك في القناة بعد!', { show_alert: true }).catch(()=>{});
        }
    } catch (e) {
        ctx.answerCbQuery('❌ حدث خطأ، تأكد أن البوت مرفوع كأدمن في القناة.').catch(()=>{});
    }
});

function calculateRetailPrice(service, user, quantity = 1) {
  try {
    const srvIdStr = String(service.id);
    
    if (fixedPrices && fixedPrices[srvIdStr] !== undefined) {
        let fp = parseFloat(fixedPrices[srvIdStr]);
        if (flashSale && flashSale.active && Date.now() < flashSale.expiresAt) {
            fp = fp - (fp * (flashSale.discount / 100));
        }
        return (fp * quantity).toFixed(2);
    }

    const originalPrice = parseFloat(service.price_amount || service.price || 0);
    const cat = getServiceCategory(service);

    let markup = parseFloat(globalMarkupPercent) || 0;
    if (customMarkups && customMarkups[cat] !== undefined) { markup = parseFloat(customMarkups[cat]); }

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

// 🆕 الدوال الخاصة بالأوامر والمنيو (لتشغيل القائمة الجانبية)
function showProfile(ctx) {
    const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
    const user = usersDb[userId];
    if (user.isBanned) return ctx.reply('❌ تم حظرك.').catch(()=>{});
    const vipTag = user.isVip ? '👑 (VIP)' : '👤 (عادي)';
    ctx.reply('👤 **حسابي الشخصي:**\n\n🆔 رقم الحساب: `' + user.uid + '`\n🔰 مستوى الحساب: ' + vipTag + '\n💳 الرصيد الحالي: *' + parseFloat(user.balance).toFixed(2) + ' EGP*\n🛍 إجمالي المشتريات: ' + user.totalSpent.toFixed(2) + ' EGP', { parse_mode: 'Markdown' }).catch(()=>{});
}

function showDepositFlow(ctx) {
    const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
    if (usersDb[userId].isBanned) return;
    const hasPending = pendingDeposits.some(p => p.userId === userId);
    if(hasPending) return ctx.reply('❌ **لا يمكنك تقديم طلب شحن جديد!**\nلديك بالفعل طلب شحن قيد المراجعة.', {parse_mode: 'Markdown'}).catch(()=>{});
    botStates.deposit[userId] = { step: 'WAIT_AMOUNT' }; saveDatabase();
    ctx.reply('💳 **شحن المحفظة (فودافون كاش)**\n\nمن فضلك أكتب **المبلغ** اللي هتحوله بالجنيه المصري (مثال: 100):').catch(()=>{});
}

function showOrdersMain(ctx) {
    const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
    if (usersDb[userId].isBanned) return;
    const orders = usersDb[userId].orders || [];
    if (orders.length === 0) return ctx.reply('🛒 لم تقم بأي عمليات شراء حتى الآن.').catch(()=>{});
    const { text, keyboard } = getOrdersPage(userId, 1);
    ctx.reply(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
}

function showSupport(ctx) {
    const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
    if (usersDb[userId].isBanned) return;
    ctx.reply('📞 **تواصل مع الدعم الفني مباشرة:**\n\n✈️ تليجرام: @Ahmed_3mk_0\n📱 واتساب: [اضغط هنا للمحادثة](https://wa.me/201282110755)', { parse_mode: 'Markdown', disable_web_page_preview: true }).catch(()=>{});
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

bot.hears(/تحويل رصيد/, (ctx) => {
    try {
        const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
        if (usersDb[userId].isBanned) return;
        botStates.transfer[userId] = { step: 'WAIT_UID' }; saveDatabase();
        ctx.reply('💸 **تحويل رصيد لصديق:**\n\nيرجى إرسال الـ **ID** (رقم الحساب الفريد) للشخص الذي تريد التحويل إليه:').catch(()=>{});
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

async function showCategories(ctx) {
  const userId = String(ctx.from.id);
  try {
    initUser(userId); clearUserStates(userId);

    if (usersDb[userId].isBanned) return ctx.reply('❌ عذراً، تم حظرك من استخدام هذا البوت.').catch(()=>{});
    if (maintenanceMode && String(usersDb[userId].uid) !== '1001') return ctx.reply('🛠 **المتجر في حالة صيانة حالياً**\nنعمل على تحديث الخدمات، عودوا قريباً جداً!', { parse_mode: 'Markdown' }).catch(()=>{});

    if (cachedServices.length === 0) {
        let loadingMsgId;
        if(ctx.callbackQuery) {
            await ctx.editMessageText('⏳ جاري ربط السيرفرات السريعة...').catch(()=>{});
        } else {
            const msg = await ctx.reply('⏳ جاري ربط السيرفرات السريعة...').catch(()=>{});
            if(msg) loadingMsgId = msg.message_id;
        }
        await backgroundServiceUpdate();
    } else if (Date.now() - lastCategoriesFetchTime > categoryCacheTime) {
        backgroundServiceUpdate();
    }

    if (cachedServices.length === 0) {
        const errorMsg = '⚠️ تعذر جلب الخدمات حالياً، يرجى المحاولة بعد قليل.';
        const retryKeyboard = Markup.inlineKeyboard([[Markup.button.callback('🔄 إعادة المحاولة', 'main_categories')]]);
        if(ctx.callbackQuery) return ctx.editMessageText(errorMsg, retryKeyboard).catch(()=>{});
        else return ctx.reply(errorMsg, retryKeyboard).catch(()=>{});
    }

    let fetchedCategories = [];
    cachedServices.forEach(s => {
      if (hiddenServices && hiddenServices.includes(String(s.id))) return;
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
    } else {
        return ctx.reply('اختر الفئة:', keyboard).catch(()=>{});
    }

  } catch (error) {
    console.error("showCategories Error:", error);
    const errMsg = '❌ حدث خطأ مؤقت أثناء جلب الأقسام، يرجى المحاولة مجدداً.';
    const retryBtn = Markup.inlineKeyboard([[Markup.button.callback('🔄 إعادة المحاولة', 'main_categories')]]);
    if(ctx.callbackQuery) {
        ctx.editMessageText(errMsg, retryBtn).catch(()=>{});
    } else {
        ctx.reply(errMsg, retryBtn).catch(()=>{});
    }
  }
}

// 🆕 ربط المنيو الجانبية (Commands) بالدوال
bot.command('products', showCategories);
bot.command('wallet', showDepositFlow);
bot.command('profile', showProfile);
bot.command('history', showOrdersMain);
bot.command('support', showSupport);

// ربط أزرار الكيبورد العادية بنفس الدوال
bot.hears(/حسابي/, showProfile);
bot.hears(/شحن المحفظة/, showDepositFlow);
bot.hears(/طلباتي/, showOrdersMain);
bot.hears(/الدعم الفني/, showSupport);
bot.hears(/الخدمات/, showCategories);

bot.action('main_categories', (ctx) => {
    ctx.answerCbQuery().catch(()=>{}); 
    showCategories(ctx);
});

bot.action('main_menu', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
      const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
      if (usersDb[userId].isBanned) return;
      ctx.deleteMessage().catch(()=>{}); 
      ctx.reply('القائمة الرئيسية 🚀', getMainMenu()).catch(()=>{});
    } catch(e){}
});

function showAdminPanel(ctx) {
  try {
    const userIdStr = String(ctx.from ? ctx.from.id : (ctx.chat ? ctx.chat.id : ""));
    if (!isAdmin(userIdStr)) return;

    if (botStates.adminInput) delete botStates.adminInput[userIdStr];
    if (botStates.broadcast) delete botStates.broadcast[userIdStr];
    if (botStates.tempStock) delete botStates.tempStock[userIdStr];
    if (botStates.adminTempCats) delete botStates.adminTempCats[userIdStr];
    if (botStates.lastAdminCat) delete botStates.lastAdminCat[userIdStr];
    if (botStates.lastAdminCatFixed) delete botStates.lastAdminCatFixed[userIdStr];
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
                 `📢 قناة المبيعات: <code>${publicSalesChannel || 'غير محددة'}</code>\n` +
                 `🔒 الاشتراك الإجباري: <code>${forceSubscribeChannel || 'غير مفعل'}</code>`;

    const keyboard = Markup.inlineKeyboard([
        [Markup.button.callback('📉 إعلان انخفاض سعر (دروب)', 'admin_price_drop')],
        [Markup.button.callback('🔔 فحص وإرسال تذكيرات التجديد', 'admin_scan_renewals')],
        [Markup.button.callback('🎁 إرسال كود دروب', 'admin_send_drop'), Markup.button.callback('⚙️ جروب الدروب', 'admin_set_drop_group')],
        
        [Markup.button.callback('🔄 تحديث وسحب الخدمات يدوياً', 'admin_force_refresh')],
        [Markup.button.callback('📱 تغيير رقم الاستقبال', 'admin_change_wallet'), Markup.button.callback('📢 تعيين قناة المبيعات', 'admin_set_sales_channel')],
        [Markup.button.callback('🔒 ضبط الاشتراك الإجباري', 'admin_set_force_sub'), Markup.button.callback('💳 طلبات الشحن (' + (pendingDeposits ? pendingDeposits.length : 0) + ')', 'admin_pending_deposits')],
        [Markup.button.callback('💰 فحص رصيد المزود', 'admin_check_api_balance'), Markup.button.callback('🟢 فحص حالة المزود (API)', 'admin_check_api_status')],
        [Markup.button.callback('🎯 نسبة ربح لمنتج', 'admin_search_markup'), Markup.button.callback('📦 مخزن المنتجات المحلي', 'admin_search_stock')],
        [Markup.button.callback('💲 تحديد سعر ثابت لمنتج', 'admin_fixed_price'), Markup.button.callback('👁️ إخفاء/إظهار منتج', 'admin_hide_cats')],
        [Markup.button.callback('📊 تعديل النسبة العامة', 'admin_set_global_markup'), Markup.button.callback('🎯 تعديل نسبة قسم', 'admin_set_custom_markup')],
        [Markup.button.callback('⚡ خصم مؤقت (Flash Sale)', 'admin_flash_sale'), Markup.button.callback('🎫 توليد كروت شحن', 'admin_create_promo')],
        [Markup.button.callback('✉ مراسلة عميل بالـ ID', 'admin_msg_by_id'), Markup.button.callback('👥 شحن رصيد بالـ ID', 'admin_charge_by_id')], 
        [Markup.button.callback('🛠️ تبديل وضع الصيانة', 'admin_toggle_maintenance'), Markup.button.callback('📝 سجل نشاط الأدمن', 'admin_view_logs')],
        [Markup.button.callback('📂 عرض حسابات العملاء', 'admin_view_users'), Markup.button.callback('💸 تقرير الأرباح', 'admin_profit_report')],
        [Markup.button.callback('🚫 حظر مستخدم', 'admin_ban_user'), Markup.button.callback('✅ فك حظر مستخدم', 'admin_unban_user')],
        [Markup.button.callback('📢 إرسال رسالة (إذاعة)', 'admin_broadcast'), Markup.button.callback('📈 إحصائيات الإعلانات', 'admin_ad_stats')],
        [Markup.button.callback('🚪 تسجيل خروج', 'admin_logout')]
      ]);

    if(ctx.callbackQuery) { ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{}); }
    else { ctx.reply(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{}); }
  } catch(e){}
}

bot.action(/^admin_/, (ctx, next) => {
    if(!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ غير مصرح لك', {show_alert: true});
    return next();
});
bot.action(/^approve_dep_|^reject_dep_/, (ctx, next) => {
    if(!isAdmin(ctx.from.id)) return ctx.answerCbQuery('❌ غير مصرح لك', {show_alert: true});
    return next();
});

// 🆕 وظيفة إعلان انخفاض السعر
bot.action('admin_price_drop', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_PD_SEARCH'; saveDatabase();
    ctx.editMessageText('📉 **إعلان انخفاض سعر (Price Drop):**\n\nأرسل اسم المنتج الذي تريد تخفيض سعره ونشره في القناة للبحث عنه:', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action(/^pdsel_(.+)$/, (ctx) => {
    const srvId = ctx.match[1];
    botStates.adminInput[ctx.from.id] = `WAIT_PD_PRICE_${srvId}`; saveDatabase();
    ctx.editMessageText('💰 أرسل السعر الجديد للمنتج بالجنيه المصري (سيتم حسابه وتحديثه كـ سعر ثابت تلقائياً):', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));
});

bot.action('admin_set_drop_group', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_DROP_GROUP'; saveDatabase();
    ctx.editMessageText(`⚙️ **تحديد جروب الدروبات:**\n\nالجروب الحالي: \`${dropGroupId || 'غير محدد'}\`\n\nأرسل ID الجروب العام الخاص بك (يجب أن يبدأ بـ -100):`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_send_drop', (ctx) => {
    if (!dropGroupId) return ctx.answerCbQuery('❌ يرجى تحديد ID الجروب أولاً من (جروب الدروب)!', {show_alert: true}).catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_DROP_AMOUNT'; saveDatabase();
    ctx.editMessageText('🎁 **إرسال دروب سريع للجروب:**\n\nأرسل الآن المبلغ المراد توزيعه كهدية لأسرع عميل بالجنيه المصري (مثال: `50`):', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_scan_renewals', async (ctx) => {
    ctx.answerCbQuery('⏳ جاري فحص جميع الطلبات...').catch(()=>{});
    let sentCount = 0;
    const now = Date.now();
    const twentySevenDays = 27 * 24 * 60 * 60 * 1000;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    
    for (let uid in usersDb) {
        let user = usersDb[uid];
        if (!user.orders) continue;
        for (let i = 0; i < user.orders.length; i++) {
            let order = user.orders[i];
            if (order.timestamp && !order.reminded) {
                const diff = now - order.timestamp;
                if (diff >= twentySevenDays && diff < thirtyDays) {
                    order.reminded = true;
                    const safeName = order.name.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    bot.telegram.sendMessage(uid, `⚠️ **تذكير تجديد اشتراك!**\n\nمرحباً، اشتراكك في الخدمة: **${safeName}** يوشك على الانتهاء.\n\nاضغط على الزر بالأسفل لتجديده الآن بضغطة واحدة وتجنب الانقطاع! 🚀`, {
                        parse_mode: 'Markdown',
                        ...Markup.inlineKeyboard([[Markup.button.callback('🛒 تجديد الاشتراك الفوري', `buyact_${order.srvId}`)]])
                    }).catch(()=>{});
                    sentCount++;
                }
            }
        }
    }
    saveDatabase();
    ctx.editMessageText(`✅ **تم الانتهاء من الفحص!**\n\nتم إرسال إشعارات التجديد التلقائية إلى **${sentCount}** عميل بنجاح.`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_change_wallet', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_NEW_WALLET'; saveDatabase();
    ctx.editMessageText('📱 **تغيير رقم الاستقبال:**\n\nأرسل الرقم الجديد لمحفظة فودافون كاش الخاص بك:', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_set_sales_channel', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_SALES_CHANNEL'; saveDatabase();
    ctx.editMessageText('📢 **تعيين قناة المبيعات الحية:**\n\nأرسل معرف القناة (ID)، يجب أن يبدأ بـ `-100` (مثال: `-1001234567890`)\n\n🛑 لإيقاف النشر الآلي تماماً أرسل كلمة: `إيقاف`', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_set_force_sub', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_FORCE_SUB'; saveDatabase();
    ctx.editMessageText('🔒 **إعداد الاشتراك الإجباري:**\n\nأرسل مُعرف القناة (يوزرنيم القناة) ويجب أن يبدأ بـ `@` (مثال: `@XProStore`)\n\n⚠️ **تنبيه هام:** يجب إضافة البوت كـ(مشرف/Admin) في هذه القناة ليتمكن من فحص المشتركين.\n\n🛑 لإلغاء نظام الاشتراك الإجباري تماماً، أرسل كلمة: `إيقاف`', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_force_refresh', async (ctx) => {
    ctx.answerCbQuery('⏳ جاري سحب أحدث الخدمات بالقوة من المزودين...').catch(()=>{});
    try {
        isFetchingServices = false;
        await backgroundServiceUpdate();
        ctx.reply('✅ **تم بنجاح!**\nتم سحب وتحديث جميع الخدمات من المزودين في ذاكرة البوت.', { parse_mode: 'Markdown' }).catch(()=>{});
    } catch (e) {
        ctx.reply('❌ حدث خطأ أثناء التحديث اليدوي. حاول مجدداً.').catch(()=>{});
    }
});

bot.action('admin_hide_cats', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        const userId = String(ctx.from.id);
        if (cachedServices.length === 0) await backgroundServiceUpdate();

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

        if (!botStates.adminTempCats) botStates.adminTempCats = {};
        botStates.adminTempCats[userId] = categories;
        saveDatabase();

        let buttons = [];
        for (let i = 0; i < categories.length; i += 2) {
            const row = [];
            row.push(Markup.button.callback('📁 ' + categories[i], 'admin_hcat_' + i));
            if (i + 1 < categories.length) row.push(Markup.button.callback('📁 ' + categories[i+1], 'admin_hcat_' + (i + 1)));
            buttons.push(row);
        }
        buttons.push([Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]);

        ctx.editMessageText('👁️ <b>إدارة إخفاء وإظهار المنتجات:</b>\nاختر القسم الذي تريد تعديل خدماته:', { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
    } catch (e) {}
});

bot.action(/^admin_hcat_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        const userId = String(ctx.from.id);
        const catIndex = parseInt(ctx.match[1]);
        
        if (!botStates.adminTempCats || !botStates.adminTempCats[userId]) return ctx.editMessageText('❌ انتهت الجلسة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_hide_cats')]])).catch(()=>{});
        
        const selectedCategory = botStates.adminTempCats[userId][catIndex];
        if (!botStates.lastAdminCat) botStates.lastAdminCat = {};
        botStates.lastAdminCat[userId] = catIndex; 
        saveDatabase();

        if (cachedServices.length === 0) await backgroundServiceUpdate();

        const categoryServices = cachedServices.filter(s => {
            let cat = getServiceCategory(s);
            return cat === selectedCategory || cat.toLowerCase().includes(selectedCategory.toLowerCase()) || selectedCategory.toLowerCase().includes(cat.toLowerCase());
        });

        if (categoryServices.length === 0) return ctx.editMessageText('لا توجد خدمات حالياً في هذا القسم.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للأقسام', 'admin_hide_cats')]])).catch(()=>{});

        let buttons = categoryServices.map(srv => {
            const isHidden = hiddenServices.includes(String(srv.id));
            const prefix = isHidden ? '🔴 مخفي: ' : '🟢 ظاهر: ';
            let btnText = prefix + (srv.name_ar || srv.name || srv.title);
            if (btnText.length > 40) btnText = btnText.substring(0, 38) + '..'; 
            return [Markup.button.callback(btnText, `thide_${srv.id}`)];
        });
        buttons.push([Markup.button.callback('🔙 رجوع لأقسام الإخفاء', 'admin_hide_cats')]);

        ctx.editMessageText(`👁️ خدمات قسم <b>${selectedCategory}</b>:\n\nاضغط على أي خدمة لتغيير حالتها (ظاهر/مخفي):`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
    } catch(e) {}
});

bot.action(/^thide_(.+)$/, async (ctx) => {
    ctx.answerCbQuery('⏳ جاري تغيير حالة المنتج...').catch(()=>{});
    try {
        const userId = String(ctx.from.id);
        const srvId = ctx.match[1];
        
        if (hiddenServices.includes(srvId)) {
            hiddenServices = hiddenServices.filter(id => id !== srvId); 
        } else {
            hiddenServices.push(srvId); 
        }
        saveDatabase();

        const catIndex = botStates.lastAdminCat ? botStates.lastAdminCat[userId] : null;
        if (catIndex !== undefined && catIndex !== null && botStates.adminTempCats && botStates.adminTempCats[userId]) {
            const selectedCategory = botStates.adminTempCats[userId][catIndex];
            const categoryServices = cachedServices.filter(s => {
                let cat = getServiceCategory(s);
                return cat === selectedCategory || cat.toLowerCase().includes(selectedCategory.toLowerCase()) || selectedCategory.toLowerCase().includes(cat.toLowerCase());
            });

            let buttons = categoryServices.map(srv => {
                const isHidden = hiddenServices.includes(String(srv.id));
                const prefix = isHidden ? '🔴 مخفي: ' : '🟢 ظاهر: ';
                let btnText = prefix + (srv.name_ar || srv.name || srv.title);
                if (btnText.length > 40) btnText = btnText.substring(0, 38) + '..';
                return [Markup.button.callback(btnText, `thide_${srv.id}`)];
            });
            buttons.push([Markup.button.callback('🔙 رجوع لأقسام الإخفاء', 'admin_hide_cats')]);

            ctx.editMessageText(`👁️ خدمات قسم <b>${selectedCategory}</b>:\n\nاضغط على أي خدمة لتغيير حالتها (ظاهر/مخفي):`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
        }
    } catch(e) {}
});

bot.action('admin_fixed_price', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        const userId = String(ctx.from.id);
        if (cachedServices.length === 0) await backgroundServiceUpdate();

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

        if (!botStates.adminTempCats) botStates.adminTempCats = {};
        botStates.adminTempCats[userId] = categories;
        saveDatabase();

        let buttons = [];
        for (let i = 0; i < categories.length; i += 2) {
            const row = [];
            row.push(Markup.button.callback('📁 ' + categories[i], 'admin_fcat_' + i));
            if (i + 1 < categories.length) row.push(Markup.button.callback('📁 ' + categories[i+1], 'admin_fcat_' + (i + 1)));
            buttons.push(row);
        }
        buttons.push([Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]);

        ctx.editMessageText('💲 <b>إدارة الأسعار الثابتة:</b>\nاختر القسم الذي تريد تعديل أسعار خدماته:', { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
    } catch (e) {}
});

bot.action(/^admin_fcat_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        const userId = String(ctx.from.id);
        const catIndex = parseInt(ctx.match[1]);
        
        if (!botStates.adminTempCats || !botStates.adminTempCats[userId]) return ctx.editMessageText('❌ انتهت الجلسة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_fixed_price')]])).catch(()=>{});
        
        const selectedCategory = botStates.adminTempCats[userId][catIndex];
        if (!botStates.lastAdminCatFixed) botStates.lastAdminCatFixed = {};
        botStates.lastAdminCatFixed[userId] = catIndex; 
        saveDatabase();

        if (cachedServices.length === 0) await backgroundServiceUpdate();

        const categoryServices = cachedServices.filter(s => {
            let cat = getServiceCategory(s);
            return cat === selectedCategory || cat.toLowerCase().includes(selectedCategory.toLowerCase()) || selectedCategory.toLowerCase().includes(cat.toLowerCase());
        });

        if (categoryServices.length === 0) return ctx.editMessageText('لا توجد خدمات حالياً في هذا القسم.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للأقسام', 'admin_fixed_price')]])).catch(()=>{});

        let buttons = categoryServices.map(srv => {
            const fp = fixedPrices[String(srv.id)];
            const prefix = fp ? `[${fp}ج] ` : '⏳ ';
            let btnText = prefix + (srv.name_ar || srv.name || srv.title);
            if (btnText.length > 40) btnText = btnText.substring(0, 38) + '..'; 
            return [Markup.button.callback(btnText, `setfixed_${srv.id}`)];
        });
        buttons.push([Markup.button.callback('🔙 رجوع لأقسام الأسعار', 'admin_fixed_price')]);

        ctx.editMessageText(`💲 خدمات قسم <b>${selectedCategory}</b>:\n\nاضغط على أي خدمة لتحديد سعر ثابت لها (سيتجاهل نسبة الربح):`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
    } catch(e) {}
});

bot.action(/^setfixed_(.+)$/, (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    botStates.adminInput[ctx.from.id] = 'WAIT_SET_FIXED_' + ctx.match[1]; saveDatabase();
    ctx.editMessageText('💲 أرسل السعر الثابت الجديد للمنتج بالجنيه المصري (مثال: 150).\n\n🗑️ لإلغاء السعر الثابت والعودة لنظام النسبة المئوية، اكتب كلمة: `حذف`\n🔙 للإلغاء والرجوع، اكتب كلمة: `رجوع`', {parse_mode: 'Markdown'}).catch(()=>{});
});

bot.action('admin_ad_stats', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        let msg = '📈 **إحصائيات الحملات الإعلانية:**\n\n';
        if (!adCampaigns || Object.keys(adCampaigns).length === 0) {
            msg += 'لا توجد بيانات أو حملات حتى الآن.';
        } else {
            for (let camp in adCampaigns) {
                msg += `🔹 إعلان (${camp}): دخول ${adCampaigns[camp]} عميل جديد\n`;
            }
        }
        ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
    } catch (e) {}
});

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
            msg += `👤 ID: <code>${req.userUid}</code>\n💰 المبلغ: <b>${req.amount} EGP</b>\n📸 <b>(الإثبات مرفق)</b>\n━━━━━━━━━━━━\n`;
            inlineButtons.push([ Markup.button.callback('✅ موافقة (' + req.amount + 'ج)', `approve_dep_${req.userId}_${req.amount}`), Markup.button.callback('❌ رفض', `reject_dep_${req.userId}`) ]);
        });
        inlineButtons.push([Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]);
        ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(inlineButtons) }).catch(()=>{});
    } catch(e) {}
});

bot.action('admin_check_api_balance', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        ctx.editMessageText('⏳ جاري الاتصال بالمزودين...').catch(()=>{});
        let msg = '💰 **أرصدة المزودين:**\n\n';
        try { const res1 = await apiClient1.get('/me/wallet'); msg += `🔹 المزود الأول: *${parseFloat(res1.data?.data?.balance || res1.data?.balance || 0).toFixed(2)} EGP*\n`; } 
        catch(e) { msg += `🔹 المزود الأول: خطأ ❌ (${e.response?.status || e.message})\n`; }
        
        try { const res2 = await apiClient2.get('/balance'); msg += `🔹 المزود الثاني: *$${parseFloat(res2.data?.data?.balance || res2.data?.balance || 0).toFixed(2)}*\n`; } 
        catch(e) { msg += `🔹 المزود الثاني: خطأ ❌ (${e.response?.status || e.message})\n`; }
        
        try { const res3 = await apiClient3.get('/me/wallet'); msg += `🔹 المزود الثالث (Dantehub): *${parseFloat(res3.data?.data?.balance || res3.data?.balance || 0).toFixed(2)}*\n`; } 
        catch(e) { 
            try {
                const res3b = await apiClient3.get('/balance'); msg += `🔹 المزود الثالث (Dantehub): *${parseFloat(res3b.data?.data?.balance || res3b.data?.balance || 0).toFixed(2)}*\n`;
            } catch(err) {
                msg += `🔹 المزود الثالث (Dantehub): خطأ ❌ (${err.response?.status || err.message})\n`; 
            }
        }
        ctx.editMessageText(msg, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
    } catch(e) {}
});

bot.action('admin_check_api_status', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        ctx.editMessageText('⏳ جاري فحص استجابة سيرفرات المزودين...').catch(()=>{});
        let msg = '🟢 **حالة سيرفرات المزودين (API):**\n\n';
        
        try { const start1 = Date.now(); await apiClient1.get('/services?limit=1'); msg += `🔹 المزود الأول: يعمل ✅ (${Date.now() - start1}ms)\n`; } 
        catch(e) { msg += `🔹 المزود الأول: متعطل ❌ (الخطأ: ${e.response?.status || e.message})\n`; }
        
        try { const start2 = Date.now(); await apiClient2.get('/products'); msg += `🔹 المزود الثاني: يعمل ✅ (${Date.now() - start2}ms)\n`; } 
        catch(e) { msg += `🔹 المزود الثاني: متعطل ❌ (الخطأ: ${e.response?.status || e.message})\n`; }
        
        try { const start3 = Date.now(); await apiClient3.get('/services?limit=1'); msg += `🔹 المزود الثالث: يعمل ✅ (${Date.now() - start3}ms)\n`; } 
        catch(e) { 
            try {
                const start3b = Date.now(); await apiClient3.get('/products'); msg += `🔹 المزود الثالث: يعمل ✅ (${Date.now() - start3b}ms)\n`; 
            } catch (err) {
                msg += `🔹 المزود الثالث: متعطل ❌ (الخطأ: ${err.response?.status || err.message})\n`; 
            }
        }
        
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
    ctx.editMessageText('📢 **إذاعة متطورة للعملاء:**\n\n- للإرسال النصي: أرسل النص مباشرة.\n- للإرسال بصورة وزر: أرسل صورة واكتب في الوصف (الكابشن): `النص | اسم الزر | الرابط`\n\nأو اكتب `إلغاء` للرجوع.', { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{}); 
});

bot.action(/^approve_dep_(.+)_(.+)$/, (ctx) => {
    ctx.answerCbQuery('⏳ جاري شحن الرصيد للعميل...').catch(()=>{});
    try {
        const targetUserId = ctx.match[1];
        const amount = parseFloat(ctx.match[2]);
        
        const pendingIndex = pendingDeposits.findIndex(p => p.userId === targetUserId && parseFloat(p.amount) === amount);
        
        if (pendingIndex !== -1) {
            pendingDeposits.splice(pendingIndex, 1);
            
            if (usersDb[targetUserId]) {
                usersDb[targetUserId].balance += amount;
                usersDb[targetUserId].walletHistory.push({ type: 'شحن فودافون كاش (موافقة أدمن)', amount: amount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
                saveDatabase();
                
                bot.telegram.sendMessage(targetUserId, `🎉 **تم تأكيد الدفع بنجاح!**\n💰 تمت إضافة: *${amount} EGP* لمحفظتك.\n✅ رصيدك الحالي: *${usersDb[targetUserId].balance.toFixed(2)} EGP*`, { parse_mode: 'Markdown' }).catch(()=>{});
                
                ctx.editMessageText(`✅ **تمت الموافقة بنجاح!**\n\nتم شحن ${amount} EGP للعميل (ID: ${usersDb[targetUserId].uid})`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع لطلبات الشحن', 'admin_pending_deposits')]]) }).catch(()=>{});
            } else {
                ctx.editMessageText('❌ العميل غير موجود.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_pending_deposits')]])).catch(()=>{});
            }
        } else {
            ctx.editMessageText('❌ هذا الطلب غير موجود أو تم التعامل معه مسبقاً.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_pending_deposits')]])).catch(()=>{});
        }
    } catch(e) { console.error(e); }
});

bot.action(/^reject_dep_(.+)$/, (ctx) => {
    ctx.answerCbQuery('تم الرفض').catch(()=>{});
    try {
        const targetUserId = ctx.match[1];
        
        const pendingIndex = pendingDeposits.findIndex(p => p.userId === targetUserId);
        if (pendingIndex !== -1) {
            const reqData = pendingDeposits[pendingIndex];
            pendingDeposits.splice(pendingIndex, 1);
            saveDatabase();
            
            bot.telegram.sendMessage(targetUserId, `❌ **تم رفض طلب الشحن الخاص بك.**\n\nيرجى التأكد من إرفاق إثبات الدفع الصحيح والتواصل مع الدعم الفني إذا كانت هناك مشكلة.`, { parse_mode: 'Markdown' }).catch(()=>{});
            
            ctx.editMessageText(`❌ **تم رفض الطلب.**\n\nتم إلغاء شحن ${reqData.amount} EGP للعميل.`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع لطلبات الشحن', 'admin_pending_deposits')]]) }).catch(()=>{});
        } else {
            ctx.editMessageText('❌ هذا الطلب غير موجود.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_pending_deposits')]])).catch(()=>{});
        }
    } catch(e) {}
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

// 🛡️ دالة الأقسام مع تقييد عدد الأزرار لحماية البوت من التعليق
bot.action(/^cat_(\d+)$/, async (ctx) => {
  ctx.answerCbQuery().catch(()=>{}); 
  try {
    const userId = String(ctx.from.id); initUser(userId);
    if (usersDb[userId].isBanned) return;

    const catIndex = parseInt(ctx.match[1]);
    const selectedCategory = usersDb[userId].tempCategories ? usersDb[userId].tempCategories[catIndex] : null;
    
    if (cachedServices.length === 0) {
        await ctx.editMessageText('⏳ جاري تحميل الخدمات السريعة...').catch(()=>{});
        await backgroundServiceUpdate();
    } else if (Date.now() - lastCategoriesFetchTime > categoryCacheTime) {
        backgroundServiceUpdate(); 
    }

    if (!selectedCategory || cachedServices.length === 0) { 
        return ctx.editMessageText('⚠️ يرجى تحديث الأقسام من القائمة الرئيسية.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'main_categories')]])).catch(()=>{});
    }

    // 🛡️ تحديد أقصى عدد 90 خدمة لمنع تجاوز حدود التليجرام (سبب التعليق)
    const categoryServices = cachedServices.filter(s => {
      if (hiddenServices && hiddenServices.includes(String(s.id))) return false;
      let cat = getServiceCategory(s);
      return cat === selectedCategory || cat.toLowerCase().includes(selectedCategory.toLowerCase()) || selectedCategory.toLowerCase().includes(cat.toLowerCase());
    }).slice(0, 90); 

    if (categoryServices.length === 0) return ctx.editMessageText('لا توجد خدمات حالياً في هذا القسم.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'main_categories')]])).catch(()=>{});

    let buttons = categoryServices.map(srv => {
        let srvName = srv.name_ar || srv.name || srv.title || 'خدمة';
        let emoji = detectServiceEmoji(srvName);
        let cleanName = srvName;
        if (cleanName.length > 26) cleanName = cleanName.substring(0, 24) + '..';
        let price = calculateRetailPrice(srv, usersDb[userId], 1);
        
        let ratingStr = '';
        if (ratings[srv.id] && ratings[srv.id].count > 0) {
            const avg = (ratings[srv.id].totalStars / ratings[srv.id].count).toFixed(1);
            ratingStr = ` (⭐ ${avg})`;
        }
        
        return [
            Markup.button.callback(`🛒 ${emoji}${cleanName}${ratingStr} -${price} EGP`, `buyact_${srv.id}`)
        ];
    });
    buttons.push([Markup.button.callback('🔙 رجوع للأقسام', 'main_categories')]);

    ctx.editMessageText(`📦 خدمات قسم *${selectedCategory}*:`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
  } catch(err) {
      console.error(err);
  }
});

bot.action('cancel_action', (ctx) => {
    ctx.answerCbQuery().catch(()=>{}); 
    clearUserStates(ctx.from.id);
    ctx.deleteMessage().catch(()=>{});
});

bot.action(/^notify_stock_(.+)$/, (ctx) => {
    ctx.answerCbQuery('تم تفعيل إشعار التوفر! 🔔').catch(()=>{});
    try {
        const srvId = ctx.match[1];
        const userId = String(ctx.from.id);
        if (!stockAlerts[srvId]) stockAlerts[srvId] = [];
        if (!stockAlerts[srvId].includes(userId)) stockAlerts[srvId].push(userId);
        saveDatabase();
        ctx.editMessageText('🔔 **تم تفعيل الإشعار بنجاح!**\nسنرسل لك رسالة تلقائية فور قيام الإدارة بإضافة كميات جديدة من هذه الخدمة.', {parse_mode: 'Markdown'}).catch(()=>{});
    } catch (e) {}
});

bot.action(/^rate_(\d+)_(.+)$/, (ctx) => {
    ctx.answerCbQuery('شكراً لتقييمك!').catch(()=>{});
    const stars = parseInt(ctx.match[1]);
    const srvId = ctx.match[2];
    if (!ratings[srvId]) ratings[srvId] = { totalStars: 0, count: 0 };
    ratings[srvId].totalStars += stars;
    ratings[srvId].count += 1;
    saveDatabase();
    ctx.editMessageText(`✅ **شكراً لتقييمك الرائع!**\nتقييمك للخدمة: ${'⭐'.repeat(stars)}\nرأيك يهمنا ويساعد العملاء الآخرين.`, {parse_mode: 'Markdown'}).catch(()=>{});
});

// 🛡️ إصلاح زر الشراء وإضافة Await
bot.action(/^buyact_(.+)$/, async (ctx) => {
  ctx.answerCbQuery().catch(()=>{}); 
  try {
     const userId = String(ctx.from.id);
     initUser(userId); 
     const srvId = ctx.match[1];
     await processBuyAction(ctx, userId, srvId); // 🛡️ حل مشكلة اختفاء البوت (Crash)
  } catch(err){
      console.error("Buy action error:", err);
  }
});

bot.action('confirm_stock_add', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    const userId = String(ctx.from.id);
    const temp = botStates.tempStock[userId];
    
    if (!temp) return ctx.editMessageText('❌ انتهت صلاحية هذا الأمر أو تم تنفيذه مسبقاً.').catch(()=>{});

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
            bot.telegram.sendMessage(uId, `🔔 **خبر سار!**\nالخدمة التي كنت تنتظرها **${srvName}** أصبحت متوفرة الآن في المتجر! سارع بالطلب قبل نفاذ الكمية.`, {parse_mode: 'Markdown'}).catch(()=>{});
        });
        stockAlerts[srvId] = []; 
    }
    
    delete botStates.tempStock[userId];
    saveDatabase();
    logAdminAction(userId, `إضافة 1 عنصر للمخزن المحلي ${srvId}`);

    ctx.editMessageText(`✅ تم حفظ العنصر بنجاح!\n📦 إجمالي المخزون الحالي للمنتج: ${localInventory[srvId].length}\n\n(يمكنك إرسال العنصر التالي مباشرة، أو اضغط "رجوع" للعودة)`, Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]])).catch(()=>{});
});

bot.action('cancel_stock_add', (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    const userId = String(ctx.from.id);
    if (botStates.tempStock && botStates.tempStock[userId]) {
        delete botStates.tempStock[userId];
        saveDatabase();
    }
    ctx.editMessageText('❌ تم إلغاء إضافة العنصر.\nيمكنك إرسال عنصر جديد أو الضغط على "رجوع" للعودة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]])).catch(()=>{});
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

// وظيفة نشر إعلان السعر في القناة
async function publishPriceDrop(ctx, userId, state, fileId) {
    const srvIdStr = state.replace('WAIT_PD_IMG_', '');
    const lastUnderscore = srvIdStr.lastIndexOf('_');
    const srvId = srvIdStr.substring(0, lastUnderscore);
    const price = parseFloat(srvIdStr.substring(lastUnderscore + 1));

    if (!publicSalesChannel) {
        return ctx.reply('❌ يرجى تحديد قناة المبيعات أولاً من لوحة التحكم لنشر الإعلان.');
    }

    if (cachedServices.length === 0) await backgroundServiceUpdate();
    const srv = cachedServices.find(s => String(s.id) === srvId);
    if (!srv) return ctx.reply('❌ الخدمة غير موجودة.');

    const oldPrice = parseFloat(calculateRetailPrice(srv, null, 1));
    
    fixedPrices[srvId] = price;
    delete botStates.adminInput[userId];
    saveDatabase();

    const discount = oldPrice > 0 ? Math.round(((oldPrice - price) / oldPrice) * 100) : 0;
    const srvName = srv.name_ar || srv.name || srv.title;

    const msgText = `🔥 <b>توفرت كميات جديدة الآن!</b> 🎉\n\n📦 <b>${srvName.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</b>\n📊 <b>الكمية المتوفرة:</b> كمية محدودة!\n💰 <b>السعر القديم:</b> ~${oldPrice} EGP~\n✨ <b>السعر الجديد:</b> ${price} EGP\n🏷 <b>نسبة الخصم:</b> ${discount}%\n\n🔥 <b>الكمية محدودة!</b>\n⚡ <b>سارع بالطلب الآن قبل نفاذ الكمية!</b>`;

    const botUsername = ctx.botInfo.username;
    const keyboard = Markup.inlineKeyboard([
         [Markup.button.url('🛒 شراء الآن', `https://t.me/${botUsername}?start=buy_${srvId}`)]
    ]);

    try {
        if (fileId) {
            await bot.telegram.sendPhoto(publicSalesChannel, fileId, {caption: msgText, parse_mode: 'HTML', ...keyboard});
        } else {
            await bot.telegram.sendMessage(publicSalesChannel, msgText, {parse_mode: 'HTML', ...keyboard});
        }
        ctx.reply(`✅ تم نشر الإعلان وتخفيض السعر بنجاح إلى ${price} EGP!`, Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));
    } catch (e) {
        ctx.reply('❌ فشل النشر في القناة.');
    }
}

bot.on('photo', async (ctx) => {
    try {
        const userId = String(ctx.from.id); initUser(userId);
        
        const state = botStates.adminInput[userId];
        
        if (isAdmin(userId) && state && state.startsWith('WAIT_PD_IMG_')) {
            const fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            return publishPriceDrop(ctx, userId, state, fileId);
        }
        
        if (botStates.broadcast && botStates.broadcast[userId] && isAdmin(userId)) {
            const caption = ctx.message.caption || '';
            let fileId = ctx.message.photo[ctx.message.photo.length - 1].file_id;
            
            let parts = caption.split('|').map(s => s.trim());
            let msgText = parts[0] || 'إعلان من الإدارة';
            let markup = null;
            if (parts.length >= 3) markup = Markup.inlineKeyboard([[Markup.button.url(parts[1], parts[2])]]);

            ctx.reply('⏳ جاري إرسال الإذاعة المصورة لجميع العملاء...').catch(()=>{});
            let count = 0;
            for (let tgId in usersDb) {
                if (String(usersDb[tgId].uid) !== '1001') {
                    bot.telegram.sendPhoto(tgId, fileId, { caption: msgText, parse_mode: 'HTML', ...(markup ? markup : {}) }).catch(() => {});
                    count++; if (count % 20 === 0) await new Promise(r => setTimeout(r, 1000)); 
                }
            }
            delete botStates.broadcast[userId]; saveDatabase(); 
            return ctx.reply('✅ تم الإرسال للجميع بنجاح.');
        }

        if (botStates.deposit && botStates.deposit[userId] && botStates.deposit[userId].step === 'WAIT_RECEIPT') {
            const amount = botStates.deposit[userId].amount;
            const photoObj = ctx.message.photo[ctx.message.photo.length - 1];
            const fileId = photoObj.file_id;
            const fileUniqueId = photoObj.file_unique_id; 
            
            if (usedReceipts.includes(fileUniqueId)) {
                return ctx.reply('⚠️ **تحذير أمني:**\nتم اكتشاف أن هذا الإيصال تم استخدامه مسبقاً! يرجى إرسال إيصال جديد وعدم تكرار المحاولة لتجنب حظر حسابك نهائياً.', {parse_mode: 'Markdown'}).catch(()=>{});
            }
            
            usedReceipts.push(fileUniqueId);
            
            delete botStates.deposit[userId]; saveDatabase();
            
            const reqData = { userId, userUid: usersDb[userId].uid, amount, receipt: fileId };
            pendingDeposits.push(reqData); saveDatabase();
            
            ctx.reply('✅ **تم استلام طلبك وإثبات الدفع!**\n⏳ جاري مراجعته من الإدارة وسيتم إضافة الرصيد لمحفظتك قريباً.', {parse_mode: 'Markdown'}).catch(()=>{});
            
            for (let tgId in usersDb) {
                if (String(usersDb[tgId].uid) === '1001') {
                    bot.telegram.sendPhoto(tgId, fileId, {
                        caption: `🔔 <b>طلب شحن يدوي للمراجعة</b>\n\n👤 المستخدم: <code>${reqData.userUid}</code>\n💰 المبلغ المطلوب: <b>${reqData.amount} EGP</b>`,
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([
                            [Markup.button.callback('✅ موافقة', `approve_dep_${reqData.userId}_${reqData.amount}`), Markup.button.callback('❌ رفض', `reject_dep_${reqData.userId}`)]
                        ])
                    }).catch(()=>{});
                }
            }
        }
    } catch(e) {}
});

bot.on('text', async (ctx, next) => {
  try {
    const userId = String(ctx.from.id); initUser(userId);
    if (usersDb[userId].isBanned) return;
    const text = ctx.message.text.trim();

    const menuCommands = ['الخدمات', 'طلباتي', 'حسابي', 'سجل المحفظة', 'شحن المحفظة', 'استخدام كود', 'دعوة الأصدقاء', 'الدعم الفني', 'بحث', 'تحويل رصيد'];
    if (menuCommands.some(cmd => text.includes(cmd))) {
        clearUserStates(userId);
        return next(); 
    }

    if (botStates.transfer && botStates.transfer[userId]) {
        const state = botStates.transfer[userId];
        if (state.step === 'WAIT_UID') {
            const targetUid = text;
            const targetUser = getUserByUid(targetUid);
            if (!targetUser || targetUid === String(usersDb[userId].uid)) return ctx.reply('❌ حساب غير صحيح. أرسل ID صحيح أو اكتب `إلغاء`:').catch(()=>{});
            state.targetId = targetUser.telegramId; state.targetUid = targetUid; state.step = 'WAIT_AMOUNT'; saveDatabase();
            return ctx.reply('💰 **الرصيد المتاح:** ' + usersDb[userId].balance.toFixed(2) + ' EGP\n\nأرسل المبلغ المراد تحويله (أرقام فقط):').catch(()=>{});
        } else if (state.step === 'WAIT_AMOUNT') {
            if (text === 'إلغاء') { delete botStates.transfer[userId]; saveDatabase(); return ctx.reply('✅ تم الإلغاء.'); }
            const amount = parseFloat(text);
            if (isNaN(amount) || amount <= 0 || amount > usersDb[userId].balance) return ctx.reply('❌ رصيدك غير كافٍ أو المبلغ غير صحيح.').catch(()=>{});
            
            usersDb[userId].balance -= amount;
            usersDb[state.targetId].balance += amount;
            
            usersDb[userId].walletHistory.push({ type: `تحويل إلى ${state.targetUid}`, amount: -amount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
            usersDb[state.targetId].walletHistory.push({ type: `استلام من ${usersDb[userId].uid}`, amount: amount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
            delete botStates.transfer[userId]; saveDatabase();
            
            bot.telegram.sendMessage(state.targetId, `🎉 **استلام رصيد!**\nتم تحويل *${amount} EGP* إلى محفظتك من العميل ذو الـ ID: \`${usersDb[userId].uid}\``, { parse_mode: 'Markdown' }).catch(()=>{});
            return ctx.reply(`✅ **تم التحويل بنجاح!**\nتم تحويل ${amount} EGP للعميل.`, { parse_mode: 'Markdown' }).catch(()=>{});
        }
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
             if (cachedServices.length === 0) {
                 await ctx.reply('⏳ جاري التحديث السريع للأسعار...').catch(()=>{});
                 await backgroundServiceUpdate(); 
             } else if (Date.now() - lastCategoriesFetchTime > categoryCacheTime) {
                 backgroundServiceUpdate(); 
             }

             const srv = cachedServices.find(s => String(s.id) === String(srvId));
             if (!srv) {
                 ctx.reply('❌ الخدمة غير موجودة أو تم حذفها من المزود.').catch(()=>{});
                 return;
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
             
             const isManagedLocally = localInventory[String(srv.id)] !== undefined; 
             const hasLocalStock = localInventory[String(srv.id)] && localInventory[String(srv.id)].length >= qty;
             
             if (isManagedLocally && !hasLocalStock) {
                 return ctx.reply(`❌ عذراً، الكمية المطلوبة من هذه الخدمة نفدت من المخزن المحلي حالياً.\n\nهل تريد أن يصلك إشعار فور توفرها مرة أخرى؟`, 
                    Markup.inlineKeyboard([[Markup.button.callback('🔔 أعلمني عند التوفر', `notify_stock_${srv.id}`)]])
                 ).catch(()=>{});
             }

             let processingMsg = await ctx.reply('⏳ <b>جاري المعالجة...</b>', {parse_mode: 'HTML'}).catch(()=>{});
             await new Promise(resolve => setTimeout(resolve, 800));
             if(processingMsg) await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, null, '🔄 <b>قيد التنفيذ من المزود السحابي...</b>', {parse_mode: 'HTML'}).catch(()=>{});

             if (hasLocalStock) {
                 const deliveredItems = localInventory[String(srv.id)].splice(0, qty);
                 
                 usersDb[userId].balance -= retailPrice;
                 usersDb[userId].totalSpent += retailPrice;
                 usersDb[userId].walletHistory.push({ type: `شراء محلي (${name})`, amount: -retailPrice, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
                 
                 const safeDetails = deliveredItems.join('\n\n');
                 usersDb[userId].orders.push({ name: `${name} (${qty}x)`, srvId: String(srv.id), timestamp: Date.now(), reminded: false, price: retailPrice, profit: exactProfit, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }), details: safeDetails });
                 saveDatabase();

                 let deliveryMsg = `✅ <b>تم الشراء بنجاح (المخزن المحلي)</b>\n\n📦 <b>رقم الطلب:</b> #LOCAL-${Math.floor(1000 + Math.random() * 9000)}\n\n` +
                                   `🛍️ <b>الخدمة:</b> ${safeName}\n🔢 <b>الكمية:</b> ${qty}\n🟢 <b>الحالة:</b> تم التسليم بنجاح\n💰 <b>المدفوع:</b> ${retailPrice} EGP\n\n` +
                                   `📋 <b>العناصر المسلمة:</b>\n<code>${safeDetails.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`;

                 if(processingMsg) {
                     await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, null, deliveryMsg, { parse_mode: 'HTML', disable_web_page_preview: true, ...Markup.inlineKeyboard([[Markup.button.callback('🏠 القائمة الرئيسية', 'main_menu')]])}).catch(()=>{});
                 } else {
                     await ctx.reply(deliveryMsg, { parse_mode: 'HTML', disable_web_page_preview: true, ...Markup.inlineKeyboard([[Markup.button.callback('🏠 القائمة الرئيسية', 'main_menu')]])}).catch(()=>{});
                 }

                 notifyAdmin(`👑 <b>عملية بيع من المخزن المحلي:</b>\n🛍 ${safeName}\n💰 ${retailPrice} EGP\n📦 متبقي في المخزن: ${localInventory[String(srv.id)].length}`);
                 broadcastSale(safeName, qty, retailPrice, usersDb[userId].uid, 'رصيد المحفظة', String(srv.id), ctx.botInfo.username);
                 
                 setTimeout(() => {
                     ctx.reply('⭐ كيف تقيم جودة هذه الخدمة؟', Markup.inlineKeyboard([ 
                        [Markup.button.callback('⭐', `rate_1_${srv.id}`), Markup.button.callback('⭐⭐', `rate_2_${srv.id}`), Markup.button.callback('⭐⭐⭐', `rate_3_${srv.id}`)], 
                        [Markup.button.callback('⭐⭐⭐⭐', `rate_4_${srv.id}`), Markup.button.callback('⭐⭐⭐⭐⭐', `rate_5_${srv.id}`)] 
                    ])).catch(()=>{});
                 }, 3000);
                 return; 
             }

             usersDb[userId].balance -= retailPrice;
             saveDatabase();

             try {
                const orderResponse = await placeOrderWithBestProvider(srv, qty);

                usersDb[userId].totalSpent += retailPrice;
                usersDb[userId].walletHistory.push({ type: `شراء (${name} -${qty}x)`, amount: -retailPrice, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });

                if (!usersDb[userId].isVip && usersDb[userId].totalSpent >= 500) {
                    usersDb[userId].isVip = true;
                    bot.telegram.sendMessage(userId, '👑 **تهانينا!**\nتمت ترقية حسابك إلى **VIP** لتحقيقك مشتريات بـ 500 EGP. ستحصل على أسعار مخفضة تلقائياً!').catch(()=>{});
                }
                
                const currentOrder = { name: `${name} (${qty}x)`, srvId: String(srv.id), timestamp: Date.now(), reminded: false, price: retailPrice, profit: exactProfit, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }), details: "جاري المعالجة من المزود..." };
                usersDb[userId].orders.push(currentOrder);
                saveDatabase(); 

                let orderId = orderResponse.data?.order?.id || orderResponse.data?.id || orderResponse.data?.order_id || Math.floor(10000 + Math.random() * 90000);
                let rawDetails = null;

                await new Promise(resolve => setTimeout(resolve, 1500));

                try {
                    const source = srv.providerSource || 'api1';
                    const clientApi = source === 'api2' ? apiClient2 : (source === 'api3' ? apiClient3 : apiClient1);
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

                let deliveryMsg = `✅ <b>تم الشراء والتسليم بنجاح</b>\n\n📦 <b>رقم الطلب:</b> #${orderId}\n\n` +
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
                
                broadcastSale(safeName, qty, retailPrice, usersDb[userId].uid, 'رصيد المحفظة', String(srv.id), ctx.botInfo.username);
                
                setTimeout(() => {
                    ctx.reply('⭐ كيف تقيم جودة هذه الخدمة؟', Markup.inlineKeyboard([ 
                        [Markup.button.callback('⭐', `rate_1_${srv.id}`), Markup.button.callback('⭐⭐', `rate_2_${srv.id}`), Markup.button.callback('⭐⭐⭐', `rate_3_${srv.id}`)], 
                        [Markup.button.callback('⭐⭐⭐⭐', `rate_4_${srv.id}`), Markup.button.callback('⭐⭐⭐⭐⭐', `rate_5_${srv.id}`)] 
                    ])).catch(()=>{});
                }, 3000);

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
        const textCode = text.toUpperCase();

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

        if (!state.startsWith('WAIT_ADD_STOCK_') && !state.startsWith('WAIT_BROADCAST') && !state.startsWith('WAIT_PD_')) {
            delete botStates.adminInput[userId];
        }

        if (state === 'WAIT_PD_SEARCH') {
            const query = text.toLowerCase();
            if (!cachedServices || cachedServices.length === 0) cachedServices = await fetchAllServices();
            const results = cachedServices.filter(s => (s.name_ar || s.name || s.title || '').toLowerCase().includes(query));
            if(results.length === 0) return ctx.reply('❌ لا توجد نتائج مطابقة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));
            
            let buttons = results.slice(0, 15).map(srv => {
                return [Markup.button.callback((srv.name_ar || srv.name || srv.title), `pdsel_${srv.id}`)]
            });
            buttons.push([Markup.button.callback('🔙 رجوع', 'back_to_admin')]);
            return ctx.reply('🔍 اختر المنتج لعمل إعلان تخفيض عليه:', Markup.inlineKeyboard(buttons));
        }

        if (state.startsWith('WAIT_PD_PRICE_')) {
            const srvId = state.split('WAIT_PD_PRICE_')[1];
            const newPrice = parseFloat(text);
            if (isNaN(newPrice) || newPrice < 0) return ctx.reply('❌ سعر غير صحيح، يرجى إدخال أرقام فقط.');
            
            botStates.adminInput[userId] = `WAIT_PD_IMG_${srvId}_${newPrice}`; saveDatabase();
            return ctx.reply('📸 **الآن أرسل صورة للمنتج ليتم إرفاقها مع الإعلان في القناة.**\n\n(أو أرسل كلمة `تخطي` للنشر كنص فقط بدون صورة):', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));
        }

        if (state.startsWith('WAIT_PD_IMG_') && text === 'تخطي') {
            return publishPriceDrop(ctx, userId, state, null);
        }

        if (state === 'WAIT_DROP_GROUP') {
            if (!text.startsWith('-100')) {
                return ctx.reply('❌ معرف الجروب غير صحيح! يجب أن يبدأ بـ `-100`.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            }
            dropGroupId = text.trim();
            delete botStates.adminInput[userId]; saveDatabase();
            logAdminAction(userId, `تحديد جروب الدروبات: ${dropGroupId}`);
            return ctx.reply(`✅ **تم تعيين جروب الدروبات بنجاح!**\nالـ ID الجديد: \`${dropGroupId}\`\n\n⚠️ **تأكد أن البوت أدمن في الجروب ليتمكن من الإرسال.**`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
        }

        if (state === 'WAIT_DROP_AMOUNT') {
            const amt = parseFloat(text);
            if (isNaN(amt) || amt <= 0) return ctx.reply('❌ المبلغ غير صحيح.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));
            
            delete botStates.adminInput[userId]; 
            const code = 'DROP-' + Math.floor(10000 + Math.random() * 90000);
            vouchers[code] = { amount: amt, isUsed: false }; 
            saveDatabase();
            
            try {
                bot.telegram.sendMessage(dropGroupId, `🎉 **كود دروب سريع وصل!** 🎁\n\nأول شخص ينسخ هذا الكود ويرسله في بوت المتجر سيكسب رصيد **${amt} EGP** مجاناً!\n\nالكود: \`${code}\`\n\nيُستخدم في البوت من قسم (استخدام كود خصم).`, {parse_mode: 'Markdown'});
                logAdminAction(userId, `إرسال كود دروب بـ ${amt} جنيه`);
                return ctx.reply(`✅ **تم إرسال كود الدروب للجروب بنجاح!**\n\nالكود الذي تم إرساله: \`${code}\``, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
            } catch (e) {
                return ctx.reply('❌ فشل إرسال الدروب للجروب. تأكد من صحة الـ ID وأن البوت مشرف هناك.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));
            }
        }

        if (state === 'WAIT_FORCE_SUB') {
            if (text === 'إيقاف') {
                forceSubscribeChannel = '';
                delete botStates.adminInput[userId];
                saveDatabase();
                logAdminAction(userId, 'إيقاف الاشتراك الإجباري');
                return ctx.reply('✅ تم إيقاف نظام الاشتراك الإجباري بنجاح.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            }
            
            if (!text.startsWith('@')) {
                 return ctx.reply('❌ معرف القناة غير صحيح!\nيجب أن يبدأ المعرف بـ `@` (مثال: `@MyChannel`). أرسله مجدداً:', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));
            }
            
            forceSubscribeChannel = text.trim();
            delete botStates.adminInput[userId];
            saveDatabase();
            logAdminAction(userId, `تفعيل الاشتراك الإجباري لقناة: ${forceSubscribeChannel}`);
            return ctx.reply(`✅ **تم تفعيل الاشتراك الإجباري بنجاح!**\nالقناة: \`${forceSubscribeChannel}\`\n\n⚠️ **تذكر:** البوت لن يعمل إذا لم يكن "مشرفاً" في هذه القناة للتمكن من فحص اشتراكات الأعضاء.`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
        }

        if (state === 'WAIT_SALES_CHANNEL') {
            if (text === 'إيقاف') {
                publicSalesChannel = '';
                delete botStates.adminInput[userId];
                saveDatabase();
                logAdminAction(userId, 'إيقاف النشر التلقائي في قناة المبيعات');
                return ctx.reply('✅ تم إيقاف النشر التلقائي في قناة المبيعات.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            }
            
            if (!text.startsWith('-100')) {
                 return ctx.reply('❌ معرف القناة (ID) غير صحيح!\nيجب أن يبدأ المعرف بـ `-100`. تأكد من الرقم وأرسله مجدداً:', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            }
            
            publicSalesChannel = text.trim();
            delete botStates.adminInput[userId];
            saveDatabase();
            logAdminAction(userId, `تعيين قناة مبيعات جديدة: ${publicSalesChannel}`);
            return ctx.reply(`✅ **تم تعيين قناة المبيعات بنجاح!**\nالـ ID الجديد: \`${publicSalesChannel}\`\n\n⚠️ **تنبيه هام:** لا تنسَ إضافة البوت كأدمن في هذه القناة وإعطائه صلاحية إرسال الرسائل.`, { parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
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
            
            let prefix = 'setmarkup_';
            if (state === 'WAIT_SEARCH_STOCK') prefix = 'addstock_';

            let buttons = results.slice(0, 15).map(srv => {
                return [Markup.button.callback((srv.name_ar || srv.name || srv.title) + ` (${srv.providerSource})`, prefix + srv.id)]
            });
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

        if (state.startsWith('WAIT_SET_FIXED_')) {
            const srvId = String(state.split('WAIT_SET_FIXED_')[1]);

            if (text === 'إلغاء' || text === 'رجوع') {
                delete botStates.adminInput[userId];
                saveDatabase();
            } else if (text === 'حذف') {
                delete fixedPrices[srvId];
                delete botStates.adminInput[userId];
                saveDatabase();
                logAdminAction(userId, `إلغاء السعر الثابت للمنتج ${srvId}`);
                await ctx.reply('✅ تم مسح السعر الثابت! المنتج سيعود لاستخدام نسبة الربح.').catch(()=>{});
            } else {
                const price = parseFloat(text);
                if (isNaN(price) || price < 0) {
                    return ctx.reply('❌ يرجى إدخال رقم صحيح موجب أو كلمة "حذف" أو "رجوع".').catch(()=>{});
                }
                fixedPrices[srvId] = price;
                delete botStates.adminInput[userId];
                saveDatabase();
                logAdminAction(userId, `تحديد سعر ثابت للمنتج ${srvId} بـ ${price} جنيه`);
                await ctx.reply(`✅ تم تحديد السعر الثابت للمنتج بنجاح: *${price} EGP*`, {parse_mode: 'Markdown'}).catch(()=>{});
            }

            const catIndex = botStates.lastAdminCatFixed ? botStates.lastAdminCatFixed[userId] : null;
            if (catIndex !== undefined && catIndex !== null && botStates.adminTempCats && botStates.adminTempCats[userId]) {
                const selectedCategory = botStates.adminTempCats[userId][catIndex];
                if (cachedServices.length === 0) await backgroundServiceUpdate();
                const categoryServices = cachedServices.filter(s => {
                    let cat = getServiceCategory(s);
                    return cat === selectedCategory || cat.toLowerCase().includes(selectedCategory.toLowerCase()) || selectedCategory.toLowerCase().includes(cat.toLowerCase());
                });

                let buttons = categoryServices.map(srv => {
                    const fp = fixedPrices[String(srv.id)];
                    const prefix = fp ? `[${fp}ج] ` : '⏳ ';
                    let btnText = prefix + (srv.name_ar || srv.name || srv.title);
                    if (btnText.length > 40) btnText = btnText.substring(0, 38) + '..'; 
                    return [Markup.button.callback(btnText, `setfixed_${srv.id}`)];
                });
                buttons.push([Markup.button.callback('🔙 رجوع لأقسام الأسعار', 'admin_fixed_price')]);

                return ctx.reply(`💲 خدمات قسم <b>${selectedCategory}</b>:\n\nاضغط على أي خدمة لتحديد سعر ثابت لها:`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
            } else {
                return showAdminPanel(ctx);
            }
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
            botStates.tempStock = botStates.tempStock || {};
            botStates.tempStock[userId] = { srvId: srvId, itemText: item };
            saveDatabase();
            
            return ctx.reply(`⚠️ **هل أنت متأكد من حفظ هذا العنصر في المخزن؟**\n\n<code>${item.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</code>`, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('✅ تأكيد الحفظ', 'confirm_stock_add'), Markup.button.callback('❌ إلغاء', 'cancel_stock_add')]
                ])
            });
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
        
        let buttons = results.slice(0, 15).map(srv => {
            let ratingStr = '';
            if (ratings[srv.id] && ratings[srv.id].count > 0) {
                const avg = (ratings[srv.id].totalStars / ratings[srv.id].count).toFixed(1);
                ratingStr = ` (⭐ ${avg})`;
            }
            return [Markup.button.callback((srv.name_ar || srv.name || srv.title) + ratingStr + ' - ' + calculateRetailPrice(srv, usersDb[userId]) + ' EGP', `buyact_${srv.id}`)]
        });
        
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

    if (botStates.deposit && botStates.deposit[userId]) {
      const state = botStates.deposit[userId];
      if (state.step === 'WAIT_AMOUNT') {
        const amount = parseFloat(text);
        if (isNaN(amount) || amount <= 0) return ctx.reply('❌ أدخل مبلغاً صحيحاً وموجباً:').catch(()=>{});
        state.amount = amount; state.step = 'WAIT_RECEIPT'; saveDatabase();
        return ctx.reply(`💳 **الخطوة الأخيرة:**\n\nقم بتحويل مبلغ (*${amount} EGP*) على هذا الرقم:\n📱 \`${vodafoneCashNumber}\`\n\n📸 **الآن: قم بإرسال صورة (سكرين شوت) تؤكد إتمامك للتحويل لكي يتم مراجعتها وإضافة الرصيد.**`, { parse_mode: 'Markdown' }).catch(()=>{});
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
        return res.status(500).send('DB Error'); 
    }

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
        return res.status(200).send('SMS Processed Successfully');
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
