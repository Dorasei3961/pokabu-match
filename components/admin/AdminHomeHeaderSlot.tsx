"use client";

import type { PokabuAdminMode } from "@/components/PokabuAdminUI";

type Props = {
  adminMode: PokabuAdminMode;
  remainingSeconds: number | null;
  timerText: string;
  onResultsClick: () => void;
  onRankingClick: () => void;
};

/**
 * 運営ホーム上部：試合結果・ランキング・ラウンドタイマーは大会用モードのみ。
 * 交流会（casual）では何も表示しない。
 */
export function AdminHomeHeaderSlot({
  adminMode,
  remainingSeconds,
  timerText,
  onResultsClick,
  onRankingClick,
}: Props) {
  const showNavLinks = adminMode === "tournament";
  const showTimer = adminMode === "tournament";

  if (!showNavLinks && !showTimer) return null;

  return (
    <>
      {showNavLinks ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:justify-center">
          <button
            type="button"
            onClick={onResultsClick}
            className="rounded-xl border border-purple-400/35 bg-white/10 px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_16px_rgba(168,85,247,0.3)] backdrop-blur-md transition-colors hover:bg-white/15"
          >
            📊 試合結果一覧を見る
          </button>
          <button
            type="button"
            onClick={onRankingClick}
            className="rounded-xl border border-purple-400/35 bg-white/10 px-4 py-2.5 text-sm font-bold text-white shadow-[0_0_16px_rgba(168,85,247,0.3)] backdrop-blur-md transition-colors hover:bg-white/15"
          >
            🏆 ランキングを見る
          </button>
        </div>
      ) : null}
      {showTimer ? (
        <p
          className={`mt-4 text-center text-2xl font-bold tabular-nums ${
            remainingSeconds === null
              ? "text-gray-400"
              : remainingSeconds === 0
                ? "text-red-400 drop-shadow-[0_0_8px_rgba(248,113,113,0.7)]"
                : "text-sky-300 drop-shadow-[0_0_10px_rgba(125,211,252,0.5)]"
          }`}
        >
          ラウンドタイマー：{timerText}
        </p>
      ) : null}
    </>
  );
}
