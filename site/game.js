export class Relay {
  constructor(random = Math.random) { this.random = random; this.reset(); }
  reset() {
    this.platforms = [{id:0, cell:0, from:0, number:1, motion:1}, {id:1, cell:1, from:1, number:1, motion:1}];
    this.status = 'ready'; this.score = 0; this.landings = 0; this.moves = 0;
    this.position = 1; this.start = 1; this.target = 2; this.progress = 0; this.distance = 1; this.elapsed = 0;
  }
  nextNumber() {
    if (this.landings < 3) return 1;
    const n = this.random();
    return this.landings >= 16 && n > 0.88 ? 3 : n < 0.5 ? 1 : 2;
  }
  duration() { return [0, 1.2, 1.4, 2.05][this.distance]; }
  begin(platform) { this.start = platform.cell; this.distance = platform.number; this.target = this.start + this.distance; this.progress = 0; }
  move(steps) {
    if (![1,2].includes(steps) || !['ready','playing'].includes(this.status)) return false;
    const [rear, front] = [...this.platforms].sort((a,b)=>a.cell-b.cell);
    rear.from = this.visualCell(rear); rear.cell = front.cell + steps; rear.motion = 0; rear.number = this.nextNumber();
    this.moves++;
    if (this.status === 'ready') { this.status = 'playing'; this.begin(front); }
    return true;
  }
  visualCell(p) { const t=1-Math.pow(1-p.motion,3); return p.from+(p.cell-p.from)*t; }
  tick(dt) {
    if (this.status !== 'playing') return null;
    dt = Math.min(Math.max(dt,0),0.05); this.elapsed += dt;
    this.platforms.forEach(p=> { p.motion = Math.min(1,p.motion+dt/0.24); });
    this.progress = Math.min(1,this.progress + dt/this.duration());
    this.position = this.start+(this.target-this.start)*this.progress;
    if (this.progress < 1) return null;
    const landing = this.platforms.find(p=>p.cell===this.target && Math.abs(this.visualCell(p)-this.target)<0.16);
    if (!landing) { this.status='over'; return 'miss'; }
    this.landings++; this.score += 1 + (this.landings % 5 === 0 ? 1 : 0); this.begin(landing); return 'land';
  }
}
export function shareText(score) { return `I bounced to ${score} on Poteto! Can you go further?`; }
