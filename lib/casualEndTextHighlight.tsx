import { Fragment } from "react";
import type { ReactNode } from "react";

/** 終了ページ・告知文の強調色プリセット（運営UIと共有） */
export const CASUAL_END_HIGHLIGHT_PRESET_COLORS = [
  "#22d3ee",
  "#f472b6",
  "#facc15",
  "#4ade80",
  "#f8fafc",
  "#f87171",
] as const;

const PRESET_SET = new Set<string>(CASUAL_END_HIGHLIGHT_PRESET_COLORS);

const MAX_HIGHLIGHT_WORD_LEN = 200;

function expandShortHex(s: string): string | null {
  if (/^#[0-9A-Fa-f]{3}$/.test(s)) {
    const r = s[1];
    const g = s[2];
    const b = s[3];
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return null;
}

/**
 * 表示・保存に使う強調色。許可: 6桁 #RRGGBB・3桁 #RGB・プリセット一覧。
 * 不正なら null（強調は適用しない）。
 */
export function sanitizeCasualHighlightColor(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.trim();
  if (!s) return null;
  if (PRESET_SET.has(s)) return s;
  if (/^#[0-9A-Fa-f]{6}$/.test(s)) return s.toLowerCase();
  const expanded = expandShortHex(s);
  if (expanded && /^#[0-9a-f]{6}$/.test(expanded)) return expanded;
  return null;
}

/** カラーピッカー用（未設定・不正時のフォールバック） */
export function casualEndHighlightColorForPicker(
  input: string | undefined
): string {
  return sanitizeCasualHighlightColor(input) ?? "#22d3ee";
}

/**
 * プレーンテキスト内の先頭1箇所だけを強調色で包む（HTMLは使わない）。
 */
export function casualTextWithHighlight(
  text: string,
  highlightWord: string | undefined | null,
  highlightColor: string | undefined | null
): ReactNode {
  const needleRaw = typeof highlightWord === "string" ? highlightWord : "";
  const needle = needleRaw.trim().slice(0, MAX_HIGHLIGHT_WORD_LEN);
  const color = sanitizeCasualHighlightColor(highlightColor);
  if (!needle || !color) return text;
  const idx = text.indexOf(needle);
  if (idx < 0) return text;
  return (
    <Fragment>
      {text.slice(0, idx)}
      <span style={{ color }}>{needle}</span>
      {text.slice(idx + needle.length)}
    </Fragment>
  );
}
