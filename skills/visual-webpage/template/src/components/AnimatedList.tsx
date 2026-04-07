import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

interface AnimatedListProps {
  items: Array<{
    title?: string;
    content: ReactNode;
    icon?: ReactNode;
  }>;
  /** Delay between items in seconds */
  staggerDelay?: number;
  /** Visual style */
  variant?: "bullets" | "cards" | "numbered";
  style?: CSSProperties;
}

const containerVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] },
  },
};

export default function AnimatedList({
  items,
  staggerDelay = 0.12,
  variant = "bullets",
  style,
}: AnimatedListProps) {
  return (
    <motion.ul
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      variants={{
        ...containerVariants,
        visible: {
          transition: { staggerChildren: staggerDelay },
        },
      }}
      style={{
        listStyle: "none",
        display: "flex",
        flexDirection: "column",
        gap: variant === "cards" ? "1.25rem" : "1rem",
        ...style,
      }}
    >
      {items.map((item, i) => (
        <motion.li
          key={i}
          variants={itemVariants}
          style={{
            display: "flex",
            alignItems: "flex-start",
            gap: "0.75rem",
            ...(variant === "cards"
              ? {
                  background: "var(--bg-surface)",
                  padding: "1.25rem 1.5rem",
                  borderRadius: "8px",
                  border: "1px solid #ffffff08",
                }
              : {}),
          }}
        >
          <span
            style={{
              flexShrink: 0,
              color: "var(--accent)",
              fontWeight: 600,
              fontFamily:
                variant === "numbered" ? "var(--font-mono)" : undefined,
              fontSize: variant === "numbered" ? "0.9rem" : undefined,
              marginTop: "0.15rem",
            }}
          >
            {item.icon
              ? item.icon
              : variant === "numbered"
                ? `${String(i + 1).padStart(2, "0")}.`
                : "—"}
          </span>
          <div>
            {item.title && (
              <strong style={{ display: "block", marginBottom: "0.25rem" }}>
                {item.title}
              </strong>
            )}
            <span style={{ color: "var(--text-secondary)" }}>
              {item.content}
            </span>
          </div>
        </motion.li>
      ))}
    </motion.ul>
  );
}
