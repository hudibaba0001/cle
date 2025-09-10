import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  console.log("DEBUG: Test endpoint reached");
  try {
    const body = await req.json();
    console.log("DEBUG: Body received:", body);
    return NextResponse.json({ ok: true, received: body });
  } catch (error) {
    console.log("DEBUG: Error:", error);
    return NextResponse.json({ error: "Failed", details: error }, { status: 500 });
  }
}

export async function GET() {
  console.log("DEBUG: Test GET endpoint reached");
  return NextResponse.json({ ok: true, message: "Test endpoint working" });
}
