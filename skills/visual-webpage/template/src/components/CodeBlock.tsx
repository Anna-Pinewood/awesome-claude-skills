import { Highlight, themes } from "prism-react-renderer";
import { motion } from "framer-motion";
import type { CSSProperties } from "react";

interface CodeBlockProps {
  code: string;
  language?: string;
  /** Title shown above the code block */
  title?: string;
  /** Animate lines appearing one by one */
  animateLines?: boolean;
  /** Delay between each line in seconds */
  lineDelay?: number;
  /** Highlight specific line numbers (1-indexed) */
  highlightLines?: number[];
  style?: CSSProperties;
}

export default function CodeBlock({
  code,
  language = "typescript",
  title,
  animateLines = true,
  lineDelay = 0.05,
  highlightLines = [],
  style,
}: CodeBlockProps) {
  return (
    <div style={{ width: "100%", ...style }}>
      {title && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.85rem",
            color: "var(--text-muted)",
            padding: "0.5rem 1.25rem",
            background: "var(--bg-surface)",
            borderTopLeftRadius: "8px",
            borderTopRightRadius: "8px",
            borderBottom: "1px solid #ffffff10",
          }}
        >
          {title}
        </div>
      )}
      <Highlight theme={themes.nightOwl} code={code.trim()} language={language}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "0.9rem",
              lineHeight: 1.7,
              padding: "1.25rem",
              background: "var(--bg-surface)",
              borderRadius: title ? "0 0 8px 8px" : "8px",
              overflowX: "auto",
              margin: 0,
            }}
          >
            {tokens.map((line, i) => {
              const lineProps = getLineProps({ line });
              const isHighlighted = highlightLines.includes(i + 1);

              const lineContent = (
                <div
                  {...lineProps}
                  key={i}
                  style={{
                    ...lineProps.style,
                    padding: "0 0.5rem",
                    marginLeft: "-0.5rem",
                    marginRight: "-0.5rem",
                    background: isHighlighted ? "var(--accent-soft)" : undefined,
                    borderLeft: isHighlighted
                      ? "3px solid var(--accent)"
                      : "3px solid transparent",
                  }}
                >
                  {line.map((token, key) => (
                    <span {...getTokenProps({ token })} key={key} />
                  ))}
                </div>
              );

              if (!animateLines) return lineContent;

              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{
                    duration: 0.3,
                    delay: i * lineDelay,
                    ease: "easeOut",
                  }}
                >
                  {lineContent}
                </motion.div>
              );
            })}
          </pre>
        )}
      </Highlight>
    </div>
  );
}
