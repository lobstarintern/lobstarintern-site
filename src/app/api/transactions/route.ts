export const dynamic = "force-dynamic";

const WALLETS: Record<string, string> = {
  intern: "8iBF33H1oxo2QQWLY1yzHXs2zyaPRtopPGbphuRGfsZq",
  wilde: "83XBMJZEgQ13ZPFTaLr1ktNkUDHVmWpZRMN7AL7BXxnS",
};

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
        // Check we haven't already added this
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
      `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${process.env.HELIUS_API_KEY}&limit=15`,
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
