export const dynamic = "force-dynamic";

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

export async function POST() {
  try {
    const count = await kvCommand(["INCR", "page_views"]);
    return Response.json({ views: count });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const count = await kvCommand(["GET", "page_views"]);
    return Response.json({ views: parseInt(String(count ?? "0"), 10) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return Response.json({ error: message }, { status: 500 });
  }
}
