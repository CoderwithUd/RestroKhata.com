import type { ReactNode } from "react";
import styles from "./Reveal.module.css";

type RevealProps = {
  children: ReactNode;
  className?: string;
  delay?: 1 | 2 | 3 | 4 | 5;
};

export default function Reveal({ children, className = "", delay }: RevealProps) {
  const delayClass = delay ? styles[`delay${delay}`] : "";
  return <div className={`${styles.reveal} ${delayClass} ${className}`}>{children}</div>;
}
