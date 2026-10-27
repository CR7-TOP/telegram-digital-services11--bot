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
let instapayAccount = 'غير محدد'; 

// 🆕 متغيرات الدفع الرقمي الجديدة (تمت إضافتها هنا)
let bybitId = 'رقم_حسابك_هنا';
let usdtAddress = 'عنوان_المحفظة_هنا';
let usdToEgpRate = 50; // سعر صرف الدولار للجنيه

let abandonedCarts = {}; 
let usedReceipts = []; 
let stockAlerts = {}; 
let dropGroupId = ''; 
let ratings = {}; 

// 🆕 متغيرات الأنظمة الجديدة المطلوبة
let customOrders = []; 
let resellers = {}; 

let botStates = {
    deposit: {}, broadcast: {}, promo: {}, search: {}, adminInput: {}, adminLogin: {}, adminSession: {}, lastReportDate: "", buyQty: {}, ordersPage: {}, tempStock: {}, adminTempCats: {}, lastAdminCat: {}, lastAdminCatFixed: {}, transfer: {},
    customOrder: {}, pointsRedeem: {}
};

const userRequestLocks = {};

// 🛡️ دالة تعقيم المدخلات لمنع NoSQL Injection والرموز الخبيثة
function sanitizeInput(text) {
    if (typeof text !== 'string') return '';
    return text.replace(/[${\}]/g, '').replace(/<[^>]*>?/gm, '').trim();
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
                [Markup.button.url('🛒 شراء نفس المنتج', `https://t.me/${botUsername}?start=buy_${srvId}`)]
            ]);
        }

        publicSalesChannels.forEach(channel => {
            bot.telegram.sendMessage(channel, msg, {parse_mode: 'HTML', ...keyboard}).catch(()=>{});
        });
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
        if (data.instapayAccount) instapayAccount = data.instapayAccount;
        if (data.bybitId) bybitId = data.bybitId;
        if (data.usdtAddress) usdtAddress = data.usdtAddress;
        if (data.usdToEgpRate) usdToEgpRate = data.usdToEgpRate;
        
        abandonedCarts = data.abandonedCarts || {}; 
        usedReceipts = data.usedReceipts || [];
        stockAlerts = data.stockAlerts || {};
        ratings = data.ratings || {}; 
        if (data.dropGroupId !== undefined) dropGroupId = data.dropGroupId;
        
        customOrders = data.customOrders || [];
        resellers = data.resellers || {};

        if (data.publicSalesChannels !== undefined) {
            publicSalesChannels = Array.isArray(data.publicSalesChannels) ? data.publicSalesChannels : [data.publicSalesChannel];
        } else if (data.publicSalesChannel !== undefined && data.publicSalesChannel !== '') {
            publicSalesChannels = [data.publicSalesChannel];
        }

        if (data.forceSubscribeChannels !== undefined) {
            forceSubscribeChannels = Array.isArray(data.forceSubscribeChannels) ? data.forceSubscribeChannels : [data.forceSubscribeChannel];
        } else if (data.forceSubscribeChannel !== undefined && data.forceSubscribeChannel !== '') {
            forceSubscribeChannels = [data.forceSubscribeChannel];
        }
        
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
            transfer: loadedStates.transfer || {},
            customOrder: loadedStates.customOrder || {},
            pointsRedeem: loadedStates.pointsRedeem || {}
        };
    }
}

function saveDatabase() {
    try {
        const data = { usersDb, globalMarkupPercent, customMarkups, pendingDeposits, promoCodes, flashSale, vouchers, adminAuditLogs, maintenanceMode, customProductMarkups, localInventory, botStates, adCampaigns, hiddenServices, fixedPrices, vodafoneCashNumber, instapayAccount, bybitId, usdtAddress, usdToEgpRate, abandonedCarts, usedReceipts, stockAlerts, publicSalesChannels, forceSubscribeChannels, ratings, dropGroupId, customOrders, resellers }; 
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

bot.use(async (ctx, next) => {
    if (ctx.chat && ctx.chat.type !== 'private') {
        return; 
    }
    return await next();
});

const categoryCacheTime = 300000; 
let lastCategoriesFetchTime = 0;
let cachedServices = [];
let isFetchingServices = false;

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
        if (botStates && botStates.customOrder) delete botStates.customOrder[idStr];
        if (botStates && botStates.pointsRedeem) delete botStates.pointsRedeem[idStr];
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

// فحص دورة النقاط (الطلب 4)
function checkPointsCycle(userId) {
    const idStr = String(userId);
    if (!usersDb[idStr]) return;
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    if (usersDb[idStr].pointsCycleStart && Date.now() - usersDb[idStr].pointsCycleStart >= THIRTY_DAYS) {
        usersDb[idStr].points = 0;
        usersDb[idStr].pointsCycleStart = Date.now();
        saveDatabase();
    }
}

// حساب النقاط (الطلب 4)
function calculatePoints(price) {
    const p = parseFloat(price);
    if (p < 50) return 5;
    if (p < 100) return 9;
    if (p < 200) return 18;
    if (p < 400) return 25;
    if (p < 500) return 43;
    return 100;
}

// دالة حساب الترقية والموزعين (الطلب 2 و 3)
function getUserDiscount(user) {
    if (!user) return { discount: 0, level: '👤 حساب عادي' };
    const uidStr = String(user.uid);
    
    if (resellers[uidStr]) {
        return { discount: parseFloat(resellers[uidStr]), level: '🤝 موزع معتمد' };
    }
    
    const tr = parseFloat(user.totalRecharged || 0);
    if (tr >= 1000) return { discount: 9, level: '🥇 المستوى الذهبي' };
    if (tr >= 400) return { discount: 5, level: '🥈 المستوى الفضي' };
    if (tr >= 1) return { discount: 2, level: '🥉 المستوى البرونزي' };
    
    return { discount: 0, level: '👤 حساب عادي' };
}

// فحص الترقية وإشعار العميل (الطلب 3)
function checkVipUpgrade(userId, tgId) {
    let user = usersDb[userId];
    if (!user) return;
    let total = parseFloat(user.totalRecharged || 0);
    let newLevel = '';
    
    if (total >= 1000 && !user.notifiedGold) { newLevel = '🥇 الذهبي (خصم 9%)'; user.notifiedGold = true; user.notifiedSilver = true; user.notifiedBronze = true; }
    else if (total >= 400 && total < 1000 && !user.notifiedSilver) { newLevel = '🥈 الفضي (خصم 5%)'; user.notifiedSilver = true; user.notifiedBronze = true; }
    else if (total >= 1 && total < 400 && !user.notifiedBronze) { newLevel = '🥉 البرونزي (خصم 2%)'; user.notifiedBronze = true; }

    if (newLevel !== '') {
        bot.telegram.sendMessage(tgId, `🎉 <b>تهانينا! ترقية تلقائية!</b>\n\nلقد تمت ترقية حسابك إلى <b>المستوى ${newLevel}</b> بناءً على إجمالي شحناتك.\nاستمتع بالخصم المباشر على جميع الخدمات فوراً!`, {parse_mode: 'HTML'}).catch(()=>{});
        saveDatabase();
    }
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

setInterval(() => {
    try {
        if (!ADMIN_CHANNEL_ID || ADMIN_CHANNEL_ID === '') return;
        const dbDump = JSON.stringify({ usersDb, globalMarkupPercent, customMarkups, pendingDeposits, promoCodes, flashSale, vouchers, adminAuditLogs, customProductMarkups, localInventory, botStates, adCampaigns, hiddenServices, fixedPrices, vodafoneCashNumber, instapayAccount, bybitId, usdtAddress, usdToEgpRate, abandonedCarts, usedReceipts, stockAlerts, publicSalesChannels, forceSubscribeChannels, ratings, dropGroupId, customOrders, resellers }, null, 2); 
        const buffer = Buffer.from(dbDump, 'utf-8');
        bot.telegram.sendDocument(ADMIN_CHANNEL_ID, { source: buffer, filename: `XProStore_Backup_${new Date().toISOString().split('T')[0]}.json` }, { caption: `📦 نسخة احتياطية تلقائية لقاعدة البيانات\n📅 التاريخ: ${new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' })}` }).catch(()=>{});
    } catch (e) { console.error("Backup Error:", e); }
}, 24 * 60 * 60 * 1000);

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
      usersDb[idStr] = { uid: newUid, balance: 0, orders: [], walletHistory: [], isBanned: false, totalSpent: 0, referrals: 0, referredBy: null, tempCategories: [], source: null, totalRecharged: 0, points: 0, pointsCycleStart: Date.now() }; 
      saveDatabase(); 
    } else {
        if (!usersDb[idStr].orders) usersDb[idStr].orders = [];
        if (!usersDb[idStr].walletHistory) usersDb[idStr].walletHistory = [];
        if (usersDb[idStr].isBanned === undefined) usersDb[idStr].isBanned = false;
        if (usersDb[idStr].totalSpent === undefined) usersDb[idStr].totalSpent = 0;
        if (usersDb[idStr].referrals === undefined) usersDb[idStr].referrals = 0;
        if (usersDb[idStr].referredBy === undefined) usersDb[idStr].referredBy = null;
        if (!usersDb[idStr].tempCategories) usersDb[idStr].tempCategories = [];
        if (usersDb[idStr].source === undefined) usersDb[idStr].source = null;
        if (usersDb[idStr].cart) delete usersDb[idStr].cart; 
        
        if (usersDb[idStr].totalRecharged === undefined) usersDb[idStr].totalRecharged = 0;
        if (usersDb[idStr].points === undefined) usersDb[idStr].points = 0;
        if (usersDb[idStr].pointsCycleStart === undefined) usersDb[idStr].pointsCycleStart = Date.now();
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
const API_KEY_3 = 'ch_live_uOAaG2beDDH3TrfeERZB_wpekZnzmZmtuOHhromDw4w';
const apiClient3 = axios.create({ baseURL: 'https://cupponhub.shop/reseller/api', headers: { 'X-API-Key': API_KEY_3, 'Content-Type': 'application/json' }, timeout: 4500 });

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
    const n = String(name || '').toLowerCase();
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
        apiClient3.get('/?action=products')
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

    let cupponData = null;
    if (res3Result.status === 'fulfilled') {
        cupponData = res3Result.value.data;
    } else {
        try { 
            const fallback = await apiClient3.get('/?action=products'); 
            cupponData = fallback.data; 
        } catch(e) {}
    }

    if (cupponData) {
        try {
            let s3 = cupponData.products || cupponData.data || cupponData.services || cupponData;
            if (!Array.isArray(s3) && typeof s3 === 'object') {
                for (let key in s3) { if (Array.isArray(s3[key])) { s3 = s3[key]; break; } }
            }
            if (Array.isArray(s3)) {
                s3.forEach(item => { 
                    item.providerSource = 'api3'; 
                    item.name = item.name || item.name_ar || item.title || "خدمة بدون اسم";
                    let uniqueId = item.key || item.id || item.product_id || generateStableId(item.name);
                    item.id = String(uniqueId);
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
         return await apiClient3.post('/?action=purchase', { 
             product: srv.key || String(srv.id), 
             quantity: parsedQty 
         }, {
             headers: {
                 'Idempotency-Key': 'shop-order-' + Date.now() + '-' + Math.floor(Math.random() * 1000)
             }
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

// 🆕 القائمة الرئيسية محدثة بالأنظمة الجديدة (الطلبات الخاصة ونقاط الكاش باك)
function getMainMenu() {
  let keyboard = [
    ['🛍 الخدمات', '🔍 بحث عن خدمة'],
    ['🛒 طلباتي', '📝 طلب خدمة خاصة'], 
    ['💰 حسابي', '💸 تحويل رصيد'],
    ['💳 شحن الحساب', '🎁 نقاط الكاش باك'], 
    ['🔗 دعوة الأصدقاء (اربح 2%)', '📞 الدعم الفني']
  ];
  return Markup.keyboard(keyboard).resize();
}

bot.use(async (ctx, next) => {
    checkAndSendDailyReport(); 
    
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
                let cid = typeof ch === 'string' ? ch : ch.chatId;
                let clink = typeof ch === 'string' ? (ch.startsWith('@') ? `https://t.me/${ch.replace('@','')}` : null) : ch.link;

                if (clink) { buttons.push([Markup.button.url(`📢 القناة رقم ${idx + 1} ↗️`, clink)]); } 
                else { buttons.push([Markup.button.callback(`📢 القناة رقم ${idx + 1} (تواصل مع الدعم)`, 'noop')]); }
            });
            buttons.push([Markup.button.callback('تحقق من الاشتراك ✅', 'check_sub')]);

            const keyboard = Markup.inlineKeyboard(buttons);
            
            if (ctx.callbackQuery) {
                await ctx.answerCbQuery('برجاء الاشتراك أولاً!').catch(()=>{});
                await ctx.editMessageText(subMsg, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
                return;
            } else {
                await ctx.reply(subMsg, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
                return;
            }
        }
    }
    
    return await next(); 
});

function safeHtml(text) {
    return String(text || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function processBuyAction(ctx, userId, srvId) {
    try {
         initUser(userId); 
         if (!usersDb[userId] || usersDb[userId].isBanned) return;
         
         if (!cachedServices || cachedServices.length === 0) {
             if (ctx.callbackQuery) await ctx.editMessageText('⏳ لحظات جاري تجهيز الخدمة...').catch(()=>{});
             else await ctx.reply('⏳ لحظات جاري تجهيز الخدمة...').catch(()=>{});
             await backgroundServiceUpdate();
         }
         
         if (!cachedServices) cachedServices = [];

         const srv = cachedServices.find(s => String(s.id) === String(srvId));
         if(!srv) {
             if (ctx.callbackQuery) await ctx.editMessageText('❌ الخدمة غير متوفرة حالياً.').catch(()=>{});
             else await ctx.reply('❌ الخدمة غير متوفرة حالياً.').catch(()=>{});
             return;
         }

         let price = "0.00";
         try { price = calculateRetailPrice(srv, usersDb[userId], 1); } catch(e){}
         
         const srvName = srv.name_ar || srv.name || srv.title || 'خدمة';

         if (!abandonedCarts) abandonedCarts = {};
         abandonedCarts[userId] = { time: Date.now(), srvName: srvName }; 
         saveDatabase();

         const safeName = safeHtml(srvName);
         const txt = `⚠️ <b>إدخال الكمية المطلوبة:</b>\n\n🛍 <b>الخدمة:</b> ${safeName}\n💰 السعر للقطعة: <b>${price} EGP</b>\n\n✍️ <b>من فضلك، أرسل الكمية المطلوبة الآن في رسالة (أرقام فقط):</b>`;
         const keyboard = Markup.inlineKeyboard([[Markup.button.callback('❌ إلغاء العملية', 'cancel_action')]]);
         
         let msg;
         if (ctx.callbackQuery) {
             msg = await ctx.editMessageText(txt, {parse_mode: 'HTML', ...keyboard}).catch(e => { return null; });
         } else {
             msg = await ctx.reply(txt, {parse_mode: 'HTML', ...keyboard}).catch(e => { return null; });
         }

         if (msg && msg.message_id) {
             if (!botStates) botStates = {};
             if (!botStates.buyQty) botStates.buyQty = {};
             botStates.buyQty[userId] = { srvId: String(srv.id), msgId: msg.message_id };
             saveDatabase();
         }
    } catch(err) {
        let errMsg = err.message || "مجهول";
        if (ctx.callbackQuery) {
             await ctx.editMessageText("❌ حدث خطأ داخلي: " + errMsg).catch(()=>{});
        } else {
             await ctx.reply("❌ حدث خطأ داخلي: " + errMsg).catch(()=>{});
        }
    }
}

bot.start(async (ctx) => {
  try {
    const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);

    if (usersDb[userId] && usersDb[userId].isBanned) {
        return await ctx.reply('❌ عذراً، تم حظرك من استخدام هذا البوت.').catch(()=>{});
    }
    if (maintenanceMode && String(usersDb[userId].uid) !== '1001') {
        return await ctx.reply('🛠 **المتجر في حالة صيانة حالياً**\nنعمل على تحديث الخدمات، عودوا قريباً جداً!', { parse_mode: 'Markdown' }).catch(()=>{});
    }

    let payload = null;
    if (ctx.message && ctx.message.text) {
        const parts = ctx.message.text.split(' ');
        if (parts.length > 1) payload = parts[1];
    }

    if (payload) {
        if (payload.startsWith('buy_')) {
            const srvId = payload.split('buy_')[1];
            await processBuyAction(ctx, userId, srvId); return; 
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

    await ctx.reply('أهلاً بك مجدداً في متجر أحمد! 🚀\n🆔 رقم الحساب الفريد الخاص بك: `' + usersDb[userId].uid + '`', { parse_mode: 'Markdown', ...getMainMenu() }).catch(()=>{});
  } catch (err) {}
});

bot.action('check_sub', async (ctx) => {
    const userId = String(ctx.from.id); initUser(userId);
    if (!forceSubscribeChannels || forceSubscribeChannels.length === 0) {
        ctx.deleteMessage().catch(()=>{});
        return await ctx.reply('أهلاً بك مجدداً في متجر أحمد! 🚀\n🆔 رقم الحساب الفريد الخاص بك: `' + usersDb[userId].uid + '`', { parse_mode: 'Markdown', ...getMainMenu() }).catch(()=>{});
    }
    try {
        let isSubbedToAll = true;
        for (let channelObj of forceSubscribeChannels) {
            let cid = typeof channelObj === 'string' ? channelObj : channelObj.chatId;
            try {
                const member = await ctx.telegram.getChatMember(cid, userId);
                if (!['member', 'administrator', 'creator'].includes(member.status)) { isSubbedToAll = false; break; }
            } catch(e) { isSubbedToAll = false; break; }
        }

        if (isSubbedToAll) {
            await ctx.answerCbQuery('✅ شكراً لاشتراكك! يمكنك الآن استخدام متجر أحمد.', {show_alert: true}).catch(()=>{});
            ctx.deleteMessage().catch(()=>{});
            await ctx.reply('أهلاً بك مجدداً في متجر أحمد! 🚀\n🆔 رقم الحساب الفريد الخاص بك: `' + usersDb[userId].uid + '`', { parse_mode: 'Markdown', ...getMainMenu() }).catch(()=>{});
        } else {
            await ctx.answerCbQuery('❌ عذراً، برجاء الاشتراك في جميع القنوات أولاً!', { show_alert: true }).catch(()=>{});
        }
    } catch (e) {
        await ctx.answerCbQuery('❌ حدث خطأ، تأكد أن البوت مرفوع كأدمن في القنوات.').catch(()=>{});
    }
});

// 🆕 تعديل التسعير للخصم من السعر النهائي مباشرة للموزع أو الـ VIP
function calculateRetailPrice(service, user, quantity = 1) {
  try {
    const srvIdStr = String(service.id);
    const { discount } = getUserDiscount(user); // جلب نسبة الخصم
    
    if (fixedPrices && fixedPrices[srvIdStr] !== undefined) {
        let fp = parseFloat(fixedPrices[srvIdStr]);
        if (flashSale && flashSale.active && Date.now() < flashSale.expiresAt) {
            fp = fp - (fp * (flashSale.discount / 100));
        }
        // تطبيق خصم الموزع أو VIP على السعر الثابت
        if (discount > 0) fp = fp - (fp * (discount / 100));
        return (fp * quantity).toFixed(2);
    }

    const originalPrice = parseFloat(service.price_amount || service.price || 0);
    const cat = getServiceCategory(service);

    let markup = parseFloat(globalMarkupPercent) || 0;
    if (customMarkups && customMarkups[cat] !== undefined) { markup = parseFloat(customMarkups[cat]); }
    if (customProductMarkups && customProductMarkups[srvIdStr] !== undefined) { markup = parseFloat(customProductMarkups[srvIdStr]); }

    let finalPrice = originalPrice * (1 + (markup / 100));
    
    // تطبيق خصم الموزع أو الـ VIP مباشرة من السعر النهائي
    if (discount > 0) {
        finalPrice = finalPrice - (finalPrice * (discount / 100));
    }

    if (flashSale && flashSale.active) {
        if (Date.now() < flashSale.expiresAt) {
            finalPrice = finalPrice - (finalPrice * (flashSale.discount / 100));
        } else {
            flashSale.active = false; saveDatabase();
        }
    }
    return (finalPrice * quantity).toFixed(2);
  } catch(e) {
    return '0.00';
  }
}

async function showProfile(ctx) {
    const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
    const user = usersDb[userId];
    if (user.isBanned) return await ctx.reply('❌ تم حظرك.').catch(()=>{});
    
    // 🆕 تحديث عرض المستوى بحسب النظام الجديد
    const { level } = getUserDiscount(user);
    
    await ctx.reply('👤 **حسابي الشخصي:**\n\n🆔 رقم الحساب: `' + user.uid + '`\n🔰 الرتبة: ' + level + '\n💳 الرصيد الحالي: *' + parseFloat(user.balance).toFixed(2) + ' EGP*\n🛍 إجمالي المشتريات: ' + user.totalSpent.toFixed(2) + ' EGP\n💸 إجمالي الشحن: ' + parseFloat(user.totalRecharged || 0).toFixed(2) + ' EGP', { parse_mode: 'Markdown' }).catch(()=>{});
}

// 🆕 نظام الشحن المحدث باختيار طريقة الدفع
async function showDepositFlow(ctx) {
    const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
    if (usersDb[userId].isBanned) return;
    const hasPending = pendingDeposits.some(p => p.userId === userId);
    if(hasPending) return await ctx.reply('❌ **لا يمكنك تقديم طلب شحن جديد!**\nلديك بالفعل طلب شحن قيد المراجعة.', {parse_mode: 'Markdown'}).catch(()=>{});
    
    await ctx.reply('💳 **اختر طريقة الشحن المناسبة لك:**', {
        parse_mode: 'Markdown',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('🔴 فودافون كاش', 'dep_method_vfcash'), Markup.button.callback('🟣 انستاباي', 'dep_method_instapay')],
            [Markup.button.callback('🟡 منصة Bybit', 'dep_method_bybit'), Markup.button.callback('🟢 محفظة USDT', 'dep_method_usdt')]
        ])
    }).catch(()=>{});
}

// 🆕 التعامل مع زر اختيار طريقة الدفع
bot.action(/^dep_method_(.+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    const method = ctx.match[1]; 
    const userId = String(ctx.from.id);
    if (!botStates) botStates = {};
    if (!botStates.deposit) botStates.deposit = {};
    botStates.deposit[userId] = { step: 'WAIT_AMOUNT', method: method };
    saveDatabase();

    let methodText = '';
    let currencyText = 'بالجنيه المصري (مثال: 100)';
    if (method === 'vfcash') methodText = 'فودافون كاش';
    else if (method === 'instapay') methodText = 'انستاباي (InstaPay)';
    else if (method === 'bybit') { methodText = 'منصة Bybit'; currencyText = 'بالدولار (USDT) (مثال: 5)'; }
    else if (method === 'usdt') { methodText = 'محفظة USDT'; currencyText = 'بالدولار (USDT) (مثال: 10)'; }

    await ctx.editMessageText(`💳 **شحن الحساب عبر (${methodText})**\n\nمن فضلك أكتب **المبلغ** اللي هتحوله ${currencyText}:`, {parse_mode: 'Markdown'}).catch(()=>{});
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

// 🆕 نظام النقاط والكاش باك المستدعى من الأزرار
bot.hears(/نقاط الكاش باك/, async (ctx) => {
    try {
        const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
        if (usersDb[userId].isBanned) return;
        
        checkPointsCycle(userId); // التأكد من دورة الـ 30 يوم
        const pts = usersDb[userId].points || 0;

        const msg = `🎁 **نظام نقاط الولاء والكاش باك!**\n\n` +
                    `يتم احتساب النقاط تلقائياً مع كل عملية شراء، ويمكنك تحويلها لرصيد في محفظتك.\n\n` +
                    `⭐ **نقاطك الحالية:** <b>${pts} نقطة</b>\n\n` +
                    `⚠️ <b>تنبيه:</b> يتم إعادة تعيين نقاط الكاش باك تلقائياً كل 30 يوم لتبدأ دورة تجميع جديدة.`;

        await ctx.reply(msg, {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('💵 سحب النقاط لرصيد', 'redeem_points')]])
        }).catch(()=>{});
    } catch(e){}
});

bot.action('redeem_points', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    const userId = String(ctx.from.id); initUser(userId);
    const pts = usersDb[userId].points || 0;

    if (pts < 1500) {
        return await ctx.editMessageText('❌ عذراً، أقل حد مسموح لسحب النقاط هو 1500 نقطة.', Markup.inlineKeyboard([[Markup.button.callback('🏠 القائمة الرئيسية', 'main_menu')]])).catch(()=>{});
    }

    if (!botStates) botStates = {};
    if (!botStates.pointsRedeem) botStates.pointsRedeem = {};
    botStates.pointsRedeem[userId] = true;
    saveDatabase();

    await ctx.editMessageText(`💵 سحب النقاط لرصيد:\n\nلديك حالياً <b>${pts}</b> نقطة.\nالحد الأدنى للسحب هو 1500 نقطة (= 50 جنيه).\n\n✍️ <b>اكتب عدد النقاط التي ترغب بسحبها الآن في رسالة:</b>`, {parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('❌ إلغاء', 'cancel_action')]])}).catch(()=>{});
});

// 🆕 نظام الطلبات الخاصة 
bot.hears(/طلب خدمة خاصة/, async (ctx) => {
    try {
        const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
        if (usersDb[userId].isBanned) return;
        
        if (!botStates) botStates = {};
        if (!botStates.customOrder) botStates.customOrder = {};
        botStates.customOrder[userId] = true;
        saveDatabase();

        await ctx.reply('📝 **طلب خدمة خاصة:**\n\nأرسل تفاصيل الخدمة التي تبحث عنها وغير موجودة في المتجر، وسنقوم بتوفيرها وتسعيرها لك في أسرع وقت:', {parse_mode: 'Markdown'}).catch(()=>{});
    } catch(e){}
});

bot.hears(/سجل المحفظة/, async (ctx) => {
    try {
      const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
      if (usersDb[userId].isBanned) return;
      const history = usersDb[userId].walletHistory || [];
      if (history.length === 0) return await ctx.reply('📜 لا توجد معاملات مالية مسجلة حتى الآن.').catch(()=>{});
      let msg = '📜 **سجل المعاملات المالية (آخر 10 عمليات):**\n\n';
      history.slice(-10).reverse().forEach(item => {
          msg += '🔹 ' + item.type + ': *' + parseFloat(item.amount).toFixed(2) + ' EGP*\n🕒 ' + item.date + '\n━━━━━━━━━━━━\n';
      });
      await ctx.reply(msg, { parse_mode: 'Markdown' }).catch(()=>{});
    } catch(e){}
});

bot.hears(/تحويل رصيد/, async (ctx) => {
    try {
        const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
        if (usersDb[userId].isBanned) return;
        if (!botStates) botStates = {};
        if (!botStates.transfer) botStates.transfer = {};
        botStates.transfer[userId] = { step: 'WAIT_UID' }; saveDatabase();
        await ctx.reply('💸 **تحويل رصيد لصديق:**\n\nيرجى إرسال الـ **ID** (رقم الحساب الفريد) للشخص الذي تريد التحويل إليه:').catch(()=>{});
    } catch(e){}
});

bot.hears(/استخدام كود خصم/, async (ctx) => {
    try {
      const userId = String(ctx.from.id); initUser(userId); clearUserStates(userId);
      if (usersDb[userId].isBanned) return;
      if (!botStates) botStates = {};
      if (!botStates.promo) botStates.promo = {};
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
      if (!botStates) botStates = {};
      if (!botStates.search) botStates.search = {};
      botStates.search[userId] = true; saveDatabase();
      await ctx.reply('🔍 أرسل اسم الخدمة التي تبحث عنها (مثال: Canva أو نتفلكس) أو اكتب `Ahmed/` لتسجيل دخول الأدمن:').catch(()=>{});
    } catch(e){}
});

async function showCategories(ctx) {
  const userId = String(ctx.from.id);
  try {
    initUser(userId); clearUserStates(userId);

    if (usersDb[userId].isBanned) return await ctx.reply('❌ عذراً، تم حظرك من استخدام هذا البوت.').catch(()=>{});
    if (maintenanceMode && String(usersDb[userId].uid) !== '1001') return await ctx.reply('🛠 **المتجر في حالة صيانة حالياً**\nنعمل على تحديث الخدمات، عودوا قريباً جداً!', { parse_mode: 'Markdown' }).catch(()=>{});

    if (cachedServices.length === 0) {
        if(ctx.callbackQuery) {
            await ctx.editMessageText('⏳ جاري ربط السيرفرات السريعة...').catch(()=>{});
        } else {
            await ctx.reply('⏳ جاري ربط السيرفرات السريعة...').catch(()=>{});
        }
        await backgroundServiceUpdate();
    } else if (Date.now() - lastCategoriesFetchTime > categoryCacheTime) {
        backgroundServiceUpdate();
    }

    if (cachedServices.length === 0) {
        const errorMsg = '⚠️ تعذر جلب الخدمات حالياً، يرجى المحاولة بعد قليل.';
        const retryKeyboard = Markup.inlineKeyboard([[Markup.button.callback('🔄 إعادة المحاولة', 'main_categories')]]);
        if(ctx.callbackQuery) return await ctx.editMessageText(errorMsg, retryKeyboard).catch(()=>{});
        else return await ctx.reply(errorMsg, retryKeyboard).catch(()=>{});
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

    if (!usersDb[userId].tempCategories) usersDb[userId].tempCategories = [];
    usersDb[userId].tempCategories = categories;
    saveDatabase();

    if(ctx.callbackQuery) {
        return await ctx.editMessageText('اختر الفئة:', keyboard).catch(()=>{});
    } else {
        return await ctx.reply('اختر الفئة:', keyboard).catch(()=>{});
    }

  } catch (error) {
    const errMsg = '❌ حدث خطأ مؤقت أثناء جلب الأقسام، يرجى المحاولة مجدداً.';
    const retryBtn = Markup.inlineKeyboard([[Markup.button.callback('🔄 إعادة المحاولة', 'main_categories')]]);
    if(ctx.callbackQuery) {
        await ctx.editMessageText(errMsg, retryBtn).catch(()=>{});
    } else {
        await ctx.reply(errMsg, retryBtn).catch(()=>{});
    }
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

bot.action('main_categories', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{}); 
    await showCategories(ctx);
});

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
// 🛡️ لوحة تحكم الإدارة (الأنظمة الجديدة والقديمة)
// ==========================================
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
        totalUsers++; 
        totalBalances += parseFloat(usersDb[id].balance || 0); 
        totalStoreSpent += parseFloat(usersDb[id].totalSpent || 0); 
        totalOrdersCount += (usersDb[id].orders ? usersDb[id].orders.length : 0);
    }

    const pendingCO = customOrders.filter(c => c.status === 'Pending').length; 

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
        [Markup.button.callback('📝 طلبات خاصة معلقة (' + pendingCO + ')', 'admin_custom_orders'), Markup.button.callback('🤝 إدارة الموزعين', 'admin_resellers')],
        [Markup.button.callback('📉 إعلان انخفاض سعر (دروب)', 'admin_price_drop')],
        [Markup.button.callback('🔔 فحص وإرسال تذكيرات التجديد', 'admin_scan_renewals')],
        [Markup.button.callback('🎁 إرسال كود دروب', 'admin_send_drop'), Markup.button.callback('⚙️ جروب الدروب', 'admin_set_drop_group')],
        [Markup.button.callback('🔄 تحديث وسحب الخدمات يدوياً', 'admin_force_refresh')],
        [Markup.button.callback('📱 تغيير رقم الكاش', 'admin_change_wallet'), Markup.button.callback('🏦 تغيير حساب انستاباي', 'admin_change_instapay')],
        [Markup.button.callback('📢 إضافة قناة مبيعات', 'admin_set_sales_channel'), Markup.button.callback('🔒 إضافة قناة اشتراك الإجباري', 'admin_set_force_sub')],
        [Markup.button.callback('💳 طلبات الشحن (' + (pendingDeposits ? pendingDeposits.length : 0) + ')', 'admin_pending_deposits')],
        [Markup.button.callback('💰 فحص رصيد المزود', 'admin_check_api_balance'), Markup.button.callback('🟢 فحص حالة المزود (API)', 'admin_check_api_status')],
        [Markup.button.callback('🎯 نسبة ربح لمنتج', 'admin_search_markup'), Markup.button.callback('📦 مخزن المنتجات المحلي', 'admin_search_stock')],
        [Markup.button.callback('💲 تحديد سعر ثابت لمنتج', 'admin_fixed_price'), Markup.button.callback('👁️ إخفاء/إظهار منتج', 'admin_hide_cats')],
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
            await ctx.deleteMessage().catch(()=>{});
            await ctx.reply(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
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

// ==========================================
// 🛡️ إدارة الموزعين والطلبات الخاصة
// ==========================================
bot.action('admin_resellers', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    const totalResellers = Object.keys(resellers).length;
    let text = `🤝 <b>إدارة الموزعين والوكلاء:</b>\n\nعدد الموزعين الحاليين: <b>${totalResellers}</b>\n\n`;
    for (let uid in resellers) {
        text += `🔹 ID: <code>${uid}</code> | الخصم: <b>${resellers[uid]}%</b>\n`;
    }
    await ctx.editMessageText(text, {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
            [Markup.button.callback('➕ إضافة أو تعديل موزع', 'add_reseller')],
            [Markup.button.callback('🗑️ إلغاء موزع', 'rem_reseller')],
            [Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]
        ])
    }).catch(()=>{});
});

bot.action('add_reseller', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_RESELLER_DATA'; saveDatabase();
    await ctx.editMessageText('➕ <b>إضافة أو تعديل موزع:</b>\n\nأرسل الآيدي (ID) الخاص بالعميل ونسبة الخصم الخاصة به (بينهم مسافة):\nمثال: <code>123456789 15</code> (لإعطائه خصم 15%)', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_resellers')]]) }).catch(()=>{});
});

bot.action('rem_reseller', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_RESELLER_REM'; saveDatabase();
    await ctx.editMessageText('🗑️ <b>إلغاء رتبة موزع:</b>\n\nأرسل الآيدي (ID) الخاص بالعميل لإلغاء رتبته وإعادته كعميل عادي:', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_resellers')]]) }).catch(()=>{});
});

bot.action('admin_custom_orders', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    const pendingOrders = customOrders.filter(c => c.status === 'Pending');
    if (pendingOrders.length === 0) {
        return await ctx.editMessageText('📝 <b>الطلبات الخاصة:</b>\n\nلا توجد طلبات معلقة حالياً.', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
    }

    let text = `📝 <b>الطلبات الخاصة المعلقة (${pendingOrders.length}):</b>\n\n`;
    let buttons = [];
    pendingOrders.slice(0, 10).forEach(order => {
        text += `🔹 طلب رقم: <b>#${order.id}</b>\n👤 ID العميل: <code>${order.userUid}</code>\n📅 التاريخ: ${order.date}\n📄 التفاصيل:\n<code>${order.details}</code>\n━━━━━━━━━━━━\n`;
        buttons.push([Markup.button.callback(`💰 تسعير الطلب #${order.id}`, `coprice_${order.id}`)]);
    });
    buttons.push([Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]);

    await ctx.editMessageText(text, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
});

bot.action(/^coprice_(.+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    const orderId = ctx.match[1];
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_CO_PRICE_' + orderId; saveDatabase();
    await ctx.editMessageText(`💰 <b>تسعير الطلب رقم #${orderId}:</b>\n\nأرسل السعر المطلوب لإتمام هذا الطلب بالجنيه (أرقام فقط):\n\nأو اكتب <code>رفض</code> لرفض الطلب.`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_custom_orders')]]) }).catch(()=>{});
});

bot.action(/^copay_(.+)_([\d\.]+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    const userId = String(ctx.from.id); initUser(userId);
    const orderId = ctx.match[1];
    const price = parseFloat(ctx.match[2]);

    const orderIndex = customOrders.findIndex(o => String(o.id) === String(orderId));
    if (orderIndex === -1 || customOrders[orderIndex].status !== 'Priced') {
        return await ctx.editMessageText('❌ هذا الطلب غير متاح للدفع أو تم تنفيذه مسبقاً.').catch(()=>{});
    }

    if (usersDb[userId].balance < price) {
        return await ctx.editMessageText(`❌ <b>رصيدك غير كافٍ!</b>\n\nرصيدك: ${usersDb[userId].balance.toFixed(2)} EGP\nالمطلوب: ${price} EGP\n\nيرجى شحن محفظتك أولاً.`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('💳 شحن الحساب', 'main_categories')]]) }).catch(()=>{});
    }

    usersDb[userId].balance -= price;
    usersDb[userId].totalSpent += price;
    usersDb[userId].walletHistory.push({ type: `دفع طلب خاص #${orderId}`, amount: -price, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
    
    const pointsGained = calculatePoints(price);
    usersDb[userId].points = (usersDb[userId].points || 0) + pointsGained;

    customOrders[orderIndex].status = 'Paid';
    saveDatabase();

    await ctx.editMessageText(`✅ <b>تم الدفع بنجاح!</b>\n\nتم خصم ${price} EGP من محفظتك.\nسيتم تنفيذ طلبك وإرسال التفاصيل لك قريباً!`, { parse_mode: 'HTML' }).catch(()=>{});
    notifyAdmin(`🚀 <b>دفع طلب خاص!</b>\n\nالعميل (ID: <code>${usersDb[userId].uid}</code>) قام بدفع مبلغ ${price} EGP للطلب الخاص رقم #${orderId}.\n\nالرجاء البدء في تجهيز الخدمة وإرسالها للعميل عبر (مراسلة عميل بالـ ID).`);
});

// ==========================================
// 🛡️ أزرار الإدارة الشاملة
// ==========================================
bot.action(/^admin_services_api_pg_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery('⏳ جاري جلب الخدمات...').catch(()=>{});
    try {
        if (!cachedServices || cachedServices.length === 0) { await backgroundServiceUpdate(); }
        const visibleServices = cachedServices.filter(s => !hiddenServices.includes(String(s.id)));
        if (visibleServices.length === 0) {
            return await ctx.editMessageText('❌ لا توجد خدمات ظاهرة حالياً.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]])).catch(()=>{});
        }
        const page = parseInt(ctx.match[1]) || 1;
        const itemsPerPage = 15;
        const totalPages = Math.ceil(visibleServices.length / itemsPerPage) || 1;
        const currentPage = Math.min(Math.max(page, 1), totalPages);
        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, visibleServices.length);
        const pageItems = visibleServices.slice(startIndex, endIndex);

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
        let buttons = [];
        if (totalPages > 1) buttons.push(paginationRow);
        buttons.push([Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]);

        await ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
    } catch (e) {
        await ctx.editMessageText('❌ حدث خطأ أثناء جلب الخدمات.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]])).catch(()=>{});
    }
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
    await ctx.editMessageText('💰 أرسل السعر الجديد للمنتج بالجنيه المصري (سيتم حسابه وتحديثه كـ سعر ثابت تلقائياً):', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));
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
    let sentCount = 0; const now = Date.now();
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
                    const safeName = safeHtml(order.name);
                    bot.telegram.sendMessage(uid, `⚠️ **تذكير تجديد اشتراك!**\n\nمرحباً، اشتراكك في الخدمة: **${safeName}** يوشك على الانتهاء.\n\nاضغط على الزر بالأسفل لتجديده الآن بضغطة واحدة وتجنب الانقطاع! 🚀`, {
                        parse_mode: 'HTML',
                        ...Markup.inlineKeyboard([[Markup.button.callback('🛒 تجديد الاشتراك الفوري', `buyact_${order.srvId}`)]])
                    }).catch(()=>{});
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
    await ctx.editMessageText('📱 **تغيير رقم الاستقبال:**\n\nأرسل الرقم الجديد لمحفظة فودافون كاش الخاص بك:', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_change_instapay', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_NEW_INSTAPAY'; saveDatabase();
    await ctx.editMessageText('🏦 **تغيير حساب انستاباي:**\n\nأرسل اليوزرنيم أو عنوان الدفع (عنوان التخاطر) الخاص بحساب انستاباي الجديد:', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_set_sales_channel', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_SALES_CHANNEL'; saveDatabase();
    await ctx.editMessageText('📢 **إضافة قنوات المبيعات الحية:**\n\nفقط أرسل **رابط القناة** مباشرة (مثال: <code>https://t.me/AhmedStore</code>).\n\n🛑 لحذف جميع قنوات المبيعات أرسل كلمة: <code>إيقاف</code>', { parse_mode: 'HTML', disable_web_page_preview: true, ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_set_force_sub', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_FORCE_SUB'; saveDatabase();
    await ctx.editMessageText('🔒 **إضافة قنوات الاشتراك الإجباري:**\n\n✨ **أرسل رابط القناة مباشرة**\nمثال: <code>https://t.me/AhmedStore</code>\n\n🛑 لإلغاء وحذف جميع القنوات أرسل كلمة: <code>إيقاف</code>', { parse_mode: 'HTML', disable_web_page_preview: true, ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_force_refresh', async (ctx) => {
    ctx.answerCbQuery('⏳ جاري سحب أحدث الخدمات بالقوة من المزودين...').catch(()=>{});
    try {
        isFetchingServices = false;
        await backgroundServiceUpdate();
        await ctx.reply('✅ **تم بنجاح!**\nتم سحب وتحديث جميع الخدمات من المزودين في ذاكرة البوت.', { parse_mode: 'HTML' }).catch(()=>{});
    } catch (e) { await ctx.reply('❌ حدث خطأ أثناء التحديث اليدوي. حاول مجدداً.').catch(()=>{}); }
});

bot.action('admin_hide_cats', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        const userId = String(ctx.from.id);
        if (cachedServices.length === 0) await backgroundServiceUpdate();
        let fetchedCategories = [];
        cachedServices.forEach(s => { let catStr = getServiceCategory(s); if (catStr && !fetchedCategories.includes(catStr)) fetchedCategories.push(catStr); });
        let categories = [];
        preferredCategoriesOrder.forEach(cat => { if (fetchedCategories.includes(cat)) categories.push(cat); });
        fetchedCategories.forEach(cat => { if (!categories.includes(cat) && cat !== 'أخرى') categories.push(cat); });
        if (fetchedCategories.includes('أخرى') && !categories.includes('أخرى')) categories.push('أخرى');

        if (!botStates.adminTempCats) botStates.adminTempCats = {};
        botStates.adminTempCats[userId] = categories; saveDatabase();

        let buttons = [];
        for (let i = 0; i < categories.length; i += 2) {
            const row = [];
            row.push(Markup.button.callback('📁 ' + categories[i], 'admin_hcat_' + i));
            if (i + 1 < categories.length) row.push(Markup.button.callback('📁 ' + categories[i+1], 'admin_hcat_' + (i + 1)));
            buttons.push(row);
        }
        buttons.push([Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]);

        await ctx.editMessageText('👁️ <b>إدارة إخفاء وإظهار المنتجات:</b>\nاختر القسم الذي تريد تعديل خدماته:', { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
    } catch (e) {}
});

bot.action(/^admin_hcat_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        const userId = String(ctx.from.id);
        const catIndex = parseInt(ctx.match[1]);
        if (!botStates.adminTempCats || !botStates.adminTempCats[userId]) return await ctx.editMessageText('❌ انتهت الجلسة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_hide_cats')]])).catch(()=>{});
        
        const selectedCategory = botStates.adminTempCats[userId][catIndex];
        if (!botStates.lastAdminCat) botStates.lastAdminCat = {};
        botStates.lastAdminCat[userId] = catIndex; saveDatabase();
        if (cachedServices.length === 0) await backgroundServiceUpdate();

        const categoryServices = cachedServices.filter(s => { let cat = getServiceCategory(s); return cat === selectedCategory || cat.toLowerCase().includes(selectedCategory.toLowerCase()) || selectedCategory.toLowerCase().includes(cat.toLowerCase()); });
        if (categoryServices.length === 0) return await ctx.editMessageText('لا توجد خدمات حالياً في هذا القسم.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للأقسام', 'admin_hide_cats')]])).catch(()=>{});

        let buttons = categoryServices.map(srv => {
            const isHidden = hiddenServices.includes(String(srv.id));
            let btnText = (isHidden ? '🔴 مخفي: ' : '🟢 ظاهر: ') + (srv.name_ar || srv.name || srv.title);
            if (btnText.length > 40) btnText = btnText.substring(0, 38) + '..'; 
            return [Markup.button.callback(btnText, `thide_${srv.id}`)];
        });
        buttons.push([Markup.button.callback('🔙 رجوع لأقسام الإخفاء', 'admin_hide_cats')]);

        await ctx.editMessageText(`👁️ خدمات قسم <b>${selectedCategory}</b>:\n\nاضغط على أي خدمة لتغيير حالتها (ظاهر/مخفي):`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
    } catch(e) {}
});

bot.action(/^thide_(.+)$/, async (ctx) => {
    ctx.answerCbQuery('⏳ جاري تغيير حالة المنتج...').catch(()=>{});
    try {
        const userId = String(ctx.from.id); const srvId = ctx.match[1];
        if (hiddenServices.includes(srvId)) { hiddenServices = hiddenServices.filter(id => id !== srvId); } 
        else { hiddenServices.push(srvId); }
        saveDatabase();

        const catIndex = botStates.lastAdminCat ? botStates.lastAdminCat[userId] : null;
        if (catIndex !== undefined && catIndex !== null && botStates.adminTempCats && botStates.adminTempCats[userId]) {
            const selectedCategory = botStates.adminTempCats[userId][catIndex];
            const categoryServices = cachedServices.filter(s => { let cat = getServiceCategory(s); return cat === selectedCategory || cat.toLowerCase().includes(selectedCategory.toLowerCase()) || selectedCategory.toLowerCase().includes(cat.toLowerCase()); });

            let buttons = categoryServices.map(srv => {
                const isHidden = hiddenServices.includes(String(srv.id));
                let btnText = (isHidden ? '🔴 مخفي: ' : '🟢 ظاهر: ') + (srv.name_ar || srv.name || srv.title);
                if (btnText.length > 40) btnText = btnText.substring(0, 38) + '..';
                return [Markup.button.callback(btnText, `thide_${srv.id}`)];
            });
            buttons.push([Markup.button.callback('🔙 رجوع لأقسام الإخفاء', 'admin_hide_cats')]);

            await ctx.editMessageText(`👁️ خدمات قسم <b>${selectedCategory}</b>:\n\nاضغط على أي خدمة لتغيير حالتها (ظاهر/مخفي):`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
        }
    } catch(e) {}
});

bot.action('admin_fixed_price', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        const userId = String(ctx.from.id);
        if (cachedServices.length === 0) await backgroundServiceUpdate();
        let fetchedCategories = [];
        cachedServices.forEach(s => { let catStr = getServiceCategory(s); if (catStr && !fetchedCategories.includes(catStr)) fetchedCategories.push(catStr); });
        let categories = [];
        preferredCategoriesOrder.forEach(cat => { if (fetchedCategories.includes(cat)) categories.push(cat); });
        fetchedCategories.forEach(cat => { if (!categories.includes(cat) && cat !== 'أخرى') categories.push(cat); });
        if (fetchedCategories.includes('أخرى') && !categories.includes('أخرى')) categories.push('أخرى');

        if (!botStates.adminTempCats) botStates.adminTempCats = {};
        botStates.adminTempCats[userId] = categories; saveDatabase();

        let buttons = [];
        for (let i = 0; i < categories.length; i += 2) {
            const row = [];
            row.push(Markup.button.callback('📁 ' + categories[i], 'admin_fcat_' + i));
            if (i + 1 < categories.length) row.push(Markup.button.callback('📁 ' + categories[i+1], 'admin_fcat_' + (i + 1)));
            buttons.push(row);
        }
        buttons.push([Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]);

        await ctx.editMessageText('💲 <b>إدارة الأسعار الثابتة:</b>\nاختر القسم الذي تريد تعديل أسعار خدماته:', { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
    } catch (e) {}
});

bot.action(/^admin_fcat_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        const userId = String(ctx.from.id);
        const catIndex = parseInt(ctx.match[1]);
        if (!botStates.adminTempCats || !botStates.adminTempCats[userId]) return await ctx.editMessageText('❌ انتهت الجلسة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_fixed_price')]])).catch(()=>{});
        
        const selectedCategory = botStates.adminTempCats[userId][catIndex];
        if (!botStates.lastAdminCatFixed) botStates.lastAdminCatFixed = {};
        botStates.lastAdminCatFixed[userId] = catIndex; saveDatabase();
        if (cachedServices.length === 0) await backgroundServiceUpdate();

        const categoryServices = cachedServices.filter(s => { let cat = getServiceCategory(s); return cat === selectedCategory || cat.toLowerCase().includes(selectedCategory.toLowerCase()) || selectedCategory.toLowerCase().includes(cat.toLowerCase()); });
        if (categoryServices.length === 0) return await ctx.editMessageText('لا توجد خدمات حالياً في هذا القسم.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للأقسام', 'admin_fixed_price')]])).catch(()=>{});

        let buttons = categoryServices.map(srv => {
            const fp = fixedPrices[String(srv.id)];
            let btnText = (fp ? `[${fp}ج] ` : '⏳ ') + (srv.name_ar || srv.name || srv.title);
            if (btnText.length > 40) btnText = btnText.substring(0, 38) + '..'; 
            return [Markup.button.callback(btnText, `setfixed_${srv.id}`)];
        });
        buttons.push([Markup.button.callback('🔙 رجوع لأقسام الأسعار', 'admin_fixed_price')]);

        await ctx.editMessageText(`💲 خدمات قسم <b>${selectedCategory}</b>:\n\nاضغط على أي خدمة لتحديد سعر ثابت لها (سيتجاهل نسبة الربح):`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
    } catch(e) {}
});

bot.action(/^setfixed_(.+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_SET_FIXED_' + ctx.match[1]; saveDatabase();
    await ctx.editMessageText('💲 أرسل السعر الثابت الجديد للمنتج بالجنيه المصري (مثال: 150).\n\n🗑️ لإلغاء السعر الثابت والعودة لنظام النسبة المئوية، اكتب كلمة: <code>حذف</code>\n🔙 للإلغاء والرجوع، اكتب كلمة: <code>رجوع</code>', {parse_mode: 'HTML'}).catch(()=>{});
});

bot.action('admin_ad_stats', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        let msg = '📈 **إحصائيات الحملات الإعلانية:**\n\n';
        if (!adCampaigns || Object.keys(adCampaigns).length === 0) {
            msg += 'لا توجد بيانات أو حملات حتى الآن.';
        } else {
            for (let camp in adCampaigns) { msg += `🔹 إعلان (${camp}): دخول ${adCampaigns[camp]} عميل جديد\n`; }
        }
        await ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
    } catch (e) {}
});

bot.action('admin_profit_report', async (ctx) => {
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
                    if (order.profit !== undefined && !isNaN(parseFloat(order.profit))) { profit = parseFloat(order.profit); } 
                    else { const price = parseFloat(order.price || 0); profit = isNaN(price) ? 0 : price - (price / (1 + (globalMarkupPercent / 100))); }
                    totalProfit += profit;
                    if (order.date && order.date.includes(todayStr)) { todayProfit += profit; } 
                    else if (order.date && order.date.includes(yesterdayStr)) { yesterdayProfit += profit; }
                });
            }
        }
        const msg = `💸 **تقرير أرباح المتجر:**\n\n📅 **أرباح اليوم:** <b>${todayProfit.toFixed(2)} EGP</b>\n📆 **أرباح أمس:** <b>${yesterdayProfit.toFixed(2)} EGP</b>\n📈 **إجمالي الأرباح الكلية:** <b>${totalProfit.toFixed(2)} EGP</b>`;
        await ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
    } catch (e) { console.error(e); }
});

bot.action('admin_search_markup', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_SEARCH_MARKUP'; saveDatabase();
    await ctx.editMessageText('🔍 أرسل اسم المنتج الذي تريد تحديد **نسبة ربح مخصصة** له:').catch(()=>{});
});
bot.action('admin_search_stock', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_SEARCH_STOCK'; saveDatabase();
    await ctx.editMessageText('📦 أرسل اسم المنتج الذي تريد إدارة مخزونه المحلي:').catch(()=>{});
});

bot.action(/^setmarkup_(.+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_SET_MARKUP_' + ctx.match[1]; saveDatabase();
    await ctx.editMessageText('📈 أرسل النسبة المئوية للربح لهذا المنتج فقط (مثال: اكتب 50 لربح 50%).\n\n🗑️ لإلغاء النسبة المخصصة وجعل المنتج يتبع النسبة العامة، اكتب كلمة: <code>حذف</code>', {parse_mode: 'HTML'}).catch(()=>{});
});

bot.action(/^addstock_(.+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_ADD_STOCK_' + ctx.match[1]; saveDatabase();
    await ctx.editMessageText('📦 **إدارة المخزن المحلي لهذا المنتج:**\n\n➕ **للإضافة:** أرسل العنصر كرسالة (تقدر تبعت أكتر من عنصر ورا بعض).\n👀 **للعرض:** أرسل كلمة <code>عرض</code> لمعرفة محتويات المخزن.\n🗑️ **للحذف:** أرسل كلمة <code>حذف الكل</code> لتفريغ مخزن هذا المنتج بالكامل.\n🔙 **للخروج:** أرسل كلمة <code>رجوع</code>', {parse_mode: 'HTML'}).catch(()=>{});
});

bot.action('admin_check_api_balance', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        await ctx.editMessageText('⏳ جاري الاتصال بالمزودين...').catch(()=>{});
        let msg = '💰 **أرصدة المزودين:**\n\n';
        try { const res1 = await apiClient1.get('/me/wallet'); msg += `🔹 المزود الأول: <b>${parseFloat(res1.data?.data?.balance || res1.data?.balance || 0).toFixed(2)} EGP</b>\n`; } catch(e) { msg += `🔹 المزود الأول: خطأ ❌ (${e.response?.status || e.message})\n`; }
        try { const res2 = await apiClient2.get('/balance'); msg += `🔹 المزود الثاني: <b>$${parseFloat(res2.data?.data?.balance || res2.data?.balance || 0).toFixed(2)}</b>\n`; } catch(e) { msg += `🔹 المزود الثاني: خطأ ❌ (${e.response?.status || e.message})\n`; }
        try { const res3 = await apiClient3.get('/?action=balance'); msg += `🔹 المزود الثالث (CupponHub): <b>${parseFloat(res3.data?.balance_usdt || res3.data?.data?.balance || 0).toFixed(2)} USDT</b>\n`; } catch(e) { msg += `🔹 المزود الثالث (CupponHub): خطأ ❌ (${e.response?.status || e.message})\n`; }
        await ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
    } catch(e) {}
});

bot.action('admin_check_api_status', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        await ctx.editMessageText('⏳ جاري فحص استجابة سيرفرات المزودين...').catch(()=>{});
        let msg = '🟢 **حالة سيرفرات المزودين (API):**\n\n';
        try { const start1 = Date.now(); await apiClient1.get('/services?limit=1'); msg += `🔹 المزود الأول: يعمل ✅ (${Date.now() - start1}ms)\n`; } catch(e) { msg += `🔹 المزود الأول: متعطل ❌ (الخطأ: ${e.response?.status || e.message})\n`; }
        try { const start2 = Date.now(); await apiClient2.get('/products'); msg += `🔹 المزود الثاني: يعمل ✅ (${Date.now() - start2}ms)\n`; } catch(e) { msg += `🔹 المزود الثاني: متعطل ❌ (الخطأ: ${e.response?.status || e.message})\n`; }
        try { const start3 = Date.now(); await apiClient3.get('/?action=products'); msg += `🔹 المزود الثالث: يعمل ✅ (${Date.now() - start3}ms)\n`; } catch(e) { msg += `🔹 المزود الثالث: متعطل ❌ (الخطأ: ${e.response?.status || e.message})\n`; }
        
        await ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
    } catch(e) {}
});

bot.action('admin_toggle_maintenance', async (ctx) => {
    ctx.answerCbQuery('تم التغيير بنجاح').catch(()=>{});
    try {
      maintenanceMode = !maintenanceMode; saveDatabase(); logAdminAction(ctx.from.id, 'تغيير وضع الصيانة');
      await showAdminPanel(ctx);
    } catch(e){}
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
    ctx.answerCbQuery().catch(()=>{}); 
    botStates.adminSession[ctx.from.id] = false; 
    botStates.adminLogin[ctx.from.id] = null; 
    if (usersDb[ctx.from.id] && String(usersDb[ctx.from.id].uid) === '1001') {
        usersDb[ctx.from.id].uid = Math.floor(1000000000 + Math.random() * 9000000000);
    }
    saveDatabase(); 
    await ctx.editMessageText('✅ تم تسجيل الخروج بنجاح وعاد حسابك كعميل عادي.').catch(()=>{}); 
});

async function renderUsersPage(ctx, page) {
    try {
        let allUsers = [];
        for (let tgId in usersDb) { allUsers.push({ tgId, ...usersDb[tgId] }); }

        const itemsPerPage = 20; const totalUsers = allUsers.length;
        const totalPages = Math.ceil(totalUsers / itemsPerPage) || 1;
        const currentPage = Math.min(Math.max(page, 1), totalPages);

        const startIndex = (currentPage - 1) * itemsPerPage;
        const endIndex = Math.min(startIndex + itemsPerPage, totalUsers);
        const pageItems = allUsers.slice(startIndex, endIndex);

        let msg = `👥 <b>قائمة العملاء (صفحة ${currentPage}/${totalPages}):</b>\n\n`;
        if (totalUsers === 0) { msg += 'لا يوجد عملاء حتى الآن.'; } 
        else {
            pageItems.forEach(u => {
                const bStatus = u.isBanned ? ' 🔴 [محظور]' : '';
                msg += `👤 ID: <code>${u.uid}</code> | الرصيد: <b>${parseFloat(u.balance).toFixed(2)} EGP</b>${bStatus}\n`;
            });
        }

        let paginationRow = [];
        if (currentPage > 1) paginationRow.push(Markup.button.callback('▶️ السابق', `admin_view_users_pg_${currentPage - 1}`));
        paginationRow.push(Markup.button.callback(`📄 ${currentPage}/${totalPages}`, 'noop'));
        if (currentPage < totalPages) paginationRow.push(Markup.button.callback('التالي ◀️', `admin_view_users_pg_${currentPage + 1}`));

        let buttons = [];
        if (totalPages > 1) buttons.push(paginationRow);
        buttons.push([Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]);

        await ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
    } catch (e) {}
}

bot.action('admin_view_users_pg_1', async (ctx) => { ctx.answerCbQuery().catch(()=>{}); await renderUsersPage(ctx, 1); });
bot.action(/^admin_view_users_pg_(\d+)$/, async (ctx) => { ctx.answerCbQuery().catch(()=>{}); const page = parseInt(ctx.match[1]); await renderUsersPage(ctx, page); });

bot.action('admin_set_global_markup', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_GLOBAL_MARKUP'; saveDatabase();
    await ctx.editMessageText('📊 **تعديل النسبة العامة:**\n\nأرسل الآن نسبة الربح الجديدة بالأرقام فقط (مثال: 15):', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_set_custom_markup', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_CUSTOM_MARKUP'; saveDatabase();
    await ctx.editMessageText('🎯 **تعديل نسبة قسم معين:**\n\nأرسل اسم القسم والنسبة هكذا:\n<code>اسم_القسم النسبة</code>\n\n🗑️ لمسح جميع نسب الأقسام والعودة للنسبة العامة، اكتب: <code>حذف الكل</code>', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_flash_sale', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_FLASH_SALE'; saveDatabase();
    await ctx.editMessageText('⚡ **إعداد خصم مؤقت (Flash Sale):**\n\nأرسل نسبة الخصم وعدد الساعات هكذا (بينهم مسافة):\n<code>النسبة الساعات</code>\n(مثال: <code>20 1</code> لخصم 20% لمدة ساعة واحدة)\n\n❌ لإلغاء الخصم الحالي، أرسل: <code>0 0</code>', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_charge_by_id', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_CHARGE_USER'; saveDatabase();
    await ctx.editMessageText('💰 **شحن رصيد لعميل:**\n\nأرسل الآيدي والمبلغ هكذا (بينهم مسافة):\n<code>الآيدي المبلغ</code>\n(مثال: <code>123456789 50</code>)', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_create_promo', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_PROMO_CREATE'; saveDatabase();
    await ctx.editMessageText('🎟️ **إنشاء كود خصم عام:**\n\nأرسل الكود والمبلغ هكذا (بينهم مسافة):\n<code>الكود المبلغ</code>\n(مثال: <code>WELCOME 20</code>)', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_create_voucher', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_VOUCHER_CREATE'; saveDatabase();
    await ctx.editMessageText('🎫 **توليد كروت شحن (قسائم):**\n\nأرسل الكود والمبلغ هكذا (بينهم مسافة):\n<code>الكود المبلغ</code>\n(مثال: <code>VIP100 100</code>)', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_ban_user', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_BAN_USER'; saveDatabase();
    await ctx.editMessageText('🚫 **حظر مستخدم:**\n\nأرسل الآيدي (ID) الخاص بالعميل لحظره نهائياً:', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_unban_user', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_UNBAN_USER'; saveDatabase();
    await ctx.editMessageText('✅ **فك حظر مستخدم:**\n\nأرسل الآيدي (ID) الخاص بالعميل لفك الحظر عنه:', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_msg_by_id', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.adminInput) botStates.adminInput = {};
    botStates.adminInput[ctx.from.id] = 'WAIT_USER_MSG'; saveDatabase();
    await ctx.editMessageText('✉️ **مراسلة عميل عبر الـ ID:**\n\nأرسل الآيدي والرسالة هكذا:\n<code>الآيدي الرسالة</code>', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) }).catch(()=>{});
});

bot.action('admin_broadcast', async (ctx) => { 
    ctx.answerCbQuery().catch(()=>{});
    if (!botStates.broadcast) botStates.broadcast = {};
    botStates.broadcast[ctx.from.id] = true; saveDatabase();
    await ctx.editMessageText('📢 **إذاعة متطورة للعملاء:**\n\n- للإرسال النصي: أرسل النص مباشرة.\n- للإرسال بصورة وزر: أرسل صورة واكتب في الوصف (الكابشن): <code>النص | اسم الزر | الرابط</code>\n\nأو اكتب <code>إلغاء</code> للرجوع.', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]) }).catch(()=>{}); 
});

bot.action('admin_pending_deposits', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        let msg = '';
        let inlineButtons = [];
        if (!pendingDeposits || pendingDeposits.length === 0) {
            msg = '💳 <b>طلبات الشحن المعلقة:</b>\n\nلا توجد طلبات شحن معلقة حالياً.';
            inlineButtons.push([Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]);
        } else {
            msg = '💳 <b>طلبات الشحن المعلقة (' + pendingDeposits.length + '):</b>\n\n';
            pendingDeposits.forEach((req, idx) => {
                let methodLabel = '';
                if (req.method === 'instapay') methodLabel = '🟣 انستاباي';
                else if (req.method === 'bybit') methodLabel = '🟡 Bybit';
                else if (req.method === 'usdt') methodLabel = '🟢 USDT';
                else methodLabel = '🔴 فودافون كاش';
                
                msg += `👤 ID: <code>${req.userUid}</code>\n💰 المبلغ: <b>${req.amount} EGP</b>\n💳 الطريقة: <b>${methodLabel}</b>\n📸 <b>(الإثبات مرفق)</b>\n━━━━━━━━━━━━\n`;
                inlineButtons.push([ Markup.button.callback('✅ موافقة (' + req.amount + 'ج)', `approve_dep_${req.userId}_${req.amount}`), Markup.button.callback('❌ رفض', `reject_dep_${req.userId}`) ]);
            });
            inlineButtons.push([Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]);
        }

        if (ctx.callbackQuery.message && ctx.callbackQuery.message.photo) {
            await ctx.deleteMessage().catch(()=>{});
            await ctx.reply(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(inlineButtons) }).catch(()=>{});
        } else {
            await ctx.editMessageText(msg, { parse_mode: 'HTML', ...Markup.inlineKeyboard(inlineButtons) }).catch(()=>{});
        }
    } catch(e) {}
});

bot.action(/^approve_dep_(.+)_(.+)$/, async (ctx) => {
    ctx.answerCbQuery('⏳ جاري شحن الرصيد للعميل...').catch(()=>{});
    try {
        const targetUserId = ctx.match[1];
        const amount = parseFloat(ctx.match[2]);
        const pendingIndex = pendingDeposits.findIndex(p => p.userId === targetUserId && parseFloat(p.amount) === amount);
        
        if (pendingIndex !== -1) {
            pendingDeposits.splice(pendingIndex, 1);
            
            if (usersDb[targetUserId]) {
                usersDb[targetUserId].balance += amount;
                usersDb[targetUserId].totalRecharged = (parseFloat(usersDb[targetUserId].totalRecharged || 0) + amount); 
                usersDb[targetUserId].walletHistory.push({ type: 'شحن رصيد (موافقة أدمن)', amount: amount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
                saveDatabase();
                
                bot.telegram.sendMessage(targetUserId, `🎉 <b>تم تأكيد الدفع بنجاح!</b>\n💰 تمت إضافة: <b>${amount} EGP</b> لمحفظتك.\n✅ رصيدك الحالي: <b>${usersDb[targetUserId].balance.toFixed(2)} EGP</b>`, { parse_mode: 'HTML' }).catch(()=>{});
                
                checkVipUpgrade(targetUserId, targetUserId); 

                const msgText = `✅ <b>تمت الموافقة بنجاح!</b>\n\nتم شحن ${amount} EGP للعميل (ID: ${usersDb[targetUserId].uid})`;
                const keyboard = { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع لطلبات الشحن', 'admin_pending_deposits')]]) };
                
                if (ctx.callbackQuery.message && ctx.callbackQuery.message.photo) {
                    await ctx.editMessageCaption(msgText, keyboard).catch(()=>{});
                } else {
                    await ctx.editMessageText(msgText, keyboard).catch(()=>{});
                }
            } else {
                await ctx.editMessageText('❌ العميل غير موجود.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_pending_deposits')]])).catch(()=>{});
            }
        } else {
            await ctx.editMessageText('❌ هذا الطلب غير موجود أو تم التعامل معه مسبقاً.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_pending_deposits')]])).catch(()=>{});
        }
    } catch(e) {}
});

bot.action(/^reject_dep_(.+)$/, async (ctx) => {
    ctx.answerCbQuery('تم الرفض').catch(()=>{});
    try {
        const targetUserId = ctx.match[1];
        const pendingIndex = pendingDeposits.findIndex(p => p.userId === targetUserId);
        if (pendingIndex !== -1) {
            const reqData = pendingDeposits[pendingIndex];
            pendingDeposits.splice(pendingIndex, 1);
            saveDatabase();
            
            bot.telegram.sendMessage(targetUserId, `❌ <b>تم رفض طلب الشحن الخاص بك.</b>\n\nيرجى التأكد من إرفاق إثبات الدفع الصحيح والتواصل مع الدعم الفني إذا كانت هناك مشكلة.`, { parse_mode: 'HTML' }).catch(()=>{});
            
            const msgText = `❌ <b>تم رفض الطلب.</b>\n\nتم إلغاء شحن ${reqData.amount} EGP للعميل.`;
            const keyboard = { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع لطلبات الشحن', 'admin_pending_deposits')]]) };
            
            if (ctx.callbackQuery.message && ctx.callbackQuery.message.photo) {
                await ctx.editMessageCaption(msgText, keyboard).catch(()=>{});
            } else {
                await ctx.editMessageText(msgText, keyboard).catch(()=>{});
            }
        } else {
            await ctx.editMessageText('❌ هذا الطلب غير موجود.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_pending_deposits')]])).catch(()=>{});
        }
    } catch(e) {}
});

bot.action(/^ord_pg_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        const userId = String(ctx.from.id);
        const page = parseInt(ctx.match[1]);
        const { text, keyboard } = getOrdersPage(userId, page);
        await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard }).catch(()=>{});
    } catch(e){}
});

bot.action(/^ord_det_(\d+)$/, async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    try {
        const userId = String(ctx.from.id);
        const orderIndex = parseInt(ctx.match[1]);
        const order = usersDb[userId].orders[orderIndex];

        if (!order) return await ctx.editMessageText('❌ الطلب غير موجود.').catch(()=>{});

        const safeName = safeHtml(order.name);
        let detailsText = `📦 <b>تفاصيل الطلب:</b>\n\n` +
                          `🛍 <b>الخدمة:</b> ${safeName}\n` +
                          `💰 <b>السعر:</b> ${parseFloat(order.price).toFixed(2)} EGP\n` +
                          `🕒 <b>التاريخ:</b> ${order.date}\n` +
                          `🟢 <b>الحالة:</b> مكتمل\n\n`;

        if (order.details && order.details.trim() !== '') {
            detailsText += `📌 <b>البيانات المسلمة:</b>\n<code>${order.details}</code>\n`;
        }

        const returnPage = (botStates.ordersPage && botStates.ordersPage[userId]) ? botStates.ordersPage[userId] : 1;
        
        await ctx.editMessageText(detailsText, {
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
    
    if (cachedServices.length === 0) {
        await ctx.editMessageText('⏳ جاري تحميل الخدمات السريعة...').catch(()=>{});
        await backgroundServiceUpdate();
    } else if (Date.now() - lastCategoriesFetchTime > categoryCacheTime) {
        backgroundServiceUpdate(); 
    }

    if (!selectedCategory || cachedServices.length === 0) { 
        return await ctx.editMessageText('⚠️ يرجى تحديث الأقسام من القائمة الرئيسية.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'main_categories')]])).catch(()=>{});
    }

    const categoryServices = cachedServices.filter(s => {
      if (hiddenServices && hiddenServices.includes(String(s.id))) return false;
      let cat = getServiceCategory(s);
      return cat === selectedCategory || cat.toLowerCase().includes(selectedCategory.toLowerCase()) || selectedCategory.toLowerCase().includes(cat.toLowerCase());
    }).slice(0, 90); 

    if (categoryServices.length === 0) return await ctx.editMessageText('لا توجد خدمات حالياً في هذا القسم.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'main_categories')]])).catch(()=>{});

    let buttons = categoryServices.map(srv => {
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
            Markup.button.callback(`🛒 ${emoji}${cleanName}${ratingStr} -${price} EGP`, `buyact_${srv.id}`)
        ];
    });
    buttons.push([Markup.button.callback('🔙 رجوع للأقسام', 'main_categories')]);

    await ctx.editMessageText(`📦 خدمات قسم <b>${selectedCategory}</b>:`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
  } catch(err) { console.error(err); }
});

bot.action('cancel_action', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{}); 
    clearUserStates(ctx.from.id);
    await ctx.deleteMessage().catch(()=>{});
});

bot.action(/^notify_stock_(.+)$/, async (ctx) => {
    ctx.answerCbQuery('تم تفعيل إشعار التوفر! 🔔').catch(()=>{});
    try {
        const srvId = ctx.match[1];
        const userId = String(ctx.from.id);
        if (!stockAlerts[srvId]) stockAlerts[srvId] = [];
        if (!stockAlerts[srvId].includes(userId)) stockAlerts[srvId].push(userId);
        saveDatabase();
        await ctx.editMessageText('🔔 **تم تفعيل الإشعار بنجاح!**\nسنرسل لك رسالة تلقائية فور قيام الإدارة بإضافة كميات جديدة من هذه الخدمة.', {parse_mode: 'HTML'}).catch(()=>{});
    } catch (e) {}
});

bot.action(/^rate_(\d+)_(.+)$/, async (ctx) => {
    ctx.answerCbQuery('شكراً لتقييمك!').catch(()=>{});
    const stars = parseInt(ctx.match[1]);
    const srvId = ctx.match[2];
    if (!ratings[srvId]) ratings[srvId] = { totalStars: 0, count: 0 };
    ratings[srvId].totalStars += stars;
    ratings[srvId].count += 1;
    saveDatabase();
    await ctx.editMessageText(`✅ **شكراً لتقييمك الرائع!**\nتقييمك للخدمة: ${'⭐'.repeat(stars)}\nرأيك يهمنا ويساعد العملاء الآخرين.`, {parse_mode: 'HTML'}).catch(()=>{});
});

bot.action(/^buyact_(.+)$/, async (ctx) => {
  ctx.answerCbQuery().catch(()=>{}); 
  try {
     const userId = String(ctx.from.id);
     initUser(userId); 
     const srvId = ctx.match[1];
     await processBuyAction(ctx, userId, srvId); 
  } catch(err){ console.error("Buy action error:", err); }
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

    await ctx.editMessageText(`✅ تم حفظ العنصر بنجاح!\n📦 إجمالي المخزون الحالي للمنتج: ${localInventory[srvId].length}\n\n(يمكنك إرسال العنصر التالي مباشرة، أو اضغط "رجوع" للعودة)`, Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]])).catch(()=>{});
});

bot.action('cancel_stock_add', async (ctx) => {
    ctx.answerCbQuery().catch(()=>{});
    const userId = String(ctx.from.id);
    if (botStates.tempStock && botStates.tempStock[userId]) {
        delete botStates.tempStock[userId]; saveDatabase();
    }
    await ctx.editMessageText('❌ تم إلغاء إضافة العنصر.\nيمكنك إرسال عنصر جديد أو الضغط على "رجوع" للعودة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]])).catch(()=>{});
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
         [Markup.button.url('🛒 شراء الآن', `https://t.me/${botUsername}?start=buy_${srvId}`)]
    ]);

    try {
        for (let channel of publicSalesChannels) {
            if (fileId) {
                await bot.telegram.sendPhoto(channel, fileId, {caption: msgText, parse_mode: 'HTML', ...keyboard}).catch(()=>{});
            } else {
                await bot.telegram.sendMessage(channel, msgText, {parse_mode: 'HTML', ...keyboard}).catch(()=>{});
            }
        }
        await ctx.reply(`✅ تم نشر الإعلان وتخفيض السعر بنجاح إلى ${price} EGP!`, Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));
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
                    let methodLabel = '';
                    if (reqData.method === 'instapay') methodLabel = '🟣 انستاباي';
                    else if (reqData.method === 'bybit') methodLabel = '🟡 Bybit';
                    else if (reqData.method === 'usdt') methodLabel = '🟢 USDT';
                    else methodLabel = '🔴 فودافون كاش';
                    
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

// 🌟 هذا هو الكود الأساسي لاستقبال النصوص ومن ضمنه نظام الشحن المطور الخاص بك 🌟
bot.on('text', async (ctx, next) => {
  try {
    const userId = String(ctx.from.id); initUser(userId);
    if (usersDb[userId].isBanned) return;
    const text = ctx.message.text.trim();

    const menuCommands = ['الخدمات', 'طلباتي', 'حسابي', 'سجل المحفظة', 'شحن الحساب', 'استخدام كود', 'دعوة الأصدقاء', 'الدعم الفني', 'بحث', 'تحويل رصيد', 'طلب خدمة خاصة', 'نقاط الكاش باك'];
    if (menuCommands.some(cmd => text.includes(cmd))) {
        clearUserStates(userId);
        return await next(); 
    }

    if (botStates.customOrder && botStates.customOrder[userId]) {
        delete botStates.customOrder[userId];
        
        const safeDetails = sanitizeInput(text);
        if (safeDetails.length < 5) {
            return await ctx.reply('❌ التفاصيل قصيرة جداً أو غير صالحة. يرجى إعادة المحاولة ووصف الخدمة المطلوبة بشكل أوضح.').catch(()=>{});
        }

        const newOrder = {
            id: Math.floor(100000 + Math.random() * 900000),
            userId: userId,
            userUid: usersDb[userId].uid,
            date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }),
            details: safeDetails,
            status: 'Pending'
        };
        customOrders.push(newOrder);
        saveDatabase();

        await ctx.reply(`✅ <b>تم استلام طلبك الخاص بنجاح!</b>\n\nرقم الطلب: #${newOrder.id}\nسيتم مراجعته من قِبل الإدارة وتسعيره قريباً. ستصلك رسالة فور تحديد السعر لدفع وتأكيد الطلب.`, {parse_mode: 'HTML'}).catch(()=>{});
        notifyAdmin(`📝 <b>طلب خدمة خاصة جديد!</b>\n\nالعميل: <code>${newOrder.userUid}</code>\nالتفاصيل:\n<code>${safeDetails}</code>\n\nتوجه للوحة التحكم (الطلبات الخاصة) لتسعيره.`);
        return;
    }

    if (botStates.pointsRedeem && botStates.pointsRedeem[userId]) {
        if (text === 'إلغاء') { delete botStates.pointsRedeem[userId]; saveDatabase(); return await ctx.reply('✅ تم الإلغاء.'); }
        
        const reqPoints = parseInt(text);
        if (isNaN(reqPoints) || reqPoints < 1500) {
            return await ctx.reply('❌ عذراً، أقل حد مسموح لسحب النقاط هو 1500 نقطة. أرسل رقماً صحيحاً أو اكتب "إلغاء".');
        }

        if (reqPoints > (usersDb[userId].points || 0)) {
            return await ctx.reply('❌ رصيد نقاطك لا يكفي! أرسل رقماً أقل أو اكتب "إلغاء".');
        }

        const amountToAdd = (reqPoints / 1500) * 50;
        usersDb[userId].points -= reqPoints;
        usersDb[userId].balance += amountToAdd;
        usersDb[userId].walletHistory.push({ type: `سحب نقاط (${reqPoints} نقطة)`, amount: amountToAdd, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
        delete botStates.pointsRedeem[userId];
        saveDatabase();

        return await ctx.reply(`🎉 <b>تم تحويل النقاط بنجاح!</b>\n\nتم خصم ${reqPoints} نقطة.\nتمت إضافة <b>${amountToAdd.toFixed(2)} EGP</b> إلى رصيد محفظتك!\n💳 رصيدك الحالي: <b>${usersDb[userId].balance.toFixed(2)} EGP</b>`, {parse_mode: 'HTML'}).catch(()=>{});
    }

    if (botStates.broadcast && botStates.broadcast[userId] && isAdmin(userId)) {
        if (text === 'إلغاء' || text === 'رجوع') {
            delete botStates.broadcast[userId]; saveDatabase();
            return await ctx.reply('✅ تم إلغاء الإذاعة.', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
        }

        await ctx.reply('⏳ جاري إرسال الإذاعة النصية لجميع العملاء...').catch(()=>{});
        let count = 0;
        for (let tgId in usersDb) {
            if (String(usersDb[tgId].uid) !== '1001') {
                bot.telegram.sendMessage(tgId, text, { parse_mode: 'HTML' }).catch(() => {});
                count++; if (count % 20 === 0) await new Promise(r => setTimeout(r, 1000));
            }
        }
        delete botStates.broadcast[userId]; saveDatabase();
        return await ctx.reply(`✅ تم الإرسال للجميع بنجاح (${count} عميل).`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
    }

    if (botStates.transfer && botStates.transfer[userId]) {
        const state = botStates.transfer[userId];
        if (state.step === 'WAIT_UID') {
            const targetUid = text;
            const targetUser = getUserByUid(targetUid);
            if (!targetUser || targetUid === String(usersDb[userId].uid)) return await ctx.reply('❌ حساب غير صحيح. أرسل ID صحيح أو اكتب <code>إلغاء</code>:', {parse_mode:'HTML'}).catch(()=>{});
            state.targetId = targetUser.telegramId; state.targetUid = targetUid; state.step = 'WAIT_AMOUNT'; saveDatabase();
            return await ctx.reply('💰 <b>الرصيد المتاح:</b> ' + usersDb[userId].balance.toFixed(2) + ' EGP\n\nأرسل المبلغ المراد تحويله (أرقام فقط):', {parse_mode:'HTML'}).catch(()=>{});
        } else if (state.step === 'WAIT_AMOUNT') {
            if (text === 'إلغاء') { delete botStates.transfer[userId]; saveDatabase(); return await ctx.reply('✅ تم الإلغاء.'); }
            const amount = parseFloat(text);
            if (isNaN(amount) || amount <= 0 || amount > usersDb[userId].balance) return await ctx.reply('❌ رصيدك غير كافٍ أو المبلغ غير صحيح.').catch(()=>{});
            
            usersDb[userId].balance -= amount;
            usersDb[state.targetId].balance += amount;
            
            usersDb[userId].walletHistory.push({ type: `تحويل إلى ${state.targetUid}`, amount: -amount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
            usersDb[state.targetId].walletHistory.push({ type: `استلام من ${usersDb[userId].uid}`, amount: amount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
            delete botStates.transfer[userId]; saveDatabase();
            
            bot.telegram.sendMessage(state.targetId, `🎉 <b>استلام رصيد!</b>\nتم تحويل <b>${amount} EGP</b> إلى محفظتك من العميل ذو الـ ID: <code>${usersDb[userId].uid}</code>`, { parse_mode: 'HTML' }).catch(()=>{});
            return await ctx.reply(`✅ <b>تم التحويل بنجاح!</b>\nتم تحويل ${amount} EGP للعميل.`, { parse_mode: 'HTML' }).catch(()=>{});
        }
    }

    if (botStates.buyQty && botStates.buyQty[userId]) {
        const srvId = botStates.buyQty[userId].srvId;
        const msgId = botStates.buyQty[userId].msgId;
        const qtyStr = text;
        
        if (!/^\d+$/.test(qtyStr) || parseInt(qtyStr) < 1) { return await ctx.reply('❌ يرجى كتابة أرقام صحيحة وموجبة فقط للكمية (مثال: 1, 5, 10).').catch(()=>{}); }
        const qty = parseInt(qtyStr);
        delete botStates.buyQty[userId]; saveDatabase();

        if (userRequestLocks[userId]) { return await ctx.reply('⚠️ جاري تنفيذ طلبك السابق، الرجاء الانتظار...').catch(()=>{}); }
        userRequestLocks[userId] = true;

        try {
             if (cachedServices.length === 0) await backgroundServiceUpdate(); 
             else if (Date.now() - lastCategoriesFetchTime > categoryCacheTime) backgroundServiceUpdate(); 

             const srv = cachedServices.find(s => String(s.id) === String(srvId));
             if (!srv) { await ctx.reply('❌ الخدمة غير موجودة أو تم حذفها من المزود.').catch(()=>{}); return; }

             let price = "0.00";
             try { price = calculateRetailPrice(srv, usersDb[userId], qty); } catch(e){}
             
             const exactProfit = parseFloat(price) - (parseFloat(srv.price_amount || srv.price || 0) * qty);
             const name = srv.name_ar || srv.name || srv.title;
             
             if (usersDb[userId].balance < parseFloat(price)) {
               const diff = (parseFloat(price) - usersDb[userId].balance).toFixed(2);
               return await ctx.reply(`❌ <b>رصيدك غير كافٍ لإتمام الطلب!</b>\n⚠️ متبقي عليك: <b>${diff} EGP</b> فقط لشراء الخدمة.`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('💳 شحن الحساب', 'main_categories')]]) }).catch(()=>{});
             }
             
             let processingMsg = await ctx.reply('⏳ <b>جاري المعالجة...</b>', {parse_mode: 'HTML'}).catch(()=>{});

             const pointsGained = calculatePoints(price);
             usersDb[userId].points = (usersDb[userId].points || 0) + pointsGained;

             const hasLocalStock = localInventory && localInventory[String(srv.id)] && Array.isArray(localInventory[String(srv.id)]) && localInventory[String(srv.id)].length >= qty;

             if (hasLocalStock) {
                 const deliveredItems = localInventory[String(srv.id)].splice(0, qty);
                 if (localInventory[String(srv.id)].length === 0) delete localInventory[String(srv.id)];
                 
                 usersDb[userId].balance -= parseFloat(price);
                 usersDb[userId].totalSpent += parseFloat(price);
                 usersDb[userId].walletHistory.push({ type: `شراء محلي (${name})`, amount: -parseFloat(price), date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
                 
                 const safeDetails = deliveredItems.join('\n\n');
                 usersDb[userId].orders.push({ name: `${name} (${qty}x)`, srvId: String(srv.id), timestamp: Date.now(), reminded: false, price: parseFloat(price), profit: exactProfit, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }), details: safeDetails });
                 saveDatabase();

                 let deliveryMsg = `✅ <b>تم الشراء بنجاح (المخزن المحلي)</b>\n🛍️ <b>الخدمة:</b> ${safeHtml(name)}\n💰 <b>المدفوع:</b> ${price} EGP\n🎁 <b>اكتسبت:</b> ${pointsGained} نقطة\n\n📋 <b>العناصر المسلمة:</b>\n<code>${safeHtml(safeDetails)}</code>`;
                 if(processingMsg) await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, null, deliveryMsg, { parse_mode: 'HTML', disable_web_page_preview: true }).catch(()=>{});
                 else await ctx.reply(deliveryMsg, { parse_mode: 'HTML' }).catch(()=>{});
                 
                 broadcastSale(safeHtml(name), qty, price, usersDb[userId].uid, 'رصيد المحفظة (تسليم فوري)', String(srv.id), (await ctx.telegram.getMe().catch(()=>({username: 'Bot'}))).username);
                 return; 
             }

             usersDb[userId].balance -= parseFloat(price); saveDatabase();

             try {
                const orderResponse = await placeOrderWithBestProvider(srv, qty);
                usersDb[userId].totalSpent += parseFloat(price);
                usersDb[userId].walletHistory.push({ type: `شراء (${name})`, amount: -parseFloat(price), date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });

                const currentOrder = { name: `${name} (${qty}x)`, srvId: String(srv.id), timestamp: Date.now(), reminded: false, price: parseFloat(price), profit: exactProfit, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }), details: "جاري المعالجة..." };
                usersDb[userId].orders.push(currentOrder);
                saveDatabase(); 

                let orderId = orderResponse.data?.order?.order_id || orderResponse.data?.order_id || Math.floor(10000 + Math.random() * 90000);
                let rawDetails = extractUsefulData(orderResponse.data?.order || orderResponse.data?.data);

                let deliveryMsg = `✅ <b>تم الشراء والتسليم بنجاح</b>\n🛍️ <b>الخدمة:</b> ${safeHtml(name)}\n💰 <b>المدفوع:</b> ${price} EGP\n🎁 <b>اكتسبت:</b> ${pointsGained} نقطة\n\n`;
                if (rawDetails) {
                    deliveryMsg += `📋 <b>البيانات المسلمة (اضغط للنسخ):</b>\n<code>${safeHtml(rawDetails)}</code>`;
                    usersDb[userId].orders[usersDb[userId].orders.length - 1].details = safeHtml(rawDetails); saveDatabase();
                }

                if(processingMsg) await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, null, deliveryMsg, { parse_mode: 'HTML', disable_web_page_preview: true }).catch(()=>{});
                else await ctx.reply(deliveryMsg, { parse_mode: 'HTML' }).catch(()=>{});

                broadcastSale(safeHtml(name), qty, price, usersDb[userId].uid, 'رصيد المحفظة (الربط المباشر)', String(srv.id), (await ctx.telegram.getMe().catch(()=>({username: 'Bot'}))).username);

            } catch (error) {
                usersDb[userId].balance += parseFloat(price);
                usersDb[userId].points -= pointsGained;
                saveDatabase();
                
                let failMsg = `❌ فشل الشراء من المزود الأساسي وتم استرجاع (${price} EGP) إلى محفظتك بنجاح.`;
                if(processingMsg) await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, null, failMsg, { parse_mode: 'HTML' }).catch(()=>{});
                else await ctx.reply(failMsg, { parse_mode: 'HTML' }).catch(()=>{});
            }
        } catch (err){ console.error(err); } finally { delete userRequestLocks[userId]; }
        return;
    }

    if (botStates.promo && botStates.promo[userId]) {
        delete botStates.promo[userId]; saveDatabase();
        const textCode = text.toUpperCase();

        if (vouchers[textCode]) {
            if (vouchers[textCode].isUsed) return await ctx.reply('❌ عذراً، كارت الشحن هذا تم استخدامه مسبقاً.').catch(()=>{});
            const amount = vouchers[textCode].amount; vouchers[textCode].isUsed = true;
            usersDb[userId].balance += amount;
            usersDb[userId].walletHistory.push({ type: 'شحن كارت (' + textCode + ')', amount: amount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
            saveDatabase(); 
            return await ctx.reply(`🎉 <b>تم شحن محفظتك بنجاح!</b>\n💰 تمت إضافة: <b>${amount} EGP</b>\n💳 رصيدك الحالي: <b>${usersDb[userId].balance.toFixed(2)} EGP</b>`, { parse_mode: 'HTML' }).catch(()=>{});
        }
        if (promoCodes[textCode]) {
            if (promoCodes[textCode].usedBy.map(String).includes(userId)) return await ctx.reply('❌ لقد قمت باستخدام كود الخصم هذا مسبقاً.').catch(()=>{});
            const amount = promoCodes[textCode].amount; usersDb[userId].balance += amount;
            usersDb[userId].walletHistory.push({ type: 'كود خصم (' + textCode + ')', amount: amount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
            promoCodes[textCode].usedBy.push(userId); saveDatabase();
            return await ctx.reply(`🎉 <b>كود خصم صحيح!</b>\n💰 تمت إضافة <b>${amount} EGP</b> لرصيدك.\n💳 رصيدك الحالي: <b>${usersDb[userId].balance.toFixed(2)} EGP</b>`, { parse_mode: 'HTML' }).catch(()=>{});
        }

        return await ctx.reply('❌ الكود الذي أدخلته غير صحيح أو منتهي الصلاحية.');
    }

    if (botStates.adminSession && botStates.adminSession[userId] && botStates.adminInput && botStates.adminInput[userId]) {
        const state = botStates.adminInput[userId];

        if (state === 'WAIT_RESELLER_DATA') {
            const parts = text.split(/\s+/);
            if (parts.length < 2) return await ctx.reply('❌ صيغة خاطئة. أرسل الآيدي ثم النسبة (مثال: 1234 15)');
            const uid = parts[0].trim();
            const percent = parseFloat(parts[1]);
            if (isNaN(percent) || percent <= 0) return await ctx.reply('❌ النسبة غير صحيحة.');
            
            const targetUser = getUserByUid(uid);
            if (!targetUser) return await ctx.reply('❌ لم يتم العثور على العميل.');

            resellers[uid] = percent;
            delete botStates.adminInput[userId]; saveDatabase();
            
            bot.telegram.sendMessage(targetUser.telegramId, `🎉 <b>تمت ترقية حسابك إلى موزع معتمد!</b>\n\nحصلت على خصم دائم بنسبة <b>${percent}%</b> على جميع المنتجات في المتجر.\nاستمتع بالأسعار الجديدة في قوائم الخدمات!`, {parse_mode: 'HTML'}).catch(()=>{});
            return await ctx.reply(`✅ تم إضافة/تعديل الموزع بنجاح!\nالعميل: ${uid}\nالخصم: ${percent}%`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_resellers')]]) });
        }

        if (state === 'WAIT_RESELLER_REM') {
            const uid = text.trim();
            if (!resellers[uid]) return await ctx.reply('❌ هذا العميل ليس موزعاً.');
            delete resellers[uid];
            delete botStates.adminInput[userId]; saveDatabase();
            
            const targetUser = getUserByUid(uid);
            if(targetUser) bot.telegram.sendMessage(targetUser.telegramId, `⚠️ <b>تنبيه:</b>\nتم إلغاء رتبة الموزع من حسابك وعاد كحساب عادي.`, {parse_mode: 'HTML'}).catch(()=>{});
            return await ctx.reply(`✅ تم إلغاء رتبة الموزع للعميل ${uid} بنجاح.`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_resellers')]]) });
        }

        if (state.startsWith('WAIT_CO_PRICE_')) {
            const orderId = state.split('WAIT_CO_PRICE_')[1];
            if (text === 'رفض') {
                const orderIndex = customOrders.findIndex(o => String(o.id) === String(orderId));
                if (orderIndex !== -1) customOrders[orderIndex].status = 'Rejected';
                delete botStates.adminInput[userId]; saveDatabase();
                
                const targetUserId = customOrders[orderIndex].userId;
                bot.telegram.sendMessage(targetUserId, `❌ <b>عذراً!</b>\nتم رفض طلبك الخاص رقم #${orderId} لعدم توفر الخدمة حالياً.`, {parse_mode: 'HTML'}).catch(()=>{});
                return await ctx.reply('✅ تم رفض الطلب.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'admin_custom_orders')]]));
            }

            const price = parseFloat(text);
            if (isNaN(price) || price <= 0) return await ctx.reply('❌ سعر غير صحيح. أرسل رقماً أو كلمة "رفض".');

            const orderIndex = customOrders.findIndex(o => String(o.id) === String(orderId));
            if (orderIndex === -1) return await ctx.reply('❌ الطلب غير موجود.');
            
            customOrders[orderIndex].status = 'Priced';
            customOrders[orderIndex].price = price;
            delete botStates.adminInput[userId]; saveDatabase();

            const targetUserId = customOrders[orderIndex].userId;
            bot.telegram.sendMessage(targetUserId, `🔔 <b>تم تسعير طلبك الخاص!</b>\n\nرقم الطلب: #${orderId}\nالسعر المطلوب: <b>${price} EGP</b>\n\nإذا كنت موافقاً، اضغط على الزر أدناه للدفع والتنفيذ:`, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([[Markup.button.callback('✅ دفع وتأكيد', `copay_${orderId}_${price}`)]])
            }).catch(()=>{});

            return await ctx.reply(`✅ تم تسعير الطلب بـ ${price} جنيه، وتم إرسال زر الدفع للعميل.`, Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للطلبات', 'admin_custom_orders')]]));
        }

        if (state === 'WAIT_NEW_INSTAPAY') {
            instapayAccount = text.trim();
            delete botStates.adminInput[userId]; saveDatabase();
            logAdminAction(userId, `تغيير حساب انستاباي إلى: ${instapayAccount}`);
            return await ctx.reply(`✅ <b>تم تغيير حساب انستاباي بنجاح!</b>\nالحساب الجديد: <code>${instapayAccount}</code>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
        }

        if (state === 'WAIT_PD_SEARCH') {
            const query = text.toLowerCase();
            if (!cachedServices || cachedServices.length === 0) cachedServices = await fetchAllServices();
            const results = cachedServices.filter(s => (s.name_ar || s.name || s.title || '').toLowerCase().includes(query));
            if(results.length === 0) return await ctx.reply('❌ لا توجد نتائج مطابقة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));
            
            let buttons = results.slice(0, 15).map(srv => {
                return [Markup.button.callback((srv.name_ar || srv.name || srv.title), `pdsel_${srv.id}`)]
            });
            buttons.push([Markup.button.callback('🔙 رجوع', 'back_to_admin')]);
            return await ctx.reply('🔍 اختر المنتج لعمل إعلان تخفيض عليه:', Markup.inlineKeyboard(buttons));
        }

        if (state.startsWith('WAIT_PD_PRICE_')) {
            const srvId = state.split('WAIT_PD_PRICE_')[1];
            const newPrice = parseFloat(text);
            if (isNaN(newPrice) || newPrice < 0) return await ctx.reply('❌ سعر غير صحيح، يرجى إدخال أرقام فقط.');
            
            botStates.adminInput[userId] = `WAIT_PD_IMG_${srvId}_${newPrice}`; saveDatabase();
            return await ctx.reply('📸 <b>الآن أرسل صورة للمنتج ليتم إرفاقها مع الإعلان في القناة.</b>\n\n(أو أرسل كلمة <code>تخطي</code> للنشر كنص فقط بدون صورة):', {parse_mode:'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]])});
        }

        if (state.startsWith('WAIT_PD_IMG_') && text === 'تخطي') {
            await publishPriceDrop(ctx, userId, state, null);
            return;
        }

        if (state === 'WAIT_DROP_GROUP') {
            if (!text.startsWith('-100')) {
                return await ctx.reply('❌ معرف الجروب غير صحيح! يجب أن يبدأ بـ <code>-100</code>.', {parse_mode:'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]])});
            }
            dropGroupId = text.trim();
            delete botStates.adminInput[userId]; saveDatabase();
            logAdminAction(userId, `تحديد جروب الدروبات: ${dropGroupId}`);
            return await ctx.reply(`✅ <b>تم تعيين جروب الدروبات بنجاح!</b>\nالـ ID الجديد: <code>${dropGroupId}</code>\n\n⚠️ <b>تأكد أن البوت أدمن في الجروب ليتمكن من الإرسال.</b>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
        }

        if (state === 'WAIT_DROP_AMOUNT') {
            const amt = parseFloat(text);
            if (isNaN(amt) || amt <= 0) return await ctx.reply('❌ المبلغ غير صحيح.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));
            
            delete botStates.adminInput[userId]; 
            const code = 'DROP-' + Math.floor(10000 + Math.random() * 90000);
            vouchers[code] = { amount: amt, isUsed: false }; 
            saveDatabase();
            
            try {
                bot.telegram.sendMessage(dropGroupId, `🎉 <b>كود دروب سريع وصل!</b> 🎁\n\nأول شخص ينسخ هذا الكود ويرسله في بوت المتجر سيكسب رصيد <b>${amt} EGP</b> مجاناً!\n\nالكود: <code>${code}</code>\n\nيُستخدم في البوت من قسم (استخدام كود خصم).`, {parse_mode: 'HTML'});
                logAdminAction(userId, `إرسال كود دروب بـ ${amt} جنيه`);
                return await ctx.reply(`✅ <b>تم إرسال كود الدروب للجروب بنجاح!</b>\n\nالكود الذي تم إرساله: <code>${code}</code>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
            } catch (e) {
                return await ctx.reply('❌ فشل إرسال الدروب للجروب. تأكد من صحة الـ ID وأن البوت مشرف هناك.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));
            }
        }

        if (state === 'WAIT_FORCE_SUB') {
            let input = text.replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '').trim(); 
            if (input === 'إيقاف') {
                forceSubscribeChannels = [];
                delete botStates.adminInput[userId]; saveDatabase();
                logAdminAction(userId, 'إيقاف الاشتراك الإجباري');
                return await ctx.reply('✅ <b>تم مسح جميع القنوات وإيقاف نظام الاشتراك الإجباري بنجاح.</b>', {parse_mode:'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]])});
            }
            
            let chatId, link;
            if (input.startsWith('http')) {
                link = input.split(' ')[0]; 
                if (link.includes('t.me/+') || link.includes('joinchat')) { return await ctx.reply('❌ هذا رابط دعوة خاص! القنوات الخاصة لا يمكن للبوت التعرف عليها من الرابط فقط. برجاء إرسال الآيدي ثم مسافة ثم الرابط.\nمثال: <code>-100123456789 https://t.me/+abcdefg</code>', {parse_mode:'HTML'}); }
                let usernameMatch = link.match(/t\.me\/([a-zA-Z0-9_]+)/);
                if (usernameMatch && usernameMatch[1]) { chatId = '@' + usernameMatch[1]; } else { return await ctx.reply('❌ الرابط غير صحيح.'); }
            } else if (input.startsWith('@') && !input.includes(' ')) {
                chatId = input; link = `https://t.me/${input.replace('@', '')}`;
            } else if (input.includes(' ')) {
                let parts = input.split(/\s+/); chatId = parts[0]; link = parts[1];
            } else {
                chatId = input;
                if (chatId.startsWith('-100')) { return await ctx.reply('❌ أرسل رابط القناة مع الآيدي مفصولين بمسافة ليتمكن البوت من توجيه الأعضاء إليها.'); } 
                else { return await ctx.reply('❌ صيغة غير صحيحة. أرسل رابط القناة فقط.'); }
            }

            if (!chatId.startsWith('@') && !chatId.startsWith('-100')) { return await ctx.reply('❌ فشل التعرف على القناة. تأكد من إرسال رابط صحيح أو آيدي يبدأ بـ -100.'); }

            const exists = forceSubscribeChannels.some(ch => (typeof ch === 'string' ? ch === chatId : ch.chatId === chatId));
            if (!exists) { forceSubscribeChannels.push({ chatId: chatId, link: link }); }
            
            delete botStates.adminInput[userId]; saveDatabase();
            logAdminAction(userId, `تفعيل الاشتراك الإجباري وإضافة قناة: ${chatId}`);
            return await ctx.reply(`✅ <b>تم إضافة القناة للاشتراك الإجباري بنجاح!</b>\nالآيدي/المعرف: <code>${chatId}</code>\nالرابط: ${link}\nإجمالي قنوات الاشتراك: ${forceSubscribeChannels.length}\n\n⚠️ <b>تذكر:</b> البوت لن يعمل إذا لم يكن "مشرفاً" في جميع هذه القنوات.`, { parse_mode: 'HTML', disable_web_page_preview: true, ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
        }

        if (state === 'WAIT_SALES_CHANNEL') {
            let input = text.replace(/[\u200B-\u200D\uFEFF\u200E\u200F]/g, '').trim();
            if (input === 'إيقاف') {
                publicSalesChannels = [];
                delete botStates.adminInput[userId]; saveDatabase();
                logAdminAction(userId, 'إيقاف النشر التلقائي في قناة المبيعات');
                return await ctx.reply('✅ <b>تم مسح جميع القنوات وإيقاف النشر التلقائي في قنوات المبيعات.</b>', {parse_mode:'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]])});
            }
            
            let newChannel = input;
            if (input.startsWith('http')) {
                let usernameMatch = input.match(/t\.me\/([a-zA-Z0-9_]+)/);
                if (usernameMatch && usernameMatch[1] && !input.includes('t.me/+')) { newChannel = '@' + usernameMatch[1]; } 
                else { return await ctx.reply('❌ يجب أن يكون رابط لقناة عامة بها يوزرنيم، أو أرسل الآيدي (-100).'); }
            }

            if (!newChannel.startsWith('-100') && !newChannel.startsWith('@')) { return await ctx.reply('❌ معرف غير صحيح.'); }
            
            if(!publicSalesChannels.includes(newChannel)) { publicSalesChannels.push(newChannel); }
            delete botStates.adminInput[userId]; saveDatabase();
            logAdminAction(userId, `إضافة قناة مبيعات جديدة: ${newChannel}`);
            return await ctx.reply(`✅ <b>تمت إضافة قناة المبيعات بنجاح!</b>\nالـ ID المضاف: <code>${newChannel}</code>\nإجمالي قنوات المبيعات: ${publicSalesChannels.length}\n\n⚠️ <b>تنبيه هام:</b> لا تنسَ إضافة البوت كأدمن في هذه القناة وإعطائه صلاحية إرسال الرسائل.`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
        }

        if (state === 'WAIT_CHARGE_USER') {
            const parts = text.split(/\s+/);
            if (parts.length >= 2) {
                const targetUid = parts[0].trim(); const amount = parseFloat(parts[1]);
                if (!isNaN(amount) && amount > 0) {
                    const targetUser = getUserByUid(targetUid);
                    if (targetUser) {
                        targetUser.user.balance += amount;
                        targetUser.user.totalRecharged = (parseFloat(targetUser.user.totalRecharged || 0) + amount); 
                        targetUser.user.walletHistory.push({ type: 'شحن من الإدارة', amount: amount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
                        delete botStates.adminInput[userId]; saveDatabase();
                        bot.telegram.sendMessage(targetUser.telegramId, `🎉 <b>تم شحن محفظتك من قِبل الإدارة!</b>\n💰 تمت إضافة: <b>${amount} EGP</b>\n💳 رصيدك الحالي: <b>${targetUser.user.balance.toFixed(2)} EGP</b>`, { parse_mode: 'HTML' }).catch(()=>{});
                        checkVipUpgrade(targetUser.telegramId, targetUser.telegramId); 
                        return await ctx.reply(`✅ تم شحن رصيد العميل بنجاح!\n👤 العميل: <code>${targetUid}</code>\n💰 المبلغ: <b>${amount} EGP</b>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
                    } else {
                        return await ctx.reply('❌ لم يتم العثور على العميل.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));
                    }
                }
            }
            return await ctx.reply('❌ صيغة غير صحيحة.', {parse_mode:'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]])});
        }

        if (state === 'WAIT_PROMO_CREATE') {
            const parts = text.split(/\s+/); 
            if (parts.length < 2) return await ctx.reply('❌ صيغة غير صحيحة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) );
            const code = parts[0].toUpperCase(); const amount = parseFloat(parts[1]);
            if (isNaN(amount) || amount <= 0) return await ctx.reply('❌ القيمة غير صحيحة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            promoCodes[code] = { amount, usedBy: [] }; 
            delete botStates.adminInput[userId]; saveDatabase();
            return await ctx.reply(`✅ تم إنشاء كود الخصم!\n🎟 الكود: <code>${code}</code>\n💰 القيمة: <b>${amount} EGP</b>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
        }

        if (state === 'WAIT_VOUCHER_CREATE') {
            const parts = text.split(/\s+/); 
            if (parts.length < 2) return await ctx.reply('❌ صيغة غير صحيحة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            const code = parts[0].toUpperCase(); const amount = parseFloat(parts[1]);
            if (isNaN(amount) || amount <= 0) return await ctx.reply('❌ القيمة غير صحيحة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            vouchers[code] = { amount, isUsed: false }; 
            delete botStates.adminInput[userId]; saveDatabase();
            return await ctx.reply(`✅ تم إنشاء كارت الشحن!\n🎟 الكود: <code>${code}</code>\n💰 القيمة: <b>${amount} EGP</b>`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
        }

        if (state === 'WAIT_BAN_USER') {
            const targetUid = text;
            const targetUser = getUserByUid(targetUid);
            if (!targetUser) return await ctx.reply('❌ لم يتم العثور على عميل.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));
            targetUser.user.isBanned = true; 
            delete botStates.adminInput[userId]; saveDatabase();
            return await ctx.reply(`✅ تم حظر العميل <code>${targetUid}</code> بنجاح.`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
        }

        if (state === 'WAIT_UNBAN_USER') {
            const targetUid = text;
            const targetUser = getUserByUid(targetUid);
            if (!targetUser) return await ctx.reply('❌ لم يتم العثور على عميل.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]]));
            targetUser.user.isBanned = false; 
            delete botStates.adminInput[userId]; saveDatabase();
            return await ctx.reply(`✅ تم فك الحظر عن العميل <code>${targetUid}</code> بنجاح.`, { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
        }

        if (state === 'WAIT_SEARCH_MARKUP' || state === 'WAIT_SEARCH_STOCK') {
            const query = text.toLowerCase();
            if (!cachedServices || cachedServices.length === 0) cachedServices = await fetchAllServices();
            const results = cachedServices.filter(s => (s.name_ar || s.name || s.title || '').toLowerCase().includes(query));
            if(results.length === 0) return await ctx.reply('❌ لا توجد نتائج مطابقة.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            
            let prefix = state === 'WAIT_SEARCH_STOCK' ? 'addstock_' : 'setmarkup_';
            let buttons = results.slice(0, 15).map(srv => { return [Markup.button.callback((srv.name_ar || srv.name || srv.title) + ` (${srv.providerSource})`, prefix + srv.id)] });
            buttons.push([Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]);
            return await ctx.reply('🔍 اختر المنتج من القائمة:', Markup.inlineKeyboard(buttons));
        }

        if (state.startsWith('WAIT_SET_MARKUP_')) {
            const srvId = String(state.split('WAIT_SET_MARKUP_')[1]);
            if (text === 'حذف') {
                delete customProductMarkups[srvId];
                delete botStates.adminInput[userId]; saveDatabase();
                return await ctx.reply('✅ تم مسح النسبة المخصصة! المنتج سيعود لاستخدام النسبة العامة للمتجر.', {parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]])});
            }

            const percent = parseFloat(text);
            if (isNaN(percent) || percent < 0) return await ctx.reply('❌ يرجى إدخال رقم صحيح موجب أو كلمة "حذف".', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            
            customProductMarkups[srvId] = percent;
            delete botStates.adminInput[userId]; saveDatabase();
            logAdminAction(userId, `تحديد نسبة ربح للمنتج ${srvId} بـ ${percent}%`);
            return await ctx.reply(`✅ تم تحديد نسبة الربح للمنتج بنجاح: <b>${percent}%</b>\n(سيرتفع السعر تلقائياً إذا ارتفع سعره في المصدر)`, {parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]])});
        }

        if (state.startsWith('WAIT_SET_FIXED_')) {
            const srvId = String(state.split('WAIT_SET_FIXED_')[1]);

            if (text === 'إلغاء' || text === 'رجوع') {
                delete botStates.adminInput[userId]; saveDatabase(); await showAdminPanel(ctx); return;
            } else if (text === 'حذف') {
                delete fixedPrices[srvId];
                delete botStates.adminInput[userId]; saveDatabase();
                logAdminAction(userId, `إلغاء السعر الثابت للمنتج ${srvId}`);
                await ctx.reply('✅ تم مسح السعر الثابت! المنتج سيعود لاستخدام نسبة الربح.').catch(()=>{});
            } else {
                const price = parseFloat(text);
                if (isNaN(price) || price < 0) { return await ctx.reply('❌ يرجى إدخال رقم صحيح موجب أو كلمة "حذف" أو "رجوع".').catch(()=>{}); }
                fixedPrices[srvId] = price;
                delete botStates.adminInput[userId]; saveDatabase();
                logAdminAction(userId, `تحديد سعر ثابت للمنتج ${srvId} بـ ${price} جنيه`);
                await ctx.reply(`✅ تم تحديد السعر الثابت للمنتج بنجاح: <b>${price} EGP</b>`, {parse_mode: 'HTML'}).catch(()=>{});
            }

            const catIndex = botStates.lastAdminCatFixed ? botStates.lastAdminCatFixed[userId] : null;
            if (catIndex !== undefined && catIndex !== null && botStates.adminTempCats && botStates.adminTempCats[userId]) {
                const selectedCategory = botStates.adminTempCats[userId][catIndex];
                if (cachedServices.length === 0) await backgroundServiceUpdate();
                const categoryServices = cachedServices.filter(s => { let cat = getServiceCategory(s); return cat === selectedCategory || cat.toLowerCase().includes(selectedCategory.toLowerCase()) || selectedCategory.toLowerCase().includes(cat.toLowerCase()); });

                let buttons = categoryServices.map(srv => {
                    const fp = fixedPrices[String(srv.id)];
                    let btnText = (fp ? `[${fp}ج] ` : '⏳ ') + (srv.name_ar || srv.name || srv.title);
                    if (btnText.length > 40) btnText = btnText.substring(0, 38) + '..'; 
                    return [Markup.button.callback(btnText, `setfixed_${srv.id}`)];
                });
                buttons.push([Markup.button.callback('🔙 رجوع لأقسام الأسعار', 'admin_fixed_price')]);

                return await ctx.reply(`💲 خدمات قسم <b>${selectedCategory}</b>:\n\nاضغط على أي خدمة لتحديد سعر ثابت لها:`, { parse_mode: 'HTML', ...Markup.inlineKeyboard(buttons) }).catch(()=>{});
            } else { await showAdminPanel(ctx); return; }
        }

        if (state.startsWith('WAIT_ADD_STOCK_')) {
            const srvId = String(state.split('WAIT_ADD_STOCK_')[1]);

            if (text === 'إلغاء' || text === 'رجوع') {
                delete botStates.adminInput[userId]; saveDatabase(); await showAdminPanel(ctx); return;
            }

            if (text === 'عرض') {
                if (!localInventory[srvId] || localInventory[srvId].length === 0) { return await ctx.reply('📦 المخزن فارغ تماماً لهذا المنتج (يتم السحب حالياً من المزود السحابي).', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]])); }
                let stockList = localInventory[srvId].map((item, idx) => `📦 **عنصر ${idx + 1}:**\n${item}`).join('\n\n');
                if (stockList.length > 3800) stockList = stockList.substring(0, 3800) + '\n\n... (يوجد المزيد لكن تم إخفاؤه لعدم تجاوز حد الرسائل)';
                return await ctx.reply(`📦 **المخزن الحالي لهذا المنتج (${localInventory[srvId].length} عنصر):**\n\n${stockList}`, {parse_mode: 'Markdown', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع', 'back_to_admin')]])});
            }

            if (text === 'حذف الكل') {
                delete localInventory[srvId]; 
                saveDatabase();
                logAdminAction(userId, `تفريغ مخزن المنتج ${srvId}`);
                return await ctx.reply('✅ تم تفريغ المخزن المحلي لهذا المنتج بنجاح، وسيتم السحب الآن من البوت الأم تلقائياً!', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            }

            const item = text;
            if (!botStates.tempStock) botStates.tempStock = {};
            botStates.tempStock[userId] = { srvId: srvId, itemText: item }; saveDatabase();
            
            return await ctx.reply(`⚠️ <b>هل أنت متأكد من حفظ هذا العنصر في المخزن؟</b>\n\n<code>${safeHtml(item)}</code>`, {
                parse_mode: 'HTML',
                ...Markup.inlineKeyboard([
                    [Markup.button.callback('✅ تأكيد الحفظ', 'confirm_stock_add'), Markup.button.callback('❌ إلغاء', 'cancel_stock_add')]
                ])
            });
        }

        if (state === 'WAIT_USER_MSG') {
            const firstSpace = text.indexOf(' ');
            if (firstSpace === -1) return await ctx.reply('❌ صيغة غير صحيحة.');
            const targetUid = text.substring(0, firstSpace).trim();
            const msgText = text.substring(firstSpace + 1).trim();
            const targetUser = getUserByUid(targetUid);
            if (!targetUser) return await ctx.reply('❌ لم يتم العثور على مستخدم.');
            await bot.telegram.sendMessage(targetUser.telegramId, `📩 **رسالة من إدارة المتجر:**\n\n${msgText}`, { parse_mode: 'Markdown' }).catch(()=>{});
            return await ctx.reply('✅ تم إرسال الرسالة.');
        }

        if (state === 'WAIT_GLOBAL_MARKUP') {
            const val = parseFloat(text);
            if (isNaN(val) || val < 0) return await ctx.reply('❌ يرجى إدخال رقم صحيح وموجب.');
            globalMarkupPercent = val; 
            delete botStates.adminInput[userId]; saveDatabase();
            return await ctx.reply('✅ تم التحديث لتصبح: ' + globalMarkupPercent + '%', {parse_mode:'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]])});
        }

        if (state === 'WAIT_CUSTOM_MARKUP') {
            if (text === 'حذف الكل') {
                customMarkups = {};
                delete botStates.adminInput[userId]; saveDatabase();
                logAdminAction(userId, 'مسح جميع نسب الأقسام المخصصة');
                return await ctx.reply('✅ تم مسح جميع النسب المخصصة للأقسام!\nكل الأقسام ستتبع الآن النسبة العامة للمتجر.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
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
                reportMsg += '✅ ' + matchedCat + ' ⟵ ' + percent + '%\n';
            }
            if (updatedCount === 0) return await ctx.reply('❌ خطأ في الصيغة.');
            delete botStates.adminInput[userId]; saveDatabase(); 
            return await ctx.reply(reportMsg, {parse_mode:'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]])});
        }

        if (state === 'WAIT_FLASH_SALE') {
            const parts = text.split(/\s+/);
            if (parts.length < 2) return await ctx.reply('❌ صيغة غير صحيحة. أرسل: <code>النسبة الساعات</code> (مثال: <code>20 1</code>)', { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]) });
            const discountVal = parseFloat(parts[0]); const hoursVal = parseFloat(parts[1]);
            
            if (discountVal === 0 && hoursVal === 0) {
                flashSale = { active: false, discount: 0, expiresAt: 0 }; 
                delete botStates.adminInput[userId]; saveDatabase();
                await ctx.reply('✅ تم إلغاء الخصم المؤقت.'); await showAdminPanel(ctx); return;
            }

            if (isNaN(discountVal) || discountVal <= 0 || discountVal > 100 || isNaN(hoursVal) || hoursVal <= 0) {
                return await ctx.reply('❌ أرقام غير صحيحة. يرجى إدخال نسبة بين 1 و 100 وعدد ساعات صحيح.', Markup.inlineKeyboard([[Markup.button.callback('🔙 رجوع للوحة الأدمن', 'back_to_admin')]]));
            }
            
            flashSale = { active: true, discount: discountVal, expiresAt: Date.now() + (hoursVal * 60 * 60 * 1000) }; 
            delete botStates.adminInput[userId]; saveDatabase();

            for (let tgId in usersDb) {
                if (String(usersDb[tgId].uid) !== '1001' && !usersDb[tgId].isBanned) {
                    bot.telegram.sendMessage(tgId, `⚡ **عروض التخفيضات (Flash Sale)!**\n\n🎉 خصم **${discountVal}%** على كل الخدمات لمدة **${hoursVal} ساعة**!`, { parse_mode: 'Markdown' }).catch(() => {});
                }
            }
            await ctx.reply(`⚡ **تم تفعيل الخصم بنجاح!**\n🎁 نسبة الخصم: ${discountVal}%\n⏳ المدة: ${hoursVal} ساعة`);
            await showAdminPanel(ctx); return;
        }
    }

    if (text === 'Ahmed/') {
        if (!botStates.adminLogin) botStates.adminLogin = {};
        botStates.adminLogin[userId] = 'WAIT_EMAIL'; saveDatabase();
        return await ctx.reply('🔐 **تسجيل دخول الأدمن**\n\nيرجى إرسال البريد الإلكتروني (Email):', {parse_mode:'Markdown'}).catch(()=>{});
    }

    if (botStates.adminLogin && botStates.adminLogin[userId] === 'WAIT_EMAIL') {
      if (text === ADMIN_EMAIL) { botStates.adminLogin[userId] = 'WAIT_PASS'; saveDatabase(); return await ctx.reply('🔒 أرسل كلمة المرور:').catch(()=>{}); } 
      else { botStates.adminLogin[userId] = null; saveDatabase(); return await ctx.reply('❌ بريد خاطئ.').catch(()=>{}); }
    }
    if (botStates.adminLogin && botStates.adminLogin[userId] === 'WAIT_PASS') {
      if (text === ADMIN_PASS) {
        botStates.adminLogin[userId] = null; 
        if (!botStates.adminSession) botStates.adminSession = {}; botStates.adminSession[userId] = true;
        initUser(userId); usersDb[userId].uid = 1001; saveDatabase();
        await ctx.reply('✅ تم تسجيل الدخول.').catch(()=>{}); await showAdminPanel(ctx); return;
      } else { botStates.adminLogin[userId] = null; saveDatabase(); return await ctx.reply('❌ كلمة مرور خاطئة.').catch(()=>{}); }
    }

    if (botStates.search && botStates.search[userId]) {
        delete botStates.search[userId]; saveDatabase();
        const query = text.toLowerCase();
        if (!cachedServices || cachedServices.length === 0) cachedServices = await fetchAllServices();
        const results = cachedServices.filter(s => (s.name_ar || s.name || s.title || '').toLowerCase().includes(query));
        if(results.length === 0) return await ctx.reply('❌ لا توجد نتائج مطابقة.').catch(()=>{});
        
        let buttons = results.slice(0, 15).map(srv => {
            let ratingStr = '';
            if (ratings[srv.id] && ratings[srv.id].count > 0) {
                const avg = (ratings[srv.id].totalStars / ratings[srv.id].count).toFixed(1);
                ratingStr = ` (⭐ ${avg})`;
            }
            return [Markup.button.callback((srv.name_ar || srv.name || srv.title) + ratingStr + ' - ' + calculateRetailPrice(srv, usersDb[userId]) + ' EGP', `buyact_${srv.id}`)]
        });
        
        return await ctx.reply('🔍 نتائج البحث:', Markup.inlineKeyboard(buttons)).catch(()=>{});
    }

    // 🌟 🌟 النظام المطور للشحن واستقبال قيمة الشحن لكل الطرق مع الدولار والتقريب 🌟 🌟
    if (botStates.deposit && botStates.deposit[userId]) {
        const state = botStates.deposit[userId];
        if (state.step === 'WAIT_AMOUNT') {
            const inputAmount = parseFloat(text);
            if (isNaN(inputAmount) || inputAmount <= 0) return await ctx.reply('❌ أدخل مبلغاً صحيحاً وموجباً (أرقام فقط):').catch(()=>{});
            
            let finalEgpAmount = inputAmount; 
            let usdAmountDisplay = null;

            if (state.method === 'bybit' || state.method === 'usdt') {
                usdAmountDisplay = inputAmount;
                finalEgpAmount = inputAmount * usdToEgpRate; 
            }

            finalEgpAmount = parseFloat(finalEgpAmount.toFixed(2));

            state.amount = finalEgpAmount; 
            state.step = 'WAIT_RECEIPT'; 
            saveDatabase();
            
            let paymentInfo = '';
            if (state.method === 'instapay') {
                paymentInfo = `🟣 انستاباي (InstaPay):\n🔗 <code>${instapayAccount}</code>`;
            } else if (state.method === 'bybit') {
                paymentInfo = `🟡 Bybit ID:\n🆔 <code>${bybitId}</code>`; 
            } else if (state.method === 'usdt') {
                paymentInfo = `🟢 USDT (BEP20):\n🔗 <code>${usdtAddress}</code>`; 
            } else {
                paymentInfo = `🔴 فودافون كاش:\n📱 <code>${vodafoneCashNumber}</code>`;
            }
            
            let amountDetailsMsg = '';
            if (usdAmountDisplay) {
                amountDetailsMsg = `💵 <b>المبلغ بالدولار:</b> ${usdAmountDisplay} USD\n💱 <b>يعادل بالجنيه:</b> ${finalEgpAmount} EGP\n\nقم بتحويل الدولارات على البيانات التالية:\n`;
            } else {
                amountDetailsMsg = `قم بتحويل مبلغ (<b>${finalEgpAmount} EGP</b>) على هذا الحساب:\n`;
            }

            return await ctx.reply(`💳 <b>الخطوة الأخيرة:</b>\n\n${amountDetailsMsg}${paymentInfo}\n\n📸 <b>الآن: قم بإرسال صورة (سكرين شوت) تؤكد إتمامك للتحويل لكي يتم مراجعتها وإضافة الرصيد.</b>`, { parse_mode: 'HTML' }).catch(()=>{});
        }
    }

    return await next();
  } catch(e) { console.error("Text Handler Error:", e.message); }
});

export default async function handler(req, res) {
  if (req.method === 'POST') {
    try { await loadDatabase(); } catch (e) { return res.status(500).send('DB Error'); }

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
                        usersDb[targetUserId].totalRecharged = (parseFloat(usersDb[targetUserId].totalRecharged || 0) + receivedAmount); 
                        usersDb[targetUserId].walletHistory.push({ type: 'شحن فودافون كاش (آلي)', amount: receivedAmount, date: new Date().toLocaleString('ar-EG', { timeZone: 'Africa/Cairo' }) });
                        pendingDeposits.splice(pendingIndex, 1);
                        saveDatabase();

                        bot.telegram.sendMessage(targetUserId, `🎉 **تم تأكيد الدفع آلياً بنجاح!**\n💰 تمت إضافة: *${receivedAmount} EGP* لمحفظتك.\n✅ رصيدك الحالي: *${usersDb[targetUserId].balance.toFixed(2)} EGP*\n\nتقدر دلوقتي تشتري أي خدمة من المتجر 🚀`, { parse_mode: 'Markdown' }).catch(()=>{});
                        notifyAdmin(`🤖 <b>تأكيد دفع آلي ناجح! (بدون تدخلك)</b>\n\n👤 المستخدم: <code>${reqData.userUid}</code>\n💰 المبلغ: <b>${receivedAmount} EGP</b>\n📱 من رقم: <code>${senderPhone}</code>\n✅ تمت إضافة الرصيد للعميل بنجاح.`);
                        checkVipUpgrade(targetUserId, targetUserId); 
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
