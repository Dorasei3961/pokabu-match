"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../../lib/firebase";
import { collection, onSnapshot, orderBy, query } from "firebase/firestore";

type MatchResult = {
  id: string;
  matchId: string;
  tableNumber: number;
  matchType: "rank-priority" | "full-random";
  roundMinutes?: number | null;

  winnerId?: string | null;
  winnerName: string;
  winnerRank?: string;
  winnerDeck?: string;

  loserId?: string | null;
  loserName: string;
  loserRank?: string;
  loserDeck?: string;

  reportedById?: string | null;
  sideWinner?: number | null;
  sideLoser?: number | null;
};

export default function ResultsPage() {
  const [results, setResults] = useState<MatchResult[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    const q = query(collection(db, "matchResults"), orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: MatchResult[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          matchId: data.matchId || "",
          tableNumber: data.tableNumber || 0,
          matchType: data.matchType || "rank-priority",
          roundMinutes: data.roundMinutes ?? null,

          winnerId: data.winnerId ?? null,
          winnerName: data.winnerName || "",
          winnerRank: data.winnerRank || "",
          winnerDeck: data.winnerDeck || "",

          loserId: data.loserId ?? null,
          loserName: data.loserName || "",
          loserRank: data.loserRank || "",
          loserDeck: data.loserDeck || "",

          reportedById: data.reportedById ?? null,
          sideWinner: data.sideWinner ?? null,
          sideLoser: data.sideLoser ?? null,
        };
      });

      setResults(list);
    });

    return () => unsubscribe();
  }, []);

  const filteredResults = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return results;

    return results.filter((result) => {
      return (
        result.winnerName.toLowerCase().includes(keyword) ||
        result.loserName.toLowerCase().includes(keyword) ||
        (result.winnerDeck || "").toLowerCase().includes(keyword) ||
        (result.loserDeck || "").toLowerCase().includes(keyword)
      );
    });
  }, [results, search]);

  return (
    <div style={{ padding: 20, maxWidth: 1100, margin: "0 auto", fontFamily: "sans-serif" }}>
      <h1 style={{ textAlign: "center", marginBottom: 20 }}>過去試合一覧</h1>

      <div style={{ marginBottom: 20 }}>
        <input
          type="text"
          placeholder="名前・デッキ名で検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: "100%",
            padding: 12,
            fontSize: 16,
            border: "1px solid #ccc",
            borderRadius: 8,
            boxSizing: "border-box",
          }}
        />
      </div>

      {filteredResults.length === 0 ? (
        <p style={{ textAlign: "center" }}>まだ試合結果がありません</p>
      ) : (
        <div style={{ display: "grid", gap: 14 }}>
          {filteredResults.map((result) => (
            <div
              key={result.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: 12,
                padding: 16,
                backgroundColor: "#fff",
              }}
            >
              <div style={{ fontWeight: "bold", marginBottom: 8 }}>
                卓{result.tableNumber}
              </div>

              <div style={{ marginBottom: 6 }}>
                種別：
                {result.matchType === "rank-priority"
                  ? "階級優先卓振り"
                  : "完全ランダム卓振り"}
              </div>

              <div style={{ marginBottom: 6 }}>
                勝者：
                <span style={{ color: "#16a34a", fontWeight: "bold" }}>
                  {result.winnerName}
                </span>
                {result.winnerDeck ? `（${result.winnerDeck}）` : ""}
              </div>

              <div style={{ marginBottom: 6 }}>
                敗者：
                {result.loserName}
                {result.loserDeck ? `（${result.loserDeck}）` : ""}
              </div>

              {result.sideWinner !== null &&
                result.sideWinner !== undefined &&
                result.sideLoser !== null &&
                result.sideLoser !== undefined && (
                  <div style={{ marginBottom: 6 }}>
                    サイド：{result.sideWinner}-{result.sideLoser}
                  </div>
                )}

              <div style={{ color: "#666", fontSize: 14 }}>
                報告者ID：{result.reportedById || "未記録"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}