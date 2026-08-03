import { FormEvent, useEffect, useRef, useState } from "react";
import { MessageCircle, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  askChatbot,
  buildGreeting,
  fetchChatbotContext,
  removeChatbaseWidget,
  type ChatbotContext,
} from "@/lib/chatbot";

type ChatMessage = {
  id: string;
  role: "bot" | "user";
  text: string;
  fromDatabase?: boolean;
};

const ReporterHelpChat = () => {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState<ChatbotContext | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const token = localStorage.getItem("token") || "";

  useEffect(() => {
    removeChatbaseWidget();
    if (!token) return;

    void fetchChatbotContext(token).then((data) => {
      setContext(data);
      setMessages([
        {
          id: "greeting",
          role: "bot",
          text: buildGreeting(data),
          fromDatabase: true,
        },
      ]);
    });
  }, [token]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const question = input.trim();
    if (!question || loading) return;

    setInput("");
    setLoading(true);
    setMessages((prev) => [...prev, { id: `u-${Date.now()}`, role: "user", text: question }]);

    try {
      const result = await askChatbot(token, question);
      setMessages((prev) => [
        ...prev,
        {
          id: `b-${Date.now()}`,
          role: "bot",
          text: result.answer,
          fromDatabase: Boolean(result.usedDatabase),
        },
      ]);

      const fresh = await fetchChatbotContext(token);
      if (fresh) setContext(fresh);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          id: `e-${Date.now()}`,
          role: "bot",
          text: error instanceof Error ? error.message : "Could not reach the database chatbot.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-3">
      {open && (
        <div className="w-[min(100vw-2rem,22rem)] overflow-hidden rounded-2xl border border-border/70 bg-white/95 shadow-elevated backdrop-blur-xl animate-fade-up">
          <div className="flex items-start justify-between gap-3 border-b border-primary/10 bg-gradient-to-br from-primary to-secondary px-4 py-3.5 text-primary-foreground">
            <div>
              <p className="font-display text-sm font-semibold">SafeGuard Help</p>
              <p className="mt-0.5 text-xs opacity-90">
                {context
                  ? `${context.fullName} · ${context.reportCount ?? 0} reports · ${context.emergencyCaseCount ?? 0} SOS`
                  : "Connected to your account data"}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 transition-colors hover:bg-primary-foreground/15"
              aria-label="Close help chat"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex h-72 flex-col gap-2.5 overflow-y-auto bg-muted/30 p-3.5">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                  message.role === "user"
                    ? "ml-auto bg-primary text-primary-foreground shadow-soft"
                    : "border border-border/70 bg-white text-foreground shadow-sm"
                }`}
              >
                {message.text}
                {message.role === "bot" && message.fromDatabase && (
                  <p className="mt-1.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    From database
                  </p>
                )}
              </div>
            ))}
            {loading && (
              <div className="max-w-[85%] rounded-2xl border border-border/70 bg-white px-3.5 py-2.5 text-sm text-muted-foreground">
                Checking database...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <form onSubmit={handleSubmit} className="flex gap-2 border-t border-border/70 bg-white p-3">
            <Input
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ask about your cases..."
              className="text-sm"
              disabled={loading}
            />
            <Button type="submit" size="icon" aria-label="Send message" disabled={loading}>
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}

      <Button
        type="button"
        size="lg"
        className="h-12 rounded-2xl px-5 shadow-elevated"
        onClick={() => setOpen((value) => !value)}
      >
        <MessageCircle className="mr-2 h-4 w-4" />
        Help
      </Button>
    </div>
  );
};

export default ReporterHelpChat;
