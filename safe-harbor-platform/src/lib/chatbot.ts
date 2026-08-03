import { API_BASE_URL } from "@/lib/api";

export type ChatbotContext = {
  fullName: string;
  email: string;
  role: string;
  caseCount: number;
  reportCount?: number;
  emergencyCaseCount?: number;
  policeStationName?: string;
  preferredNgoName?: string;
};

export async function fetchChatbotContext(token: string): Promise<ChatbotContext | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/users/chatbot-context`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

export async function askChatbot(token: string, question: string): Promise<{ answer: string; usedDatabase?: boolean }> {
  const response = await fetch(`${API_BASE_URL}/users/chatbot-ask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ question }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.message || data.msg || "Chatbot request failed");
  }

  return response.json();
}

/** Remove any leftover third-party Chatbase widgets from older builds. */
export function removeChatbaseWidget() {
  try {
    document
      .querySelectorAll(
        'script[src*="chatbase"], iframe[src*="chatbase"], [id*="chatbase"], [class*="chatbase"]'
      )
      .forEach((node) => node.remove());

    if ((window as any).chatbase) {
      try {
        (window as any).chatbase("hide");
      } catch {
        // ignore
      }
      delete (window as any).chatbase;
    }
  } catch {
    // ignore cleanup failures
  }
}

export function buildGreeting(context?: ChatbotContext | null) {
  const name = context?.fullName || "there";
  const reports = context?.reportCount ?? 0;
  const emergencies = context?.emergencyCaseCount ?? 0;
  return `Hi ${name}. I am the SafeGuard Assistant, connected to your account data. You currently have ${reports} report(s) and ${emergencies} emergency/SOS case(s). Ask me about reporting, SOS, case tracking, referrals, or your own cases.`;
}
