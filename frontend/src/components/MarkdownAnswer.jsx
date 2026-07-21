import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";

export default function MarkdownAnswer({ content }) {
  return (
    <div className="prose prose-invert prose-sm max-w-none prose-pre:p-0 prose-pre:bg-transparent">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          code({ inline, className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            if (!inline && match) {
              return (
                <SyntaxHighlighter
                  style={oneDark}
                  language={match[1]}
                  PreTag="div"
                  customStyle={{
                    margin: "0.75rem 0",
                    borderRadius: "0.5rem",
                    fontSize: "0.8rem",
                    maxHeight: "320px",
                    overflow: "auto",
                  }}
                  {...props}
                >
                  {String(children).replace(/\n$/, "")}
                </SyntaxHighlighter>
              );
            }
            return (
              <code
                className="rounded bg-axiom-panel px-1.5 py-0.5 font-mono text-axiom-accent text-xs"
                {...props}
              >
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
