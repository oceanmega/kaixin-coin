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

/* ---------------- 声音（Kenney CC0 音效 + WebAudio 合成背景音乐） ---------------- */
const MEL = [72,0,76,79, 81,0,79,76, 74,0,76,79, 76,0,0,0, 72,0,74,76, 79,0,81,79, 76,0,74,72, 74,0,0,0,
             79,0,81,84, 81,0,79,76, 77,0,76,74, 72,0,74,0, 76,0,79,76, 74,0,72,74, 72,0,0,0, 0,0,0,0];
const BASS = [48,53,55,48, 45,50,55,48, 53,48,50,55, 48,55,48,48];
const midi = n => 440 * Math.pow(2, (n - 69) / 12);
const SFX_NAMES = ['coin','coin2','big','jump','jump2','land','hit','hit2','combo','power','rain','star','finish','click','buy','pop'];
const Snd = {
  ctx:null, master:null, sfx:null, mus:null, timer:null, next:0, step:0, lastCoin:0, buf:{}, loading:false,
  init(){
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    try{ if (navigator.audioSession) navigator.audioSession.type = 'playback'; }catch(e){}
    try{ this.ctx = new AC(); }catch(e){ return; }
    const c = this.ctx;
    this.master = c.createGain(); this.master.gain.value = 0.8;
    // 轻微压缩，连击时叠在一起也不刺耳
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4;
    this.master.connect(comp); comp.connect(c.destination);
    this.sfx = c.createGain(); this.sfx.gain.value = 0.9; this.sfx.connect(this.master);
    this.mus = c.createGain(); this.mus.gain.value = 0.11; this.mus.connect(this.master);
    this.load();
  },
  load(){
    if (this.loading) return; this.loading = true;
    SFX_NAMES.forEach(n => fetch('assets/sfx/' + n + '.mp3').then(r => r.arrayBuffer())
      .then(ab => new Promise((ok, bad) => this.ctx.decodeAudioData(ab, ok, bad))).then(b => { this.buf[n] = b; }).catch(() => {}));
  },
  unlock(){
    this.init(); if (!this.ctx) return;
    try{
      if (this.ctx.state !== 'running') this.ctx.resume();
      const b = this.ctx.createBuffer(1, 1, 22050), s = this.ctx.createBufferSource();
      s.buffer = b; s.connect(this.ctx.destination); s.start(0);
      this.startMusic();
    }catch(e){}
  },
  ok(){ return this.ctx && this.ctx.state === 'running' && S.set.sound; },
  play(n, rate, vol, when){
    const b = this.buf[n]; if (!b || !this.ok()) return;
    const c = this.ctx, s = c.createBufferSource(), g = c.createGain();
    s.buffer = b; s.playbackRate.value = rate || 1; g.gain.value = vol == null ? 1 : vol;
    s.connect(g); g.connect(this.sfx); s.start(when || 0);
  },
  tone(f, t0, dur, type, vol, dest, slide){
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(dest || this.sfx); o.start(t0); o.stop(t0 + dur + 0.03);
  },
  // 捡金币：自己合成的「叮-叮～」—— 25% 脉冲波，两个快速上行音 B5→E6，第二音拖长衰减
  coinStep:0, pulse:null,
  coinWave(){
    if (this.pulse) return this.pulse;
    const N = 32, re = new Float32Array(N), im = new Float32Array(N), duty = 0.25;
    for (let n = 1; n < N; n++) im[n] = (2 / (n * Math.PI)) * Math.sin(n * Math.PI * duty);
    try{ this.pulse = this.ctx.createPeriodicWave(re, im); }catch(e){ this.pulse = 'square'; }
    return this.pulse;
  },
  coinSynth(t, k, vol){
    const c = this.ctx, o = c.createOscillator(), g = c.createGain(), lp = c.createBiquadFilter();
    const w = this.coinWave(); if (w === 'square') o.type = 'square'; else o.setPeriodicWave(w);
    const n1 = 987.77 * k, n2 = 1318.51 * k, d1 = 0.068, end = d1 + 0.32;
    o.frequency.setValueAtTime(n1, t); o.frequency.setValueAtTime(n2, t + d1);
    lp.type = 'lowpass'; lp.frequency.value = 9000; lp.Q.value = 0.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.setValueAtTime(vol, t + d1);
    g.gain.setValueAtTime(vol * 1.05, t + d1 + 0.002);
    g.gain.exponentialRampToValueAtTime(vol * 0.45, t + d1 + 0.09);
    g.gain.exponentialRampToValueAtTime(0.0001, t + end);
    o.connect(lp); lp.connect(g); g.connect(this.sfx); o.start(t); o.stop(t + end + 0.02);
  },
  coin(combo){
    if (!this.ok()) return; const t = this.ctx.currentTime, gap = t - this.lastCoin;
    if (gap < 0.045) return;
    // 0.5 秒内连着捡：每枚升半音，最多升 5 个半音；停一下就回到原调
    this.coinStep = gap < 0.5 ? Math.min(5, this.coinStep + 1) : 0;
    this.lastCoin = t;
    const k = Math.pow(2, this.coinStep / 12);
    // 连得很密（金币雨）时稍微压低音量，免得吵
    this.coinSynth(t, k, gap < 0.15 ? 0.15 : 0.2);
  },
  big(){ this.play('big', 1, 0.8); this.play('coin', 1.5, 0.4); },
  jump(two){ this.play(two ? 'jump2' : 'jump', two ? 1.15 : 1, 0.35); },
  land(){ this.play('land', 1.3, 0.35); },
  hit(){ this.play('hit', 0.9, 0.7); this.play('hit2', 1.2, 0.5); },
  combo(){ this.play('combo', 1, 0.5); },
  rain(){ this.play('rain', 1, 0.55); },
  power(){ this.play('power', 1, 0.55); },
  star(i){ this.play('star', [1, 1.26, 1.5][i] || 1.5, 0.8); },
  fanfare(){ this.play('finish', 1, 0.9); },
  click(){ this.play('click', 1, 0.7); },
  buy(){ this.play('buy', 1, 0.8); this.play('coin', 1.2, 0.4); },
  pop(){ this.play('pop', 1, 0.6); },
  startMusic(){ if (!this.ctx || this.timer) return; this.next = this.ctx.currentTime + 0.2; this.step = 0; this.timer = setInterval(() => this.sched(), 100); },
  sched(){
    const c = this.ctx; if (!c) return;
    if (!S.set.music || c.state !== 'running' || document.hidden || G.state === 'pause'){ this.next = c.currentTime + 0.15; return; }
    while (this.next < c.currentTime + 0.35){
      const i = this.step % MEL.length, n = MEL[i];
      if (n){ this.tone(midi(n), this.next, 0.34, 'triangle', 0.45, this.mus); this.tone(midi(n+12), this.next, 0.18, 'sine', 0.12, this.mus); }
      if (i % 4 === 0){ const b = BASS[(i/4|0) % BASS.length]; this.tone(midi(b), this.next, 0.9, 'sine', 0.7, this.mus); }
      if (i % 2 === 1) this.tone(midi(84 + (i%8===3 ? 7 : 0)), this.next, 0.05, 'sine', 0.05, this.mus);
      this.next += 0.24; this.step++;
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
    else if (t === 2 || t === 7){ L.obs.push({x:x+240, w:54, h:50, kind:ri(0,3)}); arcOver(x+267, 170, 7, 330); x += 560; if (p > 0.45 && R() < 0.5){ L.obs.push({x:x+40, w:54, h:50, kind:ri(0,3)}); arcOver(x+67, 170, 7, 330); x += 360; } }
    else if (t === 3){ const w = ri(5, 9)*50, h = -ri(130, 190); L.plats.push({x, y:h, w}); for (let i=0;i<w/50;i++) coin(x+25+i*50, h-42);
      if (p > 0.25 && R() < 0.5) L.obs.push({x:x+w/2-27, w:54, h:50, kind:ri(0,3)}); else for (let i=0;i<w/55-1;i++) coin(x+40+i*55, -40);
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

/* ---------------- 素材：Kenney 图集 + 豆豆序列帧 + 场景背景 ---------------- */
const A = {img:null, fr:{}, hero:{}, bg:{}, heroCache:{}, ready:false};
function loadImg(src){ return new Promise((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; }); }
const BG_FILES = ['jiangnan_far.jpg','jiangnan_mid.png','beach_far.jpg','snow_far.jpg','night_far.jpg','k_fade_hills.png','k_color_trees.png','k_color_hills.png','k_fade_trees.png'];
function loadAssets(){
  return Promise.all([
    fetch('assets/atlas.json').then(r => r.json()).then(j => { A.fr = j.frames; A.hero = j.hero; }),
    loadImg('assets/atlas.png').then(i => { A.img = i; }),
    ...BG_FILES.map(f => loadImg('assets/bg/' + f).then(i => { A.bg[f.split('.')[0]] = i; }))
  ]).then(() => { A.ready = true; });
}
function spr(c, n, x, y, w, h){ const f = A.fr[n]; if (!f || !A.img) return; c.drawImage(A.img, f[0], f[1], f[2], f[3], x, y, w, h); }
function sprC(c, n, cx, cy, w, h){ spr(c, n, cx - w/2, cy - h/2, w, h); }

// 豆豆换色：只换身体的黄色像素（喙和脚的橙色、肚皮奶白基本不动）
function rgb2hsv(r, g, b){ const mx = Math.max(r,g,b), mn = Math.min(r,g,b), d = mx - mn; let h = 0;
  if (d){ if (mx === r) h = ((g-b)/d) % 6; else if (mx === g) h = (b-r)/d + 2; else h = (r-g)/d + 4; h *= 60; if (h < 0) h += 360; }
  return [h, mx ? d/mx : 0, mx/255]; }
function hsv2rgb(h, s, v){ const c = v*s, x = c*(1 - Math.abs((h/60) % 2 - 1)), m = v - c; let r, g, b;
  if (h < 60) [r,g,b] = [c,x,0]; else if (h < 120) [r,g,b] = [x,c,0]; else if (h < 180) [r,g,b] = [0,c,x]; else if (h < 240) [r,g,b] = [0,x,c]; else if (h < 300) [r,g,b] = [x,0,c]; else [r,g,b] = [c,0,x];
  return [(r+m)*255, (g+m)*255, (b+m)*255]; }
const COLOR_SHIFT = {sun:null, pink:{h:340, s:0.55}, sky:{h:205, s:0.55}, mint:{h:145, s:0.5}, grape:{h:265, s:0.45}, snow:{h:210, s:0.06}};
function heroFrame(colId, name){
  const key = colId + ':' + name; if (A.heroCache[key]) return A.heroCache[key];
  const f = A.fr['hero_' + name]; const cv = document.createElement('canvas'); cv.width = f[2]; cv.height = f[3];
  const c = cv.getContext('2d'); c.drawImage(A.img, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
  const sh = COLOR_SHIFT[colId];
  if (sh){ try{
    const d = c.getImageData(0, 0, f[2], f[3]), p = d.data;
    for (let i = 0; i < p.length; i += 4){ if (p[i+3] < 10) continue;
      const [h, s, v] = rgb2hsv(p[i], p[i+1], p[i+2]);
      if (h >= 36 && h <= 62 && s > 0.3 && v > 0.45){ const [r, g, b] = hsv2rgb(sh.h, Math.min(1, s*sh.s/0.7), Math.min(1, v*(colId === 'snow' ? 1.08 : 1))); p[i] = r; p[i+1] = g; p[i+2] = b; }
      else if (h >= 30 && h <= 62 && s > 0.12 && s <= 0.3 && v > 0.8 && colId !== 'snow'){ const [r, g, b] = hsv2rgb(sh.h, s*0.8, v); p[i] = r; p[i+1] = g; p[i+2] = b; } }
    c.putImageData(d, 0, 0); }catch(e){} }
  return (A.heroCache[key] = cv);
}

/* ---------------- 绘图小工具 ---------------- */
const INK = '#2E2E3A';
function rr(c, x, y, w, h, r){ c.beginPath(); c.moveTo(x+r, y); c.arcTo(x+w, y, x+w, y+h, r); c.arcTo(x+w, y+h, x, y+h, r); c.arcTo(x, y+h, x, y, r); c.arcTo(x, y, x+w, y, r); c.closePath(); }
function ell(c, x, y, rx, ry, fill){ c.beginPath(); c.ellipse(x, y, Math.max(0.1,rx), Math.max(0.1,ry), 0, 0, Math.PI*2); if (fill){ c.fillStyle = fill; c.fill(); } }
function starPath(c, x, y, r1, r2, n){ c.beginPath(); for (let i=0;i<n*2;i++){ const r = i%2 ? r2 : r1, a = -Math.PI/2 + i*Math.PI/n; c.lineTo(x+Math.cos(a)*r, y+Math.sin(a)*r); } c.closePath(); }

// Kenney 金币：正面按 cos 压扁，转到侧面时换成侧面图，看起来在转
function drawCoin(c, x, y, r, t, ph, big){
  const sw = Math.cos(t*4 + ph), k = Math.abs(sw), d = r*3.1;
  if (big){ c.globalAlpha = 0.35 + 0.15*Math.sin(t*5 + ph); ell(c, x, y, r*1.35, r*1.35, '#FFF3A0'); c.globalAlpha = 1; }
  if (k < 0.28) sprC(c, 'coin_gold_side', x, y, d*0.42, d);
  else sprC(c, 'coin_gold', x, y, d*k, d);
  if (big && Math.sin(t*3 + ph) > 0.6){ c.fillStyle = '#fff'; starPath(c, x + r*0.5, y - r*0.6, r*0.3, r*0.1, 4); c.fill(); }
}

const RUN = ['run0','run1','run2','run1'];
// 豆豆：x,y 是脚底中心；s 是身高
function drawHero(c, x, y, s, colId, hatId, run, vy, airborne, landT){
  if (!A.ready) return;
  let name = airborne ? (vy < 0 ? 'jump' : 'fall') : (landT > 0 ? 'land' : RUN[Math.floor(run/38) % 4]);
  if (run === 0 && !airborne && !landT) name = 'run1';
  const img = heroFrame(colId, name), m = A.hero[name];
  const k = s / 150, w = img.width*k, h = img.height*k;
  let sx = 1, sy = 1;
  if (airborne){ const q = Math.max(-0.1, Math.min(0.1, -vy/7000)); sx = 1 - q; sy = 1 + q; }
  if (landT > 0){ const q = landT/0.14*0.12; sx = 1 + q; sy = 1 - q; }
  const bob = (!airborne && !landT) ? -Math.abs(Math.sin(run/38*Math.PI/2))*s*0.03 : 0;
  c.save(); c.translate(x, y + bob); c.scale(sx, sy);
  const ox = -m.cx*k, oy = -(m.bottom+1)*k;
  c.drawImage(img, ox, oy, w, h);
  if (hatId && hatId !== 'none'){ c.save(); c.translate(ox + m.cx*k + s*0.02, oy + m.headTop*k + s*0.06); drawHat(c, hatId, s*0.95, 0); c.restore(); }
  c.restore();
}
function inked(c, s){ c.lineWidth = Math.max(1.5, s*0.035); c.strokeStyle = INK; c.lineJoin = 'round'; c.stroke(); }
function drawHat(c, id, s, top){
  if (id === 'beanie'){ c.fillStyle = '#E8423F'; c.beginPath(); c.ellipse(0, top+s*0.1, s*0.36, s*0.28, 0, Math.PI, 0); c.closePath(); c.fill(); inked(c, s);
    c.fillStyle = '#C62F2C'; rr(c, -s*0.38, top+s*0.04, s*0.76, s*0.12, s*0.05); c.fill(); inked(c, s); ell(c, 0, top-s*0.22, s*0.09, s*0.09, '#fff'); inked(c, s); }
  else if (id === 'bow'){ c.fillStyle = '#FF5C93'; c.beginPath(); c.moveTo(0, top+s*0.02); c.lineTo(-s*0.26, top-s*0.16); c.lineTo(-s*0.24, top+s*0.18); c.closePath(); c.fill(); inked(c, s);
    c.beginPath(); c.moveTo(0, top+s*0.02); c.lineTo(s*0.26, top-s*0.16); c.lineTo(s*0.24, top+s*0.18); c.closePath(); c.fill(); inked(c, s); ell(c, 0, top+s*0.02, s*0.08, s*0.08, '#FF2E76'); inked(c, s); }
  else if (id === 'straw'){ ell(c, 0, top+s*0.08, s*0.58, s*0.12, '#E9C46A'); inked(c, s); c.fillStyle = '#F4D58D'; c.beginPath(); c.ellipse(0, top+s*0.06, s*0.3, s*0.25, 0, Math.PI, 0); c.closePath(); c.fill(); inked(c, s);
    c.fillStyle = '#E63946'; c.fillRect(-s*0.3, top-s*0.02, s*0.6, s*0.07); }
  else if (id === 'flower'){ const cs = ['#FF6B9A','#FFD23F','#7ED957','#6EC6FF','#C77DFF']; for (let i=0;i<5;i++){ const a = Math.PI + (i/4)*Math.PI, fx = Math.cos(a)*s*0.33, fy = top+s*0.12+Math.sin(a)*s*0.13;
    c.beginPath(); for (let k=0;k<5;k++){ const b = k/5*Math.PI*2; c.moveTo(fx+Math.cos(b)*s*0.06 + s*0.05, fy+Math.sin(b)*s*0.06); c.arc(fx+Math.cos(b)*s*0.06, fy+Math.sin(b)*s*0.06, s*0.05, 0, Math.PI*2); }
    c.fillStyle = cs[i]; c.fill(); inked(c, s*0.6); ell(c, fx, fy, s*0.035, s*0.035, '#fff'); } }
  else if (id === 'chef'){ c.fillStyle = '#fff'; rr(c, -s*0.22, top-s*0.05, s*0.44, s*0.16, s*0.03); c.fill(); inked(c, s);
    c.beginPath(); c.arc(-s*0.15, top-s*0.18, s*0.15, 0, Math.PI*2); c.arc(s*0.15, top-s*0.18, s*0.15, 0, Math.PI*2); c.moveTo(s*0.17, top-s*0.28); c.arc(0, top-s*0.28, s*0.17, 0, Math.PI*2); c.fill(); inked(c, s);
    c.fillStyle = '#fff'; rr(c, -s*0.2, top-s*0.1, s*0.4, s*0.12, s*0.02); c.fill(); }
  else if (id === 'crown'){ c.fillStyle = '#FFC400'; c.beginPath(); c.moveTo(-s*0.28, top+s*0.1); c.lineTo(-s*0.3, top-s*0.2); c.lineTo(-s*0.14, top-s*0.05);
    c.lineTo(0, top-s*0.28); c.lineTo(s*0.14, top-s*0.05); c.lineTo(s*0.3, top-s*0.2); c.lineTo(s*0.28, top+s*0.1); c.closePath(); c.fill(); inked(c, s);
    ell(c, 0, top-s*0.02, s*0.05, s*0.05, '#E63946'); ell(c, -s*0.17, top+s*0.02, s*0.035, s*0.035, '#4CC9F0'); ell(c, s*0.17, top+s*0.02, s*0.035, s*0.035, '#4CC9F0'); }
}

const ENEMY = [['slime_spike_walk_a','slime_spike_walk_b'], ['snail_walk_a','snail_walk_b'], ['ladybug_walk_a','ladybug_walk_b'], ['mouse_walk_a','mouse_walk_b']];
function drawEnemy(c, o, t){
  const fr = ENEMY[o.kind % ENEMY.length], n = fr[Math.floor(t*3 + o.x) % 2], f = A.fr[n];
  const w = o.w*1.35, h = w * f[3]/f[2];
  spr(c, n, o.x + o.w/2 - w/2, -h + 2, w, h);
}
function drawMagnet(c, x, y, t){
  c.save(); c.translate(x, y + Math.sin(t*3)*8); c.rotate(Math.sin(t*2)*0.15);
  c.globalAlpha = 0.35 + Math.sin(t*6)*0.15; ell(c, 0, 0, 46, 46, '#FFF59D'); c.globalAlpha = 1;
  c.lineCap = 'round'; c.lineWidth = 26; c.strokeStyle = INK; c.beginPath(); c.arc(0, -4, 22, Math.PI, 0); c.moveTo(-22, -4); c.lineTo(-22, 16); c.moveTo(22, -4); c.lineTo(22, 16); c.stroke();
  c.lineWidth = 18; c.strokeStyle = '#E53935'; c.beginPath(); c.arc(0, -4, 22, Math.PI, 0); c.moveTo(-22, -4); c.lineTo(-22, 12); c.moveTo(22, -4); c.lineTo(22, 12); c.stroke();
  c.fillStyle = '#ECEFF1'; rr(c, -32, 10, 20, 14, 4); c.fill(); inked(c, 60); rr(c, 12, 10, 20, 14, 4); c.fill(); inked(c, 60);
  c.restore();
}
function drawGate(c, x, t){
  const fl = Math.floor(t*4) % 2 ? 'flag_red_a' : 'flag_red_b', fy = Math.floor(t*4+1) % 2 ? 'flag_yellow_a' : 'flag_yellow_b';
  spr(c, fl, x - 40, -230, 120, 120); spr(c, fl, x - 40, -120, 120, 120);
  spr(c, fy, x + 290, -230, 120, 120); spr(c, fy, x + 290, -120, 120, 120);
  c.save(); c.translate(x + 165, -300 + Math.sin(t*2)*4);
  c.fillStyle = '#FFCA28'; rr(c, -150, -38, 300, 76, 26); c.fill(); inked(c, 120);
  c.fillStyle = '#C62828'; c.font = '900 50px "PingFang SC",sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('终 点', 0, 3);
  c.restore();
  for (let i = 0; i < 4; i++) sprC(c, 'star', x + 30 + i*90, -380 + Math.sin(t*3 + i)*10, 44, 44);
}

/* ---------------- 场景（多层视差） ---------------- */
const SC = {
  garden:{tile:'grass', sky:['#9DD3FF','#E3F3FF'], deco:['bush','grass','mushroom_red','grass','rock','bush','fence'], bg:'#9DD3FF'},
  beach: {tile:'sand',  far:'beach_far', deco:['rock','grass','bush'], bg:'#AEE0FF'},
  home:  {tile:'stone', far:'jiangnan_far', mid:'jiangnan_mid', deco:['fence','bush','grass','mushroom_brown','fence'], bg:'#FBC690'},
  snow:  {tile:'snow',  far:'snow_far', deco:['snow','rock','snow'], bg:'#D5E9FA'},
  night: {tile:'purple',far:'night_far', deco:['torch','grass_purple','mushroom_red','grass_purple'], bg:'#2A2366'}
};
function layer(f){ const k = DPR*scale; ctx.setTransform(k, 0, 0, k, -G.camX*f*k, -camTop*k); }
function each(f, spacing, fn){ const lc = G.camX*f, i0 = Math.floor(lc/spacing) - 1, i1 = Math.ceil((lc + viewW)/spacing) + 1; for (let i=i0;i<=i1;i++) fn(i*spacing, i); }
// 一张图横向循环铺开（奇数张镜像翻转，接缝就看不出来）
function tileImg(img, f, h, bottom){
  const w = img.width * h / img.height;
  each(f, w, (x, i) => { if (i & 1){ ctx.save(); ctx.translate(x + w, 0); ctx.scale(-1, 1); ctx.drawImage(img, 0, bottom - h, w + 1, h); ctx.restore(); } else ctx.drawImage(img, x, bottom - h, w + 1, h); });
}
function drawClouds(f, t, n){
  each(f, 560, (x, i) => { const y = camTop + 60 + hash(i)*Math.max(40, (-camTop - 360)); const s = 0.6 + hash(i+5)*0.6, dx = (t*8) % 560;
    const X = x + dx; ctx.fillStyle = 'rgba(255,255,255,.95)';
    ctx.beginPath(); ctx.arc(X, y, 34*s, 0, 7); ctx.arc(X+42*s, y-14*s, 42*s, 0, 7); ctx.arc(X+90*s, y, 32*s, 0, 7); ctx.rect(X, y, 90*s, 30*s); ctx.fill();
    ctx.fillStyle = 'rgba(200,228,255,.9)'; ctx.fillRect(X - 4*s, y + 22*s, 98*s, 10*s); });
}
function drawScene(id, t){
  const P = SC[id] || SC.garden;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const above = -camTop;
  if (!A.ready){ ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H); return; }
  if (P.far){
    const img = A.bg[P.far];
    // 远景图顶部的颜色铺满整片天空，再把图贴在地平线上
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, W, H);
    layer(0.06); tileImg(img, 0.06, Math.max(above + 60, 420), 60);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, H - GROUND_MARGIN*scale); g.addColorStop(0, P.sky[0]); g.addColorStop(1, P.sky[1]); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.globalAlpha = 0.25; ell(ctx, W*0.82, (H - GROUND_MARGIN*scale)*0.2, 90*scale, 90*scale, '#FFF6B0'); ctx.globalAlpha = 1; ell(ctx, W*0.82, (H - GROUND_MARGIN*scale)*0.2, 52*scale, 52*scale, '#FFE45C');
    layer(0.03); drawClouds(0.03, t);
    const hh = Math.max(520, above*0.8), th = Math.max(430, above*0.62);
    layer(0.12); tileImg(A.bg.k_fade_hills, 0.12, hh, hh*0.29);
    layer(0.3); tileImg(A.bg.k_color_trees, 0.3, th, th*0.35);
  }
  if (P.mid){ layer(0.35); tileImg(A.bg[P.mid], 0.35, 190, 6); }
  if (id === 'snow'){ ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.fillStyle = '#fff';
    for (let i=0;i<40;i++){ const sx = (hash(i)*W + Math.sin(t + i)*20 - G.camX*scale*0.2) % W, sy = ((hash(i+7)*H + t*40*(0.5+hash(i+3))) % H); ell(ctx, (sx + W) % W, sy, 3*scale + 1, 3*scale + 1, '#fff'); } }
  if (id === 'night'){ ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    for (let i=0;i<14;i++){ ctx.globalAlpha = 0.3 + 0.7*Math.abs(Math.sin(t*2 + i*1.7)); const fx = (hash(i)*W*1.3 - (G.camX*scale*0.4) % (W*1.3) + W*1.3) % (W*1.3), fy = H*0.35 + hash(i+4)*H*0.4 + Math.sin(t + i)*10; ell(ctx, fx, fy, 3*scale + 1, 3*scale + 1, '#E6FF7A'); }
    ctx.globalAlpha = 1; }
  // 地面：Kenney 地砖
  layer(1);
  const T = 56, x0 = Math.floor(G.camX / T) - 1, x1 = Math.ceil((G.camX + viewW) / T) + 1, rows = Math.ceil((GROUND_MARGIN + 20) / T);
  for (let i = x0; i <= x1; i++){
    spr(ctx, P.tile + '_block_top', i*T, -4, T + 0.5, T + 0.5);
    for (let r = 1; r <= rows; r++) spr(ctx, P.tile + '_block_center', i*T, -4 + r*T, T + 0.5, T + 0.5);
  }
  // 地上的小装饰（灌木、草、栅栏、火把…）
  each(1, 230, (x, i) => { const hv = hash(i*1.31); if (hv < 0.35) return; let n = P.deco[((i % P.deco.length) + P.deco.length) % P.deco.length];
    if (n === 'torch') n = Math.floor(t*6 + i) % 2 ? 'torch_on_a' : 'torch_on_b';
    const sz = n === 'fence' ? 60 : n === 'bush' ? 64 : 48; const xx = x + hv*60;
    if (n.startsWith('torch')){ ctx.globalAlpha = 0.25 + 0.1*Math.sin(t*8 + i); ell(ctx, xx + sz/2, -sz*0.7, 40, 40, '#FFB74D'); ctx.globalAlpha = 1; }
    spr(ctx, n, xx, -sz + 2, sz, sz); });
}

/* ---------------- 游戏状态 ---------------- */
const G = {state:'menu', demo:true, L:null, p:null, camX:0, t:0, score:0, combo:0, comboT:0, maxCombo:0, hits:0,
  flyers:[], parts:[], texts:[], loose:[], toasts:[], magnetT:0, rainT:0, rainAcc:0, finished:false, finishT:0, bump:0, tut:0,
  seed:0, kind:'today', dayLabel:''};
function newPlayer(){ return {x:0, y:0, vy:0, on:true, jumps:0, hold:false, holdT:0, coy:0, buf:0, inv:0, run:0, landT:0, dustT:0}; }
function startLevel(seed, kind){
  G.L = genLevel(seed); G.seed = seed; G.kind = kind; G.p = newPlayer(); G.camX = 0; G.score = 0; G.combo = 0; G.comboT = 0; G.maxCombo = 0; G.hits = 0;
  G.flyers = []; G.parts = []; G.texts = []; G.loose = []; G.toasts = []; G.magnetT = 0; G.rainT = 0; G.finished = false; G.finishT = 0; G.demo = kind === 'demo';
  G.tut = G.demo ? 0 : (S.tut ? 3 : 6);
  if (!G.demo){ S.plays++; S.tut = true; save(); G.state = 'play'; showScreen(null); $('#pauseBtn').style.display = 'block'; }
}
function speed(){ return (S.set.speed === 'slow' ? 235 : 300); }
function tryJump(){
  const p = G.p;
  if (p.on || p.coy > 0){ p.vy = -790; p.jumps = 1; p.on = false; p.coy = 0; p.holdT = 0; if (!G.demo) Snd.jump(false); dust(p.x, p.y, 6); return true; }
  if (p.jumps < 2){ p.vy = -720; p.jumps = 2; p.holdT = 0; if (!G.demo) Snd.jump(true); puff(p.x, p.y-20, 8); return true; }
  return false;
}
function press(){ if (G.state !== 'play') return; G.p.hold = true; if (!tryJump()) G.p.buf = 0.14; }
function release(){ if (G.p) G.p.hold = false; }
function dust(x, y, n){ const col = {beach:'#F3D9A4', snow:'#FFFFFF', night:'#B9A8F0', home:'#E8D5B5'}[S.equip.scene] || '#F2EBDD';
  for (let i=0;i<n;i++){ const dir = n === 1 ? -1 : (i%2 ? 1 : -1); G.parts.push({x:x + dir*8, y:y - 4, vx:dir*(40 + Math.random()*(n === 1 ? 40 : 150)), vy:-20 - Math.random()*70, life:0.45, max:0.45, c:col, r:(n === 1 ? 5 : 7) + Math.random()*6, kind:'dust'}); } }
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
  const prevY = p.y, wasOn = p.on; p.vy = Math.min(1500, p.vy + g*dt); p.y += p.vy*dt; p.on = false;
  if (p.y >= 0){ p.y = 0; p.vy = 0; p.on = true; }
  else if (p.vy >= 0){ for (const pl of L.plats){ if (p.x + 20 > pl.x && p.x - 20 < pl.x + pl.w && prevY <= pl.y + 1 && p.y >= pl.y){ p.y = pl.y; p.vy = 0; p.on = true; break; } } }
  if (p.on){ if (!wasOn){ p.landT = 0.14; dust(p.x, p.y, 10); if (!G.demo) Snd.land(); } p.jumps = 0; p.coy = 0.1;
    p.dustT -= dt; if (p.dustT <= 0){ p.dustT = 0.22; dust(p.x - 18, p.y, 1); } } else p.coy -= dt;
  if (p.landT > 0) p.landT -= dt;
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
  for (const q of G.parts){ q.life -= dt; q.x += q.vx*dt; q.y += q.vy*dt; q.vy += (q.kind === 'confetti' ? 300 : q.kind === 'dust' ? -60 : 200)*dt; q.vx *= 0.98; }
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
  for (const pl of L.plats){ if (pl.x > x1 || pl.x + pl.w < x0) continue; const n = Math.max(2, Math.round(pl.w/50)), tw = pl.w/n;
    for (let i=0;i<n;i++) spr(ctx, P.tile + (i === 0 ? '_horizontal_left' : i === n-1 ? '_horizontal_right' : '_horizontal_middle'), pl.x + i*tw, pl.y - 4, tw + 0.5, tw + 0.5); }
  if (L.len > x0 - 400 && L.len < x1 + 100) drawGate(ctx, L.len, t);
  for (const c of L.coins){ if (c.taken || c.x < x0) continue; if (c.x > x1) break; drawCoin(ctx, c.x, c.y + Math.sin(t*2 + c.ph)*3, c.r, t, c.ph, c.big); }
  for (const it of L.items) if (!it.taken && it.x > x0 && it.x < x1) drawMagnet(ctx, it.x, it.y, t);
  for (const o of L.obs) if (o.x > x0 && o.x < x1) drawEnemy(ctx, o, t);
  for (const c of G.loose){ if (c.t < 0.5 && !c.rain && Math.floor(c.t*20)%2) continue; if (c.life - c.t < 1.2 && Math.floor(c.t*10)%2) continue; drawCoin(ctx, c.x, c.y, 17, t, c.x, false); }
  if (G.magnetT > 0){ ctx.globalAlpha = 0.18 + 0.08*Math.sin(t*10); ell(ctx, p.x, p.y-30, 90, 90, '#FFEB3B'); ctx.globalAlpha = 1; }
  ell(ctx, p.x, -2, 26 * (1 + p.y/600), 6, 'rgba(0,0,0,.15)');
  if (!(p.inv > 0 && Math.floor(p.inv*12)%2)) drawHero(ctx, p.x, p.y, 74, S.equip.color, S.equip.hat, p.run, p.vy, !p.on, p.landT);
  for (const q of G.parts){ ctx.globalAlpha = Math.max(0, q.life/q.max);
    if (q.kind === 'star'){ ctx.fillStyle = q.c; starPath(ctx, q.x, q.y, q.r, q.r*0.45, 4); ctx.fill(); }
    else if (q.kind === 'confetti'){ ctx.fillStyle = q.c; ctx.fillRect(q.x, q.y, q.r, q.r*1.6); }
    else if (q.kind === 'dust'){ const a = q.life/q.max; ell(ctx, q.x, q.y, q.r*(1.6 - a*0.6), q.r*(1.6 - a*0.6), q.c); }
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
function drawDigits(str, x, y, h){ const w = h*0.8; for (let i=0;i<str.length;i++) sprC(ctx, 'd' + str[i], x + w*0.5 + i*w*0.6, y, w, h); }
function drawHUD(){
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const [cx, cy] = hudCoinPos(), b = 1 + G.bump*0.35;
  ctx.fillStyle = 'rgba(46,46,58,.55)'; rr(ctx, cx - 30*ui, cy - 28*ui, 70*ui + String(G.score).length*25*ui, 56*ui, 28*ui); ctx.fill();
  ctx.save(); ctx.translate(cx, cy); ctx.scale(b, b); sprC(ctx, 'hud_coin', 0, 0, 48*ui, 48*ui); ctx.restore();
  drawDigits(String(G.score), cx + 28*ui, cy, 40*ui*(1 + G.bump*0.15));
  if (G.combo >= 3){ const s = 1 + Math.max(0, G.comboT - 0.95)*2; outlined('连击 ×' + G.combo, cx - 20*ui, cy + 52*ui, 28*ui*s, G.combo >= 10 ? '#FF3D7F' : '#FF8A00'); }
  // 进度条
  const bw = W < H ? W*0.6 : Math.min(W*0.34, 320*ui), bx = W/2 - bw/2, by = safe.t + (W < H ? 104 : 28)*ui, prog = Math.max(0, Math.min(1, G.p.x / G.L.len));
  ctx.fillStyle = 'rgba(255,255,255,.75)'; rr(ctx, bx - 4, by - 4, bw + 8, 20*ui + 8, 14*ui); ctx.fill();
  ctx.fillStyle = '#FFE08A'; rr(ctx, bx, by, bw, 20*ui, 10*ui); ctx.fill();
  ctx.fillStyle = '#7ED957'; rr(ctx, bx, by, Math.max(20*ui, bw*prog), 20*ui, 10*ui); ctx.fill();
  outlined('🏁', bx + bw + 6, by + 10*ui, 22*ui, '#333');
  drawHero(ctx, bx + bw*prog, by + 24*ui, 34*ui, S.equip.color, 'none', G.p.run, 0, false, 0);
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
  requestAnimationFrame(frame);
  try{ if (G.state === 'play' || G.state === 'menu') update(dt); render(); }catch(e){ if (!frame.err){ frame.err = 1; console.error(e); } }
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
  notes.unshift('最多连击 ' + G.maxCombo + (G.hits ? '　碰到小怪 ' + G.hits + ' 次' : '　一次都没碰到，真棒！'));
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
    if (shopTab === 'scene'){ const P = SC[it.id]; const g = c.createLinearGradient(0, 0, 0, 180); g.addColorStop(0, P.sky ? P.sky[0] : P.bg); g.addColorStop(1, P.sky ? P.sky[1] : P.bg); c.fillStyle = g; c.fillRect(0, 0, 240, 180);
      if (A.ready){ const P2 = SC[it.id]; if (P2.far){ const im = A.bg[P2.far]; c.drawImage(im, 0, 0, im.width, im.height, -40, -10, 320, 180); if (P2.mid) c.drawImage(A.bg[P2.mid], 0, 0, A.bg[P2.mid].width*0.45, A.bg[P2.mid].height, 0, 80, 240, 60); }
        else { c.drawImage(A.bg.k_color_trees, 0, 60, 384, 324, 0, 20, 240, 202); }
        for (let i=0;i<5;i++) spr(c, P2.tile + '_block_top', i*50, 136, 50, 50);
        drawHero(c, 120, 138, 64, S.equip.color, S.equip.hat, 0, 0, false, 0); } }
    else { c.fillStyle = '#FFF8E1'; c.fillRect(0, 0, 240, 180);
      drawHero(c, 120, 172, 130, shopTab === 'color' ? it.id : S.equip.color, shopTab === 'hat' ? it.id : S.equip.hat, 0, 0, false, 0); }
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
$('#bAbout').onclick = () => { Snd.click(); showScreen('about'); };
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
  GROUND_MARGIN = port ? Math.max(110, viewH*0.26) : 110; camTop = -(viewH - GROUND_MARGIN);
  ui = Math.max(0.85, Math.min(1.6, Math.min(W, H)/430));
  const cs = getComputedStyle($('#safeProbe')); safe.t = parseFloat(cs.paddingTop)||0; safe.r = parseFloat(cs.paddingRight)||0; safe.b = parseFloat(cs.paddingBottom)||0; safe.l = parseFloat(cs.paddingLeft)||0;
  document.body.classList.toggle('landscape', W > H);
}
window.addEventListener('resize', resize); window.addEventListener('orientationchange', () => setTimeout(resize, 200));

/* ---------------- 启动 ---------------- */
resize();
Snd.init();
goMenu();
requestAnimationFrame(frame);
loadAssets().catch(() => {}).then(() => { $('#loading').style.display = 'none'; if (!dailyLogin()) refreshMenu(); });
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) navigator.serviceWorker.register('sw.js').catch(() => {});
window.__game = {G, S, A, Snd, startLevel, press, release};
})();
