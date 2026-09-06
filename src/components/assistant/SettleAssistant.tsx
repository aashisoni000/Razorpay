"use client";

import { useState, useRef, useEffect, type FormEvent } from "react";
import Image from "next/image";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const FAQ: { question: string; answer: string }[] = [
  {
    question: "Why did Settle stop recovery for this obligation?",
    answer:
      "Recovery was stopped because the full outstanding amount has already been recovered. There's nothing left to collect, so another payment request isn't needed.",
  },
  {
    question: "Why is this payment showing as unresolved?",
    answer:
      "Settle couldn't confidently link this payment to a single obligation. Since the match isn't clear enough, recovery is paused instead of risking a payment against the wrong obligation.",
  },
];

const FAQ_MAP = new Map(FAQ.map((f) => [f.question, f.answer]));

const WELCOME_MESSAGE: Message = {
  id: "welcome",
  role: "assistant",
  content:
    "Hello! I'm the Settle assistant. Ask me anything about your recovery pipeline, obligations, or payment events.",
  timestamp: new Date(),
};

const PLACEHOLDER_RESPONSE =
  "Settle's assistant is ready to connect to the recovery intelligence layer.";

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2">
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:-0.3s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce [animation-delay:-0.15s]" />
      <span className="w-1.5 h-1.5 rounded-full bg-text-muted animate-bounce" />
    </div>
  );
}

export function SettleAssistant() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const delayRef = useRef(1400);

  useEffect(() => {
    delayRef.current = 1200 + Math.random() * 800;
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, thinking]);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  function sendQuestion(question: string) {
    if (thinking) return;

    const userMsg: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: question,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setThinking(true);

    setTimeout(() => {
      const response = FAQ_MAP.get(question) ?? PLACEHOLDER_RESPONSE;
      const assistantMsg: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMsg]);
      setThinking(false);
    }, delayRef.current);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;
    sendQuestion(trimmed);
  }

  const showSuggestions = messages.length === 1;

  return (
    <>
      {/* Chat Panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[400px] max-w-[calc(100vw-3rem)]">
          <div className="bg-surface rounded-2xl border border-border-subtle shadow-2xl flex flex-col h-[520px] max-h-[calc(100vh-8rem)] overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-border-subtle bg-surface-muted">
              <div className="w-8 h-8 rounded-lg bg-sidebar-bg flex items-center justify-center overflow-hidden flex-shrink-0">
                <Image
                  src="/logo.svg"
                  alt="Settle"
                  width={20}
                  height={20}
                  className="object-contain"
                />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-text-primary">
                  Settle Assistant
                </h3>
                <p className="text-[10px] text-text-muted uppercase tracking-wide">
                  Revenue Recovery Intelligence
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-border-subtle transition-colors"
                aria-label="Close assistant"
              >
                <svg
                  className="w-4 h-4 text-text-muted"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-sidebar-bg text-white"
                        : "bg-surface-muted border border-border-subtle text-text-primary"
                    }`}
                  >
                    {msg.content}
                  </div>
                </div>
              ))}

              {/* Suggestion chips */}
              {showSuggestions && !thinking && (
                <div className="space-y-2 pt-1">
                  {FAQ.map((faq) => (
                    <button
                      key={faq.question}
                      onClick={() => sendQuestion(faq.question)}
                      className="w-full text-left px-4 py-2.5 rounded-xl border border-border-subtle bg-surface-muted text-xs text-text-secondary hover:bg-accent-muted hover:border-accent/30 hover:text-text-primary transition-colors"
                    >
                      {faq.question}
                    </button>
                  ))}
                </div>
              )}

              {thinking && (
                <div className="flex justify-start">
                  <div className="bg-surface-muted border border-border-subtle rounded-xl">
                    <ThinkingDots />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form
              onSubmit={handleSubmit}
              className="px-5 py-4 border-t border-border-subtle"
            >
              <div className="flex items-center gap-2">
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about obligations, recovery, events..."
                  disabled={thinking}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-surface-muted border border-border-subtle text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent/50 focus:ring-1 focus:ring-accent/20 transition-colors disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || thinking}
                  className="p-2.5 rounded-xl bg-sidebar-bg text-white hover:bg-sidebar-bg/90 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label="Send message"
                >
                  <svg
                    className="w-4 h-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
                  </svg>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Launcher Button */}
      <button
        onClick={() => setOpen(!open)}
        className={`fixed bottom-6 right-6 z-50 w-16 h-16 rounded-2xl shadow-lg flex items-center justify-center transition-all duration-200 hover:scale-105 hover:shadow-xl ${
          open
            ? "bg-surface border border-border-subtle rotate-0"
            : "bg-accent hover:bg-accent/90 shadow-[0_4px_20px_rgba(200,217,108,0.45)]"
        }`}
        aria-label={open ? "Close assistant" : "Open assistant"}
      >
        {open ? (
          <svg
            className="w-5 h-5 text-text-primary"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        ) : (
          <Image
            src="/logo.svg"
            alt="Settle"
            width={36}
            height={36}
            className="object-contain"
          />
        )}
      </button>
    </>
  );
}
