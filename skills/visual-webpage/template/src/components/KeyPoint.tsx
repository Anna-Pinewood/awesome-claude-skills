import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

interface KeyPointProps {
  children: ReactNode;
  /** Optional label above the content (e.g. "Key insight", "TL;DR") */
  label?: string;
  /** Visual style */
  variant?: "callout" | "quote" | "highlight";
  style?: CSSProperties;
}

export default function KeyPoint({
  children,
  label,
  variant = "callout",
  style,
}: KeyPointProps) {
  const styles: Record<string, CSSProperties> = {
    callout: {
      background: "var(--accent-soft)",
      borderLeft: "4px solid var(--accent)",
      padding: "1.5rem 2rem",
      borderRadius: "0 8px 8px 0",
    },
    quote: {
      borderLeft: "4px solid var(--text-muted)",
      padding: "1.5rem 2rem",
      fontStyle: "italic",
      fontSize: "1.25rem",
    },
    highlight: {
      background: "var(--bg-surface)",
      padding: "2rem",
      borderRadius: "12px",
      textAlign: "center" as const,
      fontSize: "1.3rem",
      border: "1px solid #ffffff10",
    },
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{ ...styles[variant], ...style }}
    >
      {label && (
        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "0.75rem",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            color: "var(--accent)",
            marginBottom: "0.75rem",
          }}
        >
          {label}
        </div>
      )}
      <div style={{ lineHeight: 1.6 }}>{children}</div>
    </motion.div>
  );
}
