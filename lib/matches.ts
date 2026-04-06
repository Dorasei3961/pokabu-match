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
   * 「この人が誰と当たったことがあるか」のMapを作る
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
  
  /**
   * 未対戦優先で2人ずつペアを作る
   * どうしても候補がいない時だけ再戦OK
   */
  function buildPairsAvoidRematch(
    players: Participant[],
    playedMap: Map<string, Set<string>>
  ): [Participant, Participant | null][] {
    const remaining = [...players].sort(() => Math.random() - 0.5);
    const pairs: [Participant, Participant | null][] = [];
  
    while (remaining.length > 0) {
      const player1 = remaining.shift()!;
  
      if (remaining.length === 0) {
        pairs.push([player1, null]);
        break;
      }
  
      const playedSet = playedMap.get(player1.id) ?? new Set<string>();
  
      let opponentIndex = remaining.findIndex(
        (candidate) => !playedSet.has(candidate.id)
      );
  
      // 全員と対戦済みなら、先頭の人と組む
      if (opponentIndex === -1) {
        opponentIndex = 0;
      }
  
      const player2 = remaining.splice(opponentIndex, 1)[0];
      pairs.push([player1, player2]);
    }
    return pairs;
}

/**
 * 過去のmatches取得
 */
async function getPastMatches(eventId: string): Promise<Match[]> {
  const snap = await getDocs(collection(db, "events", eventId, "matches"));

  return snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as Match[];
}

/**
 * 現在進行中の対戦数確認
 */
export async function getActiveMatchesCount(eventId: string): Promise<number> {
  const q = query(
    collection(db, "events", eventId, "matches"),
    where("status", "in", ["scheduled", "playing"])
  );

  const snap = await getDocs(q);
  return snap.size;
}

/**
 * 交流会マッチ開始
 * waitingの参加者だけを使ってmatchesを作る
 * 基本は未対戦優先
 */
export async function startCasualMatches(eventId: string) {
  const waitingParticipants = await getWaitingParticipants(eventId);

  if (waitingParticipants.length < 2) {
    throw new Error("待機中の参加者が2人未満です");
  }

  const pastMatches = await getPastMatches(eventId);
  const playedMap = buildPlayedMap(pastMatches);
  const pairs = buildPairsAvoidRematch(waitingParticipants, playedMap);

  const createdMatchIds: string[] = [];

  for (const [player1, player2] of pairs) {
    if (!player1 || !player2) {
      // 奇数なら最後の1人はwaitingのまま
      continue;
    }

    const matchData: Omit<Match, "id"> = {
      eventId,
      player1Id: player1.id,
      player1Name: player1.name,
      player2Id: player2.id,
      player2Name: player2.name,
      status: "playing",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    const docRef = await addDoc(
      collection(db, "events", eventId, "matches"),
      matchData
    );

    createdMatchIds.push(docRef.id);

    await updateParticipantStatus(eventId, player1.id, "playing", docRef.id);
    await updateParticipantStatus(eventId, player2.id, "playing", docRef.id);
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