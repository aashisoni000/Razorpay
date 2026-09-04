import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { createRecoveryLink } from "@/lib/services/recovery-service";

const CreateLinkSchema = z.object({
  obligationId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = CreateLinkSchema.parse(body);

    const result = await createRecoveryLink(prisma, {
      obligationId: parsed.obligationId,
    });

    return NextResponse.json({
      success: true,
      data: {
        actionId: result.actionId,
        paymentLinkUrl: result.paymentLinkUrl,
        amountPaise: result.amountPaise.toString(),
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

    if (message.includes("Cannot create")) {
      return NextResponse.json(
        { success: false, error: message },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { success: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
