import { basename } from "path";

import { parseDate } from "chrono-node";
import z from "zod";

export function parseDateArgument(value: string | undefined) {
  if (value == null) return;

  const date = parseDate(value);
  if (date == null) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date.getTime();
}

export function toTrueOrUndefined(value: boolean | undefined) {
  return value ? true : undefined;
}

export const configSchema = z.object({
  repos: z.array(
    z
      .object({
        repoPath: z.string(),
        label: z.string().optional(),
        ref: z.string().optional(),
        filterLogs: z
          .object({
            pattern: z.string(),
            invert: z.boolean().optional(),
          })
          .optional(),
      })
      .transform((arg) => ({ label: basename(arg.repoPath), ...arg })),
  ),
  options: z
    .object({
      since: z.string().transform(parseDateArgument).optional(),
      consolidateBefore: z.string().transform(parseDateArgument).optional(),
      fakeInitialCommit: z.boolean().transform(toTrueOrUndefined).optional(),
      showStats: z.boolean().transform(toTrueOrUndefined).optional(),
      gourceArguments: z.array(z.string()).optional(),
      ffmpegArguments: z.array(z.string()).optional(),
      gource: z.boolean().optional().default(true),
      output: z.string().optional(),
    })
    .optional(),
});

export type RepoConfig = z.infer<typeof configSchema>["repos"][number];
export type Options = NonNullable<z.infer<typeof configSchema>["options"]>;
