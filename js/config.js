/* config.js - all scene data lives here (no drawing code).
 * COORDINATE SYSTEM: the canvas "world" is 1200 x 720 units.
 * Origin (0,0) = top-left, +x = right, +y = DOWN (screen convention). */

const CFG = {
  W: 1200,
  H: 720,
  COLORS: {
    outside:  '#3d5f35',
    grass:    '#527f45',
    grassAlt: '#4d7a41',
    fence:    '#1f2326',
    runway:   '#2f3237',
    taxiway:  '#5b6068',
    apron:    '#a9aeb5',
    marking:  '#f5f5f5',
    yellow:   '#f2c230',
    building: '#d9dee5',
    roof:     '#8e9bab',
    outline:  '#20252b'
  }
};

// Airport boundary: a polygon (list of vertices) with chamfered corners.
const BOUNDARY = [
  [50, 20], [1150, 20], [1180, 50], [1180, 670],
  [1150, 700], [50, 700], [20, 670], [20, 50]
];

// Runways. (cx, cy) = centre, len/w = size, angle = rotation in degrees.
// 'start' label is at the local -x end, 'end' label at the +x end.
const RUNWAYS = [
  { id: 'R1', name: '09L/27R', cx: 540,  cy: 95,  len: 920, w: 44, angle: 0,  start: '09L', end: '27R' },
  { id: 'R2', name: '09R/27L', cx: 540,  cy: 205, len: 920, w: 44, angle: 0,  start: '09R', end: '27L' },
  { id: 'R3', name: '18/36',   cx: 1100, cy: 290, len: 460, w: 44, angle: 90, start: '18',  end: '36'  }
];

// Taxiways are polylines with a width. 'tag' is drawn as a letter badge.
const TAXIWAYS = [
  { tag: 'A', w: 18, pts: [[100, 290], [1078, 290]], badge: [575, 290] },
  { tag: 'B', w: 18, pts: [[100, 150], [1000, 150]], badge: [575, 150] },
  { tag: 'C', w: 18, pts: [[150, 290], [150, 400]],  badge: [150, 345] },
  { tag: 'F', w: 18, pts: [[950, 290], [950, 400]],  badge: [950, 345] },
  { tag: 'E', w: 18, pts: [[150, 400], [1078, 400]], badge: [600, 400] }
];

// Connectors between runways and parallel taxiways (generated from x positions).
[200, 450, 700, 900].forEach(x => {
  TAXIWAYS.push({ w: 16, pts: [[x, 95],  [x, 150]] });   // R1 -> B
  TAXIWAYS.push({ w: 16, pts: [[x, 150], [x, 205]] });   // B  -> R2
  TAXIWAYS.push({ w: 16, pts: [[x, 205], [x, 290]] });   // R2 -> A
});

// Aircraft stands on the apron, fed from taxiway E by short lead-in lines.
const STANDS = [300, 420, 540, 660, 780].map((x, i) => ({ id: 'G' + (i + 1), x, y: 485 }));
STANDS.forEach(s => TAXIWAYS.push({ w: 12, pts: [[s.x, 400], [s.x, s.y]] }));

// Rectangular zones (translucent overlays with a title).
const ZONES = [
  { name: 'RUNWAY ZONE',   x: 50,  y: 55,  w: 1010, h: 190, color: '255,80,80'   },
  { name: 'TAXIWAY ZONE',  x: 50,  y: 252, w: 1010, h: 160, color: '255,200,60'  },
  { name: 'APRON ZONE',    x: 220, y: 412, w: 640,  h: 152, color: '90,170,255'  },
  { name: 'TERMINAL ZONE', x: 240, y: 568, w: 600,  h: 112, color: '120,230,160' },
  { name: 'SERVICE ZONE',  x: 865, y: 462, w: 150,  h: 115, color: '200,140,255' }
];

const APRON    = { x: 230, y: 415, w: 620, h: 145 };
const TERMINAL = [[260, 600], [300, 575], [780, 575], [820, 600], [820, 670], [260, 670]];
const HANGAR   = [[880, 540], [880, 492], [940, 468], [1000, 492], [1000, 540]];
const TOWER    = { x: 150, y: 520 };

// Milestone 3: two bypass taxiways so that traffic never has to cross a runway.
//  G (east) links the end of B down to A;  W (west) links the start of A up to B.
TAXIWAYS.push({ tag: 'G', w: 18, pts: [[1000, 150], [1040, 150], [1040, 290]], badge: [1040, 220] });
TAXIWAYS.push({ tag: 'W', w: 18, pts: [[100, 150], [45, 150], [45, 290], [100, 290]], badge: [45, 220] });