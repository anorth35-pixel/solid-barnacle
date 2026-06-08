import type { Course, GolfHole, Peghole, PegholeType } from '../types/board.js';

// Course layout: 18 holes, total par 72 (front 9 = 36, back 9 = 36)
// Mix: 4 par-3s, 10 par-4s, 4 par-5s

interface HoleDef {
  par: 3 | 4 | 5;
  handicap: number;
  // pegholes: sequence of types (tee and cup always present, inferred)
  fairway: PegholeType[];
}

const HOLE_DEFS: HoleDef[] = [
  // Front Nine (par 36)
  { par: 4, handicap: 7,  fairway: ['fairway', 'fairway'] },          // 1
  { par: 5, handicap: 11, fairway: ['fairway', 'water', 'fairway'] }, // 2
  { par: 3, handicap: 17, fairway: ['sand'] },                        // 3
  { par: 4, handicap: 3,  fairway: ['fairway', 'trees'] },            // 4
  { par: 4, handicap: 1,  fairway: ['rough', 'fairway'] },            // 5
  { par: 5, handicap: 13, fairway: ['fairway', 'sand', 'fairway'] },  // 6
  { par: 3, handicap: 15, fairway: ['water'] },                       // 7
  { par: 4, handicap: 5,  fairway: ['fairway', 'fairway'] },          // 8
  { par: 4, handicap: 9,  fairway: ['trees', 'fairway'] },            // 9
  // Back Nine (par 36)
  { par: 4, handicap: 10, fairway: ['fairway', 'rough'] },            // 10
  { par: 5, handicap: 14, fairway: ['fairway', 'water', 'fairway'] }, // 11
  { par: 3, handicap: 18, fairway: ['sand'] },                        // 12
  { par: 4, handicap: 4,  fairway: ['fairway', 'fairway'] },          // 13
  { par: 4, handicap: 2,  fairway: ['rough', 'trees'] },              // 14
  { par: 5, handicap: 12, fairway: ['fairway', 'sand', 'fairway'] },  // 15
  { par: 3, handicap: 16, fairway: ['water'] },                       // 16
  { par: 4, handicap: 6,  fairway: ['fairway', 'fairway'] },          // 17
  { par: 4, handicap: 8,  fairway: ['fairway', 'sand'] },             // 18
];

// SVG layout constants — holes arranged in two rows of 9
const BOARD_WIDTH = 1200;
const BOARD_HEIGHT = 600;
const HOLE_WIDTH = (BOARD_WIDTH - 100) / 9;
const ROW1_Y = 150;
const ROW2_Y = 450;

function buildHole(def: HoleDef, number: number): GolfHole {
  const col = ((number - 1) % 9);
  const row = number <= 9 ? ROW1_Y : ROW2_Y;
  const baseX = 50 + col * HOLE_WIDTH;

  const types: PegholeType[] = ['tee', ...def.fairway, 'green', 'cup'];
  const totalPegholes = types.length;
  const spacing = (HOLE_WIDTH - 20) / (totalPegholes - 1);

  const pegholes: Peghole[] = types.map((type, idx) => ({
    id: `h${number}-${idx}`,
    holeNumber: number,
    index: idx,
    type,
    isPar: !['rough', 'trees', 'sand', 'water', 'out-of-bounds'].includes(type),
    x: baseX + idx * spacing,
    y: row,
  }));

  return {
    number,
    par: def.par,
    pegholes,
    totalPegholes,
    handicap: def.handicap,
  };
}

function buildCourse(): Course {
  const holes = HOLE_DEFS.map((def, i) => buildHole(def, i + 1));
  const frontNinePar = holes.slice(0, 9).reduce((s, h) => s + h.par, 0);
  const backNinePar = holes.slice(9).reduce((s, h) => s + h.par, 0);
  return {
    name: 'CribbGolf Country Club',
    holes,
    totalPar: frontNinePar + backNinePar,
    frontNinePar,
    backNinePar,
  };
}

export const DEFAULT_COURSE: Course = buildCourse();
