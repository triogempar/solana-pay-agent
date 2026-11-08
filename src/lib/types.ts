export type Locale = "en" | "id";

export type HistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type TransferStatus = "pending" | "submitting" | "confirmed" | "cancelled" | "failed";

export type TransferView = {
  id: string;
  recipient: string;
  recipientLabel?: string;
  amountSol: string;
  network: "devnet";
  estimatedFeeSol: string;
  status: "pending" | "confirmed" | "cancelled" | "failed";
  signature?: string;
  explorerUrl?: string;
  error?: string;
};

export type TxListItem = {
  signature: string;
  slot: number | null;
  blockTime: number | null;
  err: boolean;
  explorerUrl: string;
};

export type ExplanationView = {
  signature: string;
  status: "success" | "failed";
  feeSol: string;
  summary: string;
  explorerUrl: string;
  transfers: { from: string; to: string; sol: string }[];
  blockTime: number | null;
};

export type Artifact =
  | { type: "transfer"; transfer: TransferView }
  | { type: "balance"; address: string; balanceSol: string; network: "devnet" }
  | { type: "transactions"; items: TxListItem[] }
  | { type: "explanation"; explanation: ExplanationView }
  | { type: "contact_saved"; name: string; address: string };

export type ChatResponse = {
  reply: string;
  artifacts: Artifact[];
  toolsUsed: string[];
  locale: Locale;
};

export type WalletStatus = {
  address: string;
  balanceLamports: string;
  balanceSol: string;
  network: "devnet";
  faucetUrl: string;
  maxSolPerTransfer: string;
  keypairSource: "env" | "file" | "generated";
  explorerUrl: string;
  clusterOk: boolean;
  clusterError?: string;
  balanceError?: string;
};

export type Contact = {
  name: string;
  address: string;
  createdAt: string;
};

export type TransferRecord = {
  id: string;
  recipient: string;
  recipientLabel?: string;
  lamports: string;
  amountSol: string;
  network: "devnet";
  estimatedFeeLamports: string;
  estimatedFeeSol: string;
  status: TransferStatus;
  signature?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};
