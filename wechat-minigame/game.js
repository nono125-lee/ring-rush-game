const canvas = wx.createCanvas();
const ctx = canvas.getContext("2d");

wx.showShareMenu({ withShareTicket: true });
wx.onShareAppMessage(() => ({
  title: "环线冲刺：一键换轨，别碰红色闸门",
}));
wx.setKeepScreenOn({ keepScreenOn: true });

const TAU = Math.PI * 2;
const BEST_KEY = "ring-rush-best";

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

try {
  best = Number(wx.getStorageSync(BEST_KEY) || 0);
} catch (_) {
  best = 0;
}

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
  reset();
  running = true;
  last = Date.now();
}

function endGame() {
  running = false;
  best = Math.max(best, Math.floor(score));
  try {
    wx.setStorageSync(BEST_KEY, best);
  } catch (_) {}
  shake = 28;
  wx.vibrateShort({ type: "heavy" });
}

function switchLane() {
  if (!running) {
    startGame();
    return;
  }
  player.targetLane = player.targetLane ? 0 : 1;
  pulse = 1;
  addBurst(point(player.angle, laneRadii[player.targetLane]), "#00f0c8", 8, 1.2);
  wx.vibrateShort({ type: "light" });
}

function spawnItem() {
  const difficulty = Math.min(1, score / 900);
  const hazardChance = 0.36 + difficulty * 0.22;
  const type = Math.random() < hazardChance ? "hazard" : "gem";
  const lane = Math.random() < 0.5 ? 0 : 1;
  const ahead = 1.15 + Math.random() * (type === "hazard" ? 2.2 : 2.9);
  const angle = normAngle(player.angle + ahead);
  const tooClose = items.some((it) => it.lane === lane && angularDistance(it.angle, angle) < 0.34);
  if (!tooClose) items.push({ type, lane, angle, life: 0, hit: false });
}

function addBurst(origin, color, count, power = 1) {
  for (let i = 0; i < count; i += 1) {
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
  const speedBoost = Math.min(2.4, score / 650);
  player.speed = 1.9 + speedBoost;
  player.angle = normAngle(player.angle + player.speed * dt);
  player.lanePos += (player.targetLane - player.lanePos) * Math.min(1, dt * 14);
  player.lane = Math.round(player.lanePos);

  spawnTimer -= dt;
  const spawnRate = Math.max(0.32, 0.72 - Math.min(0.34, score / 2800));
  if (spawnTimer <= 0) {
    spawnItem();
    spawnTimer = spawnRate;
  }

  const playerRadius = laneRadii[0] + (laneRadii[1] - laneRadii[0]) * player.lanePos;
  const playerLane = player.lanePos < 0.5 ? 0 : 1;
  for (const item of items) {
    item.life += dt;
    const diff = angularDistance(player.angle, item.angle);
    if (!item.hit && item.lane === playerLane && diff < (item.type === "gem" ? 0.15 : 0.12)) {
      if (item.type === "gem") {
        collect(item);
      } else {
        addBurst(point(player.angle, playerRadius), "#ff3d3d", 34, 1.65);
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
  const len = 0.18 + Math.min(0.09, score / 9000);
  ctx.save();
  ctx.strokeStyle = "#ff3d3d";
  ctx.lineWidth = 18 * scale;
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
  ctx.restore();
}

function drawOverlay() {
  if (running) return;
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.48)";
  ctx.fillRect(0, 0, w, h);
  const boxW = Math.min(360, w - 32);
  const boxH = 230;
  const x = (w - boxW) / 2;
  const y = Math.max(230, h / 2 - 90);
  ctx.fillStyle = "rgba(9,12,12,.9)";
  ctx.strokeStyle = "rgba(248,241,220,.22)";
  ctx.lineWidth = 1;
  ctx.fillRect(x, y, boxW, boxH);
  ctx.strokeRect(x, y, boxW, boxH);
  ctx.fillStyle = "#f8f1dc";
  ctx.font = "900 54px sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(score > 0 ? `${Math.floor(score)} 分` : "环线", x + 22, y + 22);
  if (score <= 0) ctx.fillText("冲刺", x + 22, y + 76);
  ctx.fillStyle = "#a9b1ad";
  ctx.font = "13px monospace";
  const text = score > 0 ? `最高分 ${best}。点一下立刻再来。` : "两条轨道切换，吃黄钻，躲红闸。";
  ctx.fillText(text, x + 24, y + 144);
  ctx.fillStyle = "#ffcf4a";
  ctx.fillRect(x + 24, y + 174, 104, 42);
  ctx.fillStyle = "#151207";
  ctx.font = "900 20px sans-serif";
  ctx.fillText(score > 0 ? "再来" : "开始", x + 54, y + 184);
  ctx.fillStyle = "#00f0c8";
  ctx.font = "12px monospace";
  ctx.fillText("Tap", x + 146, y + 188);
  ctx.restore();
}

function draw() {
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

function loop() {
  const now = Date.now();
  const dt = Math.min(0.033, (now - last) / 1000 || 0.016);
  last = now;
  if (running) update(dt);
  draw();
  requestAnimationFrame(loop);
}

wx.onTouchStart(() => switchLane());
wx.onShow(() => {
  last = Date.now();
});
wx.onHide(() => {
  running = false;
});

resize();
last = Date.now();
loop();
