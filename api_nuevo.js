const http = require('http');
const fs = require('fs');
const DB_FILE = '/root/roiapple/data.json';
const TOKEN = '8817425699:AAENykXt5-ciorDEIg_OqaUqqQ9vmDELgA0';
const ADMIN = '8208191817';

function loadDB(){try{return JSON.parse(fs.readFileSync(DB_FILE,'utf8'));}catch(e){return{users:{}};}}
function saveDB(db){fs.writeFileSync(DB_FILE,JSON.stringify(db,null,2));}

const PH=[{id:'2g',price:5},{id:'3g',price:6},{id:'3gs',price:7},{id:'4',price:9},{id:'4s',price:11},{id:'5',price:13},{id:'5s',price:16},{id:'6',price:20},{id:'6s',price:25},{id:'7',price:30},{id:'8',price:37},{id:'x',price:45},{id:'xr',price:55},{id:'xs',price:67},{id:'11',price:80},{id:'12',price:97},{id:'13',price:117},{id:'14',price:140},{id:'15',price:167},{id:'16',price:200},{id:'17',price:240}];
PH.forEach(p=>p.daily=parseFloat((p.price/25).toFixed(4)));

async function tgSend(text,keyboard=null){
  const body={chat_id:ADMIN,text,parse_mode:'HTML'};
  if(keyboard)body.reply_markup=JSON.stringify({inline_keyboard:keyboard});
  try{await fetch('https://api.telegram.org/bot'+TOKEN+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});}catch(e){}
}

function findUser(db,uid,email){
  // Find by userId or email
  for(const [key,u] of Object.entries(db.users)){
    if(u.userId===uid||key===email||u.email===email)return{key,u};
  }
  return null;
}

function getUserData(u,db,key){
  const allU=Object.values(db.users);
  const lvl1=allU.filter(x=>x.referredBy===key);
  const lvl1ids=lvl1.map(x=>x.userId||x.chatId||'');
  const lvl2=allU.filter(x=>x.referredBy&&lvl1ids.includes(x.userId||x.chatId||''));
  const lvl2ids=lvl2.map(x=>x.userId||x.chatId||'');
  const lvl3=allU.filter(x=>x.referredBy&&lvl2ids.includes(x.userId||x.chatId||''));
  return {
    balance:u.balance||0,totalEarned:u.totalEarned||0,
    portfolio:u.portfolio||{},pending:u.pending||{},
    clockStart:u.clockStart||{},buyDate:u.buyDate||{},
    txs:(u.txs||[]).slice(0,20),
    refCode:u.refCode||'',refEarned:u.refEarned||0,
    name:u.name||'',
    refs:{lvl1:lvl1.length,lvl2:lvl2.length,lvl3:lvl3.length,total:lvl1.length+lvl2.length+lvl3.length}
  };
}

const server=http.createServer(async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Content-Type','application/json');
  if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}

  const url=new URL(req.url,'http://localhost');
  const path=url.pathname;

  // GET /user?tgid=X or /user?uid=X
  if(path==='/user'&&req.method==='GET'){
    const db=loadDB();
    const tgid=url.searchParams.get('tgid');
    const uid=url.searchParams.get('uid');
    let found=null;
    if(tgid)found={key:tgid,u:db.users[tgid]};
    if(!found?.u&&uid){
      for(const[k,u]of Object.entries(db.users)){if(u.userId===uid){found={key:k,u};break;}}
    }
    if(!found?.u){res.writeHead(404);res.end(JSON.stringify({error:'not found'}));return;}
    res.writeHead(200);res.end(JSON.stringify(getUserData(found.u,db,found.key)));return;
  }

  // POST /register - web user registration notification
  if(path==='/register'&&req.method==='POST'){
    let body='';req.on('data',d=>body+=d);
    req.on('end',async()=>{
      try{
        const {name,email,userId}=JSON.parse(body);
        await tgSend('Nuevo usuario web\n\nNombre: '+name+'\nEmail: '+email+'\nID: '+userId);
        res.writeHead(200);res.end(JSON.stringify({ok:true}));
      }catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}
    });return;
  }

  // POST /buy
  if(path==='/buy'&&req.method==='POST'){
    let body='';req.on('data',d=>body+=d);
    req.on('end',async()=>{
      try{
        const {uid,phoneId,tgid}=JSON.parse(body);
        const db=loadDB();
        let found=null;
        if(tgid)found={key:tgid,u:db.users[tgid]};
        if(!found?.u&&uid){for(const[k,u]of Object.entries(db.users)){if(u.userId===uid){found={key:k,u};break;}}}
        if(!found?.u){res.writeHead(404);res.end(JSON.stringify({error:'not found'}));return;}
        const {key,u}=found;
        const p=PH.find(x=>x.id===phoneId);
        if(!p){res.writeHead(400);res.end(JSON.stringify({error:'invalid phone'}));return;}
        if(u.balance<p.price){res.writeHead(400);res.end(JSON.stringify({error:'insufficient balance'}));return;}
        u.balance-=p.price;
        u.portfolio[phoneId]=(u.portfolio[phoneId]||0)+1;
        if(!u.clockStart)u.clockStart={};if(!u.clockStart[phoneId])u.clockStart[phoneId]=Date.now();
        if(!u.buyDate)u.buyDate={};if(!u.buyDate[phoneId])u.buyDate[phoneId]=Date.now();
        if(!u.pending)u.pending={};
        db.users[key]=u;saveDB(db);
        await tgSend('Nueva compra\n\nUsuario: '+u.name+'\nModelo: iPhone '+phoneId.toUpperCase()+'\nMonto: $'+p.price.toFixed(2));
        res.writeHead(200);res.end(JSON.stringify({ok:true,balance:u.balance}));
      }catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}
    });return;
  }

  // POST /deposit
  if(path==='/deposit'&&req.method==='POST'){
    let body='';req.on('data',d=>body+=d);
    req.on('end',async()=>{
      try{
        const {uid,tgid,name,email,hash,amount}=JSON.parse(body);
        const db=loadDB();
        let found=null;
        if(tgid)found={key:tgid,u:db.users[tgid]};
        if(!found?.u&&uid){for(const[k,u]of Object.entries(db.users)){if(u.userId===uid){found={key:k,u};break;}}}
        if(!found?.u){
          // Create web user if not exists
          const newKey=uid||('web_'+Date.now());
          db.users[newKey]={name:name||'Usuario',email:email||'',userId:uid,balance:0,totalEarned:0,portfolio:{},pending:{},clockStart:{},buyDate:{},txs:[],refCode:'REF-'+Math.random().toString(36).substr(2,6).toUpperCase(),refEarned:0,createdAt:new Date().toLocaleString('es-ES')};
          found={key:newKey,u:db.users[newKey]};
        }
        const {key,u}=found;
        if(!u.txs)u.txs=[];
        const existing=u.txs.find(t=>t.hash===hash&&t.status==='pending');
        if(existing){res.writeHead(200);res.end(JSON.stringify({ok:true}));return;}
        const txId='TX-'+Date.now();
        u.txs.unshift({id:txId,type:'deposit',hash,amount:parseFloat(amount),status:'pending',date:new Date().toLocaleString('es-ES')});
        db.users[key]=u;saveDB(db);
        await tgSend(
          'RECARGA PENDIENTE\n\nUsuario: '+(u.name||name)+'\nEmail: '+(u.email||email||'-')+'\nMonto: $'+parseFloat(amount).toFixed(2)+' USDT\nHash: '+hash+'\nRed: BEP-20\nFecha: '+new Date().toLocaleString('es-ES'),
          [[{text:'Aprobar $'+parseFloat(amount).toFixed(2),callback_data:'adep_'+key+'_'+txId+'_'+amount},{text:'Rechazar',callback_data:'rdep_'+key+'_'+txId}]]
        );
        res.writeHead(200);res.end(JSON.stringify({ok:true}));
      }catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}
    });return;
  }

  // POST /withdraw
  if(path==='/withdraw'&&req.method==='POST'){
    let body='';req.on('data',d=>body+=d);
    req.on('end',async()=>{
      try{
        const {uid,tgid,name,wallet,amount}=JSON.parse(body);
        const db=loadDB();
        let found=null;
        if(tgid)found={key:tgid,u:db.users[tgid]};
        if(!found?.u&&uid){for(const[k,u]of Object.entries(db.users)){if(u.userId===uid){found={key:k,u};break;}}}
        if(!found?.u){res.writeHead(404);res.end(JSON.stringify({error:'not found'}));return;}
        const {key,u}=found;
        const amt=parseFloat(amount);
        if(amt<5){res.writeHead(400);res.end(JSON.stringify({error:'min $5'}));return;}
        if(amt>u.balance){res.writeHead(400);res.end(JSON.stringify({error:'insufficient balance'}));return;}
        const fee=parseFloat((amt*0.05).toFixed(2));
        const net=parseFloat((amt-fee).toFixed(2));
        const txId='TX-'+Date.now();
        u.balance-=amt;
        if(!u.txs)u.txs=[];
        u.txs.unshift({id:txId,type:'withdraw',wallet,amount:amt,fee,net,status:'pending',date:new Date().toLocaleString('es-ES')});
        db.users[key]=u;saveDB(db);
        await tgSend(
          'RETIRO PENDIENTE\n\nUsuario: '+(u.name||name)+'\nMonto: $'+amt.toFixed(2)+'\nComision: $'+fee.toFixed(2)+'\nRecibira: $'+net.toFixed(2)+'\nWallet: '+wallet+'\nRed: BEP-20',
          [[{text:'Procesar $'+net.toFixed(2),callback_data:'awdr_'+key+'_'+txId+'_'+amt},{text:'Rechazar',callback_data:'rwdr_'+key+'_'+txId+'_'+amt}]]
        );
        res.writeHead(200);res.end(JSON.stringify({ok:true,balance:u.balance}));
      }catch(e){res.writeHead(500);res.end(JSON.stringify({error:e.message}));}
    });return;
  }

  res.writeHead(404);res.end(JSON.stringify({error:'not found'}));
});

server.listen(3000,()=>console.log('API en puerto 3000'));
