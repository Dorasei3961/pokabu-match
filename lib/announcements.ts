import {
  addDoc,
  collection,
  getDocs,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "./firebase";

export const ANNOUNCEMENTS_COLLECTION = "announcements";

export type AnnouncementType = "normal" | "important" | "info";

export type CreateAnnouncementInput = {
  title: string;
  message: string;
  type: AnnouncementType;
};

/**
 * 参加者向けお知らせを Firestore `announcements` に追加する。
 */
export async function createAnnouncement(
  input: CreateAnnouncementInput
): Promise<void> {
  const title = input.title.trim();
  const message = input.message.trim();
  if (!title || !message) {
    throw new Error("タイトルと本文が必要です");
  }
  const type: AnnouncementType =
    input.type === "important" || input.type === "info"
      ? input.type
      : "normal";

  await addDoc(collection(db, ANNOUNCEMENTS_COLLECTION), {
    title,
    message,
    type,
    createdAt: serverTimestamp(),
  });
}

const FIRESTORE_BATCH_DELETE_LIMIT = 500;

/**
 * Firestore `announcements` の全ドキュメントを削除する（テスト用リセット等）。
 * 他コレクションには触れない。
 */
export async function deleteAllAnnouncements(): Promise<number> {
  const snap = await getDocs(collection(db, ANNOUNCEMENTS_COLLECTION));
  if (snap.empty) return 0;
  const refs = snap.docs.map((d) => d.ref);
  for (let i = 0; i < refs.length; i += FIRESTORE_BATCH_DELETE_LIMIT) {
    const batch = writeBatch(db);
    for (const ref of refs.slice(i, i + FIRESTORE_BATCH_DELETE_LIMIT)) {
      batch.delete(ref);
    }
    await batch.commit();
  }
  return refs.length;
}
