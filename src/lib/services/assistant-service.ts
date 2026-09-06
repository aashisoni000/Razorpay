import { prisma } from "@/lib/db";
import { formatPaise } from "@/lib/utils/money";

export interface AssistantExplanation {
  explanation: string;
  provider: string;
}

function buildObligationContext(obligation: {
  id: string;
  originalAmountPaise: bigint;
  recoveredAmountPaise: bigint;
  refundedAmountPaise: bigint;
  outstandingAmountPaise: bigint;
  excessAmountPaise: bigint;
  status: string;
  sourceReference: string | null;
  customer: { name: string };
  auditEntries: {
    eventType: string;
    decision: string | null;
    reasonCode: string | null;
    timestamp: Date;
  }[];
  recoveryActions: {
    type: string;
    status: string;
    amountPaise: bigint;
    razorpayPaymentLinkId: string | null;
  }[];
  exceptions: {
    type: string;
    description: string;
    status: string;
  }[];
  paymentEvents: {
    type: string;
    amountPaise: bigint;
    occurredAt: Date;
  }[];
}): string {
  const lastDecision = obligation.auditEntries
    .filter((e) => e.decision)
    .pop();

  const lines = [
    `Obligation ID: ${obligation.id}`,
    `Customer: ${obligation.customer.name}`,
    `Source: ${obligation.sourceReference ?? "N/A"}`,
    `Status: ${obligation.status}`,
    ``,
    `Financial State:`,
    `- Original amount: ${formatPaise(obligation.originalAmountPaise)}`,
    `- Recovered: ${formatPaise(obligation.recoveredAmountPaise)}`,
    `- Refunded: ${formatPaise(obligation.refundedAmountPaise)}`,
    `- Outstanding: ${formatPaise(obligation.outstandingAmountPaise)}`,
    `- Excess: ${formatPaise(obligation.excessAmountPaise)}`,
    ``,
  ];

  if (lastDecision) {
    lines.push(
      `Last Decision: ${lastDecision.decision} (${lastDecision.reasonCode?.replace(/_/g, " ") ?? "no reason"})`,
      `Decision Time: ${lastDecision.timestamp.toISOString()}`,
      ``
    );
  }

  if (obligation.paymentEvents.length > 0) {
    lines.push(`Payment Events (${obligation.paymentEvents.length}):`);
    for (const e of obligation.paymentEvents) {
      lines.push(
        `  - ${e.type}: ${formatPaise(e.amountPaise)} on ${e.occurredAt.toISOString().slice(0, 10)}`
      );
    }
    lines.push(``);
  }

  if (obligation.recoveryActions.length > 0) {
    lines.push(`Recovery Actions (${obligation.recoveryActions.length}):`);
    for (const a of obligation.recoveryActions) {
      lines.push(
        `  - ${a.type} (${a.status}): ${formatPaise(a.amountPaise)}${a.razorpayPaymentLinkId ? ` [${a.razorpayPaymentLinkId}]` : ""}`
      );
    }
    lines.push(``);
  }

  if (obligation.exceptions.length > 0) {
    lines.push(`Exceptions (${obligation.exceptions.length}):`);
    for (const ex of obligation.exceptions) {
      lines.push(`  - ${ex.type} (${ex.status}): ${ex.description}`);
    }
    lines.push(``);
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT = `You are explaining an existing financial state to a human operator.

Use only the supplied structured facts. Do not speculate. Do not invent missing information. Do not recommend financial actions. Do not modify any data. Do not create, cancel, retry, or refund anything.

If the supplied facts are insufficient, say so.

Respond in 2-4 concise sentences. Use the currency amounts directly. Reference specific events or decisions from the timeline when relevant.`;

async function callOpenAI(context: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY not configured");

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: context },
      ],
      max_tokens: 256,
      temperature: 0.1,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "No explanation generated.";
}

async function callAnthropic(context: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY not configured");

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 256,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: context }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic API error: ${res.status}`);
  }

  const data = await res.json();
  return data.content?.[0]?.text ?? "No explanation generated.";
}

export async function explainObligation(
  obligationId: string
): Promise<AssistantExplanation> {
  const obligation = await prisma.obligation.findUnique({
    where: { id: obligationId },
    include: {
      customer: true,
      auditEntries: {
        orderBy: { timestamp: "asc" },
        select: {
          eventType: true,
          decision: true,
          reasonCode: true,
          timestamp: true,
        },
      },
      recoveryActions: {
        orderBy: { createdAt: "asc" },
        select: {
          type: true,
          status: true,
          amountPaise: true,
          razorpayPaymentLinkId: true,
        },
      },
      exceptions: {
        orderBy: { createdAt: "desc" },
        select: { type: true, description: true, status: true },
      },
      paymentEvents: {
        orderBy: { occurredAt: "asc" },
        select: { type: true, amountPaise: true, occurredAt: true },
      },
    },
  });

  if (!obligation) {
    throw new Error("Obligation not found");
  }

  const context = buildObligationContext(obligation);

  if (process.env.OPENAI_API_KEY) {
    const explanation = await callOpenAI(context);
    return { explanation, provider: "openai" };
  }

  if (process.env.ANTHROPIC_API_KEY) {
    const explanation = await callAnthropic(context);
    return { explanation, provider: "anthropic" };
  }

  throw new Error("No AI provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.");
}

export function getAssistantStatus(): {
  configured: boolean;
  provider: string | null;
} {
  if (process.env.OPENAI_API_KEY) {
    return { configured: true, provider: "openai" };
  }
  if (process.env.ANTHROPIC_API_KEY) {
    return { configured: true, provider: "anthropic" };
  }
  return { configured: false, provider: null };
}
