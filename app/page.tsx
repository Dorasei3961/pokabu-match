"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../lib/firebase";
import { startCasualMatches } from "@/lib/matches";
import {
  pairIndividualRound1,
  pairIndividualRoundN,
  type PairablePlayer,
  type RawPair,
} from "@/lib/tournamentIndividualPairing";
import { saveCasualPairingSettings } from "@/lib/casualMatchSettings";
import {
  addTournamentIndividualBoardMatches,
  DEFAULT_EVENT_ID,
  finishAllPlayingTournamentIndividualBoardMatches,
  finishTournamentIndividualBoardMatch,
} from "@/lib/tournamentBoardMatches";
import {
  resetAllPlayersToInactive,
  resetAllPlayersToWaiting,
  setPlayerInactive,
} from "@/lib/participants";
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
  arrayUnion,
  getDoc,
  getDocs,
  where,
} from "firebase/firestore";
import {
  PokabuAdminUI,
  type PokabuAdminMode,
  type RankCardData,
  type RecentMatchRow,
  type WaitingParticipantRow,
} from "@/components/PokabuAdminUI";
import { AdminHomeHeaderSlot } from "@/components/admin/AdminHomeHeaderSlot";
import type { GoodHistoryListItem } from "@/lib/good";
import type { BadgeId, PlayStyleKey } from "@/lib/playerBadges";
import {
  badgesEmojiCompact,
  normalizeBadges,
  normalizePlayStyle,
  participantSummaryLine,
  playStyleLine,
} from "@/lib/playerBadges";

type Player = {
  id: string;
  name: string;
  history: string;
  rank: string;
  team?: "A" | "B"
  deck?: string;
  wins?: number;
  loss?: number;
  draw?: number;
  /** 大会個人戦：過去の対戦相手 id */
  opponents?: string[];
  /** ナイス対戦の累計受信数 */
  goodCount?: number;
  status?: "waiting" | "playing" | "inactive";
  tags: {
    experience: "none" | "participated" | "winner";
    playStyle: PlayStyleKey;
  };
  playStyle: PlayStyleKey;
  badges: BadgeId[];
};

type MatchTable = {
  tableNumber: number;
  player1?: Player;
  player2?: Player;
  player1Team?: "A" | "B";
  player2Team?: "A" | "B";
  type: "same-rank" | "cross-rank" | "random" | "team-random" | "individual";
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
  type: "same-rank" | "cross-rank" | "random" | "team-random" | "individual";
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
        playStyle: PlayStyleKey;
      };
      playStyle?: PlayStyleKey;
      badges?: BadgeId[];
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
        playStyle: PlayStyleKey;
      };
      playStyle?: PlayStyleKey;
      badges?: BadgeId[];
    }
  | null;
};

type SavedMatch = {
  id: string;
  matchType:
    | "rank-priority"
    | "full-random"
    | "team-random"
    | "individual-swiss";
  /** 大会個人戦のラウンド番号 */
  individualRound?: number | null;
  roundMinutes?: number | null;
  roundStartedAt?: number | null;
  roundEndAt?: number | null;
  tables: SavedMatchTable[];
};

const EVENT_ID = DEFAULT_EVENT_ID;
const tournamentMatchesCollection = () =>
  collection(db, "events", EVENT_ID, "matches");
const tournamentMatchDocRef = (matchId: string) =>
  doc(db, "events", EVENT_ID, "matches", matchId);
const CASUAL_RANK_PRIORITY_KEY = "pokabu-casual-rank-priority";
const CASUAL_AVOID_REMATCH_KEY = "pokabu-casual-avoid-rematch";

export default function Home() {
  const router = useRouter();
  const [casualRankPriority, setCasualRankPriority] = useState(true);
  const [casualAvoidRematch, setCasualAvoidRematch] = useState(true);

  const handleCasualMatch = async () => {
    try {
      setLatestMatch(null);
      const waitingParticipantsLength = players.filter(
        (p) => p.status === "waiting"       
      ).length;
      const waitingParticipantsForUi = players
        .filter((p) => p.status === "waiting" )
        .map((p) => ({
          id: p.id,
          status: p.status,
          currentMatchId: (p as any).currentMatchId ?? null,
        }));
      console.log(
        "[handleCasualMatch] waitingParticipants(ui):",
        waitingParticipantsForUi
      );
      console.log(
        "[handleCasualMatch] waitingParticipants.length:",
        waitingParticipantsLength
      );
  
      const created = await startCasualMatches("default", {
        rankPriority: casualRankPriority,
        avoidRematch: casualAvoidRematch,
      });
  
      alert(`交流会マッチを開始しました（${created.length}試合作成）`);
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : "交流会マッチの開始に失敗しました"
      );
    }
  };
  const handleResetPlayers = async () => {
    if (!confirm("全員を待機状態に戻しますか？")) return;
  
    try {
      const playingMatchesQuery = query(
        collection(db, "events", "default", "matches"),
        where("status", "==", "playing")
      );
      const playingMatchesSnap = await getDocs(playingMatchesQuery);
      await Promise.all(
        playingMatchesSnap.docs.map((docSnap) =>
          updateDoc(doc(db, "events", "default", "matches", docSnap.id), {
            status: "finished",
            updatedAt: serverTimestamp(),
          })
        )
      );

      await resetAllPlayersToWaiting();
      alert("全員を待機状態に戻しました");
    } catch (err) {
      console.error(err);
      alert("リセットに失敗しました");
    }
  };
  const handleResetAllParticipants = async () => {
    if (!confirm("全参加者を無効化しますか？")) return;

    try {
      const playingMatchesQuery = query(
        collection(db, "events", "default", "matches"),
        where("status", "==", "playing")
      );
      const playingMatchesSnap = await getDocs(playingMatchesQuery);
      await Promise.all(
        playingMatchesSnap.docs.map((docSnap) =>
          updateDoc(doc(db, "events", "default", "matches", docSnap.id), {
            status: "finished",
            updatedAt: serverTimestamp(),
          })
        )
      );

      await resetAllPlayersToInactive();
      alert("全参加者を無効化しました");
    } catch (err) {
      console.error(err);
      alert("参加者リセットに失敗しました");
    }
  };

  const [players, setPlayers] = useState<Player[]>([]);
  const [latestMatch, setLatestMatch] = useState<SavedMatch | null>(null);
  const [saving, setSaving] = useState(false);
  const [teamResults, setTeamResults] = useState<any[]>([]);
  const [savingTableNumber, setSavingTableNumber] = useState<number | null>(null);
  const [startingRound, setStartingRound] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [roundMinutes, setRoundMinutes] = useState(30);
  const [notifiedMarks, setNotifiedMarks] = useState<string[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<"A" | "B" | null>(null);
  const [adminMode, setAdminMode] = useState<PokabuAdminMode>("casual");
  const [casualRecentMatches, setCasualRecentMatches] = useState<
    RecentMatchRow[]
  >([]);
  const [goodLogsByPlayerId, setGoodLogsByPlayerId] = useState<
    Record<string, GoodHistoryListItem[]>
  >({});
  const waitingCount = players.filter(
    (p) => p.status === "waiting"
  ).length;

  const playingCount = players.filter(
    (p) => p.status === "playing"
  ).length;

  const waitingParticipantsList = useMemo((): WaitingParticipantRow[] => {
    return players
      .filter((p) => p.status === "waiting")
      .map((p) => ({
        id: p.id,
        name: p.name?.trim() || "（無名）",
        rank: p.rank?.trim() || "—",
        badgeSummary: participantSummaryLine(p.playStyle, p.badges),
      }));
  }, [players]);

  const teamMembers = useMemo(() => {
    if (!latestMatch || latestMatch.matchType !== "team-random") {
      return { A: [], B: [] };
    }

    const aMap = new Map<string, string>();
    const bMap = new Map<string, string>();

    latestMatch.tables.forEach((table) => {
      if (table.player1?.id && table.player1?.name) {
        aMap.set(table.player1.id, table.player1.name);
      }
      if (table.player2?.id && table.player2?.name) {
        bMap.set(table.player2.id, table.player2.name);
      }
    });

    return {
      A: Array.from(aMap.values()),
      B: Array.from(bMap.values()),
    };
  }, [latestMatch]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(CASUAL_RANK_PRIORITY_KEY);
      if (v === "0") setCasualRankPriority(false);
      else if (v === "1") setCasualRankPriority(true);
      const a = localStorage.getItem(CASUAL_AVOID_REMATCH_KEY);
      if (a === "0") setCasualAvoidRematch(false);
      else if (a === "1") setCasualAvoidRematch(true);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        CASUAL_RANK_PRIORITY_KEY,
        casualRankPriority ? "1" : "0"
      );
      localStorage.setItem(
        CASUAL_AVOID_REMATCH_KEY,
        casualAvoidRematch ? "1" : "0"
      );
    } catch {
      /* ignore */
    }
  }, [casualRankPriority, casualAvoidRematch]);

  useEffect(() => {
    void saveCasualPairingSettings(casualRankPriority, casualAvoidRematch);
  }, [casualRankPriority, casualAvoidRematch]);

  useEffect(() => {
    const q = collection(db, "players");
  
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Player[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const playStyle = normalizePlayStyle(data);
        const badges = normalizeBadges(data);

        return {
          id: docSnap.id,
          name: data.name || "",
          history: data.history || "",
          rank: data.rank || "",
          deck: data.deck || "",
          wins: data.wins || 0,
          loss: typeof data.loss === "number" ? data.loss : 0,
          draw: typeof data.draw === "number" ? data.draw : 0,
          opponents: Array.isArray(data.opponents)
            ? (data.opponents as unknown[]).filter(
                (x): x is string => typeof x === "string"
              )
            : [],
          goodCount:
            typeof data.goodCount === "number" ? data.goodCount : 0,
          status: data.status,
          currentMatchId: data.currentMatchId || null,
          tags: {
            experience: data.tags?.experience || "none",
            playStyle,
          },
          playStyle,
          badges,
        };
      });
  
      setPlayers(list);
    });
  
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (adminMode !== "casual") {
      setGoodLogsByPlayerId({});
      return;
    }
    const q = query(
      collection(db, "events", "default", "goodHistory"),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const byTo: Record<string, GoodHistoryListItem[]> = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const toId = data.toPlayerId as string | undefined;
        if (!toId) return;
        const created = data.createdAt as { toMillis?: () => number } | undefined;
        const entry: GoodHistoryListItem = {
          id: docSnap.id,
          fromPlayerName: String(data.fromPlayerName ?? ""),
          matchId: String(data.matchId ?? ""),
          tableNumber:
            typeof data.tableNumber === "number" ? data.tableNumber : null,
          createdAtMs:
            typeof created?.toMillis === "function"
              ? created.toMillis()
              : null,
        };
        if (!byTo[toId]) byTo[toId] = [];
        byTo[toId].push(entry);
      });
      for (const k of Object.keys(byTo)) {
        byTo[k].sort(
          (a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0)
        );
      }
      setGoodLogsByPlayerId(byTo);
    });
    return () => unsubscribe();
  }, [adminMode]);

  useEffect(() => {
    if (adminMode !== "tournament") {
      setTeamResults([]);
      return;
    }

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

    return () => {
      unsubscribe();
      setTeamResults([]);
    };
  }, [adminMode]);

  useEffect(() => {
    if (adminMode !== "tournament") {
      setLatestMatch(null);
      return;
    }

    // 卓ごとのフラット doc（casual / tournament_individual）も同一コレクションにあるため、
    // createdAt 最新1件だけ取ると個人戦直後は tournament_individual が先頭になり tables が空になる。
    const q = query(
      collection(db, "events", EVENT_ID, "matches"),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setLatestMatch(null);
        return;
      }

      const latestDoc = snapshot.docs.find((docSnap) => {
        const data = docSnap.data();
        return Array.isArray(data.tables);
      });
      if (!latestDoc) {
        setLatestMatch(null);
        return;
      }

      const data = latestDoc.data();

      setLatestMatch({
        id: latestDoc.id,
        matchType: data.matchType || "rank-priority",
        individualRound:
          typeof data.individualRound === "number"
            ? data.individualRound
            : null,
        roundMinutes: data.roundMinutes ?? 30,
        roundStartedAt: data.roundStartedAt ?? null,
        roundEndAt: data.roundEndAt ?? null,
        tables: data.tables || [],
      });
    });

    return () => {
      unsubscribe();
      setLatestMatch(null);
    };
  }, [adminMode]);

  useEffect(() => {
    const q = query(
      collection(db, "events", "default", "matches"),
      where("status", "==", "playing")
    );
    return onSnapshot(q, (snapshot) => {
      const rows: RecentMatchRow[] = snapshot.docs
        .map((docSnap) => {
          const d = docSnap.data();
          const tableNumber =
            typeof d.tableNumber === "number" ? d.tableNumber : 0;
          const player1 =
            typeof d.player1Name === "string" ? d.player1Name : "—";
          const player2 =
            typeof d.player2Name === "string" ? d.player2Name : "—";
          return { tableNumber, player1, player2 };
        })
        .sort((a, b) => a.tableNumber - b.tableNumber)
        .slice(0, 3);
      setCasualRecentMatches(rows);
    });
  }, []);

  useEffect(() => {
    if (adminMode !== "tournament") return;

    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [adminMode]);

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

  const saveMatches = async (
    matchType:
      | "rank-priority"
      | "full-random"
      | "team-random"
      | "individual-swiss",
    matchTables: MatchTable[],
    options?: { individualRound?: number }
  ): Promise<string | undefined> => {
    setSaving(true);
    try {
      const created = await addDoc(tournamentMatchesCollection(), {
        matchType,
        ...(options?.individualRound != null
          ? { individualRound: options.individualRound }
          : {}),
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
                playStyle: table.player1.playStyle ?? "enjoy",
              },
              playStyle: table.player1.playStyle ?? "enjoy",
              badges: table.player1.badges ?? [],
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
        playStyle: table.player2.playStyle ?? "enjoy",
      },
      playStyle: table.player2.playStyle ?? "enjoy",
      badges: table.player2.badges ?? [],
    }
  : null,
        })),
      });
      return created.id;
    } finally {
      setSaving(false);
    }
  };

  const toPairablePlayer = (p: Player): PairablePlayer => ({
    id: p.id,
    name: p.name,
    rank: p.rank,
    wins: p.wins ?? 0,
    opponents: p.opponents ?? [],
  });

  const rawPairsToMatchTables = (
    pairs: RawPair[],
    byId: Map<string, Player>
  ): MatchTable[] =>
    pairs.map((pair) => {
      const p1 = byId.get(pair.player1.id);
      if (!p1) throw new Error("player1 not found");
      if (!pair.player2) {
        return {
          tableNumber: pair.tableNumber,
          player1: p1,
          player2: undefined,
          type: "individual",
          started: true,
          winnerId: p1.id,
          pendingWinnerId: null,
          reportedById: null,
          reportedOpponentDeck: null,
          reportedWinnerSide: null,
          reportedLoserSide: null,
          reportedWinnerDeck: null,
        };
      }
      const p2 = byId.get(pair.player2.id);
      if (!p2) throw new Error("player2 not found");
      return {
        tableNumber: pair.tableNumber,
        player1: p1,
        player2: p2,
        type: "individual",
        started: false,
        winnerId: null,
        pendingWinnerId: null,
        reportedById: null,
        reportedOpponentDeck: null,
        reportedWinnerSide: null,
        reportedLoserSide: null,
        reportedWinnerDeck: null,
      };
    });

  const handleIndividualSwissRound = async () => {
    const active = players.filter((p) => p.status !== "inactive");
    if (active.length < 2) {
      alert("大会に参加できる参加者が2人未満です（無効化を除く）");
      return;
    }

    if (latestMatch?.matchType === "individual-swiss") {
      const allDone = latestMatch.tables.every((t) => {
        if (!t.player1) return true;
        if (!t.player2) return !!t.winnerId;
        return !!t.winnerId;
      });
      if (!allDone) {
        alert(
          "現在のラウンドが未終了です。全卓の勝敗を確定してから個人戦を押してください。"
        );
        return;
      }
    }

    let nextRound = 1;
    if (latestMatch?.matchType === "individual-swiss") {
      nextRound = (latestMatch.individualRound ?? 1) + 1;
    } else if (latestMatch) {
      const ok = window.confirm(
        "現在表示中の大会データは個人戦ラウンド制ではありません。個人戦を開始すると Round 1 として新しい卓組みを追加します。よろしいですか？"
      );
      if (!ok) return;
    }

    const pairable = active.map(toPairablePlayer);
    const byId = new Map(active.map((p) => [p.id, p]));

    const rawPairs =
      nextRound === 1
        ? pairIndividualRound1(pairable)
        : pairIndividualRoundN(pairable);

    try {
      await finishAllPlayingTournamentIndividualBoardMatches(EVENT_ID);
      const tables = rawPairsToMatchTables(rawPairs, byId);
      await saveMatches("individual-swiss", tables, {
        individualRound: nextRound,
      });
      const boardTables = tables
        .filter((t) => t.player1 && t.player2)
        .map((t) => ({
          tableNumber: t.tableNumber,
          player1Id: t.player1!.id,
          player1Name: t.player1!.name,
          player2Id: t.player2!.id,
          player2Name: t.player2!.name,
        }));
      await addTournamentIndividualBoardMatches(EVENT_ID, nextRound, boardTables);
      for (const t of tables) {
        if (!t.player2 && t.winnerId) {
          await updateDoc(doc(db, "players", t.winnerId), {
            wins: increment(1),
            updatedAt: serverTimestamp(),
          });
        }
      }
      alert(
        `Round ${nextRound} の卓組みを保存しました。ラウンド開始でタイマーを開始できます。`
      );
    } catch (e) {
      console.error(e);
      alert("個人戦の卓組みに失敗しました");
    }
  };

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

      await updateDoc(tournamentMatchDocRef(latestMatch.id), {
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

      await updateDoc(tournamentMatchDocRef(latestMatch.id), {
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

      await updateDoc(tournamentMatchDocRef(latestMatch.id), {
        tables: updatedTables,
      });

      if (latestMatch.matchType === "individual-swiss") {
        await finishTournamentIndividualBoardMatch(
          EVENT_ID,
          latestMatch.individualRound ?? 1,
          tableNumber
        );
      }

      const winnerPlayer =
        targetTable.player1?.id === targetTable.pendingWinnerId
          ? targetTable.player1
          : targetTable.player2;

      const loserPlayer =
        targetTable.player1?.id === targetTable.pendingWinnerId
          ? targetTable.player2
          : targetTable.player1;

      const winnerId = targetTable.pendingWinnerId;
      if (winnerId) {
        const winnerRef = doc(db, "players", winnerId);
        const winnerSnap = await getDoc(winnerRef);
        if (winnerSnap.exists()) {
          if (
            latestMatch.matchType === "individual-swiss" &&
            loserPlayer?.id
          ) {
            const loserRef = doc(db, "players", loserPlayer.id);
            await Promise.all([
              updateDoc(winnerRef, {
                wins: increment(1),
                opponents: arrayUnion(loserPlayer.id),
                updatedAt: serverTimestamp(),
              }),
              updateDoc(loserRef, {
                loss: increment(1),
                opponents: arrayUnion(winnerId),
                updatedAt: serverTimestamp(),
              }),
            ]);
          } else {
            await updateDoc(winnerRef, {
              wins: increment(1),
            });
          }
        }
      }

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

      await updateDoc(tournamentMatchDocRef(latestMatch.id), {
        tables: updatedTables,
      });
      if (latestMatch.matchType === "individual-swiss") {
        await finishTournamentIndividualBoardMatch(
          EVENT_ID,
          latestMatch.individualRound ?? 1,
          tableNumber
        );
      }
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

  const renderTypeLabel = (
    type: "same-rank" | "cross-rank" | "random" | "team-random" | "individual"
  ) => {
    if (type === "same-rank") return "同階級";
    if (type === "cross-rank") return "階級またぎ";
    if (type === "team-random") return "チーム戦ランダム";
    if (type === "individual") return "個人戦";
    return "完全ランダム";
  };

  const getStatusLabel = (table: SavedMatchTable) => {
    if ((table as any).finished) {
      return { text: "終了", color: "#4ade80" };
    }
    if (table.winnerId) {
      return { text: "承認済み", color: "#4ade80" };
    }
    if (table.pendingWinnerId) {
      return { text: "勝利申請中", color: "#fb923c" };
    }
    if (table.started) {
      return { text: "対戦中", color: "#93c5fd" };
    }
    return { text: "未開始", color: "#94a3b8" };
  };

  const getPlayerBoxStyle = (
    playerId: string | undefined,
    pendingWinnerId?: string | null,
    winnerId?: string | null
  ) => {
    if (!playerId) {
      return {
        border: "1px solid rgba(168, 85, 247, 0.35)",
        backgroundColor: "rgba(255, 255, 255, 0.06)",
        color: "#e5e7eb",
      };
    }

    if (winnerId === playerId) {
      return {
        border: "2px solid #4ade80",
        backgroundColor: "rgba(74, 222, 128, 0.12)",
        color: "#e5e7eb",
      };
    }

    if (pendingWinnerId === playerId) {
      return {
        border: "2px solid #fb923c",
        backgroundColor: "rgba(251, 146, 60, 0.12)",
        color: "#e5e7eb",
      };
    }

    return {
      border: "1px solid rgba(168, 85, 247, 0.35)",
      backgroundColor: "rgba(255, 255, 255, 0.06)",
      color: "#e5e7eb",
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

     // new Notification(title, { body });
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

  const rankCardsData = useMemo((): RankCardData[] => {
    const byRank = (rank: string) =>
      players.filter((p) => p.status !== "inactive" && p.rank === rank);
    const mk = (
      list: Player[],
      key: RankCardData["key"],
      label: string
    ): RankCardData => ({
      key,
      label,
      total: list.length,
      waiting: list.filter((p) => p.status === "waiting").length,
      playing: list.filter((p) => p.status === "playing").length,
      participants: list.map((p) => ({
        id: p.id,
        name: p.name,
        badgeSummary: participantSummaryLine(p.playStyle, p.badges),
      })),
    });
    return [
      mk(byRank("モンスターボール級"), "monster", "モンスターボール級"),
      mk(byRank("スーパーボール級"), "super", "スーパーボール級"),
      mk(byRank("ハイパーボール級"), "hyper", "ハイパーボール級"),
    ];
  }, [players]);

  const goodRankingRows = useMemo(() => {
    return [...players]
      .map((p) => ({
        playerId: p.id,
        name: (p.name || "").trim() || "（無名）",
        goodCount: p.goodCount ?? 0,
      }))
      .sort(
        (a, b) =>
          b.goodCount - a.goodCount || a.name.localeCompare(b.name, "ja")
      )
      .map((row, i) => ({ rank: i + 1, ...row }));
  }, [players]);

  const getPendingPlayerName = (table: SavedMatchTable) => {
    if (!table.pendingWinnerId) return null;
    if (table.pendingWinnerId === table.player1?.id) return table.player1?.name || null;
    if (table.pendingWinnerId === table.player2?.id) return table.player2?.name || null;
    return null;
  };

  const tournamentGridCounts = useMemo(() => {
    if (!latestMatch?.tables?.length) {
      return { playing: 0, finished: 0 };
    }
    let playing = 0;
    let finished = 0;
    for (const t of latestMatch.tables) {
      if (!t.player1) continue;
      if (t.winnerId) finished++;
      else playing++;
    }
    return { playing, finished };
  }, [latestMatch]);

  const tournamentRecentRows = useMemo((): RecentMatchRow[] => {
    if (!latestMatch?.tables?.length) return [];
    return latestMatch.tables.slice(0, 3).map((t) => ({
      tableNumber: t.tableNumber,
      player1: t.player1?.name?.trim() || "—",
      player2: t.player2?.name?.trim() || "不戦勝",
    }));
  }, [latestMatch]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#312e81] to-[#4c1d95]">
      <PokabuAdminUI
        mode={adminMode}
        onModeChange={setAdminMode}
        waitingCount={waitingCount}
        playingCount={playingCount}
        tournamentGridCounts={tournamentGridCounts}
        waitingParticipants={waitingParticipantsList}
        rankCards={rankCardsData}
        recentMatches={
          adminMode === "tournament" ? tournamentRecentRows : casualRecentMatches
        }
        onCasualMatch={() => void handleCasualMatch()}
        onForceWaiting={() => void handleResetPlayers()}
        onShowMoreMatches={() => router.push("/board")}
        onDeactivateParticipant={async (id) => {
          try {
            await setPlayerInactive(id);
          } catch (error) {
            console.error(error);
            alert("無効化に失敗しました");
          }
        }}
        casualRankPriority={casualRankPriority}
        onCasualRankPriorityChange={setCasualRankPriority}
        casualAvoidRematch={casualAvoidRematch}
        onCasualAvoidRematchChange={setCasualAvoidRematch}
        goodRankingRows={goodRankingRows}
        goodLogsByPlayerId={goodLogsByPlayerId}
        headerSlot={
          adminMode === "tournament" ? (
            <AdminHomeHeaderSlot
              adminMode={adminMode}
              remainingSeconds={remainingSeconds}
              timerText={timerText}
              onResultsClick={() => router.push("/results")}
              onRankingClick={() => router.push("/ranking")}
            />
          ) : undefined
        }
        resetSlot={
          <div className="rounded-xl border border-purple-400/30 bg-white/10 p-5 text-left shadow-[0_0_20px_rgba(168,85,247,0.3)] backdrop-blur-md">
            <p className="mb-4 text-sm text-gray-300">
              全参加者を無効化し、進行中の交流会マッチも終了扱いにします。
            </p>
            <button
              type="button"
              onClick={() => void handleResetAllParticipants()}
              className="min-h-[52px] w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 text-base font-bold text-white shadow-[0_0_18px_rgba(168,85,247,0.55)]"
            >
              全員参加者リセット
            </button>
          </div>
        }
        tournamentSlot={
          <div className="space-y-5 text-gray-300">
      {latestMatch?.matchType === "individual-swiss" &&
      latestMatch.individualRound != null ? (
        <div
          style={{
            textAlign: "center",
            marginBottom: 16,
            fontSize: 22,
            fontWeight: "bold",
            color: "#ffffff",
            letterSpacing: "0.02em",
          }}
        >
          Round {latestMatch.individualRound}
        </div>
      ) : null}
      {latestMatch?.matchType === "team-random" && (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      gap: 20,
      marginBottom: 20,
      fontWeight: "bold",
      fontSize: 18,
      color: "#ffffff",
    }}
  >
    

    <div style={{
  display: "grid",
  gridTemplateColumns: "1fr 1fr auto",
  gap: 12,
  alignItems: "stretch"
}}>
  
  <div
  onClick={() => setSelectedTeam(selectedTeam === "A" ? null : "A")}
  style={{
    background: "rgba(56, 189, 248, 0.2)",
    border: "1px solid rgba(56, 189, 248, 0.45)",
    color: "#ffffff",
    padding: "12px 16px",
    borderRadius: 12,
    fontSize: 16,
    fontWeight: "bold",
    whiteSpace: "nowrap",
    textAlign: "center",
    cursor: "pointer",
  }}
>
  チームA：{teamWinCounts.A}勝
</div>
<div
  onClick={() => setSelectedTeam(selectedTeam === "B" ? null : "B")}
  style={{
    background: "rgba(244, 114, 182, 0.2)",
    border: "1px solid rgba(244, 114, 182, 0.45)",
    color: "#ffffff",
    padding: "12px 16px",
    borderRadius: 12,
    fontSize: 16,
    fontWeight: "bold",
    whiteSpace: "nowrap",
    textAlign: "center",
    cursor: "pointer",
  }}
>
  チームB：{teamWinCounts.B}勝
</div>

<button
  onClick={handleResetTeamCounts}
  style={{
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid rgba(168, 85, 247, 0.45)",
    background: "rgba(255, 255, 255, 0.08)",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: 16,
    fontWeight: "bold",
    whiteSpace: "nowrap",
    minWidth: 96
  }}
>
  リセット
</button>

{selectedTeam && (
  <div
    style={{
      marginTop: 16,
      marginBottom: 20,
      padding: 16,
      border: "1px solid rgba(168, 85, 247, 0.35)",
      borderRadius: 12,
      background: "rgba(255, 255, 255, 0.08)",
      boxShadow: "0 0 20px rgba(168, 85, 247, 0.2)",
      color: "#e5e7eb",
    }}
  >
    <div style={{ fontWeight: "bold", marginBottom: 10, color: "#ffffff" }}>
      {selectedTeam === "A" ? "チームAメンバー" : "チームBメンバー"}
    </div>

    {teamMembers[selectedTeam].length === 0 ? (
      <div>まだチーム戦の卓振りがありません</div>
    ) : (
      <div style={{ display: "grid", gap: 8 }}>
        {teamMembers[selectedTeam].map((name) => (
          <div
            key={name}
            style={{
              padding: "10px 12px",
              border: "1px solid rgba(168, 85, 247, 0.25)",
              borderRadius: 10,
              background: "rgba(255, 255, 255, 0.05)",
              color: "#e5e7eb",
            }}
          >
            {name}
          </div>
        ))}
      </div>
    )}
  </div>
)}
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
            border: "1px solid rgba(168, 85, 247, 0.45)",
            borderRadius: 8,
            backgroundColor: "rgba(255, 255, 255, 0.1)",
            color: "#ffffff",
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
            color: "#ffffff",
          }}
        >
          {roundMinutes}分
        </div>

        <button
          onClick={() => setRoundMinutes((prev) => Math.min(30, prev + 1))}
          style={{
            width: 42,
            height: 42,
            border: "1px solid rgba(168, 85, 247, 0.45)",
            borderRadius: 8,
            backgroundColor: "rgba(255, 255, 255, 0.1)",
            color: "#ffffff",
            fontSize: 20,
            cursor: "pointer",
          }}
        >
          ＋
        </button>
      </div>

      <div
  style={{
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginBottom: 30,
  }}
      >
        <button
          type="button"
          onClick={() => void handleIndividualSwissRound()}
          disabled={saving}
          style={{
            height: 56,
            width: "100%",
            fontSize: 16,
            border: "none",
            borderRadius: 10,
            backgroundImage: "linear-gradient(to right, #f97316, #ec4899)",
            boxShadow: "0 0 20px rgba(255, 120, 0, 0.45)",
            color: "white",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          個人戦
        </button>
        <button
  type="button"
  onClick={() => void handleTeamRandomMatch()}
  disabled={saving}
  style={{
    height: 56,
    width: "100%",
    fontSize: 16,
    border: "none",
    borderRadius: 10,
    backgroundImage: "linear-gradient(to right, #16a34a, #059669)",
    boxShadow: "0 0 18px rgba(34, 197, 94, 0.45)",
    color: "white",
    cursor: saving ? "not-allowed" : "pointer",
    opacity: saving ? 0.7 : 1,
  }}
>
  チーム戦
</button>
        {latestMatch ? (
          <button
            type="button"
            onClick={() => void handleStartRound()}
            disabled={startingRound}
            style={{
              gridColumn: "1 / -1",
              height: 56,
              width: "100%",
              fontSize: 16,
              border: "none",
              borderRadius: 10,
              backgroundImage: "linear-gradient(to right, #3b82f6, #6366f1)",
              boxShadow: "0 0 20px rgba(59, 130, 246, 0.5)",
              color: "white",
              cursor: startingRound ? "not-allowed" : "pointer",
              opacity: startingRound ? 0.7 : 1,
            }}
          >
            {startingRound ? "開始中..." : "ラウンド開始"}
          </button>
        ) : null}
      </div>

      <div>
        <h2 className="mb-4 text-center text-lg font-bold text-white">
          直近の卓振り結果
        </h2>

        {!latestMatch ? (
          <p className="text-center text-gray-300">まだ保存履歴はありません</p>
        ) : (
          <div
            style={{
              border: "1px solid rgba(168, 85, 247, 0.35)",
              borderRadius: 12,
              padding: 14,
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              boxShadow: "0 0 20px rgba(168, 85, 247, 0.25)",
              backdropFilter: "blur(8px)",
            }}
          >
            <div style={{ marginBottom: 16, fontWeight: "bold", color: "#ffffff" }}>
              卓振り種別：
              {latestMatch.matchType === "individual-swiss"
                ? `個人戦（ラウンド制）${
                    latestMatch.individualRound != null
                      ? ` · Round ${latestMatch.individualRound}`
                      : ""
                  }`
                : latestMatch.matchType === "rank-priority"
                  ? "個人戦(階級優先)"
                  : latestMatch.matchType === "team-random"
                    ? "チーム戦(階級優先)"
                    : "完全ランダム戦"}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
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
                      border: "1px solid rgba(168, 85, 247, 0.3)",
                      borderRadius: 10,
                      padding: 16,
                      backgroundColor: "rgba(15, 23, 42, 0.45)",
                    }}
                  >
                    <div style={{ fontWeight: "bold", marginBottom: 8, color: "#ffffff" }}>
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

                    <div style={{ marginBottom: 8, color: "#d1d5db" }}>
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
   <div style={{ fontSize: 12, color: "#9ca3af" }}>
     {playStyleLine(
       normalizePlayStyle({
         playStyle: table.player1.playStyle,
         tags: table.player1.tags,
       })
     )}
     {badgesEmojiCompact(
       normalizeBadges({ badges: table.player1.badges })
     ) ? (
       <span style={{ marginLeft: 6 }}>
         {badgesEmojiCompact(
           normalizeBadges({ badges: table.player1.badges })
         )}
       </span>
     ) : null}
   </div>
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
      <div style={{ fontWeight: "bold" }}>{table.player2.name}</div>
      <div>
        {table.player2Team && `（${table.player2Team}）`}
        {`（${table.player2.rank}）`}
      </div>
      <div style={{ fontSize: 12, color: "#9ca3af" }}>
        {playStyleLine(
          normalizePlayStyle({
            playStyle: table.player2.playStyle,
            tags: table.player2.tags,
          })
        )}
        {badgesEmojiCompact(
          normalizeBadges({ badges: table.player2.badges })
        ) ? (
          <span style={{ marginLeft: 6 }}>
            {badgesEmojiCompact(
              normalizeBadges({ badges: table.player2.badges })
            )}
          </span>
        ) : null}
      </div>
    </>
  ) : (
    table.winnerId && latestMatch.matchType === "individual-swiss"
      ? "不戦勝（輪空）"
      : "不在"
  )}
</div>

                    {pendingName && !winnerName && (
                      <div
                        style={{
                          marginBottom: 12,
                          padding: 10,
                          borderRadius: 8,
                          backgroundColor: "rgba(251, 146, 60, 0.12)",
                          border: "1px solid rgba(251, 146, 60, 0.45)",
                          color: "#e5e7eb",
                        }}
                      >
                        <div style={{ color: "#fb923c", fontWeight: "bold", marginBottom: 6 }}>
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
                      <div style={{ marginBottom: 10, color: "#4ade80", fontWeight: "bold" }}>
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
                          backgroundImage: "linear-gradient(to right, #3b82f6, #6366f1)",
                          boxShadow: "0 0 14px rgba(59, 130, 246, 0.45)",
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
                          backgroundImage: "linear-gradient(to right, #22c55e, #059669)",
                          boxShadow: "0 0 14px rgba(34, 197, 94, 0.45)",
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
                            backgroundImage: "linear-gradient(to right, #f97316, #ec4899)",
                            boxShadow: "0 0 12px rgba(249, 115, 22, 0.4)",
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
                            borderRadius: 8,
                            background: "rgba(255, 255, 255, 0.12)",
                            border: "1px solid rgba(168, 85, 247, 0.4)",
                            boxShadow: "0 0 12px rgba(168, 85, 247, 0.25)",
                            color: "#ffffff",
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
        }
      />
    </div>
  );
}