// Sleuth & Sip — prototype server
// Pure Node. In-memory rooms, polling sync, deterministic narrative engine.
// Run: node server.js   (then open the printed URL on the shared screen)

import http from 'http';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import QRCode from 'qrcode';
import { EPISODE, award, clear, clearanceLevel, kitPages } from './episode.js';
import { ENSEMBLE, DOSSIERS, teamsOf, teamOf, nonEmptyTeams, ensembleKitPages, ensembleFixtureFor, ensembleEndingPreset } from './ensemble.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;
const POLL_HINT_MS = 1500;

const rooms = new Map();
const OFFRECORD_NODES = new Set(['private-exchange', 'investigation', 'final-authorization']);

// ------------------------------------------------------------ helpers
const rid = () => Math.random().toString(36).slice(2, 10);
// Jackbox-style 4-letter room codes: unambiguous letters only (no I, L, O),
// with a small blocklist so a room never gets an unfortunate code.
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_BLOCKLIST = new Set(['FUCK', 'SHIT', 'DAMN', 'HELL', 'CUNT', 'COCK', 'DICK', 'PISS', 'TITS', 'NAZI', 'KKK', 'FAG']);
function roomCode() {
  let c;
  do {
    c = Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join('');
  } while (rooms.has(c) || CODE_BLOCKLIST.has(c));
  return c;
}
function lanIp() {
  for (const ifs of Object.values(os.networkInterfaces())) {
    for (const i of ifs || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  }
  return 'localhost';
}
const LAN = lanIp();
const PUBLIC = (process.env.BASE_URL || '').replace(/\/$/, '');
const baseUrl = PUBLIC || `http://${LAN}:${PORT}`;
const send = (res, code, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(code, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
};
const parseBody = (req) => new Promise((resolve) => {
  let b = '';
  req.on('data', (c) => { b += c; if (b.length > 1e6) req.destroy(); });
  req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch { resolve({}); } });
});
function bump(r) { r.version++; }

// ------------------------------------------------------------ engine
function nodeDef(r, id) { return (r.mode === 'ensemble' ? ENSEMBLE : EPISODE).nodes.find((n) => n.id === id); }

function transition(r, nextId, opts = {}) {
  const def = nodeDef(r, nextId);
  if (!def) throw new Error('unknown node ' + nextId);
  const now = Date.now();
  r.node = { id: nextId, startedAt: now, deadline: def.durationMs ? now + def.durationMs : null, data: {} };
  if (def.enter) def.enter(r);
  if (opts.fixtures) applyFixtures(r, opts.fixtures);
  if (r.status === 'lobby' && nextId !== 'lobby') r.status = 'playing';
  bump(r);
}

function tryAdvance(r) {
  const def = nodeDef(r, r.node.id);
  if (!def || !def.advance) return;
  const next = def.advance(r);
  if (next && next !== r.node.id) transition(r, next);
}

function applyFixtures(r, f) {
  // test-mode: supply prerequisites without awarding clearance.
  // f is either {vars, evidence} (duet) or {apply(r)} (ensemble).
  if (!f) return;
  if (typeof f.apply === 'function') { f.apply(r); return; }
  if (f.vars) Object.assign(r.vars, f.vars);
  if (f.evidence) r.vars.evidence = f.evidence;
}

function fixtureFor(r, nodeId) {
  if (r.mode === 'ensemble') return { apply: ensembleFixtureFor(nodeId) };
  const base = {
    vars: {
      firstAnswer: 'A', minuteRecovered: true, investigationMode: 'together',
      repaired: false, preservedOriginal: true, ionaHeard: true, emptyUnderstood: true,
      attribution: 'named', validatedExchange: true, evidence: 4,
      exchangeReport: { A: 'full', B: 'full' },
      declarations: { A: { sign: 'yes', principle: 'accountability' }, B: { sign: 'yes', principle: 'protection' } },
    },
  };
  return base;
}

function endingPreset(id) {
  const v = {
    RETURN: { agreement: true, finalAction: 'release', preservedOriginal: true, repaired: false, validatedExchange: true, evidence: 5, attribution: 'named', declarations: { A: { sign: 'yes', principle: 'accountability' }, B: { sign: 'yes', principle: 'protection' } }, exchangeReport: { A: 'full', B: 'full' } },
    ARCHIVE: { agreement: true, finalAction: 'retain', preservedOriginal: true, repaired: false, attribution: 'sealed', evidence: 3, declarations: { A: { sign: 'yes', principle: 'protection' }, B: { sign: 'no', principle: 'disagreement' } } },
    SILENCE: { agreement: true, finalAction: 'erase', preservedOriginal: false, repaired: true, evidence: 2, attribution: 'anonymous' },
    'OPEN DOOR': { agreement: true, finalAction: 'unlock', preservedOriginal: true, repaired: false, validatedExchange: true, evidence: 6, attribution: 'named', declarations: { A: { sign: 'yes', principle: 'accountability' }, B: { sign: 'yes', principle: 'accountability' } } },
    LOOP: { agreement: false, finalAction: 'disagreement', preservedOriginal: true, evidence: 3 },
  }[id];
  return v;
}

// ------------------------------------------------------------ views
function pausedBanner(r) {
  return r.status === 'paused' ? [{ t: 'status', text: '⏸ PAUSED — the timeline is held.' }] : [];
}

function hostView(r, testMode) {
  const def = nodeDef(r, r.node.id);
  const players = Object.values(r.players).map((p) => ({
    name: p.name, receiver: p.receiver, teamId: p.teamId,
    teamName: p.teamId && r.teams[p.teamId] ? r.teams[p.teamId].name : undefined,
    ready: p.ready, test: !!p.test,
  }));
  const clearance = r.mode === 'ensemble' ? teamClearance(r) : { A: fmtClear(r, 'A'), B: fmtClear(r, 'B') };
  return {
    role: 'host', v: r.version, code: r.code, joinUrl: r.joinUrl, qr: r.qrDataUrl,
    status: r.status, mode: r.mode, scene: { id: r.node.id, part: def.part },
    players,
    blocks: [...pausedBanner(r), ...def.host(r)],
    clearance,
    teams: r.mode === 'ensemble' ? teamsOf(r).map((t) => ({
      id: t.id, name: t.name, color: t.color,
      players: t.players.length,
      ready: t.players.map((pid) => r.players[pid]).filter((p) => p && p.ready).length,
    })) : undefined,
    board: r.mode === 'ensemble' ? r.board : undefined,
    testMode: !!testMode,
    deadline: r.node.deadline, now: Date.now(),
    nodes: testMode ? (r.mode === 'ensemble' ? ENSEMBLE : EPISODE).nodes.map((n) => ({ id: n.id, part: n.part })) : undefined,
  };
}
function fmtClear(r, rc) { const c = clear(r, rc); const l = clearanceLevel(c); return { score: c.score, level: l.name, note: l.note }; }
function fmtClearPid(r, pid) { const c = clear(r, pid); const l = clearanceLevel(c); return { score: c.score, level: l.name, note: l.note }; }
function teamClearance(r) {
  const out = {};
  for (const t of teamsOf(r)) {
    const ms = t.players.map((pid) => r.players[pid]).filter(Boolean);
    const avg = ms.length ? ms.reduce((s, p) => s + (clear(r, p.id).score || 0), 0) / ms.length : 0;
    const l = clearanceLevel({ score: avg });
    out[t.id] = { name: t.name, color: t.color, score: Math.round(avg * 10) / 10, level: l.name, note: l.note };
  }
  return out;
}

function phoneView(r, player) {
  const def = nodeDef(r, r.node.id);
  const ensemble = r.mode === 'ensemble';
  let blocks = ensemble ? (def.phone(r, player) || []) : (def.phone(r, player.receiver) || []);
  // off-record flow injection (duet nodes only)
  const od = r.node.data.offRecord;
  if (OFFRECORD_NODES.has(r.node.id)) {
    if (od && od.state === 'pending' && od.from !== player.receiver && !od.voted) {
      blocks = [{ t: 'choices', id: 'offrecord-vote', prompt: `Receiver ${od.from} asks to take this off record (90 seconds, just talking). Agree?`, options: [{ id: 'yes', label: 'Agree — hold the room' }, { id: 'no', label: 'Decline' }] }, ...blocks];
    } else if (!od && !r.node.data.holdUntil) {
      blocks = [...blocks, { t: 'go', id: 'offrecord-request', label: 'Take this off record', subtle: true }];
    }
  }
  if (r.node.data.holdUntil && Date.now() < r.node.data.holdUntil) {
    blocks = [{ t: 'status', text: 'Off record — the timeline is held. Just talk.' }, ...blocks];
  }
  const team = ensemble && player.teamId ? r.teams[player.teamId] : null;
  return {
    role: 'phone', v: r.version, receiver: player.receiver, name: player.name,
    team: team ? { id: team.id, name: team.name, color: team.color } : null,
    status: r.status, mode: r.mode, scene: { id: r.node.id, part: def.part },
    blocks: [...pausedBanner(r), ...blocks],
    clearance: ensemble ? fmtClearPid(r, player.id) : fmtClear(r, player.receiver),
    deadline: r.node.deadline, now: Date.now(),
    holdUntil: r.node.data.holdUntil || null,
    pollMs: POLL_HINT_MS,
  };
}

// ------------------------------------------------------------ actions
function doAction(r, player, a) {
  const def = nodeDef(r, r.node.id);
  // off-record flow (server-level)
  if (a.kind === 'offrecord-request' && OFFRECORD_NODES.has(r.node.id) && !r.node.data.offRecord) {
    r.node.data.offRecord = { from: player.receiver, state: 'pending', deadline: Date.now() + 20000 };
    bump(r); return { ok: true };
  }
  if (a.kind === 'offrecord-vote' && r.node.data.offRecord?.state === 'pending') {
    const od = r.node.data.offRecord;
    if (a.value === 'yes' && player.receiver !== od.from) {
      od.state = 'held';
      r.node.data.holdUntil = Date.now() + 90000;
      if (r.node.deadline) r.node.deadline += 90000;
    } else od.state = 'declined';
    bump(r); return { ok: true };
  }
  const res = def.act(r, player, a);
  if (res.ok) { bump(r); tryAdvance(r); }
  return res;
}

// ------------------------------------------------------------ tick
setInterval(() => {
  const now = Date.now();
  for (const r of rooms.values()) {
    if (r.status === 'paused' || r.status === 'ended') continue;
    const def = nodeDef(r, r.node.id);
    // off-record request expiry
    const od = r.node.data.offRecord;
    if (od && od.state === 'pending' && now > od.deadline) { od.state = 'expired'; bump(r); }
    if (r.node.data.holdUntil && now > r.node.data.holdUntil) { r.node.data.holdUntil = null; r.node.data.offRecord = null; bump(r); }
    // postshow delayed transmission
    if (r.node.id === 'postshow' && !r.node.data.revealed && now >= r.node.data.showAt) {
      r.node.data.revealed = true; bump(r);
      setTimeout(() => { r.status = 'ended'; bump(r); }, 120000);
    }
    // deadlines
    if (def.durationMs && r.node.deadline && now >= r.node.deadline) {
      const next = def.onTimeout ? def.onTimeout(r) : null;
      if (next) transition(r, next); else bump(r);
    }
  }
}, 500);

// ------------------------------------------------------------ HTTP
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host}`);
  const parts = u.pathname.split('/').filter(Boolean);

  // ---- static
  if ((req.method === 'GET' || req.method === 'HEAD') && (parts.length === 0 || !parts[0].startsWith('api'))) {
    let f = parts.join('/');
    if (f === '' ) f = 'index.html';
    if (f === 'j' || (parts[0] === 'j' && parts[1])) { f = 'join.html'; }
    if (parts[0] === 'p' && parts[1]) { f = 'phone.html'; }
    if (parts[0] === 'h' && parts[1]) { f = 'host.html'; }
    const fp = path.join(__dirname, 'public', f);
    if (fs.existsSync(fp) && fs.statSync(fp).isFile()) {
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fp)] || 'application/octet-stream' });
      if (req.method === 'HEAD') { res.end(); return; }
      fs.createReadStream(fp).pipe(res); return;
    }
    res.writeHead(404); res.end('not found'); return;
  }

  // ---- API
  try {
    if (req.method === 'GET' && parts.join('/') === 'api/kit') {
      const mode = u.searchParams.get('mode');
      send(res, 200, { pages: mode === 'ensemble' ? ensembleKitPages() : kitPages() });
      return;
    }
    // POST /api/room {mode:'duet'|'ensemble', teamCount} -> create
    if (req.method === 'POST' && parts.join('/') === 'api/room') {
      const body = await parseBody(req);
      const mode = body.mode === 'ensemble' ? 'ensemble' : 'duet';
      const code = roomCode();
      // Prefer explicit BASE_URL; otherwise build from the request's Host header
      // (correct on Render/Fly/local LAN with no extra config).
      const proto = String(req.headers['x-forwarded-proto'] || 'http').split(',')[0].trim();
      const base = PUBLIC || `${proto}://${req.headers.host}`;
      const joinUrl = `${base}/j/${code}`;
      const hostUrl = `${base}/h/${code}`;
      const qrDataUrl = await QRCode.toDataURL(joinUrl, { width: 360, margin: 1 });
      const r = {
        code, joinUrl, qrDataUrl, createdAt: Date.now(),
        players: {}, byReceiver: {}, status: 'lobby', mode,
        teams: {}, board: [],
        node: null, vars: { evidence: 0 }, clearance: {}, ending: null, version: 0,
      };
      if (mode === 'ensemble') {
        // Exactly 6 teams of up to 4 players (24 max). The authored
        // cross-examination cycle references all six dossiers, so fewer
        // teams is unsafe.
        const n = 6;
        DOSSIERS.slice(0, n).forEach((d, i) => {
          const id = 't' + (i + 1);
          r.teams[id] = { id, name: d.name, color: d.color, dossier: d.id, seal: d.seal, players: [] };
        });
      }
      rooms.set(code, r);
      transition(r, 'lobby');
      send(res, 200, { code, hostUrl, joinUrl, mode });
      return;
    }

    const code = parts[2].toUpperCase();
    const r = rooms.get(code);
    if (parts[0] === 'api' && parts[1] === 'room' && !r) { send(res, 404, { error: 'room not found' }); return; }

    // GET /api/room/:code -> public info
    if (req.method === 'GET' && parts.length === 3) {
      send(res, 200, {
        code: r.code, status: r.status, mode: r.mode,
        players: Object.values(r.players).length, scene: r.node.id,
        teams: r.mode === 'ensemble' ? teamsOf(r).map((t) => ({ id: t.id, name: t.name, color: t.color, players: t.players.length })) : undefined,
      });
      return;
    }

    // POST /api/room/:code/join {name}                 (duet)
    // POST /api/room/:code/join {name, teamId}         (ensemble)
    // test joins: {receiver, test:true} / {teamId, test:true}
    if (req.method === 'POST' && parts[3] === 'join') {
      const body = await parseBody(req);
      const name = String(body.name || (body.test ? 'Test player' : 'Receiver')).slice(0, 24);
      if (r.mode === 'ensemble') {
        const total = Object.keys(r.players).length;
        if (total >= 24 && !body.test) { send(res, 409, { error: 'room is full' }); return; }
        let team = r.teams[body.teamId];
        const teamOk = team && (body.test || team.players.length < 4);
        if (!teamOk) {
          team = teamsOf(r).slice().sort((a, b) => a.players.length - b.players.length)[0];
        }
        if (!team) { send(res, 400, { error: 'no teams in this room' }); return; }
        const id = rid();
        r.players[id] = { id, name, teamId: team.id, ready: false, test: !!body.test, lastPoll: Date.now() };
        team.players.push(id);
        bump(r);
        send(res, 200, { playerId: id, teamId: team.id, teamName: team.name, joinUrl: r.joinUrl });
        return;
      }
      const taken = Object.values(r.players).filter((p) => !p.test).map((p) => p.receiver);
      let receiver = body.receiver;
      if (body.test) {
        if (!['A', 'B'].includes(receiver)) { send(res, 400, { error: 'receiver must be A or B' }); return; }
      } else {
        if (taken.length >= 2) { send(res, 409, { error: 'room is full' }); return; }
        receiver = taken.includes('A') ? 'B' : 'A';
      }
      const id = rid();
      r.players[id] = { id, name: String(body.name || (body.test ? `Test ${receiver}` : 'Receiver')).slice(0, 24), receiver, ready: false, test: !!body.test, lastPoll: Date.now() };
      if (!body.test) r.byReceiver[receiver] = id;
      bump(r);
      send(res, 200, { playerId: id, receiver, joinUrl: r.joinUrl });
      return;
    }

    // GET /api/room/:code/state?playerId=&host=1&test=1
    if (req.method === 'GET' && parts[3] === 'state') {
      const pid = u.searchParams.get('playerId');
      const p = r.players[pid];
      if (u.searchParams.get('host') === '1') { send(res, 200, hostView(r, u.searchParams.get('test') === '1')); return; }
      if (!p) { send(res, 401, { error: 'unknown player — rejoin the room' }); return; }
      p.lastPoll = Date.now();
      send(res, 200, phoneView(r, p));
      return;
    }

    // POST /api/room/:code/action {playerId, kind, ...}
    if (req.method === 'POST' && parts[3] === 'action') {
      const body = await parseBody(req);
      const p = r.players[body.playerId];
      if (!p) { send(res, 401, { error: 'unknown player' }); return; }
      if (r.status === 'paused') { send(res, 200, { ok: false, error: 'room is paused' }); return; }
      const out = doAction(r, p, body);
      send(res, 200, out);
      return;
    }

    // POST /api/room/:code/host {cmd,...}&test=1
    if (req.method === 'POST' && parts[3] === 'host') {
      const body = await parseBody(req);
      const test = body.test === true;
      const cmd = body.cmd;
      if (cmd === 'start' && r.node.id === 'lobby') { transition(r, 'briefing'); send(res, 200, { ok: true }); return; }
      if (cmd === 'pause') { r.status = 'paused'; bump(r); send(res, 200, { ok: true }); return; }
      if (cmd === 'resume') { r.status = r.node.id === 'lobby' ? 'lobby' : 'playing'; bump(r); send(res, 200, { ok: true }); return; }
      if (cmd === 'go' && body.kind) {
        const out = doAction(r, { id: 'host', receiver: 'HOST', name: 'Host' }, { kind: body.kind });
        send(res, 200, out); return;
      }
      if (!test) { send(res, 403, { error: 'test mode required' }); return; }
      if (cmd === 'test-jump') {
        transition(r, body.node, { fixtures: fixtureFor(r, body.node) });
        send(res, 200, { ok: true }); return;
      }
      if (cmd === 'test-timeout') {
        const def = nodeDef(r, r.node.id);
        const next = def.onTimeout ? def.onTimeout(r) : null;
        if (next) transition(r, next); else bump(r);
        send(res, 200, { ok: true }); return;
      }
      if (cmd === 'test-preview-ending') {
        Object.assign(r.vars, r.mode === 'ensemble' ? ensembleEndingPreset(body.ending) : endingPreset(body.ending));
        transition(r, 'letter');
        send(res, 200, { ok: true }); return;
      }
      if (cmd === 'test-inspect') {
        send(res, 200, { vars: r.vars, node: r.node.id, clearance: r.clearance, ending: r.ending, players: r.players });
        return;
      }
      if (cmd === 'test-reset') {
        const keep = { code: r.code, joinUrl: r.joinUrl, qrDataUrl: r.qrDataUrl, mode: r.mode };
        const teams = {};
        if (r.mode === 'ensemble') {
          for (const t of teamsOf(r)) teams[t.id] = { ...t, players: [] };
        }
        rooms.set(r.code, { ...keep, teams, board: [], createdAt: Date.now(), players: {}, byReceiver: {}, status: 'lobby', node: null, vars: { evidence: 0 }, clearance: {}, ending: null, version: 0 });
        transition(rooms.get(r.code), 'lobby');
        send(res, 200, { ok: true }); return;
      }
      send(res, 400, { error: 'unknown host cmd' });
      return;
    }

    send(res, 404, { error: 'unknown endpoint' });
  } catch (e) {
    console.error(e);
    send(res, 500, { error: 'server error' });
  }
});

server.listen(PORT, () => {
  console.log(`\n  Sleuth & Sip prototype running\n`);
  console.log(`  Host (shared screen):  ${baseUrl}`);
  console.log(`  Phones join via the QR code on the host screen.\n`);
});
