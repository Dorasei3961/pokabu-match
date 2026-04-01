"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";

type SavedMatchTablePlayer = {
  id: string;
  name: string;
  rank?: string;
  deck?: string;
};

type SavedMatchTable = {
  tableNumber: number;
  matchType?: string;
  started?: boolean;
  winnerId?: string;
  pendingWinnerId?: string | null;
  player1: SavedMatchTablePlayer;
  player2: SavedMatchTablePlayer;
};

type SavedMatch = {
  id?: string;
  matchType: "rank-priority" | "team-random" | "random" | "casual";
  createdAt: number;
  tables?: SavedMatchTable[];
};

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

const rankStyle: React.CSSProperties = {
  marginTop: 6,
  fontSize: 15,
  color: "#666",
};
const vsStyle: React.CSSProperties = {
  textAlign: "center",
  fontSize: 22,
  fontWeight: 800,
  margin: "14px 0",
  color: "#555",
};

function getRankLabel(rank?: string) {
  if (!rank) return "階級未設定";
  return `${rank}級`;
}

function getMatchTypeLabel(matchType?: SavedMatch["matchType"]) {
  if (matchType === "casual") return "交流会マッチ";
  if (matchType === "rank-priority") return "個人戦（階級優先）";
  if (matchType === "team-random") return "チーム戦";
  if (matchType === "random") return "ランダム戦";
  return "卓振り";
}

export default function BoardPage() {
  const [latestMatch, setLatestMatch] = useState<SavedMatch | null>(null);

  useEffect(() => {
    const q = query(
      collection(db, "matchResults"),
      where("matchType", "==", "casual")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setLatestMatch(null);
        return;
      }

      const docs = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as SavedMatch),
      }));

      docs.sort((a, b) => b.createdAt - a.createdAt);

      const latestWithTables = docs.find(
        (doc) => Array.isArray(doc.tables) && doc.tables.length > 0
      );
      setLatestMatch(latestWithTables ?? null);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div style={pageStyle}>
      <h1 style={titleStyle}>対戦表</h1>

      <div style={subStyle}>
        {latestMatch ? getMatchTypeLabel(latestMatch.matchType) : "交流会モード"}
      </div>

      {!latestMatch ? (
        <p style={{ textAlign: "center", fontSize: 16 }}>
          まだ卓振り結果はありません
        </p>
      ) : (
        <div style={gridStyle}>
          {latestMatch.tables?.map((table) => (
            <div key={table.tableNumber} style={cardStyle}>
              <div style={tableNoStyle}>卓{table.tableNumber}</div>

              <div style={playerBoxStyle}>
                <div style={nameStyle}>{table.player1?.name ?? "未設定"}</div>
                <div style={rankStyle}>{getRankLabel(table.player1?.rank)}</div>
              </div>

              <div style={vsStyle}>VS</div>

              <div style={playerBoxStyle}>
                <div style={nameStyle}>{table.player2?.name ?? "未設定"}</div>
                <div style={rankStyle}>{getRankLabel(table.player2?.rank)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}