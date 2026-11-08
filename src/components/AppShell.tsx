"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArtifactList, ToolPills } from "@/components/Artifacts";
import { FAUCET_URL, formatSolHeader, shortAddress } from "@/lib/format";
import type { Artifact, ChatResponse, Contact, Locale, TransferView, WalletStatus } from "@/lib/types";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  artifacts?: Artifact[];
  toolsUsed?: string[];
  locale?: Locale;
  pending?: boolean;
  error?: boolean;
};

const SUGGESTIONS = [
  { label: "What's my balance?", prompt: "What's my balance?" },
  { label: "Berapa saldo saya?", prompt: "Berapa saldo saya?" },
  { label: "Last 5 transactions", prompt: "Show my last 5 transactions" },
  {
    label: "Save Budi",
    prompt: "Save BQiS4hUHAChFwMqecbWbqwmi5LCwsSG8JMgrq1PpVyHA as Budi",
  },
  { label: "Send 0.1 SOL to Budi", prompt: "Send 0.1 SOL to Budi" },
];

export function AppShell() {
  const [wallet, setWallet] = useState<WalletStatus | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [walletRes, contactRes] = await Promise.all([
        fetch("/api/wallet", { cache: "no-store" }),
        fetch("/api/contacts", { cache: "no-store" }),
      ]);
      if (walletRes.ok) {
        setWallet((await walletRes.json()) as WalletStatus);
        setWalletError(null);
      } else {
        const body = (await walletRes.json().catch(() => null)) as { error?: string } | null;
        setWalletError(body?.error ?? "Wallet unavailable.");
      }
      if (contactRes.ok) {
        const body = (await contactRes.json()) as { contacts: Contact[] };
        setContacts(body.contacts);
      }
    } catch {
      setWalletError("Could not reach the server.");
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 15000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    const node = threadRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, sending]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || sending) return;
    const history = toHistory(messages, content);
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content };
    const placeholder: ChatMessage = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: "",
      pending: true,
    };
    setMessages((current) => [...current, userMessage, placeholder]);
    setDraft("");
    setSending(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map((message) => ({ role: message.role, content: message.content })),
        }),
      });
      const body = (await response.json()) as ChatResponse & { error?: string };
      if (!response.ok) {
        setMessages((current) =>
          current.map((message) =>
            message.id === placeholder.id
              ? { ...message, pending: false, error: true, content: body.error ?? "The agent could not reply." }
              : message,
          ),
        );
        return;
      }
      setMessages((current) =>
        current.map((message) =>
          message.id === placeholder.id
            ? {
                ...message,
                pending: false,
                content: body.reply,
                artifacts: body.artifacts,
                toolsUsed: body.toolsUsed,
                locale: body.locale,
              }
            : message,
        ),
      );
      void refresh();
    } catch {
      setMessages((current) =>
        current.map((message) =>
          message.id === placeholder.id
            ? { ...message, pending: false, error: true, content: "Network error. Try again." }
            : message,
        ),
      );
    } finally {
      setSending(false);
      boxRef.current?.focus();
    }
  }

  async function decide(id: string, action: "approve" | "cancel") {
    setBusyId(id);
    try {
      const response = await fetch(`/api/transfers/${id}/${action}`, { method: "POST" });
      const body = (await response.json()) as { transfer?: TransferView; error?: string };
      if (!response.ok || !body.transfer) {
        patchTransfer(id, (transfer) => ({ ...transfer, error: body.error ?? "Could not update the transfer." }));
        return;
      }
      patchTransfer(id, () => body.transfer as TransferView);
      if (action === "approve") void refresh();
    } catch {
      patchTransfer(id, (transfer) => ({ ...transfer, error: "Network error. The transfer was not updated." }));
    } finally {
      setBusyId(null);
    }
  }

  function patchTransfer(id: string, update: (transfer: TransferView) => TransferView) {
    setMessages((current) =>
      current.map((message) => ({
        ...message,
        artifacts: message.artifacts?.map((artifact) =>
          artifact.type === "transfer" && artifact.transfer.id === id
            ? { ...artifact, transfer: update(artifact.transfer) }
            : artifact,
        ),
      })),
    );
  }

  async function copyAddress() {
    if (!wallet) return;
    await navigator.clipboard.writeText(wallet.address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  const lamports = BigInt(wallet?.balanceLamports ?? "0");
  const showFaucet = wallet?.balanceLamports === "0" && !wallet.balanceError;

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <div className="mark" aria-hidden="true">
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <path d="M3 16c4.2-.6 6.2-7 14-9" stroke="#06281f" strokeWidth="1.8" strokeLinecap="round" />
              <circle cx="16.5" cy="6.5" r="2" fill="#241447" />
            </svg>
          </div>
          <div>
            <h1>Solana Pay Agent</h1>
            <p>English & Indonesian · you approve every send</p>
          </div>
        </div>
        <div className="wallet-meta">
          <span className={`pill ${wallet?.clusterOk ? "ok" : ""}`}>Devnet</span>
          {wallet ? (
            <div className="address-chip">
              <a className="mono" href={wallet.explorerUrl} target="_blank" rel="noreferrer" style={{ color: "inherit", textDecoration: "none", fontSize: 12 }}>
                {shortAddress(wallet.address, 4, 4)}
              </a>
              <button type="button" onClick={() => void copyAddress()}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <div className="address-chip">
              <span className="hint" style={{ margin: 0 }}>
                {walletError ? "Wallet error" : "Loading wallet…"}
              </span>
            </div>
          )}
          <div className="balance-chip" data-testid="balance">
            <strong>{wallet ? formatSolHeader(lamports) : "—"}</strong>
            <span>SOL</span>
          </div>
        </div>
      </header>

      {wallet && !wallet.clusterOk ? (
        <div className="banner danger" role="status">
          {wallet.clusterError ?? "This RPC is not Solana devnet. Sending is disabled."}
        </div>
      ) : null}
      {showFaucet ? (
        <div className="banner warn" role="status">
          Balance is 0. Fund this devnet address at{" "}
          <a href={FAUCET_URL} target="_blank" rel="noreferrer">
            faucet.solana.com
          </a>
          {wallet?.keypairSource === "generated" ? " (a keypair was saved locally)" : ""}, then refresh.
        </div>
      ) : null}

      <div className="workspace">
        <main className="panel chat">
          <div className="thread" ref={threadRef} aria-live="polite">
            {messages.length === 0 ? (
              <div className="empty">
                <h2>Pay with a sentence.</h2>
                <p>
                  Ask for a balance, save a contact, or send SOL on devnet. The agent can prepare a transfer. It cannot
                  sign until you press Approve.
                </p>
                <div className="suggestions">
                  {SUGGESTIONS.map((suggestion) => (
                    <button
                      key={suggestion.label}
                      className="chip"
                      type="button"
                      onClick={() => void send(suggestion.prompt)}
                    >
                      {suggestion.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            {messages.map((message) => (
              <div className={`row ${message.role}`} key={message.id}>
                <div>
                  <div className={`bubble ${message.role} ${message.error ? "error" : ""}`}>
                    {message.pending ? (
                      <span className="thinking" aria-label="Thinking">
                        <i />
                        <i />
                        <i />
                      </span>
                    ) : (
                      message.content
                    )}
                  </div>
                  {message.role === "assistant" && message.toolsUsed ? (
                    <ToolPills tools={message.toolsUsed} locale={message.locale ?? "en"} />
                  ) : null}
                  {message.artifacts ? (
                    <ArtifactList
                      artifacts={message.artifacts}
                      locale={message.locale ?? "en"}
                      busyId={busyId}
                      onApprove={(id) => void decide(id, "approve")}
                      onCancel={(id) => void decide(id, "cancel")}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          <div className="composer">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void send(draft);
              }}
            >
              <textarea
                ref={boxRef}
                aria-label="Message the agent"
                data-testid="composer"
                rows={1}
                placeholder="Ask in English or Indonesian…"
                value={draft}
                disabled={sending}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(draft);
                  }
                }}
              />
              <button className="btn primary" type="submit" disabled={sending || !draft.trim()}>
                Send
              </button>
            </form>
            <div className="hint" style={{ display: "flex", justifyContent: "space-between" }}>
              <span>Devnet only · cap {wallet?.maxSolPerTransfer ?? "1"} SOL · Enter to send</span>
              {messages.length > 0 ? (
                <button className="icon-button" type="button" onClick={() => setMessages([])}>
                  Clear chat
                </button>
              ) : (
                <span />
              )}
            </div>
          </div>
        </main>
        <aside className="side">
          <section className="panel side-card">
            <h2>Wallet</h2>
            {wallet ? (
              <div className="ident">
                <span className="orb" style={{ background: orbGradient(wallet.address) }} aria-hidden="true" />
                <div>
                  <div className="addr mono">{wallet.address}</div>
                  <p className="hint">
                    {wallet.keypairSource === "env" ? "Key from environment" : "Saved on this server"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="hint">{walletError ?? "Loading the agent wallet…"}</p>
            )}
          </section>
          <section className="panel side-card" style={{ flex: 1, minHeight: 0 }}>
            <h2>Contacts</h2>
            {contacts.length === 0 ? (
              <p className="hint">No contacts yet. Try “save this address as Budi”.</p>
            ) : (
              <ul className="contact-list">
                {contacts.map((contact) => (
                  <li key={contact.name}>
                    <strong>{contact.name}</strong>
                    <span className="mono">{shortAddress(contact.address, 4, 4)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel side-card">
            <h2>Safety</h2>
            <p className="hint">
              The model has no sign tool. A transfer stays pending until you approve it. Devnet genesis is checked
              before broadcast, and each send is capped.
            </p>
          </section>
        </aside>
      </div>
    </div>
  );
}

function toHistory(messages: ChatMessage[], content: string) {
  const items: { role: "user" | "assistant"; content: string }[] = [];
  for (const message of messages) {
    if (message.pending || message.error) continue;
    const signatures = (message.artifacts ?? []).flatMap((artifact) =>
      artifact.type === "transfer" && artifact.transfer.signature ? [artifact.transfer.signature] : [],
    );
    const extra = signatures.length ? `\nConfirmed devnet signature: ${signatures.join(", ")}` : "";
    const text = `${message.content}${extra}`.trim();
    if (text) items.push({ role: message.role, content: text });
  }
  items.push({ role: "user", content });
  return items;
}

function orbGradient(address: string): string {
  let hash = 0;
  for (const char of address) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  const a = hash % 360;
  const b = (hash >> 8) % 360;
  return `conic-gradient(from 40deg, hsl(${a} 75% 62%), hsl(${b} 70% 42%), hsl(${a} 75% 62%))`;
}
