/**
 * 大会用「個人戦」ラウンドの自動ペアリング（交流会ロジックとは独立）
 */

export type PairablePlayer = {
  id: string;
  name: string;
  rank: string;
  wins: number;
  opponents: string[];
};

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export type RawPair = {
  tableNumber: number;
  player1: PairablePlayer;
  player2: PairablePlayer | null;
};

/** 1ラウンド目：完全ランダム */
export function pairIndividualRound1(players: PairablePlayer[]): RawPair[] {
  const shuffled = shuffle(players);
  const out: RawPair[] = [];
  let tableNumber = 1;
  for (let i = 0; i < shuffled.length; i += 2) {
    if (i + 1 < shuffled.length) {
      out.push({
        tableNumber: tableNumber++,
        player1: shuffled[i],
        player2: shuffled[i + 1],
      });
    } else {
      out.push({
        tableNumber: tableNumber++,
        player1: shuffled[i],
        player2: null,
      });
    }
  }
  return out;
}

/**
 * 2ラウンド目以降：勝数が近い順に並べ、できるだけ過去対戦相手と組まない
 * 再戦不可が無理なら近い順位の相手と組む
 */
export function pairIndividualRoundN(players: PairablePlayer[]): RawPair[] {
  const sorted = [...players].sort(
    (a, b) => b.wins - a.wins || a.id.localeCompare(b.id)
  );
  const paired = new Set<string>();
  const out: RawPair[] = [];
  let tableNumber = 1;

  for (const p of sorted) {
    if (paired.has(p.id)) continue;
    paired.add(p.id);

    let partner: PairablePlayer | null = null;
    for (const q of sorted) {
      if (paired.has(q.id) || q.id === p.id) continue;
      if (!p.opponents.includes(q.id)) {
        partner = q;
        break;
      }
    }
    if (!partner) {
      for (const q of sorted) {
        if (!paired.has(q.id) && q.id !== p.id) {
          partner = q;
          break;
        }
      }
    }

    if (!partner) {
      out.push({ tableNumber: tableNumber++, player1: p, player2: null });
      continue;
    }
    paired.add(partner.id);
    out.push({ tableNumber: tableNumber++, player1: p, player2: partner });
  }

  return out;
}
