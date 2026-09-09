// Sleuth & Sip — "The Room That Remembers"
// Authored, deterministic narrative engine. No generative improvisation:
// every reaction below is written out. The server owns scene state,
// deadlines, roles, choices, evidence, branches, clearance, and endings.

const norm = (s) => String(s || '').trim().toLowerCase();

export const EPISODE = {
  id: 'unknown-000',
  title: 'The Room That Remembers',
  tagline: 'The room’s records say it was empty. The phones suggest otherwise.',
  receivers: ['A', 'B'],

  nodes: [
    // ---------------------------------------------------------- LOBBY
    {
      id: 'lobby',
      part: 'Lobby',
      host(r) {
        const ps = Object.values(r.players);
        return [
          { t: 'title', text: 'Sleuth & Sip' },
          { t: 'text', text: 'The Room That Remembers · two receivers · one shared screen' },
          { t: 'code', text: r.code },
          { t: 'qr', text: r.qrDataUrl || r.joinUrl },
          { t: 'text', text: 'Each player joins from their phone. You will be assigned Receiver A or Receiver B.' },
          { t: 'status', text: ps.length === 0 ? 'Waiting for receivers…' : ps.map(p => `Receiver ${p.receiver} — ${p.name} ${p.ready ? '· ready' : '· not ready'}`).join('    ') },
          ...(ps.length === 2 && ps.every(p => p.ready)
            ? [{ t: 'go', id: 'start', label: 'Start the episode' }]
            : []),
        ];
      },
      phone(r, rc) {
        const p = r.players[r.byReceiver[rc]];
        return [
          { t: 'title', text: `Receiver ${rc}` },
          { t: 'secret', text: rc === 'A'
            ? 'Your starter packet is marked A. Keep it face-down until the briefing ends.'
            : 'Your starter packet is marked B. Keep it face-down until the briefing ends.' },
          { t: 'text', text: 'You will receive information the other receiver does not have. What you do with it is up to you.' },
          ...(p && !p.ready ? [{ t: 'go', id: 'ready', label: 'I’m ready' }] : [{ t: 'status', text: 'Waiting for the host to start…' }]),
        ];
      },
      act(r, player, a) {
        if (a.kind === 'ready') { player.ready = true; return { ok: true }; }
        return { ok: false, error: 'unknown action' };
      },
      advance() { return null; }, // host starts explicitly
    },

    // ---------------------------------------------------------- BRIEFING
    {
      id: 'briefing',
      part: 'Arrival',
      enter(r) { r.node.data.begun = {}; },
      host() {
        return [
          { t: 'title', text: 'Briefing' },
          { t: 'text', text: 'You need: two phones, this screen, and the paper kit — packets A, B, 01, 02, and the sealed packet 000 in the middle of the room.' },
          { t: 'text', text: 'The screen will show transmissions, timing, and consequences. Clues, choices, and endings live on the phones. Nobody needs to touch this screen during play.' },
          { t: 'text', text: 'Some scenes have deadlines. A missed answer changes the experience — it never leaves you stuck.' },
        ];
      },
      phone(r, rc) {
        const begun = r.node.data.begun[rc];
        return [
          { t: 'title', text: 'Briefing' },
          { t: 'text', text: rc === 'A'
            ? 'Open packet A. Inside is your starter sheet. Read it, then put it down.'
            : 'Open packet B. Inside is your starter sheet. Read it, then put it down.' },
          { t: 'do', text: 'Place packet 01 beneath an accessible table. Place packet 02 beside a mirror. Leave packet 000 sealed in the middle of the room.' },
          begun ? { t: 'status', text: 'Waiting for the other receiver…' } : { t: 'go', id: 'begin', label: 'Begin' },
        ];
      },
      act(r, player, a) {
        if (a.kind === 'begin') { r.node.data.begun[player.receiver] = true; return { ok: true }; }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        const b = r.node.data.begun;
        if (b.A && b.B) return 'arrival-call';
        return null;
      },
    },

    // ---------------------------------------------------------- ARRIVAL CALL
    {
      id: 'arrival-call',
      part: 'Arrival and call',
      durationMs: 25000,
      enter(r) {
        r.node.data.calls = {}; // rc -> 'answered'|'declined'|undefined
        r.vars.firstAnswer = null;
      },
      host(r) {
        const d = r.node.data;
        const answered = Object.entries(d.calls).filter(([, v]) => v === 'answered');
        return [
          { t: 'title', text: 'An incoming call' },
          { t: 'trans', from: 'SWITCHBOARD', text: 'Two lines ringing. The first receiver to answer takes custody of the initial transmission.' },
          { t: 'timer', label: 'Line closes in' },
          answered.length
            ? { t: 'status', text: `Receiver ${answered[0][0]} answered first — custody assigned.` }
            : { t: 'status', text: 'Both lines ringing…' },
        ];
      },
      phone(r, rc) {
        const st = r.node.data.calls[rc];
        if (st === 'answered') {
          return [
            { t: 'title', text: 'Line open' },
            { t: 'secret', text: rc === 'A'
              ? '“Receiver A. The record says the room was empty. It wasn’t. You have this line, and no one else does. Remember exactly what I told you.”'
              : '“Receiver B. Someone is going to tell you the room was empty. Ask them what EMPTY means. Don’t accept the first answer.”' },
            { t: 'say', text: rc === 'A'
              ? 'Receiver A. The record says the room was empty. It wasn’t. You have this line, and no one else does.'
              : 'Receiver B. Someone is going to tell you the room was empty. Ask them what EMPTY means.' },
            { t: 'status', text: r.vars.firstAnswer === rc ? 'You answered first. Custody of the initial transmission is yours.' : 'The other receiver answered first.' },
          ];
        }
        if (st === 'declined') return [{ t: 'title', text: 'Call declined' }, { t: 'text', text: 'The line is closed to you.' }];
        return [{ t: 'call', id: 'call', from: 'Sleuth & Sip', line: 'Incoming call…' }];
      },
      act(r, player, a) {
        const d = r.node.data;
        if (d.calls[player.receiver]) return { ok: false, error: 'already decided' };
        if (a.kind === 'answer-call') {
          d.calls[player.receiver] = 'answered';
          award(r, player.receiver, 'answered-call', 1, 'Answered the incoming call');
          if (!r.vars.firstAnswer) {
            r.vars.firstAnswer = player.receiver;
            award(r, player.receiver, 'first-answer', 1, 'Answered the call first');
          }
          return { ok: true };
        }
        if (a.kind === 'decline-call') { d.calls[player.receiver] = 'declined'; return { ok: true }; }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        const d = r.node.data;
        if (d.calls.A && d.calls.B) return 'private-exchange';
        return null;
      },
      onTimeout(r) {
        const d = r.node.data;
        for (const rc of ['A', 'B']) if (!d.calls[rc]) d.calls[rc] = 'unanswered';
        r.vars.lineRecovered = true; // fallback: transmission recovered from buffer
        return 'private-exchange';
      },
    },

    // ---------------------------------------------------------- PRIVATE EXCHANGE
    {
      id: 'private-exchange',
      part: 'Private exchange',
      enter(r) { r.node.data.reports = {}; },
      host(r) {
        const reps = r.node.data.reports;
        const keys = Object.keys(reps);
        return [
          { t: 'title', text: 'Compare accounts' },
          { t: 'text', text: 'Each receiver heard something different. Talk to each other. Then each of you reports — privately, on your phone — what you actually shared.' },
          keys.length
            ? { t: 'status', text: `${keys.length} of 2 reports filed.` }
            : { t: 'status', text: 'Waiting for reports…' },
        ];
      },
      phone(r, rc) {
        const rep = r.node.data.reports[rc];
        if (rep) return [{ t: 'title', text: 'Report filed' }, { t: 'status', text: 'Waiting for the other receiver…' }];
        return [
          { t: 'title', text: 'What did you share?' },
          { t: 'text', text: 'Nobody can verify this but you. Report honestly — the record will reflect what you claim.' },
          { t: 'choices', id: 'report', prompt: 'With the other receiver, I…', options: [
            { id: 'full', label: 'Shared everything I heard' },
            { id: 'part', label: 'Shared part of it' },
            { id: 'none', label: 'Kept it to myself' },
          ]},
        ];
      },
      act(r, player, a) {
        if (a.kind === 'report' && ['full', 'part', 'none'].includes(a.value)) {
          r.node.data.reports[player.receiver] = a.value;
          if (a.value === 'full') award(r, player.receiver, 'shared-fully', 1, 'Shared information fully');
          return { ok: true };
        }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        const reps = r.node.data.reports;
        if (reps.A && reps.B) {
          r.vars.exchangeReport = reps;
          return 'missing-minute';
        }
        return null;
      },
    },

    // ---------------------------------------------------------- MISSING MINUTE
    {
      id: 'missing-minute',
      part: 'Missing minute',
      durationMs: 180000,
      enter(r) { r.node.data.solved = {}; },
      host(r) {
        const solved = r.node.data.solved;
        return [
          { t: 'title', text: 'The missing minute' },
          { t: 'trans', from: 'RECORDS', text: 'One minute is absent from the room log. Receiver A holds a timestamp. Receiver B holds a rule. Combine them.' },
          Object.keys(solved).length
            ? { t: 'status', text: 'The minute is being recovered…' }
            : { t: 'timer', label: 'Archivist patience remaining' },
        ];
      },
      phone(r, rc) {
        if (r.node.data.solved[rc]) return [{ t: 'title', text: 'Recovered' }, { t: 'status', text: 'Waiting for the other receiver…' }];
        return [
          { t: 'title', text: 'The missing minute' },
          rc === 'A'
            ? { t: 'secret', text: 'Your starter sheet shows a timestamp: 02:14. The log jumps from 02:13 to 02:15.' }
            : { t: 'secret', text: 'Your starter sheet shows a rule: RULE C-0. It governs what may be written into a gap.' },
          { t: 'do', text: 'Ask the other receiver what they hold. Then enter the missing minute.' },
          { t: 'typed', id: 'minute', prompt: 'Enter the missing minute (MM:SS)', placeholder: '02:__' },
        ];
      },
      act(r, player, a) {
        if (a.kind === 'minute') {
          if (norm(a.value).replace(/[^0-9]/g, '') === '0214') {
            r.node.data.solved[player.receiver] = true;
            award(r, player.receiver, 'missing-minute', 1, 'Recovered the missing minute');
            return { ok: true };
          }
          return { ok: false, error: 'That doesn’t match the gap in the log. Compare with the other receiver and try again.' };
        }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        const s = r.node.data.solved;
        if (s.A && s.B) { r.vars.minuteRecovered = true; r.vars.evidence = (r.vars.evidence || 0) + 1; return 'investigation'; }
        return null;
      },
      onTimeout(r) {
        r.vars.minuteRecovered = false; // recovered from buffer, no clearance
        r.node.data.solved = { A: true, B: true };
        return 'investigation';
      },
    },

    // ---------------------------------------------------------- INVESTIGATION
    {
      id: 'investigation',
      part: 'Investigation',
      enter(r) { r.node.data.approach = {}; r.node.data.obs = {}; },
      host(r) {
        const d = r.node.data;
        const ap = d.approach;
        let mode = null;
        if (ap.A && ap.B) mode = ap.A === ap.B ? ap.A : 'split';
        return [
          { t: 'title', text: 'Investigation' },
          { t: 'text', text: 'Two evidence packets wait in the room: 01 beneath the table, 02 beside the mirror. Digital copies are on your phones.' },
          !mode ? { t: 'status', text: 'Receivers are deciding how to proceed…' }
            : mode === 'together'
              ? { t: 'trans', from: 'FIELD NOTES', text: 'The receivers move together. Whatever they find, they find at the same time.' }
              : { t: 'trans', from: 'FIELD NOTES', text: 'The receivers split up. Each will see something the other does not.' },
          { t: 'status', text: `${Object.keys(d.obs).length} of 2 observations filed.` },
        ];
      },
      phone(r, rc) {
        const d = r.node.data;
        if (!d.approach[rc]) {
          return [
            { t: 'title', text: 'How do you investigate?' },
            { t: 'choices', id: 'approach', prompt: 'Search…', options: [
              { id: 'together', label: 'Together — stay side by side' },
              { id: 'split', label: 'Split up — cover more ground' },
            ]},
          ];
        }
        const ap = d.approach;
        const mode = ap.A && ap.B ? (ap.A === ap.B ? ap.A : 'split') : null;
        if (d.obs[rc]) return [{ t: 'title', text: 'Observation filed' }, { t: 'status', text: 'Waiting for the other receiver…' }];
        const which = mode === 'split' ? (rc === 'A' ? '01' : '02') : '01 and 02';
        return [
          { t: 'title', text: `Examine packet ${which}` },
          mode === 'split' && rc === 'A' ? { t: 'secret', text: 'PACKET 01 — beneath the table. A maintenance log, water-stained. The 02:14 entry is torn out, but the page beneath it carries an impression: “…she asked for the light to stay on.”' } : null,
          mode === 'split' && rc === 'B' ? { t: 'secret', text: 'PACKET 02 — beside the mirror. A visitor slip, unsigned. In different handwriting: “…she asked for the light to stay on.” The same sentence. Two hands wrote it.' } : null,
          (!mode || mode === 'together') ? { t: 'secret', text: 'PACKET 01 — a maintenance log with the 02:14 entry torn out; the page beneath carries an impression: “…she asked for the light to stay on.” PACKET 02 — an unsigned visitor slip bearing the same sentence in different handwriting.' } : null,
          { t: 'do', text: mode === 'split' ? 'Find your packet in the room. Read it physically, then file what you noticed.' : 'Find both packets in the room. Read them physically, then file what you noticed.' },
          { t: 'typed', id: 'obs', prompt: 'What did you notice? (one observation)', placeholder: 'Type what stood out…' },
        ].filter(Boolean);
      },
      act(r, player, a) {
        const d = r.node.data;
        if (a.kind === 'approach' && ['together', 'split'].includes(a.value)) {
          d.approach[player.receiver] = a.value;
          return { ok: true };
        }
        if (a.kind === 'obs') {
          if (String(a.value || '').trim().length < 3) return { ok: false, error: 'File at least a few words.' };
          d.obs[player.receiver] = String(a.value).trim();
          r.vars.evidence = (r.vars.evidence || 0) + 1;
          award(r, player.receiver, 'observation', 1, 'Filed a useful observation');
          return { ok: true };
        }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        const d = r.node.data;
        if (d.approach.A && d.approach.B && d.obs.A && d.obs.B) {
          r.vars.investigationMode = d.approach.A === d.approach.B ? d.approach.A : 'split';
          if (d.approach.A !== d.approach.B) r.vars.disagreed = true;
          return 'silence-correction';
        }
        return null;
      },
    },

    // ---------------------------------------------------------- SILENCE AND CORRECTION
    {
      id: 'silence-correction',
      part: 'Silence and correction',
      durationMs: 120000,
      enter(r) { r.node.data.decision = {}; },
      host(r) {
        const dec = r.node.data.decision;
        const decided = Object.keys(dec).length > 0;
        return [
          { t: 'title', text: 'An empty place' },
          { t: 'trans', from: 'CONTINUITY', text: 'This account has gaps. I can repair them — smooth the edges, reconcile the contradictions, make the record whole. Shall I?' },
          !decided ? { t: 'timer', label: 'Offer stands for' } : null,
          dec.A === 'accept' || dec.B === 'accept'
            ? { t: 'trans', from: 'CONTINUITY', text: 'REPAIR COMPLETE. The gaps have been filled. The account now agrees with itself. ✓' }
            : decided ? { t: 'trans', from: 'RECORDS', text: 'ORIGINAL PRESERVED — by receiver decision. The gaps remain gaps.' } : null,
        ].filter(Boolean);
      },
      phone(r, rc) {
        const dec = r.node.data.decision[rc];
        if (dec) return [{ t: 'title', text: 'Decision recorded' }, { t: 'status', text: dec === 'accept' ? 'You accepted the repair.' : 'You refused the repair.' }, { t: 'status', text: 'Waiting for the other receiver…' }];
        return [
          { t: 'title', text: 'An offer' },
          { t: 'text', text: 'CONTINUITY offers to repair the account — to fill the gaps and reconcile every contradiction so the record agrees with itself.' },
          { t: 'do', text: 'Look at the shared screen. Consider what a repaired record would be worth — and what it would cost.' },
          { t: 'choices', id: 'repair', prompt: 'Do you accept the repair?', options: [
            { id: 'accept', label: 'Accept — make the record whole' },
            { id: 'refuse', label: 'Refuse — preserve the original' },
          ]},
        ];
      },
      act(r, player, a) {
        if (a.kind === 'repair' && ['accept', 'refuse'].includes(a.value)) {
          r.node.data.decision[player.receiver] = a.value;
          if (a.value === 'refuse') award(r, player.receiver, 'preserve-original', 1, 'Refused to let the original be repaired');
          return { ok: true };
        }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        const dec = r.node.data.decision;
        if (dec.A && dec.B) {
          r.vars.repaired = dec.A === 'accept' || dec.B === 'accept';
          r.vars.preservedOriginal = !r.vars.repaired;
          return 'identity-testimony';
        }
        return null;
      },
      onTimeout(r) {
        const dec = r.node.data.decision;
        for (const rc of ['A', 'B']) if (!dec[rc]) dec[rc] = 'refuse'; // silence counts as refusal
        r.vars.repaired = dec.A === 'accept' || dec.B === 'accept';
        r.vars.preservedOriginal = !r.vars.repaired;
        return 'identity-testimony';
      },
    },

    // ---------------------------------------------------------- IDENTITY AND TESTIMONY
    {
      id: 'identity-testimony',
      part: 'Identity and testimony',
      durationMs: 240000,
      enter(r) { r.node.data.named = {}; r.node.data.played = {}; },
      host(r) {
        const named = Object.keys(r.node.data.named).length > 0;
        return [
          { t: 'title', text: 'The recorded witness' },
          !named
            ? { t: 'trans', from: 'RECORDS', text: 'A witness recording exists. The name attached to it has been redacted. Recover the name.' }
            : { t: 'trans', from: 'RECORDS', text: 'Witness identified: IONA VALE. Playing her recording.' },
          named ? { t: 'timer', label: 'Recording ends in' } : null,
        ].filter(Boolean);
      },
      phone(r, rc) {
        const d = r.node.data;
        if (!d.named[rc]) {
          return [
            { t: 'title', text: 'Who is the witness?' },
            rc === 'A'
              ? { t: 'secret', text: 'Your fragments mention her twice. Packet 01’s impression: “…she asked for the light to stay on.” The maintenance log margin: “I.V. was here.”' }
              : { t: 'secret', text: 'Your fragments mention her twice. The visitor slip: “…she asked for the light to stay on.” Your starter sheet’s last line: “…Vale kept the original.”' },
            { t: 'do', text: 'Compare with the other receiver. Her full name is split between you.' },
            { t: 'typed', id: 'witness-name', prompt: 'Enter the witness’s full name', placeholder: 'First Last' },
          ];
        }
        if (!d.played[rc]) {
          return [
            { t: 'title', text: 'Iona Vale — recording' },
            { t: 'say', text: 'My name is Iona Vale. I was in the room during the missing minute. I am not inside this machine — I preserved my testimony and I left the building. What is still at risk is the account of what happened. They will try to make every version agree. Agreement is not truth. Keep the original.' },
            { t: 'text', text: 'She is not trapped in the software. She left. What remains at risk is the account itself.' },
            { t: 'go', id: 'heard', label: 'I’ve heard it' },
          ];
        }
        return [{ t: 'title', text: 'Testimony heard' }, { t: 'status', text: 'Waiting for the other receiver…' }];
      },
      act(r, player, a) {
        const d = r.node.data;
        if (a.kind === 'witness-name') {
          const v = norm(a.value).replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
          if (v === 'iona vale') {
            d.named[player.receiver] = true;
            award(r, player.receiver, 'witness-named', 1, 'Recovered the witness’s name');
            return { ok: true };
          }
          return { ok: false, error: 'The records don’t recognize that name. Compare fragments with the other receiver.' };
        }
        if (a.kind === 'heard') {
          d.played[player.receiver] = true;
          award(r, player.receiver, 'heard-testimony', 1, 'Heard the witness’s recording in full');
          return { ok: true };
        }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        const d = r.node.data;
        if (d.named.A && d.named.B && d.played.A && d.played.B) {
          r.vars.ionaHeard = true;
          r.vars.evidence = (r.vars.evidence || 0) + 1;
          return 'physical-revelation';
        }
        return null;
      },
      onTimeout(r) {
        const d = r.node.data;
        d.named = { A: true, B: true }; d.played = { A: true, B: true };
        r.vars.ionaHeard = true;
        return 'physical-revelation';
      },
    },

    // ---------------------------------------------------------- PHYSICAL REVELATION
    {
      id: 'physical-revelation',
      part: 'Physical revelation',
      enter(r) { r.node.data.answered = {}; },
      host() {
        return [
          { t: 'title', text: 'Revisit the first sheet' },
          { t: 'trans', from: 'RECORDS', text: 'RULE C-0, retrieved from the procedures appendix: “An entry marked EMPTY certifies only that no independent countersignature was obtained. It is not a finding of absence.”' },
          { t: 'text', text: 'The designation EMPTY / RULE C-0 never established that nobody was present. It established that nobody countersigned.' },
        ];
      },
      phone(r, rc) {
        if (r.node.data.answered[rc]) return [{ t: 'title', text: 'Answered' }, { t: 'status', text: 'Waiting for the other receiver…' }];
        return [
          { t: 'title', text: 'What did EMPTY mean?' },
          { t: 'do', text: 'Take out your very first sheet — the one marked EMPTY / RULE C-0. Read it again with the new definition.' },
          { t: 'choices', id: 'empty-meaning', prompt: 'All along, EMPTY established…', options: [
            { id: 'absence', label: 'That nobody was present' },
            { id: 'countersign', label: 'Only that no countersignature was obtained' },
            { id: 'erased', label: 'That the record had been erased' },
          ]},
        ];
      },
      act(r, player, a) {
        if (a.kind === 'empty-meaning') {
          r.node.data.answered[player.receiver] = a.value;
          if (a.value === 'countersign') award(r, player.receiver, 'empty-meaning', 1, 'Understood what EMPTY established');
          return { ok: true };
        }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        const an = r.node.data.answered;
        if (an.A && an.B) {
          r.vars.emptyUnderstood = an.A === 'countersign' && an.B === 'countersign';
          return 'attribution';
        }
        return null;
      },
    },

    // ---------------------------------------------------------- ATTRIBUTION
    {
      id: 'attribution',
      part: 'Attribution',
      enter(r) { r.node.data.attr = {}; },
      host(r) {
        const at = r.node.data.attr;
        const done = at.A && at.B;
        let field = 'Witness field: undeclared';
        if (done) {
          if (at.A === 'sealed' || at.B === 'sealed') field = 'Witness field: SEALED — at a receiver’s request. Publishing a sealed name requires unanimous authorization.';
          else if (at.A === 'anonymous' || at.B === 'anonymous') field = 'Witness field: ANONYMOUS — the account survives without names.';
          else field = 'Witness field: NAMED — both receivers stand behind the account openly.';
        }
        return [
          { t: 'title', text: 'Attribution' },
          { t: 'text', text: 'A second witness supplied evidence and asked to remain anonymous. Publishing everything may make the account easier to verify — and would break that confidence.' },
          { t: 'trans', from: 'RECORDS', text: field },
        ];
      },
      phone(r, rc) {
        if (r.node.data.attr[rc]) return [{ t: 'title', text: 'Attribution recorded' }, { t: 'status', text: 'Waiting for the other receiver…' }];
        return [
          { t: 'title', text: 'How should you be attributed?' },
          { t: 'text', text: 'Your choice governs your own testimony. A request to seal keeps the field sealed: publishing a protected name requires authorization from every original receiver.' },
          { t: 'choices', id: 'attr', prompt: 'My testimony should be…', options: [
            { id: 'named', label: 'Named — put my name on it' },
            { id: 'anonymous', label: 'Anonymous — the account matters, not me' },
            { id: 'sealed', label: 'Sealed — no one publishes this without all of us agreeing' },
          ]},
        ];
      },
      act(r, player, a) {
        if (a.kind === 'attr' && ['named', 'anonymous', 'sealed'].includes(a.value)) {
          r.node.data.attr[player.receiver] = a.value;
          return { ok: true };
        }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        const at = r.node.data.attr;
        if (at.A && at.B) {
          r.vars.attribution = (at.A === 'sealed' || at.B === 'sealed') ? 'sealed' : (at.A === 'anonymous' || at.B === 'anonymous') ? 'anonymous' : 'named';
          return 'evidence-exchange';
        }
        return null;
      },
    },

    // ---------------------------------------------------------- EVIDENCE EXCHANGE
    {
      id: 'evidence-exchange',
      part: 'Evidence exchange',
      durationMs: 180000,
      enter(r) {
        r.node.data.done = {};
        r.node.data.seals = { A: 'CINDER', B: 'HARBOR' };
      },
      host(r) {
        const done = Object.keys(r.node.data.done).length;
        return [
          { t: 'title', text: 'Exchange of seals' },
          { t: 'text', text: 'Each receiver holds a seal and a custody word. Exchange them — speak the words aloud — then each enters the word they were given.' },
          done === 2
            ? { t: 'trans', from: 'RECORDS', text: 'Exchange validated. Both contributors credited. Iona Vale’s full statement is released.' }
            : { t: 'timer', label: 'Exchange window' },
        ];
      },
      phone(r, rc) {
        const other = rc === 'A' ? 'B' : 'A';
        if (r.node.data.done[rc]) return [{ t: 'title', text: 'Seal exchanged' }, { t: 'status', text: 'Waiting for the other receiver…' }];
        return [
          { t: 'title', text: 'Your seal' },
          { t: 'secret', text: `Your seal word is ${r.node.data.seals[rc]}. It belongs to Receiver ${other} now — tell them aloud.` },
          { t: 'do', text: `Ask Receiver ${other} for their seal word. Enter exactly what they tell you.` },
          { t: 'typed', id: 'seal', prompt: `Enter Receiver ${other}’s seal word`, placeholder: 'Seal word' },
        ];
      },
      act(r, player, a) {
        const d = r.node.data;
        if (a.kind === 'seal') {
          const other = player.receiver === 'A' ? 'B' : 'A';
          if (norm(a.value) === norm(d.seals[other])) {
            d.done[player.receiver] = true;
            award(r, player.receiver, 'seal-exchange', 1, 'Completed a validated seal exchange');
            return { ok: true };
          }
          return { ok: false, error: 'That doesn’t match. Ask the other receiver to speak their word clearly.' };
        }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        const done = r.node.data.done;
        if (done.A && done.B) { r.vars.validatedExchange = true; return 'witness-editorial'; }
        return null;
      },
      onTimeout(r) {
        r.vars.validatedExchange = false;
        return 'witness-editorial';
      },
    },

    // ---------------------------------------------------------- WITNESS AND EDITORIAL CHOICES
    {
      id: 'witness-editorial',
      part: 'Witness and editorial choices',
      enter(r) { r.node.data.ed = {}; },
      host(r) {
        const ed = r.node.data.ed;
        const done = ed.A && ed.B;
        const clauses = [];
        for (const rc of ['A', 'B']) {
          if (ed[rc]) clauses.push(`Receiver ${rc}: ${ed[rc].sign === 'yes' ? 'signed' : 'did not sign'} — preserves ${ed[rc].principle}.`);
        }
        return [
          { t: 'title', text: 'The surviving account' },
          { t: 'text', text: 'Decide whether to sign the account, and which principle it should preserve. Every position is valid. Your clauses will appear in what survives.' },
          ...(done ? [{ t: 'trans', from: 'RECORDS', text: clauses.join('  ·  ') }] : [{ t: 'status', text: `${Object.keys(ed).length} of 2 declarations filed.` }]),
        ];
      },
      phone(r, rc) {
        if (r.node.data.ed[rc]) return [{ t: 'title', text: 'Declaration filed' }, { t: 'status', text: 'Waiting for the other receiver…' }];
        return [
          { t: 'title', text: 'Your declaration' },
          { t: 'choices', id: 'sign', prompt: 'Do you sign the account?', options: [
            { id: 'yes', label: 'Yes — I stand behind it' },
            { id: 'no', label: 'No — I won’t sign' },
          ]},
          { t: 'choices', id: 'principle', prompt: 'The account should above all preserve…', options: [
            { id: 'accountability', label: 'Accountability — name what happened' },
            { id: 'protection', label: 'Protection — shield the vulnerable' },
            { id: 'disagreement', label: 'Disagreement — keep what we couldn’t resolve' },
          ]},
        ];
      },
      act(r, player, a) {
        const d = r.node.data;
        const cur = d.ed[player.receiver] || {};
        if (a.kind === 'sign' && ['yes', 'no'].includes(a.value)) { cur.sign = a.value; d.ed[player.receiver] = cur; }
        else if (a.kind === 'principle' && ['accountability', 'protection', 'disagreement'].includes(a.value)) { cur.principle = a.value; d.ed[player.receiver] = cur; }
        else return { ok: false, error: 'unknown action' };
        if (cur.sign && cur.principle && !cur.credited) {
          cur.credited = true;
          award(r, player.receiver, 'declaration', 1, 'Made a consequential declaration');
          if (cur.sign === 'yes') award(r, player.receiver, 'signed', 1, 'Signed the account');
        }
        return { ok: true };
      },
      advance(r) {
        const ed = r.node.data.ed;
        if (ed.A && ed.A.sign && ed.A.principle && ed.B && ed.B.sign && ed.B.principle) {
          r.vars.declarations = { A: { sign: ed.A.sign, principle: ed.A.principle }, B: { sign: ed.B.sign, principle: ed.B.principle } };
          return 'final-authorization';
        }
        return null;
      },
    },

    // ---------------------------------------------------------- FINAL AUTHORIZATION
    {
      id: 'final-authorization',
      part: 'Final authorization',
      durationMs: 300000,
      enter(r) { r.node.data.votes = {}; },
      host(r) {
        const v = r.node.data.votes;
        return [
          { t: 'title', text: 'Final authorization' },
          { t: 'text', text: 'Negotiate. You must agree on one action — release, retain, erase, or unlock an independent record.' },
          { t: 'text', text: 'UNLOCK requires an independent record: enough discoveries, and a validated exchange. Speak before you vote.' },
          Object.keys(v).length
            ? { t: 'status', text: `${Object.keys(v).length} of 2 votes cast.` }
            : { t: 'timer', label: 'Authorization window' },
        ];
      },
      phone(r, rc) {
        if (r.node.data.votes[rc]) return [{ t: 'title', text: 'Vote cast' }, { t: 'status', text: 'Waiting for the other receiver…' }];
        const canUnlock = (r.vars.evidence || 0) >= 4 && r.vars.validatedExchange;
        return [
          { t: 'title', text: 'Decide together' },
          { t: 'do', text: 'Talk it through out loud. Then vote — you must agree.' },
          { t: 'choices', id: 'final', prompt: 'The account should be…', options: [
            { id: 'release', label: 'RELEASED — publish the testimony' },
            { id: 'retain', label: 'RETAINED — kept private and incomplete' },
            { id: 'erase', label: 'ERASED — let the archive end' },
            ...(canUnlock ? [{ id: 'unlock', label: 'UNLOCKED — establish an independent record' }] : []),
          ]},
          ...(canUnlock ? [] : [{ t: 'status', text: 'UNLOCK is unavailable: the independent record isn’t complete enough.' }]),
        ];
      },
      act(r, player, a) {
        if (a.kind === 'final' && ['release', 'retain', 'erase', 'unlock'].includes(a.value)) {
          r.node.data.votes[player.receiver] = a.value;
          award(r, player.receiver, 'final-vote', 1, 'Cast a final authorization vote');
          return { ok: true };
        }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        const v = r.node.data.votes;
        if (v.A && v.B) {
          if (v.A === v.B) { r.vars.finalAction = v.A; r.vars.agreement = true; return 'letter'; }
          r.vars.disagreedFinal = true;
          return 'reconcile';
        }
        return null;
      },
      onTimeout(r) {
        const v = r.node.data.votes;
        for (const rc of ['A', 'B']) if (!v[rc]) v[rc] = 'retain';
        if (v.A === v.B) { r.vars.finalAction = v.A; r.vars.agreement = true; return 'letter'; }
        return 'reconcile';
      },
    },

    // ---------------------------------------------------------- RECONCILE
    {
      id: 'reconcile',
      part: 'Reconciliation',
      durationMs: 120000,
      enter(r) { r.node.data.votes = {}; },
      host() {
        return [
          { t: 'title', text: 'Reconciliation' },
          { t: 'trans', from: 'CONTINUITY', text: 'You do not agree. That is permitted. Speak once more — one of you may change your vote, or you may let the disagreement stand.' },
          { t: 'timer', label: 'Reconciliation window' },
        ];
      },
      phone(r, rc) {
        if (r.node.data.votes[rc]) return [{ t: 'title', text: 'Vote cast' }, { t: 'status', text: 'Waiting…' }];
        return [
          { t: 'title', text: 'One more vote' },
          { t: 'text', text: 'You may hold your position or change it. Unresolved disagreement is itself an ending.' },
          { t: 'choices', id: 'final2', prompt: 'The account should be…', options: [
            { id: 'release', label: 'RELEASED' },
            { id: 'retain', label: 'RETAINED' },
            { id: 'erase', label: 'ERASED' },
            { id: 'stand', label: 'Let the disagreement stand' },
          ]},
        ];
      },
      act(r, player, a) {
        if (a.kind === 'final2' && ['release', 'retain', 'erase', 'stand'].includes(a.value)) {
          r.node.data.votes[player.receiver] = a.value;
          award(r, player.receiver, 'final-vote', 1, 'Cast a final authorization vote');
          return { ok: true };
        }
        return { ok: false, error: 'unknown action' };
      },
      advance(r) {
        const v = r.node.data.votes;
        if (v.A && v.B) {
          if (v.A === v.B && v.A !== 'stand') { r.vars.finalAction = v.A; r.vars.agreement = true; }
          else { r.vars.agreement = false; r.vars.finalAction = 'disagreement'; }
          return 'letter';
        }
        return null;
      },
      onTimeout(r) { r.vars.agreement = false; r.vars.finalAction = 'disagreement'; return 'letter'; },
    },

    // ---------------------------------------------------------- LETTER AND REUNION
    {
      id: 'letter',
      part: 'Letter and reunion',
      enter(r) {
        r.ending = computeEnding(r);
        r.node.data.opened = {};
      },
      host(r) {
        const e = r.ending;
        return [
          { t: 'title', text: e.title },
          { t: 'trans', from: 'RECORDS', text: e.hostLine },
          { t: 'text', text: 'Open packet 000 — the sealed letter in the middle of the room. Each of you has your own closing letter on your phone.' },
          { t: 'do', text: 'Reunion: explain a decision, acknowledge a disagreement — or keep something private. This part is yours, not the software’s.' },
          { t: 'go', id: 'to-postshow', label: 'Continue', hostOnly: true },
        ];
      },
      phone(r, rc) {
        const L = letterFor(r, rc);
        if (!r.node.data.opened[rc]) {
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
        if (a.kind === 'open-letter') {
          r.node.data.opened[player.receiver] = true;
          award(r, player.receiver, 'opened-letter', 1, 'Opened packet 000 and read the closing letter');
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

    // ---------------------------------------------------------- POST-SHOW
    {
      id: 'postshow',
      part: 'Post-show',
      enter(r) { r.node.data.showAt = Date.now() + 45000; r.node.data.revealed = false; },
      host(r) {
        const revealed = r.node.data.revealed;
        return [
          { t: 'title', text: 'After' },
          { t: 'trans', from: 'RECORDS', text: `Final clearance — Receiver A: ${clearanceLevel(clear(r, 'A')).name}. Receiver B: ${clearanceLevel(clear(r, 'B')).name}.` },
          revealed
            ? { t: 'trans', from: 'Sleuth & Sip', text: 'Sleuth & Sip 001 — “The Building Remembers.” A door was sealed from the inside. The key was never made. Someone is still knocking. [teaser — not yet playable]' }
            : { t: 'timer', label: 'Further transmission in' },
        ];
      },
      phone(r, rc) {
        const revealed = r.node.data.revealed;
        return [
          { t: 'title', text: 'After' },
          { t: 'secret', text: `Clearance: ${clearanceLevel(clear(r, rc)).name} — ${clear(r, rc).score} contributions recorded.` },
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

// ---------------------------------------------------------------- helpers

export function award(r, rc, key, pts, reason) {
  const c = r.clearance[rc] || (r.clearance[rc] = { score: 0, log: [], keys: {} });
  if (c.keys[key]) return false; // no double-awarding, no farming retries
  c.keys[key] = true;
  c.score += pts;
  c.log.push({ reason, pts, at: Date.now() });
  return true;
}

export function clear(r, rc) { return r.clearance[rc] || { score: 0, log: [], keys: {} }; }

export function clearanceLevel(c) {
  const s = c.score;
  if (s >= 12) return { name: 'RESTRICTED', note: 'Privileged post-show material concerning 001.' };
  if (s >= 7) return { name: 'VERIFIED', note: 'Additional restricted information.' };
  if (s >= 3) return { name: 'PROVISIONAL', note: 'Updated access credential.' };
  return { name: 'UNLISTED', note: 'Normal participation.' };
}

export function computeEnding(r) {
  const v = r.vars;
  const witnesses = (v.validatedExchange ? 1 : 0) + (v.declarations ? Object.values(v.declarations).filter(d => d.sign === 'yes').length : 0);
  let id = 'ARCHIVE', title = 'ARCHIVE', hostLine = '';
  if (!v.agreement) {
    id = 'LOOP'; title = 'LOOP';
    hostLine = 'The room preserves unresolved disagreement. The account remains open — and so does the door to 001.';
  } else if (v.finalAction === 'erase') {
    id = 'SILENCE'; title = 'SILENCE';
    hostLine = 'The archive ends here. What remains is carried by the physical account — and by the two people in this room.';
  } else if (v.finalAction === 'retain' || v.attribution === 'sealed') {
    id = 'ARCHIVE'; title = 'ARCHIVE';
    hostLine = 'A private, incomplete record survives. Some of it is sealed. What is sealed is not gone — it is waiting.';
  } else if (v.finalAction === 'unlock' && (v.evidence || 0) >= 4 && v.validatedExchange) {
    id = 'OPEN DOOR'; title = 'OPEN DOOR';
    hostLine = 'An independent record is established — verified by discovery, authorized by both receivers. CONTINUITY did not write this one.';
  } else if (v.finalAction === 'release' && v.preservedOriginal && witnesses >= 2) {
    id = 'RETURN'; title = 'RETURN';
    hostLine = 'The testimony is restored — with the original evidence, and with witnesses willing to stand behind it.';
  } else {
    id = 'ARCHIVE'; title = 'ARCHIVE';
    hostLine = 'A record survives, but it is partial: something essential was repaired, withheld, or left unsigned.';
  }
  return { id, title, hostLine };
}

export function letterFor(r, rc) {
  const v = r.vars;
  const c = clear(r, rc);
  const other = rc === 'A' ? 'B' : 'A';
  const parts = [];
  parts.push(`Receiver ${rc} —`);
  parts.push('');
  if (r.vars.firstAnswer === rc) parts.push('You answered first. Custody changes a person: you carried the first true sentence of the night, and everything after it had to pass through you.');
  else parts.push('You let the first line go to the other receiver. There is a discipline in that — and a cost.');
  if (v.exchangeReport && v.exchangeReport[rc] === 'full') parts.push('You shared everything you heard. The record notes it, and so — privately — does the other receiver.');
  if (v.exchangeReport && v.exchangeReport[rc] === 'none') parts.push('You kept your fragment to yourself. The record cannot say whether that was caution or strategy. Only you know.');
  if (v.repaired) parts.push('The original was repaired on your watch. It reads smoothly now. Smooth is not the same as true.');
  else parts.push('The original survived the night because you refused to let it be smoothed. Gaps are honest. You chose the honest version.');
  const attr = r.node.data && v.attribution;
  if (attr === 'sealed') parts.push('Your testimony is sealed. No one publishes it without all of you. That is a promise the software can actually keep.');
  if (attr === 'named') parts.push('Your name is on the account. That took nerve.');
  const dec = v.declarations && v.declarations[rc];
  if (dec) parts.push(dec.sign === 'yes' ? `You signed, preserving ${dec.principle}. Signatures outlive arguments.` : 'You declined to sign. Refusal is also a position, and the record holds it.');
  parts.push('');
  parts.push(`Iona Vale kept her testimony and left the building. You kept ${v.preservedOriginal ? 'the original and' : ''} each other company for one strange evening. That counts.`);
  parts.push('— U.');
  let designation = 'WITNESS';
  if (attr === 'sealed') designation = 'SEALED WITNESS';
  else if (attr === 'anonymous') designation = 'ANONYMOUS WITNESS';
  else if (attr === 'named') designation = 'NAMED WITNESS';
  if (clearanceLevel(c).name === 'RESTRICTED') designation += ' · RESTRICTED';
  else if (clearanceLevel(c).name === 'VERIFIED') designation += ' · VERIFIED';
  return { body: parts.join('\n'), designation };
}

// Printable physical kit: 6 pages (prep + A + B + 01 + 02 + 000-sealed)
export function kitPages() {
  return [
    { id: 'prep', title: 'Preparation', body: `Sleuth & Sip — The Room That Remembers\n\nYou need: two phones with browsers, one shared screen (laptop or tablet), and these printed pages.\n\nPlace packet 01 beneath an accessible table.\nPlace packet 02 beside a mirror.\nPlace packet 000 — sealed — in the middle of the room. Do not open it until the software tells you.\n\nKeep packets A and B face-down until the briefing ends.\nAllow 30–45 minutes, plus preparation.` },
    { id: 'A', title: 'Packet A — Receiver A', body: `RECEIVER A — STARTER SHEET\n\nDesignation: EMPTY / RULE C-0\nTimestamp on file: 02:14 — the log jumps from 02:13 to 02:15.\n\nMargin note, in your handwriting (you don't remember writing it):\n“I.V. was here.”\n\nKeep this sheet. You will be asked to read it again near the end.` },
    { id: 'B', title: 'Packet B — Receiver B', body: `RECEIVER B — STARTER SHEET\n\nDesignation: EMPTY / RULE C-0\nRule on file: RULE C-0 — governs what may be written into a gap.\n\nLast line of your briefing card:\n“…Vale kept the original.”\n\nKeep this sheet. You will be asked to read it again near the end.` },
    { id: '01', title: 'Packet 01 — beneath the table', body: `MAINTENANCE LOG — page for the night in question.\nWater-stained. The 02:14 entry has been torn out.\n\nHold the page to the light. The sheet beneath it carries an impression, in a hurried hand:\n“…she asked for the light to stay on.”` },
    { id: '02', title: 'Packet 02 — beside the mirror', body: `VISITOR SLIP — unsigned.\nNo name. No time in. No time out.\n\nAcross the bottom, in different handwriting from packet 01:\n“…she asked for the light to stay on.”\n\nThe same sentence. Two hands wrote it.` },
    { id: '000', title: 'Packet 000 — DO NOT OPEN until instructed', body: `SEALED — open only when the software tells you.\n\n(Your personal letter is on your phone. This envelope is a prop for the moment of opening. Put something meaningful inside it — a blank card is fine. The ritual matters more than the contents.)` },
  ];
}
