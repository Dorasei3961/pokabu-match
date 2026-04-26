"use client";

import { useId } from "react";
import type { BadgeId } from "@/lib/playerBadges";
import { BADGE_META, CASUAL_IDENTITY_BADGE_IDS } from "@/lib/playerBadges";

/** 交流会：特別属性の設定（主催・運営・初参加・常連を1つまたはなし） */
export function CasualBadgeSelect(props: {
  value: BadgeId | null;
  onPick: (next: BadgeId | null) => void;
}) {
  const { value, onPick } = props;
  const selectId = useId();
  return (
    <div className="flex flex-col gap-2">
      <label
        htmlFor={selectId}
        className="text-[11px] font-semibold text-gray-400"
      >
        特別属性（1つ）
      </label>
      <div className="relative">
        <select
          id={selectId}
          value={value ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            onPick(raw === "" ? null : (raw as BadgeId));
          }}
          className="w-full cursor-pointer appearance-none rounded-xl border border-purple-400/40 bg-black/55 py-3.5 pl-4 pr-11 text-[15px] font-bold text-gray-100 shadow-inner transition [-webkit-tap-highlight-color:transparent] hover:border-purple-400/55 focus:border-purple-400/75 focus:outline-none focus:ring-2 focus:ring-purple-500/45"
        >
          <option value="">なし</option>
          {CASUAL_IDENTITY_BADGE_IDS.map((id) => {
            const m = BADGE_META[id];
            return (
              <option key={id} value={id}>
                {m.emoji}
                {m.label ? ` ${m.label}` : ""}
              </option>
            );
          })}
        </select>
        <span
          className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-sm text-purple-300/90"
          aria-hidden
        >
          ▼
        </span>
      </div>
    </div>
  );
}
