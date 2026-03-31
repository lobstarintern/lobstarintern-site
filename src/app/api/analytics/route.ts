export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WALLET_ADDRESS = "83XBMJZEgQ13ZPFTaLr1ktNkUDHVmWpZRMN7AL7BXxnS";
const CACHE_KEY = "analytics_wallet_v1";
const CACHE_TTL = "3600"; // 1 hour

// ---------------------------------------------------------------------------
// KV helpers (same pattern as graph/views routes)
// ---------------------------------------------------------------------------

const KV_URL = () => process.env.KV_REST_API_URL!;
const KV_TOKEN = () => process.env.KV_REST_API_TOKEN!;

async function kvCommand(command: string[]): Promise<unknown> {
  const res = await fetch(`${KV_URL()}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(command),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`KV error: ${res.status}`);
  const json = await res.json();
  return json.result;
}

// ---------------------------------------------------------------------------
// Helius types
// ---------------------------------------------------------------------------

interface HeliusNativeTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  amount: number; // lamports
}

interface HeliusTokenTransfer {
  fromUserAccount: string;
  toUserAccount: string;
  tokenAmount: number;
  mint: string;
}

interface HeliusTransaction {
  signature: string;
  timestamp: number;
  type: string;
  source: string;
  fee: number;
  feePayer: string;
  nativeTransfers?: HeliusNativeTransfer[];
  tokenTransfers?: HeliusTokenTransfer[];
  accountData?: Array<{
    account: string;
    nativeBalanceChange: number;
  }>;
}

// ---------------------------------------------------------------------------
// Fetcher — paginate through Helius enhanced transactions
// ---------------------------------------------------------------------------

async function fetchAllTransactions(
  apiKey: string,
  maxPages: number = 10,
): Promise<HeliusTransaction[]> {
  const allTxs: HeliusTransaction[] = [];
  let before: string | undefined;

  for (let page = 0; page < maxPages; page++) {
    let url = `https://api.helius.xyz/v0/addresses/${WALLET_ADDRESS}/transactions?api-key=${apiKey}&limit=100`;
    if (before) url += `&before=${before}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error(`Helius analytics error: ${res.status}`);
      break;
    }
    const txs: HeliusTransaction[] = await res.json();
    if (txs.length === 0) break;

    allTxs.push(...txs);
    before = txs[txs.length - 1].signature;
    if (txs.length < 100) break;
  }

  return allTxs;
}

// ---------------------------------------------------------------------------
// Analytics computation
// ---------------------------------------------------------------------------

interface DayStats {
  date: string; // YYYY-MM-DD
  inflowSol: number;
  outflowSol: number;
  balanceChange: number;
}

interface AddressFlow {
  address: string;
  transfers: number;
  totalSol: number;
}

interface AnalyticsResult {
  transferCount: number;
  firstTxDate: string;
  activeAgeDays: number;
  uniqueDaysActive: number;
  longestStreak: number;
  dailyStats: DayStats[]; // last 7 days
  topInflow: AddressFlow[];
  topOutflow: AddressFlow[];
  balanceHistory: { date: string; balance: number }[];
  timestamp: string;
  cached?: boolean;
}

function computeAnalytics(txs: HeliusTransaction[]): AnalyticsResult {
  if (txs.length === 0) {
    return {
      transferCount: 0,
      firstTxDate: "",
      activeAgeDays: 0,
      uniqueDaysActive: 0,
      longestStreak: 0,
      dailyStats: [],
      topInflow: [],
      topOutflow: [],
      balanceHistory: [],
      timestamp: new Date().toISOString(),
    };
  }

  // Sort by timestamp ascending
  const sorted = [...txs].sort((a, b) => a.timestamp - b.timestamp);

  // Transfer count: count txs with native or token transfers involving our wallet
  let transferCount = 0;
  for (const tx of sorted) {
    const hasNative = tx.nativeTransfers?.some(
      (nt) =>
        nt.fromUserAccount === WALLET_ADDRESS ||
        nt.toUserAccount === WALLET_ADDRESS,
    );
    const hasToken = tx.tokenTransfers?.some(
      (tt) =>
        tt.fromUserAccount === WALLET_ADDRESS ||
        tt.toUserAccount === WALLET_ADDRESS,
    );
    if (hasNative || hasToken) transferCount++;
  }

  // First tx date & active age
  const firstTs = sorted[0].timestamp;
  const firstTxDate = new Date(firstTs * 1000).toISOString().split("T")[0];
  const activeAgeDays = Math.floor(
    (Date.now() / 1000 - firstTs) / 86400,
  );

  // Unique days active & longest streak
  const activeDaysSet = new Set<string>();
  for (const tx of sorted) {
    const day = new Date(tx.timestamp * 1000).toISOString().split("T")[0];
    activeDaysSet.add(day);
  }
  const uniqueDaysActive = activeDaysSet.size;

  // Longest streak
  const activeDaysSorted = Array.from(activeDaysSet).sort();
  let longestStreak = 0;
  let currentStreak = 1;
  for (let i = 1; i < activeDaysSorted.length; i++) {
    const prev = new Date(activeDaysSorted[i - 1]);
    const curr = new Date(activeDaysSorted[i]);
    const diffDays = (curr.getTime() - prev.getTime()) / 86400000;
    if (diffDays === 1) {
      currentStreak++;
    } else {
      longestStreak = Math.max(longestStreak, currentStreak);
      currentStreak = 1;
    }
  }
  longestStreak = Math.max(longestStreak, currentStreak);

  // Last 7 days daily stats
  const now = new Date();
  const last7: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    last7.push(d.toISOString().split("T")[0]);
  }

  const dayMap = new Map<string, DayStats>();
  for (const day of last7) {
    dayMap.set(day, { date: day, inflowSol: 0, outflowSol: 0, balanceChange: 0 });
  }

  // Inflow/outflow address tracking
  const inflowMap = new Map<string, AddressFlow>();
  const outflowMap = new Map<string, AddressFlow>();

  for (const tx of sorted) {
    const day = new Date(tx.timestamp * 1000).toISOString().split("T")[0];
    const stats = dayMap.get(day);

    // Process native transfers
    if (tx.nativeTransfers) {
      for (const nt of tx.nativeTransfers) {
        const solAmount = nt.amount / 1e9;
        if (solAmount < 0.0001) continue; // skip dust

        if (nt.toUserAccount === WALLET_ADDRESS && nt.fromUserAccount !== WALLET_ADDRESS) {
          // Inflow
          if (stats) {
            stats.inflowSol += solAmount;
            stats.balanceChange += solAmount;
          }
          const existing = inflowMap.get(nt.fromUserAccount);
          if (existing) {
            existing.transfers++;
            existing.totalSol += solAmount;
          } else {
            inflowMap.set(nt.fromUserAccount, {
              address: nt.fromUserAccount,
              transfers: 1,
              totalSol: solAmount,
            });
          }
        }

        if (nt.fromUserAccount === WALLET_ADDRESS && nt.toUserAccount !== WALLET_ADDRESS) {
          // Outflow
          if (stats) {
            stats.outflowSol += solAmount;
            stats.balanceChange -= solAmount;
          }
          const existing = outflowMap.get(nt.toUserAccount);
          if (existing) {
            existing.transfers++;
            existing.totalSol += solAmount;
          } else {
            outflowMap.set(nt.toUserAccount, {
              address: nt.toUserAccount,
              transfers: 1,
              totalSol: solAmount,
            });
          }
        }
      }
    }
  }

  const dailyStats = last7.map((d) => dayMap.get(d)!);

  // Build approximate balance history from daily balance changes
  // Start from 0 and accumulate (relative, not absolute)
  let runningBalance = 0;
  const balanceHistory = dailyStats.map((d) => {
    runningBalance += d.balanceChange;
    return { date: d.date, balance: Math.max(0, runningBalance) };
  });

  // Top inflow / outflow by total SOL
  const topInflow = Array.from(inflowMap.values())
    .sort((a, b) => b.totalSol - a.totalSol)
    .slice(0, 7);
  const topOutflow = Array.from(outflowMap.values())
    .sort((a, b) => b.totalSol - a.totalSol)
    .slice(0, 7);

  return {
    transferCount,
    firstTxDate,
    activeAgeDays,
    uniqueDaysActive,
    longestStreak,
    dailyStats,
    topInflow,
    topOutflow,
    balanceHistory,
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "1";

    // Check cache first
    if (!forceRefresh) {
      try {
        const cached = (await kvCommand(["GET", CACHE_KEY])) as string | null;
        if (cached) {
          const data = JSON.parse(cached);
          data.cached = true;
          return Response.json(data);
        }
      } catch {
        // KV unavailable, proceed without cache
      }
    }

    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) {
      return Response.json(
        { error: "HELIUS_API_KEY not configured" },
        { status: 500 },
      );
    }

    const txs = await fetchAllTransactions(apiKey);
    const result = computeAnalytics(txs);

    // Cache for 1 hour
    try {
      await kvCommand([
        "SET",
        CACHE_KEY,
        JSON.stringify(result),
        "EX",
        CACHE_TTL,
      ]);
    } catch {
      // KV unavailable, skip caching
    }

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
