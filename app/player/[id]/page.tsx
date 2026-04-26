"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "../../../lib/firebase";
import {
  casualMatchBucketRank,
  getNextAvailableTableNumber,
  pickBestWaitingOpponentForCasual,
} from "@/lib/matches";
import { sendCasualGood } from "@/lib/good";
import { loadCasualPairingSettings } from "@/lib/casualMatchSettings";
import type { BadgeId, PlayStyleKey } from "@/lib/playerBadges";
import {
  badgesWithLabels,
  normalizeBadges,
  normalizePlayStyle,
  participantSummaryLine,
  playStyleLine,
} from "@/lib/playerBadges";
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
  playStyle: PlayStyleKey;
  badges: BadgeId[];
};

type MatchPlayer = {
  id: string;
  name: string;
  rank: string;
  deck?: string;
  playStyle: PlayStyleKey;
  badges: BadgeId[];
};

type ActiveMatch = {
  id: string;
  tableNumber: number;
  player1Id: string;
  player1Name: string;
  player2Id: string | null;
  player2Name: string | null;
  status: "scheduled" | "playing" | "finished";
  roundEndAt?: number | null;
  player1GoodSent?: boolean;
  player2GoodSent?: boolean;
  /** 大会個人戦卓は `tournament_individual` — 交流会は `casual` または未設定 */
  matchType?: string | null;
};

/** 交流会 VS 画面：相手階級の表示色 */
function casualOpponentRankColor(rank: string): string {
  const r = rank.trim();
  if (r === "モンスターボール級") return "#f87171";
  if (r === "スーパーボール級") return "#60a5fa";
  if (r === "ハイパーボール級") return "#eab308";
  return "#cbd5e1";
}
export default function PlayerPage() {
  const params = useParams<{ id?: string }>();
  const router = useRouter();
  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [playerId, setPlayerId] = useState("");
  const [tableInfo, setTableInfo] = useState<ActiveMatch | null>(null);
  const [opponent, setOpponent] = useState<MatchPlayer | null>(null);
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
  const [showOtherOpsMenu, setShowOtherOpsMenu] = useState(false);
  const [waitingPlayersList, setWaitingPlayersList] = useState<
    { id: string; name: string; rank?: string; summary: string }[]
  >([]);
  const [sendingGood, setSendingGood] = useState(false);
  const [crossRankDialog, setCrossRankDialog] = useState<{
    opponentId: string;
    opponentName: string;
    opponentRank: string;
  } | null>(null);
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
          status: data.status || "",
          summary: participantSummaryLine(
            normalizePlayStyle(data),
            normalizeBadges(data)
          ),
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
        summary: p.summary,
      }))
    );
  });

  return () => unsubscribe();
}, [playerId]);
  
  const canNextMatch = waitingCount >= 1;
  const handleFinishMatch = async () => {
    if (!playerId || !player || !tableInfo) return;
  
    try {
      const opponentId =
        tableInfo.player1Id === playerId ? tableInfo.player2Id : tableInfo.player1Id;
  
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

      await updateDoc(doc(db, "events", "default", "matches", tableInfo.id), {
        status: "finished",
        updatedAt: serverTimestamp(),
      });
  
      alert("対戦を終了しました");
    } catch (error) {
      console.error(error);
      alert("対戦終了処理に失敗しました");
    }
  };

  const handleSendNiceMatch = async () => {
    if (!playerId || !tableInfo) return;
    const opponentId =
      tableInfo.player1Id === playerId ? tableInfo.player2Id : tableInfo.player1Id;
    if (!opponentId || opponentId === playerId) {
      alert("対戦相手がいません");
      return;
    }
    const isP1 = tableInfo.player1Id === playerId;
    if (isP1 && tableInfo.player1GoodSent) return;
    if (!isP1 && tableInfo.player2GoodSent) return;

    setSendingGood(true);
    try {
      await sendCasualGood("default", tableInfo.id, playerId);
      alert("ナイス対戦を送りました");
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error ? error.message : "送信に失敗しました"
      );
    } finally {
      setSendingGood(false);
    }
  };

  const handleOpenMatchSheet = () => {
    if (!playerId) return;
    const q = new URLSearchParams();
    q.set("playerId", playerId);
    if (tableInfo?.id) q.set("matchId", tableInfo.id);
    const opponentId =
      tableInfo?.player1Id === playerId ? tableInfo?.player2Id : tableInfo?.player1Id;
    if (opponentId) q.set("opponentId", opponentId);
    router.push(`/match-sheet?${q.toString()}`);
  };

  const handleRequestRematch = () => {
    if (!tableInfo || !opponent) {
      alert("対戦中に利用できます");
      return;
    }
    alert("再戦希望を送信しました");
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const id = params?.id;

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
          tags: playerData.tags,
          playStyle: normalizePlayStyle(playerData),
          badges: normalizeBadges(playerData),
        });
      } catch (error) {
        console.error(error);
      }
    };

    fetchPlayer();

    const matchesQuery = query(
      collection(db, "events", "default", "matches"),
      orderBy("createdAt", "desc")
    );
    
    const unsubscribe = onSnapshot(matchesQuery, (snapshot) => {
      if (snapshot.empty) {
        setTableInfo(null);
        setLatestMatchId("");
        setRoundEndAt(null);
        setLoading(false);
        return;
      }
    
      const matchedDoc = snapshot.docs.find((docSnap) => {
        const data = docSnap.data();
        return (
          data.status === "playing" &&
          (data.player1Id === id || data.player2Id === id)
        );
      });
    
      if (!matchedDoc) {
        setTableInfo(null);
        setLatestMatchId("");
        setRoundEndAt(null);
        setLoading(false);
        return;
      }
    
      const matchedData = matchedDoc.data();
    
      setLatestMatchId(matchedDoc.id);
      setTableInfo({
        id: matchedDoc.id,
        tableNumber: Math.max(1, matchedData.tableNumber ?? 1),
        player1Id: matchedData.player1Id ?? "",
        player1Name: matchedData.player1Name ?? "",
        player2Id: matchedData.player2Id ?? null,
        player2Name: matchedData.player2Name ?? null,
        status: matchedData.status ?? "playing",
        roundEndAt: matchedData.roundEndAt ?? null,
        player1GoodSent: matchedData.player1GoodSent === true,
        player2GoodSent: matchedData.player2GoodSent === true,
        matchType:
          typeof matchedData.matchType === "string"
            ? matchedData.matchType
            : null,
      });
    
      setRoundEndAt(matchedData.roundEndAt ?? null);
      setLoading(false);
    });
    return () => unsubscribe();
  }, [params?.id]);

  useEffect(() => {
    const loadOpponent = async () => {
      if (!tableInfo || !playerId) {
        setOpponent(null);
        return;
      }
      const opponentId =
        tableInfo.player1Id === playerId ? tableInfo.player2Id : tableInfo.player1Id;
      if (!opponentId) {
        setOpponent(null);
        return;
      }
      const snap = await getDoc(doc(db, "players", opponentId));
      if (!snap.exists()) {
        setOpponent(null);
        return;
      }
      const data = snap.data();
      setOpponent({
        id: snap.id,
        name: data.name || "",
        rank: data.rank || "",
        deck: data.deck || "",
        playStyle: normalizePlayStyle(data),
        badges: normalizeBadges(data),
      });
    };
    loadOpponent().catch(console.error);
  }, [tableInfo, playerId]);

  const finalizeNextMatch = async (opponent: { id: string; name: string }) => {
    if (!playerId || !player || !tableInfo) return;

    const previousOpponentId =
      tableInfo.player1Id === playerId ? tableInfo.player2Id : tableInfo.player1Id;

    await updateDoc(doc(db, "events", "default", "matches", tableInfo.id), {
      status: "finished",
      updatedAt: serverTimestamp(),
    });
    if (previousOpponentId && previousOpponentId !== opponent.id) {
      await updateDoc(doc(db, "players", previousOpponentId), {
        status: "waiting",
        currentMatchId: null,
      });
    }

    const tableNumber = await getNextAvailableTableNumber("default");
    const newMatchRef = await addDoc(
      collection(db, "events", "default", "matches"),
      {
        eventId: "default",
        matchType: "casual",
        player1Id: playerId,
        player1Name: player.name,
        player2Id: opponent.id,
        player2Name: opponent.name,
        tableNumber: Math.max(1, tableNumber),
        status: "playing",
        player1GoodSent: false,
        player2GoodSent: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }
    );

    await Promise.all([
      updateDoc(doc(db, "players", playerId), {
        status: "playing",
        currentMatchId: newMatchRef.id,
      }),
      updateDoc(doc(db, "players", opponent.id), {
        status: "playing",
        currentMatchId: newMatchRef.id,
      }),
    ]);

    alert(`卓${Math.max(1, tableNumber)}で ${opponent.name} さんと対戦です`);
    window.location.reload();
  };

  const handleNextMatch = async () => {
    if (!playerId || !player || !tableInfo) return;

    try {
      const { rankPriority, avoidRematch } = await loadCasualPairingSettings();

      const playersSnap = await getDocs(collection(db, "players"));
      const historySnap = await getDocs(
        collection(db, "events", "default", "matches")
      );

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

      const myRank = (player.rank || "").trim();

      const allWaitingPlayers = playersSnap.docs
        .map((docSnap: any) => ({ id: docSnap.id, ...(docSnap.data() as any) }))
        .filter(
          (p: any) => p.id !== playerId && p.status === "waiting"
        );

      const candidates = allWaitingPlayers.map((p: any) => ({
        id: p.id,
        name: p.name || "",
        rank: p.rank,
      }));

      const best = pickBestWaitingOpponentForCasual(
        myRank,
        candidates,
        pastOpponentIds,
        rankPriority,
        avoidRematch
      );

      if (!best) {
        alert("現在マッチできる待機相手がいません");
        return;
      }

      const myBucket = casualMatchBucketRank(myRank);
      const hasSameRankWaiter = candidates.some(
        (c) => casualMatchBucketRank(c.rank) === myBucket
      );
      const bestBucket = casualMatchBucketRank(best.rank);

      if (rankPriority && !hasSameRankWaiter && myBucket !== bestBucket) {
        setCrossRankDialog({
          opponentId: best.id,
          opponentName: best.name,
          opponentRank: best.rank,
        });
        return;
      }

      await finalizeNextMatch({ id: best.id, name: best.name });
    } catch (error) {
      console.error(error);
      alert("次の対戦の作成に失敗しました");
    }
  };

  const confirmCrossRankMatch = async () => {
    if (!crossRankDialog) return;
    const opp = {
      id: crossRankDialog.opponentId,
      name: crossRankDialog.opponentName,
    };
    setCrossRankDialog(null);
    try {
      await finalizeNextMatch(opp);
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

  const isTournamentIndividualMatch =
    tableInfo?.matchType === "tournament_individual";

  useEffect(() => {
    if (typeof document === "undefined") return;
    const cls = "player-neon-page";
    const useNeon =
      loading || !player || !isTournamentIndividualMatch;
    if (useNeon) document.body.classList.add(cls);
    else document.body.classList.remove(cls);
    return () => {
      document.body.classList.remove(cls);
    };
  }, [loading, player, isTournamentIndividualMatch]);

  /**
   * 【交流会 UI ルール】変更は見た目・スタイル・レイアウトのみ。
   * 交流会では自分の名前は表示しない（待機・マッチ後とも）。
   *
   * 【以下変更しない】
   * ・Firestore のドキュメント構造・フィールド名
   * ・マッチング／対戦作成・終了・ナイス送信などの処理ロジック
   * ・ボタンの onClick / disabled / 条件分岐（見た目以外）
   * ・大会個人戦（tournament_individual）の UI ブランチ
   * ・購読・データ取得の流れ
   *
   * ・背景は CSS（グラデ・ぼかし・影）のみ。url() 背景画像は使わない。
   * ・スマホファースト：安全余白・折り返し・はみ出し防止を優先。
   * ・タップ領域は主ボタン minHeight 54px 以上を目安。
   */
  /** 交流会：中央レイアウトのみ（背景は body.player-neon-page） */
  const casualPageContainer: React.CSSProperties = {
    width: "100%",
    maxWidth: 480,
    margin: "0 auto",
    padding:
      "max(12px, env(safe-area-inset-top)) max(16px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(16px, env(safe-area-inset-left))",
    boxSizing: "border-box",
    color: "#e2e8f0",
    overflowX: "hidden",
  };

  /** 交流会・VS 対戦＋操作：青 vs 赤のネオン対戦風ガラス（画像なし） */
  const casualVsUnifiedCard: React.CSSProperties = {
    background:
      "linear-gradient(165deg, rgba(59,130,246,0.12) 0%, rgba(255,255,255,0.06) 42%, rgba(239,68,68,0.1) 100%)",
    backdropFilter: "blur(18px)",
    WebkitBackdropFilter: "blur(18px)",
    borderRadius: 20,
    border: "1px solid rgba(255,255,255,0.2)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.1), inset 0 -1px 0 rgba(0,0,0,0.15), 0 0 0 1px rgba(59,130,246,0.12), 0 0 36px rgba(37,99,235,0.2), 0 0 36px rgba(220,38,38,0.12), 0 16px 48px rgba(2,6,23,0.55)",
    padding: "22px clamp(14px, 4vw, 22px) 24px",
    maxWidth: "100%",
    boxSizing: "border-box",
    textAlign: "center",
    WebkitTapHighlightColor: "transparent",
    overflowX: "hidden",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
  };

  /** 交流会・対戦相手名：常に1行・長い場合は省略（親は minmax(0,1fr) 等で幅を渡す） */
  const casualOpponentNameOneLineBase: React.CSSProperties = {
    display: "block",
    width: "100%",
    minWidth: 0,
    boxSizing: "border-box",
    fontWeight: 800,
    lineHeight: 1.12,
    letterSpacing: "0.02em",
    color: "#fff7ed",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    overflowWrap: "normal",
    wordBreak: "normal",
    textShadow:
      "0 0 14px rgba(251,113,133,0.65), 0 0 28px rgba(220,38,38,0.4), 0 2px 8px rgba(2,6,23,0.65)",
  };

  /** 対戦相手名（大・1行・中央） */
  const casualOpponentNameInArena: React.CSSProperties = {
    ...casualOpponentNameOneLineBase,
    textAlign: "center",
    fontSize: 28,
    fontWeight: "bold",
  };

  /** 対戦相手＋名前（自分名は出さない） */
  const casualVsArenaStrip: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    marginTop: 6,
    marginBottom: 14,
    padding: "14px 10px 16px",
    borderRadius: 16,
    background:
      "linear-gradient(110deg, rgba(15,23,42,0.45) 0%, rgba(220,38,38,0.18) 100%)",
    boxShadow:
      "inset 0 0 28px rgba(0,0,0,0.2), inset 0 1px 0 rgba(255,255,255,0.06)",
  };

  /** 待機一覧まわり（サブ扱い・控えめ） */
  const casualMatchSubGlass: React.CSSProperties = {
    marginTop: 12,
    padding: "12px 12px 14px",
    borderRadius: 12,
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(99,102,241,0.22)",
    textAlign: "left",
  };

  const casualMatchPrimaryBtn: React.CSSProperties = {
    width: "100%",
    minWidth: 0,
    minHeight: 54,
    padding: "0 16px",
    borderRadius: 14,
    border: "none",
    fontSize: 17,
    fontWeight: 700,
    cursor: "pointer",
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    touchAction: "manipulation",
    WebkitTapHighlightColor: "transparent",
    overflowWrap: "anywhere",
    wordBreak: "break-word",
    textAlign: "center",
  };

  const casualMatchSecondaryBtn: React.CSSProperties = {
    ...casualMatchPrimaryBtn,
    minHeight: 52,
    border: "1px solid rgba(255,255,255,0.28)",
    background: "rgba(255,255,255,0.06)",
    color: "rgba(248,250,252,0.9)",
    fontWeight: 600,
    fontSize: 16,
  };

  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          minHeight: "100vh",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <p style={{ fontSize: 16, color: "rgba(255,255,255,0.9)" }}>
          読み込み中...
        </p>
      </div>
    );
  }

  if (!player) {
    return (
      <div style={casualPageContainer}>
        <p style={{ color: "rgba(255,255,255,0.9)" }}>
          参加者情報が見つかりません
        </p>
      </div>
    );
  }

  const showResultInput =
    !!tableInfo &&
    tableInfo.status === "playing";

  const isPlayer1 =
    !!tableInfo && tableInfo.player1Id === playerId;
  const niceAlreadySent = tableInfo
    ? isPlayer1
      ? tableInfo.player1GoodSent === true
      : tableInfo.player2GoodSent === true
    : false;
  const canSendNice =
    !!tableInfo &&
    tableInfo.status === "playing" &&
    !!opponent &&
    opponent.id !== playerId;

  return (
    <>
      {isTournamentIndividualMatch ? (
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
          <div style={{ fontSize: 15, marginTop: 6, fontWeight: 600 }}>
            {playStyleLine(player.playStyle)}
          </div>
          {player.badges.length > 0 ? (
            <div style={{ fontSize: 13, color: "#4b5563", marginTop: 4, lineHeight: 1.5 }}>
              {badgesWithLabels(player.badges)}
            </div>
          ) : null}

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
       <div
  style={{
    fontSize: 32,
    fontWeight: "bold",
    textAlign: "center",
    margin: "10px 0"
  }}
>
  卓番号 {tableInfo.tableNumber}
</div>

        <p>
          対戦相手：
          <span>
            {opponent ? opponent.name : "不在"}
          </span>
        </p>
        {opponent ? (
          <>
            <p style={{ fontSize: 15, fontWeight: 600, marginTop: 6 }}>
              {playStyleLine(opponent.playStyle)}
            </p>
            {opponent.badges.length > 0 ? (
              <p style={{ fontSize: 13, color: "#4b5563", marginTop: 4, lineHeight: 1.5 }}>
                {badgesWithLabels(opponent.badges)}
              </p>
            ) : null}
          </>
        ) : null}

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
          <div style={{ fontWeight: 700 }}>あなた：{player.name}</div>
          <div style={{ fontSize: 14, marginTop: 4 }}>
            {playStyleLine(player.playStyle)}
            {player.badges.length > 0
              ? ` ${badgesWithLabels(player.badges)}`
              : ""}
          </div>
          <div style={{ marginTop: 12, fontWeight: 700 }}>
            相手：{opponent?.name || "不在"}
          </div>
          {opponent ? (
            <div style={{ fontSize: 14, marginTop: 4 }}>
              {playStyleLine(opponent.playStyle)}
              {opponent.badges.length > 0
                ? ` ${badgesWithLabels(opponent.badges)}`
                : ""}
            </div>
          ) : null}
          <div>相手デッキ：？？？</div>
        </div>

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
                type="button"
                onClick={() => void handleSendNiceMatch()}
                disabled={
                  !canSendNice || niceAlreadySent || sendingGood
                }
                style={{
                  width: "100%",
                  padding: "14px",
                  borderRadius: 10,
                  border: "none",
                  ...((!canSendNice || niceAlreadySent) && !sendingGood
                    ? {
                        backgroundColor: "#9ca3af",
                        backgroundImage: "none",
                      }
                    : {
                        backgroundImage:
                          "linear-gradient(to right, #ec4899, #a855f7)",
                      }),
                  color: "white",
                  fontSize: 18,
                  fontWeight: "bold",
                  cursor:
                    !canSendNice || niceAlreadySent || sendingGood
                      ? "not-allowed"
                      : "pointer",
                  opacity:
                    !canSendNice || niceAlreadySent ? 0.75 : 1,
                }}
              >
                {niceAlreadySent
                  ? "送信済み"
                  : sendingGood
                    ? "送信中…"
                    : "ナイス対戦を送る"}
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
                {canNextMatch ? "次の対戦" : "待機中1人以上で対戦可能"}
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
                        <div style={{ fontWeight: 700 }}>
                          {p.name} {p.rank ? `(${p.rank})` : ""}
                        </div>
                        <div style={{ fontSize: 12, color: "#555", marginTop: 4 }}>
                          {p.summary}
                        </div>
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
      ) : (
      <div style={casualPageContainer}>
        {!tableInfo ? (
          <>
            <div
              style={{
                textAlign: "center",
                marginBottom: 20,
                fontSize: 28,
                fontWeight: "bold",
                color:
                  remainingSeconds === null
                    ? "rgba(248,250,252,0.55)"
                    : remainingSeconds === 0
                      ? "#fca5a5"
                      : "#93c5fd",
              }}
            >
              ラウンドタイマー：{timerText}
            </div>

            <div style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 18, color: "#f8fafc" }}>
                参加者情報
              </div>

              <div style={{ fontSize: 15, marginTop: 6, fontWeight: 600 }}>
                {playStyleLine(player.playStyle)}
              </div>
              {player.badges.length > 0 ? (
                <div
                  style={{
                    fontSize: 13,
                    color: "rgba(226,232,240,0.88)",
                    marginTop: 4,
                    lineHeight: 1.5,
                  }}
                >
                  {badgesWithLabels(player.badges)}
                </div>
              ) : null}

              <div
                style={{
                  fontWeight: 700,
                  fontSize: 18,
                  color:
                    player.rank === "モンスターボール級"
                      ? "#fca5a5"
                      : player.rank === "スーパーボール級"
                        ? "#93c5fd"
                        : "#fde047",
                }}
              >
                階級：{player.rank}
              </div>

              <div style={{ color: "#e2e8f0" }}>
                使用デッキ：{player.deck || "未設定"}
              </div>
            </div>
            <hr style={{ margin: "20px 0", borderColor: "rgba(255,255,255,0.22)" }} />
            <p style={{ color: "rgba(248,250,252,0.92)" }}>まだ対戦がありません</p>
          </>
        ) : (
          <>
            <div style={casualVsUnifiedCard}>
              <div
                style={{
                  width: "100%",
                  textAlign: "center",
                  marginBottom: 16,
                }}
              >
                <div
                  style={{
                    display: "inline-block",
                    fontSize: "clamp(1.85rem, 6vw + 0.5rem, 2.75rem)",
                    fontWeight: 800,
                    lineHeight: 1.1,
                    color: "#f8fafc",
                    letterSpacing: "0.06em",
                    textShadow:
                      "0 0 20px rgba(147,197,253,0.55), 0 0 40px rgba(59,130,246,0.35), 0 2px 0 rgba(15,23,42,0.5)",
                  }}
                >
                  卓番号 {tableInfo.tableNumber}
                </div>
              </div>

              <div style={casualVsArenaStrip}>
                <div
                  style={{
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 4,
                    textAlign: "center",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.14em",
                      color: "rgba(254,215,170,0.85)",
                    }}
                  >
                    対戦相手
                  </div>
                  <div
                    title={opponent ? opponent.name : "不在"}
                    style={casualOpponentNameInArena}
                  >
                    {opponent ? opponent.name : "不在"}
                  </div>
                </div>
              </div>

              {opponent ? (
                <div
                  style={{
                    marginTop: 0,
                    padding: "14px 12px 14px",
                    borderRadius: 12,
                    background: "rgba(2,6,23,0.35)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: "rgba(248,250,252,0.5)",
                      marginBottom: 6,
                    }}
                  >
                    相手階級
                  </div>
                  <div
                    style={{
                      fontSize: "clamp(1rem, 3.5vw, 1.15rem)",
                      fontWeight: 800,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      color: casualOpponentRankColor(opponent.rank || ""),
                    }}
                  >
                    {opponent.rank || "不明"}
                  </div>
                  <div
                    style={{
                      margin: "12px 0",
                      height: 1,
                      background: "rgba(255,255,255,0.08)",
                    }}
                  />
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.08em",
                      color: "rgba(248,250,252,0.5)",
                      marginBottom: 6,
                    }}
                  >
                    相手のプレイスタイル
                  </div>
                  <div
                    style={{
                      fontSize: "clamp(0.95rem, 3.2vw, 1.05rem)",
                      fontWeight: 600,
                      color: "rgba(248,250,252,0.95)",
                      lineHeight: 1.45,
                    }}
                  >
                    {playStyleLine(opponent.playStyle)}
                  </div>
                </div>
              ) : (
                <div
                  style={{
                    marginTop: 0,
                    fontSize: 16,
                    color: "rgba(226,232,240,0.85)",
                    padding: "14px 12px",
                    borderRadius: 12,
                    background: "rgba(2,6,23,0.35)",
                    border: "1px solid rgba(255,255,255,0.08)",
                    textAlign: "center",
                  }}
                >
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "rgba(248,250,252,0.5)",
                      marginBottom: 6,
                    }}
                  >
                    相手階級
                  </div>
                  <span
                    style={{
                      fontWeight: 800,
                      color: casualOpponentRankColor(""),
                    }}
                  >
                    不明
                  </span>
                </div>
              )}

              <div
                style={{
                  marginTop: 22,
                  paddingTop: 22,
                  borderTop: "1px solid rgba(255,255,255,0.14)",
                }}
              >
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    color: "rgba(248,250,252,0.45)",
                    marginBottom: 12,
                    textAlign: "center",
                  }}
                >
                  操作
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    width: "100%",
                  }}
                >
                  <button
                    type="button"
                    onClick={handleNextMatch}
                    disabled={!canNextMatch}
                    style={{
                      ...casualMatchPrimaryBtn,
                      fontSize: canNextMatch ? 17 : 14,
                      lineHeight: canNextMatch ? 1.1 : 1.25,
                      whiteSpace: "normal",
                      padding: canNextMatch ? "0 16px" : "10px 16px",
                      background: canNextMatch
                        ? "#16a34a"
                        : "rgba(148,163,184,0.3)",
                      color: "white",
                      boxShadow: canNextMatch
                        ? "0 0 22px rgba(22,163,74,0.35), 0 4px 14px rgba(2,6,23,0.35)"
                        : "none",
                      cursor: canNextMatch ? "pointer" : "not-allowed",
                      opacity: canNextMatch ? 1 : 0.88,
                    }}
                  >
                    {canNextMatch ? "次の対戦へ" : "待機中1人以上で対戦可能"}
                  </button>
                  {showResultInput ? (
                    <>
                      <button
                        type="button"
                        onClick={handleFinishMatch}
                        style={{
                          ...casualMatchPrimaryBtn,
                          background: "#2563eb",
                          color: "white",
                          boxShadow:
                            "0 0 24px rgba(37,99,235,0.35), 0 4px 14px rgba(2,6,23,0.35)",
                        }}
                      >
                        対戦終了
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleSendNiceMatch()}
                        disabled={
                          !canSendNice || niceAlreadySent || sendingGood
                        }
                        style={{
                          ...casualMatchPrimaryBtn,
                          ...((!canSendNice || niceAlreadySent) && !sendingGood
                            ? {
                                background: "rgba(148,163,184,0.35)",
                                backgroundImage: "none",
                                color: "rgba(255,255,255,0.78)",
                                boxShadow: "none",
                              }
                            : {
                                backgroundImage:
                                  "linear-gradient(to right, #ec4899, #a855f7)",
                                color: "white",
                                boxShadow:
                                  "0 0 22px rgba(217,70,239,0.35), 0 4px 14px rgba(2,6,23,0.35)",
                              }),
                          cursor:
                            !canSendNice || niceAlreadySent || sendingGood
                              ? "not-allowed"
                              : "pointer",
                          opacity:
                            !canSendNice || niceAlreadySent ? 0.85 : 1,
                        }}
                      >
                        {niceAlreadySent
                          ? "送信済み"
                          : sendingGood
                            ? "送信中…"
                            : "Goodを送る"}
                      </button>
                    </>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setShowOtherOpsMenu((prev) => !prev)}
                    style={casualMatchSecondaryBtn}
                  >
                    {showOtherOpsMenu ? "その他の操作を閉じる" : "その他の操作"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowWaitingList((prev) => !prev)}
                    style={casualMatchSecondaryBtn}
                  >
                    {showWaitingList
                      ? "待機中一覧を閉じる"
                      : `待機人数を見る（${waitingCount}人）`}
                  </button>
                </div>

                {showOtherOpsMenu ? (
                  <div style={{ ...casualMatchSubGlass, marginTop: 12 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "rgba(248,250,252,0.5)",
                        marginBottom: 8,
                        letterSpacing: "0.03em",
                      }}
                    >
                      その他の操作
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <button
                        type="button"
                        onClick={handleRequestRematch}
                        style={casualMatchSecondaryBtn}
                      >
                        再戦を希望
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenMatchSheet}
                        style={casualMatchSecondaryBtn}
                      >
                        対戦シート入力
                      </button>
                    </div>
                  </div>
                ) : null}

                {showWaitingList ? (
                  <div style={{ ...casualMatchSubGlass, marginTop: 12 }}>
                    <div
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: "rgba(248,250,252,0.5)",
                        marginBottom: 8,
                        letterSpacing: "0.03em",
                      }}
                    >
                      待機中の人
                    </div>
                    {waitingPlayersList.length === 0 ? (
                      <div
                        style={{
                          fontSize: 14,
                          color: "rgba(248,250,252,0.55)",
                          lineHeight: 1.5,
                        }}
                      >
                        待機中の人はいません
                      </div>
                    ) : (
                      waitingPlayersList.map((p) => (
                        <div
                          key={p.id}
                          style={{
                            padding: "12px 0",
                            borderBottom:
                              "1px solid rgba(255,255,255,0.08)",
                          }}
                        >
                          <div
                            style={{
                              fontWeight: 600,
                              fontSize: 15,
                              color: "rgba(248,250,252,0.9)",
                              lineHeight: 1.35,
                            }}
                          >
                            {p.name}{" "}
                            {p.rank ? (
                              <span
                                style={{
                                  fontWeight: 500,
                                  fontSize: 13,
                                  color: "rgba(248,250,252,0.55)",
                                }}
                              >
                                ({p.rank})
                              </span>
                            ) : null}
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              color: "rgba(248,250,252,0.55)",
                              marginTop: 4,
                              lineHeight: 1.4,
                            }}
                          >
                            {p.summary}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            </div>
          </>
        )}
      </div>
      )}

    {crossRankDialog ? (
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="cross-rank-title"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 50,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
        }}
      >
        <button
          type="button"
          aria-label="オーバーレイを閉じる"
          onClick={() => setCrossRankDialog(null)}
          style={{
            position: "absolute",
            inset: 0,
            border: "none",
            background: "rgba(0,0,0,0.45)",
            cursor: "pointer",
          }}
        />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            margin: "0 auto",
            width: "100%",
            maxWidth: 520,
            boxSizing: "border-box",
            borderRadius: "16px 16px 0 0",
            background: "#fff",
            padding: "20px 20px 28px",
            boxShadow: "0 -8px 24px rgba(0,0,0,0.12)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <p
            id="cross-rank-title"
            style={{ fontWeight: 800, fontSize: 18, marginBottom: 12 }}
          >
            階級跨ぎマッチ
          </p>
          <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 20, color: "#374151" }}>
            現在同じ階級の対戦相手が見つかりませんでした。
            <br />
            {crossRankDialog.opponentRank}の「{crossRankDialog.opponentName}
            」さんと対戦しますか？
          </p>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              onClick={() => setCrossRankDialog(null)}
              style={{
                flex: 1,
                padding: "14px",
                borderRadius: 10,
                border: "1px solid #ccc",
                background: "#f3f4f6",
                fontSize: 16,
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={() => void confirmCrossRankMatch()}
              style={{
                flex: 1,
                padding: "14px",
                borderRadius: 10,
                border: "none",
                background: "#16a34a",
                color: "#fff",
                fontSize: 16,
                fontWeight: "bold",
                cursor: "pointer",
              }}
            >
              対戦する
            </button>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}