# Gource multi-repo preprocessor

Preprocessor that lets you use [Gource](https://github.com/acaudwell/Gource) to visualize multiple repos in a single pretty tree.

## Basic Usage

1.  Clone the repo and running `yarn install`
2.  Create a configuration file listing which repositories you want to include.

        {
          "repos": [
            {
              "repoPath": "~/Code/repository-1",
              "prefix": "repos1"
            },
            {
              "repoPath": "~/Code/repository-2",
              "prefix": "repos2"
            }
          ]
        }

3.  Run

        yarn build -c /path/to/repo/config.json \
          | gource --log-format custom -

## Advanced Usage

- `--since` - Similar to git's `--since` parameter, only look at logs from that date. Accepts date formats or "7 days ago" style natural language.
- `--consolidate-before` - Squash any commits before this date into a single "initial commit". Helps pre-populate gource with a file tree based on previous work.
- `--fake-initial-commit` - If you hide root directory connections in gource, and there is one repo that has logs before any others, it will change what it thinks of as a "root" directory when the others show up. This option helps mitigate that.
- Pipe output to a file instead of directly to Gource - You can then run `gource /path/to/file.log` to see the visualization.
- Include an object in your config file to provide values for other command-line options:

      {
        "repos": [...],
        "options": {
          "since": "7 days ago",
          "consolidateBefore": "2022-01-01",
          "fakeInitialCommit": true
        }
      }

- Include a `"ref"` property on the items in your `"repos"` collection to get logs for something other than the checked-out branch:

      {
        "repos": [
          {
            "repoPath": "~/Code/repository-1",
            "prefix": "repos1",
            "ref": "upstream/main"
          },
          {
            "repoPath": "~/Code/repository-1",
            "prefix": "repos1-mybranch",
            "ref": "my-branch"
          }
        ]
      }

- Include a `"filterLogs"` property on the items in your `"repos"` collection to filter by log message:

      {
        "repos": [
          {
            "repoPath": "~/Code/repository-1",
            "prefix": "repos1",
            "filterLogs": {
              "pattern": "publish$",
              "invert": true
            }
          }
        ]
      }

- Run `yarn start`. This will assume that in the [.data](.data) directory there is a `repos.json` and a `gource.conf` (which can be generated with `gource --save-config`), and run using the configuration provided in those files.
