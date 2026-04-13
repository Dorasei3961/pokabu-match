"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { DEFAULT_EVENT_ID } from "@/lib/tournamentBoardMatches";

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
  padding: 20,
  maxWidth: 900,
  margin: "0 auto",
};

const titleStyle: React.CSSProperties = {
  fontSize: 32,
  fontWeight: 800,
  textAlign: "center",
  marginBottom: 20,
};

const subStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 14,
  color: "#666",
  marginBottom: 24,
};

const gridStyle: React.CSSProperties = {
  display: "grid",
  gap: 16,
};

const cardStyle: React.CSSProperties = {
  border: "1px solid #ddd",
  borderRadius: 16,
  background: "#fff",
  padding: 20,
  boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
};

const tableNoStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 800,
  marginBottom: 16,
};

const playerBoxStyle: React.CSSProperties = {
  border: "1px solid #eee",
  borderRadius: 12,
  padding: "14px 16px",
  background: "#fafafa",
};

const nameStyle: React.CSSProperties = {
  fontSize: 24,
  fontWeight: 800,
  lineHeight: 1.4,
};

const vsStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 22,
  fontWeight: 800,
  margin: "14px 0",
  color: "#555",
};

function sortByTable(a: BoardMatch, b: BoardMatch) {
  return a.tableNumber - b.tableNumber;
}

function MatchGrid({ matches }: { matches: BoardMatch[] }) {
  if (matches.length === 0) {
    return (
      <p style={{ textAlign: "center", fontSize: 16 }}>
        まだ対戦中の卓はありません
      </p>
    );
  }
  return (
    <div style={gridStyle}>
      {matches.map((match) => (
        <div key={match.id} style={cardStyle}>
          <div style={tableNoStyle}>
            卓{match.tableNumber}
            {typeof match.round === "number" ? (
              <span style={{ fontSize: 14, fontWeight: 600, color: "#666" }}>
                {" "}
                · Round {match.round}
              </span>
            ) : null}
          </div>

          <div style={playerBoxStyle}>
            <div style={nameStyle}>{match.player1Name ?? "未設定"}</div>
          </div>

          <div style={vsStyle}>VS</div>

          <div style={playerBoxStyle}>
            <div style={nameStyle}>{match.player2Name ?? "未設定"}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function BoardPage() {
  const [casualMatches, setCasualMatches] = useState<BoardMatch[]>([]);
  const [tournamentMatches, setTournamentMatches] = useState<BoardMatch[]>([]);

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

  return (
    <div style={pageStyle}>
      <h1 style={titleStyle}>対戦表</h1>

      <h2
        style={{
          fontSize: 22,
          fontWeight: 800,
          marginTop: 8,
          marginBottom: 12,
          textAlign: "center",
        }}
      >
        交流会
      </h2>
      <div style={subStyle}>
        {casualMatches.length > 0
          ? `対戦中 ${casualMatches.length}卓`
          : "現在対戦中の卓はありません"}
      </div>
      <MatchGrid matches={casualMatches} />

      <h2
        style={{
          fontSize: 22,
          fontWeight: 800,
          marginTop: 36,
          marginBottom: 12,
          textAlign: "center",
        }}
      >
        大会個人戦
      </h2>
      <div style={subStyle}>
        {tournamentMatches.length > 0
          ? `対戦中 ${tournamentMatches.length}卓`
          : "現在対戦中の卓はありません"}
      </div>
      <MatchGrid matches={tournamentMatches} />
    </div>
  );
}