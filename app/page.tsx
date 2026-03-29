"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../lib/firebase";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  limit,
  increment,
  getDoc,
  getDocs,
  where
} from "firebase/firestore";

type Player = {
  id: string;
  name: string;
  history: string;
  rank: string;
  deck?: string;
  wins?: number;
  tags: {
    experience: "none" | "participated" | "winner";
    playStyle: "enjoy" | "serious";
  };
};

type MatchTable = {
  tableNumber: number;
  player1?: Player;
  player2?: Player;
  player1Team?: "A" | "B";
  player2Team?: "A" | "B";
  type: "same-rank" | "cross-rank" | "random" | "team-random";
  started?: boolean;
  pendingWinnerId?: string | null;
  winnerId?: string | null;

  reportedById?: string | null;
  reportedOpponentDeck?: string | null;
  reportedWinnerSide?: number | null;
  reportedLoserSide?: number | null;
  reportedWinnerDeck?: string | null;
};

type SavedMatchTable = {
  tableNumber: number;
  type: "same-rank" | "cross-rank" | "random" | "team-random";
  player1Team?: "A" | "B";
  player2Team?: "A" | "B";
  started?: boolean;
  pendingWinnerId?: string | null;
  winnerId?: string | null;

  reportedById?: string | null;
  reportedOpponentDeck?: string | null;
  reportedWinnerSide?: number | null;
  reportedLoserSide?: number | null;
  reportedWinnerDeck?: string | null;

  player1:
  | {
      id: string;
      name: string;
      rank: string;
      deck?: string;
      tags?: {
        experience: "none" | "participated" | "winner";
        playStyle: "enjoy" | "serious";
      };
    }
  | null;

player2:
  | {
      id: string;
      name: string;
      rank: string;
      deck?: string;
      tags?: {
        experience: "none" | "participated" | "winner";
        playStyle: "enjoy" | "serious";
      };
    }
  | null;
};

type SavedMatch = {
  id: string;
  matchType: "rank-priority" | "full-random" | "team-random";
  roundMinutes?: number | null;
  roundStartedAt?: number | null;
  roundEndAt?: number | null;
  tables: SavedMatchTable[];
};

export default function Home() {
  const router = useRouter();

  const [players, setPlayers] = useState<Player[]>([]);
  const [latestMatch, setLatestMatch] = useState<SavedMatch | null>(null);
  const [saving, setSaving] = useState(false);
  const [teamResults, setTeamResults] = useState<any[]>([]);
  const [savingTableNumber, setSavingTableNumber] = useState<number | null>(null);
  const [startingRound, setStartingRound] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [roundMinutes, setRoundMinutes] = useState(30);
  const [notifiedMarks, setNotifiedMarks] = useState<string[]>([]);
  const [experience, setExperience] = useState<"none" | "participated" | "winner">("none");
const [playStyle, setPlayStyle] = useState<"enjoy" | "serious">("enjoy");

  useEffect(() => {
    const q = query(collection(db, "players"), orderBy("createdAt", "desc"));
  
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Player[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
  
        return {
          id: docSnap.id,
          name: data.name || "",
          history: data.history || "",
          rank: data.rank || "",
          deck: data.deck || "",
          wins: data.wins || 0,
          tags: {
            experience: data.tags?.experience || "none",
            playStyle: data.tags?.playStyle || "enjoy",
          },
        };
      });
  
      setPlayers(list);
    });
  
    return () => unsubscribe();
  }, []);
  useEffect(() => {
    const q = query(
      collection(db, "matchResults"),
      where("matchType", "==", "team-random")
    );
  
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTeamResults(
        snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
      );
    });
  
    return () => unsubscribe();
  }, []);
  useEffect(() => {
    const q = query(collection(db, "matches"), orderBy("createdAt", "desc"), limit(1));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setLatestMatch(null);
        return;
      }

      const latestDoc = snapshot.docs[0];
      const data = latestDoc.data();

      setLatestMatch({
        id: latestDoc.id,
        matchType: data.matchType || "rank-priority",
        roundMinutes: data.roundMinutes ?? 30,
        roundStartedAt: data.roundStartedAt ?? null,
        roundEndAt: data.roundEndAt ?? null,
        tables: data.tables || [],
      });
    });

    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;

    if (Notification.permission === "default") {
      Notification.requestPermission().catch((error) => {
        console.error("通知許可取得失敗:", error);
      });
    }
  }, []);

  useEffect(() => {
    setNotifiedMarks([]);
  }, [latestMatch?.id, latestMatch?.roundStartedAt, latestMatch?.roundEndAt]);

  const shuffleArray = (array: Player[]) => {
    const copied = [...array];
    for (let i = copied.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copied[i], copied[j]] = [copied[j], copied[i]];
    }
    return copied;
  };

  const pairSameRank = (
    list: Player[],
    startTableNumber: number
  ): { tables: MatchTable[]; leftover?: Player; nextTableNumber: number } => {
    const shuffled = shuffleArray(list);
    const result: MatchTable[] = [];
    let tableNumber = startTableNumber;

    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      result.push({
        tableNumber,
        player1: shuffled[i],
        player2: shuffled[i + 1],
        type: "same-rank",
        started: false,
        pendingWinnerId: null,
        winnerId: null,
        reportedById: null,
        reportedOpponentDeck: null,
        reportedWinnerSide: null,
        reportedLoserSide: null,
        reportedWinnerDeck: null,
      });
      tableNumber++;
    }

    const leftover =
      shuffled.length % 2 === 1 ? shuffled[shuffled.length - 1] : undefined;

    return {
      tables: result,
      leftover,
      nextTableNumber: tableNumber,
    };
  };

  const saveMatches = async (
    matchType: "rank-priority" | "full-random" | "team-random",
    matchTables: MatchTable[]
  ) => {
    setSaving(true);
    try {
      await addDoc(collection(db, "matches"), {
        matchType,
        createdAt: serverTimestamp(),
        roundMinutes,
        roundStartedAt: null,
        roundEndAt: null,
        tables: matchTables.map((table) => ({
          tableNumber: table.tableNumber,
          type: table.type,
          started: table.started ?? false,
          pendingWinnerId: table.pendingWinnerId ?? null,
          winnerId: table.winnerId ?? null,
          reportedById: table.reportedById ?? null,
          reportedOpponentDeck: table.reportedOpponentDeck ?? null,
          reportedWinnerSide: table.reportedWinnerSide ?? null,
          reportedLoserSide: table.reportedLoserSide ?? null,
          reportedWinnerDeck: table.reportedWinnerDeck ?? null,
          player1Team: table.player1Team ?? null,
          player2Team: table.player2Team ?? null,
          player1: table.player1
          ? {
              id: table.player1.id,
              name: table.player1.name,
              rank: table.player1.rank,
              deck: table.player1.deck || "",
              tags: table.player1.tags ?? {
                experience: "none",
                playStyle: "enjoy",
              },
            }
          : null,
          player2: table.player2
  ? {
      id: table.player2.id,
      name: table.player2.name,
      rank: table.player2.rank,
      deck: table.player2.deck || "",
      tags: table.player2.tags ?? {
        experience: "none",
        playStyle: "enjoy",
      },
    }
  : null,
        })),
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRankPriorityMatch = async () => {
    const monsterPlayers = players.filter((player) => player.rank === "モンスターボール級");
    const superPlayers = players.filter((player) => player.rank === "スーパーボール級");
    const hyperPlayers = players.filter((player) => player.rank === "ハイパーボール級");

    let tableNumber = 1;
    const finalTables: MatchTable[] = [];

    const monsterResult = pairSameRank(monsterPlayers, tableNumber);
    finalTables.push(...monsterResult.tables);
    tableNumber = monsterResult.nextTableNumber;

    const superResult = pairSameRank(superPlayers, tableNumber);
    finalTables.push(...superResult.tables);
    tableNumber = superResult.nextTableNumber;

    const hyperResult = pairSameRank(hyperPlayers, tableNumber);
    finalTables.push(...hyperResult.tables);
    tableNumber = hyperResult.nextTableNumber;

    if (monsterResult.leftover && superResult.leftover) {
      finalTables.push({
        tableNumber,
        player1: monsterResult.leftover,
        player2: superResult.leftover,
        type: "cross-rank",
        started: false,
        pendingWinnerId: null,
        winnerId: null,
        reportedById: null,
        reportedOpponentDeck: null,
        reportedWinnerSide: null,
        reportedLoserSide: null,
        reportedWinnerDeck: null,
      });
      tableNumber++;
      monsterResult.leftover = undefined;
      superResult.leftover = undefined;
    }

    if (superResult.leftover && hyperResult.leftover) {
      finalTables.push({
        tableNumber,
        player1: superResult.leftover,
        player2: hyperResult.leftover,
        type: "cross-rank",
        started: false,
        pendingWinnerId: null,
        winnerId: null,
        reportedById: null,
        reportedOpponentDeck: null,
        reportedWinnerSide: null,
        reportedLoserSide: null,
        reportedWinnerDeck: null,
      });
      tableNumber++;
      superResult.leftover = undefined;
      hyperResult.leftover = undefined;
    }

    if (monsterResult.leftover) {
      finalTables.push({
        tableNumber,
        player1: monsterResult.leftover,
        player2: undefined,
        type: "cross-rank",
        started: false,
        pendingWinnerId: null,
        winnerId: null,
        reportedById: null,
        reportedOpponentDeck: null,
        reportedWinnerSide: null,
        reportedLoserSide: null,
        reportedWinnerDeck: null,
      });
      tableNumber++;
    }

    if (superResult.leftover) {
      finalTables.push({
        tableNumber,
        player1: superResult.leftover,
        player2: undefined,
        type: "cross-rank",
        started: false,
        pendingWinnerId: null,
        winnerId: null,
        reportedById: null,
        reportedOpponentDeck: null,
        reportedWinnerSide: null,
        reportedLoserSide: null,
        reportedWinnerDeck: null,
      });
      tableNumber++;
    }

    if (hyperResult.leftover) {
      finalTables.push({
        tableNumber,
        player1: hyperResult.leftover,
        player2: undefined,
        type: "cross-rank",
        started: false,
        pendingWinnerId: null,
        winnerId: null,
        reportedById: null,
        reportedOpponentDeck: null,
        reportedWinnerSide: null,
        reportedLoserSide: null,
        reportedWinnerDeck: null,
      });
    }

    await saveMatches("rank-priority", finalTables);
  };
// 👇 ここに追加（360の上）
const handleTeamRandomMatch = async () => {
  const grouped: Record<string, Player[]> = {};

  players.forEach((p) => {
    if (!grouped[p.rank]) grouped[p.rank] = [];
    grouped[p.rank].push(p);
  });

  const tables: MatchTable[] = [];
  let tableNumber = 1;

  Object.values(grouped).forEach((group) => {
    const shuffled = [...group].sort(() => Math.random() - 0.5);

    const half = Math.ceil(shuffled.length / 2);
    const teamA = shuffled.slice(0, half);
    const teamB = shuffled.slice(half);

    const max = Math.max(teamA.length, teamB.length);

    for (let i = 0; i < max; i++) {
      tables.push({
        tableNumber: tableNumber++,
        player1: teamA[i],
        player2: teamB[i],
        player1Team: "A",
        player2Team: "B",
        type: "team-random",
        started: false,
        pendingWinnerId: null,
        winnerId: null,
        reportedById: null,
        reportedOpponentDeck: null,
        reportedWinnerSide: null,
        reportedLoserSide: null,
        reportedWinnerDeck: null,
      });
    }
  });

  await saveMatches("team-random", tables);
};

// 👇 既存（そのまま）
const handleFullRandomMatch = async () => {
    const shuffled = shuffleArray(players);
    const newTables: MatchTable[] = [];

    for (let i = 0; i < shuffled.length; i += 2) {
      newTables.push({
        tableNumber: newTables.length + 1,
        player1: shuffled[i],
        player2: shuffled[i + 1],
        type: "random",
        started: false,
        pendingWinnerId: null,
        winnerId: null,
        reportedById: null,
        reportedOpponentDeck: null,
        reportedWinnerSide: null,
        reportedLoserSide: null,
        reportedWinnerDeck: null,
      });
    }

    await saveMatches("full-random", newTables);
  };
  const handleResetTeamCounts = async () => {
    const ok = window.confirm("チーム戦の勝数カウントをリセットしますか？");
    if (!ok) return;
  
    try {
      const q = query(
        collection(db, "matchResults"),
        where("matchType", "==", "team-random")
      );
  
      const snapshot = await getDocs(q);
  
      await Promise.all(
        snapshot.docs.map((docSnap) =>
          deleteDoc(doc(db, "matchResults", docSnap.id))
        )
      );
  
      alert("チーム戦カウントをリセットしました");
    } catch (error) {
      console.error(error);
      alert("リセットに失敗しました");
    }
  };
  const handleStartRound = async () => {
    if (!latestMatch) return;

    setStartingRound(true);

    try {
      const startedAt = Date.now();
      const endAt = startedAt + roundMinutes * 60 * 1000;

      const updatedTables = latestMatch.tables.map((table) => ({
        ...table,
        started: true,
      }));

      await updateDoc(doc(db, "matches", latestMatch.id), {
        roundMinutes,
        roundStartedAt: startedAt,
        roundEndAt: endAt,
        tables: updatedTables,
      });
    } finally {
      setStartingRound(false);
    }
  };

  const handleStartMatch = async (tableNumber: number) => {
    if (!latestMatch) return;

    setSavingTableNumber(tableNumber);

    try {
      const updatedTables = latestMatch.tables.map((table) =>
        table.tableNumber === tableNumber
          ? {
              ...table,
              started: true,
            }
          : table
      );

      await updateDoc(doc(db, "matches", latestMatch.id), {
        tables: updatedTables,
      });
    } finally {
      setSavingTableNumber(null);
    }
  };

  const handleApproveWinner = async (tableNumber: number) => {
    if (!latestMatch) return;

    const targetTable = latestMatch.tables.find((t) => t.tableNumber === tableNumber);
    if (!targetTable || !targetTable.pendingWinnerId) return;

    setSavingTableNumber(tableNumber);

    try {
      const updatedTables = latestMatch.tables.map((table) =>
        table.tableNumber === tableNumber
          ? {
              ...table,
              winnerId: table.pendingWinnerId,
            }
          : table
      );

      await updateDoc(doc(db, "matches", latestMatch.id), {
        tables: updatedTables,
      });

      const winnerId = targetTable.pendingWinnerId;
      if (winnerId) {
        const winnerRef = doc(db, "players", winnerId);
        const winnerSnap = await getDoc(winnerRef);
        if (winnerSnap.exists()) {
          await updateDoc(winnerRef, {
            wins: increment(1),
          });
        }
      }

      const winnerPlayer =
        targetTable.player1?.id === targetTable.pendingWinnerId
          ? targetTable.player1
          : targetTable.player2;

      const loserPlayer =
        targetTable.player1?.id === targetTable.pendingWinnerId
          ? targetTable.player2
          : targetTable.player1;

      await addDoc(collection(db, "matchResults"), {
        matchId: latestMatch.id,
        tableNumber: targetTable.tableNumber,
        matchType: latestMatch.matchType,
        roundMinutes: latestMatch.roundMinutes ?? null,
        player1Team: targetTable.player1Team ?? null,
        player2Team: targetTable.player2Team ?? null,
        winnerId: targetTable.pendingWinnerId,
        winnerTeam:
  targetTable.pendingWinnerId === targetTable.player1?.id
    ? targetTable.player1Team ?? null
    : targetTable.player2Team ?? null,
        winnerName: winnerPlayer?.name || "",
        winnerRank: winnerPlayer?.rank || "",
        winnerDeck: targetTable.reportedWinnerDeck || winnerPlayer?.deck || "",
        loserId: loserPlayer?.id || null,
        loserName: loserPlayer?.name || "",
        loserRank: loserPlayer?.rank || "",
        loserDeck: targetTable.reportedOpponentDeck || loserPlayer?.deck || "",
        reportedById: targetTable.reportedById || null,
        sideWinner: targetTable.reportedWinnerSide ?? null,
        sideLoser: targetTable.reportedLoserSide ?? null,
        createdAt: serverTimestamp(),
      });
    } finally {
      setSavingTableNumber(null);
    }
  };

  const handleChangeWinner = async (tableNumber: number, winnerId: string) => {
    if (!latestMatch) return;

    setSavingTableNumber(tableNumber);

    try {
      const winnerTable = latestMatch.tables.find((table) => table.tableNumber === tableNumber);
      const winnerPlayer =
        winnerTable?.player1?.id === winnerId ? winnerTable.player1 : winnerTable?.player2;

      const loserPlayer =
        winnerTable?.player1?.id === winnerId ? winnerTable.player2 : winnerTable?.player1;

      const updatedTables = latestMatch.tables.map((table) =>
        table.tableNumber === tableNumber
          ? {
              ...table,
              started: true,
              pendingWinnerId: winnerId,
              winnerId,
              reportedById: winnerId,
              reportedWinnerDeck: winnerPlayer?.deck || table.reportedWinnerDeck || "",
              reportedOpponentDeck:
                loserPlayer?.deck || table.reportedOpponentDeck || "",
            }
          : table
      );

      await updateDoc(doc(db, "matches", latestMatch.id), {
        tables: updatedTables,
      });
      await addDoc(collection(db, "matchResults"), {
        matchId: latestMatch.id,
        tableNumber: winnerTable?.tableNumber ?? tableNumber,
        matchType: latestMatch.matchType,
        roundMinutes: latestMatch.roundMinutes ?? null,
      
        player1Team: winnerTable?.player1Team ?? null,
        player2Team: winnerTable?.player2Team ?? null,
      
        winnerId,
        winnerTeam:
  winnerId === winnerTable?.player1?.id
    ? winnerTable?.player1Team ?? null
    : winnerTable?.player2Team ?? null,
        winnerName: winnerPlayer?.name || "",
        winnerRank: winnerPlayer?.rank || "",
        winnerDeck: winnerPlayer?.deck || winnerTable?.reportedWinnerDeck || "",
        loserId: loserPlayer?.id || null,
        loserName: loserPlayer?.name || "",
        loserRank: loserPlayer?.rank || "",
        loserDeck: loserPlayer?.deck || winnerTable?.reportedOpponentDeck || "",
        reportedById: winnerId,
        sideWinner: null,
        sideLoser: null,
        createdAt: serverTimestamp(),
      });
    } finally {
      setSavingTableNumber(null);
    }
  };

  const grouped = {
    monster: players.filter((player) => player.rank === "モンスターボール級"),
    super: players.filter((player) => player.rank === "スーパーボール級"),
    hyper: players.filter((player) => player.rank === "ハイパーボール級"),
  };

  const renderPlayers = (list: Player[]) => {
    if (list.length === 0) {
      return <p>まだ参加者はいません</p>;
    }

    return (
      <div style={{ display: "grid", gap: 12 }}>
        {list.map((player) => (
          <div
            key={player.id}
            onClick={() => router.push(`/player/${player.id}`)}
            style={{
              border: "1px solid #ccc",
              borderRadius: 10,
              padding: 16,
              backgroundColor: "#fff",
              cursor: "pointer",
            }}
          >
            <div style={{ fontSize: 18, fontWeight: "bold", marginBottom: 6 }}>
              {player.name}
            </div>
            <div style={{ marginTop: 8, fontSize: 12 }}>
  {player.tags.experience === "none" && "大会未出場"}
  {player.tags.experience === "participated" && "大会出場あり"}
  {player.tags.experience === "winner" && "入賞・優勝経験あり"}
</div>

<div style={{ fontSize: 12 }}>
  {player.tags.playStyle === "enjoy" ? "エンジョイ勢" : "ガチ勢"}
</div>
            <div style={{ marginBottom: 4 }}>プレイ歴：{player.history}</div>
            <div style={{ marginBottom: 4 }}>階級：{player.rank}</div>
            <div style={{ marginBottom: 4 }}>使用デッキ：{player.deck || "未設定"}</div>
            <div>勝数：{player.wins || 0}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderTypeLabel = (
    type: "same-rank" | "cross-rank" | "random" | "team-random"
  ) => {
    if (type === "same-rank") return "同階級";
    if (type === "cross-rank") return "階級またぎ";
    if (type === "team-random") return "チーム戦ランダム";
    return "完全ランダム";
  };

  const getStatusLabel = (table: SavedMatchTable) => {
    if (table.winnerId) {
      return { text: "承認済み", color: "#16a34a" };
    }
    if (table.pendingWinnerId) {
      return { text: "勝利申請中", color: "orange" };
    }
    if (table.started) {
      return { text: "対戦中", color: "#2563eb" };
    }
    return { text: "未開始", color: "#999" };
  };

  const getPlayerBoxStyle = (
    playerId: string | undefined,
    pendingWinnerId?: string | null,
    winnerId?: string | null
  ) => {
    if (!playerId) {
      return {
        border: "1px solid #ddd",
        backgroundColor: "#fafafa",
      };
    }

    if (winnerId === playerId) {
      return {
        border: "2px solid #22c55e",
        backgroundColor: "#dcfce7",
      };
    }

    if (pendingWinnerId === playerId) {
      return {
        border: "2px solid orange",
        backgroundColor: "#ffedd5",
      };
    }

    return {
      border: "1px solid #ddd",
      backgroundColor: "#fafafa",
    };
  };

  const remainingSeconds = useMemo(() => {
    if (!latestMatch?.roundStartedAt || !latestMatch?.roundMinutes) return null;

    const end =
      latestMatch.roundStartedAt + latestMatch.roundMinutes * 60 * 1000;

    return Math.max(0, Math.floor((end - now) / 1000));
  }, [latestMatch, now]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (remainingSeconds === null) return;

    const notify = (key: string, title: string, body: string) => {
      if (notifiedMarks.includes(key)) return;

      new Notification(title, { body });
      setNotifiedMarks((prev) => [...prev, key]);
    };

    if (
      latestMatch?.roundMinutes &&
      latestMatch.roundMinutes > 10 &&
      remainingSeconds <= 600 &&
      !notifiedMarks.includes("10min")
    ) {
      notify("10min", "ラウンド終了10分前", "残り10分です。");
    }

    if (
      latestMatch?.roundMinutes &&
      latestMatch.roundMinutes > 5 &&
      remainingSeconds <= 300 &&
      !notifiedMarks.includes("5min")
    ) {
      notify("5min", "ラウンド終了5分前", "残り5分です。");
    }

    if (
      latestMatch?.roundMinutes &&
      latestMatch.roundMinutes > 1 &&
      remainingSeconds <= 60 &&
      !notifiedMarks.includes("1min")
    ) {
      notify("1min", "ラウンド終了1分前", "残り1分です。");
    }

    if (remainingSeconds <= 0 && !notifiedMarks.includes("end")) {
      notify("end", "ラウンド終了", "時間終了です。");
    }
  }, [remainingSeconds, notifiedMarks, latestMatch]);

  const timerText = useMemo(() => {
    if (remainingSeconds === null) return "未開始";
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [remainingSeconds]);
  const teamWinCounts = useMemo(() => {
    let aWins = 0;
    let bWins = 0;
  
    teamResults.forEach((result: any) => {
      if (result.winnerTeam === "A") aWins++;
      if (result.winnerTeam === "B") bWins++;
    });
  
    return { A: aWins, B: bWins };
  }, [teamResults]);

  const getPendingPlayerName = (table: SavedMatchTable) => {
    if (!table.pendingWinnerId) return null;
    if (table.pendingWinnerId === table.player1?.id) return table.player1?.name || null;
    if (table.pendingWinnerId === table.player2?.id) return table.player2?.name || null;
    return null;
  };

  return (
    <div
      style={{
        padding: 20,
        fontFamily: "sans-serif",
        maxWidth: 1100,
        margin: "0 auto",
      }}
    >
      <h1 style={{ marginBottom: 20, textAlign: "center" }}>ぽか部運営画面</h1>

      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <button
          onClick={() => router.push("/results")}
          style={{
            padding: "10px 20px",
            fontSize: 16,
            borderRadius: 8,
            border: "1px solid #ccc",
            backgroundColor: "#fff",
            cursor: "pointer",
          }}
        >
          📊 試合結果一覧を見る
        </button>
      </div>

      <div style={{ textAlign: "center", marginBottom: 20 }}>
        <button
          onClick={() => router.push("/ranking")}
          style={{
            padding: "10px 20px",
            fontSize: 16,
            borderRadius: 8,
            border: "1px solid #ccc",
            backgroundColor: "#fff",
            cursor: "pointer",
          }}
        >
          🏆 ランキングを見る
        </button>
      </div>

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
      {latestMatch?.matchType === "team-random" && (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      gap: 20,
      marginBottom: 20,
      fontWeight: "bold",
      fontSize: 18,
    }}
  >
    

  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
  
  <div style={{
    background: "#dbeafe",
    padding: "8px 16px",
    borderRadius: 8
  }}>
    チームA：{teamWinCounts.A}勝
  </div>

  <div style={{
    background: "#fee2e2",
    padding: "8px 16px",
    borderRadius: 8
  }}>
    チームB：{teamWinCounts.B}勝
  </div>

  <button
    onClick={handleResetTeamCounts}
    style={{
      padding: "6px 12px",
      borderRadius: 6,
      border: "1px solid #ccc",
      background: "#fff",
      cursor: "pointer"
    }}
  >
    リセット
  </button>

</div>
  </div>
)}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 10,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setRoundMinutes((prev) => Math.max(1, prev - 1))}
          style={{
            width: 42,
            height: 42,
            border: "1px solid #ccc",
            borderRadius: 8,
            backgroundColor: "#fff",
            fontSize: 20,
            cursor: "pointer",
          }}
        >
          −
        </button>

        <div
          style={{
            minWidth: 90,
            textAlign: "center",
            fontSize: 20,
            fontWeight: "bold",
          }}
        >
          {roundMinutes}分
        </div>

        <button
          onClick={() => setRoundMinutes((prev) => Math.min(30, prev + 1))}
          style={{
            width: 42,
            height: 42,
            border: "1px solid #ccc",
            borderRadius: 8,
            backgroundColor: "#fff",
            fontSize: 20,
            cursor: "pointer",
          }}
        >
          ＋
        </button>
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "center",
          gap: 12,
          marginBottom: 30,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={handleRankPriorityMatch}
          disabled={saving}
          style={{
            padding: "12px 24px",
            fontSize: 16,
            border: "none",
            borderRadius: 10,
            backgroundColor: "orange",
            color: "white",
            cursor: "pointer",
          }}
        >
          個人戦
        </button>
        <button
  onClick={handleTeamRandomMatch}
  disabled={saving}
  style={{
    padding: "12px 24px",
    fontSize: 16,
    border: "none",
    borderRadius: 10,
    backgroundColor: "purple",
    color: "white",
    cursor: "pointer",
  }}
>
  チーム戦
</button>
        <button
          onClick={handleFullRandomMatch}
          disabled={saving}
          style={{
            padding: "12px 24px",
            fontSize: 16,
            border: "1px solid #ccc",
            borderRadius: 10,
            backgroundColor: "#fff",
            cursor: "pointer",
          }}
        >
          ランダム戦
        </button>

        {latestMatch && (
          <button
            onClick={handleStartRound}
            disabled={startingRound}
            style={{
              padding: "12px 24px",
              fontSize: 16,
              border: "none",
              borderRadius: 10,
              backgroundColor: "#2563eb",
              color: "white",
              cursor: "pointer",
            }}
          >
            {startingRound ? "開始中..." : "ラウンド開始"}
          </button>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 20,
          alignItems: "start",
          marginBottom: 40,
        }}
      >
        <div>
          <h2 style={{ marginBottom: 16 }}>モンスターボール級</h2>
          {renderPlayers(grouped.monster)}
        </div>

        <div>
          <h2 style={{ marginBottom: 16 }}>スーパーボール級</h2>
          {renderPlayers(grouped.super)}
        </div>

        <div>
          <h2 style={{ marginBottom: 16 }}>ハイパーボール級</h2>
          {renderPlayers(grouped.hyper)}
        </div>
      </div>

      <div>
        <h2 style={{ marginBottom: 16, textAlign: "center" }}>直近の卓振り結果</h2>

        {!latestMatch ? (
          <p style={{ textAlign: "center" }}>まだ保存履歴はありません</p>
        ) : (
          <div
            style={{
              border: "1px solid #ccc",
              borderRadius: 12,
              padding: 20,
              backgroundColor: "#fff",
            }}
          >
            <div style={{ marginBottom: 16, fontWeight: "bold" }}>
              卓振り種別：
              {latestMatch.matchType === "rank-priority"
  ? "個人戦(階級優先)"
  : latestMatch.matchType === "team-random"
  ? "チーム戦(階級優先)"
  : "完全ランダム戦"}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, 1fr)",
                gap: 16,
              }}
            >
              {latestMatch.tables.map((table) => {
                const status = getStatusLabel(table);
                const winnerName =
                  table.winnerId === table.player1?.id
                    ? table.player1?.name
                    : table.winnerId === table.player2?.id
                    ? table.player2?.name
                    : null;

                const pendingName = getPendingPlayerName(table);

                return (
                  <div
                    key={table.tableNumber}
                    style={{
                      border: "1px solid #ddd",
                      borderRadius: 10,
                      padding: 16,
                      backgroundColor: "#fff",
                    }}
                  >
                    <div style={{ fontWeight: "bold", marginBottom: 8 }}>
                      卓{table.tableNumber}
                    </div>

                    <div
                      style={{
                        marginBottom: 10,
                        fontWeight: "bold",
                        color: status.color,
                      }}
                    >
                      状態：{status.text}
                    </div>

                    <div style={{ marginBottom: 8 }}>
                      種別：{renderTypeLabel(table.type)}
                    </div>

                    <div
  style={{
    ...getPlayerBoxStyle(
      table.player1?.id,
      table.pendingWinnerId,
      table.winnerId
    ),
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  }}
>
  1人目：
  {table.player1 ? (
   <>
   <div style={{ fontWeight: "bold" }}>
     {table.player1.name}
   </div>
 
   <div>
     {table.player1Team && `（${table.player1Team}）`}
     {`（${table.player1.rank}）`}
   </div>
 
   {/* 👇追加 */}
   {table.player1.tags && (
     <div style={{ fontSize: 12, color: "#666" }}>
       {table.player1.tags.playStyle === "enjoy" ? "エンジョイ勢" : "ガチ勢"}
     </div>
   )}
 </>
  ) : (
    "空席"
  )}
</div>

<div
  style={{
    ...getPlayerBoxStyle(
      table.player2?.id,
      table.pendingWinnerId,
      table.winnerId
    ),
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  }}
>
  2人目：
  {table.player2 ? (
    <>
      {table.player2.name}
      {table.player2Team && `（${table.player2Team}）`}
      {`（${table.player2.rank}）`}
    </>
  ) : (
    "不在"
  )}
</div>

                    {pendingName && !winnerName && (
                      <div
                        style={{
                          marginBottom: 12,
                          padding: 10,
                          borderRadius: 8,
                          backgroundColor: "#fff7ed",
                          border: "1px solid #fdba74",
                        }}
                      >
                        <div style={{ color: "orange", fontWeight: "bold", marginBottom: 6 }}>
                          勝利申請中：{pendingName}
                        </div>

                        {table.reportedWinnerSide !== null &&
                          table.reportedWinnerSide !== undefined &&
                          table.reportedLoserSide !== null &&
                          table.reportedLoserSide !== undefined && (
                            <div style={{ marginBottom: 4 }}>
                              申請サイド：{table.reportedWinnerSide}-{table.reportedLoserSide}
                            </div>
                          )}

                        <div style={{ marginBottom: 4 }}>
                          申請者デッキ：{table.reportedWinnerDeck || "未入力"}
                        </div>
                        <div>相手デッキ：{table.reportedOpponentDeck || "未入力"}</div>
                      </div>
                    )}

                    {winnerName && (
                      <div style={{ marginBottom: 10, color: "#16a34a", fontWeight: "bold" }}>
                        正式勝者：{winnerName}
                      </div>
                    )}

                    {!table.started && !table.winnerId && (
                      <button
                        onClick={() => handleStartMatch(table.tableNumber)}
                        disabled={savingTableNumber === table.tableNumber}
                        style={{
                          padding: "10px 14px",
                          border: "none",
                          borderRadius: 8,
                          backgroundColor: "#2563eb",
                          color: "white",
                          cursor: "pointer",
                          marginRight: 8,
                          marginBottom: 10,
                        }}
                      >
                        対戦開始
                      </button>
                    )}

                    {!winnerName && pendingName && (
                      <button
                        onClick={() => handleApproveWinner(table.tableNumber)}
                        disabled={savingTableNumber === table.tableNumber}
                        style={{
                          padding: "10px 14px",
                          border: "none",
                          borderRadius: 8,
                          backgroundColor: "#16a34a",
                          color: "white",
                          cursor: "pointer",
                          marginRight: 8,
                          marginBottom: 10,
                        }}
                      >
                        承認
                      </button>
                    )}

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      {table.player1 && (
                        <button
                          onClick={() => handleChangeWinner(table.tableNumber, table.player1!.id)}
                          disabled={savingTableNumber === table.tableNumber}
                          style={{
                            padding: "10px 14px",
                            border: "none",
                            borderRadius: 8,
                            backgroundColor: "orange",
                            color: "white",
                            cursor: "pointer",
                          }}
                        >
                          {table.player1.name} を勝者にする
                        </button>
                      )}

                      {table.player2 && (
                        <button
                          onClick={() => handleChangeWinner(table.tableNumber, table.player2!.id)}
                          disabled={savingTableNumber === table.tableNumber}
                          style={{
                            padding: "10px 14px",
                            border: "none",
                            borderRadius: 8,
                            backgroundColor: "#666",
                            color: "white",
                            cursor: "pointer",
                          }}
                        >
                          {table.player2.name} を勝者にする
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}