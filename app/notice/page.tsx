"use client";

import { useEffect, useState, type CSSProperties } from "react";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  limit,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  ANNOUNCEMENTS_COLLECTION,
  type AnnouncementType,
} from "@/lib/announcements";
import { markAnnouncementReadsUpToNow } from "@/lib/announcementReads";

type AnnouncementRow = {
  id: string;
  title: string;
  message: string;
  type: AnnouncementType;
  createdAtMs: number | null;
};

function normalizeType(raw: unknown): AnnouncementType {
  if (raw === "important" || raw === "info") return raw;
  return "normal";
}

function cardStyle(type: AnnouncementType): CSSProperties {
  const base: CSSProperties = {
    borderRadius: 14,
    padding: "14px 16px",
    marginBottom: 12,
    textAlign: "left",
    border: "1px solid rgba(148,163,184,0.22)",
  };
  if (type === "important") {
    return {
      ...base,
      background:
        "linear-gradient(135deg, rgba(127,29,29,0.55) 0%, rgba(185,28,28,0.45) 100%)",
      border: "1px solid rgba(252,165,165,0.45)",
      boxShadow: "0 0 24px rgba(248,113,113,0.25)",
    };
  }
  if (type === "info") {
    return {
      ...base,
      background:
        "linear-gradient(135deg, rgba(30,58,138,0.5) 0%, rgba(21,94,117,0.42) 100%)",
      border: "1px solid rgba(125,211,252,0.35)",
      boxShadow: "0 0 18px rgba(56,189,248,0.2)",
    };
  }
  return {
    ...base,
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(120,100,255,0.28)",
  };
}

function typeLabel(type: AnnouncementType): string {
  if (type === "important") return "重要";
  if (type === "info") return "案内";
  return "通常";
}

export default function NoticePage() {
  const [items, setItems] = useState<AnnouncementRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** お知らせタブ閲覧時：参加者 ID があれば既読位置を更新（フッターの NEW を消す） */
  useEffect(() => {
    if (typeof window === "undefined") return;
    const id = window.localStorage.getItem("playerId");
    if (!id) return;
    void markAnnouncementReadsUpToNow(id).catch((err) => {
      console.error(err);
    });
  }, []);

  useEffect(() => {
    const q = query(
      collection(db, ANNOUNCEMENTS_COLLECTION),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLoadError(null);
        const rows: AnnouncementRow[] = snap.docs.map((d) => {
          const data = d.data();
          const created = data.createdAt as { toMillis?: () => number } | undefined;
          return {
            id: d.id,
            title: String(data.title ?? ""),
            message: String(data.message ?? ""),
            type: normalizeType(data.type),
            createdAtMs:
              typeof created?.toMillis === "function" ? created.toMillis() : null,
          };
        });
        setItems(rows);
      },
      (err) => {
        console.error(err);
        setLoadError("お知らせの取得に失敗しました");
        setItems([]);
      }
    );
    return () => unsub();
  }, []);

  return (
    <main
      style={{
        maxWidth: 560,
        margin: "0 auto",
        padding: "24px 16px 96px",
        color: "#ffffff",
      }}
    >
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>お知らせ</h1>
      <p
        style={{
          fontSize: 13,
          lineHeight: 1.55,
          color: "rgba(180,170,255,0.85)",
          marginBottom: 18,
        }}
      >
        運営からのお知らせです。新しい順に表示されます。
      </p>

      {loadError ? (
        <p style={{ fontSize: 14, color: "#fca5a5", marginBottom: 12 }}>{loadError}</p>
      ) : null}

      {items.length === 0 && !loadError ? (
        <p style={{ fontSize: 14, color: "rgba(180,170,255,0.75)" }}>
          まだお知らせはありません。
        </p>
      ) : null}

      {items.map((row) => (
        <article key={row.id} style={cardStyle(row.type)}>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              alignItems: "center",
              gap: 8,
              marginBottom: 8,
            }}
          >
            <span
              style={{
                fontSize: 10,
                fontWeight: 800,
                letterSpacing: "0.12em",
                color:
                  row.type === "important"
                    ? "rgba(254,226,226,0.95)"
                    : row.type === "info"
                      ? "rgba(224,242,254,0.9)"
                      : "rgba(200,190,255,0.85)",
              }}
            >
              {typeLabel(row.type)}
            </span>
            {row.createdAtMs != null ? (
              <time
                dateTime={new Date(row.createdAtMs).toISOString()}
                style={{
                  fontSize: 11,
                  color: "rgba(226,232,240,0.55)",
                  marginLeft: "auto",
                }}
              >
                {new Date(row.createdAtMs).toLocaleString("ja-JP")}
              </time>
            ) : null}
          </div>
          <h2
            style={{
              fontSize: 17,
              fontWeight: 800,
              margin: "0 0 8px",
              lineHeight: 1.35,
              color: "#f8fafc",
            }}
          >
            {row.title}
          </h2>
          <p
            style={{
              fontSize: 14,
              lineHeight: 1.65,
              margin: 0,
              whiteSpace: "pre-wrap",
              color: "rgba(241,245,249,0.92)",
            }}
          >
            {row.message}
          </p>
        </article>
      ))}
    </main>
  );
}
