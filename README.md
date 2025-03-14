# Gource multi-repo preprocessor

Preprocessor that lets you use [Gource](https://github.com/acaudwell/Gource) to visualize multiple repos in a single pretty tree.

## Installation

```
$ npm install --global gource-multi
```

## Usage

1.  Create a JSON configuration file with the following shape:

        {
          "repos": [
            {
              "repoPath": "~/Code/my-repository-1",
              "label": "my-repository-1",
            },
            {
              "repoPath": "~/Code/my-repository-2"
            }
          ]
        }

2.  Run `gource-multi [config-file]`

        npm start

### Advanced Usage

- `--since` - Similar to git's `--since` parameter, only look at logs from that date. Accepts date formats or "7 days ago" style natural language.
- `--consolidate-before` - Squash any commits before this date into a single "initial commit". Helps pre-populate gource with a file tree based on previous work.
- `--fake-initial-commit` - If you hide root directory connections in gource, and there is one repo that has logs before any others, it will change what it thinks of as a "root" directory when the others show up. This option helps mitigate that.
- `--show-stats` - Output a table showing the number of commits for each repository that is analyzed.
- `--no-gource` - Output the consolidated raw logs, instead of launching the Gource visualization. (Otherwise, requires gource installed in your PATH.)
- `--output` - Specify a filename to save the visualization as a video. (Requires ffmpeg installed in your PATH.)
- Include an object in your config file to provide values for other command-line options:

      {
        "repos": [...],
        "options": {
          "since": "7 days ago",
          "consolidateBefore": "2022-01-01",
          "fakeInitialCommit": true,
          "showStats": true,
          "output":
        }
      }

- Include a `"ref"` property on the items in your `"repos"` collection to get logs for something other than the checked-out branch:

      {
        "repos": [
          {
            "repoPath": "~/Code/repository-1",
            "label": "repo1",
            "ref": "upstream/main"
          },
          {
            "repoPath": "~/Code/repository-1",
            "label": "repo1-mybranch",
            "ref": "my-branch"
          }
        ]
      }

- Include a `"filterLogs"` property on the items in your `"repos"` collection to filter by log message:

      {
        "repos": [
          {
            "repoPath": "~/Code/repository-1",
            "label": "repo1",
            "filterLogs": {
              "pattern": "publish$",
              "invert": true
            }
          }
        ]
      }

- Include advanced options for gource or ffmpeg in your `"options"` object:

      {
        "repos": [...],
        "options": {
          "gourceArguments": ["--hide", "dirnames,filenames,root"],
          "ffmpegArguments": ["-vcodec", "libx264", "-pix_fmt", "yuv420p"]
        }
      }

## Development

1.  Clone the repo and run `npm install`
2.  Create a `gource-multi.json` file at the repo root (or copy the `gource-multi.example.json`) and customize it with the repos and options you want to work with.
3.  Run

        npm start

    or

        npm start:debug
