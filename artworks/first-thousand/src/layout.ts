export const CELL = 148;
export const ROW_HEIGHT = CELL * Math.sqrt(3) / 2;
export const TILE = 148;
export const RADIUS = 65;
export const COLS = 60;
export const ROWS = 38;
export const ORIGINAL_COUNT = 995;
export const CENTER_CAPACITY = 1000;
export const LAYOUT_CAPACITY = COLS * ROWS - 40;
export const BEND = .11;
export const CORE_Y = ROW_HEIGHT / 2;
export const mod = (value: number, count: number) => ((value % count) + count) % count;
export const columnsFor = (compact: boolean) => compact ? 30 : COLS;
export const rowsFor = (compact: boolean) => compact ? 76 : ROWS;
const originalColumns = (compact: boolean) => compact ? 20 : 40;
const originalRows = (compact: boolean) => compact ? 52 : 26;
const columnOffset = (compact: boolean) => (columnsFor(compact) - originalColumns(compact)) / 2;
const rowOffset = (compact: boolean) => (rowsFor(compact) - originalRows(compact)) / 2;
export const isOriginalArea = (column: number, row: number, compact = false) =>
  column >= columnOffset(compact) && column < columnOffset(compact) + originalColumns(compact) &&
  row >= rowOffset(compact) && row < rowOffset(compact) + originalRows(compact);
export const isPrimary = (column: number, row: number, compact = false) => column >= 0 && column < columnsFor(compact) && row >= 0 && row < rowsFor(compact);
export const isDedication = (column: number, row: number, compact = false) => compact
  ? column >= 13 && column < 18 && row >= 34 && row < 42
  : column >= 26 && column < 34 && row >= 16 && row < 21;
export function cellCenter(column: number, row: number, compact = false): [number, number] {
  return [(column - (columnsFor(compact) / 2 - .25) + mod(row, 2) * .5) * CELL, ((rowsFor(compact) - 1) / 2 - row) * ROW_HEIGHT];
}
const layouts = [false, true].map(compact => {
  const slots: number[] = Array(columnsFor(compact) * rowsFor(compact)).fill(-2);
  const outer: { slot: number; distance: number }[] = [];
  let original = 0;
  for (let row = 0; row < rowsFor(compact); row++) for (let column = 0; column < columnsFor(compact); column++) {
    const slot = row * columnsFor(compact) + column;
    if (isDedication(column, row, compact)) { slots[slot] = -1; continue; }
    if (isOriginalArea(column, row, compact)) {
      // Preserve every original portrait's order and exact world coordinates.
      // New accounts fill the five unused positions at the original area's edge.
      slots[slot] = original;
      original++;
    } else {
      const [x, y] = cellCenter(column, row, compact);
      const distance = Math.max(Math.abs(x) / (originalColumns(compact) * CELL), Math.abs(y) / (originalRows(compact) * ROW_HEIGHT));
      outer.push({ slot, distance });
    }
  }
  outer.sort((a, b) => a.distance - b.distance || a.slot - b.slot);
  outer.forEach(({ slot }, index) => { slots[slot] = CENTER_CAPACITY + index; });
  return slots;
});
export function personAt(column: number, row: number, count: number, compact = false, repeat = false): number {
  if (count <= 0 || isDedication(column, row, compact)) return -1;
  if (!repeat && !isPrimary(column, row, compact)) return -1;
  const slot = layouts[Number(compact)][mod(row, rowsFor(compact)) * columnsFor(compact) + mod(column, columnsFor(compact))];
  // The overview is a unique snapshot; exploration tiles continuously, including
  // the unused outer positions and copies of the central dedication area.
  if (!repeat && slot >= count) return -1;
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
  // Fit the expanded wall while keeping the original thousand at its center.
  const compact = width < 600;
  const verticalMargin = Math.min(compact ? 96 : 72, height * .3);
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

export function visibleCells(width: number, height: number, zoom: number, x: number, y: number, compact: boolean) {
  const [extentX] = unbendPoint(width / 2 + TILE, 0, height);
  const [,extentY] = unbendPoint(0, height / 2 + TILE, height);
  const [left,bottom] = nearestCell(x - extentX / zoom, y - extentY / zoom, compact);
  const [right,top] = nearestCell(x + extentX / zoom, y + extentY / zoom, compact);
  return { left: left - 2, right: right + 2, top: top - 1, bottom: bottom + 1 };
}

export function portraitFitsViewport(x: number, y: number, zoom: number, width: number, height: number): boolean {
  for (const dx of [-TILE / 2, TILE / 2]) for (const dy of [-TILE / 2, TILE / 2]) {
    const [sx,sy] = bendPoint((x + dx) * zoom, (y + dy) * zoom, height);
    if (Math.abs(sx) > width / 2 || Math.abs(sy) > height / 2) return false;
  }
  return true;
}
