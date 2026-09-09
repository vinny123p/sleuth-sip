/* Sleuth & Sip — shared client logic (host + phone) */
'use strict';

const $ = (sel, el) => (el || document).querySelector(sel);

function codeFromPath(prefix) {
  const m = location.pathname.match(new RegExp('^/' + prefix + '/([A-Za-z0-9]+)'));
  return m ? m[1].toUpperCase() : null;
}
const qs = new URLSearchParams(location.search);

async function api(path, body) {
  const res = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'request failed');
  return data;
}

// ---------------- speech + ringtone ----------------
let ringOsc = null;
function startRing() {
  stopRing();
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 440; o.type = 'sine';
    let on = true;
    const iv = setInterval(() => { on = !on; g.gain.value = on ? 0.15 : 0; }, 400);
    o.start();
    ringOsc = { stop() { clearInterval(iv); try { o.stop(); ctx.close(); } catch (e) {} } };
  } catch (e) {}
}
function stopRing() { if (ringOsc) { ringOsc.stop(); ringOsc = null; } }
function speak(text) {
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 0.95; u.pitch = 0.8;
    speechSynthesis.speak(u);
  } catch (e) {}
}

// ---------------- block rendering ----------------
function el(tag, cls, text) {
  const d = document.createElement(tag);
  if (cls) d.className = cls;
  if (text !== undefined) d.textContent = text;
  return d;
}

function renderBlocks(container, blocks, ctx) {
  container.innerHTML = '';
  let hasCall = false;
  for (const b of blocks) {
    switch (b.t) {
      case 'title': container.appendChild(el('h1', 'b-title', b.text)); break;
      case 'text': { const p = el('p', 'b-text'); p.style.whiteSpace = 'pre-line'; p.textContent = b.text; container.appendChild(p); break; }
      case 'trans': {
        const d = el('div', 'b-trans');
        d.appendChild(el('div', 'b-trans-from', '▸ ' + b.from));
        const p = el('p', 'b-trans-text'); p.style.whiteSpace = 'pre-line'; p.textContent = b.text;
        d.appendChild(p); container.appendChild(d); break;
      }
      case 'secret': { const d = el('div', 'b-secret'); const p = el('p'); p.style.whiteSpace = 'pre-line'; p.textContent = b.text; d.appendChild(p); container.appendChild(d); break; }
      case 'do': container.appendChild(el('div', 'b-do', '◈ ' + b.text)); break;
      case 'status': container.appendChild(el('div', 'b-status', b.text)); break;
      case 'code': {
        const d = el('div', 'b-codewrap');
        d.appendChild(el('div', 'b-codelabel', 'ROOM CODE'));
        d.appendChild(el('div', 'b-code', b.text));
        container.appendChild(d); break;
      }
      case 'qr': {
        const d = el('div', 'b-qr');
        const img = document.createElement('img'); img.src = b.text; img.alt = 'Join QR code';
        d.appendChild(img); d.appendChild(el('div', 'b-status', 'Scan to join from your phone'));
        container.appendChild(d); break;
      }
      case 'timer': {
        const d = el('div', 'b-timer');
        d.appendChild(el('span', 'b-timer-label', b.label + ' '));
        const v = el('span', 'b-timer-val', '—');
        v.dataset.timer = '1'; d.appendChild(v);
        container.appendChild(d); break;
      }
      case 'choices': {
        const d = el('div', 'b-choices');
        if (b.prompt) d.appendChild(el('div', 'b-prompt', b.prompt));
        for (const o of b.options) {
          const btn = el('button', 'btn choice', o.label);
          btn.onclick = () => { btn.disabled = true; ctx.act(b.id, o.id, btn); };
          d.appendChild(btn);
        }
        container.appendChild(d); break;
      }
      case 'typed': {
        const d = el('div', 'b-typed');
        if (b.prompt) d.appendChild(el('div', 'b-prompt', b.prompt));
        const row = el('div', 'b-typed-row');
        const inp = document.createElement('input');
        inp.placeholder = b.placeholder || ''; inp.autocomplete = 'off'; inp.className = 'tin';
        const btn = el('button', 'btn', 'Submit');
        const err = el('div', 'b-err');
        const go = () => {
          btn.disabled = true; err.textContent = '';
          ctx.act(b.id, inp.value, btn).catch((e) => { err.textContent = e.message; btn.disabled = false; });
        };
        btn.onclick = go;
        inp.onkeydown = (e) => { if (e.key === 'Enter') go(); };
        row.appendChild(inp); row.appendChild(btn);
        d.appendChild(row); d.appendChild(err);
        container.appendChild(d); break;
      }
      case 'go': {
        const btn = el('button', 'btn primary' + (b.subtle ? ' subtle' : ''), b.label);
        btn.onclick = () => { btn.disabled = true; ctx.hostGo(b.id, btn); };
        container.appendChild(btn); break;
      }
      case 'call': {
        hasCall = true;
        const ov = el('div', 'call-overlay');
        ov.appendChild(el('div', 'call-from', b.from));
        ov.appendChild(el('div', 'call-line', b.line));
        const row = el('div', 'call-row');
        const ans = el('button', 'btn call-ans', 'Answer');
        const dec = el('button', 'btn call-dec', 'Decline');
        ans.onclick = () => { stopRing(); ctx.act(b.id, '__answer'); };
        dec.onclick = () => { stopRing(); ctx.act(b.id, '__decline'); };
        row.appendChild(dec); row.appendChild(ans);
        ov.appendChild(row); container.appendChild(ov);
        startRing();
        break;
      }
      case 'say': {
        const btn = el('button', 'btn', '▶ Play recording');
        btn.onclick = () => speak(b.text);
        container.appendChild(btn); break;
      }
      case 'teams': {
        const d = el('div', 'b-teams');
        for (const tm of b.teams || []) {
          const c = el('div', 'b-teamchip');
          const dot = el('span', 'b-dot'); dot.style.background = tm.color || '#888';
          c.appendChild(dot);
          const nm = el('span', 'b-teamname', tm.name);
          c.appendChild(nm);
          const meta = [];
          if (tm.players !== undefined) meta.push(tm.players + ' player' + (tm.players === 1 ? '' : 's'));
          if (tm.ready) meta.push(tm.ready + '✓');
          if (tm.note) meta.push(tm.note);
          if (meta.length) c.appendChild(el('span', 'b-teammeta', meta.join(' · ')));
          d.appendChild(c);
        }
        container.appendChild(d); break;
      }
      case 'board': {
        const d = el('div', 'b-board');
        const entries = b.entries || [];
        if (!entries.length) d.appendChild(el('div', 'b-status', 'No findings filed yet.'));
        for (const e of entries) {
          const en = el('div', 'b-board-entry');
          const head = el('div', 'b-board-head');
          const dot = el('span', 'b-dot'); dot.style.background = e.color || '#888';
          head.appendChild(dot);
          head.appendChild(el('span', 'b-teamname', e.team));
          en.appendChild(head);
          const tx = el('p', 'b-board-text'); tx.style.whiteSpace = 'pre-line'; tx.textContent = '“' + e.text + '”';
          en.appendChild(tx);
          if (e.by) en.appendChild(el('div', 'b-board-by', '— filed by ' + e.by));
          d.appendChild(en);
        }
        container.appendChild(d); break;
      }
      case 'seals': {
        const d = el('div', 'b-seals');
        for (const s of b.slots || []) {
          const slot = el('div', 'b-seal-slot' + (s.word ? ' filled' : ''));
          const dot = el('span', 'b-dot'); dot.style.background = s.color || '#888';
          slot.appendChild(dot);
          slot.appendChild(el('span', 'b-teamname', s.team));
          slot.appendChild(el('span', 'b-seal-word', s.word ? s.word : '···'));
          d.appendChild(slot);
        }
        container.appendChild(d); break;
      }
      case 'tally': {
        const d = el('div', 'b-tally');
        const counts = b.counts || {};
        const total = Math.max(1, b.total || 0);
        const labels = { release: 'RELEASE', retain: 'RETAIN', erase: 'ERASE', unlock: 'UNLOCK' };
        for (const k of Object.keys(labels)) {
          const n = counts[k] || 0;
          const row = el('div', 'b-tally-row');
          row.appendChild(el('span', 'b-tally-label', labels[k]));
          const barw = el('div', 'b-tally-barwrap');
          const bar = el('div', 'b-tally-bar'); bar.style.width = Math.round((n / total) * 100) + '%';
          barw.appendChild(bar); row.appendChild(barw);
          row.appendChild(el('span', 'b-tally-n', String(n)));
          d.appendChild(row);
        }
        container.appendChild(d); break;
      }
    }
  }
  if (!hasCall) stopRing();
  return hasCall;
}

// ---------------- timers ----------------
let timerIv = null;
function armTimers(state) {
  if (timerIv) clearInterval(timerIv);
  if (!state.deadline) return;
  const skew = Date.now() - state.now;
  timerIv = setInterval(() => {
    const left = Math.max(0, state.deadline - (Date.now() - skew));
    document.querySelectorAll('[data-timer]').forEach((v) => {
      const s = Math.ceil(left / 1000);
      v.textContent = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
      if (left <= 10000) v.classList.add('urgent');
    });
    if (left <= 0) clearInterval(timerIv);
  }, 500);
}

// ---------------- app boot ----------------
window.UNKNOWN = { $, api, codeFromPath, qs, renderBlocks, armTimers, speak, stopRing };
