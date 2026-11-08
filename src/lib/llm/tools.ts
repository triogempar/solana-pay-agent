import type { ToolDefinition } from "./types";

const emptyParams = {
  type: "object",
  properties: {},
  required: [] as string[],
};

export const AGENT_TOOLS: ToolDefinition[] = [
  {
    type: "function",
    function: {
      name: "get_balance",
      description: "Get the agent wallet's current SOL balance on Solana devnet.",
      parameters: emptyParams,
    },
  },
  {
    type: "function",
    function: {
      name: "send_sol",
      description:
        "Prepare a SOL transfer on devnet. This does NOT sign or broadcast. The user must press Approve on the confirmation card. Amount is in SOL, not lamports. Recipient is a base58 address or a saved contact name.",
      parameters: {
        type: "object",
        properties: {
          amount: { type: "number", description: "Amount of SOL to send, for example 0.1" },
          recipient: {
            type: "string",
            description: "Destination wallet address or saved contact name",
          },
        },
        required: ["amount", "recipient"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_recent_transactions",
      description: "List the agent wallet's most recent devnet transactions.",
      parameters: {
        type: "object",
        properties: {
          limit: { type: "integer", description: "How many transactions to return, from 1 to 10. Default 5." },
        },
        required: [],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "save_contact",
      description: "Save a Solana address under a short contact name so later transfers can use the name.",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string", description: "Short contact name, for example Budi" },
          address: { type: "string", description: "Base58 Solana address" },
        },
        required: ["name", "address"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_contacts",
      description: "List saved contacts (name and address).",
      parameters: emptyParams,
    },
  },
  {
    type: "function",
    function: {
      name: "explain_transaction",
      description:
        "Fetch a transaction by signature and return a plain-language summary plus the SOL transfers and fee. Use this whenever the user asks what a transaction did.",
      parameters: {
        type: "object",
        properties: {
          signature: { type: "string", description: "Transaction signature" },
        },
        required: ["signature"],
      },
    },
  },
];

export const TOOL_NAMES = AGENT_TOOLS.map((tool) => tool.function.name);
