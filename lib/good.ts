import {
  collection,
  doc,
  increment,
  runTransaction,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

/** 運営画面：受信者ごとの一覧表示用（Firestore goodHistory から組み立て） */
export type GoodHistoryListItem = {
  id: string;
  fromPlayerName: string;
  matchId: string;
  tableNumber: number | null;
  createdAtMs: number | null;
};

/**
 * 交流会：現在の対戦相手に「ナイス対戦」を1回だけ送る。
 * - player1 → player2 は player1GoodSent
 * - player2 → player1 は player2GoodSent
 * 試合が playing で、未送信のときのみ相手の goodCount を +1。
 */
export async function sendCasualGood(
  eventId: string,
  matchId: string,
  senderPlayerId: string
): Promise<void> {
  const matchRef = doc(db, "events", eventId, "matches", matchId);

  await runTransaction(db, async (transaction) => {
    const matchSnap = await transaction.get(matchRef);
    if (!matchSnap.exists()) {
      throw new Error("試合が見つかりません");
    }

    const m = matchSnap.data();
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
  });
}
