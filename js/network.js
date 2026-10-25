/* network.js - the taxi network as a DIRECTED graph built on the existing layout.
 * Nodes are points on the taxiway centrelines from config.js.  Every taxiway is
 * one-way (a circulation), so aircraft never meet head-on:
 *   B east,  G south,  A west,  W north,  C south,  E east,  F north.        */

const NODE = {};
const defNode = (n, x, y) => { NODE[n] = [x, y]; };
[['B100', 100, 150], ['B410', 410, 150], ['B450', 450, 150], ['B700', 700, 150], ['B900', 900, 150],
 ['B1000', 1000, 150], ['G150', 1040, 150],
 ['A1100', 1100, 290], ['A1040', 1040, 290], ['A950', 950, 290], ['A900', 900, 290], ['A700', 700, 290],
 ['A490', 490, 290], ['A450', 450, 290], ['A150', 150, 290], ['A100', 100, 290],
 ['W290', 45, 290], ['W150', 45, 150],
 ['E150', 150, 400], ['E950', 950, 400], ['E1060', 1060, 400], ['E1100', 1100, 400],
 ['R1x700', 700, 95], ['R1x900', 900, 95], ['R2x700', 700, 205], ['R2x900', 900, 205]
].forEach(n => defNode(...n));
STANDS.forEach(s => { defNode('E' + s.x, s.x, 400); defNode('S' + s.x, s.x, s.y); });

const EDGES = [];
const chain = (...n) => { for (let i = 0; i < n.length - 1; i++) EDGES.push([n[i], n[i + 1]]); };
chain('B100', 'B410', 'B450', 'B700', 'B900', 'B1000', 'G150', 'A1040');                  // B, then bypass G
chain('A1100', 'A1040', 'A950', 'A900', 'A700', 'A490', 'A450', 'A150', 'A100', 'W290', 'W150', 'B100'); // A, bypass W
chain('A150', 'E150', 'E300', 'E420', 'E540', 'E660', 'E780', 'E950', 'E1060', 'E1100'); // C then E
chain('E950', 'A950');                                                                    // F
STANDS.forEach(s => chain('E' + s.x, 'S' + s.x));                                         // stand lead-ins
chain('R1x700', 'B700'); chain('R1x900', 'B900'); chain('R2x700', 'A700'); chain('R2x900', 'A900'); // runway exits

const Network = {
  // Dijkstra shortest path on the directed graph; returns a list of node names.
  route(from, to) {
    const dist = { [from]: 0 }, prev = {}, todo = new Set(Object.keys(NODE));
    while (todo.size) {
      let u = null;
      todo.forEach(n => { if (dist[n] !== undefined && (u === null || dist[n] < dist[u])) u = n; });
      if (u === null || u === to) break;
      todo.delete(u);
      EDGES.filter(e => e[0] === u).forEach(([, v]) => {
        const d = dist[u] + Geo.dist(NODE[u], NODE[v]);
        if (dist[v] === undefined || d < dist[v]) { dist[v] = d; prev[v] = u; }
      });
    }
    if (dist[to] === undefined) throw new Error(`No taxi route ${from} -> ${to}`);
    const out = [to];
    while (out[0] !== from) out.unshift(prev[out[0]]);
    return out;
  },
  points: names => names.map(n => NODE[n])
};

/* Per-runway operating data: where aircraft land, exit and take off.
 *  landHeading : direction of landing (degrees)      fix : start of final approach
 *  touch       : touchdown point                      exit: node where the runway is left
 *  take.hold   : node where a departure waits         take.pts: points hold -> line-up -> far end
 *  take.junction: index in take.pts of the runway centreline entry point                   */
const RWY_OPS = {
  R1: { landHeading: 0, fix: [-200, 95], threshold: [80, 95], touch: [180, 95],
        exit: { small: 'R1x700', wide: 'R1x900' },
        take: { hold: 'B410', pts: [[450, 150], [450, 95], [1400, 95]], junction: 1 } },
  R2: { landHeading: 0, fix: [-200, 205], threshold: [80, 205], touch: [180, 205],
        exit: { small: 'R2x700', wide: 'R2x900' },
        take: { hold: 'A490', pts: [[450, 290], [450, 205], [1400, 205]], junction: 1 } },
  R3: { landHeading: 90, fix: [1100, -200], threshold: [1100, 60], touch: [1100, 100],
        exit: { small: 'A1100', wide: 'A1100' },
        take: { hold: 'E1060', pts: [[1100, 400], [1100, -300]], junction: 0 } }
};