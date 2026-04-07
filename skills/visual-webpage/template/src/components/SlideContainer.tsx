import { motion, type Variants } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

interface SlideContainerProps {
  children: ReactNode;
  /** Optional background override */
  bg?: string;
  /** Max content width — defaults to --content-max-width */
  wide?: boolean;
  /** Custom framer-motion variants for the wrapper */
  variants?: Variants;
  /** Extra inline styles on the outer wrapper */
  style?: CSSProperties;
  className?: string;
}

const defaultVariants: Variants = {
  hidden: { opacity: 0, y: 40 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
  },
};

export default function SlideContainer({
  children,
  bg,
  wide = false,
  variants = defaultVariants,
  style,
  className,
}: SlideContainerProps) {
  return (
    <motion.section
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.3 }}
      variants={variants}
      className={className}
      style={{
        width: "100%",
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "4rem 2rem",
        background: bg,
        ...style,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: wide
            ? "var(--content-wide-max-width)"
            : "var(--content-max-width)",
        }}
      >
        {children}
      </div>
    </motion.section>
  );
}
