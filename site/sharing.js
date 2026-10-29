import { renderPicture, FORMATS } from './pictures.js?v=1.3.0';
import { t, formatNumber, localeUrl } from './i18n.js?v=1.3.0';

export function canShareFile(navigator, file) {
  try {
    return Boolean(file && typeof navigator.share === 'function'
      && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] }));
  } catch { return false; }
}

export async function shareAsset({ navigator, file, title, text, url, linkOnly = false }) {
  try {
    // Call the native API before yielding so the click's user activation is preserved.
    if (!linkOnly && canShareFile(navigator, file)) {
      await navigator.share({ files: [file], title, text: `${text} ${url}` });
      return 'image';
    }
    if (typeof navigator.share === 'function' && !linkOnly) {
      await navigator.share({ title, text, url });
      return 'link';
    }
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(`${text} ${url}`);
      return 'copied';
    }
    return 'manual';
  } catch (error) {
    if (error.name === 'AbortError') return 'cancelled';
    throw error;
  }
}

export function pictureName(kind, format, locale, score) {
  const cleanKind = ['score', 'moment', 'poster'].includes(kind) ? kind : 'poster';
  const cleanFormat = ['square', 'story', 'wide'].includes(format) ? format : 'square';
  const cleanLocale = /^[A-Za-z]{2}(?:-[A-Za-z]{2,4})?$/.test(locale) ? locale : 'en';
  const points = Number.isFinite(Number(score)) ? Math.max(0, Math.floor(Number(score))) : 0;
  return `poteto-${cleanKind}${cleanKind === 'score' ? '-' + points : ''}-${cleanLocale}-${cleanFormat}.png`;
}

export class PictureSharing {
  constructor({ getContext, getLocale }) {
    this.getContext = getContext;
    this.getLocale = getLocale;
    this.dialog = document.getElementById('sharing');
    this.preview = document.getElementById('picture-preview');
    this.loading = document.getElementById('picture-loading');
    this.stage = document.getElementById('picture-stage');
    this.download = document.getElementById('picture-download');
    this.shareButton = document.getElementById('picture-share');
    this.copyButton = document.getElementById('picture-copy');
    this.status = document.getElementById('picture-status');
    this.format = document.getElementById('picture-format');
    this.link = document.getElementById('picture-link');
    this.radios = [...this.dialog.querySelectorAll('input[name="picture-kind"]')];
    this.generation = 0;
    this.url = null;
    this.file = null;
    this.busy = false;
    this.retired = new Map();
    document.getElementById('close-sharing').addEventListener('click', () => this.dialog.close());
    this.dialog.addEventListener('close', () => this.clear());
    this.dialog.addEventListener('click', event => {
      if (event.target !== this.dialog) return;
      const box = this.dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) this.dialog.close();
    });
    this.radios.forEach(radio => radio.addEventListener('change', () => this.build()));
    this.format.addEventListener('change', () => this.build());
    this.download.addEventListener('click', event => {
      if (!this.file) { event.preventDefault(); return; }
      this.status.textContent = this.translate('downloadStarted');
    });
    this.shareButton.addEventListener('click', () => this.share(false));
    this.copyButton.addEventListener('click', () => this.share(true));
    window.addEventListener('pagehide', () => {
      if (this.dialog.open) this.dialog.close();
      this.clear();
      for (const [url, timer] of this.retired) { clearTimeout(timer); URL.revokeObjectURL(url); }
      this.retired.clear();
    });
  }

  translate(key, params) { return t(this.locale || this.getLocale(), key, params); }
  localize() {
    const previous = this.locale;
    this.locale = this.getLocale();
    for (const option of this.format.options) {
      const format = FORMATS.find(item => item.id === option.value);
      option.textContent = `${this.translate('format' + option.value[0].toUpperCase() + option.value.slice(1))} · ${format.width} × ${format.height}`;
    }
    if (this.dialog.open && previous !== this.locale) this.build();
  }
  open(kind = 'poster') {
    if (this.dialog.open) return;
    this.locale = this.getLocale();
    this.context = this.getContext();
    this.kind = ['score', 'moment', 'poster'].includes(kind) ? kind : 'poster';
    this.radios.forEach(radio => { radio.checked = radio.value === this.kind; });
    this.link.hidden = true;
    this.status.textContent = '';
    this.localize();
    this.dialog.showModal();
    this.build();
  }
  retire(url) {
    if (!url || this.retired.has(url)) return;
    // Allow an already-started browser download to finish after a preview changes.
    const timer = setTimeout(() => { URL.revokeObjectURL(url); this.retired.delete(url); }, 60000);
    this.retired.set(url, timer);
  }
  clear() {
    this.generation++;
    this.retire(this.url);
    this.url = null;
    this.file = null;
    this.context = null;
    this.preview.removeAttribute('src');
    this.preview.hidden = true;
    this.download.removeAttribute('href');
    this.download.setAttribute('aria-disabled', 'true');
    this.download.tabIndex = -1;
    this.shareButton.disabled = true;
  }
  async build() {
    const generation = ++this.generation;
    const context = this.context;
    if (!context) return;
    this.file = null;
    this.download.removeAttribute('href');
    this.download.setAttribute('aria-disabled', 'true');
    this.download.tabIndex = -1;
    this.shareButton.disabled = true;
    this.preview.hidden = true;
    this.loading.hidden = false;
    this.stage.setAttribute('aria-busy', 'true');
    this.status.textContent = '';
    this.link.hidden = true;
    const kind = this.radios.find(radio => radio.checked)?.value || 'poster';
    const format = this.format.value;
    this.kind = kind;
    try {
      if (document.fonts?.ready) await document.fonts.ready;
      if (generation !== this.generation) return;
      const copy = {
        heroFirst: this.translate('heroFirst'), heroSecond: this.translate('heroSecond'),
        tagline: this.translate('tagline'), scoreLabel: this.translate('cardScoreLabel'),
        scoreUnit: this.translate('cardScoreUnit'), bestLabel: this.translate('cardRecordLabel'),
        momentLabel: this.translate('cardMomentLabel'), posterLabel: this.translate('cardPosterLabel'),
        footer: this.translate('cardFooter'),
      };
      const canvas = renderPicture({
        ...context, kind, format, locale: this.locale, copy,
        scoreText: formatNumber(this.locale, context.score),
        bestText: formatNumber(this.locale, context.best),
        landingsText: formatNumber(this.locale, context.landings),
      });
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (generation !== this.generation || !this.dialog.open) return;
      if (!blob) throw new Error('Empty image');
      this.retire(this.url);
      this.url = URL.createObjectURL(blob);
      this.kind = kind;
      this.file = new File([blob], pictureName(kind, format, this.locale, context.score), { type: 'image/png' });
      this.preview.src = this.url;
      this.preview.alt = this.translate('previewAlt');
      this.preview.width = canvas.width;
      this.preview.height = canvas.height;
      if (this.preview.decode) await this.preview.decode();
      if (generation !== this.generation || !this.dialog.open) return;
      this.preview.hidden = false;
      this.loading.hidden = true;
      this.stage.setAttribute('aria-busy', 'false');
      this.download.href = this.url;
      this.download.download = this.file.name;
      this.download.setAttribute('aria-disabled', 'false');
      this.download.tabIndex = 0;
      this.shareButton.textContent = this.translate(canShareFile(navigator, this.file) ? 'shareImage' : navigator.share ? 'shareLink' : 'copyLink');
      this.shareButton.disabled = false;
      this.status.textContent = this.translate('imageReady');
    } catch {
      if (generation !== this.generation) return;
      this.loading.hidden = true;
      this.stage.setAttribute('aria-busy', 'false');
      this.status.textContent = this.translate('imageError');
    }
  }
  async share(linkOnly) {
    if (this.busy) return;
    this.busy = true;
    const locale = this.locale;
    const text = this.kind === 'poster' ? this.translate('shareInvite')
      : this.translate('shareScoreText', { score: formatNumber(locale, this.context?.score || 0) });
    try {
      const outcome = await shareAsset({ navigator, file: this.file, title: this.translate('pageTitle'), text, url: localeUrl(locale), linkOnly });
      if (outcome === 'cancelled') return;
      if (outcome === 'manual') this.manualLink(text);
      else this.status.textContent = this.translate(outcome === 'image' ? 'shareFileDone' : outcome === 'copied' ? 'copied' : 'imageReady');
    } catch {
      if (linkOnly) this.manualLink(text);
      else this.status.textContent = this.translate('shareError');
    } finally { this.busy = false; }
  }
  manualLink(text) {
    this.link.value = `${text} ${localeUrl(this.locale)}`;
    this.link.hidden = false;
    this.link.focus();
    this.link.select();
    this.status.textContent = this.translate('copyFallback');
  }
}
