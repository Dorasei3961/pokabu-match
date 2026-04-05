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
  
    return snap.docs.map((d) => ({
      id: d.id,
      ...d.data(),
    })) as Participant[];
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