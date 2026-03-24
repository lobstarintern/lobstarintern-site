export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ---------------------------------------------------------------------------
// Known addresses
// ---------------------------------------------------------------------------

const HACKER_WALLETS: Record<string, string> = {
  "2NurbsXSFyvdWZUuiPEDmT7ad2GxYAP2YYDRq176ct7u": "origin",
  "8REpwxrWDGi4KsbHNnCfQimBAy6j57nqeN8wGZGE3tsB": "intermediary",
  GfiVHZfX8op1QJzNNktrsjhL7yag33oRR6gfPpjEqgP4: "creator",
  "4AV2Qzp3N4c9RfzyEbNZs2wqWfW4EwKnnxFAZCndvfGh": "drain / privacycash_pool",
  HJpdKEAxoxauv19jEtL3tiZgmrP9uPQfB5wTAdEmFzru: "satellite1",
  FWBgQsiHdmbZhVrJnE6DpeLnotuTRSPAahFBrU3troDc: "satellite2",
  FqtA2BSoJ3KpJCjz5NV6XJDMNcRTADPtELjJuLExqjqh: "satellite3",
  AF8VuwCncKd5ZBnLYYnMjqh4vLch8mjqE75sFe5ZjRFW: "privacycash_relayer",
};

const KNOWN_LABELS: Record<string, string> = {
  ...HACKER_WALLETS,
  "83XBMJZEgQ13ZPFTaLr1ktNkUDHVmWpZRMN7AL7BXxnS": "LobstarWilde.sol",
  "8iBF33H1oxo2QQWLY1yzHXs2zyaPRtopPGbphuRGfsZq": "LobstarIntern.sol",
};

const PROGRAM_ADDRESSES = new Set([
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // SPL Token
  "11111111111111111111111111111111", // System Program
  "ComputeBudget111111111111111111111111111111", // Compute Budget
  "9fhQBbumKEFuXtMBDw8AaQyAjCorLGJQiS3skWZdQyQD", // Mixer
  "L2TExMFKdjpN9kozasaurPirfHy9P8sbXoAN1qA3S95", // Lighthouse
  "pAMMBay6oceH9fJKBRHGP5D4bD4sWpmSwMn52FMfXEA", // PumpSwap
]);

const DUST_THRESHOLD_SOL = 0.001;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GraphNode {
  id: string;
  label: string;
  type: "hacker" | "known" | "unknown";
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

const CACHE_KEY = "graph_cache";
const CACHE_TTL = "900"; // 15 minutes

// ---------------------------------------------------------------------------
// Helius fetcher
// ---------------------------------------------------------------------------

async function fetchTransactions(
  address: string,
  apiKey: string,
): Promise<HeliusTransaction[]> {
  const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${apiKey}&limit=50`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    console.error(`Helius error for ${address}: ${res.status}`);
    return [];
  }
  return res.json();
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

    const hackerLabel = HACKER_WALLETS[address];
    const knownLabel = KNOWN_LABELS[address];

    nodeMap.set(address, {
      id: address,
      label: knownLabel ?? address.slice(0, 4) + "..." + address.slice(-4),
      type: hackerLabel ? "hacker" : knownLabel ? "known" : "unknown",
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

    // Filter dust
    if (token === "SOL" && amount < DUST_THRESHOLD_SOL) return;
    if (amount === 0) return;

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

    // Fetch transactions for all hacker wallets in parallel
    const addresses = Object.keys(HACKER_WALLETS);
    const txArrays = await Promise.all(
      addresses.map((addr) => fetchTransactions(addr, apiKey)),
    );

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

    // Cache for 15 minutes
    await kvCommand(["SET", CACHE_KEY, JSON.stringify(result), "EX", CACHE_TTL]);

    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
