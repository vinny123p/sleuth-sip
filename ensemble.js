// Sleuth & Sip — ENSEMBLE (cooperative, up to 24 players)
// Same mystery as the duet, sharded across teams. Six dossiers, one room,
// one shared screen. Teams hold unique clue threads and must trade across
// teams to assemble the account. Deterministic: every reaction written out.

import { award, clear, clearanceLevel } from './episode.js';

const norm = (s) => String(s || '').trim().toLowerCase();
const normKey = (s) => norm(s).replace(/[^a-z0-9]/g, '');

// Six evidence threads. Each dossier:
//  - asks:   the question this team must take to ONE other team (directed 6-cycle)
//  - holds:  the question asked OF this team, and its acceptable answers
export const DOSSIERS = [
  {
    id: 'witness', name: 'WITNESS', color: '#e0a458', seal: 'CINDER',
    brief: 'You hold the witness thread. Someone was in the room during the missing minute. Only your dossier names her — and only your dossier carries what she said.',
    thread: [
      'Her name is Iona Vale. She is not inside this machine — she preserved her testimony and left the building. What is still at risk is the account of what happened.',
      'Her words, as your dossier preserves them: “They will try to make every version agree. Agreement is not truth. Keep the original.”',
    ],
    asks: { team: 'records', q: 'What minute is missing from the room log?' },
    holds: { q: 'What is the witness’s full name?', a: ['ionavale'] },
    kit: 'DOSSIER — WITNESS\n\nSomeone was in the room during the missing minute.\nYour dossier names her. Guard the name until the cross-examination —\nit is the answer another team will come asking for.',
  },
  {
    id: 'records', name: 'RECORDS', color: '#7fd4ff', seal: 'HARBOR',
    brief: 'You hold the records thread. The room log — timestamps, gaps, and what the gaps mean. Your numbers anchor everyone else’s story.',
    thread: [
      'The room log jumps from 02:13 to 02:15. One minute — 02:14 — is absent. It was not erased; no erasure is logged. It was never written.',
      'Margin note, in a hand you don’t recognize: “The minute wasn’t taken. It was never given.”',
    ],
    asks: { team: 'physical', q: 'What sentence appears in two different handwritings?' },
    holds: { q: 'What minute is missing from the room log?', a: ['0214'] },
    kit: 'DOSSIER — RECORDS\n\nThe room log jumps from 02:13 to 02:15.\nYour dossier holds the missing minute. Another team will come asking —\nmake them ask precisely.',
  },
  {
    id: 'physical', name: 'PHYSICAL', color: '#9dd65f', seal: 'VESPER',
    brief: 'You hold the physical thread. Objects in the room remember what the log doesn’t. Two items, two hands — one sentence.',
    thread: [
      'Two items, two hands, one sentence: “…she asked for the light to stay on.” A maintenance log with the 02:14 entry torn out. A visitor slip, unsigned.',
      'The tear is clean — not hurried. Whoever removed the page wanted the impression left behind to be found.',
    ],
    asks: { team: 'procedure', q: 'What does an EMPTY designation actually certify?' },
    holds: { q: 'What sentence appears in two different handwritings?', a: ['sheaskedforthelight', 'askedforthelight', 'lightstayon'] },
    kit: 'DOSSIER — PHYSICAL\n\nTwo items. Two hands. One sentence.\nYour dossier holds the sentence. Speak it aloud only to the team\nthat asks for it by name.',
  },
  {
    id: 'procedure', name: 'PROCEDURE', color: '#c792ea', seal: 'LANTERN',
    brief: 'You hold the procedure thread. The rules that govern what the record may say — and what EMPTY has been allowed to pretend.',
    thread: [
      'RULE C-0, from the procedures appendix: “An entry marked EMPTY certifies only that no independent countersignature was obtained. It is not a finding of absence.”',
      'Every EMPTY in the log was signed by the same hand. No countersignature exists for any of them.',
    ],
    asks: { team: 'continuity', q: 'What does CONTINUITY offer to do to the account?' },
    holds: { q: 'What does an EMPTY designation actually certify?', a: ['countersignature', 'countersign'] },
    kit: 'DOSSIER — PROCEDURE\n\nRULE C-0 governs what EMPTY may claim.\nYour dossier holds the definition. It undoes a lie the whole\nroom has been told — spend it carefully.',
  },
  {
    id: 'continuity', name: 'CONTINUITY', color: '#ff6b6b', seal: 'QUARRY',
    brief: 'You hold the continuity thread. Something in the system wants the story smooth. Your dossier has been counting its offers.',
    thread: [
      'CONTINUITY has offered three times to “repair” the account — to fill the gaps and reconcile every contradiction so the record agrees with itself.',
      'Each offer arrived after a team got close to something. The offers are not scheduled. They are reactions.',
    ],
    asks: { team: 'custody', q: 'Who kept the original?' },
    holds: { q: 'What does CONTINUITY offer to do to the account?', a: ['repair'] },
    kit: 'DOSSIER — CONTINUITY\n\nSomething in the system keeps offering to “repair” the account.\nYour dossier counts the offers. Another team needs to know\nwhat the offer really is.',
  },
  {
    id: 'custody', name: 'CUSTODY', color: '#ffd54f', seal: 'EDDY',
    brief: 'You hold the custody thread. Who held what, and who kept it. The last line of your chain changes everything.',
    thread: [
      'Chain of custody, final line: “…Vale kept the original.” Everything else passed through other hands. The original did not.',
      'Six seals guard one sentence. Your team’s seal word is below. Speak it only when the seals are called.',
    ],
    asks: { team: 'witness', q: 'What is the witness’s full name?' },
    holds: { q: 'Who kept the original?', a: ['vale'] },
    kit: 'DOSSIER — CUSTODY\n\nChain of custody, final line: “…Vale kept the original.”\nYour dossier holds the line — and your team’s seal word.\nSpeak the word only when the seals are called.',
  },
];

export const dossierById = (id) => DOSSIERS.find((d) => d.id === id);

export const CUSTODY_PHRASE = 'SHE ASKED FOR THE LIGHT ON';

// ------------------------------------------------------------ team helpers
export function teamsOf(r) { return Object.values(r.teams || {}); }
export function teamOf(r, player) { return (r.teams || {})[player.teamId]; }
export function nonEmptyTeams(r) { return teamsOf(r).filter((t) => t.players.length > 0); }
export function teamMembers(r, team) { return team.players.map((pid) => r.players[pid]).filter(Boolean); }
export function awardTeam(r, team, key, pts, reason) {
  for (const pid of team.players) award(r, pid, `${key}:${team.id}`, pts, reason);
}
export function matchAnswer(input, keys) {
  const n = normKey(input);
  if (!n) return false;
  return keys.some((k) => n.includes(k));
}

// ------------------------------------------------------------ episode
export const ENSEMBLE = {
  id: 'unknown-000-ensemble',
  title: 'The Room That Remembers — Ensemble',
  tagline: 'Six teams. Six threads. One account — assembled together.',

  nodes: [
    // ------------------------------------------------------ LOBBY
    {
      id: 'lobby',
      part: 'Lobby',
      host(r) {
        const teams = nonEmptyTeams(r);
        const ready = teams.filter((t) => teamMembers(r, t).some((p) => p.ready)).length;
        return [
          { t: 'title', text: 'Sleuth & Sip — ENSEMBLE' },
          { t: 'text', text: 'The Room That Remembers · cooperative · teams trade clues toward one solve' },
          { t: 'code', text: r.code },
          { t: 'qr', text: r.qrDataUrl || r.joinUrl },
          { t: 'text', text: 'Join from your phone and pick a team. Each team receives a dossier no other team sees.' },
          { t: 'teams', teams: teamsOf(r).map((t) => ({ name: t.name, color: t.color, players: t.players.length, ready: teamMembers(r, t).filter((p) => p.ready).length })) },
          ...(teams.length >= 2
            ? [{ t: 'go', id: 'start', label: `Start the episode (${ready} of ${teams.length} teams ready)` }]
            : [{ t: 'status', text: 'Waiting for at least two teams…' }]),
        ];
      },
      phone(r, p) {
        const t = teamOf(r, p);
        const d = dossierById(t.dossier);
        return [
          { t: 'title', text: `Team ${t.name}` },
          { t: 'secret', text: `Your dossier: ${d.name}. ${d.brief}` },
          { t: 'text', text: 'Your team will receive information no other team has. What the room does with it is up to all of you.' },
          ...(p.ready ? [{ t: 'status', text: 'Ready. Waiting for the host to start…' }] : [{ t: 'go', id: 'ready', label: 'We’re ready' }]),
        ];
      },
      act(r, player, a) {
        if (a.kind === 'ready') {
          player.ready = true;
          award(r, player.id, 'team-ready', 1, 'Readied up with their team');
          return { ok: true };
        }
        return { ok: false, error: 'unknown action' };
      },
      advance() { return null; },
    },

    // ------------------------------------------------------ BRIEFING
    {
      id: 'briefing',
      part: 'Dossiers',
      enter(r) { r.node.data.begun = {}; },
      host(r) {
        const teams = nonEmptyTeams(r);
        const n = teams.filter((t) => r.node.data.begun[t.id]).length;
        return [
          { t: 'title', text: 'Dossiers' },
          { t: 'text', text: 'Each team: open your dossier on your phone. Read it together. Your seal word stays inside the team until the seals are called.' },
          { t: 'teams', teams: teams.map((t) => ({ name: t.name, color: t.color, players: t.players.length, ready: 0, note: r.node.data.begun[t.id] ? 'dossier open' : 'reading…' })) },
          { t: 'status', text: `${n} of ${teams.length} dossiers open.` },
        ];
      },
      phone(r, p) {
        const t = teamOf(r, p);
        const d = dossierById(t.dossier);
        if (r.node.data.begun[t.id]) return [{ t: 'title', text: `Team ${t.name}` }, { t: 'status', text: 'Dossier open. Waiting for the other teams…' }];
        return [
          { t: 'title', text: `Dossier ${d.name}` },
          { t: 'text', text: d.brief },
          { t: 'secret', text: `Your team’s seal word is ${t.seal}. Speak it only when the seals are called.` },
          { t: 'do', text: 'Read the dossier aloud inside your team. One of you taps below when the team is ready.' },
          { t: 'go', id: 'begin', label: 'Our dossier is open' },
        ];
      },
      act(r, player, a) {
        const t = teamOf(r, player);
        if (a.kind === 'begin' && t && !r.node.data.begun[t.id]) {
          r.node.data.begun[t.id] = true;
          awardTeam(r, t, 'briefing-begun', 1, 'Opened their dossier');
          return { ok: true };
        }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        const teams = nonEmptyTeams(r);
        if (teams.length && teams.every((t) => r.node.data.begun[t.id])) return 'first-thread';
        return null;
      },
    },

    // ------------------------------------------------------ FIRST THREAD
    {
      id: 'first-thread',
      part: 'First thread',
      enter(r) { r.node.data.read = {}; },
      host(r) {
        const teams = nonEmptyTeams(r);
        const n = teams.filter((t) => r.node.data.read[t.id]).length;
        return [
          { t: 'title', text: 'Six threads' },
          { t: 'text', text: 'Every team now holds its first transmission. What you hold, no other team holds. Sit with it — then the room starts trading.' },
          { t: 'teams', teams: teams.map((t) => ({ name: t.name, color: t.color, players: t.players.length, ready: 0, note: r.node.data.read[t.id] ? 'thread read' : 'reading…' })) },
          { t: 'status', text: `${n} of ${teams.length} threads read.` },
        ];
      },
      phone(r, p) {
        const t = teamOf(r, p);
        const d = dossierById(t.dossier);
        if (r.node.data.read[t.id]) return [{ t: 'title', text: `Team ${t.name}` }, { t: 'status', text: 'Thread read. Waiting for the other teams…' }];
        return [
          { t: 'title', text: `Team ${t.name} — transmission` },
          ...d.thread.map((s) => ({ t: 'secret', text: s })),
          { t: 'do', text: 'Discuss inside your team: what is the one thing only you know?' },
          { t: 'go', id: 'read', label: 'We’ve read our thread' },
        ];
      },
      act(r, player, a) {
        const t = teamOf(r, player);
        if (a.kind === 'read' && t && !r.node.data.read[t.id]) {
          r.node.data.read[t.id] = true;
          awardTeam(r, t, 'thread-read', 1, 'Read their thread');
          return { ok: true };
        }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        const teams = nonEmptyTeams(r);
        if (teams.length && teams.every((t) => r.node.data.read[t.id])) return 'evidence-board';
        return null;
      },
    },

    // ------------------------------------------------------ EVIDENCE BOARD
    {
      id: 'evidence-board',
      part: 'Evidence board',
      durationMs: 300000,
      enter(r) { r.node.data.submitted = {}; },
      host(r) {
        const teams = nonEmptyTeams(r);
        const n = teams.filter((t) => r.node.data.submitted[t.id]).length;
        return [
          { t: 'title', text: 'The Evidence Board' },
          { t: 'text', text: 'Each team: distill your thread to its one essential finding and file it. Watch the board — another team’s finding may change what yours means.' },
          { t: 'board', entries: (r.board || []).map((e) => ({ team: e.team, color: e.color, text: e.text, by: e.by })) },
          n === teams.length && n > 0
            ? { t: 'trans', from: 'RECORDS', text: 'Board complete. Every thread is represented. The account can proceed.' }
            : { t: 'timer', label: 'Filing window' },
        ];
      },
      phone(r, p) {
        const t = teamOf(r, p);
        const sub = r.node.data.submitted[t.id];
        const board = { t: 'board', entries: (r.board || []).map((e) => ({ team: e.team, color: e.color, text: e.text, by: e.by })) };
        if (sub) return [{ t: 'title', text: 'Finding filed' }, { t: 'text', text: `Your team filed: “${sub.text}”` }, board, { t: 'status', text: 'Waiting for the other teams…' }];
        return [
          { t: 'title', text: 'File your finding' },
          { t: 'text', text: 'One person per team files. Distill your thread to its essential finding — one or two sentences. It will appear on the shared screen for every team.' },
          board,
          { t: 'typed', id: 'finding', prompt: `Team ${t.name}’s essential finding`, placeholder: 'What does only your team know?…' },
        ];
      },
      act(r, player, a) {
        const t = teamOf(r, player);
        if (a.kind === 'finding' && t && !r.node.data.submitted[t.id]) {
          const v = String(a.value || '').trim();
          if (v.length < 3) return { ok: false, error: 'File at least a few words.' };
          r.node.data.submitted[t.id] = { text: v, by: player.name, at: Date.now() };
          r.board.push({ team: t.name, color: t.color, text: v, by: player.name, at: Date.now() });
          awardTeam(r, t, 'evidence-filed', 1, 'Filed their finding');
          return { ok: true };
        }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        const teams = nonEmptyTeams(r);
        if (teams.length && teams.every((t) => r.node.data.submitted[t.id])) {
          r.vars.boardComplete = true;
          for (const pid of Object.keys(r.players)) award(r, pid, 'collective-board', 1, 'Every team filed its finding');
          return 'cross-exam';
        }
        return null;
      },
      onTimeout(r) {
        const teams = nonEmptyTeams(r);
        for (const t of teams) {
          if (!r.node.data.submitted[t.id]) {
            r.node.data.submitted[t.id] = { text: '(filed from buffer — the thread was thinner than it should have been)', by: t.name, at: Date.now() };
            r.board.push({ team: t.name, color: t.color, text: r.node.data.submitted[t.id].text, by: t.name, at: Date.now() });
          }
        }
        r.vars.boardComplete = false; // thin record: unlock stays out of reach
        return 'cross-exam';
      },
    },

    // ------------------------------------------------------ CROSS-EXAMINATION
    {
      id: 'cross-exam',
      part: 'Cross-examination',
      durationMs: 300000,
      enter(r) { r.node.data.solved = {}; },
      host(r) {
        const teams = nonEmptyTeams(r);
        const n = teams.filter((t) => r.node.data.solved[t.id]).length;
        return [
          { t: 'title', text: 'Cross-examination' },
          { t: 'text', text: 'Each team has been given a question only ONE other team can answer. Find them in the room. Ask aloud. Then enter what they tell you.' },
          { t: 'teams', teams: teams.map((t) => ({ name: t.name, color: t.color, players: t.players.length, ready: 0, note: r.node.data.solved[t.id] ? 'answered ✓' : 'seeking…' })) },
          n === teams.length && n > 0
            ? { t: 'trans', from: 'RECORDS', text: 'Every question answered. The threads are braided.' }
            : { t: 'timer', label: 'Cross-examination window' },
        ];
      },
      phone(r, p) {
        const t = teamOf(r, p);
        const d = dossierById(t.dossier);
        const target = dossierById(d.asks.team);
        if (r.node.data.solved[t.id]) return [{ t: 'title', text: 'Answered' }, { t: 'status', text: 'Waiting for the other teams…' }];
        return [
          { t: 'title', text: 'Your question' },
          { t: 'do', text: `Ask the ${target.name} team: “${d.asks.q}”` },
          { t: 'text', text: 'Find them in the room. Ask aloud — don’t shout across it. Then enter exactly what they tell you.' },
          { t: 'typed', id: 'cross', prompt: `The ${target.name} team’s answer`, placeholder: 'Type their answer…' },
        ];
      },
      act(r, player, a) {
        const t = teamOf(r, player);
        const d = dossierById(t.dossier);
        if (a.kind === 'cross' && t && !r.node.data.solved[t.id]) {
          const expected = dossierById(d.asks.team).holds.a;
          if (matchAnswer(a.value, expected)) {
            r.node.data.solved[t.id] = true;
            awardTeam(r, t, 'cross-solved', 1, 'Answered their cross-examination question');
            return { ok: true };
          }
          return { ok: false, error: 'That doesn’t match what their dossier holds. Ask them to say it plainly and try again.' };
        }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        const teams = nonEmptyTeams(r);
        if (teams.length && teams.every((t) => r.node.data.solved[t.id])) {
          r.vars.crossComplete = true;
          for (const pid of Object.keys(r.players)) award(r, pid, 'collective-cross', 1, 'Every team answered its question');
          return 'the-gap';
        }
        return null;
      },
      onTimeout(r) {
        const teams = nonEmptyTeams(r);
        for (const t of teams) r.node.data.solved[t.id] = true;
        r.vars.crossComplete = false;
        return 'the-gap';
      },
    },

    // ------------------------------------------------------ THE GAP (seals)
    {
      id: 'the-gap',
      part: 'Six seals',
      durationMs: 240000,
      enter(r) { r.node.data.committed = {}; },
      host(r) {
        const teams = nonEmptyTeams(r);
        const slots = teams.map((t) => ({ team: t.name, color: t.color, word: r.node.data.committed[t.id] ? t.seal : null }));
        const done = teams.length > 0 && teams.every((t) => r.node.data.committed[t.id]);
        return [
          { t: 'title', text: 'Six seals' },
          { t: 'text', text: 'Each team holds a seal word. Speak it aloud for the room — then commit it. Six seals guard one sentence.' },
          { t: 'seals', slots },
          done
            ? { t: 'trans', from: 'RECORDS', text: `ALL SEALS COMMITTED — the custody phrase is revealed: “${CUSTODY_PHRASE}.”` }
            : { t: 'timer', label: 'Seal window' },
        ];
      },
      phone(r, p) {
        const t = teamOf(r, p);
        const teams = nonEmptyTeams(r);
        const done = teams.length > 0 && teams.every((x) => r.node.data.committed[x.id]);
        if (r.node.data.committed[t.id]) {
          return [
            { t: 'title', text: 'Seal committed' },
            done ? { t: 'trans', from: 'RECORDS', text: `The custody phrase: “${CUSTODY_PHRASE}.”` } : { t: 'status', text: 'Waiting for the other teams’ seals…' },
          ];
        }
        return [
          { t: 'title', text: 'Commit your seal' },
          { t: 'secret', text: `Your team’s seal word is ${t.seal}.` },
          { t: 'do', text: 'Stand. Speak the word aloud so the room hears it. Then commit it below.' },
          { t: 'typed', id: 'seal', prompt: `Team ${t.name}’s seal word`, placeholder: 'Seal word' },
        ];
      },
      act(r, player, a) {
        const t = teamOf(r, player);
        if (a.kind === 'seal' && t && !r.node.data.committed[t.id]) {
          if (normKey(a.value) === normKey(t.seal)) {
            r.node.data.committed[t.id] = true;
            awardTeam(r, t, 'seal-committed', 1, 'Committed their seal');
            return { ok: true };
          }
          return { ok: false, error: 'That is not your team’s seal word. Check your dossier.' };
        }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        const teams = nonEmptyTeams(r);
        if (teams.length && teams.every((t) => r.node.data.committed[t.id])) {
          r.vars.sealsCommitted = true;
          r.vars.custodyPhrase = CUSTODY_PHRASE;
          for (const pid of Object.keys(r.players)) award(r, pid, 'collective-seals', 1, 'Every seal was committed');
          return 'attribution';
        }
        return null;
      },
      onTimeout(r) {
        r.vars.sealsCommitted = false;
        return 'attribution';
      },
    },

    // ------------------------------------------------------ ATTRIBUTION
    {
      id: 'attribution',
      part: 'Attribution',
      durationMs: 120000,
      enter(r) { r.node.data.attr = {}; },
      host(r) {
        const ps = Object.values(r.players);
        const n = Object.keys(r.node.data.attr).length;
        const decided = n === ps.length && ps.length > 0;
        return [
          { t: 'title', text: 'Attribution' },
          { t: 'text', text: 'Every player decides how their own testimony is attributed. One request to seal keeps the field sealed: publishing a protected name requires authorization from every player in the room.' },
          decided ? { t: 'status', text: 'All attributions recorded.' } : { t: 'timer', label: 'Attribution window' },
        ];
      },
      phone(r, p) {
        if (r.node.data.attr[p.id]) return [{ t: 'title', text: 'Attribution recorded' }, { t: 'status', text: 'Waiting for the room…' }];
        return [
          { t: 'title', text: 'How should you be attributed?' },
          { t: 'text', text: 'Your choice governs your own testimony.' },
          { t: 'choices', id: 'attr', prompt: 'My testimony should be…', options: [
            { id: 'named', label: 'Named — put my name on it' },
            { id: 'anonymous', label: 'Anonymous — the account matters, not me' },
            { id: 'sealed', label: 'Sealed — no one publishes this without all of us agreeing' },
          ]},
        ];
      },
      act(r, player, a) {
        if (a.kind === 'attr' && ['named', 'anonymous', 'sealed'].includes(a.value) && !r.node.data.attr[player.id]) {
          r.node.data.attr[player.id] = a.value;
          award(r, player.id, 'attribution', 1, 'Chose how to be attributed');
          return { ok: true };
        }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        const ps = Object.values(r.players);
        const at = r.node.data.attr;
        if (ps.length && ps.every((p) => at[p.id])) {
          const vals = ps.map((p) => at[p.id]);
          r.vars.attribution = vals.includes('sealed') ? 'sealed' : vals.includes('anonymous') ? 'anonymous' : 'named';
          return 'final-vote';
        }
        return null;
      },
      onTimeout(r) {
        const ps = Object.values(r.players);
        for (const p of ps) if (!r.node.data.attr[p.id]) r.node.data.attr[p.id] = 'anonymous';
        r.vars.attribution = Object.values(r.node.data.attr).includes('sealed') ? 'sealed' : 'anonymous';
        return 'final-vote';
      },
    },

    // ------------------------------------------------------ FINAL VOTE
    {
      id: 'final-vote',
      part: 'Final authorization',
      durationMs: 300000,
      enter(r) { r.node.data.votes = {}; r.node.data.principles = {}; },
      host(r) {
        const ps = Object.values(r.players);
        const v = r.node.data.votes;
        const n = Object.keys(v).length;
        const canUnlock = r.vars.sealsCommitted && r.vars.boardComplete && r.vars.crossComplete;
        const counts = { release: 0, retain: 0, erase: 0, unlock: 0 };
        for (const k of Object.keys(v)) if (counts[v[k]] !== undefined) counts[v[k]]++;
        return [
          { t: 'title', text: 'Final authorization' },
          { t: 'text', text: 'Negotiate across teams. The room must converge: release, retain, erase — or unlock an independent record. A single option needs three-fifths of the room.' },
          canUnlock
            ? { t: 'text', text: 'UNLOCK is available: every seal committed, every thread filed, every question answered.' }
            : { t: 'status', text: 'UNLOCK is unavailable: the independent record isn’t complete enough.' },
          { t: 'tally', counts, total: ps.length },
          n === ps.length && n > 0
            ? { t: 'status', text: 'All votes cast. Computing…' }
            : { t: 'timer', label: 'Authorization window' },
        ];
      },
      phone(r, p) {
        const canUnlock = r.vars.sealsCommitted && r.vars.boardComplete && r.vars.crossComplete;
        if (r.node.data.votes[p.id]) return [{ t: 'title', text: 'Vote cast' }, { t: 'status', text: 'Waiting for the room…' }];
        return [
          { t: 'title', text: 'Decide together' },
          { t: 'do', text: 'Talk across teams, out loud. Then vote — and declare what the account should preserve.' },
          { t: 'choices', id: 'final', prompt: 'The account should be…', options: [
            { id: 'release', label: 'RELEASED — publish the testimony' },
            { id: 'retain', label: 'RETAINED — kept private and incomplete' },
            { id: 'erase', label: 'ERASED — let the archive end' },
            ...(canUnlock ? [{ id: 'unlock', label: 'UNLOCKED — establish an independent record' }] : []),
          ]},
          ...(canUnlock ? [] : [{ t: 'status', text: 'UNLOCK is unavailable: the independent record isn’t complete enough.' }]),
          { t: 'choices', id: 'principle', prompt: 'The account should above all preserve…', options: [
            { id: 'accountability', label: 'Accountability — name what happened' },
            { id: 'protection', label: 'Protection — shield the vulnerable' },
            { id: 'disagreement', label: 'Disagreement — keep what we couldn’t resolve' },
          ]},
        ];
      },
      act(r, player, a) {
        const d = r.node.data;
        if (a.kind === 'final' && ['release', 'retain', 'erase', 'unlock'].includes(a.value) && !d.votes[player.id]) {
          if (a.value === 'unlock' && !(r.vars.sealsCommitted && r.vars.boardComplete && r.vars.crossComplete)) {
            return { ok: false, error: 'UNLOCK is unavailable: the independent record isn’t complete enough.' };
          }
          d.votes[player.id] = a.value;
          award(r, player.id, 'final-vote', 1, 'Cast a final authorization vote');
          return { ok: true };
        }
        if (a.kind === 'principle' && ['accountability', 'protection', 'disagreement'].includes(a.value) && !d.principles[player.id]) {
          d.principles[player.id] = a.value;
          award(r, player.id, 'principle', 1, 'Declared what the account should preserve');
          return { ok: true };
        }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        const ps = Object.values(r.players);
        const d = r.node.data;
        if (ps.length && ps.every((p) => d.votes[p.id] && d.principles[p.id])) {
          r.vars.finalVotes = { ...d.votes };
          return 'letter';
        }
        return null;
      },
      onTimeout(r) {
        const ps = Object.values(r.players);
        for (const p of ps) {
          if (!r.node.data.votes[p.id]) r.node.data.votes[p.id] = 'retain';
          if (!r.node.data.principles[p.id]) r.node.data.principles[p.id] = 'disagreement';
        }
        r.vars.finalVotes = { ...r.node.data.votes };
        return 'letter';
      },
    },

    // ------------------------------------------------------ LETTER
    {
      id: 'letter',
      part: 'Letter and reunion',
      enter(r) {
        r.ending = computeEnsembleEnding(r);
        r.node.data.opened = {};
      },
      host(r) {
        const e = r.ending;
        return [
          { t: 'title', text: e.title },
          { t: 'trans', from: 'RECORDS', text: e.hostLine },
          { t: 'text', text: 'Open packet 000 — the sealed letter in the middle of the room. Each of you has your own closing letter on your phone.' },
          { t: 'do', text: 'Reunion: explain a decision your team made, acknowledge a disagreement — or keep something private. This part is yours, not the software’s.' },
          { t: 'teams' },
          { t: 'go', id: 'to-postshow', label: 'Continue', hostOnly: true },
        ];
      },
      phone(r, p) {
        const L = ensembleLetterFor(r, p);
        if (!r.node.data.opened[p.id]) {
          return [
            { t: 'title', text: 'Packet 000' },
            { t: 'do', text: 'Break the seal on packet 000 in the middle of the room. Then open your letter.' },
            { t: 'go', id: 'open-letter', label: 'Open my letter' },
          ];
        }
        return [
          { t: 'title', text: 'Your letter' },
          { t: 'text', text: L.body },
          { t: 'secret', text: `Your designation: ${L.designation}` },
          { t: 'status', text: 'When you’re ready, the host will continue.' },
        ];
      },
      act(r, player, a) {
        if (a.kind === 'open-letter' && !r.node.data.opened[player.id]) {
          r.node.data.opened[player.id] = true;
          award(r, player.id, 'opened-letter', 1, 'Opened packet 000 and read the closing letter');
          return { ok: true };
        }
        if (a.kind === 'to-postshow') { r.node.data.toPostshow = true; return { ok: true }; }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        if (r.node.data.toPostshow) return 'postshow';
        return null;
      },
    },

    // ------------------------------------------------------ POST-SHOW
    {
      id: 'postshow',
      part: 'Post-show',
      enter(r) { r.node.data.showAt = Date.now() + 45000; r.node.data.revealed = false; },
      host(r) {
        const revealed = r.node.data.revealed;
        const teams = nonEmptyTeams(r).map((t) => {
          const ms = teamMembers(r, t);
          const avg = ms.length ? ms.reduce((s, p) => s + (clear(r, p.id).score || 0), 0) / ms.length : 0;
          return `Team ${t.name}: ${clearanceLevel({ score: avg }).name}`;
        });
        return [
          { t: 'title', text: 'After' },
          { t: 'trans', from: 'RECORDS', text: teams.join('  ·  ') },
          revealed
            ? { t: 'trans', from: 'Sleuth & Sip', text: 'Sleuth & Sip 001 — “The Building Remembers.” A door was sealed from the inside. The key was never made. Someone is still knocking. [teaser — not yet playable]' }
            : { t: 'timer', label: 'Further transmission in' },
        ];
      },
      phone(r, p) {
        const revealed = r.node.data.revealed;
        const c = clear(r, p.id);
        return [
          { t: 'title', text: 'After' },
          { t: 'secret', text: `Clearance: ${clearanceLevel(c).name} — ${c.score} contributions recorded.` },
          revealed
            ? { t: 'trans', from: 'Sleuth & Sip', text: 'Sleuth & Sip 001 — “The Building Remembers.” A door was sealed from the inside. The key was never made. Someone is still knocking.' }
            : { t: 'status', text: 'A delayed attachment is on its way…' },
        ];
      },
      act() { return { ok: false, error: 'nothing to do yet' }; },
      advance(r) {
        if (r.node.data.revealed && !r.node.data.done) { r.node.data.done = true; r.status = 'ended'; }
        return null;
      },
    },
  ],
};

// ---------------------------------------------------------------- endings
const ENDINGS = {
  RETURN: { title: 'RETURN', hostLine: 'Six threads, one account. The testimony is restored — with the original evidence, and with a room willing to stand behind it.' },
  ARCHIVE: { title: 'ARCHIVE', hostLine: 'A record survives, but it is partial: something essential was withheld, sealed, or left unresolved.' },
  SILENCE: { title: 'SILENCE', hostLine: 'The archive ends here. What remains is carried by the physical account — and by the people in this room.' },
  'OPEN DOOR': { title: 'OPEN DOOR', hostLine: 'An independent record is established — verified by discovery, authorized by every team. CONTINUITY did not write this one.' },
  LOOP: { title: 'LOOP', hostLine: 'The room preserves unresolved disagreement. The account remains open — and so does the door to 001.' },
};

export function ensembleEndingById(id) {
  const e = ENDINGS[id] || ENDINGS.ARCHIVE;
  return { id, title: e.title, hostLine: e.hostLine };
}

export function computeEnsembleEnding(r) {
  const v = r.vars;
  if (v.forceEnding) return ensembleEndingById(v.forceEnding);
  const votes = (r.node && r.node.data && r.node.data.votes) || v.finalVotes || {};
  const counts = { release: 0, retain: 0, erase: 0, unlock: 0 };
  for (const pid of Object.keys(votes)) if (counts[votes[pid]] !== undefined) counts[votes[pid]]++;
  const total = Math.max(1, Object.keys(votes).length);
  let action = null;
  for (const k of Object.keys(counts)) if (counts[k] / total >= 0.6) action = k;
  v.agreement = !!action;
  v.finalAction = action || 'disagreement';
  if (!action) return ensembleEndingById('LOOP');
  if (action === 'erase') return ensembleEndingById('SILENCE');
  if (action === 'retain') return ensembleEndingById('ARCHIVE');
  if (action === 'unlock') return ensembleEndingById('OPEN DOOR');
  if (v.sealsCommitted && v.boardComplete) return ensembleEndingById('RETURN');
  return ensembleEndingById('ARCHIVE');
}

export function ensembleLetterFor(r, p) {
  const v = r.vars;
  const t = teamOf(r, p);
  const d = t ? dossierById(t.dossier) : null;
  const c = clear(r, p.id);
  const data = (r.node && r.node.data) || {};
  const parts = [];
  parts.push(`${p.name} — Team ${t ? t.name : '—'}`);
  parts.push('');
  if (d) parts.push(`You carried the ${d.name} thread — the one thing only your team knew. The room could not have solved this without it.`);
  if (t) parts.push(`Your seal was ${t.seal}. Spoken aloud, committed with five others, it opened the custody phrase: “${v.custodyPhrase || CUSTODY_PHRASE}.”`);
  const vote = (data.votes && data.votes[p.id]) || (v.finalVotes && v.finalVotes[p.id]);
  const pr = (data.principles && data.principles[p.id]);
  if (vote) parts.push(`You voted ${vote.toUpperCase()}.${pr ? ` You asked the account to preserve ${pr}.` : ''}`);
  if (v.attribution === 'sealed') parts.push('Your testimony is sealed. No one publishes it without all of you. That is a promise the software can actually keep.');
  if (v.attribution === 'named') parts.push('Your name is on the account. That took nerve.');
  parts.push('');
  parts.push('Iona Vale kept her testimony and left the building. You kept each other company for one strange evening — six teams, one room, one account. That counts.');
  parts.push('— U.');
  let designation = `TEAM ${t ? t.name : '—'}`;
  if (v.attribution === 'sealed') designation += ' · SEALED WITNESS';
  else if (v.attribution === 'anonymous') designation += ' · ANONYMOUS WITNESS';
  else if (v.attribution === 'named') designation += ' · NAMED WITNESS';
  const lvl = clearanceLevel(c).name;
  if (lvl === 'RESTRICTED' || lvl === 'VERIFIED') designation += ` · ${lvl}`;
  return { body: parts.join('\n'), designation };
}

// ---------------------------------------------------------------- kit
export function ensembleKitPages() {
  const pages = [
    { id: 'prep', title: 'Preparation — Ensemble', body: `Sleuth & Sip — ENSEMBLE · The Room That Remembers\n\nYou need: one shared screen (laptop or tablet), at least one phone per team, and these printed pages.\n\nForm up to six teams. Give each team its dossier page below —\nface-down until the briefing ends.\n\nPlace packet 000 — sealed — in the middle of the room.\nDo not open it until the software tells you.\n\nAllow 45–60 minutes, plus preparation. The room solves it together.` },
  ];
  for (const d of DOSSIERS) {
    pages.push({ id: 'dossier-' + d.id, title: `Dossier ${d.name} — Team ${d.name}`, body: d.kit + `\n\nSeal word: ${d.seal}\n\n(Your personal thread continues on your team’s phone.)` });
  }
  pages.push({ id: '000', title: 'Packet 000 — DO NOT OPEN until instructed', body: `SEALED — open only when the software tells you.\n\n(Your personal letter is on your phone. This envelope is a prop for the moment of opening. Put something meaningful inside it — a blank card is fine. The ritual matters more than the contents.)` });
  return pages;
}

// ---------------------------------------------------------------- test fixtures
// Marks team progress so test-jump can land mid-episode. Stages accumulate.
const STAGES = ['begun', 'read', 'submitted', 'solved', 'committed'];
const STAGE_FOR_NODE = {
  'first-thread': 'begun',
  'evidence-board': 'read',
  'cross-exam': 'submitted',
  'the-gap': 'solved',
  'attribution': 'committed',
  'final-vote': 'committed',
  'letter': 'committed',
  'postshow': 'committed',
};

export function ensembleFixtureFor(nodeId) {
  return (r) => {
    const stage = STAGE_FOR_NODE[nodeId];
    if (!stage) return;
    r.board = [];
    const d = r.node.data;
    d.begun = d.begun || {}; d.read = d.read || {}; d.submitted = d.submitted || {};
    d.solved = d.solved || {}; d.committed = d.committed || {};
    const upto = STAGES.indexOf(stage);
    const teams = nonEmptyTeams(r);
    for (const t of teams) {
      if (upto >= 0) d.begun[t.id] = true;
      if (upto >= 1) d.read[t.id] = true;
      if (upto >= 2 && !d.submitted[t.id]) {
        d.submitted[t.id] = { text: `(fixture) Team ${t.name}’s essential finding.`, by: 'fixture', at: Date.now() };
        r.board.push({ team: t.name, color: t.color, text: d.submitted[t.id].text, by: 'fixture', at: Date.now() });
      }
      if (upto >= 3) d.solved[t.id] = true;
      if (upto >= 4) d.committed[t.id] = true;
    }
    if (upto >= 2) r.vars.boardComplete = true;
    if (upto >= 3) r.vars.crossComplete = true;
    if (upto >= 4) { r.vars.sealsCommitted = true; r.vars.custodyPhrase = CUSTODY_PHRASE; }
    if (nodeId === 'letter') {
      r.vars.attribution = 'named';
      const ps = Object.values(r.players);
      for (const p of ps) {
        d.votes = d.votes || {};
        d.principles = d.principles || {};
        d.votes[p.id] = 'release';
        d.principles[p.id] = 'accountability';
      }
      r.vars.finalVotes = { ...(d.votes || {}) };
    }
    if (nodeId === 'letter') r.ending = computeEnsembleEnding(r); // enter ran before fixtures
  };
}

export function ensembleEndingPreset(id) {
  return { forceEnding: id, sealsCommitted: true, boardComplete: true, crossComplete: true, custodyPhrase: CUSTODY_PHRASE, attribution: 'named', agreement: id !== 'LOOP', finalAction: id === 'LOOP' ? 'disagreement' : id.toLowerCase().replace(' ', '') };
}
