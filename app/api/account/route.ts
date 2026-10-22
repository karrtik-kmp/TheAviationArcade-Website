import { accountSnapshot } from "@/lib/account-server";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    return Response.json(await accountSnapshot(), {
      headers: {
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return Response.json(
      { error: "Your account status could not be checked. Please try again." },
      {
        status: 503,
        headers: { "Cache-Control": "private, no-store" },
      },
    );
  }
}
