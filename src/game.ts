import { SHAPES } from './pieces';

export const SIZE = 8;
/** A same-color group is removed when its values add up to this. */
export const MATCH_VALUE = 5;
/** Color value of a stone. Stones do not match or merge. A match next to a stone removes it. */
export const STONE = -1;
/** Seconds per level. */
export const LEVEL_TIME = 90;
/** Points per second left when a level is cleared. */
export const TIME_BONUS = 20;
const START_FILL = 0.4;

/** Stones added per move. Fractions add up over moves. */
export function stonesPerTurn(level: number): number {
  return 1 + 0.5 * (level - 1);
}

export type Dir = 'up' | 'down' | 'left' | 'right';
export type Phase = 'play' | 'won' | 'lost';
export interface Tile { id: number; color: number; value: number; core: boolean }
export interface TileView extends Tile { r: number; c: number }
export interface PieceCell { x: number; y: number; color: number }
export interface Piece { shape: string; cells: PieceCell[] }
/** Play the piece in `slot`. It enters from the side opposite `dir`, and all tiles slide toward `dir`. */
export interface Move { slot: number; dir: Dir; offset: number }
/** One animation step: where every tile is, and which tiles were removed. */
export interface Frame {
  tiles: TileView[];
  popped: TileView[];
  score?: { points: number; chain: number; r: number; c: number };
}

type Grid = (Tile | null)[][];
type Pos = [number, number];

export const DIRS: Dir[] = ['up', 'down', 'left', 'right'];
const BACK: Record<Dir, Dir> = { up: 'down', down: 'up', left: 'right', right: 'left' };

export function rotated(piece: Piece, dir: 1 | -1): Piece {
  return {
    ...piece,
    cells: piece.cells.map(({ x, y, color }) => (dir === 1 ? { x: -y, y: x, color } : { x: y, y: -x, color })),
  };
}

/** Lane (row or column) of a piece cell before the offset, and its distance from the board (0 = enters first). */
function laneOf(cell: PieceCell, dir: Dir): { lane: number; depth: number } {
  switch (dir) {
    case 'right': return { lane: cell.y, depth: -cell.x };
    case 'left': return { lane: cell.y, depth: cell.x };
    case 'down': return { lane: cell.x, depth: -cell.y };
    case 'up': return { lane: cell.x, depth: cell.y };
  }
}

/** Offsets that keep every lane of the piece on the board. */
export function offsetRange(piece: Piece, dir: Dir): [number, number] {
  const lanes = piece.cells.map((c) => laneOf(c, dir).lane);
  return [-Math.min(...lanes), SIZE - 1 - Math.max(...lanes)];
}

export class Game {
  grid: Grid = [];
  level = 1;
  score = 0;
  chain = 0;
  taps = 1;
  numColors = 4;
  slots: Piece[] = [];
  next!: Piece;
  phase: Phase = 'play';
  lostReason: 'time' | 'blocked' | null = null;
  timeLeft = LEVEL_TIME;
  lastBonus = 0;
  /** Increments on every change that the board or panel must show. */
  version = 0;
  /** Increments when a level starts. */
  levelStarts = 0;
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
    this.timeLeft = LEVEL_TIME;
    this.lastBonus = 0;
    this.lostReason = null;
    this.slots = [this.randomPiece(), this.randomPiece()];
    this.next = this.randomPiece();
    this.phase = 'play';
    this.frames.push({ tiles: this.snapshot(), popped: [] });
    this.levelStarts++;
    this.changed();
  }

  coreTiles(): Tile[] {
    return this.grid.flat().filter((t): t is Tile => !!t?.core);
  }

  coresLeft(): number {
    return this.coreTiles().length;
  }

  tick(dt: number): void {
    if (this.phase !== 'play') return;
    const before = Math.ceil(this.timeLeft);
    this.timeLeft = Math.max(0, this.timeLeft - dt);
    if (this.timeLeft === 0) {
      this.phase = 'lost';
      this.lostReason = 'time';
    }
    if (Math.ceil(this.timeLeft) !== before) this.changed();
  }

  rotateSlot(slot: number, dir: 1 | -1 = 1): void {
    if (this.phase !== 'play') return;
    this.slots[slot] = rotated(this.slots[slot], dir);
    this.changed();
  }

  /** Where the cells of the piece end up, before matches. Null if the piece does not fit. */
  preview(move: Move): TileView[] | null {
    const { incoming, ids } = this.incoming(move, true);
    const result = this.slideGrid(this.grid, move.dir, incoming);
    if (!result.ok) return null;
    const out: TileView[] = result.merged.filter((t) => ids.has(t.id));
    result.grid.forEach((row, r) => row.forEach((t, c) => t && ids.has(t.id) && out.push({ ...t, r, c })));
    return out;
  }

  play(move: Move): boolean {
    if (this.phase !== 'play') return false;
    const { incoming, views } = this.incoming(move, false);
    const first = this.slideGrid(this.grid, move.dir, incoming);
    if (!first.ok) return false;
    this.frames.push({ tiles: [...this.snapshot(), ...views], popped: [] });
    this.slots[move.slot] = this.next;
    this.next = this.randomPiece();
    this.resolve(move.dir, first);
    return true;
  }

  /** Removes any same-color group of 2 or more. Costs one tap charge. */
  tap(r: number, c: number): boolean {
    const t = this.grid[r]?.[c];
    if (this.phase !== 'play' || this.taps <= 0 || !t || t.color === STONE) return false;
    const group = this.groupAt(r, c);
    if (group.length < 2) return false;
    this.taps--;
    const value = this.groupValue(group);
    const { points: extra, popped } = this.remove(group);
    const points = value * group.length * 10 + extra;
    this.score += points;
    this.frames.push({ tiles: this.snapshot(), popped, score: { points, chain: 1, ...this.center(group) } });
    this.checkWin();
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

  /** Tiles for the piece cells, per lane, nearest the board first. Views place them outside the board edge. */
  private incoming(move: Move, preview: boolean): { incoming: Map<number, Tile[]>; ids: Set<number>; views: TileView[] } {
    const lanes = new Map<number, { depth: number; tile: Tile }[]>();
    let previewId = -1;
    for (const cell of this.slots[move.slot].cells) {
      const { lane, depth } = laneOf(cell, move.dir);
      const tile = preview ? { id: previewId--, color: cell.color, value: 1, core: false } : this.tile(cell.color, 1, false);
      const list = lanes.get(lane + move.offset) ?? [];
      list.push({ depth, tile });
      lanes.set(lane + move.offset, list);
    }
    const incoming = new Map<number, Tile[]>();
    const ids = new Set<number>();
    const views: TileView[] = [];
    for (const [lane, list] of lanes) {
      list.sort((a, b) => a.depth - b.depth);
      incoming.set(lane, list.map((e) => e.tile));
      list.forEach(({ tile }, k) => {
        ids.add(tile.id);
        const before = -1 - k;
        const after = SIZE + k;
        const pos: Record<Dir, Pos> = { right: [lane, before], left: [lane, after], down: [before, lane], up: [after, lane] };
        const [r, c] = pos[move.dir];
        views.push({ ...tile, r, c });
      });
    }
    return { incoming, ids, views };
  }

  /** After the first slide: removes matches and slides again until nothing matches, then adds stones. */
  private resolve(dir: Dir, first: { grid: Grid; merged: TileView[] }): void {
    let result = first;
    let step = 0;
    for (;;) {
      this.grid = result.grid;
      if (result.merged.length) this.frames.push({ tiles: [...this.snapshot(), ...result.merged], popped: [] });
      this.frames.push({ tiles: this.snapshot(), popped: [] });
      const groups = this.findMatches();
      if (!groups.length) break;
      step++;
      const value = groups.reduce((s, g) => s + this.groupValue(g) * g.length * 10, 0);
      const removed = this.remove(groups.flat());
      const points = (value + removed.points) * step;
      this.score += points;
      this.frames.push({ tiles: this.snapshot(), popped: removed.popped, score: { points, chain: step, ...this.center(groups.flat()) } });
      result = this.slideGrid(this.grid, dir);
    }
    this.chain = step;
    if (step >= 2) this.taps++;
    if (!this.checkWin()) {
      this.addStones(dir);
      if (!this.canPlay()) {
        this.phase = 'lost';
        this.lostReason = 'blocked';
      }
    }
    this.changed();
  }

  private checkWin(): boolean {
    if (this.coresLeft() > 0) return false;
    this.lastBonus = Math.ceil(this.timeLeft) * TIME_BONUS;
    this.score += this.lastBonus;
    this.phase = 'won';
    return true;
  }

  private canPlay(): boolean {
    const saved = [...this.slots];
    try {
      for (let slot = 0; slot < saved.length; slot++) {
        let piece = saved[slot];
        for (let rot = 0; rot < 4; rot++, piece = rotated(piece, 1)) {
          this.slots[slot] = piece;
          for (const dir of DIRS) {
            const [lo, hi] = offsetRange(piece, dir);
            for (let offset = lo; offset <= hi; offset++) if (this.preview({ slot, dir, offset })) return true;
          }
        }
      }
      return false;
    } finally {
      this.slots = saved;
    }
  }

  /**
   * 2048 slide on a copy of the grid. Cores do not move, so they split each line into parts.
   * Incoming tiles join the part at the back of their lane. Not ok if they do not fit.
   * Returns the tiles merged away, at their end position.
   */
  private slideGrid(grid: Grid, dir: Dir, incoming = new Map<number, Tile[]>()): { grid: Grid; merged: TileView[]; ok: boolean } {
    const out = grid.map((row) => [...row]);
    const merged: TileView[] = [];
    let ok = true;
    for (let i = 0; i < SIZE; i++) {
      const line = this.line(dir, i);
      let s = 0;
      for (;;) {
        let e = s;
        while (e < SIZE && !grid[line[e][0]][line[e][1]]?.core) e++;
        const tiles: Tile[] = [];
        for (let k = s; k < e; k++) {
          const t = grid[line[k][0]][line[k][1]];
          if (t) tiles.push(t);
        }
        if (e === SIZE) tiles.push(...(incoming.get(i) ?? []));
        const packed: Tile[] = [];
        let lastMerged = false;
        for (const t of tiles) {
          const last = packed[packed.length - 1];
          if (last && !lastMerged && t.color !== STONE && last.color === t.color && last.value === t.value) {
            packed[packed.length - 1] = { ...last, value: last.value * 2 };
            lastMerged = true;
            const [r, c] = line[Math.min(s + packed.length - 1, SIZE - 1)];
            merged.push({ ...t, r, c });
          } else {
            packed.push(t);
            lastMerged = false;
          }
        }
        if (packed.length > e - s) ok = false;
        for (let k = s; k < e; k++) out[line[k][0]][line[k][1]] = packed[k - s] ?? null;
        if (e >= SIZE) break;
        s = e + 1;
      }
    }
    return { grid: out, merged, ok };
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

  /** Adds stones on the edge that the piece came in from, as 2048 adds a tile after each move. */
  private addStones(dir: Dir): void {
    this.stoneDebt += stonesPerTurn(this.level);
    let added = 0;
    while (this.stoneDebt >= 1) {
      this.stoneDebt--;
      // Try the edge first, then the lines after it.
      const free: Pos[] = [];
      for (let k = 0; k < SIZE && !free.length; k++) {
        for (let i = 0; i < SIZE; i++) {
          const [r, c] = this.line(BACK[dir], i)[k];
          if (!this.grid[r][c]) free.push([r, c]);
        }
      }
      if (!free.length) break;
      const [r, c] = free[Math.floor(this.rand() * free.length)];
      this.grid[r][c] = this.tile(STONE, 1, false);
      added++;
    }
    if (added) this.frames.push({ tiles: this.snapshot(), popped: [] });
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
