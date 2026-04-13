import {
  addDoc,
  collection,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

/** 本アプリの既定イベント（admin / 対戦表 / 交流会で共通） */
export const DEFAULT_EVENT_ID = "default";

/** 対戦表用の大会個人戦（卓ごとのフラットドキュメント） */
export const TOURNAMENT_INDIVIDUAL_BOARD_TYPE = "tournament_individual" as const;

export async function finishAllPlayingTournamentIndividualBoardMatches(
  eventId: string
): Promise<void> {
  const q = query(
    collection(db, "events", eventId, "matches"),
    where("matchType", "==", TOURNAMENT_INDIVIDUAL_BOARD_TYPE)
  );
  const snap = await getDocs(q);
  const playing = snap.docs.filter((d) => d.data().status === "playing");
  await Promise.all(
    playing.map((d) =>
      updateDoc(d.ref, {
        status: "finished",
        updatedAt: serverTimestamp(),
      })
    )
  );
}

type BoardTableInput = {
  tableNumber: number;
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
};

/**
 * 卓振りを events/{eventId}/matches に1卓1ドキュメントで保存（不戦勝卓はスキップ）
 */
export async function addTournamentIndividualBoardMatches(
  eventId: string,
  round: number,
  tables: BoardTableInput[]
): Promise<void> {
  const col = collection(db, "events", eventId, "matches");
  for (const t of tables) {
    await addDoc(col, {
      eventId,
      tableNumber: t.tableNumber,
      player1: t.player1Name,
      player2: t.player2Name,
      matchType: TOURNAMENT_INDIVIDUAL_BOARD_TYPE,
      round,
      status: "playing",
      player1Id: t.player1Id,
      player1Name: t.player1Name,
      player2Id: t.player2Id,
      player2Name: t.player2Name,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
}

export async function finishTournamentIndividualBoardMatch(
  eventId: string,
  round: number,
  tableNumber: number
): Promise<void> {
  const q = query(
    collection(db, "events", eventId, "matches"),
    where("matchType", "==", TOURNAMENT_INDIVIDUAL_BOARD_TYPE)
  );
  const snap = await getDocs(q);
  const targets = snap.docs.filter((d) => {
    const x = d.data();
    return (
      x.round === round &&
      x.tableNumber === tableNumber &&
      x.status === "playing"
    );
  });
  await Promise.all(
    targets.map((d) =>
      updateDoc(d.ref, {
        status: "finished",
        updatedAt: serverTimestamp(),
      })
    )
  );
}
