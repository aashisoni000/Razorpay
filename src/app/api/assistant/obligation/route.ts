import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { explainObligation, getAssistantStatus } from "@/lib/services/assistant-service";

const RequestSchema = z.object({
  obligationId: z.string().min(1, "obligationId is required"),
});

export async function POST(request: NextRequest) {
  const status = getAssistantStatus();
  if (!status.configured) {
    return NextResponse.json(
      {
        success: false,
        error: "Assistant unavailable — configure an AI provider (OPENAI_API_KEY or ANTHROPIC_API_KEY).",
      },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const parsed = RequestSchema.parse(body);

    const result = await explainObligation(parsed.obligationId);

    return NextResponse.json({
      success: true,
      data: {
        explanation: result.explanation,
        provider: result.provider,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: "Invalid input", details: error.issues },
        { status: 400 }
      );
    }

    if (message === "Obligation not found") {
      return NextResponse.json(
        { success: false, error: "Obligation not found" },
        { status: 404 }
      );
    }

    if (message.includes("not configured") || message.includes("API error")) {
      return NextResponse.json(
        { success: false, error: `Provider error: ${message}` },
        { status: 502 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
