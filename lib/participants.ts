import {
    collection,
    doc,
    getDocs,
    query,
    serverTimestamp,
    updateDoc,
    where,
  } from "firebase/firestore";
  import { db } from "@/lib/firebase";
  import type { Participant } from "@/lib/types";
  import { normalizeBadges, normalizePlayStyle } from "@/lib/playerBadges";
  
  /**
   * waiting状態の参加者だけ取得
   * 今のDB構造に合わせて players を見る
   */
  export async function getWaitingParticipants(
    eventId: string
  ): Promise<Participant[]> {
    const q = query(
      collection(db, "players"),
      where("status", "==", "waiting")
    );
  
    const snap = await getDocs(q);
  
    return snap.docs.map((d) => {
      const data = d.data() as Record<string, unknown>;
      const normalized: Participant = {
        id: d.id,
        name: typeof data.name === "string" ? data.name : "",
        status: "waiting",
        currentMatchId:
          typeof data.currentMatchId === "string" ? data.currentMatchId : null,
        playHistory:
          typeof data.playHistory === "string" ? data.playHistory : undefined,
        rank: data.rank as Participant["rank"] | undefined,
        deckName:
          typeof data.deckName === "string" ? data.deckName : undefined,
        readyNext:
          typeof data.readyNext === "boolean" ? data.readyNext : undefined,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        playStyle: normalizePlayStyle(data),
        badges: normalizeBadges(data),
      };
      if (!normalized.name.trim()) {
        console.error("[getWaitingParticipants] invalid participant name", {
          id: d.id,
          rawName: data.name,
          status: data.status,
          currentMatchId: data.currentMatchId ?? null,
        });
      }
      return normalized;
    });
  }
  
  /**
   * 参加者の状態更新
   * 今のDB構造に合わせて players を更新
   */
  export async function updateParticipantStatus(
    eventId: string,
    participantId: string,
    status: Participant["status"],
    currentMatchId: string | null = null
  ) {
    const ref = doc(db, "players", participantId);
  
    await updateDoc(ref, {
      status,
      currentMatchId,
      updatedAt: serverTimestamp(),
    });
  }
  
  /**
   * 試合終了後に待機へ戻す
   */
  export async function setParticipantBackToWaiting(
    eventId: string,
    participantId: string
  ) {
    await updateParticipantStatus(eventId, participantId, "waiting", null);
  }
  export async function resetAllPlayersToWaiting() {
    const snap = await getDocs(collection(db, "players"));
  
    const updates = snap.docs.map((docSnap) =>
      updateDoc(doc(db, "players", docSnap.id), {
        status: "waiting",
        currentMatchId: null,
        updatedAt: serverTimestamp(),
      })
    );
  
    await Promise.all(updates);
  }

  export async function setPlayerInactive(participantId: string) {
    await updateDoc(doc(db, "players", participantId), {
      status: "inactive",
      currentMatchId: null,
      updatedAt: serverTimestamp(),
    });
  }

  export async function resetAllPlayersToInactive() {
    const snap = await getDocs(collection(db, "players"));

    const updates = snap.docs.map((docSnap) =>
      updateDoc(doc(db, "players", docSnap.id), {
        status: "inactive",
        currentMatchId: null,
        updatedAt: serverTimestamp(),
      })
    );

    await Promise.all(updates);
  }