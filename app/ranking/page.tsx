"use client";

import { useEffect, useState } from "react";
import { db } from "../../lib/firebase";
import { collection, onSnapshot } from "firebase/firestore";

type Player = {
  id: string;
  name: string;
  rank: string;
  wins?: number;
};

export default function RankingPage() {
  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, "players"), (snapshot) => {
      const list: Player[] = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...(doc.data() as any),
      }));

      // 勝ち数でソート
      list.sort((a, b) => (b.wins || 0) - (a.wins || 0));

      setPlayers(list);
    });

    return () => unsubscribe();
  }, []);

  return (
    <div style={{ padding: 20, maxWidth: 600, margin: "0 auto" }}>
      <h1 style={{ textAlign: "center", marginBottom: 20 }}>
        🏆 ランキング
      </h1>

      {players.map((p, i) => (
        <div
          key={p.id}
          style={{
            padding: 12,
            marginBottom: 10,
            border: "1px solid #ddd",
            borderRadius: 8,
            background: i === 0 ? "#fff7e6" : "#fff",
          }}
        >
          {i + 1}位 {p.name}（{p.rank}） - {p.wins || 0}勝
        </div>
      ))}
    </div>
  );
}