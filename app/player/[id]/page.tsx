"use client";

import { useEffect, useMemo, useState } from "react";
import { db } from "../../../lib/firebase";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";

type PlayerData = {
  name: string;
  history: string;
  rank: string;
  deck: string;
  tags?: any;
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
  opponentId?: string;
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
  const [waitingCount, setWaitingCount] = useState(0);
  const [showWaitingList, setShowWaitingList] = useState(false);
const [waitingPlayersList, setWaitingPlayersList] = useState<
  { id: string; name: string; rank?: string }[]
>([]);
useEffect(() => {
  const q = query(collection(db, "players"));

  const unsubscribe = onSnapshot(q, (snapshot) => {
    const allWaiting = snapshot.docs
      .map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          name: data.name || "",
          rank: data.rank || "",
          status: data.status ?? "waiting",
        };
      })
      .filter(
        (p) =>
          p.status === "waiting" &&
          p.id !== playerId
      );

    setWaitingCount(allWaiting.length);
    setWaitingPlayersList(
      allWaiting.map((p) => ({
        id: p.id,
        name: p.name,
        rank: p.rank,
      }))
    );
  });

  return () => unsubscribe();
}, [playerId]);
  
  const canNextMatch = waitingCount >= 2;
  const handleFinishMatch = async () => {
    if (!playerId || !player || !tableInfo) return;
  
    try {
      const opponentId =
        tableInfo.player1?.id === playerId
          ? tableInfo.player2?.id ?? null
          : tableInfo.player1?.id ?? null;
  
      await updateDoc(doc(db, "players", playerId), {
        status: "waiting",
        currentMatchId: null,
      });
  
      if (opponentId) {
        await updateDoc(doc(db, "players", opponentId), {
          status: "waiting",
          currentMatchId: null,
        });
      }
  
      alert("対戦を終了しました");
    } catch (error) {
      console.error(error);
      alert("対戦終了処理に失敗しました");
    }
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

  const handleNextMatch = async () => {
    if (!playerId || !player || !tableInfo) return;
  
    try {
      // 1. プレイヤー一覧
      const playersSnap = await getDocs(collection(db, "players"));
  
      // 2. 過去対戦履歴（同じ人回避用）
      const historySnap = await getDocs(
        collection(db, "events", "default", "matches")
      );
  
      // 3. 卓管理用（実際に卓を再利用するのは matchResults）
      const boardSnap = await getDocs(collection(db, "matchResults"));
  
      const pastOpponentIds = new Set<string>();
  
      historySnap.docs.forEach((docSnap) => {
        const data = docSnap.data();
  
        if (data.player1Id === playerId && data.player2Id) {
          pastOpponentIds.add(data.player2Id);
        }
  
        if (data.player2Id === playerId && data.player1Id) {
          pastOpponentIds.add(data.player1Id);
        }
      });
  
      // waiting の人（自分以外）
      const allWaitingPlayers = playersSnap.docs
        .map((docSnap: any) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
        .filter(
          (p: any) =>
            p.id !== playerId &&
            (p.status ?? "waiting") === "waiting"
        );
  
      // 未対戦優先
      let waitingPlayers = allWaitingPlayers.filter(
        (p: any) => !pastOpponentIds.has(p.id)
      );
      // 全員と対戦済みなら再戦OK
    if (waitingPlayers.length === 0) {
      waitingPlayers = allWaitingPlayers;
    }

    if (waitingPlayers.length === 0) {
      alert("現在マッチできる待機相手がいません");
      return;
    }

    const opponent = waitingPlayers[0];

    // 卓の再利用先を探す
    const allBoards = boardSnap.docs.map((docSnap: any) => ({
      id: docSnap.id,
      ...(docSnap.data() as any),
    }));

    const reusableTables = allBoards
      .flatMap((match: any) =>
        (match.tables ?? []).map((table: any) => ({
          ...table,
          matchId: match.id,
        }))
      )
      .filter((table: any) => !table.started || table.finished === true)
      .sort((a: any, b: any) => a.tableNumber - b.tableNumber);

    if (reusableTables.length === 0) {
      alert("空いている卓がありません");
      return;
    }

    const reusableTable = reusableTables[0];

    const targetBoard = allBoards.find(
      (match: any) => match.id === reusableTable.matchId
    );

    if (!targetBoard) {
      alert("再利用する卓が見つかりません");
      return;
    }

    const updatedTables = (targetBoard.tables ?? []).map((table: any) =>
      table.tableNumber === reusableTable.tableNumber
        ? {
            ...table,
            player1: {
              id: playerId,
              name: player.name,
              rank: player.rank,
              deck: player.deck ?? "",
            },
            player2: {
              id: opponent.id,
              name: opponent.name,
              rank: opponent.rank,
              deck: opponent.deck ?? "",
            },
            started: true,
            finished: false,
            pendingWinnerId: null,
            winnerId: null,
            reportedById: null,
            reportedOpponentDeck: null,
            reportedWinnerSide: null,
            reportedLoserSide: null,
            reportedWinnerDeck: null,
          }
        : table
    );

    // 盤面更新
    await updateDoc(doc(db, "matchResults", targetBoard.id), {
      tables: updatedTables,
    });
    // 履歴保存（次回の同じ相手回避に使う）
    await addDoc(collection(db, "events", "default", "matches"), {
      eventId: "default",
      player1Id: playerId,
      player1Name: player.name,
      player2Id: opponent.id,
      player2Name: opponent.name,
      status: "playing",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // 両者を playing にする
    await Promise.all([
      updateDoc(doc(db, "players", playerId), {
        status: "playing",
      }),
      updateDoc(doc(db, "players", opponent.id), {
        status: "playing",
      }),
    ]);

    alert(`卓${reusableTable.tableNumber}で ${opponent.name} さんと対戦です`);
    window.location.reload();
  } catch (error) {
    console.error(error);
    alert("次の対戦の作成に失敗しました");
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
    
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 18 }}>
            参加者情報
          </div>
    
          <div>
            名前：{player.name}
          </div>
    
          <div
            style={{
              fontWeight: 700,
              fontSize: 18,
              color:
                player.rank === "モンスターボール級"
                  ? "#ef4444"
                  : player.rank === "スーパーボール級"
                  ? "#3b82f6"
                  : "#facc15",
            }}
          >
            階級：{player.rank}
          </div>
    
          <div>
            使用デッキ：{player.deck || "未設定"}
          </div>
        </div>
        <hr style={{ margin: "20px 0" }} />

    {!tableInfo ? (
      <p>まだ対戦がありません</p>
    ) : (
      <div>
        <p>卓番号：卓{tableInfo.tableNumber}</p>

        <p>
          対戦相手：
          <span style={opponentNameStyle}>
            {opponent ? opponent.name : "不在"}
          </span>
        </p>

        <p>
          階級：
          <span
            style={{
              fontWeight: 700,
              color:
                opponent?.rank === "モンスターボール級"
                  ? "#ef4444"
                  : opponent?.rank === "スーパーボール級"
                  ? "#3b82f6"
                  : "#facc15",
            }}
          >
            {opponent?.rank || "不明"}
          </span>
        </p>

        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: 10,
            padding: 16,
            marginTop: 16,
            marginBottom: 16,
          }}
        >
          <div>あなた：{player.name}</div>
          <div>相手：{opponent?.name || "不在"}</div>
          <div>相手デッキ：？？？</div>
        </div>

        {tableInfo.pendingWinnerId && tableInfo.pendingWinnerId !== playerId ? (
          <p style={{ color: "orange", fontWeight: "bold" }}>
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
          >
            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <button
                onClick={handleFinishMatch}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: 10,
                  border: "none",
                  background:"#2563eb",
                  color: "white",
                  fontSize: 18,
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                対戦終了
              </button>
            </div>
            <div style={{ marginTop: 16, marginBottom: 16 }}>
              <button
                onClick={handleNextMatch}
                disabled={!canNextMatch}
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: 10,
                  border: "none",
                  background: canNextMatch ? "#16a34a" : "#9ca3af",
                  color: "white",
                  fontSize: 18,
                  fontWeight: "bold",
                  cursor: canNextMatch ? "pointer" : "not-allowed",
                  opacity: canNextMatch ? 1 : 0.7,
                }}
              >
                {canNextMatch ? "次の対戦" : "待機中2人以上で対戦可能"}
              </button>
            </div>

            <div style={{ marginTop: 12 }}>
              <button
                onClick={() => setShowWaitingList((prev) => !prev)}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  background: "#f3f4f6",
                  color: "#111827",
                  fontSize: 16,
                  fontWeight: "bold",
                  cursor: "pointer",
                }}
              >
                {showWaitingList
                  ? "待機中一覧を閉じる"
                  : `待機中一覧を見る（${waitingCount}人）`}
              </button>
            </div>

            <div
              style={{
                marginTop: 12,
                border: "1px solid #ddd",
                borderRadius: 10,
                padding: 12,
                background: "#fafafa",
              }}
            >
              <div style={{ fontWeight: "bold", marginBottom: 8 }}>
                待機中の人
              </div>
              {showWaitingList && (
                <div style={{ marginTop: 8 }}>
                  {waitingPlayersList.length === 0 ? (
                    <div style={{ color: "#666" }}>待機中の人はいません</div>
                  ) : (
                    waitingPlayersList.map((p) => (
                      <div
                        key={p.id}
                        style={{
                          padding: "8px 0",
                          borderBottom: "1px solid #eee",
                        }}
                      >
                        {p.name} {p.rank ? `(${p.rank})` : ""}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )}
  </div>
);
}