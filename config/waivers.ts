// Every tunable number in the waiver scout, and nothing else. Weights are
// percentage points of the 0-100 score and must sum to 100 per position
// (score.test.ts checks). Metric meanings are in helpers/waivers/score.ts.

export type MetricKey =
  | 'targetShare'
  | 'airYardShare'
  | 'targetShareTrend'
  | 'snapShareTrend'
  | 'carryShare'
  | 'carryShareTrend'
  | 'rzOpps'
  | 'ppg'
  | 'rushing'
  | 'passAtt'
  | 'passRzAtt'
  | 'teamPassVolume'
  | 'teamRushVolume'
  | 'teamPlays'

export type Weights = Partial<Record<MetricKey, number>>

const receiver: Weights = {
  targetShare: 30,
  airYardShare: 15,
  targetShareTrend: 15,
  snapShareTrend: 15,
  rzOpps: 10,
  teamPassVolume: 10,
  ppg: 5,
}

export const waiverConfig = {
  weights: {
    WR: receiver,
    TE: receiver,
    RB: {
      carryShare: 25,
      targetShare: 15,
      snapShareTrend: 15,
      rzOpps: 15,
      carryShareTrend: 10,
      teamRushVolume: 10,
      ppg: 10,
    } as Weights,
    QB: {
      ppg: 35,
      rushing: 25,
      passAtt: 15,
      passRzAtt: 15,
      teamPlays: 10,
    } as Weights,
  },
  // Played at least this many of the team's last three games to be scored
  // normally; otherwise scored only if last game's snap share reached
  // newRoleSnap AND that game was the team's latest.
  minPlayedOfLastThree: 2,
  newRoleSnap: 0.5,
  nextManUpBonus: 15,
  // A starter with one of these statuses has left a role open.
  outStatuses: ['Out', 'IR', 'Doubtful', 'PUP', 'Sus'],
  // Multiplies a player's own score. Statuses not listed leave it unchanged.
  injuryMultipliers: {
    Questionable: 0.9,
    Doubtful: 0.6,
    Out: 0.3,
    IR: 0.3,
    PUP: 0.3,
    Sus: 0.3,
    NA: 0.3,
  } as Record<string, number>,
  flags: {
    snapSurge: 0.2,
    targetHogReceiver: 0.2,
    targetHogRb: 0.12,
    workhorse: 0.5,
    buyLowAirShare: 0.25,
    redZoneOpps: 2,
  },
  // K and DEF streaming weights (each set sums to 100).
  streaming: {
    defTakeaways: 40, // own sacks + INTs + fumble recoveries per game
    defPointsAllowed: 30, // fewer is better
    defOpponentGiveaways: 30, // next opponent's sacks taken + INTs + fumbles lost per game
    kFieldGoalAttempts: 50, // team FGA per game
    kStalledDrives: 30, // team red-zone trips without a TD per game
    kPlays: 20, // team plays per game
  },
  topN: 25,
  upgradeMargin: 10,
}

export type WaiverConfig = typeof waiverConfig
