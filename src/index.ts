import { Console } from "console";
import { createReadStream } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { basename, dirname, join, resolve } from "path";
import { createInterface } from "readline";

import { exec } from "child-process-promise";
import { parseDate } from "chrono-node";
import { format } from "date-fns";
import z from "zod";

import { program } from "@commander-js/extra-typings";
import dbg from "debug";

const debug = dbg.debug("gource-multi");

const configSchema = z.object({
  repos: z.array(
    z.object({
      repoPath: z.string(),
      label: z.string().optional(),
      ref: z.string().optional(),
      filterLogs: z
        .object({
          pattern: z.string(),
          invert: z.boolean().optional(),
        })
        .optional(),
    }),
  ),
  options: z
    .object({
      since: z.string().optional(),
      consolidateBefore: z.string().optional(),
      fakeInitialCommit: z.boolean().optional(),
      workDir: z.string().optional(),
      showStats: z.boolean().optional(),
    })
    .optional(),
});

type Options = {
  since?: number;
  consolidateBefore?: number;
  fakeInitialCommit?: boolean;
  workDir?: string;
  showStats?: boolean;
};
type RepoConfig = z.infer<typeof configSchema>["repos"][number] & {
  label: string;
};
type RepoStats = { repo: RepoConfig; count: number };

const WORK_DIR = resolve(
  process.cwd(),
  process.env.GOURCE_MULTI_WORK_DIR ?? join(tmpdir(), "gource-multi"),
);

async function logRepo(
  repo: RepoConfig,
  startTimestamp: number | undefined,
  logPath: string,
): Promise<RepoStats> {
  const startDate = startTimestamp
    ? format(startTimestamp, "yyyy-LL-dd")
    : undefined;

  if (repo.ref != null) {
    await exec(`git fetch --all`, { cwd: repo.repoPath });
  }

  const gitArgs: string[] = [];

  if (startDate != null) {
    gitArgs.push(`--since ${startDate}`);
  }

  if (repo.filterLogs != null) {
    gitArgs.push(`--grep "${repo.filterLogs.pattern}"`);
    if (repo.filterLogs.invert) {
      gitArgs.push("--invert-grep");
    }
  }

  if (repo.ref != null) {
    gitArgs.push(repo.ref);
  }

  const lineCount = await exec(
    `git log --pretty=oneline ${gitArgs.join(" ")} | wc -l`,
    {
      cwd: repo.repoPath,
    },
  ).then(({ stdout }) => Number(stdout.trim()));

  debug(`Args for %s: %j`, repo.repoPath, gitArgs);

  if (lineCount === 0) {
    //
    // Gource throws if there are no logs in the output
    // so we have to check first
    //

    debug(`No logs found for %s`, repo.repoPath);

    await writeFile(logPath, "");
  } else {
    const { stdout: gitCommand } = await exec("gource --log-command git");

    debug(`Log command for %s: $j`, repo.repoPath, gitArgs);

    await exec(
      `${gitCommand.trim()} ${gitArgs.join(" ")} | tac | tac | gource --log-format git --output-custom-log ${logPath} -`,
      {
        cwd: repo.repoPath,
      },
    );
  }

  return { repo: repo, count: lineCount };
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
  repos: RepoConfig[],
  writer: (line: string) => void,
): Promise<RepoStats[]> {
  const allLogs: string[] = [];
  const allStats: RepoStats[] = [];

  await Promise.all(
    repos.map(async (repo) => {
      const logPath = join(WORK_DIR, `${repo.label}.log`);
      try {
        const stats = await logRepo(repo, opts.since, logPath);
        const logs = await readAndProcessLogs(
          logPath,
          repo.label,
          opts.consolidateBefore,
        );
        allStats.push(stats);
        allLogs.push(...logs);
      } catch (e) {
        console.error(e);
        throw new Error(`Error processing ${repo.label}`);
      }
    }),
  );

  allLogs.sort();

  process.stdout.on("error", function (err) {
    if (err.code == "EPIPE") {
      process.exit(0);
    }
  });

  if (allLogs.length === 0) return allStats;

  if (opts.fakeInitialCommit) {
    const [initialTimestamp] = allLogs[0].split("|");
    for (const repo of repos) {
      writer(`${initialTimestamp}|Initial|A|/${repo.label}/.`);
    }
  }

  for (const log of allLogs) {
    writer(log);
  }

  return allStats;
}

function parseDateArgument(value: string | undefined) {
  if (value == null) return;

  const date = parseDate(value);
  if (date == null) {
    throw new Error(`Invalid date: ${value}`);
  }
  return date.getTime();
}

async function logRepos(
  repos: RepoConfig[],
  opts: Options,
  writer: (line: string) => void,
) {
  const allStats = await outputLogs(opts, repos, writer);

  if (opts.showStats) {
    const statsTable = allStats.map((stats) => ({
      label: stats.repo.label ?? basename(stats.repo.repoPath),
      count: stats.count,
    }));

    statsTable.push({
      label: "TOTAL",
      count: statsTable.reduce((prev, current) => prev + current.count, 0),
    });

    new Console(process.stderr).table(statsTable);
  }
}

program
  .argument(
    "[config-file]",
    "Configuration file containing repository list and options.",
    resolve(process.cwd(), "gource-multi.json"),
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
  )
  .option(
    "--show-stats",
    "Show a table of the commit counts for each repo, and the total.",
  )
  .action(async (configPath, options) => {
    await mkdir(WORK_DIR, { recursive: true });

    const config = await readFile(configPath)
      .then((r) => r.toString())
      .then(JSON.parse)
      .then(configSchema.parseAsync);

    const repos = config.repos.map((repo) => ({
      ...repo,
      repoPath: resolve(dirname(configPath), repo.repoPath),
      label: repo.label ?? basename(repo.repoPath),
    }));

    options = {
      since: parseDateArgument(config.options?.since),
      consolidateBefore: parseDateArgument(config.options?.consolidateBefore),
      fakeInitialCommit: config.options?.fakeInitialCommit ? true : undefined,
      ...options,
    };

    await logRepos(repos, options, console.log);
  })
  .parse();
