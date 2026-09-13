export const CELL = 148;
export const ROW_HEIGHT = CELL * Math.sqrt(3) / 2;
export const TILE = 148;
export const RADIUS = 65;
export const COLS = 40;
export const ROWS = 26;
export const BEND = .11;
export const CORE_Y = ROW_HEIGHT / 2;
export const mod = (value: number, count: number) => ((value % count) + count) % count;
export const columnsFor = (compact: boolean) => compact ? 20 : COLS;
export const rowsFor = (compact: boolean) => compact ? 52 : ROWS;
export const isPrimary = (column: number, row: number, compact = false) => column >= 0 && column < columnsFor(compact) && row >= 0 && row < rowsFor(compact);
export const isDedication = (column: number, row: number, compact = false) => compact
  ? column >= 8 && column < 13 && row >= 22 && row < 30
  : column >= 16 && column < 24 && row >= 10 && row < 15;
export function cellCenter(column: number, row: number, compact = false): [number, number] {
  return [(column - (columnsFor(compact) / 2 - .25) + mod(row, 2) * .5) * CELL, ((rowsFor(compact) - 1) / 2 - row) * ROW_HEIGHT];
}
const layouts = [false, true].map(compact => {
  const slots: number[] = [];
  let account = 0;
  for (let row = 0; row < rowsFor(compact); row++) for (let column = 0; column < columnsFor(compact); column++) {
    slots.push(isDedication(column, row, compact) ? -1 : account++);
  }
  return slots;
});
export function personAt(column: number, row: number, count: number, compact = false): number {
  const slot = layouts[Number(compact)][mod(row, rowsFor(compact)) * columnsFor(compact) + mod(column, columnsFor(compact))];
  if (isPrimary(column, row, compact) && slot >= count) return -1;
  return mod(slot < 0 ? column + row * COLS : slot, count);
}
export function cellForPerson(index: number, compact = false): [number, number] | null {
  if (index < 0) return null;
  const slot = layouts[Number(compact)].indexOf(index);
  if (slot < 0) return null;
  return [slot % columnsFor(compact), Math.floor(slot / columnsFor(compact))];
}
export function nearestCell(x: number, y: number, compact = false): [number, number] {
  const row = Math.round((rowsFor(compact) - 1) / 2 - y / ROW_HEIGHT);
  return [Math.round(x / CELL + columnsFor(compact) / 2 - .25 - mod(row, 2) * .5), row];
}
export function bendPoint(x: number, y: number, height: number): [number, number] {
  const scale = 1 + BEND * (x * x + y * y) / (height * height);
  return [x * scale, y * scale];
}
export function unbendPoint(x: number, y: number, height: number): [number, number] {
  const distance = Math.hypot(x, y);
  if (distance === 0) return [0, 0];
  let radius = Math.min(distance, Math.cbrt(distance * height * height / BEND));
  for (let i = 0; i < 7; i++) {
    const a = BEND * radius * radius / (height * height);
    radius -= (radius * (1 + a) - distance) / (1 + 3 * a);
  }
  return [x * radius / distance, y * radius / distance];
}
export function overviewZoom(width: number, height: number): number {
  // Both the 40 × 26 and mobile 20 × 52 hexagonal arrangements have exactly 1,000 portrait slots.
  const compact = width < 600;
  const verticalMargin = compact ? 96 : 72;
  const worldWidth = (columnsFor(compact) / 2 - .25) * CELL + TILE / 2;
  const worldHeight = (rowsFor(compact) - 1) / 2 * ROW_HEIGHT + TILE / 2;
  let low = 0, high = 1;
  for (let i = 0; i < 24; i++) {
    const zoom = (low + high) / 2;
    const [x, y] = bendPoint(worldWidth * zoom, worldHeight * zoom, height);
    if (x <= width / 2 - 22 && y <= height / 2 - verticalMargin) low = zoom;
    else high = zoom;
  }
  return low;
}
