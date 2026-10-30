import { TIMING, platformHeight } from './game.js?v=1.4.0';

const TAU = Math.PI * 2;
const clamp = (value, low, high) => Math.min(high, Math.max(low, value));

function ellipse(c, x, y, rx, ry, color) {
  c.fillStyle = color;
  c.beginPath();
  c.ellipse(x, y, Math.max(0, rx), Math.max(0, ry), 0, 0, TAU);
  c.fill();
}

function path(c, points, fill) {
  c.fillStyle = fill;
  c.beginPath();
  points(c);
  c.fill();
}

export const PLAYER_HALF_CELL = 0.54;

export function platformMetrics(cell) {
  const height = platformHeight(cell);
  return {
    width: cell * 0.78,
    height,
    top: height * 0.62,
    radius: clamp(height * 0.34, 8, 16),
    badge: clamp(cell * 0.095, 9, 16),
    label: clamp(cell * 0.15, 15, 25),
    ghostLabel: clamp(cell * 0.12, 11, 20),
    shadowY: height + 4,
    shadowRadius: clamp(cell * 0.025, 3.5, 5),
    bottomPadding: 10,
    effectScale: clamp(cell / 96, 0.85, 1.6),
  };
}

export function sceneLayout(width, height, controlHeight, active = true, welcomeBottom = 0) {
  const mobile = width < 620;
  const floor = Math.max(1, height - controlHeight);
  const margin = clamp(width * 0.04, 14, 24);
  // Grow smoothly with actual space, including the full mystery arc and landing shadow.
  const hud = clamp(floor * 0.22, 44, 96);
  const maximumArc = Math.max(TIMING.revealHeight, TIMING.jumpHeight + TIMING.extraJumpHeight * 2);
  const verticalSpan = maximumArc + 0.77 * 1.42;
  const horizontalCell = Math.max(1, width - 2 * margin) / (3 + PLAYER_HALF_CELL + 0.45);
  const ease = value => { const t = clamp(value, 0, 1); return t * t * (3 - 2 * t); };
  const compactWeight = active ? ease((width / height - 1.2) / 0.6)
    * ease((480 - height) / 120) * ease((width - 340) / 110) : 0;
  const compactLandscape = compactWeight > 0.5;
  const normalCell = Math.min(180, width / 5.5);
  const nativeLandscapeCell = Math.min(normalCell, clamp(width * 0.145, 78, 132));
  const preferredCell = active ? normalCell + (nativeLandscapeCell - normalCell) * compactWeight
    : Math.min(mobile ? 82 : 112, width / (mobile ? 5.5 : 8.2));
  const cell = Math.max(1, Math.min(preferredCell, horizontalCell));
  const platform = platformMetrics(cell);
  const verticalUnit = active
    ? Math.max(1, Math.min(cell, (floor - hud - platform.height - platform.bottomPadding) / verticalSpan)) : cell;
  const bottom = Math.max(1, floor - platform.height - platform.bottomPadding);
  const stackedWelcome = !active && mobile && welcomeBottom > 0;
  const idleBounce = mobile ? 10 : 21;
  const base = active
    ? Math.min(bottom, Math.max(floor * 0.69, hud + verticalUnit * verticalSpan))
    : Math.min(bottom, Math.max(floor * (mobile ? 0.83 : 0.71), stackedWelcome ? welcomeBottom + 12 + 70 * 1.42 + idleBounce : 0));
  const origin = active
    ? Math.max(margin + cell * 1.4, Math.min(width * 0.22, cell * 2.5))
    : width * (mobile ? 0.36 : 0.20);
  const idleSize = stackedWelcome ? Math.min(70, Math.max(0, (base - welcomeBottom - 12 - idleBounce) / 1.42)) : mobile ? 70 : 100;
  return { width, height, floor, base, cell, origin, margin, hud, mobile, platform, idleSize, idleBounce, verticalCell: verticalUnit, compactLandscape };
}

export function arcHeight(distance, phase, cell) {
  return (phase === 'reveal' ? TIMING.revealHeight
    : TIMING.jumpHeight + (distance - 1) * TIMING.extraJumpHeight) * cell;
}

export function trackedCameraView(game, layout) {
  const { width, cell, origin, margin } = layout;
  const platformHalf = layout.platform.width / cell / 2;
  const positions = game.platforms.map(platform => game.visualCell(platform));
  const playerHalf = PLAYER_HALF_CELL * layout.verticalCell / cell;
  const playerLeft = game.position - playerHalf;
  const playerRight = game.position + playerHalf;
  let left = Math.min(playerLeft, ...positions.map(x => x - platformHalf));
  let right = Math.max(playerRight, ...positions.map(x => x + platformHalf));
  const available = (width - 2 * margin) / cell;
  const allFit = right - left <= available;
  if (!allFit) {
    // Preserve the potato and rear platform before an unreachable forward platform.
    const rear = Math.min(...positions);
    left = Math.min(playerLeft, rear - platformHalf);
    right = Math.max(playerRight, rear + platformHalf);
    if (right - left > available) { left = playerLeft; right = playerRight; }
  }
  const minimum = right - 1 - (width - margin - origin) / cell;
  const maximum = left - 1 + (origin - margin) / cell;
  const softMinimum = minimum + 0.45;
  const softMaximum = maximum - 0.45;
  const preferred = game.position - 1 + (origin - width * 0.43) / cell;
  const goal = softMinimum <= softMaximum
    ? clamp(preferred, softMinimum, softMaximum) : (minimum + maximum) / 2;
  return { minimum: Math.max(0, minimum), maximum: Math.max(0, maximum), goal: Math.max(0, goal), allFit, left, right };
}

export function reframeCamera(current, view) {
  return clamp(current, view.minimum, Math.max(view.minimum, view.maximum));
}

export function followCamera(current, view, dt, previousGoal = view.goal) {
  if (!Number.isFinite(dt) || dt <= 0) return current;
  // Like the native game, track actual sprite bounds; never snap to a new jump target.
  const response = view.goal >= current ? 0.22 : 0.22 * 1.65;
  const velocity = (view.goal - previousGoal) / dt;
  const decay = Math.exp(-dt / response);
  const next = view.goal - velocity * response
    + (current - previousGoal + velocity * response) * decay;
  // The rear edge is monotonic during forward play, so this guard cannot create a reverse jump.
  return clamp(next, 0, view.maximum);
}

export function potato(c, x, y, size, t = 0, fall = false, pose = {}) {
  c.save();
  c.translate(x, y);
  c.rotate(fall ? t * 0.8 : (pose.tilt ?? Math.sin(t * 1.7) * 0.045));
  c.scale(size / 90 * (pose.scaleX ?? 1), size / 90 * (pose.scaleY ?? 1));
  ellipse(c, -30, 33, 12, 6, '#795c3f');
  ellipse(c, 29, 33, 12, 6, '#795c3f');
  c.strokeStyle = '#947248';
  c.lineWidth = 4;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(-36, 5);
  c.quadraticCurveTo(-52, 0, -52, -10);
  c.moveTo(36, 5);
  c.quadraticCurveTo(50, 0, 50, -10);
  c.stroke();
  const gradient = c.createLinearGradient(-30, -50, 35, 40);
  gradient.addColorStop(0, '#f3d29a');
  gradient.addColorStop(0.65, '#e8b777');
  gradient.addColorStop(1, '#cf9658');
  path(c, p => {
    p.moveTo(-39, 6);
    p.bezierCurveTo(-47, -15, -27, -47, -7, -47);
    p.bezierCurveTo(14, -54, 35, -32, 40, -4);
    p.bezierCurveTo(52, 29, 25, 45, -2, 43);
    p.bezierCurveTo(-25, 45, -42, 30, -39, 6);
  }, gradient);
  c.strokeStyle = '#a37848';
  c.lineWidth = 1.8;
  c.stroke();
  ellipse(c, -17, -28, 4, 2, '#e3b575');
  ellipse(c, 25, 19, 2, 3, '#c89356');
  ellipse(c, -28, 18, 2, 2.5, '#c89356');
  ellipse(c, 23, -17, 2, 2, '#d3a165');
  ellipse(c, -17, 8, 8, 4, '#e6a18a');
  ellipse(c, 21, 8, 8, 4, '#e6a18a');
  if (Math.sin(t * 0.66) > 0.994) {
    c.strokeStyle = '#5e4b37';
    c.lineWidth = 3;
    c.beginPath();
    c.moveTo(-16, -2);
    c.lineTo(-10, -2);
    c.moveTo(12, -2);
    c.lineTo(18, -2);
    c.stroke();
  } else {
    ellipse(c, -13, -2, 3, 4.5, '#514b36');
    ellipse(c, 15, -2, 3, 4.5, '#514b36');
    ellipse(c, -12, -3, 1, 1, '#fff5dd');
    ellipse(c, 16, -3, 1, 1, '#fff5dd');
  }
  c.strokeStyle = '#6b513a';
  c.lineWidth = 2.3;
  c.beginPath();
  c.moveTo(-3, 8);
  c.quadraticCurveTo(2, 15, 8, 7);
  c.stroke();
  c.strokeStyle = '#66804b';
  c.lineWidth = 3;
  c.beginPath();
  c.moveTo(-3, -46);
  c.quadraticCurveTo(-4, -58, 2, -63);
  c.stroke();
  path(c, p => {
    p.moveTo(-1, -53);
    p.quadraticCurveTo(-20, -50, -17, -64);
    p.quadraticCurveTo(-3, -66, -1, -53);
  }, '#7e9858');
  path(c, p => {
    p.moveTo(0, -58);
    p.quadraticCurveTo(2, -77, 17, -69);
    p.quadraticCurveTo(14, -55, 0, -58);
  }, '#8fa766');
  c.restore();
}

function flower(c, x, y, size, time) {
  c.save();
  c.translate(x, y);
  c.rotate(Math.sin(time + x) * 0.06);
  c.strokeStyle = '#95a471';
  c.lineWidth = 1.5;
  c.beginPath();
  c.moveTo(0, 0);
  c.lineTo(0, -size * 2);
  c.stroke();
  for (let j = 0; j < 5; j++) {
    const angle = j * TAU / 5;
    ellipse(c, Math.cos(angle) * size * 0.5, -size * 2 + Math.sin(angle) * size * 0.5,
      size * 0.43, size * 0.43, '#fffbed');
  }
  ellipse(c, 0, -size * 2, size * 0.25, size * 0.25, '#d9b65c');
  c.restore();
}

export class Garden {
  constructor(canvas) {
    this.canvas = canvas;
    this.c = canvas.getContext('2d');
    this.controls = canvas.ownerDocument.getElementById('controls');
    this.welcome = canvas.ownerDocument.getElementById('welcome');
    this.camera = 0;
    this.cameraGoal = null;
    this.cameraLayout = null;
    this.particles = [];
    this.fall = 0;
    this.time = 0;
    this.reduced = false;
    this.resize();
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    if (this.controls) this.observer.observe(this.controls);
    if (this.welcome) this.observer.observe(this.welcome);
  }

  resetCamera(position = 1) {
    this.camera = 0;
    this.cameraGoal = null;
    this.cameraLayout = null;
  }

  resize() {
    const bounds = this.canvas.getBoundingClientRect();
    this.w = bounds.width;
    this.h = bounds.height;
    this.controlHeight = this.controls?.getBoundingClientRect().height ?? 0;
    const welcome = this.welcome?.getBoundingClientRect();
    this.welcomeBottom = welcome?.height && welcome.left - bounds.left < bounds.width * 0.4
      ? Math.max(0, welcome.bottom - bounds.top) : 0;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(this.w * ratio);
    const height = Math.round(this.h * ratio);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.c.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.sky = null;
  }

  burst(x) {
    if (this.reduced) return;
    const scale = platformMetrics(this.cell || 96).effectScale;
    this.particles.push({ kind: 'ring', x, life: 1 });
    for (let i = 0; i < 9; i++) {
      this.particles.push({
        kind: 'petal', x, y: 0, vx: (Math.random() - 0.5) * 100 * scale,
        vy: (-30 - Math.random() * 70) * scale, life: 1,
        color: ['#eed177', '#e1a098', '#99b581'][i % 3],
      });
    }
  }

  draw(game, dt, active) {
    const c = this.c;
    const w = this.w;
    const h = this.h;
    if (!w || !h) return;
    this.time += this.reduced ? 0 : dt;
    const t = this.time;
    const layout = sceneLayout(w, h, this.controlHeight, active, this.welcomeBottom);
    const { mobile, floor, base, cell, origin, platform, verticalCell } = layout;
    const effectScale = platform.effectScale;
    this.cell = cell;
    game.cellWidth = cell;
    game.verticalScale = verticalCell / cell;
    const view = trackedCameraView(game, layout);
    const changedView = !this.cameraLayout || this.cameraLayout.width !== w
      || this.cameraLayout.height !== h || this.cameraLayout.cell !== cell;
    if (!active || game.status === 'ready') { this.camera = 0; this.cameraGoal = view.goal; }
    else {
      if (changedView) {
        this.camera = reframeCamera(this.camera, view);
        this.cameraGoal = view.goal;
      }
      this.camera = followCamera(this.camera, view, dt, this.cameraGoal ?? view.goal);
    }
    this.cameraGoal = view.goal;
    this.cameraLayout = { width: w, height: h, cell };
    const px = value => origin + (value - 1 - this.camera) * cell;
    c.clearRect(0, 0, w, h);
    if (!this.sky) {
      this.sky = c.createLinearGradient(0, 0, 0, floor);
      this.sky.addColorStop(0, '#eff3df');
      this.sky.addColorStop(1, '#e3edcc');
    }
    c.fillStyle = this.sky;
    c.fillRect(0, 0, w, h);
    ellipse(c, w * 0.74, floor * 0.22, 31, 31, '#f5e4a8');
    ellipse(c, w * 0.74, floor * 0.22, 39, 39, '#f7eac539');
    const scenicCamera = this.reduced ? 0 : this.camera;
    for (let i = 0; i < 5; i++) {
      const x = ((i * w * 0.29 - scenicCamera * cell * 0.11 + t * 2) % (w + 170) + w + 170) % (w + 170) - 80;
      const y = floor * (0.16 + (i % 3) * 0.10);
      ellipse(c, x, y, 44, 9, '#fcfbedb0');
      ellipse(c, x - 13, y - 7, 21, 12, '#fcfbedb0');
      ellipse(c, x + 12, y - 9, 18, 14, '#fcfbedb0');
    }
    const off = scenicCamera * cell * 0.18;
    const hill = (offset, center, amplitude, wavelength, phase, color) => {
      const heightAt = x => floor * (center + amplitude * Math.sin((x + offset) / wavelength * TAU + phase));
      path(c, p => {
        p.moveTo(0, floor);
        p.lineTo(0, heightAt(0));
        const segments = Math.ceil(w / 10);
        for (let i = 1; i <= segments; i++) {
          const x = w * i / segments;
          p.lineTo(x, heightAt(x));
        }
        p.lineTo(w, floor);
        p.closePath();
      }, color);
    };
    hill(off, 0.64, 0.10, w * 1.3, 0.65, '#d4e2b9');
    hill(off * 0.6, 0.82, 0.075, w * 1.05, 2.8, '#bfce9d');
    hill(off * 0.3, 0.93, 0.035, w * 1.8, 3.7, '#b0c18c');
    for (let i = 0; i < 25; i++) {
      let x = (i * 61 - off * 0.7) % (w + 60);
      if (x < 0) x += w + 60;
      const y = floor - 8 - (Math.sin(i * 7) + 1) * 10;
      c.strokeStyle = '#94aa74';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(x - 3, y - 7);
      c.moveTo(x, y);
      c.lineTo(x + 4, y - 9);
      c.stroke();
      if (i % 4 === 0) flower(c, x + 10, y, 4, t);
    }
    const front = Math.max(...game.platforms.map(p => p.cell));
    if (active && game.status !== 'over') {
      for (let i = 1; i <= 2; i++) {
        const x = px(front + i);
        c.save();
        c.setLineDash([4 * effectScale, 5 * effectScale]);
        c.strokeStyle = front + i === game.target ? '#8e7947' : '#84966b90';
        c.lineWidth = 1.5;
        c.beginPath();
        c.roundRect(x - cell * 0.37, base, cell * 0.74, platform.height * 0.8, platform.radius * 0.8);
        c.stroke();
        c.restore();
        c.fillStyle = '#64774b';
        c.font = `${platform.ghostLabel}px Trebuchet MS`;
        c.textAlign = 'center';
        c.fillText('+' + i, x, base + platform.height * 0.4 + platform.ghostLabel * 0.34);
      }
    }
    if (active && game.phase === 'reveal' && game.status === 'playing' && !this.reduced) {
      const revealX = px(game.start);
      const shimmer = Math.sin(game.progress * Math.PI);
      c.save();
      c.globalAlpha = 0.2 + shimmer * 0.3;
      ellipse(c, revealX, base + 5 * effectScale, cell * (0.5 + shimmer * 0.12), 17 * effectScale, '#fff8ce');
      c.strokeStyle = '#fffbea';
      c.lineWidth = 1.5;
      for (let i = 0; i < 4; i++) {
        const angle = (i / 4 + game.progress * 0.04) * TAU;
        const sx = revealX + Math.cos(angle) * cell * 0.65;
        const sy = base - cell * 0.35 + Math.sin(angle) * cell * 0.42;
        const radius = (2 + shimmer * 2) * effectScale;
        c.beginPath();
        c.moveTo(sx - radius, sy);
        c.lineTo(sx + radius, sy);
        c.moveTo(sx, sy - radius);
        c.lineTo(sx, sy + radius);
        c.stroke();
      }
      c.restore();
    }
    for (const p of game.platforms) {
      const x = px(game.visualCell(p));
      const y = base - game.visualLift(p) * verticalCell;
      const pw = platform.width;
      const colors = p.number === 0 ? ['#d0e9e6', '#82aaa9', '#345d61']
        : p.number === 1 ? ['#d4e3ab', '#8ba76a', '#34472c']
        : p.number === 2 ? ['#f3cf86', '#c6a162', '#62461f']
          : ['#cfb8dd', '#a98bb9', '#543762'];
      ellipse(c, x, base + platform.shadowY, pw * 0.49, platform.shadowRadius, '#82965b25');
      c.fillStyle = colors[1];
      c.beginPath();
      c.roundRect(x - pw / 2, y, pw, platform.height, Math.min(platform.radius, pw / 3));
      c.fill();
      c.fillStyle = colors[0];
      c.beginPath();
      c.roundRect(x - pw / 2, y - 2, pw, platform.top, Math.min(platform.radius * 0.8, pw / 3));
      c.fill();
      c.fillStyle = '#ffffff60';
      c.beginPath();
      c.roundRect(x - pw / 2 + 5 * effectScale, y + effectScale, Math.max(1, pw - 10 * effectScale), 3 * effectScale, 1.5 * effectScale);
      c.fill();
      const badgeY = y + platform.height * 0.52;
      ellipse(c, x, badgeY, platform.badge, platform.badge, '#fffbedb8');
      c.fillStyle = colors[2];
      c.font = `bold ${platform.label}px Trebuchet MS`;
      c.textAlign = 'center';
      c.fillText(p.number === 0 ? '?' : p.number, x, badgeY + platform.label * 0.34);
    }
    const x = px(active ? game.position : 1);
    const size = active ? verticalCell * 0.77 : layout.idleSize;
    const progress = game.progress;
    const squash = !this.reduced && active && game.status === 'playing' ? Math.max(0, 1 - progress / 0.22) : 0;
    const stretch = !this.reduced && active && game.status === 'playing' ? Math.sin(progress * Math.PI) * 0.06 : 0;
    const pose = {
      scaleX: 1 + squash * 0.14 - stretch * 0.5,
      scaleY: 1 - squash * 0.14 + stretch,
      tilt: this.reduced ? 0 : active ? Math.sin(progress * TAU) * 0.035 : Math.sin(t * 1.7) * 0.045,
    };
    const arc = arcHeight(game.distance, game.phase, verticalCell);
    let y = base - size * 0.47 * pose.scaleY;
    if (!active) y -= Math.abs(Math.sin(t * 2.3)) * layout.idleBounce;
    else if (game.status === 'over') {
      this.fall += dt;
      y += this.fall * this.fall * 500;
    } else {
      this.fall = 0;
      y -= Math.sin(progress * Math.PI) * arc;
    }
    if (active && game.phase !== 'reveal' && game.status === 'playing' && !this.reduced && progress > 0.08 && progress < 0.88) {
      c.strokeStyle = '#fffbed';
      c.lineWidth = 2;
      c.lineCap = 'round';
      c.globalAlpha = 0.4 * Math.sin(progress * Math.PI);
      for (let i = 1; i <= 3; i++) {
        const trail = Math.max(0, progress - i * 0.035);
        const tx = px(game.start + game.distance * trail) - size * 0.55;
        const ty = base - size * 0.4 - Math.sin(trail * Math.PI) * arc + i * 4;
        c.beginPath();
        c.moveTo(tx - 6, ty);
        c.lineTo(tx, ty);
        c.stroke();
      }
      c.globalAlpha = 1;
    }
    if (y < h + 100) {
      ellipse(c, x, base + platform.shadowY - 2, Math.max(7, size * 0.32 - (base - y) * 0.04), platform.shadowRadius, '#72894e25');
      potato(c, x, y, size, game.status === 'over' ? this.fall * 2 : t, game.status === 'over', pose);
    }
    if (!active && !mobile) {
      c.save();
      c.translate(w * 0.34, base - 115);
      c.rotate(0.12);
      c.fillStyle = '#849467';
      c.font = 'italic 14px Georgia';
      c.fillText(this.caption || 'a very good spud', 0, 0);
      c.strokeStyle = '#97a57a';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(0, 9);
      c.quadraticCurveTo(-5, 36, -35, 45);
      c.stroke();
      c.beginPath();
      c.moveTo(-29, 36);
      c.lineTo(-35, 45);
      c.lineTo(-25, 47);
      c.stroke();
      c.restore();
    }
    if (this.reduced) this.particles.length = 0;
    this.particles = this.particles.filter(p => p.life > 0);
    for (const p of this.particles) {
      p.life -= dt * (p.kind === 'ring' ? 3.5 : 2);
      c.globalAlpha = Math.max(0, p.life);
      if (p.kind === 'ring') {
        c.strokeStyle = '#fff8cf';
        c.lineWidth = 2;
        c.beginPath();
        c.ellipse(px(p.x), base + 3 * effectScale, cell * (0.32 + (1 - p.life) * 0.32), (5 + (1 - p.life) * 4) * effectScale, 0, 0, TAU);
        c.stroke();
      } else {
        p.x += p.vx * dt / cell;
        p.y += p.vy * dt;
        p.vy += 180 * dt;
        ellipse(c, px(p.x), base + p.y, 2.5 * effectScale, 2.5 * effectScale, p.color);
      }
    }
    c.globalAlpha = 1;
  }
}
