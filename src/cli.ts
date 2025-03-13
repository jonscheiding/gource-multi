import { readFile } from "fs/promises";
import { basename, dirname, resolve } from "path";

import { program } from "@commander-js/extra-typings";

import { configSchema, parseDateArgument } from "./config.js";
import { outputLogsAll } from "./logs.js";

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
      ...config.options,
      ...options,
    };

    await outputLogsAll(repos, options, console.log);
  })
  .parse();
