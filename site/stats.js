const KEY = 'poteto:stats';
const INTERVAL = 60000, READ_INTERVAL = 900000;
const uuid = () => crypto.randomUUID();
function safeStorage() { try { return globalThis.localStorage; } catch { return null; } }
export function validSnapshot(data) {
  return data && Number.isSafeInteger(data.players) && data.players >= 0
    && Number.isSafeInteger(data.runs) && data.runs >= data.players
    && Array.isArray(data.bins) && data.bins.length === 8
    && data.bins.every(n => Number.isSafeInteger(n) && n >= 0)
    && data.bins.reduce((a,b)=>a+b,0) === data.runs && Number.isFinite(Date.parse(data.updatedAt));
}
function read(storage, key, fallback) { try { return JSON.parse(storage.getItem(key)) ?? fallback; } catch { return fallback; } }
function write(storage, key, value) { try { storage.setItem(key,JSON.stringify(value)); } catch { /* Optional storage. */ } }
export class GameStats {
  constructor({ view, storage = safeStorage(), fetcher = globalThis.fetch.bind(globalThis), now = Date.now,
    verify = verifyBrowser, enabled = true } = {}) {
    this.view=view; this.storage=storage; this.fetcher=fetcher; this.now=now; this.verify=verify;
    this.enabled=enabled; this.destroyed=false; this.queue=[]; this.busy=false; this.lastRead=0; this.nextWrite=0; this.timer=null;
    this.player=read(storage,KEY+':player',null);
    if (!/^[a-f0-9-]{36}$/i.test(this.player || '')) { this.player=uuid(); if(enabled)write(storage,KEY+':player',this.player); }
    const cached=read(storage,KEY+':snapshot',null);
    if(validSnapshot(cached?.data)) { this.snapshot=cached.data; this.fetchedAt=cached.at; this.view?.render(this.snapshot,{stale:now()-cached.at>READ_INTERVAL}); }
  }
  async refresh() {
    if(this.reading || this.now()-this.lastRead<READ_INTERVAL) return;
    if(this.snapshot && this.now()-this.fetchedAt<READ_INTERVAL) return;
    this.lastRead=this.now(); this.reading=true;
    try {
      const response=await this.fetcher('/api/stats',{credentials:'omit',signal:AbortSignal.timeout(5000)});
      const data=await response.json();
      if(!response.ok || !validSnapshot(data)) throw Error('unavailable');
      this.snapshot=data; this.fetchedAt=this.now();
      write(this.storage,KEY+':snapshot',{data,at:this.fetchedAt}); this.view?.render(data);
    } catch {
      if(this.snapshot) this.view?.render(this.snapshot,{stale:true}); else this.view?.setStatus('unavailable');
    } finally { this.reading=false; }
  }
  setEnabled(value) {
    this.enabled=Boolean(value);
    if(!this.enabled) { this.queue=[]; clearTimeout(this.timer); this.timer=null; this.abort?.abort(); removeVerification();
      try { this.storage.removeItem(KEY+':player'); } catch {} }
    else { write(this.storage,KEY+':player',this.player); }
  }
  completed(score, ms) {
    if(this.destroyed || !this.enabled || !Number.isInteger(score) || score<0 || score>100000
      || !Number.isFinite(ms) || ms<300 || ms>86400000 || score>Math.floor(ms/400)+2) return;
    // Keep a bounded in-memory queue; closing the page never starts a last-second request.
    if(this.queue.length<20) this.queue.push({score,ms:Math.round(ms)});
    this.schedule();
  }
  schedule() {
    if(this.destroyed || this.timer || !this.enabled || this.busy || !this.queue.length) return;
    const stored=Number(read(this.storage,KEY+':nextWrite',0))||0;
    const delay=Math.max(1500,Math.max(this.nextWrite,Math.min(stored,this.now()+3600000))-this.now());
    this.timer=setTimeout(()=>{this.timer=null;void this.flush();},delay);
  }
  async flush() {
    if(this.destroyed || this.busy || !this.enabled || !this.queue.length || globalThis.document?.hidden) return;
    const stored=Number(read(this.storage,KEY+':nextWrite',0))||0;
    if(this.now()<Math.max(this.nextWrite,Math.min(stored,this.now()+3600000))) { this.schedule(); return; }
    if(!this.snapshot?.sitekey) { this.queue=[]; return; }
    this.busy=true;
    this.nextWrite=this.now()+INTERVAL;
    write(this.storage,KEY+':nextWrite',this.nextWrite);
    const runs=this.queue.splice(0,20), batch=uuid();
    const controller=new AbortController();
    this.abort=controller;
    try {
      const token=await this.verify(this.snapshot.sitekey,batch,controller.signal);
      if(this.destroyed || !this.enabled || controller.signal.aborted || !token) throw Error('unavailable');
      const response=await this.fetcher('/api/stats/submit',{method:'POST',credentials:'omit',
        headers:{'Content-Type':'application/json'},body:JSON.stringify({player:this.player,batch,runs,token}),
        signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
      if(!response.ok) throw Error('unavailable');
      this.nextWrite=this.now()+INTERVAL+2000;
      write(this.storage,KEY+':nextWrite',this.nextWrite);
    } catch {
      // Never retry an ambiguous write: a missing count is safer than a duplicate.
      this.nextWrite=this.now()+3600000;
      write(this.storage,KEY+':nextWrite',this.nextWrite);
    } finally { this.busy=false; this.abort=null; this.schedule(); }
  }
  resume() { this.destroyed=false; }
  destroy() { this.destroyed=true; this.queue=[]; clearTimeout(this.timer); this.timer=null; this.abort?.abort(); removeVerification(); }
}
let scriptPromise, widget, container;
function removeVerification() {
  try { if(widget!==undefined) globalThis.turnstile?.remove(widget); } catch {}
  widget=undefined; container?.remove(); container=null;
}
async function verifyBrowser(sitekey,batch,signal) {
  if(location.hostname!=='poteto.cc' || signal.aborted) return null;
  if(!scriptPromise) scriptPromise=new Promise((resolve,reject)=>{
    const script=document.createElement('script');
    script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async=true; script.onload=resolve; script.onerror=reject; document.head.append(script);
    setTimeout(()=>reject(Error('timeout')),10000);
  });
  await scriptPromise;
  if(signal.aborted) return null;
  return new Promise(resolve=>{
    let settled=false;
    const done=token=>{if(settled)return;settled=true;clearTimeout(timer);signal.removeEventListener('abort',cancel);removeVerification();resolve(token);};
    const cancel=()=>done(null), timer=setTimeout(cancel,120000);
    signal.addEventListener('abort',cancel,{once:true});
    removeVerification(); container=document.createElement('div'); container.className='stats-verification';
    document.querySelector('.under-game').after(container);
    try { widget=globalThis.turnstile.render(container,{sitekey,action:'stats',cData:batch,
      appearance:'interaction-only',execution:'execute',retry:'never','refresh-expired':'never',
      callback:done,'error-callback':()=>{done(null);return true;},'timeout-callback':cancel,
      'expired-callback':cancel}); globalThis.turnstile.execute(widget); }
    catch { done(null); }
  });
}
