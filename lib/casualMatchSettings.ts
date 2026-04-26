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
  playStylePriority: boolean;
  matchPriorityOrder: MatchPriorityAxis[];
};

export type MatchPriorityAxis = "tournament" | "beginner" | "enjoy" | "rank";
const DEFAULT_MATCH_PRIORITY_ORDER: MatchPriorityAxis[] = [
  "tournament",
  "beginner",
  "enjoy",
  "rank",
];

export const DEFAULT_CASUAL_PAIRING: CasualPairingSettings = {
  rankPriority: true,
  avoidRematch: true,
  playStylePriority: false,
  matchPriorityOrder: [...DEFAULT_MATCH_PRIORITY_ORDER],
};

function normalizeMatchPriorityOrder(v: unknown): MatchPriorityAxis[] {
  if (!Array.isArray(v)) return [...DEFAULT_MATCH_PRIORITY_ORDER];
  const allowed: MatchPriorityAxis[] = ["tournament", "beginner", "enjoy", "rank"];
  const used = new Set<MatchPriorityAxis>();
  const ordered: MatchPriorityAxis[] = [];
  for (const x of v) {
    if (x === "serious") {
      if (!used.has("tournament")) {
        used.add("tournament");
        ordered.push("tournament");
      }
      continue;
    }
    if (
      (x === "tournament" || x === "beginner" || x === "enjoy" || x === "rank") &&
      !used.has(x)
    ) {
      used.add(x);
      ordered.push(x);
    }
  }
  if (ordered.length !== allowed.length) return [...DEFAULT_MATCH_PRIORITY_ORDER];
  return ordered;
}

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
      playStylePriority: d.playStylePriority === true,
      matchPriorityOrder: normalizeMatchPriorityOrder(d.matchPriorityOrder),
    };
  } catch {
    return { ...DEFAULT_CASUAL_PAIRING };
  }
}

export async function saveCasualPairingSettings(
  rankPriority: boolean,
  avoidRematch: boolean,
  playStylePriority: boolean,
  matchPriorityOrder: MatchPriorityAxis[]
): Promise<void> {
  await setDoc(
    casualPairingRef,
    {
      rankPriority,
      avoidRematch,
      playStylePriority,
      matchPriorityOrder: normalizeMatchPriorityOrder(matchPriorityOrder),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
