const TOKEN = '8817425699:AAENykXt5-ciorDEIg_OqaUqqQ9vmDELgA0';
const ADMIN_CHAT = '8208191817';
const API = `https://api.telegram.org/bot${TOKEN}`;

// ══════════════════════════════════════════
// DATABASE (in-memory + JSON file)
// ══════════════════════════════════════════
const fs = require('fs');
const DB_FILE = './data.json';

function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch(e) { return { users: {}, txs: [] }; }
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let DB = loadDB();

function getUser(chatId) {
  return DB.users[chatId] || null;
}
function saveUser(chatId, data) {
  DB.users[chatId] = data;
  saveDB(DB);
}
function newUser(chatId, name, username, referredBy=null) {
  return {
    chatId, name, username: username || '',
    balance: 0, totalEarned: 0,
    portfolio: {}, pending: {}, clockStart: {},
    txs: [], log: [],
    refCode: 'REF-' + Math.random().toString(36).substr(2,6).toUpperCase(),
    referredBy: referredBy,   // chatId of who referred them (level 1)
    refEarned: 0,             // total earned from referrals
    refCount: 0,              // how many direct referrals
    createdAt: new Date().toLocaleString('es-ES'),
    state: null
  };
}

// Pay referral commissions up to 3 levels when someone buys an iPhone
async function payReferralCommissions(buyerChatId, amount) {
  const LEVELS = [0.08, 0.04, 0.02]; // 8%, 4%, 2%
  let currentId = buyerChatId;
  for(let lvl=0; lvl<3; lvl++){
    const u = getUser(currentId);
    if(!u || !u.referredBy) break;
    const referrerId = u.referredBy;
    const referrer = getUser(referrerId);
    if(!referrer) break;
    const commission = parseFloat((amount * LEVELS[lvl]).toFixed(4));
    referrer.balance = (referrer.balance||0) + commission;
    referrer.refEarned = (referrer.refEarned||0) + commission;
    if(lvl===0) referrer.refCount = (referrer.refCount||0); // count already set at registration
    saveUser(referrerId, referrer);
    // Notify referrer
    await send(referrerId,
      `💸 <b>¡Comisión de referido!</b>\n\n` +
      `Nivel ${lvl+1}: <b>${commission > 0 ? '+'+f(commission) : f(commission)}</b>\n` +
      `Un usuario de tu red compró un iPhone.\n` +
      `💰 Tu balance: ${f(referrer.balance)}`
    );
    // Notify admin
    await send(ADMIN_CHAT,
      `💸 <b>Comisión referido Nv${lvl+1}</b>\n` +
      `Para: ${referrer.name} (@${referrer.username||'-'})\n` +
      `Monto: ${f(commission)} (${(LEVELS[lvl]*100).toFixed(0)}% de ${f(amount)})`
    );
    currentId = referrerId;
  }
}

// ══════════════════════════════════════════
// IPHONE DATA
// ══════════════════════════════════════════
const PH = [
  {id:'2g',  name:'iPhone 2G',  year:2007, price:5   },
  {id:'3g',  name:'iPhone 3G',  year:2008, price:6   },
  {id:'3gs', name:'iPhone 3GS', year:2009, price:7   },
  {id:'4',   name:'iPhone 4',   year:2010, price:9   },
  {id:'4s',  name:'iPhone 4S',  year:2011, price:11  },
  {id:'5',   name:'iPhone 5',   year:2012, price:13  },
  {id:'5s',  name:'iPhone 5S',  year:2013, price:16  },
  {id:'6',   name:'iPhone 6',   year:2014, price:20  },
  {id:'6s',  name:'iPhone 6S',  year:2015, price:25  },
  {id:'7',   name:'iPhone 7',   year:2016, price:30  },
  {id:'8',   name:'iPhone 8',   year:2017, price:37  },
  {id:'x',   name:'iPhone X',   year:2017, price:45  },
  {id:'xr',  name:'iPhone XR',  year:2018, price:55  },
  {id:'xs',  name:'iPhone XS',  year:2018, price:67  },
  {id:'11',  name:'iPhone 11',  year:2019, price:80  },
  {id:'12',  name:'iPhone 12',  year:2020, price:97  },
  {id:'13',  name:'iPhone 13',  year:2021, price:117 },
  {id:'14',  name:'iPhone 14',  year:2022, price:140 },
  {id:'15',  name:'iPhone 15',  year:2023, price:167 },
  {id:'16',  name:'iPhone 16',  year:2024, price:200 },
  {id:'17',  name:'iPhone 17',  year:2025, price:240 },
];
PH.forEach(p => { p.daily = parseFloat((p.price / 25).toFixed(4)); });

// ══════════════════════════════════════════
// TELEGRAM API HELPERS
// ══════════════════════════════════════════
async function tg(method, body = {}) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return res.json();
}

async function send(chatId, text, extra = {}) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'HTML', ...extra });
}

async function edit(chatId, msgId, text, extra = {}) {
  return tg('editMessageText', { chat_id: chatId, message_id: msgId, text, parse_mode: 'HTML', ...extra });
}

async function answer(id, text = '✅') {
  return tg('answerCallbackQuery', { callback_query_id: id, text });
}

async function deleteMsg(chatId, msgId) {
  return tg('deleteMessage', { chat_id: chatId, message_id: msgId });
}

function kb(buttons) {
  // buttons = [[{text, data},...],...]
  return {
    reply_markup: JSON.stringify({
      inline_keyboard: buttons.map(row =>
        row.map(b => ({ text: b.text, callback_data: b.data }))
      )
    })
  };
}

function f(n) { return '$' + Math.abs(n).toFixed(2); }
function pct(p) { return ((p.daily / p.price) * 100).toFixed(0) + '%'; }

// ══════════════════════════════════════════
// TICK — accrue earnings every minute
// ══════════════════════════════════════════
function tickAllUsers() {
  const now = Date.now();
  let changed = false;
  for (const [cid, u] of Object.entries(DB.users)) {
    for (const [id, qty] of Object.entries(u.portfolio || {})) {
      if (qty <= 0) continue;
      const p = PH.find(x => x.id === id);
      if (!p) continue;
      const last = u.lastTick || now;
      const delta = now - last;
      const df = delta / 86400000;
      if (!u.pending) u.pending = {};
      u.pending[id] = (u.pending[id] || 0) + p.daily * qty * df;
      changed = true;
    }
    if (changed) u.lastTick = now;
  }
  if (changed) saveDB(DB);
}
setInterval(tickAllUsers, 60000);

// ══════════════════════════════════════════
// MENUS
// ══════════════════════════════════════════
async function sendMainMenu(chatId, u) {
  let inv = 0, day = 0;
  for (const [id, qty] of Object.entries(u.portfolio || {})) {
    const p = PH.find(x => x.id === id);
    if (p && qty > 0) { inv += p.price * qty; day += p.daily * qty; }
  }
  const totalPending = Object.values(u.pending || {}).reduce((a, b) => a + b, 0);

  const text =
    `🍎 <b>RoiApple</b> — Bienvenido, ${u.name}!\n\n` +
    `💰 <b>Balance:</b> ${f(u.balance)}\n` +
    `📱 <b>Invertido:</b> ${f(inv)}\n` +
    `📈 <b>Ganas/día:</b> ${f(day)}\n` +
    `🏆 <b>Total ganado:</b> ${f(u.totalEarned)}\n` +
    (totalPending > 0.01 ? `\n✨ <b>Pendiente por cobrar:</b> ${f(totalPending)}\n` : '') +
    `\n¿Qué deseas hacer?`;

  return send(chatId, text, kb([
    [{ text: '📱 Comprar iPhone', data: 'menu_buy' }, { text: '💰 Cobrar ganancias', data: 'menu_collect' }],
    [{ text: '🏦 Recargar saldo', data: 'menu_deposit' }, { text: '💸 Retirar', data: 'menu_withdraw' }],
    [{ text: '📊 Mi portafolio', data: 'menu_portfolio' }, { text: '👥 Referidos', data: 'menu_ref' }],
  ]));
}

async function sendCatalog(chatId, page = 0) {
  const pageSize = 7;
  const start = page * pageSize;
  const phones = PH.slice(start, start + pageSize);

  let text = `📱 <b>Catálogo de iPhones</b>\n<i>4% diario — recuperas tu inversión en 25 días</i>\n\n`;
  phones.forEach(p => {
    text += `<b>${p.name}</b> (${p.year})\n💵 ${f(p.price)} → +${f(p.daily)}/día\n\n`;
  });

  const rows = [];
  let row = [];
  phones.forEach((p, i) => {
    row.push({ text: p.name, data: `buy_${p.id}` });
    if (row.length === 3 || i === phones.length - 1) { rows.push([...row]); row = []; }
  });

  const nav = [];
  if (page > 0) nav.push({ text: '◀ Anterior', data: `catalog_${page - 1}` });
  if (start + pageSize < PH.length) nav.push({ text: 'Siguiente ▶', data: `catalog_${page + 1}` });
  if (nav.length) rows.push(nav);
  rows.push([{ text: '🏠 Menú principal', data: 'menu_main' }]);

  return send(chatId, text, kb(rows));
}

async function sendPortfolio(chatId, u) {
  const owned = Object.entries(u.portfolio || {}).filter(([, q]) => q > 0);
  if (!owned.length) {
    return send(chatId, '📱 Aún no tienes iPhones.\n\nUsa el catálogo para comprar tu primer iPhone y empezar a generar ganancias.', kb([[{ text: '📱 Ver catálogo', data: 'menu_buy' }, { text: '🏠 Menú', data: 'menu_main' }]]));
  }

  let text = `📊 <b>Mi portafolio</b>\n\n`;
  const now = Date.now();
  for (const [id, qty] of owned) {
    const p = PH.find(x => x.id === id);
    if (!p) continue;
    const pend = u.pending?.[id] || 0;
    const rem = 86400000 - (now - (u.clockStart?.[id] || now));
    const cd = rem > 0 ? fTime(rem) : '¡Listo!';
    text += `📱 <b>${p.name}</b> × ${qty}\n`;
    text += `   💵 Invertido: ${f(p.price * qty)}\n`;
    text += `   📈 Ganancia/día: ${f(p.daily * qty)}\n`;
    if (pend > 0.01) text += `   ✨ Pendiente: ${f(pend)}\n`;
    text += `   ⏱ Próximo cobro: ${cd}\n\n`;
  }

  return send(chatId, text, kb([
    [{ text: '💰 Cobrar todo', data: 'menu_collect' }],
    [{ text: '🏠 Menú', data: 'menu_main' }]
  ]));
}

function fTime(ms) {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sc = s % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sc).padStart(2,'0')}`;
}

// ══════════════════════════════════════════
// PROCESS UPDATES
// ══════════════════════════════════════════
async function handleMessage(msg) {
  const chatId = String(msg.chat.id);
  const text = msg.text || '';
  const name = msg.from.first_name || 'Usuario';
  const username = msg.from.username || '';

  // Load or create user
  let u = getUser(chatId);

  // /start
  if (text === '/start' || text.startsWith('/start ')) {
    if (!u) {
      // Check if came with a referral code
      const parts = text.split(' ');
      const refCode = parts.length > 1 ? parts[1].trim() : null;
      let referredBy = null;
      if(refCode){
        // Find who has this refCode
        const allUsers = Object.values(DB.users);
        const referrer = allUsers.find(x => x.refCode === refCode);
        if(referrer && referrer.chatId !== chatId){
          referredBy = referrer.chatId;
          // Increment referrer's refCount
          referrer.refCount = (referrer.refCount||0)+1;
          saveUser(referrer.chatId, referrer);
          // Notify referrer
          await send(referrer.chatId,
            `🎉 <b>¡Nuevo referido!</b>\n\n👤 ${name} se unió con tu enlace.\n👥 Total referidos: ${referrer.refCount}\n\nGanarás comisiones cuando compre iPhones.`
          );
        }
      }
      u = newUser(chatId, name, username, referredBy);
      saveUser(chatId, u);
      await send(ADMIN_CHAT,
        `🆕 <b>Nuevo usuario</b>\n\n👤 ${name}\n🆔 @${username}\n🔢 <code>${chatId}</code>\n${referredBy?'👥 Referido por: '+referredBy:'Sin referido'}\n📅 ${new Date().toLocaleString('es-ES')}`
      );
    }
    u.state = null; saveUser(chatId, u);
    return sendMainMenu(chatId, u);
  }

  if (!u) {
    return send(chatId, '👋 Bienvenido a RoiApple!\n\nEscribe /start para comenzar.');
  }

  // Admin commands
  if (chatId === ADMIN_CHAT) {
    if (text === '/admin') return sendAdminMenu();
    if (text === '/usuarios') return sendUserList();
  }

  // State-based conversation
  if (u.state === 'waiting_deposit_hash') {
    const hash = text.trim();
    if (hash.length < 10) return send(chatId, '❌ Hash no válido. Pega el hash completo de tu transacción.');
    u.state = 'waiting_deposit_amount';
    u.tempHash = hash;
    saveUser(chatId, u);
    return send(chatId, `✅ Hash recibido.\n\n¿Cuánto enviaste en USDT? (solo el número, ej: <code>50</code>)`);
  }

  if (u.state === 'waiting_deposit_amount') {
    const amt = parseFloat(text.trim());
    if (!amt || amt <= 0) return send(chatId, '❌ Monto no válido. Escribe solo el número, ej: <code>50</code>');
    const txId = 'TX-' + Date.now();
    if (!u.txs) u.txs = [];
    u.txs.unshift({ id: txId, type: 'deposit', hash: u.tempHash, amount: amt, status: 'pending', date: new Date().toLocaleString('es-ES') });
    u.state = null; u.tempHash = null;
    saveUser(chatId, u);

    await send(chatId,
      `✅ <b>Recarga enviada a revisión</b>\n\n💵 Monto: ${f(amt)}\n🔗 Hash: <code>${u.txs[0].hash}</code>\n⏳ Se acreditará en 15–60 min.`,
      kb([[{ text: '🏠 Menú principal', data: 'menu_main' }]])
    );

    // Notify admin with approve/reject
    return send(ADMIN_CHAT,
      `💰 <b>RECARGA PENDIENTE</b>\n\n👤 ${u.name} (@${u.username})\n🔢 ID: <code>${chatId}</code>\n💵 Monto: <b>${f(amt)} USDT</b>\n🔗 Hash: <code>${u.txs[0].hash}</code>\n🌐 Red: BEP-20\n📅 ${new Date().toLocaleString('es-ES')}`,
      kb([[
        { text: `✅ Aprobar ${f(amt)}`, data: `adep_${chatId}_${txId}_${amt}` },
        { text: '❌ Rechazar', data: `rdep_${chatId}_${txId}` }
      ]])
    );
  }

  if (u.state === 'waiting_withdraw_amount') {
    const amt = parseFloat(text.trim());
    if (!amt || amt < 5) return send(chatId, '❌ El mínimo de retiro es $5.00. Escribe el monto.');
    if (amt > u.balance) return send(chatId, `❌ Saldo insuficiente. Tu balance es ${f(u.balance)}.`);
    u.state = 'waiting_withdraw_wallet';
    u.tempAmount = amt;
    saveUser(chatId, u);
    return send(chatId, `💵 Monto: ${f(amt)}\n\nAhora envía tu dirección de wallet BEP-20:`);
  }

  if (u.state === 'waiting_withdraw_wallet') {
    const wallet = text.trim();
    if (wallet.length < 10) return send(chatId, '❌ Dirección no válida. Envía tu wallet BEP-20 completa.');
    const amt = u.tempAmount;
    const txId = 'TX-' + Date.now();
    u.balance -= amt;
    if (!u.txs) u.txs = [];
    u.txs.unshift({ id: txId, type: 'withdraw', wallet, amount: amt, status: 'pending', date: new Date().toLocaleString('es-ES') });
    u.state = null; u.tempAmount = null;
    saveUser(chatId, u);

    await send(chatId,
      `✅ <b>Retiro solicitado</b>\n\n💵 Monto: ${f(amt)}\n👛 Wallet: <code>${wallet}</code>\n🌐 Red: BEP-20\n⏳ Procesado en 24–48 h.`,
      kb([[{ text: '🏠 Menú principal', data: 'menu_main' }]])
    );

    return send(ADMIN_CHAT,
      `🏧 <b>RETIRO PENDIENTE</b>\n\n👤 ${u.name} (@${u.username})\n🔢 ID: <code>${chatId}</code>\n💵 Monto: <b>${f(amt)}</b>\n👛 Wallet: <code>${wallet}</code>\n🌐 Red: BEP-20\n📅 ${new Date().toLocaleString('es-ES')}`,
      kb([[
        { text: `✅ Procesar ${f(amt)}`, data: `awdr_${chatId}_${txId}_${amt}` },
        { text: '❌ Rechazar', data: `rwdr_${chatId}_${txId}_${amt}` }
      ]])
    );
  }

  // Default
  return sendMainMenu(chatId, u);
}

async function handleCallback(cb) {
  const chatId = String(cb.message.chat.id);
  const msgId = cb.message.message_id;
  const data = cb.data;
  const cbId = cb.id;

  let u = getUser(chatId);

  // ── ADMIN CALLBACKS ──
  if (chatId === ADMIN_CHAT) {
    // Approve deposit: adep_CHATID_TXID_AMOUNT
    if (data.startsWith('adep_')) {
      const [, targetId, txId, amtStr] = data.split('_');
      const amt = parseFloat(amtStr);
      const tu = getUser(targetId);
      if (!tu) { await answer(cbId, '❌ Usuario no encontrado'); return; }
      const tx = (tu.txs || []).find(t => t.id === txId);
      if (!tx || tx.status !== 'pending') { await answer(cbId, '⚠️ Ya procesada'); return; }
      tx.status = 'done';
      tu.balance = (tu.balance || 0) + amt;
      saveUser(targetId, tu);
      await answer(cbId, '✅ Recarga aprobada');
      await edit(chatId, msgId,
        `✅ <b>RECARGA APROBADA</b>\n\n👤 ${tu.name}\n💵 ${f(amt)} USDT\n💰 Nuevo balance: ${f(tu.balance)}`
      );
      return send(targetId,
        `🎉 <b>¡Tu recarga fue aprobada!</b>\n\n💵 Se acreditaron ${f(amt)} a tu balance.\n💰 Balance actual: ${f(tu.balance)}\n\n¡Ya puedes comprar iPhones!`,
        kb([[{ text: '📱 Comprar iPhone', data: 'menu_buy' }, { text: '🏠 Menú', data: 'menu_main' }]])
      );
    }

    // Reject deposit: rdep_CHATID_TXID
    if (data.startsWith('rdep_')) {
      const [, targetId, txId] = data.split('_');
      const tu = getUser(targetId);
      if (!tu) { await answer(cbId, '❌ Usuario no encontrado'); return; }
      const tx = (tu.txs || []).find(t => t.id === txId);
      if (!tx || tx.status !== 'pending') { await answer(cbId, '⚠️ Ya procesada'); return; }
      tx.status = 'rejected';
      saveUser(targetId, tu);
      await answer(cbId, '❌ Recarga rechazada');
      await edit(chatId, msgId, `❌ <b>RECARGA RECHAZADA</b>\n\n👤 ${tu.name}\n💵 ${f(tx.amount)}`);
      return send(targetId,
        `❌ <b>Tu recarga fue rechazada</b>\n\nEl hash no pudo ser verificado. Si crees que es un error, contacta al soporte.`,
        kb([[{ text: '🏠 Menú', data: 'menu_main' }]])
      );
    }

    // Approve withdrawal: awdr_CHATID_TXID_AMOUNT
    if (data.startsWith('awdr_')) {
      const parts = data.split('_');
      const targetId = parts[1], txId = parts[2], amt = parseFloat(parts[3]);
      const tu = getUser(targetId);
      if (!tu) { await answer(cbId, '❌ Usuario no encontrado'); return; }
      const tx = (tu.txs || []).find(t => t.id === txId);
      if (!tx || tx.status !== 'pending') { await answer(cbId, '⚠️ Ya procesada'); return; }
      tx.status = 'done';
      saveUser(targetId, tu);
      await answer(cbId, '✅ Retiro procesado');
      await edit(chatId, msgId,
        `✅ <b>RETIRO PROCESADO</b>\n\n👤 ${tu.name}\n💵 ${f(amt)}\n👛 <code>${tx.wallet}</code>\n\n💡 Envía los fondos a la wallet indicada.`
      );
      return send(targetId,
        `✅ <b>¡Tu retiro fue procesado!</b>\n\n💵 ${f(amt)} enviados a:\n<code>${tx.wallet}</code>\n\nLlegará en breve a tu wallet.`,
        kb([[{ text: '🏠 Menú', data: 'menu_main' }]])
      );
    }

    // Reject withdrawal: rwdr_CHATID_TXID_AMOUNT
    if (data.startsWith('rwdr_')) {
      const parts = data.split('_');
      const targetId = parts[1], txId = parts[2], amt = parseFloat(parts[3]);
      const tu = getUser(targetId);
      if (!tu) { await answer(cbId, '❌ Usuario no encontrado'); return; }
      const tx = (tu.txs || []).find(t => t.id === txId);
      if (!tx || tx.status !== 'pending') { await answer(cbId, '⚠️ Ya procesada'); return; }
      tx.status = 'rejected';
      tu.balance = (tu.balance || 0) + amt; // refund
      saveUser(targetId, tu);
      await answer(cbId, '❌ Retiro rechazado');
      await edit(chatId, msgId, `❌ <b>RETIRO RECHAZADO</b>\n\n👤 ${tu.name}\n💵 ${f(amt)} devueltos al balance.`);
      return send(targetId,
        `❌ <b>Tu retiro fue rechazado</b>\n\n${f(amt)} han sido devueltos a tu balance.\nContacta soporte si tienes dudas.`,
        kb([[{ text: '🏠 Menú', data: 'menu_main' }]])
      );
    }
  }

  // ── USER CALLBACKS ──
  if (!u) { await answer(cbId); return; }

  if (data === 'menu_main') {
    u.state = null; saveUser(chatId, u);
    await answer(cbId);
    await deleteMsg(chatId, msgId).catch(()=>{});
    return sendMainMenu(chatId, u);
  }

  if (data === 'menu_buy' || data.startsWith('catalog_')) {
    await answer(cbId);
    const page = data.startsWith('catalog_') ? parseInt(data.split('_')[1]) : 0;
    await deleteMsg(chatId, msgId).catch(()=>{});
    return sendCatalog(chatId, page);
  }

  if (data.startsWith('buy_')) {
    const id = data.replace('buy_', '');
    const p = PH.find(x => x.id === id);
    if (!p) { await answer(cbId, '❌ iPhone no encontrado'); return; }
    await answer(cbId);
    return send(chatId,
      `📱 <b>${p.name}</b> (${p.year})\n\n` +
      `💵 Precio: <b>${f(p.price)}</b>\n` +
      `📈 Ganas: <b>+${f(p.daily)}/día</b> (${pct(p)})\n` +
      `📅 Recuperas tu inversión en <b>25 días</b>\n\n` +
      `Tu balance: ${f(u.balance)}\n\n` +
      `¿Confirmas la compra?`,
      kb([[
        { text: `✅ Comprar por ${f(p.price)}`, data: `confirm_buy_${id}` },
        { text: '❌ Cancelar', data: 'menu_buy' }
      ]])
    );
  }

  if (data.startsWith('confirm_buy_')) {
    const id = data.replace('confirm_buy_', '');
    const p = PH.find(x => x.id === id);
    if (!p) { await answer(cbId, '❌ Error'); return; }
    if (u.balance < p.price) {
      await answer(cbId, '❌ Saldo insuficiente');
      return edit(chatId, msgId,
        `❌ <b>Saldo insuficiente</b>\n\nNecesitas ${f(p.price)} pero tienes ${f(u.balance)}.\n\nRecarga tu cuenta para continuar.`,
        kb([[{ text: '🏦 Recargar saldo', data: 'menu_deposit' }, { text: '🏠 Menú', data: 'menu_main' }]])
      );
    }
    u.balance -= p.price;
    u.portfolio[id] = (u.portfolio[id] || 0) + 1;
    if (!u.clockStart) u.clockStart = {};
    if (!u.clockStart[id]) u.clockStart[id] = Date.now();
    if (!u.pending) u.pending = {};
    saveUser(chatId, u);
    await answer(cbId, '✅ Compra exitosa!');
    await edit(chatId, msgId,
      `🎉 <b>¡Compraste ${p.name}!</b>\n\n` +
      `💵 Invertiste: ${f(p.price)}\n` +
      `📈 Ganarás: +${f(p.daily)}/día\n` +
      `⏱ Primer cobro disponible en 24 h\n` +
      `💰 Balance restante: ${f(u.balance)}`,
      kb([[{ text: '📊 Ver portafolio', data: 'menu_portfolio' }, { text: '🏠 Menú', data: 'menu_main' }]])
    );
    // Pay referral commissions (8% L1, 4% L2, 2% L3)
    await payReferralCommissions(chatId, p.price);
    // Notify admin
    return send(ADMIN_CHAT,
      `📱 <b>Nueva inversión</b>\n\n👤 ${u.name} (@${u.username})\n📱 ${p.name}\n💵 ${f(p.price)}\n📈 +${f(p.daily)}/día`
    );
  }

  if (data === 'menu_collect') {
    const now = Date.now();
    let tot = 0;
    for (const [id, a] of Object.entries(u.pending || {})) {
      if (a <= 0) continue;
      if (now - (u.clockStart?.[id] || 0) >= 86400000) {
        tot += a; u.pending[id] = 0; u.clockStart[id] = now;
      }
    }
    if (tot < 0.001) {
      await answer(cbId, '⏳ Aún no hay ganancias listas');
      return edit(chatId, msgId,
        `⏳ <b>Sin ganancias disponibles</b>\n\nLas ganancias se cobran cada 24 horas.\nRevisa tu portafolio para ver el tiempo restante.`,
        kb([[{ text: '📊 Portafolio', data: 'menu_portfolio' }, { text: '🏠 Menú', data: 'menu_main' }]])
      );
    }
    u.balance += tot; u.totalEarned = (u.totalEarned || 0) + tot;
    saveUser(chatId, u);
    await answer(cbId, `✅ Cobraste ${f(tot)}`);
    return edit(chatId, msgId,
      `💰 <b>¡Ganancias cobradas!</b>\n\n✨ Cobraste: <b>${f(tot)}</b>\n💰 Balance actual: ${f(u.balance)}\n\n¡Sigue invirtiendo para ganar más!`,
      kb([[{ text: '📱 Comprar más', data: 'menu_buy' }, { text: '🏠 Menú', data: 'menu_main' }]])
    );
  }

  if (data === 'menu_portfolio') {
    await answer(cbId);
    await deleteMsg(chatId, msgId).catch(()=>{});
    return sendPortfolio(chatId, u);
  }

  if (data === 'menu_deposit') {
    await answer(cbId);
    u.state = 'waiting_deposit_hash'; saveUser(chatId, u);
    return edit(chatId, msgId,
      `🏦 <b>Recargar saldo</b>\n\n` +
      `Envía <b>USDT</b> por red <b>BEP-20</b> a esta dirección:\n\n` +
      `<code>0x264925CA49fd89c54E8413264eAB91b8eE686E3d</code>\n\n` +
      `Después pega aquí el <b>hash de tu transacción</b>:`,
      kb([[{ text: '❌ Cancelar', data: 'menu_main' }]])
    );
  }

  if (data === 'menu_withdraw') {
    await answer(cbId);
    u.state = 'waiting_withdraw_amount'; saveUser(chatId, u);
    return edit(chatId, msgId,
      `💸 <b>Retirar ganancias</b>\n\n` +
      `💰 Balance disponible: <b>${f(u.balance)}</b>\n` +
      `📌 Mínimo de retiro: <b>$5.00</b>\n` +
      `🌐 Red: <b>BEP-20</b>\n\n` +
      `¿Cuánto deseas retirar?`,
      kb([[{ text: '❌ Cancelar', data: 'menu_main' }]])
    );
  }

  if (data === 'menu_ref') {
    await answer(cbId);
    const refLink=`https://t.me/RoiAppleInvest_bot?start=${u.refCode}`;
    const refCount=u.refCount||0;
    const refEarned=u.refEarned||0;
    // Count level 2 and 3
    const allU=Object.values(DB.users);
    const lvl1=allU.filter(x=>x.referredBy===chatId);
    const lvl1ids=lvl1.map(x=>x.chatId);
    const lvl2=allU.filter(x=>x.referredBy&&lvl1ids.includes(x.referredBy));
    const lvl2ids=lvl2.map(x=>x.chatId);
    const lvl3=allU.filter(x=>x.referredBy&&lvl2ids.includes(x.referredBy));
    return edit(chatId, msgId,
      `👥 <b>Programa de Referidos</b>\n\n` +
      `🔗 <b>Tu enlace:</b>\n<code>${refLink}</code>\n\n` +
      `📊 <b>Tu red:</b>\n` +
      `• Nivel 1: <b>${lvl1.length}</b> referidos directos\n` +
      `• Nivel 2: <b>${lvl2.length}</b> referidos indirectos\n` +
      `• Nivel 3: <b>${lvl3.length}</b> red extendida\n\n` +
      `💰 <b>Ganado por referidos: ${f(refEarned)}</b>\n\n` +
      `📋 <b>Comisiones:</b>\n` +
      `• Nivel 1 (directo): <b>8%</b> de cada compra\n` +
      `• Nivel 2: <b>4%</b> de cada compra\n` +
      `• Nivel 3: <b>2%</b> de cada compra\n\n` +
      `Comparte tu enlace — ganas cada vez que alguien de tu red compre un iPhone.`,
      kb([[{ text: '🏠 Menú', data: 'menu_main' }]])
    );
  }

  await answer(cbId);
}

async function sendAdminMenu() {
  const users = Object.values(DB.users);
  const totalBalance = users.reduce((a, u) => a + (u.balance || 0), 0);
  let totalInv = 0;
  users.forEach(u => {
    Object.entries(u.portfolio || {}).forEach(([id, qty]) => {
      const p = PH.find(x => x.id === id);
      if (p && qty > 0) totalInv += p.price * qty;
    });
  });
  return send(ADMIN_CHAT,
    `🔐 <b>Panel Admin RoiApple</b>\n\n` +
    `👥 Usuarios: <b>${users.length}</b>\n` +
    `💰 Balance total: <b>${f(totalBalance)}</b>\n` +
    `📱 Total invertido: <b>${f(totalInv)}</b>\n\n` +
    `<b>Comandos:</b>\n/admin — Este panel\n/usuarios — Lista de usuarios`
  );
}

async function sendUserList() {
  const users = Object.values(DB.users);
  if (!users.length) return send(ADMIN_CHAT, 'Sin usuarios registrados.');
  let text = `👥 <b>Usuarios (${users.length})</b>\n\n`;
  users.forEach((u, i) => {
    let inv = 0;
    Object.entries(u.portfolio || {}).forEach(([id, qty]) => {
      const p = PH.find(x => x.id === id); if (p && qty > 0) inv += p.price * qty;
    });
    text += `${i+1}. <b>${u.name}</b> (@${u.username || '—'})\n`;
    text += `   💰 ${f(u.balance)} | 📱 ${f(inv)} inv.\n`;
    text += `   📅 ${u.createdAt}\n\n`;
  });
  return send(ADMIN_CHAT, text);
}

// ══════════════════════════════════════════
// POLLING LOOP
// ══════════════════════════════════════════
let offset = 0;
async function poll() {
  try {
    const res = await fetch(`${API}/getUpdates?offset=${offset}&timeout=30&allowed_updates=["message","callback_query"]`);
    const data = await res.json();
    if (data.ok && data.result.length) {
      for (const update of data.result) {
        offset = update.update_id + 1;
        try {
          if (update.message) await handleMessage(update.message);
          if (update.callback_query) await handleCallback(update.callback_query);
        } catch(e) { console.error('Update error:', e.message); }
      }
    }
  } catch(e) { console.error('Poll error:', e.message); }
  setTimeout(poll, 1000);
}

// ══════════════════════════════════════════
// START
// ══════════════════════════════════════════
console.log('🍎 RoiApple Bot iniciando...');
// Delete any existing webhook so polling works
fetch(`${API}/deleteWebhook`).then(() => {
  console.log('✅ Webhook eliminado. Iniciando polling...');
  poll();
});
