"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, onSnapshot, orderBy, query, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

type ContactMessage = {
  id: string;
  playerName: string;
  message: string;
  status: "unread" | "read";
  createdAtMs: number | null;
};

export default function AdminMessagesPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<ContactMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const handleMarkAsRead = async (messageId: string) => {
    console.log("既読に変更", messageId);
    try {
      await updateDoc(doc(db, "contactMessages", messageId), {
        status: "read",
      });
    } catch (error) {
      console.error("[admin/messages] mark as read failed", error);
    }
  };

  useEffect(() => {
    const q = query(collection(db, "contactMessages"), orderBy("createdAt", "desc"));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const rows: ContactMessage[] = snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            playerName: String(data.playerName ?? ""),
            message: String(data.message ?? ""),
            status: data.status === "read" ? "read" : "unread",
            createdAtMs:
              typeof (data.createdAt as { toMillis?: () => number } | undefined)?.toMillis ===
              "function"
                ? (data.createdAt as { toMillis: () => number }).toMillis()
                : null,
          };
        });
        setMessages(rows);
        setLoading(false);
      },
      (error) => {
        console.error("[admin/messages] subscribe failed", error);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: "20px 14px 28px",
      }}
    >
      <div style={{ width: "100%", maxWidth: 760, margin: "0 auto" }}>
        <button
          type="button"
          onClick={() => router.push("/admin")}
          style={{
            border: "1px solid rgba(148,163,184,0.45)",
            background: "rgba(30,41,59,0.65)",
            color: "rgba(241,245,249,0.96)",
            borderRadius: 10,
            padding: "9px 14px",
            fontSize: 14,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          ← 運営ページに戻る
        </button>

        <h1
          style={{
            marginTop: 14,
            marginBottom: 10,
            color: "#f8fafc",
            fontSize: 26,
            fontWeight: 800,
          }}
        >
          お問い合わせ
        </h1>

        {loading ? (
          <div style={{ color: "rgba(226,232,240,0.86)", fontSize: 14 }}>読み込み中…</div>
        ) : messages.length === 0 ? (
          <div
            style={{
              borderRadius: 12,
              border: "1px solid rgba(148,163,184,0.28)",
              background: "rgba(15,23,42,0.6)",
              padding: "14px 16px",
              color: "rgba(226,232,240,0.85)",
            }}
          >
            お問い合わせはまだありません
          </div>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {messages.map((row) => (
              <article
                key={row.id}
                onClick={() => {
                  if (row.status === "unread") {
                    void handleMarkAsRead(row.id);
                  }
                }}
                style={{
                  borderRadius: 12,
                  border:
                    row.status === "unread"
                      ? "1px solid rgba(251,191,36,0.48)"
                      : "1px solid rgba(148,163,184,0.28)",
                  background:
                    row.status === "unread" ? "rgba(251,191,36,0.1)" : "rgba(15,23,42,0.6)",
                  padding: "12px 14px",
                  cursor: row.status === "unread" ? "pointer" : "default",
                }}
              >
                <div
                  style={{
                    color: "#f8fafc",
                    fontSize: 15,
                    fontWeight: 800,
                    marginBottom: 6,
                  }}
                >
                  名前：{row.playerName || "（未設定）"}
                  {row.status === "unread" ? (
                    <span
                      style={{
                        marginLeft: 8,
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#fef3c7",
                        background: "rgba(217,119,6,0.5)",
                        border: "1px solid rgba(253,186,116,0.65)",
                        borderRadius: 999,
                        padding: "1px 8px",
                        verticalAlign: "middle",
                      }}
                    >
                      未読
                    </span>
                  ) : null}
                </div>
                <div
                  style={{
                    color: "rgba(226,232,240,0.92)",
                    fontSize: 14,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                >
                  内容：{row.message || "（空）"}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    color: "rgba(148,163,184,0.92)",
                    fontSize: 12,
                    fontWeight: 600,
                  }}
                >
                  時間：
                  {row.createdAtMs
                    ? new Date(row.createdAtMs).toLocaleString("ja-JP", {
                        year: "numeric",
                        month: "2-digit",
                        day: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : "未設定"}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
