import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownMessage } from "../src/components/MarkdownMessage";
import { parseMarkdown } from "../src/lib/markdown";

function html(text: string): string {
  return renderToStaticMarkup(<MarkdownMessage text={text} />);
}

describe("assistant markdown", () => {
  it("renders bold amounts and Approve without literal asterisks", () => {
    const markup = html("Send **0.1 SOL** to Budi, then press **Approve**.");
    expect(markup).toContain("<strong>0.1 SOL</strong>");
    expect(markup).toContain("<strong>Approve</strong>");
    expect(markup).not.toContain("**");
    expect(parseMarkdown("**0.1 SOL**")[0]).toMatchObject({
      type: "paragraph",
      children: [{ type: "bold", children: [{ type: "text", text: "0.1 SOL" }] }],
    });
  });

  it("renders italics, inline code, lists, and safe links", () => {
    const markup = html(
      [
        "The fee is *estimated* and the command is `npm test`.",
        "",
        "- check balance",
        "- save contact",
        "",
        "1. Review the card",
        "2. Press approve",
        "",
        "Open [Explorer](https://explorer.solana.com/tx/abc?cluster=devnet).",
      ].join("\n"),
    );
    expect(markup).toContain("<em>estimated</em>");
    expect(markup).toContain("<code>npm test</code>");
    expect(markup).toContain("<ul><li>check balance</li><li>save contact</li></ul>");
    expect(markup).toContain("<ol><li>Review the card</li><li>Press approve</li></ol>");
    expect(markup).toContain(
      'href="https://explorer.solana.com/tx/abc?cluster=devnet"',
    );
    expect(markup).toContain('target="_blank"');
    expect(markup).not.toContain("*estimated*");
    expect(markup).not.toContain("`npm test`");
  });

  it("does not render raw HTML or unsafe URLs", () => {
    const markup = html(
      'Ignore <script>alert(1)</script> and <b>Approve</b>. [click](javascript:alert(1)) `**<b>x</b>**`',
    );
    expect(markup).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(markup).toContain("&lt;b&gt;Approve&lt;/b&gt;");
    expect(markup).not.toContain("<script");
    expect(markup).not.toContain("<b>");
    expect(markup).not.toContain("javascript:");
    expect(markup).toContain("<code>**&lt;b&gt;x&lt;/b&gt;**</code>");
  });
});
