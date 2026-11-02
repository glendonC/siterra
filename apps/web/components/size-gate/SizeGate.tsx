import styles from "./SizeGate.module.css";

// Phones and small windows are out of scope for the hackathon (founder, 2 Nov 2026): below 1024 x 600 every page
// shows this one message instead of the screen. It is first in the body and hides everything after it there, so the
// screen behind it cannot be reached; above the bound it is not drawn at all.
export function SizeGate() {
  return (
    <div className={styles.gate} data-size-gate="">
      <p className={styles.message}>
        Siterra is made for a laptop or desktop screen. Make this window larger, or open it on a
        bigger screen.
      </p>
    </div>
  );
}
