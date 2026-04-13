"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { GoodHistoryListItem } from "@/lib/good";

export type PokabuAdminMode = "casual" | "tournament" | "reset";

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

export type PokabuAdminUIProps = {
  mode?: PokabuAdminMode;
  onModeChange?: (mode: PokabuAdminMode) => void;
  waitingCount?: number;
  playingCount?: number;
  /** 交流会モードで「待機中」カードタップ時に表示する一覧 */
  waitingParticipants?: WaitingParticipantRow[];
  rankCards?: RankCardData[];
  recentMatches?: RecentMatchRow[];
  onCasualMatch?: () => void;
  onForceWaiting?: () => void;
  onShowMoreMatches?: () => void;
  onDeactivateParticipant?: (id: string) => void | Promise<void>;
  headerSlot?: ReactNode;
  tournamentSlot?: ReactNode;
  resetSlot?: ReactNode;
  /** 交流会：階級別マッチ ON（true） / OFF（false） */
  casualRankPriority?: boolean;
  onCasualRankPriorityChange?: (value: boolean) => void;
  /** 交流会：再戦回避 ON（true） / OFF（false） */
  casualAvoidRematch?: boolean;
  onCasualAvoidRematchChange?: (value: boolean) => void;
  /** 運営のみ：Good（ナイス対戦）受信ランキング */
  goodRankingRows?: GoodRankingRow[];
  /** 運営のみ：受信者 playerId → 送信ログ（goodHistory 購読結果） */
  goodLogsByPlayerId?: Record<string, GoodHistoryListItem[]>;
  /** 大会用：待機中の代わりに「対戦中卓数」「対戦終了卓数」を表示する */
  tournamentGridCounts?: { playing: number; finished: number };
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

/** ネオンガラス風カード（運営画面共通） */
const GLASS =
  "rounded-xl border border-purple-400/30 bg-white/10 backdrop-blur-md shadow-[0_0_20px_rgba(168,85,247,0.3)]";

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

export function PokabuAdminUI({
  mode: controlledMode,
  onModeChange,
  waitingCount = 0,
  playingCount = 0,
  rankCards = defaultRankCards,
  recentMatches = defaultRecentMatches,
  onCasualMatch,
  onForceWaiting,
  onShowMoreMatches,
  onDeactivateParticipant,
  headerSlot,
  tournamentSlot,
  resetSlot,
  waitingParticipants = [],
  casualRankPriority = true,
  onCasualRankPriorityChange,
  casualAvoidRematch = true,
  onCasualAvoidRematchChange,
  goodRankingRows,
  goodLogsByPlayerId = {},
  tournamentGridCounts,
}: PokabuAdminUIProps) {
  const [internalMode, setInternalMode] =
    useState<PokabuAdminMode>("casual");
  const mode = controlledMode ?? internalMode;
  const setMode = (m: PokabuAdminMode) => {
    if (onModeChange) onModeChange(m);
    else setInternalMode(m);
  };

  const [expandedRank, setExpandedRank] = useState<RankKey | null>(null);
  const [waitingSheetOpen, setWaitingSheetOpen] = useState(false);
  const [goodRankFullView, setGoodRankFullView] = useState(false);
  const [goodDetailTarget, setGoodDetailTarget] = useState<{
    playerId: string;
    playerName: string;
    goodCount: number;
  } | null>(null);

  useEffect(() => {
    if (mode !== "casual") {
      setWaitingSheetOpen(false);
      setGoodRankFullView(false);
      setGoodDetailTarget(null);
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
    if (!waitingSheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setWaitingSheetOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [waitingSheetOpen]);

  useEffect(() => {
    if (!waitingSheetOpen || mode !== "casual") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [waitingSheetOpen, mode]);

  const tabBase =
    "flex-1 rounded-lg px-2 py-3 text-sm font-bold transition-colors min-h-[48px] flex items-center justify-center text-center leading-tight";
  const tabActive =
    "bg-white/15 text-white shadow-[0_0_14px_rgba(168,85,247,0.45)]";
  const tabInactive = "text-gray-400 hover:text-gray-200";

  const goodRankingDisplayRows = useMemo(() => {
    if (!goodRankingRows?.length) return goodRankingRows ?? [];
    return goodRankFullView ? goodRankingRows : goodRankingRows.slice(0, 3);
  }, [goodRankingRows, goodRankFullView]);

  const goodRankingHasMore = (goodRankingRows?.length ?? 0) > 3;

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
        {headerSlot ? (
          <div className="mt-4 text-left sm:mt-6">{headerSlot}</div>
        ) : null}
      </header>

      {/* モード切替 */}
      <div className="mb-5 rounded-xl border border-purple-500/25 bg-black/25 p-1.5 shadow-inner backdrop-blur-md sm:mb-6">
        <div className="flex gap-1">
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
            大会用
          </button>
          <button
            type="button"
            className={`${tabBase} ${mode === "reset" ? tabActive : tabInactive}`}
            onClick={() => setMode("reset")}
          >
            参加者リセット
          </button>
        </div>
      </div>

      {/* 人数表示 */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:mb-5 sm:gap-4">
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

      {/* マッチング設定（交流会のみ・1カードに集約） */}
      {mode === "casual" &&
      onCasualRankPriorityChange &&
      onCasualAvoidRematchChange ? (
        <div className={`mb-4 p-3 sm:mb-5 sm:p-4 ${GLASS}`}>
          <p className="mb-2.5 text-center text-sm font-extrabold text-white">
            マッチング設定
          </p>

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
          </div>

          <div className="mt-2.5 space-y-1 border-t border-purple-400/20 pt-2.5 text-left text-[11px] leading-snug text-gray-300 sm:text-xs">
            <p>
              <span className="font-semibold text-white">階級別：</span>
              同階級優先でペアを作る
            </p>
            <p>
              <span className="font-semibold text-white">再戦回避：</span>
              できるだけ未対戦相手を優先
            </p>
          </div>
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

      {mode === "tournament" &&
        (tournamentSlot ?? (
          <div className={`mb-8 p-6 text-center text-sm text-gray-300 ${GLASS} border-dashed border-purple-400/40`}>
            大会用の操作はここに配置できます
          </div>
        ))}

      {mode === "reset" &&
        (resetSlot ?? (
          <div className={`mb-8 p-6 text-center ${GLASS}`}>
            <p className="text-sm font-medium text-gray-300">
              参加者リセット・無効化は運営メモを参照し、既存のボタンから実行してください。
            </p>
          </div>
        ))}

      {/* 階級別参加者 */}
      <section className="mb-6 sm:mb-8">
        <h2 className="mb-3 text-sm font-bold text-white sm:mb-4">
          階級別参加者
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
                <div className="mt-3 flex gap-3 text-sm">
                  <span className="rounded-lg bg-neutral-50 px-3 py-1.5 font-semibold text-neutral-700">
                    待機：{card.waiting}人
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
                            {onDeactivateParticipant && row.id !== "" ? (
                              <button
                                type="button"
                                className="shrink-0 rounded-lg border border-purple-400/40 bg-fuchsia-600/80 px-2.5 py-1 text-xs font-bold text-white shadow-[0_0_10px_rgba(192,38,211,0.4)] active:opacity-90"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  void onDeactivateParticipant(row.id);
                                }}
                              >
                                無効化
                              </button>
                            ) : null}
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

      {/* 直近マッチ */}
      <section className="mb-6 sm:mb-8">
        <h2 className="mb-3 text-sm font-bold text-white sm:mb-4">
          直近マッチ
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

      {/* Goodランキング（運営・交流会モードのみ） */}
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
              className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4"
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
              <span>交流会マッチは待機中2人以上で実行</span>
            </li>
            <li className="flex gap-2">
              <span className="text-fuchsia-400">•</span>
              <span>対戦終了後は各自で終了ボタン</span>
            </li>
            <li className="flex gap-2">
              <span className="text-fuchsia-400">•</span>
              <span>途中退室者は参加者削除</span>
            </li>
          </ul>
        </div>
      </section>

      {/* 交流会モード：待機中一覧（モバイル向けボトムシート） */}
      {waitingSheetOpen && mode === "casual" ? (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
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
                <li className="py-10 text-center text-sm font-medium text-gray-400">
                  待機中の参加者はいません
                </li>
              ) : (
                waitingParticipants.map((p) => (
                  <li
                    key={p.id}
                    className="rounded-xl border border-purple-400/25 bg-white/5 px-4 py-3 backdrop-blur-sm"
                  >
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
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default PokabuAdminUI;
