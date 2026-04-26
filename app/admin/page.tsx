"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { db, storage } from "@/lib/firebase";
import { startCasualMatches } from "@/lib/matches";
import {
  pairIndividualRound1,
  pairIndividualRoundN,
  type PairablePlayer,
  type RawPair,
} from "@/lib/tournamentIndividualPairing";
import {
  loadCasualPairingSettings,
  saveCasualPairingSettings,
  type MatchPriorityAxis,
} from "@/lib/casualMatchSettings";
import {
  CASUAL_END_HIGHLIGHT_PRESET_COLORS,
  casualEndHighlightColorForPicker,
  sanitizeCasualHighlightColor,
} from "@/lib/casualEndTextHighlight";
import {
  addTournamentIndividualBoardMatches,
  DEFAULT_EVENT_ID,
  finishAllPlayingTournamentIndividualBoardMatches,
  finishTournamentIndividualBoardMatch,
} from "@/lib/tournamentBoardMatches";
import {
  deleteAllPlayers,
  deletePlayer,
  resetAllPlayersToWaiting,
  setPlayerInactive,
} from "@/lib/participants";
import {
  createAnnouncement,
  deleteAllAnnouncements,
  type AnnouncementType,
} from "@/lib/announcements";
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  limit,
  increment,
  arrayUnion,
  getDoc,
  getDocs,
  where,
} from "firebase/firestore";
import { getDownloadURL, ref, uploadBytesResumable } from "firebase/storage";
import imageCompression from "browser-image-compression";
import {
  PokabuAdminUI,
  type ContactMessageRow,
  type PokabuAdminMode,
  type RankCardData,
  type RecentMatchRow,
  type WaitingParticipantRow,
} from "@/components/PokabuAdminUI";
import { AdminHomeHeaderSlot } from "@/components/admin/AdminHomeHeaderSlot";
import { CasualBadgeSelect } from "@/components/CasualBadgeSelect";
import type { GoodHistoryListItem } from "@/lib/good";
import type {
  BadgeId,
  PlayStyleKey,
  PlayerAttributeBadgeId,
} from "@/lib/playerBadges";
import {
  badgeIdToFirestore,
  badgesEmojiCompact,
  type SpecialBadgeId,
  mergeBadgesForDisplay,
  normalizePlayerAttributeBadges,
  normalizePlayStyle,
  normalizeSpecialBadgeId,
  normalizePlayerBadges,
  participantSummaryLine,
  playStyleLine,
} from "@/lib/playerBadges";
import { POKABU_ADMIN_GLASS } from "@/lib/pokabuAdminUiTokens";
import { QRCodeCanvas } from "qrcode.react";

type Player = {
  id: string;
  name: string;
  history: string;
  rank: string;
  team?: "A" | "B"
  deck?: string;
  wins?: number;
  loss?: number;
  draw?: number;
  /** 大会個人戦：過去の対戦相手 id */
  opponents?: string[];
  /** ナイス対戦の累計受信数 */
  goodCount?: number;
  status?: "waiting" | "playing" | "break" | "inactive";
  tags: {
    experience: "none" | "participated" | "winner";
    playStyle: PlayStyleKey;
  };
  playStyle: PlayStyleKey;
  /** Firestore `players.playerAttributes`（主に表示用・マッチは matches 既存仕様の beginner のみ） */
  playerAttributes: PlayerAttributeBadgeId[];
  /** Firestore `players.badge` を正規化した特別属性（完全に表示専用） */
  specialBadge: SpecialBadgeId | null;
};

type MatchTable = {
  tableNumber: number;
  player1?: Player;
  player2?: Player;
  player1Team?: "A" | "B";
  player2Team?: "A" | "B";
  type: "same-rank" | "cross-rank" | "random" | "team-random" | "individual";
  started?: boolean;
  pendingWinnerId?: string | null;
  winnerId?: string | null;

  reportedById?: string | null;
  reportedOpponentDeck?: string | null;
  reportedWinnerSide?: number | null;
  reportedLoserSide?: number | null;
  reportedWinnerDeck?: string | null;
};

type SavedMatchTable = {
  tableNumber: number;
  type: "same-rank" | "cross-rank" | "random" | "team-random" | "individual";
  player1Team?: "A" | "B";
  player2Team?: "A" | "B";
  started?: boolean;
  pendingWinnerId?: string | null;
  winnerId?: string | null;

  reportedById?: string | null;
  reportedOpponentDeck?: string | null;
  reportedWinnerSide?: number | null;
  reportedLoserSide?: number | null;
  reportedWinnerDeck?: string | null;

  player1:
  | {
      id: string;
      name: string;
      rank: string;
      deck?: string;
      tags?: {
        experience: "none" | "participated" | "winner";
        playStyle: PlayStyleKey;
      };
      playStyle?: PlayStyleKey;
      /** 新形式 */
      playerAttributes?: BadgeId[];
      /** 大会卓スナップショットの旧キー互換 */
      badges?: BadgeId[];
    }
  | null;

player2:
  | {
      id: string;
      name: string;
      rank: string;
      deck?: string;
      tags?: {
        experience: "none" | "participated" | "winner";
        playStyle: PlayStyleKey;
      };
      playStyle?: PlayStyleKey;
      playerAttributes?: BadgeId[];
      badges?: BadgeId[];
    }
  | null;
};

type SavedMatch = {
  id: string;
  matchType:
    | "rank-priority"
    | "full-random"
    | "team-random"
    | "individual-swiss";
  /** 大会個人戦のラウンド番号 */
  individualRound?: number | null;
  roundMinutes?: number | null;
  roundStartedAt?: number | null;
  roundEndAt?: number | null;
  tables: SavedMatchTable[];
};

const EVENT_ID = DEFAULT_EVENT_ID;
const tournamentMatchesCollection = () =>
  collection(db, "events", EVENT_ID, "matches");
const tournamentMatchDocRef = (matchId: string) =>
  doc(db, "events", EVENT_ID, "matches", matchId);
const CASUAL_RANK_PRIORITY_KEY = "pokabu-casual-rank-priority";
const CASUAL_AVOID_REMATCH_KEY = "pokabu-casual-avoid-rematch";
const CASUAL_PLAYSTYLE_PRIORITY_KEY = "pokabu-casual-playstyle-priority";
const DEFAULT_MATCH_PRIORITY_ORDER: MatchPriorityAxis[] = [
  "tournament",
  "beginner",
  "enjoy",
  "rank",
];

/** 告知タブ・終了ページ設定で「ミニクイズ本文」入力欄を表示（false では非表示・保存・読込は従来どおり） */
const NOTICE_END_PAGE_SHOW_MINI_QUIZ_TEXT_FIELD = false;

function CasualEndHighlightFields({
  word,
  color,
  onWordChange,
  onColorChange,
}: {
  word: string;
  color: string;
  onWordChange: (v: string) => void;
  onColorChange: (v: string) => void;
}) {
  const picker = casualEndHighlightColorForPicker(color);
  return (
    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
      <label className="text-[11px] font-semibold text-gray-400">
        強調する文字（任意）
        <input
          type="text"
          value={word}
          onChange={(e) => onWordChange(e.target.value)}
          maxLength={200}
          placeholder="例: #ぽか部交流会"
          className="mt-1 w-full rounded-lg border border-purple-400/30 bg-slate-900/70 px-2 py-1.5 text-xs text-white outline-none"
        />
      </label>
      <div>
        <span className="text-[11px] font-semibold text-gray-400">強調色</span>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <input
            type="color"
            value={picker}
            onChange={(e) => onColorChange(e.target.value)}
            className="h-8 w-10 cursor-pointer rounded border border-purple-400/40 bg-transparent"
            aria-label="強調色を選ぶ"
          />
          <div className="flex flex-wrap gap-1">
            {CASUAL_END_HIGHLIGHT_PRESET_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                title={c}
                onClick={() => onColorChange(c)}
                className="h-6 w-6 rounded-full border border-white/30 shadow-sm"
                style={{ background: c }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const router = useRouter();
  const [casualRankPriority, setCasualRankPriority] = useState(true);
  const [casualAvoidRematch, setCasualAvoidRematch] = useState(true);
  const [casualPlayStylePriority, setCasualPlayStylePriority] = useState(false);
  const [casualMatchPriorityOrder, setCasualMatchPriorityOrder] = useState<
    MatchPriorityAxis[]
  >([...DEFAULT_MATCH_PRIORITY_ORDER]);

  const [badgeEditor, setBadgeEditor] = useState<{
    id: string;
    name: string;
    draft: BadgeId | null;
  } | null>(null);
  const [badgeEditorBusy, setBadgeEditorBusy] = useState(false);
  const [badgeEditorLoading, setBadgeEditorLoading] = useState(false);

  const handleCasualMatch = async () => {
    try {
      setLatestMatch(null);
      const waitingParticipantsLength = players.filter(
        (p) => p.status === "waiting"       
      ).length;
      const waitingParticipantsForUi = players
        .filter((p) => p.status === "waiting" )
        .map((p) => ({
          id: p.id,
          status: p.status,
          currentMatchId: (p as any).currentMatchId ?? null,
        }));
      console.log(
        "[handleCasualMatch] waitingParticipants(ui):",
        waitingParticipantsForUi
      );
      console.log(
        "[handleCasualMatch] waitingParticipants.length:",
        waitingParticipantsLength
      );
  
      const created = await startCasualMatches("default", {
        rankPriority: casualRankPriority,
        avoidRematch: casualAvoidRematch,
        playStylePriority: casualPlayStylePriority,
        matchPriorityOrder: casualMatchPriorityOrder,
      });
  
      alert(`交流会マッチを開始しました（${created.length}試合作成）`);
    } catch (error) {
      console.error(error);
      alert(
        error instanceof Error
          ? error.message
          : "交流会マッチの開始に失敗しました"
      );
    }
  };
  const handleResetPlayers = async () => {
    if (!confirm("全員を待機状態に戻しますか？")) return;
  
    try {
      const playingMatchesQuery = query(
        collection(db, "events", "default", "matches"),
        where("status", "==", "playing")
      );
      const playingMatchesSnap = await getDocs(playingMatchesQuery);
      await Promise.all(
        playingMatchesSnap.docs.map((docSnap) =>
          updateDoc(doc(db, "events", "default", "matches", docSnap.id), {
            status: "finished",
            updatedAt: serverTimestamp(),
          })
        )
      );

      await resetAllPlayersToWaiting();
      alert("全員を待機状態に戻しました");
    } catch (err) {
      console.error(err);
      alert("リセットに失敗しました");
    }
  };
  const handleGlobalReset = async () => {
    const ok = confirm(
      "全体リセットを実行します\n\n交流会・大会用の参加者データ、\n卓情報、ラウンド情報がすべて削除されます。\n\n本当に実行しますか？"
    );
    if (!ok) return;

    try {
      const allMatchesSnap = await getDocs(
        collection(db, "events", "default", "matches")
      );
      await Promise.all(
        allMatchesSnap.docs.map((docSnap) =>
          deleteDoc(doc(db, "events", "default", "matches", docSnap.id))
        )
      );

      const goodHistorySnap = await getDocs(
        collection(db, "events", "default", "goodHistory")
      );
      await Promise.all(
        goodHistorySnap.docs.map((docSnap) =>
          deleteDoc(doc(db, "events", "default", "goodHistory", docSnap.id))
        )
      );

      const casualMutualPairsSnap = await getDocs(
        collection(db, "events", "default", "casualMutualGoodPairs")
      );
      await Promise.all(
        casualMutualPairsSnap.docs.map((docSnap) =>
          deleteDoc(
            doc(db, "events", "default", "casualMutualGoodPairs", docSnap.id)
          )
        )
      );

      const matchResultsSnap = await getDocs(collection(db, "matchResults"));
      await Promise.all(
        matchResultsSnap.docs.map((docSnap) =>
          deleteDoc(doc(db, "matchResults", docSnap.id))
        )
      );

      await deleteDoc(doc(db, "events", "default", "config", "casualPairing"));

      await deleteAllPlayers();
      alert("全体リセットを実行しました");
    } catch (err) {
      console.error(err);
      alert("全体リセットに失敗しました");
    }
  };

  const handleCloseCasualEvent = async () => {
    if (
      !confirm(
        "交流会終了を実行しますか？\n参加者画面は終了ページ表示に切り替わります。"
      )
    ) {
      return;
    }
    try {
      await setDoc(
        doc(db, "events", "default", "config", "casualEventState"),
        {
          eventFinished: true,
          closed: true,
          closedAt: Date.now(),
          title: casualEndTitle,
          subtitle: casualEndSubtitle,
          staffMessage: casualEndStaffMessage,
          quizText: casualEndQuizText,
          quizImageUrl: casualEndQuizImageUrl,
          nextEventText: casualEndNextEventText,
          nextEventImageUrl: casualEndNextEventImageUrl,
          lineShopCardText: casualEndLineShopCardText,
          lineShopCardUrl: casualEndLineShopCardUrl,
          ctaButtonLabel: casualEndCtaButtonLabel,
          ctaButtonUrl: casualEndCtaButtonUrl,
          subtitleHighlightWord: casualEndSubtitleHighlightWord.trim(),
          subtitleHighlightColor:
            sanitizeCasualHighlightColor(casualEndSubtitleHighlightColor) ?? "",
          staffMessageHighlightWord: casualEndStaffMessageHighlightWord.trim(),
          staffMessageHighlightColor:
            sanitizeCasualHighlightColor(casualEndStaffMessageHighlightColor) ??
            "",
          nextEventTextHighlightWord: casualEndNextEventHighlightWord.trim(),
          nextEventTextHighlightColor:
            sanitizeCasualHighlightColor(casualEndNextEventHighlightColor) ?? "",
          lineShopCardTextHighlightWord: casualEndLineShopHighlightWord.trim(),
          lineShopCardTextHighlightColor:
            sanitizeCasualHighlightColor(casualEndLineShopHighlightColor) ?? "",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      alert("交流会を終了しました。参加者画面は終了表示に切り替わります。");
    } catch (error) {
      console.error(error);
      alert("交流会終了に失敗しました");
    }
  };

  const handleStartCasualEvent = async () => {
    if (
      !confirm(
        "交流会開始を実行しますか？\n参加者画面は通常表示に戻ります。"
      )
    ) {
      return;
    }
    try {
      await setDoc(
        doc(db, "events", "default", "config", "casualEventState"),
        {
          eventFinished: false,
          closed: false,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      alert("交流会を開始しました。参加者画面は通常表示に戻ります。");
    } catch (error) {
      console.error(error);
      alert("交流会開始に失敗しました");
    }
  };

  const debugParticipants: Array<{
    id: string;
    name: string;
    rank: string;
    playStyle: PlayStyleKey;
    playerAttributes: BadgeId[];
  }> = [
    { id: "debug-naetle", name: "ナエトル", rank: "モンスターボール級", playStyle: "serious", playerAttributes: ["beginner"] },
    { id: "debug-piplup", name: "ポッチャマ", rank: "モンスターボール級", playStyle: "enjoy", playerAttributes: [] },
    { id: "debug-chimchar", name: "ヒコザル", rank: "モンスターボール級", playStyle: "both", playerAttributes: ["advice_ok"] },
    { id: "debug-shinx", name: "コリンク", rank: "モンスターボール級", playStyle: "enjoy", playerAttributes: ["fast_play"] },
    { id: "debug-pidgeon", name: "ピジョン", rank: "スーパーボール級", playStyle: "serious", playerAttributes: ["new_deck"] },
    { id: "debug-starly", name: "ムックル", rank: "スーパーボール級", playStyle: "both", playerAttributes: [] },
    { id: "debug-zubat", name: "ズバット", rank: "スーパーボール級", playStyle: "enjoy", playerAttributes: ["beginner"] },
    { id: "debug-lucario", name: "ルカリオ", rank: "ハイパーボール級", playStyle: "serious", playerAttributes: ["fast_play"] },
    { id: "debug-gengar", name: "ゲンガー", rank: "ハイパーボール級", playStyle: "both", playerAttributes: ["advice_ok"] },
    { id: "debug-charizard", name: "リザードン", rank: "ハイパーボール級", playStyle: "enjoy", playerAttributes: ["new_deck"] },
  ];

  const handleCreateDebugParticipants = async () => {
    const ok = confirm(
      "デバッグ参加者を生成しますか？\n既存の同名デバッグ参加者は上書きされます。"
    );
    if (!ok) return;
    try {
      await Promise.all(
        debugParticipants.map((p) =>
          setDoc(
            doc(db, "players", p.id),
            {
              name: p.name,
              rank: p.rank,
              playStyle: p.playStyle,
              badge: null,
              playerAttributes: p.playerAttributes,
              status: "waiting",
              currentMatchId: null,
              wins: 0,
              loss: 0,
              draw: 0,
              goodCount: 0,
              deck: "",
              history: "",
              opponents: [],
              waitingSince: serverTimestamp(),
              tags: {
                experience:
                  p.rank === "モンスターボール級"
                    ? "none"
                    : p.rank === "スーパーボール級"
                      ? "participated"
                      : "winner",
                playStyle: p.playStyle,
              },
              isDebugUser: true,
              updatedAt: serverTimestamp(),
              createdAt: serverTimestamp(),
            },
            { merge: true }
          )
        )
      );
      alert(`デバッグ参加者を生成しました（${debugParticipants.length}名）`);
    } catch (error) {
      console.error(error);
      alert("デバッグ参加者の生成に失敗しました");
    }
  };

  const handleResetDebugMatchHistory = async () => {
    const ok = confirm(
      "デバッグ用に交流会の対戦履歴をリセットしますか？\n交流会マッチの履歴（matches）を削除します。"
    );
    if (!ok) return;
    try {
      const snap = await getDocs(collection(db, "events", "default", "matches"));
      const targets = snap.docs.filter((d) => {
        const mt = d.data().matchType;
        return mt == null || mt === "" || mt === "casual";
      });
      await Promise.all(
        targets.map((d) =>
          deleteDoc(doc(db, "events", "default", "matches", d.id))
        )
      );
      alert(`交流会の対戦履歴をリセットしました（${targets.length}件）`);
    } catch (error) {
      console.error(error);
      alert("デバッグ対戦履歴リセットに失敗しました");
    }
  };

  const handleDeleteDebugParticipants = async () => {
    const ok = confirm(
      "デバッグ参加者のみを全削除しますか？\n通常参加者は削除されません。"
    );
    if (!ok) return;
    try {
      const snap = await getDocs(collection(db, "players"));
      const targets = snap.docs.filter((d) => d.data().isDebugUser === true);
      await Promise.all(targets.map((d) => deleteDoc(doc(db, "players", d.id))));
      alert(`デバッグ参加者を削除しました（${targets.length}名）`);
    } catch (error) {
      console.error(error);
      alert("デバッグ参加者削除に失敗しました");
    }
  };

  const [players, setPlayers] = useState<Player[]>([]);
  const [latestMatch, setLatestMatch] = useState<SavedMatch | null>(null);
  const [saving, setSaving] = useState(false);
  const [teamResults, setTeamResults] = useState<any[]>([]);
  const [savingTableNumber, setSavingTableNumber] = useState<number | null>(null);
  const [startingRound, setStartingRound] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [roundMinutes, setRoundMinutes] = useState(30);
  const [notifiedMarks, setNotifiedMarks] = useState<string[]>([]);
  const [selectedTeam, setSelectedTeam] = useState<"A" | "B" | null>(null);
  const [adminMode, setAdminMode] = useState<PokabuAdminMode>("startEnd");
  const [casualEventFinished, setCasualEventFinished] = useState(false);
  const [showJoinUrlQr, setShowJoinUrlQr] = useState(false);
  const [joinUrlCopyStatus, setJoinUrlCopyStatus] = useState("");
  const [casualRecentMatches, setCasualRecentMatches] = useState<
    RecentMatchRow[]
  >([]);
  const [goodLogsByPlayerId, setGoodLogsByPlayerId] = useState<
    Record<string, GoodHistoryListItem[]>
  >({});
  const [contactMessages, setContactMessages] = useState<ContactMessageRow[]>([]);
  const [announcementTitle, setAnnouncementTitle] = useState("");
  const [announcementMessage, setAnnouncementMessage] = useState("");
  const [announcementType, setAnnouncementType] =
    useState<AnnouncementType>("normal");
  const [announcementPosting, setAnnouncementPosting] = useState(false);
  const [announcementResetDialogOpen, setAnnouncementResetDialogOpen] =
    useState(false);
  const [announcementResetDeleting, setAnnouncementResetDeleting] =
    useState(false);
  const [casualEndTitle, setCasualEndTitle] = useState(
    "ぽか部交流会 ご参加ありがとうございました！"
  );
  const [casualEndSubtitle, setCasualEndSubtitle] = useState(
    "またのご参加お待ちしております。"
  );
  const [casualEndStaffMessage, setCasualEndStaffMessage] = useState(
    "本日もご参加ありがとうございました！ぜひまた遊びに来てください！"
  );
  const [casualEndQuizText, setCasualEndQuizText] = useState(
    "次の交流会で使うデッキ候補は？"
  );
  const [casualEndQuizImageUrl, setCasualEndQuizImageUrl] = useState("");
  const [casualEndNextEventText, setCasualEndNextEventText] = useState(
    "次回開催予定：○月○日 詳細はXまたは案内をご確認ください。"
  );
  const [casualEndNextEventImageUrl, setCasualEndNextEventImageUrl] = useState("");
  const [casualEndLineShopCardText, setCasualEndLineShopCardText] = useState(
    "ご参加ありがとうございました。\n公式LINEのショップカードでスタンプを貯められます。\n下のQRコードをLINEで読み取ってください。"
  );
  const [casualEndLineShopCardUrl, setCasualEndLineShopCardUrl] =
    useState("");
  const [casualEndCtaButtonLabel, setCasualEndCtaButtonLabel] = useState(
    "次回交流会の参加はこちら"
  );
  const [casualEndCtaButtonUrl, setCasualEndCtaButtonUrl] = useState("");
  const [casualEndSubtitleHighlightWord, setCasualEndSubtitleHighlightWord] =
    useState("");
  const [casualEndSubtitleHighlightColor, setCasualEndSubtitleHighlightColor] =
    useState("");
  const [casualEndStaffMessageHighlightWord, setCasualEndStaffMessageHighlightWord] =
    useState("");
  const [casualEndStaffMessageHighlightColor, setCasualEndStaffMessageHighlightColor] =
    useState("");
  const [casualEndNextEventHighlightWord, setCasualEndNextEventHighlightWord] =
    useState("");
  const [casualEndNextEventHighlightColor, setCasualEndNextEventHighlightColor] =
    useState("");
  const [casualEndLineShopHighlightWord, setCasualEndLineShopHighlightWord] =
    useState("");
  const [casualEndLineShopHighlightColor, setCasualEndLineShopHighlightColor] =
    useState("");
  const [quizImageFile, setQuizImageFile] = useState<File | null>(null);
  const [nextEventImageFile, setNextEventImageFile] = useState<File | null>(null);
  const [savingCasualEndSettings, setSavingCasualEndSettings] = useState(false);
  const [saveStatusText, setSaveStatusText] = useState("");
  const [quizUploadProgress, setQuizUploadProgress] = useState<number | null>(null);
  const [nextUploadProgress, setNextUploadProgress] = useState<number | null>(null);

  const participantJoinUrl = useMemo(() => {
    if (typeof window !== "undefined" && window.location?.origin) {
      return `${window.location.origin}/join?event=${encodeURIComponent(
        DEFAULT_EVENT_ID
      )}`;
    }
    return `https://pokabu-match.vercel.app/join?event=${encodeURIComponent(
      DEFAULT_EVENT_ID
    )}`;
  }, []);

  const handleCopyJoinUrl = async () => {
    try {
      await navigator.clipboard.writeText(participantJoinUrl);
      setJoinUrlCopyStatus("URLをコピーしました");
    } catch (error) {
      console.error(error);
      setJoinUrlCopyStatus("コピーに失敗しました");
    }
  };

  const compressImageForUpload = async (
    file: File
  ): Promise<File> => {
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1200,
      useWebWorker: true,
      initialQuality: 0.7,
      fileType: "image/webp",
    } as const;
    return imageCompression(file, options);
  };
  const waitingCount = players.filter(
    (p) => p.status === "waiting"
  ).length;

  const playingCount = players.filter(
    (p) => p.status === "playing"
  ).length;

  const waitingParticipantsList = useMemo((): WaitingParticipantRow[] => {
    return players
      .filter((p) => p.status === "waiting")
      .map((p) => ({
        id: p.id,
        name: p.name?.trim() || "（無名）",
        rank: p.rank?.trim() || "—",
        badgeSummary: participantSummaryLine(
          p.playStyle,
          mergeBadgesForDisplay(p.specialBadge, p.playerAttributes)
        ),
      }));
  }, [players]);

  const breakParticipantsList = useMemo((): WaitingParticipantRow[] => {
    return players
      .filter((p) => p.status === "break")
      .map((p) => ({
        id: p.id,
        name: p.name?.trim() || "（無名）",
        rank: p.rank?.trim() || "—",
        badgeSummary: participantSummaryLine(
          p.playStyle,
          mergeBadgesForDisplay(p.specialBadge, p.playerAttributes)
        ),
      }));
  }, [players]);

  const breakCount = useMemo(
    () => players.filter((p) => p.status === "break").length,
    [players]
  );

  const teamMembers = useMemo(() => {
    if (!latestMatch || latestMatch.matchType !== "team-random") {
      return { A: [], B: [] };
    }

    const aMap = new Map<string, string>();
    const bMap = new Map<string, string>();

    latestMatch.tables.forEach((table) => {
      if (table.player1?.id && table.player1?.name) {
        aMap.set(table.player1.id, table.player1.name);
      }
      if (table.player2?.id && table.player2?.name) {
        bMap.set(table.player2.id, table.player2.name);
      }
    });

    return {
      A: Array.from(aMap.values()),
      B: Array.from(bMap.values()),
    };
  }, [latestMatch]);

  useEffect(() => {
    try {
      const v = localStorage.getItem(CASUAL_RANK_PRIORITY_KEY);
      if (v === "0") setCasualRankPriority(false);
      else if (v === "1") setCasualRankPriority(true);
      const a = localStorage.getItem(CASUAL_AVOID_REMATCH_KEY);
      if (a === "0") setCasualAvoidRematch(false);
      else if (a === "1") setCasualAvoidRematch(true);
      const ps = localStorage.getItem(CASUAL_PLAYSTYLE_PRIORITY_KEY);
      if (ps === "1") setCasualPlayStylePriority(true);
      else if (ps === "0") setCasualPlayStylePriority(false);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const settings = await loadCasualPairingSettings();
        if (cancelled) return;
        setCasualRankPriority(settings.rankPriority);
        setCasualAvoidRematch(settings.avoidRematch);
        setCasualPlayStylePriority(settings.playStylePriority);
        setCasualMatchPriorityOrder(settings.matchPriorityOrder);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        CASUAL_RANK_PRIORITY_KEY,
        casualRankPriority ? "1" : "0"
      );
      localStorage.setItem(
        CASUAL_AVOID_REMATCH_KEY,
        casualAvoidRematch ? "1" : "0"
      );
      localStorage.setItem(
        CASUAL_PLAYSTYLE_PRIORITY_KEY,
        casualPlayStylePriority ? "1" : "0"
      );
    } catch {
      /* ignore */
    }
  }, [casualRankPriority, casualAvoidRematch, casualPlayStylePriority]);

  useEffect(() => {
    const refDoc = doc(db, "events", "default", "config", "casualEventState");
    const unsubscribe = onSnapshot(refDoc, (snap) => {
      if (!snap.exists()) return;
      const d = snap.data() as Record<string, unknown>;
      if (typeof d.title === "string") setCasualEndTitle(d.title);
      if (typeof d.subtitle === "string") setCasualEndSubtitle(d.subtitle);
      else if (typeof d.subMessage === "string") setCasualEndSubtitle(d.subMessage);
      if (typeof d.staffMessage === "string") setCasualEndStaffMessage(d.staffMessage);
      else if (typeof d.organizerMessage === "string")
        setCasualEndStaffMessage(d.organizerMessage);
      if (typeof d.quizText === "string") setCasualEndQuizText(d.quizText);
      else if (typeof d.quiz === "string") setCasualEndQuizText(d.quiz);
      if (typeof d.quizImageUrl === "string") setCasualEndQuizImageUrl(d.quizImageUrl);
      if (typeof d.nextEventText === "string") setCasualEndNextEventText(d.nextEventText);
      else if (typeof d.nextNotice === "string") setCasualEndNextEventText(d.nextNotice);
      if (typeof d.nextEventImageUrl === "string")
        setCasualEndNextEventImageUrl(d.nextEventImageUrl);
      if (typeof d.lineShopCardText === "string")
        setCasualEndLineShopCardText(d.lineShopCardText);
      if (typeof d.lineShopCardUrl === "string")
        setCasualEndLineShopCardUrl(d.lineShopCardUrl);
      if (typeof d.eventFinished === "boolean") setCasualEventFinished(d.eventFinished);
      else if (typeof d.closed === "boolean") setCasualEventFinished(d.closed);
      if (typeof d.ctaButtonLabel === "string")
        setCasualEndCtaButtonLabel(d.ctaButtonLabel);
      if (typeof d.ctaButtonUrl === "string")
        setCasualEndCtaButtonUrl(d.ctaButtonUrl);
      if (typeof d.subtitleHighlightWord === "string")
        setCasualEndSubtitleHighlightWord(d.subtitleHighlightWord);
      if (typeof d.subtitleHighlightColor === "string")
        setCasualEndSubtitleHighlightColor(d.subtitleHighlightColor);
      if (typeof d.staffMessageHighlightWord === "string")
        setCasualEndStaffMessageHighlightWord(d.staffMessageHighlightWord);
      if (typeof d.staffMessageHighlightColor === "string")
        setCasualEndStaffMessageHighlightColor(d.staffMessageHighlightColor);
      if (typeof d.nextEventTextHighlightWord === "string")
        setCasualEndNextEventHighlightWord(d.nextEventTextHighlightWord);
      if (typeof d.nextEventTextHighlightColor === "string")
        setCasualEndNextEventHighlightColor(d.nextEventTextHighlightColor);
      if (typeof d.lineShopCardTextHighlightWord === "string")
        setCasualEndLineShopHighlightWord(d.lineShopCardTextHighlightWord);
      if (typeof d.lineShopCardTextHighlightColor === "string")
        setCasualEndLineShopHighlightColor(d.lineShopCardTextHighlightColor);
    });
    return () => unsubscribe();
  }, []);

  const uploadCasualEndImage = async (
    kind: "quiz" | "nextEvent",
    file: File,
    onProgress?: (percent: number) => void
  ): Promise<string> => {
    const compressedFile = await compressImageForUpload(file);
    const safeName =
      compressedFile.name && compressedFile.name.trim()
        ? compressedFile.name
        : `${kind}_${Date.now()}.webp`;
    const objectRef = ref(
      storage,
      `eventImages/${kind}/${Date.now()}_${safeName}`
    );
    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(objectRef, compressedFile);
      task.on(
        "state_changed",
        (snapshot) => {
          if (!onProgress) return;
          const percent = Math.round(
            (snapshot.bytesTransferred / Math.max(1, snapshot.totalBytes)) * 100
          );
          onProgress(percent);
        },
        (error) => reject(error),
        () => resolve()
      );
    });
    return getDownloadURL(objectRef);
  };

  const handleUploadQuizImageOnly = async () => {
    if (!quizImageFile) return;
    setSavingCasualEndSettings(true);
    setSaveStatusText("ミニクイズ画像を圧縮中...");
    setQuizUploadProgress(0);
    try {
      setSaveStatusText("ミニクイズ画像をアップロード中...");
      const url = await uploadCasualEndImage("quiz", quizImageFile, (p) =>
        setQuizUploadProgress(p)
      );
      await setDoc(
        doc(db, "events", "default", "config", "casualEventState"),
        { quizImageUrl: url, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setCasualEndQuizImageUrl(url);
      setQuizImageFile(null);
      setSaveStatusText("ミニクイズ画像を保存しました");
    } catch (error) {
      console.error(error);
      setSaveStatusText("ミニクイズ画像の保存に失敗しました");
      alert("ミニクイズ画像の保存に失敗しました");
    } finally {
      setSavingCasualEndSettings(false);
      setQuizUploadProgress(null);
    }
  };

  const handleUploadNextEventImageOnly = async () => {
    if (!nextEventImageFile) return;
    setSavingCasualEndSettings(true);
    setSaveStatusText("次回告知画像を圧縮中...");
    setNextUploadProgress(0);
    try {
      setSaveStatusText("次回告知画像をアップロード中...");
      const url = await uploadCasualEndImage("nextEvent", nextEventImageFile, (p) =>
        setNextUploadProgress(p)
      );
      await setDoc(
        doc(db, "events", "default", "config", "casualEventState"),
        { nextEventImageUrl: url, updatedAt: serverTimestamp() },
        { merge: true }
      );
      setCasualEndNextEventImageUrl(url);
      setNextEventImageFile(null);
      setSaveStatusText("次回告知画像を保存しました");
    } catch (error) {
      console.error(error);
      setSaveStatusText("次回告知画像の保存に失敗しました");
      alert("次回告知画像の保存に失敗しました");
    } finally {
      setSavingCasualEndSettings(false);
      setNextUploadProgress(null);
    }
  };

  const handleSaveCasualEndSettings = async () => {
    setSavingCasualEndSettings(true);
    setSaveStatusText("");
    try {
      let quizImageUrl = casualEndQuizImageUrl;
      let nextEventImageUrl = casualEndNextEventImageUrl;
      if (quizImageFile) {
        setSaveStatusText("画像を圧縮中...（ミニクイズ）");
        setQuizUploadProgress(0);
        setSaveStatusText("画像をアップロード中...（ミニクイズ）");
        quizImageUrl = await uploadCasualEndImage("quiz", quizImageFile, (p) =>
          setQuizUploadProgress(p)
        );
      }
      if (nextEventImageFile) {
        setSaveStatusText("画像を圧縮中...（次回告知）");
        setNextUploadProgress(0);
        setSaveStatusText("画像をアップロード中...（次回告知）");
        nextEventImageUrl = await uploadCasualEndImage(
          "nextEvent",
          nextEventImageFile,
          (p) => setNextUploadProgress(p)
        );
      }
      setSaveStatusText("テキスト設定を保存中...");
      await setDoc(
        doc(db, "events", "default", "config", "casualEventState"),
        {
          title: casualEndTitle,
          subtitle: casualEndSubtitle,
          staffMessage: casualEndStaffMessage,
          quizText: casualEndQuizText,
          quizImageUrl,
          nextEventText: casualEndNextEventText,
          nextEventImageUrl,
          lineShopCardText: casualEndLineShopCardText,
          lineShopCardUrl: casualEndLineShopCardUrl,
          subtitleHighlightWord: casualEndSubtitleHighlightWord.trim(),
          subtitleHighlightColor:
            sanitizeCasualHighlightColor(casualEndSubtitleHighlightColor) ?? "",
          staffMessageHighlightWord: casualEndStaffMessageHighlightWord.trim(),
          staffMessageHighlightColor:
            sanitizeCasualHighlightColor(casualEndStaffMessageHighlightColor) ??
            "",
          nextEventTextHighlightWord: casualEndNextEventHighlightWord.trim(),
          nextEventTextHighlightColor:
            sanitizeCasualHighlightColor(casualEndNextEventHighlightColor) ?? "",
          lineShopCardTextHighlightWord: casualEndLineShopHighlightWord.trim(),
          lineShopCardTextHighlightColor:
            sanitizeCasualHighlightColor(casualEndLineShopHighlightColor) ?? "",
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );
      setCasualEndQuizImageUrl(quizImageUrl);
      setCasualEndNextEventImageUrl(nextEventImageUrl);
      setQuizImageFile(null);
      setNextEventImageFile(null);
      setSaveStatusText("終了ページ設定を保存しました");
      alert("終了ページ設定を保存しました");
    } catch (error) {
      console.error(error);
      setSaveStatusText("終了ページ設定の保存に失敗しました");
      alert("終了ページ設定の保存に失敗しました");
    } finally {
      setSavingCasualEndSettings(false);
      setQuizUploadProgress(null);
      setNextUploadProgress(null);
    }
  };

  const handlePostAnnouncement = async () => {
    const t = announcementTitle.trim();
    const m = announcementMessage.trim();
    if (!t || !m) {
      alert("タイトルと本文を入力してください");
      return;
    }
    setAnnouncementPosting(true);
    try {
      await createAnnouncement({
        title: t,
        message: m,
        type: announcementType,
      });
      setAnnouncementTitle("");
      setAnnouncementMessage("");
      setAnnouncementType("normal");
      alert("お知らせを投稿しました");
    } catch (error) {
      console.error(error);
      alert("お知らせの投稿に失敗しました");
    } finally {
      setAnnouncementPosting(false);
    }
  };

  const handleConfirmDeleteAllAnnouncements = async () => {
    setAnnouncementResetDeleting(true);
    try {
      const n = await deleteAllAnnouncements();
      setAnnouncementResetDialogOpen(false);
      alert(
        n === 0
          ? "削除するお知らせはありませんでした"
          : `お知らせを${n}件削除しました`
      );
    } catch (error) {
      console.error(error);
      alert("お知らせの削除に失敗しました");
    } finally {
      setAnnouncementResetDeleting(false);
    }
  };

  useEffect(() => {
    void saveCasualPairingSettings(
      casualRankPriority,
      casualAvoidRematch,
      casualPlayStylePriority,
      casualMatchPriorityOrder
    );
  }, [
    casualRankPriority,
    casualAvoidRematch,
    casualPlayStylePriority,
    casualMatchPriorityOrder,
  ]);

  useEffect(() => {
    const q = collection(db, "players");
  
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Player[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const playStyle = normalizePlayStyle(data);
        const rec = data as Record<string, unknown>;
        const playerAttributes = normalizePlayerAttributeBadges(rec);
        const specialBadge = normalizeSpecialBadgeId(rec);

        return {
          id: docSnap.id,
          name: data.name || "",
          history: data.history || "",
          rank: data.rank || "",
          deck: data.deck || "",
          wins: data.wins || 0,
          loss: typeof data.loss === "number" ? data.loss : 0,
          draw: typeof data.draw === "number" ? data.draw : 0,
          opponents: Array.isArray(data.opponents)
            ? (data.opponents as unknown[]).filter(
                (x): x is string => typeof x === "string"
              )
            : [],
          goodCount:
            typeof data.goodCount === "number" ? data.goodCount : 0,
          status:
            data.status === "waiting" ||
            data.status === "playing" ||
            data.status === "break" ||
            data.status === "inactive"
              ? data.status
              : "waiting",
          currentMatchId: data.currentMatchId || null,
          tags: {
            experience: data.tags?.experience || "none",
            playStyle,
          },
          playStyle,
          playerAttributes,
          specialBadge,
        };
      });
  
      setPlayers(list);
    });
  
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (adminMode !== "casual") {
      setGoodLogsByPlayerId({});
      return;
    }
    const q = query(
      collection(db, "events", "default", "goodHistory"),
      orderBy("createdAt", "desc")
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const byTo: Record<string, GoodHistoryListItem[]> = {};
      snapshot.docs.forEach((docSnap) => {
        const data = docSnap.data();
        const toId = data.toPlayerId as string | undefined;
        if (!toId) return;
        const created = data.createdAt as { toMillis?: () => number } | undefined;
        const entry: GoodHistoryListItem = {
          id: docSnap.id,
          fromPlayerName: String(data.fromPlayerName ?? ""),
          matchId: String(data.matchId ?? ""),
          tableNumber:
            typeof data.tableNumber === "number" ? data.tableNumber : null,
          createdAtMs:
            typeof created?.toMillis === "function"
              ? created.toMillis()
              : null,
        };
        if (!byTo[toId]) byTo[toId] = [];
        byTo[toId].push(entry);
      });
      for (const k of Object.keys(byTo)) {
        byTo[k].sort(
          (a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0)
        );
      }
      setGoodLogsByPlayerId(byTo);
    });
    return () => unsubscribe();
  }, [adminMode]);

  useEffect(() => {
    if (adminMode !== "casual") {
      setContactMessages([]);
      return;
    }
    const q = query(collection(db, "contactMessages"), orderBy("createdAt", "desc"), limit(200));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const rows: ContactMessageRow[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        const created = data.createdAt as { toMillis?: () => number } | undefined;
        const status = data.status === "resolved" ? "resolved" : "unread";
        return {
          id: docSnap.id,
          playerId: String(data.playerId ?? ""),
          playerName: String(data.playerName ?? ""),
          message: String(data.message ?? ""),
          status,
          createdAtMs:
            typeof created?.toMillis === "function" ? created.toMillis() : null,
        };
      });
      setContactMessages(rows);
    });
    return () => unsubscribe();
  }, [adminMode]);

  useEffect(() => {
    if (adminMode !== "tournament") {
      setTeamResults([]);
      return;
    }

    const q = query(
      collection(db, "matchResults"),
      where("matchType", "==", "team-random")
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      setTeamResults(
        snapshot.docs.map((docSnap) => ({
          id: docSnap.id,
          ...docSnap.data(),
        }))
      );
    });

    return () => {
      unsubscribe();
      setTeamResults([]);
    };
  }, [adminMode]);

  useEffect(() => {
    if (adminMode !== "tournament") {
      setLatestMatch(null);
      return;
    }

    // 卓ごとのフラット doc（casual / tournament_individual）も同一コレクションにあるため、
    // createdAt 最新1件だけ取ると個人戦直後は tournament_individual が先頭になり tables が空になる。
    const q = query(
      collection(db, "events", EVENT_ID, "matches"),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (snapshot.empty) {
        setLatestMatch(null);
        return;
      }

      const latestDoc = snapshot.docs.find((docSnap) => {
        const data = docSnap.data();
        return Array.isArray(data.tables);
      });
      if (!latestDoc) {
        setLatestMatch(null);
        return;
      }

      const data = latestDoc.data();

      setLatestMatch({
        id: latestDoc.id,
        matchType: data.matchType || "rank-priority",
        individualRound:
          typeof data.individualRound === "number"
            ? data.individualRound
            : null,
        roundMinutes: data.roundMinutes ?? 30,
        roundStartedAt: data.roundStartedAt ?? null,
        roundEndAt: data.roundEndAt ?? null,
        tables: data.tables || [],
      });
    });

    return () => {
      unsubscribe();
      setLatestMatch(null);
    };
  }, [adminMode]);

  useEffect(() => {
    const q = query(
      collection(db, "events", "default", "matches"),
      where("status", "==", "playing")
    );
    return onSnapshot(q, (snapshot) => {
      const rows: RecentMatchRow[] = snapshot.docs
        .map((docSnap) => {
          const d = docSnap.data();
          const tableNumber =
            typeof d.tableNumber === "number" ? d.tableNumber : 0;
          const player1 =
            typeof d.player1Name === "string" ? d.player1Name : "—";
          const player2 =
            typeof d.player2Name === "string" ? d.player2Name : "—";
          return { tableNumber, player1, player2 };
        })
        .sort((a, b) => a.tableNumber - b.tableNumber)
        .slice(0, 3);
      setCasualRecentMatches(rows);
    });
  }, []);

  useEffect(() => {
    if (adminMode !== "tournament") return;

    const timer = setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => clearInterval(timer);
  }, [adminMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;

    if (Notification.permission === "default") {
      Notification.requestPermission().catch((error) => {
        console.error("通知許可取得失敗:", error);
      });
    }
  }, []);

  useEffect(() => {
    setNotifiedMarks([]);
  }, [latestMatch?.id, latestMatch?.roundStartedAt, latestMatch?.roundEndAt]);

  const saveMatches = async (
    matchType:
      | "rank-priority"
      | "full-random"
      | "team-random"
      | "individual-swiss",
    matchTables: MatchTable[],
    options?: { individualRound?: number }
  ): Promise<string | undefined> => {
    setSaving(true);
    try {
      const created = await addDoc(tournamentMatchesCollection(), {
        matchType,
        ...(options?.individualRound != null
          ? { individualRound: options.individualRound }
          : {}),
        createdAt: serverTimestamp(),
        roundMinutes,
        roundStartedAt: null,
        roundEndAt: null,
        tables: matchTables.map((table) => ({
          tableNumber: table.tableNumber,
          type: table.type,
          started: table.started ?? false,
          pendingWinnerId: table.pendingWinnerId ?? null,
          winnerId: table.winnerId ?? null,
          reportedById: table.reportedById ?? null,
          reportedOpponentDeck: table.reportedOpponentDeck ?? null,
          reportedWinnerSide: table.reportedWinnerSide ?? null,
          reportedLoserSide: table.reportedLoserSide ?? null,
          reportedWinnerDeck: table.reportedWinnerDeck ?? null,
          player1Team: table.player1Team ?? null,
          player2Team: table.player2Team ?? null,
          player1: table.player1
          ? {
              id: table.player1.id,
              name: table.player1.name,
              rank: table.player1.rank,
              deck: table.player1.deck || "",
              tags: table.player1.tags ?? {
                experience: "none",
                playStyle: table.player1.playStyle ?? "enjoy",
              },
              playStyle: table.player1.playStyle ?? "enjoy",
              playerAttributes: table.player1.playerAttributes ?? [],
            }
          : null,
          player2: table.player2
  ? {
      id: table.player2.id,
      name: table.player2.name,
      rank: table.player2.rank,
      deck: table.player2.deck || "",
      tags: table.player2.tags ?? {
        experience: "none",
        playStyle: table.player2.playStyle ?? "enjoy",
      },
      playStyle: table.player2.playStyle ?? "enjoy",
      playerAttributes: table.player2.playerAttributes ?? [],
    }
  : null,
        })),
      });
      return created.id;
    } finally {
      setSaving(false);
    }
  };

  const toPairablePlayer = (p: Player): PairablePlayer => ({
    id: p.id,
    name: p.name,
    rank: p.rank,
    wins: p.wins ?? 0,
    opponents: p.opponents ?? [],
  });

  const rawPairsToMatchTables = (
    pairs: RawPair[],
    byId: Map<string, Player>
  ): MatchTable[] =>
    pairs.map((pair) => {
      const p1 = byId.get(pair.player1.id);
      if (!p1) throw new Error("player1 not found");
      if (!pair.player2) {
        return {
          tableNumber: pair.tableNumber,
          player1: p1,
          player2: undefined,
          type: "individual",
          started: true,
          winnerId: p1.id,
          pendingWinnerId: null,
          reportedById: null,
          reportedOpponentDeck: null,
          reportedWinnerSide: null,
          reportedLoserSide: null,
          reportedWinnerDeck: null,
        };
      }
      const p2 = byId.get(pair.player2.id);
      if (!p2) throw new Error("player2 not found");
      return {
        tableNumber: pair.tableNumber,
        player1: p1,
        player2: p2,
        type: "individual",
        started: false,
        winnerId: null,
        pendingWinnerId: null,
        reportedById: null,
        reportedOpponentDeck: null,
        reportedWinnerSide: null,
        reportedLoserSide: null,
        reportedWinnerDeck: null,
      };
    });

  const handleIndividualSwissRound = async () => {
    const active = players.filter((p) => p.status !== "inactive");
    if (active.length < 2) {
      alert("大会に参加できる参加者が2人未満です（無効化を除く）");
      return;
    }

    if (latestMatch?.matchType === "individual-swiss") {
      const allDone = latestMatch.tables.every((t) => {
        if (!t.player1) return true;
        if (!t.player2) return !!t.winnerId;
        return !!t.winnerId;
      });
      if (!allDone) {
        alert(
          "現在のラウンドが未終了です。全卓の勝敗を確定してから個人戦を押してください。"
        );
        return;
      }
    }

    let nextRound = 1;
    if (latestMatch?.matchType === "individual-swiss") {
      nextRound = (latestMatch.individualRound ?? 1) + 1;
    } else if (latestMatch) {
      const ok = window.confirm(
        "現在表示中の大会データは個人戦ラウンド制ではありません。個人戦を開始すると Round 1 として新しい卓組みを追加します。よろしいですか？"
      );
      if (!ok) return;
    }

    const pairable = active.map(toPairablePlayer);
    const byId = new Map(active.map((p) => [p.id, p]));

    const rawPairs =
      nextRound === 1
        ? pairIndividualRound1(pairable)
        : pairIndividualRoundN(pairable);

    try {
      await finishAllPlayingTournamentIndividualBoardMatches(EVENT_ID);
      const tables = rawPairsToMatchTables(rawPairs, byId);
      await saveMatches("individual-swiss", tables, {
        individualRound: nextRound,
      });
      const boardTables = tables
        .filter((t) => t.player1 && t.player2)
        .map((t) => ({
          tableNumber: t.tableNumber,
          player1Id: t.player1!.id,
          player1Name: t.player1!.name,
          player2Id: t.player2!.id,
          player2Name: t.player2!.name,
        }));
      await addTournamentIndividualBoardMatches(EVENT_ID, nextRound, boardTables);
      for (const t of tables) {
        if (!t.player2 && t.winnerId) {
          await updateDoc(doc(db, "players", t.winnerId), {
            wins: increment(1),
            updatedAt: serverTimestamp(),
          });
        }
      }
      alert(
        `Round ${nextRound} の卓組みを保存しました。ラウンド開始でタイマーを開始できます。`
      );
    } catch (e) {
      console.error(e);
      alert("個人戦の卓組みに失敗しました");
    }
  };

const handleTeamRandomMatch = async () => {
  const grouped: Record<string, Player[]> = {};

  players.forEach((p) => {
    if (!grouped[p.rank]) grouped[p.rank] = [];
    grouped[p.rank].push(p);
  });

  const tables: MatchTable[] = [];
  let tableNumber = 1;

  Object.values(grouped).forEach((group) => {
    const shuffled = [...group].sort(() => Math.random() - 0.5);

    const half = Math.ceil(shuffled.length / 2);
    const teamA = shuffled.slice(0, half);
    const teamB = shuffled.slice(half);

    const max = Math.max(teamA.length, teamB.length);

    for (let i = 0; i < max; i++) {
      tables.push({
        tableNumber: tableNumber++,
        player1: teamA[i],
        player2: teamB[i],
        player1Team: "A",
        player2Team: "B",
        type: "team-random",
        started: false,
        pendingWinnerId: null,
        winnerId: null,
        reportedById: null,
        reportedOpponentDeck: null,
        reportedWinnerSide: null,
        reportedLoserSide: null,
        reportedWinnerDeck: null,
      });
    }
  });

  await saveMatches("team-random", tables);
};

  const handleResetTeamCounts = async () => {
    const ok = window.confirm("チーム戦の勝数カウントをリセットしますか？");
    if (!ok) return;
  
    try {
      const q = query(
        collection(db, "matchResults"),
        where("matchType", "==", "team-random")
      );
  
      const snapshot = await getDocs(q);
  
      await Promise.all(
        snapshot.docs.map((docSnap) =>
          deleteDoc(doc(db, "matchResults", docSnap.id))
        )
      );
  
      alert("チーム戦カウントをリセットしました");
    } catch (error) {
      console.error(error);
      alert("リセットに失敗しました");
    }
  };
  const handleStartRound = async () => {
    if (!latestMatch) return;

    setStartingRound(true);

    try {
      const startedAt = Date.now();
      const endAt = startedAt + roundMinutes * 60 * 1000;

      const updatedTables = latestMatch.tables.map((table) => ({
        ...table,
        started: true,
      }));

      await updateDoc(tournamentMatchDocRef(latestMatch.id), {
        roundMinutes,
        roundStartedAt: startedAt,
        roundEndAt: endAt,
        tables: updatedTables,
      });
    } finally {
      setStartingRound(false);
    }
  };

  const handleStartMatch = async (tableNumber: number) => {
    if (!latestMatch) return;

    setSavingTableNumber(tableNumber);

    try {
      const updatedTables = latestMatch.tables.map((table) =>
        table.tableNumber === tableNumber
          ? {
              ...table,
              started: true,
            }
          : table
      );

      await updateDoc(tournamentMatchDocRef(latestMatch.id), {
        tables: updatedTables,
      });
    } finally {
      setSavingTableNumber(null);
    }
  };

  const handleApproveWinner = async (tableNumber: number) => {
    if (!latestMatch) return;

    const targetTable = latestMatch.tables.find((t) => t.tableNumber === tableNumber);
    if (!targetTable || !targetTable.pendingWinnerId) return;

    setSavingTableNumber(tableNumber);

    try {
      const updatedTables = latestMatch.tables.map((table) =>
        table.tableNumber === tableNumber
          ? {
              ...table,
              winnerId: table.pendingWinnerId,
            }
          : table
      );

      await updateDoc(tournamentMatchDocRef(latestMatch.id), {
        tables: updatedTables,
      });

      if (latestMatch.matchType === "individual-swiss") {
        await finishTournamentIndividualBoardMatch(
          EVENT_ID,
          latestMatch.individualRound ?? 1,
          tableNumber
        );
      }

      const winnerPlayer =
        targetTable.player1?.id === targetTable.pendingWinnerId
          ? targetTable.player1
          : targetTable.player2;

      const loserPlayer =
        targetTable.player1?.id === targetTable.pendingWinnerId
          ? targetTable.player2
          : targetTable.player1;

      const winnerId = targetTable.pendingWinnerId;
      if (winnerId) {
        const winnerRef = doc(db, "players", winnerId);
        const winnerSnap = await getDoc(winnerRef);
        if (winnerSnap.exists()) {
          if (
            latestMatch.matchType === "individual-swiss" &&
            loserPlayer?.id
          ) {
            const loserRef = doc(db, "players", loserPlayer.id);
            await Promise.all([
              updateDoc(winnerRef, {
                wins: increment(1),
                opponents: arrayUnion(loserPlayer.id),
                updatedAt: serverTimestamp(),
              }),
              updateDoc(loserRef, {
                loss: increment(1),
                opponents: arrayUnion(winnerId),
                updatedAt: serverTimestamp(),
              }),
            ]);
          } else {
            await updateDoc(winnerRef, {
              wins: increment(1),
            });
          }
        }
      }

      await addDoc(collection(db, "matchResults"), {
        matchId: latestMatch.id,
        tableNumber: targetTable.tableNumber,
        matchType: latestMatch.matchType,
        roundMinutes: latestMatch.roundMinutes ?? null,
        player1Team: targetTable.player1Team ?? null,
        player2Team: targetTable.player2Team ?? null,
        winnerId: targetTable.pendingWinnerId,
        winnerTeam:
  targetTable.pendingWinnerId === targetTable.player1?.id
    ? targetTable.player1Team ?? null
    : targetTable.player2Team ?? null,
        winnerName: winnerPlayer?.name || "",
        winnerRank: winnerPlayer?.rank || "",
        winnerDeck: targetTable.reportedWinnerDeck || winnerPlayer?.deck || "",
        loserId: loserPlayer?.id || null,
        loserName: loserPlayer?.name || "",
        loserRank: loserPlayer?.rank || "",
        loserDeck: targetTable.reportedOpponentDeck || loserPlayer?.deck || "",
        reportedById: targetTable.reportedById || null,
        sideWinner: targetTable.reportedWinnerSide ?? null,
        sideLoser: targetTable.reportedLoserSide ?? null,
        createdAt: serverTimestamp(),
      });
    } finally {
      setSavingTableNumber(null);
    }
  };

  const handleChangeWinner = async (tableNumber: number, winnerId: string) => {
    if (!latestMatch) return;

    setSavingTableNumber(tableNumber);

    try {
      const winnerTable = latestMatch.tables.find((table) => table.tableNumber === tableNumber);
      const winnerPlayer =
        winnerTable?.player1?.id === winnerId ? winnerTable.player1 : winnerTable?.player2;

      const loserPlayer =
        winnerTable?.player1?.id === winnerId ? winnerTable.player2 : winnerTable?.player1;

      const updatedTables = latestMatch.tables.map((table) =>
        table.tableNumber === tableNumber
          ? {
              ...table,
              started: true,
              pendingWinnerId: winnerId,
              winnerId,
              reportedById: winnerId,
              reportedWinnerDeck: winnerPlayer?.deck || table.reportedWinnerDeck || "",
              reportedOpponentDeck:
                loserPlayer?.deck || table.reportedOpponentDeck || "",
            }
          : table
      );

      await updateDoc(tournamentMatchDocRef(latestMatch.id), {
        tables: updatedTables,
      });
      if (latestMatch.matchType === "individual-swiss") {
        await finishTournamentIndividualBoardMatch(
          EVENT_ID,
          latestMatch.individualRound ?? 1,
          tableNumber
        );
      }
      await addDoc(collection(db, "matchResults"), {
        matchId: latestMatch.id,
        tableNumber: winnerTable?.tableNumber ?? tableNumber,
        matchType: latestMatch.matchType,
        roundMinutes: latestMatch.roundMinutes ?? null,
      
        player1Team: winnerTable?.player1Team ?? null,
        player2Team: winnerTable?.player2Team ?? null,
      
        winnerId,
        winnerTeam:
  winnerId === winnerTable?.player1?.id
    ? winnerTable?.player1Team ?? null
    : winnerTable?.player2Team ?? null,
        winnerName: winnerPlayer?.name || "",
        winnerRank: winnerPlayer?.rank || "",
        winnerDeck: winnerPlayer?.deck || winnerTable?.reportedWinnerDeck || "",
        loserId: loserPlayer?.id || null,
        loserName: loserPlayer?.name || "",
        loserRank: loserPlayer?.rank || "",
        loserDeck: loserPlayer?.deck || winnerTable?.reportedOpponentDeck || "",
        reportedById: winnerId,
        sideWinner: null,
        sideLoser: null,
        createdAt: serverTimestamp(),
      });
    } finally {
      setSavingTableNumber(null);
    }
  };

  const renderTypeLabel = (
    type: "same-rank" | "cross-rank" | "random" | "team-random" | "individual"
  ) => {
    if (type === "same-rank") return "同階級";
    if (type === "cross-rank") return "階級またぎ";
    if (type === "team-random") return "チーム戦ランダム";
    if (type === "individual") return "個人戦";
    return "完全ランダム";
  };

  const getStatusLabel = (table: SavedMatchTable) => {
    if ((table as any).finished) {
      return { text: "終了", color: "#4ade80" };
    }
    if (table.winnerId) {
      return { text: "承認済み", color: "#4ade80" };
    }
    if (table.pendingWinnerId) {
      return { text: "勝利申請中", color: "#fb923c" };
    }
    if (table.started) {
      return { text: "対戦中", color: "#93c5fd" };
    }
    return { text: "未開始", color: "#94a3b8" };
  };

  const getPlayerBoxStyle = (
    playerId: string | undefined,
    pendingWinnerId?: string | null,
    winnerId?: string | null
  ) => {
    if (!playerId) {
      return {
        border: "1px solid rgba(168, 85, 247, 0.35)",
        backgroundColor: "rgba(255, 255, 255, 0.06)",
        color: "#e5e7eb",
      };
    }

    if (winnerId === playerId) {
      return {
        border: "2px solid #4ade80",
        backgroundColor: "rgba(74, 222, 128, 0.12)",
        color: "#e5e7eb",
      };
    }

    if (pendingWinnerId === playerId) {
      return {
        border: "2px solid #fb923c",
        backgroundColor: "rgba(251, 146, 60, 0.12)",
        color: "#e5e7eb",
      };
    }

    return {
      border: "1px solid rgba(168, 85, 247, 0.35)",
      backgroundColor: "rgba(255, 255, 255, 0.06)",
      color: "#e5e7eb",
    };
  };

  const remainingSeconds = useMemo(() => {
    if (!latestMatch?.roundStartedAt || !latestMatch?.roundMinutes) return null;

    const end =
      latestMatch.roundStartedAt + latestMatch.roundMinutes * 60 * 1000;

    return Math.max(0, Math.floor((end - now) / 1000));
  }, [latestMatch, now]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("Notification" in window)) return;
    if (Notification.permission !== "granted") return;
    if (remainingSeconds === null) return;

    const notify = (key: string, title: string, body: string) => {
      if (notifiedMarks.includes(key)) return;

     // new Notification(title, { body });
      setNotifiedMarks((prev) => [...prev, key]);
    };

    if (
      latestMatch?.roundMinutes &&
      latestMatch.roundMinutes > 10 &&
      remainingSeconds <= 600 &&
      !notifiedMarks.includes("10min")
    ) {
      notify("10min", "ラウンド終了10分前", "残り10分です。");
    }

    if (
      latestMatch?.roundMinutes &&
      latestMatch.roundMinutes > 5 &&
      remainingSeconds <= 300 &&
      !notifiedMarks.includes("5min")
    ) {
      notify("5min", "ラウンド終了5分前", "残り5分です。");
    }

    if (
      latestMatch?.roundMinutes &&
      latestMatch.roundMinutes > 1 &&
      remainingSeconds <= 60 &&
      !notifiedMarks.includes("1min")
    ) {
      notify("1min", "ラウンド終了1分前", "残り1分です。");
    }

    if (remainingSeconds <= 0 && !notifiedMarks.includes("end")) {
      notify("end", "ラウンド終了", "時間終了です。");
    }
  }, [remainingSeconds, notifiedMarks, latestMatch]);

  const timerText = useMemo(() => {
    if (remainingSeconds === null) return "未開始";
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }, [remainingSeconds]);
  const teamWinCounts = useMemo(() => {
    let aWins = 0;
    let bWins = 0;
  
    teamResults.forEach((result: any) => {
      if (result.winnerTeam === "A") aWins++;
      if (result.winnerTeam === "B") bWins++;
    });
  
    return { A: aWins, B: bWins };
  }, [teamResults]);

  const rankCardsData = useMemo((): RankCardData[] => {
    const byRank = (rank: string) =>
      players.filter((p) => p.status !== "inactive" && p.rank === rank);
    const mk = (
      list: Player[],
      key: RankCardData["key"],
      label: string
    ): RankCardData => ({
      key,
      label,
      total: list.length,
      waiting: list.filter((p) => p.status === "waiting").length,
      playing: list.filter((p) => p.status === "playing").length,
      onBreak: list.filter((p) => p.status === "break").length,
      participants: list.map((p) => ({
        id: p.id,
        name:
          p.status === "break"
            ? `${(p.name || "").trim() || "（無名）"}（休憩中）`
            : p.name,
        badgeSummary: participantSummaryLine(
          p.playStyle,
          mergeBadgesForDisplay(p.specialBadge, p.playerAttributes)
        ),
      })),
    });
    return [
      mk(byRank("モンスターボール級"), "monster", "モンスターボール級"),
      mk(byRank("スーパーボール級"), "super", "スーパーボール級"),
      mk(byRank("ハイパーボール級"), "hyper", "ハイパーボール級"),
    ];
  }, [players]);

  const goodRankingRows = useMemo(() => {
    return [...players]
      .map((p) => ({
        playerId: p.id,
        name: (p.name || "").trim() || "（無名）",
        goodCount: p.goodCount ?? 0,
      }))
      .sort(
        (a, b) =>
          b.goodCount - a.goodCount || a.name.localeCompare(b.name, "ja")
      )
      .map((row, i) => ({ rank: i + 1, ...row }));
  }, [players]);

  const getPendingPlayerName = (table: SavedMatchTable) => {
    if (!table.pendingWinnerId) return null;
    if (table.pendingWinnerId === table.player1?.id) return table.player1?.name || null;
    if (table.pendingWinnerId === table.player2?.id) return table.player2?.name || null;
    return null;
  };

  const tournamentGridCounts = useMemo(() => {
    if (!latestMatch?.tables?.length) {
      return { playing: 0, finished: 0 };
    }
    let playing = 0;
    let finished = 0;
    for (const t of latestMatch.tables) {
      if (!t.player1) continue;
      if (t.winnerId) finished++;
      else playing++;
    }
    return { playing, finished };
  }, [latestMatch]);

  const tournamentRecentRows = useMemo((): RecentMatchRow[] => {
    if (!latestMatch?.tables?.length) return [];
    return latestMatch.tables.slice(0, 3).map((t) => ({
      tableNumber: t.tableNumber,
      player1: t.player1?.name?.trim() || "—",
      player2: t.player2?.name?.trim() || "不戦勝",
    }));
  }, [latestMatch]);

  const openBadgeEditorForParticipant = async (id: string) => {
    setBadgeEditorLoading(true);
    try {
      const snap = await getDoc(doc(db, "players", id));
      if (!snap.exists()) {
        alert("参加者が見つかりません");
        return;
      }
      const data = snap.data() as Record<string, unknown>;
      const name =
        typeof data.name === "string"
          ? data.name.trim() || "（無名）"
          : "（無名）";
      const picked = normalizeSpecialBadgeId(data);
      setBadgeEditor({ id, name, draft: picked });
    } catch (err) {
      console.error(err);
      alert("参加者情報の読み込みに失敗しました");
    } finally {
      setBadgeEditorLoading(false);
    }
  };

  const saveBadgeEditor = async () => {
    if (!badgeEditor) return;
    setBadgeEditorBusy(true);
    try {
      await updateDoc(doc(db, "players", badgeEditor.id), {
        badge: badgeIdToFirestore(badgeEditor.draft),
      });
      setBadgeEditor(null);
    } catch (err) {
      console.error(err);
      alert("特別属性の設定の保存に失敗しました");
    } finally {
      setBadgeEditorBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <PokabuAdminUI
        mode={adminMode}
        onModeChange={setAdminMode}
        waitingCount={waitingCount}
        breakCount={breakCount}
        playingCount={playingCount}
        tournamentGridCounts={tournamentGridCounts}
        waitingParticipants={waitingParticipantsList}
        breakParticipants={breakParticipantsList}
        rankCards={rankCardsData}
        recentMatches={
          adminMode === "tournament" ? tournamentRecentRows : casualRecentMatches
        }
        onCasualStart={() => void handleStartCasualEvent()}
        onCasualMatch={() => void handleCasualMatch()}
        onCasualClose={() => void handleCloseCasualEvent()}
        onForceWaiting={() => void handleResetPlayers()}
        onShowMoreMatches={() => router.push("/board")}
        onDeactivateParticipant={async (id) => {
          try {
            await setPlayerInactive(id);
          } catch (error) {
            console.error(error);
            alert("無効化に失敗しました");
          }
        }}
        onDeleteParticipant={async (id) => {
          // 誤操作防止：削除は必ず確認ダイアログのあとだけ実行する
          const ok = confirm("この参加者を削除しますか？");
          if (!ok) return false;
          try {
            await deletePlayer(id);
            return true;
          } catch (error) {
            console.error(error);
            alert("削除に失敗しました");
            return false;
          }
        }}
        onOpenBadgeSetting={(id) => void openBadgeEditorForParticipant(id)}
        casualRankPriority={casualRankPriority}
        onCasualRankPriorityChange={setCasualRankPriority}
        casualAvoidRematch={casualAvoidRematch}
        onCasualAvoidRematchChange={setCasualAvoidRematch}
        casualPlayStylePriority={casualPlayStylePriority}
        onCasualPlayStylePriorityChange={setCasualPlayStylePriority}
        casualMatchPriorityOrder={casualMatchPriorityOrder}
        onCasualMatchPriorityOrderSave={setCasualMatchPriorityOrder}
        casualExtraSlot={
          <>
            <div className="mb-5 rounded-xl border border-purple-400/30 bg-white/10 p-4 shadow-[0_0_20px_rgba(168,85,247,0.25)] backdrop-blur-md sm:p-5">
              <p className="mb-3 text-sm font-extrabold text-white">お知らせ作成</p>
              <p className="mb-3 text-xs text-gray-400">
                参加者の「お知らせ」タブに表示されます（新しい順）。
              </p>
              <div className="grid gap-3">
                <label className="text-xs font-semibold text-gray-300">
                  タイトル
                  <input
                    value={announcementTitle}
                    onChange={(e) => setAnnouncementTitle(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-purple-400/30 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none"
                  />
                </label>
                <label className="text-xs font-semibold text-gray-300">
                  本文
                  <textarea
                    value={announcementMessage}
                    onChange={(e) => setAnnouncementMessage(e.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-lg border border-purple-400/30 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none"
                  />
                </label>
                <fieldset className="min-w-0 border-0 p-0">
                  <legend className="text-xs font-semibold text-gray-300">
                    種類
                  </legend>
                  <div className="mt-2 flex flex-wrap gap-4">
                    {(
                      [
                        ["normal", "通常"] as const,
                        ["important", "重要"] as const,
                        ["info", "案内"] as const,
                      ] as const
                    ).map(([value, label]) => (
                      <label
                        key={value}
                        className="inline-flex cursor-pointer items-center gap-2 text-sm text-gray-200"
                      >
                        <input
                          type="radio"
                          name="announcement-type"
                          checked={announcementType === value}
                          onChange={() => setAnnouncementType(value)}
                          className="h-4 w-4 accent-cyan-400"
                        />
                        {label}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </div>
              <button
                type="button"
                onClick={() => void handlePostAnnouncement()}
                disabled={announcementPosting}
                className="mt-4 min-h-[44px] w-full rounded-lg bg-gradient-to-r from-violet-500 to-blue-600 px-4 py-2 text-sm font-extrabold text-white shadow-[0_0_18px_rgba(99,102,241,0.35)] disabled:opacity-60"
              >
                {announcementPosting ? "投稿中…" : "お知らせを投稿"}
              </button>
              <button
                type="button"
                onClick={() => setAnnouncementResetDialogOpen(true)}
                disabled={
                  announcementPosting || announcementResetDeleting
                }
                className="mt-3 min-h-[44px] w-full rounded-lg border border-rose-400/45 bg-rose-500/10 px-4 py-2 text-sm font-bold text-rose-100 shadow-[0_0_12px_rgba(244,63,94,0.15)] disabled:opacity-60"
              >
                お知らせリセット
              </button>
            </div>
            <div className="rounded-xl border border-purple-400/30 bg-white/10 p-4 shadow-[0_0_20px_rgba(168,85,247,0.25)] backdrop-blur-md sm:p-5">
            <p className="mb-3 text-sm font-extrabold text-white">終了ページ設定</p>
            <div className="grid gap-3">
              <label className="text-xs font-semibold text-gray-300">
                タイトル
                <input
                  value={casualEndTitle}
                  onChange={(e) => setCasualEndTitle(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-purple-400/30 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none"
                />
              </label>
              <label className="text-xs font-semibold text-gray-300">
                サブメッセージ
                <textarea
                  value={casualEndSubtitle}
                  onChange={(e) => setCasualEndSubtitle(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-purple-400/30 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none"
                />
              </label>
              <CasualEndHighlightFields
                word={casualEndSubtitleHighlightWord}
                color={casualEndSubtitleHighlightColor}
                onWordChange={setCasualEndSubtitleHighlightWord}
                onColorChange={setCasualEndSubtitleHighlightColor}
              />
              <label className="text-xs font-semibold text-gray-300">
                運営からの一言
                <textarea
                  value={casualEndStaffMessage}
                  onChange={(e) => setCasualEndStaffMessage(e.target.value)}
                  rows={3}
                  className="mt-1 w-full rounded-lg border border-purple-400/30 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none"
                />
              </label>
              <CasualEndHighlightFields
                word={casualEndStaffMessageHighlightWord}
                color={casualEndStaffMessageHighlightColor}
                onWordChange={setCasualEndStaffMessageHighlightWord}
                onColorChange={setCasualEndStaffMessageHighlightColor}
              />
              {NOTICE_END_PAGE_SHOW_MINI_QUIZ_TEXT_FIELD ? (
                <label className="text-xs font-semibold text-gray-300">
                  ミニクイズ本文
                  <textarea
                    value={casualEndQuizText}
                    onChange={(e) => setCasualEndQuizText(e.target.value)}
                    rows={2}
                    className="mt-1 w-full rounded-lg border border-purple-400/30 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none"
                  />
                </label>
              ) : null}
              <label className="text-xs font-semibold text-gray-300">
                ミニクイズ画像
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setQuizImageFile(e.target.files?.[0] ?? null)}
                  className="mt-1 w-full text-xs text-gray-300"
                />
              </label>
              {quizImageFile ? (
                <button
                  type="button"
                  onClick={() => void handleUploadQuizImageOnly()}
                  disabled={savingCasualEndSettings}
                  className="min-h-[40px] rounded-lg border border-cyan-300/50 bg-cyan-500/15 px-3 py-2 text-xs font-bold text-cyan-100 disabled:opacity-70"
                >
                  ミニクイズ画像を個別保存
                </button>
              ) : null}
              {quizUploadProgress !== null ? (
                <div className="text-xs text-cyan-200">
                  画像アップロード中（ミニクイズ）: {quizUploadProgress}%
                </div>
              ) : null}
              {casualEndQuizImageUrl ? (
                <img
                  src={casualEndQuizImageUrl}
                  alt="ミニクイズ画像プレビュー"
                  className="max-h-40 w-full rounded-lg object-cover"
                />
              ) : null}
              <label className="text-xs font-semibold text-gray-300">
                次回告知本文
                <textarea
                  value={casualEndNextEventText}
                  onChange={(e) => setCasualEndNextEventText(e.target.value)}
                  rows={2}
                  className="mt-1 w-full rounded-lg border border-purple-400/30 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none"
                />
              </label>
              <CasualEndHighlightFields
                word={casualEndNextEventHighlightWord}
                color={casualEndNextEventHighlightColor}
                onWordChange={setCasualEndNextEventHighlightWord}
                onColorChange={setCasualEndNextEventHighlightColor}
              />
              <label className="text-xs font-semibold text-gray-300">
                次回告知画像
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => setNextEventImageFile(e.target.files?.[0] ?? null)}
                  className="mt-1 w-full text-xs text-gray-300"
                />
              </label>
              {nextEventImageFile ? (
                <button
                  type="button"
                  onClick={() => void handleUploadNextEventImageOnly()}
                  disabled={savingCasualEndSettings}
                  className="min-h-[40px] rounded-lg border border-cyan-300/50 bg-cyan-500/15 px-3 py-2 text-xs font-bold text-cyan-100 disabled:opacity-70"
                >
                  次回告知画像を個別保存
                </button>
              ) : null}
              {nextUploadProgress !== null ? (
                <div className="text-xs text-cyan-200">
                  画像アップロード中（次回告知）: {nextUploadProgress}%
                </div>
              ) : null}
              {casualEndNextEventImageUrl ? (
                <img
                  src={casualEndNextEventImageUrl}
                  alt="次回告知画像プレビュー"
                  className="max-h-40 w-full rounded-lg object-cover"
                />
              ) : null}
              <label className="text-xs font-semibold text-gray-300">
                LINEショップカード案内文
                <textarea
                  value={casualEndLineShopCardText}
                  onChange={(e) => setCasualEndLineShopCardText(e.target.value)}
                  rows={4}
                  className="mt-1 w-full rounded-lg border border-purple-400/30 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none"
                  placeholder="公式LINEのショップカードでスタンプを貯める案内"
                />
              </label>
              <CasualEndHighlightFields
                word={casualEndLineShopHighlightWord}
                color={casualEndLineShopHighlightColor}
                onWordChange={setCasualEndLineShopHighlightWord}
                onColorChange={setCasualEndLineShopHighlightColor}
              />
              <label className="text-xs font-semibold text-gray-300">
                LINEショップカードURL
                <input
                  value={casualEndLineShopCardUrl}
                  onChange={(e) => setCasualEndLineShopCardUrl(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-purple-400/30 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none"
                  placeholder="https://lin.ee/..."
                />
              </label>
              <label className="text-xs font-semibold text-gray-300">
                リンクボタン名
                <input
                  value={casualEndCtaButtonLabel}
                  onChange={(e) => setCasualEndCtaButtonLabel(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-purple-400/30 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none"
                />
              </label>
              <label className="text-xs font-semibold text-gray-300">
                リンクURL
                <input
                  value={casualEndCtaButtonUrl}
                  onChange={(e) => setCasualEndCtaButtonUrl(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-purple-400/30 bg-slate-900/70 px-3 py-2 text-sm text-white outline-none"
                  placeholder="https://tonamel.com/competition/xxxx"
                />
              </label>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => void handleSaveCasualEndSettings()}
                disabled={savingCasualEndSettings}
                className="min-h-[44px] flex-1 rounded-lg bg-gradient-to-r from-cyan-500 to-indigo-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-70"
              >
                {savingCasualEndSettings ? "保存中..." : "保存"}
              </button>
              <button
                type="button"
                onClick={() => void handleCloseCasualEvent()}
                className="min-h-[44px] flex-1 rounded-lg border border-rose-400/60 bg-rose-500/20 px-4 py-2 text-sm font-bold text-white"
              >
                プレビュー/終了反映
              </button>
            </div>
            {saveStatusText ? (
              <div className="mt-2 text-xs font-medium text-cyan-100">
                {saveStatusText}
              </div>
            ) : null}
          </div>
          </>
        }
        goodRankingRows={goodRankingRows}
        goodLogsByPlayerId={goodLogsByPlayerId}
        contactMessages={contactMessages}
        onToggleContactMessageStatus={async (id, nextStatus) => {
          try {
            await updateDoc(doc(db, "contactMessages", id), {
              status: nextStatus,
              updatedAt: serverTimestamp(),
            });
          } catch (error) {
            console.error(error);
            alert("連絡ステータスの更新に失敗しました");
          }
        }}
        eventFinished={casualEventFinished}
        headerSlot={
          <AdminHomeHeaderSlot
            adminMode={adminMode}
            onResultsClick={() => router.push("/results")}
            onRankingClick={() => router.push("/ranking")}
          />
        }
        resetSlot={
          <div className="rounded-xl border border-purple-400/30 bg-white/10 p-5 text-left shadow-[0_0_20px_rgba(168,85,247,0.3)] backdrop-blur-md">
            <div
              className="mb-4 rounded-xl border border-amber-300/35 bg-amber-500/10 p-3"
              style={{ display: "none" }}
            >
              <p className="mb-2 text-xs font-semibold text-amber-100">
                デバッグ用ツール
              </p>
              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreateDebugParticipants()}
                  className="min-h-[42px] w-full rounded-lg border border-amber-200/45 bg-amber-400/20 px-3 py-2 text-sm font-bold text-amber-50"
                >
                  🧪 デバッグ参加者生成
                </button>
                <button
                  type="button"
                  onClick={() => void handleResetDebugMatchHistory()}
                  className="min-h-[40px] w-full rounded-lg border border-orange-200/40 bg-orange-500/15 px-3 py-2 text-xs font-bold text-orange-100"
                >
                  🧹 デバッグ対戦履歴リセット
                </button>
                <button
                  type="button"
                  onClick={() => void handleDeleteDebugParticipants()}
                  className="min-h-[40px] w-full rounded-lg border border-rose-300/40 bg-rose-500/15 px-3 py-2 text-xs font-bold text-rose-100"
                >
                  🗑️ デバッグ参加者全削除
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowJoinUrlQr((prev) => !prev);
                setJoinUrlCopyStatus("");
              }}
              className="mb-3 min-h-[44px] w-full rounded-xl border border-cyan-300/50 bg-cyan-500/15 px-4 py-2 text-sm font-bold text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.25)]"
            >
              {showJoinUrlQr ? "参加者URLのQRを閉じる" : "参加者URLのQRを表示"}
            </button>
            {showJoinUrlQr ? (
              <div className="mb-4 rounded-xl border border-cyan-300/35 bg-slate-950/55 p-4">
                <div className="flex justify-center">
                  <div className="rounded-xl bg-white p-3">
                    <QRCodeCanvas value={participantJoinUrl} size={220} />
                  </div>
                </div>
                <p className="mt-3 break-all text-xs text-cyan-100">
                  {participantJoinUrl}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleCopyJoinUrl()}
                    className="min-h-[40px] flex-1 rounded-lg border border-cyan-300/45 bg-cyan-500/20 px-3 py-2 text-xs font-bold text-cyan-100"
                  >
                    URLをコピー
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowJoinUrlQr(false)}
                    className="min-h-[40px] flex-1 rounded-lg border border-gray-400/40 bg-white/10 px-3 py-2 text-xs font-bold text-gray-200"
                  >
                    閉じる
                  </button>
                </div>
                {joinUrlCopyStatus ? (
                  <p className="mt-2 text-xs text-cyan-200">{joinUrlCopyStatus}</p>
                ) : null}
              </div>
            ) : null}
            <p className="mb-4 text-sm text-gray-300">
              交流会・大会を含む参加者データ、卓情報、ラウンド情報を削除して初期化します。
            </p>
            <button
              type="button"
              onClick={() => void handleGlobalReset()}
              className="min-h-[52px] w-full rounded-xl bg-gradient-to-r from-violet-600 to-fuchsia-600 px-4 py-3 text-base font-bold text-white shadow-[0_0_18px_rgba(168,85,247,0.55)]"
            >
              全体リセット
            </button>
            <button
              type="button"
              onClick={() => router.push("/admin/messages")}
              className="mt-3 min-h-[48px] w-full rounded-xl border border-cyan-300/45 bg-cyan-500/18 px-4 py-3 text-sm font-bold text-cyan-100 shadow-[0_0_14px_rgba(34,211,238,0.2)]"
            >
              お問い合わせ
            </button>
          </div>
        }
        tournamentSlot={
          <div className="space-y-5 text-gray-300">
      {latestMatch?.matchType === "individual-swiss" &&
      latestMatch.individualRound != null ? (
        <div
          style={{
            textAlign: "center",
            marginBottom: 16,
            fontSize: 22,
            fontWeight: "bold",
            color: "#ffffff",
            letterSpacing: "0.02em",
          }}
        >
          Round {latestMatch.individualRound}
        </div>
      ) : null}
      {latestMatch?.matchType === "team-random" && (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      gap: 20,
      marginBottom: 20,
      fontWeight: "bold",
      fontSize: 18,
      color: "#ffffff",
    }}
  >
    

    <div style={{
  display: "grid",
  gridTemplateColumns: "1fr 1fr auto",
  gap: 12,
  alignItems: "stretch"
}}>
  
  <div
  onClick={() => setSelectedTeam(selectedTeam === "A" ? null : "A")}
  style={{
    background: "rgba(56, 189, 248, 0.2)",
    border: "1px solid rgba(56, 189, 248, 0.45)",
    color: "#ffffff",
    padding: "12px 16px",
    borderRadius: 12,
    fontSize: 16,
    fontWeight: "bold",
    whiteSpace: "nowrap",
    textAlign: "center",
    cursor: "pointer",
  }}
>
  チームA：{teamWinCounts.A}勝
</div>
<div
  onClick={() => setSelectedTeam(selectedTeam === "B" ? null : "B")}
  style={{
    background: "rgba(244, 114, 182, 0.2)",
    border: "1px solid rgba(244, 114, 182, 0.45)",
    color: "#ffffff",
    padding: "12px 16px",
    borderRadius: 12,
    fontSize: 16,
    fontWeight: "bold",
    whiteSpace: "nowrap",
    textAlign: "center",
    cursor: "pointer",
  }}
>
  チームB：{teamWinCounts.B}勝
</div>

<button
  onClick={handleResetTeamCounts}
  style={{
    padding: "12px 16px",
    borderRadius: 12,
    border: "1px solid rgba(168, 85, 247, 0.45)",
    background: "rgba(255, 255, 255, 0.08)",
    color: "#ffffff",
    cursor: "pointer",
    fontSize: 16,
    fontWeight: "bold",
    whiteSpace: "nowrap",
    minWidth: 96
  }}
>
  リセット
</button>

{selectedTeam && (
  <div
    style={{
      marginTop: 16,
      marginBottom: 20,
      padding: 16,
      border: "1px solid rgba(168, 85, 247, 0.35)",
      borderRadius: 12,
      background: "rgba(255, 255, 255, 0.08)",
      boxShadow: "0 0 20px rgba(168, 85, 247, 0.2)",
      color: "#e5e7eb",
    }}
  >
    <div style={{ fontWeight: "bold", marginBottom: 10, color: "#ffffff" }}>
      {selectedTeam === "A" ? "チームAメンバー" : "チームBメンバー"}
    </div>

    {teamMembers[selectedTeam].length === 0 ? (
      <div>まだチーム戦の卓振りがありません</div>
    ) : (
      <div style={{ display: "grid", gap: 8 }}>
        {teamMembers[selectedTeam].map((name) => (
          <div
            key={name}
            style={{
              padding: "10px 12px",
              border: "1px solid rgba(168, 85, 247, 0.25)",
              borderRadius: 10,
              background: "rgba(255, 255, 255, 0.05)",
              color: "#e5e7eb",
            }}
          >
            {name}
          </div>
        ))}
      </div>
    )}
  </div>
)}
</div>
  </div>
)}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          gap: 10,
          marginBottom: 20,
          flexWrap: "wrap",
        }}
      >
        <button
          onClick={() => setRoundMinutes((prev) => Math.max(1, prev - 1))}
          style={{
            width: 42,
            height: 42,
            border: "1px solid rgba(168, 85, 247, 0.45)",
            borderRadius: 8,
            backgroundColor: "rgba(255, 255, 255, 0.1)",
            color: "#ffffff",
            fontSize: 20,
            cursor: "pointer",
          }}
        >
          −
        </button>

        <div
          style={{
            minWidth: 90,
            textAlign: "center",
            fontSize: 20,
            fontWeight: "bold",
            color: "#ffffff",
          }}
        >
          {roundMinutes}分
        </div>

        <button
          onClick={() => setRoundMinutes((prev) => Math.min(30, prev + 1))}
          style={{
            width: 42,
            height: 42,
            border: "1px solid rgba(168, 85, 247, 0.45)",
            borderRadius: 8,
            backgroundColor: "rgba(255, 255, 255, 0.1)",
            color: "#ffffff",
            fontSize: 20,
            cursor: "pointer",
          }}
        >
          ＋
        </button>
      </div>

      <div
  style={{
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12,
    marginBottom: 30,
  }}
      >
        <button
          type="button"
          onClick={() => void handleIndividualSwissRound()}
          disabled={saving}
          style={{
            height: 56,
            width: "100%",
            fontSize: 16,
            border: "none",
            borderRadius: 10,
            backgroundImage: "linear-gradient(to right, #f97316, #ec4899)",
            boxShadow: "0 0 20px rgba(255, 120, 0, 0.45)",
            color: "white",
            cursor: saving ? "not-allowed" : "pointer",
            opacity: saving ? 0.7 : 1,
          }}
        >
          個人戦
        </button>
        <button
  type="button"
  onClick={() => void handleTeamRandomMatch()}
  disabled={saving}
  style={{
    height: 56,
    width: "100%",
    fontSize: 16,
    border: "none",
    borderRadius: 10,
    backgroundImage: "linear-gradient(to right, #16a34a, #059669)",
    boxShadow: "0 0 18px rgba(34, 197, 94, 0.45)",
    color: "white",
    cursor: saving ? "not-allowed" : "pointer",
    opacity: saving ? 0.7 : 1,
  }}
>
  チーム戦
</button>
        {latestMatch ? (
          <button
            type="button"
            onClick={() => void handleStartRound()}
            disabled={startingRound}
            style={{
              gridColumn: "1 / -1",
              height: 56,
              width: "100%",
              fontSize: 16,
              border: "none",
              borderRadius: 10,
              backgroundImage: "linear-gradient(to right, #3b82f6, #6366f1)",
              boxShadow: "0 0 20px rgba(59, 130, 246, 0.5)",
              color: "white",
              cursor: startingRound ? "not-allowed" : "pointer",
              opacity: startingRound ? 0.7 : 1,
            }}
          >
            {startingRound ? "開始中..." : "ラウンド開始"}
          </button>
        ) : null}
      </div>

      <div>
        <h2 className="mb-4 text-center text-lg font-bold text-white">
          直近の卓振り結果
        </h2>

        {!latestMatch ? (
          <p className="text-center text-gray-300">まだ保存履歴はありません</p>
        ) : (
          <div
            style={{
              border: "1px solid rgba(168, 85, 247, 0.35)",
              borderRadius: 12,
              padding: 14,
              backgroundColor: "rgba(255, 255, 255, 0.08)",
              boxShadow: "0 0 20px rgba(168, 85, 247, 0.25)",
              backdropFilter: "blur(8px)",
            }}
          >
            <div style={{ marginBottom: 16, fontWeight: "bold", color: "#ffffff" }}>
              卓振り種別：
              {latestMatch.matchType === "individual-swiss"
                ? `個人戦（ラウンド制）${
                    latestMatch.individualRound != null
                      ? ` · Round ${latestMatch.individualRound}`
                      : ""
                  }`
                : latestMatch.matchType === "rank-priority"
                  ? "個人戦(階級優先)"
                  : latestMatch.matchType === "team-random"
                    ? "チーム戦(階級優先)"
                    : "完全ランダム戦"}
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr",
                gap: 16,
              }}
            >
              {latestMatch.tables.map((table) => {
                const status = getStatusLabel(table);
                const winnerName =
                  table.winnerId === table.player1?.id
                    ? table.player1?.name
                    : table.winnerId === table.player2?.id
                    ? table.player2?.name
                    : null;

                const pendingName = getPendingPlayerName(table);

                return (
                  <div
                    key={table.tableNumber}
                    style={{
                      border: "1px solid rgba(168, 85, 247, 0.3)",
                      borderRadius: 10,
                      padding: 16,
                      backgroundColor: "rgba(15, 23, 42, 0.45)",
                    }}
                  >
                    <div style={{ fontWeight: "bold", marginBottom: 8, color: "#ffffff" }}>
                      卓{table.tableNumber}
                    </div>

                    <div
                      style={{
                        marginBottom: 10,
                        fontWeight: "bold",
                        color: status.color,
                      }}
                    >
                      状態：{status.text}
                    </div>

                    <div style={{ marginBottom: 8, color: "#d1d5db" }}>
                      種別：{renderTypeLabel(table.type)}
                    </div>

                    <div
  style={{
    ...getPlayerBoxStyle(
      table.player1?.id,
      table.pendingWinnerId,
      table.winnerId
    ),
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
  }}
>
  1人目：
  {table.player1 ? (
   <>
   <div style={{ fontWeight: "bold" }}>
     {table.player1.name}
   </div>
 
   <div>
     {table.player1Team && `（${table.player1Team}）`}
     {`（${table.player1.rank}）`}
   </div>
 
   {/* 👇追加 */}
   <div style={{ fontSize: 12, color: "#9ca3af" }}>
     {playStyleLine(
       normalizePlayStyle({
         playStyle: table.player1.playStyle,
         tags: table.player1.tags,
       })
     )}
     {badgesEmojiCompact(
       normalizePlayerBadges(table.player1 as unknown as Record<string, unknown>)
     ) ? (
       <span style={{ marginLeft: 6 }}>
         {badgesEmojiCompact(
           normalizePlayerBadges(table.player1 as unknown as Record<string, unknown>)
         )}
       </span>
     ) : null}
   </div>
 </>
  ) : (
    "空席"
  )}
</div>

<div
  style={{
    ...getPlayerBoxStyle(
      table.player2?.id,
      table.pendingWinnerId,
      table.winnerId
    ),
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
  }}
>
  2人目：
  {table.player2 ? (
    <>
      <div style={{ fontWeight: "bold" }}>{table.player2.name}</div>
      <div>
        {table.player2Team && `（${table.player2Team}）`}
        {`（${table.player2.rank}）`}
      </div>
      <div style={{ fontSize: 12, color: "#9ca3af" }}>
        {playStyleLine(
          normalizePlayStyle({
            playStyle: table.player2.playStyle,
            tags: table.player2.tags,
          })
        )}
        {badgesEmojiCompact(
          normalizePlayerBadges(table.player2 as unknown as Record<string, unknown>)
        ) ? (
          <span style={{ marginLeft: 6 }}>
            {badgesEmojiCompact(
              normalizePlayerBadges(table.player2 as unknown as Record<string, unknown>)
            )}
          </span>
        ) : null}
      </div>
    </>
  ) : (
    table.winnerId && latestMatch.matchType === "individual-swiss"
      ? "不戦勝（輪空）"
      : "不在"
  )}
</div>

                    {pendingName && !winnerName && (
                      <div
                        style={{
                          marginBottom: 12,
                          padding: 10,
                          borderRadius: 8,
                          backgroundColor: "rgba(251, 146, 60, 0.12)",
                          border: "1px solid rgba(251, 146, 60, 0.45)",
                          color: "#e5e7eb",
                        }}
                      >
                        <div style={{ color: "#fb923c", fontWeight: "bold", marginBottom: 6 }}>
                          勝利申請中：{pendingName}
                        </div>

                        {table.reportedWinnerSide !== null &&
                          table.reportedWinnerSide !== undefined &&
                          table.reportedLoserSide !== null &&
                          table.reportedLoserSide !== undefined && (
                            <div style={{ marginBottom: 4 }}>
                              申請サイド：{table.reportedWinnerSide}-{table.reportedLoserSide}
                            </div>
                          )}

                        <div style={{ marginBottom: 4 }}>
                          申請者デッキ：{table.reportedWinnerDeck || "未入力"}
                        </div>
                        <div>相手デッキ：{table.reportedOpponentDeck || "未入力"}</div>
                      </div>
                    )}

                    {winnerName && (
                      <div style={{ marginBottom: 10, color: "#4ade80", fontWeight: "bold" }}>
                        正式勝者：{winnerName}
                      </div>
                    )}

                    {!table.started && !table.winnerId && (
                      <button
                        onClick={() => handleStartMatch(table.tableNumber)}
                        disabled={savingTableNumber === table.tableNumber}
                        style={{
                          padding: "10px 14px",
                          border: "none",
                          borderRadius: 8,
                          backgroundImage: "linear-gradient(to right, #3b82f6, #6366f1)",
                          boxShadow: "0 0 14px rgba(59, 130, 246, 0.45)",
                          color: "white",
                          cursor: "pointer",
                          marginRight: 8,
                          marginBottom: 10,
                        }}
                      >
                        対戦開始
                      </button>
                    )}

                    {!winnerName && pendingName && (
                      <button
                        onClick={() => handleApproveWinner(table.tableNumber)}
                        disabled={savingTableNumber === table.tableNumber}
                        style={{
                          padding: "10px 14px",
                          border: "none",
                          borderRadius: 8,
                          backgroundImage: "linear-gradient(to right, #22c55e, #059669)",
                          boxShadow: "0 0 14px rgba(34, 197, 94, 0.45)",
                          color: "white",
                          cursor: "pointer",
                          marginRight: 8,
                          marginBottom: 10,
                        }}
                      >
                        承認
                      </button>
                    )}

                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                      {table.player1 && (
                        <button
                          onClick={() => handleChangeWinner(table.tableNumber, table.player1!.id)}
                          disabled={savingTableNumber === table.tableNumber}
                          style={{
                            padding: "10px 14px",
                            border: "none",
                            borderRadius: 8,
                            backgroundImage: "linear-gradient(to right, #f97316, #ec4899)",
                            boxShadow: "0 0 12px rgba(249, 115, 22, 0.4)",
                            color: "white",
                            cursor: "pointer",
                          }}
                        >
                          {table.player1.name} を勝者にする
                        </button>
                      )}

                      {table.player2 && (
                        <button
                          onClick={() => handleChangeWinner(table.tableNumber, table.player2!.id)}
                          disabled={savingTableNumber === table.tableNumber}
                          style={{
                            padding: "10px 14px",
                            borderRadius: 8,
                            background: "rgba(255, 255, 255, 0.12)",
                            border: "1px solid rgba(168, 85, 247, 0.4)",
                            boxShadow: "0 0 12px rgba(168, 85, 247, 0.25)",
                            color: "#ffffff",
                            cursor: "pointer",
                          }}
                        >
                          {table.player2.name} を勝者にする
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
          </div>
        }
      />
      {badgeEditorLoading ? (
        <div
          className="modal z-[70] flex items-center justify-center bg-black/40 text-sm font-bold text-white"
          role="status"
          aria-live="polite"
        >
          読み込み中…
        </div>
      ) : null}
      {badgeEditor ? (
        <div
          className="modal z-[70] flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="admin-special-attr-editor-title"
        >
          <button
            type="button"
            aria-label="特別属性の設定を閉じる"
            className="absolute inset-0 bg-black/55"
            disabled={badgeEditorBusy}
            onClick={() => !badgeEditorBusy && setBadgeEditor(null)}
          />
          <div
            className={`relative z-10 w-full max-w-md rounded-t-3xl p-5 ring-1 ring-inset ring-white/10 sm:rounded-2xl sm:p-6 ${POKABU_ADMIN_GLASS}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="admin-special-attr-editor-title"
              className="text-lg font-extrabold tracking-tight text-white"
            >
              特別属性の設定
            </h2>
            <p className="mt-1 text-xs font-medium leading-snug text-gray-400">
              主催・運営・初参加・常連・おにぎりから1つ（またはなし）。マッチングには使いません。
            </p>
            <p className="mt-2 text-sm font-medium text-gray-300">{badgeEditor.name}</p>
            <div className="mt-4">
              <CasualBadgeSelect
                value={badgeEditor.draft}
                onPick={(next) =>
                  setBadgeEditor((prev) =>
                    prev ? { ...prev, draft: next } : null
                  )
                }
              />
            </div>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                disabled={badgeEditorBusy}
                onClick={() => void saveBadgeEditor()}
                className="rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 px-4 py-3 text-center text-sm font-extrabold text-white shadow-[0_0_18px_rgba(16,185,129,0.35)] disabled:opacity-60"
              >
                {badgeEditorBusy ? "保存中…" : "保存"}
              </button>
              <button
                type="button"
                disabled={badgeEditorBusy}
                onClick={() => setBadgeEditor(null)}
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-bold text-gray-200 disabled:opacity-60"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {announcementResetDialogOpen ? (
        <div
          className="modal z-[70] flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="announcement-reset-dialog-title"
        >
          <button
            type="button"
            aria-label="お知らせリセットの確認を閉じる"
            className="absolute inset-0 bg-black/55"
            disabled={announcementResetDeleting}
            onClick={() =>
              !announcementResetDeleting && setAnnouncementResetDialogOpen(false)
            }
          />
          <div
            className={`relative z-10 w-full max-w-md rounded-t-3xl p-5 ring-1 ring-inset ring-white/10 sm:rounded-2xl sm:p-6 ${POKABU_ADMIN_GLASS}`}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="announcement-reset-dialog-title"
              className="text-lg font-extrabold tracking-tight text-white"
            >
              お知らせリセット
            </h2>
            <p className="mt-3 text-sm font-medium leading-relaxed text-gray-200">
              本当にすべてのお知らせを削除しますか？
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row-reverse">
              <button
                type="button"
                disabled={announcementResetDeleting}
                onClick={() => void handleConfirmDeleteAllAnnouncements()}
                className="rounded-xl bg-gradient-to-r from-rose-600 to-red-600 px-4 py-3 text-center text-sm font-extrabold text-white shadow-[0_0_18px_rgba(225,29,72,0.35)] disabled:opacity-60"
              >
                {announcementResetDeleting ? "削除中…" : "削除する"}
              </button>
              <button
                type="button"
                disabled={announcementResetDeleting}
                onClick={() => setAnnouncementResetDialogOpen(false)}
                className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm font-bold text-gray-200 disabled:opacity-60"
              >
                キャンセル
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}