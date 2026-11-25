[![make.fun](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![Rank](https://make.fun/badge/token-radar-01/hayunkarimun/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01)
[![Reward](https://make.fun/badge/token-radar-01/hayunkarimun/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01)

# Launch Sonar — a token launch radar

Which pre-token protocol is worth farming next, and what do I do about it?

Launch Sonar reads a sealed DefiLlama snapshot of 758 protocols and ranks every
pre-token protocol the brief's watchlist rule keeps — all 40 watchlist slugs plus
every other rankable protocol below the floor, 198 rows in all — by an implied
value derived only from the snapshot's own figures. No hardcoded list of names.

## The model (sonar-2)

```
implied = TVL × 0.18 × log-damped 7-day momentum × launch-window hump × breadth × TVL confidence
```

- **Base** — TVL × 0.18: a launch is worth a slice of the value already parked.
- **Growth** — 7-day momentum through a log curve, so one wild week (+4,448% in
  this snapshot) cannot buy the whole board.
- **Launch window** — a hump peaking at two years: too young is unproven, five
  years with no token has probably decided not to launch.
- **Breadth** — live on more chains, more surface for a token to land on.
- **Confidence** — TVL near the $50M floor is noisy (one whale can move it), so
  implied value is discounted up to 15% there, reaching full confidence only at
  $500M of TVL. Large protocols are untouched.

Rank 1 in this snapshot: Steakhouse Financial, $558.4M implied; $3.54B total.

## The dashboard

A static page, no network: a sortable, filterable board; a detail drawer per
protocol with the full model breakdown, risk flags and a 7-step farm plan with
costs and times; a live-token view kept apart from the board (the market sets
those values, not the model); and a model sandbox that re-ranks the board live
from the same figures.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) writes `board.json`, `data.js`,
`dashboard/`, `screenshots/` and `dossier.json` (via the kit's vendored
`vendor/makefun-board.ts`) to the output directory.

## Entry

Built for [make.fun's token-radar-01 bounty](https://make.fun/bounty/token-radar-01)
("Build the best token launch radar").
