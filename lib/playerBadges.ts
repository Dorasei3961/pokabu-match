/** 交流会：プレイスタイル（参加登録・将来マッチング用） */
export type PlayStyleKey = "serious" | "enjoy" | "both";

/**
 * 交流会：プレイヤー属性（Firestore `players.playerAttributes`・旧 `badges` も読取互換）。
 * 主に卓・一覧の表示用。交流会マッチングが `playerAttributes` から参照するのは **`beginner` のみ**で、
 * **両者とも** `beginner` のとき「初心者」軸の比較スコアが 1（それ以外の属性はマッチングに使わない）。
 */
export type PlayerAttributeBadgeId =
  | "beginner"
  | "new_deck"
  /** デッキ志向のエンジョイ（`playStyle: "enjoy"` とは別フィールドで保存） */
  | "enjoy"
  /** 環境（メタ）寄りのデッキ */
  | "meta"
  | "advice_ok"
  /** SNS（X）交換 OK */
  | "sns_ok"
  | "fast_play";

/** 交流会：属性バッジ id（プレイヤー属性＋特別属性の和集合・UI 用） */
export type BadgeId =
  | PlayerAttributeBadgeId
  /** 初参加（Firestore `players.badge` は `"first"`） */
  | "first"
  /** 常連（Firestore `players.badge` は `"regular"`） */
  | "regular"
  /** 主催（Firestore `players.badge` は `"host"`） */
  | "host"
  /** 運営（Firestore `players.badge` は `"staff"`） */
  | "staff"
  /** おにぎり（遊び用・Firestore `players.badge` は `"onigiri"`） */
  | "onigiri";

const PLAYER_ATTRIBUTE_IDS = new Set<string>([
  "beginner",
  "new_deck",
  "enjoy",
  "meta",
  "advice_ok",
  "sns_ok",
  "fast_play",
]);

const ALL_BADGE_IDS = new Set<string>([
  "beginner",
  "new_deck",
  "enjoy",
  "meta",
  "advice_ok",
  "sns_ok",
  "fast_play",
  "first",
  "regular",
  "host",
  "staff",
  "onigiri",
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
  new_deck: { emoji: "🆕", label: "新デッキ調整" },
  enjoy: { emoji: "😆", label: "エンジョイデッキ" },
  meta: { emoji: "⚔️", label: "環境デッキ" },
  advice_ok: { emoji: "📖", label: "アドバイス歓迎" },
  sns_ok: { emoji: "📱", label: "SNS(X)交換🆗" },
  fast_play: { emoji: "⚡", label: "サクサク対戦" },
  first: { emoji: "🎉", label: "初参加" },
  regular: { emoji: "👑", label: "常連" },
  host: { emoji: "👾", label: "主催" },
  staff: { emoji: "⚒️", label: "運営" },
  /** ラベル空：ピル表示は絵文字のみ（一覧のテキスト行では 🍙 のみ） */
  onigiri: { emoji: "🍙", label: "" },
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

/** 交流会：登録・表示用の並び（単一選択 UI と揃える） */
export const BADGE_IDS_ORDERED: readonly BadgeId[] = [
  "beginner",
  "new_deck",
  "enjoy",
  "meta",
  "advice_ok",
  "sns_ok",
  "fast_play",
  "first",
  "regular",
  "host",
  "staff",
  "onigiri",
];

/**
 * Firestore `players.badge` のみ（特別属性）。
 * - `"host"` / `"staff"` / `"first"` / `"regular"` / `"onigiri"` …いずれか 1 つ
 * - **`null`** …特別属性なし（参加登録の「なし」・未設定・クリア時）
 *
 * アプリ上の `specialBadge` と対応。**完全に表示・識別専用**（マッチング等には使わない）。
 * プレイヤー属性（`playerAttributes`）・プレイスタイルとは別キー。
 */
export type FirestorePlayerBadge =
  | "host"
  | "staff"
  | "first"
  | "regular"
  | "onigiri"
  | null;

/** `players.badge` に入る特別属性 id（null 以外） */
export type SpecialBadgeId = NonNullable<FirestorePlayerBadge>;

/**
 * 交流会で主催・運営・初参加・常連・おにぎりから1つだけ選ぶ UI の並び（表示専用データの選択）。
 * 登録後の変更は運営のみ（参加者ページからの本人編集は行わない）。
 */
export const CASUAL_IDENTITY_BADGE_IDS: readonly BadgeId[] = [
  "host",
  "staff",
  "first",
  "regular",
  "onigiri",
];

const CASUAL_IDENTITY_SET = new Set<string>(
  CASUAL_IDENTITY_BADGE_IDS as readonly string[]
);

export function badgeIdToFirestore(id: BadgeId | null): FirestorePlayerBadge {
  if (!id) return null;
  if (id === "host") return "host";
  if (id === "staff") return "staff";
  if (id === "first") return "first";
  if (id === "regular") return "regular";
  if (id === "onigiri") return "onigiri";
  return null;
}

/**
 * Firestore `players.badge`（特別属性）のみを解釈する。
 * 返す id は **表示・識別専用**（`lib/matches` 等のマッチングロジックでは参照しない）。
 * 旧データで `badge` が無く `badges` / `playerAttributes` にだけ初参加等が入っている場合はそこから拾う。
 */
export function normalizeSpecialBadgeId(
  data: Record<string, unknown>
): SpecialBadgeId | null {
  const b = data.badge;
  if (b === "host") return "host";
  if (b === "staff") return "staff";
  if (b === "first") return "first";
  if (b === "regular") return "regular";
  if (b === "onigiri") return "onigiri";
  if (b !== null && b !== undefined && String(b).trim() !== "") return null;

  const legacyArrays = [
    Array.isArray(data.badges) ? data.badges : [],
    Array.isArray(data.playerAttributes) ? data.playerAttributes : [],
  ];
  for (const arr of legacyArrays) {
    for (const x of arr) {
      if (typeof x !== "string") continue;
      /** 旧 UI id `organizer` が配列に残っている場合 */
      if (x === "organizer") return "host";
      /** 旧 id `first_join` が配列に残っている場合 */
      if (x === "first_join") return "first";
      if (CASUAL_IDENTITY_SET.has(x)) {
        return x as SpecialBadgeId;
      }
    }
  }
  return null;
}

/**
 * Firestore `playerAttributes` がキーとして存在すればそれだけ（空配列も正当）。
 * 無ければ旧 `badges` を見る（表示用属性＋一部マッチ条件の配列）。
 */
export function rawPlayerAttributeValues(
  data: Record<string, unknown>
): unknown[] {
  if ("playerAttributes" in data) {
    return Array.isArray(data.playerAttributes) ? data.playerAttributes : [];
  }
  if (Array.isArray(data.badges)) return data.badges;
  return [];
}

/**
 * プレイヤー属性のみ（`playerAttributes` 優先・旧 `badges` フォールバック）。
 * 特別属性 id が混ざっていれば除外（特別は `badge` 側）。
 * 返す配列は主に表示用。交流会マッチングは `lib/matches` が `beginner` のみ参照（両者 beginner なら軸スコア 1）。
 */
export function normalizePlayerAttributeBadges(
  data: Record<string, unknown>
): PlayerAttributeBadgeId[] {
  const raw = rawPlayerAttributeValues(data);
  const out: PlayerAttributeBadgeId[] = [];
  const seen = new Set<string>();
  for (const x of raw) {
    if (typeof x !== "string" || CASUAL_IDENTITY_SET.has(x)) continue;
    if (!PLAYER_ATTRIBUTE_IDS.has(x)) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x as PlayerAttributeBadgeId);
  }
  return out;
}

/** 一覧・卓表示用：特別を先に、続けてプレイヤー属性（いずれも表示目的。特別側はマッチに未使用） */
export function mergeBadgesForDisplay(
  special: SpecialBadgeId | null,
  playerAttrs: readonly PlayerAttributeBadgeId[]
): BadgeId[] {
  return [...(special ? [special] : []), ...playerAttrs];
}

/** 生ドキュメントから表示用バッジ列を組み立てる */
export function badgesForDisplayFromDoc(
  data: Record<string, unknown>
): BadgeId[] {
  return mergeBadgesForDisplay(
    normalizeSpecialBadgeId(data),
    normalizePlayerAttributeBadges(data)
  );
}

/**
 * @deprecated 意味は {@link badgesForDisplayFromDoc} と同じ（互換名）
 */
export function normalizePlayerBadges(
  data: Record<string, unknown>
): BadgeId[] {
  return badgesForDisplayFromDoc(data);
}

/** @deprecated 特別属性を `badges` に混在させていた旧形式用。新規は `normalizePlayerAttributeBadges` を使う */
export function normalizeBadges(data: { badges?: unknown }): BadgeId[] {
  if (!Array.isArray(data.badges)) return [];
  for (const x of data.badges) {
    if (typeof x === "string" && ALL_BADGE_IDS.has(x)) {
      return [x as BadgeId];
    }
  }
  return [];
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

export function participantSummaryLineFromDoc(
  playStyle: PlayStyleKey,
  data: Record<string, unknown>
): string {
  return participantSummaryLine(playStyle, badgesForDisplayFromDoc(data));
}
