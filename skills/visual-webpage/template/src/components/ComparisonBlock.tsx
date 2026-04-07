import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

interface Side {
  title: string;
  content: ReactNode;
  /** Accent color for the header */
  color?: string;
}

interface ComparisonBlockProps {
  left: Side;
  right: Side;
  style?: CSSProperties;
}

export default function ComparisonBlock({
  left,
  right,
  style,
}: ComparisonBlockProps) {
  const sideStyle: CSSProperties = {
    flex: 1,
    background: "var(--bg-surface)",
    borderRadius: "8px",
    overflow: "hidden",
    border: "1px solid #ffffff08",
  };

  const headerStyle = (color?: string): CSSProperties => ({
    padding: "1rem 1.5rem",
    fontFamily: "var(--font-mono)",
    fontSize: "0.85rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    borderBottom: "1px solid #ffffff10",
    color: color ?? "var(--text-primary)",
  });

  const bodyStyle: CSSProperties = {
    padding: "1.5rem",
    color: "var(--text-secondary)",
    lineHeight: 1.7,
  };

  return (
    <div
      style={{
        display: "flex",
        gap: "1.5rem",
        width: "100%",
        ...style,
      }}
    >
      <motion.div
        initial={{ opacity: 0, x: -30 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        style={sideStyle}
      >
        <div style={headerStyle(left.color)}>{left.title}</div>
        <div style={bodyStyle}>{left.content}</div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, x: 30 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        style={sideStyle}
      >
        <div style={headerStyle(right.color)}>{right.title}</div>
        <div style={bodyStyle}>{right.content}</div>
      </motion.div>
    </div>
  );
}
