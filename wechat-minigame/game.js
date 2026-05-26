const canvas = wx.createCanvas();
const ctx = canvas.getContext("2d");

wx.showShareMenu({ withShareTicket: true });
wx.onShareAppMessage(() => ({
  title: "环线冲刺：一键换轨，别碰红色闸门",
}));
wx.setKeepScreenOn({ keepScreenOn: true });

const TAU = Math.PI * 2;
const BEST_KEY = "ring-rush-best";
const ENERGY_KEY = "ring-rush-energy";
const RANKING_KEY = "ring-rush-ranking";
const SETTINGS_KEY = "ring-rush-settings";
const DAILY_ENERGY = 3;
const REWARDED_AD_UNIT_ID = "";

let system = wx.getSystemInfoSync();
let dpr = Math.min(system.pixelRatio || 1, 2);
let w = system.windowWidth;
let h = system.windowHeight;
let cx = w / 2;
let cy = h / 2 + 64;
let scale = 1;
let laneRadii = [92, 148];
let running = false;
let last = 0;
let spawnTimer = 0;
let shake = 0;
let score = 0;
let combo = 0;
let pulse = 0;
let best = 0;
let screen = "home";
let notice = "";
let noticeUntil = 0;
let rewardedVideoAd = null;
let adLoading = false;
let buttons = [];

let energy = {
  date: todayKey(),
  playsLeft: DAILY_ENERGY,
};

let ranking = [];

let settings = {
  vibration: true,
  reducedFx: false,
};

try {
  best = Number(wx.getStorageSync(BEST_KEY) || 0);
} catch (_) {
  best = 0;
}

loadEnergy();
loadRanking();
loadSettings();
initRewardedAd();

const player = {
  angle: -Math.PI / 2,
  lane: 1,
  targetLane: 1,
  lanePos: 1,
  speed: 1.8,
};

const items = [];
const particles = [];
const stars = [];

function resize() {
  system = wx.getSystemInfoSync();
  dpr = Math.min(system.pixelRatio || 1, 2);
  w = system.windowWidth;
  h = system.windowHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  cx = w / 2;
  cy = h / 2 + (w < 520 ? 72 : 32);
  scale = Math.max(0.78, Math.min(1.18, Math.min(w, h) / 430));
  laneRadii = [88 * scale, 146 * scale];
  stars.length = 0;
  for (let i = 0; i < 80; i += 1) {
    stars.push({
      x: Math.random() * w,
      y: Math.random() * h,
      r: Math.random() * 1.7 + 0.3,
      a: Math.random() * 0.45 + 0.08,
    });
  }
}

function normAngle(a) {
  return ((a % TAU) + TAU) % TAU;
}

function angularDistance(a, b) {
  let diff = Math.abs((a - b) % TAU);
  return diff > Math.PI ? TAU - diff : diff;
}

function point(angle, radius) {
  return {
    x: cx + Math.cos(angle) * radius,
    y: cy + Math.sin(angle) * radius,
  };
}

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadEnergy() {
  try {
    const saved = wx.getStorageSync(ENERGY_KEY);
    if (saved && saved.date === todayKey()) {
      energy = {
        date: saved.date,
        playsLeft: Number(saved.playsLeft || 0),
      };
      return;
    }
  } catch (_) {}
  energy = { date: todayKey(), playsLeft: DAILY_ENERGY };
  saveEnergy();
}

function saveEnergy() {
  try {
    wx.setStorageSync(ENERGY_KEY, energy);
  } catch (_) {}
}

function grantEnergy(amount = 1) {
  energy.playsLeft += amount;
  saveEnergy();
  showNotice(`体力 +${amount}`);
}

function consumeEnergy() {
  loadEnergy();
  if (energy.playsLeft <= 0) return false;
  energy.playsLeft -= 1;
  saveEnergy();
  return true;
}

function loadRanking() {
  try {
    ranking = wx.getStorageSync(RANKING_KEY) || [];
  } catch (_) {
    ranking = [];
  }
}

function saveRanking() {
  try {
    wx.setStorageSync(RANKING_KEY, ranking);
  } catch (_) {}
}

function recordScore(finalScore) {
  if (finalScore <= 0) return;
  ranking.push({
    score: finalScore,
    date: todayKey(),
  });
  ranking = ranking
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
  saveRanking();
}

function loadSettings() {
  try {
    settings = {
      ...settings,
      ...(wx.getStorageSync(SETTINGS_KEY) || {}),
    };
  } catch (_) {}
}

function saveSettings() {
  try {
    wx.setStorageSync(SETTINGS_KEY, settings);
  } catch (_) {}
}

function initRewardedAd() {
  if (!REWARDED_AD_UNIT_ID || !wx.createRewardedVideoAd) return;
  rewardedVideoAd = wx.createRewardedVideoAd({ adUnitId: REWARDED_AD_UNIT_ID });
  rewardedVideoAd.onClose((res) => {
    adLoading = false;
    if (res && res.isEnded) {
      grantEnergy(1);
    } else {
      showNotice("完整观看广告后可获得 1 次体力");
    }
  });
  rewardedVideoAd.onError(() => {
    adLoading = false;
    showNotice("广告暂时不可用");
  });
}

function requestAdEnergy() {
  if (!REWARDED_AD_UNIT_ID || !rewardedVideoAd) {
    showNotice("请先配置激励视频广告位 ID");
    return;
  }
  if (adLoading) return;
  adLoading = true;
  rewardedVideoAd.show().catch(() => {
    rewardedVideoAd.load()
      .then(() => rewardedVideoAd.show())
      .catch(() => {
        adLoading = false;
        showNotice("广告加载失败，请稍后再试");
      });
  });
}

function showNotice(text) {
  notice = text;
  noticeUntil = Date.now() + 1800;
}

function reset() {
  score = 0;
  combo = 0;
  spawnTimer = 0;
  shake = 0;
  pulse = 0;
  items.length = 0;
  particles.length = 0;
  player.angle = -Math.PI / 2;
  player.lane = 1;
  player.targetLane = 1;
  player.lanePos = 1;
  player.speed = 1.9;
}

function startGame() {
  if (running) return;
  if (!consumeEnergy()) {
    screen = "energy";
    showNotice("今日体力已用完");
    return;
  }
  reset();
  running = true;
  screen = "playing";
  last = Date.now();
}

function endGame() {
  running = false;
  const finalScore = Math.floor(score);
  best = Math.max(best, finalScore);
  recordScore(finalScore);
  try {
    wx.setStorageSync(BEST_KEY, best);
  } catch (_) {}
  shake = 28;
  screen = "home";
  if (settings.vibration) wx.vibrateShort({ type: "heavy" });
}

function switchLane() {
  if (!running) {
    startGame();
    return;
  }
  player.targetLane = player.targetLane ? 0 : 1;
  pulse = 1;
  addBurst(point(player.angle, laneRadii[player.targetLane]), "#00f0c8", 8, 1.2);
  if (settings.vibration) wx.vibrateShort({ type: "light" });
}

function spawnItem() {
  const difficulty = Math.min(1, score / 1300);
  const hazardChance = 0.24 + difficulty * 0.18;
  const type = Math.random() < hazardChance ? "hazard" : "gem";
  const lane = Math.random() < 0.5 ? 0 : 1;
  const ahead = 1.38 + Math.random() * (type === "hazard" ? 2.6 : 3.2);
  const angle = normAngle(player.angle + ahead);
  const tooClose = items.some((it) => it.lane === lane && angularDistance(it.angle, angle) < 0.34);
  if (!tooClose) items.push({ type, lane, angle, life: 0, hit: false });
}

function addBurst(origin, color, count, power = 1) {
  const particleCount = settings.reducedFx ? Math.ceil(count * 0.45) : count;
  for (let i = 0; i < particleCount; i += 1) {
    const a = Math.random() * TAU;
    const v = (60 + Math.random() * 170) * power;
    particles.push({
      x: origin.x,
      y: origin.y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      size: Math.random() * 3.5 + 1.2,
      life: 0.45 + Math.random() * 0.35,
      max: 0.8,
      color,
    });
  }
}

function collect(item) {
  item.hit = true;
  combo += 1;
  const mult = Math.max(1, Math.min(9, Math.floor(combo / 5) + 1));
  score += 10 * mult;
  const p = point(item.angle, laneRadii[item.lane]);
  addBurst(p, combo % 10 === 0 ? "#58ff7b" : "#ffcf4a", 18, 1.25);
  pulse = 1.35;
}

function update(dt) {
  const speedBoost = Math.min(1.55, score / 1100);
  player.speed = 1.55 + speedBoost;
  player.angle = normAngle(player.angle + player.speed * dt);
  player.lanePos += (player.targetLane - player.lanePos) * Math.min(1, dt * 14);
  player.lane = Math.round(player.lanePos);

  spawnTimer -= dt;
  const spawnRate = Math.max(0.46, 0.92 - Math.min(0.28, score / 3300));
  if (spawnTimer <= 0) {
    spawnItem();
    spawnTimer = spawnRate;
  }

  const playerRadius = laneRadii[0] + (laneRadii[1] - laneRadii[0]) * player.lanePos;
  const playerLane = player.lanePos < 0.5 ? 0 : 1;
  for (const item of items) {
    item.life += dt;
    const diff = angularDistance(player.angle, item.angle);
    if (!item.hit && item.lane === playerLane && diff < (item.type === "gem" ? 0.17 : 0.1)) {
      if (item.type === "gem") {
        collect(item);
      } else {
        addBurst(point(player.angle, playerRadius), "#ff3d3d", 28, 1.45);
        endGame();
      }
    }
  }

  for (let i = items.length - 1; i >= 0; i -= 1) {
    const item = items[i];
    const passedDelta = normAngle(player.angle - item.angle);
    const passed = passedDelta > 0.35 && passedDelta < Math.PI && item.life > 0.7;
    if (item.hit || item.life > 9 || passed) {
      if (item.type === "gem" && !item.hit && combo > 0) combo = Math.max(0, combo - 2);
      items.splice(i, 1);
    }
  }

  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.986;
    p.vy *= 0.986;
    p.life -= dt;
    if (p.life <= 0) particles.splice(i, 1);
  }

  score += dt * (0.6 + combo * 0.04);
  pulse = Math.max(0, pulse - dt * 3.2);
  shake = Math.max(0, shake - dt * 34);
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#030404");
  g.addColorStop(0.48, "#101411");
  g.addColorStop(1, "#040606");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.globalAlpha = 0.22;
  ctx.strokeStyle = "rgba(255,255,255,.12)";
  ctx.lineWidth = 1;
  for (let x = -80; x < w + 80; x += 42) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x + 120, h);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  for (const s of stars) {
    ctx.fillStyle = `rgba(248,241,220,${s.a})`;
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, TAU);
    ctx.fill();
  }
}

function drawRing(radius, color, width, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, TAU);
  ctx.stroke();
  ctx.restore();
}

function drawGem(item) {
  const p = point(item.angle, laneRadii[item.lane]);
  const size = (12 + Math.sin(item.life * 9) * 2) * scale;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(item.angle + Math.PI / 4 + item.life * 2.2);
  ctx.fillStyle = "#ffcf4a";
  ctx.shadowColor = "#ffcf4a";
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.78, 0);
  ctx.lineTo(0, size);
  ctx.lineTo(-size * 0.78, 0);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(255,255,255,.65)";
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawHazard(item) {
  const radius = laneRadii[item.lane];
  const len = 0.15 + Math.min(0.05, score / 12000);
  ctx.save();
  ctx.strokeStyle = "#ff3d3d";
  ctx.lineWidth = 15 * scale;
  ctx.lineCap = "round";
  ctx.shadowColor = "#ff3d3d";
  ctx.shadowBlur = 24;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, item.angle - len, item.angle + len);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,.58)";
  ctx.lineWidth = 3 * scale;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, item.angle - len * 0.76, item.angle + len * 0.76);
  ctx.stroke();
  ctx.restore();
}

function drawPlayer() {
  const radius = laneRadii[0] + (laneRadii[1] - laneRadii[0]) * player.lanePos;
  const p = point(player.angle, radius);
  const tangent = player.angle + Math.PI / 2;
  const glow = 1 + pulse * 0.55;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(tangent);
  ctx.shadowColor = "#00f0c8";
  ctx.shadowBlur = 34 * glow;
  ctx.fillStyle = "#00f0c8";
  roundRect(ctx, -16 * scale * glow, -7 * scale * glow, 32 * scale * glow, 14 * scale * glow, 6 * scale);
  ctx.fill();
  ctx.fillStyle = "#f8f1dc";
  ctx.fillRect(2 * scale, -2 * scale, 12 * scale, 4 * scale);
  ctx.restore();

  const tail = point(player.angle - 0.12, radius);
  ctx.save();
  ctx.strokeStyle = "rgba(0, 240, 200, .34)";
  ctx.lineWidth = 9 * scale;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(tail.x, tail.y);
  ctx.lineTo(p.x, p.y);
  ctx.stroke();
  ctx.restore();
}

function roundRect(context, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawHud() {
  ctx.save();
  ctx.fillStyle = "#f8f1dc";
  ctx.font = "900 42px sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText("RING", 18, 18);
  ctx.fillText("RUSH", 18, 56);
  ctx.fillStyle = "#a9b1ad";
  ctx.font = "12px monospace";
  ctx.fillText("点击换轨，别碰红色闸门", 20, 103);
  ctx.fillStyle = "#ffcf4a";
  ctx.font = "12px monospace";
  ctx.fillText(`体力 ${energy.playsLeft}/${DAILY_ENERGY}`, 20, 122);

  const panelW = Math.min(w - 36, 330);
  const panelX = (w - panelW) / 2;
  ctx.fillStyle = "rgba(10,13,14,.72)";
  ctx.strokeStyle = "rgba(248,241,220,.18)";
  ctx.lineWidth = 1;
  ctx.fillRect(panelX, 132, panelW, 58);
  ctx.strokeRect(panelX, 132, panelW, 58);
  const statW = panelW / 3;
  const labels = ["SCORE", "COMBO", "BEST"];
  const values = [
    String(Math.floor(score)),
    `x${Math.max(1, Math.min(9, Math.floor(combo / 5) + 1))}`,
    String(best),
  ];
  for (let i = 0; i < 3; i += 1) {
    if (i) {
      ctx.strokeStyle = "rgba(248,241,220,.14)";
      ctx.beginPath();
      ctx.moveTo(panelX + statW * i, 132);
      ctx.lineTo(panelX + statW * i, 190);
      ctx.stroke();
    }
    ctx.textAlign = "center";
    ctx.fillStyle = "#a9b1ad";
    ctx.font = "10px monospace";
    ctx.fillText(labels[i], panelX + statW * i + statW / 2, 142);
    ctx.fillStyle = "#f8f1dc";
    ctx.font = "900 26px sans-serif";
    ctx.fillText(values[i], panelX + statW * i + statW / 2, 157);
  }

  if (!running) {
    addButton("ranking", w - 144, 28, 56, 30);
    addButton("settings", w - 80, 28, 56, 30);
    drawSmallButton(w - 144, 28, 56, 30, "榜单", "#00f0c8");
    drawSmallButton(w - 80, 28, 56, 30, "设置", "#ffcf4a");
  }
  ctx.restore();
}

function addButton(id, x, y, width, height) {
  buttons.push({ id, x, y, width, height });
}

function drawSmallButton(x, y, width, height, text, color) {
  ctx.save();
  ctx.fillStyle = "rgba(10,13,14,.74)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, width, height);
  ctx.strokeRect(x, y, width, height);
  ctx.fillStyle = color;
  ctx.font = "12px monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, x + width / 2, y + height / 2);
  ctx.restore();
}

function drawWrappedText(text, x, y, maxWidth, lineHeight) {
  let line = "";
  for (let i = 0; i < text.length; i += 1) {
    const nextLine = line + text[i];
    if (ctx.measureText(nextLine).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = text[i];
      y += lineHeight;
    } else {
      line = nextLine;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

function drawOverlay() {
  if (running) return;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.48)";
  ctx.fillRect(0, 0, w, h);
  const boxW = Math.min(360, w - 32);
  const boxH = screen === "leaderboard" || screen === "settings" ? 300 : 280;
  const x = (w - boxW) / 2;
  const y = Math.max(210, h / 2 - 120);
  ctx.fillStyle = "rgba(9,12,12,.9)";
  ctx.strokeStyle = "rgba(248,241,220,.22)";
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, boxW, boxH);
  ctx.strokeRect(x, y, boxW, boxH);

  if (screen === "leaderboard") {
    ctx.fillStyle = "#f8f1dc";
    ctx.font = "900 42px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("排行榜", x + 22, y + 22);
    ctx.font = "15px monospace";
    const list = ranking.length ? ranking.slice(0, 6) : [{ score: 0, date: "暂无成绩" }];
    list.forEach((item, index) => {
      ctx.fillStyle = index === 0 ? "#ffcf4a" : "#f8f1dc";
      ctx.fillText(`${index + 1}. ${item.score} 分`, x + 28, y + 88 + index * 28);
      ctx.fillStyle = "#a9b1ad";
      ctx.fillText(item.date, x + 160, y + 88 + index * 28);
    });
    addButton("back", x + 24, y + boxH - 56, 104, 38);
    drawSmallButton(x + 24, y + boxH - 56, 104, 38, "返回", "#ffcf4a");
    ctx.restore();
    return;
  }

  if (screen === "settings") {
    ctx.fillStyle = "#f8f1dc";
    ctx.font = "900 42px sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("设置", x + 22, y + 22);
    ctx.fillStyle = "#a9b1ad";
    ctx.font = "13px monospace";
    ctx.fillText("调整本地体验设置，不影响分数规则。", x + 24, y + 78);
    addButton("toggle-vibration", x + 24, y + 112, boxW - 48, 42);
    drawSmallButton(x + 24, y + 112, boxW - 48, 42, `震动反馈：${settings.vibration ? "开" : "关"}`, "#00f0c8");
    addButton("toggle-fx", x + 24, y + 166, boxW - 48, 42);
    drawSmallButton(x + 24, y + 166, boxW - 48, 42, `特效强度：${settings.reducedFx ? "低" : "标准"}`, "#00f0c8");
    addButton("back", x + 24, y + boxH - 56, 104, 38);
    drawSmallButton(x + 24, y + boxH - 56, 104, 38, "返回", "#ffcf4a");
    ctx.restore();
    return;
  }

  ctx.fillStyle = "#f8f1dc";
  ctx.font = "900 54px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(score > 0 ? `${Math.floor(score)} 分` : "环线", x + 22, y + 22);
  if (score <= 0) ctx.fillText("冲刺", x + 22, y + 76);
  ctx.fillStyle = "#a9b1ad";
  ctx.font = "13px monospace";
  const noEnergy = energy.playsLeft <= 0;
  const text = noEnergy
    ? "今日 3 次体力已用完，观看广告可增加 1 次。"
    : score > 0
      ? `最高分 ${best}。剩余体力 ${energy.playsLeft} 次。`
      : `两条轨道切换，剩余体力 ${energy.playsLeft} 次。`;
  drawWrappedText(text, x + 24, y + 138, boxW - 52, 20);
  addButton("start", x + 24, y + 174, 104, 42);
  ctx.fillStyle = "#ffcf4a";
  ctx.fillRect(x + 24, y + 174, 104, 42);
  ctx.fillStyle = "#151207";
  ctx.font = "900 20px sans-serif";
  ctx.fillText(score > 0 ? "再来" : "开始", x + 54, y + 184);
  addButton("ad-energy", x + 144, y + 174, 128, 42);
  drawSmallButton(x + 144, y + 174, 128, 42, "看广告+1", "#00f0c8");
  addButton("ranking", x + 24, y + 226, 104, 34);
  addButton("settings", x + 144, y + 226, 104, 34);
  drawSmallButton(x + 24, y + 226, 104, 34, "排行榜", "#f8f1dc");
  drawSmallButton(x + 144, y + 226, 104, 34, "设置", "#f8f1dc");
  if (notice && Date.now() < noticeUntil) {
    ctx.fillStyle = "#58ff7b";
    ctx.font = "12px monospace";
    drawWrappedText(notice, x + 24, y + boxH - 24, boxW - 48, 18);
  }
  ctx.restore();
}

function draw() {
  buttons = [];
  ctx.clearRect(0, 0, w, h);
  ctx.save();
  if (shake > 0) ctx.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
  drawBackground();
  drawRing(laneRadii[0], "rgba(0,240,200,.72)", 3 * scale, 0.85);
  drawRing(laneRadii[1], "rgba(255,207,74,.62)", 3 * scale, 0.78);
  drawRing(laneRadii[0] + (laneRadii[1] - laneRadii[0]) * player.lanePos, "#f8f1dc", 1.5 * scale, 0.16 + pulse * 0.22);

  ctx.save();
  ctx.strokeStyle = "rgba(248,241,220,.12)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 18; i += 1) {
    const a = (i / 18) * TAU + Date.now() * 0.00012;
    const p1 = point(a, laneRadii[0] - 26 * scale);
    const p2 = point(a, laneRadii[1] + 28 * scale);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
  ctx.restore();

  for (const item of items) item.type === "gem" ? drawGem(item) : drawHazard(item);
  if (running) drawPlayer();

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.shadowColor = p.color;
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  ctx.restore();
  drawHud();
  drawOverlay();
}

function handleButton(id) {
  if (id === "start") startGame();
  if (id === "ranking") screen = "leaderboard";
  if (id === "settings") screen = "settings";
  if (id === "back") screen = "home";
  if (id === "ad-energy") requestAdEnergy();
  if (id === "toggle-vibration") {
    settings.vibration = !settings.vibration;
    saveSettings();
  }
  if (id === "toggle-fx") {
    settings.reducedFx = !settings.reducedFx;
    saveSettings();
  }
}

function handleTouch(event) {
  const touch = event.touches && event.touches[0];
  const x = touch ? touch.clientX : 0;
  const y = touch ? touch.clientY : 0;
  for (let i = buttons.length - 1; i >= 0; i -= 1) {
    const button = buttons[i];
    if (x >= button.x && x <= button.x + button.width && y >= button.y && y <= button.y + button.height) {
      handleButton(button.id);
      return;
    }
  }
  switchLane();
}

function loop() {
  const now = Date.now();
  const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
  last = now;
  if (running) update(dt);
  draw();
  requestAnimationFrame(loop);
}

wx.onTouchStart(handleTouch);
wx.onShow(() => {
  last = Date.now();
});
wx.onHide(() => {
  running = false;
});

resize();
last = Date.now();
loop();
