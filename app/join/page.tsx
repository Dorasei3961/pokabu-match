"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

export default function JoinPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [deck, setDeck] = useState("");
  const [rank, setRank] = useState("モンスターボール級");
  const [loading, setLoading] = useState(false);
  const [experience, setExperience] = useState<"none" | "participated" | "winner">("none");
  const [playStyle, setPlayStyle] = useState<"enjoy" | "serious">("enjoy");

  const handleSubmit = async () => {
    if (!name.trim()) {
      alert("名前を入力してください");
      return;
    }

    setLoading(true);

    try {
      const docRef = await addDoc(collection(db, "players"), {
        name: name.trim(),
        deck: deck.trim(),
        rank,
        wins: 0,
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
        padding: "24px 16px 40px",
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
            marginBottom: 20,
          }}
        >
          <div
            style={{
              fontSize: 14,
              color: "#7a7a7a",
              marginBottom: 8,
            }}
          ></div>
          ぽか部交流会
          </div>
          <h1
            style={{
              fontSize: 34,
              fontWeight: 800,
              color: "#1f2937",
              margin: 0,
            }}
          >
            参加登録
          </h1>
          <div
            style={{
              marginTop: 10,
              fontSize: 15,
              color: "#6b7280",
            }}
          >
            大会参加前の登録をお願いします
          </div>
        </div>
        <div
          style={{
            background: "#ffffff",
            borderRadius: 24,
            padding: 20,
            boxShadow: "0 10px 30px rgba(0,0,0,0.08)",
            border: "1px solid #ececec",
          }}
        >
          <div style={{ display: "grid", gap: 14 }}>
            <div>
              <div style={labelStyle}>名前</div>
              <input
                type="text"
                placeholder="名前"
                value={name}
                onChange={(e) => setName(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div>
              <div style={labelStyle}>使用デッキ</div>
              <input
                type="text"
                placeholder="使用デッキ（例：リザードン）"
                value={deck}
                onChange={(e) => setDeck(e.target.value)}
                style={inputStyle}
              />
            </div>
          </div>

          <div style={sectionCardStyle}>
            <div style={sectionTitleStyle}>公式大会</div>
            <div style={buttonRowStyle}>
              <SelectButton
                label="出場なし"
                selected={experience === "none"}
                onClick={() => {
                  setExperience("none");
                  setRank("モンスターボール級");
                }}
              />
              <SelectButton
                label="出場あり"
                selected={experience === "participated"}
                onClick={() => {
                  setExperience("participated");
                  setRank("スーパーボール級");
                }}
              />
              <SelectButton
                label="入賞・優勝あり"
                selected={experience === "winner"}
                onClick={() => {
                  setExperience("winner");
                  setRank("ハイパーボール級");
                }}
              />
            </div>
          </div>
          <div style={sectionCardStyle}>
            <div style={sectionTitleStyle}>プレイスタイル</div>
            <div style={buttonRowStyle}>
              <SelectButton
                label="エンジョイ"
                selected={playStyle === "enjoy"}
                onClick={() => setPlayStyle("enjoy")}
              />
              <SelectButton
                label="真剣勝負"
                selected={playStyle === "serious"}
                onClick={() => setPlayStyle("serious")}
              />
            </div>
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              width: "100%",
              marginTop: 24,
              padding: "16px 20px",
              fontSize: 18,
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
    
  );
}
function SelectButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        padding: "14px 18px",
        borderRadius: 14,
        border: "1px solid #d6d6d6",
        background: selected ? "#2f3b52" : "#ffffff",
        color: selected ? "#ffffff" : "#222222",
        fontSize: 16,
        fontWeight: 700,
        cursor: "pointer",
        boxShadow: selected ? "0 6px 14px rgba(47,59,82,0.18)" : "none",
      }}
    >
      {label}
    </button>
  );
}

const labelStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  color: "#1f2937",
  marginBottom: 8,
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "16px 18px",
  fontSize: 18,
  border: "1px solid #d8d8d8",
  borderRadius: 16,
  outline: "none",
  background: "#fafafa",
  boxSizing: "border-box",
};

const sectionCardStyle: React.CSSProperties = {
  marginTop: 20,
  padding: 16,
  borderRadius: 18,
  background: "#f8fafc",
  border: "1px solid #eceff3",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
  color: "#111827",
  marginBottom: 14,
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 12,
  flexWrap: "wrap",
};