// The opening page's words: the case's own question (EnvironmentalCase.objective), one sentence of what Siterra does,
// the one action, and how it works behind a quiet button. The page names no place itself: the question does.

import { en } from "../copy/en";

export interface OpeningCopy {
  title: string;
  question: string;
  what: string;
  action: string;
  howButton: string;
  how: string;
}

export function openingCopy(question: string): OpeningCopy {
  return {
    title: en["opening.title"].text,
    question,
    what: en["opening.what"].text,
    action: en["opening.action"].text,
    howButton: en["opening.howButton"].text,
    how: en["opening.how"].text,
  };
}
