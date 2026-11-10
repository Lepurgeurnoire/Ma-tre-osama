const { default: makeWASocket, useMultiFileAuthState, fetchLatestBaileysVersion, makeCacheableSignalKeyStore, downloadMediaMessage } = require('@whiskeysockets/baileys')
const P = require('pino')
const fs = require('fs')
const express = require('express')
const NodeCache = require('node-cache')
const axios = require('axios')
const app = express()
const PORT = process.env.PORT || 10000
const OWNER_NUMBER = "22791968795"
const PREFIX = "."
const DB_FILE = './neymar_db.json'
const msgRetryCounterCache = new NodeCache()

let db = { 
  antidelete:[], antiviewonce:[], autoread:[], autostatus:[], privateMode:false, antibot:[], 
  antilink:[], antispam:{}, alive:true, savedNotes:[], todos:[], banned:[], warns:{}, 
  autoreact:[], welcome:[], welcomeTexts:{}, silence:{}, protect:[], autoreactEmoji:"❤️", msgs:{}
}
if(fs.existsSync(DB_FILE)){ try{ Object.assign(db, JSON.parse(fs.readFileSync(DB_FILE))) }catch{} }
const saveDB = ()=> fs.writeFileSync(DB_FILE, JSON.stringify(db,null,2))

let sock, BOT_START=Date.now(), latestQR=null, status="NEYMAR BOT Démarrage..."

const getMenu = () => `
╭━━━〘 𝐍𝐄𝐘𝐌𝐀𝐑 𝐁𝐎𝐓 〙━━━╮

┏━━ 〘 BOT 〙━━
┃ .alive
┃ .ping
┃ .revel
┃ .menu
┗━━━━━━━━

┏━━ 〘 PROTECTION 〙━━
┃ .antidelete
┃ .antiviewonce
┃ .autoread
┃ .autostatus
┃ .mode
┃ .antibot
┃ .antilink
┃ .antispam
┃ .protect
┃ .autoreact
┗━━━━━━━━

┏━━ 〘 GROUPE 〙━━
┃ .welcome
┃ .setwelcome
┃ .silence
┃ .unsilence
┃ .kick
┃ .ban
┃ .promote
┃ .demote
┃ .del
┃ .tagall
┃ .hidetag
┃ .warn
┃ .link
┗━━━━━━━━

┏━━ 〘 OUTILS 〙━━
┃ .save
┃ .notes
┃ .todo
┃ .todolist
┃ .sticker
┃ .toimg
┃ .trt
┃ .toaudio
┗━━━━━━━━

┏━━ 〘 DOWNLOAD 〙━━
┃ .play
┃ .tiktok
┃ .ig
┗━━━━━━━━

┏━━ 〘 IA 〙━━
┃ .gpt
┃ .imagine
┃ .vv
┗━━━━━━━━

╰━━━━━━━━━━━━━━━━━╯
`

function normalizeJid(j){ return j?.split(':')[0].split('@')[0].replace(/[^0-9]/g,'')||"" }
function isOwner(j){ return normalizeJid(j).includes(OWNER_NUMBER) }

app.get('/', (req,res)=> res.send(`<h1>${status}</h1><a href="/pair">PAIR</a> | <a href="/qr">QR</a>`))
app.get('/pair', async(req,res)=>{
  if(!sock) return res.send('Attends 10s')
  try{ let code=await sock.requestPairingCode(OWNER_NUMBER); res.send(`<h1 style="font-size:70px">${code}</h1>`) }catch(e){ res.send(e.message) }
})
app.get('/qr', async(req,res)=>{
  if(!latestQR) return res.send('Pas de QR')
  const QRCode=require('qrcode'); res.send(`<img src="${await QRCode.toDataURL(latestQR)}" width="300">`)
})
app.listen(PORT,'0.0.0.0',()=>console.log("NEYMAR LIVE "+PORT))

async function translateText(t,to){
  try{
    let r=await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(t)}&langpair=auto|${to}`,{timeout:8000})
    if(r.data?.responseData?.translatedText) return r.data.responseData.translatedText
  }catch{}
  return t
}

async function startBot(){
  const { version } = await fetchLatestBaileysVersion()
  const { state, saveCreds } = await useMultiFileAuthState('auth')
  sock = makeWASocket({ version, auth:{creds:state.creds, keys:makeCacheableSignalKeyStore(state.keys, P({level:'silent'}))}, logger:P({level:'silent'}), browser:["NEYMAR","Chrome","1.0"], msgRetryCounterCache, markOnlineOnConnect:false, getMessage: async(k)=> db.msgs[k.id] ? {conversation:db.msgs[k.id].text} : undefined })
  sock.ev.on('creds.update', saveCreds)
  sock.ev.on('connection.update', u=>{
    if(u.qr) latestQR=u.qr
    if(u.connection==='open'){ status="NEYMAR ACTIF ✅"; latestQR=null; BOT_START=Date.now(); console.log("NEYMAR BOT LIVE") }
    if(u.connection==='close'){ setTimeout(startBot,3000) }
  })

  sock.ev.on('messages.upsert', async({messages,type})=>{
    if(type!=='notify') return
    const m=messages[0]; if(!m?.message) return
    const from=m.key.remoteJid; const sender=m.key.participant||from
    let text=m.message.conversation||m.message.extendedTextMessage?.text||m.message.imageMessage?.caption||m.message.videoMessage?.caption||""
    
    if(text) { db.msgs[m.key.id]={text, sender, from, time:Date.now()}; if(Object.keys(db.msgs).length>500) delete db.msgs[Object.keys(db.msgs)[0]]; saveDB() }

    if(db.autoread.includes(from) || db.autoread.includes('all')){
      try{ await sock.readMessages([m.key]) }catch{}
    }
    if(from==='status@broadcast' && db.autostatus.includes('all')){
      try{ await sock.readMessages([m.key]) }catch{}
      if(m.message.imageMessage||m.message.videoMessage){
        try{
          let buf=await downloadMediaMessage(m,'buffer',{},{logger:P({level:'silent'}),reuploadRequest:sock.updateMediaMessage})
          await sock.sendMessage(OWNER_NUMBER+"@s.whatsapp.net",{image:buf, caption:`👁️ Status de @${sender.split('@')[0]}`, mentions:[sender]})
        }catch{}
      }
    }
    let q=m.message.extendedTextMessage?.contextInfo?.quotedMessage
    let view = m.message.viewOnceMessageV2||m.message.viewOnceMessage||q?.viewOnceMessageV2||q?.viewOnceMessage
    if(view && (db.antiviewonce.includes(from) || db.antiviewonce.includes('all'))){
      try{
        let real=view.message||view
        let buf=await downloadMediaMessage({message:real},'buffer',{},{logger:P({level:'silent'}),reuploadRequest:sock.updateMediaMessage})
        if(real.imageMessage) await sock.sendMessage(from,{image:buf, caption:`🔓 @${sender.split('@')[0]}`, mentions:[sender]})
        else await sock.sendMessage(from,{video:buf, caption:`🔓 Antiviewonce`})
      }catch{}
    }
    if(from.endsWith('@g.us') && db.antilink.includes(from) && /(https?:\/\/|chat\.whatsapp\.com|wa\.me|t\.me|youtube|tiktok|instagram)/i.test(text) && !isOwner(sender)){
      try{ await sock.sendMessage(from,{delete:m.key}); }catch{}
    }
    if(from.endsWith('@g.us') && db.antibot.includes(from) && /bot|menu|alive|ping|tagall/i.test(text) && !isOwner(sender) && text.startsWith(PREFIX)){
      try{ await sock.groupParticipantsUpdate(from,[sender],'remove') }catch{}
    }
    if(from.endsWith('@g.us') && db.antispam[from]){
      if(!db.antispam[from].users) db.antispam[from].users={}
      let u=db.antispam[from].users[sender]||{count:0, last:0}
      if(Date.now()-u.last<5000) u.count++; else u.count=1
      u.last=Date.now()
      db.antispam[from].users[sender]=u
      if(u.count>5){ try{ await sock.sendMessage(from,{delete:m.key}); }catch{} }
    }
    if(db.silence[sender]){ try{ await sock.sendMessage(from,{delete:m.key}); }catch{} return }
    if(db.autoreact.includes(from) && !m.key.fromMe){
      try{ await sock.sendMessage(from,{react:{text:db.autoreactEmoji, key:m.key}}) }catch{}
    }
    if(!text.startsWith(PREFIX)) return
    if(db.privateMode && !isOwner(sender) && !m.key.fromMe){ return }

    const args=text.slice(1).trim().split(/ +/); const cmd=args[0].toLowerCase(); const txt=args.slice(1).join(' ')
    const mentioned=m.message.extendedTextMessage?.contextInfo?.mentionedJid||[]; let target=mentioned[0]
    const isGroup=from.endsWith('@g.us'); const meta=isGroup? await sock.groupMetadata(from).catch(()=>null):null

    if(cmd==="menu"||cmd==="help"){ await sock.sendMessage(from,{text:getMenu()},{quoted:m}); return }
    if(cmd==="alive"){ let up=Math.floor((Date.now()-BOT_START)/1000); await sock.sendMessage(from,{text:`✅ NEYMAR ACTIF\n⏱️ ${Math.floor(up/3600)}h ${Math.floor((up%3600)/60)}m`},{quoted:m}); return }
    if(cmd==="ping"){ await sock.sendMessage(from,{text:`🏓 ${Date.now()-Date.now()}ms`},{quoted:m}); return }
    if(cmd==="revel"||cmd==="reveil"){ await sock.sendMessage(from,{text:"👀 Réveillé! NEYMAR prêt!"},{quoted:m}); return }

    if(cmd==="antidelete"){ if(txt.includes("on")){ if(!db.antidelete.includes(from)) db.antidelete.push(from); } else db.antidelete=db.antidelete.filter(x=>x!==from); saveDB(); await sock.sendMessage(from,{text:db.antidelete.includes(from)?"✅ Antidelete ON":"❌ Antidelete OFF"},{quoted:m}); return }
    if(cmd==="antiviewonce"||cmd==="antiview"){ if(txt.includes("on")){ if(!db.antiviewonce.includes(from)) db.antiviewonce.push(from); } else db.antiviewonce=db.antiviewonce.filter(x=>x!==from); saveDB(); await sock.sendMessage(from,{text:db.antiviewonce.includes(from)?"✅ Antiviewonce ON":"❌ Antiviewonce OFF"},{quoted:m}); return }
    if(cmd==="vv"){ let qq=m.message.extendedTextMessage?.contextInfo?.quotedMessage; let v=qq?.viewOnceMessageV2||qq?.viewOnceMessage||m.message.viewOnceMessageV2||m.message.viewOnceMessage; if(!v) return await sock.sendMessage(from,{text:"❌ Réponds à une vue unique"},{quoted:m}); try{ let real=v.message||v; let buf=await downloadMediaMessage({message:real},'buffer',{},{logger:P({level:'silent'}),reuploadRequest:sock.updateMediaMessage}); if(real.imageMessage) await sock.sendMessage(from,{image:buf},{quoted:m}); else await sock.sendMessage(from,{video:buf},{quoted:m}); }catch(e){ await sock.sendMessage(from,{text:"❌ "+e.message},{quoted:m}) } return }
    if(cmd==="autoread"){ if(txt.includes("on")){ if(!db.autoread.includes(from)) db.autoread.push(from); } else db.autoread=db.autoread.filter(x=>x!==from); saveDB(); await sock.sendMessage(from,{text:db.autoread.includes(from)?"✅ Autoread ON":"❌ Autoread OFF"},{quoted:m}); return }
    if(cmd==="autostatus"){ if(txt.includes("on")){ if(!db.autostatus.includes('all')) db.autostatus.push('all'); } else db.autostatus=[]; saveDB(); await sock.sendMessage(from,{text:db.autostatus.length?"✅ Autostatus ON":"❌ Autostatus OFF"},{quoted:m}); return }
    if(cmd==="mode"||cmd==="private"){ if(txt.includes("private")||txt.includes("on")) db.privateMode=true; else if(txt.includes("off")) db.privateMode=false; else db.privateMode=!db.privateMode; saveDB(); await sock.sendMessage(from,{text:db.privateMode?"🔒 Private ON":"🔓 Private OFF"},{quoted:m}); return }
    if(cmd==="antibot"){ if(txt.includes("on")){ if(!db.antibot.includes(from)) db.antibot.push(from); } else db.antibot=db.antibot.filter(x=>x!==from); saveDB(); await sock.sendMessage(from,{text:db.antibot.includes(from)?"🤖 Antibot ON":"❌ Antibot OFF"},{quoted:m}); return }
    if(cmd==="antilink"){ if(txt.includes("on")){ if(!db.antilink.includes(from)) db.antilink.push(from); } else db.antilink=db.antilink.filter(x=>x!==from); saveDB(); await sock.sendMessage(from,{text:db.antilink.includes(from)?"🔗 Antilink ON":"❌ Antilink OFF"},{quoted:m}); return }
    if(cmd==="antispam"){ if(txt.includes("on")) db.antispam[from]={on:true, users:{}}; else delete db.antispam[from]; saveDB(); await sock.sendMessage(from,{text:db.antispam[from]?"🚫 Antispam ON":"❌ Antispam OFF"},{quoted:m}); return }
    if(cmd==="autoreact"){ if(txt.includes("on")){ if(!db.autoreact.includes(from)) db.autoreact.push(from); } else db.autoreact=db.autoreact.filter(x=>x!==from); saveDB(); await sock.sendMessage(from,{text:db.autoreact.includes(from)?"❤️ Autoreact ON":"❌ Autoreact OFF"},{quoted:m}); return }
    if(cmd==="welcome"){ if(txt.includes("on")){ if(!db.welcome.includes(from)) db.welcome.push(from); } else db.welcome=db.welcome.filter(x=>x!==from); saveDB(); await sock.sendMessage(from,{text:db.welcome.includes(from)?"👋 Welcome ON":"❌ Welcome OFF"},{quoted:m}); return }
    if(cmd==="setwelcome"){ 
      if(!txt) return await sock.sendMessage(from,{text:`📝 Usage: .setwelcome Bienvenue @user dans le groupe!\nUtilise @user pour mention\nActuel: ${db.welcomeTexts[from]||"par défaut"}`},{quoted:m}); 
      db.welcomeTexts[from]=txt; saveDB(); 
      await sock.sendMessage(from,{text:`✅ Welcome message changé:\n${txt}`},{quoted:m}); return }
    if(cmd==="silence"){ if(!target) return await sock.sendMessage(from,{text:"❌ Tag @user"},{quoted:m}); db.silence[target]=true; saveDB(); await sock.sendMessage(from,{text:`🤫 @${target.split('@')[0]} silence`, mentions:[target]},{quoted:m}); return }
    if(cmd==="unsilence"){ if(!target) return; delete db.silence[target]; saveDB(); await sock.sendMessage(from,{text:"🔊 Silence levé"},{quoted:m}); return }
    if(cmd==="protect"){ if(txt.includes("on")){ if(!db.protect.includes(from)) db.protect.push(from); } else db.protect=db.protect.filter(x=>x!==from); saveDB(); await sock.sendMessage(from,{text:db.protect.includes(from)?"🛡️ Protect ON":"❌ Protect OFF"},{quoted:m}); return }

    if(cmd==="kick"){ if(!isGroup||!target) return await sock.sendMessage(from,{text:"❌ Tag @user"},{quoted:m}); await sock.groupParticipantsUpdate(from,[target],'remove').catch(()=>{}); await sock.sendMessage(from,{text:`👢 @${target.split('@')[0]} kické`, mentions:[target]},{quoted:m}); return }
    if(cmd==="ban"){ if(!target) return; db.banned.push(target); saveDB(); await sock.sendMessage(from,{text:`🚫 @${target.split('@')[0]} banni`, mentions:[target]},{quoted:m}); return }
    if(cmd==="del"){ let qq=m.message.extendedTextMessage?.contextInfo?.stanzaId; let q2=m.message.extendedTextMessage?.contextInfo?.participant; if(!qq) return await sock.sendMessage(from,{text:"❌ Réponds au message"},{quoted:m}); await sock.sendMessage(from,{delete:{remoteJid:from, fromMe:false, id:qq, participant:q2}}); return }
    if(cmd==="promote"){ if(!target) return; await sock.groupParticipantsUpdate(from,[target],'promote'); await sock.sendMessage(from,{text:`⬆️ @${target.split('@')[0]} admin`, mentions:[target]},{quoted:m}); return }
    if(cmd==="demote"){ if(!target) return; if(db.protect.includes(from) && normalizeJid(target).includes(OWNER_NUMBER)) return await sock.sendMessage(from,{text:"🛡️ Protégé!"},{quoted:m}); await sock.groupParticipantsUpdate(from,[target],'demote'); await sock.sendMessage(from,{text:`⬇️ @${target.split('@')[0]} plus admin`, mentions:[target]},{quoted:m}); return }
    if(cmd==="tagall"){ if(!meta) return; let men=meta.participants.map(p=>p.id); await sock.sendMessage(from,{text:`📢 ${men.length}\n${txt}\n${men.map(p=>`@${p.split('@')[0]}`).join(' ')}`, mentions:men},{quoted:m}); return }
    if(cmd==="hidetag"){ if(!meta) return; let men=meta.participants.map(p=>p.id); await sock.sendMessage(from,{text:txt||"NEYMAR", mentions:men},{quoted:m}); return }
    if(cmd==="warn"){ if(!target) return; if(!db.warns[target]) db.warns[target]=0; db.warns[target]++; if(db.warns[target]>=3){ await sock.groupParticipantsUpdate(from,[target],'remove'); db.warns[target]=0; await sock.sendMessage(from,{text:`⚠️ @${target.split('@')[0]} 3/3 kick`, mentions:[target]},{quoted:m}); } else await sock.sendMessage(from,{text:`⚠️ @${target.split('@')[0]} ${db.warns[target]}/3`, mentions:[target]},{quoted:m}); saveDB(); return }
    if(cmd==="link"){ let code=await sock.groupInviteCode(from).catch(()=>null); await sock.sendMessage(from,{text:code?`https://chat.whatsapp.com/${code}`:"❌ Pas admin"},{quoted:m}); return }

    if(cmd==="save"){ let q=m.message.extendedTextMessage?.contextInfo?.quotedMessage; let t=q?.conversation||q?.extendedTextMessage?.text; if(!q && !txt) return await sock.sendMessage(from,{text:"❌ Réponds"},{quoted:m}); db.savedNotes.push({text: t||txt, time:Date.now()}); saveDB(); await sock.sendMessage(from,{text:"💾 Sauvé"},{quoted:m}); return }
    if(cmd==="notes"){ let l=db.savedNotes.map((n,i)=>`${i+1}. ${n.text.slice(0,50)}`).join('\n')||"Vide"; await sock.sendMessage(from,{text:`📒\n${l}`},{quoted:m}); return }
    if(cmd==="todo"){ if(!txt) return await sock.sendMessage(from,{text:"❌ .todo texte"},{quoted:m}); db.todos.push(txt); saveDB(); await sock.sendMessage(from,{text:`✅ ${txt}`},{quoted:m}); return }
    if(cmd==="todolist"){ let l=db.todos.map((t,i)=>`${i+1}. ${t}`).join('\n')||"Vide"; await sock.sendMessage(from,{text:`📋\n${l}`},{quoted:m}); return }

    if(cmd==="sticker"||cmd==="s"){ try{ let qq=m.message.extendedTextMessage?.contextInfo?.quotedMessage; let mm=qq?{message:qq}:m; let buf=await downloadMediaMessage(mm,'buffer',{},{logger:P({level:'silent'}),reuploadRequest:sock.updateMediaMessage}); await sock.sendMessage(from,{sticker:buf},{quoted:m}); }catch(e){ await sock.sendMessage(from,{text:"❌ "+e.message},{quoted:m}) } return }
    if(cmd==="toimg"){ try{ let qq=m.message.extendedTextMessage?.contextInfo?.quotedMessage; if(!qq?.stickerMessage) return await sock.sendMessage(from,{text:"❌ Réponds à un sticker"},{quoted:m}); let buf=await downloadMediaMessage({message:qq},'buffer',{},{logger:P({level:'silent'}),reuploadRequest:sock.updateMediaMessage}); await sock.sendMessage(from,{image:buf},{quoted:m}); }catch(e){ await sock.sendMessage(from,{text:"❌ "+e.message},{quoted:m}) } return }
    if(cmd==="trt"){ let p=txt.split(' '); let lang=p[0]||'fr'; let t=p.slice(1).join(' '); if(!t) return await sock.sendMessage(from,{text:"Usage: .trt fr Hello"},{quoted:m}); let tr=await translateText(t,lang); await sock.sendMessage(from,{text:`🌐 ${lang}:\n${tr}`},{quoted:m}); return }
    if(cmd==="gpt"){ let a=await axios.get(`https://text.pollinations.ai/${encodeURIComponent(txt)}`,{timeout:15000}).then(r=>r.data).catch(()=>"IA indispo"); await sock.sendMessage(from,{text:a},{quoted:m}); return }
    if(cmd==="imagine"||cmd==="img"){ let url=`https://image.pollinations.ai/prompt/${encodeURIComponent(txt)}`; await sock.sendMessage(from,{image:{url}, caption:`🎨 ${txt}`},{quoted:m}); return }
    if(cmd==="toaudio"){ try{ let qq=m.message.extendedTextMessage?.contextInfo?.quotedMessage; let mm=qq?{message:qq}:m; let buf=await downloadMediaMessage(mm,'buffer',{},{logger:P({level:'silent'}),reuploadRequest:sock.updateMediaMessage}); await sock.sendMessage(from,{audio:buf, mimetype:'audio/mp4'},{quoted:m}); }catch(e){ await sock.sendMessage(from,{text:"❌ "+e.message},{quoted:m}) } return }
    if(cmd==="play"||cmd==="tiktok"||cmd==="ig"){ await sock.sendMessage(from,{text:`🎵 ${cmd} - ${txt}\nÀ connecter API`},{quoted:m}); return }
  })

  sock.ev.on('messages.update', async(updates)=>{
    for(let u of updates){
      if(u.update.message===null && db.msgs[u.key.id]){
        let s=db.msgs[u.key.id]
        if(db.antidelete.includes(s.from)){
          try{ await sock.sendMessage(OWNER_NUMBER+"@s.whatsapp.net",{text:`🗑️ @${s.sender.split('@')[0]} a supprimé: "${s.text}"`, mentions:[s.sender]}) }catch{}
        }
        delete db.msgs[u.key.id]
      }
    }
  })

  // WELCOME MSG AVEC IMAGE + CUSTOM
  sock.ev.on('group-participants.update', async(u)=>{
    if(u.action==='add' && db.welcome.includes(u.id)){
      for(let p of u.participants){
        let pp; try{ pp=await sock.profilePictureUrl(p,'image') }catch{ pp=null }
        let custom = db.welcomeTexts[u.id]
        let defaultMsg = `Bienvenue @${p.split('@')[0]} 👋\nDans le groupe!\nLis les règles et amuse-toi!`
        let finalMsg = custom ? custom.replace(/@user/g, `@${p.split('@')[0]}`).replace(/@group/g, u.id) : defaultMsg
        
        if(pp){
          await sock.sendMessage(u.id,{image:{url:pp}, caption:finalMsg, mentions:[p]})
        }else{
          await sock.sendMessage(u.id,{text:finalMsg, mentions:[p]})
        }
      }
    }
    if(u.action==='remove' && db.welcome.includes(u.id)){
      for(let p of u.participants){
        await sock.sendMessage(u.id,{text:`😢 @${p.split('@')[0]} a quitté` , mentions:[p]})
      }
    }
    if(u.action==='demote' && db.protect.includes(u.id)){
      for(let d of u.participants){
        if(normalizeJid(d).includes(OWNER_NUMBER)){
          await sock.groupParticipantsUpdate(u.id,[d],'promote').catch(()=>{})
          await sock.sendMessage(u.id,{text:`🛡️ Protect!`})
        }
      }
    }
  })
}
startBot()
