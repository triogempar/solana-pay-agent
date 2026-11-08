import { getDeps } from "@/lib/server/deps";
import { toErrorResponse } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const contacts = await getDeps().contacts.list();
    return Response.json({ contacts });
  } catch (err) {
    return toErrorResponse(err);
  }
}
