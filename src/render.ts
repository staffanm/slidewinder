import { SIZE, STONE, type Dir, type Frame, type Game, type Piece, type TileView } from './game';

export const CELL = 40;
export const PAD = 16;
const W = SIZE * CELL;
const NS = 'http://www.w3.org/2000/svg';

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

/** Symbols for tiles: c0..c4 (color tiles), k0..k4 (cores) and stone. */
function defs(): string {
  let s = `<defs>
    <linearGradient id="steel" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9aa0b8"/><stop offset=".5" stop-color="#5b6078"/><stop offset="1" stop-color="#2c2f42"/></linearGradient>
    <pattern id="hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="2" height="4" fill="#000" opacity=".18"/></pattern>`;
  const rivets = [[5, 5], [27, 5], [5, 27], [27, 27]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2" fill="#1d1f2c"/><circle cx="${x - 0.4}" cy="${y - 0.4}" r="1.3" fill="#e4e7f5"/>`)
    .join('');
  PALETTE.forEach((p, i) => {
    s += `<linearGradient id="g${i}" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${p.light}"/><stop offset="1" stop-color="${p.dark}"/></linearGradient>`;
    const glyph = `<g fill="${p.glyph}" opacity=".85">${GLYPHS[i]}</g>`;
    s += `<symbol id="c${i}" viewBox="0 0 32 32">
      <rect x="1.5" y="1.5" width="29" height="29" rx="7" fill="url(#g${i})" stroke="${p.dark}" stroke-width="1.5"/>
      <rect x="5" y="4" width="22" height="7" rx="3.5" fill="#fff" opacity=".3"/>${glyph}</symbol>`;
    // A core is bolted to the board: a steel frame with rivets and a small colored center.
    s += `<symbol id="k${i}" viewBox="0 0 32 32">
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="3" fill="url(#steel)" stroke="#14151f" stroke-width="1.5"/>
      <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="3" fill="url(#hatch)"/>
      ${rivets}
      <rect x="8" y="8" width="16" height="16" rx="3" fill="url(#g${i})" stroke="#14151f" stroke-width="1.2"/>
      <g transform="translate(16 16) scale(.62) translate(-16 -17)">${glyph}</g></symbol>`;
  });
  s += `<linearGradient id="gs" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8d90a6"/><stop offset="1" stop-color="#4a4d63"/></linearGradient>
    <symbol id="stone" viewBox="0 0 32 32">
      <rect x="1.5" y="1.5" width="29" height="29" rx="9" fill="url(#gs)" stroke="#3a3c50" stroke-width="1.5"/>
      <path d="M7 10 13 13 11 20M13 13 21 10 25 15M11 20 19 22 23 26M19 22 21 10" fill="none" stroke="#2e3042" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>
      <path d="M8 5h9" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".25"/></symbol>
    <clipPath id="board-clip"><rect width="${W}" height="${W}" rx="6"/></clipPath>`;
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
export function pieceMarkup(piece: Piece): string {
  let s = '';
  for (const { x, y, color } of piece.cells) {
    s += `<use href="#c${color}" x="${x * CELL}" y="${y * CELL}" width="${CELL}" height="${CELL}"/>`;
  }
  for (const a of piece.cells) {
    for (const b of piece.cells) {
      if (b.x === a.x + 1 && b.y === a.y) {
        s += `<rect x="${b.x * CELL - 3}" y="${a.y * CELL + CELL / 2 - 6}" width="6" height="12" rx="2" class="bond"/>`;
      } else if (b.y === a.y + 1 && b.x === a.x) {
        s += `<rect x="${a.x * CELL + CELL / 2 - 6}" y="${b.y * CELL - 3}" width="12" height="6" rx="2" class="bond"/>`;
      }
    }
  }
  return s;
}

/** Bounding box of a piece in px, relative to the pivot cell's top-left corner. */
export function pieceBox(piece: Piece): { x: number; y: number; w: number; h: number } {
  const xs = piece.cells.map((c) => c.x);
  const ys = piece.cells.map((c) => c.y);
  const x = Math.min(...xs) * CELL;
  const y = Math.min(...ys) * CELL;
  return { x, y, w: (Math.max(...xs) + 1) * CELL - x, h: (Math.max(...ys) + 1) * CELL - y };
}

/** Draws a piece centered in a square SVG that fits a 4-cell piece. */
export function drawPreview(svg: SVGSVGElement, piece: Piece | null): void {
  const size = CELL * 4 + 8;
  if (!piece) {
    svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
    svg.innerHTML = '';
    return;
  }
  const b = pieceBox(piece);
  svg.setAttribute('viewBox', `${b.x + b.w / 2 - size / 2} ${b.y + b.h / 2 - size / 2} ${size} ${size}`);
  svg.innerHTML = pieceMarkup(piece);
}

/** Core tiles as an inline SVG row, for the level intro. */
export function coreRow(colors: number[]): string {
  const gap = 6;
  const w = colors.length * (CELL + gap) - gap;
  const uses = colors.map((c, i) => `<use href="#k${c}" x="${i * (CELL + gap)}" width="${CELL}" height="${CELL}"/>`).join('');
  return `<svg viewBox="0 0 ${w} ${CELL}" style="width:${Math.min(w * 0.9, 300)}px" aria-hidden="true">${uses}</svg>`;
}

const ARROW: Record<Dir, number> = { right: 0, down: 90, left: 180, up: -90 };

export class Renderer {
  /** Tile elements by tile id. They stay in the DOM so that CSS can animate moves. */
  private els = new Map<number, { g: SVGGElement; key: string }>();
  private tiles: SVGGElement;
  private ghost: SVGGElement;
  private fx: SVGGElement;
  private queue: Frame[] = [];
  private playing = false;

  constructor(private svg: SVGSVGElement) {
    svg.setAttribute('viewBox', `${-PAD} ${-PAD} ${W + PAD * 2} ${W + PAD * 2}`);
    let slots = '';
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) slots += `<rect x="${c * CELL + 2}" y="${r * CELL + 2}" width="${CELL - 4}" height="${CELL - 4}" rx="7"/>`;
    }
    svg.innerHTML = `${defs()}
      <rect x="-6" y="-6" width="${W + 12}" height="${W + 12}" rx="12" class="frame"/>
      <g class="slots">${slots}</g>
      <g clip-path="url(#board-clip)"><g id="tiles"></g></g>
      <g id="ghost"></g>
      <g id="fx"></g>`;
    this.tiles = svg.querySelector('#tiles')!;
    this.ghost = svg.querySelector('#ghost')!;
    this.fx = svg.querySelector('#fx')!;
  }

  get busy(): boolean {
    return this.playing || this.queue.length > 0;
  }

  /** Board position in cells (fractional) of a point on the screen. */
  toCells(clientX: number, clientY: number): { x: number; y: number } {
    const p = new DOMPoint(clientX, clientY).matrixTransform(this.svg.getScreenCTM()!.inverse());
    return { x: p.x / CELL, y: p.y / CELL };
  }

  /** Screen size of one cell in px. */
  cellPx(): number {
    // The SVG can be wider or taller than the board, so use the scale and not the element size.
    return this.svg.getScreenCTM()!.a * CELL;
  }

  update(game: Game): void {
    this.queue.push(...game.drainFrames());
    if (!this.playing && this.queue.length) this.playNext();
  }

  /** Shows where the piece cells will land, and arrows on the lanes they enter by. Null dir hides it. */
  showPreview(landing: TileView[] | null, dir: Dir | null, lanes: number[]): void {
    if (!dir) {
      this.ghost.innerHTML = '';
      return;
    }
    let s = '';
    for (const lane of lanes) {
      // Arrow centers sit in the padding outside the entry edge.
      const pos: Record<Dir, [number, number]> = {
        right: [lane, -0.7], left: [lane, SIZE - 0.3], down: [-0.7, lane], up: [SIZE - 0.3, lane],
      };
      const [r, c] = pos[dir];
      s += `<path d="M-5 -7 L6 0 L-5 7Z" class="${landing ? 'lane' : 'lane bad'}"
        transform="translate(${(c + 0.5) * CELL} ${(r + 0.5) * CELL}) rotate(${ARROW[dir]})"/>`;
    }
    for (const t of landing ?? []) {
      s += `<g transform="translate(${t.c * CELL} ${t.r * CELL})" class="landing">
        <use href="#c${t.color}" width="${CELL}" height="${CELL}"/>
        <rect x="2" y="2" width="${CELL - 4}" height="${CELL - 4}" rx="7" class="landing-edge"/></g>`;
    }
    this.ghost.innerHTML = s;
  }

  private playNext(): void {
    const frame = this.queue.shift();
    if (!frame) {
      this.playing = false;
      return;
    }
    this.playing = true;
    this.apply(frame);
    setTimeout(() => this.playNext(), frame.popped.length ? 300 : 140);
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
      // Tiles that start outside the board slide in, so they do not get the appear animation.
      const outside = t.r < 0 || t.c < 0 || t.r >= SIZE || t.c >= SIZE;
      if (!el) {
        const g = document.createElementNS(NS, 'g');
        g.setAttribute('class', 'tile');
        el = { g, key: '' };
        this.els.set(t.id, el);
        this.tiles.appendChild(g);
      }
      if (el.key !== key) {
        const cls = el.key ? 'bump' : outside ? '' : 'appear';
        el.g.innerHTML = `<g class="${cls}">${tileMarkup(t.color, t.value, t.core)}</g>`;
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
    const g = document.createElementNS(NS, 'g');
    g.innerHTML = markup;
    this.fx.appendChild(g);
    setTimeout(() => g.remove(), ms);
  }
}

function popMarkup(t: TileView): string {
  return `<g transform="translate(${t.c * CELL} ${t.r * CELL})"><g class="pop">${tileMarkup(t.color, t.value, t.core)}</g></g>`;
}
