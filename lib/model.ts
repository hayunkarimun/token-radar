// Launch Sonar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board ranks every pre-token protocol the brief's own watchlist rule keeps
// (no token, not a wrapped / staked / bridged product of a token that trades, not
// an exchange, not a versioned pool). The watchlist is the floor: all 40 of its
// slugs are on the board, and every other rankable protocol joins them, so the
// board is the whole launchable universe in the snapshot, not a hand-picked list.
//
// Implied value follows only from the snapshot's own figures, through four
// factors no protocol name ever touches:
//
//   base     = tvl_usd x BASE_MULTIPLE                 (0.18: a launch is worth a slice of the value already parked)
//   growth   = log-damped 7-day momentum. Raw 7d moves in this snapshot run from
//              -73% to +4,448%, so a linear factor would let one outlier week buy
//              the whole board. growthMult = 1 + GROWTH_WEIGHT x sign(g) x
//              log10(1+|g|) / log10(1+GROWTH_REF), with g clamped to [-80, 200].
//              A +12% week is worth about +0.25, a +200% week about +0.50, and a
//              -70% week costs about -0.40: momentum matters, but it cannot print
//              value out of one week.
//   window   = the launch window: a hump peaking at WINDOW_PEAK_DAYS (730, about
//              two years). A protocol fresh off its listing is unproven; one that
//              has run five years with no token has probably decided not to launch.
//              windowMult = WINDOW_FLOOR + (1 - WINDOW_FLOOR) x exp(-((age-peak)/WINDOW_WIDTH)^2).
//              Unknown age counts as 365 days.
//   breadth  = 1 + BREADTH_WEIGHT x min(chains - 1, 8): a protocol live on more
//              chains has more surface for a token to land on.
//   confidence = CONFIDENCE_FLOOR + (1 - CONFIDENCE_FLOOR) x min(1, tvl /
//              CONFIDENCE_FULL_TVL): TVL near the $50M floor is noisy — one
//              whale's deposit or withdrawal moves it sharply — so a small
//              protocol's implied value is discounted up to 15%, reaching full
//              confidence only at $500M of TVL. Large protocols are untouched.
//
//   implied  = max(1, round(base x growthMult x windowMult x breadthMult x confidenceMult))
//
// Every factor is stated in the dashboard and changeable in its sandbox, which
// re-ranks the board live from the same numbers.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them and the sandbox may change them. */
export interface ModelConstants {
  base_multiple: number;
  growth_weight: number;
  growth_ref: number;
  growth_floor: number;
  growth_cap: number;
  window_floor: number;
  window_peak_days: number;
  window_width_days: number;
  unknown_age_days: number;
  breadth_weight: number;
  breadth_cap: number;
  confidence_floor: number;
  confidence_full_tvl_usd: number;
}

export const MODEL: ModelConstants = {
  base_multiple: 0.18,
  growth_weight: 0.5,
  growth_ref: 200,
  growth_floor: -80,
  growth_cap: 200,
  window_floor: 0.55,
  window_peak_days: 730,
  window_width_days: 600,
  unknown_age_days: 365,
  breadth_weight: 0.04,
  breadth_cap: 8,
  confidence_floor: 0.85,
  confidence_full_tvl_usd: 500_000_000,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'sonar-2';

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 20;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    base_multiple: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    confidence_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  breadth_multiplier: number;
  signal: string;
  flags: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  tvl_mcap: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  excluded: { versioned: number; wrapped: number; exchange: number };
  rows: RadarRow[];
  live: LiveRow[];
  movers: { slug: string; name: string; change_7d: number | null; implied_value_usd: number }[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/**
 * The four factors and the implied value one protocol gets under `model`.
 * Growth is log-damped so one wild week cannot buy the board; the window is a
 * hump peaking at two years; breadth rewards multi-chain presence; confidence
 * discounts small TVL, which one whale can move, up to 15% near the floor.
 */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  model: ModelConstants,
): { implied: number; growthPct: number; growthMult: number; windowMult: number; breadthMult: number; confidenceMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const logScale = Math.log10(1 + model.growth_ref);
  const signedLog = Math.sign(growthPct) * (Math.log10(1 + Math.abs(growthPct)) / logScale);
  const growthMult = 1 + model.growth_weight * signedLog;
  const ageForModel = age ?? model.unknown_age_days;
  const peak = model.window_peak_days;
  const width = model.window_width_days;
  const windowMult =
    model.window_floor + (1 - model.window_floor) * Math.exp(-(((ageForModel - peak) / width) ** 2));
  const extraChains = Math.min(Math.max(protocol.chains.length - 1, 0), model.breadth_cap);
  const breadthMult = 1 + model.breadth_weight * extraChains;
  const confidenceMult =
    model.confidence_floor +
    (1 - model.confidence_floor) * Math.min(1, protocol.tvl_usd / model.confidence_full_tvl_usd);
  const base = protocol.tvl_usd * model.base_multiple;
  const implied = Math.max(1, Math.round(base * growthMult * windowMult * breadthMult * confidenceMult));
  return { implied, growthPct, growthMult, windowMult, breadthMult, confidenceMult, age };
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories the brief's watchlist rule leaves out: bridged, staked and exchange products. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** A wrapped, staked or bridged product of a token that already trades. */
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;
const EXCHANGE_LEAD = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)\b/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a wrapped/staked/bridged product, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_LEAD.test(p.name)
  );
}

/** Why a pre-token protocol is left off the board, for the dashboard's excluded count. */
export function exclusionReason(p: SnapshotProtocol): 'versioned' | 'wrapped' | 'exchange' | null {
  if (!isPreToken(p)) return null;
  if (p.category === 'CEX') return 'exchange';
  if (VERSIONED.test(p.name)) return 'versioned';
  if (EXCLUDED_CATEGORIES.has(p.category ?? '') || WRAPPED_WORD.test(p.name) || EXCHANGE_LEAD.test(p.name)) return 'wrapped';
  return null;
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** A row's one-word signal, from its growth factor. */
export function signalFor(growthMult: number, age: number | null): string {
  if (age !== null && age < 180) return 'Fresh';
  if (growthMult >= 1.2) return 'Heating up';
  if (growthMult <= 0.9) return 'Cooling';
  return 'Steady';
}

/** A row's risk flags, from its own record. */
export function flagsFor(p: SnapshotProtocol, age: number | null): string[] {
  const flags: string[] = [];
  if (p.chains.length <= 1) flags.push('Single chain');
  if (age !== null && age < 180) flags.push('Very young');
  if (age !== null && age > 1825) flags.push('Long wait, no token yet');
  const g = p.change_7d;
  if (g !== null && g < 0) flags.push('TVL falling');
  if (g !== null && Math.abs(g) > 100) flags.push('Extreme 7d move');
  return flags;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug on it, whatever its size.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The rest of the launchable universe: every rankable pre-token protocol the
  // watchlist leaves out, whatever its TVL. No cap, no hand-picking.
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const { implied, growthPct, growthMult, windowMult, breadthMult, confidenceMult, age } = impliedValue(p, snapshot.as_of, model);
    return { p, implied, growthPct, growthMult, windowMult, breadthMult, confidenceMult, age };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      base_multiple: model.base_multiple,
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.windowMult),
      confidence_multiplier: round4(s.confidenceMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Keep the position open and re-check the protocol's own rewards page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 200;
  if (p.tvl_usd >= 1_000_000_000) return 120;
  if (p.tvl_usd >= 100_000_000) return 80;
  return 40;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 45;
  if (age < 180) return 90;
  if (age < 365) return 60;
  return 30;
}

/** The category's one action, in words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Lend $${capital} of USDC on ${name} (${chain}) and leave the loan open.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm') || c.includes('farm')) return `Add $${capital} of liquidity to ${name}'s busiest pool on ${chain} and leave it in.`;
  if (c.includes('bridge')) return `Move $${capital} of USDC to ${chain} through ${name}, then put the bridged funds to work in its app.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} through ${name} on ${chain} and hold the receipt token.`;
  if (c.includes('perpetual') || c.includes('derivative')) return `Post $${capital} of USDC as margin on ${name} and open one small hedged trade.`;
  if (c.includes('prediction')) return `Back one outcome with $${capital} on ${name} and settle it when the market closes.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('manager')) return `Place $${capital} in a ${name} vault on ${chain} and hold the vault shares.`;
  if (c.includes('stable')) return `Mint or hold $${capital} of the stable asset ${name} issues on ${chain}.`;
  if (c.includes('rwa')) return `Buy $${capital} of ${name}'s yield-bearing asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Take $${capital} of cover from ${name} on ${chain} and keep the policy live.`;
  if (c.includes('prediction') || c.includes('otc') || c.includes('marketplace')) return `Complete one $${capital} trade on ${name} and keep the receipt.`;
  return `Put $${capital} of USDC to work in ${name} on ${chain} and leave the position open.`;
}

/**
 * A protocol's farm plan: seven steps, each an action with a cost and a time.
 * Every step is derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  return [
    {
      text: `Open a fresh wallet for this farm alone, fund it with only what you plan to use, and store its seed phrase offline.`,
      cost: 'under $3 of gas for the first transfer',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital plus about $${capital >= 120 ? 6 : 3} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Find ${p.name}'s own points or rewards page and check what counts: deposits, volume, referrals or quests.`,
      cost: 'free to read',
      time: '10 minutes',
    },
    {
      text: `Do one qualifying action a week: a deposit, a swap, a vote or a quest, and keep a note of each one.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Keep the position open for at least ${hold} days, so it is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `When a claim opens, use only the link on the protocol's own site or official account, and never pay anyone to claim for you.`,
      cost: 'no fee to check',
      time: '10 minutes',
    },
    {
      text: `Log the wallet, the dates and every transaction, then decide in advance at what point you unwind.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      tvl_mcap: p.mcap_usd !== null && p.mcap_usd > 0 ? round4(p.tvl_usd / p.mcap_usd) : null,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow, snapshot: Snapshot): RadarRow {
  const p = snapshot.protocols.find((x) => x.slug === row.slug)!;
  const { breadthMult } = impliedValue(p, snapshot.as_of, MODEL);
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    breadth_multiplier: round4(breadthMult),
    signal: signalFor(row.model.growth_multiplier, row.age_days),
    flags: flagsFor(p, row.age_days),
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const excluded = { versioned: 0, wrapped: 0, exchange: 0 };
  for (const p of snapshot.protocols) {
    const reason = exclusionReason(p);
    if (reason !== null) excluded[reason]++;
  }
  const movers = [...board]
    .filter((r) => r.change_7d !== null)
    .sort((a, b) => (b.change_7d ?? 0) - (a.change_7d ?? 0))
    .slice(0, 5)
    .map((r) => ({ slug: r.slug, name: r.name, change_7d: r.change_7d, implied_value_usd: r.implied_value_usd }));
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    excluded,
    rows: board.map((r) => radarRow(r, snapshot)),
    live,
    movers,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
