import { SIZE, STONE, type Dir, type Frame, type Game, type Piece, type TileView } from './game';

export const CELL = 40;
const PAD = 30;
const W = SIZE * CELL;

const PALETTE = [
  { light: '#ff8a80', dark: '#c62828', glyph: '#fff' },
  { light: '#82b1ff', dark: '#1d4fb8', glyph: '#fff' },
  { light: '#8af0a6', dark: '#1b8a43', glyph: '#fff' },
  { light: '#ffe57a', dark: '#c99400', glyph: '#5c4300' },
  { light: '#d0a2ff', dark: '#6a2fc0', glyph: '#fff' },
];

function star(cx: number, cy: number, outer: number, inner: number): string {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 ? inner : outer;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    pts.push(`${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`);
  }
  return `<polygon points="${pts.join(' ')}"/>`;
}

// One glyph per color, so that colors are different also without color vision.
const GLYPHS = [
  '<circle cx="16" cy="17" r="6"/>',
  '<path d="M16 9.5 23.5 17 16 24.5 8.5 17Z"/>',
  '<path d="M16 10 23 23H9Z"/>',
  '<rect x="10.5" y="11.5" width="11" height="11" rx="1.5"/>',
  star(16, 17.5, 7.5, 3.2),
];

function defs(): string {
  let s = '<defs>';
  PALETTE.forEach((p, i) => {
    s += `<linearGradient id="g${i}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.light}"/><stop offset="1" stop-color="${p.dark}"/></linearGradient>`;
    const base = `<rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="url(#g${i})" stroke="${p.dark}" stroke-width="1.5"/>
      <rect x="5" y="4" width="22" height="7" rx="3.5" fill="#fff" opacity=".3"/>`;
    const glyph = `<g fill="${p.glyph}" opacity=".8">${GLYPHS[i]}</g>`;
    s += `<symbol id="c${i}" viewBox="0 0 32 32">${base}${glyph}</symbol>`;
    s += `<symbol id="k${i}" viewBox="0 0 32 32">${base}
      <rect x="6" y="7" width="20" height="20" rx="6" fill="#000" opacity=".35"/>${glyph}
      <circle class="core-ring" cx="16" cy="17" r="12" fill="none" stroke="#fff" stroke-width="2.2" stroke-dasharray="3.5 2.8"/></symbol>`;
  });
  s += `<linearGradient id="gs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8d90a6"/><stop offset="1" stop-color="#4a4d63"/></linearGradient>
    <symbol id="stone" viewBox="0 0 32 32">
      <rect x="1.5" y="1.5" width="29" height="29" rx="4" fill="url(#gs)" stroke="#3a3c50" stroke-width="1.5"/>
      <path d="M6 9 13 13 11 20M13 13 21 10 26 15M11 20 19 22 25 27M19 22 21 10" fill="none" stroke="#2e3042" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>
      <path d="M4 5h10" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".25"/></symbol>`;
  return s + '</defs>';
}

function tileMarkup(color: number, value: number, core: boolean): string {
  const id = color === STONE ? 'stone' : `${core ? 'k' : 'c'}${color}`;
  let s = `<use href="#${id}" width="${CELL}" height="${CELL}"/>`;
  if (value > 1) {
    s += `<circle cx="${CELL - 9}" cy="${CELL - 9}" r="9" class="badge"/>
      <text x="${CELL - 9}" y="${CELL - 9}" class="val${value > 9 ? ' small' : ''}">${value}</text>`;
  }
  return s;
}

/** Piece markup with the pivot cell's top-left corner at 0,0. Bars show which cells are joined. */
export function pieceMarkup(piece: Piece, size = CELL): string {
  let s = '';
  for (const { x, y, color } of piece.cells) {
    s += `<use href="#c${color}" x="${x * size}" y="${y * size}" width="${size}" height="${size}"/>`;
  }
  for (const a of piece.cells) {
    for (const b of piece.cells) {
      if (b.x === a.x + 1 && b.y === a.y) {
        s += `<rect x="${b.x * size - 3}" y="${a.y * size + size / 2 - 6}" width="6" height="12" rx="2" class="bond"/>`;
      } else if (b.y === a.y + 1 && b.x === a.x) {
        s += `<rect x="${a.x * size + size / 2 - 6}" y="${b.y * size - 3}" width="12" height="6" rx="2" class="bond"/>`;
      }
    }
  }
  return s;
}

export function drawPreview(svg: SVGSVGElement, piece: Piece | null): void {
  const size = CELL * 4 + 8;
  if (!piece) {
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.innerHTML = '';
    return;
  }
  const xs = piece.cells.map((c) => c.x);
  const ys = piece.cells.map((c) => c.y);
  const cx = ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * CELL;
  const cy = ((Math.min(...ys) + Math.max(...ys) + 1) / 2) * CELL;
  svg.setAttribute('viewBox', `${cx - size / 2} ${cy - size / 2} ${size} ${size}`);
  svg.innerHTML = pieceMarkup(piece);
}

const ARROWS: Record<Dir, string> = {
  up: `translate(${W / 2} ${-PAD / 2}) rotate(-90)`,
  down: `translate(${W / 2} ${W + PAD / 2}) rotate(90)`,
  left: `translate(${-PAD / 2} ${W / 2}) rotate(180)`,
  right: `translate(${W + PAD / 2} ${W / 2})`,
};

export class Renderer {
  /** Tile elements by tile id. They stay in the DOM so that CSS can animate moves. */
  private els = new Map<number, { g: SVGGElement; key: string }>();
  private tiles: SVGGElement;
  private ghost: SVGGElement;
  private arrows: SVGGElement;
  private fx: SVGGElement;
  private queue: Frame[] = [];
  private playing = false;

  constructor(private svg: SVGSVGElement) {
    svg.setAttribute('viewBox', `${-PAD} ${-PAD} ${W + PAD * 2} ${W + PAD * 2}`);
    let slots = '';
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) slots += `<rect x="${c * CELL + 2}" y="${r * CELL + 2}" width="${CELL - 4}" height="${CELL - 4}" rx="7"/>`;
    }
    let arrows = '';
    for (const [dir, transform] of Object.entries(ARROWS)) {
      arrows += `<g class="arrow" data-dir="${dir}" transform="${transform}">
        <rect x="-14" y="-14" width="28" height="28" fill="transparent"/><path d="M-6 -9 L6 0 L-6 9Z"/></g>`;
    }
    svg.innerHTML = `${defs()}
      <rect x="-8" y="-8" width="${W + 16}" height="${W + 16}" rx="14" class="frame"/>
      <g class="slots">${slots}</g>
      <g id="tiles"></g>
      <g id="ghost"></g>
      <g id="arrows">${arrows}</g>
      <g id="fx"></g>`;
    const q = <T extends Element>(id: string) => svg.querySelector<T>(`#${id}`)!;
    this.tiles = q('tiles');
    this.ghost = q('ghost');
    this.arrows = q('arrows');
    this.fx = q('fx');
  }

  get busy(): boolean {
    return this.playing || this.queue.length > 0;
  }

  /** Converts a pointer position to a board cell. */
  cellAt(e: { clientX: number; clientY: number }): { r: number; c: number } {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(this.svg.getScreenCTM()!.inverse());
    return { r: Math.floor(p.y / CELL), c: Math.floor(p.x / CELL) };
  }

  update(game: Game, hover: { r: number; c: number } | null, tapMode: boolean): void {
    this.queue.push(...game.drainFrames());
    if (!this.playing && this.queue.length) this.playNext();

    this.arrows.style.display = game.phase === 'swipe' ? '' : 'none';
    if (game.phase === 'place' && hover && !tapMode && !this.busy) {
      const ok = game.fits(game.current, hover.r, hover.c);
      this.ghost.setAttribute('class', ok ? 'ghost ok' : 'ghost bad');
      this.ghost.setAttribute('transform', `translate(${hover.c * CELL} ${hover.r * CELL})`);
      this.ghost.innerHTML = pieceMarkup(game.current);
    } else {
      this.ghost.innerHTML = '';
    }
  }

  private playNext(): void {
    const frame = this.queue.shift();
    if (!frame) {
      this.playing = false;
      return;
    }
    this.playing = true;
    this.apply(frame);
    setTimeout(() => this.playNext(), frame.popped.length ? 300 : 130);
  }

  private apply(frame: Frame): void {
    const live = new Set(frame.tiles.map((t) => t.id));
    for (const [id, el] of this.els) {
      if (!live.has(id)) {
        el.g.remove();
        this.els.delete(id);
      }
    }
    for (const t of frame.tiles) {
      const key = `${t.color}/${t.value}/${t.core}`;
      let el = this.els.get(t.id);
      if (!el) {
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'tile');
        el = { g, key: '' };
        this.els.set(t.id, el);
        this.tiles.appendChild(g);
      }
      if (el.key !== key) {
        el.g.innerHTML = `<g class="${el.key ? 'bump' : 'appear'}">${tileMarkup(t.color, t.value, t.core)}</g>`;
        el.key = key;
      }
      el.g.style.transform = `translate(${t.c * CELL}px, ${t.r * CELL}px)`;
    }
    if (frame.popped.length) this.spawn(frame.popped.map(popMarkup).join(''), 400);
    if (frame.score) {
      const { points, chain, r, c } = frame.score;
      const text = chain > 1 ? `+${points} ×${chain}` : `+${points}`;
      this.spawn(`<text x="${(c + 0.5) * CELL}" y="${(r + 0.5) * CELL}" class="float">${text}</text>`, 1100);
    }
  }

  private spawn(markup: string, ms: number): void {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.innerHTML = markup;
    this.fx.appendChild(g);
    setTimeout(() => g.remove(), ms);
  }
}

function popMarkup(t: TileView): string {
  return `<g transform="translate(${t.c * CELL} ${t.r * CELL})"><g class="pop">${tileMarkup(t.color, t.value, t.core)}</g></g>`;
}
