import {
  collection,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

function casualMutualGoodPairId(a: string, b: string): string {
  return a < b ? `${a}__${b}` : `${b}__${a}`;
}

function isTournamentIndividualMatch(m: Record<string, unknown>): boolean {
  return m.matchType === "tournament_individual";
}

/** 運営画面：受信者ごとの一覧表示用（Firestore goodHistory から組み立て） */
export type GoodHistoryListItem = {
  id: string;
  fromPlayerName: string;
  matchId: string;
  tableNumber: number | null;
  createdAtMs: number | null;
};

/**
 * 現在の対戦相手に「ナイス対戦」を送る。
 *
 * **交流会（`matchType` が `tournament_individual` 以外）**
 * - 送信フラグは従来どおり `player1GoodSent` / `player2GoodSent`
 * - **送信のたび**に相手の `goodCount` を +1し、`goodHistory` に1件（送信者→相手）を追加
 * - **両者が送り終えた**ときに `casualMutualGoodPairs` を完了（同一 `eventId` 内の同一ペアは二度とナイス不可・別卓の再マッチでも不可）
 *
 * **大会個人戦（`matchType === "tournament_individual"`）**
 * - 従来どおり：送信時点で相手の `goodCount` +1 と `goodHistory` 1件
 *
 * @returns `mutualCompleted` … 交流会で「相手も含め両者が送信済みになった送信」なら true（2人目の送信時）
 */
export async function sendCasualGood(
  eventId: string,
  matchId: string,
  senderPlayerId: string
): Promise<{ mutualCompleted: boolean }> {
  const matchRef = doc(db, "events", eventId, "matches", matchId);

  return runTransaction(db, async (transaction) => {
    const matchSnap = await transaction.get(matchRef);
    if (!matchSnap.exists()) {
      throw new Error("試合が見つかりません");
    }

    const m = matchSnap.data() as Record<string, unknown>;
    if (m.status !== "playing") {
      throw new Error("この試合では送信できません");
    }

    const p1 = m.player1Id as string | undefined;
    const p2 = m.player2Id as string | undefined;
    if (!p1 || !p2) {
      throw new Error("相手がいません");
    }
    if (senderPlayerId !== p1 && senderPlayerId !== p2) {
      throw new Error("送信できません");
    }

    const opponentId = senderPlayerId === p1 ? p2 : p1;
    const opponentRef = doc(db, "players", opponentId);
    const senderRef = doc(db, "players", senderPlayerId);

    if (isTournamentIndividualMatch(m)) {
      if (senderPlayerId === p1) {
        if (m.player1GoodSent === true) {
          throw new Error("送信済みです");
        }
        transaction.update(matchRef, {
          player1GoodSent: true,
          updatedAt: serverTimestamp(),
        });
      } else {
        if (m.player2GoodSent === true) {
          throw new Error("送信済みです");
        }
        transaction.update(matchRef, {
          player2GoodSent: true,
          updatedAt: serverTimestamp(),
        });
      }

      transaction.update(opponentRef, {
        goodCount: increment(1),
        updatedAt: serverTimestamp(),
      });

      const historyRef = doc(collection(db, "events", eventId, "goodHistory"));
      const fromName = String(
        senderPlayerId === p1 ? m.player1Name ?? "" : m.player2Name ?? ""
      );
      const toName = String(
        senderPlayerId === p1 ? m.player2Name ?? "" : m.player1Name ?? ""
      );
      transaction.set(historyRef, {
        fromPlayerId: senderPlayerId,
        fromPlayerName: fromName,
        toPlayerId: opponentId,
        toPlayerName: toName,
        matchId,
        tableNumber:
          typeof m.tableNumber === "number" ? m.tableNumber : null,
        createdAt: serverTimestamp(),
      });
      return { mutualCompleted: false };
    }

    const pairRef = doc(
      db,
      "events",
      eventId,
      "casualMutualGoodPairs",
      casualMutualGoodPairId(p1, p2)
    );
    const pairSnap = await transaction.get(pairRef);
    const pairData = pairSnap.exists()
      ? (pairSnap.data() as Record<string, unknown>)
      : null;
    if (pairData?.completed === true) {
      throw new Error(
        "この相手とは、すでにこの交流会でナイス対戦の記録があります"
      );
    }

    const wasP1Sent = m.player1GoodSent === true;
    const wasP2Sent = m.player2GoodSent === true;

    if (senderPlayerId === p1) {
      if (wasP1Sent) {
        throw new Error("送信済みです");
      }
      transaction.update(matchRef, {
        player1GoodSent: true,
        updatedAt: serverTimestamp(),
      });
    } else {
      if (wasP2Sent) {
        throw new Error("送信済みです");
      }
      transaction.update(matchRef, {
        player2GoodSent: true,
        updatedAt: serverTimestamp(),
      });
    }

    const nowP1Sent = senderPlayerId === p1 ? true : wasP1Sent;
    const nowP2Sent = senderPlayerId === p2 ? true : wasP2Sent;

    transaction.update(opponentRef, {
      goodCount: increment(1),
      updatedAt: serverTimestamp(),
    });

    const fromName = String(
      senderPlayerId === p1 ? m.player1Name ?? "" : m.player2Name ?? ""
    );
    const toName = String(
      senderPlayerId === p1 ? m.player2Name ?? "" : m.player1Name ?? ""
    );
    const tableNumber =
      typeof m.tableNumber === "number" ? m.tableNumber : null;

    const historyRef = doc(collection(db, "events", eventId, "goodHistory"));
    transaction.set(historyRef, {
      fromPlayerId: senderPlayerId,
      fromPlayerName: fromName,
      toPlayerId: opponentId,
      toPlayerName: toName,
      matchId,
      tableNumber,
      createdAt: serverTimestamp(),
    });

    if (nowP1Sent && nowP2Sent) {
      transaction.set(
        pairRef,
        {
          completed: true,
          player1Id: p1,
          player2Id: p2,
          matchId,
          createdAt: serverTimestamp(),
        },
        { merge: true }
      );
      return { mutualCompleted: true };
    }

    return { mutualCompleted: false };
  });
}
