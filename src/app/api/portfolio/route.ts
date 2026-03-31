export const dynamic = "force-dynamic";

const WILDE_ADDRESS = "83XBMJZEgQ13ZPFTaLr1ktNkUDHVmWpZRMN7AL7BXxnS";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const TOKEN_2022_PROGRAM = "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb";

const HELIUS_RPC = () =>
  `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;

async function rpc(method: string, params: unknown[]) {
  const res = await fetch(HELIUS_RPC(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`RPC error: ${res.status}`);
  const json = await res.json();
  if (json.error) throw new Error(json.error.message);
  return json.result;
}

interface ParsedTokenAccount {
  account: {
    data: {
      parsed: {
        info: {
          mint: string;
          tokenAmount: {
            uiAmount: number;
            decimals: number;
            amount: string;
          };
        };
      };
    };
  };
}

interface DASAsset {
  id: string;
  content?: {
    metadata?: {
      name?: string;
      symbol?: string;
    };
  };
  token_info?: {
    symbol?: string;
    decimals?: number;
    price_info?: {
      price_per_token?: number;
      total_price?: number;
      currency?: string;
    };
  };
}

export async function GET() {
  try {
    // Get all token accounts for both programs
    const [splTokens, token2022] = await Promise.all([
      rpc("getTokenAccountsByOwner", [
        WILDE_ADDRESS,
        { programId: TOKEN_PROGRAM },
        { encoding: "jsonParsed" },
      ]),
      rpc("getTokenAccountsByOwner", [
        WILDE_ADDRESS,
        { programId: TOKEN_2022_PROGRAM },
        { encoding: "jsonParsed" },
      ]).catch(() => ({ value: [] })),
    ]);

    const allAccounts: ParsedTokenAccount[] = [
      ...(splTokens?.value ?? []),
      ...(token2022?.value ?? []),
    ];

    // Extract token holdings with nonzero balances
    const holdings = allAccounts
      .map((acct) => {
        const info = acct.account.data.parsed.info;
        return {
          mint: info.mint,
          balance: info.tokenAmount.uiAmount ?? 0,
          decimals: info.tokenAmount.decimals,
          rawAmount: info.tokenAmount.amount,
        };
      })
      .filter((h) => h.balance > 0);

    // Get metadata via Helius DAS getAssetBatch
    const mints = holdings.map((h) => h.mint);
    let metadata: Record<string, { name: string; symbol: string; pricePerToken: number; totalPrice: number }> = {};

    if (mints.length > 0) {
      // DAS getAssetBatch supports up to 1000 IDs
      const batchSize = 100;
      const batches: string[][] = [];
      for (let i = 0; i < mints.length; i += batchSize) {
        batches.push(mints.slice(i, i + batchSize));
      }

      const results = await Promise.all(
        batches.map(async (batch) => {
          try {
            const res = await fetch(HELIUS_RPC(), {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                jsonrpc: "2.0",
                id: 1,
                method: "getAssetBatch",
                params: { ids: batch },
              }),
              cache: "no-store",
            });
            if (!res.ok) return [];
            const json = await res.json();
            return (json.result ?? []) as DASAsset[];
          } catch {
            return [];
          }
        }),
      );

      for (const batch of results) {
        for (const asset of batch) {
          if (asset?.id) {
            metadata[asset.id] = {
              name: asset.content?.metadata?.name ?? asset.token_info?.symbol ?? "",
              symbol: asset.token_info?.symbol ?? asset.content?.metadata?.symbol ?? "",
              pricePerToken: asset.token_info?.price_info?.price_per_token ?? 0,
              totalPrice: asset.token_info?.price_info?.total_price ?? 0,
            };
          }
        }
      }
    }

    // Build response
    const portfolio = holdings.map((h) => {
      const meta = metadata[h.mint];
      return {
        mint: h.mint,
        balance: h.balance,
        decimals: h.decimals,
        name: meta?.name ?? "",
        symbol: meta?.symbol ?? "",
        pricePerToken: meta?.pricePerToken ?? 0,
        valueUsd: meta?.totalPrice ?? 0,
      };
    });

    // Sort by USD value descending, then by balance
    portfolio.sort((a, b) => {
      if (b.valueUsd !== a.valueUsd) return b.valueUsd - a.valueUsd;
      return b.balance - a.balance;
    });

    const totalValue = portfolio.reduce((sum, p) => sum + p.valueUsd, 0);

    return Response.json({
      address: WILDE_ADDRESS,
      totalTokens: portfolio.length,
      totalValueUsd: totalValue,
      holdings: portfolio,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
