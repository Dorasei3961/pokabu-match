"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import type { BadgeId, PlayStyleKey } from "@/lib/playerBadges";
import {
  BADGE_META,
  CASUAL_IDENTITY_BADGE_IDS,
  PLAY_STYLE_META,
  badgeIdToFirestore,
} from "@/lib/playerBadges";

/** 参加登録で特別属性 UI を出す。false のときは `display:none` のみ（マークアップ・state・保存処理は維持） */
const JOIN_PAGE_SHOW_SPECIAL_BADGE_SECTION = false;

export default function JoinPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [favoritePokemon, setFavoritePokemon] = useState("");
  const [rank, setRank] = useState("モンスターボール級");
  const [loading, setLoading] = useState(false);
  const [experience, setExperience] = useState<"none" | "participated" | "winner">("none");
  const [playStyle, setPlayStyle] = useState<PlayStyleKey>("enjoy");
  /** 🔰初心者を playerAttributes に含める（特別属性とは別） */
  const [includeBeginner, setIncludeBeginner] = useState(false);
  /** 🆕新デッキ調整（new_deck）を playerAttributes に含める */
  const [includeNewDeck, setIncludeNewDeck] = useState(false);
  /** 😆エンジョイデッキ（enjoy）を playerAttributes に含める（playStyle の enjoy とは別） */
  const [includeEnjoyDeck, setIncludeEnjoyDeck] = useState(false);
  /** ⚔️環境デッキ（meta）を playerAttributes に含める */
  const [includeMetaDeck, setIncludeMetaDeck] = useState(false);
  /** 📱SNS(X)交換🆗（sns_ok）を playerAttributes に含める */
  const [includeSnsOk, setIncludeSnsOk] = useState(false);
  /** null = 特別属性なし（1つだけ選べる） */
  const [badge, setBadge] = useState<BadgeId | null>(null);

  useEffect(() => {
    document.body.classList.add("join-sunset-page");
    return () => {
      document.body.classList.remove("join-sunset-page");
    };
  }, []);

  const handleSubmit = async () => {
    if (!name.trim()) {
      alert("名前を入力してください");
      return;
    }

    setLoading(true);

    try {
      const docRef = await addDoc(collection(db, "players"), {
        name: name.trim(),
        favoritePokemon: favoritePokemon.trim(),
        rank,
        wins: 0,
        status: "waiting",
        currentMatchId: null,
        playStyle,
        /** 特別属性（主催・運営・初参加・常連）— 表示専用。`playerAttributes` とは別フィールド */
        badge: badgeIdToFirestore(badge),
        /** 主に表示用（beginner / new_deck / …）。マッチ条件は既存の matches 仕様のみ。特別属性 badge とは別 */
        playerAttributes: (() => {
          const attrs: string[] = [];
          if (includeBeginner) attrs.push("beginner");
          if (includeNewDeck) attrs.push("new_deck");
          if (includeEnjoyDeck) attrs.push("enjoy");
          if (includeMetaDeck) attrs.push("meta");
          if (includeSnsOk) attrs.push("sns_ok");
          return attrs;
        })(),
        tags: {
          experience,
          playStyle,
        },
        waitingSince: serverTimestamp(),
        createdAt: serverTimestamp(),
      });

      router.push(`/player/${docRef.id}`);
    } catch (error) {
      console.error(error);
      alert("登録に失敗しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        padding: "20px 16px 32px",
      }}
    >
      <div
        style={{
          maxWidth: 520,
          margin: "0 auto",
        }}
      >
        <div
          style={{
            textAlign: "center",
            marginBottom: 14,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: 700, color: "#a78bfa", marginBottom: 8 }}>
            ぽか部交流会
          </div>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 800,
              color: "#ffffff",
              margin: 0,
              textShadow: "0 0 16px rgba(167,139,250,0.3)",
            }}
          >
            参加登録
          </h1>
        </div>
        <div
          style={{
            background: "rgba(255,255,255,0.08)",
            borderRadius: 24,
            padding: "18px 18px 20px",
            boxShadow: "0 10px 30px rgba(15,23,42,0.35)",
            border: "1px solid rgba(120,100,255,0.3)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>名前</div>
            <input
              className="join-input"
              type="text"
              placeholder="名前"
              value={name}
              onChange={(e) => setName(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>好きなポケモン（任意）</div>
            <div style={{ fontSize: 12, color: "rgba(180,170,255,0.72)", marginBottom: 6 }}>
              再入場時の検索に使います（未入力でも登録できます）
            </div>
            <input
              className="join-input"
              type="text"
              placeholder="例）ピカチュウ、リザードン など"
              value={favoritePokemon}
              onChange={(e) => setFavoritePokemon(e.target.value)}
              style={inputStyle}
            />
          </div>

          <div style={sectionCardStyle}>
            <div style={sectionTitleStyle}>ポケカ大会歴</div>
            <div style={tournamentHistoryHintStyle}>(ジムバ、シティ etc...)</div>
            <div style={pokemonHistoryRowStyle}>
              <SelectButton
                layout="rowCompact"
                label="未出場"
                selected={experience === "none"}
                onClick={() => {
                  setExperience("none");
                  setRank("モンスターボール級");
                }}
              />
              <SelectButton
                layout="rowCompact"
                label="出場あり"
                selected={experience === "participated"}
                onClick={() => {
                  setExperience("participated");
                  setRank("スーパーボール級");
                }}
              />
              <SelectButton
                layout="rowCompact"
                label="入賞あり"
                selected={experience === "winner"}
                onClick={() => {
                  setExperience("winner");
                  setRank("ハイパーボール級");
                }}
              />
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={sectionTitleStyle}>プレイスタイル（1つ）</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(["serious", "enjoy", "both"] as const satisfies readonly PlayStyleKey[]).map(
                (key) => {
                  const m = PLAY_STYLE_META[key];
                  const selected = playStyle === key;
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPlayStyle(key)}
                      style={{
                        width: "100%",
                        padding: "14px 16px",
                        borderRadius: 16,
                        border: "1px solid rgba(120,100,255,0.3)",
                        background: selected
                          ? "linear-gradient(135deg, #8b5cf6, #3b82f6)"
                          : "rgba(255,255,255,0.06)",
                        color: selected ? "#FFFFFF" : "rgba(255,255,255,0.85)",
                        fontSize: 16,
                        fontWeight: 800,
                        textAlign: "left",
                        cursor: "pointer",
                        boxShadow: selected
                          ? "0 0 20px rgba(167,139,250,0.4)"
                          : "none",
                      }}
                    >
                      {m.emoji} {m.label}
                    </button>
                  );
                }
              )}
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={sectionTitleStyle}>プレイヤー情報（複数選択OK）</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button
                type="button"
                onClick={() => setIncludeBeginner((v) => !v)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 14,
                  border: "1px solid rgba(120,100,255,0.3)",
                  background: includeBeginner
                    ? "linear-gradient(135deg, #8b5cf6, #3b82f6)"
                    : "rgba(255,255,255,0.06)",
                  color: includeBeginner ? "#FFFFFF" : "rgba(255,255,255,0.85)",
                  fontSize: 15,
                  fontWeight: 700,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {includeBeginner ? "✓ " : ""}
                {BADGE_META.beginner.emoji} {BADGE_META.beginner.label}
              </button>
              <button
                type="button"
                onClick={() => setIncludeNewDeck((v) => !v)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 14,
                  border: "1px solid rgba(120,100,255,0.3)",
                  background: includeNewDeck
                    ? "linear-gradient(135deg, #8b5cf6, #3b82f6)"
                    : "rgba(255,255,255,0.06)",
                  color: includeNewDeck ? "#FFFFFF" : "rgba(255,255,255,0.85)",
                  fontSize: 15,
                  fontWeight: 700,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {includeNewDeck ? "✓ " : ""}
                {BADGE_META.new_deck.emoji} {BADGE_META.new_deck.label}
              </button>
              <button
                type="button"
                onClick={() => setIncludeEnjoyDeck((v) => !v)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 14,
                  border: "1px solid rgba(120,100,255,0.3)",
                  background: includeEnjoyDeck
                    ? "linear-gradient(135deg, #8b5cf6, #3b82f6)"
                    : "rgba(255,255,255,0.06)",
                  color: includeEnjoyDeck ? "#FFFFFF" : "rgba(255,255,255,0.85)",
                  fontSize: 15,
                  fontWeight: 700,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {includeEnjoyDeck ? "✓ " : ""}
                {BADGE_META.enjoy.emoji} {BADGE_META.enjoy.label}
              </button>
              <button
                type="button"
                onClick={() => setIncludeMetaDeck((v) => !v)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 14,
                  border: "1px solid rgba(120,100,255,0.3)",
                  background: includeMetaDeck
                    ? "linear-gradient(135deg, #8b5cf6, #3b82f6)"
                    : "rgba(255,255,255,0.06)",
                  color: includeMetaDeck ? "#FFFFFF" : "rgba(255,255,255,0.85)",
                  fontSize: 15,
                  fontWeight: 700,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {includeMetaDeck ? "✓ " : ""}
                {BADGE_META.meta.emoji} {BADGE_META.meta.label}
              </button>
              <button
                type="button"
                onClick={() => setIncludeSnsOk((v) => !v)}
                style={{
                  width: "100%",
                  padding: "12px 16px",
                  borderRadius: 14,
                  border: "1px solid rgba(120,100,255,0.3)",
                  background: includeSnsOk
                    ? "linear-gradient(135deg, #8b5cf6, #3b82f6)"
                    : "rgba(255,255,255,0.06)",
                  color: includeSnsOk ? "#FFFFFF" : "rgba(255,255,255,0.85)",
                  fontSize: 15,
                  fontWeight: 700,
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {includeSnsOk ? "✓ " : ""}
                {`${BADGE_META.sns_ok.emoji}${BADGE_META.sns_ok.label}`}
              </button>
            </div>
          </div>

          <div
            style={{
              display: JOIN_PAGE_SHOW_SPECIAL_BADGE_SECTION ? undefined : "none",
            }}
            aria-hidden={!JOIN_PAGE_SHOW_SPECIAL_BADGE_SECTION}
          >
            <div style={{ ...sectionCardStyle, marginBottom: 0 }}>
              <div style={sectionTitleStyle}>特別属性（1つ）</div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(180,170,255,0.7)",
                  lineHeight: 1.45,
                  marginBottom: 8,
                }}
              >
                主催・運営・初参加・常連・おにぎりは **完全に表示・識別専用** です。マッチング・抽選・優先度の計算には一切使いません。
                Firestore ではプレイヤー属性（初心者・新デッキ・環境デッキ等）は playerAttributes に、特別属性は
                badge に保存されます（別フィールド）。
                登録完了後、本人が変える画面はありません（変更は運営が行います）。
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setBadge(null)}
                  style={{
                    width: "100%",
                    padding: "12px 16px",
                    borderRadius: 14,
                    border: "1px solid rgba(120,100,255,0.3)",
                    background:
                      badge === null
                        ? "linear-gradient(135deg, #8b5cf6, #3b82f6)"
                        : "rgba(255,255,255,0.06)",
                    color: badge === null ? "#FFFFFF" : "rgba(255,255,255,0.85)",
                    fontSize: 15,
                    fontWeight: 700,
                    textAlign: "left",
                    cursor: "pointer",
                  }}
                >
                  {badge === null ? "✓ " : ""}なし
                </button>
                {CASUAL_IDENTITY_BADGE_IDS.map((id) => {
                  const m = BADGE_META[id];
                  const on = badge === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setBadge(id)}
                      style={{
                        width: "100%",
                        padding: "12px 16px",
                        borderRadius: 14,
                        border: "1px solid rgba(120,100,255,0.3)",
                        background: on
                          ? "linear-gradient(135deg, #8b5cf6, #3b82f6)"
                          : "rgba(255,255,255,0.06)",
                        color: on ? "#FFFFFF" : "rgba(255,255,255,0.85)",
                        fontSize: 15,
                        fontWeight: 700,
                        textAlign: "left",
                        cursor: "pointer",
                      }}
                    >
                      {on ? "✓ " : ""}
                      {m.emoji}
                      {m.label ? ` ${m.label}` : ""}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: "100%",
              marginTop: 18,
              padding: "15px 18px",
              fontSize: 17,
              fontWeight: 700,
              border: "none",
              borderRadius: 16,
              background:
                "linear-gradient(135deg, #8b5cf6, #3b82f6)",
              color: "#FFFFFF",
              cursor: loading ? "default" : "pointer",
              boxShadow: "0 0 20px rgba(167,139,250,0.4)",
            }}
          >
            {loading ? "登録中..." : "参加する"}
          </button>
        </div>
      </div>
      <style jsx>{`
        .join-input::placeholder {
          color: rgba(180, 170, 255, 0.5);
        }
      `}</style>
    </div>
  );
}

function SelectButton({
  label,
  selected,
  onClick,
  layout = "default",
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  /**
   * rowCompact: ポケカ大会歴3ボタン用（1行・均等幅・nowrap）
   */
  layout?: "default" | "row" | "rowCompact";
}) {
  const isRow = layout === "row" || layout === "rowCompact";
  const rowLayout: React.CSSProperties | undefined = isRow
    ? layout === "rowCompact"
      ? {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          minWidth: 0,
          boxSizing: "border-box",
          padding: "9px 8px",
          fontSize: 13,
          borderRadius: 12,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }
      : {
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          width: "auto",
          flex: "0 0 auto",
          flexShrink: 0,
          whiteSpace: "nowrap",
          boxSizing: "border-box",
        }
    : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "12px 16px",
        borderRadius: 14,
        border: "1px solid rgba(120,100,255,0.3)",
        background: selected
          ? "linear-gradient(135deg, #8b5cf6, #3b82f6)"
          : "rgba(255,255,255,0.06)",
        color: selected ? "#FFFFFF" : "rgba(255,255,255,0.85)",
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
        boxShadow: selected ? "0 0 20px rgba(167,139,250,0.4)" : "none",
        ...rowLayout,
      }}
    >
      {label}
    </button>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: "#ffffff",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  fontSize: 17,
  color: "#ffffff",
  border: "1px solid rgba(120,100,255,0.3)",
  borderRadius: 16,
  outline: "none",
  background: "rgba(255,255,255,0.06)",
  boxSizing: "border-box",
};

const sectionCardStyle: React.CSSProperties = {
  marginTop: 14,
  padding: 14,
  borderRadius: 18,
  background: "rgba(255,255,255,0.08)",
  border: "1px solid rgba(120,100,255,0.3)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: "#ffffff",
  marginBottom: 10,
};

/** ポケカ大会歴の補足（タイトルより小さい） */
const tournamentHistoryHintStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "rgba(180,170,255,0.7)",
  lineHeight: 1.45,
  marginTop: -4,
  marginBottom: 10,
};

/** ポケカ大会歴（未出場 / 出場あり / 入賞あり）3ボタン — 均等幅1行 */
const pokemonHistoryRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
  gap: 8,
  width: "100%",
  minWidth: 0,
  alignItems: "stretch",
  boxSizing: "border-box",
};
