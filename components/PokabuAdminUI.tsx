"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import type { GoodHistoryListItem } from "@/lib/good";
import { POKABU_ADMIN_GLASS as GLASS } from "@/lib/pokabuAdminUiTokens";

export type PokabuAdminMode =
  | "startEnd"
  | "casual"
  | "tournament"
  | "boards"
  | "notice";

export type RankKey = "monster" | "super" | "hyper";

export type RankParticipantRow = {
  id: string;
  name: string;
  /** プレイスタイル・バッジの一行サマリ（任意） */
  badgeSummary?: string;
};

export type RankCardData = {
  key: RankKey;
  label: string;
  total: number;
  waiting: number;
  /** 交流会：休憩中（マッチ対象外） */
  onBreak?: number;
  playing: number;
  participants?: (string | RankParticipantRow)[];
};

export type RecentMatchRow = {
  tableNumber: number;
  player1: string;
  player2: string;
};

/** 待機中一覧モーダル用（名前・階級） */
export type WaitingParticipantRow = {
  id: string;
  name: string;
  rank: string;
  badgeSummary?: string;
};

/** 運営向けナイス対戦ランキング（参加者ページには出さない） */
export type GoodRankingRow = {
  rank: number;
  playerId: string;
  name: string;
  goodCount: number;
};

export type ContactMessageRow = {
  id: string;
  playerId: string;
  playerName: string;
  message: string;
  status: "unread" | "resolved";
  createdAtMs: number | null;
};

type MatchPriorityAxis = "tournament" | "beginner" | "enjoy" | "rank";

export type PokabuAdminUIProps = {
  mode?: PokabuAdminMode;
  onModeChange?: (mode: PokabuAdminMode) => void;
  waitingCount?: number;
  /** 交流会：休憩中人数（待機人数とは別） */
  breakCount?: number;
  playingCount?: number;
  /** 交流会モードで「待機中」カードタップ時に表示する一覧 */
  waitingParticipants?: WaitingParticipantRow[];
  /** 交流会：休憩中一覧（モーダル内で待機の下に表示） */
  breakParticipants?: WaitingParticipantRow[];
  rankCards?: RankCardData[];
  recentMatches?: RecentMatchRow[];
  onCasualStart?: () => void;
  onCasualMatch?: () => void;
  onCasualClose?: () => void;
  onForceWaiting?: () => void;
  onShowMoreMatches?: () => void;
  /** 無効化：マッチ対象から外す（`inactive`・データは残る）。参加者編集メニューから。 */
  onDeactivateParticipant?: (id: string) => void | Promise<void>;
  /**
   * 個別削除：`id` の1人の `players` のみ削除。実装側で確認ダイアログ後に呼ぶこと（誤操作防止）。
   * @returns 実際に削除が完了したとき true（参加者編集メニューを閉じる判定に使う）。キャンセル・失敗は false。
   */
  onDeleteParticipant?: (id: string) => boolean | Promise<boolean>;
  /** 特別属性（主催・運営・初参加・常連）の設定モーダルを開く（任意） */
  onOpenBadgeSetting?: (id: string) => void | Promise<void>;
  headerSlot?: ReactNode;
  tournamentSlot?: ReactNode;
  resetSlot?: ReactNode;
  casualExtraSlot?: ReactNode;
  /** 交流会：階級別マッチ ON（true） / OFF（false） */
  casualRankPriority?: boolean;
  onCasualRankPriorityChange?: (value: boolean) => void;
  /** 交流会：再戦回避 ON（true）／OFF（false）。ONでも未対戦が尽きたら再戦あり */
  casualAvoidRematch?: boolean;
  onCasualAvoidRematchChange?: (value: boolean) => void;
  /** 交流会：互換用（マッチング軸スコアには未使用・Firestore にのみ保存） */
  casualPlayStylePriority?: boolean;
  onCasualPlayStylePriorityChange?: (value: boolean) => void;
  /** 交流会：③〜⑥の比較順（固定:①再戦回避＝未対戦が残る間のみ ②待機時間＝待ち長いペア優先 ⑦ランダム） */
  casualMatchPriorityOrder?: MatchPriorityAxis[];
  onCasualMatchPriorityOrderSave?: (
    value: MatchPriorityAxis[]
  ) => void | Promise<void>;
  /** 運営のみ：Good（ナイス対戦）受信ランキング */
  goodRankingRows?: GoodRankingRow[];
  /** 運営のみ：受信者 playerId → 送信ログ（goodHistory 購読結果） */
  goodLogsByPlayerId?: Record<string, GoodHistoryListItem[]>;
  /** 運営のみ：参加者からの連絡メッセージ */
  contactMessages?: ContactMessageRow[];
  /** 運営のみ：未読/対応済みの切り替え */
  onToggleContactMessageStatus?: (
    id: string,
    nextStatus: "unread" | "resolved"
  ) => void | Promise<void>;
  /** 大会用：待機中の代わりに「対戦中卓数」「対戦終了卓数」を表示する */
  tournamentGridCounts?: { playing: number; finished: number };
  eventFinished?: boolean;
};

const defaultRankCards: RankCardData[] = [
  {
    key: "monster",
    label: "モンスターボール級",
    total: 9,
    waiting: 3,
    playing: 6,
    participants: ["参加者A", "参加者B", "参加者C"],
  },
  {
    key: "super",
    label: "スーパーボール級",
    total: 12,
    waiting: 5,
    playing: 7,
    participants: ["参加者D", "参加者E"],
  },
  {
    key: "hyper",
    label: "ハイパーボール級",
    total: 6,
    waiting: 2,
    playing: 4,
    participants: ["参加者F"],
  },
];

const defaultRecentMatches: RecentMatchRow[] = [
  { tableNumber: 12, player1: "かなかな", player2: "nene" },
  { tableNumber: 11, player1: "第8小隊", player2: "たけしし" },
  { tableNumber: 10, player1: "dora", player2: "nene" },
];

const rankStyles: Record<
  RankKey,
  { border: string; accent: string; badge: string }
> = {
  monster: {
    border: "border-fuchsia-500/45",
    accent: "text-fuchsia-300",
    badge: "border border-fuchsia-400/35 bg-white/10 text-fuchsia-200",
  },
  super: {
    border: "border-cyan-400/45",
    accent: "text-cyan-300",
    badge: "border border-cyan-400/35 bg-white/10 text-cyan-200",
  },
  hyper: {
    border: "border-amber-400/45",
    accent: "text-amber-300",
    badge: "border border-amber-400/35 bg-white/10 text-amber-200",
  },
};

const DEFAULT_MATCH_PRIORITY_ORDER: MatchPriorityAxis[] = [
  "tournament",
  "beginner",
  "enjoy",
  "rank",
];

const MATCH_PRIORITY_LABEL: Record<MatchPriorityAxis, string> = {
  tournament: "🔥大会前調整",
  beginner: "🔰初心者",
  enjoy: "⭐エンジョイバトル",
  rank: "同階級",
};

function formatGoodLogTime(ms: number | null): string {
  if (ms == null || Number.isNaN(ms)) return "—";
  return new Date(ms).toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 交流会・大会まわりの運営向けホーム UI（`app/page.tsx` から使用）。
 *
 * 参加者編集メニュー表示の切り分け（参加者 URL vs 運営ホーム）の正は {@link ../lib/participantEditMenuPolicy}。
 */
export function PokabuAdminUI({
  mode: controlledMode,
  onModeChange,
  waitingCount = 0,
  breakCount = 0,
  playingCount = 0,
  rankCards = defaultRankCards,
  recentMatches = defaultRecentMatches,
  onCasualStart,
  onCasualMatch,
  onCasualClose,
  onForceWaiting,
  onShowMoreMatches,
  onDeactivateParticipant,
  onDeleteParticipant,
  onOpenBadgeSetting,
  headerSlot,
  tournamentSlot,
  resetSlot,
  casualExtraSlot,
  waitingParticipants = [],
  breakParticipants = [],
  casualRankPriority = true,
  onCasualRankPriorityChange,
  casualAvoidRematch = true,
  onCasualAvoidRematchChange,
  casualPlayStylePriority = false,
  onCasualPlayStylePriorityChange,
  casualMatchPriorityOrder = DEFAULT_MATCH_PRIORITY_ORDER,
  onCasualMatchPriorityOrderSave,
  goodRankingRows,
  goodLogsByPlayerId = {},
  contactMessages = [],
  onToggleContactMessageStatus,
  tournamentGridCounts,
  eventFinished,
}: PokabuAdminUIProps) {
  const [internalMode, setInternalMode] =
    useState<PokabuAdminMode>("startEnd");
  const mode = controlledMode ?? internalMode;
  const setMode = (m: PokabuAdminMode) => {
    if (onModeChange) onModeChange(m);
    else setInternalMode(m);
  };

  const [expandedRank, setExpandedRank] = useState<RankKey | null>(null);
  const [matchingSettingsOpen, setMatchingSettingsOpen] = useState(true);
  const [waitingSheetOpen, setWaitingSheetOpen] = useState(false);
  const [goodRankFullView, setGoodRankFullView] = useState(false);
  const [priorityDraft, setPriorityDraft] = useState<MatchPriorityAxis[]>(
    casualMatchPriorityOrder
  );
  const [savingPriorityOrder, setSavingPriorityOrder] = useState(false);
  const [goodDetailTarget, setGoodDetailTarget] = useState<{
    playerId: string;
    playerName: string;
    goodCount: number;
  } | null>(null);
  const [participantEditMenu, setParticipantEditMenu] = useState<{
    id: string;
    name: string;
    tone: "purple" | "amber";
  } | null>(null);
  const participantEditMenuTitleId = useId();

  /**
   * 参加者編集メニューは policy 記載の参加者一覧からのみ開く（Good ランキング等からは開かない）。
   * 特別属性の設定のみ渡す場合でも、一覧の「編集」からメニューを出せるようにする。
   */
  const canOpenParticipantEditMenu = Boolean(
    onOpenBadgeSetting || onDeactivateParticipant || onDeleteParticipant
  );

  useEffect(() => {
    setPriorityDraft(casualMatchPriorityOrder);
  }, [casualMatchPriorityOrder]);

  useEffect(() => {
    if (mode !== "casual") {
      setWaitingSheetOpen(false);
      setGoodRankFullView(false);
      setGoodDetailTarget(null);
      setParticipantEditMenu(null);
    }
  }, [mode]);

  useEffect(() => {
    if (!goodDetailTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setGoodDetailTarget(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [goodDetailTarget]);

  useEffect(() => {
    if (!waitingSheetOpen && !participantEditMenu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (participantEditMenu) {
        setParticipantEditMenu(null);
        return;
      }
      if (waitingSheetOpen) setWaitingSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [waitingSheetOpen, participantEditMenu]);

  useEffect(() => {
    if (!waitingSheetOpen || mode !== "casual") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [waitingSheetOpen, mode]);

  const tabBase =
    "rounded-xl border-0 bg-transparent px-1 py-2.5 text-xs font-semibold min-h-[44px] flex items-center justify-center text-center leading-tight transition-all duration-200 sm:text-sm";
  const tabActive =
    "text-white bg-gradient-to-r from-[#6a5cff] to-[#a855f7] shadow-[0_0_12px_rgba(168,85,247,0.7),inset_0_0_8px_rgba(255,255,255,0.1)]";
  const tabInactive = "text-white/70 hover:text-white/90";

  const goodRankingDisplayRows = useMemo(() => {
    if (!goodRankingRows?.length) return goodRankingRows ?? [];
    return goodRankFullView ? goodRankingRows : goodRankingRows.slice(0, 3);
  }, [goodRankingRows, goodRankFullView]);

  const goodRankingHasMore = (goodRankingRows?.length ?? 0) > 3;
  const isPriorityDirty =
    priorityDraft.join("|") !== casualMatchPriorityOrder.join("|");
  const movePriorityItem = (index: number, dir: -1 | 1) => {
    const to = index + dir;
    if (to < 0 || to >= priorityDraft.length) return;
    const next = [...priorityDraft];
    const tmp = next[index];
    next[index] = next[to];
    next[to] = tmp;
    setPriorityDraft(next);
  };
  const applyPreset = (preset: MatchPriorityAxis[]) => {
    setPriorityDraft([...preset]);
  };
  const handleSavePriorityOrder = async () => {
    if (!onCasualMatchPriorityOrderSave) return;
    setSavingPriorityOrder(true);
    try {
      await onCasualMatchPriorityOrderSave(priorityDraft);
    } finally {
      setSavingPriorityOrder(false);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[420px] px-4 py-5 pb-8 sm:py-6 sm:pb-10">
      {/* タイトル（横並び + バッジ） */}
      <header className="mb-5 sm:mb-6">
        <div className="flex flex-nowrap items-center justify-center gap-2 px-1">
          <span className="shrink-0 text-base font-bold tracking-tight text-white sm:text-lg">
            ぽか部交流会
          </span>
          <span className="shrink-0 rounded-lg border border-purple-400/40 bg-purple-500/25 px-2.5 py-1 text-xs font-medium text-white shadow-[0_0_12px_rgba(168,85,247,0.35)] sm:text-sm">
            運営画面
          </span>
        </div>
      </header>

      {/* タブ切替 */}
      <div className="mb-5 rounded-2xl border border-white/10 bg-white/5 p-1.5 shadow-inner backdrop-blur-md sm:mb-6">
        <div className="grid grid-cols-5 gap-2">
          <button
            type="button"
            className={`${tabBase} ${mode === "startEnd" ? tabActive : tabInactive}`}
            onClick={() => setMode("startEnd")}
          >
            開始/終了
          </button>
          <button
            type="button"
            className={`${tabBase} ${mode === "casual" ? tabActive : tabInactive}`}
            onClick={() => setMode("casual")}
          >
            交流会
          </button>
          <button
            type="button"
            className={`${tabBase} ${mode === "tournament" ? tabActive : tabInactive}`}
            onClick={() => setMode("tournament")}
          >
            大会
          </button>
          <button
            type="button"
            className={`${tabBase} ${mode === "boards" ? tabActive : tabInactive}`}
            onClick={() => setMode("boards")}
          >
            対戦卓
          </button>
          <button
            type="button"
            className={`${tabBase} ${mode === "notice" ? tabActive : tabInactive}`}
            onClick={() => setMode("notice")}
          >
            告知
          </button>
        </div>
      </div>

      {mode === "tournament" && headerSlot ? (
        <div className="mb-4 rounded-xl border border-purple-500/25 bg-black/25 p-1.5 shadow-inner backdrop-blur-md sm:mb-5">
          {headerSlot}
        </div>
      ) : null}

      {mode === "startEnd" ? (
        <section className="mb-6 sm:mb-8">
          <h2 className="mb-3 text-sm font-bold text-white sm:mb-4">
            開始/終了
          </h2>
          <div className="space-y-3">
            <div className={`${GLASS} p-4 text-sm text-gray-200`}>
              現在のイベント状態：
              <span
                className={`ml-2 rounded-md px-2 py-1 text-xs font-bold ${
                  eventFinished
                    ? "bg-rose-500/35 text-rose-100"
                    : "bg-emerald-500/35 text-emerald-100"
                }`}
              >
                {eventFinished ? "終了中" : "開催中"}
              </span>
            </div>
            <button
              type="button"
              onClick={onCasualStart}
              className="min-h-[56px] w-full rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-4 text-lg font-bold text-white shadow-[0_0_20px_rgba(16,185,129,0.45)] active:scale-[0.98] transition-transform"
            >
              交流会開始
            </button>
            <button
              type="button"
              onClick={onCasualClose}
              className="min-h-[56px] w-full rounded-xl bg-gradient-to-r from-rose-500 to-pink-600 px-4 py-4 text-lg font-bold text-white shadow-[0_0_20px_rgba(244,63,94,0.45)] active:scale-[0.98] transition-transform"
            >
              交流会終了
            </button>
            {resetSlot ? <div>{resetSlot}</div> : null}
          </div>
        </section>
      ) : null}

      {(mode === "casual" || mode === "tournament") ? (
        <section className="mb-4 sm:mb-5">
          <h2 className="mb-2 text-sm font-bold text-white sm:mb-3">
            表示・参加状態操作
          </h2>
          <div
            className={`grid gap-2 sm:gap-4 ${
              mode === "casual" ? "grid-cols-3" : "grid-cols-2"
            }`}
          >
        {mode === "casual" ? (
          <>
            <button
              type="button"
              onClick={() => setWaitingSheetOpen(true)}
              className={`${GLASS} p-4 text-left outline-none transition-shadow active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-cyan-400 sm:p-5`}
              aria-expanded={waitingSheetOpen}
              aria-haspopup="dialog"
            >
              <p className="text-xs font-medium text-gray-300">待機中</p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums text-emerald-400 sm:mt-2">
                {waitingCount}
                <span className="ml-1 text-base font-bold text-gray-400">
                  人
                </span>
              </p>
              <p className="mt-1 text-[11px] font-medium text-gray-400 sm:mt-2 sm:text-xs">
                タップで一覧
              </p>
            </button>
            <div className={`${GLASS} p-3 text-left sm:p-5`}>
              <p className="text-xs font-medium text-gray-300">休憩中</p>
              <p className="mt-1 text-2xl font-extrabold tabular-nums text-amber-300 sm:mt-2 sm:text-3xl">
                {breakCount}
                <span className="ml-1 text-sm font-bold text-gray-400 sm:text-base">
                  人
                </span>
              </p>
              <p className="mt-1 text-[10px] font-medium text-gray-500 sm:mt-2 sm:text-xs">
                マッチ対象外
              </p>
            </div>
            <div className={`${GLASS} p-4 sm:p-5`}>
              <p className="text-xs font-medium text-gray-300">対戦中</p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums text-sky-300 sm:mt-2">
                {playingCount}
                <span className="ml-1 text-base font-bold text-gray-400">
                  人
                </span>
              </p>
            </div>
          </>
        ) : (
          <>
            <div className={`${GLASS} p-4 sm:p-5`}>
              <p className="text-xs font-medium text-gray-300">対戦中</p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums text-sky-300 sm:mt-2">
                {tournamentGridCounts?.playing ?? 0}
                <span className="ml-1 text-base font-bold text-gray-400">
                  卓
                </span>
              </p>
              <p className="mt-1 text-[11px] font-medium text-gray-400 sm:mt-2 sm:text-xs">
                未終了の試合
              </p>
            </div>
            <div className={`${GLASS} p-4 sm:p-5`}>
              <p className="text-xs font-medium text-gray-300">対戦終了</p>
              <p className="mt-1 text-3xl font-extrabold tabular-nums text-emerald-400 sm:mt-2">
                {tournamentGridCounts?.finished ?? 0}
                <span className="ml-1 text-base font-bold text-gray-400">
                  卓
                </span>
              </p>
              <p className="mt-1 text-[11px] font-medium text-gray-400 sm:mt-2 sm:text-xs">
                勝敗確定
              </p>
            </div>
          </>
        )}
          </div>
        </section>
      ) : null}

      {/* マッチング設定（交流会のみ・1カードに集約） */}
      {mode === "casual" &&
      onCasualRankPriorityChange &&
      onCasualAvoidRematchChange &&
      onCasualPlayStylePriorityChange ? (
        <div className={`mb-4 p-3 sm:mb-5 sm:p-4 ${GLASS}`}>
          <button
            type="button"
            onClick={() => setMatchingSettingsOpen((v) => !v)}
            aria-expanded={matchingSettingsOpen}
            className="mb-2.5 flex w-full items-center justify-between gap-2 border-0 bg-transparent p-0 text-left text-sm font-extrabold text-white cursor-pointer"
          >
            <span>マッチング設定</span>
            <span
              aria-hidden
              className="inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center text-sm leading-none"
            >
              {matchingSettingsOpen ? "▲" : "▼"}
            </span>
          </button>

          {matchingSettingsOpen ? (
          <>
          <div className="space-y-2">
            <div className="flex items-stretch gap-2">
              <span className="flex w-[3.25rem] shrink-0 items-center text-xs font-bold leading-tight text-gray-300">
                階級別
              </span>
              <div className="flex min-h-[40px] flex-1 gap-1 rounded-lg bg-black/30 p-0.5">
                <button
                  type="button"
                  onClick={() => onCasualRankPriorityChange(true)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold transition-colors sm:text-sm ${
                    casualRankPriority
                      ? "bg-white/20 text-white shadow-[0_0_10px_rgba(168,85,247,0.35)]"
                      : "text-gray-400"
                  }`}
                >
                  ON
                </button>
                <button
                  type="button"
                  onClick={() => onCasualRankPriorityChange(false)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold transition-colors sm:text-sm ${
                    !casualRankPriority
                      ? "bg-white/20 text-white shadow-[0_0_10px_rgba(168,85,247,0.35)]"
                      : "text-gray-400"
                  }`}
                >
                  OFF
                </button>
              </div>
            </div>

            <div className="flex items-stretch gap-2">
              <span className="flex w-[3.25rem] shrink-0 items-center text-xs font-bold leading-tight text-gray-300">
                再戦回避
              </span>
              <div className="flex min-h-[40px] flex-1 gap-1 rounded-lg bg-black/30 p-0.5">
                <button
                  type="button"
                  onClick={() => onCasualAvoidRematchChange(true)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold transition-colors sm:text-sm ${
                    casualAvoidRematch
                      ? "bg-white/20 text-white shadow-[0_0_10px_rgba(168,85,247,0.35)]"
                      : "text-gray-400"
                  }`}
                >
                  ON
                </button>
                <button
                  type="button"
                  onClick={() => onCasualAvoidRematchChange(false)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold transition-colors sm:text-sm ${
                    !casualAvoidRematch
                      ? "bg-white/20 text-white shadow-[0_0_10px_rgba(168,85,247,0.35)]"
                      : "text-gray-400"
                  }`}
                >
                  OFF
                </button>
              </div>
            </div>

            <div className="flex items-stretch gap-2">
              <span className="flex w-[3.25rem] shrink-0 items-center text-xs font-bold leading-tight text-gray-300">
                プレイ
              </span>
              <div className="flex min-h-[40px] flex-1 gap-1 rounded-lg bg-black/30 p-0.5">
                <button
                  type="button"
                  onClick={() => onCasualPlayStylePriorityChange(true)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold transition-colors sm:text-sm ${
                    casualPlayStylePriority
                      ? "bg-white/20 text-white shadow-[0_0_10px_rgba(168,85,247,0.35)]"
                      : "text-gray-400"
                  }`}
                >
                  ON
                </button>
                <button
                  type="button"
                  onClick={() => onCasualPlayStylePriorityChange(false)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-bold transition-colors sm:text-sm ${
                    !casualPlayStylePriority
                      ? "bg-white/20 text-white shadow-[0_0_10px_rgba(168,85,247,0.35)]"
                      : "text-gray-400"
                  }`}
                >
                  OFF
                </button>
              </div>
            </div>
          </div>

          <div className="mt-2.5 space-y-1 border-t border-purple-400/20 pt-2.5 text-left text-[11px] leading-snug text-gray-300 sm:text-xs">
            <p>
              <span className="font-semibold text-white">階級別：</span>
              同階級優先でペアを作る
            </p>
            <p>
              <span className="font-semibold text-white">再戦回避：</span>
              ONなら未対戦の組が残る間は対戦済を選ばない（全員が対戦済になると再戦あり）
            </p>
            <p>
              <span className="font-semibold text-white">待機時間：</span>
              ペアのうち待ちが長い組を優先（待機開始が早い参加者がいる組ほど先に卓へ）
            </p>
            <p>
              <span className="font-semibold text-white">プレイスタイル優先：</span>
              互換用（保存されます）。大会前調整／エンジョイの強さは下の③〜⑥の並びで決まります
            </p>
          </div>

          <div className="mt-3 rounded-lg border border-purple-400/25 bg-black/20 p-3">
            <p className="text-xs font-bold text-white sm:text-sm">
              マッチング優先順位設定
            </p>
            <p className="mt-1 text-[11px] text-gray-300 sm:text-xs">
              ①再戦回避（固定・未対戦が残る間のみ）→ ②待機時間（固定・待ち長いペア優先）→ ③〜⑥下で並び替え → ⑦ランダム（固定）
            </p>

            <div className="mt-2 space-y-1.5 text-xs text-gray-200">
              {priorityDraft.map((axis, idx) => (
                <div
                  key={axis}
                  className="flex items-center justify-between rounded-md bg-black/30 px-2 py-1.5"
                >
                  <span className="font-semibold">
                    {idx + 3}. {MATCH_PRIORITY_LABEL[axis]}
                  </span>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => movePriorityItem(idx, -1)}
                      disabled={idx === 0}
                      className="rounded border border-purple-300/40 px-2 py-0.5 text-[11px] font-bold text-white disabled:opacity-35"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      onClick={() => movePriorityItem(idx, 1)}
                      disabled={idx === priorityDraft.length - 1}
                      className="rounded border border-purple-300/40 px-2 py-0.5 text-[11px] font-bold text-white disabled:opacity-35"
                    >
                      ↓
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-2 flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() =>
                  applyPreset(["tournament", "beginner", "enjoy", "rank"])
                }
                className="rounded-md border border-purple-300/40 px-2 py-1 text-[11px] font-semibold text-white"
              >
                通常交流会
              </button>
              <button
                type="button"
                onClick={() =>
                  applyPreset(["beginner", "tournament", "enjoy", "rank"])
                }
                className="rounded-md border border-purple-300/40 px-2 py-1 text-[11px] font-semibold text-white"
              >
                初心者多め
              </button>
              <button
                type="button"
                onClick={() =>
                  applyPreset(["tournament", "enjoy", "beginner", "rank"])
                }
                className="rounded-md border border-purple-300/40 px-2 py-1 text-[11px] font-semibold text-white"
              >
                調整会寄り
              </button>
            </div>

            <button
              type="button"
              onClick={() => void handleSavePriorityOrder()}
              disabled={!isPriorityDirty || savingPriorityOrder}
              className="mt-2 w-full rounded-md bg-purple-600 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-40"
            >
              {savingPriorityOrder ? "保存中..." : "優先順位を保存"}
            </button>
          </div>
          </>
          ) : null}
        </div>
      ) : null}

      {/* メイン操作（交流会モード時） */}
      {mode === "casual" && (
        <div className="mb-6 flex flex-col gap-3 sm:mb-8 sm:gap-4">
          <button
            type="button"
            onClick={onCasualMatch}
            className="min-h-[56px] w-full rounded-xl bg-gradient-to-r from-orange-500 to-pink-500 px-4 py-4 text-lg font-bold text-white shadow-[0_0_20px_rgba(255,120,0,0.6)] active:scale-[0.98] transition-transform"
          >
            交流会マッチ
            <span className="mt-0.5 block text-sm font-semibold text-white/90">
              （フリーマッチ）
            </span>
          </button>
          <button
            type="button"
            onClick={onForceWaiting}
            className="min-h-[56px] w-full rounded-xl bg-gradient-to-r from-yellow-400 to-orange-400 px-4 py-4 text-lg font-bold text-black shadow-[0_0_20px_rgba(255,200,0,0.6)] active:scale-[0.98] transition-transform"
          >
            全員を待機状態に戻す
            <span className="mt-0.5 block text-sm font-semibold text-black/80">
              （強制待機）
            </span>
          </button>
        </div>
      )}
      {mode === "notice" && casualExtraSlot ? (
        <div className="mb-6 sm:mb-8">{casualExtraSlot}</div>
      ) : null}

      {mode === "tournament" &&
        (tournamentSlot ?? (
          <div className={`mb-8 p-6 text-center text-sm text-gray-300 ${GLASS} border-dashed border-purple-400/40`}>
            大会用の操作はここに配置できます
          </div>
        ))}

      {/* 階級別参加者 */}
      {mode === "boards" ? (
      <section className="mb-6 sm:mb-8">
        <h2 className="mb-3 text-sm font-bold text-white sm:mb-4">
          卓一覧
        </h2>
        <div className="flex flex-col gap-4">
          {rankCards.map((card) => {
            const s = rankStyles[card.key];
            const open = expandedRank === card.key;
            return (
              <div
                key={card.key}
                role="button"
                tabIndex={0}
                onClick={() => setExpandedRank(open ? null : card.key)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setExpandedRank(open ? null : card.key);
                  }
                }}
                className={`w-full rounded-xl border-2 ${s.border} bg-white/10 p-5 text-left shadow-[0_0_20px_rgba(168,85,247,0.2)] backdrop-blur-md transition-shadow active:shadow-[0_0_28px_rgba(168,85,247,0.35)] outline-none focus-visible:ring-2 focus-visible:ring-purple-400`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className={`min-w-0 flex-1 text-base font-extrabold ${s.accent}`}>
                    {card.label}：{card.total}人
                  </p>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-sm">
                  <span className="rounded-lg bg-neutral-50 px-3 py-1.5 font-semibold text-neutral-700">
                    待機：{card.waiting}人
                  </span>
                  <span className="rounded-lg bg-amber-50 px-3 py-1.5 font-semibold text-amber-900">
                    休憩：{card.onBreak ?? 0}人
                  </span>
                  <span className="rounded-lg bg-neutral-50 px-3 py-1.5 font-semibold text-neutral-700">
                    対戦：{card.playing}人
                  </span>
                </div>
                <p className="mt-3 text-xs text-gray-400">
                  タップで参加者一覧を表示
                </p>
                {open && (
                  <ul className="mt-4 space-y-2 border-t border-purple-400/25 pt-4">
                    {(card.participants?.length ?? 0) > 0 ? (
                      card.participants!.map((entry, i) => {
                        const row =
                          typeof entry === "string"
                            ? { id: "", name: entry }
                            : entry;
                        const key =
                          row.id !== "" ? row.id : `${card.key}-p-${i}`;
                        return (
                          <li
                            key={key}
                            className="flex items-center justify-between gap-2 rounded-lg border border-purple-400/20 bg-white/5 px-3 py-2 text-sm font-medium text-gray-200"
                          >
                            <span className="min-w-0 flex-1 truncate">
                              <span className="block truncate">{row.name}</span>
                              {row.badgeSummary ? (
                                <span className="mt-0.5 block truncate text-xs font-normal text-gray-400">
                                  {row.badgeSummary}
                                </span>
                              ) : null}
                            </span>
                            <div className="flex shrink-0 flex-col items-end gap-1.5">
                              {canOpenParticipantEditMenu && row.id !== "" ? (
                                <button
                                  type="button"
                                  aria-haspopup="dialog"
                                  aria-expanded={
                                    participantEditMenu?.id === row.id
                                  }
                                  aria-label={`${row.name}の参加者編集メニューを開く`}
                                  className="rounded-lg border border-purple-400/40 bg-fuchsia-600/80 px-2.5 py-1 text-xs font-bold text-white shadow-[0_0_10px_rgba(192,38,211,0.4)] active:opacity-90"
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setParticipantEditMenu({
                                      id: row.id,
                                      name: row.name,
                                      tone: "purple",
                                    });
                                  }}
                                >
                                  編集
                                </button>
                              ) : null}
                            </div>
                          </li>
                        );
                      })
                    ) : (
                      <li className="text-sm text-gray-400">
                        参加者データを渡してください
                      </li>
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>
      ) : null}

      {/* 直近マッチ */}
      {mode === "boards" ? (
      <section className="mb-6 sm:mb-8">
        <h2 className="mb-3 text-sm font-bold text-white sm:mb-4">
          対戦卓
        </h2>
        <div className={`p-4 sm:p-5 ${GLASS}`}>
          <ul className="space-y-4">
            {recentMatches.slice(0, 3).map((m, i) => (
              <li
                key={`${m.tableNumber}-${i}`}
                className="flex flex-col gap-0.5 border-b border-purple-400/20 pb-4 last:border-0 last:pb-0"
              >
                <span className="text-xs font-bold text-gray-400">
                  卓{m.tableNumber}
                </span>
                <span className="text-base font-bold text-white">
                  {m.player1}{" "}
                  <span className="font-normal text-gray-400">vs</span>{" "}
                  {m.player2}
                </span>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onShowMoreMatches}
            className="mt-5 w-full rounded-xl py-3 text-sm font-bold text-fuchsia-300 underline-offset-2 hover:text-fuchsia-200 hover:underline"
          >
            もっと見る
          </button>
        </div>
      </section>
      ) : null}

      {/* Goodランキング（運営・交流会モードのみ） */}
      {mode === "casual" && contactMessages !== undefined ? (
        <section className="mb-6 sm:mb-8">
          <h2 className="mb-1 text-sm font-bold text-white sm:mb-2">
            運営への連絡
          </h2>
          <p className="mb-3 text-xs text-gray-400">
            参加者からの連絡メッセージです。未読/対応済みを切り替えできます。
          </p>
          <div className={`overflow-hidden ${GLASS}`}>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-purple-400/25 bg-white/5 text-gray-300">
                  <th className="px-4 py-3 font-bold">日時</th>
                  <th className="px-4 py-3 font-bold">参加者</th>
                  <th className="px-4 py-3 font-bold">内容</th>
                  <th className="px-4 py-3 text-right font-bold">状態</th>
                </tr>
              </thead>
              <tbody>
                {contactMessages.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                      連絡メッセージはまだありません
                    </td>
                  </tr>
                ) : (
                  contactMessages.map((row) => (
                    <tr
                      key={`contact-${row.id}`}
                      className="border-b border-purple-400/15 text-gray-200 last:border-0 align-top"
                    >
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-300">
                        {row.createdAtMs
                          ? new Date(row.createdAtMs).toLocaleString("ja-JP", {
                              month: "2-digit",
                              day: "2-digit",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{row.playerName || "（未設定）"}</div>
                        <div className="text-[11px] text-gray-400">{row.playerId}</div>
                      </td>
                      <td className="px-4 py-3 text-xs leading-relaxed text-gray-200">
                        {row.message}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            onToggleContactMessageStatus?.(
                              row.id,
                              row.status === "unread" ? "resolved" : "unread"
                            )
                          }
                          className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                            row.status === "unread"
                              ? "bg-rose-500/20 text-rose-200 border border-rose-300/40"
                              : "bg-emerald-500/20 text-emerald-200 border border-emerald-300/40"
                          }`}
                        >
                          {row.status === "unread" ? "未読" : "対応済み"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {mode === "casual" && goodRankingRows !== undefined ? (
        <>
          <section className="mb-6 sm:mb-8">
            <h2 className="mb-1 text-sm font-bold text-white sm:mb-2">
              Goodランキング
            </h2>
            <p className="mb-3 text-xs text-gray-400">
              ナイス対戦の受信数（大会ランキングとは別・運営のみ）。Good数をタップで送信者一覧。
            </p>
            <div className={`overflow-hidden ${GLASS}`}>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-purple-400/25 bg-white/5 text-gray-300">
                    <th className="px-4 py-3 font-bold">順位</th>
                    <th className="px-4 py-3 font-bold">名前</th>
                    <th className="px-4 py-3 text-right font-bold">Good数</th>
                  </tr>
                </thead>
                <tbody>
                  {goodRankingRows.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-6 text-center text-gray-400"
                      >
                        まだデータがありません
                      </td>
                    </tr>
                  ) : (
                    goodRankingDisplayRows.map((row) => (
                      <tr
                        key={`good-${row.playerId}-${row.rank}`}
                        className="border-b border-purple-400/15 text-gray-200 last:border-0"
                      >
                        <td className="px-4 py-2.5 tabular-nums">{row.rank}</td>
                        <td className="px-4 py-2.5 font-medium">{row.name}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          <button
                            type="button"
                            title="タップで送信者一覧"
                            className="min-w-[2.5rem] rounded-lg px-2 py-1 text-right font-semibold text-fuchsia-200 transition-colors hover:bg-white/10 hover:text-fuchsia-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-fuchsia-400"
                            onClick={() =>
                              setGoodDetailTarget({
                                playerId: row.playerId,
                                playerName: row.name,
                                goodCount: row.goodCount,
                              })
                            }
                          >
                            {row.goodCount}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {goodRankingHasMore ? (
              <div className="mt-3 flex flex-col gap-2">
                {!goodRankFullView ? (
                  <button
                    type="button"
                    onClick={() => setGoodRankFullView(true)}
                    className="w-full rounded-xl border border-purple-400/35 bg-white/5 py-2.5 text-sm font-bold text-fuchsia-300 hover:bg-white/10"
                  >
                    もっと見る
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setGoodRankFullView(false)}
                    className="w-full rounded-xl border border-purple-400/35 bg-white/5 py-2.5 text-sm font-bold text-gray-300 hover:bg-white/10"
                  >
                    閉じる
                  </button>
                )}
              </div>
            ) : null}
          </section>

          {goodDetailTarget ? (
            <div
              className="modal z-[60] flex items-end justify-center sm:items-center sm:p-4"
              role="dialog"
              aria-modal="true"
              aria-labelledby="good-detail-title"
            >
              <button
                type="button"
                aria-label="オーバーレイを閉じる"
                className="absolute inset-0 bg-black/55"
                onClick={() => setGoodDetailTarget(null)}
              />
              <div
                className="relative z-10 mx-auto flex max-h-[min(85vh,560px)] w-full max-w-[420px] flex-col rounded-t-2xl border border-purple-400/30 bg-slate-900/95 shadow-[0_0_40px_rgba(168,85,247,0.35)] backdrop-blur-xl sm:max-h-[80vh] sm:rounded-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-purple-400/25 px-4 py-3">
                  <p
                    id="good-detail-title"
                    className="text-base font-extrabold text-white"
                  >
                    Good送信ログ
                  </p>
                  <button
                    type="button"
                    onClick={() => setGoodDetailTarget(null)}
                    className="rounded-xl border border-purple-400/40 bg-white/10 px-3 py-2 text-sm font-bold text-white"
                  >
                    閉じる
                  </button>
                </div>
                <div className="px-4 pb-2 pt-2 text-sm text-gray-300">
                  <span className="font-semibold text-white">
                    {goodDetailTarget.playerName}
                  </span>
                  への送信（Good数: {goodDetailTarget.goodCount}）
                </div>
                <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-3 pb-6">
                  {(() => {
                    const logs =
                      goodLogsByPlayerId[goodDetailTarget.playerId] ?? [];
                    if (logs.length === 0 && goodDetailTarget.goodCount > 0) {
                      return (
                        <li className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-3 text-sm text-amber-100">
                          Goodの件数はありますが、送信者の履歴はまだありません。この機能追加以前に贈られたGoodは一覧表示できません。
                        </li>
                      );
                    }
                    if (logs.length === 0) {
                      return (
                        <li className="py-8 text-center text-sm text-gray-400">
                          まだGoodはありません
                        </li>
                      );
                    }
                    return (
                      <>
                        {logs.length < goodDetailTarget.goodCount ? (
                          <li className="mb-2 rounded-lg border border-purple-400/20 bg-white/5 px-3 py-2 text-xs text-gray-400">
                            表示は履歴の件数（{logs.length}
                            件）のみです。件数が合わない場合は、履歴保存前のGoodが含まれている可能性があります。
                          </li>
                        ) : null}
                        {logs.map((log) => (
                          <li
                            key={log.id}
                            className="rounded-xl border border-purple-400/20 bg-white/5 px-3 py-3 text-sm text-gray-200"
                          >
                            <div className="font-bold text-white">
                              {log.fromPlayerName || "（不明）"}
                            </div>
                            <div className="mt-1 text-xs text-gray-400">
                              {formatGoodLogTime(log.createdAtMs)}
                            </div>
                            <div className="mt-1 break-all font-mono text-[11px] text-gray-500">
                              試合: {log.matchId}
                              {log.tableNumber != null
                                ? ` · 卓${log.tableNumber}`
                                : ""}
                            </div>
                          </li>
                        ))}
                      </>
                    );
                  })()}
                </ul>
              </div>
            </div>
          ) : null}
        </>
      ) : null}

      {/* 運営メモ */}
      <section>
        <h2 className="mb-4 text-sm font-bold text-white">運営メモ</h2>
        <div className={`p-5 ${GLASS}`}>
          <ul className="space-y-3 text-sm leading-relaxed text-gray-300">
            <li className="flex gap-2">
              <span className="text-fuchsia-400">•</span>
              <span>
                参加者の特別属性（主催・運営・初参加・常連など）は表示・識別のみ。マッチングの優先や抽選には使いません
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-fuchsia-400">•</span>
              <span>交流会マッチは待機中2人以上で実行</span>
            </li>
            <li className="flex gap-2">
              <span className="text-fuchsia-400">•</span>
              <span>対戦終了後は各自で終了ボタン</span>
            </li>
            <li className="flex gap-2">
              <span className="text-fuchsia-400">•</span>
              <span>
                途中帰宅・退室した人は「削除」（主な用途）。「編集」で参加者編集メニューを開き、無効化・削除・特別属性の設定から選べます
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-fuchsia-400">•</span>
              <span>
                参加者編集メニュー：交流会の待機・休憩一覧（「待機中」人数をタップ）と、卓一覧モードで階級カードを開いたときの参加者一覧の「編集」からのみ開けます。
                いずれも個別選択（押した行の1人だけ）。メニュー内は「無効化」（マッチ対象から外す・データは残る）、「削除」（確認のあと
                参加者データの完全削除・取り消せない）、「特別属性の設定」（主催・運営・初参加・常連のいずれか1つまたはなし）。他の参加者のデータには、選んだ操作以外は手を付けません。削除済みの人は人数・一覧から消え、マッチ作成時も対象外になります。
              </span>
            </li>
            <li className="flex gap-2">
              <span className="text-fuchsia-400">•</span>
              <span>
                削除は誤操作防止のため、必ず確認ダイアログのあとにのみ実行されます
              </span>
            </li>
          </ul>
        </div>
      </section>

      {/* 交流会モード：待機中一覧（モバイル向けボトムシート） */}
      {waitingSheetOpen && mode === "casual" ? (
        <div
          className="modal z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="waiting-sheet-title"
        >
          <button
            type="button"
            aria-label="オーバーレイを閉じる"
            className="absolute inset-0 bg-black/45"
            onClick={() => setWaitingSheetOpen(false)}
          />
          <div
            className="relative z-10 flex max-h-[min(78vh,560px)] w-full max-w-[420px] flex-col rounded-t-3xl border border-purple-400/30 bg-slate-900/90 shadow-[0_0_40px_rgba(168,85,247,0.35)] backdrop-blur-xl sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-purple-400/50 sm:hidden" />
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-purple-400/25 px-4 py-3">
              <p
                id="waiting-sheet-title"
                className="text-base font-extrabold text-white"
              >
                待機中の参加者
              </p>
              <button
                type="button"
                onClick={() => setWaitingSheetOpen(false)}
                className="rounded-xl border border-purple-400/40 bg-white/10 px-3 py-2 text-sm font-bold text-white shadow-[0_0_12px_rgba(168,85,247,0.25)] backdrop-blur-sm"
              >
                閉じる
              </button>
            </div>
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain px-4 py-4 pb-6">
              {waitingParticipants.length === 0 ? (
                <li className="py-6 text-center text-sm font-medium text-gray-400">
                  待機中の参加者はいません
                </li>
              ) : (
                waitingParticipants.map((p) => (
                  <li
                    key={p.id}
                    className="flex items-start justify-between gap-2 rounded-xl border border-purple-400/25 bg-white/5 px-4 py-3 backdrop-blur-sm"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-bold text-white">
                        {p.name}
                      </p>
                      {p.badgeSummary ? (
                        <p className="mt-1 text-xs font-medium text-violet-200/90">
                          {p.badgeSummary}
                        </p>
                      ) : null}
                      <p className="mt-1 text-sm font-medium text-gray-300">
                        階級：{p.rank}
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      {canOpenParticipantEditMenu && p.id !== "" ? (
                        <button
                          type="button"
                          aria-haspopup="dialog"
                          aria-expanded={participantEditMenu?.id === p.id}
                          aria-label={`${p.name}の参加者編集メニューを開く`}
                          className="rounded-lg border border-purple-400/40 bg-fuchsia-600/80 px-2.5 py-1 text-xs font-bold text-white shadow-[0_0_10px_rgba(192,38,211,0.4)] active:opacity-90"
                          onClick={() =>
                            setParticipantEditMenu({
                              id: p.id,
                              name: p.name,
                              tone: "purple",
                            })
                          }
                        >
                          編集
                        </button>
                      ) : null}
                    </div>
                  </li>
                ))
              )}
              {breakParticipants.length > 0 ? (
                <>
                  <li className="pt-4 text-xs font-extrabold uppercase tracking-wide text-amber-200/90">
                    休憩中（マッチ対象外）
                  </li>
                  {breakParticipants.map((p) => (
                    <li
                      key={`break-${p.id}`}
                      className="flex items-start justify-between gap-2 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 backdrop-blur-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-base font-bold text-amber-50">
                          {p.name}
                          <span className="ml-2 text-sm font-bold text-amber-200">
                            休憩中
                          </span>
                        </p>
                        {p.badgeSummary ? (
                          <p className="mt-1 text-xs font-medium text-amber-100/80">
                            {p.badgeSummary}
                          </p>
                        ) : null}
                        <p className="mt-1 text-sm font-medium text-amber-100/90">
                          階級：{p.rank}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        {canOpenParticipantEditMenu && p.id !== "" ? (
                          <button
                            type="button"
                            aria-haspopup="dialog"
                            aria-expanded={participantEditMenu?.id === p.id}
                            aria-label={`${p.name}の参加者編集メニューを開く`}
                            className="rounded-lg border border-amber-400/50 bg-amber-700/80 px-2.5 py-1 text-xs font-bold text-amber-50 shadow-[0_0_10px_rgba(245,158,11,0.35)] active:opacity-90"
                            onClick={() =>
                              setParticipantEditMenu({
                                id: p.id,
                                name: p.name,
                                tone: "amber",
                              })
                            }
                          >
                            編集
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </>
              ) : null}
            </ul>
          </div>
        </div>
      ) : null}

      {participantEditMenu ? (
        <div
          className="modal z-[60] flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby={participantEditMenuTitleId}
        >
          <button
            type="button"
            aria-label="参加者編集メニューを閉じる"
            className="absolute inset-0 bg-black/55"
            onClick={() => setParticipantEditMenu(null)}
          />
          <div
            className={`relative z-10 w-full max-w-[380px] rounded-t-3xl px-4 pb-6 pt-3 backdrop-blur-xl sm:rounded-3xl sm:p-6 ${
              participantEditMenu.tone === "amber"
                ? "border border-amber-400/45 bg-amber-950/92 shadow-[0_0_36px_rgba(245,158,11,0.25)]"
                : "border border-purple-400/35 bg-slate-900/95 shadow-[0_0_36px_rgba(168,85,247,0.32)]"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mt-1 h-1 w-10 shrink-0 rounded-full bg-white/25 sm:hidden" />
            <p
              id={participantEditMenuTitleId}
              className="mt-3 text-center text-lg font-extrabold text-white sm:mt-0"
            >
              {participantEditMenu.name}
            </p>
            <p className="mt-1 text-center text-xs font-medium text-gray-400">
              参加者編集メニュー
            </p>
            <p className="mt-1.5 text-center text-[11px] font-medium leading-snug text-gray-500">
              無効化・削除・特別属性の設定
            </p>
            <div className="mt-5 flex flex-col gap-2.5">
              {onOpenBadgeSetting ? (
                <button
                  type="button"
                  className="rounded-xl border border-cyan-400/50 bg-cyan-500/25 px-4 py-3.5 text-left text-sm font-extrabold text-cyan-100 shadow-[0_0_18px_rgba(34,211,238,0.25)] active:opacity-90"
                  onClick={() => {
                    const id = participantEditMenu.id;
                    void (async () => {
                      await onOpenBadgeSetting(id);
                      setParticipantEditMenu(null);
                    })();
                  }}
                >
                  特別属性の設定
                  <span className="mt-1 block text-[11px] font-semibold leading-snug text-cyan-100/90">
                    主催・運営・初参加・常連・おにぎりから1つ（またはなし）
                  </span>
                </button>
              ) : null}
              {onDeactivateParticipant ? (
                <button
                  type="button"
                  className="rounded-xl border border-purple-400/45 bg-fuchsia-600/85 px-4 py-3.5 text-left text-sm font-extrabold text-white shadow-[0_0_18px_rgba(192,38,211,0.45)] active:opacity-90"
                  onClick={() => {
                    const id = participantEditMenu.id;
                    void (async () => {
                      try {
                        await onDeactivateParticipant(id);
                      } finally {
                        setParticipantEditMenu(null);
                      }
                    })();
                  }}
                >
                  無効化
                  <span className="mt-1 block text-[11px] font-semibold leading-snug text-fuchsia-100/90">
                    マッチ対象から外します（データは残ります）
                  </span>
                </button>
              ) : null}
              {onDeleteParticipant ? (
                <button
                  type="button"
                  className="rounded-xl border border-rose-400/55 bg-rose-600/85 px-4 py-3.5 text-left text-sm font-extrabold text-white shadow-[0_0_18px_rgba(244,63,94,0.4)] active:opacity-90"
                  onClick={() => {
                    const id = participantEditMenu.id;
                    void (async () => {
                      const deleted = await onDeleteParticipant(id);
                      if (deleted) setParticipantEditMenu(null);
                    })();
                  }}
                >
                  削除
                  <span className="mt-1 block text-[11px] font-semibold leading-snug text-rose-100/90">
                    確認のあと、参加者データを完全削除します
                  </span>
                </button>
              ) : null}
              <button
                type="button"
                className="mt-1 rounded-xl border border-white/15 bg-white/5 px-4 py-3 text-sm font-bold text-gray-200 active:opacity-90"
                onClick={() => setParticipantEditMenu(null)}
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default PokabuAdminUI;
