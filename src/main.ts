import './style.css';
import { Game, SIZE, stonesPerTurn, type Dir } from './game';
import { Renderer, drawPreview } from './render';

const $ = <T extends Element>(id: string) => document.getElementById(id) as unknown as T;

const board = $<SVGSVGElement>('board');
const overlay = $<HTMLDivElement>('overlay');
const tapBtn = $<HTMLButtonElement>('tapBtn');
const game = new Game();
const renderer = new Renderer(board);
let hover: { r: number; c: number } | null = null;
let tapMode = false;
let down: { x: number; y: number } | null = null;
let panelVersion = -1;

const ready = () => !renderer.busy;

function setTapMode(on: boolean): void {
  tapMode = on && game.taps > 0 && game.phase === 'place';
  board.classList.toggle('tap-mode', tapMode);
  tapBtn.classList.toggle('active', tapMode);
}

function continueAfterEnd(): boolean {
  if (game.phase === 'won') game.startLevel(game.level + 1);
  else if (game.phase === 'lost') game.newGame();
  else return false;
  return true;
}

// Swipes are allowed during animations. The renderer queues the new frames.
function swipe(dir: Dir): void {
  game.swipe(dir);
}

board.addEventListener('pointerdown', (e) => {
  down = { x: e.clientX, y: e.clientY };
  hover = renderer.cellAt(e);
  board.setPointerCapture(e.pointerId);
});
board.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'mouse' || down) hover = renderer.cellAt(e);
});
board.addEventListener('pointerleave', (e) => {
  if (e.pointerType === 'mouse') hover = null;
});
board.addEventListener('pointerup', (e) => {
  const start = down;
  down = null;
  if (!start || continueAfterEnd()) return;
  const dx = e.clientX - start.x;
  const dy = e.clientY - start.y;
  if (game.phase === 'swipe') {
    const arrow = (e.target as Element).closest<SVGGElement>('.arrow');
    if (arrow) swipe(arrow.dataset.dir as Dir);
    else if (Math.max(Math.abs(dx), Math.abs(dy)) > 24) {
      swipe(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    }
    return;
  }
  if (!ready()) return;
  const { r, c } = renderer.cellAt(e);
  if (tapMode || e.button === 2) {
    game.tap(r, c);
    setTapMode(false);
  } else if (e.button === 0) {
    game.place(r, c);
  }
  if (e.pointerType !== 'mouse') hover = null;
});
board.addEventListener('contextmenu', (e) => e.preventDefault());
board.addEventListener('wheel', (e) => {
  e.preventDefault();
  game.rotate(e.deltaY > 0 ? 1 : -1);
}, { passive: false });
overlay.addEventListener('click', continueAfterEnd);

const KEY_DIRS: Record<string, Dir> = {
  ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right',
  w: 'up', s: 'down', a: 'left', d: 'right',
};

window.addEventListener('keydown', (e) => {
  const dir = KEY_DIRS[e.key];
  if (game.phase === 'swipe' && dir) {
    swipe(dir);
  } else if (game.phase === 'place' && dir) {
    // Arrow keys move the placement cursor.
    const h = hover ?? { r: SIZE / 2, c: SIZE / 2 - 1 };
    const [dr, dc] = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] }[dir];
    hover = { r: Math.min(SIZE - 1, Math.max(0, h.r + dr)), c: Math.min(SIZE - 1, Math.max(0, h.c + dc)) };
  } else {
    switch (e.key) {
      case ' ':
      case 'Enter':
        if (!continueAfterEnd() && hover && ready()) {
          if (tapMode) {
            game.tap(hover.r, hover.c);
            setTapMode(false);
          } else game.place(hover.r, hover.c);
        }
        break;
      case 'z': case 'Z': game.rotate(-1); break;
      case 'x': case 'X': case 'r': case 'R': game.rotate(1); break;
      case 'c': case 'C': game.swapHold(); break;
      case 't': case 'T': setTapMode(!tapMode); break;
      default: return;
    }
  }
  e.preventDefault();
});

$('rotateBtn').addEventListener('click', () => game.rotate(1));
$('holdBtn').addEventListener('click', () => game.swapHold());
tapBtn.addEventListener('click', () => setTapMode(!tapMode));
$('newBtn').addEventListener('click', () => {
  game.newGame();
  setTapMode(false);
});

function updatePanel(): void {
  if (panelVersion === game.version) return;
  panelVersion = game.version;
  $('score').textContent = game.score.toLocaleString('en');
  $('level').textContent = String(game.level);
  $('cores').textContent = String(game.coresLeft());
  $('stones').textContent = String(stonesPerTurn(game.level));
  $('chain').textContent = game.chain > 1 ? `×${game.chain}` : '–';
  $('hint').textContent = game.phase === 'swipe' ? 'Swipe or use an arrow to slide all tiles' : 'Place the piece';
  tapBtn.textContent = `Tap (${game.taps})`;
  tapBtn.disabled = game.taps === 0;
  drawPreview($('piece'), game.current);
  drawPreview($('next0'), game.next[0]);
  drawPreview($('next1'), game.next[1]);
  drawPreview($('hold'), game.hold);
}

function updateOverlay(): void {
  const end = (game.phase === 'won' || game.phase === 'lost') && ready();
  if (end && overlay.hidden) {
    overlay.innerHTML = game.phase === 'won'
      ? `<h2>Level ${game.level} clear</h2><p>Score ${game.score.toLocaleString('en')}</p><p>Click to continue</p>`
      : `<h2>No room for the piece</h2><p>Score ${game.score.toLocaleString('en')}</p><p>Click to start again</p>`;
  }
  overlay.hidden = !end;
}

function frame(): void {
  renderer.update(game, hover, tapMode);
  updatePanel();
  updateOverlay();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
