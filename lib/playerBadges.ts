/** 交流会：プレイスタイル（参加登録・将来マッチング用） */
export type PlayStyleKey = "serious" | "enjoy" | "both";

/** 交流会：属性バッジ id */
export type BadgeId = "beginner" | "new_deck" | "advice_ok" | "fast_play";

const ALL_BADGE_IDS = new Set<string>([
  "beginner",
  "new_deck",
  "advice_ok",
  "fast_play",
]);

export const PLAY_STYLE_META: Record<
  PlayStyleKey,
  { emoji: string; label: string }
> = {
  serious: { emoji: "🔥", label: "大会前調整" },
  enjoy: { emoji: "⭐", label: "エンジョイバトル" },
  both: { emoji: "👌", label: "どちらでも可" },
};

export const BADGE_META: Record<BadgeId, { emoji: string; label: string }> = {
  beginner: { emoji: "🔰", label: "初心者" },
  new_deck: { emoji: "🧪", label: "新デッキ試運転" },
  advice_ok: { emoji: "📖", label: "アドバイス歓迎" },
  fast_play: { emoji: "⚡", label: "サクサク対戦" },
};

export function normalizePlayStyle(data: {
  playStyle?: unknown;
  tags?: { playStyle?: unknown };
}): PlayStyleKey {
  const top = data.playStyle;
  if (top === "serious" || top === "enjoy" || top === "both") return top;
  const t = data.tags?.playStyle;
  if (t === "serious" || t === "enjoy" || t === "both") return t;
  return "enjoy";
}

export function normalizeBadges(data: { badges?: unknown }): BadgeId[] {
  if (!Array.isArray(data.badges)) return [];
  const out: BadgeId[] = [];
  for (const x of data.badges) {
    if (typeof x === "string" && ALL_BADGE_IDS.has(x)) {
      out.push(x as BadgeId);
    }
  }
  return out;
}

export function playStyleLine(style: PlayStyleKey): string {
  const m = PLAY_STYLE_META[style];
  return `${m.emoji} ${m.label}`;
}

/** コンパクト表示（絵文字のみ連結） */
export function badgesEmojiCompact(badges: BadgeId[]): string {
  return badges.map((id) => BADGE_META[id].emoji).join("");
}

/** 絵文字＋短いラベル（待機一覧など） */
export function badgesWithLabels(badges: BadgeId[]): string {
  return badges.map((id) => `${BADGE_META[id].emoji}${BADGE_META[id].label}`).join(" · ");
}

export function participantSummaryLine(
  playStyle: PlayStyleKey,
  badges: BadgeId[]
): string {
  const ps = playStyleLine(playStyle);
  const be = badgesEmojiCompact(badges);
  return be ? `${ps} ${be}` : ps;
}
