export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ---------------------------------------------------------------------------
// Tracked wallets — @LobstarWilde ecosystem
// ---------------------------------------------------------------------------

const MAIN_WALLET: Record<string, string> = {
  "83XBMJZEgQ13ZPFTaLr1ktNkUDHVmWpZRMN7AL7BXxnS": "LobstarWilde.sol",
};

const SECONDARY_WALLETS: Record<string, string> = {
  C41sWzRvikSo3KH6U8zoejJ7cN5Ctv2ToT5B22U2M4N2: "Secondary A",
  Cv9St5tDTGwpbG5UVvM6QvFmf3FYSXc14W9BYvQN5wAZ: "Secondary B",
  H292B1VbSvD6GuUmSvUvfQstg1Acfzog796uQ7d1ccCw: "Secondary C",
};

const KNOWN_LABELS: Record<string, string> = {
  ...MAIN_WALLET,
  ...SECONDARY_WALLETS,
};

const PROGRAM_ADDRESSES = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // SPL Token
  "11111111111111111111111111111111", // System Program
  "ComputeBudget111111111111111111111111111111", // Compute Budget
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA", // PumpSwap
]);

const DUST_THRESHOLD_SOL = 10; // Only show transfers >= 10 SOL

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GraphNode {
  id: string;
  label: string;
  type: "main" | "secondary" | "unknown";
  balance?: number;
}

interface GraphEdge {
  from: string;
  to: string;
  amount: number;
  token: string;
  signatures: string[];
  count: number;
  timestamp: number;
}

interface GraphResult {
  nodes: GraphNode[];
  edges: GraphEdge[];
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Helius types (subset)
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
  nativeTransfers?: HeliusNativeTransfer[];
  tokenTransfers?: HeliusTokenTransfer[];
}

// ---------------------------------------------------------------------------
// KV helpers
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

const CACHE_KEY = "graph_wallet_tracker_v4";
const CACHE_TTL = "3600"; // 1 hour

// ---------------------------------------------------------------------------
// Helius fetcher
// ---------------------------------------------------------------------------

async function fetchTransactions(
  address: string,
  apiKey: string,
): Promise<HeliusTransaction[]> {
  const allTxs: HeliusTransaction[] = [];
  let before: string | undefined;
  const MAX_PAGES = 10; // Up to 1000 transactions per wallet — full history

  for (let page = 0; page < MAX_PAGES; page++) {
    let url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}&limit=100`;
    if (before) url += `&before=${before}`;

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      console.error(`Helius error for ${address}: ${res.status}`);
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
// Graph builder
// ---------------------------------------------------------------------------

function edgeKey(from: string, to: string, token: string): string {
  return `${from}|${to}|${token}`;
}

function buildGraph(allTxs: HeliusTransaction[]): GraphResult {
  const nodeMap = new Map<string, GraphNode>();
  const edgeMap = new Map<string, GraphEdge>();

  function ensureNode(address: string) {
    if (PROGRAM_ADDRESSES.has(address)) return;
    if (nodeMap.has(address)) return;

    const mainLabel = MAIN_WALLET[address];
    const secondaryLabel = SECONDARY_WALLETS[address];

    let type: GraphNode["type"] = "unknown";
    if (mainLabel) type = "main";
    else if (secondaryLabel) type = "secondary";

    const label =
      mainLabel ?? secondaryLabel ?? address.slice(0, 4) + "..." + address.slice(-4);

    nodeMap.set(address, {
      id: address,
      label,
      type,
    });
  }

  function addEdge(
    from: string,
    to: string,
    amount: number,
    token: string,
    signature: string,
    timestamp: number,
  ) {
    if (PROGRAM_ADDRESSES.has(from) || PROGRAM_ADDRESSES.has(to)) return;
    if (!from || !to || from === to) return;

    if (amount === 0) return;

    // Only show SOL transfers >= 10 SOL between tracked wallets
    const trackedAddresses = new Set(Object.keys(KNOWN_LABELS));
    if (!trackedAddresses.has(from) && !trackedAddresses.has(to)) return;

    // Filter: SOL must be >= threshold, skip random token spam entirely
    if (token === "SOL" && amount < DUST_THRESHOLD_SOL) return;
    // For tokens, only show LOBSTAR transfers, skip all other token spam
    const LOBSTAR_MINT = "AVF9F4C4j8b1Kh4BmNHqybDaHgnZpJ7W7yLvL7hUpump";
    if (token !== "SOL" && token !== LOBSTAR_MINT) return;

    ensureNode(from);
    ensureNode(to);

    const key = edgeKey(from, to, token);
    const existing = edgeMap.get(key);

    if (existing) {
      existing.amount += amount;
      existing.count++;
      if (!existing.signatures.includes(signature)) {
        existing.signatures.push(signature);
      }
      if (timestamp > existing.timestamp) {
        existing.timestamp = timestamp;
      }
    } else {
      edgeMap.set(key, {
        from,
        to,
        amount,
        token,
        signatures: [signature],
        count: 1,
        timestamp,
      });
    }
  }

  for (const tx of allTxs) {
    // Native SOL transfers
    if (tx.nativeTransfers) {
      for (const nt of tx.nativeTransfers) {
        const solAmount = nt.amount / 1e9;
        addEdge(
          nt.fromUserAccount,
          nt.toUserAccount,
          solAmount,
          "SOL",
          tx.signature,
          tx.timestamp,
        );
      }
    }

    // Token transfers
    if (tx.tokenTransfers) {
      for (const tt of tx.tokenTransfers) {
        if (tt.tokenAmount === 0) continue;
        addEdge(
          tt.fromUserAccount,
          tt.toUserAccount,
          tt.tokenAmount,
          tt.mint,
          tx.signature,
          tx.timestamp,
        );
      }
    }
  }

  return {
    nodes: Array.from(nodeMap.values()),
    edges: Array.from(edgeMap.values()),
    fetchedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    // Check cache first
    const cached = (await kvCommand(["GET", CACHE_KEY])) as string | null;
    if (cached) {
      const data = JSON.parse(cached);
      data.cached = true;
      return Response.json(data);
    }

    const apiKey = process.env.HELIUS_API_KEY;
    if (!apiKey) {
      return Response.json({ error: "HELIUS_API_KEY not configured" }, { status: 500 });
    }

    // Fetch full history for main wallet, lighter for secondaries
    const mainAddr = Object.keys(MAIN_WALLET)[0];
    const otherAddrs = Object.keys(SECONDARY_WALLETS);

    const [mainTxs, ...otherTxArrays] = await Promise.all([
      fetchTransactions(mainAddr, apiKey), // Full 1000 tx history
      ...otherAddrs.map((addr) => fetchTransactions(addr, apiKey)),
    ]);
    const txArrays = [mainTxs, ...otherTxArrays];

    // Deduplicate transactions by signature
    const seen = new Set<string>();
    const allTxs: HeliusTransaction[] = [];
    for (const txs of txArrays) {
      for (const tx of txs) {
        if (!seen.has(tx.signature)) {
          seen.add(tx.signature);
          allTxs.push(tx);
        }
      }
    }

    const result = buildGraph(allTxs);

    // Cache for 1 hour
    await kvCommand(["SET", CACHE_KEY, JSON.stringify(result), "EX", CACHE_TTL]);

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
