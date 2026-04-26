"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type CSSProperties } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { ANNOUNCEMENTS_COLLECTION } from "@/lib/announcements";
import { ANNOUNCEMENT_READS_COLLECTION } from "@/lib/announcementReads";

const NAV_Z = 60;

function IconHome({ active }: { active: boolean }) {
  const c = active ? "#ffffff" : "rgba(200,190,255,0.85)";
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 10.5L12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-9.5Z"
        stroke={c}
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconScore({ active }: { active: boolean }) {
  const c = active ? "#ffffff" : "rgba(200,190,255,0.85)";
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x={4} y={4} width={16} height={18} rx={2} stroke={c} strokeWidth={1.75} />
      <path d="M8 9h8M8 13h5M8 17h6" stroke={c} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}

function IconBoard({ active }: { active: boolean }) {
  const c = active ? "#ffffff" : "rgba(200,190,255,0.85)";
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x={3} y={5} width={7} height={14} rx={1.25} stroke={c} strokeWidth={1.75} />
      <rect x={14} y={5} width={7} height={14} rx={1.25} stroke={c} strokeWidth={1.75} />
    </svg>
  );
}

function IconNotice({ active }: { active: boolean }) {
  const c = active ? "#ffffff" : "rgba(200,190,255,0.85)";
  return (
    <svg width={22} height={22} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Z"
        fill={c}
      />
      <path
        d="M18 16V11a6 6 0 1 0-12 0v5l-2 2v1h16v-1l-2-2Z"
        stroke={c}
        strokeWidth={1.75}
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function AppFooterNav() {
  const pathname = usePathname() || "";
  const hideFooterNav =
    pathname === "/join" || pathname === "/" || pathname === "/rejoin";
  const isNotice = pathname.startsWith("/notice");
  const [homeHref, setHomeHref] = useState("/join");
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [newestAnnouncementMs, setNewestAnnouncementMs] = useState<
    number | null
  >(null);
  const [lastReadAtMs, setLastReadAtMs] = useState<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sync = () => {
      const id = window.localStorage.getItem("playerId");
      setHomeHref(id ? `/player/${id}` : "/join");
      setPlayerId(id);
    };
    sync();
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [pathname]);

  useEffect(() => {
    const q = query(
      collection(db, ANNOUNCEMENTS_COLLECTION),
      orderBy("createdAt", "desc"),
      limit(1)
    );
    return onSnapshot(
      q,
      (snap) => {
        const d = snap.docs[0];
        if (!d) {
          setNewestAnnouncementMs(null);
          return;
        }
        const data = d.data();
        const created = data.createdAt as { toMillis?: () => number } | undefined;
        setNewestAnnouncementMs(
          typeof created?.toMillis === "function" ? created.toMillis() : null
        );
      },
      () => setNewestAnnouncementMs(null)
    );
  }, []);

  useEffect(() => {
    if (!playerId) {
      setLastReadAtMs(null);
      return;
    }
    const ref = doc(db, ANNOUNCEMENT_READS_COLLECTION, playerId);
    return onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) {
          setLastReadAtMs(null);
          return;
        }
        const data = snap.data();
        const t = data.lastReadAt as { toMillis?: () => number } | undefined;
        setLastReadAtMs(typeof t?.toMillis === "function" ? t.toMillis() : null);
      },
      () => setLastReadAtMs(null)
    );
  }, [playerId]);

  const hasUnreadNotice =
    Boolean(playerId) &&
    newestAnnouncementMs != null &&
    (lastReadAtMs == null || newestAnnouncementMs > lastReadAtMs);
  const showNoticeNewBadge = hasUnreadNotice && !isNotice;

  if (hideFooterNav) {
    return null;
  }

  const isHome = pathname.startsWith("/player/");
  const isScore = pathname.startsWith("/match-sheet");
  const isBoard = pathname === "/board" || pathname.startsWith("/board");

  const tabBase: CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 4,
    padding: "8px 4px",
    minHeight: 56,
    textDecoration: "none",
    WebkitTapHighlightColor: "transparent",
    borderRadius: 12,
    margin: "6px 4px",
    boxSizing: "border-box",
  };

  const inactiveLabel: CSSProperties = {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.02em",
    color: "rgba(200,190,255,0.88)",
    lineHeight: 1.2,
    textAlign: "center",
  };

  const activeLabel: CSSProperties = {
    ...inactiveLabel,
    color: "#ffffff",
  };

  return (
    <nav
      aria-label="メインナビゲーション"
      style={{
        position: "fixed",
        left: 0,
        right: 0,
        bottom: 0,
        width: "100%",
        zIndex: NAV_Z,
        background: "rgba(15,23,42,0.78)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        borderTop: "1px solid rgba(120,100,255,0.28)",
        boxShadow: "0 -8px 28px rgba(2,6,23,0.45)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "stretch",
          justifyContent: "space-between",
          maxWidth: 640,
          margin: "0 auto",
        }}
      >
        <Link
          href={homeHref}
          prefetch={false}
          style={{
            ...tabBase,
            ...(isHome
              ? {
                  background: "linear-gradient(135deg, #8b5cf6, #3b82f6)",
                  boxShadow: "0 0 20px rgba(167,139,250,0.35)",
                }
              : { background: "transparent" }),
          }}
        >
          <IconHome active={isHome} />
          <span style={isHome ? activeLabel : inactiveLabel}>ホーム</span>
        </Link>
        <Link
          href="/match-sheets"
          prefetch={false}
          style={{
            ...tabBase,
            ...(isScore
              ? {
                  background: "linear-gradient(135deg, #8b5cf6, #3b82f6)",
                  boxShadow: "0 0 20px rgba(167,139,250,0.35)",
                }
              : { background: "transparent" }),
          }}
        >
          <IconScore active={isScore} />
          <span style={isScore ? activeLabel : inactiveLabel}>スコアシート</span>
        </Link>
        <Link
          href="/board"
          prefetch={false}
          style={{
            ...tabBase,
            ...(isBoard
              ? {
                  background: "linear-gradient(135deg, #8b5cf6, #3b82f6)",
                  boxShadow: "0 0 20px rgba(167,139,250,0.35)",
                }
              : { background: "transparent" }),
          }}
        >
          <IconBoard active={isBoard} />
          <span style={isBoard ? activeLabel : inactiveLabel}>対戦卓</span>
        </Link>
        <Link
          href="/notice"
          prefetch={false}
          style={{
            ...tabBase,
            ...(isNotice
              ? {
                  background: "linear-gradient(135deg, #8b5cf6, #3b82f6)",
                  boxShadow: "0 0 20px rgba(167,139,250,0.35)",
                }
              : { background: "transparent" }),
          }}
          aria-label={
            showNoticeNewBadge ? "お知らせ（未読あり）" : "お知らせ"
          }
        >
          <span
            style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <IconNotice active={isNotice} />
            {showNoticeNewBadge ? (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: -4,
                  right: -10,
                  minWidth: 22,
                  padding: "1px 4px",
                  borderRadius: 4,
                  background: "linear-gradient(135deg, #f43f5e, #dc2626)",
                  color: "#fff",
                  fontSize: 8,
                  fontWeight: 900,
                  letterSpacing: "0.04em",
                  lineHeight: 1.2,
                  textAlign: "center",
                  boxShadow: "0 0 10px rgba(248,113,113,0.55)",
                  border: "1px solid rgba(255,255,255,0.35)",
                  pointerEvents: "none",
                }}
              >
                NEW
              </span>
            ) : null}
          </span>
          <span style={isNotice ? activeLabel : inactiveLabel}>お知らせ</span>
        </Link>
      </div>
    </nav>
  );
}
