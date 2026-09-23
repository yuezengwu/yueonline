export const CELL = 148;
export const ROW_HEIGHT = CELL * Math.sqrt(3) / 2;
export const TILE = 148;
export const RADIUS = 65;
export const COLS = 80;
export const ROWS = 54;
export const ORIGINAL_COUNT = 995;
export const CENTER_CAPACITY = 1000;
export const LAYOUT_CAPACITY = COLS * ROWS - 40;
export const BEND = .11;
export const CORE_Y = ROW_HEIGHT / 2;
export const mod = (value, count) => ((value % count) + count) % count;
export const columnsFor = (compact) => compact ? 40 : COLS;
export const rowsFor = (compact) => compact ? 108 : ROWS;
const previousColumns = (compact) => compact ? 30 : 60;
const previousRows = (compact) => compact ? 76 : 38;
const previousCapacity = 60 * 38 - 40;
const originalColumns = (compact) => compact ? 20 : 40;
const originalRows = (compact) => compact ? 52 : 26;
const columnOffset = (compact) => (columnsFor(compact) - originalColumns(compact)) / 2;
const rowOffset = (compact) => (rowsFor(compact) - originalRows(compact)) / 2;
export const isOriginalArea = (column, row, compact = false) => column >= columnOffset(compact) && column < columnOffset(compact) + originalColumns(compact) &&
    row >= rowOffset(compact) && row < rowOffset(compact) + originalRows(compact);
export const isPrimary = (column, row, compact = false) => column >= 0 && column < columnsFor(compact) && row >= 0 && row < rowsFor(compact);
export const isDedication = (column, row, compact = false) => {
    const x = column - columnOffset(compact), y = row - rowOffset(compact);
    return compact ? x >= 8 && x < 13 && y >= 22 && y < 30
        : x >= 16 && x < 24 && y >= 10 && y < 15;
};
export function cellCenter(column, row, compact = false) {
    return [(column - (columnsFor(compact) / 2 - .25) + mod(row, 2) * .5) * CELL, ((rowsFor(compact) - 1) / 2 - row) * ROW_HEIGHT];
}
const layouts = [false, true].map(compact => {
    const slots = Array(columnsFor(compact) * rowsFor(compact)).fill(-2);
    const previousOuter = [], addedOuter = [];
    const previousLeft = (columnsFor(compact) - previousColumns(compact)) / 2;
    const previousTop = (rowsFor(compact) - previousRows(compact)) / 2;
    let original = 0;
    for (let row = 0; row < rowsFor(compact); row++)
        for (let column = 0; column < columnsFor(compact); column++) {
            const slot = row * columnsFor(compact) + column;
            if (isDedication(column, row, compact)) {
                slots[slot] = -1;
                continue;
            }
            if (isOriginalArea(column, row, compact)) {
                // Preserve every original portrait's order and exact world coordinates.
                // New accounts fill the five unused positions at the original area's edge.
                slots[slot] = original;
                original++;
            }
            else {
                const [x, y] = cellCenter(column, row, compact);
                const previous = column >= previousLeft && column < previousLeft + previousColumns(compact) &&
                    row >= previousTop && row < previousTop + previousRows(compact);
                const distance = Math.max(Math.abs(x) / ((previous ? originalColumns(compact) : previousColumns(compact)) * CELL),
                    Math.abs(y) / ((previous ? originalRows(compact) : previousRows(compact)) * ROW_HEIGHT));
                (previous ? previousOuter : addedOuter).push({ slot, distance });
            }
        }
    // Finish the old 2,240-position layout before assigning the new ring. Its
    // distance and row-major ordering remain identical after the origin shift.
    previousOuter.sort((a, b) => a.distance - b.distance || a.slot - b.slot);
    previousOuter.forEach(({ slot }, index) => { slots[slot] = CENTER_CAPACITY + index; });
    addedOuter.sort((a, b) => a.distance - b.distance || a.slot - b.slot);
    addedOuter.forEach(({ slot }, index) => { slots[slot] = previousCapacity + index; });
    return slots;
});
const personCells = layouts.map((slots, compact) => {
    const cells = [];
    slots.forEach((index, slot) => {
        if (index >= 0) cells[index] = [slot % columnsFor(Boolean(compact)), Math.floor(slot / columnsFor(Boolean(compact)))];
    });
    return cells;
});
export function personAt(column, row, count, compact = false, repeat = false) {
    if (count <= 0 || isDedication(column, row, compact))
        return -1;
    if (!repeat && !isPrimary(column, row, compact))
        return -1;
    const slot = layouts[Number(compact)][mod(row, rowsFor(compact)) * columnsFor(compact) + mod(column, columnsFor(compact))];
    // The overview is a unique snapshot; exploration tiles continuously, including
    // the unused outer positions and copies of the central dedication area.
    if (!repeat && slot >= count)
        return -1;
    return mod(slot < 0 ? column + row * COLS : slot, count);
}
export function cellForPerson(index, compact = false) {
    const cell = personCells[Number(compact)][index];
    return cell ? [...cell] : null;
}
export function nearestCell(x, y, compact = false) {
    const row = Math.round((rowsFor(compact) - 1) / 2 - y / ROW_HEIGHT);
    return [Math.round(x / CELL + columnsFor(compact) / 2 - .25 - mod(row, 2) * .5), row];
}
export function bendPoint(x, y, height) {
    const scale = 1 + BEND * (x * x + y * y) / (height * height);
    return [x * scale, y * scale];
}
export function unbendPoint(x, y, height) {
    const distance = Math.hypot(x, y);
    if (distance === 0)
        return [0, 0];
    let radius = Math.min(distance, Math.cbrt(distance * height * height / BEND));
    for (let i = 0; i < 7; i++) {
        const a = BEND * radius * radius / (height * height);
        radius -= (radius * (1 + a) - distance) / (1 + 3 * a);
    }
    return [x * radius / distance, y * radius / distance];
}
export function overviewZoom(width, height, count = LAYOUT_CAPACITY) {
    // Fit occupied positions only; unused future capacity should not shrink the
    // current collection. The dedication and historical portraits stay centered.
    const compact = width < 600;
    const verticalMargin = Math.min(compact ? 96 : 72, height * .3);
    let worldWidth = CELL * (compact ? 3 : 4.5), worldHeight = ROW_HEIGHT * (compact ? 4.5 : 3);
    for (let index = 0; index < Math.min(count, LAYOUT_CAPACITY); index++) {
        const [column, row] = personCells[Number(compact)][index];
        const [x, y] = cellCenter(column, row, compact);
        worldWidth = Math.max(worldWidth, Math.abs(x) + TILE / 2);
        worldHeight = Math.max(worldHeight, Math.abs(y) + TILE / 2);
    }
    let low = 0, high = 1;
    for (let i = 0; i < 24; i++) {
        const zoom = (low + high) / 2;
        const [x, y] = bendPoint(worldWidth * zoom, worldHeight * zoom, height);
        if (x <= width / 2 - 22 && y <= height / 2 - verticalMargin)
            low = zoom;
        else
            high = zoom;
    }
    return low;
}
export function visibleCells(width, height, zoom, x, y, compact) {
    const [extentX] = unbendPoint(width / 2 + TILE, 0, height);
    const [, extentY] = unbendPoint(0, height / 2 + TILE, height);
    const [left, bottom] = nearestCell(x - extentX / zoom, y - extentY / zoom, compact);
    const [right, top] = nearestCell(x + extentX / zoom, y + extentY / zoom, compact);
    return { left: left - 2, right: right + 2, top: top - 1, bottom: bottom + 1 };
}
export function portraitFitsViewport(x, y, zoom, width, height) {
    for (const dx of [-TILE / 2, TILE / 2])
        for (const dy of [-TILE / 2, TILE / 2]) {
            const [sx, sy] = bendPoint((x + dx) * zoom, (y + dy) * zoom, height);
            if (Math.abs(sx) > width / 2 || Math.abs(sy) > height / 2)
                return false;
        }
    return true;
}
