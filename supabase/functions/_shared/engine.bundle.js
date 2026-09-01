// @ts-self-types="./engine.bundle.d.ts"

// src/lib/engine/format/rules.ts
var plan = (formatType, groupSizes, advancePerGroup, bestExtraQualifiers, knockoutStart, ambiguous = false, alternatives) => ({
  formatType,
  groupSizes,
  advancePerGroup,
  bestExtraQualifiers,
  knockoutStart,
  ambiguous,
  alternatives
});
var RULES = {
  2: plan("round_robin", [2], 2, 0, "final"),
  3: plan("round_robin", [3], 0, 0, "final"),
  4: plan("round_robin", [4], 2, 0, "final", true, [
    plan("groups_then_knockout", [4], 2, 0, "semi")
    // semis 1v4, 2v3
  ]),
  5: plan("round_robin", [5], 2, 0, "final"),
  6: plan("groups_then_knockout", [3, 3], 2, 0, "semi"),
  7: plan("groups_then_knockout", [4, 3], 2, 0, "semi"),
  8: plan("groups_then_knockout", [4, 4], 2, 0, "semi"),
  9: plan("groups_then_knockout", [3, 3, 3], 1, 1, "semi"),
  // 12 partidos en vez de 20. La alternativa de 5+5 da 1 asegurado más.
  10: plan("groups_then_knockout", [4, 3, 3], 1, 1, "semi", false, [
    plan("groups_then_knockout", [5, 5], 2, 0, "semi")
  ]),
  12: plan("groups_then_knockout", [3, 3, 3, 3], 2, 0, "quarter"),
  // Ya estaba bien; deja de ser ambigua porque con preferencia 3 no hay empate.
  14: plan("groups_then_knockout", [4, 4, 3, 3], 2, 0, "quarter"),
  // 18 partidos en vez de 24.
  16: plan("groups_then_knockout", [4, 3, 3, 3, 3], 1, 3, "quarter", false, [
    plan("groups_then_knockout", [4, 4, 4, 4], 2, 0, "quarter")
  ]),
  18: plan("groups_then_knockout", [3, 3, 3, 3, 3, 3], 1, 2, "quarter"),
  // El peor caso de la tabla vieja: 40 partidos de grupos. Ahora 24.
  20: plan("groups_then_knockout", [4, 4, 3, 3, 3, 3], 1, 2, "quarter", false, [
    plan("groups_then_knockout", [4, 4, 4, 4, 4], 1, 3, "quarter")
  ]),
  // 24 en vez de 36 partidos de grupos, aunque el cuadro pasa de 7 a 15.
  24: plan("groups_then_knockout", [3, 3, 3, 3, 3, 3, 3, 3], 2, 0, "r16", false, [
    plan("groups_then_knockout", [4, 4, 4, 4, 4, 4], 2, 4, "r16")
  ]),
  // 36 en vez de 48.
  32: plan("groups_then_knockout", [4, 4, 3, 3, 3, 3, 3, 3, 3, 3], 1, 6, "r16", false, [
    plan("groups_then_knockout", [4, 4, 4, 4, 4, 4, 4, 4], 2, 0, "r16")
  ])
};

// src/lib/engine/format/index.ts
function isPow2(n) {
  return n >= 2 && (n & n - 1) === 0;
}
function pow2Below(n) {
  let p = 1;
  while (p * 2 <= n) p *= 2;
  return p;
}
function knockoutStartForBracket(size) {
  if (size <= 2) return "final";
  if (size <= 4) return "semi";
  if (size <= 8) return "quarter";
  if (size <= 16) return "r16";
  return "r32";
}
function distribute(n, g2) {
  const base = Math.floor(n / g2);
  const rem = n % g2;
  const sizes = [];
  for (let i = 0; i < g2; i++) sizes.push(base + (i < rem ? 1 : 0));
  return sizes;
}
var TAMANO_PREFERIDO = 3;
function scorePartition(sizes) {
  if (sizes.some((s) => s < 3 || s > 5)) return null;
  return sizes.reduce((acc, s) => acc + Math.abs(s - TAMANO_PREFERIDO), 0);
}
function deriveFormat(n) {
  if (n <= 5) {
    return {
      formatType: "round_robin",
      groupSizes: [n],
      advancePerGroup: n >= 4 ? 2 : 0,
      bestExtraQualifiers: 0,
      knockoutStart: "final",
      ambiguous: false
    };
  }
  let best = null;
  let tie = false;
  const gMin = Math.ceil(n / 5);
  const gMax = Math.floor(n / 3);
  for (let g3 = gMin; g3 <= gMax; g3++) {
    const sizes = distribute(n, g3);
    const score = scorePartition(sizes);
    if (score === null) continue;
    if (best === null || score < best.score) {
      best = { g: g3, sizes, score };
      tie = false;
    } else if (score === best.score) {
      tie = true;
    }
  }
  if (best === null) {
    const bracket2 = pow2Below(n);
    return {
      formatType: "knockout_only",
      groupSizes: [],
      advancePerGroup: 0,
      bestExtraQualifiers: 0,
      knockoutStart: knockoutStartForBracket(bracket2),
      ambiguous: true
    };
  }
  const g2 = best.g;
  const direct2 = g2 * 2;
  let advancePerGroup;
  let bestExtraQualifiers;
  let bracket;
  if (isPow2(direct2)) {
    advancePerGroup = 2;
    bestExtraQualifiers = 0;
    bracket = direct2;
  } else {
    bracket = pow2Below(direct2);
    if (bracket >= g2) {
      advancePerGroup = 1;
      bestExtraQualifiers = bracket - g2;
    } else {
      advancePerGroup = 1;
      bestExtraQualifiers = 0;
      bracket = pow2Below(g2);
    }
  }
  return {
    formatType: "groups_then_knockout",
    groupSizes: best.sizes,
    advancePerGroup,
    bestExtraQualifiers,
    knockoutStart: knockoutStartForBracket(bracket),
    ambiguous: tie
  };
}
function computeFormat(numPairs) {
  if (numPairs < 2) {
    throw new Error("computeFormat: se requieren al menos 2 parejas.");
  }
  const listed = RULES[numPairs];
  if (listed) return listed;
  return deriveFormat(numPairs);
}

// src/lib/engine/fixtures/index.ts
var BYE = "__BYE__";
function generateRoundRobin(pairIds) {
  if (pairIds.length < 2) {
    throw new Error("generateRoundRobin: se requieren al menos 2 parejas.");
  }
  const arr = [...pairIds];
  if (arr.length % 2 !== 0) arr.push(BYE);
  const n = arr.length;
  const rounds = n - 1;
  const half = n / 2;
  const fixtures = [];
  let circle = [...arr];
  for (let r = 0; r < rounds; r++) {
    for (let i = 0; i < half; i++) {
      const a = circle[i];
      const b = circle[n - 1 - i];
      if (a !== BYE && b !== BYE) {
        fixtures.push({ round: r + 1, pairAId: a, pairBId: b });
      }
    }
    circle = [circle[0], circle[n - 1], ...circle.slice(1, n - 1)];
  }
  return fixtures;
}

// src/lib/engine/score/index.ts
var DEFAULT_SCORE_CONFIG = {
  bestOf: 3,
  setTarget: 6,
  setWinBy: 2,
  setTiebreakCap: 7,
  superTiebreakTarget: 10,
  superTiebreakWinBy: 2
};
function clasificarSet(a, b, cfg = DEFAULT_SCORE_CONFIG) {
  if (!Number.isFinite(a) || !Number.isFinite(b) || a < 0 || b < 0) return null;
  if (a === b) return null;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  const limpio = hi === cfg.setTarget && lo <= cfg.setTarget - cfg.setWinBy;
  const siete = hi === cfg.setTiebreakCap && (lo === cfg.setTarget - 1 || lo === cfg.setTarget);
  if (limpio || siete) return "normal";
  if (hi >= cfg.superTiebreakTarget && hi - lo >= cfg.superTiebreakWinBy) return "super";
  return null;
}
var FORMATO_NORMAL = "un set normal (6-4, 7-5, 7-6)";
var FORMATO_SUPER = "una s\xFAper muerte a 10 (10-8, 12-10)";
function numerosDelSet(set) {
  if (set.isSuperTiebreak) {
    return { a: set.tiebreakA ?? set.gamesA, b: set.tiebreakB ?? set.gamesB };
  }
  return { a: set.gamesA, b: set.gamesB };
}
function validateScore(sets, config = DEFAULT_SCORE_CONFIG) {
  const errors = [];
  const setsToWin = Math.ceil(config.bestOf / 2);
  if (!sets || sets.length === 0) {
    return { valid: false, errors: ["Sin sets capturados."], winnerSide: null, setsA: 0, setsB: 0 };
  }
  if (sets.length > config.bestOf) {
    errors.push(`Demasiados sets: ${sets.length} > mejor de ${config.bestOf}.`);
  }
  let setsA = 0;
  let setsB = 0;
  let decided = false;
  for (let i = 0; i < sets.length; i++) {
    const st = sets[i];
    if (decided) {
      errors.push(`Set ${i + 1} capturado despu\xE9s de que el partido ya estaba decidido.`);
      continue;
    }
    const isDecider = setsA === setsToWin - 1 && setsB === setsToWin - 1;
    const { a, b } = numerosDelSet(st);
    const formato = clasificarSet(a, b, config);
    if (formato === null) {
      const permitido = isDecider ? `${FORMATO_NORMAL} o ${FORMATO_SUPER}` : FORMATO_NORMAL;
      errors.push(`Set ${i + 1}: ${a}-${b} no es un marcador v\xE1lido. Puede ser ${permitido}.`);
    } else if (formato === "super" && !isDecider) {
      errors.push(
        `Set ${i + 1}: la s\xFAper muerte solo se juega en el set decisivo, con un set por lado. Aqu\xED el marcador tiene que ser ${FORMATO_NORMAL}.`
      );
    } else if (a > b) setsA++;
    else setsB++;
    if (setsA >= setsToWin || setsB >= setsToWin) decided = true;
  }
  if (!decided) {
    errors.push("Partido incompleto: ning\xFAn lado alcanz\xF3 los sets necesarios para ganar.");
  }
  const valid = errors.length === 0;
  const winnerSide = valid ? setsA > setsB ? "A" : "B" : null;
  return { valid, errors, winnerSide, setsA, setsB };
}

// src/lib/engine/standings/index.ts
var DEFAULT_STANDINGS_CONFIG = {
  pointsWin: 2,
  pointsPlayedLoss: 0,
  superTiebreakGames: "one"
};
var emptyStats = () => ({
  played: 0,
  won: 0,
  lost: 0,
  setsWon: 0,
  setsLost: 0,
  gamesWon: 0,
  gamesLost: 0,
  points: 0
});
function setWinner(set) {
  if (set.isSuperTiebreak && set.tiebreakA != null && set.tiebreakB != null) {
    return set.tiebreakA > set.tiebreakB ? "A" : "B";
  }
  return set.gamesA >= set.gamesB ? "A" : "B";
}
function setGames(set, cfg) {
  if (set.isSuperTiebreak) {
    if (cfg.superTiebreakGames === "score" && set.tiebreakA != null && set.tiebreakB != null) {
      return { a: set.tiebreakA, b: set.tiebreakB };
    }
    const w = setWinner(set);
    return { a: w === "A" ? 1 : 0, b: w === "B" ? 1 : 0 };
  }
  return { a: set.gamesA, b: set.gamesB };
}
function computeStats(pairIds, matches, cfg) {
  const set = new Set(pairIds);
  const stats = /* @__PURE__ */ new Map();
  pairIds.forEach((id) => stats.set(id, emptyStats()));
  for (const m of matches) {
    if (!m.played || m.winnerPairId == null) continue;
    if (!set.has(m.pairAId) || !set.has(m.pairBId)) continue;
    const sa = stats.get(m.pairAId);
    const sb = stats.get(m.pairBId);
    sa.played++;
    sb.played++;
    let setsA = 0;
    let setsB = 0;
    let gamesA = 0;
    let gamesB = 0;
    for (const st of m.sets) {
      if (setWinner(st) === "A") setsA++;
      else setsB++;
      const g2 = setGames(st, cfg);
      gamesA += g2.a;
      gamesB += g2.b;
    }
    sa.setsWon += setsA;
    sa.setsLost += setsB;
    sb.setsWon += setsB;
    sb.setsLost += setsA;
    sa.gamesWon += gamesA;
    sa.gamesLost += gamesB;
    sb.gamesWon += gamesB;
    sb.gamesLost += gamesA;
    if (m.winnerPairId === m.pairAId) {
      sa.won++;
      sb.lost++;
      sa.points += cfg.pointsWin;
      sb.points += cfg.pointsPlayedLoss;
    } else {
      sb.won++;
      sa.lost++;
      sb.points += cfg.pointsWin;
      sa.points += cfg.pointsPlayedLoss;
    }
  }
  return stats;
}
var diff = (s, k) => k === "sets" ? s.setsWon - s.setsLost : s.gamesWon - s.gamesLost;
function resolveTie(run, matches, full, cfg) {
  if (run.length === 1) return run;
  const mini = computeStats(run, matches, cfg);
  return [...run].sort((a, b) => {
    const ma = mini.get(a);
    const mb = mini.get(b);
    if (mb.points !== ma.points) return mb.points - ma.points;
    if (diff(mb, "sets") !== diff(ma, "sets")) return diff(mb, "sets") - diff(ma, "sets");
    if (diff(mb, "games") !== diff(ma, "games")) return diff(mb, "games") - diff(ma, "games");
    if (mb.gamesWon !== ma.gamesWon) return mb.gamesWon - ma.gamesWon;
    const ga = full.get(a);
    const gb = full.get(b);
    if (diff(gb, "sets") !== diff(ga, "sets")) return diff(gb, "sets") - diff(ga, "sets");
    if (diff(gb, "games") !== diff(ga, "games")) return diff(gb, "games") - diff(ga, "games");
    if (gb.gamesWon !== ga.gamesWon) return gb.gamesWon - ga.gamesWon;
    return 0;
  });
}
function computeStandings(pairIds, matches, config = DEFAULT_STANDINGS_CONFIG) {
  const full = computeStats(pairIds, matches, config);
  const byPoints = [...pairIds].sort(
    (a, b) => full.get(b).points - full.get(a).points
  );
  const ordered = [];
  let i = 0;
  while (i < byPoints.length) {
    let j = i;
    const p = full.get(byPoints[i]).points;
    while (j < byPoints.length && full.get(byPoints[j]).points === p) j++;
    ordered.push(...resolveTie(byPoints.slice(i, j), matches, full, config));
    i = j;
  }
  return ordered.map((pairId, idx) => {
    const s = full.get(pairId);
    return {
      pairId,
      played: s.played,
      won: s.won,
      lost: s.lost,
      setsWon: s.setsWon,
      setsLost: s.setsLost,
      gamesWon: s.gamesWon,
      gamesLost: s.gamesLost,
      points: s.points,
      position: idx + 1
    };
  });
}

// src/lib/engine/clinch/index.ts
var MAX_BRUTE_FORCE_MATCHES = 16;
function qualifiersForScenario(pairIds, matches, advanceCount, cfg) {
  const table = computeStandings(pairIds, matches, cfg);
  return new Set(table.slice(0, advanceCount).map((r) => r.pairId));
}
function applyScenario(base, remaining, mask) {
  const decided = remaining.map((m, i) => {
    const bWins = mask >> i & 1;
    return {
      ...m,
      played: true,
      winnerPairId: bWins ? m.pairBId : m.pairAId,
      sets: m.sets.length ? m.sets : [
        // marcador mínimo coherente para standings (2-0 al ganador)
        { gamesA: bWins ? 0 : 6, gamesB: bWins ? 6 : 0, isSuperTiebreak: false },
        { gamesA: bWins ? 0 : 6, gamesB: bWins ? 6 : 0, isSuperTiebreak: false }
      ]
    };
  });
  const playedBase = base.filter((m) => m.played && m.winnerPairId != null);
  return [...playedBase, ...decided];
}
function computeClinch(pairIds, matches, advanceCount, config = DEFAULT_STANDINGS_CONFIG) {
  const remaining = matches.filter((m) => !m.played || m.winnerPairId == null);
  const k = remaining.length;
  if (k === 0) {
    const quals = qualifiersForScenario(pairIds, matches, advanceCount, config);
    return pairIds.map((pairId) => ({
      pairId,
      status: quals.has(pairId) ? "clinched" : "eliminated",
      dependsOnMatchIds: []
    }));
  }
  if (k > MAX_BRUTE_FORCE_MATCHES) {
    return conservativeByPointBound(pairIds, matches, remaining, advanceCount, config);
  }
  const scenarios = 1 << k;
  const qualifiedPerScenario = pairIds.map(() => []);
  const idx = new Map(pairIds.map((id, i) => [id, i]));
  for (let mask = 0; mask < scenarios; mask++) {
    const scenarioMatches = applyScenario(matches, remaining, mask);
    const quals = qualifiersForScenario(pairIds, scenarioMatches, advanceCount, config);
    pairIds.forEach((id) => qualifiedPerScenario[idx.get(id)].push(quals.has(id)));
  }
  return pairIds.map((pairId) => {
    const arr = qualifiedPerScenario[idx.get(pairId)];
    const allYes = arr.every(Boolean);
    const noneYes = arr.every((x) => !x);
    let status = "alive";
    if (allYes) status = "clinched";
    else if (noneYes) status = "eliminated";
    let dependsOnMatchIds = [];
    if (status === "alive") {
      dependsOnMatchIds = remaining.filter((_, bit) => scenarioFlipsQualification(arr, bit, k)).map((m) => m.matchId);
    }
    return { pairId, status, dependsOnMatchIds };
  });
}
function scenarioFlipsQualification(arr, bit, k) {
  const total = 1 << k;
  for (let mask = 0; mask < total; mask++) {
    if (mask >> bit & 1) continue;
    const other = mask | 1 << bit;
    if (arr[mask] !== arr[other]) return true;
  }
  return false;
}
function conservativeByPointBound(pairIds, matches, remaining, advanceCount, config) {
  const current = computeStandings(pairIds, matches, config);
  const pointsNow = new Map(current.map((r) => [r.pairId, r.points]));
  const remainingCount = new Map(pairIds.map((id) => [id, 0]));
  for (const m of remaining) {
    remainingCount.set(m.pairAId, (remainingCount.get(m.pairAId) ?? 0) + 1);
    remainingCount.set(m.pairBId, (remainingCount.get(m.pairBId) ?? 0) + 1);
  }
  const best = (id) => (pointsNow.get(id) ?? 0) + config.pointsWin * (remainingCount.get(id) ?? 0);
  const worst = (id) => (pointsNow.get(id) ?? 0) + config.pointsPlayedLoss * (remainingCount.get(id) ?? 0);
  return pairIds.map((pairId) => {
    const myWorst = worst(pairId);
    const myBest = best(pairId);
    const guaranteedAbove = pairIds.filter((o) => o !== pairId && worst(o) > myBest).length;
    const canBeAbove = pairIds.filter((o) => o !== pairId && best(o) >= myWorst).length;
    let status = "alive";
    if (canBeAbove < advanceCount) status = "clinched";
    else if (guaranteedAbove >= advanceCount) status = "eliminated";
    return { pairId, status, dependsOnMatchIds: status === "alive" ? remaining.map((m) => m.matchId) : [] };
  });
}

// src/lib/engine/seeding/select-qualifiers.ts
function cmpTiebreak(a, b) {
  if (b.points !== a.points) return b.points - a.points;
  const setsA = a.setsWon - a.setsLost, setsB = b.setsWon - b.setsLost;
  if (setsB !== setsA) return setsB - setsA;
  const gA = a.gamesWon - a.gamesLost, gB = b.gamesWon - b.gamesLost;
  if (gB !== gA) return gB - gA;
  const totalA = a.gamesWon + a.gamesLost, totalB = b.gamesWon + b.gamesLost;
  if (totalA === 0 || totalB === 0) {
    if (totalA !== totalB) return totalA === 0 ? 1 : -1;
  } else {
    const cruzada = b.gamesWon * totalA - a.gamesWon * totalB;
    if (cruzada !== 0) return cruzada;
  }
  return a.pairId < b.pairId ? -1 : a.pairId > b.pairId ? 1 : 0;
}
function selectQualifiers(standings, advancePerGroup, bestExtraQualifiers) {
  if (advancePerGroup < 1) throw new Error("advancePerGroup must be >= 1");
  const directos = standings.filter((s) => s.position <= advancePerGroup);
  let extra = [];
  if (bestExtraQualifiers > 0) {
    extra = standings.filter((s) => s.position === advancePerGroup + 1).sort(cmpTiebreak).slice(0, bestExtraQualifiers);
  }
  const ordered = [...directos, ...extra].sort((a, b) => {
    if (a.position !== b.position) return a.position - b.position;
    return cmpTiebreak(a, b);
  });
  const n = ordered.length;
  return ordered.map((s, i) => ({
    pairId: s.pairId,
    groupId: s.groupId,
    rating: (n - i) * 100
    // separación amplia y determinista; computeSeeding solo usa el orden
  }));
}

// src/lib/engine/seeding/stage-map.ts
function stageForBracketSize(bracketSize) {
  switch (bracketSize) {
    case 32:
      return "round_of_32";
    case 16:
      return "round_of_16";
    case 8:
      return "quarter";
    case 4:
      return "semi";
    case 2:
      return "final";
    default:
      throw new Error(`unsupported bracket size: ${bracketSize}`);
  }
}

// src/lib/engine/seeding/index.ts
function pow2AtLeast(n) {
  let p = 1;
  while (p < n) p *= 2;
  return Math.max(p, 2);
}
function seedOrder(bracketSize) {
  let seeds = [1, 2];
  while (seeds.length < bracketSize) {
    const sum = seeds.length * 2 + 1;
    const next = [];
    for (const s of seeds) {
      next.push(s);
      next.push(sum - s);
    }
    seeds = next;
  }
  return seeds;
}
function groupOf(occupants, slot) {
  return occupants[slot]?.groupId ?? null;
}
function pairingsFrom(occupants) {
  const matches = [];
  for (let i = 0; i < occupants.length; i += 2) {
    const a = occupants[i];
    const b = occupants[i + 1];
    matches.push({
      slotA: i,
      slotB: i + 1,
      pairAId: a?.pairId ?? null,
      pairBId: b?.pairId ?? null,
      isRematch: !!a && !!b && a.groupId === b.groupId
    });
  }
  return matches;
}
function computeSeeding(qualifiers, bracketSize) {
  if (qualifiers.length < 2) {
    throw new Error("computeSeeding: se requieren al menos 2 parejas clasificadas.");
  }
  const size = bracketSize ?? pow2AtLeast(qualifiers.length);
  const seeded = [...qualifiers].sort(
    (a, b) => b.rating - a.rating || (a.pairId < b.pairId ? -1 : 1)
  );
  const order = seedOrder(size);
  const occupants = new Array(size).fill(null);
  order.forEach((seedNum, slot) => {
    const q = seeded[seedNum - 1];
    occupants[slot] = q ?? null;
  });
  for (let pass = 0; pass < size; pass++) {
    let swapped = false;
    for (let i = 0; i < size; i += 2) {
      const a = occupants[i];
      const b = occupants[i + 1];
      if (!a || !b || a.groupId !== b.groupId) continue;
      for (let j = 0; j < size; j++) {
        if (j === i || j === i + 1) continue;
        const partnerSlot = j % 2 === 0 ? j + 1 : j - 1;
        if (partnerSlot === i || partnerSlot === i + 1) continue;
        const cand = occupants[j];
        const candPartner = occupants[partnerSlot];
        const okHere = !cand || a.groupId !== cand.groupId;
        const okThere = !candPartner || b.groupId !== groupOf([candPartner], 0);
        if (okHere && okThere) {
          occupants[i + 1] = cand;
          occupants[j] = b;
          swapped = true;
          break;
        }
      }
    }
    if (!swapped) break;
  }
  const matches = pairingsFrom(occupants);
  const rematchesAllowed = matches.filter((m) => m.isRematch).map((m) => `${m.pairAId} vs ${m.pairBId} (mismo grupo, rematch inevitable)`);
  return { bracketSize: size, matches, rematchesAllowed };
}

// src/lib/engine/bracket/index.ts
function winnerOf(m) {
  if (m.winnerPairId) return m.winnerPairId;
  if (m.pairAId && !m.pairBId) return m.pairAId;
  if (m.pairBId && !m.pairAId) return m.pairBId;
  return null;
}
function loserOf(m) {
  const w = winnerOf(m);
  if (!w || !m.pairAId || !m.pairBId) return null;
  return w === m.pairAId ? m.pairBId : m.pairAId;
}
function advanceBracket(round) {
  if (round.length < 2 || round.length % 2 !== 0) {
    throw new Error("advanceBracket: la ronda debe tener un n\xBA par (>=2) de partidos.");
  }
  const next = [];
  let complete = true;
  for (let i = 0; i < round.length; i += 2) {
    const wa = winnerOf(round[i]);
    const wb = winnerOf(round[i + 1]);
    if (wa === null || wb === null) complete = false;
    next.push({
      pairAId: wa,
      pairBId: wb,
      sourceMatchIds: [round[i].matchId, round[i + 1].matchId]
    });
  }
  return { next, complete };
}
function thirdPlaceFromSemis(semis) {
  const la = loserOf(semis[0]);
  const lb = loserOf(semis[1]);
  if (!la || !lb) return null;
  return { pairAId: la, pairBId: lb, sourceMatchIds: [semis[0].matchId, semis[1].matchId] };
}

// src/lib/engine/bracket/avance-captura.ts
var ETIQUETA_TERCERO = "third_place-1";
var etiquetaDeRonda = (stage, indice) => `${stage}-${String(indice + 1).padStart(2, "0")}`;
function ganadorDe(m) {
  if (m.winnerPairId) return m.winnerPairId;
  if (m.pairAId && !m.pairBId) return m.pairAId;
  if (m.pairBId && !m.pairAId) return m.pairBId;
  return null;
}
function mismosOrigenes(a, b) {
  if (!a || a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((x, i) => x === sb[i]);
}
function buscarExistente(partidos, stage, roundLabel, origenes) {
  return partidos.find((p) => p.stage === stage && mismosOrigenes(p.sourceMatchIds, origenes)) ?? partidos.find((p) => p.stage === stage && p.roundLabel === roundLabel);
}
function planAvance(partidos, matchId, winnerPairId, tercerLugar = true) {
  const partido = partidos.find((p) => p.id === matchId);
  if (!partido) {
    return { ok: false, motivo: "match_not_found", detalle: `El partido ${matchId} no est\xE1 en el cuadro.` };
  }
  if (partido.stage === "group") {
    return { ok: false, motivo: "not_a_bracket_match", detalle: "Es un partido de fase de grupos." };
  }
  if (!partido.pairAId || !partido.pairBId) {
    return { ok: false, motivo: "is_a_bye", detalle: "Ese cruce es un bye: no se juega ni se captura." };
  }
  if (winnerPairId !== partido.pairAId && winnerPairId !== partido.pairBId) {
    return { ok: false, motivo: "winner_not_in_match", detalle: "El ganador no es ninguna de las dos parejas del partido." };
  }
  const esCorreccion = partido.status === "finished";
  if (partido.stage === "third_place" || partido.stage === "final") {
    return {
      ok: true,
      esCorreccion,
      rondaCompleta: true,
      siguienteEtapa: null,
      crear: [],
      reapuntar: []
    };
  }
  const ronda = partidos.filter((p) => p.stage === partido.stage && p.stage !== "third_place").sort((a, b) => (a.roundLabel ?? "").localeCompare(b.roundLabel ?? "") || (a.id < b.id ? -1 : 1));
  const rondaConResultado = ronda.map((p) => ({
    matchId: p.id,
    pairAId: p.pairAId,
    pairBId: p.pairBId,
    winnerPairId: p.id === matchId ? winnerPairId : p.winnerPairId
  }));
  const rondaCompleta = rondaConResultado.every((m) => ganadorDe(m) !== null);
  if (!rondaCompleta || rondaConResultado.length < 2 || rondaConResultado.length % 2 !== 0) {
    return {
      ok: true,
      esCorreccion,
      rondaCompleta: false,
      siguienteEtapa: null,
      crear: [],
      reapuntar: []
    };
  }
  const { next } = advanceBracket(rondaConResultado);
  const siguienteEtapa = stageForBracketSize(next.length * 2);
  const crear = [];
  const reapuntar = [];
  const bloqueadoPor = [];
  const encajar = (stage, roundLabel, pairAId, pairBId, origenes) => {
    const existente = buscarExistente(partidos, stage, roundLabel, origenes);
    if (!existente) {
      crear.push({ stage, roundLabel, pairAId, pairBId, sourceMatchIds: origenes });
      return;
    }
    const igual = existente.pairAId === pairAId && existente.pairBId === pairBId;
    if (igual) return;
    if (existente.status === "finished") {
      bloqueadoPor.push(existente.id);
      return;
    }
    reapuntar.push({ matchId: existente.id, pairAId, pairBId });
  };
  next.forEach((cruce, i) => {
    encajar(siguienteEtapa, etiquetaDeRonda(siguienteEtapa, i), cruce.pairAId, cruce.pairBId, cruce.sourceMatchIds);
  });
  if (tercerLugar && partido.stage === "semi" && rondaConResultado.length === 2) {
    const tercero = thirdPlaceFromSemis([rondaConResultado[0], rondaConResultado[1]]);
    if (tercero) {
      encajar("third_place", ETIQUETA_TERCERO, tercero.pairAId, tercero.pairBId, tercero.sourceMatchIds);
    }
  }
  if (bloqueadoPor.length > 0) {
    return {
      ok: false,
      motivo: "downstream_already_played",
      detalle: `La correcci\xF3n cambiar\xEDa qui\xE9n juega ${bloqueadoPor.length === 1 ? "un partido" : `${bloqueadoPor.length} partidos`} que ya se jug\xF3. An\xFAlalo primero o resu\xE9lvelo como organizador.`,
      bloqueadoPor
    };
  }
  return { ok: true, esCorreccion, rondaCompleta: true, siguienteEtapa, crear, reapuntar };
}

// src/lib/engine/schedule/knockout.ts
var DISTANCIA_MINIMA_SEPARACION = 2;
var MAX_ESPERA_POR_EMPALME = 4;
var FACTOR_RETRASO = 1.25;
var DEFAULT_MINUTOS_PARTIDO = 60;
var DEFAULT_DESCANSO_MINIMO = 30;
var DEFAULT_PASO = 30;
function parseHora(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Hora invalida: ${hhmm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Hora invalida: ${hhmm}`);
  return h * 60 + min;
}
function formatHora(min) {
  const enElDia = (min % 1440 + 1440) % 1440;
  const h = Math.floor(enElDia / 60);
  const m = enElDia % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function partidosPorRonda(clasificados) {
  if (clasificados < 2) return [];
  const bracket = 2 ** Math.ceil(Math.log2(clasificados));
  const out = [clasificados - bracket / 2];
  let n = bracket / 4;
  while (n >= 1) {
    out.push(n);
    n /= 2;
  }
  return out.filter((n2, i) => i === 0 || n2 >= 1);
}
function hayTercerLugar(clasificados, activo) {
  return activo && clasificados >= 4;
}
function cotaInferior(entrada) {
  const dur = entrada.minutosPorPartido ?? DEFAULT_MINUTOS_PARTIDO;
  const desc = entrada.descansoMinimo ?? DEFAULT_DESCANSO_MINIMO;
  const inicio = parseHora(entrada.desde);
  const tercerLugar = entrada.tercerLugar ?? true;
  const items = [];
  for (const cat of entrada.categorias) {
    const rondas = partidosPorRonda(cat.clasificados);
    rondas.forEach((n, i) => {
      items.push({ distancia: rondas.length - 1 - i, partidos: n });
    });
    if (hayTercerLugar(cat.clasificados, tercerLugar)) {
      items.push({ distancia: 0, partidos: 1 });
    }
  }
  if (items.length === 0) return inicio;
  const maxDist = Math.max(...items.map((i) => i.distancia));
  let mejor = inicio;
  for (let j = 0; j <= maxDist; j++) {
    const n = items.filter((i) => i.distancia >= j).reduce((a, b) => a + b.partidos, 0);
    if (n === 0) continue;
    const t = inicio + Math.ceil(n / entrada.canchas) * dur + j * (dur + desc);
    if (t > mejor) mejor = t;
  }
  return mejor;
}
function grafoDeHermandad(categorias) {
  const porJugador = /* @__PURE__ */ new Map();
  for (const c of categorias) {
    for (const j of c.jugadores ?? []) {
      const ya = porJugador.get(j);
      if (ya) ya.push(c.id);
      else porJugador.set(j, [c.id]);
    }
  }
  const hermanas = /* @__PURE__ */ new Map();
  const une = (a, b) => {
    if (a === b) return;
    if (!hermanas.has(a)) hermanas.set(a, /* @__PURE__ */ new Set());
    hermanas.get(a).add(b);
  };
  for (const cats of porJugador.values()) {
    if (cats.length < 2) continue;
    for (const a of cats) for (const b of cats) une(a, b);
  }
  return hermanas;
}
function correrCalendario(entrada) {
  const dur = entrada.minutosPorPartido ?? DEFAULT_MINUTOS_PARTIDO;
  const desc = entrada.descansoMinimo ?? DEFAULT_DESCANSO_MINIMO;
  const paso = entrada.paso ?? DEFAULT_PASO;
  const inicio = parseHora(entrada.desde);
  const techo = parseHora(entrada.hasta);
  const tercerLugar = entrada.tercerLugar ?? true;
  const avisos = [];
  if (entrada.canchas < 1) throw new Error("Se necesita al menos una cancha");
  if (techo <= inicio) throw new Error("La ventana termina antes de empezar");
  if (dur < 30 || dur > 120) throw new Error("minutosPorPartido fuera de rango");
  const tareas = [];
  for (const cat of entrada.categorias) {
    const rondas = partidosPorRonda(cat.clasificados);
    if (rondas.length === 0) {
      avisos.push(`${cat.id} no tiene cuadro: ${cat.clasificados} clasificados.`);
      continue;
    }
    rondas.forEach((n, i) => {
      tareas.push({
        categoryId: cat.id,
        ronda: i + 1,
        totalRondas: rondas.length,
        partidos: n,
        restantes: n,
        colocados: 0,
        finMin: null
      });
    });
    if (hayTercerLugar(cat.clasificados, tercerLugar)) {
      tareas.push({
        categoryId: cat.id,
        ronda: rondas.length,
        totalRondas: rondas.length,
        partidos: 1,
        restantes: 1,
        colocados: 0,
        finMin: null,
        tercerLugar: true
      });
    }
  }
  const totalPartidos = tareas.reduce((a, t) => a + t.partidos, 0);
  const ocupadaHasta = [];
  const partidos = [];
  const canchasLibres = (t) => {
    const libres = [];
    for (let c = 0; c < entrada.canchas; c++) {
      const choca = ocupadaHasta.some(
        (o) => o.cancha === c && o.desde < t + dur && t < o.hasta
      );
      if (!choca) libres.push(c);
    }
    return libres;
  };
  const finDe = (categoryId, ronda) => {
    const t = tareas.find(
      (x) => x.categoryId === categoryId && x.ronda === ronda && !x.tercerLugar
    );
    return t ? t.finMin : null;
  };
  const pendientes = () => tareas.filter((t) => t.restantes > 0);
  const oleadasForzosas = /* @__PURE__ */ new Set();
  const hermanas = grafoDeHermandad(entrada.categorias);
  const sonHermanas = (a, b) => hermanas.get(a)?.has(b) ?? false;
  const esperando = /* @__PURE__ */ new Map();
  const enInstante = /* @__PURE__ */ new Map();
  const empalmes = [];
  for (let t = inicio; t < techo && pendientes().length > 0; t += paso) {
    const listas = pendientes().map((tarea) => {
      let earliest = inicio;
      if (tarea.ronda > 1) {
        const fin = finDe(tarea.categoryId, tarea.ronda - 1);
        if (fin === null) return null;
        earliest = fin + desc;
      }
      if (earliest > t) return null;
      const critico = (tarea.totalRondas - tarea.ronda) * (dur + desc) + dur;
      return { tarea, critico };
    }).filter((x) => x !== null).sort(
      (a, b) => b.critico - a.critico || b.tarea.partidos - a.tarea.partidos || a.tarea.categoryId.localeCompare(b.tarea.categoryId)
    );
    for (const { tarea } of listas) {
      if (t + dur > techo) break;
      const libres = canchasLibres(t);
      if (libres.length === 0) break;
      const cabeEntera = tarea.partidos <= entrada.canchas;
      if (cabeEntera && tarea.restantes > libres.length) continue;
      const distancia = tarea.totalRondas - tarea.ronda;
      const yaAqui = enInstante.get(t);
      const choca = yaAqui ? [...yaAqui].find((otra) => sonHermanas(tarea.categoryId, otra)) : void 0;
      if (choca && distancia >= DISTANCIA_MINIMA_SEPARACION) {
        const clave = `${tarea.categoryId}#${tarea.ronda}`;
        const espera = (esperando.get(clave) ?? 0) + 1;
        if (espera <= MAX_ESPERA_POR_EMPALME) {
          esperando.set(clave, espera);
          continue;
        }
      }
      const cupo = Math.min(tarea.restantes, libres.length);
      if (!cabeEntera) oleadasForzosas.add(tarea.categoryId);
      if (yaAqui) {
        for (const otra of yaAqui) {
          if (!sonHermanas(tarea.categoryId, otra)) continue;
          empalmes.push({
            categoriaA: otra,
            categoriaB: tarea.categoryId,
            hora: formatHora(t),
            etapa: tarea.tercerLugar ? "third_place" : etapaDeRonda(tarea.ronda, tarea.totalRondas)
          });
        }
      }
      if (yaAqui) yaAqui.add(tarea.categoryId);
      else enInstante.set(t, /* @__PURE__ */ new Set([tarea.categoryId]));
      for (let k = 0; k < cupo; k++) {
        const cancha = libres[k];
        ocupadaHasta.push({ cancha, desde: t, hasta: t + dur });
        partidos.push({
          categoryId: tarea.categoryId,
          ronda: tarea.ronda,
          totalRondas: tarea.totalRondas,
          etapa: tarea.tercerLugar ? "third_place" : etapaDeRonda(tarea.ronda, tarea.totalRondas),
          indiceEnRonda: tarea.colocados + k,
          inicio: formatHora(t),
          inicioMin: t,
          cancha: cancha + 1
        });
      }
      tarea.colocados += cupo;
      tarea.restantes -= cupo;
      tarea.finMin = t + dur;
    }
  }
  const sinProgramar = tareas.reduce((a, t) => a + t.restantes, 0);
  const cabe = sinProgramar === 0;
  for (const cat of oleadasForzosas) {
    avisos.push(
      `${cat}: la ronda tiene mas partidos que canchas, se juega en oleadas y la mitad del cuadro descansa mas.`
    );
  }
  const ultimoInicioMin = partidos.length > 0 ? Math.max(...partidos.map((p) => p.inicioMin)) : null;
  const finEstimadoMin = ultimoInicioMin === null ? null : ultimoInicioMin + dur;
  const cota = cotaInferior(entrada);
  if (cabe && finEstimadoMin !== null && finEstimadoMin > cota) {
    avisos.push(
      `El calendario termina ${formatHora(finEstimadoMin)}; el minimo posible con esta capacidad es ${formatHora(cota)}.`
    );
  }
  const franjas = /* @__PURE__ */ new Map();
  for (const p of partidos) {
    franjas.set(p.inicioMin, (franjas.get(p.inicioMin) ?? 0) + 1);
  }
  const ocupacionPorFranja = [...franjas.entries()].sort((a, b) => a[0] - b[0]).map(([min, n]) => ({ hora: formatHora(min), canchas: n }));
  let diagnostico;
  if (!cabe) {
    const horasVentana = (techo - inicio) / 60;
    diagnostico = {
      partidosSinProgramar: sinProgramar,
      canchasQueFaltan: Math.ceil(sinProgramar * dur / 60 / horasVentana),
      horasQueFaltan: Math.ceil(sinProgramar * dur / 60 / entrada.canchas)
    };
    avisos.push(
      `No caben ${sinProgramar} partidos antes de ${entrada.hasta}. Reduce repescados, alarga la tarde o suma canchas.`
    );
  }
  return {
    cabe,
    partidos,
    totalPartidos,
    ultimoInicio: ultimoInicioMin === null ? null : formatHora(ultimoInicioMin),
    finEstimado: finEstimadoMin === null ? null : formatHora(finEstimadoMin),
    // Los rellena programarEliminatorias con sus otras dos corridas.
    finRealista: null,
    finRealistaUnaCanchaMenos: null,
    cotaInferior: formatHora(cota),
    ocupacionPorFranja,
    empalmes,
    avisos,
    diagnostico
  };
}
function finRealistaEncadenado(cadenas, minutosPorPartido) {
  if (cadenas.length === 0) return null;
  const exceso = minutosPorPartido * (FACTOR_RETRASO - 1);
  let peor = -1;
  for (const c of cadenas) {
    const fin = c.ultimoInicioMin + minutosPorPartido + Math.round(c.rondas * exceso);
    if (fin > peor) peor = fin;
  }
  return peor < 0 ? null : peor;
}
function cadenasDePartidos(partidos) {
  const m = /* @__PURE__ */ new Map();
  for (const p of partidos) {
    const ya = m.get(p.categoryId);
    if (ya) {
      ya.rondas = Math.max(ya.rondas, p.totalRondas);
      ya.ultimoInicioMin = Math.max(ya.ultimoInicioMin, p.inicioMin);
    } else {
      m.set(p.categoryId, {
        categoryId: p.categoryId,
        rondas: p.totalRondas,
        ultimoInicioMin: p.inicioMin
      });
    }
  }
  return [...m.values()];
}
function programarEliminatorias(entrada) {
  const plan2 = correrCalendario(entrada);
  const dur = entrada.minutosPorPartido ?? DEFAULT_MINUTOS_PARTIDO;
  const paraCadena = plan2.cabe ? plan2 : correrCalendario({ ...entrada, hasta: "23:59" });
  const realMin = finRealistaEncadenado(cadenasDePartidos(paraCadena.partidos), dur);
  const unaMenos = entrada.canchas > 1 ? correrCalendario({ ...entrada, canchas: entrada.canchas - 1, hasta: "23:59" }) : null;
  const unaMenosMin = unaMenos ? finRealistaEncadenado(cadenasDePartidos(unaMenos.partidos), dur) : null;
  const avisos = [...plan2.avisos];
  const techoReal = parseHora(entrada.hasta);
  if (unaMenosMin !== null && unaMenosMin > techoReal) {
    avisos.push(
      `Con una cancha menos, este formato terminaria a las ${formatHora(unaMenosMin)}.`
    );
  }
  return {
    ...plan2,
    finRealista: realMin === null ? null : formatHora(realMin),
    finRealistaUnaCanchaMenos: unaMenosMin === null ? null : formatHora(unaMenosMin),
    avisos
  };
}
function etapaDeRonda(ronda, totalRondas) {
  const restantes = totalRondas - ronda;
  switch (restantes) {
    case 0:
      return "final";
    case 1:
      return "semi";
    case 2:
      return "quarter";
    case 3:
      return "round_of_16";
    case 4:
      return "round_of_32";
    default:
      throw new Error(
        `Cuadro demasiado grande: ronda ${ronda} de ${totalRondas}`
      );
  }
}

// src/lib/engine/schedule/bloques.ts
var PAREJAS_POR_GRUPO = 3;
var PARTIDOS_POR_CARRIL = 3;
var PARTIDOS_POR_GRUPO = PARTIDOS_POR_CARRIL;
function parseHoraBloque(hhmm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) throw new Error(`Hora invalida: ${hhmm}`);
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw new Error(`Hora invalida: ${hhmm}`);
  return h * 60 + min;
}
function formatHoraBloque(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function esDiaValido(dia) {
  return /^\d{4}-\d{2}-\d{2}$/.test(dia.trim());
}
function generarBloques(entrada) {
  const partidosPorGrupo = entrada.partidosPorGrupo ?? PARTIDOS_POR_GRUPO;
  const avisos = [];
  if (!Number.isInteger(entrada.canchas) || entrada.canchas <= 0) {
    throw new Error(`canchas debe ser un entero positivo: ${entrada.canchas}`);
  }
  if (!Number.isFinite(entrada.minutosPorPartido) || entrada.minutosPorPartido <= 0) {
    throw new Error(`minutosPorPartido debe ser positivo: ${entrada.minutosPorPartido}`);
  }
  if (!Number.isInteger(partidosPorGrupo) || partidosPorGrupo <= 0) {
    throw new Error(`partidosPorGrupo debe ser un entero positivo: ${partidosPorGrupo}`);
  }
  const minutosPorBloque = partidosPorGrupo * entrada.minutosPorPartido;
  const minutosRealistas = Math.round(minutosPorBloque * FACTOR_RETRASO);
  const ventanas = [...entrada.ventanas].sort(
    (a, b) => a.dia.localeCompare(b.dia) || parseHoraBloque(a.desde) - parseHoraBloque(b.desde)
  );
  for (const v of ventanas) {
    if (!esDiaValido(v.dia)) throw new Error(`Dia invalido: ${v.dia}`);
  }
  if (ventanas.length === 0) {
    avisos.push("Sin ventanas: no hay bloques que ofrecer.");
    return {
      bloques: [],
      minutosPorBloque,
      capacidadCarriles: 0,
      capacidadParejas: 0,
      dias: [],
      diaEliminatorias: null,
      avisos
    };
  }
  const diasUnicos = [];
  for (const v of ventanas) if (!diasUnicos.includes(v.dia)) diasUnicos.push(v.dia);
  const unicaVentana = diasUnicos.length === 1;
  const diaEliminatorias = unicaVentana ? null : diasUnicos[diasUnicos.length - 1];
  if (unicaVentana) {
    avisos.push(
      `Ventana unica (${diasUnicos[0]}): se generan bloques de grupos en el mismo dia de las eliminatorias.`
    );
  }
  const bloques = [];
  const dias = [];
  const vistos = /* @__PURE__ */ new Set();
  for (const dia of diasUnicos) {
    if (dia === diaEliminatorias) {
      dias.push({ dia, bloques: 0, minutosSobrantes: 0, eliminatorias: true });
      continue;
    }
    let bloquesDelDia = 0;
    let sobrantesDelDia = 0;
    for (const v of ventanas.filter((x) => x.dia === dia)) {
      const inicio = parseHoraBloque(v.desde);
      const fin = parseHoraBloque(v.hasta);
      if (fin <= inicio) {
        avisos.push(`Ventana vacia o invertida en ${dia} (${v.desde}-${v.hasta}): 0 bloques.`);
        continue;
      }
      let t = inicio;
      while (t + minutosPorBloque <= fin) {
        const id = `${dia}-${formatHoraBloque(t)}`;
        if (vistos.has(id)) {
          avisos.push(`Bloque duplicado ${id} descartado: hay ventanas que se traslapan.`);
        } else {
          vistos.add(id);
          const finRealista = t + minutosRealistas;
          bloques.push({
            id,
            dia,
            desde: formatHoraBloque(t),
            hasta: formatHoraBloque(t + minutosPorBloque),
            hastaRealista: formatHoraBloque(finRealista % 1440),
            seSaleDeLaVentana: finRealista > fin,
            carriles: entrada.canchas
          });
          bloquesDelDia += 1;
        }
        t += minutosPorBloque;
      }
      sobrantesDelDia += fin - t;
    }
    if (bloquesDelDia === 0) {
      avisos.push(`El dia ${dia} no alcanza para un bloque de ${minutosPorBloque} min.`);
    }
    if (sobrantesDelDia > 0) {
      avisos.push(`Sobran ${sobrantesDelDia} min en ${dia}: no alcanzan para otro bloque.`);
    }
    dias.push({
      dia,
      bloques: bloquesDelDia,
      minutosSobrantes: sobrantesDelDia,
      eliminatorias: false
    });
  }
  const capacidadCarriles = bloques.reduce((a, b) => a + b.carriles, 0);
  return {
    bloques,
    minutosPorBloque,
    capacidadCarriles,
    capacidadParejas: capacidadCarriles * PAREJAS_POR_GRUPO,
    dias,
    diaEliminatorias,
    avisos
  };
}
function partidosDeGrupo(parejas) {
  if (!Number.isInteger(parejas) || parejas < 0) {
    throw new Error(`parejas debe ser un entero >= 0: ${parejas}`);
  }
  return parejas * (parejas - 1) / 2;
}
function carrilesDeGrupo(parejas, partidosPorCarril = PARTIDOS_POR_CARRIL) {
  if (!Number.isInteger(partidosPorCarril) || partidosPorCarril <= 0) {
    throw new Error(`partidosPorCarril debe ser un entero positivo: ${partidosPorCarril}`);
  }
  if (parejas <= 0) return 0;
  return Math.max(1, Math.ceil(partidosDeGrupo(parejas) / partidosPorCarril));
}
function tamanoDeGrupo(opciones, categoriaId) {
  const g2 = opciones.parejasPorGrupo?.[categoriaId];
  return Number.isInteger(g2) && g2 >= 2 ? g2 : PAREJAS_POR_GRUPO;
}
function cupoDeBloque(bloque, ocupacion, categoriaId, opciones = {}) {
  const ocup = ocupacion ?? {};
  const ppc = opciones.partidosPorCarril ?? PARTIDOS_POR_CARRIL;
  let carrilesUsados = 0;
  for (const cat of Object.keys(ocup)) {
    const parejas = ocup[cat] ?? 0;
    if (parejas <= 0) continue;
    const g2 = tamanoDeGrupo(opciones, cat);
    carrilesUsados += Math.ceil(parejas / g2) * carrilesDeGrupo(g2, ppc);
  }
  const carrilesLibres = bloque.carriles - carrilesUsados;
  const gMia = tamanoDeGrupo(opciones, categoriaId);
  const mias = ocup[categoriaId] ?? 0;
  const huecoEnMiGrupo = mias > 0 ? (gMia - mias % gMia) % gMia : 0;
  const gruposQueCaben = Math.floor(Math.max(0, carrilesLibres) / carrilesDeGrupo(gMia, ppc));
  return huecoEnMiGrupo + gruposQueCaben * gMia;
}
function bloquesDisponibles(bloques, ocupacion, categoriaId, opciones = {}) {
  const ocup = ocupacion ?? {};
  const salida = [];
  for (const bloque of bloques) {
    const cupo = cupoDeBloque(bloque, ocup[bloque.id], categoriaId, opciones);
    if (cupo > 0) salida.push({ ...bloque, cupo });
  }
  return salida;
}

// src/lib/engine/schedule/grupos.ts
function huellaDeGrupo(partidos) {
  const rondas = [...new Set(partidos.map((p) => p.ronda))].sort((a, b) => a - b);
  const porRonda = rondas.map((r) => partidos.filter((p) => p.ronda === r));
  return {
    rondas: rondas.length,
    anchura: porRonda.reduce((a, r) => Math.max(a, r.length), 0),
    porRonda
  };
}
function turnosDeBloque(bloque, minutosPorPartido) {
  const dur = parseHoraBloque(bloque.hasta) - parseHoraBloque(bloque.desde);
  return Math.floor(dur / minutosPorPartido);
}
function sonContiguos(a, b) {
  return a.dia === b.dia && a.hasta === b.desde;
}
var claveCarril = (bloqueId, cancha) => `${bloqueId}#${cancha}`;
function programarGrupos(entrada) {
  const avisos = [];
  const minutos = entrada.minutosPorPartido;
  if (!Number.isFinite(minutos) || minutos <= 0) {
    throw new Error(`minutosPorPartido debe ser positivo: ${minutos}`);
  }
  const bloques = [...entrada.bloques].sort(
    (a, b) => a.dia.localeCompare(b.dia) || parseHoraBloque(a.desde) - parseHoraBloque(b.desde)
  );
  new Map(bloques.map((b, i) => [b.id, i]));
  const partidos = [];
  const sinProgramar = [];
  const sobrevendidos = [];
  if (bloques.length === 0) {
    avisos.push("Sin bloques: falta capturar las canchas o los horarios del torneo.");
    for (const g2 of ordenarGruposParaReporte(entrada.grupos)) {
      sinProgramar.push({ groupId: g2.id, categoryId: g2.categoryId, motivo: "sin_bloque" });
    }
    return {
      partidos,
      sinProgramar,
      empalmes: [],
      sobrevendidos,
      ocupacion: { canchasHoraUsadas: 0, canchasHoraDisponibles: 0, porcentaje: 0 },
      ocupacionPorBloque: [],
      avisos
    };
  }
  const porBloque = /* @__PURE__ */ new Map();
  for (const b of bloques) porBloque.set(b.id, []);
  const bloquesMuertos = /* @__PURE__ */ new Set();
  for (const g2 of ordenarGruposParaReporte(entrada.grupos)) {
    if (g2.partidos.length === 0) {
      sinProgramar.push({ groupId: g2.id, categoryId: g2.categoryId, motivo: "no_cabe_en_el_bloque" });
      avisos.push(`El grupo ${g2.nombre} no tiene partidos que programar.`);
      continue;
    }
    if (g2.bloqueId === null) {
      sinProgramar.push({ groupId: g2.id, categoryId: g2.categoryId, motivo: "sin_bloque" });
      continue;
    }
    if (!porBloque.has(g2.bloqueId)) {
      sinProgramar.push({ groupId: g2.id, categoryId: g2.categoryId, motivo: "bloque_desconocido" });
      bloquesMuertos.add(g2.bloqueId);
      continue;
    }
    porBloque.get(g2.bloqueId).push(g2);
  }
  for (const id of [...bloquesMuertos].sort()) {
    avisos.push(`El bloque ${id} ya no existe en el horario del torneo: sus grupos hay que reubicarlos.`);
  }
  const hermanas = grafoDeHermandad(
    Object.entries(entrada.jugadoresPorCategoria ?? {}).map(([id, jugadores]) => ({
      id,
      clasificados: 0,
      jugadores
    }))
  );
  const empalmes = [];
  for (const b of bloques) {
    const cats = [...new Set(porBloque.get(b.id).map((g2) => g2.categoryId))].sort();
    for (let i = 0; i < cats.length; i++) {
      for (let j = i + 1; j < cats.length; j++) {
        if (hermanas.get(cats[i])?.has(cats[j])) {
          empalmes.push({ bloqueId: b.id, categoriaA: cats[i], categoriaB: cats[j] });
        }
      }
    }
  }
  if (empalmes.length > 0) {
    avisos.push(
      `${empalmes.length} empalme${empalmes.length === 1 ? "" : "s"} entre categor\xEDas que comparten jugadores. No se pueden evitar sin cambiarle el horario a alguien: av\xEDsale t\xFA.`
    );
  }
  const reservado = /* @__PURE__ */ new Map();
  const canchasPrevias = /* @__PURE__ */ new Map();
  for (let i = 0; i < bloques.length; i++) {
    const bloque = bloques[i];
    const delBloque = porBloque.get(bloque.id);
    if (delBloque.length === 0) continue;
    const turnos = turnosDeBloque(bloque, minutos);
    if (turnos <= 0) {
      for (const g2 of delBloque) {
        sinProgramar.push({ groupId: g2.id, categoryId: g2.categoryId, motivo: "no_cabe_en_el_bloque" });
      }
      avisos.push(`El bloque ${bloque.id} no da ni para un partido de ${minutos} min.`);
      continue;
    }
    const carrilesPedidos = delBloque.reduce((a, g2) => {
      const h = huellaDeGrupo(g2.partidos);
      return a + h.anchura * Math.ceil(h.rondas / turnos);
    }, 0);
    if (carrilesPedidos > bloque.carriles) {
      sobrevendidos.push({
        bloqueId: bloque.id,
        carrilesPedidos,
        carriles: bloque.carriles,
        grupos: delBloque.length
      });
      avisos.push(
        `${bloque.dia} ${bloque.desde}: hacen falta ${carrilesPedidos} canchas y hay ${bloque.carriles}. Abre otra cancha en ese horario o habla con las parejas que sobran.`
      );
    }
    const canchasDelBloque = /* @__PURE__ */ new Map();
    for (const g2 of ordenarDentroDelBloque(delBloque)) {
      const huella = huellaDeGrupo(g2.partidos);
      const bloquesNecesarios = Math.ceil(huella.rondas / turnos);
      const tramo = [bloque];
      while (tramo.length < bloquesNecesarios) {
        const siguiente = bloques[i + tramo.length];
        if (!siguiente || !sonContiguos(tramo[tramo.length - 1], siguiente)) break;
        tramo.push(siguiente);
      }
      if (tramo.length < bloquesNecesarios) {
        sinProgramar.push({ groupId: g2.id, categoryId: g2.categoryId, motivo: "no_cabe_en_el_bloque" });
        avisos.push(
          `El grupo ${g2.nombre} de ${g2.categoryId} necesita ${huella.rondas} turnos seguidos y desde ${bloque.dia} a las ${bloque.desde} solo quedan ${tramo.length * turnos} antes de que se acabe el d\xEDa.`
        );
        continue;
      }
      const canchas = elegirCanchas(
        huella.anchura,
        tramo,
        bloque,
        g2.categoryId,
        reservado,
        canchasPrevias
      );
      if (canchas === null) {
        sinProgramar.push({ groupId: g2.id, categoryId: g2.categoryId, motivo: "bloque_sobrevendido" });
        continue;
      }
      for (const b of tramo) {
        for (const c of canchas) reservado.set(claveCarril(b.id, c), g2.id);
      }
      canchasDelBloque.set(
        g2.categoryId,
        [...canchasDelBloque.get(g2.categoryId) ?? [], ...canchas]
      );
      for (let r = 0; r < huella.porRonda.length; r++) {
        const idxBloque = Math.floor(r / turnos);
        const b = tramo[idxBloque];
        const turno = r % turnos;
        const inicioMin = parseHoraBloque(b.desde) + turno * minutos;
        huella.porRonda[r].forEach((p, k) => {
          partidos.push({
            matchId: p.matchId,
            groupId: g2.id,
            categoryId: g2.categoryId,
            bloqueId: b.id,
            inicio: `${b.dia}T${formatHoraBloque(inicioMin)}`,
            cancha: canchas[k] ?? canchas[canchas.length - 1],
            ordenEnBloque: turno,
            desplazado: b.id !== bloque.id
          });
        });
      }
    }
    for (const [cat, canchas] of canchasDelBloque) {
      canchasPrevias.set(cat, [...canchas].sort((x, y) => x - y));
    }
  }
  const horasDisponibles = bloques.reduce(
    (a, b) => a + b.carriles * (parseHoraBloque(b.hasta) - parseHoraBloque(b.desde)) / 60,
    0
  );
  const horasUsadas = partidos.length * minutos / 60;
  const usadasPorBloque = /* @__PURE__ */ new Map();
  for (const p of partidos) {
    if (!usadasPorBloque.has(p.bloqueId)) usadasPorBloque.set(p.bloqueId, /* @__PURE__ */ new Set());
    usadasPorBloque.get(p.bloqueId).add(p.cancha);
  }
  partidos.sort(
    (a, b) => a.bloqueId.localeCompare(b.bloqueId) || a.ordenEnBloque - b.ordenEnBloque || a.cancha - b.cancha || a.matchId.localeCompare(b.matchId)
  );
  sinProgramar.sort((a, b) => a.groupId.localeCompare(b.groupId));
  return {
    partidos,
    sinProgramar,
    empalmes,
    sobrevendidos,
    ocupacion: {
      canchasHoraUsadas: horasUsadas,
      canchasHoraDisponibles: horasDisponibles,
      porcentaje: horasDisponibles > 0 ? Math.round(horasUsadas / horasDisponibles * 1e3) / 10 : 0
    },
    ocupacionPorBloque: bloques.map((b) => ({
      bloqueId: b.id,
      canchasUsadas: usadasPorBloque.get(b.id)?.size ?? 0,
      carriles: b.carriles
    })),
    avisos
  };
}
function ordenarGruposParaReporte(grupos) {
  return [...grupos].sort(
    (a, b) => a.categoryId.localeCompare(b.categoryId) || a.nombre.localeCompare(b.nombre) || a.id.localeCompare(b.id)
  );
}
function ordenarDentroDelBloque(grupos) {
  const cuantos = /* @__PURE__ */ new Map();
  for (const g2 of grupos) cuantos.set(g2.categoryId, (cuantos.get(g2.categoryId) ?? 0) + 1);
  return [...grupos].sort(
    (a, b) => (cuantos.get(b.categoryId) ?? 0) - (cuantos.get(a.categoryId) ?? 0) || a.categoryId.localeCompare(b.categoryId) || a.nombre.localeCompare(b.nombre) || a.id.localeCompare(b.id)
  );
}
function elegirCanchas(anchura, tramo, bloqueDelGrupo, categoryId, reservado, canchasPrevias) {
  const libre = (c) => tramo.every((b) => !reservado.has(claveCarril(b.id, c)));
  const todas = [];
  for (let c = 1; c <= bloqueDelGrupo.carriles; c++) todas.push(c);
  const previas = (canchasPrevias.get(categoryId) ?? []).filter((c) => c >= 1 && c <= bloqueDelGrupo.carriles);
  const orden = [...previas, ...todas.filter((c) => !previas.includes(c))];
  const elegidas = orden.filter(libre).slice(0, anchura);
  return elegidas.length === anchura ? elegidas : null;
}

// src/lib/engine/schedule/reparto.ts
var SIN_BLOQUE = "\0sin-bloque";
function repartirPorBloque(parejas, bloqueDe, sizes) {
  const cubos = /* @__PURE__ */ new Map();
  for (const p of parejas) {
    const clave = bloqueDe(p) ?? SIN_BLOQUE;
    const ya = cubos.get(clave);
    if (ya) ya.push(p);
    else cubos.set(clave, [p]);
  }
  const claves = [...cubos.keys()].sort((a, b) => {
    if (a === SIN_BLOQUE) return 1;
    if (b === SIN_BLOQUE) return -1;
    return a.localeCompare(b);
  });
  const pendientes = [...sizes].sort((a, b) => b - a);
  const grupos = [];
  const construir = (items) => {
    const desde = {};
    for (const it of items) {
      const clave = bloqueDe(it) ?? SIN_BLOQUE;
      desde[clave] = (desde[clave] ?? 0) + 1;
    }
    return { items, bloqueId: bloqueDeGrupo(items.map(bloqueDe)), desde };
  };
  for (const clave of claves) {
    const cubo = cubos.get(clave);
    let i = 0;
    for (; ; ) {
      const quedan = cubo.length - i;
      const idx = pendientes.findIndex((s) => s <= quedan);
      if (idx === -1) break;
      const size = pendientes.splice(idx, 1)[0];
      grupos.push(construir(cubo.slice(i, i + size)));
      i += size;
    }
    cubos.set(clave, cubo.slice(i));
  }
  const restos = [];
  for (const clave of claves) restos.push(...cubos.get(clave));
  let j = 0;
  for (const size of pendientes) {
    grupos.push(construir(restos.slice(j, j + size)));
    j += size;
  }
  return grupos;
}
function bloqueDeGrupo(elecciones) {
  const cuenta = {};
  for (const e of elecciones) {
    const clave = e ?? SIN_BLOQUE;
    cuenta[clave] = (cuenta[clave] ?? 0) + 1;
  }
  const orden = Object.keys(cuenta).sort((a, b) => {
    const d = cuenta[b] - cuenta[a];
    if (d !== 0) return d;
    if (a === SIN_BLOQUE) return 1;
    if (b === SIN_BLOQUE) return -1;
    return a.localeCompare(b);
  });
  const ganador = orden[0];
  return ganador === void 0 || ganador === SIN_BLOQUE ? null : ganador;
}

// src/lib/engine/schedule/mover.ts
var ETIQUETA_ETAPA = {
  group: "partido de grupos",
  round_of_32: "ronda de 32",
  round_of_16: "octavos",
  quarter: "cuarto",
  semi: "semifinal",
  final: "final",
  third_place: "partido por el 3.er lugar"
};
var ORDEN_ETAPAS = ["round_of_32", "round_of_16", "quarter", "semi", "final"];
var etiqueta = (stage) => ETIQUETA_ETAPA[stage] ?? "partido";
var nombreDe = (id, nombres) => nombres?.[id] ?? "Un jugador";
function duracionLegible(min) {
  if (min < 60) return `${min} ${min === 1 ? "minuto" : "minutos"}`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  const horas = `${h} ${h === 1 ? "hora" : "horas"}`;
  return m === 0 ? horas : `${h} h ${m} min`;
}
var seSolapan = (a1, a2, b1, b2) => a1 < b2 && b1 < a2;
function validarMovimiento(entrada) {
  const dur = entrada.minutosPorPartido ?? DEFAULT_MINUTOS_PARTIDO;
  const desc = entrada.descansoMinimo ?? DEFAULT_DESCANSO_MINIMO;
  const { movimiento: mov, nombres } = entrada;
  const partido = entrada.partidos.find((p) => p.id === mov.matchId);
  if (!partido) {
    return {
      ok: false,
      conflictos: [{ motivo: "partido_no_encontrado", mensaje: "Ese partido no est\xE1 en el calendario." }]
    };
  }
  if (!Number.isFinite(mov.inicioMin) || mov.inicioMin < 0 || mov.inicioMin >= 24 * 60) {
    return {
      ok: false,
      conflictos: [{ motivo: "hora_invalida", mensaje: "La hora est\xE1 fuera del d\xEDa." }]
    };
  }
  const inicio = mov.inicioMin;
  const fin = inicio + dur;
  const conflictos = [];
  const delDia = entrada.partidos.filter((p) => p.id !== partido.id && p.dia === mov.dia && p.inicioMin !== null);
  for (const otro of delDia) {
    if (otro.cancha !== mov.cancha) continue;
    if (!seSolapan(inicio, fin, otro.inicioMin, otro.inicioMin + dur)) continue;
    conflictos.push({
      motivo: "cancha_ocupada",
      matchId: otro.id,
      mensaje: `La ${mov.cancha} ya tiene un ${etiqueta(otro.stage)} a esa hora.`
    });
    break;
  }
  const mios = new Set(partido.jugadores);
  for (const otro of delDia) {
    const compartidos = otro.jugadores.filter((j) => mios.has(j));
    if (compartidos.length === 0) continue;
    const oIni = otro.inicioMin;
    const oFin = oIni + dur;
    const quien = nombreDe(compartidos[0], nombres);
    const masDeUno = compartidos.length > 1 ? ` (y ${compartidos.length - 1} m\xE1s)` : "";
    if (seSolapan(inicio, fin, oIni, oFin)) {
      conflictos.push({
        motivo: "jugador_ocupado",
        matchId: otro.id,
        mensaje: `${quien}${masDeUno} juega su ${etiqueta(otro.stage)} a esa misma hora.`
      });
      continue;
    }
    if (oFin <= inicio && inicio - oFin < desc) {
      const hace = inicio - oFin;
      conflictos.push({
        motivo: "descanso_insuficiente",
        matchId: otro.id,
        mensaje: hace === 0 ? `${quien}${masDeUno} termina su ${etiqueta(otro.stage)} justo a esa hora.` : `${quien}${masDeUno} termina su ${etiqueta(otro.stage)} ${duracionLegible(hace)} antes; necesita ${duracionLegible(desc)} de descanso.`
      });
      continue;
    }
    if (fin <= oIni && oIni - fin < desc) {
      conflictos.push({
        motivo: "descanso_insuficiente",
        matchId: otro.id,
        mensaje: `${quien}${masDeUno} empieza su ${etiqueta(otro.stage)} ${duracionLegible(oIni - fin)} despu\xE9s de este; necesita ${duracionLegible(desc)} de descanso.`
      });
    }
  }
  if (partido.stage !== "group") {
    for (const previo of partidosPrevios(partido, entrada.partidos)) {
      if (previo.status === "finished") continue;
      if (previo.dia === null || previo.inicioMin === null) {
        conflictos.push({
          motivo: "ronda_previa_sin_hora",
          matchId: previo.id,
          mensaje: `Antes se juega un ${etiqueta(previo.stage)} que todav\xEDa no tiene hora.`
        });
        continue;
      }
      const pFin = previo.inicioMin + dur;
      const antes = previo.dia < mov.dia || previo.dia === mov.dia && pFin + desc <= inicio;
      if (!antes) {
        conflictos.push({
          motivo: "ronda_previa_despues",
          matchId: previo.id,
          mensaje: `El ${etiqueta(previo.stage)} del que sale este todav\xEDa no habr\xEDa terminado.`
        });
      }
    }
  }
  return { ok: conflictos.length === 0, conflictos };
}
function partidosPrevios(partido, todos) {
  if (partido.sourceMatchIds?.length) {
    const ids = new Set(partido.sourceMatchIds);
    return todos.filter((p) => ids.has(p.id));
  }
  const objetivo = partido.stage === "third_place" ? "semi" : ORDEN_ETAPAS[ORDEN_ETAPAS.indexOf(partido.stage) - 1];
  if (!objetivo) return [];
  return todos.filter((p) => p.categoryId === partido.categoryId && p.stage === objetivo);
}

// src/lib/engine/rating/glicko2.ts
var SCALE = 173.7178;
var EPSILON = 1e-6;
var DEFAULT_TAU = 0.5;
function g(phi) {
  return 1 / Math.sqrt(1 + 3 * phi * phi / (Math.PI * Math.PI));
}
function expectedScore(mu, muJ, phiJ) {
  return 1 / (1 + Math.exp(-g(phiJ) * (mu - muJ)));
}
function updateRating(player, opponents, tau = DEFAULT_TAU) {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.rd / SCALE;
  const sigma = player.volatility;
  if (opponents.length === 0) {
    const phiStar2 = Math.sqrt(phi * phi + sigma * sigma);
    return { rating: player.rating, rd: phiStar2 * SCALE, volatility: sigma };
  }
  let vInv = 0;
  let deltaSum = 0;
  for (const o of opponents) {
    const muJ = (o.rating - 1500) / SCALE;
    const phiJ = o.rd / SCALE;
    const gj = g(phiJ);
    const ej = expectedScore(mu, muJ, phiJ);
    vInv += gj * gj * ej * (1 - ej);
    deltaSum += gj * (o.score - ej);
  }
  const v = 1 / vInv;
  const delta = v * deltaSum;
  const a = Math.log(sigma * sigma);
  const f = (x) => {
    const ex = Math.exp(x);
    const num = ex * (delta * delta - phi * phi - v - ex);
    const den = 2 * Math.pow(phi * phi + v + ex, 2);
    return num / den - (x - a) / (tau * tau);
  };
  let A = a;
  let B;
  if (delta * delta > phi * phi + v) {
    B = Math.log(delta * delta - phi * phi - v);
  } else {
    let k = 1;
    while (f(a - k * tau) < 0) k++;
    B = a - k * tau;
  }
  let fA = f(A);
  let fB = f(B);
  while (Math.abs(B - A) > EPSILON) {
    const C = A + (A - B) * fA / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else {
      fA = fA / 2;
    }
    B = C;
    fB = fC;
  }
  const sigmaPrime = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + sigmaPrime * sigmaPrime);
  const phiPrime = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const muPrime = mu + phiPrime * phiPrime * deltaSum;
  return {
    rating: muPrime * SCALE + 1500,
    rd: phiPrime * SCALE,
    volatility: sigmaPrime
  };
}
function combineOpponentPair(a, b) {
  return {
    rating: (a.rating + b.rating) / 2,
    rd: Math.sqrt((a.rd * a.rd + b.rd * b.rd) / 2)
  };
}

// src/lib/engine/rating/category-bands.ts
var DEFAULT_BANDS = [
  { division: "sexta", min: -Infinity, max: 1399 },
  { division: "quinta", min: 1400, max: 1549 },
  { division: "cuarta", min: 1550, max: 1699 },
  { division: "tercera", min: 1700, max: 1849 },
  { division: "segunda", min: 1850, max: 1999 },
  { division: "primera", min: 2e3, max: Infinity }
];
var DEFAULT_BAND_CONFIG = {
  bands: DEFAULT_BANDS,
  rdConfidentThreshold: 100,
  promotionTournamentsThreshold: 3
};
function divisionForRating(rating, cfg = DEFAULT_BAND_CONFIG) {
  const band = cfg.bands.find((b) => rating >= b.min && rating <= b.max);
  return band ? band.division : cfg.bands[cfg.bands.length - 1].division;
}

// src/lib/engine/ranking-points/index.ts
var DEFAULT_RANKING_RULES = {
  groupWinPoints: 50,
  qualifyBonus: 100,
  roundPoints: {
    r16: 150,
    quarter: 250,
    semi: 400,
    final: 650,
    champion: 1e3
  },
  drawsizeMultipliers: {
    lte8: 0.7,
    from9to16: 1,
    from17to32: 1.3,
    gte33: 1.5
  },
  roundrobinChampionBonus: 1e3,
  applyMultiplierToTotal: true
};
function drawMultiplier(drawSize, rules) {
  const m = rules.drawsizeMultipliers;
  if (drawSize <= 8) return m.lte8;
  if (drawSize <= 16) return m.from9to16;
  if (drawSize <= 32) return m.from17to32;
  return m.gte33;
}
function computeRankingPoints(result, rules = DEFAULT_RANKING_RULES) {
  let total = result.groupWins * rules.groupWinPoints;
  if (result.roundRobinOnly) {
    if (result.wonRoundRobin) total += rules.roundrobinChampionBonus;
  } else {
    if (result.qualified) total += rules.qualifyBonus;
    if (result.furthestRound !== "none") {
      total += rules.roundPoints[result.furthestRound];
    }
  }
  if (rules.applyMultiplierToTotal) {
    total *= drawMultiplier(result.drawSize, rules);
  }
  return Math.round(total);
}

export { PAREJAS_POR_GRUPO, PARTIDOS_POR_CARRIL, advanceBracket, bloqueDeGrupo, bloquesDisponibles, carrilesDeGrupo, clasificarSet, combineOpponentPair, computeClinch, computeFormat, computeRankingPoints, computeSeeding, computeStandings, cupoDeBloque, divisionForRating, etapaDeRonda, etiquetaDeRonda, generarBloques, generateRoundRobin, huellaDeGrupo, planAvance, programarEliminatorias, programarGrupos, repartirPorBloque, selectQualifiers, stageForBracketSize, thirdPlaceFromSemis, updateRating, validarMovimiento, validateScore };
