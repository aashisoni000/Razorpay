import { Prisma } from "@prisma/client";
import { TransactionClient } from "./types";
import { ExceptionInputSchema } from "../domain/validation";

export async function createException(
  tx: TransactionClient,
  input: unknown
) {
  const parsed = ExceptionInputSchema.parse(input);

  return tx.exception.create({
    data: {
      obligationId: parsed.obligationId ?? undefined,
      type: parsed.type,
      description: parsed.description,
      payload: (parsed.payload as Prisma.InputJsonValue) ?? undefined,
    },
  });
}

export async function getOpenExceptions(tx: TransactionClient) {
  return tx.exception.findMany({
    where: { status: "OPEN" },
    orderBy: { createdAt: "desc" },
  });
}
