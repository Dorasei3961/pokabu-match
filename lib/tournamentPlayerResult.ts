import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

/** プレイヤーが大会用ページから送信する結果（運営の matchResults とは別コレクション） */
export type TournamentPlayerResultPayload = {
  eventId: string;
  /** 卓ドキュメント ID（events/{eventId}/matches の1件） */
  matchId: string;
  tableNumber: number;
  /** 送信者（自分） */
  playerA: string;
  /** 相手 */
  playerB: string;
  playerAId: string;
  playerBId: string;
  sideA: number;
  sideB: number;
  /** 勝者の playerId。引き分けは "draw" */
  winner: string | "draw";
  /** 送信者視点の勝敗 */
  resultStatus: "win" | "loss" | "draw";
  opponentDeck: string;
  goodSent: boolean;
  reporterId: string;
  round: number | null;
};

const COLLECTION = "tournamentPlayerResults";

export async function saveTournamentPlayerResult(
  payload: TournamentPlayerResultPayload
): Promise<void> {
  await addDoc(collection(db, COLLECTION), {
    ...payload,
    matchType: "tournament_individual_input",
    timestamp: serverTimestamp(),
    createdAt: serverTimestamp(),
  });
}
