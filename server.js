const express=require('express');const http=require('http');const crypto=require('crypto');const {Server}=require('socket.io');
const app=express(),server=http.createServer(app),io=new Server(server);app.use(express.static('public'));
const rooms=new Map(),colors=['red','blue','green','yellow'];
function makeDeck(){const d=[];for(const color of colors)for(let n=1;n<=9;n++){for(let i=0;i<((n===1||n===9)?1:2);i++)d.push({type:'number',color,value:n,id:crypto.randomUUID()})}for(const [t,n] of [['switch',4],['skip',4],['draw2',4],['wild',4],['mirror',4],['boom',2],['steal',2]])for(let i=0;i<n;i++)d.push({type:t,id:crypto.randomUUID()});return d.sort(()=>Math.random()-.5)}
function state(r){return{players:r.players.map(p=>({id:p.id,name:p.name,count:p.hand.length,bot:!!p.bot})),top:r.discard.at(-1),color:r.color,turn:r.players[r.turn]?.id,started:r.started,winner:r.winner||null}}
function broadcast(c){const r=rooms.get(c);if(r)io.to(c).emit('state',state(r))}function hands(r){r.players.filter(p=>!p.bot).forEach(p=>io.to(p.id).emit('hand',p.hand))}
function draw(r,p,n=1){for(let i=0;i<n;i++){if(!r.deck.length){if(r.discard.length<=1)break;const top=r.discard.pop();r.deck=r.discard.splice(0).sort(()=>Math.random()-.5);r.discard=[top]}if(r.deck.length)p.hand.push(r.deck.pop())}}
function can(c,r){const t=r.discard.at(-1);return c&&(['wild','switch','skip','draw2','mirror','boom','steal'].includes(c.type)||c.color===r.color||c.value===t?.value)}
function next(r,n=1){r.turn=(r.turn+n)%r.players.length}
function start(r){r.deck=makeDeck();r.discard=[];r.players.forEach(p=>p.hand=[]);for(let i=0;i<7;i++)r.players.forEach(p=>p.hand.push(r.deck.pop()));let f=r.deck.pop();while(f.type!=='number'){r.deck.unshift(f);f=r.deck.pop()}r.discard.push(f);r.color=f.color;r.turn=0;r.started=true;r.winner=null}
function botColor(h){const n=Object.fromEntries(colors.map(c=>[c,0]));h.forEach(c=>c.color&&(n[c.color]++));return colors.sort((a,b)=>n[b]-n[a])[0]}
function after(r,c,p){if(p.hand.length===0){r.winner=p.id;broadcast(c);hands(r);return}broadcast(c);hands(r);setTimeout(()=>botTurn(c),450)}
function play(r,c,p,i,wildColor){const card=p.hand[i];if(!card||!can(card,r)||r.winner)return;p.hand.splice(i,1);r.discard.push(card);if(card.type==='wild')r.color=colors.includes(wildColor)?wildColor:r.color;else if(card.color)r.color=card.color;
if(card.type==='switch'){const hs=r.players.map(x=>x.hand);r.players.forEach((x,i)=>x.hand=hs[(i+1)%r.players.length]);next(r)}
else if(card.type==='skip')next(r,2);
else if(card.type==='draw2'){next(r);draw(r,r.players[r.turn],2);next(r)}
else if(card.type==='mirror'){next(r);const need=r.discard.at(-2),q=r.players[r.turn];if(!q.hand.some(x=>x.type==='number'&&x.value===need?.value)){draw(r,q,2);next(r)}}
else if(card.type==='boom'){const pool=[];r.players.forEach(x=>x.hand.length&&pool.push(x.hand.splice(Math.floor(Math.random()*x.hand.length),1)[0]));r.players.forEach(x=>pool.length&&x.hand.push(pool[Math.floor(Math.random()*pool.length)]));next(r)}
else if(card.type==='steal'){next(r);const q=r.players[r.turn];if(q.hand.length)p.hand.push(q.hand.splice(Math.floor(Math.random()*q.hand.length),1)[0]);next(r)}else next(r);after(r,c,p)}
function botTurn(c){const r=rooms.get(c);if(!r||!r.started||r.winner)return;const b=r.players[r.turn];if(!b?.bot)return;const opts=b.hand.map((x,i)=>({x,i})).filter(o=>can(o.x,r));if(!opts.length){draw(r,b);next(r);broadcast(c);hands(r);return setTimeout(()=>botTurn(c),500)}let o=opts.find(x=>x.x.type==='draw2')||opts.find(x=>x.x.type==='number')||opts[0];play(r,c,b,o.i,o.x.type==='wild'?botColor(b.hand):undefined)}
function addBots(r,n){for(let i=0;i<n;i++)r.players.push({id:'bot-'+crypto.randomUUID(),name:`Bot ${i+1}`,hand:[],bot:true})}function code(){let c=Math.random().toString(36).slice(2,6).toUpperCase();while(rooms.has(c))c=Math.random().toString(36).slice(2,6).toUpperCase();return c}
io.on('connection',s=>{
 s.on('create',({name},cb)=>{const c=code();rooms.set(c,{players:[{id:s.id,name:(name||'Speler').slice(0,18),hand:[]}],started:false,deck:[],discard:[],turn:0,color:null});s.join(c);s.data.code=c;cb({code:c});broadcast(c)});
 s.on('createBots',({name,count},cb)=>{const c=code(),r={players:[{id:s.id,name:(name||'Speler').slice(0,18),hand:[]}],started:false,deck:[],discard:[],turn:0,color:null};addBots(r,Math.max(1,Math.min(5,Number(count)||1)));rooms.set(c,r);s.join(c);s.data.code=c;cb({code:c});broadcast(c)});
 s.on('join',({code:c,name},cb)=>{c=String(c||'').toUpperCase();const r=rooms.get(c);if(!r||r.started||r.players.length>=6)return cb({error:'Room bestaat niet, is al gestart of zit vol.'});r.players.push({id:s.id,name:(name||'Speler').slice(0,18),hand:[]});s.join(c);s.data.code=c;cb({code:c});broadcast(c)});
 s.on('start',()=>{const r=rooms.get(s.data.code);if(r&&r.players[0].id===s.id&&r.players.length>=2){start(r);broadcast(s.data.code);hands(r);setTimeout(()=>botTurn(s.data.code),600)}});
 s.on('play',({index,wildColor})=>{const c=s.data.code,r=rooms.get(c);if(!r||!r.started||r.winner||r.players[r.turn]?.id!==s.id)return;play(r,c,r.players[r.turn],index,wildColor)});
 s.on('draw',()=>{const c=s.data.code,r=rooms.get(c);if(!r||!r.started||r.winner||r.players[r.turn]?.id!==s.id)return;draw(r,r.players[r.turn]);next(r);broadcast(c);hands(r);setTimeout(()=>botTurn(c),450)});
 s.on('disconnect',()=>{const c=s.data.code,r=rooms.get(c);if(!r)return;r.players=r.players.filter(p=>p.id!==s.id);if(!r.players.length)rooms.delete(c);else{if(r.turn>=r.players.length)r.turn=0;broadcast(c);hands(r);setTimeout(()=>botTurn(c),300)}})
});server.listen(process.env.PORT||3000,()=>console.log('SWITCH draait op http://localhost:'+(process.env.PORT||3000)));
