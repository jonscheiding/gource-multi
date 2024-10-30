import { createReadStream } from "fs";
import { readFile, writeFile } from "fs/promises";
import { basename, dirname, join, resolve } from "path";
import { createInterface } from "readline";
import { fileURLToPath } from "url";

import { exec } from "child-process-promise";
import { parseDate } from "chrono-node";
import { format } from "date-fns";
import z from "zod";

import { Command } from "@commander-js/extra-typings";

const __dirname = dirname(fileURLToPath(import.meta.url));

const program = new Command()
  .requiredOption(
    "-c, --config <file>",
    "Use repository list from the provided file.",
  )
  .option(
    "-w, --work-dir <dir>",
    "Place temporary log files in <dir>. Defaults to <repo dir>/.data .",
    resolve(__dirname, "../.data"),
  )
  .option(
    "-s, --since <date>",
    "Only include logs after <date>",
    parseDateArgument,
  )
  .option(
    "-i, --consolidate-before <date>",
    "Consolidate all commits before <date> to a single 'Initial' commit.",
    parseDateArgument,
  )
  .option(
    "--fake-initial-commit",
    "Create a fake initial commit for each repository; " +
      "helpful if you are hiding root directory connections in Gource.",
  );

const configSchema = z.object({
  repos: z.array(
    z.object({
      repoPath: z.string(),
      label: z.string().optional(),
      ref: z.string().optional(),
    }),
  ),
  options: z
    .object({
      since: z.string().optional(),
      consolidateBefore: z.string().optional(),
      fakeInitialCommit: z.boolean().optional(),
    })
    .optional(),
});

type Options = ReturnType<typeof program.opts>;
type RepoConfig = z.infer<typeof configSchema>["repos"][number];

async function logRepo(
  repoPath: string,
  logPath: string,
  ref: string | undefined,
  startTimestamp: number | undefined,
) {
  const startDate = startTimestamp
    ? format(startTimestamp, "yyyy-LL-dd")
    : undefined;

  if (ref != null) {
    await exec(`git fetch --all`, { cwd: repoPath });
  }

  if (startDate) {
    //
    // Gource throws if there are no logs in the specified timeframe
    // so we have to check first
    //
    const { stdout: gitLogs } = await exec(
      `git log --since ${startDate} --pretty=oneline -1 ${ref ?? ""}`,
      {
        cwd: repoPath,
      },
    );
    if (gitLogs.trim() === "") {
      await writeFile(logPath, "");
      return;
    }
  }

  const gourceArgs: string[] = [];
  if (startDate != null) {
    gourceArgs.push(`--start-date ${startDate}`);
  }
  if (ref != null) {
    gourceArgs.push(`--git-branch ${ref}`);
  }

  await exec(`gource ${gourceArgs.join(" ")} --output-custom-log ${logPath}`, {
    cwd: repoPath,
  });
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
    if (line.length === 0) return;

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

async function outputLogs(
  opts: Options,
  repos: Array<RepoConfig & { label: string }>,
  writer: (line: string) => void,
) {
  const allLogs: string[] = [];

  await Promise.all(
    repos.map(async ({ repoPath, label, ref }) => {
      const logPath = join(opts.workDir, `${label}.log`);
      try {
        await logRepo(repoPath, logPath, ref, opts.since);
        const logs = await readAndProcessLogs(
          logPath,
          label,
          opts.consolidateBefore,
        );
        allLogs.push(...logs);
      } catch (e) {
        console.error(e);
        throw new Error(`Error processing ${label}`);
      }
    }),
  );

  allLogs.sort();

  process.stdout.on("error", function (err) {
    if (err.code == "EPIPE") {
      process.exit(0);
    }
  });

  if (allLogs.length === 0) return;

  if (opts.fakeInitialCommit) {
    const [initialTimestamp] = allLogs[0].split("|");
    for (const repo of repos) {
      writer(`${initialTimestamp}|Initial|A|/${repo.label}/.`);
    }
  }

  for (const log of allLogs) {
    writer(log);
  }
}

function parseDateArgument(value: string | undefined) {
  if (value == null) return;

  const date = parseDate(value);
  if (date == null) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date.getTime();
}

async function index(opts: Options) {
  const configPath = resolve(process.cwd(), opts.config);
  opts.workDir = resolve(process.cwd(), opts.workDir);

  const config = await readFile(configPath)
    .then((r) => r.toString())
    .then(JSON.parse)
    .then(configSchema.parseAsync);

  const repos = config.repos.map((repo) => ({
    ...repo,
    repoPath: resolve(dirname(configPath), repo.repoPath),
    label: repo.label ?? basename(repo.repoPath),
  }));

  opts = {
    since: parseDateArgument(config.options?.since),
    consolidateBefore: parseDateArgument(config.options?.consolidateBefore),
    fakeInitialCommit: config.options?.fakeInitialCommit ? true : undefined,
    ...opts,
  };

  await outputLogs(opts, repos, console.log);
}

await index(program.parse().opts());
