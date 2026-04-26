import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Match, Participant } from "@/lib/types";
import type { PlayStyleKey } from "@/lib/playerBadges";
import {
  getWaitingParticipants,
  updateParticipantStatus,
  setParticipantBackToWaiting,
} from "@/lib/participants";

/**
 * 交流会マッチング条件は **既存仕様を維持**する。
 * - 再戦回避・待機時間・`playStyle` 由来の軸（serious / enjoy 系）・階級・ランダムなどは本ファイルの実装どおり。
 * - `players.badge`（特別属性／アプリの `specialBadge`）は **完全に表示専用**。マッチング・抽選・優先度には一切使わない。
 * - `players.playerAttributes` の **`beginner`** は、**両者とも**付いているペアに `beginner` 軸スコア 1（運営の優先順位設定で効く）。
 *   それ以外の属性 id を増やしても **自動ではマッチングに入らない**（変更時はここを明示的に更新すること）。
 */

/**
 * 過去対戦履歴から
 * 誰が誰と当たったことがあるかを作る
 */
function buildPlayedMap(matches: Match[]): Map<string, Set<string>> {
  const playedMap = new Map<string, Set<string>>();

  for (const match of matches) {
    const p1 = match.player1Id;
    const p2 = match.player2Id;

    if (!p1 || !p2) continue;

    if (!playedMap.has(p1)) {
      playedMap.set(p1, new Set());
    }
    if (!playedMap.has(p2)) {
      playedMap.set(p2, new Set());
    }

    playedMap.get(p1)!.add(p2);
    playedMap.get(p2)!.add(p1);
  }

  return playedMap;
}

/** DB の階級ラベル（players.rank） */
const RANK_LABELS_JA = [
  "モンスターボール級",
  "スーパーボール級",
  "ハイパーボール級",
] as const;

function bucketRankJa(p: Participant): string {
  return casualMatchBucketRank(String((p as { rank?: unknown }).rank ?? ""));
}

/** 個人ページ・スコア計算用に公開 */
export function casualMatchBucketRank(rank: string | undefined | null): string {
  const r = String(rank ?? "").trim();
  if (RANK_LABELS_JA.includes(r as (typeof RANK_LABELS_JA)[number])) return r;
  return "その他";
}

/**
 * 交流会：相手選びの優先度（大きいほど望ましい）
 * - 階級ON + 再戦回避ON: 同階級未対戦 > 同階級対戦済 > 他階級未対戦 > 他階級対戦済
 * - 階級ON + 再戦回避OFF: 同階級 > 他階級
 * - 階級OFF + 再戦回避ON: 未対戦 > 対戦済
 * - 両方OFF: 使わない（完全ランダム）
 */
function matchPriorityScore(
  sameRank: boolean,
  past: boolean,
  rankPriority: boolean,
  avoidRematch: boolean
): number {
  if (!rankPriority && !avoidRematch) return 0;
  if (rankPriority && avoidRematch) {
    if (sameRank && !past) return 40;
    if (sameRank && past) return 30;
    if (!sameRank && !past) return 20;
    return 10;
  }
  if (rankPriority && !avoidRematch) {
    return sameRank ? 20 : 10;
  }
  if (!rankPriority && avoidRematch) {
    return past ? 10 : 20;
  }
  return 0;
}

function normalizePlayStyleLoose(v: unknown): PlayStyleKey {
  if (v === "serious" || v === "enjoy" || v === "both") return v;
  return "enjoy";
}

/**
 * `playerAttributes` に `beginner` が含まれるか（特別属性 `badge` とは無関係）。
 * 主催・運営・初参加・常連などの特別属性（`specialBadge`／`players.badge`）は表示専用でマッチングに一切反映しない。
 */
function hasBeginnerBadge(v: unknown): boolean {
  if (!Array.isArray(v)) return false;
  return v.includes("beginner");
}

function timestampToMs(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (v instanceof Date) return v.getTime();
  if (
    typeof v === "object" &&
    v !== null &&
    "toMillis" in v &&
    typeof (v as { toMillis: unknown }).toMillis === "function"
  ) {
    try {
      return (v as { toMillis: () => number }).toMillis();
    } catch {
      return null;
    }
  }
  if (
    typeof v === "object" &&
    v !== null &&
    "seconds" in v &&
    typeof (v as { seconds: unknown }).seconds === "number"
  ) {
    return (v as { seconds: number }).seconds * 1000;
  }
  return null;
}

function waitingSinceMsOf(p: {
  waitingSince?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
}): number {
  return (
    timestampToMs(p.waitingSince) ??
    timestampToMs(p.updatedAt) ??
    timestampToMs(p.createdAt) ??
    0
  );
}

function compareWaitingLongerFirst(
  a: { waitingSince?: unknown; updatedAt?: unknown; createdAt?: unknown },
  b: { waitingSince?: unknown; updatedAt?: unknown; createdAt?: unknown }
): number {
  return waitingSinceMsOf(a) - waitingSinceMsOf(b);
}

function isSeriousPriorityPair(a: PlayStyleKey, b: PlayStyleKey): boolean {
  return (
    (a === "serious" && (b === "serious" || b === "both")) ||
    (b === "serious" && (a === "serious" || a === "both"))
  );
}

function isEnjoyPriorityPair(a: PlayStyleKey, b: PlayStyleKey): boolean {
  return (
    (a === "enjoy" && (b === "enjoy" || b === "both")) ||
    (b === "enjoy" && (a === "enjoy" || a === "both"))
  );
}

type MatchPriorityAxis = "tournament" | "beginner" | "enjoy" | "rank";

/**
 * 交流会：③〜⑥ 軸のペアスコア（各 0 または 1）。
 * `matchPriorityOrder` の並びで辞書式比較される（①再戦回避 ②待機時間のあと）。
 */
function casualPairAxisScores(
  playStyleA: PlayStyleKey,
  playStyleB: PlayStyleKey,
  attrsA: unknown,
  attrsB: unknown,
  sameRank: boolean,
  rankPriority: boolean
): Record<MatchPriorityAxis, number> {
  return {
    tournament: isSeriousPriorityPair(playStyleA, playStyleB) ? 1 : 0,
    beginner: hasBeginnerBadge(attrsA) && hasBeginnerBadge(attrsB) ? 1 : 0,
    enjoy: isEnjoyPriorityPair(playStyleA, playStyleB) ? 1 : 0,
    rank: rankPriority && sameRank ? 1 : 0,
  };
}
const DEFAULT_MATCH_PRIORITY_ORDER: MatchPriorityAxis[] = [
  "tournament",
  "beginner",
  "enjoy",
  "rank",
];

function normalizeMatchPriorityOrder(v: unknown): MatchPriorityAxis[] {
  if (!Array.isArray(v)) return [...DEFAULT_MATCH_PRIORITY_ORDER];
  const used = new Set<MatchPriorityAxis>();
  const ordered: MatchPriorityAxis[] = [];
  for (const x of v) {
    const axis =
      x === "serious"
        ? "tournament"
        : x === "tournament" || x === "beginner" || x === "enjoy" || x === "rank"
          ? x
          : null;
    if (!axis || used.has(axis)) continue;
    used.add(axis);
    ordered.push(axis);
  }
  if (ordered.length !== DEFAULT_MATCH_PRIORITY_ORDER.length) {
    return [...DEFAULT_MATCH_PRIORITY_ORDER];
  }
  return ordered;
}

/** 未使用経路 `chooseBestOpponent` 用の単一スカラー（軸の重みはデフォルト順に合わせた固定） */
function buildPriorityScore(
  self: {
    rank?: unknown;
    playStyle?: unknown;
    playerAttributes?: unknown;
  },
  other: {
    rank?: unknown;
    playStyle?: unknown;
    playerAttributes?: unknown;
    waitingSince?: unknown;
    updatedAt?: unknown;
    createdAt?: unknown;
  },
  rankPriority: boolean
): number {
  const selfStyle = normalizePlayStyleLoose(self.playStyle);
  const otherStyle = normalizePlayStyleLoose(other.playStyle);
  const sameRank =
    casualMatchBucketRank(String(self.rank ?? "")) ===
    casualMatchBucketRank(String(other.rank ?? ""));
  const ax = casualPairAxisScores(
    selfStyle,
    otherStyle,
    self.playerAttributes,
    other.playerAttributes,
    sameRank,
    rankPriority
  );
  return (
    ax.tournament * 1_000_000 +
    ax.beginner * 100_000 +
    ax.enjoy * 10_000 +
    ax.rank * 1_000
  );
}

function chooseBestOpponent<T extends {
  id: string;
  name?: string;
  rank?: unknown;
  playStyle?: unknown;
  playerAttributes?: unknown;
  waitingSince?: unknown;
  updatedAt?: unknown;
  createdAt?: unknown;
}>(
  self: Participant,
  candidates: T[],
  playedSet: Set<string>,
  rankPriority: boolean,
  avoidRematch: boolean
): T | null {
  if (candidates.length === 0) return null;
  const usableCandidates =
    avoidRematch && candidates.some((c) => !playedSet.has(c.id))
      ? candidates.filter((c) => !playedSet.has(c.id))
      : candidates;

  console.log("[casual-match] candidate-scan:start", {
    self: {
      id: self.id,
      name: self.name,
      rank: String(self.rank ?? ""),
      playStyle: normalizePlayStyleLoose(self.playStyle),
      beginner: hasBeginnerBadge(self.playerAttributes),
      waitingSinceMs: waitingSinceMsOf(self),
    },
    avoidRematch,
    rankPriority,
    candidateCount: usableCandidates.length,
    candidates: usableCandidates.map((c) => ({
      id: c.id,
      name: c.name ?? "",
      rank: String(c.rank ?? ""),
      playStyle: normalizePlayStyleLoose(c.playStyle),
      beginner: hasBeginnerBadge(c.playerAttributes),
      waitingSinceMs: waitingSinceMsOf(c),
      past: playedSet.has(c.id),
      seriousPair: isSeriousPriorityPair(
        normalizePlayStyleLoose(self.playStyle),
        normalizePlayStyleLoose(c.playStyle)
      ),
      enjoyPair: isEnjoyPriorityPair(
        normalizePlayStyleLoose(self.playStyle),
        normalizePlayStyleLoose(c.playStyle)
      ),
      sameRank:
        casualMatchBucketRank(String(self.rank ?? "")) ===
        casualMatchBucketRank(String(c.rank ?? "")),
      score: buildPriorityScore(self, c, rankPriority),
    })),
  });

  let best: T | null = null;
  let bestScore = -Infinity;
  for (const c of usableCandidates) {
    const score = buildPriorityScore(self, c, rankPriority);
    if (
      score > bestScore ||
      (score === bestScore &&
        (!best || waitingSinceMsOf(c) < waitingSinceMsOf(best))) ||
      (score === bestScore &&
        best &&
        waitingSinceMsOf(c) === waitingSinceMsOf(best) &&
        Math.random() < 0.5)
    ) {
      best = c;
      bestScore = score;
    }
  }
  console.log("[casual-match] candidate-scan:chosen", {
    self: { id: self.id, name: self.name },
    chosen: best ? { id: best.id, name: best.name ?? "", score: bestScore } : null,
  });
  return best;
}

/**
 * 交流会：待機者からペアを作る（各イテレーションで残り全組から1組を選ぶ）。
 *
 * 比較は `bestKey` の辞書式（大きいほど望ましい）。実効の優先順位は次のとおり。
 * 1. 再戦回避（`avoidRematch` ON・待機者のうち **未対戦のペアが1組でも残る間** は対戦済ペアを候補から除外。未対戦が尽きたら再戦あり。運営 UI のトグル名は「再戦回避」）
 * 2. 待機時間（`waitMin`/`waitMax` 相当：`older = -min(wa, wb)` で **より長く待っている方**（`waitingSince` がより早い時刻）ほど有利、同点なら `secondOlder = -max(wa, wb)`。時刻は `waitingSinceMsOf`＝`waitingSince` → `updatedAt` → `createdAt` → 0。運営 UI の「待機時間」）
 * 3. 🔥大会前調整（`tournament` 軸・serious 同士系ペアで 1）
 * 4. 🔰初心者（`beginner` 軸・**両者** `playerAttributes` に `beginner` で 1）
 * 5. ⭐エンジョイ（`enjoy` 軸・enjoy 同士系ペアで 1）
 * 6. 同階級（`rank` 軸・`rankPriority` ON かつ同バケットで 1）
 * 7. ランダム
 */
function buildOrderedPairs(
  participants: Participant[],
  playedMap: Map<string, Set<string>>,
  rankPriority: boolean,
  avoidRematch: boolean,
  matchPriorityOrder?: MatchPriorityAxis[]
): [Participant, Participant][] {
  const pairs: [Participant, Participant][] = [];
  const remaining = [...participants].sort(compareWaitingLongerFirst);
  const dynamicOrder = normalizeMatchPriorityOrder(matchPriorityOrder);
  const keyOrder = [
    "waitMin",
    "waitMax",
    ...dynamicOrder,
    "rand",
  ] as const;
  type PairKey = number[];
  const comparePairKey = (a: PairKey, b: PairKey): number => {
    for (let i = 0; i < keyOrder.length; i++) {
      if (a[i] > b[i]) return 1;
      if (a[i] < b[i]) return -1;
    }
    return 0;
  };
  const explainDecision = (winner: PairKey, runnerUp: PairKey | null): string => {
    if (!runnerUp) return "single-candidate-after-rematch-filter";
    const diffIdx = keyOrder.findIndex((_, idx) => winner[idx] !== runnerUp[idx]);
    if (diffIdx < 0) return "all-axes-tied-random-picked";
    return `${keyOrder[diffIdx]} decided (${winner[diffIdx]} > ${runnerUp[diffIdx]})`;
  };

  console.log("[casual-match] pairing:start", {
    rankPriority,
    avoidRematch,
    matchPriorityOrder: dynamicOrder,
    order: remaining.map((p) => ({
      id: p.id,
      name: p.name,
      rank: String(p.rank ?? ""),
      playStyle: normalizePlayStyleLoose(p.playStyle),
      beginner: hasBeginnerBadge(p.playerAttributes),
      waitingSinceMs: waitingSinceMsOf(p),
    })),
  });

  const isPastPair = (a: Participant, b: Participant): boolean =>
    (playedMap.get(a.id) ?? new Set<string>()).has(b.id);

  while (remaining.length >= 2) {
    const nonPastExists = !avoidRematch
      ? false
      : remaining.some((a, i) =>
          remaining.slice(i + 1).some((b) => !isPastPair(a, b))
        );

    let bestI = -1;
    let bestJ = -1;
    let bestKey: PairKey | null = null;
    let runnerUpKey: PairKey | null = null;
    let totalCandidates = 0;
    let filteredByRematch = 0;

    for (let i = 0; i < remaining.length - 1; i++) {
      for (let j = i + 1; j < remaining.length; j++) {
        totalCandidates++;
        const a = remaining[i];
        const b = remaining[j];
        const past = isPastPair(a, b);
        if (avoidRematch && nonPastExists && past) {
          filteredByRematch++;
          continue;
        }

        const aStyle = normalizePlayStyleLoose(a.playStyle);
        const bStyle = normalizePlayStyleLoose(b.playStyle);
        const sameRank =
          casualMatchBucketRank(String(a.rank ?? "")) ===
          casualMatchBucketRank(String(b.rank ?? ""));

        const axisScore = casualPairAxisScores(
          aStyle,
          bStyle,
          a.playerAttributes,
          b.playerAttributes,
          sameRank,
          rankPriority
        );

        const wa = waitingSinceMsOf(a);
        const wb = waitingSinceMsOf(b);
        const older = -Math.min(wa, wb);
        const secondOlder = -Math.max(wa, wb);
        const rand = Math.random();
        const key: PairKey = [older, secondOlder];
        for (const axis of dynamicOrder) key.push(axisScore[axis]);
        key.push(rand);

        if (!bestKey || comparePairKey(key, bestKey) > 0) {
          runnerUpKey = bestKey;
          bestI = i;
          bestJ = j;
          bestKey = key;
        } else if (!runnerUpKey || comparePairKey(key, runnerUpKey) > 0) {
          runnerUpKey = key;
        }
      }
    }

    if (bestI < 0 || bestJ < 0 || !bestKey) break;
    const p2 = remaining.splice(bestJ, 1)[0];
    const p1 = remaining.splice(bestI, 1)[0];
    pairs.push([p1, p2]);

    console.log("[casual-match] pairing:paired", {
      pair: [
        {
          id: p1.id,
          name: p1.name,
          playStyle: normalizePlayStyleLoose(p1.playStyle),
          beginner: hasBeginnerBadge(p1.playerAttributes),
        },
        {
          id: p2.id,
          name: p2.name,
          playStyle: normalizePlayStyleLoose(p2.playStyle),
          beginner: hasBeginnerBadge(p2.playerAttributes),
        },
      ],
      bothUsage:
        normalizePlayStyleLoose(p1.playStyle) === "both"
          ? {
              bothPlayer: p1.name,
              usedFor:
                normalizePlayStyleLoose(p2.playStyle) === "serious"
                  ? "serious"
                  : normalizePlayStyleLoose(p2.playStyle) === "enjoy"
                    ? "enjoy"
                    : "both",
            }
          : normalizePlayStyleLoose(p2.playStyle) === "both"
            ? {
                bothPlayer: p2.name,
                usedFor:
                  normalizePlayStyleLoose(p1.playStyle) === "serious"
                    ? "serious"
                    : normalizePlayStyleLoose(p1.playStyle) === "enjoy"
                      ? "enjoy"
                      : "both",
              }
            : null,
      rematchGuard: {
        enabled: avoidRematch,
        nonPastExists,
        totalCandidates,
        filteredByRematch,
      },
      keyOrder,
      priorityKey: bestKey,
      key: bestKey,
      decisionReason: explainDecision(bestKey, runnerUpKey),
      runnerUpKey,
    });
  }

  return pairs;
}

function pairQuality(
  p1: Participant,
  p2: Participant,
  playedMap: Map<string, Set<string>>,
  rankPriority: boolean,
  avoidRematch: boolean,
  ignoreRank: boolean
): number {
  const sameRank = ignoreRank ? true : bucketRankJa(p1) === bucketRankJa(p2);
  const past = (playedMap.get(p1.id) ?? new Set<string>()).has(p2.id);
  return matchPriorityScore(sameRank, past, rankPriority, avoidRematch);
}

function shuffleInPlace<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildCasualPairs(
  participants: Participant[],
  playedMap: Map<string, Set<string>>,
  rankPriority: boolean,
  avoidRematch: boolean,
  matchPriorityOrder?: MatchPriorityAxis[]
): [Participant, Participant][] {
  return buildOrderedPairs(
    participants,
    playedMap,
    rankPriority,
    avoidRematch,
    matchPriorityOrder
  );
}

export type StartCasualMatchesOptions = {
  rankPriority?: boolean;
  /** 未指定時は true（未対戦を優先） */
  avoidRematch?: boolean;
  /**
   * 互換のため残す。軸スコア（tournament / enjoy）はこのフラグに依存せず常に 0/1 を付与する。
   * @deprecated 新規コードでは `matchPriorityOrder` の並びで調整すること。
   */
  playStylePriority?: boolean;
  /** ③〜⑥の比較順。未指定時は tournament→beginner→enjoy→rank（各軸 0/1・`specialBadge` はマッチング未使用） */
  matchPriorityOrder?: MatchPriorityAxis[];
};

/** 個人ページ「次の対戦」用：待機候補から1人選ぶ */
export function pickBestWaitingOpponentForCasual(
  selfRank: string,
  selfPlayStyle: PlayStyleKey,
  selfPlayerAttributes: string[],
  candidates: {
    id: string;
    name: string;
    rank?: string;
    playStyle?: PlayStyleKey;
    playerAttributes?: string[];
    waitingSince?: unknown;
  }[],
  pastOpponentIds: Set<string>,
  rankPriority: boolean,
  avoidRematch: boolean,
  matchPriorityOrder?: MatchPriorityAxis[]
): { id: string; name: string; rank: string } | null {
  if (candidates.length === 0) return null;

  const hasNonPast = candidates.some((c) => !pastOpponentIds.has(c.id));
  const usableCandidates =
    avoidRematch && hasNonPast
      ? candidates.filter((c) => !pastOpponentIds.has(c.id))
      : candidates;
  const dynamicOrder = normalizeMatchPriorityOrder(matchPriorityOrder);
  const keyOrder = ["wait", ...dynamicOrder] as const;
  type NextKey = number[];
  const compareNextKey = (a: NextKey, b: NextKey): number => {
    for (let i = 0; i < keyOrder.length; i++) {
      if (a[i] > b[i]) return 1;
      if (a[i] < b[i]) return -1;
    }
    return 0;
  };
  const explainDecision = (winner: NextKey, runnerUp: NextKey | null): string => {
    if (!runnerUp) return "single-candidate-after-rematch-filter";
    const diffIdx = keyOrder.findIndex((_, idx) => winner[idx] !== runnerUp[idx]);
    if (diffIdx < 0) return "all-axes-tied-random-picked";
    return `${keyOrder[diffIdx]} decided (${winner[diffIdx]} > ${runnerUp[diffIdx]})`;
  };

  const selfStyle = normalizePlayStyleLoose(selfPlayStyle);
  const selfRankBucket = casualMatchBucketRank(String(selfRank ?? ""));
  const candidateRows = usableCandidates.map((c) => {
    const cStyle = normalizePlayStyleLoose(c.playStyle);
    const sameRankBucket =
      selfRankBucket === casualMatchBucketRank(String(c.rank ?? ""));
    const axisScore = casualPairAxisScores(
      selfStyle,
      cStyle,
      selfPlayerAttributes,
      c.playerAttributes ?? [],
      sameRankBucket,
      rankPriority
    );
    const priorityKey: NextKey = [-waitingSinceMsOf(c)];
    for (const axis of dynamicOrder) priorityKey.push(axisScore[axis]);
    return {
      id: c.id,
      name: c.name ?? "",
      rank: String(c.rank ?? ""),
      playStyle: cStyle,
      beginner: hasBeginnerBadge(c.playerAttributes),
      waitingSinceMs: waitingSinceMsOf(c),
      past: pastOpponentIds.has(c.id),
      axisScore,
      priorityKey,
      tieBreakRandom: Math.random(),
      original: c,
    };
  });

  console.log("[casual-match-next] candidate-scan:start", {
    self: {
      rank: String(selfRank ?? ""),
      rankBucket: selfRankBucket,
      playStyle: selfStyle,
      beginner: hasBeginnerBadge(selfPlayerAttributes),
    },
    avoidRematch,
    rematchFilterApplied: avoidRematch && hasNonPast,
    rankPriority,
    matchPriorityOrder: dynamicOrder,
    keyOrder,
    waitingCandidates: candidateRows.map((row) => ({
      id: row.id,
      name: row.name,
      rank: row.rank,
      playStyle: row.playStyle,
      beginner: row.beginner,
      waitingSinceMs: row.waitingSinceMs,
      past: row.past,
      axisScore: row.axisScore,
      priorityKey: row.priorityKey,
    })),
  });

  let best: (typeof candidates)[number] | null = null;
  let bestKey: NextKey | null = null;
  let runnerUpKey: NextKey | null = null;

  for (const row of candidateRows) {
    const key = row.priorityKey;
    if (
      !bestKey ||
      compareNextKey(key, bestKey) > 0 ||
      (bestKey &&
        compareNextKey(key, bestKey) === 0 &&
        row.tieBreakRandom < 0.5)
    ) {
      runnerUpKey = bestKey;
      bestKey = key;
      best = row.original;
    } else if (!runnerUpKey || compareNextKey(key, runnerUpKey) > 0) {
      runnerUpKey = key;
    }
  }

  if (!best) return null;

  console.log("[casual-match-next] candidate-scan:chosen", {
    chosen: {
      id: best.id,
      name: best.name ?? "",
      rank: String(best.rank ?? ""),
    },
    keyOrder,
    priorityKey: bestKey,
    decisionReason: bestKey ? explainDecision(bestKey, runnerUpKey) : "none",
    runnerUpKey,
  });

  return {
    id: best.id,
    name: best.name || "",
    rank: String(best.rank ?? "").trim() || "—",
  };
}
function isCasualFlatMatchDoc(data: Record<string, unknown>): boolean {
  if (Array.isArray(data.tables)) return false;
  const mt = data.matchType;
  if (mt === "tournament_individual") return false;
  if (
    mt === "individual-swiss" ||
    mt === "rank-priority" ||
    mt === "full-random" ||
    mt === "team-random"
  ) {
    return false;
  }
  return mt === "casual" || mt == null;
}

/**
 * 交流会ペアリング用：卓単位の交流会マッチのみ（大会用フラット卓・集約ドキュメントは除外）
 */
async function getPastMatches(eventId: string): Promise<Match[]> {
  const snap = await getDocs(collection(db, "events", eventId, "matches"));

  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((row) => isCasualFlatMatchDoc(row as Record<string, unknown>)) as Match[];
}

/**
 * 現在進行中の対戦数確認
 */
export async function getActiveMatchesCount(eventId: string): Promise<number> {
  const q = query(
    collection(db, "events", eventId, "matches"),
    where("status", "==", "playing")
  );

  const snap = await getDocs(q);
  return snap.docs.filter((d) =>
    isCasualFlatMatchDoc(d.data() as Record<string, unknown>)
  ).length;
}

/**
 * 再利用できる卓番号を返す
 * 過去に使われた卓番号のうち、現在 playing で使っていない卓を再利用
 */
function getReusableTableNumbers(matches: Match[]): number[] {
  const usedTableNumbers = new Set(
    matches
      .map((m) => m.tableNumber)
      .filter((n) => typeof n === "number")
  );
  const playingTableNumbers = new Set(
    matches
      .filter((m) => m.status === "playing")
      .map((m) => m.tableNumber)
      .filter((n) => typeof n === "number")
  );

  return Array.from(usedTableNumbers)
    .filter((n) => !playingTableNumbers.has(n))
    .sort((a, b) => a - b);
}

/**
 * 新規卓番号の開始値
 */
function getNextNewTableNumber(matches: Match[]): number {
  if (matches.length === 0) return 1;

  const numbers = matches
    .map((m) => m.tableNumber)
    .filter((n) => typeof n === "number");

  if (numbers.length === 0) return 1;

  return Math.max(...numbers) + 1;
}

export async function getNextAvailableTableNumber(eventId: string): Promise<number> {
  const pastMatches = await getPastMatches(eventId);
  const reusableTableNumbers = getReusableTableNumbers(pastMatches);
  if (reusableTableNumbers.length > 0) {
    return reusableTableNumbers[0];
  }
  return getNextNewTableNumber(pastMatches);
}
/**
 * 交流会マッチ開始
 * waiting の参加者だけを使って matches を作る
 * 基本は未対戦優先
 * 卓番号は「終了した卓を再利用」
 *
 * 各ペアについて `addDoc` 直前に `players` を再取得し、削除済み・待機以外はスキップする（削除参加者をマッチング対象にしない）。
 */
export async function startCasualMatches(
  eventId: string,
  options?: StartCasualMatchesOptions
) {
  const rankPriority = options?.rankPriority === true;
  const avoidRematch = options?.avoidRematch !== false;
  const playStylePriority = options?.playStylePriority === true;
  const matchPriorityOrder = normalizeMatchPriorityOrder(options?.matchPriorityOrder);

  const waitingParticipants = await getWaitingParticipants(eventId);
  console.log(
    "[startCasualMatches] waitingParticipants(before pairing):",
    waitingParticipants.map((p) => ({
      id: p.id,
      name: p.name,
      status: p.status,
      currentMatchId: p.currentMatchId ?? null,
      rank: bucketRankJa(p),
    })),
    { rankPriority, avoidRematch, playStylePriority, matchPriorityOrder }
  );
  if (waitingParticipants.length < 2) {
    throw new Error("待機中の参加者が2人未満です");
  }

  const pastMatches = await getPastMatches(eventId);
  const playedMap = buildPlayedMap(pastMatches);

  const pairs = buildCasualPairs(
    waitingParticipants,
    playedMap,
    rankPriority,
    avoidRematch,
    matchPriorityOrder
  );

  const reusableTableNumbers = getReusableTableNumbers(pastMatches);
  let nextNewTableNumber = getNextNewTableNumber(pastMatches);

  const createdMatchIds: string[] = [];

  for (const [player1, player2] of pairs) {
    if (!player1 || !player2) {
      continue;
    }
    console.log("[startCasualMatches] pair(before addDoc):", {
      player1Id: player1.id,
      player1Name: player1.name,
      player2Id: player2.id,
      player2Name: player2.name,
    });

    const player1Name =
      typeof player1.name === "string" ? player1.name.trim() : "";
    const player2Name =
      typeof player2.name === "string" ? player2.name.trim() : "";

    if (!player1Name || !player2Name) {
      console.error("[startCasualMatches] invalid participant name. skipped.", {
        player1Id: player1.id,
        player1Name: player1.name,
        player2Id: player2.id,
        player2Name: player2.name,
      });
      continue;
    }

    const [live1, live2] = await Promise.all([
      getDoc(doc(db, "players", player1.id)),
      getDoc(doc(db, "players", player2.id)),
    ]);
    if (!live1.exists() || !live2.exists()) {
      console.warn("[startCasualMatches] skip pair: player document missing", {
        player1Id: player1.id,
        player2Id: player2.id,
      });
      continue;
    }
    const s1 = live1.data().status;
    const s2 = live2.data().status;
    if (s1 !== "waiting" || s2 !== "waiting") {
      console.warn("[startCasualMatches] skip pair: not both waiting", {
        player1Id: player1.id,
        status1: s1,
        player2Id: player2.id,
        status2: s2,
      });
      continue;
    }

    const tableNumber =
      reusableTableNumbers.length > 0
        ? reusableTableNumbers.shift()!
        : nextNewTableNumber++;
    const safeTableNumber = Math.max(1, tableNumber);

    const matchData: Omit<Match, "id"> = {
      eventId,
      matchType: "casual",
      player1Id: player1.id,
      player1Name,
      player2Id: player2.id,
      player2Name,
      tableNumber: safeTableNumber,
      status: "playing",
      player1GoodSent: false,
      player2GoodSent: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(
      collection(db, "events", eventId, "matches"),
      matchData
    );

    await updateParticipantStatus(eventId, player1.id, "playing", docRef.id);
    await updateParticipantStatus(eventId, player2.id, "playing", docRef.id);

    createdMatchIds.push(docRef.id);
  }

  return createdMatchIds;
}

/**
 * 試合終了
 */
export async function finishMatch(
  eventId: string,
  matchId: string,
  player1Id: string,
  player2Id: string
) {
  const ref = doc(db, "events", eventId, "matches", matchId);

  await updateDoc(ref, {
    status: "finished",
    updatedAt: serverTimestamp(),
  });

  await setParticipantBackToWaiting(eventId, player1Id);
  await setParticipantBackToWaiting(eventId, player2Id);
}