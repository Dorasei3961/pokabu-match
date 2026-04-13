import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

/** 運営画面のトグルを参加者端末と共有するための1ドキュメント */
const casualPairingRef = doc(
  db,
  "events",
  "default",
  "config",
  "casualPairing"
);

export type CasualPairingSettings = {
  rankPriority: boolean;
  avoidRematch: boolean;
};

export const DEFAULT_CASUAL_PAIRING: CasualPairingSettings = {
  rankPriority: true,
  avoidRematch: true,
};

export async function loadCasualPairingSettings(): Promise<CasualPairingSettings> {
  try {
    const snap = await getDoc(casualPairingRef);
    if (!snap.exists()) {
      return { ...DEFAULT_CASUAL_PAIRING };
    }
    const d = snap.data();
    return {
      rankPriority: d.rankPriority !== false,
      avoidRematch: d.avoidRematch !== false,
    };
  } catch {
    return { ...DEFAULT_CASUAL_PAIRING };
  }
}

export async function saveCasualPairingSettings(
  rankPriority: boolean,
  avoidRematch: boolean
): Promise<void> {
  await setDoc(
    casualPairingRef,
    {
      rankPriority,
      avoidRematch,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
