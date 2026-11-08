export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export function toErrorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  if (err instanceof SyntaxError) {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const message = err instanceof Error ? err.message : "Unexpected error.";
  const status = /OLLAMA_API_KEY|LLM request failed|LLM request timed out|SOLANA_RPC_URL|LLM_BASE_URL/.test(
    message,
  )
    ? 503
    : 500;
  return Response.json({ error: message.slice(0, 500) }, { status });
}
