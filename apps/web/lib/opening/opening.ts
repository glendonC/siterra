// The opening page's words: what Siterra does, how, and the case it opens on. The case question is the
// case record's own (EnvironmentalCase.objective), so the page names no place itself.

import { en, format } from "../copy/en";

export interface OpeningCopy {
  what: string;
  how: string;
  caseLine: string;
  action: string;
  skip: string;
}

export function openingCopy(question: string): OpeningCopy {
  return {
    what: en["opening.what"].text,
    how: en["opening.how"].text,
    caseLine: format("opening.case", { question }),
    action: en["opening.action"].text,
    skip: en["opening.skip"].text,
  };
}
