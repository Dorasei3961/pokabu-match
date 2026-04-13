"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import type { BadgeId, PlayStyleKey } from "@/lib/playerBadges";
import { BADGE_META, PLAY_STYLE_META } from "@/lib/playerBadges";

export default function JoinPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [rank, setRank] = useState("モンスターボール級");
  const [loading, setLoading] = useState(false);
  const [experience, setExperience] = useState<"none" | "participated" | "winner">("none");
  const [playStyle, setPlayStyle] = useState<PlayStyleKey>("enjoy");
  const [badges, setBadges] = useState<BadgeId[]>([]);

  const toggleBadge = (id: BadgeId) => {
    setBadges((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSubmit = async () => {
    if (!name.trim()) {
      alert("名前を入力してください");
      return;
    }

    setLoading(true);

    try {
      const docRef = await addDoc(collection(db, "players"), {
        name: name.trim(),
        rank,
        wins: 0,
        status: "waiting",
        currentMatchId: null,
        playStyle,
        badges,
        tags: {
          experience,
          playStyle,
        },
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
        background: "#f5f5f7",
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
          <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 4 }}>
            ぽか部交流会
          </div>
          <h1
            style={{
              fontSize: 30,
              fontWeight: 800,
              color: "#1f2937",
              margin: 0,
            }}
          >
            参加登録
          </h1>
        </div>
        <div
          style={{
            background: "#ffffff",
            borderRadius: 24,
            padding: "18px 18px 20px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            border: "1px solid #ececec",
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <div style={labelStyle}>名前</div>
            <input
              type="text"
              placeholder="名前"
              value={name}
              onChange={(e) => setName(e.target.value)}
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
                        border: selected ? "2px solid #2563eb" : "1px solid #d6d6d6",
                        background: selected ? "#1e3a5f" : "#ffffff",
                        color: selected ? "#ffffff" : "#111827",
                        fontSize: 16,
                        fontWeight: 800,
                        textAlign: "left",
                        cursor: "pointer",
                        boxShadow: selected ? "0 6px 16px rgba(37,99,235,0.2)" : "none",
                      }}
                    >
                      {m.emoji} {m.label}
                    </button>
                  );
                }
              )}
            </div>
          </div>

          <div style={{ ...sectionCardStyle, marginBottom: 0 }}>
            <div style={sectionTitleStyle}>プレイヤー属性バッジ（複数可）</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {(
                ["beginner", "new_deck", "advice_ok", "fast_play"] as const satisfies readonly BadgeId[]
              ).map((id) => {
                const m = BADGE_META[id];
                const on = badges.includes(id);
                return (
                  <button
                    key={id}
                    type="button"
                    onClick={() => toggleBadge(id)}
                    style={{
                      width: "100%",
                      padding: "12px 16px",
                      borderRadius: 14,
                      border: on ? "2px solid #059669" : "1px solid #d6d6d6",
                      background: on ? "#ecfdf5" : "#ffffff",
                      color: "#111827",
                      fontSize: 15,
                      fontWeight: 700,
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                  >
                    {on ? "✓ " : ""}
                    {m.emoji} {m.label}
                  </button>
                );
              })}
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
              backgroundColor: loading ? "#f8c56d" : "#f59e0b",
              color: "white",
              cursor: loading ? "default" : "pointer",
              boxShadow: "0 8px 18px rgba(245,158,11,0.28)",
            }}
          >
            {loading ? "登録中..." : "参加する"}
          </button>
        </div>
      </div>
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
   * rowCompact: ポケカ大会歴3ボタン用（スマホ1行・内容幅・nowrap）
   */
  layout?: "default" | "row" | "rowCompact";
}) {
  const isRow = layout === "row" || layout === "rowCompact";
  const rowLayout: React.CSSProperties | undefined = isRow
    ? {
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "auto",
        flex: "0 0 auto",
        flexShrink: 0,
        whiteSpace: "nowrap",
        boxSizing: "border-box",
        ...(layout === "rowCompact"
          ? {
              padding: "9px 10px",
              fontSize: 13,
              borderRadius: 12,
            }
          : {}),
      }
    : undefined;

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "12px 16px",
        borderRadius: 14,
        border: "1px solid #d6d6d6",
        background: selected ? "#2f3b52" : "#ffffff",
        color: selected ? "#ffffff" : "#222222",
        fontSize: 15,
        fontWeight: 700,
        cursor: "pointer",
        boxShadow: selected ? "0 6px 14px rgba(47,59,82,0.18)" : "none",
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
  color: "#1f2937",
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "14px 16px",
  fontSize: 17,
  border: "1px solid #d8d8d8",
  borderRadius: 16,
  outline: "none",
  background: "#fafafa",
  boxSizing: "border-box",
};

const sectionCardStyle: React.CSSProperties = {
  marginTop: 14,
  padding: 14,
  borderRadius: 18,
  background: "#f8fafc",
  border: "1px solid #eceff3",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 800,
  color: "#111827",
  marginBottom: 10,
};

/** ポケカ大会歴の補足（タイトルより小さい） */
const tournamentHistoryHintStyle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 500,
  color: "#6b7280",
  lineHeight: 1.45,
  marginTop: -4,
  marginBottom: 10,
};

/** ポケカ大会歴（未出場 / 出場あり / 入賞あり）3ボタン — スマホ優先で1行 */
const pokemonHistoryRowStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "row",
  flexWrap: "nowrap",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: 6,
  width: "100%",
  minWidth: 0,
  overflowX: "auto",
  WebkitOverflowScrolling: "touch",
};
