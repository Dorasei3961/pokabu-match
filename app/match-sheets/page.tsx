"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

type SheetRow = {
  id: string;
  opponentName: string;
  sideLabel: string;
  myDeck: string;
  opponentDeck: string;
  createdAtMs: number | null;
};

function createdAtMillis(data: Record<string, unknown>): number | null {
  const created = data.createdAt as { toMillis?: () => number; seconds?: number } | undefined;
  if (created && typeof created.toMillis === "function") {
    return created.toMillis();
  }
  if (created && typeof created.seconds === "number") {
    return created.seconds * 1000;
  }
  return null;
}

function sideSituationFromDoc(data: Record<string, unknown>): string {
  const ms = data.mySide;
  const os = data.opponentSide;
  if (typeof ms === "number" && typeof os === "number") {
    return `自分 ${ms} / 相手 ${os}`;
  }
  if (typeof ms === "string" && typeof os === "string") {
    const a = Number(ms);
    const b = Number(os);
    if (!Number.isNaN(a) && !Number.isNaN(b)) {
      return `自分 ${a} / 相手 ${b}`;
    }
  }
  const sd = data.sideDiff;
  if (typeof sd === "string" && sd.trim()) return sd.trim();
  return "—";
}

export default function MatchSheetsListPage() {
  const pathname = usePathname();
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [rows, setRows] = useState<SheetRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => setPlayerId(window.localStorage.getItem("playerId"));
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [pathname]);

  useEffect(() => {
    if (!playerId) {
      setRows([]);
      setError(null);
      return;
    }
    const currentPlayerId = playerId;
    console.log("[match-sheets] currentPlayerId", currentPlayerId);

    const q = query(collection(db, "matchSheets"), where("playerId", "==", currentPlayerId));
    return onSnapshot(
      q,
      (snap) => {
        setError(null);
        const list: SheetRow[] = snap.docs.map((d) => {
          const data = d.data() as Record<string, unknown>;
          console.log("[match-sheets] doc", d.id, "playerId", data.playerId);
          const createdAtMs = createdAtMillis(data);
          return {
            id: d.id,
            opponentName: String(data.opponentName ?? ""),
            sideLabel: sideSituationFromDoc(data),
            myDeck: String(data.myDeck ?? ""),
            opponentDeck: String(data.opponentDeck ?? ""),
            createdAtMs,
          };
        });
        list.sort((a, b) => {
          const ta = a.createdAtMs ?? 0;
          const tb = b.createdAtMs ?? 0;
          return tb - ta;
        });
        console.log("[match-sheets] matchSheets count", list.length, "rows", list);
        setRows(list);
      },
      (err) => {
        console.error("[match-sheets] Firestore error", err);
        const code = err && typeof err === "object" && "code" in err ? String((err as { code: unknown }).code) : "";
        const message =
          err && typeof err === "object" && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err);
        console.error("[match-sheets] Firestore error detail", { code, message });
        setError("一覧の取得に失敗しました（権限やインデックスを確認してください）");
        setRows([]);
      }
    );
  }, [playerId]);

  const handleConfirmDelete = async () => {
    if (!deleteTargetId) return;
    setDeleteBusy(true);
    try {
      await deleteDoc(doc(db, "matchSheets", deleteTargetId));
      setDeleteTargetId(null);
    } catch (e) {
      console.error("[match-sheets] delete Firestore error", e);
      alert("削除に失敗しました");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <main
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "24px 16px 96px",
        color: "#ffffff",
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>
        スコアシート
      </h1>
      <p
        style={{
          fontSize: 13,
          lineHeight: 1.55,
          color: "rgba(180,170,255,0.85)",
          marginBottom: 16,
        }}
      >
        あなたが保存した対戦シートの一覧です。
      </p>

      <Link
        href="/match-sheet?from=score"
        prefetch={false}
        style={{
          display: "block",
          width: "100%",
          boxSizing: "border-box",
          marginBottom: 20,
          padding: "12px 16px",
          borderRadius: 14,
          border: "1px solid rgba(120,100,255,0.45)",
          background: "linear-gradient(135deg, rgba(139,92,246,0.55), rgba(37,99,235,0.5))",
          color: "#fff",
          fontSize: 15,
          fontWeight: 800,
          textAlign: "center",
          textDecoration: "none",
          boxShadow: "0 0 18px rgba(99,102,241,0.25)",
        }}
      >
        スコアシート入力はこちら🔽
      </Link>

      {!playerId ? (
        <p style={{ fontSize: 14, color: "rgba(180,170,255,0.8)" }}>
          参加登録後に表示されます（この端末の参加者 ID が必要です）。
        </p>
      ) : null}

      {error ? (
        <p style={{ fontSize: 14, color: "#fca5a5", marginBottom: 12 }}>{error}</p>
      ) : null}

      {playerId && !error && rows.length === 0 ? (
        <p style={{ fontSize: 14, color: "rgba(180,170,255,0.75)" }}>
          まだ保存された対戦シートはありません。
        </p>
      ) : null}

      {rows.map((row) => (
        <article
          key={row.id}
          style={{
            marginBottom: 14,
            padding: "14px 16px",
            borderRadius: 14,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(120,100,255,0.28)",
            textAlign: "left",
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.1em",
              color: "rgba(180,170,255,0.75)",
              marginBottom: 6,
            }}
          >
            対戦相手
          </div>
          <div
            style={{
              fontSize: 17,
              fontWeight: 800,
              color: "#f8fafc",
              marginBottom: 10,
            }}
          >
            {row.opponentName || "（未入力）"}
          </div>
          <div style={{ fontSize: 13, color: "rgba(226,232,240,0.9)", lineHeight: 1.55 }}>
            <div>
              <span style={{ color: "rgba(180,170,255,0.85)" }}>サイド状況：</span>
              {row.sideLabel}
            </div>
            <div style={{ marginTop: 6 }}>
              <span style={{ color: "rgba(180,170,255,0.85)" }}>自分のデッキ：</span>
              {row.myDeck || "—"}
            </div>
            <div style={{ marginTop: 4 }}>
              <span style={{ color: "rgba(180,170,255,0.85)" }}>相手のデッキ：</span>
              {row.opponentDeck || "—"}
            </div>
            {row.createdAtMs != null ? (
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "rgba(148,163,184,0.9)",
                }}
              >
                作成：{new Date(row.createdAtMs).toLocaleString("ja-JP")}
              </div>
            ) : null}
          </div>
          {playerId ? (
            <div
              style={{
                marginTop: 12,
                paddingTop: 12,
                borderTop: "1px solid rgba(120,100,255,0.25)",
                display: "flex",
                gap: 10,
                alignItems: "stretch",
              }}
            >
              <Link
                href={`/match-sheet?sheetId=${encodeURIComponent(row.id)}&from=score`}
                prefetch={false}
                style={{
                  flex: 1,
                  boxSizing: "border-box",
                  textAlign: "center",
                  textDecoration: "none",
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(52,211,153,0.45)",
                  background: "linear-gradient(135deg, rgba(16,185,129,0.45), rgba(5,150,105,0.4))",
                  color: "#ecfdf5",
                  fontSize: 14,
                  fontWeight: 800,
                  boxShadow: "0 0 12px rgba(16,185,129,0.2)",
                }}
              >
                ✏️ 編集
              </Link>
              <button
                type="button"
                onClick={() => setDeleteTargetId(row.id)}
                style={{
                  flex: 1,
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid rgba(248,113,113,0.5)",
                  background: "linear-gradient(135deg, rgba(239,68,68,0.35), rgba(185,28,28,0.32))",
                  color: "#fef2f2",
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: "pointer",
                  boxShadow: "0 0 12px rgba(239,68,68,0.18)",
                }}
              >
                🗑️ 削除
              </button>
            </div>
          ) : null}
        </article>
      ))}

      {deleteTargetId ? (
        <div
          className="modal z-[75] flex items-center justify-center bg-black/55 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="match-sheet-delete-title"
        >
          <button
            type="button"
            aria-label="削除確認を閉じる"
            className="absolute inset-0 cursor-default bg-transparent"
            disabled={deleteBusy}
            onClick={() => !deleteBusy && setDeleteTargetId(null)}
          />
          <div
            className="relative z-10 w-full max-w-sm rounded-2xl border border-white/15 bg-slate-900/95 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                fontSize: 40,
                textAlign: "center",
                marginBottom: 8,
                lineHeight: 1,
              }}
              aria-hidden
            >
              ⚠️
            </div>
            <h2
              id="match-sheet-delete-title"
              style={{
                fontSize: 17,
                fontWeight: 800,
                textAlign: "center",
                marginBottom: 10,
                color: "#f8fafc",
              }}
            >
              確認
            </h2>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.55,
                color: "rgba(226,232,240,0.9)",
                textAlign: "center",
                marginBottom: 18,
              }}
            >
              この対戦シートを削除しますか？
            </p>
            <div style={{ display: "flex", gap: 10 }}>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => setDeleteTargetId(null)}
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "1px solid rgba(148,163,184,0.35)",
                  background: "rgba(30,41,59,0.8)",
                  color: "rgba(226,232,240,0.95)",
                  fontSize: 14,
                  fontWeight: 700,
                  cursor: deleteBusy ? "not-allowed" : "pointer",
                  opacity: deleteBusy ? 0.6 : 1,
                }}
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={deleteBusy}
                onClick={() => void handleConfirmDelete()}
                style={{
                  flex: 1,
                  padding: "12px 14px",
                  borderRadius: 12,
                  border: "none",
                  background: "linear-gradient(135deg, #ef4444, #b91c1c)",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 800,
                  cursor: deleteBusy ? "not-allowed" : "pointer",
                  opacity: deleteBusy ? 0.75 : 1,
                }}
              >
                {deleteBusy ? "削除中…" : "OK"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
