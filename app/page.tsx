"use client";

import type { CSSProperties } from "react";
import Link from "next/link";

const pageRoot: CSSProperties = {
  minHeight: "100vh",
  boxSizing: "border-box",
  padding: "28px 18px 40px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "flex-start",
  background:
    "linear-gradient(165deg, #0a0e27 0%, #1e1b4b 32%, #312e81 58%, #1e3a8a 100%)",
};

const inner: CSSProperties = {
  width: "100%",
  maxWidth: 440,
  marginTop: 8,
};

const heroIcon: CSSProperties = {
  fontSize: 42,
  textAlign: "center",
  marginBottom: 10,
  lineHeight: 1,
};

const title: CSSProperties = {
  margin: 0,
  fontSize: 26,
  fontWeight: 900,
  textAlign: "center",
  color: "#f8fafc",
  letterSpacing: "0.02em",
  textShadow: "0 0 24px rgba(129,140,248,0.45)",
};

const subtitle: CSSProperties = {
  margin: "10px 0 0",
  fontSize: 14,
  lineHeight: 1.55,
  textAlign: "center",
  color: "rgba(226,232,240,0.88)",
};

const cardBase: CSSProperties = {
  display: "block",
  width: "100%",
  boxSizing: "border-box",
  marginTop: 14,
  padding: "16px 18px",
  borderRadius: 16,
  textDecoration: "none",
  border: "1px solid rgba(255,255,255,0.14)",
  boxShadow: "0 10px 28px rgba(2,6,23,0.35)",
  transition: "transform 0.15s ease, box-shadow 0.15s ease",
};

const cardTitle: CSSProperties = {
  fontSize: 17,
  fontWeight: 800,
  color: "#f8fafc",
  display: "flex",
  alignItems: "center",
  gap: 10,
};

const cardDesc: CSSProperties = {
  marginTop: 6,
  fontSize: 13,
  lineHeight: 1.45,
  color: "rgba(226,232,240,0.82)",
};

const infoBox: CSSProperties = {
  marginTop: 22,
  padding: "14px 16px",
  borderRadius: 14,
  background: "rgba(15,23,42,0.55)",
  border: "1px solid rgba(148,163,184,0.22)",
};

const infoTitle: CSSProperties = {
  fontSize: 13,
  fontWeight: 800,
  color: "rgba(191,219,254,0.95)",
  marginBottom: 6,
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const infoBody: CSSProperties = {
  margin: 0,
  fontSize: 12,
  lineHeight: 1.55,
  color: "rgba(226,232,240,0.85)",
};

export default function HomeLandingPage() {
  return (
    <div style={pageRoot}>
      <div style={inner}>
        <div style={heroIcon} aria-hidden>
          ⭐🙂
        </div>
        <h1 style={title}>ぽか部交流会</h1>
        <p style={subtitle}>みんなで楽しく対戦しよう！</p>

        <Link
          href="/join"
          prefetch={false}
          style={{
            ...cardBase,
            background: "linear-gradient(135deg, #2563eb, #4f46e5)",
          }}
        >
          <div style={cardTitle}>
            <span aria-hidden>➕</span>
            参加する
          </div>
          <div style={cardDesc}>新しく参加登録する</div>
        </Link>

        <Link
          href="/rejoin"
          prefetch={false}
          style={{
            ...cardBase,
            background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
          }}
        >
          <div style={cardTitle}>
            <span aria-hidden>↩️</span>
            参加者として再入場
          </div>
          <div style={cardDesc}>URLを消した人が復帰する</div>
        </Link>

        <Link
          href="/admin"
          prefetch={false}
          style={{
            ...cardBase,
            background: "linear-gradient(135deg, rgba(30,27,75,0.95), rgba(15,23,42,0.92))",
          }}
        >
          <div style={cardTitle}>
            <span aria-hidden>🛡️</span>
            運営画面
          </div>
          <div style={cardDesc}>運営専用の画面へ</div>
        </Link>

        <div style={infoBox}>
          <div style={infoTitle}>
            <span aria-hidden>ℹ️</span>
            はじめての方へ
          </div>
          <p style={infoBody}>
            「参加する」から登録すると、交流会の待機・マッチングの流れにそのまま入れます。公平な卓割りのため、登録後は案内に沿ってお待ちください。
          </p>
        </div>
      </div>
    </div>
  );
}
