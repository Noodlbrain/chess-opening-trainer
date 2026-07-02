# Chess Opening Trainer

A self-contained web app for learning and drilling a chess opening repertoire,
tuned for a **1500–1600 chess.com rapid (10|0)** player. Two modes: **Learn**
(walk every line with the *ideas* explained) and **Test** (spaced-repetition
drilling where you play your repertoire moves against the app).

## Run it

The app uses JavaScript modules, so it must be served over HTTP (opening
`index.html` directly with `file://` will not work).

**Easiest:** double-click **`start.command`** in Finder. It starts a local
server and opens the app in your browser.

**Or from a terminal:**

```bash
cd "Chess Study"
python3 -m http.server 8123
# then open http://localhost:8123/index.html
```

Your progress (which lines you've learned and when each is next due) is saved in
your browser's `localStorage`, so use the same browser to keep your history.
Note that localhost and the hosted site keep **separate** stores — use
**Export / Import progress** (Test setup screen) to back up or move your
history between browsers or devices.

Once loaded, the app works **offline** (a service worker caches everything),
so the home-screen version keeps working without a connection.

## Handy features

- **The Learn board is live** — instead of pressing ▶ you can physically play
  the next move of the line (either side's) to step forward; a wrong move
  shakes the board. Moving the pieces yourself is far stickier for memory
  than watching them move.
- **🎯 Drill this line** (Learn mode) jumps straight into testing the line
  you're currently viewing.
- **Scope** in Test mode can target everything, one repertoire, a single
  chapter — or **Custom selection…**, a checklist where you pick any set of
  lines you want (it persists between sessions and is drilled exactly as
  picked, ignoring due dates).
- **📊 Progress by chapter** (Test setup screen) shows learned/due/lapses per
  chapter so you can see where the weak spots are.
- **Keyboard:** ←/→ step through moves in Learn mode; in Test mode **H** =
  hint, **S** = show move, **Enter** = next line.
- Wrong-move feedback recognizes when you played your repertoire move from a
  *different* line of the same chapter, and names it.

## Suggested learning order

The repertoire is organized into a clear study path. In **Learn** mode, the
Opening dropdown groups each repertoire's chapters into three tiers — work
top-to-bottom:

- **① Core — start here:** the lines you'll face in most games. Learn these cold.
- **② Common replies:** frequent but secondary; learn once the Core is solid.
- **③ Sidelines & surprise weapons:** rare lines and optional aggressive extras.

And across the three repertoires:

1. **Step 1 — White (1.e4).** You choose this every White game, so it pays off
   fastest.
2. **Step 2 — Black vs 1.e4** (Accelerated Dragon + surprises).
3. **Step 3 — Black vs 1.d4** (Nimzo / Bogo-Indian).

Within each chapter, learn the first line (the main line) before its branches.

## The repertoire

Chosen to minimize rote memorization and maximize understanding of plans and
pawn structures — the things that actually win games on a 10-minute clock.

### White — 1.e4, the Italian complex
| vs | Your system |
|----|-------------|
| 1...e5 | Italian / Giuoco Pianissimo (c3, d3, slow build-up) |
| 1...e5 2...Nf6 | Quiet 4.d3 (skips the Fried Liver) |
| Petroff (2...Nf6) | 3.Nxe5, simple edge |
| Sicilian (1...c5) | Alapin 2.c3 (low theory) |
| French (1...e6) | Advance 3.e5 |
| Caro-Kann (1...c6) | Advance, Short System |
| Scandinavian (1...d5) | 3.Nc3 with fast development |
| Pirc / Modern | Classical center (Be2, O-O) |
| 1...e5 (optional weapon) | Vienna: gambit vs 2...Nf6, Bc4/Qg4 vs 2...Nc6 (the Gotham/Chessly repertoire) |

### Black vs 1.e4 — Accelerated Dragon
One core idea: the `...d5` freeing break. Includes the Maroczy Bind, Rossolimo,
Alapin, Closed Sicilian and Grand Prix. Also an anti-Vienna chapter (3...d5!
vs the gambit, the 3...Nxe4! fork trick vs 3.Bc4) for games opened with 1...e5.

### Black vs 1.d4 — Nimzo-Indian / Bogo-Indian
Nimzo (3...Bb4) vs Rubinstein (4.e3), Classical (4.Qc2), Sämisch (4.a3), 4.f3.
Bogo (3...Bb4+) when White plays 3.Nf3. Plus answers to the Catalan, London and
Trompowsky.

## How Test mode scores you

Each line is a flashcard placed in a Leitner box. Drill intervals:

| Box | Next review |
|-----|-------------|
| 1 | 1 day |
| 2 | 2 days |
| 3 | 4 days |
| 4 | 8 days |
| 5 | 16 days |

- Play a line with **no mistakes** → it moves up a box (longer interval).
- A **wrong move** or using **Show move** → back to box 1, and the line is
  re-queued a few drills later **in the same session**; play the retry cleanly
  and it's scheduled for tomorrow.
- A **hint** keeps it in its current box.

A due-only session pulls in every due line plus up to **10 new** (never-drilled)
lines, so a long backlog never becomes an overwhelming wall.

## Adding or editing lines

All content lives in [`js/repertoire.js`](js/repertoire.js) as plain data —
complete move sequences with an explanation (`c`) on each move. Lines that share
a prefix are merged automatically, so you only annotate the new moves of a
branch.

After editing, validate that every move is legal:

```bash
python3 -m pip install --user python-chess   # one-time
python3 validate.py
```

Besides move legality (the only hard failure), the validator warns about
lines in the same chapter that split on one of *your* moves (fine if
intentional, suspicious if not) and about your moves that lack a comment.

## Files

```
index.html        app shell
css/style.css     styling + chessboard
js/repertoire.js  the repertoire data (edit this to change content)
js/board.js       chessboard rendering + click-to-move
js/app.js         Learn/Test logic + spaced-repetition scheduler
lib/chess.js      chess.js (move legality), vendored
img/pieces-kaneo/ chess piece images
sw.js             service worker (offline cache)
validate.py       legality checker for repertoire.js
start.command     double-click launcher
```

## Credits

- Board: standard green/white theme.
- Pieces: the **"Kaneo"** set by Kadagaden — an open set styled after
  chess.com's Neo — licensed **CC-BY-4.0**. Source:
  https://github.com/Kadagaden/chess-pieces · See `img/pieces-kaneo/CREDITS.txt`.
- Move legality: [chess.js](https://github.com/jhlywa/chess.js) (BSD).
