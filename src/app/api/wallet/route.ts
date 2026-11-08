import { getWalletStatus } from "@/lib/server/actions";
import { getDeps } from "@/lib/server/deps";
import { toErrorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getWalletStatus(getDeps()));
  } catch (err) {
    return toErrorResponse(err);
  }
}
