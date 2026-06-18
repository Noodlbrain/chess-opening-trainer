import { Chess } from "../lib/chess.js";
import { REPERTOIRE } from "./repertoire.js";
import { Board } from "./board.js";

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
const BOX_DAYS = [0, 1, 3, 7, 16]; // boxes 1..5
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
  return !r || r.due <= Date.now();
};

// result: "pass" | "fail" | "neutral"
function gradeDrill(id, result) {
  const r = getRec(id);
  if (result === "pass") r.box = Math.min((r.box || 0) + 1, 5);
  else if (result === "fail") { r.box = 1; r.lapses = (r.lapses || 0) + 1; }
  else r.box = Math.max(r.box || 1, 1); // neutral: keep box, just reschedule
  r.reps = (r.reps || 0) + 1;
  r.due = Date.now() + BOX_DAYS[r.box - 1] * DAY;
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
const learn = { g: 0, c: 0, l: 0, ply: 0, game: new Chess(), autoTimer: null };

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
function refreshChapterSelect() {
  const grp = REPERTOIRE.groups[learn.g];
  fillSelect($("learn-chapter"), grp.chapters, (x, i) => i, (x) => x.title);
  learn.c = 0;
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

  board.setInteractive(false);
  board.setOrientation(ch.heroColor);
  board.setPosition(game, last);

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
    ? "Starting position. Step forward to walk the line — read the idea behind every move."
    : commentForPly(ch, moves, learn.ply);
  $("learn-comment").textContent = comment || "(transposes — see the main line for the idea)";

  // turn indicator
  const toMove = learn.ply % 2 === 0 ? "w" : "b";
  $("board-turn").innerHTML = learn.ply >= moves.length
    ? "<b>End of line</b>"
    : `<b>${colorName(toMove)}</b> to move`;

  // nav availability
  $("btn-first").disabled = learn.ply === 0;
  $("btn-prev").disabled = learn.ply === 0;
  $("btn-next").disabled = learn.ply >= moves.length;
  $("btn-last").disabled = learn.ply >= moves.length;
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
};

function initTestSetup() {
  const opts = [{ id: "__all", title: "Everything" },
    ...REPERTOIRE.groups.map((g) => ({ id: g.id, title: g.title }))];
  fillSelect($("test-group"), opts, (x) => x.id, (x) => x.title);
  updateTestCounts();
}

function scopedDrills() {
  const scope = $("test-group").value;
  let drills = allDrills();
  if (scope !== "__all") drills = drills.filter((d) => d.groupId === scope);
  return drills;
}

function updateTestCounts() {
  const drills = scopedDrills();
  const due = drills.filter((d) => isDue(d.id)).length;
  const learned = drills.filter((d) => (getRec(d.id).box || 0) >= 3).length;
  const seen = drills.filter((d) => SRS[d.id]).length;
  $("test-counts").innerHTML = `
    <div class="card"><div class="n">${due}</div><div class="l">Due now</div></div>
    <div class="card"><div class="n">${seen}/${drills.length}</div><div class="l">Started</div></div>
    <div class="card"><div class="n">${learned}</div><div class="l">Learned</div></div>`;
}

function startTest() {
  let drills = scopedDrills();
  if ($("test-dueonly").checked) {
    const due = drills.filter((d) => isDue(d.id));
    drills = due.length ? due : drills; // nothing due -> fall back to all in scope
  }
  test.queue = shuffle(drills);
  test.idx = 0;
  test.results = [];
  $("test-setup").classList.add("hidden");
  $("test-summary").classList.add("hidden");
  $("test-active").classList.remove("hidden");
  presentDrill();
}

async function presentDrill() {
  const d = test.queue[test.idx];
  test.drill = d;
  test.game = new Chess();
  test.ply = 0;
  test.wrong = 0;
  test.revealed = false;
  test.hinted = false;
  test.complete = false;

  board.setOrientation(d.heroColor);
  board.setInteractive(false);
  board.setPosition(test.game);

  $("btn-next-drill").classList.add("hidden");
  $("test-feedback").className = "feedback";
  $("test-feedback").textContent = "";
  $("test-progress").textContent = `Line ${test.idx + 1} of ${test.queue.length}`;
  $("test-drillinfo").innerHTML =
    `<b>${d.chapterTitle}</b> — ${d.lineName} · you are <b>${colorName(d.heroColor)}</b>`;
  setTestControls(true);

  await advanceOpponent();
}

function heroToMove() {
  const moverColor = test.ply % 2 === 0 ? "w" : "b";
  return moverColor === test.drill.heroColor;
}

// auto-play opponent moves until it's the hero's turn (or line ends)
async function advanceOpponent() {
  while (test.ply < test.drill.moves.length && !heroToMove()) {
    await sleep(420);
    const san = test.drill.moves[test.ply].san;
    const m = test.game.move(san, { sloppy: true });
    board.setPosition(test.game, { from: m.from, to: m.to });
    test.ply++;
  }
  if (test.ply >= test.drill.moves.length) return finishDrill();
  // hero to move
  board.setInteractive(true);
  const moveNo = Math.floor(test.ply / 2) + 1;
  $("test-prompt").textContent = `Your move (${moveNo}${test.drill.heroColor === "w" ? "." : "..."}) — play your repertoire move.`;
}

function onUserMove(from, to) {
  if (!heroToMove() || test.complete) return;
  const expected = test.drill.moves[test.ply].san;
  const m = test.game.move({ from, to, promotion: "q" });
  if (!m) return;
  if (norm(m.san) === norm(expected)) {
    board.setPosition(test.game, { from: m.from, to: m.to });
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
    board.setPosition(test.game, board.lastMove);
    $("test-feedback").className = "feedback bad";
    $("test-feedback").innerHTML =
      `✗ <b>${m.san}</b> isn't your repertoire move. Try again — or use Hint / Show move.`;
  }
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
  board.setPosition(test.game, { from: m.from, to: m.to });
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
  else { status = "pass"; result = "pass"; }
  gradeDrill(test.drill.id, result);
  test.results.push({ drill: test.drill, status, wrong: test.wrong });
  updateStatsBar();

  const msg = {
    pass: "✓ Perfect — line complete!",
    hint: "✓ Complete (with a hint).",
    fail: "Line complete — review the ideas above; this one will come back soon.",
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
  $("test-active").classList.add("hidden");
  $("test-summary").classList.remove("hidden");
  const r = test.results;
  const pass = r.filter((x) => x.status === "pass").length;
  const hint = r.filter((x) => x.status === "hint").length;
  const fail = r.filter((x) => x.status === "fail").length;
  const skip = r.filter((x) => x.status === "skip").length;
  const rows = r.map((x) => {
    const cls = x.status === "pass" ? "ok" : x.status === "fail" ? "bad" : "";
    const tag = { pass: "✓ clean", hint: "✓ hint", fail: "✗ missed", skip: "↷ skipped" }[x.status];
    return `<div class="row"><span>${x.drill.chapterTitle} — ${x.drill.lineName}</span><span class="${cls}">${tag}</span></div>`;
  }).join("");
  $("summary-text").innerHTML =
    `<div class="row"><b>Clean: ${pass}</b> &nbsp; Hinted: ${hint} &nbsp; ` +
    `<span class="bad">Missed: ${fail}</span> &nbsp; Skipped: ${skip}</div>` + rows;
  updateStatsBar();
  updateTestCounts();
}

function quitTest() {
  $("test-active").classList.add("hidden");
  $("test-setup").classList.remove("hidden");
  updateTestCounts();
}

// ============================================================ stats bar
function updateStatsBar() {
  const drills = allDrills();
  const due = drills.filter((d) => isDue(d.id)).length;
  const learned = drills.filter((d) => (getRec(d.id).box || 0) >= 3).length;
  $("stats").innerHTML =
    `<span class="pill">📚 <b>${drills.length}</b> lines</span>` +
    `<span class="pill">⏰ <b>${due}</b> due</span>` +
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
  if (learnOn) renderLearn();
  else {
    // reset test to setup view
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

// ============================================================ init
function init() {
  board = new Board($("board"), { orientation: "w", onMove: onUserMove });

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

  // keyboard nav in learn mode
  document.addEventListener("keydown", (e) => {
    if ($("learn-panel").classList.contains("hidden")) return;
    if (e.key === "ArrowRight") { stopAuto(); stepLearn(1); }
    else if (e.key === "ArrowLeft") { stopAuto(); stepLearn(-1); }
  });

  renderLearn();
}

init();
