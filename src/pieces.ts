// Cell offsets (x right, y down) relative to the pivot cell at 0,0.
export const SHAPES: { name: string; cells: [number, number][] }[] = [
  { name: 'I1', cells: [[0, 0]] },
  { name: 'I2', cells: [[0, 0], [1, 0]] },
  { name: 'I3', cells: [[-1, 0], [0, 0], [1, 0]] },
  { name: 'L3', cells: [[0, -1], [0, 0], [1, 0]] },
  { name: 'I4', cells: [[-1, 0], [0, 0], [1, 0], [2, 0]] },
  { name: 'O', cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
  { name: 'T', cells: [[-1, 0], [0, 0], [1, 0], [0, -1]] },
  { name: 'S', cells: [[-1, 0], [0, 0], [0, -1], [1, -1]] },
  { name: 'Z', cells: [[-1, -1], [0, -1], [0, 0], [1, 0]] },
  { name: 'L', cells: [[-1, 0], [0, 0], [1, 0], [1, -1]] },
  { name: 'J', cells: [[-1, -1], [-1, 0], [0, 0], [1, 0]] },
];
