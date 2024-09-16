import { createReadStream } from "fs";
import { readFile } from "fs/promises";
import { basename, dirname, resolve } from "path";
import { createInterface } from "readline";
import { fileURLToPath } from "url";

import { exec } from "child-process-promise";
import { parseDate } from "chrono-node";
import { format } from "date-fns";
import z from "zod";

import { Command } from "@commander-js/extra-typings";

const __dirname = dirname(fileURLToPath(import.meta.url));

const configSchema = z.array(
  z.object({
    repoPath: z.string(),
    label: z.string().nullish(),
  }),
);

async function logRepo(
  repoPath: string,
  logPath: string,
  startTimestamp: number | undefined,
) {
  await exec(
    `gource ${
      startTimestamp
        ? `--start-date ${format(startTimestamp, "yyyy-LL-dd")}`
        : ""
    } --output-custom-log ${logPath}`,
    {
      cwd: repoPath,
    },
  );
}

async function readAndProcessLogs(
  logPath: string,
  label: string,
  initialTimestamp: number | undefined,
) {
  const initialFiles = new Set<string>();
  const lines: string[] = [];

  const rl = createInterface({ input: createReadStream(logPath) });

  rl.on("line", (line) => {
    const parts = line.split("|") as [
      date: number,
      author: string,
      type: string,
      filename: string,
    ];

    parts[3] = `/${label}${parts[3]}`;

    if (initialTimestamp && parts[0] < initialTimestamp / 1000) {
      if (initialFiles.has(parts[3])) return;
      initialFiles.add(parts[3]);

      //
      // Arbitrarily put the "initial commit" 100 days before the first real one
      //
      parts[0] = initialTimestamp / 1000 - 8640000;
      parts[1] = "Initial";
    }

    lines.push(parts.join("|"));
  });

  await new Promise<void>((resolve) => {
    rl.on("close", resolve);
  });

  return lines;
}

function parseDateArgument(value: string) {
  const date = parseDate(value);
  if (date == null) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date.getTime();
}

const program = new Command()
  .requiredOption(
    "-c, --config <file>",
    "Use repository list from the provided file",
  )
  .option(
    "-s, --since <date>",
    "Only include logs after <date>",
    parseDateArgument,
  )
  .option(
    "-i, --consolidate-before <date>",
    "Consolidate all commits before <date> to a single 'Initial' commit",
    parseDateArgument,
  );

async function index(opts: ReturnType<typeof program.opts>) {
  const configPath = resolve(__dirname, "../.data/repos.json");

  const configs = await readFile(configPath)
    .then((r) => r.toString())
    .then(JSON.parse)
    .then(configSchema.parseAsync)
    .then((configs) =>
      configs.map((config) => ({
        repoPath: resolve(dirname(configPath), config.repoPath),
        label: config.label ?? basename(config.repoPath),
      })),
    );

  const allLogs: string[] = [];

  await Promise.all(
    configs.map(async ({ repoPath, label }) => {
      const logPath = resolve(__dirname, `../.data/${label}.log`);
      await logRepo(repoPath, logPath, opts.since);
      const logs = await readAndProcessLogs(
        logPath,
        label,
        opts.consolidateBefore,
      );
      allLogs.push(...logs);
    }),
  );

  allLogs.sort();

  process.stdout.on("error", function (err) {
    if (err.code == "EPIPE") {
      process.exit(0);
    }
  });

  for (const log of allLogs) {
    console.log(log);
  }
}

await index(program.parse().opts());
