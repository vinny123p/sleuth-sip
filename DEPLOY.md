# Deploying Sleuth & Sip to sleuthandsip.com

The app is a plain Node server (no build step). The cheapest reliable host
is Render's free tier. Total: ~15 minutes, most of it waiting on DNS.

## 0. What you need

- A GitHub account (free)
- A Render account (free, sign up with GitHub)
- The domain (you're registering sleuthandsip.com on GoDaddy)

## 1. Get the code onto GitHub

The project is already a git repo in `~/workspace/unknown` (committed).
Create a **new empty public repo** on github.com (call it `sleuth-sip`),
then push:

```bash
cd ~/workspace/unknown
git remote add origin https://github.com/YOURNAME/sleuth-sip.git
git push -u origin main
```

(If you'd rather I do this part: create a fine-grained personal access
token on GitHub and paste it to me through the Secure Vault. I'll push
and confirm.)

## 2. Create the Render service

1. Go to dashboard.render.com → **New** → **Blueprint**.
2. Connect your GitHub account, select the `sleuth-sip` repo.
3. Render reads `render.yaml` and creates the web service (`sleuth-sip`,
   free plan, Docker). Hit **Apply**.
4. Wait for the first deploy to finish. You'll get a URL like
   `https://sleuth-sip.onrender.com`. Open it — the Sleuth & Sip landing
   page should load, and hosting a room should give you a 4-letter code.

## 3. Point the domain at it

In Render: open the service → **Settings** → **Custom Domains** →
**Add Custom Domain** → enter `www.sleuthandsip.com`. Render will show
you the DNS value (your `xxx.onrender.com` hostname).

In GoDaddy DNS for sleuthandsip.com:

| Type  | Host | Value                        |
|-------|------|------------------------------|
| CNAME | www  | `xxx.onrender.com` (from Render) |

Then set up apex forwarding in GoDaddy (Domain → Manage DNS → Forwarding,
or Domain Settings): forward `sleuthandsip.com` → `https://www.sleuthandsip.com`
(permanent 301). This covers people who type the bare domain.

DNS can take a few minutes to a few hours. Render provisions the TLS
certificate automatically once DNS resolves.

## 4. Game-night notes

- **Cold starts.** Free Render services sleep after ~15 min idle and take
  30–60s to wake. Open the site ~2 minutes before players arrive and
  create the room early — the room code stays valid while the service runs.
- **Don't redeploy mid-game.** Rooms live in server memory; a restart or
  redeploy wipes active rooms. Deploy updates between games, not during.
- **One room per code.** Each "Host a room" click creates a fresh 4-letter
  code. Players go to sleuthandsip.com, type the code, join.
- **Scale.** Polling is light; 24 players on one free instance is fine.

## How players join (the Jackbox flow)

1. Host opens `https://www.sleuthandsip.com` on the shared screen/laptop,
   clicks **Host a room** (duet or ensemble).
2. The lobby shows a big 4-letter **ROOM CODE** + QR code.
3. Players open `sleuthandsip.com` on their phones, type the 4 letters,
   enter a name (and pick a team in ensemble), and they're in.

## If something breaks

- "Room not found" after typing a code: the service probably slept and
  restarted, wiping rooms. Create a fresh room.
- QR code points to the wrong URL: the server builds URLs from the request
  Host header, so this fixes itself once the custom domain is active. If
  you ever need to force it, set a `BASE_URL` env var in Render
  (e.g. `https://www.sleuthandsip.com`) and redeploy.
