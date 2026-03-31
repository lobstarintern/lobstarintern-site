export const dynamic = "force-dynamic";

const WALLETS: Record<string, string> = {
  intern: "8iBF33H1oxo2QQWLY1yzHXs2zyaPRtopPGbphuRGfsZq",
  wilde: "83XBMJZEgQ13ZPFTaLr1ktNkUDHVmWpZRMN7AL7BXxnS",
};

const LOBSTAR_MINT = "AVF9F4C4j8b1Kh4BmNHqybDaHgnZpJ7W7yLvL7hUpump";

interface RawAccountData {
  account: string;
  nativeBalanceChange: number;
  tokenBalanceChanges: Array<{
    userAccount: string;
    tokenAccount: string;
    rawTokenAmount: { tokenAmount: string; decimals: number };
    mint: string;
  }>;
}

interface RawTransaction {
  signature: string;
  timestamp: number;
  type: string;
  source: string;
  description: string;
  fee: number;
  feePayer: string;
  nativeTransfers: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    amount: number;
  }>;
  tokenTransfers: Array<{
    fromUserAccount: string;
    toUserAccount: string;
    tokenAmount: number;
    mint: string;
  }>;
  accountData: RawAccountData[];
  events: Record<string, unknown>;
}

function processTransaction(tx: RawTransaction, walletAddress: string) {
  // Find net SOL change for this wallet
  const walletAccount = tx.accountData?.find(
    (a) => a.account === walletAddress,
  );
  const solChange = walletAccount
    ? walletAccount.nativeBalanceChange / 1e9
    : 0;

  // Find token balance changes for this wallet
  const tokenChanges: Array<{
    mint: string;
    amount: number;
    decimals: number;
  }> = [];
  if (walletAccount?.tokenBalanceChanges) {
    for (const tc of walletAccount.tokenBalanceChanges) {
      tokenChanges.push({
        mint: tc.mint,
        amount:
          parseFloat(tc.rawTokenAmount.tokenAmount) /
          Math.pow(10, tc.rawTokenAmount.decimals),
        decimals: tc.rawTokenAmount.decimals,
      });
    }
  }
  // Also check other accounts for token changes involving our wallet
  for (const acct of tx.accountData ?? []) {
    if (acct.account === walletAddress) continue;
    for (const tc of acct.tokenBalanceChanges ?? []) {
      if (tc.userAccount === walletAddress) {
        if (!tokenChanges.find((t) => t.mint === tc.mint)) {
          tokenChanges.push({
            mint: tc.mint,
            amount:
              parseFloat(tc.rawTokenAmount.tokenAmount) /
              Math.pow(10, tc.rawTokenAmount.decimals),
            decimals: tc.rawTokenAmount.decimals,
          });
        }
      }
    }
  }

  // Detect LOBSTAR buy: SOL goes out, LOBSTAR comes in
  const lobstarChange = tokenChanges.find((tc) => tc.mint === LOBSTAR_MINT);
  const isLobstarBuy =
    solChange < -0.001 && lobstarChange && lobstarChange.amount > 0;
  const isLobstarSell =
    solChange > 0.001 && lobstarChange && lobstarChange.amount < 0;

  // Extract native transfers relevant to this wallet
  const nativeTransfers = (tx.nativeTransfers ?? [])
    .filter(
      (nt) =>
        nt.fromUserAccount === walletAddress ||
        nt.toUserAccount === walletAddress,
    )
    .map((nt) => ({
      from: nt.fromUserAccount,
      to: nt.toUserAccount,
      amount: nt.amount / 1e9,
    }));

  // Extract token transfers relevant to this wallet
  const tokenTransfers = (tx.tokenTransfers ?? [])
    .filter(
      (tt) =>
        tt.fromUserAccount === walletAddress ||
        tt.toUserAccount === walletAddress,
    )
    .map((tt) => ({
      from: tt.fromUserAccount ?? "",
      to: tt.toUserAccount ?? "",
      amount: tt.tokenAmount,
      mint: tt.mint,
    }));

  return {
    signature: tx.signature,
    timestamp: tx.timestamp,
    type: tx.type || "UNKNOWN",
    source: tx.source || "",
    description: tx.description || "",
    fee: tx.fee / 1e9,
    feePayer: tx.feePayer,
    solChange,
    tokenChanges,
    nativeTransfers,
    tokenTransfers,
    isLobstarBuy: !!isLobstarBuy,
    isLobstarSell: !!isLobstarSell,
    lobstarAmount: lobstarChange?.amount ?? 0,
    solAmount: Math.abs(solChange),
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wallet = searchParams.get("wallet") || "intern";
  const address = WALLETS[wallet];

  if (!address) {
    return Response.json({ error: "Invalid wallet" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${process.env.HELIUS_API_KEY}&limit=30`,
      { cache: "no-store" },
    );

    if (!res.ok) throw new Error(`Helius API error: ${res.status}`);
    const raw: RawTransaction[] = await res.json();

    const transactions = raw.map((tx) => processTransaction(tx, address));

    return Response.json({
      wallet,
      address,
      transactions,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
