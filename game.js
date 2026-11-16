'use strict';
(function(){
const $ = s => document.querySelector(s);
const canvas = $('#game'), ctx = canvas.getContext('2d');
let W = 0, H = 0, DPR = 1, scale = 1, viewW = 0, viewH = 0, ui = 1, camTop = 0;
let GROUND_MARGIN = 110;
const safe = {t:0, r:0, b:0, l:0};

/* ---------------- 存档 ---------------- */
const KEY = 'kaixin-coin-v1';
const DEF = {wallet:0, owned:{hat:['none'], color:['sun'], scene:['garden']}, equip:{hat:'none', color:'sun', scene:'garden'},
  stars:{}, best:{}, cleared:{}, streak:0, lastLogin:'', total:0, maxCombo:0, plays:0, tut:false,
  set:{sound:true, music:true, speed:'slow'}};
function loadSave(){
  const d = JSON.parse(JSON.stringify(DEF));
  try{
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (s && typeof s === 'object'){
      for (const k in s) if (!(typeof DEF[k] === 'object' && DEF[k] && !Array.isArray(DEF[k]))) d[k] = s[k];
      for (const k of ['owned','equip','stars','best','cleared','set']) if (s[k]) Object.assign(d[k], s[k]);
    }
  }catch(e){}
  return d;
}
const S = loadSave();
function save(){ try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){} }

/* ---------------- 商品 ---------------- */
const HATS = [
  {id:'none', name:'不戴帽', price:0}, {id:'beanie', name:'红毛线帽', price:200}, {id:'bow', name:'蝴蝶结', price:350},
  {id:'straw', name:'遮阳草帽', price:500}, {id:'flower', name:'花环', price:650}, {id:'chef', name:'厨师帽', price:800},
  {id:'crown', name:'金皇冠', price:1888}];
const COLORS = [
  {id:'sun', name:'暖阳黄', price:0, body:'#FFC93C', dark:'#EE9F00'}, {id:'pink', name:'樱花粉', price:300, body:'#FFA3C2', dark:'#E66B95'},
  {id:'sky', name:'天空蓝', price:300, body:'#86CDFF', dark:'#4A9EE0'}, {id:'mint', name:'薄荷绿', price:350, body:'#8EE4AF', dark:'#3FB874'},
  {id:'grape', name:'葡萄紫', price:450, body:'#C7A6FF', dark:'#8E64DD'}, {id:'snow', name:'雪团白', price:550, body:'#FFFFFF', dark:'#B9C6D8'}];
const SCENES = [
  {id:'garden', name:'花园', price:0}, {id:'beach', name:'海边', price:600}, {id:'home', name:'老家', price:1000},
  {id:'snow', name:'雪乡', price:1500}, {id:'night', name:'星空夜', price:2200}];
const byId = (arr, id) => arr.find(a => a.id === id) || arr[0];

/* ---------------- 声音（WebAudio 合成） ---------------- */
const MEL = [72,0,76,79, 81,0,79,76, 74,0,76,79, 76,0,0,0, 72,0,74,76, 79,0,81,79, 76,0,74,72, 74,0,0,0,
             79,0,81,84, 81,0,79,76, 77,0,76,74, 72,0,74,0, 76,0,79,76, 74,0,72,74, 72,0,0,0, 0,0,0,0];
const BASS = [48,53,55,48, 45,50,55,48, 53,48,50,55, 48,55,48,48];
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const Snd = {
  ctx:null, master:null, mus:null, timer:null, next:0, step:0, lastCoin:0,
  unlock(){
    try{
      if (!this.ctx){
        const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
        try{ if (navigator.audioSession) navigator.audioSession.type = 'playback'; }catch(e){}
        this.ctx = new AC();
        this.master = this.ctx.createGain(); this.master.gain.value = 0.7; this.master.connect(this.ctx.destination);
        this.mus = this.ctx.createGain(); this.mus.gain.value = 0.16; this.mus.connect(this.master);
      }
      if (this.ctx.state !== 'running') this.ctx.resume();
      const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource();
      s.buffer = b; s.connect(this.ctx.destination); s.start(0);
      this.startMusic();
    }catch(e){}
  },
  ok(){ return this.ctx && this.ctx.state === 'running' && S.set.sound; },
  tone(f, t0, dur, type, vol, dest, slide){
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.master); o.start(t0); o.stop(t0 + dur + 0.03);
  },
  coin(combo){
    if (!this.ok()) return; const t = this.ctx.currentTime; if (t - this.lastCoin < 0.035) return; this.lastCoin = t;
    const k = 1 + Math.min(combo, 24) * 0.022;
    this.tone(988*k, t, 0.06, 'square', 0.07); this.tone(1319*k, t+0.055, 0.22, 'square', 0.07);
    this.tone(2637*k, t+0.055, 0.2, 'sine', 0.05);
  },
  big(){ if (!this.ok()) return; const t = this.ctx.currentTime; [1047,1319,1568,2093].forEach((f,i)=>this.tone(f, t+i*0.06, 0.25, 'triangle', 0.18)); },
  jump(two){ if (!this.ok()) return; const t = this.ctx.currentTime; this.tone(two?520:380, t, 0.16, 'sine', 0.16, null, two?1100:800); },
  hit(){ if (!this.ok()) return; const t = this.ctx.currentTime; this.tone(330, t, 0.25, 'triangle', 0.22, null, 140); },
  combo(){ if (!this.ok()) return; const t = this.ctx.currentTime; [784,988,1175,1568].forEach((f,i)=>this.tone(f, t+i*0.07, 0.2, 'square', 0.06)); },
  rain(){ if (!this.ok()) return; const t = this.ctx.currentTime; for (let i=0;i<8;i++) this.tone(1200+i*180, t+i*0.05, 0.15, 'sine', 0.1); },
  power(){ if (!this.ok()) return; const t = this.ctx.currentTime; this.tone(400, t, 0.4, 'sawtooth', 0.06, null, 1600); this.tone(800, t+0.1, 0.35, 'sine', 0.1, null, 1800); },
  star(i){ if (!this.ok()) return; const t = this.ctx.currentTime; this.tone([1047,1319,1568][i]||1568, t, 0.35, 'triangle', 0.2); this.tone(([1047,1319,1568][i]||1568)*2, t, 0.3, 'sine', 0.06); },
  fanfare(){ if (!this.ok()) return; const t = this.ctx.currentTime; [[784,0],[988,.12],[1175,.24],[1568,.36],[1568,.6]].forEach(([f,d])=>{this.tone(f,t+d,0.3,'square',0.08);this.tone(f/2,t+d,0.3,'triangle',0.12);}); },
  click(){ if (!this.ok()) return; this.tone(880, this.ctx.currentTime, 0.08, 'sine', 0.12); },
  buy(){ if (!this.ok()) return; const t = this.ctx.currentTime; [1319,1568,2093].forEach((f,i)=>this.tone(f, t+i*0.08, 0.25, 'triangle', 0.16)); },
  startMusic(){ if (!this.ctx || this.timer) return; this.next = this.ctx.currentTime + 0.2; this.step = 0; this.timer = setInterval(() => this.sched(), 100); },
  sched(){
    const c = this.ctx; if (!c) return;
    if (!S.set.music || c.state !== 'running' || document.hidden || G.state === 'pause'){ this.next = c.currentTime + 0.15; return; }
    while (this.next < c.currentTime + 0.35){
      const i = this.step % MEL.length, n = MEL[i];
      if (n) this.tone(midi(n), this.next, 0.3, 'triangle', 0.5, this.mus);
      if (i % 4 === 0){ const b = BASS[(i/4|0) % BASS.length]; this.tone(midi(b), this.next, 0.9, 'sine', 0.7, this.mus); }
      this.next += 0.22; this.step++;
    }
  }
};
['pointerdown','touchend','click','keydown'].forEach(ev => document.addEventListener(ev, () => Snd.unlock(), {capture:true, passive:true}));

/* ---------------- 随机数 ---------------- */
function rng(seed){ let a = seed >>> 0; return function(){ a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const hash = n => { let x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/* ---------------- 日期 ---------------- */
const pad = n => (n < 10 ? '0' : '') + n;
function dayKey(d){ return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()); }
function daySeed(d){ return d.getFullYear()*10000 + (d.getMonth()+1)*100 + d.getDate(); }
function addDays(d, n){ const x = new Date(d); x.setDate(x.getDate() + n); return x; }

/* ---------------- 关卡生成（日期做种子） ---------------- */
function genLevel(seed){
  const R = rng(seed * 2654435761 >>> 0 ^ 0x9E3779B9), ri = (a, b) => a + Math.floor(R() * (b - a + 1));
  const L = {seed, coins:[], plats:[], obs:[], items:[], rains:[], clouds:[], len:0, total:0};
  const coin = (x, y, big) => { L.coins.push({x, y, big:!!big, r:big ? 34 : 19, taken:false, ph:R()*6}); L.total += big ? 10 : 1; };
  const arcOver = (cx, peak, n, span) => { for (let i = 0; i < n; i++){ const u = (i/(n-1))*2 - 1; coin(cx + u*span/2, -45 - (1-u*u)*peak); } };
  let x = 520;
  for (let i = 0; i < 8; i++) coin(x + i*55, -40);
  x += 8*55 + 260;
  const LEN = 14500 + ri(0, 2500);
  const rainAt = [LEN*0.34 + ri(-400, 400), LEN*0.74 + ri(-400, 400)];
  L.rains = rainAt.map(rx => ({x:rx, done:false}));
  let magnet = false, last = -1;
  while (x < LEN){
    const p = x / LEN;
    if (!magnet && x > LEN*0.5){ L.items.push({x:x+120, y:-150, type:'magnet', taken:false}); for (let i=0;i<6;i++) coin(x+300+i*55, -40); x += 700; magnet = true; continue; }
    if (rainAt.some(r => r > x - 200 && r < x + 900)){ for (let i=0;i<10;i++) coin(x+i*55, -40); x += 10*55 + 400; continue; }
    let t = ri(0, 8); if (t === last) t = ri(0, 8); last = t;
    if (t === 0){ const n = ri(7, 12), y = R() < 0.7 ? -40 : -150; for (let i=0;i<n;i++) coin(x+i*55, y); x += n*55 + ri(160, 260); }
    else if (t === 1){ const n = ri(10, 15), amp = ri(80, 160); for (let i=0;i<n;i++) coin(x+i*50, -50 - Math.sin(i/(n-1)*Math.PI)*amp); x += n*50 + ri(160, 260); }
    else if (t === 2 || t === 7){ L.obs.push({x:x+240, w:54, h:50, kind:ri(0,1)}); arcOver(x+267, 170, 7, 330); x += 560; if (p > 0.45 && R() < 0.5){ L.obs.push({x:x+40, w:54, h:50, kind:ri(0,1)}); arcOver(x+67, 170, 7, 330); x += 360; } }
    else if (t === 3){ const w = ri(5, 9)*50, h = -ri(130, 190); L.plats.push({x, y:h, w}); for (let i=0;i<w/50;i++) coin(x+25+i*50, h-42);
      if (p > 0.25 && R() < 0.5) L.obs.push({x:x+w/2-27, w:54, h:50, kind:ri(0,1)}); else for (let i=0;i<w/55-1;i++) coin(x+40+i*55, -40);
      x += w + ri(200, 280); }
    else if (t === 4){ L.plats.push({x, y:-130, w:250}); L.plats.push({x:x+330, y:-250, w:260});
      for (let i=0;i<5;i++) coin(x+25+i*50, -172); for (let i=0;i<5;i++) coin(x+355+i*50, -292); coin(x+460, -440, true); x += 820; }
    else if (t === 5){ for (let i=0;i<5;i++) coin(x+i*60, -60 - i*45); coin(x+5*60+40, -330, true); for (let i=0;i<4;i++) coin(x+420+i*55, -40); x += 720; }
    else if (t === 6){ const cols = ri(4, 6); for (let r=0;r<3;r++) for (let c=0;c<cols;c++) coin(x+c*55, -40 - r*55); x += cols*55 + 240; }
    else { const n = 9; for (let i=0;i<n;i++) coin(x+i*55, -40 - (i%2)*70); x += n*55 + 200; }
  }
  L.len = x + 300;
  return L;
}

/* ---------------- 绘图小工具 ---------------- */
function rr(c, x, y, w, h, r){ c.beginPath(); c.moveTo(x+r, y); c.arcTo(x+w, y, x+w, y+h, r); c.arcTo(x+w, y+h, x, y+h, r); c.arcTo(x, y+h, x, y, r); c.arcTo(x, y, x+w, y, r); c.closePath(); }
function ell(c, x, y, rx, ry, fill){ c.beginPath(); c.ellipse(x, y, Math.max(0.1,rx), Math.max(0.1,ry), 0, 0, Math.PI*2); if (fill){ c.fillStyle = fill; c.fill(); } }
function starPath(c, x, y, r1, r2, n){ c.beginPath(); for (let i=0;i<n*2;i++){ const r = i%2 ? r2 : r1, a = -Math.PI/2 + i*Math.PI/n; c.lineTo(x+Math.cos(a)*r, y+Math.sin(a)*r); } c.closePath(); }

function drawCoin(c, x, y, r, t, ph, big){
  const sw = Math.cos(t*3.2 + ph), w = Math.max(0.18, Math.abs(sw)) * r;
  c.save(); c.translate(x, y);
  ell(c, 0, 0, w, r, big ? '#E07B00' : '#E89B0C');
  ell(c, sw > 0 ? -w*0.06 : w*0.06, 0, w*0.9, r*0.92, big ? '#FFC21A' : '#FFD23F');
  ell(c, 0, 0, w*0.66, r*0.68, big ? '#FFD95A' : '#FFE27A');
  if (big){ c.fillStyle = '#E2391F'; c.font = 'bold ' + (r*1.05) + 'px "PingFang SC",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.save(); c.scale(Math.max(0.18, Math.abs(sw)), 1); c.fillText('福', 0, r*0.05); c.restore(); }
  else { c.fillStyle = '#F2A900'; c.fillRect(-w*0.12, -r*0.42, w*0.24, r*0.84); }
  c.globalAlpha = 0.85; ell(c, -w*0.35, -r*0.42, w*0.16, r*0.2, '#fff'); c.globalAlpha = 1;
  c.restore();
}

function drawHero(c, x, y, s, colId, hatId, run, vy, airborne){
  const col = byId(COLORS, colId);
  const sq = airborne ? Math.max(-0.12, Math.min(0.12, -vy/6000)) : 0;
  const bob = airborne ? 0 : Math.abs(Math.sin(run/22))*s*0.05;
  c.save(); c.translate(x, y - bob);
  // 脚
  const ph = airborne ? 0.6 : Math.sin(run/14);
  c.fillStyle = '#FF8C2A';
  ell(c, -s*0.17 + ph*s*0.1, -s*0.04, s*0.14, s*0.08, '#FF8C2A');
  ell(c, s*0.15 - ph*s*0.1, -s*0.04, s*0.14, s*0.08, '#FF8C2A');
  // 身体
  const by = -s*0.5, rx = s*0.5*(1-sq), ry = s*0.47*(1+sq);
  ell(c, 0, by+s*0.03, rx, ry, col.dark);
  ell(c, 0, by, rx*0.97, ry*0.95, col.body);
  ell(c, s*0.06, by+s*0.14, rx*0.6, ry*0.5, 'rgba(255,255,255,.55)');
  // 翅膀
  const fl = airborne ? Math.sin(run/3)*0.5 : Math.sin(run/14)*0.15;
  c.save(); c.translate(-s*0.36, by+s*0.06); c.rotate(-0.4 + fl); ell(c, 0, 0, s*0.2, s*0.12, col.dark); c.restore();
  // 眼睛
  ell(c, s*0.1, by-s*0.1, s*0.1, s*0.12, '#3b2a1a'); ell(c, s*0.33, by-s*0.1, s*0.09, s*0.11, '#3b2a1a');
  ell(c, s*0.13, by-s*0.15, s*0.04, s*0.045, '#fff'); ell(c, s*0.355, by-s*0.15, s*0.035, s*0.04, '#fff');
  // 腮红 + 嘴
  ell(c, s*0.0, by+s*0.06, s*0.08, s*0.05, 'rgba(255,110,130,.5)'); ell(c, s*0.42, by+s*0.06, s*0.06, s*0.045, 'rgba(255,110,130,.5)');
  c.fillStyle = '#FF8C2A'; c.beginPath(); c.moveTo(s*0.3, by+s*0.0); c.lineTo(s*0.52, by+s*0.05); c.lineTo(s*0.3, by+s*0.11); c.closePath(); c.fill();
  // 呆毛
  c.strokeStyle = col.dark; c.lineWidth = s*0.05; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, by-ry*0.95); c.quadraticCurveTo(s*0.05, by-ry*1.3, s*0.16, by-ry*1.2); c.stroke();
  drawHat(c, hatId, s, by - ry*0.9);
  c.restore();
}
function drawHat(c, id, s, top){
  if (id === 'beanie'){ c.fillStyle = '#E8423F'; c.beginPath(); c.ellipse(0, top+s*0.1, s*0.4, s*0.3, 0, Math.PI, 0); c.fill();
    c.fillStyle = '#C62F2C'; rr(c, -s*0.42, top+s*0.04, s*0.84, s*0.12, s*0.05); c.fill(); ell(c, 0, top-s*0.24, s*0.1, s*0.1, '#fff'); }
  else if (id === 'bow'){ c.fillStyle = '#FF5C93'; c.beginPath(); c.moveTo(s*0.1, top+s*0.02); c.lineTo(-s*0.18, top-s*0.16); c.lineTo(-s*0.16, top+s*0.18); c.closePath(); c.fill();
    c.beginPath(); c.moveTo(s*0.1, top+s*0.02); c.lineTo(s*0.38, top-s*0.16); c.lineTo(s*0.36, top+s*0.18); c.closePath(); c.fill(); ell(c, s*0.1, top+s*0.02, s*0.08, s*0.08, '#FF2E76'); }
  else if (id === 'straw'){ ell(c, 0, top+s*0.08, s*0.62, s*0.13, '#E9C46A'); c.fillStyle = '#F4D58D'; c.beginPath(); c.ellipse(0, top+s*0.06, s*0.32, s*0.26, 0, Math.PI, 0); c.fill();
    c.fillStyle = '#E63946'; c.fillRect(-s*0.32, top-s*0.02, s*0.64, s*0.07); }
  else if (id === 'flower'){ const cs = ['#FF6B9A','#FFD23F','#7ED957','#6EC6FF','#C77DFF']; for (let i=0;i<5;i++){ const a = Math.PI + (i/4)*Math.PI, fx = Math.cos(a)*s*0.36, fy = top+s*0.12+Math.sin(a)*s*0.14;
    for (let k=0;k<5;k++){ const b = k/5*Math.PI*2; ell(c, fx+Math.cos(b)*s*0.06, fy+Math.sin(b)*s*0.06, s*0.05, s*0.05, cs[i]); } ell(c, fx, fy, s*0.04, s*0.04, '#fff'); } }
  else if (id === 'chef'){ c.fillStyle = '#fff'; c.strokeStyle = '#ddd'; c.lineWidth = s*0.02; rr(c, -s*0.24, top-s*0.05, s*0.48, s*0.16, s*0.03); c.fill(); c.stroke();
    ell(c, -s*0.16, top-s*0.18, s*0.16, s*0.15, '#fff'); ell(c, s*0.16, top-s*0.18, s*0.16, s*0.15, '#fff'); ell(c, 0, top-s*0.28, s*0.18, s*0.17, '#fff'); }
  else if (id === 'crown'){ c.fillStyle = '#FFC400'; c.strokeStyle = '#D48800'; c.lineWidth = s*0.03; c.beginPath(); c.moveTo(-s*0.28, top+s*0.1); c.lineTo(-s*0.3, top-s*0.2); c.lineTo(-s*0.14, top-s*0.05);
    c.lineTo(0, top-s*0.28); c.lineTo(s*0.14, top-s*0.05); c.lineTo(s*0.3, top-s*0.2); c.lineTo(s*0.28, top+s*0.1); c.closePath(); c.fill(); c.stroke();
    ell(c, 0, top-s*0.02, s*0.05, s*0.05, '#E63946'); ell(c, -s*0.17, top+s*0.02, s*0.035, s*0.035, '#4CC9F0'); ell(c, s*0.17, top+s*0.02, s*0.035, s*0.035, '#4CC9F0'); }
}

function drawHedgehog(c, o, t){
  const x = o.x + o.w/2, y = 0, s = o.w, b = Math.sin(t*4 + o.x)*2;
  c.save(); c.translate(x, y + b*0.3);
  c.fillStyle = o.kind ? '#7A4E2D' : '#6B5B95';
  c.beginPath(); for (let i=0;i<=9;i++){ const a = Math.PI + i/9*Math.PI, r = i%2 ? s*0.58 : s*0.78; c.lineTo(Math.cos(a)*r*1.05 + s*0.05, -s*0.05 + Math.sin(a)*r); } c.closePath(); c.fill();
  ell(c, -s*0.05, -s*0.3, s*0.48, s*0.34, o.kind ? '#D9A066' : '#B8A9E3');
  ell(c, -s*0.25, -s*0.36, s*0.06, s*0.08, '#2b1a10'); ell(c, -s*0.24, -s*0.39, s*0.02, s*0.025, '#fff');
  ell(c, -s*0.5, -s*0.27, s*0.07, s*0.06, '#2b1a10'); ell(c, -s*0.15, -s*0.2, s*0.07, s*0.04, 'rgba(255,100,120,.5)');
  ell(c, -s*0.2, -s*0.02, s*0.1, s*0.05, '#5a3a20'); ell(c, s*0.15, -s*0.02, s*0.1, s*0.05, '#5a3a20');
  c.restore();
}
function drawMagnet(c, x, y, t){
  c.save(); c.translate(x, y + Math.sin(t*3)*8); c.rotate(Math.sin(t*2)*0.15);
  c.globalAlpha = 0.35 + Math.sin(t*6)*0.15; ell(c, 0, 0, 44, 44, '#FFF59D'); c.globalAlpha = 1;
  c.lineWidth = 18; c.strokeStyle = '#E53935'; c.beginPath(); c.arc(0, -4, 22, Math.PI, 0); c.stroke();
  c.beginPath(); c.moveTo(-22, -4); c.lineTo(-22, 16); c.moveTo(22, -4); c.lineTo(22, 16); c.stroke();
  c.fillStyle = '#ECEFF1'; c.fillRect(-31, 12, 18, 12); c.fillRect(13, 12, 18, 12);
  c.restore();
}
function drawGate(c, x, t){
  c.save(); c.translate(x, 0);
  c.fillStyle = '#FF7043'; rr(c, -14, -330, 28, 330, 8); c.fill(); rr(c, 286, -330, 28, 330, 8); c.fill();
  c.fillStyle = '#FFCA28'; rr(c, -30, -360, 360, 70, 22); c.fill(); c.strokeStyle = '#F57F17'; c.lineWidth = 6; c.stroke();
  c.fillStyle = '#C62828'; c.font = 'bold 48px "PingFang SC",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('终 点', 150, -324);
  const bc = ['#EF5350','#42A5F5','#66BB6A','#FFCA28','#AB47BC'];
  for (let i=0;i<5;i++){ const bx = -40 + i*95, byy = -430 + Math.sin(t*2+i)*10; c.strokeStyle = '#999'; c.lineWidth = 2; c.beginPath(); c.moveTo(bx, byy+34); c.lineTo(bx+5, -330); c.stroke(); ell(c, bx, byy, 26, 32, bc[i]); ell(c, bx-8, byy-10, 6, 9, 'rgba(255,255,255,.6)'); }
  c.restore();
}

/* ---------------- 场景 ---------------- */
const SC = {
  garden:{sky:['#7CCBFF','#DDF3FF'], ground:'#C98B4F', top:'#6BCB5A', top2:'#4FAF45', plat:'#B9773D', platTop:'#7ED957', bg:'#8FD3FF'},
  beach: {sky:['#5DBBFF','#FFF1D0'], ground:'#F2CF85', top:'#F9E2A7', top2:'#E8C06B', plat:'#C9935A', platTop:'#F9E2A7', bg:'#5DBBFF'},
  home:  {sky:['#FFA96B','#FFEBC8'], ground:'#C7965E', top:'#8CC152', top2:'#6FA33D', plat:'#8D8D8D', platTop:'#B0B0B0', bg:'#FFA96B'},
  snow:  {sky:['#A9D8FF','#F3FAFF'], ground:'#CFE3F5', top:'#FFFFFF', top2:'#E3EEF9', plat:'#7FB7E6', platTop:'#E6F6FF', bg:'#A9D8FF'},
  night: {sky:['#141A46','#4B3D8F'], ground:'#3B2D66', top:'#6A5ACD', top2:'#5546B0', plat:'#4E3E92', platTop:'#9C8CFF', bg:'#141A46'}
};
function layer(f){ const k = DPR*scale; ctx.setTransform(k, 0, 0, k, -G.camX*f*k, -camTop*k); }
function each(f, spacing, fn){ const lc = G.camX*f, i0 = Math.floor(lc/spacing) - 1, i1 = Math.ceil((lc + viewW)/spacing) + 1; for (let i=i0;i<=i1;i++) fn(i*spacing, i); }
function drawScene(id, t){
  const P = SC[id] || SC.garden;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const gy = H - GROUND_MARGIN*scale;
  const g = ctx.createLinearGradient(0, 0, 0, gy); g.addColorStop(0, P.sky[0]); g.addColorStop(1, P.sky[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  const k = scale;
  if (id === 'night'){
    for (let i=0;i<90;i++){ const sx = hash(i)*W, sy = hash(i+99)*gy*0.85; ctx.globalAlpha = 0.4 + 0.6*Math.abs(Math.sin(t*1.5 + i)); ell(ctx, sx, sy, 1.6*k+0.5, 1.6*k+0.5, '#fff'); }
    ctx.globalAlpha = 1; ell(ctx, W*0.8, gy*0.22, 46*k, 46*k, '#FFF4C2'); ell(ctx, W*0.8+18*k, gy*0.22-10*k, 40*k, 40*k, P.sky[0]);
  } else {
    const sunC = id === 'home' ? '#FF7A3D' : '#FFE066';
    ctx.globalAlpha = 0.25; ell(ctx, W*0.82, gy*0.2, 90*k, 90*k, sunC); ctx.globalAlpha = 1; ell(ctx, W*0.82, gy*0.2, 58*k, 58*k, sunC);
  }
  // 云
  layer(0.08);
  if (id !== 'night') each(0.08, 520, (x, i) => { const y = camTop + 70 + hash(i)*Math.max(60, (-camTop - 420)); const s = 0.7 + hash(i+5)*0.6; ctx.globalAlpha = 0.9;
    ell(ctx, x, y, 70*s, 30*s, '#fff'); ell(ctx, x-40*s, y+8*s, 45*s, 24*s, '#fff'); ell(ctx, x+45*s, y+6*s, 50*s, 26*s, '#fff'); ell(ctx, x+5*s, y-18*s, 40*s, 26*s, '#fff'); ctx.globalAlpha = 1; });
  // 远景
  layer(0.18);
  if (id === 'beach'){
    const lc = G.camX*0.18; const sg = ctx.createLinearGradient(0, -200, 0, 0); sg.addColorStop(0, '#2FA4E7'); sg.addColorStop(1, '#7FD6F7');
    ctx.fillStyle = sg; ctx.fillRect(lc - 10, -200, viewW + 20, 200);
    ctx.strokeStyle = 'rgba(255,255,255,.7)'; ctx.lineWidth = 4; each(0.18, 140, (x, i) => { const y = -170 + (i%4)*42 + Math.sin(t+i)*4; ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x+25, y-10, x+50, y); ctx.stroke(); });
    each(0.18, 1400, (x, i) => { if (hash(i) < 0.5) return; ell(ctx, x, -200, 130, 50, '#6CC57C'); ell(ctx, x+20, -230, 60, 40, '#5BB46C'); });
  } else if (id === 'home' || id === 'snow'){
    each(0.18, 420, (x, i) => { const h = 260 + hash(i)*200; ctx.fillStyle = id === 'snow' ? '#9BB9D9' : '#B9A3C9'; ctx.beginPath(); ctx.moveTo(x-260, 0); ctx.lineTo(x, -h); ctx.lineTo(x+260, 0); ctx.fill();
      if (id === 'snow'){ ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x-70, -h+70*h/260); ctx.lineTo(x, -h); ctx.lineTo(x+70, -h+70*h/260); ctx.lineTo(x+30, -h+55*h/260); ctx.lineTo(x, -h+75*h/260); ctx.lineTo(x-30, -h+55*h/260); ctx.fill(); } });
  } else {
    each(0.18, 380, (x, i) => { const r = 180 + hash(i)*140; ell(ctx, x, 40, r*1.3, r, id === 'night' ? '#2C2466' : '#9ADB7E'); });
  }
  // 中景
  layer(0.45);
  const G2 = id === 'night' ? '#382C7A' : null;
  each(0.45, 300, (x, i) => {
    const hv = hash(i*3.7); if (hv < 0.25) return;
    if (id === 'garden'){ if (hv < 0.6){ ctx.fillStyle = '#8B5A2B'; ctx.fillRect(x-10, -120, 20, 120); ell(ctx, x, -150, 70, 60, '#4CAF50'); ell(ctx, x-30, -125, 45, 40, '#5CBF60'); ell(ctx, x+30, -170, 40, 36, '#6FD173');
        for (let k2=0;k2<4;k2++) ell(ctx, x-40+hash(i+k2)*80, -180+hash(i*2+k2)*70, 7, 7, '#FF6B6B'); } else { ell(ctx, x, -10, 70, 40, '#5DBB63'); ell(ctx, x-30, -30, 8, 8, '#FFD23F'); ell(ctx, x+20, -36, 8, 8, '#FF8FB1'); ell(ctx, x+40, -20, 8, 8, '#fff'); } }
    else if (id === 'beach'){ ctx.strokeStyle = '#8B5A2B'; ctx.lineWidth = 16; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.quadraticCurveTo(x+30, -100, x+10, -200); ctx.stroke();
        for (let k2=0;k2<5;k2++){ const a = -Math.PI*0.9 + k2*Math.PI*0.45; ctx.fillStyle = '#3FAE5A'; ctx.save(); ctx.translate(x+10, -200); ctx.rotate(a); ell(ctx, 55, 0, 60, 16, '#3FAE5A'); ctx.restore(); }
        ell(ctx, x+2, -192, 10, 10, '#7A4A1A'); ell(ctx, x+18, -190, 10, 10, '#7A4A1A'); }
    else if (id === 'home'){ if (hv < 0.75){ const w = 150 + hash(i+1)*60, h = 100 + hash(i+2)*30; ctx.fillStyle = '#FBF7EE'; ctx.fillRect(x-w/2, -h, w, h);
        ctx.fillStyle = '#4A4F5A'; ctx.beginPath(); ctx.moveTo(x-w/2-24, -h+4); ctx.quadraticCurveTo(x-w/2-10, -h-6, x-w/2+5, -h-40); ctx.lineTo(x+w/2-5, -h-40); ctx.quadraticCurveTo(x+w/2+10, -h-6, x+w/2+24, -h+4); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#6B4A2B'; ctx.fillRect(x-14, -56, 28, 56); ctx.fillStyle = '#7FA7C9'; ctx.fillRect(x-w/2+16, -h+30, 26, 22); ctx.fillRect(x+w/2-42, -h+30, 26, 22);
        if (hash(i+9) < 0.5){ ctx.fillStyle = '#E53935'; ell(ctx, x+w/2-10, -h+8, 10, 13, '#E53935'); } }
      else { ctx.fillStyle = '#6B4A2B'; ctx.fillRect(x-8, -110, 16, 110); ell(ctx, x, -130, 55, 45, '#6FA33D'); ell(ctx, x+25, -145, 35, 30, '#86BD4F'); } }
    else if (id === 'snow'){ const h = 140 + hv*60; ctx.fillStyle = '#6B4A2B'; ctx.fillRect(x-8, -30, 16, 30);
        for (let k2=0;k2<3;k2++){ const yy = -30 - k2*h/3.2, ww = 70 - k2*18; ctx.fillStyle = '#2E7D5B'; ctx.beginPath(); ctx.moveTo(x-ww, yy); ctx.lineTo(x, yy - h/2.2); ctx.lineTo(x+ww, yy); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.moveTo(x-ww*0.45, yy-h/2.2*0.55); ctx.lineTo(x, yy-h/2.2); ctx.lineTo(x+ww*0.45, yy-h/2.2*0.55); ctx.fill(); } }
    else { ctx.fillStyle = G2; ctx.fillRect(x-60, -110, 120, 110); ctx.beginPath(); ctx.moveTo(x-75, -110); ctx.lineTo(x, -170); ctx.lineTo(x+75, -110); ctx.fill();
        ctx.globalAlpha = 0.7 + 0.3*Math.sin(t*3+i); ctx.fillStyle = '#FFD54F'; ctx.fillRect(x-40, -85, 24, 24); ctx.fillRect(x+16, -85, 24, 24); ctx.globalAlpha = 1;
        ell(ctx, x+90, -60, 12, 16, '#FF7043'); ctx.globalAlpha = 0.3; ell(ctx, x+90, -60, 26, 30, '#FFAB40'); ctx.globalAlpha = 1; }
  });
  // 地面
  layer(1);
  const lc = G.camX;
  ctx.fillStyle = P.ground; ctx.fillRect(lc - 10, 0, viewW + 20, GROUND_MARGIN + 40);
  ctx.fillStyle = P.top; ctx.fillRect(lc - 10, -4, viewW + 20, 26);
  ctx.fillStyle = P.top2; each(1, 60, x => { ctx.beginPath(); ctx.arc(x, 22, 16, 0, Math.PI); ctx.fill(); });
  ctx.fillStyle = 'rgba(0,0,0,.07)'; each(1, 120, (x, i) => { ell(ctx, x + hash(i)*60, 60 + hash(i+3)*30, 14, 7); ctx.fill(); });
  each(1, 170, (x, i) => { const hv = hash(i*1.3); if (hv < 0.4) return;
    if (id === 'garden' || id === 'home'){ ctx.strokeStyle = '#3E8E3A'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(x, -2); ctx.lineTo(x, -22); ctx.stroke(); const fc = ['#FF6B9A','#FFD23F','#fff','#C77DFF'][i & 3];
      for (let k2=0;k2<5;k2++){ const a = k2/5*Math.PI*2; ell(ctx, x+Math.cos(a)*6, -26+Math.sin(a)*6, 5, 5, fc); } ell(ctx, x, -26, 4, 4, '#FFB300'); }
    else if (id === 'beach'){ ctx.fillStyle = '#FF8A80'; ctx.beginPath(); ctx.arc(x, 6, 10, Math.PI, 0); ctx.fill(); }
    else if (id === 'snow'){ ell(ctx, x, -6, 18, 10, '#fff'); }
    else { ctx.globalAlpha = 0.5 + 0.5*Math.sin(t*4+i); ell(ctx, x, -30 - hash(i+1)*40, 4, 4, '#E6FF7A'); ctx.globalAlpha = 1; } });
}

/* ---------------- 游戏状态 ---------------- */
const G = {state:'menu', demo:true, L:null, p:null, camX:0, t:0, score:0, combo:0, comboT:0, maxCombo:0, hits:0,
  flyers:[], parts:[], texts:[], loose:[], toasts:[], magnetT:0, rainT:0, rainAcc:0, finished:false, finishT:0, bump:0, tut:0,
  seed:0, kind:'today', dayLabel:''};
function newPlayer(){ return {x:0, y:0, vy:0, on:true, jumps:0, hold:false, holdT:0, coy:0, buf:0, inv:0, run:0}; }
function startLevel(seed, kind){
  G.L = genLevel(seed); G.seed = seed; G.kind = kind; G.p = newPlayer(); G.camX = 0; G.score = 0; G.combo = 0; G.comboT = 0; G.maxCombo = 0; G.hits = 0;
  G.flyers = []; G.parts = []; G.texts = []; G.loose = []; G.toasts = []; G.magnetT = 0; G.rainT = 0; G.finished = false; G.finishT = 0; G.demo = kind === 'demo';
  G.tut = G.demo ? 0 : (S.tut ? 3 : 6);
  if (!G.demo){ S.plays++; S.tut = true; save(); G.state = 'play'; showScreen(null); $('#pauseBtn').style.display = 'block'; }
}
function speed(){ return (S.set.speed === 'slow' ? 235 : 300); }
function tryJump(){
  const p = G.p;
  if (p.on || p.coy > 0){ p.vy = -790; p.jumps = 1; p.on = false; p.coy = 0; p.holdT = 0; if (!G.demo) Snd.jump(false); puff(p.x, p.y, 5); return true; }
  if (p.jumps < 2){ p.vy = -720; p.jumps = 2; p.holdT = 0; if (!G.demo) Snd.jump(true); puff(p.x, p.y-20, 8); return true; }
  return false;
}
function press(){ if (G.state !== 'play') return; G.p.hold = true; if (!tryJump()) G.p.buf = 0.14; }
function release(){ if (G.p) G.p.hold = false; }
function puff(x, y, n){ for (let i=0;i<n;i++) G.parts.push({x, y, vx:(Math.random()-0.5)*160, vy:-Math.random()*80, life:0.4, max:0.4, c:'rgba(255,255,255,.9)', r:8+Math.random()*6, kind:'puff'}); }
function sparkle(x, y, n, big){ for (let i=0;i<n;i++){ const a = Math.random()*Math.PI*2, v = 120 + Math.random()*(big?360:200);
  G.parts.push({x, y, vx:Math.cos(a)*v, vy:Math.sin(a)*v, life:0.5+Math.random()*0.3, max:0.8, c:['#FFF59D','#FFD54F','#FFFFFF','#FFB300'][i%4], r:big?9:6, kind:'star'}); } }
function w2s(x, y){ return [(x - G.camX)*scale, (y - camTop)*scale]; }
function hudCoinPos(){ return [safe.l + 34*ui, safe.t + 36*ui]; }
function toast(text, color, dur){ G.toasts.push({text, color:color||'#FF8A00', t:0, dur:dur||1.6}); }
function collect(x, y, base, big){
  G.combo++; G.comboT = 1.15; if (G.combo > G.maxCombo) G.maxCombo = G.combo;
  const bonus = Math.min(4, Math.floor(G.combo/10)), amt = base + bonus; G.score += amt;
  if (G.demo) return;
  if (big) Snd.big(); else Snd.coin(G.combo);
  sparkle(x, y, big ? 18 : 6, big);
  const [sx, sy] = w2s(x, y); G.flyers.push({sx, sy, t:0, big});
  if (big || bonus > 0) G.texts.push({x, y:y-30, text:'+' + amt, t:0, big});
  if (G.combo > 0 && G.combo % 10 === 0){ const words = ['真棒！','好厉害！','太棒啦！','金币大师！','停不下来！']; toast(words[Math.min(words.length-1, G.combo/10-1)] + '  连击 ' + G.combo, '#FF5C93', 1.3); Snd.combo(); }
}
function hit(o){
  const p = G.p; p.inv = 1.6; p.vy = Math.min(p.vy, -420); p.on = false; p.jumps = 1; G.hits++; G.combo = 0;
  const loss = Math.min(5, G.score); G.score -= loss;
  if (G.demo) return;
  Snd.hit(); G.texts.push({x:p.x, y:p.y-90, text: loss ? '-' + loss : '哎呀', t:0, red:true});
  for (let i=0;i<loss;i++) G.loose.push({x:p.x, y:p.y-40, vx:60 + Math.random()*220, vy:-300 - Math.random()*300, t:0, life:5, rain:false});
}
function update(dt){
  const L = G.L, p = G.p; G.t += dt;
  if (G.tut > 0) G.tut -= dt;
  let spd = speed(); if (G.finished){ G.finishT += dt; spd *= Math.max(0, 1 - G.finishT*0.9); }
  p.x += spd*dt; p.run += spd*dt;
  // 演示自动跳
  if (G.demo){ for (const o of L.obs) if (o.x - p.x > 40 && o.x - p.x < 130 && p.on){ tryJump(); p.hold = true; setTimeout(()=>{ if (G.p===p) p.hold=false; }, 180); }
    if (p.on && Math.random() < 0.006) tryJump(); }
  let g = 2300; if (p.hold && p.vy < 0 && p.holdT < 0.28){ g *= 0.42; p.holdT += dt; }
  const prevY = p.y; p.vy = Math.min(1500, p.vy + g*dt); p.y += p.vy*dt; p.on = false;
  if (p.y >= 0){ p.y = 0; p.vy = 0; p.on = true; }
  else if (p.vy >= 0){ for (const pl of L.plats){ if (p.x + 20 > pl.x && p.x - 20 < pl.x + pl.w && prevY <= pl.y + 1 && p.y >= pl.y){ p.y = pl.y; p.vy = 0; p.on = true; break; } } }
  if (p.on){ if (p.jumps) puff(p.x, p.y, 3); p.jumps = 0; p.coy = 0.1; } else p.coy -= dt;
  if (p.buf > 0){ p.buf -= dt; if (tryJump()) p.buf = 0; }
  if (p.inv > 0) p.inv -= dt;
  G.camX = p.x - viewW*(viewW < 500 ? 0.2 : 0.28);
  // 金币
  const px = p.x, py = p.y - 30, mag = G.magnetT > 0;
  for (const c of L.coins){
    if (c.taken) continue; const dx = c.x - px; if (dx < -200) continue; if (dx > 700) break;
    if (mag && Math.abs(dx) < 330 && Math.abs(c.y - py) < 420){ const k = Math.min(1, dt*7); c.x += (px - c.x)*k; c.y += (py - c.y)*k; }
    const dy = c.y - py, rr2 = c.r + 30;
    if (dx*dx + dy*dy < rr2*rr2){ c.taken = true; collect(c.x, c.y, c.big ? 10 : 1, c.big); }
  }
  if (G.magnetT > 0) G.magnetT -= dt;
  for (const it of L.items){ if (it.taken) continue; const dx = it.x - px, dy = it.y - py; if (dx*dx + dy*dy < 70*70){ it.taken = true; G.magnetT = 9; if (!G.demo){ Snd.power(); toast('吸金磁铁！金币自己飞过来', '#E53935', 2); sparkle(it.x, it.y, 20, true); } } }
  // 障碍
  if (p.inv <= 0) for (const o of L.obs){ if (p.x + 18 > o.x + 8 && p.x - 18 < o.x + o.w - 8 && p.y > -o.h + 12){ hit(o); break; } }
  // 金币雨
  for (const r of L.rains) if (!r.done && p.x > r.x){ r.done = true; G.rainT = 7; if (!G.demo){ Snd.rain(); toast('金币雨来啦！', '#FF8A00', 2.2); } }
  if (G.rainT > 0){ G.rainT -= dt; G.rainAcc += dt*11; while (G.rainAcc > 1){ G.rainAcc--; G.loose.push({x:G.camX + viewW*(0.3 + Math.random()*0.85), y:camTop - 40, vx:(Math.random()-0.5)*40, vy:120 + Math.random()*120, t:1, life:9, rain:true}); } }
  for (const c of G.loose){
    c.t += dt; c.vy += (c.rain ? 300 : 1400)*dt; if (c.rain) c.vy = Math.min(c.vy, 320);
    c.x += c.vx*dt; c.y += c.vy*dt; if (c.y > -18){ c.y = -18; if (c.rain){ c.vy = 0; c.vx = 0; } else { c.vy *= -0.55; c.vx *= 0.8; } }
    if (mag && c.t > 0.5){ const k = Math.min(1, dt*7); c.x += (px - c.x)*k; c.y += (py - c.y)*k; }
    const dx = c.x - px, dy = c.y - py; if (c.t > 0.5 && dx*dx + dy*dy < 46*46){ c.dead = true; collect(c.x, c.y, 1, false); }
    if (c.t > c.life || c.x < G.camX - 200) c.dead = true;
  }
  G.loose = G.loose.filter(c => !c.dead);
  if (G.comboT > 0){ G.comboT -= dt; if (G.comboT <= 0) G.combo = 0; }
  // 粒子
  for (const q of G.parts){ q.life -= dt; q.x += q.vx*dt; q.y += q.vy*dt; q.vy += (q.kind === 'confetti' ? 300 : 200)*dt; q.vx *= 0.98; }
  G.parts = G.parts.filter(q => q.life > 0);
  for (const tx of G.texts) tx.t += dt; G.texts = G.texts.filter(tx => tx.t < 1);
  for (const f of G.flyers){ f.t += dt/0.5; if (f.t >= 1 && !f.done){ f.done = true; G.bump = 1; } } G.flyers = G.flyers.filter(f => !f.done);
  for (const ts of G.toasts) ts.t += dt; G.toasts = G.toasts.filter(ts => ts.t < ts.dur);
  if (G.bump > 0) G.bump = Math.max(0, G.bump - dt*5);
  // 终点
  if (!G.finished && p.x >= L.len){ G.finished = true; G.finishT = 0;
    if (!G.demo){ Snd.fanfare(); for (let i=0;i<60;i++) G.parts.push({x:L.len + 150 + (Math.random()-0.5)*300, y:-380, vx:(Math.random()-0.5)*500, vy:-Math.random()*500, life:2, max:2, c:['#EF5350','#42A5F5','#66BB6A','#FFCA28','#AB47BC'][i%5], r:8, kind:'confetti'}); } }
  if (G.finished && G.finishT > 1.8){ if (G.demo) startLevel(G.seed + 1, 'demo'); else finishLevel(); }
}

/* ---------------- 绘制 ---------------- */
function render(){
  const L = G.L, p = G.p, t = G.t;
  drawScene(S.equip.scene, t);
  layer(1);
  const P = SC[S.equip.scene] || SC.garden;
  const x0 = G.camX - 100, x1 = G.camX + viewW + 100;
  for (const r of L.rains){ if (r.x - 300 > x1 || r.x + 300 < x0 || r.done) continue; const y = camTop + 120; ctx.globalAlpha = 0.95;
    ['#FF8A80','#FFD180','#FFFF8D','#B9F6CA','#80D8FF'].forEach((cc,i) => { ctx.strokeStyle = cc; ctx.lineWidth = 10; ctx.beginPath(); ctx.arc(r.x, y+90, 150 - i*10, Math.PI, 0); ctx.stroke(); });
    ell(ctx, r.x-120, y+90, 50, 28, '#fff'); ell(ctx, r.x+120, y+90, 50, 28, '#fff'); ctx.globalAlpha = 1; }
  for (const pl of L.plats){ if (pl.x > x1 || pl.x + pl.w < x0) continue; ctx.fillStyle = P.plat; rr(ctx, pl.x, pl.y, pl.w, 28, 12); ctx.fill(); ctx.fillStyle = P.platTop; rr(ctx, pl.x, pl.y-2, pl.w, 12, 6); ctx.fill(); }
  if (L.len > x0 - 400 && L.len < x1 + 100) drawGate(ctx, L.len, t);
  for (const c of L.coins){ if (c.taken || c.x < x0) continue; if (c.x > x1) break; drawCoin(ctx, c.x, c.y + Math.sin(t*2 + c.ph)*3, c.r, t, c.ph, c.big); }
  for (const it of L.items) if (!it.taken && it.x > x0 && it.x < x1) drawMagnet(ctx, it.x, it.y, t);
  for (const o of L.obs) if (o.x > x0 && o.x < x1) drawHedgehog(ctx, o, t);
  for (const c of G.loose){ if (c.t < 0.5 && !c.rain && Math.floor(c.t*20)%2) continue; if (c.life - c.t < 1.2 && Math.floor(c.t*10)%2) continue; drawCoin(ctx, c.x, c.y, 17, t, c.x, false); }
  if (G.magnetT > 0){ ctx.globalAlpha = 0.18 + 0.08*Math.sin(t*10); ell(ctx, p.x, p.y-30, 90, 90, '#FFEB3B'); ctx.globalAlpha = 1; }
  ell(ctx, p.x, -2, 26 * (1 + p.y/600), 6, 'rgba(0,0,0,.15)');
  if (!(p.inv > 0 && Math.floor(p.inv*12)%2)) drawHero(ctx, p.x, p.y, 62, S.equip.color, S.equip.hat, p.run, p.vy, !p.on);
  for (const q of G.parts){ ctx.globalAlpha = Math.max(0, q.life/q.max);
    if (q.kind === 'star'){ ctx.fillStyle = q.c; starPath(ctx, q.x, q.y, q.r, q.r*0.45, 4); ctx.fill(); }
    else if (q.kind === 'confetti'){ ctx.fillStyle = q.c; ctx.fillRect(q.x, q.y, q.r, q.r*1.6); }
    else ell(ctx, q.x, q.y, q.r, q.r, q.c); }
  ctx.globalAlpha = 1;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const tx of G.texts){ ctx.globalAlpha = 1 - tx.t; ctx.font = 'bold ' + (tx.big ? 46 : 34) + 'px "PingFang SC",sans-serif'; ctx.lineWidth = 7; ctx.strokeStyle = '#fff';
    ctx.strokeText(tx.text, tx.x, tx.y - tx.t*60); ctx.fillStyle = tx.red ? '#E53935' : '#FF8A00'; ctx.fillText(tx.text, tx.x, tx.y - tx.t*60); }
  ctx.globalAlpha = 1;
  if (!G.demo) drawHUD();
}
function outlined(text, x, y, size, fill, align){
  ctx.font = '900 ' + size + 'px "PingFang SC","Hiragino Sans GB",sans-serif'; ctx.textAlign = align || 'left'; ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round'; ctx.lineWidth = size*0.22; ctx.strokeStyle = '#fff'; ctx.strokeText(text, x, y); ctx.fillStyle = fill; ctx.fillText(text, x, y);
}
function drawHUD(){
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const [cx, cy] = hudCoinPos(), b = 1 + G.bump*0.35;
  ctx.fillStyle = 'rgba(255,255,255,.75)'; rr(ctx, cx - 26*ui, cy - 26*ui, 170*ui + String(G.score).length*14*ui, 52*ui, 26*ui); ctx.fill();
  ctx.save(); ctx.translate(cx, cy); ctx.scale(b, b); drawCoin(ctx, 0, 0, 20*ui, 0, 0, false); ctx.restore();
  outlined(String(G.score), cx + 30*ui, cy + 2*ui, 38*ui*(1 + G.bump*0.15), '#E67700');
  if (G.combo >= 3){ const s = 1 + Math.max(0, G.comboT - 0.95)*2; outlined('连击 ×' + G.combo, cx - 20*ui, cy + 52*ui, 28*ui*s, G.combo >= 10 ? '#FF3D7F' : '#FF8A00'); }
  // 进度条
  const bw = W < H ? W*0.6 : Math.min(W*0.34, 320*ui), bx = W/2 - bw/2, by = safe.t + (W < H ? 104 : 28)*ui, prog = Math.max(0, Math.min(1, G.p.x / G.L.len));
  ctx.fillStyle = 'rgba(255,255,255,.75)'; rr(ctx, bx - 4, by - 4, bw + 8, 20*ui + 8, 14*ui); ctx.fill();
  ctx.fillStyle = '#FFE08A'; rr(ctx, bx, by, bw, 20*ui, 10*ui); ctx.fill();
  ctx.fillStyle = '#7ED957'; rr(ctx, bx, by, Math.max(20*ui, bw*prog), 20*ui, 10*ui); ctx.fill();
  outlined('🏁', bx + bw + 6, by + 10*ui, 22*ui, '#333');
  drawHero(ctx, bx + bw*prog, by + 22*ui, 26*ui, S.equip.color, 'none', G.p.run, 0, false);
  if (G.magnetT > 0){ outlined('磁铁 ' + Math.ceil(G.magnetT) + ' 秒', W/2, by + 50*ui, 24*ui, '#E53935', 'center'); }
  if (G.rainT > 0){ outlined('金币雨 ' + Math.ceil(G.rainT), W/2, by + (G.magnetT > 0 ? 80 : 50)*ui, 24*ui, '#FF8A00', 'center'); }
  // 飞向计数器
  for (const f of G.flyers){ const e = 1 - Math.pow(1 - f.t, 3), mx = (f.sx + cx)/2, my = Math.min(f.sy, cy) - 80*ui;
    const x = (1-e)*(1-e)*f.sx + 2*(1-e)*e*mx + e*e*cx, y = (1-e)*(1-e)*f.sy + 2*(1-e)*e*my + e*e*cy;
    drawCoin(ctx, x, y, (f.big ? 26 : 16)*ui*(1 - e*0.3), G.t, 0, false); }
  // 提示
  let ty = H*0.36;
  for (const ts of G.toasts){ const a = Math.min(1, ts.t*6, (ts.dur - ts.t)*3), s = 1 + Math.max(0, 0.15 - ts.t)*3;
    ctx.globalAlpha = a; outlined(ts.text, W/2, ty, 40*ui*s, ts.color, 'center'); ty += 56*ui; }
  ctx.globalAlpha = 1;
  if (G.tut > 0){ const a = Math.min(1, G.tut); ctx.globalAlpha = a;
    ctx.fillStyle = 'rgba(255,255,255,.88)'; const tw = Math.min(W - 40, 560*ui); const ty0 = safe.t + (W < H ? 150 : 76)*ui; rr(ctx, W/2 - tw/2, ty0, tw, 110*ui, 24*ui); ctx.fill();
    outlined('👆 点一下屏幕就跳', W/2, ty0 + 34*ui, 30*ui, '#E67700', 'center');
    outlined('按住跳更高，空中再点一下还能再跳', W/2, ty0 + 76*ui, 24*ui, '#8a5a1a', 'center'); ctx.globalAlpha = 1; }
}

/* ---------------- 循环 ---------------- */
let lastT = 0;
function frame(ts){
  const dt = Math.min(1/30, Math.max(0, (ts - lastT)/1000 || 0)); lastT = ts;
  if (G.state === 'play' || G.state === 'menu') update(dt);
  render();
  requestAnimationFrame(frame);
}

/* ---------------- 结算 ---------------- */
function starsFor(score, total){ return score >= total*0.7 ? 3 : score >= total*0.4 ? 2 : 1; }
function finishLevel(){
  G.state = 'result'; $('#pauseBtn').style.display = 'none';
  const n = starsFor(G.score, G.L.total), key = String(G.seed);
  let extra = 0; const notes = [];
  if (G.kind === 'today' && !S.cleared[key]){ extra = 50; notes.push('今日首次过关 +50'); }
  if (G.kind !== 'random'){ S.cleared[key] = 1; if ((S.stars[key]||0) < n) S.stars[key] = n; if ((S.best[key]||0) < G.score) S.best[key] = G.score; }
  const got = G.score + extra; S.wallet += got; S.total += got; if (G.maxCombo > S.maxCombo) S.maxCombo = G.maxCombo; save();
  notes.unshift('最多连击 ' + G.maxCombo + (G.hits ? '　碰到刺猬 ' + G.hits + ' 次' : '　一次都没碰到，真棒！'));
  notes.push('钱包里一共 🪙 ' + S.wallet);
  $('#rTitle').textContent = ['', '过关啦！', '真不错！', '太厉害了！'][n];
  $('#rCoins').textContent = got; $('#rNote').innerHTML = notes.join('<br>');
  const sp = $('#rStars').children; for (const s of sp) s.classList.remove('lit');
  showScreen('result');
  for (let i=0;i<n;i++) setTimeout(() => { sp[i].classList.add('lit'); Snd.star(i); }, 400 + i*450);
}

/* ---------------- 界面 ---------------- */
function showScreen(id){ document.querySelectorAll('.screen').forEach(e => e.classList.toggle('show', e.id === id)); }
let toastTimer = 0;
function domToast(t){ const e = $('#toast'); e.textContent = t; e.style.display = 'block'; clearTimeout(toastTimer); toastTimer = setTimeout(() => e.style.display = 'none', 1800); }
function starStr(n){ n = n || 0; return '<span class="stars">' + '★'.repeat(n) + '<span class="e">' + '★'.repeat(3-n) + '</span></span>'; }
function refreshMenu(){
  $('#mWallet').textContent = S.wallet; $('#mStreak').textContent = S.streak;
  $('#mTodayStars').innerHTML = starStr(S.stars[daySeed(new Date())]).replace('class="stars"', 'class="stars" style="font-size:.8em"');
  $('#tSound').classList.toggle('off', !S.set.sound); $('#tSound').textContent = S.set.sound ? '🔊 音效' : '🔇 音效';
  $('#tMusic').classList.toggle('off', !S.set.music); $('#tMusic').textContent = S.set.music ? '🎵 音乐' : '🎵 关了';
  $('#tSpeed').textContent = S.set.speed === 'slow' ? '🐢 慢速' : '🐇 正常';
}
function goMenu(){
  G.state = 'menu'; $('#pauseBtn').style.display = 'none'; showScreen('menu'); refreshMenu();
  startLevel(Math.floor(Math.random()*1e6), 'demo');
}
const WEEK = ['日','一','二','三','四','五','六'];
function openDays(){
  const list = $('#dayList'); list.innerHTML = ''; const now = new Date();
  for (let i=0;i<7;i++){ const d = addDays(now, -i), sd = daySeed(d);
    const row = document.createElement('div'); row.className = 'day';
    row.innerHTML = '<div class="d">' + (i === 0 ? '今天' : i === 1 ? '昨天' : (d.getMonth()+1) + '月' + d.getDate() + '日 周' + WEEK[d.getDay()]) + '<br>' + starStr(S.stars[sd]) + '</div>';
    const b = document.createElement('button'); b.className = 'btn green'; b.textContent = '▶ 玩'; b.onclick = () => { Snd.click(); startLevel(sd, i === 0 ? 'today' : 'past'); };
    row.appendChild(b); list.appendChild(row); }
  showScreen('days');
}
let shopTab = 'hat';
function openShop(){ showScreen('shop'); renderShop(); }
function renderShop(){
  $('#sWallet').textContent = S.wallet;
  document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === shopTab));
  const arr = shopTab === 'hat' ? HATS : shopTab === 'color' ? COLORS : SCENES, grid = $('#shopGrid'); grid.innerHTML = '';
  for (const it of arr){
    const owned = S.owned[shopTab].includes(it.id), on = S.equip[shopTab] === it.id;
    const card = document.createElement('div'); card.className = 'card' + (on ? ' on' : '');
    const cv = document.createElement('canvas'); cv.width = 240; cv.height = 180; card.appendChild(cv);
    const nm = document.createElement('div'); nm.className = 'nm'; nm.textContent = it.name; card.appendChild(nm);
    const b = document.createElement('button');
    if (on){ b.className = 'btn gray'; b.textContent = '✓ 正在用'; }
    else if (owned){ b.className = 'btn green'; b.textContent = '换上'; b.onclick = () => { S.equip[shopTab] = it.id; save(); Snd.click(); renderShop(); }; }
    else { b.className = 'btn' + (S.wallet >= it.price ? '' : ' gray'); b.textContent = '🪙 ' + it.price;
      b.onclick = () => { if (S.wallet < it.price){ domToast('金币还差 ' + (it.price - S.wallet) + ' 个，再去玩一关吧'); return; }
        S.wallet -= it.price; S.owned[shopTab].push(it.id); S.equip[shopTab] = it.id; save(); Snd.buy(); domToast('买到啦：' + it.name); renderShop(); }; }
    card.appendChild(b); grid.appendChild(card);
    const c = cv.getContext('2d');
    if (shopTab === 'scene'){ const P = SC[it.id]; const g = c.createLinearGradient(0, 0, 0, 180); g.addColorStop(0, P.sky[0]); g.addColorStop(1, P.sky[1]); c.fillStyle = g; c.fillRect(0, 0, 240, 180);
      c.fillStyle = P.ground; c.fillRect(0, 140, 240, 40); c.fillStyle = P.top; c.fillRect(0, 134, 240, 14);
      const deco = {garden:'🌳🌷', beach:'🌴🌊', home:'🏡🌾', snow:'🌲⛄', night:'🌙✨'}[it.id]; c.font = '44px sans-serif'; c.textAlign = 'center'; c.fillText(deco, 120, 70);
      drawHero(c, 120, 140, 50, S.equip.color, S.equip.hat, 0, 0, false); }
    else { c.fillStyle = '#FFF8E1'; c.fillRect(0, 0, 240, 180);
      drawHero(c, 120, 165, 110, shopTab === 'color' ? it.id : S.equip.color, shopTab === 'hat' ? it.id : S.equip.hat, 0, 0, false); }
  }
}
function popup(title, html){ $('#pTitle').textContent = title; $('#pBody').innerHTML = html; showScreen('popup'); }
function dailyLogin(){
  const now = new Date(), today = dayKey(now), yest = dayKey(addDays(now, -1));
  if (S.lastLogin === today) return false;
  S.streak = S.lastLogin === yest ? S.streak + 1 : 1; S.lastLogin = today;
  const day = ((S.streak - 1) % 7) + 1, reward = [20, 30, 40, 50, 60, 80, 150][day - 1];
  S.wallet += reward; save();
  let strip = '<div class="streak">'; for (let i=1;i<=7;i++) strip += '<div class="' + (i <= day ? 'got' : '') + '">' + (i === 7 ? '🎁' : '🪙') + '<span>' + i + '天</span></div>'; strip += '</div>';
  popup(S.streak === 1 && !S.plays ? '欢迎来玩！' : '签到奖励', '<div class="big-num">🪙 +' + reward + '</div><div class="note">已经连续来玩 ' + S.streak + ' 天' + (day < 7 ? '，连续 7 天有大礼包' : '，大礼包到手！') + '</div>' + strip);
  return true;
}
function pauseGame(){ if (G.state !== 'play') return; G.state = 'pause'; release(); $('#pauseBtn').style.display = 'none'; showScreen('pause'); }
function resumeGame(){ G.state = 'play'; showScreen(null); $('#pauseBtn').style.display = 'block'; lastT = performance.now(); }

$('#bToday').onclick = () => { Snd.click(); startLevel(daySeed(new Date()), 'today'); };
$('#bRandom').onclick = () => { Snd.click(); startLevel(Math.floor(Math.random()*1e9), 'random'); };
$('#bShop').onclick = () => { Snd.click(); openShop(); };
$('#bDays').onclick = () => { Snd.click(); openDays(); };
$('#tSound').onclick = () => { S.set.sound = !S.set.sound; save(); refreshMenu(); Snd.click(); };
$('#tMusic').onclick = () => { S.set.music = !S.set.music; save(); refreshMenu(); Snd.click(); };
$('#tSpeed').onclick = () => { S.set.speed = S.set.speed === 'slow' ? 'normal' : 'slow'; save(); refreshMenu(); Snd.click(); };
document.querySelectorAll('[data-back]').forEach(b => b.onclick = () => { Snd.click(); showScreen('menu'); refreshMenu(); });
document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { shopTab = b.dataset.tab; Snd.click(); renderShop(); });
$('#pauseBtn').onclick = pauseGame;
$('#bResume').onclick = () => { Snd.click(); resumeGame(); };
$('#bRestart').onclick = () => { Snd.click(); startLevel(G.seed, G.kind); };
$('#bHome').onclick = () => { Snd.click(); goMenu(); };
$('#bAgain').onclick = () => { Snd.click(); startLevel(G.kind === 'random' ? Math.floor(Math.random()*1e9) : G.seed, G.kind); };
$('#bRHome').onclick = () => { Snd.click(); goMenu(); };
$('#pOk').onclick = () => { Snd.click(); showScreen('menu'); refreshMenu(); };

/* ---------------- 输入 ---------------- */
canvas.addEventListener('pointerdown', e => { e.preventDefault(); press(); });
window.addEventListener('pointerup', release); window.addEventListener('pointercancel', release);
window.addEventListener('keydown', e => { if ((e.code === 'Space' || e.code === 'ArrowUp') && !e.repeat){ e.preventDefault(); press(); } if (e.code === 'Escape') pauseGame(); });
window.addEventListener('keyup', e => { if (e.code === 'Space' || e.code === 'ArrowUp') release(); });
document.addEventListener('touchmove', e => { if (!e.target.closest('.scroll')) e.preventDefault(); }, {passive:false});
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('visibilitychange', () => { if (document.hidden) pauseGame(); else if (Snd.ctx && Snd.ctx.state !== 'running') Snd.ctx.resume(); });

/* ---------------- 尺寸 ---------------- */
function resize(){
  W = window.innerWidth; H = window.innerHeight; DPR = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(W*DPR); canvas.height = Math.round(H*DPR);
  const port = H > W*1.15; scale = port ? Math.min(H/700, W/440) : Math.min(H/540, W/620); viewW = W/scale; viewH = H/scale;
  GROUND_MARGIN = port ? Math.max(110, viewH*0.3) : 110; camTop = -(viewH - GROUND_MARGIN);
  ui = Math.max(0.85, Math.min(1.6, Math.min(W, H)/430));
  const cs = getComputedStyle($('#safeProbe')); safe.t = parseFloat(cs.paddingTop)||0; safe.r = parseFloat(cs.paddingRight)||0; safe.b = parseFloat(cs.paddingBottom)||0; safe.l = parseFloat(cs.paddingLeft)||0;
  document.body.classList.toggle('landscape', W > H);
}
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));

/* ---------------- 启动 ---------------- */
resize();
goMenu();
if (!dailyLogin()) refreshMenu();
requestAnimationFrame(frame);
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__game = {G, S, startLevel, press, release};
})();
