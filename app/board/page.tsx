"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DEFAULT_EVENT_ID } from "@/lib/tournamentBoardMatches";
import type { BadgeId, PlayStyleKey } from "@/lib/playerBadges";
import {
  badgesEmojiCompact,
  normalizePlayerBadges,
  normalizePlayStyle,
  PLAY_STYLE_META,
} from "@/lib/playerBadges";

type BoardMatch = {
  id: string;
  eventId: string;
  matchType?: string;
  round?: number;
  player1Id: string;
  player1Name: string;
  player2Id: string | null;
  player2Name: string | null;
  tableNumber: number;
  status: "scheduled" | "playing" | "finished";
  createdAt?: any;
  updatedAt?: any;
};

function isAggregateMatchDoc(data: Record<string, unknown>): boolean {
  return Array.isArray(data.tables);
}

function isCasualBoardRow(data: Record<string, unknown>): boolean {
  if (isAggregateMatchDoc(data)) return false;
  const mt = data.matchType;
  return mt === "casual" || mt == null || mt === "";
}

function isTournamentIndividualBoardRow(data: Record<string, unknown>): boolean {
  if (isAggregateMatchDoc(data)) return false;
  return data.matchType === "tournament_individual";
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  boxSizing: "border-box",
  padding: "14px 12px 20px",
  maxWidth: 900,
  margin: "0 auto",
};

const titleStyle: React.CSSProperties = {
  fontSize: 26,
  fontWeight: 800,
  textAlign: "center",
  marginBottom: 12,
  color: "#f8fafc",
};

const subStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 13,
  color: "rgba(226,232,240,0.78)",
  marginBottom: 14,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gap: 10,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid rgba(255,255,255,0.18)",
  borderRadius: 12,
  background: "#fff",
  padding: "10px 12px 12px",
  boxShadow: "0 4px 14px rgba(2,6,23,0.2)",
};

const tableNoStyle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
  marginBottom: 8,
  color: "#0f172a",
  letterSpacing: "0.02em",
};

const playerBoxStyle: React.CSSProperties = {
  border: "1px solid #e5e7eb",
  borderRadius: 10,
  padding: "8px 10px",
  background: "#fafafa",
};

const nameStyle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
  lineHeight: 1.25,
  color: "#0f172a",
};

const metaLineStyle: React.CSSProperties = {
  marginTop: 4,
  fontSize: 12,
  lineHeight: 1.35,
  color: "rgba(51,65,85,0.92)",
  fontWeight: 500,
};

const vsStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 15,
  fontWeight: 800,
  margin: "6px 0",
  color: "#64748b",
};

function sortByTable(a: BoardMatch, b: BoardMatch) {
  return a.tableNumber - b.tableNumber;
}

type PlayerBoardInfo = {
  rank: string;
  playStyle: PlayStyleKey;
  badges: BadgeId[];
};

function formatRankMetaLine(info: PlayerBoardInfo | undefined): string {
  if (!info) return "(—)";
  const rank = (info.rank || "").trim() || "—";
  const styleEmoji = PLAY_STYLE_META[info.playStyle].emoji;
  const badgeEmojis = badgesEmojiCompact(info.badges);
  const tail = `${styleEmoji}${badgeEmojis}`.trim();
  return `(${rank}${tail ? ` ${tail}` : ""})`;
}

function PlayerCell({
  name,
  playerId,
  playersById,
}: {
  name: string;
  playerId: string | null;
  playersById: Record<string, PlayerBoardInfo>;
}) {
  const info = playerId ? playersById[playerId] : undefined;
  return (
    <div style={playerBoxStyle}>
      <div style={nameStyle}>{name || "未設定"}</div>
      <div style={metaLineStyle}>{formatRankMetaLine(info)}</div>
    </div>
  );
}

function MatchGrid({
  matches,
  playersById,
}: {
  matches: BoardMatch[];
  playersById: Record<string, PlayerBoardInfo>;
}) {
  if (matches.length === 0) {
    return null;
  }
  return (
    <div style={gridStyle}>
      {matches.map((match) => (
        <div key={match.id} style={cardStyle}>
          <div style={tableNoStyle}>
            卓{match.tableNumber}
            {typeof match.round === "number" ? (
              <span style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>
                {" "}
                · Round {match.round}
              </span>
            ) : null}
          </div>

          <PlayerCell
            name={match.player1Name ?? "未設定"}
            playerId={match.player1Id}
            playersById={playersById}
          />

          <div style={vsStyle}>VS</div>

          <PlayerCell
            name={match.player2Name ?? "未設定"}
            playerId={match.player2Id}
            playersById={playersById}
          />
        </div>
      ))}
    </div>
  );
}

export default function BoardPage() {
  const [casualMatches, setCasualMatches] = useState<BoardMatch[]>([]);
  const [tournamentMatches, setTournamentMatches] = useState<BoardMatch[]>([]);
  const [playersById, setPlayersById] = useState<
    Record<string, PlayerBoardInfo>
  >({});

  useEffect(() => {
    const unsubPlayers = onSnapshot(collection(db, "players"), (snap) => {
      const next: Record<string, PlayerBoardInfo> = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        next[d.id] = {
          rank: typeof data.rank === "string" ? data.rank : "",
          playStyle: normalizePlayStyle(data),
          badges: normalizePlayerBadges(data as Record<string, unknown>),
        };
      });
      setPlayersById(next);
    });
    return () => unsubPlayers();
  }, []);

  useEffect(() => {
    // status で絞る（orderBy("createdAt") だと createdAt 未設定ドキュメントが一覧に出ない）
    const q = query(
      collection(db, "events", DEFAULT_EVENT_ID, "matches"),
      where("status", "==", "playing")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map((docSnap) => {
        const data = docSnap.data() as Record<string, unknown>;
        return {
          id: docSnap.id,
          ...(docSnap.data() as Omit<BoardMatch, "id">),
          _raw: data,
        };
      });

      const casual = docs
        .filter((m) => isCasualBoardRow(m._raw))
        .map(({ _raw: _, ...rest }) => rest)
        .sort(sortByTable);

      const tournament = docs
        .filter((m) => isTournamentIndividualBoardRow(m._raw))
        .map(({ _raw: _, ...rest }) => rest)
        .sort(sortByTable);

      setCasualMatches(casual);
      setTournamentMatches(tournament);
    });

    return () => unsubscribe();
  }, []);

  const allPlayingMatches = useMemo(
    () => [...casualMatches, ...tournamentMatches],
    [casualMatches, tournamentMatches]
  );

  return (
    <div style={pageStyle}>
      <h1 style={titleStyle}>対戦表</h1>

      <div style={subStyle}>
        {allPlayingMatches.length > 0
          ? `対戦中 ${allPlayingMatches.length}卓`
          : "現在対戦中の卓はありません"}
      </div>
      <MatchGrid matches={allPlayingMatches} playersById={playersById} />
    </div>
  );
}