import { PrismaClient, Prisma } from "@prisma/client";

export interface ExceptionInput {
  obligationId?: string;
  type: string;
  description: string;
  payload?: Record<string, unknown>;
}

export async function createException(
  tx: PrismaClient,
  input: ExceptionInput
) {
  return tx.exception.create({
    data: {
      obligationId: input.obligationId ?? undefined,
      type: input.type as never,
      description: input.description,
      payload: (input.payload as Prisma.InputJsonValue) ?? undefined,
    },
  });
}

export async function getOpenExceptions(tx: PrismaClient) {
  return tx.exception.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });
}
