import type { SpecialBadgeId } from "./playerBadges";

export type ParticipantStatus =
  | "waiting"
  | "playing"
  /** 交流会：一時離席。マッチング対象外（待機一覧の人数にも含めない） */
  | "break"
  | "inactive"
  | "absent"
  | "left";

export type ParticipantRank = "monster" | "super" | "hyper";

export type Participant = {
  id: string;
  name: string;
  playHistory?: string;
  rank?: ParticipantRank;
  deckName?: string;
  /** 交流会「ナイス対戦」で受け取った累計（未設定は0扱い） */
  goodCount?: number;
  status: ParticipantStatus;
  currentMatchId: string | null;
  readyNext?: boolean;
  waitingSince?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
  /** 交流会：プレイスタイル（将来マッチング用・参加登録で保存） */
  playStyle?: "serious" | "enjoy" | "both";
  /** 交流会：プレイヤー属性（主に表示用）。マッチは `lib/matches` 既存仕様（`beginner` のみ参照・スコア0）。Firestore `players.playerAttributes`（旧 `badges` 互換読取あり） */
  playerAttributes?: string[];
  /** 交流会：特別属性（Firestore `players.badge` を正規化）。完全に表示専用・マッチングには使わない */
  specialBadge?: SpecialBadgeId | null;
};

export type MatchStatus = "scheduled" | "playing" | "finished";

export type Match = {
  id: string;
  eventId: string;
  /** 交流会: casual / 対戦表用大会個人戦: tournament_individual（集約ドキュメントは別 matchType） */
  matchType?: string;
  /** 大会個人戦のラウンド（卓ドキュメント用） */
  round?: number;
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
  tableNumber: number;
  status: MatchStatus;
  /** player1 が player2 にナイス対戦を送ったか */
  player1GoodSent?: boolean;
  /** player2 が player1 にナイス対戦を送ったか */
  player2GoodSent?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
};

/**
 * events/{eventId}/goodHistory の1件（ナイス対戦の送信ログ・goodCount 集計とは別ドキュメント）
 */
export type GoodHistoryLog = {
  fromPlayerId: string;
  fromPlayerName: string;
  toPlayerId: string;
  toPlayerName: string;
  matchId: string;
  tableNumber: number | null;
  createdAt?: unknown;
};