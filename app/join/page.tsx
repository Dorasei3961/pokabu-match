"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { db } from "../../lib/firebase";
import { addDoc, collection, serverTimestamp } from "firebase/firestore";

export default function JoinPage() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [history, setHistory] = useState("");
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
        history: history.trim(),
        deck: deck.trim(),
        rank,
        wins: 0,
      
        // 👇ここ追加
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
    <div style={{ padding: 20, maxWidth: 500, margin: "0 auto" }}>
      <h1>参加登録</h1>

      <div style={{ display: "grid", gap: 12, marginTop: 20 }}>
        <input
          type="text"
          placeholder="名前"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            padding: 12,
            fontSize: 16,
            border: "1px solid #ccc",
            borderRadius: 8,
          }}
        />

        <input
          type="text"
          placeholder="プレイ歴（例：1年未満 / 1年以上2年未満 / 2年以上）"
          value={history}
          onChange={(e) => setHistory(e.target.value)}
          style={{
            padding: 12,
            fontSize: 16,
            border: "1px solid #ccc",
            borderRadius: 8,
          }}
        />

        <input
          type="text"
          placeholder="使用デッキ（例：リザードン）"
          value={deck}
          onChange={(e) => setDeck(e.target.value)}
          style={{
            padding: 12,
            fontSize: 16,
            border: "1px solid #ccc",
            borderRadius: 8,
          }}
        />
        <div style={{ marginTop: 20 }}>
  <h3>公式大会</h3>

  <div style={{ display: "flex", gap: 10 }}>
  <button
    type="button"
    onClick={() => {
      setExperience("none");
      setRank("モンスターボール級");
    }}
    style={{
      padding: "10px 14px",
      borderRadius: 8,
      border: "1px solid #ccc",
      background: experience === "none" ? "#333" : "#fff",
      color: experience === "none" ? "#fff" : "#000",
    }}
  >
    出場なし
  </button>

  <button
    type="button"
    onClick={() => {
      setExperience("participated");
      setRank("スーパーボール級");
    }}
    style={{
      padding: "10px 14px",
      borderRadius: 8,
      border: "1px solid #ccc",
      background: experience === "participated" ? "#333" : "#fff",
      color: experience === "participated" ? "#fff" : "#000",
    }}
  >
    出場あり
  </button>

  <button
    type="button"
    onClick={() => {
      setExperience("winner");
      setRank("ハイパーボール級");
    }}
    style={{
      padding: "10px 14px",
      borderRadius: 8,
      border: "1px solid #ccc",
      background: experience === "winner" ? "#333" : "#fff",
      color: experience === "winner" ? "#fff" : "#000",
    }}
  >
    入賞・優勝あり
  </button>
</div>
 
</div>

<div style={{ marginTop: 20 }}>
  <h3>プレイスタイル</h3>

  <label>
    <input
      type="radio"
      checked={playStyle === "enjoy"}
      onChange={() => setPlayStyle("enjoy")}
    />
    エンジョイ
  </label>

  <label>
    <input
      type="radio"
      checked={playStyle === "serious"}
      onChange={() => setPlayStyle("serious")}
    />
    ガチ
  </label>
</div>



        <button
          onClick={handleSubmit}
          disabled={loading}
          style={{
            padding: "12px 24px",
            fontSize: 16,
            border: "none",
            borderRadius: 8,
            backgroundColor: loading ? "#999" : "orange",
            color: "white",
            cursor: loading ? "default" : "pointer",
          }}
        >
          {loading ? "登録中..." : "参加する"}
        </button>
      </div>
    </div>
  );
}