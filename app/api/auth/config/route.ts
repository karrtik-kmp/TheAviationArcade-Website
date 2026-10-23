import { firebaseSettings } from "@/lib/firebase-config";
import { demoLogin } from "@/lib/demo-server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const host = new URL(request.url).host;
    return Response.json({ ...firebaseSettings(host), demoLogin: demoLogin(host) }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { error: "Authentication configuration is unavailable." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
