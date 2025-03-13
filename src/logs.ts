import { Console } from "console";
import { createReadStream } from "fs";
import { mkdir, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { basename, join, resolve } from "path";
import { createInterface } from "readline";

import { exec } from "child-process-promise";
import { format } from "date-fns";

import dbg from "debug";

import { Options, RepoConfig } from "./config.js";

const debug = dbg.debug("gource-multi");

type RepoStats = { repo: RepoConfig; count: number };

export const WORK_DIR = resolve(
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

export async function outputLogsAll(
  repos: RepoConfig[],
  opts: Options,
  writer: (line: string) => void,
) {
  await mkdir(WORK_DIR, { recursive: true });

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
