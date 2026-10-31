// The opening page's words: what Siterra does, in general, the one action into the globe, and how it works behind a
// quiet button. The page names no place and no case: each case waits on the globe with its own question.

import { en } from "../copy/en";

export interface OpeningCopy {
  title: string;
  what: string;
  subline: string;
  action: string;
  howButton: string;
  how: string;
}

export function openingCopy(): OpeningCopy {
  return {
    title: en["opening.title"].text,
    what: en["opening.what"].text,
    subline: en["opening.subline"].text,
    action: en["opening.action"].text,
    howButton: en["opening.howButton"].text,
    how: en["opening.how"].text,
  };
}
