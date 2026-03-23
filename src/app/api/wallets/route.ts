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

async function rpc(method: string, params: unknown[]) {
  const url = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
  const res = await fetch(url, {
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

async function fetchPrices(): Promise<{ sol: number; lobstar: number }> {
  const [solPrice, lobstarPrice] = await Promise.all([
    (async () => {
      try {
        const res = await fetch(
          "https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd",
          { cache: "no-store" },
        );
        if (!res.ok) return 0;
        const json = await res.json();
        return json?.solana?.usd ?? 0;
      } catch {
        return 0;
      }
    })(),
    (async () => {
      try {
        const res = await fetch(
          `https://api.dexscreener.com/latest/dex/tokens/${LOBSTAR_MINT}`,
          { cache: "no-store" },
        );
        if (!res.ok) return 0;
        const json = await res.json();
        const pair = json?.pairs?.[0];
        return parseFloat(pair?.priceUsd ?? "0");
      } catch {
        return 0;
      }
    })(),
  ]);
  return { sol: solPrice, lobstar: lobstarPrice };
}

export async function GET() {
  try {
    const [internBal, wildeBal, internTokens, wildeTokens, prices] =
      await Promise.all([
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
        fetchPrices(),
      ]);

    const parseTokenAmount = (result: { value?: Array<{ account: { data: { parsed: { info: { tokenAmount: { uiAmount: number } } } } } }> }) => {
      const accounts = result?.value;
      if (!accounts?.length) return 0;
      return accounts[0].account.data.parsed.info.tokenAmount.uiAmount ?? 0;
    };

    const internSol = (internBal?.value ?? 0) / 1e9;
    const wildeSol = (wildeBal?.value ?? 0) / 1e9;
    const internLobstar = parseTokenAmount(internTokens);
    const wildeLobstar = parseTokenAmount(wildeTokens);

    return Response.json({
      timestamp: new Date().toISOString(),
      solPrice: prices.sol,
      lobstarPrice: prices.lobstar,
      intern: {
        label: WALLETS.intern.label,
        address: WALLETS.intern.address,
        sol: internSol,
        solUsd: internSol * prices.sol,
        lobstar: internLobstar,
        lobstarUsd: internLobstar * prices.lobstar,
      },
      wilde: {
        label: WALLETS.wilde.label,
        address: WALLETS.wilde.address,
        sol: wildeSol,
        solUsd: wildeSol * prices.sol,
        lobstar: wildeLobstar,
        lobstarUsd: wildeLobstar * prices.lobstar,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
