// End-to-end test harness for Sleuth & Sip — drives the real HTTP API.
// Actions return {ok:true} or {ok:false,error}; only transport problems throw.
const BASE = process.env.BASE || 'http://127.0.0.1:8799';

let failures = 0;
function check(name, cond, extra = '') {
  if (cond) console.log(`  ok   ${name}`);
  else { failures++; console.log(`  FAIL ${name} ${extra}`); }
}
async function api(path, body) {
  const r = await fetch(BASE + path, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${path} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}
async function get(path) {
  const r = await fetch(BASE + path);
  const t = await r.text();
  if (!r.ok) throw new Error(`HTTP ${r.status} ${path} ${t.slice(0, 200)}`);
  return t ? JSON.parse(t) : null;
}

async function newRoom() { return (await api('/api/room', {})).code; }
async function setup2(code) {
  const a = await api(`/api/room/${code}/join`, { receiver: 'A', test: true });
  const b = await api(`/api/room/${code}/join`, { receiver: 'B', test: true });
  check('A assigned', a.receiver === 'A');
  check('B assigned', b.receiver === 'B');
  return { A: a.playerId, B: b.playerId };
}
async function act(code, pid, kind, value) {
  const res = await api(`/api/room/${code}/action`, { playerId: pid, kind, value });
  return res;
}
function mustOk(res, what) { check(what + ' accepted', res && res.ok === true, JSON.stringify(res)); }
async function host(code, body) { return api(`/api/room/${code}/host`, body); }
async function inspect(code) { return host(code, { cmd: 'test-inspect', test: true }); }
async function phoneState(code, pid) { return get(`/api/room/${code}/state?playerId=${pid}`); }

// Full authored path with per-test variations. opts:
//  declineB, report:[a,b], minute:[a,b], approach:[a,b], repair:[a,b],
//  sealWrong, sign:[a,b], principle:[a,b], final:[a,b], final2:[a,b], callTimeout
async function playToLetter(code, p, o = {}) {
  await host(code, { cmd: 'start' });
  mustOk(await act(code, p.A, 'begin'), 'A begin');
  mustOk(await act(code, p.B, 'begin'), 'B begin');
  if (o.callTimeout) {
    await host(code, { cmd: 'test-timeout', test: true });
  } else {
    mustOk(await act(code, p.A, 'answer-call'), 'A answers');
    mustOk(await act(code, p.B, o.declineB ? 'decline-call' : 'answer-call'), 'B call decision');
  }
  const rep = o.report || ['full', 'full'];
  mustOk(await act(code, p.A, 'report', rep[0]), 'A report');
  mustOk(await act(code, p.B, 'report', rep[1]), 'B report');
  const mm = o.minute || ['02:14', '02:14'];
  const r1 = await act(code, p.A, 'minute', mm[0]);
  const r2 = await act(code, p.B, 'minute', mm[1]);
  if (!r1.ok) mustOk(await act(code, p.A, 'minute', '02:14'), 'A minute retry');
  if (!r2.ok) mustOk(await act(code, p.B, 'minute', '02:14'), 'B minute retry');
  const ap = o.approach || ['together', 'together'];
  mustOk(await act(code, p.A, 'approach', ap[0]), 'A approach');
  mustOk(await act(code, p.B, 'approach', ap[1]), 'B approach');
  mustOk(await act(code, p.A, 'obs', 'the torn page with the same sentence'), 'A obs');
  mustOk(await act(code, p.B, 'obs', 'two hands wrote the same line'), 'B obs');
  const rp = o.repair || ['refuse', 'refuse'];
  mustOk(await act(code, p.A, 'repair', rp[0]), 'A repair');
  mustOk(await act(code, p.B, 'repair', rp[1]), 'B repair');
  mustOk(await act(code, p.A, 'witness-name', 'Iona Vale'), 'A witness');
  mustOk(await act(code, p.B, 'witness-name', 'iona vale'), 'B witness');
  mustOk(await act(code, p.A, 'heard'), 'A heard');
  mustOk(await act(code, p.B, 'heard'), 'B heard');
  mustOk(await act(code, p.A, 'empty-meaning', 'countersign'), 'A empty');
  mustOk(await act(code, p.B, 'empty-meaning', 'countersign'), 'B empty');
  const at = o.attr || ['named', 'named'];
  mustOk(await act(code, p.A, 'attr', at[0]), 'A attr');
  mustOk(await act(code, p.B, 'attr', at[1]), 'B attr');
  if (o.sealTimeout) {
    await host(code, { cmd: 'test-timeout', test: true });
  } else {
    const sA = o.sealWrong ? 'WRONG' : 'HARBOR'; // A enters B's word
    const sB = o.sealWrong ? 'WRONG' : 'CINDER'; // B enters A's word
    const q1 = await act(code, p.A, 'seal', sA);
    const q2 = await act(code, p.B, 'seal', sB);
    if (o.sealWrong) {
      check('wrong seal rejected', q1.ok === false && q2.ok === false);
      mustOk(await act(code, p.A, 'seal', 'HARBOR'), 'A seal retry');
      mustOk(await act(code, p.B, 'seal', 'CINDER'), 'B seal retry');
    } else { mustOk(q1, 'A seal'); mustOk(q2, 'B seal'); }
  }
  const sg = o.sign || ['yes', 'yes'];
  mustOk(await act(code, p.A, 'sign', sg[0]), 'A sign');
  mustOk(await act(code, p.B, 'sign', sg[1]), 'B sign');
  const pr = o.principle || ['accountability', 'protection'];
  mustOk(await act(code, p.A, 'principle', pr[0]), 'A principle');
  mustOk(await act(code, p.B, 'principle', pr[1]), 'B principle');
  const fn = o.final || ['release', 'release'];
  mustOk(await act(code, p.A, 'final', fn[0]), 'A final');
  mustOk(await act(code, p.B, 'final', fn[1]), 'B final');
  let st = await inspect(code);
  if (st.node === 'reconcile') {
    check('reached reconcile on disagreement', true);
    const f2 = o.final2 || ['stand', 'stand'];
    mustOk(await act(code, p.A, 'final2', f2[0]), 'A final2');
    mustOk(await act(code, p.B, 'final2', f2[1]), 'B final2');
    st = await inspect(code);
  }
  check('reached letter', st.node === 'letter', st.node);
  return st;
}

async function t(name, fn) {
  console.log(`\n== ${name}`);
  try { await fn(); } catch (e) { failures++; console.log(`  FAIL exception: ${e.message}`); }
}

await t('RETURN: full canonical path, RESTRICTED clearance', async () => {
  const code = await newRoom(); const p = await setup2(code);
  const st = await playToLetter(code, p);
  check('ending RETURN', st.ending && st.ending.id === 'RETURN', JSON.stringify(st.ending));
  check('A RESTRICTED', st.clearance.A.score >= 12, JSON.stringify(st.clearance.A));
  check('B RESTRICTED', st.clearance.B.score >= 12, JSON.stringify(st.clearance.B));
  mustOk(await act(code, p.A, 'open-letter'), 'A opens letter');
  mustOk(await act(code, p.B, 'open-letter'), 'B opens letter');
  const vB = await phoneState(code, p.B);
  const tB = JSON.stringify(vB.blocks);
  check('B letter personalized', /original survived/i.test(tB), tB.slice(0, 200));
  const hv = await get(`/api/room/${code}/state?host=1`);
  check('host shows RETURN', /RETURN/.test(JSON.stringify(hv.blocks)));
  await host(code, { cmd: 'go', kind: 'to-postshow' });
  const st2 = await inspect(code);
  check('postshow reached', st2.node === 'postshow', st2.node);
});

await t('OPEN DOOR: full discovery + unlock', async () => {
  const code = await newRoom(); const p = await setup2(code);
  await host(code, { cmd: 'start' });
  await act(code, p.A, 'begin'); await act(code, p.B, 'begin');
  await act(code, p.A, 'answer-call'); await act(code, p.B, 'answer-call');
  await act(code, p.A, 'report', 'full'); await act(code, p.B, 'report', 'full');
  await act(code, p.A, 'minute', '02:14'); await act(code, p.B, 'minute', '0214');
  await act(code, p.A, 'approach', 'together'); await act(code, p.B, 'approach', 'together');
  await act(code, p.A, 'obs', 'torn page impression'); await act(code, p.B, 'obs', 'same sentence twice');
  await act(code, p.A, 'repair', 'refuse'); await act(code, p.B, 'repair', 'refuse');
  await act(code, p.A, 'witness-name', 'Iona Vale'); await act(code, p.B, 'witness-name', 'Iona Vale');
  await act(code, p.A, 'heard'); await act(code, p.B, 'heard');
  await act(code, p.A, 'empty-meaning', 'countersign'); await act(code, p.B, 'empty-meaning', 'countersign');
  await act(code, p.A, 'attr', 'named'); await act(code, p.B, 'attr', 'named');
  await act(code, p.A, 'seal', 'HARBOR'); await act(code, p.B, 'seal', 'CINDER');
  await act(code, p.A, 'sign', 'yes'); await act(code, p.B, 'sign', 'yes');
  await act(code, p.A, 'principle', 'accountability'); await act(code, p.B, 'principle', 'accountability');
  // unlock option must be visible now
  const fv = await phoneState(code, p.A);
  const fin = fv.blocks.find(b => b.t === 'choices' && b.id === 'final');
  check('unlock offered', fin && fin.options.some(x => x.id === 'unlock'), JSON.stringify(fin && fin.options.map(x => x.id)));
  await act(code, p.A, 'final', 'unlock'); await act(code, p.B, 'final', 'unlock');
  const st = await inspect(code);
  check('ending OPEN DOOR', st.ending.id === 'OPEN DOOR', st.ending.id);
  check('evidence >= 4', (st.vars.evidence || 0) >= 4, String(st.vars.evidence));
});

await t('LOOP: disagree, then let it stand', async () => {
  const code = await newRoom(); const p = await setup2(code);
  const st = await playToLetter(code, p, { final: ['release', 'retain'], final2: ['stand', 'stand'] });
  check('ending LOOP', st.ending.id === 'LOOP', st.ending.id);
  check('disagreement recorded', st.vars.agreement === false);
});

await t('reconcile then agree → RETURN', async () => {
  const code = await newRoom(); const p = await setup2(code);
  const st = await playToLetter(code, p, { final: ['release', 'retain'], final2: ['release', 'release'] });
  check('ending RETURN after reconcile', st.ending.id === 'RETURN', st.ending.id);
});

await t('SILENCE: erase the archive', async () => {
  const code = await newRoom(); const p = await setup2(code);
  const st = await playToLetter(code, p, {
    declineB: true, report: ['part', 'none'], approach: ['split', 'split'],
    repair: ['accept', 'accept'], attr: ['anonymous', 'anonymous'],
    sealTimeout: true, sign: ['no', 'no'], principle: ['disagreement', 'disagreement'],
    final: ['erase', 'erase'],
  });
  check('ending SILENCE', st.ending.id === 'SILENCE', st.ending.id);
});

await t('ARCHIVE: sealed attribution is strict', async () => {
  const code = await newRoom(); const p = await setup2(code);
  const st = await playToLetter(code, p, { attr: ['named', 'sealed'], final: ['release', 'release'] });
  check('ending ARCHIVE', st.ending.id === 'ARCHIVE', st.ending.id);
  check('attribution sealed', st.vars.attribution === 'sealed');
});

await t('ending presets still work', async () => {
  for (const e of ['RETURN', 'ARCHIVE', 'SILENCE', 'OPEN DOOR', 'LOOP']) {
    const code = await newRoom();
    await host(code, { cmd: 'test-preview-ending', ending: e, test: true });
    const st = await inspect(code);
    check('preset ' + e, st.ending.id === e, st.ending.id);
  }
});

await t('timeout fallback: call expires, room continues', async () => {
  const code = await newRoom(); const p = await setup2(code);
  await host(code, { cmd: 'start' });
  await act(code, p.A, 'begin'); await act(code, p.B, 'begin');
  await host(code, { cmd: 'test-timeout', test: true });
  const st = await inspect(code);
  check('advanced past the call', st.node === 'private-exchange', st.node);
  check('line recovered', st.vars.lineRecovered === true);
});

await t('pause holds actions, resume releases', async () => {
  const code = await newRoom(); const p = await setup2(code);
  await host(code, { cmd: 'start' });
  await host(code, { cmd: 'pause' });
  const r = await act(code, p.A, 'begin');
  check('action refused while paused', r.ok === false && /paused/.test(r.error || ''), JSON.stringify(r));
  await host(code, { cmd: 'resume' });
  mustOk(await act(code, p.A, 'begin'), 'begin after resume');
});

await t('off-record request + accept holds the room', async () => {
  const code = await newRoom(); const p = await setup2(code);
  await host(code, { cmd: 'start' });
  await act(code, p.A, 'begin'); await act(code, p.B, 'begin');
  await act(code, p.A, 'answer-call'); await act(code, p.B, 'answer-call');
  mustOk(await act(code, p.A, 'offrecord-request'), 'A requests off-record');
  const vB = await phoneState(code, p.B);
  check('B sees the vote', vB.blocks.some(b => b.t === 'choices' && b.id === 'offrecord-vote'));
  mustOk(await act(code, p.B, 'offrecord-vote', 'yes'), 'B agrees');
  const vB2 = await phoneState(code, p.B);
  check('hold active ~90s', vB2.holdUntil && vB2.holdUntil > Date.now() + 60000, String(vB2.holdUntil));
  await act(code, p.A, 'report', 'full'); await act(code, p.B, 'report', 'full');
  const st = await inspect(code);
  check('exchange completes after hold', st.node === 'missing-minute', st.node);
});

await t('off-record declined → room continues', async () => {
  const code = await newRoom(); const p = await setup2(code);
  await host(code, { cmd: 'start' });
  await act(code, p.A, 'begin'); await act(code, p.B, 'begin');
  await act(code, p.A, 'answer-call'); await act(code, p.B, 'answer-call');
  await act(code, p.A, 'offrecord-request');
  mustOk(await act(code, p.B, 'offrecord-vote', 'no'), 'B declines');
  const vB = await phoneState(code, p.B);
  check('no hold', !vB.holdUntil);
});

await t('validation: wrong answers rejected, room not stuck', async () => {
  const code = await newRoom(); const p = await setup2(code);
  const st0 = await playToLetter(code, p, { minute: ['99:99', '02:14'], sealWrong: true });
  check('recovered to letter anyway', st0.node === 'letter', st0.node);
});

await t('VERIFIED reachable without typed puzzles', async () => {
  const code = await newRoom(); const p = await setup2(code);
  await host(code, { cmd: 'start' });
  await act(code, p.A, 'begin'); await act(code, p.B, 'begin');
  await act(code, p.A, 'answer-call'); await act(code, p.B, 'decline-call');
  await act(code, p.A, 'report', 'full'); await act(code, p.B, 'report', 'full');
  await host(code, { cmd: 'test-timeout', test: true }); // missing-minute via buffer
  await act(code, p.A, 'approach', 'together'); await act(code, p.B, 'approach', 'together');
  await act(code, p.A, 'obs', 'something water-stained'); await act(code, p.B, 'obs', 'something unsigned');
  await act(code, p.A, 'repair', 'refuse'); await act(code, p.B, 'repair', 'refuse');
  await host(code, { cmd: 'test-timeout', test: true }); // witness via records
  await act(code, p.A, 'empty-meaning', 'countersign'); await act(code, p.B, 'empty-meaning', 'countersign');
  await act(code, p.A, 'attr', 'named'); await act(code, p.B, 'attr', 'named');
  await host(code, { cmd: 'test-timeout', test: true }); // exchange window lapses
  await act(code, p.A, 'sign', 'yes'); await act(code, p.B, 'sign', 'yes');
  await act(code, p.A, 'principle', 'accountability'); await act(code, p.B, 'principle', 'accountability');
  await act(code, p.A, 'final', 'release'); await act(code, p.B, 'final', 'release');
  const st = await inspect(code);
  check('letter reached', st.node === 'letter', st.node);
  check('B VERIFIED without typed input', st.clearance.B.score >= 7, JSON.stringify(st.clearance.B));
});

await t('room codes are 4-letter Jackbox style', async () => {
  const code = await newRoom();
  check('4 letters, unambiguous alphabet', /^[A-HJ-NP-Z]{4}$/.test(code), code);
  const info = await get('/api/room/' + code.toLowerCase());
  check('lowercase code lookup works', info.code === code, info.code);
});

// ---------------------------------------------------------- ENSEMBLE
async function newEnsembleRoom(n = 6) { return (await api('/api/room', { mode: 'ensemble', teamCount: n })).code; }
async function setupEnsemble(code, perTeam = 2) {
  const info = await get('/api/room/' + code);
  const players = [];
  for (const tm of info.teams) for (let i = 0; i < perTeam; i++) {
    const j = await api(`/api/room/${code}/join`, { name: `P${tm.id}${i}`, teamId: tm.id, test: true });
    players.push({ pid: j.playerId, teamId: tm.id, teamName: tm.name });
  }
  return { players, teams: info.teams };
}
const ESEALS = { t1: 'CINDER', t2: 'HARBOR', t3: 'VESPER', t4: 'LANTERN', t5: 'QUARRY', t6: 'EDDY' };
const EANSWERS = { t1: '02:14', t2: 'she asked for the light to stay on', t3: 'countersignature', t4: 'repair the record', t5: 'Vale', t6: 'Iona Vale' };
// Full cooperative path. o: {attr, final: 'release'|..., splitFinal, principle}
async function playEnsembleToLetter(code, players, teams, o = {}) {
  for (const p of players) mustOk(await act(code, p.pid, 'ready'), p.teamName + ' ready');
  await host(code, { cmd: 'start' });
  for (const tm of teams) mustOk(await act(code, players.find((p) => p.teamId === tm.id).pid, 'begin'), tm.name + ' begin');
  for (const tm of teams) mustOk(await act(code, players.find((p) => p.teamId === tm.id).pid, 'read'), tm.name + ' read');
  for (const tm of teams) mustOk(await act(code, players.find((p) => p.teamId === tm.id).pid, 'finding', `Essential finding of team ${tm.name}`), tm.name + ' finding');
  for (const tm of teams) mustOk(await act(code, players.find((p) => p.teamId === tm.id).pid, 'cross', EANSWERS[tm.id]), tm.name + ' cross');
  for (const tm of teams) mustOk(await act(code, players.find((p) => p.teamId === tm.id).pid, 'seal', ESEALS[tm.id]), tm.name + ' seal');
  const at = o.attr || 'named';
  for (const p of players) mustOk(await act(code, p.pid, 'attr', at), p.teamName + ' attr');
  const pr = o.principle || 'accountability';
  players.forEach((p, i) => { p._final = o.splitFinal ? (i % 2 ? 'retain' : 'release') : (o.final || 'release'); });
  for (const p of players) mustOk(await act(code, p.pid, 'final', p._final), p.teamName + ' final');
  for (const p of players) mustOk(await act(code, p.pid, 'principle', pr), p.teamName + ' principle');
  const st = await inspect(code);
  check('ensemble reached letter', st.node === 'letter', st.node);
  return st;
}

await t('ENSEMBLE setup: 6 teams, join, auto-assign', async () => {
  const code = await newEnsembleRoom(6);
  const info = await get('/api/room/' + code);
  check('mode ensemble', info.mode === 'ensemble');
  check('6 teams', info.teams.length === 6, JSON.stringify(info.teams.map((t) => t.name)));
  check('dossier order', info.teams.map((t) => t.name).join(',') === 'WITNESS,RECORDS,PHYSICAL,PROCEDURE,CONTINUITY,CUSTODY');
  const j = await api(`/api/room/${code}/join`, { name: 'Solo', test: true });
  check('auto-assign picks a team', info.teams.some((t) => t.id === j.teamId), j.teamId);
  const ps = await phoneState(code, j.playerId);
  check('phone shows team', !!ps.team && ps.team.name.length > 0, JSON.stringify(ps.team));
  check('lobby blocks render', ps.blocks.some((b) => b.t === 'title'));
  const hv = await get(`/api/room/${code}/state?host=1&test=1`);
  check('host shows teams block', hv.blocks.some((b) => b.t === 'teams'));
  check('host clearance per team', hv.clearance && hv.clearance.t1 && hv.clearance.t1.name === 'WITNESS');
});

await t('ENSEMBLE RETURN: canonical cooperative run, RESTRICTED', async () => {
  const code = await newEnsembleRoom(6);
  const { players, teams } = await setupEnsemble(code, 2);
  const st = await playEnsembleToLetter(code, players, teams);
  check('ending RETURN', st.ending && st.ending.id === 'RETURN', JSON.stringify(st.ending));
  const allRestricted = players.every((p) => st.clearance[p.pid] && st.clearance[p.pid].score >= 12);
  check('all players RESTRICTED', allRestricted, JSON.stringify(Object.values(st.clearance).map((c) => c.score)));
  for (const p of players) mustOk(await act(code, p.pid, 'open-letter'), p.teamName + ' letter');
  const v0 = await phoneState(code, players[0].pid);
  const txt = JSON.stringify(v0.blocks);
  check('letter team-personalized', /Team WITNESS/.test(txt) && /CINDER/.test(txt), txt.slice(0, 160));
  check('letter has designation', /Your designation/.test(txt));
  const hv = await get(`/api/room/${code}/state?host=1&test=1`);
  check('host board has 6 entries', hv.board && hv.board.length === 6, String(hv.board && hv.board.length));
  check('host shows RETURN', /RETURN/.test(JSON.stringify(hv.blocks)));
  await host(code, { cmd: 'go', kind: 'to-postshow' });
  const st2 = await inspect(code);
  check('postshow reached', st2.node === 'postshow', st2.node);
});

await t('ENSEMBLE LOOP: split vote → disagreement preserved', async () => {
  const code = await newEnsembleRoom(6);
  const { players, teams } = await setupEnsemble(code, 2);
  const st = await playEnsembleToLetter(code, players, teams, { splitFinal: true });
  check('ending LOOP', st.ending && st.ending.id === 'LOOP', JSON.stringify(st.ending));
});

await t('ENSEMBLE SILENCE: unanimous erase', async () => {
  const code = await newEnsembleRoom(6);
  const { players, teams } = await setupEnsemble(code, 2);
  const st = await playEnsembleToLetter(code, players, teams, { final: 'erase' });
  check('ending SILENCE', st.ending && st.ending.id === 'SILENCE', JSON.stringify(st.ending));
});

await t('ENSEMBLE wrong answers rejected, recovery works', async () => {
  const code = await newEnsembleRoom(6);
  const { players, teams } = await setupEnsemble(code, 2);
  for (const p of players) await act(code, p.pid, 'ready');
  await host(code, { cmd: 'start' });
  for (const tm of teams) await act(code, players.find((p) => p.teamId === tm.id).pid, 'begin');
  for (const tm of teams) await act(code, players.find((p) => p.teamId === tm.id).pid, 'read');
  const short = await act(code, players[0].pid, 'finding', 'x');
  check('too-short finding rejected', short.ok === false);
  for (const tm of teams) await act(code, players.find((p) => p.teamId === tm.id).pid, 'finding', `Finding ${tm.name}`);
  const bad = await act(code, players[0].pid, 'cross', 'nonsense answer');
  check('wrong cross rejected', bad.ok === false);
  for (const tm of teams) mustOk(await act(code, players.find((p) => p.teamId === tm.id).pid, 'cross', EANSWERS[tm.id]), tm.name + ' cross retry');
  const badSeal = await act(code, players[0].pid, 'seal', 'NOTTHEWORD');
  check('wrong seal rejected', badSeal.ok === false);
  const st = await inspect(code);
  check('still in the-gap after rejections', st.node === 'the-gap', st.node);
});

await t('ENSEMBLE unlock unavailable without full completion', async () => {
  const code = await newEnsembleRoom(6);
  const { players, teams } = await setupEnsemble(code, 1);
  for (const p of players) await act(code, p.pid, 'ready');
  await host(code, { cmd: 'start' });
  for (const tm of teams) await act(code, players.find((p) => p.teamId === tm.id).pid, 'begin');
  for (const tm of teams) await act(code, players.find((p) => p.teamId === tm.id).pid, 'read');
  for (const tm of teams) await act(code, players.find((p) => p.teamId === tm.id).pid, 'finding', `Finding ${tm.name}`);
  for (const tm of teams) await act(code, players.find((p) => p.teamId === tm.id).pid, 'cross', EANSWERS[tm.id]);
  await host(code, { cmd: 'test-timeout', test: true }); // seal window lapses: seals incomplete
  let st = await inspect(code);
  check('attribution after seal timeout', st.node === 'attribution', st.node);
  check('seals not committed', st.vars.sealsCommitted === false);
  for (const p of players) await act(code, p.pid, 'attr', 'named');
  st = await inspect(code);
  check('final-vote reached', st.node === 'final-vote', st.node);
  const v = await phoneState(code, players[0].pid);
  const txt = JSON.stringify(v.blocks);
  check('no UNLOCK option offered', !/UNLOCKED/.test(txt));
  check('unavailable note shown', /isn’t complete enough/.test(txt));
  const bad = await act(code, players[0].pid, 'final', 'unlock');
  check('unlock vote rejected server-side', bad.ok === false);
});

await t('ENSEMBLE final-vote timeout defaults to retain', async () => {
  const code = await newEnsembleRoom(6);
  const { players } = await setupEnsemble(code, 1);
  await host(code, { cmd: 'test-jump', node: 'final-vote', test: true });
  await host(code, { cmd: 'test-timeout', test: true });
  const st = await inspect(code);
  check('letter reached after timeout', st.node === 'letter', st.node);
  check('ending ARCHIVE (all retain)', st.ending && st.ending.id === 'ARCHIVE', JSON.stringify(st.ending));
});

await t('ENSEMBLE test-preview-ending OPEN DOOR', async () => {
  const code = await newEnsembleRoom(6);
  await setupEnsemble(code, 1);
  await host(code, { cmd: 'test-preview-ending', ending: 'OPEN DOOR', test: true });
  const st = await inspect(code);
  check('letter node', st.node === 'letter', st.node);
  check('ending OPEN DOOR', st.ending && st.ending.id === 'OPEN DOOR', JSON.stringify(st.ending));
});

await t('ENSEMBLE test-jump fixtures land mid-episode', async () => {
  const code = await newEnsembleRoom(6);
  await setupEnsemble(code, 1);
  await host(code, { cmd: 'test-jump', node: 'the-gap', test: true });
  let st = await inspect(code);
  check('jumped to the-gap', st.node === 'the-gap', st.node);
  check('fixture marked prior stages', st.vars.crossComplete === true && st.vars.boardComplete === true, JSON.stringify({ cross: st.vars.crossComplete, board: st.vars.boardComplete }));
  await host(code, { cmd: 'test-jump', node: 'cross-exam', test: true });
  st = await inspect(code);
  check('jumped to cross-exam', st.node === 'cross-exam', st.node);
  check('fixture board has entries', (await get(`/api/room/${code}/state?host=1&test=1`)).board.length === 6);
});

await t('ENSEMBLE kit has 8 pages', async () => {
  const { pages } = await get('/api/kit?mode=ensemble');
  check('8 kit pages', pages.length === 8, String(pages.length));
  check('dossier pages present', pages.some((p) => p.id === 'dossier-witness') && pages.some((p) => p.id === 'dossier-custody'));
});

await t('ENSEMBLE capacity: 6 teams, 4 per team, 24 max', async () => {
  const code = await newEnsembleRoom(6);
  const info = await get('/api/room/' + code);
  check('exactly 6 teams', info.teams.length === 6, String(info.teams.length));
  const t1 = info.teams[0].id;
  for (let i = 0; i < 4; i++) await api(`/api/room/${code}/join`, { name: 'N' + i, teamId: t1 });
  const fifth = await api(`/api/room/${code}/join`, { name: 'N5', teamId: t1 });
  check('5th player routed to a smaller team', fifth.teamId !== t1, fifth.teamId);
  for (let i = 0; i < 19; i++) await api(`/api/room/${code}/join`, { name: 'F' + i }); // 24 total
  const r = await fetch(BASE + `/api/room/${code}/join`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'TooMany' }),
  });
  check('25th player rejected', r.status === 409, String(r.status));
});

await t('DUET unchanged: default mode is duet', async () => {
  const code = await newRoom();
  const info = await get('/api/room/' + code);
  check('default mode duet', info.mode === 'duet', info.mode);
  check('no teams in duet', info.teams === undefined);
});

await t('CLIENT: inline scripts share scope with app.js without collisions', async () => {
  const { readFileSync } = await import('fs');
  const { Script } = await import('vm');
  const { dirname, join } = await import('path');
  const { fileURLToPath } = await import('url');
  const pub = join(dirname(fileURLToPath(import.meta.url)), '..', 'public');
  const appjs = readFileSync(join(pub, 'app.js'), 'utf8');
  for (const p of ['index.html', 'host.html', 'join.html', 'phone.html', 'kit.html']) {
    const html = readFileSync(join(pub, p), 'utf8');
    const inlines = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
    try {
      new Script(appjs + '\n;\n' + inlines.join('\n;\n'), { filename: p });
      check(p + ' parses with app.js', true);
    } catch (e) { check(p + ' parses with app.js', false, e.message); }
  }
});

console.log(`\n${failures === 0 ? 'ALL TESTS PASSED' : failures + ' FAILURES'}`);
process.exit(failures === 0 ? 0 : 1);
