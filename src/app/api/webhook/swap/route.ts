export const dynamic = "force-dynamic";

const WILDE_ADDRESS = "83XBMJZEgQ13ZPFTaLr1ktNkUDHVmWpZRMN7AL7BXxnS";
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
const TG_CHAT_ID = process.env.TG_CHAT_ID;

const KV_URL = () => process.env.KV_REST_API_URL!;
const KV_TOKEN = () => process.env.KV_REST_API_TOKEN!;

const KNOWN_MINTS: Record<string, string> = {
  So11111111111111111111111111111111111111112: "SOL",
  AVF9F4C4j8b1Kh4BmNHqybDaHgnZpJ7W7yLvL7hUpump: "$LOBSTAR",
};

function mintName(mint: string): string {
  return KNOWN_MINTS[mint] || mint.slice(0, 8) + "...";
}

interface SwapTx {
  signature: string;
  timestamp: number;
  source: string;
  description: string;
  accountData?: Array<{
    account: string;
    nativeBalanceChange: number;
    tokenBalanceChanges: Array<{
      mint: string;
      rawTokenAmount: { tokenAmount: string; decimals: number };
    }>;
  }>;
}

function parseSwap(tx: SwapTx) {
  const walletData = tx.accountData?.find(
    (a) => a.account === WILDE_ADDRESS,
  );

  const solChange = (walletData?.nativeBalanceChange ?? 0) / 1e9;
  const tokenChanges =
    walletData?.tokenBalanceChanges?.map((tc) => ({
      mint: tc.mint,
      name: mintName(tc.mint),
      amount:
        parseFloat(tc.rawTokenAmount.tokenAmount) /
        Math.pow(10, tc.rawTokenAmount.decimals),
    })) ?? [];

  // Also check other accounts for token changes involving wilde wallet
  for (const acct of tx.accountData ?? []) {
    if (acct.account === WILDE_ADDRESS) continue;
    for (const tc of acct.tokenBalanceChanges ?? []) {
      if (!tokenChanges.find((t) => t.mint === tc.mint)) {
        tokenChanges.push({
          mint: tc.mint,
          name: mintName(tc.mint),
          amount:
            parseFloat(tc.rawTokenAmount.tokenAmount) /
            Math.pow(10, tc.rawTokenAmount.decimals),
        });
      }
    }
  }

  return { solChange, tokenChanges, signature: tx.signature, source: tx.source, description: tx.description, timestamp: tx.timestamp };
}

async function sendTelegram(text: string) {
  if (!TG_BOT_TOKEN || !TG_CHAT_ID) return;
  await fetch(
    `https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: TG_CHAT_ID,
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
      }),
    },
  );
}

async function storeInKV(swap: Record<string, unknown>) {
  await fetch(KV_URL(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify([
      "LPUSH",
      "pending_swap_alerts",
      JSON.stringify(swap),
    ]),
  });
  // Expire after 1 hour in case nothing picks it up
  await fetch(KV_URL(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${KV_TOKEN()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(["EXPIRE", "pending_swap_alerts", 3600]),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    // Helius sends an array of transactions
    const transactions: SwapTx[] = Array.isArray(body) ? body : [body];

    for (const tx of transactions) {
      const swap = parseSwap(tx);

      // Format changes for display
      const changes: string[] = [];
      if (swap.solChange !== 0) {
        const sign = swap.solChange > 0 ? "+" : "";
        changes.push(`${sign}${swap.solChange.toFixed(4)} SOL`);
      }
      for (const tc of swap.tokenChanges) {
        const sign = tc.amount > 0 ? "+" : "";
        changes.push(`${sign}${tc.amount.toLocaleString()} ${tc.name}`);
      }

      const changeStr = changes.join(" | ") || "details on Solscan";

      // Send Telegram alert
      const tgMsg =
        `🔔 <b>LobstarWilde.sol SWAP</b>\n\n` +
        `${changeStr}\n` +
        `Source: ${swap.source || "Unknown"}\n` +
        `${swap.description ? swap.description + "\n" : ""}` +
        `\n<a href="https://solscan.io/tx/${swap.signature}">View on Solscan</a>` +
        `\n<a href="https://solscan.io/account/${WILDE_ADDRESS}">Wallet</a>`;

      await Promise.all([
        sendTelegram(tgMsg),
        storeInKV({
          signature: swap.signature,
          solChange: swap.solChange,
          tokenChanges: swap.tokenChanges,
          source: swap.source,
          description: swap.description,
          timestamp: swap.timestamp,
          alertedAt: new Date().toISOString(),
        }),
      ]);
    }

    return Response.json({ received: transactions.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

// GET for health check
export async function GET() {
  return Response.json({ status: "ok", watching: WILDE_ADDRESS });
}
