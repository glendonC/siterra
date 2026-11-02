// Choosing a place and a question on the globe: what the card shows in each step.

/** The question on the globe card: none while the place is being chosen, the live question from step 2. */
export function cardQuestion(step: 1 | 2, question: string): string | null {
  return step === 2 && question.trim() ? question : null;
}
