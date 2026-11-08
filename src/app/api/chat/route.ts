import { handleChat } from "@/lib/server/actions";
import { getDeps } from "@/lib/server/deps";
import { toErrorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { messages?: unknown };
    const result = await handleChat(getDeps(), body.messages);
    return Response.json(result);
  } catch (err) {
    return toErrorResponse(err);
  }
}
