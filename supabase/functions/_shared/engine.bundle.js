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
function normalSetWinner(a, b, cfg) {
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  const okClean = hi === cfg.setTarget && lo <= cfg.setTarget - cfg.setWinBy;
  const okSeven = hi === cfg.setTiebreakCap && (lo === cfg.setTarget - 1 || lo === cfg.setTarget);
  if (!okClean && !okSeven) return null;
  if (a === b) return null;
  return a > b ? "A" : "B";
}
function superSetWinner(set, cfg) {
  const a = set.tiebreakA ?? set.gamesA;
  const b = set.tiebreakB ?? set.gamesB;
  const hi = Math.max(a, b);
  const lo = Math.min(a, b);
  if (hi < cfg.superTiebreakTarget) return null;
  if (hi - lo < cfg.superTiebreakWinBy) return null;
  if (a === b) return null;
  return a > b ? "A" : "B";
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
    if (st.isSuperTiebreak) {
      if (!isDecider) {
        errors.push(`Super muerte en el set ${i + 1} pero no es el set decisivo.`);
      }
      const w = superSetWinner(st, config);
      if (w === null) {
        errors.push(`Super muerte del set ${i + 1} con marcador inv\xE1lido.`);
      } else if (w === "A") setsA++;
      else setsB++;
    } else {
      const w = normalSetWinner(st.gamesA, st.gamesB, config);
      if (w === null) {
        errors.push(`Set ${i + 1} con marcador de games inv\xE1lido (${st.gamesA}-${st.gamesB}).`);
      } else if (w === "A") setsA++;
      else setsB++;
    }
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
  pointsPlayedLoss: 1,
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
  return b.gamesWon - a.gamesWon;
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
  const h = Math.floor(min / 60);
  const m = min % 60;
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
function cotaInferior(entrada) {
  const dur = entrada.minutosPorPartido ?? DEFAULT_MINUTOS_PARTIDO;
  const desc = entrada.descansoMinimo ?? DEFAULT_DESCANSO_MINIMO;
  const inicio = parseHora(entrada.desde);
  const items = [];
  for (const cat of entrada.categorias) {
    const rondas = partidosPorRonda(cat.clasificados);
    rondas.forEach((n, i) => {
      items.push({ distancia: rondas.length - 1 - i, partidos: n });
    });
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
    const t = tareas.find((x) => x.categoryId === categoryId && x.ronda === ronda);
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
            etapa: etapaDeRonda(tarea.ronda, tarea.totalRondas)
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
          etapa: etapaDeRonda(tarea.ronda, tarea.totalRondas),
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

export { advanceBracket, combineOpponentPair, computeClinch, computeFormat, computeRankingPoints, computeSeeding, computeStandings, divisionForRating, etapaDeRonda, generateRoundRobin, programarEliminatorias, selectQualifiers, stageForBracketSize, thirdPlaceFromSemis, updateRating, validateScore };
