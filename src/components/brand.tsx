import styles from "./brand.module.css";

export function GateMark({ size = 24 }: { size?: number }) {
  return (
    <svg
      className={styles.mark}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
    >
      <path d="M3 21V3h10v18M9 21V9h12v12" />
      <circle cx="15" cy="15" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function Brand({ className = "" }: { className?: string }) {
  return (
    <a className={`${styles.brand} ${className}`} href="/" aria-label="Agent Activity home">
      <GateMark />
      <span>
        agent <span className={styles.muted}>activity</span>
      </span>
    </a>
  );
}
