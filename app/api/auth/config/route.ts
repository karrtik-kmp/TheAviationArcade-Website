import { firebaseSettings } from "@/lib/firebase-config";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    return Response.json(firebaseSettings(new URL(request.url).host), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    return Response.json(
      { error: "Authentication configuration is unavailable." },
      { status: 503, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
