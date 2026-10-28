// The opening page's words: what Siterra is, how it works, and the question it opens on. The question is
// the case record's own (EnvironmentalCase.objective), so the page names no place itself.

import { en } from "../copy/en";

export interface OpeningCopy {
  title: string;
  what: string;
  how: string;
  questionLabel: string;
  question: string;
  action: string;
  skip: string;
}

export function openingCopy(question: string): OpeningCopy {
  return {
    title: en["opening.title"].text,
    what: en["opening.what"].text,
    how: en["opening.how"].text,
    questionLabel: en["opening.question"].text,
    question,
    action: en["opening.action"].text,
    skip: en["opening.skip"].text,
  };
}
