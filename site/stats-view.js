import { formatNumber, normalizeLocale } from './i18n.js?v=1.4.1';
import { statsText } from './stats-copy.js?v=1.4.1';

export const SCORE_RANGES = Object.freeze(['0–4', '5–9', '10–19', '20–39', '40–79', '80–159', '160–319', '320+']);
const isCount = value => Number.isSafeInteger(value) && value >= 0;

export function normalizeSnapshot(value) {
  if (!value || !isCount(value.players) || !isCount(value.runs) || value.players > value.runs
      || !Array.isArray(value.bins) || value.bins.length !== SCORE_RANGES.length || !value.bins.every(isCount)
      || value.bins.reduce((sum, count) => sum + count, 0) !== value.runs
      || typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt))) return null;
  return { players: value.players, runs: value.runs, bins: [...value.bins], updatedAt: value.updatedAt };
}

export function distributionPoints(bins) {
  const maximum = Math.max(1, ...bins);
  return bins.map((count, index) => ({ x: 22 + index * 40, y: 70 - count / maximum * 53, count }));
}

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function svgElement(tag, attributes) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

export class StatsView {
  constructor({ getLocale = () => 'en' } = {}) {
    this.getLocale = getLocale;
    this.snapshot = null;
    this.status = 'loading';
    this.stale = false;
    this.localize();
  }

  render(value, { stale = false } = {}) {
    const snapshot = normalizeSnapshot(value);
    if (!snapshot) { this.setStatus('unavailable'); return; }
    this.snapshot = snapshot;
    this.status = 'ready';
    this.stale = stale;
    this.localize();
  }

  setStatus(status) {
    this.status = status === 'loading' ? 'loading' : 'unavailable';
    if (this.snapshot) this.stale = true;
    this.localize();
  }

  localize() {
    const locale = normalizeLocale(this.getLocale()) || 'en';
    const text = (key, params) => statsText(locale, key, params);
    document.querySelectorAll('[data-stats-copy]').forEach(node => {
      node.textContent = text(node.dataset.statsCopy);
    });
    for (const id of ['home-stats', 'about-stats']) {
      const root = document.getElementById(id);
      if (!root) continue;
      const compact = id === 'home-stats';
      const heading = element(compact ? 'h2' : 'h3', 'stats-heading', text(compact ? 'title' : 'aboutTitle'));
      heading.id = `${id}-title`;
      root.setAttribute('aria-labelledby', heading.id);
      const sprout = element('span', 'stats-sprout', '✿');
      sprout.setAttribute('aria-hidden', 'true');
      heading.prepend(sprout);
      const summary = element('div', 'stats-summary');
      const counts = element('dl', 'stats-counts');
      for (const key of ['players', 'runs']) {
        const item = element('div');
        item.append(element('dt', '', text(key)), element('dd', '', this.snapshot ? formatNumber(locale, this.snapshot[key]) : '—'));
        counts.append(item);
      }
      summary.append(heading, counts);
      const content = element('div', 'stats-content');
      if (this.snapshot && this.snapshot.runs > 0) {
        const figure = element('figure', 'stats-figure');
        const graphTitle = element('figcaption', 'stats-chart-title', text('distribution'));
        const svg = svgElement('svg', { viewBox: '0 0 324 96', 'aria-hidden': 'true', focusable: 'false' });
        svg.append(svgElement('line', { x1: 10, y1: 70, x2: 314, y2: 70, class: 'stats-baseline' }));
        const points = distributionPoints(this.snapshot.bins);
        for (const { x, y, count } of points) {
          if (count > 0) svg.append(svgElement('rect', { x: x - 11, y, width: 22, height: 70 - y, rx: 4, class: 'stats-bar' }));
        }
        svg.append(svgElement('polyline', { points: points.map(({ x, y }) => `${x},${y}`).join(' '), class: 'stats-curve' }));
        points.forEach(({ x, y }, index) => {
          svg.append(svgElement('circle', { cx: x, cy: y, r: 2.8, class: 'stats-point' }));
          const label = svgElement('text', { x, y: 88, 'text-anchor': 'middle', class: 'stats-axis' });
          label.textContent = SCORE_RANGES[index];
          svg.append(label);
        });
        figure.append(graphTitle, svg);
        const details = element('details', 'stats-details');
        details.append(element('summary', '', text('details')));
        const table = element('table');
        const caption = element('caption', '', text('scores'));
        const head = element('thead');
        const row = element('tr');
        for (const key of ['scores', 'games']) {
          const cell = element('th', '', text(key));
          cell.scope = 'col';
          row.append(cell);
        }
        head.append(row);
        const body = element('tbody');
        this.snapshot.bins.forEach((count, index) => {
          const row = element('tr');
          const label = element('th', '', SCORE_RANGES[index]);
          label.scope = 'row';
          row.append(label, element('td', '', formatNumber(locale, count)));
          body.append(row);
        });
        table.append(caption, head, body);
        details.append(table, element('p', 'stats-explanation', text('caption')), element('p', 'stats-explanation', text('estimate')));
        content.append(figure, details);
      } else {
        const message = this.snapshot ? 'empty' : this.status;
        content.append(element('p', 'stats-empty', text(message)));
        if (this.snapshot) content.append(element('p', 'stats-explanation', text('estimate')));
      }
      const shell = element('div', 'stats-layout');
      shell.append(summary, content);
      root.replaceChildren(shell);
      if (this.snapshot) {
        const time = new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(this.snapshot.updatedAt));
        const updated = element('p', 'stats-updated', text(this.stale ? 'stale' : 'updated', { time }));
        root.append(updated);
      }
    }
  }
}
