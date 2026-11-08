import { cancelTransfer } from "@/lib/server/actions";
import { getDeps } from "@/lib/server/deps";
import { toErrorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const transfer = await cancelTransfer(getDeps(), id);
    return Response.json({ transfer });
  } catch (err) {
    return toErrorResponse(err);
  }
}
