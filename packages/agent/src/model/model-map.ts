import { describeRoute } from "./route.ts";
import type { ModelTransport } from "./transport.ts";

// The "Models in this case" map (TR-05, ADR-0041), generated from what the worker is configured to
// run, so it cannot drift from it. Only jobs with code in this build are listed; P1 jobs appear when
// their executors exist.

export interface ModelJob {
  job: string;
  model: string;
  check: string;
  priority: "P0" | "P1";
}

export const P0_JOBS: readonly ModelJob[] = [
  {
    job: "Plan a command into at most eight tasks",
    model: "muse-spark-1.3",
    check: "Schema, references and limits checked by code",
    priority: "P0",
  },
  {
    job: "Describe observations from validated bundles",
    model: "muse-spark-1.3",
    check: "Every number matched to a cited measurement; claim rules; prohibited-claims scan",
    priority: "P0",
  },
  {
    job: "Read sources and propose located statements",
    model: "muse-spark-1.3",
    check: "Excerpt found verbatim on the cited page; numbers only from the excerpt",
    priority: "P0",
  },
];

export interface ModelMapRow extends ModelJob {
  route: string;
}

export function modelMap(
  transport: ModelTransport,
  jobs: readonly ModelJob[] = P0_JOBS,
): ModelMapRow[] {
  const { label } = describeRoute(transport);
  return jobs.map((job) => ({ ...job, route: label }));
}
