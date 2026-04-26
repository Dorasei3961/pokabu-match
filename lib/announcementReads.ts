import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

/** 参加者ごとのお知らせ既読位置（ドキュメント ID = playerId） */
export const ANNOUNCEMENT_READS_COLLECTION = "announcementReads";

/**
 * この時点までのお知らせを既読にする（`lastReadAt` を現在時刻で更新）。
 */
export async function markAnnouncementReadsUpToNow(
  playerId: string
): Promise<void> {
  const id = playerId.trim();
  if (!id) return;
  await setDoc(
    doc(db, ANNOUNCEMENT_READS_COLLECTION, id),
    { lastReadAt: serverTimestamp() },
    { merge: true }
  );
}
