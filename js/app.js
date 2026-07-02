// Bump ?v= on any JS change (here + index.html) and VERSION in sw.js to bust caches.
import { Chess } from "../lib/chess.js?v=5";
import { REPERTOIRE } from "./repertoire.js?v=5";
import { Board } from "./board.js?v=5";

// ============================================================ helpers
const $ = (id) => document.getElementById(id);
const norm = (san) => san.replace(/[+#!?]/g, "");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const colorName = (c) => (c === "w" ? "White" : "Black");

// Build a path -> comment lookup per chapter so shared-prefix moves in
// alternative lines inherit the explanation from the first line that gave one.
for (const group of REPERTOIRE.groups) {
  for (const ch of group.chapters) {
    ch.heroColor = group.heroColor;
    ch.commentByPath = new Map();
    for (const line of ch.lines) {
      let path = "";
      for (const mv of line.moves) {
        path += (path ? " " : "") + mv.san;
        if (mv.c && !ch.commentByPath.has(path)) ch.commentByPath.set(path, mv.c);
      }
    }
  }
}

const commentForPly = (chapter, moves, ply) => {
  // comment shown after `ply` half-moves have been played (ply>=1)
  if (ply <= 0) return null;
  const path = moves.slice(0, ply).map((m) => m.san).join(" ");
  return chapter.commentByPath.get(path) || moves[ply - 1].c || "";
};

// ============================================================ SRS store
const SRS_KEY = "chessRepSRS.v1";
const BOX_DAYS = [1, 2, 4, 8, 16]; // review interval (days) for boxes 1..5
const DAY = 86400000;

const loadSrs = () => {
  try { return JSON.parse(localStorage.getItem(SRS_KEY)) || {}; }
  catch { return {}; }
};
let SRS = loadSrs();
const saveSrs = () => localStorage.setItem(SRS_KEY, JSON.stringify(SRS));

const drillId = (g, c, lineName) => `${g}|${c}|${lineName}`;
const getRec = (id) => SRS[id] || { box: 0, due: 0, reps: 0, lapses: 0 };
const isDue = (id) => {
  const r = SRS[id];
  return !!r && r.due <= Date.now();
};
const isNew = (id) => !SRS[id];

// result: "pass" | "fail" | "neutral" | "relearn"
function gradeDrill(id, result) {
  const r = getRec(id);
  if (result === "pass") r.box = Math.min((r.box || 0) + 1, 5);
  else if (result === "fail") { r.box = 1; r.lapses = (r.lapses || 0) + 1; }
  else if (result === "relearn") r.box = 1; // clean retry after an in-session miss: due tomorrow
  else r.box = Math.max(r.box || 1, 1); // neutral: keep box, just reschedule
  r.reps = (r.reps || 0) + 1;
  // A missed line comes back this same session; passed/hinted lines defer by
  // the box interval (a clean first pass schedules at least a day out).
  r.due = result === "fail" ? Date.now() : Date.now() + BOX_DAYS[r.box - 1] * DAY;
  SRS[id] = r;
  saveSrs();
}

// ============================================================ drills
function allDrills() {
  const out = [];
  REPERTOIRE.groups.forEach((g) =>
    g.chapters.forEach((c) =>
      c.lines.forEach((line) =>
        out.push({
          id: drillId(g.id, c.id, line.name),
          groupId: g.id, groupTitle: g.title,
          chapterId: c.id, chapterTitle: c.title,
          lineName: line.name,
          heroColor: g.heroColor,
          chapter: c,
          moves: line.moves,
        })
      )
    )
  );
  return out;
}

const shuffle = (a) => {
  for (let i = a.length - 1; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// ============================================================ board
let board;

// ============================================================ LEARN mode
const learn = { g: 0, c: 0, l: 0, ply: 0, game: new Chess(), autoTimer: null, last: null };

function fillSelect(sel, items, value = (x, i) => i, label = (x) => x) {
  sel.innerHTML = "";
  items.forEach((it, i) => {
    const o = document.createElement("option");
    o.value = value(it, i);
    o.textContent = label(it, i);
    sel.appendChild(o);
  });
}

function initLearnSelectors() {
  fillSelect($("learn-group"), REPERTOIRE.groups, (x, i) => i, (x) => x.title);
  refreshChapterSelect();
}
const TIERS = [
  { n: 1, label: "①  Core — start here" },
  { n: 2, label: "②  Common replies" },
  { n: 3, label: "③  Sidelines & surprise weapons" },
];
function refreshChapterSelect() {
  const grp = REPERTOIRE.groups[learn.g];
  const sel = $("learn-chapter");
  sel.innerHTML = "";
  let firstIdx = null;
  for (const { n, label } of TIERS) {
    const entries = grp.chapters
      .map((c, i) => ({ c, i }))
      .filter((x) => (x.c.tier || 2) === n);
    if (!entries.length) continue;
    const og = document.createElement("optgroup");
    og.label = label;
    for (const { c, i } of entries) {
      if (firstIdx === null) firstIdx = i;
      const o = document.createElement("option");
      o.value = i;
      o.textContent = c.title;
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
  learn.c = firstIdx ?? 0;
  sel.value = String(learn.c);
  refreshLineSelect();
}
function refreshLineSelect() {
  const ch = REPERTOIRE.groups[learn.g].chapters[learn.c];
  fillSelect($("learn-line"), ch.lines, (x, i) => i, (x) => x.name);
  learn.l = 0;
  loadLearnLine();
}
function loadLearnLine() {
  stopAuto();
  learn.ply = 0;
  renderLearn();
}

function currentLearnLine() {
  return REPERTOIRE.groups[learn.g].chapters[learn.c].lines[learn.l];
}
function currentLearnChapter() {
  return REPERTOIRE.groups[learn.g].chapters[learn.c];
}

function rebuildGame(moves, ply) {
  const game = new Chess();
  let last = null;
  for (let i = 0; i < ply; i++) {
    const m = game.move(moves[i].san, { sloppy: true });
    last = m ? { from: m.from, to: m.to } : last;
  }
  return { game, last };
}

function renderLearn() {
  const ch = currentLearnChapter();
  const line = currentLearnLine();
  const moves = line.moves;
  const { game, last } = rebuildGame(moves, learn.ply);
  learn.game = game;
  learn.last = last;

  board.setOrientation(ch.heroColor);
  board.setPosition(game, last);
  board.setInteractive(learn.ply < moves.length); // play the next move to step forward

  $("learn-blurb").textContent = REPERTOIRE.groups[learn.g].blurb;
  $("learn-intro").textContent = ch.intro;

  // move list
  const mv = $("learn-moves");
  mv.innerHTML = "";
  for (let i = 0; i < moves.length; i++) {
    if (i % 2 === 0) {
      const n = document.createElement("span");
      n.className = "movenum";
      n.textContent = `${i / 2 + 1}.`;
      mv.appendChild(n);
    }
    const s = document.createElement("span");
    s.className = "move" + (i + 1 === learn.ply ? " current" : "");
    s.textContent = moves[i].san;
    s.addEventListener("click", () => { stopAuto(); learn.ply = i + 1; renderLearn(); });
    mv.appendChild(s);
  }

  // comment
  const comment = learn.ply === 0
    ? "Starting position. Play the moves on the board (or press ▶) to walk the line — read the idea behind every move."
    : commentForPly(ch, moves, learn.ply);
  $("learn-comment").textContent = comment || "(transposes — see the main line for the idea)";

  // turn indicator
  const toMove = learn.ply % 2 === 0 ? "w" : "b";
  $("board-turn").innerHTML = learn.ply >= moves.length
    ? "<b>End of line</b>"
    : `<b>${colorName(toMove)}</b> to move — play it or press ▶`;

  // nav availability
  $("btn-first").disabled = learn.ply === 0;
  $("btn-prev").disabled = learn.ply === 0;
  $("btn-next").disabled = learn.ply >= moves.length;
  $("btn-last").disabled = learn.ply >= moves.length;
}

// In Learn mode the board is live: playing the next move of the line (either
// side's) steps forward exactly like pressing ▶. Anything else gets a shake —
// the move list above already shows the answer.
function learnUserMove(from, to) {
  const moves = currentLearnLine().moves;
  if (learn.ply >= moves.length) return;
  const m = learn.game.move({ from, to, promotion: "q" });
  if (!m) return;
  if (norm(m.san) === norm(moves[learn.ply].san)) {
    stopAuto();
    learn.ply++;
    renderLearn();
  } else {
    learn.game.undo();
    board.shake();
    board.setPosition(learn.game, learn.last);
  }
}

function stepLearn(d) {
  const len = currentLearnLine().moves.length;
  learn.ply = Math.max(0, Math.min(len, learn.ply + d));
  renderLearn();
}
function stopAuto() {
  if (learn.autoTimer) { clearInterval(learn.autoTimer); learn.autoTimer = null; }
  $("btn-auto").classList.remove("playing");
  $("btn-auto").textContent = "▶ Auto";
}
function toggleAuto() {
  if (learn.autoTimer) { stopAuto(); return; }
  const len = currentLearnLine().moves.length;
  if (learn.ply >= len) learn.ply = 0;
  $("btn-auto").classList.add("playing");
  $("btn-auto").textContent = "⏸ Stop";
  learn.autoTimer = setInterval(() => {
    if (learn.ply >= currentLearnLine().moves.length) { stopAuto(); return; }
    learn.ply++;
    renderLearn();
  }, 1300);
}

// ============================================================ TEST mode
const test = {
  queue: [], idx: 0, drill: null, game: null, ply: 0,
  wrong: 0, revealed: false, hinted: false, results: [], complete: false,
  gen: 0,        // bumped whenever the current drill changes; stale async loops check it and die
  active: false, // a session is in progress (survives tab switches)
  last: null,    // last move played on the test board {from, to}
};
const NEW_PER_SESSION = 10; // cap on never-drilled lines pulled into a due-only session
const onTestTab = () => !$("test-panel").classList.contains("hidden");

const TIER_MARK = ["①", "②", "③"];
function initTestSetup() {
  const sel = $("test-group");
  sel.innerHTML = "";
  const all = document.createElement("option");
  all.value = "__all";
  all.textContent = "Everything";
  sel.appendChild(all);
  for (const g of REPERTOIRE.groups) {
    const og = document.createElement("optgroup");
    og.label = g.title;
    const whole = document.createElement("option");
    whole.value = `g:${g.id}`;
    whole.textContent = "All of this repertoire";
    og.appendChild(whole);
    for (const c of g.chapters) {
      const o = document.createElement("option");
      o.value = `c:${g.id}|${c.id}`;
      o.textContent = `${TIER_MARK[(c.tier || 2) - 1]} ${c.title}`;
      og.appendChild(o);
    }
    sel.appendChild(og);
  }
  updateTestCounts();
}

function scopedDrills() {
  const scope = $("test-group").value;
  let drills = allDrills();
  if (scope.startsWith("g:")) drills = drills.filter((d) => d.groupId === scope.slice(2));
  else if (scope.startsWith("c:")) {
    const [gid, cid] = scope.slice(2).split("|");
    drills = drills.filter((d) => d.groupId === gid && d.chapterId === cid);
  }
  return drills;
}

function updateTestCounts() {
  const drills = scopedDrills();
  const due = drills.filter((d) => isDue(d.id)).length;
  const fresh = drills.filter((d) => isNew(d.id)).length;
  const learned = drills.filter((d) => (getRec(d.id).box || 0) >= 3).length;
  $("test-counts").innerHTML = `
    <div class="card"><div class="n">${due}</div><div class="l">Due now</div></div>
    <div class="card"><div class="n">${fresh}</div><div class="l">New</div></div>
    <div class="card"><div class="n">${learned}/${drills.length}</div><div class="l">Learned</div></div>`;
  renderProgress();
}

function renderProgress() {
  let html = "";
  for (const g of REPERTOIRE.groups) {
    html += `<div class="prog-group">${g.title}</div>`;
    for (const c of [...g.chapters].sort((a, b) => (a.tier || 2) - (b.tier || 2))) {
      let learned = 0, due = 0, lapses = 0;
      for (const line of c.lines) {
        const id = drillId(g.id, c.id, line.name);
        const r = SRS[id];
        if (r && (r.box || 0) >= 3) learned++;
        if (isDue(id)) due++;
        lapses += r ? r.lapses || 0 : 0;
      }
      const pct = Math.round((learned / c.lines.length) * 100);
      html += `<div class="prog-row">` +
        `<span class="prog-name">${TIER_MARK[(c.tier || 2) - 1]} ${c.title}</span>` +
        `<span class="prog-stats">${learned}/${c.lines.length}` +
        `${due ? ` · ${due} due` : ""}${lapses ? ` · ${lapses} lapses` : ""}</span>` +
        `<span class="prog-bar"><span style="width:${pct}%"></span></span>` +
        `</div>`;
    }
  }
  $("progress-table").innerHTML = html;
}

function startTest() {
  let drills = scopedDrills();
  if ($("test-dueonly").checked) {
    const due = drills.filter((d) => isDue(d.id));
    const fresh = drills.filter((d) => isNew(d.id)).slice(0, NEW_PER_SESSION);
    const picked = [...due, ...fresh];
    drills = picked.length ? picked : drills; // nothing due or new -> fall back to all in scope
  }
  test.queue = shuffle(drills);
  test.idx = 0;
  test.results = [];
  test.active = true;
  $("test-setup").classList.add("hidden");
  $("test-summary").classList.add("hidden");
  $("test-active").classList.remove("hidden");
  presentDrill();
}

async function presentDrill() {
  test.gen++; // invalidate any opponent loop still running for the previous drill
  const d = test.queue[test.idx];
  test.drill = d;
  test.game = new Chess();
  test.ply = 0;
  test.wrong = 0;
  test.revealed = false;
  test.hinted = false;
  test.complete = false;
  test.last = null;

  board.setOrientation(d.heroColor);
  board.setInteractive(false);
  board.setPosition(test.game);
  $("board-turn").innerHTML = `You are <b>${colorName(d.heroColor)}</b>`;

  $("btn-next-drill").classList.add("hidden");
  $("test-feedback").className = "feedback";
  $("test-feedback").textContent = "";
  $("test-progress").textContent = `Line ${test.idx + 1} of ${test.queue.length}`;
  $("test-drillinfo").innerHTML =
    `<b>${d.chapterTitle}</b> — ${d.lineName} · you are <b>${colorName(d.heroColor)}</b>` +
    (d.retry ? ` · <span class="retry">retry</span>` : "");
  setTestControls(true);

  await advanceOpponent();
}

function heroToMove() {
  const moverColor = test.ply % 2 === 0 ? "w" : "b";
  return moverColor === test.drill.heroColor;
}

// auto-play opponent moves until it's the hero's turn (or line ends).
// Board updates are skipped while the Learn tab is showing; switchTab re-syncs.
async function advanceOpponent() {
  const gen = test.gen;
  while (test.ply < test.drill.moves.length && !heroToMove()) {
    await sleep(420);
    if (gen !== test.gen) return; // drill changed or session ended while we slept
    const san = test.drill.moves[test.ply].san;
    const m = test.game.move(san, { sloppy: true });
    test.last = { from: m.from, to: m.to };
    if (onTestTab()) board.setPosition(test.game, test.last);
    test.ply++;
  }
  if (gen !== test.gen) return;
  if (test.ply >= test.drill.moves.length) return finishDrill();
  // hero to move
  if (onTestTab()) board.setInteractive(true);
  const moveNo = Math.floor(test.ply / 2) + 1;
  $("test-prompt").textContent = `Your move (${moveNo}${test.drill.heroColor === "w" ? "." : "..."}) — play your repertoire move.`;
}

function onUserMove(from, to) {
  if (!heroToMove() || test.complete) return;
  const expected = test.drill.moves[test.ply].san;
  const m = test.game.move({ from, to, promotion: "q" });
  if (!m) return;
  if (norm(m.san) === norm(expected)) {
    test.last = { from: m.from, to: m.to };
    board.setPosition(test.game, test.last);
    const idea = commentForPly(test.drill.chapter, test.drill.moves, test.ply + 1);
    $("test-feedback").className = "feedback ok";
    $("test-feedback").innerHTML = `✓ <b>${expected}</b> — correct.` +
      (idea ? `<span class="idea">${idea}</span>` : "");
    test.ply++;
    board.setInteractive(false);
    advanceOpponent();
  } else {
    test.game.undo();
    test.wrong++;
    board.shake();
    board.setPosition(test.game, test.last);
    const sibling = siblingLineWith(m.san);
    $("test-feedback").className = "feedback bad";
    $("test-feedback").innerHTML = sibling
      ? `✗ <b>${m.san}</b> is your move in “${sibling}” — but this drill is “${test.drill.lineName}”. Try again.`
      : `✗ <b>${m.san}</b> isn't your repertoire move. Try again — or use Hint / Show move.`;
  }
}

// If a wrong move is actually the hero move of a sibling line in this chapter
// (same position, different branch), say so — it's a fine move, just not the
// line being drilled.
function siblingLineWith(san) {
  const prefix = test.drill.moves.slice(0, test.ply).map((x) => x.san).join(" ");
  for (const line of test.drill.chapter.lines) {
    if (line.name === test.drill.lineName || line.moves.length <= test.ply) continue;
    const p = line.moves.slice(0, test.ply).map((x) => x.san).join(" ");
    if (p === prefix && norm(line.moves[test.ply].san) === norm(san)) return line.name;
  }
  return null;
}

function doHint() {
  if (test.complete || !heroToMove()) return;
  test.hinted = true;
  const expected = test.drill.moves[test.ply].san;
  const verbose = test.game.moves({ verbose: true });
  const mv = verbose.find((v) => norm(v.san) === norm(expected));
  if (mv) {
    board._clearSelection();
    board.squares[mv.from]?.classList.add("selected");
    $("test-feedback").className = "feedback";
    $("test-feedback").innerHTML = `💡 Move the piece on <b>${mv.from}</b>.`;
  }
}

function doReveal() {
  if (test.complete || !heroToMove()) return;
  test.revealed = true;
  const expected = test.drill.moves[test.ply].san;
  const m = test.game.move(expected, { sloppy: true });
  test.last = { from: m.from, to: m.to };
  board.setPosition(test.game, test.last);
  const idea = commentForPly(test.drill.chapter, test.drill.moves, test.ply + 1);
  $("test-feedback").className = "feedback";
  $("test-feedback").innerHTML = `👁 The move was <b>${expected}</b>.` +
    (idea ? `<span class="idea">${idea}</span>` : "");
  test.ply++;
  board.setInteractive(false);
  advanceOpponent();
}

function skipDrill() {
  // no SRS change; record as skipped
  test.results.push({ drill: test.drill, status: "skip" });
  nextDrill();
}

function finishDrill() {
  test.complete = true;
  board.setInteractive(false);
  let status, result;
  if (test.revealed || test.wrong > 0) { status = "fail"; result = "fail"; }
  else if (test.hinted) { status = "hint"; result = "neutral"; }
  else if (test.drill.retry) { status = "relearn"; result = "relearn"; }
  else { status = "pass"; result = "pass"; }
  gradeDrill(test.drill.id, result);
  test.results.push({ drill: test.drill, status, wrong: test.wrong });
  if (status === "fail") {
    // a missed line comes back a couple of drills later in this same session
    const pos = Math.min(test.idx + 3, test.queue.length);
    test.queue.splice(pos, 0, { ...test.drill, retry: true });
  }
  updateStatsBar();

  const msg = {
    pass: "✓ Perfect — line complete!",
    relearn: "✓ Got it this time — it's scheduled for tomorrow.",
    hint: "✓ Complete (with a hint).",
    fail: "Line complete — review the ideas above; it will come back in a few lines.",
  }[status];
  $("test-prompt").textContent = msg;
  setTestControls(false);
  $("btn-next-drill").classList.remove("hidden");
  $("btn-next-drill").textContent =
    test.idx + 1 < test.queue.length ? "Next line ▶" : "See results ▶";
}

function nextDrill() {
  test.idx++;
  if (test.idx >= test.queue.length) return showSummary();
  presentDrill();
}

function setTestControls(on) {
  ["btn-hint", "btn-reveal", "btn-skip"].forEach((id) => { $(id).disabled = !on; });
}

function showSummary() {
  test.active = false;
  test.gen++;
  $("test-active").classList.add("hidden");
  $("test-summary").classList.remove("hidden");
  const r = test.results;
  const pass = r.filter((x) => x.status === "pass").length;
  const relearn = r.filter((x) => x.status === "relearn").length;
  const hint = r.filter((x) => x.status === "hint").length;
  const fail = r.filter((x) => x.status === "fail").length;
  const skip = r.filter((x) => x.status === "skip").length;
  const rows = r.map((x) => {
    const cls = x.status === "pass" || x.status === "relearn" ? "ok" : x.status === "fail" ? "bad" : "";
    const tag = { pass: "✓ clean", relearn: "✓ relearned", hint: "✓ hint", fail: "✗ missed", skip: "↷ skipped" }[x.status];
    return `<div class="row"><span>${x.drill.chapterTitle} — ${x.drill.lineName}</span><span class="${cls}">${tag}</span></div>`;
  }).join("");
  $("summary-text").innerHTML =
    `<div class="row"><b>Clean: ${pass}</b> &nbsp; Relearned: ${relearn} &nbsp; Hinted: ${hint} &nbsp; ` +
    `<span class="bad">Missed: ${fail}</span> &nbsp; Skipped: ${skip}</div>` + rows;
  updateStatsBar();
  updateTestCounts();
}

function quitTest() {
  test.active = false;
  test.gen++; // kill any in-flight opponent loop
  $("test-active").classList.add("hidden");
  $("test-setup").classList.remove("hidden");
  updateTestCounts();
}

// ============================================================ stats bar
function updateStatsBar() {
  const drills = allDrills();
  const due = drills.filter((d) => isDue(d.id)).length;
  const fresh = drills.filter((d) => isNew(d.id)).length;
  const learned = drills.filter((d) => (getRec(d.id).box || 0) >= 3).length;
  $("stats").innerHTML =
    `<span class="pill">📚 <b>${drills.length}</b> lines</span>` +
    `<span class="pill">⏰ <b>${due}</b> due</span>` +
    `<span class="pill">🆕 <b>${fresh}</b> new</span>` +
    `<span class="pill">✅ <b>${learned}</b> learned</span>`;
}

// ============================================================ tabs
function switchTab(which) {
  stopAuto();
  const learnOn = which === "learn";
  $("tab-learn").classList.toggle("active", learnOn);
  $("tab-test").classList.toggle("active", !learnOn);
  $("learn-panel").classList.toggle("hidden", !learnOn);
  $("test-panel").classList.toggle("hidden", learnOn);
  if (learnOn) { renderLearn(); return; }
  if (test.active) {
    // a session is in progress — restore it instead of resetting
    board.setOrientation(test.drill.heroColor);
    board.setPosition(test.game, test.last);
    board.setInteractive(!test.complete && heroToMove());
    $("board-turn").innerHTML = `You are <b>${colorName(test.drill.heroColor)}</b>`;
  } else {
    $("test-active").classList.add("hidden");
    $("test-summary").classList.add("hidden");
    $("test-setup").classList.remove("hidden");
    updateTestCounts();
    board.setInteractive(false);
    board.setOrientation("w");
    board.setPosition(new Chess());
    $("board-turn").innerHTML = "Pick a scope and start drilling";
  }
}

// ============================================================ learn -> drill
function drillCurrentLine() {
  const g = REPERTOIRE.groups[learn.g];
  const ch = g.chapters[learn.c];
  const line = ch.lines[learn.l];
  const d = allDrills().find((x) => x.id === drillId(g.id, ch.id, line.name));
  stopAuto();
  test.queue = [d];
  test.idx = 0;
  test.results = [];
  test.active = true;
  $("tab-learn").classList.remove("active");
  $("tab-test").classList.add("active");
  $("learn-panel").classList.add("hidden");
  $("test-panel").classList.remove("hidden");
  $("test-setup").classList.add("hidden");
  $("test-summary").classList.add("hidden");
  $("test-active").classList.remove("hidden");
  presentDrill();
}

// ============================================================ progress export/import
function exportProgress() {
  const payload = {
    app: "chess-opening-trainer",
    exported: new Date().toISOString(),
    srs: SRS,
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `chess-trainer-progress-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importProgress(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const srs = data && data.srs ? data.srs : data; // accept a raw SRS map too
      const entries = Object.entries(srs || {}).filter(
        ([, r]) => r && typeof r.box === "number" && typeof r.due === "number"
      );
      if (!entries.length) throw new Error("no records");
      const ok = confirm(
        `Replace your current progress (${Object.keys(SRS).length} lines tracked) ` +
        `with the imported file (${entries.length} lines)?`
      );
      if (!ok) return;
      SRS = Object.fromEntries(entries);
      saveSrs();
      updateStatsBar();
      updateTestCounts();
      alert("Progress imported.");
    } catch {
      alert("That file doesn't look like an exported progress file.");
    }
  };
  reader.readAsText(file);
}

// ============================================================ init
function routeUserMove(from, to) {
  if ($("learn-panel").classList.contains("hidden")) onUserMove(from, to);
  else learnUserMove(from, to);
}

function init() {
  board = new Board($("board"), { orientation: "w", onMove: routeUserMove });

  initLearnSelectors();
  initTestSetup();
  updateStatsBar();

  $("learn-group").addEventListener("change", (e) => { learn.g = +e.target.value; refreshChapterSelect(); });
  $("learn-chapter").addEventListener("change", (e) => { learn.c = +e.target.value; refreshLineSelect(); });
  $("learn-line").addEventListener("change", (e) => { learn.l = +e.target.value; loadLearnLine(); });

  $("btn-first").addEventListener("click", () => { stopAuto(); learn.ply = 0; renderLearn(); });
  $("btn-prev").addEventListener("click", () => { stopAuto(); stepLearn(-1); });
  $("btn-next").addEventListener("click", () => { stopAuto(); stepLearn(1); });
  $("btn-last").addEventListener("click", () => { stopAuto(); learn.ply = currentLearnLine().moves.length; renderLearn(); });
  $("btn-auto").addEventListener("click", toggleAuto);
  $("btn-flip").addEventListener("click", () => board.flip());
  $("btn-drill-line").addEventListener("click", drillCurrentLine);

  $("tab-learn").addEventListener("click", () => switchTab("learn"));
  $("tab-test").addEventListener("click", () => switchTab("test"));

  $("test-group").addEventListener("change", updateTestCounts);
  $("test-dueonly").addEventListener("change", updateTestCounts);
  $("btn-test-start").addEventListener("click", startTest);
  $("btn-hint").addEventListener("click", doHint);
  $("btn-reveal").addEventListener("click", doReveal);
  $("btn-skip").addEventListener("click", skipDrill);
  $("btn-next-drill").addEventListener("click", nextDrill);
  $("btn-test-quit").addEventListener("click", quitTest);
  $("btn-summary-again").addEventListener("click", startTest);
  $("btn-summary-close").addEventListener("click", () => {
    $("test-summary").classList.add("hidden");
    $("test-setup").classList.remove("hidden");
  });

  $("btn-export").addEventListener("click", exportProgress);
  $("btn-import").addEventListener("click", () => $("import-file").click());
  $("import-file").addEventListener("change", (e) => {
    if (e.target.files[0]) importProgress(e.target.files[0]);
    e.target.value = "";
  });

  // keyboard shortcuts — skipped while a form control has focus (arrow keys
  // change <select> values, and Enter/Space on a focused button already clicks it)
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target && e.target.tagName;
    if (tag === "SELECT" || tag === "INPUT" || tag === "TEXTAREA") return;
    if (!$("learn-panel").classList.contains("hidden")) {
      if (e.key === "ArrowRight") { stopAuto(); stepLearn(1); }
      else if (e.key === "ArrowLeft") { stopAuto(); stepLearn(-1); }
      return;
    }
    if ($("test-active").classList.contains("hidden")) return;
    const k = e.key.toLowerCase();
    if (k === "h" && !$("btn-hint").disabled) doHint();
    else if (k === "s" && !$("btn-reveal").disabled) doReveal();
    else if ((k === "enter" || k === " " || k === "arrowright") && tag !== "BUTTON") {
      if (!$("btn-next-drill").classList.contains("hidden")) { e.preventDefault(); nextDrill(); }
    }
  });

  // offline support once installed; sw.js serves cached assets stale-while-revalidate
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});

  renderLearn();
}

init();
