import { SHAPES } from './pieces';

export const SIZE = 8;
/** A same-color group is removed when its values add up to this. */
export const MATCH_VALUE = 5;
/** Color value of a stone. Stones do not match or merge. A match next to a stone removes it. */
export const STONE = -1;
const START_FILL = 0.4;

/** Stones added per slide. Fractions add up over turns. */
export function stonesPerTurn(level: number): number {
  return 1 + 0.5 * (level - 1);
}

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Phase = 'place' | 'swipe' | 'won' | 'lost';
export interface Tile { id: number; color: number; value: number; core: boolean }
export interface TileView extends Tile { r: number; c: number }
export interface PieceCell { x: number; y: number; color: number }
export interface Piece { shape: string; cells: PieceCell[] }
/** One animation step: where every tile is, and which tiles were removed. */
export interface Frame {
  tiles: TileView[];
  popped: TileView[];
  score?: { points: number; chain: number; r: number; c: number };
}

type Pos = [number, number];

export function rotated(piece: Piece, dir: 1 | -1): Piece {
  return {
    ...piece,
    cells: piece.cells.map(({ x, y, color }) => (dir === 1 ? { x: -y, y: x, color } : { x: y, y: -x, color })),
  };
}

export class Game {
  grid: (Tile | null)[][] = [];
  level = 1;
  score = 0;
  chain = 0;
  taps = 1;
  numColors = 4;
  current!: Piece;
  next: Piece[] = [];
  hold: Piece | null = null;
  holdUsed = false;
  phase: Phase = 'place';
  /** Increments on every change that the board or panel must show. */
  version = 0;
  private frames: Frame[] = [];
  private nextId = 1;
  private stoneDebt = 0;

  constructor(private rand: () => number = Math.random) {
    this.newGame();
  }

  newGame(): void {
    this.score = 0;
    this.taps = 1;
    this.startLevel(1);
  }

  startLevel(level: number): void {
    this.level = level;
    this.numColors = level >= 4 ? 5 : 4;
    this.grid = Array.from({ length: SIZE }, () => Array<Tile | null>(SIZE).fill(null));
    const inner: Pos[] = [];
    for (let r = 1; r < SIZE - 1; r++) for (let c = 1; c < SIZE - 1; c++) inner.push([r, c]);
    for (const [r, c] of this.shuffle(inner).slice(0, Math.min(2 + level, 10))) this.putSafe(r, c, 1, true);
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!this.grid[r][c] && this.rand() < START_FILL) this.putSafe(r, c, this.rand() < 0.2 ? 2 : 1, false);
      }
    }
    this.chain = 0;
    this.stoneDebt = 0;
    this.hold = null;
    this.holdUsed = false;
    this.current = this.randomPiece();
    this.next = [this.randomPiece(), this.randomPiece()];
    this.phase = 'place';
    this.frames.push({ tiles: this.snapshot(), popped: [] });
    this.changed();
  }

  coresLeft(): number {
    let n = 0;
    for (const row of this.grid) for (const t of row) if (t?.core) n++;
    return n;
  }

  fits(piece: Piece, r0: number, c0: number): boolean {
    return piece.cells.every(({ x, y }) => {
      const r = r0 + y;
      const c = c0 + x;
      return r >= 0 && r < SIZE && c >= 0 && c < SIZE && !this.grid[r][c];
    });
  }

  place(r0: number, c0: number): boolean {
    if (this.phase !== 'place' || !this.fits(this.current, r0, c0)) return false;
    for (const { x, y, color } of this.current.cells) this.grid[r0 + y][c0 + x] = this.tile(color, 1, false);
    this.frames.push({ tiles: this.snapshot(), popped: [] });
    this.current = this.next.shift()!;
    this.next.push(this.randomPiece());
    this.holdUsed = false;
    this.phase = 'swipe';
    this.changed();
    return true;
  }

  /** Slides all tiles, merges equal pairs, then removes matches and slides again until nothing matches. */
  swipe(dir: Dir): void {
    if (this.phase !== 'swipe') return;
    let step = 0;
    for (;;) {
      const merged = this.slide(dir);
      if (merged.length) this.frames.push({ tiles: [...this.snapshot(), ...merged], popped: [] });
      this.frames.push({ tiles: this.snapshot(), popped: [] });
      const groups = this.findMatches();
      if (!groups.length) break;
      step++;
      let points = groups.reduce((s, g) => s + this.groupValue(g) * g.length * 10, 0);
      const removed = this.remove(groups.flat());
      points = (points + removed.points) * step;
      const popped = removed.popped;
      this.score += points;
      this.frames.push({ tiles: this.snapshot(), popped, score: { points, chain: step, ...this.center(groups.flat()) } });
    }
    this.chain = step;
    if (step >= 2) this.taps++;
    if (this.coresLeft() === 0) {
      this.phase = 'won';
      this.changed();
      return;
    }
    this.addStones(dir);
    this.phase = this.canPlace(this.current) || (this.hold && this.canPlace(this.hold)) ? 'place' : 'lost';
    this.changed();
  }

  rotate(dir: 1 | -1): void {
    if (this.phase !== 'place') return;
    this.current = rotated(this.current, dir);
    this.changed();
  }

  swapHold(): void {
    if (this.phase !== 'place' || this.holdUsed) return;
    if (this.hold) {
      [this.hold, this.current] = [this.current, this.hold];
    } else {
      this.hold = this.current;
      this.current = this.next.shift()!;
      this.next.push(this.randomPiece());
    }
    this.holdUsed = true;
    this.changed();
  }

  /** Removes any same-color group of 2 or more. Costs one tap charge. */
  tap(r: number, c: number): boolean {
    const t = this.grid[r]?.[c];
    if (this.phase !== 'place' || this.taps <= 0 || !t || t.color === STONE) return false;
    const group = this.groupAt(r, c);
    if (group.length < 2) return false;
    this.taps--;
    const { points: extra, popped } = this.remove(group);
    const points = this.groupValue(group) * group.length * 10 + extra;
    this.score += points;
    this.frames.push({ tiles: this.snapshot(), popped, score: { points, chain: 1, ...this.center(group) } });
    if (this.coresLeft() === 0) this.phase = 'won';
    this.changed();
    return true;
  }

  drainFrames(): Frame[] {
    const f = this.frames;
    this.frames = [];
    return f;
  }

  private changed(): void {
    this.version++;
  }

  /** Removes the cells and the stones next to them. Returns points for cores and stones. */
  private remove(cells: Pos[]): { points: number; popped: TileView[] } {
    const targets = new Map<number, Pos>();
    for (const [r, c] of cells) {
      targets.set(r * SIZE + c, [r, c]);
      for (const [nr, nc] of [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]] as Pos[]) {
        if (this.grid[nr]?.[nc]?.color === STONE) targets.set(nr * SIZE + nc, [nr, nc]);
      }
    }
    let points = 0;
    const popped: TileView[] = [];
    for (const [r, c] of targets.values()) {
      const t = this.grid[r][c]!;
      if (t.core) points += 500;
      if (t.color === STONE) points += 20;
      popped.push({ ...t, r, c });
      this.grid[r][c] = null;
    }
    return { points, popped };
  }

  /** Adds stones on the edge that the tiles moved away from, as 2048 adds a tile after each move. */
  private addStones(dir: Dir): void {
    this.stoneDebt += stonesPerTurn(this.level);
    const back: Dir = ({ up: 'down', down: 'up', left: 'right', right: 'left' } as const)[dir];
    let added = 0;
    while (this.stoneDebt >= 1) {
      this.stoneDebt--;
      // Try the far edge first, then the lines after it.
      let free: Pos[] = [];
      for (let k = 0; k < SIZE && !free.length; k++) {
        for (let i = 0; i < SIZE; i++) {
          const pos = this.line(back, i)[k];
          if (!this.at(pos)) free.push(pos);
        }
      }
      if (!free.length) break;
      const [r, c] = free[Math.floor(this.rand() * free.length)];
      this.grid[r][c] = this.tile(STONE, 1, false);
      added++;
    }
    if (added) this.frames.push({ tiles: this.snapshot(), popped: [] });
  }

  private canPlace(piece: Piece): boolean {
    let p = piece;
    for (let i = 0; i < 4; i++, p = rotated(p, 1)) {
      for (let r = 0; r < SIZE; r++) for (let c = 0; c < SIZE; c++) if (this.fits(p, r, c)) return true;
    }
    return false;
  }

  /** 2048 slide. Cores do not move, so they split each line into parts. Returns tiles merged away, at their end position. */
  private slide(dir: Dir): TileView[] {
    const merged: TileView[] = [];
    for (let i = 0; i < SIZE; i++) {
      const line = this.line(dir, i);
      let s = 0;
      while (s < SIZE) {
        let e = s;
        while (e < SIZE && !this.at(line[e])?.core) e++;
        const out: Tile[] = [];
        let lastMerged = false;
        for (let k = s; k < e; k++) {
          const t = this.at(line[k]);
          if (!t) continue;
          const last = out[out.length - 1];
          if (last && !lastMerged && t.color !== STONE && last.color === t.color && last.value === t.value) {
            last.value *= 2;
            lastMerged = true;
            const [r, c] = line[s + out.length - 1];
            merged.push({ ...t, r, c });
          } else {
            out.push(t);
            lastMerged = false;
          }
        }
        for (let k = s; k < e; k++) {
          const [r, c] = line[k];
          this.grid[r][c] = out[k - s] ?? null;
        }
        s = e + 1;
      }
    }
    return merged;
  }

  /** Cells of row or column i, starting at the edge that tiles move toward. */
  private line(dir: Dir, i: number): Pos[] {
    const out: Pos[] = [];
    for (let k = 0; k < SIZE; k++) {
      const j = dir === 'left' || dir === 'up' ? k : SIZE - 1 - k;
      out.push(dir === 'left' || dir === 'right' ? [i, j] : [j, i]);
    }
    return out;
  }

  private at([r, c]: Pos): Tile | null {
    return this.grid[r][c];
  }

  private findMatches(): Pos[][] {
    const seen = new Set<number>();
    const groups: Pos[][] = [];
    for (let r = 0; r < SIZE; r++) {
      for (let c = 0; c < SIZE; c++) {
        if (!this.grid[r][c] || this.grid[r][c]!.color === STONE || seen.has(r * SIZE + c)) continue;
        const group = this.groupAt(r, c);
        for (const [gr, gc] of group) seen.add(gr * SIZE + gc);
        if (this.groupValue(group) >= MATCH_VALUE) groups.push(group);
      }
    }
    return groups;
  }

  private groupAt(r: number, c: number): Pos[] {
    const color = this.grid[r][c]!.color;
    const seen = new Set<number>([r * SIZE + c]);
    const group: Pos[] = [];
    const stack: Pos[] = [[r, c]];
    while (stack.length) {
      const [pr, pc] = stack.pop()!;
      group.push([pr, pc]);
      for (const [nr, nc] of [[pr - 1, pc], [pr + 1, pc], [pr, pc - 1], [pr, pc + 1]] as Pos[]) {
        if (this.grid[nr]?.[nc]?.color === color && !seen.has(nr * SIZE + nc)) {
          seen.add(nr * SIZE + nc);
          stack.push([nr, nc]);
        }
      }
    }
    return group;
  }

  private groupValue(group: Pos[]): number {
    return group.reduce((s, [r, c]) => s + this.grid[r][c]!.value, 0);
  }

  /** Puts a start tile with a color that does not make a match. Leaves the cell empty if no color fits. */
  private putSafe(r: number, c: number, value: number, core: boolean): void {
    for (const color of this.shuffle([...Array(this.numColors).keys()])) {
      this.grid[r][c] = this.tile(color, value, core);
      if (this.groupValue(this.groupAt(r, c)) < MATCH_VALUE) return;
    }
    this.grid[r][c] = null;
  }

  private tile(color: number, value: number, core: boolean): Tile {
    return { id: this.nextId++, color, value, core };
  }

  private snapshot(): TileView[] {
    const out: TileView[] = [];
    this.grid.forEach((row, r) => row.forEach((t, c) => t && out.push({ ...t, r, c })));
    return out;
  }

  private center(cells: Pos[]): { r: number; c: number } {
    return {
      r: cells.reduce((s, [r]) => s + r, 0) / cells.length,
      c: cells.reduce((s, [, c]) => s + c, 0) / cells.length,
    };
  }

  private randomPiece(): Piece {
    const shape = SHAPES[Math.floor(this.rand() * SHAPES.length)];
    const color = () => Math.floor(this.rand() * this.numColors);
    const base = color();
    const mono = this.rand() < 0.3;
    return { shape: shape.name, cells: shape.cells.map(([x, y]) => ({ x, y, color: mono ? base : color() })) };
  }

  private shuffle<T>(items: T[]): T[] {
    const a = [...items];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.rand() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
}
