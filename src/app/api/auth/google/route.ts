import { NextRequest, NextResponse } from "next/server";
import { generateOAuthUrl } from "@/lib/google-calendar";

export async function GET(req: NextRequest): Promise<NextResponse> {
  const state = req.nextUrl.searchParams.get("state");
  if (!state) return new NextResponse("Missing state", { status: 400 });
  return NextResponse.redirect(generateOAuthUrl(state));
}
