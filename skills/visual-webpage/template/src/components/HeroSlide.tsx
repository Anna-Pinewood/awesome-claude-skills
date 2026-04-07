import { motion } from "framer-motion";
import type { CSSProperties, ReactNode } from "react";

interface HeroSlideProps {
  title: string;
  subtitle?: string;
  /** Optional element rendered below the subtitle */
  children?: ReactNode;
  /** Background — color, gradient, or image url */
  bg?: string;
  style?: CSSProperties;
}

export default function HeroSlide({
  title,
  subtitle,
  children,
  bg,
  style,
}: HeroSlideProps) {
  return (
    <section
      style={{
        width: "100%",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "4rem 2rem",
        textAlign: "center",
        background: bg,
        ...style,
      }}
    >
      <motion.h1
        initial={{ opacity: 0, y: 30 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        style={{
          fontFamily: "var(--font-heading)",
          fontSize: "clamp(2.5rem, 6vw, 5rem)",
          fontWeight: 700,
          marginBottom: subtitle ? "1.5rem" : "2rem",
        }}
      >
        {title}
      </motion.h1>

      {subtitle && (
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          style={{
            fontSize: "clamp(1.1rem, 2vw, 1.5rem)",
            color: "var(--text-secondary)",
            maxWidth: "700px",
            marginBottom: "2rem",
          }}
        >
          {subtitle}
        </motion.p>
      )}

      {children && (
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.3 }}
        >
          {children}
        </motion.div>
      )}
    </section>
  );
}
