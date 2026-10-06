import './style.css';
import { Game, SIZE, LEVEL_TIME, offsetRange, type Dir, type Move } from './game';
import { CELL, Renderer, coreRow, drawPreview, pieceBox, pieceMarkup } from './render';
import { Tutorial, tutorialDone } from './tutorial';

const $ = <T extends Element>(id: string) => document.getElementById(id) as unknown as T;

const board = $<SVGSVGElement>('board');
const dragEl = $<SVGSVGElement>('drag');
const overlay = $<HTMLDivElement>('overlay');
const intro = $<HTMLDivElement>('intro');
const help = $<HTMLDialogElement>('help');
const tapBtn = $<HTMLButtonElement>('tapBtn');
const slotEls = [$<SVGSVGElement>('slot0'), $<SVGSVGElement>('slot1')];
const game = new Game();
const renderer = new Renderer(board);
const tutorial = new Tutorial(game, renderer, () => game.newGame());

let tapMode = false;
let introUntil = 0;
let seenLevelStart = -1;
let panelVersion = -1;
let drag: { slot: number; id: number; x: number; y: number; moved: boolean; touch: boolean; move: Move | null } | null = null;
/** Keyboard play: chosen slot, slide direction and offset. */
const kb: { slot: number; dir: Dir | null; offset: number } = { slot: 0, dir: null, offset: 0 };

/** Board lanes (rows or columns) that the piece enters by. */
function lanesOf(move: Move): number[] {
  const piece = game.slots[move.slot];
  const across = move.dir === 'left' || move.dir === 'right';
  return [...new Set(piece.cells.map((c) => (across ? c.y : c.x) + move.offset))];
}

/** Shows the landing preview. Returns true if the move is legal. */
function preview(move: Move | null): boolean {
  if (!move) {
    renderer.showPreview(null, null, []);
    return false;
  }
  const landing = game.preview(move);
  renderer.showPreview(landing, move.dir, lanesOf(move));
  return landing !== null;
}

function play(move: Move): void {
  if (!tutorial.allow({ type: 'play', move })) {
    preview(null);
    return;
  }
  if (game.play(move)) {
    tutorial.did({ type: 'play', move });
    introUntil = 0;
    intro.classList.remove('show');
  }
  preview(null);
}

function clampOffset(slot: number, dir: Dir, offset: number): number {
  const [lo, hi] = offsetRange(game.slots[slot], dir);
  return Math.min(hi, Math.max(lo, offset));
}

// Dragging a piece from the tray. The side of the board nearest the piece sets the slide direction.
function moveFromPointer(slot: number, pivotX: number, pivotY: number): Move | null {
  const { x, y } = renderer.toCells(pivotX, pivotY);
  if (x < -2 || y < -2 || x > SIZE + 2 || y > SIZE + 2) return null;
  const sides: [number, Dir][] = [[x, 'right'], [SIZE - x, 'left'], [y, 'down'], [SIZE - y, 'up']];
  const dir = sides.reduce((a, b) => (b[0] < a[0] ? b : a))[1];
  const lane = Math.floor(dir === 'left' || dir === 'right' ? y : x);
  return { slot, dir, offset: clampOffset(slot, dir, lane) };
}

function updateDrag(e: PointerEvent): void {
  if (!drag) return;
  const box = pieceBox(game.slots[drag.slot]);
  const scale = renderer.cellPx() / CELL;
  // On touch the piece floats above the finger, so the finger does not hide it.
  const cx = e.clientX;
  const cy = e.clientY - (drag.touch ? (box.h * scale) / 2 + 24 : 0);
  dragEl.style.left = `${cx - (box.w * scale) / 2}px`;
  dragEl.style.top = `${cy - (box.h * scale) / 2}px`;
  const pivotX = cx + (-box.x - box.w / 2 + CELL / 2) * scale;
  const pivotY = cy + (-box.y - box.h / 2 + CELL / 2) * scale;
  drag.move = moveFromPointer(drag.slot, pivotX, pivotY);
  dragEl.classList.toggle('bad', !preview(drag.move));
}

function startDrag(): void {
  if (!drag) return;
  const piece = game.slots[drag.slot];
  const box = pieceBox(piece);
  const scale = renderer.cellPx() / CELL;
  dragEl.setAttribute('viewBox', `${box.x} ${box.y} ${box.w} ${box.h}`);
  dragEl.style.width = `${box.w * scale}px`;
  dragEl.style.height = `${box.h * scale}px`;
  dragEl.innerHTML = pieceMarkup(piece);
  dragEl.classList.add('on');
  slotEls[drag.slot].classList.add('dragging');
}

function endDrag(): void {
  if (drag) slotEls[drag.slot].classList.remove('dragging');
  drag = null;
  dragEl.classList.remove('on');
  preview(null);
}

// A press near the pieces grabs the nearest one: the gap between them, a strip above the tray, and everything below it
// down to the screen edge count, so a finger that lands just outside a piece still drags it.
const GRAB_MARGIN = 24;
function slotAt(e: PointerEvent): number {
  const t = e.target as Element;
  if (t.closest('button, dialog, #overlay')) return -1;
  const first = slotEls[0].getBoundingClientRect(), last = slotEls[slotEls.length - 1].getBoundingClientRect();
  if (e.clientY < first.top - GRAB_MARGIN || e.clientX < first.left - GRAB_MARGIN || e.clientX > last.right + GRAB_MARGIN) return -1;
  let best = -1, bestD = Infinity;
  slotEls.forEach((el, i) => {
    const r = el.getBoundingClientRect(), d = Math.abs(e.clientX - Math.min(r.right, Math.max(r.left, e.clientX)));
    if (d < bestD) { bestD = d; best = i; }
  });
  return best;
}
document.addEventListener('pointerdown', (e) => {
  if (game.phase !== 'play' || drag) return;
  const slot = slotAt(e);
  if (slot < 0) return;
  e.preventDefault();
  setTapMode(false);
  drag = { slot, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, touch: e.pointerType !== 'mouse', move: null };
  slotEls[slot].setPointerCapture(e.pointerId);
});
// A finger moving anywhere outside a dialog never scrolls or bounces the page.
document.addEventListener('touchmove', (e) => {
  if (!(e.target as Element).closest('dialog')) e.preventDefault();
}, { passive: false });

slotEls.forEach((el, slot) => {
  el.addEventListener('pointermove', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8) {
      if (!tutorial.allow({ type: 'drag', slot })) return;
      drag.moved = true;
      startDrag();
    }
    if (drag.moved) updateDrag(e);
  });
  el.addEventListener('pointerup', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const { moved, move } = drag;
    endDrag();
    if (!moved) rotate(slot, 1);
    else if (move) play(move);
  });
  el.addEventListener('pointercancel', endDrag);
});

function rotate(slot: number, dir: 1 | -1): void {
  if (!tutorial.allow({ type: 'rotate', slot })) return;
  game.rotateSlot(slot, dir);
  tutorial.did({ type: 'rotate', slot });
}

function setTapMode(on: boolean): void {
  tapMode = on && game.taps > 0 && game.phase === 'play';
  board.classList.toggle('tap-mode', tapMode);
  tapBtn.classList.toggle('active', tapMode);
}

function toggleTapMode(): void {
  if (tapMode) setTapMode(false);
  else if (tutorial.allow({ type: 'tapMode' })) {
    setTapMode(true);
    tutorial.did({ type: 'tapMode' });
  }
}

tapBtn.addEventListener('click', toggleTapMode);
board.addEventListener('pointerdown', (e) => {
  if (!tapMode) return;
  const { x, y } = renderer.toCells(e.clientX, e.clientY);
  const a = { type: 'tap', r: Math.floor(y), c: Math.floor(x) } as const;
  if (tutorial.allow(a) && game.tap(a.r, a.c)) tutorial.did(a);
  setTapMode(false);
});
board.addEventListener('contextmenu', (e) => e.preventDefault());

function continueAfterEnd(): void {
  if (game.phase === 'won') game.startLevel(game.level + 1);
  else if (game.phase === 'lost') game.newGame();
}
overlay.addEventListener('click', continueAfterEnd);

$('helpBtn').addEventListener('click', () => {
  help.showModal();
  // The dialog focuses its first link, which can scroll it to the bottom.
  (document.activeElement as HTMLElement | null)?.blur();
  help.scrollTop = 0;
});
$('closeHelp').addEventListener('click', () => help.close());
$('newBtn').addEventListener('click', () => {
  help.close();
  setTapMode(false);
  if (tutorial.active) tutorial.skip();
  else game.newGame();
});
$('tutorialBtn').addEventListener('click', () => {
  help.close();
  setTapMode(false);
  tutorial.start();
});

// Block text selection and zoom. iOS Safari ignores user-scalable=no, so pinch and double-tap need these too.
const block = (e: Event) => e.preventDefault();
for (const type of ['selectstart', 'gesturestart', 'gesturechange', 'dblclick']) document.addEventListener(type, block);
document.addEventListener('touchmove', (e) => {
  if (e.touches.length > 1) e.preventDefault();
}, { passive: false });
document.addEventListener('wheel', (e) => {
  if (e.ctrlKey) e.preventDefault(); // trackpad pinch on desktop
}, { passive: false });
window.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && ['+', '=', '-', '0'].includes(e.key)) e.preventDefault();
});

const KEY_DIRS: Record<string, Dir> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

function kbMove(): Move | null {
  return kb.dir ? { slot: kb.slot, dir: kb.dir, offset: clampOffset(kb.slot, kb.dir, kb.offset) } : null;
}

window.addEventListener('keydown', (e) => {
  if (help.open) return;
  if (game.phase !== 'play') {
    if (e.key === ' ' || e.key === 'Enter') continueAfterEnd();
    return;
  }
  const dir = KEY_DIRS[e.key];
  if (dir) {
    if (kb.dir !== dir) kb.offset = SIZE / 2 - 1;
    kb.dir = dir;
  } else {
    switch (e.key) {
      case '1': case '2': kb.slot = Number(e.key) - 1; break;
      case 'q': case 'Q': kb.offset = Math.max(0, kb.offset - 1); break;
      case 'e': case 'E': kb.offset = Math.min(SIZE - 1, kb.offset + 1); break;
      case 'z': case 'Z': rotate(kb.slot, -1); break;
      case 'x': case 'X': case 'r': case 'R': rotate(kb.slot, 1); break;
      case 't': case 'T': toggleTapMode(); break;
      case 'Escape': kb.dir = null; break;
      case ' ':
      case 'Enter': {
        const move = kbMove();
        if (move && game.preview(move)) {
          play(move);
          kb.dir = null;
        }
        break;
      }
      default: return;
    }
  }
  e.preventDefault();
  if (kb.dir) kb.offset = clampOffset(kb.slot, kb.dir, kb.offset);
  slotEls.forEach((el, i) => el.classList.toggle('selected', !!kb.dir && i === kb.slot));
  preview(kbMove());
});

function showIntro(now: number): void {
  const cores = game.coreTiles().map((t) => t.color);
  intro.innerHTML = `<div class="intro-level">Level ${game.level}</div>
    <div class="intro-goal">Remove all ${cores.length}</div>${coreRow(cores)}`;
  intro.classList.remove('show');
  void intro.offsetWidth; // restart the CSS animation
  intro.classList.add('show');
  introUntil = now + 2200;
}

function formatTime(s: number): string {
  const t = Math.ceil(s);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`;
}

function updatePanel(): void {
  const bar = $<HTMLDivElement>('timerBar');
  bar.style.width = `${(game.timeLeft / LEVEL_TIME) * 100}%`;
  bar.classList.toggle('low', game.timeLeft <= 15);
  if (panelVersion === game.version) return;
  panelVersion = game.version;
  $('score').textContent = game.score.toLocaleString('en');
  $('level').textContent = String(game.level);
  $('cores').textContent = String(game.coresLeft());
  $('taps').textContent = String(game.taps);
  $('timerText').textContent = formatTime(game.timeLeft);
  tapBtn.disabled = game.taps === 0;
  slotEls.forEach((el, i) => drawPreview(el, game.slots[i]));
  drawPreview($('next'), game.next);
}

function updateOverlay(): void {
  const end = (game.phase === 'won' || game.phase === 'lost') && !renderer.busy;
  if (end && overlay.hidden) {
    const score = game.score.toLocaleString('en');
    overlay.innerHTML = game.phase === 'won'
      ? `<h2>Level ${game.level} clear</h2><p>Time bonus +${game.lastBonus.toLocaleString('en')}</p><p>Score ${score}</p><p class="cta">Tap to continue</p>`
      : `<h2>${game.lostReason === 'time' ? "Time's up" : 'No room for any piece'}</h2><p>Level ${game.level} · Score ${score}</p><p class="cta">Tap to play again</p>`;
  }
  overlay.hidden = !end;
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (game.levelStarts !== seenLevelStart && !tutorial.active) {
    seenLevelStart = game.levelStarts;
    showIntro(now);
  }
  if (!help.open && !document.hidden && now > introUntil) game.tick(dt);
  renderer.update(game);
  updatePanel();
  updateOverlay();
  requestAnimationFrame(frame);
}
if (!tutorialDone()) tutorial.start();
requestAnimationFrame(frame);
