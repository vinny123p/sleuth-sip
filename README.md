# Sleuth & Sip — “The Room That Remembers” (playable prototype)

Two modes, one mystery:

- **Duet** — the original: two people in the same room, one shared screen
  (laptop), two phones, ~30–45 minutes, plus setup.
- **Ensemble** (new) — cooperative, up to 24 players in up to 6 teams.
  One shared screen, at least one phone per team, ~45–60 minutes.
  Each team holds a unique dossier thread; the room must trade clues
  across teams to assemble one account.

The server is the dungeon master. It owns the timeline, roles, clues, choices,
deadlines, clearance, and endings. It never improvises dialogue — every line
is authored in `episode.js` (duet) or `ensemble.js` (ensemble).

## Run it

```bash
cd ~/workspace/unknown
npm start          # serves on port 8787 (override with PORT=xxxx)
```

1. Open the printed URL on the shared screen (laptop/tablet).
2. Duet: each player scans the QR code (or types the room code at `/j/CODE`).
   Ensemble: click “Host an ensemble room”, then each player joins and
   picks a team (up to 6 teams: WITNESS, RECORDS, PHYSICAL, PROCEDURE,
   CONTINUITY, CUSTODY).
3. Print the kit: `/kit.html` for the duet 6-page kit,
   `/kit.html?mode=ensemble` for the 8-page ensemble kit
   (preparation, six team dossiers, sealed packet 000).
4. Follow the briefing. The host never needs to touch the shared screen
   during play; everything runs from the phones.

Phones must be on the same Wi-Fi as the host laptop.

## How a session flows

Duet: Lobby → Briefing → incoming call (first to answer takes custody) →
private exchange → the missing minute → investigation (together or split) →
the repair offer → the witness → the physical revelation → attribution →
seal exchange → declarations → final authorization → the letter →
post-show teaser for Sleuth & Sip 001.

Ensemble: Lobby (team formation) → Dossiers → first thread →
Evidence Board (every team files; shared board on the big screen) →
Cross-examination (each team asks one other team a question only it can
answer) → Six seals (teams speak and commit seal words; the custody
phrase is revealed) → Attribution (per player) → Final authorization
(collective vote, 60% to converge) → the letter → post-show.

Five endings: **RETURN, ARCHIVE, SILENCE, OPEN DOOR, LOOP.**
Missed deadlines change the experience; they never trap the room.
Duet: “Take this off record” needs the other player’s agreement (20s window),
then holds the timeline for 90 seconds. Pause/resume is host-controlled.

## Clearance (per receiver, no farming, no speed bonuses)

| Level      | Score | Note                                        |
|------------|-------|---------------------------------------------|
| UNLISTED   | 0     | Normal participation                        |
| PROVISIONAL| 3     | Updated access credential                   |
| VERIFIED   | 7     | Additional restricted information           |
| RESTRICTED | 12    | Privileged post-show material about 001     |

Points come from authored contributions (answering, sharing, recovering the
minute, observations, preserving the original, naming the witness, hearing the
testimony, the seal exchange, declarations, the final vote, opening the
letter). Every award is one-time — retries never double-count. VERIFIED is
reachable with zero typed answers; RESTRICTED takes a near-perfect run, and
every typed answer is designed to be solved out loud, together.

## Test mode

Append `?test=1` to the host URL (`/h/CODE?test=1`) for the test panel:

- jump to any node, trigger the current scene’s timeout, preview any ending,
  inspect full room state, pause/resume, reset the room,
- impersonate Receiver A / B in duet (opens their phone view in a new tab),
  impersonate the first player of each team in ensemble.

## Automated tests

```bash
npm start &            # or: PORT=8799 node server.js
BASE=http://127.0.0.1:8799 node test/run.mjs
```

Drives the real HTTP API as two phones + host through: the full canonical
duet path to RETURN (checks RESTRICTED for both receivers), OPEN DOOR via real
discovery, LOOP via disagreement, reconcile-then-agree, SILENCE, sealed-attribution
ARCHIVE, all five ending presets, call timeout, pause/resume, the off-record
accept and decline flows, wrong-answer validation and recovery, and a
zero-typed-input run to VERIFIED.

And as 12 phones + host through ensemble: team setup and auto-assignment,
the full canonical cooperative run to RETURN (checks RESTRICTED for all 12
players), LOOP via a split vote, unanimous-erase SILENCE, wrong-answer
rejection and recovery, seal-window timeout (unlock stays unavailable and is
rejected server-side), final-vote timeout (defaults to retain → ARCHIVE),
all ending previews, test fixtures, and the 8-page ensemble kit.

## Files

- `episode.js` — the authored duet episode: 16 nodes, endings, letters,
  clearance, printable kit text. Edit this to change the story.
- `ensemble.js` — the authored ensemble episode: 6 dossiers, 10 nodes,
  endings, letters, clearance, printable kit text.
- `server.js` — pure-Node HTTP server: rooms, polling sync, deadlines,
  off-record flow, test mode. No dependencies except `qrcode`.
- `public/` — `index.html` (landing), `host.html` (shared screen + test
  panel), `phone.html` (receiver view), `join.html`, `kit.html`,
  `app.js` (block renderer, call overlay, timers), `style.css`.
- `test/run.mjs` — end-to-end suite (currently 534 checks, all passing).

## Limits of this prototype

- In-memory rooms: restarting the server wipes sessions. No persistence yet.
- Duet supports 2 receivers; ensemble is 6 teams of up to 4 players
  (24 players total). Larger groups are a future design question.
- Call audio and the witness recording use the browser’s speech synthesis;
  there are no bundled voice recordings yet.
- No rewind. Reset returns the room to the lobby.
