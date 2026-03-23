export const dynamic = "force-dynamic";

const WALLETS: Record<string, string> = {
  intern: "8iBF33H1oxo2QQWLY1yzHXs2zyaPRtopPGbphuRGfsZq",
  wilde: "83XBMJZEgQ13ZPFTaLr1ktNkUDHVmWpZRMN7AL7BXxnS",
};

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
    const transactions = await res.json();

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
