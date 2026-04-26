import {
    collection,
    deleteDoc,
    doc,
    getDocs,
    query,
    serverTimestamp,
    updateDoc,
    where,
  } from "firebase/firestore";
  import { db } from "@/lib/firebase";
  import type { Participant } from "@/lib/types";
  import {
    normalizePlayerAttributeBadges,
    normalizeSpecialBadgeId,
    normalizePlayStyle,
  } from "@/lib/playerBadges";
  
  /**
   * waiting状態の参加者だけ取得
   * 今のDB構造に合わせて players を見る。
   * ドキュメント削除済みの参加者はクエリ結果に含まれない（一覧・マッチング対象外）。
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
        waitingSince: data.waitingSince,
        createdAt: data.createdAt,
        updatedAt: data.updatedAt,
        playStyle: normalizePlayStyle(data),
        playerAttributes: normalizePlayerAttributeBadges(data),
        specialBadge: normalizeSpecialBadgeId(data),
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
      waitingSince: status === "waiting" ? serverTimestamp() : null,
      updatedAt: serverTimestamp(),
    });
  }

  /** 交流会：待機中プレイヤーを休憩（マッチ対象外）に */
  export async function setPlayerBreak(
    eventId: string,
    participantId: string
  ) {
    await updateParticipantStatus(eventId, participantId, "break", null);
  }

  /** 交流会：休憩から待機へ復帰 */
  export async function setPlayerResumeFromBreak(
    eventId: string,
    participantId: string
  ) {
    await updateParticipantStatus(eventId, participantId, "waiting", null);
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
        waitingSince: serverTimestamp(),
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

  /**
   * 「削除」＝`players` の完全削除（`deleteDoc`）。無効化（`inactive`）とは別で、ドキュメントは残りません。
   * 主な用途は **途中帰宅した人** など、もうその場にいない参加者の整理。
   * **誤操作防止**：呼び出し元で必ず利用者に確認ダイアログを出してから呼ぶこと（運営画面は `app/page.tsx` の `confirm` → 本関数）。
   * **個別選択**：引数の `participantId` 1人分だけを削除し、**他の参加者の `players` ドキュメントには一切書き込み・削除を行いません**（当該1件の `deleteDoc` のみ）。
   * 削除後は `players` の購読・クエリから自然に消えるため、運営一覧・待機人数・`getWaitingParticipants` の結果から除外されます。
   * マッチ作成直前の再検証は `startCasualMatches` 側で行います。
   * 対戦中に削除した場合など、卓 `matches` 側の整合は呼び出し側・運用で別途扱う必要がある場合があります。
   */
  export async function deletePlayer(participantId: string) {
    await deleteDoc(doc(db, "players", participantId));
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

  /** 交流会リセット用：players を完全削除 */
  export async function deleteAllPlayers() {
    const snap = await getDocs(collection(db, "players"));
    await Promise.all(
      snap.docs.map((docSnap) => deleteDoc(doc(db, "players", docSnap.id)))
    );
  }