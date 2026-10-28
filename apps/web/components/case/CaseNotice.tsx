// A plain notice in place of the valley when a case cannot be shown: what happened and what to do, under a
// badge when the notice is a coverage boundary.

import { en, type MessageId } from "../../lib/copy/en";
import styles from "./CaseNotice.module.css";

export function CaseNotice({ message, badge }: { message: MessageId; badge?: MessageId }) {
  return (
    <p className={styles.notice} role="status">
      {badge ? <span className={styles.badge}>{en[badge].text}</span> : null}
      {en[message].text}
    </p>
  );
}
