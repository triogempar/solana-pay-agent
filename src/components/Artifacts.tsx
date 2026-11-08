"use client";

import { useState } from "react";
import { formatTime, shortAddress } from "@/lib/format";
import type { Artifact, Locale, TransferView } from "@/lib/types";

const copy = {
  en: {
    approve: "Approve",
    cancel: "Cancel",
    recipient: "To",
    network: "Network",
    fee: "Fee",
    pendingTitle: "Review transfer",
    pendingNote: "Nothing is signed until you approve.",
    confirmed: "Sent",
    cancelled: "Cancelled",
    cancelledNote: "Nothing was sent.",
    failed: "Not sent",
    explorer: "View on Explorer",
    sending: "Sending…",
    balance: "Balance",
    txs: "Recent",
    emptyTx: "No transactions yet.",
    success: "Success",
    txFailed: "Failed",
    saved: "Saved",
    explained: "Transaction",
    from: "From",
    feeShort: "Fee",
    copied: "Copied",
    copy: "Copy",
    signature: "Signature",
  },
  id: {
    approve: "Setujui",
    cancel: "Batal",
    recipient: "Ke",
    network: "Jaringan",
    fee: "Biaya",
    pendingTitle: "Tinjau transfer",
    pendingNote: "Belum ditandatangani sebelum Anda menyetujui.",
    confirmed: "Terkirim",
    cancelled: "Dibatalkan",
    cancelledNote: "Tidak ada yang terkirim.",
    failed: "Tidak terkirim",
    explorer: "Lihat di Explorer",
    sending: "Mengirim…",
    balance: "Saldo",
    txs: "Terbaru",
    emptyTx: "Belum ada transaksi.",
    success: "Berhasil",
    txFailed: "Gagal",
    saved: "Tersimpan",
    explained: "Transaksi",
    from: "Dari",
    feeShort: "Biaya",
    copied: "Tersalin",
    copy: "Salin",
    signature: "Tanda tangan",
  },
} as const;

const toolLabels: Record<string, { en: string; id: string }> = {
  get_balance: { en: "Checked balance", id: "Cek saldo" },
  send_sol: { en: "Prepared transfer", id: "Siapkan transfer" },
  get_recent_transactions: { en: "Recent transactions", id: "Riwayat" },
  save_contact: { en: "Saved contact", id: "Simpan kontak" },
  list_contacts: { en: "Contacts", id: "Kontak" },
  explain_transaction: { en: "Transaction", id: "Transaksi" },
};

export function ToolPills({ tools, locale }: { tools: string[]; locale: Locale }) {
  if (!tools.length) return null;
  const labels = tools.map((tool) => toolLabels[tool]?.[locale] ?? tool);
  return <p className="tool-line">{labels.join(" · ")}</p>;
}

export function ArtifactList({
  artifacts,
  locale,
  busyId,
  onApprove,
  onCancel,
}: {
  artifacts: Artifact[];
  locale: Locale;
  busyId: string | null;
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  if (!artifacts.length) return null;
  const text = copy[locale];
  return (
    <>
      {artifacts.map((artifact, index) => {
        if (artifact.type === "transfer") {
          return (
            <TransferCard
              key={artifact.transfer.id}
              transfer={artifact.transfer}
              locale={locale}
              busy={busyId === artifact.transfer.id}
              onApprove={onApprove}
              onCancel={onCancel}
            />
          );
        }
        if (artifact.type === "balance") {
          return (
            <div className="result" key={`bal-${index}`}>
              <div className="result-main">
                <span className="result-label">{text.balance}</span>
                <strong className="mono">
                  {artifact.balanceSol} SOL
                </strong>
              </div>
              <span className="mono result-sub">{shortAddress(artifact.address, 4, 4)}</span>
            </div>
          );
        }
        if (artifact.type === "transactions") {
          return (
            <div className="rows" key={`tx-${index}`}>
              <h3>{text.txs}</h3>
              {artifact.items.length === 0 ? <p className="quiet">{text.emptyTx}</p> : null}
              {artifact.items.map((item) => (
                <div className="tx" key={item.signature}>
                  <a className="mono" href={item.explorerUrl} target="_blank" rel="noreferrer">
                    {shortAddress(item.signature, 4, 4)}
                  </a>
                  <span>{formatTime(item.blockTime)}</span>
                  <span>{item.err ? text.txFailed : text.success}</span>
                </div>
              ))}
            </div>
          );
        }
        if (artifact.type === "explanation") {
          const item = artifact.explanation;
          return (
            <div className="rows" key={item.signature}>
              <h3>{text.explained}</h3>
              <div className="explain-row">
                <span>{text.network}</span>
                <span>{item.status === "success" ? text.success : text.txFailed}</span>
              </div>
              <div className="explain-row">
                <span>{text.feeShort}</span>
                <span className="mono">{item.feeSol} SOL</span>
              </div>
              {item.transfers.map((transfer, transferIndex) => (
                <div className="explain-row" key={`${transfer.from}-${transferIndex}`}>
                  <span>{text.from}</span>
                  <span className="mono">
                    {transfer.sol} SOL · {shortAddress(transfer.from, 4, 4)} → {shortAddress(transfer.to, 4, 4)}
                  </span>
                </div>
              ))}
              <a className="explorer" href={item.explorerUrl} target="_blank" rel="noreferrer">
                {text.explorer}
              </a>
            </div>
          );
        }
        return (
          <div className="result" key={`${artifact.name}-${index}`}>
            <div className="result-main">
              <span className="result-label">{text.saved}</span>
              <strong>{artifact.name}</strong>
            </div>
            <span className="mono result-sub">{shortAddress(artifact.address, 4, 4)}</span>
          </div>
        );
      })}
    </>
  );
}

function TransferCard({
  transfer,
  locale,
  busy,
  onApprove,
  onCancel,
}: {
  transfer: TransferView;
  locale: Locale;
  busy: boolean;
  onApprove: (id: string) => void;
  onCancel: (id: string) => void;
}) {
  const text = copy[locale];
  const [copied, setCopied] = useState(false);
  const kicker =
    transfer.status === "confirmed"
      ? text.confirmed
      : transfer.status === "cancelled"
        ? text.cancelled
        : transfer.status === "failed"
          ? text.failed
          : text.pendingTitle;

  async function copySignature() {
    if (!transfer.signature) return;
    await navigator.clipboard.writeText(transfer.signature);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <article className={`sheet ${transfer.status}`} data-testid="transfer-card">
      <p className="sheet-kicker">{kicker}</p>
      <p className="amount mono">
        {transfer.amountSol}
        <span>SOL</span>
      </p>
      <dl className="sheet-rows">
        <div>
          <dt>{text.recipient}</dt>
          <dd>
            {transfer.recipientLabel ? <span className="who">{transfer.recipientLabel}</span> : null}
            <span className="mono addr">{shortAddress(transfer.recipient, 6, 6)}</span>
            <span className="sr-only">{transfer.recipient}</span>
          </dd>
        </div>
        <div>
          <dt>{text.network}</dt>
          <dd>Devnet</dd>
        </div>
        <div>
          <dt>{text.fee}</dt>
          <dd className="mono">{transfer.estimatedFeeSol} SOL</dd>
        </div>
        {transfer.signature ? (
          <div>
            <dt>{text.signature}</dt>
            <dd>
              <span className="sig-line">
                <span className="mono">{shortAddress(transfer.signature, 6, 6)}</span>
                <button className="btn-quiet inline" type="button" onClick={() => void copySignature()}>
                  {copied ? text.copied : text.copy}
                </button>
              </span>
              {transfer.explorerUrl ? (
                <a className="explorer" href={transfer.explorerUrl} target="_blank" rel="noreferrer">
                  {text.explorer}
                </a>
              ) : null}
            </dd>
          </div>
        ) : null}
      </dl>
      {transfer.status === "pending" ? <p className="sheet-note">{text.pendingNote}</p> : null}
      {transfer.status === "cancelled" ? <p className="sheet-note">{text.cancelledNote}</p> : null}
      {transfer.error && transfer.status !== "confirmed" && transfer.status !== "cancelled" ? (
        <p className="sheet-note danger">{transfer.error}</p>
      ) : null}
      {transfer.status === "pending" ? (
        <div className="sheet-actions">
          <button className="btn-quiet" type="button" disabled={busy} onClick={() => onCancel(transfer.id)}>
            {text.cancel}
          </button>
          <button
            className="btn-primary"
            type="button"
            data-testid="approve"
            disabled={busy}
            onClick={() => onApprove(transfer.id)}
          >
            {busy ? text.sending : text.approve}
          </button>
        </div>
      ) : null}
    </article>
  );
}
