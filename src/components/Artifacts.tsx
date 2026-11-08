"use client";

import { Fragment, useState } from "react";
import { formatTime, shortAddress } from "@/lib/format";
import type { Artifact, Locale, TransferView } from "@/lib/types";

const copy = {
  en: {
    approve: "Approve & send",
    cancel: "Cancel",
    recipient: "Recipient",
    amount: "Amount",
    network: "Network",
    fee: "Estimated fee",
    pendingTitle: "Confirm transfer",
    pendingNote: "Nothing is signed until you approve.",
    confirmed: "Sent on devnet",
    cancelled: "Cancelled",
    cancelledNote: "Nothing was sent.",
    failed: "Not sent",
    explorer: "View on Explorer",
    sending: "Sending…",
    balance: "Devnet balance",
    txs: "Recent transactions",
    emptyTx: "No transactions yet.",
    success: "Success",
    txFailed: "Failed",
    saved: "Contact saved",
    explained: "Transaction",
    from: "From",
    to: "To",
    feeShort: "Fee",
    copied: "Copied",
    copy: "Copy",
  },
  id: {
    approve: "Setujui & kirim",
    cancel: "Batal",
    recipient: "Penerima",
    amount: "Jumlah",
    network: "Jaringan",
    fee: "Perkiraan biaya",
    pendingTitle: "Konfirmasi transfer",
    pendingNote: "Belum ditandatangani sebelum Anda menyetujui.",
    confirmed: "Terkirim di devnet",
    cancelled: "Dibatalkan",
    cancelledNote: "Tidak ada yang terkirim.",
    failed: "Tidak terkirim",
    explorer: "Lihat di Explorer",
    sending: "Mengirim…",
    balance: "Saldo devnet",
    txs: "Transaksi terbaru",
    emptyTx: "Belum ada transaksi.",
    success: "Berhasil",
    txFailed: "Gagal",
    saved: "Kontak tersimpan",
    explained: "Transaksi",
    from: "Dari",
    to: "Ke",
    feeShort: "Biaya",
    copied: "Tersalin",
    copy: "Salin",
  },
} as const;

const toolLabels: Record<string, { en: string; id: string }> = {
  get_balance: { en: "Checked balance", id: "Cek saldo" },
  send_sol: { en: "Prepared transfer", id: "Siapkan transfer" },
  get_recent_transactions: { en: "Looked up history", id: "Riwayat" },
  save_contact: { en: "Saved contact", id: "Simpan kontak" },
  list_contacts: { en: "Listed contacts", id: "Daftar kontak" },
  explain_transaction: { en: "Explained transaction", id: "Jelaskan transaksi" },
};

export function ToolPills({ tools, locale }: { tools: string[]; locale: Locale }) {
  if (!tools.length) return null;
  return (
    <div className="tools">
      {tools.map((tool, index) => (
        <span className="tool-pill" key={`${tool}-${index}`}>
          {toolLabels[tool]?.[locale] ?? tool}
        </span>
      ))}
    </div>
  );
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
  return (
    <div className="cards">
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
            <article className="fact-card" key={`bal-${index}`}>
              <h3>{copy[locale].balance}</h3>
              <p className="mono" style={{ fontSize: 22, margin: "8px 0 0", color: "var(--text)" }}>
                {artifact.balanceSol} SOL
              </p>
              <p className="mono">{shortAddress(artifact.address, 6, 6)}</p>
            </article>
          );
        }
        if (artifact.type === "transactions") {
          return (
            <article className="fact-card" key={`tx-${index}`}>
              <h3>{copy[locale].txs}</h3>
              {artifact.items.length === 0 ? <p>{copy[locale].emptyTx}</p> : null}
              {artifact.items.map((item) => (
                <div className="tx-row" key={item.signature}>
                  <a className="explorer mono" href={item.explorerUrl} target="_blank" rel="noreferrer">
                    {shortAddress(item.signature, 6, 6)}
                  </a>
                  <span className="hint" style={{ margin: 0 }}>
                    {formatTime(item.blockTime)}
                  </span>
                  <span>{item.err ? copy[locale].txFailed : copy[locale].success}</span>
                </div>
              ))}
            </article>
          );
        }
        if (artifact.type === "explanation") {
          const item = artifact.explanation;
          return (
            <article className="fact-card" key={item.signature}>
              <h3>{copy[locale].explained}</h3>
              <dl className="facts">
                <dt>{copy[locale].network}</dt>
                <dd>{item.status === "success" ? copy[locale].success : copy[locale].txFailed}</dd>
                <dt>{copy[locale].feeShort}</dt>
                <dd className="mono">{item.feeSol} SOL</dd>
                {item.transfers.map((transfer, transferIndex) => (
                  <Fragment key={`${transfer.from}-${transferIndex}`}>
                    <dt>{copy[locale].amount}</dt>
                    <dd className="mono">{transfer.sol} SOL</dd>
                    <dt>{copy[locale].from}</dt>
                    <dd className="mono">{shortAddress(transfer.from, 6, 6)}</dd>
                    <dt>{copy[locale].to}</dt>
                    <dd className="mono">{shortAddress(transfer.to, 6, 6)}</dd>
                  </Fragment>
                ))}
              </dl>
              <a className="explorer" href={item.explorerUrl} target="_blank" rel="noreferrer">
                {copy[locale].explorer}
              </a>
            </article>
          );
        }
        return (
          <article className="fact-card" key={`${artifact.name}-${index}`}>
            <h3>{copy[locale].saved}</h3>
            <p>
              {artifact.name} · <span className="mono">{shortAddress(artifact.address, 6, 6)}</span>
            </p>
          </article>
        );
      })}
    </div>
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
  const title =
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
    <article className={`pay-card ${transfer.status}`} data-testid="transfer-card">
      <h3>{title}</h3>
      {transfer.status === "pending" ? <p className="pay-note">{text.pendingNote}</p> : null}
      {transfer.status === "cancelled" ? <p className="pay-note">{text.cancelledNote}</p> : null}
      {transfer.error && transfer.status !== "confirmed" && transfer.status !== "cancelled" ? (
        <p className="pay-note">{transfer.error}</p>
      ) : null}
      <dl className="facts">
        <dt>{text.recipient}</dt>
        <dd>
          {transfer.recipientLabel ? <strong>{transfer.recipientLabel}</strong> : null}
          <div className="mono">{transfer.recipient}</div>
        </dd>
        <dt>{text.amount}</dt>
        <dd className="mono">{transfer.amountSol} SOL</dd>
        <dt>{text.network}</dt>
        <dd>devnet</dd>
        <dt>{text.fee}</dt>
        <dd className="mono">~{transfer.estimatedFeeSol} SOL</dd>
        {transfer.signature ? (
          <>
            <dt>Signature</dt>
            <dd className="mono">{shortAddress(transfer.signature, 8, 8)}</dd>
          </>
        ) : null}
      </dl>
      {transfer.status === "pending" ? (
        <div className="actions">
          <button className="btn" type="button" disabled={busy} onClick={() => onCancel(transfer.id)}>
            {text.cancel}
          </button>
          <button
            className="btn primary"
            type="button"
            data-testid="approve"
            disabled={busy}
            onClick={() => onApprove(transfer.id)}
          >
            {busy ? text.sending : text.approve}
          </button>
        </div>
      ) : null}
      {transfer.explorerUrl ? (
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <button className="btn" type="button" onClick={copySignature}>
            {copied ? text.copied : text.copy}
          </button>
          <a className="explorer" href={transfer.explorerUrl} target="_blank" rel="noreferrer">
            {text.explorer}
          </a>
        </div>
      ) : null}
    </article>
  );
}
