import re, sys
import chess

text = open("js/repertoire.js", encoding="utf-8").read()
lines_src = text.split("\n")

san_re = re.compile(r'san:\s*"((?:[^"\\]|\\.)*)"')
comment_re = re.compile(r'c:\s*"((?:[^"\\]|\\.)*)"')
header_re = re.compile(r'name:\s*"((?:[^"\\]|\\.)*)".*moves:')
title_re = re.compile(r'title:\s*"((?:[^"\\]|\\.)*)"')
hero_re = re.compile(r'heroColor:\s*"([wb])"')

# drills: (chapter_title, hero, line_name, [(san, comment), ...])
drills = []
current_chapter = None
current_hero = "w"
current_name = None
current_moves = None


def flush():
    global current_name, current_moves
    if current_name is not None:
        drills.append((current_chapter, current_hero, current_name, current_moves))
    current_name = None
    current_moves = None


for raw in lines_src:
    hm = hero_re.search(raw)
    if hm:
        current_hero = hm.group(1)
        continue
    t = title_re.search(raw)
    if t:
        # both groups and chapters have title:; group titles are harmlessly
        # overwritten by the first chapter title before any lines appear
        flush()
        current_chapter = t.group(1)
        continue
    h = header_re.search(raw)
    if h:
        flush()
        current_name = h.group(1)
        current_moves = []
        continue
    if current_moves is not None:
        m = san_re.search(raw)
        if m:
            c = comment_re.search(raw)
            current_moves.append((m.group(1), c.group(1) if c else ""))
flush()

# ---------------------------------------------------------------- legality
errors = 0
move_total = 0
for chapter, hero, name, moves in drills:
    board = chess.Board()
    for ply, (san, _) in enumerate(moves, 1):
        move_total += 1
        try:
            board.push_san(san)
        except Exception:
            errors += 1
            print(f'ILLEGAL: ["{name}"] ply {ply}: "{san}"')
            print(f"  FEN before: {board.fen()}")
            print(f"  Legal: {[board.san(m) for m in board.legal_moves]}")
            break

# ------------------------------------------- hero-move divergences (warning)
# Two lines in one chapter that share a prefix but then differ on a HERO move
# make drills ambiguous from the board alone (the app shows the line name and
# explains sibling moves, but these spots deserve a look when adding lines).
by_chapter = {}
for chapter, hero, name, moves in drills:
    by_chapter.setdefault((chapter, hero), []).append((name, [s for s, _ in moves]))

divergences = []
for (chapter, hero), lns in by_chapter.items():
    hero_idx = 0 if hero == "w" else 1
    for a in range(len(lns)):
        for b in range(a + 1, len(lns)):
            na, ma = lns[a]
            nb, mb = lns[b]
            i = 0
            while i < len(ma) and i < len(mb) and ma[i] == mb[i]:
                i += 1
            if i < len(ma) and i < len(mb) and i % 2 == hero_idx:
                divergences.append(
                    f'{chapter}: "{na}" vs "{nb}" split on YOUR move at ply {i + 1} ({ma[i]} / {mb[i]})'
                )

# ------------------------------------------------ comment coverage (warning)
# A HERO move that introduces a NEW position in its chapter (no earlier line
# covers it) should carry an explanation — it's a move the user must produce.
# Opponent moves are routinely left uncommented; skip those.
uncommented = []
for (chapter, hero), _ in by_chapter.items():
    hero_idx = 0 if hero == "w" else 1
    seen_paths = set()
    for ch2, h2, name, moves in drills:
        if (ch2, h2) != (chapter, hero):
            continue
        path = ""
        missing = []
        for ply, (san, c) in enumerate(moves):
            path += (" " if path else "") + san
            if path not in seen_paths:
                seen_paths.add(path)
                if ply % 2 == hero_idx and not c.strip():
                    missing.append(f"{ply // 2 + 1}{'.' if hero_idx == 0 else '...'}{san}")
        if missing:
            uncommented.append(f'{chapter}: "{name}" — your uncommented move(s): {", ".join(missing)}')

print(f"\nChecked {len(drills)} lines, {move_total} moves.")
print("ALL LINES LEGAL" if errors == 0 else f"{errors} ILLEGAL MOVE(S)")

if divergences:
    print(f"\n{len(divergences)} hero-move divergence(s) — intentional alternatives are fine, typos are not:")
    for d in divergences:
        print(f"  ~ {d}")
if uncommented:
    print(f"\n{len(uncommented)} line(s) with uncommented new moves:")
    for u in uncommented:
        print(f"  ~ {u}")

sys.exit(0 if errors == 0 else 1)
