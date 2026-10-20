import { Brand } from "@/components/brand";
import { GitHubMark, Icon } from "@/components/ui/icon";
import styles from "./welcome.module.css";

function GateDiagram() {
  return (
    <svg
      className={styles.gateSvg}
      viewBox="0 0 400 300"
      role="img"
      aria-labelledby="gate-title gate-desc"
    >
      <title id="gate-title">A branch waiting at a review gate before the main line</title>
      <desc id="gate-desc">
        A main line runs left to right. An agent branch leaves the line, waits at a marked review
        gate, and does not merge.
      </desc>

      <path className={styles.gateMain} d="M24 150H376" />
      <g className={styles.gateNodes}>
        <circle cx="64" cy="150" r="4.5" />
        <circle cx="160" cy="150" r="4.5" />
        <circle cx="352" cy="150" r="4.5" />
      </g>

      <path className={styles.gateBranch} d="M160 150C160 208 190 232 230 232H262C282 232 292 212 292 190V150" pathLength="1" />
      <circle className={styles.gateBranchTip} cx="292" cy="150" r="4" />

      <path className={styles.gatePost} d="M300 108V192" />
      <circle className={styles.gateDot} cx="300" cy="150" r="5" />

      <text className={styles.gateLabel} x="24" y="132">main</text>
      <text className={styles.gateMono} x="24" y="174">8f3c2a1</text>
      <text className={styles.gateMono} x="160" y="174">b71d4e0</text>
      <text className={styles.gateMono} x="352" y="174" textAnchor="end">19aa0c2</text>

      <text className={styles.gateBranchLabel} x="160" y="264">agent/auth-flow</text>
      <text className={styles.gateMono} x="160" y="282">+3 commits</text>
      <text className={styles.gateReview} x="300" y="96" textAnchor="middle">review</text>
      <text className={styles.gateMono} x="300" y="210" textAnchor="middle">not merged</text>

      <path className={styles.gateCheck} d="M314 120l4 4 8-9" />
      <text className={styles.gateClear} x="332" y="124">passing</text>
    </svg>
  );
}

export function Welcome({ authMessage }: { authMessage: string }) {
  return (
    <main className={styles.welcome}>
      <header className={styles.header}>
        <Brand />
        <span className={styles.readOnly}>
          <Icon name="lock" size={13} />
          Read-only
        </span>
      </header>

      <div className={styles.grid}>
        <section className={styles.copy} aria-labelledby="welcome-title">
          <h1 className={styles.headline} id="welcome-title">
            Your agents ship fast. You decide what reaches main.
          </h1>
          <p className={styles.lede}>
            Every branch, review, and check in one queue. Review from your phone, before it lands.
          </p>

          {authMessage ? (
            <div className={styles.authError} role="alert">
              {authMessage}
            </div>
          ) : null}

          <a className={styles.githubButton} href="/api/auth/github">
            <GitHubMark size={19} />
            Continue with GitHub
            <Icon name="arrowRight" size={16} />
          </a>

          <p className={styles.finePrint}>
            <Icon name="lock" size={13} />
            Read-only. Nothing merges from here.
          </p>
        </section>

        <div className={styles.gateWrap}>
          <GateDiagram />
          <p className={styles.gateCaption}>
            Every branch waits at the same gate. You decide what moves.
          </p>
        </div>
      </div>

      <footer className={styles.footer}>
        <span>Built for the in-between moments.</span>
        <span>GitHub App access. Refreshes every 5 minutes.</span>
      </footer>
    </main>
  );
}
