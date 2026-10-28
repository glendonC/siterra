// A plain notice in place of the valley when a case cannot be shown: what happened and what to do.

import { en, type MessageId } from "../../lib/copy/en";
import styles from "./CaseNotice.module.css";

export function CaseNotice({ message }: { message: MessageId }) {
  return (
    <p className={styles.notice} role="status">
      {en[message].text}
    </p>
  );
}
