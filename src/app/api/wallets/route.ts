export const dynamic = "force-dynamic";

const WALLETS = {
  intern: {
    address: "8iBF33H1oxo2QQWLY1yzHXs2zyaPRtopPGbphuRGfsZq",
    label: "LobstarIntern.sol",
  },
  wilde: {
    address: "83XBMJZEgQ13ZPFTaLr1ktNkUDHVmWpZRMN7AL7BXxnS",
    label: "LobstarWilde.sol",
  },
};

const LOBSTAR_MINT = "AVF9F4C4j8b1Kh4BmNHqybDaHgnZpJ7W7yLvL7hUpump";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

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

async function das(method: string, params: Record<string, unknown>) {
  const res = await fetch(HELIUS_RPC(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json();
  return json.result;
}

interface MarketData {
  price: number;
  priceChange: { m5: number; h1: number; h6: number; h24: number };
  volume: { h1: number; h6: number; h24: number };
  marketCap: number;
  liquidity: number;
}

const emptyMarket: MarketData = {
  price: 0,
  priceChange: { m5: 0, h1: 0, h6: 0, h24: 0 },
  volume: { h1: 0, h6: 0, h24: 0 },
  marketCap: 0,
  liquidity: 0,
};

async function fetchMarketAndSolPrice(): Promise<{
  sol: number;
  lobstar: MarketData;
}> {
  const [solRes, dexRes] = await Promise.all([
    fetch(
      "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
      { cache: "no-store" },
    ).catch(() => null),
    fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${LOBSTAR_MINT}`,
      { cache: "no-store" },
    ).catch(() => null),
  ]);

  let solPrice = 0;
  if (solRes?.ok) {
    const json = await solRes.json();
    solPrice = json?.solana?.usd ?? 0;
  }

  let lobstar = emptyMarket;
  if (dexRes?.ok) {
    const json = await dexRes.json();
    const pair = json?.pairs?.[0];
    if (pair) {
      lobstar = {
        price: parseFloat(pair.priceUsd ?? "0"),
        priceChange: {
          m5: pair.priceChange?.m5 ?? 0,
          h1: pair.priceChange?.h1 ?? 0,
          h6: pair.priceChange?.h6 ?? 0,
          h24: pair.priceChange?.h24 ?? 0,
        },
        volume: {
          h1: pair.volume?.h1 ?? 0,
          h6: pair.volume?.h6 ?? 0,
          h24: pair.volume?.h24 ?? 0,
        },
        marketCap: pair.fdv ?? 0,
        liquidity: pair.liquidity?.usd ?? 0,
      };
    }
  }

  return { sol: solPrice, lobstar };
}

export async function GET() {
  try {
    const [
      internBal,
      wildeBal,
      internLobstarAcct,
      wildeLobstarAcct,
      internAllTokens,
      wildeAllTokens,
      internNfts,
      wildeNfts,
      prices,
    ] = await Promise.all([
      rpc("getBalance", [WALLETS.intern.address]),
      rpc("getBalance", [WALLETS.wilde.address]),
      rpc("getTokenAccountsByOwner", [
        WALLETS.intern.address,
        { mint: LOBSTAR_MINT },
        { encoding: "jsonParsed" },
      ]),
      rpc("getTokenAccountsByOwner", [
        WALLETS.wilde.address,
        { mint: LOBSTAR_MINT },
        { encoding: "jsonParsed" },
      ]),
      rpc("getTokenAccountsByOwner", [
        WALLETS.intern.address,
        { programId: TOKEN_PROGRAM },
        { encoding: "jsonParsed" },
      ]),
      rpc("getTokenAccountsByOwner", [
        WALLETS.wilde.address,
        { programId: TOKEN_PROGRAM },
        { encoding: "jsonParsed" },
      ]),
      das("getAssetsByOwner", {
        ownerAddress: WALLETS.intern.address,
        page: 1,
        limit: 1,
      }),
      das("getAssetsByOwner", {
        ownerAddress: WALLETS.wilde.address,
        page: 1,
        limit: 1,
      }),
      fetchMarketAndSolPrice(),
    ]);

    const parseTokenAmount = (
      result: {
        value?: Array<{
          account: {
            data: {
              parsed: {
                info: { tokenAmount: { uiAmount: number } };
              };
            };
          };
        }>;
      },
    ) => {
      const accounts = result?.value;
      if (!accounts?.length) return 0;
      return (
        accounts[0].account.data.parsed.info.tokenAmount.uiAmount ?? 0
      );
    };

    const internSol = (internBal?.value ?? 0) / 1e9;
    const wildeSol = (wildeBal?.value ?? 0) / 1e9;
    const internLobstar = parseTokenAmount(internLobstarAcct);
    const wildeLobstar = parseTokenAmount(wildeLobstarAcct);

    return Response.json({
      timestamp: new Date().toISOString(),
      solPrice: prices.sol,
      market: prices.lobstar,
      intern: {
        label: WALLETS.intern.label,
        address: WALLETS.intern.address,
        sol: internSol,
        solUsd: internSol * prices.sol,
        lobstar: internLobstar,
        lobstarUsd: internLobstar * prices.lobstar.price,
        tokenAccounts: internAllTokens?.value?.length ?? 0,
        nfts: internNfts?.total ?? 0,
      },
      wilde: {
        label: WALLETS.wilde.label,
        address: WALLETS.wilde.address,
        sol: wildeSol,
        solUsd: wildeSol * prices.sol,
        lobstar: wildeLobstar,
        lobstarUsd: wildeLobstar * prices.lobstar.price,
        tokenAccounts: wildeAllTokens?.value?.length ?? 0,
        nfts: wildeNfts?.total ?? 0,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
