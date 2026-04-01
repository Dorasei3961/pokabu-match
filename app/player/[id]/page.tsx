"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../../../lib/firebase";
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
} from "firebase/firestore";

type PlayerData = {
  name: string;
  history: string;
  rank: string;
  deck: string;
};

type MatchPlayer = {
  id: string;
  name: string;
  rank: string;
  deck?: string;
};

type SavedMatchTable = {
  tableNumber: number;
  type: "same-rank" | "cross-rank" | "random";
  started?: boolean;
  pendingWinnerId?: string | null;
  winnerId?: string | null;
  player1: MatchPlayer | null;
  player2: MatchPlayer | null;

  reportedById?: string | null;
  reportedOpponentDeck?: string | null;
  reportedWinnerSide?: number | null;
  reportedLoserSide?: number | null;
  reportedWinnerDeck?: string | null;
};

export default function PlayerPage() {
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [tableInfo, setTableInfo] = useState<SavedMatchTable | null>(null);
  const [latestMatchId, setLatestMatchId] = useState("");
  const [roundEndAt, setRoundEndAt] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingRequest, setSavingRequest] = useState(false);
  const [now, setNow] = useState(Date.now());

  const [opponentDeckInput, setOpponentDeckInput] = useState("");
  const [mySide, setMySide] = useState("6");
  const [opponentSide, setOpponentSide] = useState("0");
  const handleFinishMatch = async () => {

    if (!player) return;
  
    await updateDoc(doc(db, "players", playerId), {
      status: "waiting"
    });
  
    alert("対戦終了しました");
  
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const path = window.location.pathname;
    const id = path.split("/").pop();

    if (!id) {
      setLoading(false);
      return;
    }

    setPlayerId(id);

    const fetchPlayer = async () => {
      try {
        const playerRef = doc(db, "players", id);
        const playerSnap = await getDoc(playerRef);

        if (!playerSnap.exists()) {
          setLoading(false);
          return;
        }

        const playerData = playerSnap.data();
        setPlayer({
          name: playerData.name || "",
          history: playerData.history || "",
          rank: playerData.rank || "",
          deck: playerData.deck || "",
        });
      } catch (error) {
        console.error(error);
      }
    };

    fetchPlayer();

    const latestMatchQuery = query(
      collection(db, "matches"),
      orderBy("createdAt", "desc"),
      limit(1)
    );

    const unsubscribe = onSnapshot(latestMatchQuery, (snapshot) => {
      if (snapshot.empty) {
        setTableInfo(null);
        setLatestMatchId("");
        setRoundEndAt(null);
        setLoading(false);
        return;
      }

      const latestMatchDoc = snapshot.docs[0];
      const latestMatchData = latestMatchDoc.data();
      const tables = (latestMatchData.tables || []) as SavedMatchTable[];

      const matchedTable =
        tables.find(
          (table) => table.player1?.id === id || table.player2?.id === id
        ) || null;

      setLatestMatchId(latestMatchDoc.id);
      setTableInfo(matchedTable);
      setRoundEndAt(latestMatchData.roundEndAt ?? null);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleWinRequest = async () => {
    if (!latestMatchId || !tableInfo || !playerId || !player) return;

    if (!opponentDeckInput.trim()) {
      alert("相手のデッキ名を入力してください");
      return;
    }

    const mySideNum = Number(mySide);
    const opponentSideNum = Number(opponentSide);

    if (mySideNum === opponentSideNum) {
      alert("同じサイド数では勝ち申請できません");
      return;
    }

    if (mySideNum < opponentSideNum) {
      alert("勝ち申請する場合、自分のサイド数を相手より大きくしてください");
      return;
    }

    setSavingRequest(true);

    try {
      const latestMatchRef = doc(db, "matches", latestMatchId);
      const latestMatchSnap = await getDoc(latestMatchRef);

      if (!latestMatchSnap.exists()) return;

      const data = latestMatchSnap.data();
      const tables = (data.tables || []) as SavedMatchTable[];

      const updatedTables = tables.map((table) =>
        table.tableNumber === tableInfo.tableNumber
          ? {
              ...table,
              pendingWinnerId: playerId,
              reportedById: playerId,
              reportedOpponentDeck: opponentDeckInput.trim(),
              reportedWinnerSide: mySideNum,
              reportedLoserSide: opponentSideNum,
              reportedWinnerDeck: player.deck || "",
            }
          : table
      );

      await updateDoc(latestMatchRef, {
        tables: updatedTables,
      });
    } catch (error) {
      console.error(error);
      alert("勝利申請に失敗しました");
    } finally {
      setSavingRequest(false);
    }
  };

  const remainingSeconds = useMemo(() => {
    if (!roundEndAt) return null;
    return Math.max(0, Math.floor((roundEndAt - now) / 1000));
  }, [roundEndAt, now]);

  const timerText = useMemo(() => {
    if (remainingSeconds === null) return "未開始";
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(
      2,
      "0"
    )}`;
  }, [remainingSeconds]);

  if (loading) {
    return <p style={{ padding: 20 }}>読み込み中...</p>;
  }

  if (!player) {
    return <p style={{ padding: 20 }}>参加者情報が見つかりません</p>;
  }

  const opponent =
    tableInfo?.player1?.id === playerId ? tableInfo?.player2 : tableInfo?.player1;

  const myNameStyle =
    tableInfo?.winnerId === playerId
      ? { color: "#16a34a", fontWeight: "bold" as const }
      : tableInfo?.pendingWinnerId === playerId
      ? { color: "orange", fontWeight: "bold" as const }
      : {};

  const opponentNameStyle =
    tableInfo?.winnerId === opponent?.id
      ? { color: "#16a34a", fontWeight: "bold" as const }
      : tableInfo?.pendingWinnerId === opponent?.id
      ? { color: "orange", fontWeight: "bold" as const }
      : {};

  const showResultInput =
    !!tableInfo &&
    tableInfo.started &&
    !tableInfo.winnerId &&
    tableInfo.pendingWinnerId !== playerId;

  return (
    <div style={{ padding: 20, maxWidth: 520, margin: "0 auto" }}>
      <div
        style={{
          textAlign: "center",
          marginBottom: 20,
          fontSize: 28,
          fontWeight: "bold",
          color:
            remainingSeconds === null
              ? "#999"
              : remainingSeconds === 0
              ? "#dc2626"
              : "#2563eb",
        }}
      >
        ラウンドタイマー：{timerText}
      </div>

      <h1>参加者情報</h1>

      <p>名前：{player.name}</p>
      <div style={{
  fontWeight: 700,
  fontSize: 18,
  color:
    player.rank === "モンスターボール級" ? "#ef4444" :
    player.rank === "スーパーボール級" ? "#3b82f6" :
    "#facc15"
}}>
  階級：{player.rank}
</div>
      <p>使用デッキ：{player.deck || "未設定"}</p>

      <hr style={{ margin: "20px 0" }} />

      {!tableInfo ? (
        <p>まだ対戦がありません</p>
      ) : (
        <>
          <p>卓番号：卓{tableInfo.tableNumber}</p>
          <p>
            対戦相手：
            <span style={opponentNameStyle}>
              {opponent ? opponent.name : "不在"}
            </span>
          </p>
          <p>
  階級：
  <span style={{
    fontWeight: 700,
    color:
      opponent?.rank === "モンスターボール級" ? "#ef4444" :
      opponent?.rank === "スーパーボール級" ? "#3b82f6" :
      "#facc15"
  }}>
    {opponent ? opponent.rank : "-"}
  </span>
</p>
          <p>
            対戦種別：
            {tableInfo.type === "same-rank"
              ? "同階級"
              : tableInfo.type === "cross-rank"
              ? "階級またぎ"
              : "完全ランダム"}
          </p>

          <div
            style={{
              marginTop: 20,
              border: "1px solid #ddd",
              borderRadius: 10,
              padding: 16,
            }}
          >
            <div style={{ marginBottom: 10 }}>
              あなた：
              <span style={myNameStyle}>{player.name}</span>
            </div>
            <div style={{ marginBottom: 10 }}>
              相手：
              <span style={opponentNameStyle}>
                {opponent ? opponent.name : "不在"}
              </span>
            </div>
            <div>
              相手デッキ：
              {tableInfo.winnerId
                ? tableInfo.reportedOpponentDeck || "未入力"
                : "？？？"}
            </div>
          </div>

          {tableInfo.winnerId ? (
            <>
              <p
                style={{
                  marginTop: 20,
                  color: "#16a34a",
                  fontWeight: "bold",
                }}
              >
                勝者が確定しています
              </p>

              {tableInfo.reportedWinnerSide !== null &&
                tableInfo.reportedWinnerSide !== undefined &&
                tableInfo.reportedLoserSide !== null &&
                tableInfo.reportedLoserSide !== undefined && (
                  <p style={{ marginTop: 8 }}>
                    記録サイド：{tableInfo.reportedWinnerSide}-
                    {tableInfo.reportedLoserSide}
                  </p>
                )}
            </>
          ) : tableInfo.pendingWinnerId === playerId ? (
            <>
              <p
                style={{
                  marginTop: 20,
                  color: "orange",
                  fontWeight: "bold",
                }}
              >
                あなたが勝利申請中です
              </p>

              {tableInfo.reportedWinnerSide !== null &&
                tableInfo.reportedWinnerSide !== undefined &&
                tableInfo.reportedLoserSide !== null &&
                tableInfo.reportedLoserSide !== undefined && (
                  <p style={{ marginTop: 8 }}>
                    申請サイド：{tableInfo.reportedWinnerSide}-
                    {tableInfo.reportedLoserSide}
                  </p>
                )}
            </>
          ) : tableInfo.pendingWinnerId ? (
            <p
              style={{
                marginTop: 20,
                color: "orange",
                fontWeight: "bold",
              }}
            >
              相手が勝利申請中です
            </p>
          ) : null}

          {showResultInput && (
            <div
              style={{
                marginTop: 24,
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: 16,
              }}
            ><div style={{ marginTop: 16, marginBottom: 16 }}>
            <button
              onClick={handleFinishMatch}
              style={{
                width: "100%",
                padding: "14px",
                borderRadius: 10,
                border: "none",
                background: "#2563eb",
                color: "white",
                fontSize: 18,
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              対戦終了
            </button>
          </div>
              <div style={{ marginBottom: 12, fontWeight: "bold" }}>
                勝ち申請入力
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={{ display: "block", marginBottom: 6 }}>
                  相手のデッキ名
                </label>
                <input
                  type="text"
                  value={opponentDeckInput}
                  onChange={(e) => setOpponentDeckInput(e.target.value)}
                  placeholder="例：サーナイト"
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

              <div style={{ marginBottom: 16 }}>
                <label style={{ display: "block", marginBottom: 6 }}>
                  サイド
                </label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <select
                    value={mySide}
                    onChange={(e) => setMySide(e.target.value)}
                    style={{
                      padding: "10px 14px",
                      border: "1px solid #ccc",
                      borderRadius: 8,
                      fontSize: 16,
                    }}
                  >
                    <option value="0">0</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                  </select>
                  <div>-</div>
                  <select
                    value={opponentSide}
                    onChange={(e) => setOpponentSide(e.target.value)}
                    style={{
                      padding: "10px 14px",
                      border: "1px solid #ccc",
                      borderRadius: 8,
                      fontSize: 16,
                    }}
                  >
                    <option value="0">0</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                  </select>
                </div>
              </div>

              <button
                onClick={handleWinRequest}
                disabled={savingRequest}
                style={{
                  padding: "12px 24px",
                  fontSize: 18,
                  border: "none",
                  borderRadius: 10,
                  backgroundColor: savingRequest ? "#999" : "orange",
                  color: "white",
                  cursor: savingRequest ? "default" : "pointer",
                }}
              >
                {savingRequest ? "申請中..." : "勝ち申請"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}