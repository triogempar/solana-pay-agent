import { Fragment } from "react";
import { parseMarkdown, type InlineNode } from "@/lib/markdown";

/** Assistant text only. Markup is React elements, so raw HTML in the model output stays text. */
export function MarkdownMessage({ text }: { text: string }) {
  const blocks = parseMarkdown(text);
  if (blocks.length === 0) return null;
  return (
    <div className="md">
      {blocks.map((block, index) => {
        if (block.type === "list") {
          const Tag = block.ordered ? "ol" : "ul";
          return (
            <Tag key={index}>
              {block.items.map((item, itemIndex) => (
                <li key={itemIndex}>
                  <Inline nodes={item} />
                </li>
              ))}
            </Tag>
          );
        }
        return (
          <p key={index}>
            <Inline nodes={block.children} />
          </p>
        );
      })}
    </div>
  );
}

function Inline({ nodes }: { nodes: InlineNode[] }) {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return <Fragment key={index}>{node.text}</Fragment>;
      case "bold":
        return (
          <strong key={index}>
            <Inline nodes={node.children} />
          </strong>
        );
      case "italic":
        return (
          <em key={index}>
            <Inline nodes={node.children} />
          </em>
        );
      case "code":
        return <code key={index}>{node.text}</code>;
      case "break":
        return <br key={index} />;
      case "link":
        return (
          <a key={index} href={node.href} target="_blank" rel="noreferrer noopener">
            <Inline nodes={node.children} />
          </a>
        );
      default:
        return null;
    }
  });
}
