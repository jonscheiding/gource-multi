import { createReadStream } from "fs";
import { readFile, writeFile } from "fs/promises";
import { basename, dirname, resolve } from "path";
import { createInterface } from "readline";
import { fileURLToPath } from "url";

import { exec } from "child-process-promise";
import { format } from "date-fns";
import z from "zod";

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
  initialTimestamp: number,
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

    if (parts[0] < initialTimestamp) {
      if (initialFiles.has(parts[3])) return;
      initialFiles.add(parts[3]);

      parts[0] = initialTimestamp - 100 * 86400;
      parts[1] = "Initial";
    }

    lines.push(parts.join("|"));
  });

  await new Promise<void>((resolve) => {
    rl.on("close", resolve);
  });

  return lines;
}

async function index() {
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
      await logRepo(repoPath, logPath, Date.now() - 86400 * 7 * 1000);
      const logs = await readAndProcessLogs(logPath, label, 1725897448);
      allLogs.push(...logs);
    }),
  );

  allLogs.sort();

  await writeFile(
    resolve(__dirname, "../.data/consolidated.log"),
    allLogs.join("\n"),
  );
}

await index();
