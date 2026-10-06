import type { Dir, Game, Move, Piece } from './game';
import type { Renderer } from './render';

const DONE_KEY = 'slidewinder.tutorialDone';

/** A player action. The tutorial allows only the action that the current step asks for. */
export type Action =
  | { type: 'drag'; slot: number }
  | { type: 'play'; move: Move }
  | { type: 'rotate'; slot: number }
  | { type: 'tapMode' }
  | { type: 'tap'; r: number; c: number };

interface Step {
  text: string;
  /** Label of the button that ends an information step. */
  button?: string;
  /** Element to point at. */
  focus?: string;
  /** The move the step asks for. */
  move?: Move;
  cells?: [number, number][];
  allow?: (a: Action) => boolean;
}

// Practice board. r b g y are colors, upper case is a core. The steps below depend on this exact layout.
const BOARD = ['........', '........', '........', '.......g', '......by', '.....rRb', '....Ggyr', '...brbgy'];
const SLOT_A: Piece = { shape: 'I2', cells: [{ x: 0, y: 0, color: 1 }, { x: 1, y: 0, color: 0 }] };
// One rotation turns this into the L that the fourth step needs.
const SLOT_B: Piece = { shape: 'L3', cells: [{ x: -1, y: 0, color: 2 }, { x: 0, y: 0, color: 2 }, { x: 0, y: -1, color: 2 }] };
const NEXT: Piece = { shape: 'T', cells: [{ x: -1, y: 0, color: 3 }, { x: 0, y: 0, color: 1 }, { x: 1, y: 0, color: 3 }, { x: 0, y: -1, color: 0 }] };

const sameMove = (a: Move, b: Move) => a.slot === b.slot && a.dir === b.dir && a.offset === b.offset;

function dragAndPlay(move: Move): (a: Action) => boolean {
  return (a) => (a.type === 'drag' && a.slot === move.slot) || (a.type === 'play' && sameMove(a.move, move));
}

const MOVE_1: Move = { slot: 0, dir: 'down', offset: 6 };
const MOVE_2: Move = { slot: 1, dir: 'right', offset: 6 };

const STEPS: Step[] = [
  {
    text: 'Steel tiles with rivets are <b>cores</b>. They never move. Remove all cores to clear a level.',
    button: 'Next',
    cells: [[6, 4], [5, 6]],
  },
  {
    text: 'Drag the <b>left piece</b> to the <b>top</b> edge, over the marked columns.',
    focus: 'slot0',
    move: MOVE_1,
    allow: dragAndPlay(MOVE_1),
  },
  {
    text: 'Blue met blue and <b>merged</b>: 1 + 1 = 2. Now <b>tap the right piece</b> to rotate it.',
    focus: 'slot1',
    allow: (a) => a.type === 'rotate' && a.slot === 1,
  },
  {
    text: 'Drag the right piece in from the <b>left</b> side, at the marked rows.',
    focus: 'slot1',
    move: MOVE_2,
    allow: dragAndPlay(MOVE_2),
  },
  {
    text: 'Touching greens worth 5 or more were removed, and the core with them! Now press <b>Tap</b>.',
    focus: 'tapBtn',
    allow: (a) => a.type === 'tapMode',
  },
  {
    text: 'Tap the <b>marked red group</b>. A tap removes any group of 2 or more.',
    cells: [[5, 5], [5, 6]],
    allow: (a) => a.type === 'tap' && a.r === 5 && (a.c === 5 || a.c === 6),
  },
  {
    text: 'Done! After each move, gray stones arrive. Clear all cores before the time runs out.',
    button: 'Play',
  },
];

export function tutorialDone(): boolean {
  try {
    return localStorage.getItem(DONE_KEY) === '1';
  } catch {
    return false;
  }
}

export class Tutorial {
  active = false;
  private step = 0;
  private box: HTMLElement;

  constructor(private game: Game, private renderer: Renderer, private onEnd: () => void) {
    this.box = document.getElementById('tut')!;
    this.box.addEventListener('click', (e) => {
      const button = (e.target as Element).closest('button');
      if (button?.dataset.act === 'skip') this.skip();
      else if (button?.dataset.act === 'next') this.advance();
    });
  }

  start(): void {
    this.active = true;
    this.step = 0;
    this.game.loadScripted(BOARD, [SLOT_A, SLOT_B], NEXT, 1);
    document.body.classList.add('tutorial');
    this.show();
  }

  /** Whether the current step allows the action. A refused action shakes the instructions. */
  allow(a: Action): boolean {
    if (!this.active) return true;
    const ok = STEPS[this.step].allow?.(a) ?? false;
    if (!ok && a.type !== 'drag') this.nudge();
    return ok;
  }

  /** Call after an allowed action has happened. Drags do not end a step; the play that follows does. */
  did(a: Action): void {
    if (this.active && a.type !== 'drag') this.advance();
  }

  private advance(): void {
    if (this.step === STEPS.length - 1) this.end();
    else {
      this.step++;
      this.show();
    }
  }

  skip(): void {
    this.end();
  }

  private end(): void {
    this.active = false;
    try {
      localStorage.setItem(DONE_KEY, '1');
    } catch {
      // Without storage the tutorial shows again next time.
    }
    document.body.classList.remove('tutorial');
    document.querySelectorAll('.tut-focus').forEach((el) => el.classList.remove('tut-focus'));
    this.renderer.showTutorial(null, []);
    this.onEnd();
  }

  private show(): void {
    const s = STEPS[this.step];
    const button = s.button ? `<button data-act="next" class="primary">${s.button}</button>` : '';
    const skip = this.step < STEPS.length - 1 ? '<button data-act="skip">Skip</button>' : '';
    this.box.innerHTML = `<span class="tut-count">${this.step + 1}/${STEPS.length}</span>
      <p>${s.text}</p><div class="tut-buttons">${skip}${button}</div>`;
    document.querySelectorAll('.tut-focus').forEach((el) => el.classList.remove('tut-focus'));
    if (s.focus) document.getElementById(s.focus)?.classList.add('tut-focus');
    this.renderer.showTutorial(s.move ? { dir: s.move.dir, lanes: this.lanes(s.move) } : null, s.cells ?? []);
  }

  private lanes(move: Move): number[] {
    const across = (['left', 'right'] as Dir[]).includes(move.dir);
    return [...new Set(this.game.slots[move.slot].cells.map((c) => (across ? c.y : c.x) + move.offset))];
  }

  private nudge(): void {
    this.box.classList.remove('shake');
    void this.box.offsetWidth; // restart the CSS animation
    this.box.classList.add('shake');
  }
}
