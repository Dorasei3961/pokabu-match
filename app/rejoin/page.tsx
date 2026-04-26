"use client";

import { useEffect, useState } from "react";
import type { CSSProperties } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { collection, getDocs, Timestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  normalizePlayStyle,
  playStyleLine,
  participantSummaryLineFromDoc,
} from "@/lib/playerBadges";

type RejoinHit = {
  id: string;
  name: string;
  rank: string;
  playStyleLine: string;
  participantSummary: string;
  favoritePokemonLine: string;
  createdAtLabel: string;
  avatarEmoji: string;
};

function formatMaybeTimestamp(v: unknown): string {
  if (v instanceof Timestamp) {
    try {
      return v.toDate().toLocaleString("ja-JP", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  }
  return "";
}

/** 検索対象：仕様の「好きなポケモン」＋未設定時は使用デッキ名でもヒット（既存データ向け） */
function pokemonSearchHaystack(data: Record<string, unknown>): string {
  const fav =
    typeof data.favoritePokemon === "string" ? data.favoritePokemon : "";
  const deck = typeof data.deck === "string" ? data.deck : "";
  return `${fav} ${deck}`.trim();
}

/** カード表示用（好きなポケモン優先、なければデッキ） */
function displayFavoriteLine(data: Record<string, unknown>): string {
  const fav =
    typeof data.favoritePokemon === "string" ? data.favoritePokemon.trim() : "";
  if (fav) return fav;
  const deck = typeof data.deck === "string" ? data.deck.trim() : "";
  if (deck) return `${deck}（使用デッキ）`;
  return "―";
}

function textIncludes(hay: string, needle: string): boolean {
  const n = needle.trim();
  if (!n) return true;
  const lowerHay = hay.toLowerCase();
  const lowerNeedle = n.toLowerCase();
  return lowerHay.includes(lowerNeedle) || hay.includes(n);
}

function avatarEmojiForId(id: string): string {
  const emojis = ["⚡", "🔥", "💧", "🌿", "❄️", "🥊", "🎴", "⭐"];
  let sum = 0;
  for (let i = 0; i < id.length; i++) sum += id.charCodeAt(i);
  return emojis[sum % emojis.length] ?? "🎴";
}

const shell: CSSProperties = {
  minHeight: "100vh",
  boxSizing: "border-box",
  padding: "20px 16px 40px",
  maxWidth: 520,
  margin: "0 auto",
  color: "#f8fafc",
};

const glassCard: CSSProperties = {
  background: "rgba(255,255,255,0.08)",
  borderRadius: 24,
  padding: "18px 18px 20px",
  boxShadow: "0 10px 30px rgba(15,23,42,0.35)",
  border: "1px solid rgba(120,100,255,0.3)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};

const labelStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 700,
  color: "rgba(226,232,240,0.95)",
  marginBottom: 6,
};

const inputStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: "12px 14px",
  borderRadius: 14,
  border: "1px solid rgba(120,100,255,0.35)",
  background: "rgba(15,23,42,0.45)",
  color: "#f8fafc",
  fontSize: 16,
  outline: "none",
};

const EMPTY_MSG =
  "該当する参加者がみつかりませんでした。入力内容を確認して、もう一度検索してください。";

export default function RejoinPage() {
  const router = useRouter();
  const [nameInput, setNameInput] = useState("");
  const [pokemonInput, setPokemonInput] = useState("");
  const [searching, setSearching] = useState(false);
  const [hits, setHits] = useState<RejoinHit[] | null>(null);
  const [searchedOnce, setSearchedOnce] = useState(false);

  useEffect(() => {
    document.body.classList.add("join-sunset-page");
    return () => {
      document.body.classList.remove("join-sunset-page");
    };
  }, []);

  const handleSearch = async () => {
    const nameQ = nameInput.trim();
    const pokeQ = pokemonInput.trim();
    if (!nameQ) {
      alert("名前を入力してください");
      return;
    }

    setSearching(true);
    setSearchedOnce(true);
    try {
      const snap = await getDocs(collection(db, "players"));
      const next: RejoinHit[] = [];
      for (const docSnap of snap.docs) {
        const data = docSnap.data();
        const rec = data as Record<string, unknown>;
        const pname = typeof data.name === "string" ? data.name : "";
        if (!textIncludes(pname, nameQ)) continue;
        if (!textIncludes(pokemonSearchHaystack(rec), pokeQ)) continue;

        const playStyle = normalizePlayStyle(data);
        next.push({
          id: docSnap.id,
          name: pname.trim() || "（無名）",
          rank: typeof data.rank === "string" && data.rank.trim() ? data.rank : "―",
          playStyleLine: playStyleLine(playStyle),
          participantSummary: participantSummaryLineFromDoc(playStyle, rec),
          favoritePokemonLine: displayFavoriteLine(rec),
          createdAtLabel:
            formatMaybeTimestamp(data.createdAt) ||
            formatMaybeTimestamp(data.waitingSince) ||
            "―",
          avatarEmoji: avatarEmojiForId(docSnap.id),
        });
      }
      setHits(next);
    } catch (e) {
      console.error(e);
      alert("検索に失敗しました。通信状況を確認して再度お試しください。");
      setHits(null);
    } finally {
      setSearching(false);
    }
  };

  const handleRestore = (row: RejoinHit) => {
    if (typeof window !== "undefined") {
      window.localStorage.setItem("playerId", row.id);
      window.localStorage.setItem("playerName", row.name);
    }
    router.push(`/player/${row.id}`);
  };

  return (
    <div style={shell}>
      <div style={{ marginBottom: 14 }}>
        <button
          type="button"
          onClick={() => router.push("/")}
          style={{
            border: "none",
            background: "transparent",
            color: "rgba(191,219,254,0.95)",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
            padding: "4px 0",
            marginBottom: 10,
          }}
        >
          ← 戻る
        </button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 40, lineHeight: 1, marginBottom: 8 }} aria-hidden>
            🔁
          </div>
          <h1
            style={{
              fontSize: 24,
              fontWeight: 800,
              color: "#fff",
              margin: 0,
              textShadow: "0 0 16px rgba(167,139,250,0.35)",
            }}
          >
            参加者として再入場
          </h1>
          <p
            style={{
              margin: "12px 0 0",
              fontSize: 14,
              lineHeight: 1.6,
              color: "rgba(226,232,240,0.88)",
            }}
          >
            登録した名前を入力して、参加者情報を検索してください。
          </p>
        </div>
      </div>

      <div style={glassCard}>
        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>名前を入力</div>
          <input
            className="join-input"
            type="text"
            placeholder="例）サトシ"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            style={inputStyle}
            autoComplete="name"
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={labelStyle}>好きなポケモン（任意）</div>
          <div
            style={{
              fontSize: 11,
              color: "rgba(148,163,184,0.95)",
              marginBottom: 6,
            }}
          >
            ひらがな・カタカナ・漢字・英語OK（未入力なら名前のみで検索）
          </div>
          <input
            className="join-input"
            type="text"
            placeholder="例）ピカチュウ"
            value={pokemonInput}
            onChange={(e) => setPokemonInput(e.target.value)}
            style={inputStyle}
            autoComplete="off"
          />
        </div>
        <button
          type="button"
          disabled={searching}
          onClick={() => void handleSearch()}
          style={{
            width: "100%",
            padding: "14px 16px",
            borderRadius: 16,
            border: "none",
            fontWeight: 800,
            fontSize: 16,
            color: "#fff",
            cursor: searching ? "wait" : "pointer",
            opacity: searching ? 0.85 : 1,
            background: "linear-gradient(135deg, #7c3aed, #4f46e5)",
            boxShadow: "0 8px 24px rgba(79,70,229,0.35)",
          }}
        >
          {searching ? "検索中…" : "🔍 検索する"}
        </button>
      </div>

      {searchedOnce && hits !== null && (
        <div style={{ marginTop: 22 }}>
          <div
            style={{
              fontSize: 15,
              fontWeight: 800,
              marginBottom: 12,
              color: "rgba(191,219,254,0.98)",
            }}
          >
            検索結果
          </div>
          {hits.length === 0 ? (
            <p
              style={{
                margin: 0,
                fontSize: 14,
                lineHeight: 1.65,
                color: "rgba(226,232,240,0.9)",
              }}
            >
              {EMPTY_MSG}
            </p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              {hits.map((row) => (
                <div
                  key={row.id}
                  style={{
                    ...glassCard,
                    padding: "16px 16px 14px",
                  }}
                >
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <div
                      style={{
                        width: 52,
                        height: 52,
                        borderRadius: 16,
                        background: "rgba(99,102,241,0.35)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 28,
                        flexShrink: 0,
                      }}
                      aria-hidden
                    >
                      {row.avatarEmoji}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 17,
                          fontWeight: 800,
                          color: "#fff",
                          wordBreak: "break-word",
                        }}
                      >
                        {row.name}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "rgba(148,163,184,0.95)",
                          marginTop: 4,
                        }}
                      >
                        登録：{row.createdAtLabel}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "rgba(196,181,253,0.95)",
                          marginTop: 8,
                          fontWeight: 700,
                        }}
                      >
                        {row.rank}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "rgba(226,232,240,0.9)",
                          marginTop: 4,
                        }}
                      >
                        {row.playStyleLine}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "rgba(226,232,240,0.82)",
                          marginTop: 4,
                          lineHeight: 1.45,
                          wordBreak: "break-word",
                        }}
                      >
                        {row.participantSummary}
                      </div>
                      <div
                        style={{
                          fontSize: 13,
                          color: "rgba(253,224,71,0.92)",
                          marginTop: 8,
                          fontWeight: 600,
                        }}
                      >
                        好きなポケモン：{row.favoritePokemonLine}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRestore(row)}
                    style={{
                      width: "100%",
                      marginTop: 14,
                      padding: "12px 14px",
                      borderRadius: 14,
                      border: "none",
                      fontWeight: 800,
                      fontSize: 14,
                      color: "#fff",
                      cursor: "pointer",
                      background: "linear-gradient(135deg, #8b5cf6, #6366f1)",
                    }}
                  >
                    この参加者で復帰する ›
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div
        style={{
          marginTop: 24,
          padding: "14px 16px",
          borderRadius: 16,
          background: "rgba(15,23,42,0.5)",
          border: "1px solid rgba(148,163,184,0.22)",
        }}
      >
        <div
          style={{
            fontSize: 13,
            fontWeight: 800,
            color: "rgba(191,219,254,0.95)",
            marginBottom: 8,
          }}
        >
          うまく見つからない場合
        </div>
        <ul
          style={{
            margin: 0,
            paddingLeft: 18,
            fontSize: 12,
            lineHeight: 1.65,
            color: "rgba(226,232,240,0.85)",
          }}
        >
          <li>名前・ポケモン名の表記（ひらがな／カタカナなど）を変えて試してください。</li>
          <li>
            登録時に「好きなポケモン」を保存していない場合、参加者ページで入力した使用デッキ名でも検索にヒットすることがあります。
          </li>
          <li>
            まだ参加登録していない場合は{" "}
            <Link href="/join" style={{ color: "#93c5fd", fontWeight: 700 }}>
              参加する
            </Link>
            からお進みください。
          </li>
        </ul>
      </div>
    </div>
  );
}
