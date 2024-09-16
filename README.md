# Gource multi-repo preprocessor

Preprocessor that lets you use [Gource](https://github.com/acaudwell/Gource) to visualize multiple repos in a single pretty tree.

## Basic Usage

1.  Clone the repo and running `yarn install`
2.  Create a configuration file listing which repositories you want to include.

        [
          {
            "repoPath": "~/Code/repository-1",
            "prefix": "repos1"
          },
          {
            "repoPath": "~/Code/repository-2",
            "prefix": "repos2"
          }
        ]

3.  Run

        yarn log -c /path/to/repo/config.json \
          | gource --log-format custom -

### Additional Options

- `--since` - Similar to git's `--since` parameter, only look at logs from that date. Accepts date formats or "7 days ago" style natural language.
- `--consolidate-before` - Squash any commits before this date into a single "initial commit". Helps pre-populate gource with a file tree based on previous work.
- Pipe output to a file instead of directly to Gource - You can then run `gource /path/to/file.log` to see the visualization.
