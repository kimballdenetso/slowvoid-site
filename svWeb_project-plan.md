# Artist Website — Project Plan & Architecture

**Host:** Bluehost (shared hosting, LAMP stack — Apache, MySQL, PHP)
**Goal:** A music-artist site centered on a custom audio player with a 10-band EQ, an interaction-driven 3D visual, scrubbing/timestamp comments, and social/contact links.

---

## 1. Hosting Reality Check (Bluehost-specific)

Bluehost shared hosting gives you:
- Apache + PHP (usually PHP 8.x) — good, no server setup needed
- MySQL database (via phpMyAdmin/cPanel) — good for storing comments
- **No Node.js server runtime** on standard shared plans, and no persistent WebSocket/long-running processes

**Implication:** The front end (player, EQ, 3D visualizer) should be pure HTML/CSS/JavaScript (runs in the visitor's browser — no server needed). The only thing that needs a backend is **timestamp comments**, since they must be stored and moderated.

**Decision: PHP/MySQL backend.** All comment storage, retrieval, and admin deletion will be handled by PHP scripts talking to a MySQL database, both hosted directly on Bluehost — no third-party services or extra accounts needed.

---

## 2. File / Folder Structure

```
/public_html
│
├── index.html                  ← main page, wires everything together
├── /css
│   ├── base.css                ← resets, typography, color vars, layout grid
│   ├── player.css               ← transport controls, scrub bar, timing visualizer
│   ├── eq.css                   ← 10-band EQ sliders + eq visualizer
│   ├── visualizer3d.css          ← canvas/container sizing for 3D scene
│   ├── comments.css              ← timestamp comment list + form styling
│   └── responsive.css            ← media queries, mobile layout overrides
│
├── /js
│   ├── main.js                  ← app init, loads tracks, wires modules together
│   ├── player.js                ← play/pause/skip, scrubbing, progress/timing bar
│   ├── eq.js                    ← Web Audio API BiquadFilter chain (10 bands) + UI
│   ├── eq-visualizer.js          ← canvas draw loop for EQ frequency response/levels
│   ├── panner-volume.js          ← StereoPannerNode + GainNode controls
│   ├── visualizer3d.js           ← Three.js scene, single persistent model, interaction-driven reveals/rotation
│   ├── comments.js               ← fetch/post comments, render on timeline
│   └── social.js                 ← social link + smooth-scroll contact anchor logic
│
├── /assets
│   ├── /audio                    ← mp3/ogg track files
│   ├── /models                   ← .glb/.gltf 3D model(s) + textures
│   ├── /images                   ← album art, icons, background art
│   └── /fonts                    ← custom web fonts if used
│
├── /api                          ← PHP backend (Plan A)
│   ├── config.php                ← DB connection credentials
│   ├── comments_get.php          ← GET: return comments for a track
│   ├── comments_post.php         ← POST: add a new comment (name, timestamp, text)
│   ├── comments_delete.php       ← POST: admin-only delete (password/token protected)
│   └── admin.php                 ← simple password-gated admin view/delete UI
│
└── /sql
    └── schema.sql                ← comments table definition (for phpMyAdmin import)
```

Keeping every feature in its own file means you (or anyone helping later) can edit the EQ without touching the player, swap the 3D model without touching comments, etc.

---

## 3. Feature Specs

### 3.1 Music Player (`player.js` / `player.css`)
- Uses a single shared **Web Audio API** `AudioContext` (all other features tap into this same graph)
- Controls: play/pause, next/prev track, restart
- **Scrub bar**: `<input type="range">` or custom canvas bar bound to `audio.currentTime` / `duration`; dragging seeks the track
- **Timing visualizer bar**: a waveform-style or simple amplitude bar synced to playback position, drawn via `AnalyserNode.getByteTimeDomainData()` on a `<canvas>`, redrawn every animation frame
- Track metadata (title, artist, art) pulled from a small JS/JSON track list in `main.js`

### 3.2 10-Band EQ + Visualizer (`eq.js`, `eq-visualizer.js`, `eq.css`)
- Audio graph: `source → filter1 → filter2 → ... → filter10 → gain → panner → destination`
- 10 `BiquadFilterNode`s, type `peaking`, center frequencies at standard ISO bands (e.g., 31, 62, 125, 250, 500, 1k, 2k, 4k, 8k, 16k Hz)
- Each band exposed as a vertical slider (gain -12dB to +12dB); moving it sets `filter.gain.value`
- **EQ visualizer**: canvas plot of the combined frequency-response curve (computed via `getFrequencyResponse()` on each filter) redrawn on slider change, optionally overlaid with a live `AnalyserNode` spectrum bar graph

### 3.3 Volume & Panning (`panner-volume.js`)
- `GainNode` for master volume, one slider 0–100%
- `StereoPannerNode` for L/R pan, one slider -1 to 1
- Both nodes sit in the shared audio graph after the EQ chain

### 3.4 Interaction-Driven 3D Model (`visualizer3d.js`, `visualizer3d.css`)

**Important distinction:** this is **not** an audio-reactive visualizer (it doesn't analyze the waveform/frequency data). It's also **one persistent model** — it never gets swapped out for a different model on track change. Instead, the model responds to *how the visitor interacts with the transport controls*, mostly by revealing/hiding pieces and moving a couple of parts directly. Because it's driven by UI events rather than an `AnalyserNode`, it's fully decoupled from the Web Audio graph.

- **Three.js** scene rendered into a `<canvas>`, loading one `.glb` model via `GLTFLoader`. The model is built (or exported) with distinct named nodes/meshes for the pieces that need to be shown/hidden or moved independently (e.g., a hidden "EQ panel" mesh, a "volume knob" mesh)
- **Activating the EQ → reveals a part or second model.** When the visitor opens/enables the EQ panel (`eq.js` fires an `eqactivated`/`eqdeactivated` event), toggle visibility (or play a reveal animation — slide out, fade in, unfold) on a specific mesh or child model that's hidden by default. Deactivating the EQ reverses it. **Starting approach: a single `.glb` file** with this piece modeled as a hidden mesh/child node inside it — simplest to keep aligned since everything shares one coordinate space. If alignment proves difficult or the piece needs more independent control (its own rig, pivot, or animation), fall back to a second `.glb` loaded and positioned at runtime (see Section 7).
- **Volume slider → rotates a 3D knob.** The volume slider's value maps directly to the rotation of a knob-shaped mesh in the model (e.g., 0–100% volume → 0°–270° rotation), so dragging the on-page slider visibly turns a knob on the 3D object in real time.
- **Cursor position → subtle rotation** of the whole model (or a focal point on it), based on cursor X/Y offset from center — a light parallax/"look-at-cursor" effect, damped so it stays subtle.
- Runs its own `requestAnimationFrame` loop for idle/cursor-rotation state; discrete reveal animations (EQ toggle) and continuous mappings (knob rotation) layer on top
- Depends only on: `eqactivated`/`eqdeactivated` events from `eq.js`, the volume slider's value from `panner-volume.js`, and pointer position — no `trackchange` dependency and no audio analysis

**Event contract (what `main.js` wires up):**
```
eq.js             → dispatches 'eqactivated' / 'eqdeactivated'
panner-volume.js  → dispatches 'volumechange' with { value } (0–1)
visualizer3d.js   → listens for both, plus native mousemove on its canvas/container
```

**Note on scope/timing:** the exact set of interactions, which mesh pieces exist, and how elaborate the reveal animations get will be fleshed out in **Phase 2**, after the core site (player, EQ, volume/pan, comments) is live on Bluehost. Phase 1 will ship the model with basic idle rotation and just enough wiring (visibility toggle on EQ activation, knob rotation on volume, cursor parallax) to prove the interaction pattern; refinement and additional detail happen once the model/rigging is finalized.

### 3.5 Social Links & Contact Anchors (`social.js`)
- Simple icon row linking out to Instagram/Spotify/YouTube/etc. (plain `<a>` tags, no API needed)
- "Contact" is an in-page anchor (`#contact`) with smooth-scroll behavior, containing either a `mailto:` link or a simple contact form (form submission can POST to a Bluehost-supported PHP mailer script or a form service like Formspree if you don't want to write PHP mail handling)

### 3.6 Timestamp Comments (`comments.js`, `/api/*.php`, `comments.css`)
**No login required** — just a name + comment tied to a specific timestamp on a specific track.

**Data model (`schema.sql`):**
```sql
CREATE TABLE comments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  track_id VARCHAR(100) NOT NULL,
  timestamp_seconds FLOAT NOT NULL,
  name VARCHAR(80) NOT NULL,
  comment_text VARCHAR(500) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  ip_hash VARCHAR(64)              -- for lightweight spam throttling, not shown publicly
);
```

**Flow:**
1. Visitor clicks a point on the scrub bar → a small "Leave a comment here" popover appears showing that timestamp
2. They enter name + comment → `comments.js` POSTs to `/api/comments_post.php`
3. PHP script sanitizes input (strip tags, length limits), inserts into MySQL, does basic rate-limiting by IP hash
4. `comments_get.php` returns all comments for the current track; `comments.js` renders them as small markers on the scrub bar (hover/click to read) and/or a scrollable list beside the player
5. **Admin delete**: `/api/admin.php` is a simple page protected by a password check (stored server-side, compared via `password_hash`/`password_verify`, or even just an `.htaccess` login on the `/api/admin.php` path for simplicity). It lists all comments with a delete button that calls `comments_delete.php` with a matching admin token.

**Spam/abuse mitigation (lightweight, no login needed):**
- Server-side character limits + strip HTML tags
- Basic honeypot field (hidden input bots tend to fill in) to reject obvious bots
- Rate limit by IP+time (e.g., 1 comment per 30 seconds) stored via `ip_hash`
- Optional: simple math captcha if spam becomes a problem later

---

## 4. Shared Audio Architecture (why one AudioContext matters)

The player, EQ, and panner/volume all touch the same audio signal, so they must share **one** `AudioContext` and node graph, or they'll conflict. The 3D visualizer is intentionally **outside** this graph — it only listens to UI events (EQ activation, volume slider value, cursor position), not the audio signal itself. Suggested graph, built once in `main.js` and passed to each module:

```
<audio> element
   → MediaElementAudioSourceNode
   → [10x BiquadFilterNode chain]  (eq.js)
   → GainNode                       (panner-volume.js, volume)
   → StereoPannerNode               (panner-volume.js, pan)
   → AnalyserNode                   (feeds player.js timing bar + eq-visualizer.js only)
   → AudioContext.destination

visualizer3d.js  ──(listens to UI events, not the graph above)──
   ├─ 'eqactivated' / 'eqdeactivated' events from eq.js
   ├─ volume slider value from panner-volume.js
   └─ mousemove/pointermove over its own canvas
```

---

## 5. Deployment Steps to Bluehost

1. Build/test everything locally (can run via any static server, e.g., VS Code Live Server)
2. Create the MySQL database + import `schema.sql` via **cPanel → phpMyAdmin**
3. Update `/api/config.php` with the DB credentials Bluehost gives you (host is usually `localhost`)
4. Upload the full `/public_html` structure via **cPanel File Manager** or FTP (FileZilla)
5. Confirm HTTPS is active (Bluehost includes free SSL — force it via `.htaccess` redirect)
6. Test comment posting/deleting live, confirm CORS isn't an issue (shouldn't be, since API and site share the same domain)
7. Password-protect `/api/admin.php` (via PHP session login or an `.htaccess`/`.htpasswd` rule on that one file)

---

## 6. Suggested Build Order

### Phase 1 — Core Site (get everything live on Bluehost)

| Step | Deliverable |
|---|---|
| 1 | Static page shell + styling (`index.html`, `base.css`, `responsive.css`) |
| 2 | Core player: play/pause/scrub/timing bar (`player.js/css`) |
| 3 | Volume + panning (`panner-volume.js`) |
| 4 | 10-band EQ + EQ visualizer (`eq.js`, `eq-visualizer.js`, `eq.css`) |
| 5 | 3D model, basic version — idle rotation, visibility toggle on EQ activation, knob rotation on volume, cursor parallax (`visualizer3d.js/css`) |
| 6 | Social links + contact anchor (`social.js`) |
| 7 | Comments backend: DB schema, PHP endpoints, admin delete page |
| 8 | Comments front end: popover on scrub bar, list rendering (`comments.js/css`) |
| 9 | Spam mitigation, polish, mobile responsiveness pass |
| 10 | Deploy to Bluehost, live QA |

### Phase 2 — 3D Model Detail Pass (after Phase 1 is live)

Once the core site is up and running, revisit `visualizer3d.js`/`visualizer3d.css` to flesh out:
- Final model rigging: which pieces are separate meshes, what gets hidden/revealed and how (fade, slide, unfold, etc.)
- Polished reveal animation for EQ activation (vs. a simple show/hide in Phase 1)
- Fine-tuned knob rotation range/easing tied to the volume slider
- Any additional interaction-to-model mappings that come up once the basic pattern is proven out

---

## 7. Open Decisions (worth answering before build starts)
- Contact form: `mailto:` link, PHP mail script, or third-party form service?
- Comment display: markers directly on the scrub bar, a separate list, or both?
- Cursor rotation: should it apply to the whole model, or just a head/camera-like focal point on the model?
- Admin access: dedicated login page, or `.htaccess` basic auth on `/api/admin.php`?

**Confirmed:**
- Comments backend is PHP + MySQL, hosted entirely on Bluehost (Section 3.6 / Section 1).
- 3D visualizer is a single persistent model (no swapping), driven by transport interactions, not audio analysis (Section 3.4). Fine detail work on the model's rigging/animations is deferred to Phase 2, after the core site is live.
- **EQ-activation reveal — start with one `.glb`.** The revealed piece will first be attempted as a hidden mesh/child node within the same model file (toggle visibility + local transform, no separate load/positioning needed). **Fallback:** if alignment gets difficult (e.g., the revealed piece needs its own pivot, scale, or independent animation rig that's awkward to nest in one file) or more control is needed than a single-file hierarchy allows, switch to loading a second `.glb` positioned/parented to the main model at runtime. `visualizer3d.js` should be structured so this swap doesn't require rewriting the event-handling logic — only the loading/positioning code changes.
