import {
  addDoc,
  collection,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Match, Participant } from "@/lib/types";
import {
  getWaitingParticipants,
  updateParticipantStatus,
  setParticipantBackToWaiting,
} from "@/lib/participants";

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

function buildCasualPairs(
  participants: Participant[],
  playedMap: Map<string, Set<string>>,
  rankPriority: boolean,
  avoidRematch: boolean
): [Participant, Participant][] {
  const pairs: [Participant, Participant][] = [];

  if (!rankPriority && !avoidRematch) {
    const shuffled = [...participants].sort(() => Math.random() - 0.5);
    const rem = [...shuffled];
    while (rem.length >= 2) {
      pairs.push([rem.shift()!, rem.shift()!]);
    }
    return pairs;
  }

  const remaining = [...participants].sort(() => Math.random() - 0.5);
  while (remaining.length >= 2) {
    const p1 = remaining.shift()!;
    const playedSet = playedMap.get(p1.id) ?? new Set<string>();
    let bestI = 0;
    let bestScore = -Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const p2 = remaining[i];
      const sameRank = bucketRankJa(p1) === bucketRankJa(p2);
      const past = playedSet.has(p2.id);
      const sc = matchPriorityScore(
        sameRank,
        past,
        rankPriority,
        avoidRematch
      );
      if (sc > bestScore || (sc === bestScore && Math.random() < 0.5)) {
        bestScore = sc;
        bestI = i;
      }
    }
    const p2 = remaining.splice(bestI, 1)[0];
    pairs.push([p1, p2]);
  }

  return pairs;
}

export type StartCasualMatchesOptions = {
  rankPriority?: boolean;
  /** 未指定時は true（未対戦を優先） */
  avoidRematch?: boolean;
};

/** 個人ページ「次の対戦」用：待機候補から1人選ぶ */
export function pickBestWaitingOpponentForCasual(
  selfRank: string,
  candidates: { id: string; name: string; rank?: string }[],
  pastOpponentIds: Set<string>,
  rankPriority: boolean,
  avoidRematch: boolean
): { id: string; name: string; rank: string } | null {
  if (candidates.length === 0) return null;

  if (!rankPriority && !avoidRematch) {
    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const pick = shuffled[0];
    return {
      id: pick.id,
      name: pick.name || "",
      rank: String(pick.rank ?? "").trim() || "—",
    };
  }

  const selfBucket = casualMatchBucketRank(selfRank);
  let best = candidates[0];
  let bestScore = -Infinity;

  for (const c of candidates) {
    const otherBucket = casualMatchBucketRank(c.rank);
    const sameRank = selfBucket === otherBucket;
    const past = pastOpponentIds.has(c.id);
    const sc = matchPriorityScore(
      sameRank,
      past,
      rankPriority,
      avoidRematch
    );
    if (sc > bestScore || (sc === bestScore && Math.random() < 0.5)) {
      bestScore = sc;
      best = c;
    }
  }

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
 */
export async function startCasualMatches(
  eventId: string,
  options?: StartCasualMatchesOptions
) {
  const rankPriority = options?.rankPriority === true;
  const avoidRematch = options?.avoidRematch !== false;

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
    { rankPriority, avoidRematch }
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
    avoidRematch
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