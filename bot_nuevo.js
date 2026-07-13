const TOKEN = '8817425699:AAENykXt5-ciorDEIg_OqaUqqQ9vmDELgA0';
const ADMIN = '8208191817';
const API = 'https://api.telegram.org/bot' + TOKEN;
const fs = require('fs');
const DB_FILE = '/root/roiapple/data.json';

// ── DB ──
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); }
  catch(e) { return { users: {} }; }
}
function saveDB(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
function getUser(id) {
  const db = loadDB();
  return db.users[id] || null;
}
function saveUser(id, u) {
  const db = loadDB();
  db.users[id] = u;
  saveDB(db);
}

// ── PHONES ──
const PH = [
  {id:'2g', name:'iPhone 2G',  year:2007, price:5},
  {id:'3g', name:'iPhone 3G',  year:2008, price:6},
  {id:'3gs',name:'iPhone 3GS', year:2009, price:7},
  {id:'4',  name:'iPhone 4',   year:2010, price:9},
  {id:'4s', name:'iPhone 4S',  year:2011, price:11},
  {id:'5',  name:'iPhone 5',   year:2012, price:13},
  {id:'5s', name:'iPhone 5S',  year:2013, price:16},
  {id:'6',  name:'iPhone 6',   year:2014, price:20},
  {id:'6s', name:'iPhone 6S',  year:2015, price:25},
  {id:'7',  name:'iPhone 7',   year:2016, price:30},
  {id:'8',  name:'iPhone 8',   year:2017, price:37},
  {id:'x',  name:'iPhone X',   year:2017, price:45},
  {id:'xr', name:'iPhone XR',  year:2018, price:55},
  {id:'xs', name:'iPhone XS',  year:2018, price:67},
  {id:'11', name:'iPhone 11',  year:2019, price:80},
  {id:'12', name:'iPhone 12',  year:2020, price:97},
  {id:'13', name:'iPhone 13',  year:2021, price:117},
  {id:'14', name:'iPhone 14',  year:2022, price:140},
  {id:'15', name:'iPhone 15',  year:2023, price:167},
  {id:'16', name:'iPhone 16',  year:2024, price:200},
  {id:'17', name:'iPhone 17',  year:2025, price:240},
];
PH.forEach(p => p.daily = parseFloat((p.price / 25).toFixed(4)));

// ── TELEGRAM ──
async function tg(method, body = {}) {
  const r = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  return r.json();
}

const send = (chat, text, extra = {}) =>
  tg('sendMessage', { chat_id: chat, text, parse_mode: 'HTML', ...extra });

const edit = (chat, mid, text, extra = {}) =>
  tg('editMessageText', { chat_id: chat, message_id: mid, text, parse_mode: 'HTML', ...extra });

const answer = (id, text = 'OK') =>
  tg('answerCallbackQuery', { callback_query_id: id, text });

const del = (chat, mid) =>
  tg('deleteMessage', { chat_id: chat, message_id: mid });

const f = n => '$' + Math.abs(n).toFixed(2);
const fD = () => new Date().toLocaleString('es-ES');

function kb(rows) {
  return {
    reply_markup: JSON.stringify({
      inline_keyboard: rows.map(r => r.map(b => ({
        text: b.t,
        callback_data: b.d
      })))
    })
  };
}

// ── MAIN MENU ──
async function mainMenu(chatId, u) {
  const webUrl = 'https://aljimen3z-glitch.github.io/Roi-Apple/?tgid=' + chatId + '&tgname=' + encodeURIComponent(u.name || '');
  return tg('sendMessage', {
    chat_id: chatId,
    text: '🍎 <b>RoiApple</b>\n\n💰 Balance: <b>' + f(u.balance) + '</b>',
    parse_mode: 'HTML',
    reply_markup: JSON.stringify({
      inline_keyboard: [[{ text: '🚀 Abrir RoiApple', web_app: { url: webUrl } }]]
    })
  });
}

// ── HANDLE MESSAGE ──
async function handleMsg(msg) {
  const chatId = String(msg.chat.id);
  const text = msg.text || '';
  const name = msg.from.first_name || 'Usuario';
  const username = msg.from.username || '';

  if (text === '/start') {
    let u = getUser(chatId);
    if (!u) {
      u = {
        chatId, name, username,
        balance: 0, totalEarned: 0,
        portfolio: {}, pending: {}, clockStart: {}, buyDate: {},
        txs: [],
        refCode: 'REF-' + Math.random().toString(36).substr(2, 6).toUpperCase(),
        refEarned: 0, referredBy: null, refCount: 0,
        createdAt: fD(), lastTick: Date.now()
      };
      saveUser(chatId, u);
      await send(ADMIN,
        '🆕 <b>Nuevo usuario</b>\n\n' +
        '👤 ' + name + '\n' +
        '🆔 @' + username + '\n' +
        '🔢 <code>' + chatId + '</code>\n' +
        '📅 ' + fD()
      );
    } else {
      u.name = name;
      u.username = username;
      saveUser(chatId, u);
    }
    // Delete previous start messages
    try { await del(chatId, msg.message_id); } catch(e) {}
    return mainMenu(chatId, u);
  }

  if (chatId === ADMIN) {
    if (text === '/anuelaa') {
      const db = loadDB();
      const users = Object.values(db.users);
      let inv = 0;
      users.forEach(u => {
        Object.entries(u.portfolio || {}).forEach(([id, q]) => {
          const p = PH.find(x => x.id === id);
          if (p && q > 0) inv += p.price * q;
        });
      });
      return send(ADMIN,
        '🔐 <b>Panel Admin RoiApple</b>\n\n' +
        '👥 Usuarios: <b>' + users.length + '</b>\n' +
        '📱 Total invertido: <b>' + f(inv) + '</b>\n\n' +
        '/anuelaa — Este panel\n' +
        '/usuarios — Lista usuarios'
      );
    }
    if (text === '/usuarios') {
      const db = loadDB();
      const users = Object.values(db.users);
      if (!users.length) return send(ADMIN, 'Sin usuarios.');
      let t = '👥 <b>Usuarios (' + users.length + ')</b>\n\n';
      users.forEach((u, i) => {
        let inv = 0;
        Object.entries(u.portfolio || {}).forEach(([id, q]) => {
          const p = PH.find(x => x.id === id);
          if (p && q > 0) inv += p.price * q;
        });
        t += (i + 1) + '. <b>' + u.name + '</b> (@' + (u.username || '-') + ')\n';
        t += '💰 ' + f(u.balance) + ' | 📱 ' + f(inv) + '\n\n';
      });
      return send(ADMIN, t);
    }
  }

  const u = getUser(chatId);
  if (!u) return send(chatId, 'Escribe /start para comenzar.');
  return mainMenu(chatId, u);
}

// ── HANDLE CALLBACK ──
async function handleCB(cb) {
  const chatId = String(cb.message.chat.id);
  const mid = cb.message.message_id;
  const data = cb.data;
  const cbId = cb.id;

  // ── ADMIN CALLBACKS ──
  if (chatId === ADMIN) {
    // Approve deposit: adep_USERID_TXID_AMOUNT
    if (data.startsWith('adep_')) {
      const parts = data.split('_');
      const userId = parts[1];
      const amt = parseFloat(parts[parts.length - 1]);
      const txId = parts.slice(2, parts.length - 1).join('_');
      const db = loadDB();
      const tu = db.users[userId];
      if (!tu) { await answer(cbId, 'Usuario no encontrado'); return; }
      const tx = (tu.txs || []).find(t => t.id === txId);
      if (!tx || tx.status !== 'pending') { await answer(cbId, 'Ya procesada'); return; }
      tx.status = 'done';
      tu.balance = (tu.balance || 0) + amt;
      db.users[userId] = tu;
      saveDB(db);
      await answer(cbId, 'Aprobada');
      await edit(chatId, mid,
        '✅ <b>RECARGA APROBADA</b>\n\n' +
        '👤 ' + tu.name + '\n' +
        '💵 ' + f(amt) + '\n' +
        '💰 Nuevo balance: ' + f(tu.balance)
      );
      return send(userId,
        '🎉 <b>Recarga aprobada</b>\n\n' +
        '💵 ' + f(amt) + ' acreditados\n' +
        '💰 Balance: ' + f(tu.balance)
      );
    }

    // Reject deposit: rdep_USERID_TXID
    if (data.startsWith('rdep_')) {
      const parts = data.split('_');
      const userId = parts[1];
      const txId = parts.slice(2).join('_');
      const db = loadDB();
      const tu = db.users[userId];
      if (!tu) { await answer(cbId, 'No encontrado'); return; }
      const tx = (tu.txs || []).find(t => t.id === txId);
      if (!tx || tx.status !== 'pending') { await answer(cbId, 'Ya procesada'); return; }
      tx.status = 'rejected';
      db.users[userId] = tu;
      saveDB(db);
      await answer(cbId, 'Rechazada');
      await edit(chatId, mid, '❌ <b>RECARGA RECHAZADA</b>\n\n👤 ' + tu.name + '\n💵 ' + f(tx.amount));
      return send(userId, '❌ Tu recarga fue rechazada.');
    }

    // Approve withdrawal: awdr_USERID_TXID_AMOUNT
    if (data.startsWith('awdr_')) {
      const parts = data.split('_');
      const userId = parts[1];
      const amt = parseFloat(parts[parts.length - 1]);
      const txId = parts.slice(2, parts.length - 1).join('_');
      const db = loadDB();
      const tu = db.users[userId];
      if (!tu) { await answer(cbId, 'No encontrado'); return; }
      const tx = (tu.txs || []).find(t => t.id === txId);
      if (!tx || tx.status !== 'pending') { await answer(cbId, 'Ya procesada'); return; }
      tx.status = 'done';
      db.users[userId] = tu;
      saveDB(db);
      await answer(cbId, 'Procesado');
      await edit(chatId, mid,
        '✅ <b>RETIRO PROCESADO</b>\n\n' +
        '👤 ' + tu.name + '\n' +
        '💵 ' + f(amt) + '\n' +
        '👛 ' + tx.wallet + '\n\n' +
        '💡 Envía los fondos a la wallet.'
      );
      return send(userId, '✅ Retiro procesado. ' + f(amt) + ' enviados a:\n' + tx.wallet);
    }

    // Reject withdrawal: rwdr_USERID_TXID_AMOUNT
    if (data.startsWith('rwdr_')) {
      const parts = data.split('_');
      const userId = parts[1];
      const amt = parseFloat(parts[parts.length - 1]);
      const txId = parts.slice(2, parts.length - 1).join('_');
      const db = loadDB();
      const tu = db.users[userId];
      if (!tu) { await answer(cbId, 'No encontrado'); return; }
      const tx = (tu.txs || []).find(t => t.id === txId);
      if (!tx || tx.status !== 'pending') { await answer(cbId, 'Ya procesada'); return; }
      tx.status = 'rejected';
      tu.balance = (tu.balance || 0) + amt;
      db.users[userId] = tu;
      saveDB(db);
      await answer(cbId, 'Rechazado');
      await edit(chatId, mid, '❌ <b>RETIRO RECHAZADO</b>\n\n' + f(amt) + ' devueltos.');
      return send(userId, '❌ Retiro rechazado. ' + f(amt) + ' devueltos a tu balance.');
    }
  }

  await answer(cbId);
}

// ── TICK: accrue earnings every 10 min ──
function tick() {
  const db = loadDB();
  const now = Date.now();
  let changed = false;
  for (const [id, u] of Object.entries(db.users)) {
    for (const [pid, qty] of Object.entries(u.portfolio || {})) {
      if (qty <= 0) continue;
      const p = PH.find(x => x.id === pid);
      if (!p) continue;
      const delta = now - (u.lastTick || now);
      const df = delta / 86400000;
      if (!u.pending) u.pending = {};
      u.pending[pid] = (u.pending[pid] || 0) + p.daily * qty * df;
      changed = true;
    }
    if (changed) u.lastTick = now;
  }
  if (changed) saveDB(db);
}
setInterval(tick, 600000);

// ── DAILY: auto-collect every 24h ──
async function dailyCollect() {
  const db = loadDB();
  const now = Date.now();
  const EXPIRE = 65 * 86400000;
  let collected = 0;
  for (const [id, u] of Object.entries(db.users)) {
    let tot = 0;
    // Check expiry
    for (const [pid, qty] of Object.entries(u.portfolio || {})) {
      if (qty <= 0) continue;
      const bd = (u.buyDate && u.buyDate[pid]) || (u.clockStart && u.clockStart[pid]) || now;
      if (now - bd >= EXPIRE) {
        const p = PH.find(x => x.id === pid);
        u.portfolio[pid] = 0;
        if (u.pending) u.pending[pid] = 0;
        try { await send(id, (p ? p.name : pid) + ' expiró (65 días). Vuelve a comprarlo.'); } catch(e) {}
      }
    }
    // Collect earnings
    for (const [pid, a] of Object.entries(u.pending || {})) {
      if (a <= 0) continue;
      if (now - (u.clockStart && u.clockStart[pid] || 0) >= 86400000) {
        tot += a;
        u.pending[pid] = 0;
        if (!u.clockStart) u.clockStart = {};
        u.clockStart[pid] = now;
      }
    }
    if (tot > 0.001) {
      u.balance = (u.balance || 0) + tot;
      u.totalEarned = (u.totalEarned || 0) + tot;
      if (!u.txs) u.txs = [];
      u.txs.unshift({ id: 'TX-' + Date.now(), type: 'earning', amount: tot, status: 'done', date: fD() });
      collected++;
      try {
        await send(id, '💰 Ganancias acreditadas: ' + f(tot) + '\nBalance: ' + f(u.balance));
      } catch(e) {}
    }
  }
  saveDB(db);
  if (collected > 0) {
    await send(ADMIN, '⏰ Cobro automático: ' + collected + ' usuarios recibieron ganancias.');
  }
}
setInterval(dailyCollect, 86400000);

// ── REFERRAL COMMISSIONS ──
async function payReferral(buyerChatId, amount) {
  const LEVELS = [0.08, 0.04, 0.02];
  let currentId = buyerChatId;
  for (let lvl = 0; lvl < 3; lvl++) {
    const db = loadDB();
    const u = db.users[currentId];
    if (!u || !u.referredBy) break;
    const refId = u.referredBy;
    const ref = db.users[refId];
    if (!ref) break;
    const commission = parseFloat((amount * LEVELS[lvl]).toFixed(4));
    ref.balance = (ref.balance || 0) + commission;
    ref.refEarned = (ref.refEarned || 0) + commission;
    db.users[refId] = ref;
    saveDB(db);
    try {
      await send(refId, '💸 Comisión nivel ' + (lvl + 1) + ': +' + f(commission) + '\nBalance: ' + f(ref.balance));
    } catch(e) {}
    currentId = refId;
  }
}

// ── POLLING ──
let offset = 0;
async function poll() {
  try {
    const r = await fetch(`${API}/getUpdates?offset=${offset}&timeout=30&allowed_updates=["message","callback_query"]`);
    const d = await r.json();
    if (d.ok && d.result.length) {
      for (const upd of d.result) {
        offset = upd.update_id + 1;
        try {
          if (upd.message) await handleMsg(upd.message);
          if (upd.callback_query) await handleCB(upd.callback_query);
        } catch(e) { console.error('Error:', e.message); }
      }
    }
  } catch(e) { console.error('Poll error:', e.message); }
  setTimeout(poll, 1000);
}

console.log('🍎 RoiApple Bot iniciando...');
fetch(`${API}/deleteWebhook`).then(() => {
  console.log('✅ Polling activo.');
  poll();
});
