import {
    addDoc,
    collection,
    getDocs,
    query,
    serverTimestamp,
    where,
  } from "firebase/firestore";
  import { db } from "@/lib/firebase";
  import type { Match } from "@/lib/types";
  import {
    getWaitingParticipants,
    updateParticipantStatus,
  } from "@/lib/participants";
  
  /**
   * 2人ずつペアを作る
   * まずはシンプルな交流会マッチ用
   */
  function buildPairs<T>(items: T[]): [T, T | null][] {
    const shuffled = [...items].sort(() => Math.random() - 0.5);
    const pairs: [T, T | null][] = [];
  
    for (let i = 0; i < shuffled.length; i += 2) {
      pairs.push([shuffled[i], shuffled[i + 1] ?? null]);
    }
  
    return pairs;
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
   */
  export async function startCasualMatches(eventId: string) {
    const waitingParticipants = await getWaitingParticipants(eventId);
  
    if (waitingParticipants.length < 2) {
      throw new Error("待機中の参加者が2人未満です");
    }
  
    const pairs = buildPairs(waitingParticipants);
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
  import { doc, updateDoc } from "firebase/firestore";
import { setParticipantBackToWaiting } from "@/lib/participants";

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