# MLH Solana Hackathon submission

## One-line pitch

Chat in English or Indonesian to check a Solana devnet wallet, save contacts, and send SOL — nothing signs until you tap Approve.

## Project description

Solana Pay Agent is a web app that lets you talk to a wallet. Ask in English or Indonesian — "what's my balance?", "simpan alamat ini sebagai Budi", "kirim 0.1 SOL ke Budi" — and an AI agent on Ollama Cloud (model: beam) turns that into Solana devnet actions.

Wallets still speak addresses and raw transfers, and an agent that can sign is one prompt away from sending funds. This is a payments assistant that is useful in natural language and structurally unable to move money on its own.

The agent reads the server wallet's balance, lists recent transactions, saves contacts, and explains a signature in plain language. A send does not broadcast. It shows a confirmation card with the recipient, amount, devnet network, and estimated fee. Nothing is signed until you press Approve. A configurable cap, address checks, and a devnet genesis-hash lock sit in front of the signer. The signature comes back with a Solana Explorer devnet link.

The Next.js server holds the keypair and calls the model with tool definitions. If the model returns no native tool calls, a strict JSON fallback parses the intent. Contacts live in a local file. Unit tests mock the LLM and the RPC.

This fits the AI track: bilingual tool-calling on Solana, with a human approval step you can trust on devnet. The same safety story — no autonomous signing, a hard network lock, and a demoable product — is how it aims at a top overall finish.

## Demo video narration (about 75 seconds)

This is Solana Pay Agent. You talk to it in English or Indonesian, and it acts on Solana devnet. The agent can prepare a payment, but it can never sign by itself.

I'll ask for the balance. It calls the wallet and reads the number back. This address is the server-side devnet key. If it were empty, the header links to the Solana faucet.

Next I save a contact: I paste an address and say, save this as Budi. Now I don't have to paste that string again.

Then: send 0.1 SOL to Budi. A confirmation card appears — recipient, amount, network devnet, and the estimated fee — with Approve and Cancel. Nothing has been broadcast. I press Approve. The server signs, and the card flips to a signature. That link opens the transaction on Solana Explorer, on devnet.

Finally I ask the agent to explain that transaction. It fetches the signature and says, in plain language, who paid whom and how much. Natural language in, a human approval in the middle, and a receipt you can check.
