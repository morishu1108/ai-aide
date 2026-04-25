import { NextRequest, NextResponse } from "next/server";
import { getAuthUrl } from "@/lib/google-calendar";

// Intermediate redirect — LINE opens this in external browser via openExternalBrowser=1,
// then we redirect to Google OAuth (which doesn't accept that parameter).
export async function GET(req: NextRequest): Promise<NextResponse> {
  const groupId = req.nextUrl.searchParams.get("groupId");
  if (!groupId) return new NextResponse("Missing groupId", { status: 400 });

  const url = getAuthUrl(groupId);
  return NextResponse.redirect(url);
}
