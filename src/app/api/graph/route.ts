export const dynamic = "force-dynamic";
export const maxDuration = 120;

// ---------------------------------------------------------------------------
// Tracked wallets — @LobstarWilde ecosystem
// ---------------------------------------------------------------------------

const MAIN_WALLET: Record<string, string> = {
  "83XBMJZEgQ13ZPFTaLr1ktNkUDHVmWpZRMN7AL7BXxnS": "LobstarWilde.sol",
};

const SECONDARY_WALLETS: Record<string, string> = {
  // Received LOBSTAR from main wallet
  EpTPPrqzQUgtJaZ7XUUiK3nuHe1MusbjLiQuJx3kNnL6: "Received 52.4M LOBSTAR (emptied)",
  FkfkYhEgnx17RAeYHKiryZd593MGvyFz2ztam1J6Z3qS: "Received 2.6M LOBSTAR (emptied)",
  // SOL flows — funded main wallet
  "3CG2wcUgoEiDVqVWpnDY3Hw1DeSUH9TYdkAdZqUBEJLW": "Sent ~767 SOL to main",
  HcSfojgcRWT1vMvoo6LtoX53evc8jSWfjvSHQsWnt219: "Sent ~408 SOL to main",
  // SOL flows — received from main wallet
  "2jy3ifDeda5qmvyP91jEd6dFJ4k3Yj6ZqqEHp1Lb6igT": "Received ~844 SOL",
  "3CB3VvNoWo2v1SEMDoRJgjAUBGvNBQRfTMiRdC2wcsqV": "Received 694 SOL",
};

const KNOWN_LABELS: Record<string, string> = {
  ...MAIN_WALLET,
  ...SECONDARY_WALLETS,
};

const PROGRAM_ADDRESSES = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // SPL Token
  "11111111111111111111111111111111", // System Program
  "ComputeBudget111111111111111111111111111111", // Compute Budget
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA", // PumpSwap program
  "AADJrfmWoHVXZhF1UkbHvNC5tqrBpkGdSaxtMYteDm2x", // PumpSwap LOBSTAR pool
  "4b3Q2hMmeimC3D8xgPXwH9NGnYw6ZLdLAdik6RdgTPXy", // LOBSTAR token account (pool)
  "D16sRA7AgPqhPhRVoyvNHtJJPXjfccH5JTZhnr1MDWwo", // Token program variant
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

const CACHE_KEY = "graph_wallet_tracker_v9";
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

    // Only show transfers where BOTH sides are tracked wallets
    const trackedAddresses = new Set(Object.keys(KNOWN_LABELS));
    if (!trackedAddresses.has(from) || !trackedAddresses.has(to)) return;

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

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get("refresh") === "1";

    // Check cache first (skip if refresh requested)
    if (!forceRefresh) {
      const cached = (await kvCommand(["GET", CACHE_KEY])) as string | null;
      if (cached) {
        const data = JSON.parse(cached);
        data.cached = true;
        return Response.json(data);
      }
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

    // Add verified historical edges that Helius can't reach (too old for enhanced API)
    const LOBSTAR_MINT = "AVF9F4C4j8b1Kh4BmNHqybDaHgnZpJ7W7yLvL7hUpump";
    const historicalEdges: Array<{ from: string; to: string; amount: number; token: string; count: number; signatures: string[] }> = [
      {
        from: "83XBMJZEgQ13ZPFTaLr1ktNkUDHVmWpZRMN7AL7BXxnS",
        to: "EpTPPrqzQUgtJaZ7XUUiK3nuHe1MusbjLiQuJx3kNnL6",
        amount: 52_439_284, token: LOBSTAR_MINT, count: 1,
        signatures: ["44y5FBM1aiHV83cv76eNQ4tQR3dnk8krjZBb9jwGrDEZLE5FCzeBX9Xi3wHRfTB6eFtJU7a5XvM1pz5AxTor2A4U"],
      },
    ];
    for (const he of historicalEdges) {
      // Add nodes if not present
      if (!result.nodes.find((n: GraphNode) => n.id === he.from)) {
        const label = KNOWN_LABELS[he.from] || he.from.slice(0, 4) + "..." + he.from.slice(-4);
        result.nodes.push({ id: he.from, label, type: MAIN_WALLET[he.from] ? "main" : SECONDARY_WALLETS[he.from] ? "secondary" : "unknown" });
      }
      if (!result.nodes.find((n: GraphNode) => n.id === he.to)) {
        const label = KNOWN_LABELS[he.to] || he.to.slice(0, 4) + "..." + he.to.slice(-4);
        result.nodes.push({ id: he.to, label, type: MAIN_WALLET[he.to] ? "main" : SECONDARY_WALLETS[he.to] ? "secondary" : "unknown" });
      }
      // Add edge if not present
      if (!result.edges.find((e: GraphEdge) => e.from === he.from && e.to === he.to && e.token === he.token)) {
        result.edges.push(he);
      }
    }

    // Cache for 1 hour
    await kvCommand(["SET", CACHE_KEY, JSON.stringify(result), "EX", CACHE_TTL]);

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
