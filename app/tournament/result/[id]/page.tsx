"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { db } from "@/lib/firebase";
import { sendCasualGood } from "@/lib/good";
import { saveTournamentPlayerResult } from "@/lib/tournamentPlayerResult";
import { DEFAULT_EVENT_ID } from "@/lib/tournamentBoardMatches";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";

type BoardMatchData = {
  id: string;
  tableNumber: number;
  player1Id: string;
  player1Name: string;
  player2Id: string;
  player2Name: string;
  round: number | null;
  status: string;
  player1GoodSent?: boolean;
  player2GoodSent?: boolean;
};

type OppProfile = { id: string; name: string; rank: string };

const SIDES = [0, 1, 2, 3, 4, 5, 6] as const;

function resultFromSides(
  mySide: number,
  oppSide: number
): "win" | "loss" | "draw" {
  if (mySide > oppSide) return "win";
  if (mySide < oppSide) return "loss";
  return "draw";
}

export default function TournamentResultPage() {
  const params = useParams<{ id?: string }>();
  const playerId = typeof params?.id === "string" ? params.id : "";

  const [loading, setLoading] = useState(true);
  const [boardMatch, setBoardMatch] = useState<BoardMatchData | null>(null);
  const [selfName, setSelfName] = useState("");
  const [selfRank, setSelfRank] = useState("");
  const [opponent, setOpponent] = useState<OppProfile | null>(null);

  const [mySide, setMySide] = useState<number | null>(null);
  const [oppSide, setOppSide] = useState<number | null>(null);
  const [opponentDeck, setOpponentDeck] = useState("");
  const [goodSent, setGoodSent] = useState(false);
  const [sendingGood, setSendingGood] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const lastBoardIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!playerId) {
      setLoading(false);
      return;
    }

    const selfRef = doc(db, "players", playerId);
    void getDoc(selfRef).then((snap) => {
      if (snap.exists()) {
        const d = snap.data();
        setSelfName(String(d.name ?? "").trim() || "（無名）");
        setSelfRank(String(d.rank ?? "").trim() || "—");
      }
    });

    const q = query(
      collection(db, "events", DEFAULT_EVENT_ID, "matches"),
      where("status", "==", "playing")
    );

    const unsub = onSnapshot(q, (snapshot) => {
      const hit = snapshot.docs.find((docSnap) => {
        const d = docSnap.data();
        if (d.matchType !== "tournament_individual") return false;
        const p1 = d.player1Id as string | undefined;
        const p2 = d.player2Id as string | undefined;
        return p1 === playerId || p2 === playerId;
      });

      if (!hit) {
        lastBoardIdRef.current = null;
        setBoardMatch(null);
        setLoading(false);
        return;
      }

      const d = hit.data();
      if (lastBoardIdRef.current !== hit.id) {
        lastBoardIdRef.current = hit.id;
        setMySide(null);
        setOppSide(null);
        setOpponentDeck("");
        setDone(false);
      }
      setBoardMatch({
        id: hit.id,
        tableNumber:
          typeof d.tableNumber === "number" ? d.tableNumber : Number(d.tableNumber) || 1,
        player1Id: String(d.player1Id ?? ""),
        player1Name: String(d.player1Name ?? d.player1 ?? ""),
        player2Id: String(d.player2Id ?? ""),
        player2Name: String(d.player2Name ?? d.player2 ?? ""),
        round: typeof d.round === "number" ? d.round : null,
        status: String(d.status ?? ""),
        player1GoodSent: d.player1GoodSent === true,
        player2GoodSent: d.player2GoodSent === true,
      });
      setLoading(false);
    });

    return () => unsub();
  }, [playerId]);

  useEffect(() => {
    if (!boardMatch || !playerId) {
      setOpponent(null);
      setGoodSent(false);
      return;
    }
    const asP1 = boardMatch.player1Id === playerId;
    const oppId = asP1 ? boardMatch.player2Id : boardMatch.player1Id;
    if (!oppId) {
      setOpponent(null);
      return;
    }
    void getDoc(doc(db, "players", oppId)).then((snap) => {
      if (!snap.exists()) {
        setOpponent({
          id: oppId,
          name: asP1 ? boardMatch.player2Name : boardMatch.player1Name,
          rank: "—",
        });
        return;
      }
      const d = snap.data();
      setOpponent({
        id: snap.id,
        name: String(d.name ?? "").trim() || "（無名）",
        rank: String(d.rank ?? "").trim() || "—",
      });
    });

    const g = asP1 ? boardMatch.player1GoodSent : boardMatch.player2GoodSent;
    setGoodSent(g === true);
  }, [boardMatch, playerId]);

  const oppDisplayName = opponent?.name ?? "—";
  const oppDisplayRank = opponent?.rank ?? "—";

  const outcome = useMemo(() => {
    if (mySide === null || oppSide === null) return null;
    return resultFromSides(mySide, oppSide);
  }, [mySide, oppSide]);

  const outcomeLabel = useMemo(() => {
    if (!outcome) return "—";
    if (outcome === "win") return "勝ち";
    if (outcome === "loss") return "負け";
    return "引き分け";
  }, [outcome]);

  const winnerId = useMemo(() => {
    if (!boardMatch || !opponent?.id || mySide === null || oppSide === null) return null;
    if (mySide === oppSide) return "draw" as const;
    if (mySide > oppSide) return playerId;
    return opponent.id;
  }, [boardMatch, opponent, mySide, oppSide, playerId]);

  const handleNice = async () => {
    if (!boardMatch || !playerId) return;
    setSendingGood(true);
    try {
      await sendCasualGood(DEFAULT_EVENT_ID, boardMatch.id, playerId);
      setGoodSent(true);
      alert("ナイス対戦を送りました");
    } catch (e) {
      console.error(e);
      alert(e instanceof Error ? e.message : "送信に失敗しました");
    } finally {
      setSendingGood(false);
    }
  };

  const handleSubmit = async () => {
    if (!boardMatch || !opponent || mySide === null || oppSide === null || !winnerId) {
      alert("サイドをそれぞれ1つずつ選んでください");
      return;
    }
    if (boardMatch.status !== "playing") {
      alert("この試合はすでに終了しています");
      return;
    }

    setSubmitting(true);
    try {
      await saveTournamentPlayerResult({
        eventId: DEFAULT_EVENT_ID,
        matchId: boardMatch.id,
        tableNumber: boardMatch.tableNumber,
        playerA: selfName,
        playerB: oppDisplayName,
        playerAId: playerId,
        playerBId: opponent.id,
        sideA: mySide,
        sideB: oppSide,
        winner: winnerId,
        resultStatus: outcome!,
        opponentDeck: opponentDeck.trim(),
        goodSent,
        reporterId: playerId,
        round: boardMatch.round,
      });
      setDone(true);
      alert("結果を送信しました");
    } catch (e) {
      console.error(e);
      alert("送信に失敗しました");
    } finally {
      setSubmitting(false);
    }
  };

  const card =
    "rounded-2xl border border-purple-500/35 bg-white/[0.07] p-5 shadow-[0_0_24px_rgba(139,92,246,0.2)] backdrop-blur-md";

  if (!playerId) {
    return (
      <div className="min-h-screen px-4 py-10 text-center text-gray-300">
        URL が不正です
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-lg text-violet-100">
        読み込み中…
      </div>
    );
  }

  if (!boardMatch) {
    return (
      <div className="min-h-screen px-4 py-12 text-center">
        <p className="text-lg text-violet-100">
          進行中の大会個人戦の卓が見つかりません。
        </p>
        <p className="mt-3 text-sm text-gray-400">
          卓が配られてからこのページを開いてください。
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 pb-28 pt-6 sm:px-5">
      <div className="mx-auto max-w-md space-y-5">
        <header className="text-center">
          <p className="text-xs font-semibold tracking-widest text-violet-300/90">
            ぽか部 · 大会結果入力
          </p>
        </header>

        {/* 1 卓番号 */}
        <section className={`${card} text-center`}>
          <p className="text-sm font-medium text-violet-200/80">卓番号</p>
          <p className="mt-2 text-5xl font-black tabular-nums tracking-tight text-white drop-shadow-[0_0_18px_rgba(167,139,250,0.55)]">
            卓{boardMatch.tableNumber}
          </p>
          {boardMatch.round != null ? (
            <p className="mt-2 text-sm text-cyan-200/90">Round {boardMatch.round}</p>
          ) : null}
        </section>

        {/* 2 名前 VS */}
        <section className={`${card}`}>
          <div className="text-center">
            <p className="text-xs text-violet-200/70">自分の名前</p>
            <p className="mt-1 text-2xl font-bold text-white">{selfName}</p>
            <p className="mt-0.5 text-sm text-gray-400">{selfRank}</p>
          </div>
          <p className="my-5 text-center text-3xl font-black text-fuchsia-300/95 drop-shadow-[0_0_12px_rgba(244,114,182,0.45)]">
            VS
          </p>
          <div className="text-center">
            <p className="text-xs text-violet-200/70">相手の名前</p>
            <p className="mt-1 text-2xl font-bold text-white">{oppDisplayName}</p>
            <p className="mt-0.5 text-sm text-gray-400">{oppDisplayRank}</p>
          </div>
        </section>

        {/* 3 サイド入力 */}
        <section className={card}>
          <p className="mb-4 text-center text-sm font-semibold text-violet-100">
            サイド入力
          </p>
          <div className="space-y-5">
            <div>
              <p className="mb-2 text-center text-xs font-medium text-cyan-200/90">
                自分
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SIDES.map((n) => (
                  <button
                    key={`me-${n}`}
                    type="button"
                    onClick={() => setMySide(n)}
                    className={`min-h-[48px] min-w-[48px] rounded-xl text-lg font-bold transition active:scale-95 ${
                      mySide === n
                        ? "bg-gradient-to-br from-cyan-400 to-blue-600 text-white shadow-[0_0_16px_rgba(34,211,238,0.5)] ring-2 ring-cyan-200/60"
                        : "border border-white/15 bg-white/5 text-gray-200 hover:bg-white/10"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-2 text-center text-xs font-medium text-fuchsia-200/90">
                相手
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {SIDES.map((n) => (
                  <button
                    key={`opp-${n}`}
                    type="button"
                    onClick={() => setOppSide(n)}
                    className={`min-h-[48px] min-w-[48px] rounded-xl text-lg font-bold transition active:scale-95 ${
                      oppSide === n
                        ? "bg-gradient-to-br from-fuchsia-500 to-violet-700 text-white shadow-[0_0_16px_rgba(217,70,239,0.45)] ring-2 ring-fuchsia-200/50"
                        : "border border-white/15 bg-white/5 text-gray-200 hover:bg-white/10"
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 4 サイド結果 */}
        <section className={`${card} text-center`}>
          <p className="text-sm text-violet-200/80">サイド結果</p>
          <p className="mt-3 text-6xl font-black tabular-nums tracking-tight text-white drop-shadow-[0_0_20px_rgba(167,139,250,0.35)]">
            {mySide === null || oppSide === null ? "—" : `${mySide} - ${oppSide}`}
          </p>
        </section>

        {/* 5 勝敗 */}
        <section className={`${card} text-center`}>
          <p className="text-sm text-violet-200/80">勝敗</p>
          <p className="mt-3 text-3xl font-black text-emerald-300 drop-shadow-[0_0_14px_rgba(52,211,153,0.35)]">
            勝敗：{outcomeLabel}
          </p>
        </section>

        {/* 6 相手デッキ */}
        <section className={card}>
          <label
            htmlFor="opp-deck"
            className="mb-2 block text-sm font-medium text-violet-100"
          >
            相手デッキ（任意）
          </label>
          <input
            id="opp-deck"
            type="text"
            value={opponentDeck}
            onChange={(e) => setOpponentDeck(e.target.value)}
            placeholder="空欄でも送信できます"
            className="w-full rounded-xl border border-white/15 bg-slate-900/60 px-4 py-3.5 text-base text-white placeholder:text-gray-500 focus:border-cyan-400/50 focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
          />
        </section>

        {/* 7 ナイス対戦 */}
        <section className={card}>
          <button
            type="button"
            onClick={() => void handleNice()}
            disabled={sendingGood || goodSent || done}
            className="w-full rounded-xl border border-amber-400/40 bg-gradient-to-r from-amber-500/25 to-orange-500/25 py-4 text-lg font-bold text-amber-100 shadow-[0_0_20px_rgba(251,191,36,0.25)] transition enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-45"
          >
            {goodSent ? "ナイス対戦（送信済）" : sendingGood ? "送信中…" : "ナイス対戦"}
          </button>
        </section>

        {/* 8 結果送信 */}
        <section className="pb-6">
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={
              submitting ||
              done ||
              mySide === null ||
              oppSide === null ||
              outcome === null
            }
            className="w-full rounded-2xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-indigo-600 py-5 text-xl font-black text-white shadow-[0_0_28px_rgba(139,92,246,0.55)] transition enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {done ? "送信済み" : submitting ? "送信中…" : "結果送信"}
          </button>
          {done ? (
            <p className="mt-3 text-center text-sm text-emerald-300/90">
              ありがとうございました。運営画面での確定をお待ちください。
            </p>
          ) : null}
        </section>
      </div>
    </div>
  );
}
