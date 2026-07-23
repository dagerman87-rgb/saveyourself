/* 미르한 어항 — 소리 (WO-013)
 * BGM: CC0 파일 2곡 (낮/밤) 루프 + 교차 페이드. 증빙: assets/audio/CREDITS.md
 * 앰비언트: WebAudio 실시간 합성 — 파도(상시)·귀뚜라미(밤)·빗소리(비)·망치(로한 작업)·갈매기(낮)
 * 정책: 첫 클릭 시 시작(자동재생 대응), 탭 비활성 시 페이드아웃+정지, 기본 볼륨 낮게
 */
'use strict';

const AudioEngine = (() => {
  let ctx = null, master = null;
  let started = false;
  let muted = localStorage.getItem('mirhan-muted') === '1';
  let volume = Number(localStorage.getItem('mirhan-volume') ?? 0.3);
  let state = { night: false, weather: '맑음', hammer: false };

  // ---------- BGM (HTMLAudio 2트랙 교차 페이드) ----------
  const bgmDay = new Audio('assets/audio/quaint-town-loop.mp3');
  const bgmNight = new Audio('assets/audio/village-of-snow.ogg');
  for (const a of [bgmDay, bgmNight]) { a.loop = true; a.volume = 0; a.preload = 'auto'; }
  let bgmFadeTimer = null;
  const BGM_LEVEL = 0.55; // master 볼륨 대비 BGM 비중

  function bgmTargetVols() {
    const eff = started && !muted && !document.hidden ? volume * BGM_LEVEL : 0;
    return state.night ? [0, eff] : [eff, 0];
  }
  function driveBgm() {
    const [d, n] = bgmTargetVols();
    if (started) {
      if (d > 0 && bgmDay.paused) bgmDay.play().catch(() => {});
      if (n > 0 && bgmNight.paused) bgmNight.play().catch(() => {});
    }
    clearInterval(bgmFadeTimer);
    bgmFadeTimer = setInterval(() => {
      let done = true;
      for (const [a, t] of [[bgmDay, d], [bgmNight, n]]) {
        const diff = t - a.volume;
        if (Math.abs(diff) > 0.012) { a.volume += Math.sign(diff) * 0.012; done = false; }
        else { a.volume = t; if (t === 0 && !a.paused) a.pause(); }
      }
      if (done) clearInterval(bgmFadeTimer);
    }, 90); // ~4초 교차
  }

  // ---------- 합성 헬퍼 ----------
  function noiseBuffer(seconds = 2) {
    const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }
  const nodes = {}; // 지속 노드 { waves, rain, crickets }

  function buildWaves() {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(3); src.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380; lp.Q.value = 0.4;
    const g = ctx.createGain(); g.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 0.35;
    lfo.connect(lfoG); lfoG.connect(g.gain);
    src.connect(lp); lp.connect(g); g.connect(master);
    src.start(); lfo.start();
    return { g, base: 0.5 };
  }
  function buildRain() {
    const src = ctx.createBufferSource(); src.buffer = noiseBuffer(2); src.loop = true;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(bp); bp.connect(g); g.connect(master);
    src.start();
    return { g, base: 0.4 };
  }
  // 귀뚜라미: 4.2kHz 짧은 펄스 3연타를 불규칙 반복
  let cricketTimer = null;
  function cricketChirp() {
    if (!ctx || document.hidden || !state.night || muted) return;
    const t0 = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = 4200 + Math.random() * 300;
      const g = ctx.createGain();
      const t = t0 + i * 0.07;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.05, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 0.07);
    }
  }
  // 망치: 금속 파셜 + 노이즈 틱, 감쇠 빠르게
  let hammerTimer = null;
  function hammerClang() {
    if (!ctx || document.hidden || !state.hammer || muted) return;
    const t0 = ctx.currentTime;
    for (const [f, v] of [[620, 0.05], [1240, 0.035], [1870, 0.02], [2600, 0.012]]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f * (0.97 + Math.random() * 0.06);
      const g = ctx.createGain();
      g.gain.setValueAtTime(v, t0);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
      o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.55);
    }
    const n = ctx.createBufferSource(); n.buffer = noiseBuffer(0.1);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 3000;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.05, t0); ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.06);
    n.connect(hp); hp.connect(ng); ng.connect(master); n.start(t0);
  }
  // 갈매기: 주파수 하강 + 비브라토, 짧게 1~3회
  let gullTimer = null;
  function gullCry() {
    if (!ctx || document.hidden || state.night || muted) return;
    const cries = 1 + Math.floor(Math.random() * 2);
    for (let i = 0; i < cries; i++) {
      const t0 = ctx.currentTime + i * 0.45;
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(1150 + Math.random() * 150, t0);
      o.frequency.exponentialRampToValueAtTime(720, t0 + 0.3);
      const vib = ctx.createOscillator(); vib.frequency.value = 22;
      const vibG = ctx.createGain(); vibG.gain.value = 55;
      vib.connect(vibG); vibG.connect(o.frequency);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.022, t0 + 0.05);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.34);
      o.connect(lp); lp.connect(g); g.connect(master);
      o.start(t0); o.stop(t0 + 0.4); vib.start(t0); vib.stop(t0 + 0.4);
    }
  }

  function ensureCtx() {
    if (ctx) return;
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : volume;
    master.connect(ctx.destination);
    nodes.waves = buildWaves();
    nodes.rain = buildRain();
    cricketTimer = setInterval(() => { if (Math.random() < 0.65) cricketChirp(); }, 900);
    hammerTimer = setInterval(() => { if (Math.random() < 0.5) hammerClang(); }, 4200);
    gullTimer = setInterval(() => { if (Math.random() < 0.35) gullCry(); }, 16000);
  }

  function applyState() {
    if (!ctx || !started) { driveBgm(); return; }
    const t = ctx.currentTime;
    master.gain.cancelScheduledValues(t);
    master.gain.linearRampToValueAtTime(muted || document.hidden ? 0 : volume, t + 0.8);
    nodes.waves.g.gain.linearRampToValueAtTime(document.hidden ? 0 : nodes.waves.base, t + 1);
    nodes.rain.g.gain.linearRampToValueAtTime(!document.hidden && state.weather === '비' ? nodes.rain.base : 0, t + 1.5);
    driveBgm();
  }

  // ---------- 공개 API ----------
  function start() { // 첫 사용자 제스처에서 호출
    if (started) return;
    started = true;
    ensureCtx();
    ctx.resume().catch(() => {});
    applyState();
    document.body.classList.add('audio-on');
  }
  function update(next) { state = { ...state, ...next }; applyState(); }
  function setMuted(m) { muted = m; localStorage.setItem('mirhan-muted', m ? '1' : '0'); applyState(); }
  function setVolume(v) { volume = v; localStorage.setItem('mirhan-volume', String(v)); applyState(); }

  document.addEventListener('visibilitychange', () => {
    if (!ctx) return;
    applyState();
    if (document.hidden) setTimeout(() => { if (document.hidden && ctx.state === 'running') ctx.suspend(); }, 1600);
    else if (ctx.state === 'suspended' && started) ctx.resume();
  });

  return { start, update, setMuted, setVolume, get muted() { return muted; }, get volume() { return volume; }, get started() { return started; } };
})();
