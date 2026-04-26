"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { badgesForDisplayFromDoc, badgesWithLabels } from "@/lib/playerBadges";

export default function MatchSheetPage() {
  return (
    <Suspense fallback={<MatchSheetLoading />}>
      <MatchSheetPageContent />
    </Suspense>
  );
}

function MatchSheetPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const eventId = searchParams.get("eventId") || "default";
  const matchId = searchParams.get("matchId") || "";
  const playerId = searchParams.get("playerId") || "";
  const initialOpponentId = searchParams.get("opponentId") || "";
  const initialOpponentName = searchParams.get("opponentName") || "";
  const sheetId = (searchParams.get("sheetId") ?? "").trim();
  const from = (searchParams.get("from") ?? "").trim();

  const [opponentName, setOpponentName] = useState(initialOpponentName);
  const [myDeck, setMyDeck] = useState("");
  const [opponentDeck, setOpponentDeck] = useState("");
  const [mySide, setMySide] = useState(0);
  const [opponentSide, setOpponentSide] = useState(0);
  const [opponentInfoText, setOpponentInfoText] = useState("");
  const [loadingOpponent, setLoadingOpponent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingEditDoc, setLoadingEditDoc] = useState(Boolean(sheetId));
  const [loadEditError, setLoadEditError] = useState<string | null>(null);
  const [loadedSheetMeta, setLoadedSheetMeta] = useState<{
    eventId: string;
    matchId: string;
    opponentId: string | null;
  } | null>(null);

  useEffect(() => {
    if (!sheetId) {
      setLoadingEditDoc(false);
      setLoadEditError(null);
      setLoadedSheetMeta(null);
      return;
    }
    let cancelled = false;
    const run = async () => {
      setLoadingEditDoc(true);
      setLoadEditError(null);
      const resolvedPlayerId =
        playerId.trim() ||
        (typeof window !== "undefined"
          ? (window.localStorage.getItem("playerId") ?? "").trim()
          : "");
      if (!resolvedPlayerId) {
        setLoadEditError(
          "参加者 ID が取得できません。参加登録後にスコアシート一覧から編集を開いてください。"
        );
        setLoadingEditDoc(false);
        return;
      }
      try {
        const snap = await getDoc(doc(db, "matchSheets", sheetId));
        if (cancelled) return;
        if (!snap.exists()) {
          setLoadEditError("対戦シートが見つかりません。");
          setLoadingEditDoc(false);
          return;
        }
        const data = snap.data() as Record<string, unknown>;
        const owner =
          typeof data.playerId === "string" ? data.playerId.trim() : "";
        if (owner !== resolvedPlayerId) {
          setLoadEditError("このシートを編集できません（本人のデータのみ編集できます）。");
          setLoadingEditDoc(false);
          return;
        }
        setOpponentName(
          typeof data.opponentName === "string" ? data.opponentName : ""
        );
        setMyDeck(typeof data.myDeck === "string" ? data.myDeck : "");
        setOpponentDeck(typeof data.opponentDeck === "string" ? data.opponentDeck : "");
        const ms = data.mySide;
        const os = data.opponentSide;
        if (typeof ms === "number" && Number.isFinite(ms)) {
          setMySide(Math.min(6, Math.max(0, Math.round(ms))));
        } else if (typeof ms === "string") {
          const n = Number(ms);
          if (!Number.isNaN(n)) setMySide(Math.min(6, Math.max(0, Math.round(n))));
        }
        if (typeof os === "number" && Number.isFinite(os)) {
          setOpponentSide(Math.min(6, Math.max(0, Math.round(os))));
        } else if (typeof os === "string") {
          const n = Number(os);
          if (!Number.isNaN(n))
            setOpponentSide(Math.min(6, Math.max(0, Math.round(n))));
        }
        setOpponentInfoText(
          typeof data.opponentInfoText === "string" ? data.opponentInfoText : ""
        );
        const oid = data.opponentId;
        setLoadedSheetMeta({
          eventId:
            typeof data.eventId === "string" && data.eventId.trim()
              ? data.eventId.trim()
              : "default",
          matchId: typeof data.matchId === "string" ? data.matchId : "",
          opponentId: typeof oid === "string" ? oid : null,
        });
      } catch (e) {
        console.error("[match-sheet] load sheet for edit", e);
        if (!cancelled) setLoadEditError("読み込みに失敗しました。");
      } finally {
        if (!cancelled) setLoadingEditDoc(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [sheetId, playerId]);

  const canAutoFillOpponent = useMemo(() => {
    return Boolean(!sheetId && matchId && playerId);
  }, [sheetId, matchId, playerId]);

  const returnHref = useMemo(() => {
    if (from === "player") {
      const resolvedPlayerId =
        playerId.trim() ||
        (typeof window !== "undefined"
          ? (window.localStorage.getItem("playerId") ?? "").trim()
          : "");
      if (resolvedPlayerId) return `/player/${encodeURIComponent(resolvedPlayerId)}`;
    }
    if (from === "score") return "/match-sheets";
    return "/match-sheets";
  }, [from, playerId]);

  const handleAutofillOpponent = async () => {
    if (!canAutoFillOpponent) {
      alert("対戦情報が不足しているため自動入力できません");
      return;
    }
    setLoadingOpponent(true);
    try {
      const matchSnap = await getDoc(doc(db, "events", eventId, "matches", matchId));
      if (!matchSnap.exists()) {
        alert("対戦情報が見つかりません");
        return;
      }

      const match = matchSnap.data() as Record<string, unknown>;
      const p1 = typeof match.player1Id === "string" ? match.player1Id : "";
      const p2 = typeof match.player2Id === "string" ? match.player2Id : "";
      const opponentId = playerId === p1 ? p2 : playerId === p2 ? p1 : "";
      if (!opponentId) {
        alert("対戦相手を判定できません");
        return;
      }

      const fallbackName =
        playerId === p1
          ? typeof match.player2Name === "string"
            ? match.player2Name
            : ""
          : typeof match.player1Name === "string"
            ? match.player1Name
            : "";

      const oppSnap = await getDoc(doc(db, "players", opponentId));
      if (!oppSnap.exists()) {
        setOpponentName(fallbackName);
        setOpponentInfoText("");
        return;
      }

      const opp = oppSnap.data() as Record<string, unknown>;
      const oppName = typeof opp.name === "string" ? opp.name : fallbackName;
      const badgeIds = badgesForDisplayFromDoc(opp);
      setOpponentName(oppName);
      setOpponentInfoText(badgeIds.length > 0 ? badgesWithLabels(badgeIds) : "");
    } catch (error) {
      console.error(error);
      alert("対戦相手の自動入力に失敗しました");
    } finally {
      setLoadingOpponent(false);
    }
  };

  const handleSave = async () => {
    const resolvedPlayerId =
      playerId.trim() ||
      (typeof window !== "undefined"
        ? (window.localStorage.getItem("playerId") ?? "").trim()
        : "");
    const resolvedMatchId = matchId.trim();

    const ms = Number.isFinite(mySide)
      ? Math.min(6, Math.max(0, Math.round(Number(mySide))))
      : 0;
    const os = Number.isFinite(opponentSide)
      ? Math.min(6, Math.max(0, Math.round(Number(opponentSide))))
      : 0;

    console.log("[match-sheet] save precheck", {
      eventId,
      matchIdFromUrl: matchId,
      matchIdResolved: resolvedMatchId,
      playerIdFromUrl: playerId,
      playerIdResolved: resolvedPlayerId,
      opponentNameTrimmed: opponentName.trim(),
      mySide: ms,
      opponentSide: os,
      myDeckTrimmed: myDeck.trim(),
      opponentDeckTrimmed: opponentDeck.trim(),
    });

    if (!resolvedPlayerId) {
      alert(
        "参加者 ID が取得できません。参加登録後に再度お試しください。対戦中は「対戦シート入力」から開くと保存できます。"
      );
      return;
    }
    if (!opponentName.trim()) {
      alert("対戦相手名を入力してください");
      return;
    }
    if (sheetId) {
      if (loadingEditDoc) {
        alert("読み込み中です。少し待ってから再度お試しください。");
        return;
      }
      if (loadEditError) {
        return;
      }
      if (!loadedSheetMeta) {
        alert("シート情報を読み込めませんでした。");
        return;
      }
    }

    setSaving(true);
    try {
      let playerName = "";
      try {
        const playerSnap = await getDoc(doc(db, "players", resolvedPlayerId));
        if (playerSnap.exists()) {
          const pd = playerSnap.data() as Record<string, unknown>;
          playerName = typeof pd.name === "string" ? pd.name.trim() : "";
        }
      } catch (e) {
        console.error("[match-sheet] failed to load player for playerName", e);
      }

      const payload = {
        playerId: resolvedPlayerId,
        playerName,
        opponentName: opponentName.trim(),
        mySide: ms,
        opponentSide: os,
        myDeck: myDeck.trim(),
        opponentDeck: opponentDeck.trim(),
        createdAt: serverTimestamp(),
        eventId,
        matchId: resolvedMatchId,
        opponentId: initialOpponentId || null,
        opponentInfoText: opponentInfoText.trim(),
      };

      console.log("[match-sheet] save playerId", resolvedPlayerId, "payload keys", Object.keys(payload));

      if (sheetId) {
        const meta = loadedSheetMeta;
        await updateDoc(doc(db, "matchSheets", sheetId), {
          playerId: resolvedPlayerId,
          playerName,
          opponentName: opponentName.trim(),
          mySide: ms,
          opponentSide: os,
          myDeck: myDeck.trim(),
          opponentDeck: opponentDeck.trim(),
          eventId: meta?.eventId ?? eventId,
          matchId: meta?.matchId ?? resolvedMatchId,
          opponentId: meta?.opponentId ?? (initialOpponentId || null),
          opponentInfoText: opponentInfoText.trim(),
          updatedAt: serverTimestamp(),
        });
        alert("対戦シートを更新しました");
        router.push(returnHref);
      } else {
        await addDoc(collection(db, "matchSheets"), payload);
        alert("対戦シートを保存しました");
        router.push(returnHref);
      }
    } catch (error) {
      console.error("[match-sheet] save Firestore error", error);
      alert("保存に失敗しました");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "20px 14px 28px",
      }}
    >
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #fed7aa",
          boxShadow: "0 10px 24px rgba(194, 65, 12, 0.12)",
          padding: 16,
        }}
      >
        <h1 style={{ margin: 0, marginBottom: 12, color: "#2D2D2D", fontSize: 24 }}>
          {sheetId ? "対戦シート編集" : "対戦シート入力"}
        </h1>

        {loadEditError ? (
          <p style={{ marginBottom: 12, color: "#b91c1c", fontSize: 14, lineHeight: 1.5 }}>
            {loadEditError}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void handleAutofillOpponent()}
          disabled={loadingOpponent || !canAutoFillOpponent}
          style={{
            width: "100%",
            border: "1px solid #f59e0b",
            background: "linear-gradient(90deg, #fb923c, #f97316)",
            color: "#fff",
            borderRadius: 12,
            padding: "11px 14px",
            fontSize: 15,
            fontWeight: 700,
            cursor: loadingOpponent || !canAutoFillOpponent ? "not-allowed" : "pointer",
            opacity: loadingOpponent || !canAutoFillOpponent ? 0.7 : 1,
            marginBottom: 12,
          }}
        >
          {loadingOpponent ? "取得中..." : "対戦相手の情報を入力"}
        </button>

        <Field
          label="対戦相手名"
          value={opponentName}
          onChange={setOpponentName}
          placeholder="対戦相手名"
          disabled={Boolean(sheetId && loadingEditDoc) || Boolean(loadEditError)}
        />
        {opponentInfoText ? (
          <p style={{ marginTop: -4, marginBottom: 10, color: "#7A7A7A", fontSize: 12 }}>
            相手の属性: {opponentInfoText}
          </p>
        ) : null}
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              marginBottom: 8,
              color: "#2D2D2D",
              fontSize: 14,
              fontWeight: 700,
            }}
          >
            サイド状況
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
              rowGap: 10,
            }}
          >
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flex: "1 1 auto",
                minWidth: 0,
                color: "#2D2D2D",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <span style={{ flexShrink: 0 }}>自分</span>
              <select
                value={mySide}
                onChange={(e) => setMySide(Number(e.target.value))}
                disabled={Boolean(sheetId && loadingEditDoc) || Boolean(loadEditError)}
                aria-label="自分のサイド状況（0〜6）"
                style={{
                  flex: "1 1 0",
                  minWidth: 72,
                  maxWidth: 120,
                  border: "1px solid #fdba74",
                  borderRadius: 10,
                  background: "#fffaf7",
                  color: "#2D2D2D",
                  padding: "10px 12px",
                  fontSize: 15,
                  boxSizing: "border-box",
                  cursor: "pointer",
                }}
              >
                {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                flex: "1 1 auto",
                minWidth: 0,
                color: "#2D2D2D",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              <span style={{ flexShrink: 0 }}>相手</span>
              <select
                value={opponentSide}
                onChange={(e) => setOpponentSide(Number(e.target.value))}
                disabled={Boolean(sheetId && loadingEditDoc) || Boolean(loadEditError)}
                aria-label="相手のサイド状況（0〜6）"
                style={{
                  flex: "1 1 0",
                  minWidth: 72,
                  maxWidth: 120,
                  border: "1px solid #fdba74",
                  borderRadius: 10,
                  background: "#fffaf7",
                  color: "#2D2D2D",
                  padding: "10px 12px",
                  fontSize: 15,
                  boxSizing: "border-box",
                  cursor: "pointer",
                }}
              >
                {[0, 1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
        <Field
          label="自分のデッキ"
          value={myDeck}
          onChange={setMyDeck}
          placeholder="自分のデッキ名"
          disabled={Boolean(sheetId && loadingEditDoc) || Boolean(loadEditError)}
        />
        <Field
          label="相手のデッキ"
          value={opponentDeck}
          onChange={setOpponentDeck}
          placeholder="相手のデッキ名"
          disabled={Boolean(sheetId && loadingEditDoc) || Boolean(loadEditError)}
        />

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={
            saving ||
            Boolean(sheetId && loadingEditDoc) ||
            Boolean(loadEditError)
          }
          style={{
            width: "100%",
            border: "none",
            background: "linear-gradient(90deg, #10b981, #14b8a6)",
            color: "#fff",
            borderRadius: 12,
            padding: "12px 14px",
            fontSize: 16,
            fontWeight: 700,
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.75 : 1,
            marginTop: 8,
          }}
        >
          {saving ? "保存中..." : "保存する"}
        </button>
      </div>
    </div>
  );
}

function MatchSheetLoading() {
  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "20px 14px 28px",
      }}
    >
      <div
        style={{
          maxWidth: 560,
          margin: "0 auto",
          background: "#fff",
          borderRadius: 16,
          border: "1px solid #fed7aa",
          boxShadow: "0 10px 24px rgba(194, 65, 12, 0.12)",
          padding: 16,
          color: "#7A7A7A",
          fontSize: 14,
        }}
      >
        読み込み中...
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ marginBottom: 4, color: "#2D2D2D", fontSize: 14, fontWeight: 700 }}>{label}</div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={{
          width: "100%",
          border: "1px solid #fdba74",
          borderRadius: 10,
          background: "#fffaf7",
          color: "#2D2D2D",
          padding: "10px 12px",
          fontSize: 15,
          boxSizing: "border-box",
          opacity: disabled ? 0.65 : 1,
        }}
      />
    </div>
  );
}
