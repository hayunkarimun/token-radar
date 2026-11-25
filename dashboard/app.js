/* Launch Sonar dashboard: static, no network. Reads window.RADAR from ../data.js. */
const R = window.RADAR;
const $ = (id) => document.getElementById(id);
const money = (n) => n >= 1e9 ? '$' + (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? '$' + (n / 1e6).toFixed(1) + 'M' : n >= 1e3 ? '$' + (n / 1e3).toFixed(1) + 'K' : '$' + Math.round(n);
const moneyFull = (n) => '$' + Math.round(n).toLocaleString('en-US');
const pct = (n) => n === null || n === undefined ? '—' : (n > 0 ? '+' : '') + n.toFixed(1) + '%';
const ageFmt = (d) => d === null || d === undefined ? '—' : d >= 365 ? (d / 365).toFixed(1) + 'y' : d + 'd';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const DAY = 86400000;
function ageOf(listed) {
  if (!listed) return null;
  const a = Date.parse(R.as_of + 'T00:00:00Z'), b = Date.parse(listed + 'T00:00:00Z');
  return Number.isFinite(a) && Number.isFinite(b) ? Math.max(0, Math.floor((a - b) / DAY)) : null;
}
/* The model, exactly as lib/model.ts states it: log-damped growth, humped launch window, breadth. */
function implied(r, m) {
  const g0 = r.change_7d === null || r.change_7d === undefined ? 0 : r.change_7d;
  const g = Math.min(m.growth_cap, Math.max(m.growth_floor, g0));
  const signedLog = Math.sign(g) * (Math.log10(1 + Math.abs(g)) / Math.log10(1 + m.growth_ref));
  const growthMult = 1 + m.growth_weight * signedLog;
  const age = r.age_days === null || r.age_days === undefined ? ageOf(r.listed_at) : r.age_days;
  const a = age === null ? m.unknown_age_days : age;
  const windowMult = m.window_floor + (1 - m.window_floor) * Math.exp(-(((a - m.window_peak_days) / m.window_width_days) ** 2));
  const breadthMult = 1 + m.breadth_weight * Math.min(Math.max(r.chains.length - 1, 0), m.breadth_cap);
  return { implied: Math.max(1, Math.round(r.tvl_usd * m.base_multiple * growthMult * windowMult * breadthMult)), growthMult, windowMult, breadthMult, age };
}
function pill(sig) {
  const cls = sig === 'Heating up' ? 'hot' : sig === 'Cooling' ? 'cold' : sig === 'Fresh' ? 'new' : 'ok';
  return '<span class="pill ' + cls + '">' + sig + '</span>';
}
function signalOf(growthMult, age) {
  if (age !== null && age < 180) return 'Fresh';
  if (growthMult >= 1.2) return 'Heating up';
  if (growthMult <= 0.9) return 'Cooling';
  return 'Steady';
}

/* ---- header, movers, selects ---- */
$('asOf').textContent = R.as_of;
$('statBoard').textContent = R.board_size + ' rows · ' + R.watchlist_size + ' watchlist';
$('statTotal').textContent = money(R.rows.reduce((s, r) => s + r.implied_value_usd, 0));
$('movers').innerHTML = '<span class="lab">Fastest movers · 7d</span>' + R.movers.map((m) =>
  '<span class="chip">' + esc(m.name) + ' <b>+' + m.change_7d.toFixed(1) + '%</b> · ' + money(m.implied_value_usd) + '</span>').join('');
const cats = [...new Set(R.rows.map((r) => r.category).filter(Boolean))].sort();
$('cat').innerHTML += cats.map((c) => '<option>' + esc(c) + '</option>').join('');
const chains = [...new Set(R.rows.flatMap((r) => r.chains))].sort();
$('chain').innerHTML += chains.map((c) => '<option>' + esc(c) + '</option>').join('');
$('formula').textContent = 'implied = TVL × ' + R.model.base_multiple + ' × (1 + ' + R.model.growth_weight +
  ' × log-damped 7d momentum) × launch-window hump (peak ' + R.model.window_peak_days +
  'd, floor ' + R.model.window_floor + ') × (1 + ' + R.model.breadth_weight + ' × extra chains)\n' +
  'A token that does not exist yet is worth a slice of the value already parked, pulled toward launches ' +
  'in their second year and toward protocols live on more chains — never a hardcoded list of names.';
$('source').textContent = 'Data: ' + R.source + '. ' + R.excluded.versioned + ' versioned pools, ' +
  R.excluded.wrapped + ' wrapped / staked / bridged products and ' + R.excluded.exchange +
  ' exchange products were left off the board with their reasons counted above.';

/* ---- board ---- */
let current = R.rows.slice();
function applyFilters() {
  const q = $('q').value.trim().toLowerCase();
  const cat = $('cat').value, chain = $('chain').value, sig = $('sig').value, sort = $('sort').value;
  current = R.rows.filter((r) =>
    (!q || r.name.toLowerCase().includes(q) || r.slug.includes(q)) &&
    (!cat || r.category === cat) && (!chain || r.chains.includes(chain)) && (!sig || r.signal === sig));
  const key = sort === 'tvl' ? (r) => -r.tvl_usd : sort === 'growth' ? (r) => -(r.change_7d ?? -1e9) : sort === 'age' ? (r) => -(r.age_days ?? -1) : (r) => -r.implied_value_usd;
  current.sort((a, b) => key(a) - key(b));
  renderBoard();
}
function renderBoard() {
  $('rows').innerHTML = current.map((r) => '<tr data-slug="' + r.slug + '"><td>#' + r.rank + '</td>' +
    '<td><span class="name">' + esc(r.name) + '</span><br><span class="sub2">' + esc(r.slug) + '</span></td>' +
    '<td>' + esc(r.category || '—') + '</td><td>' + esc(r.chains.slice(0, 2).join(', ')) + (r.chains.length > 2 ? ' +' + (r.chains.length - 2) : '') + '</td>' +
    '<td class="num">' + money(r.tvl_usd) + '</td>' +
    '<td class="num ' + (r.change_7d > 0 ? 'up' : r.change_7d < 0 ? 'down' : '') + '">' + pct(r.change_7d) + '</td>' +
    '<td class="num">' + ageFmt(r.age_days) + '</td>' +
    '<td class="num"><b>' + money(r.implied_value_usd) + '</b></td><td>' + pill(r.signal) + '</td></tr>').join('');
  $('count').textContent = current.length + ' of ' + R.rows.length + ' protocols shown. Click any row for its model breakdown and farm plan.';
  document.querySelectorAll('#rows tr').forEach((tr) => tr.addEventListener('click', () => openDetail(tr.dataset.slug)));
}
['q', 'cat', 'chain', 'sig', 'sort'].forEach((id) => $(id).addEventListener('input', applyFilters));

/* ---- farm plan, generated in the page from the row's own record ---- */
function capitalFor(tvl) { return tvl >= 5e9 ? 200 : tvl >= 1e9 ? 120 : tvl >= 1e8 ? 80 : 40; }
function holdFor(age) { return age === null ? 45 : age < 180 ? 90 : age < 365 ? 60 : 30; }
function actionFor(r, cap, chain) {
  const c = (r.category || '').toLowerCase(), n = r.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return 'Lend $' + cap + ' of USDC on ' + n + ' (' + chain + ') and leave the loan open.';
  if (c.includes('dex') || c.includes('yield') || c.includes('farm')) return 'Add $' + cap + ' of liquidity to ' + n + '\'s busiest pool on ' + chain + ' and leave it in.';
  if (c.includes('bridge')) return 'Move $' + cap + ' of USDC to ' + chain + ' through ' + n + ', then put the bridged funds to work in its app.';
  if (c.includes('staking') || c.includes('restak')) return 'Stake $' + cap + ' through ' + n + ' on ' + chain + ' and hold the receipt token.';
  if (c.includes('perpetual') || c.includes('derivative')) return 'Post $' + cap + ' of USDC as margin on ' + n + ' and open one small hedged trade.';
  if (c.includes('prediction')) return 'Back one outcome with $' + cap + ' on ' + n + ' and settle it when the market closes.';
  if (c.includes('curator') || c.includes('allocator') || c.includes('manager')) return 'Place $' + cap + ' in a ' + n + ' vault on ' + chain + ' and hold the vault shares.';
  if (c.includes('stable')) return 'Mint or hold $' + cap + ' of the stable asset ' + n + ' issues on ' + chain + '.';
  if (c.includes('rwa')) return 'Buy $' + cap + ' of ' + n + '\'s yield-bearing asset on ' + chain + ' and hold it.';
  if (c.includes('insurance')) return 'Take $' + cap + ' of cover from ' + n + ' on ' + chain + ' and keep the policy live.';
  return 'Put $' + cap + ' of USDC to work in ' + n + ' on ' + chain + ' and leave the position open.';
}
function farmSteps(r) {
  const chain = r.chains[0] || 'its main chain', cap = capitalFor(r.tvl_usd), hold = holdFor(r.age_days);
  return [
    ['Open a fresh wallet for this farm alone, fund it with only what you plan to use, and store its seed phrase offline.', 'under $3 of gas for the first transfer', '5 minutes'],
    [actionFor(r, cap, chain), '$' + cap + ' of capital plus about $' + (cap >= 120 ? 6 : 3) + ' of gas', '15 minutes to set up'],
    ['Find ' + r.name + '\'s own points or rewards page and check what counts: deposits, volume, referrals or quests.', 'free to read', '10 minutes'],
    ['Do one qualifying action a week: a deposit, a swap, a vote or a quest, and keep a note of each one.', 'about $2 of gas a week', '10 minutes a week'],
    ['Keep the position open for at least ' + hold + ' days, so it is counted in more than one snapshot.', 'the $' + cap + ' stays in the position', hold + ' days'],
    ['When a claim opens, use only the link on the protocol\'s own site or official account, and never pay anyone to claim for you.', 'no fee to check', '10 minutes'],
    ['Log the wallet, the dates and every transaction, then decide in advance at what point you unwind.', 'nothing but the log', '5 minutes'],
  ];
}

/* ---- detail drawer ---- */
function openDetail(slug) {
  const r = R.rows.find((x) => x.slug === slug);
  if (!r) return;
  const f = implied(r, R.model);
  const base = r.tvl_usd * R.model.base_multiple;
  $('detail').innerHTML = '<h2>' + esc(r.name) + '</h2><p class="sub2">Rank #' + r.rank + ' · ' + esc(r.slug) + ' · ' + esc(r.category || 'no category') + ' · ' + esc(r.chains.join(', ')) + '</p>' +
    '<div class="facts"><div><span class="k">Implied value</span><br><b>' + moneyFull(r.implied_value_usd) + '</b></div>' +
    '<div><span class="k">TVL</span><br><b>' + moneyFull(r.tvl_usd) + '</b></div>' +
    '<div><span class="k">7d change</span><br><b>' + pct(r.change_7d) + '</b></div>' +
    '<div><span class="k">Age</span><br><b>' + ageFmt(r.age_days) + '</b></div></div>' +
    '<h3>Why this value</h3><table class="factors"><tr><td>Base · TVL × ' + R.model.base_multiple + '</td><td>' + moneyFull(base) + '</td></tr>' +
    '<tr><td>Growth · log-damped momentum</td><td>× ' + f.growthMult.toFixed(3) + '</td></tr>' +
    '<tr><td>Launch window · peak ' + R.model.window_peak_days + ' days</td><td>× ' + f.windowMult.toFixed(3) + '</td></tr>' +
    '<tr><td>Breadth · ' + r.chains.length + ' chain' + (r.chains.length === 1 ? '' : 's') + '</td><td>× ' + f.breadthMult.toFixed(3) + '</td></tr>' +
    '<tr><td><b>Implied value</b></td><td><b>' + moneyFull(r.implied_value_usd) + '</b></td></tr></table>' +
    '<p>' + pill(r.signal) + ' ' + r.flags.map((x) => '<span class="flag">' + esc(x) + '</span>').join('') + '</p>' +
    '<h3>Farm plan · 7 steps</h3><ol class="steps">' + farmSteps(r).map((s) =>
      '<li><span class="st">' + esc(s[0]) + '</span><br><span class="ct">Cost: ' + esc(s[1]) + ' · Time: ' + esc(s[2]) + '</span></li>').join('') + '</ol>';
  $('drawer').hidden = false;
  if (history.replaceState) history.replaceState(null, '', '#detail=' + r.slug);
}
$('closeDrawer').addEventListener('click', () => { $('drawer').hidden = true; if (history.replaceState) history.replaceState(null, '', '#'); });

/* ---- live tokens ---- */
$('liveRows').innerHTML = R.live.map((p) => '<tr><td><span class="name">' + esc(p.name) + '</span><br><span class="sub2">' + esc(p.slug) + '</span></td>' +
  '<td>' + esc(p.category || '—') + '</td><td class="num">' + money(p.tvl_usd) + '</td>' +
  '<td class="num">' + (p.mcap_usd === null ? '—' : money(p.mcap_usd)) + '</td>' +
  '<td class="num">' + (p.tvl_mcap === null ? '—' : p.tvl_mcap.toFixed(2) + '×') + '</td>' +
  '<td class="num ' + (p.change_7d > 0 ? 'up' : p.change_7d < 0 ? 'down' : '') + '">' + pct(p.change_7d) + '</td></tr>').join('');

/* ---- tabs ---- */
function showTab(name) {
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('on', t.dataset.tab === name));
  document.querySelectorAll('.view').forEach((v) => v.classList.toggle('on', v.id === 'view' + name[0].toUpperCase() + name.slice(1)));
}
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));

/* ---- model sandbox ---- */
function syncSliders() {
  $('oBase').textContent = $('sBase').value;
  $('oGrowth').textContent = $('sGrowth').value;
  $('oPeak').textContent = $('sPeak').value + ' days';
  $('oBreadth').textContent = $('sBreadth').value;
}
['sBase', 'sGrowth', 'sPeak', 'sBreadth'].forEach((id) => $(id).addEventListener('input', syncSliders));
syncSliders();
$('rerank').addEventListener('click', () => {
  const m = Object.assign({}, R.model, {
    base_multiple: parseFloat($('sBase').value), growth_weight: parseFloat($('sGrowth').value),
    window_peak_days: parseInt($('sPeak').value, 10), breadth_weight: parseFloat($('sBreadth').value),
  });
  const rescored = R.rows.map((r) => Object.assign({}, r, { implied_value_usd: implied(r, m).implied, signal: signalOf(implied(r, m).growthMult, r.age_days) }));
  rescored.sort((a, b) => b.implied_value_usd - a.implied_value_usd);
  rescored.forEach((r, i) => { r.rank = i + 1; });
  R.rows = rescored;
  $('sandboxNote').textContent = 'Re-ranked with base ×' + m.base_multiple + ', growth weight ' + m.growth_weight +
    ', window peak ' + m.window_peak_days + 'd, breadth ' + m.breadth_weight + '. New rank 1: ' + rescored[0].name +
    ' at ' + money(rescored[0].implied_value_usd) + '. The board tab now shows this ranking.';
  showTab('board');
  applyFilters();
});
$('resetModel').addEventListener('click', () => {
  $('sBase').value = R.model.base_multiple; $('sGrowth').value = R.model.growth_weight;
  $('sPeak').value = R.model.window_peak_days; $('sBreadth').value = R.model.breadth_weight;
  syncSliders();
  $('sandboxNote').textContent = 'Reset to sonar-1 defaults. Re-rank to apply.';
});

/* ---- deep links for screenshots: #detail=<slug>, #tab=live|model, #cat=<category>, #q=<text> ---- */
(function () {
  const h = new URLSearchParams(location.hash.slice(1));
  if (h.get('cat')) { $('cat').value = h.get('cat'); }
  if (h.get('q')) { $('q').value = h.get('q'); }
  if (h.get('tab')) showTab(h.get('tab'));
  applyFilters();
  if (h.get('detail')) openDetail(h.get('detail'));
})();
