"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArtifactList, ToolPills } from "@/components/Artifacts";
import { MarkdownMessage } from "@/components/MarkdownMessage";
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
  { label: "Show my last 5 transactions", prompt: "Show my last 5 transactions" },
  {
    label: "Save BQiS4h…VyHA as Budi",
    prompt: "Save BQiS4hUHAChFwMqecbWbqwmi5LCwsSG8JMgrq1PpVyHA as Budi",
  },
  { label: "Send 0.1 SOL to Budi", prompt: "Send 0.1 SOL to Budi" },
];

export function AppShell() {
  const [wallet, setWallet] = useState<WalletStatus | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactsOpen, setContactsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);
  const contactsRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    if (!contactsOpen) return;
    function onPointer(event: MouseEvent) {
      if (!contactsRef.current?.contains(event.target as Node)) setContactsOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setContactsOpen(false);
    }
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [contactsOpen]);

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
    <div className="app">
      <header className="bar">
        <div className="bar-inner">
        <h1 className="wordmark">Solana Pay</h1>
        <div className="meta">
          <span className={`badge ${wallet && !wallet.clusterOk ? "bad" : ""}`}>Devnet</span>
          {wallet ? (
            <div className="address">
              <a className="mono" href={wallet.explorerUrl} target="_blank" rel="noreferrer">
                {shortAddress(wallet.address, 4, 4)}
              </a>
              <button className="text-btn" type="button" onClick={() => void copyAddress()}>
                {copied ? "Copied" : "Copy"}
              </button>
            </div>
          ) : (
            <span className="quiet">{walletError ? "Wallet unavailable" : "Loading"}</span>
          )}
          <div className="balance" data-testid="balance">
            <span className="mono">{wallet ? formatSolHeader(lamports) : "—"}</span>
            <span className="unit">SOL</span>
          </div>
          <div className="contacts" ref={contactsRef}>
            <button
              className="text-btn"
              type="button"
              aria-expanded={contactsOpen}
              onClick={() => setContactsOpen((open) => !open)}
            >
              Contacts
            </button>
            {contactsOpen ? (
              <div className="popover" role="dialog" aria-label="Contacts">
                <h2>Contacts</h2>
                {contacts.length === 0 ? (
                  <p className="quiet">None saved.</p>
                ) : (
                  <ul className="contact-list">
                    {contacts.map((contact) => (
                      <li key={contact.name}>
                        <span>{contact.name}</span>
                        <span className="mono">{shortAddress(contact.address, 4, 4)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ) : null}
          </div>
        </div>
        </div>
      </header>

      <div className="column">
        {wallet && !wallet.clusterOk ? (
          <p className="banner danger" role="status">
            {wallet.clusterError ?? "This RPC is not Solana devnet. Sending is disabled."}
          </p>
        ) : null}
        {showFaucet ? (
          <p className="banner" role="status">
            Balance is 0. Fund this address at{" "}
            <a href={FAUCET_URL} target="_blank" rel="noreferrer">
              faucet.solana.com
            </a>
            {wallet?.keypairSource === "generated" ? ". A key was saved on this server" : ""}.
          </p>
        ) : null}

        <div className="thread" ref={threadRef} aria-live="polite">
          {messages.length === 0 ? (
            <div className="empty">
              <h2>Ask about this wallet.</h2>
              <p>Balances, contacts, and transfers on devnet. Nothing is sent until you approve it.</p>
              <div className="prompts">
                {SUGGESTIONS.map((suggestion) => (
                  <button key={suggestion.label} className="prompt" type="button" onClick={() => void send(suggestion.prompt)}>
                    {suggestion.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="turns">
              {messages.map((message) =>
                message.role === "user" ? (
                  <div className="turn user" key={message.id}>
                    <div className="user-text">{message.content}</div>
                  </div>
                ) : (
                  <div className="turn agent" key={message.id}>
                    <div className="agent">
                      {message.pending ? (
                        <p className="thinking">Thinking</p>
                      ) : message.error ? (
                        <p className="error-text">{message.content}</p>
                      ) : (
                        <MarkdownMessage text={message.content} />
                      )}
                      {message.toolsUsed ? <ToolPills tools={message.toolsUsed} locale={message.locale ?? "en"} /> : null}
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
                ),
              )}
            </div>
          )}
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
              aria-label="Message"
              data-testid="composer"
              rows={1}
              placeholder="Message"
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
            <button className="btn-primary" type="submit" disabled={sending || !draft.trim()}>
              Send
            </button>
          </form>
          <div className="composer-meta">
            <span>Devnet · {wallet?.maxSolPerTransfer ?? "1"} SOL cap · Enter to send</span>
            {messages.length > 0 ? (
              <button className="text-btn" type="button" onClick={() => setMessages([])}>
                Clear
              </button>
            ) : (
              <span />
            )}
          </div>
        </div>
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
