export type ParticipantStatus = "waiting" | "playing" | "absent" | "left";

export type ParticipantRank = "monster" | "super" | "hyper";

export type Participant = {
  id: string;
  name: string;
  playHistory?: string;
  rank?: ParticipantRank;
  deckName?: string;
  status: ParticipantStatus;
  currentMatchId: string | null;
  readyNext?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type MatchStatus = "scheduled" | "playing" | "finished";

export type Match = {
  id: string;
  eventId: string;
  player1Id: string;
  player1Name: string;
  player2Id: string | null;
  player2Name: string | null;
  status: MatchStatus;
  createdAt?: unknown;
  updatedAt?: unknown;
};