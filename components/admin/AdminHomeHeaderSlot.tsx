"use client";

import type { PokabuAdminMode } from "@/components/PokabuAdminUI";

type Props = {
  adminMode: PokabuAdminMode;
  onResultsClick: () => void;
  onRankingClick: () => void;
};

/**
 * 運営ホーム上部：試合結果・ランキング・ラウンドタイマーは大会用モードのみ。
 * 交流会（casual）では何も表示しない。
 */
export function AdminHomeHeaderSlot({
  adminMode,
  onResultsClick,
  onRankingClick,
}: Props) {
  const showNavLinks = adminMode === "tournament";
  if (!showNavLinks) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={onResultsClick}
        className="min-h-[42px] rounded-xl border border-purple-400/35 bg-white/10 px-3 py-2 text-sm font-bold text-white shadow-[0_0_14px_rgba(168,85,247,0.3)] backdrop-blur-md transition-colors hover:bg-white/15"
      >
        試合結果
      </button>
      <button
        type="button"
        onClick={onRankingClick}
        className="min-h-[42px] rounded-xl border border-purple-400/35 bg-white/10 px-3 py-2 text-sm font-bold text-white shadow-[0_0_14px_rgba(168,85,247,0.3)] backdrop-blur-md transition-colors hover:bg-white/15"
      >
        ランキング
      </button>
    </div>
  );
}
