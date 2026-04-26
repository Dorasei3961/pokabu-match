"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "./page.module.css";

export default function BattlePage() {
  const router = useRouter();
  const [showMoreOps, setShowMoreOps] = useState(false);

  const profile = {
    title: "エンジョイバトル",
    tags: ["🔰 初心者", "⚔️ 環境デッキ", "📱 SNS交換OK"],
    rank: "モンスターボール級",
    deck: "未設定",
  };

  return (
    <main className={styles.page}>
      <section className={styles.container}>
        <header className={styles.header}>
          <button
            type="button"
            onClick={() => router.back()}
            className={styles.backButton}
            aria-label="戻る"
          >
            ←
          </button>
          <h1 className={styles.headerTitle}>対戦中</h1>
          <div className={styles.headerSpacer} aria-hidden="true" />
        </header>

        <article className={styles.card}>
          <p className={styles.cardTitle}>⭐ {profile.title}</p>
          <p className={styles.tags}>{profile.tags.join("・")}</p>
          <p className={styles.rank}>階級：{profile.rank}</p>
          <p className={styles.deck}>使用デッキ：{profile.deck}</p>
        </article>

        <article className={styles.statusCard}>
          <div className={styles.statusIcon}>⚔️</div>
          <p className={styles.statusTitle}>対戦中！</p>
          <p className={styles.statusNote}>
            対戦が終了したら「対戦終了」を押してください
          </p>
        </article>

        <button type="button" className={styles.finishButton}>
          対戦終了
        </button>

        <button type="button" className={styles.sheetButton}>
          <span className={styles.sheetButtonTitle}>✍️ 対戦シートを書く</span>
          <span className={styles.sheetButtonSub}>（任意）対戦後に記録できます</span>
        </button>

        <section className={styles.moreOpsWrap}>
          <button
            type="button"
            className={styles.moreOpsToggle}
            onClick={() => setShowMoreOps((v) => !v)}
            aria-expanded={showMoreOps}
          >
            <span>・・・ その他の操作</span>
            <span>{showMoreOps ? "▴" : "▾"}</span>
          </button>
          {showMoreOps ? (
            <div className={styles.moreOpsBody}>
              <button type="button" className={styles.subActionButton}>
                休憩する
              </button>
              <button type="button" className={styles.subActionButton}>
                Goodを送る
              </button>
            </div>
          ) : null}
        </section>

        <article className={styles.tipCard}>
          <p className={styles.tipTitle}>💡 待機のコツ</p>
          <p className={styles.tipBody}>
            通信環境の良い場所での待機がマッチング成功率UPにつながります！
          </p>
        </article>
      </section>
    </main>
  );
}
