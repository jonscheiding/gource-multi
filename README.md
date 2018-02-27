# Gource Multi

PowerShell script for [gource](http://gource.io/)'ing multiple repositories.

## Usage

To set up your Gource Multi script environment

```bash
#
# Clone the gource-multi repo
#
git clone git@github.com:jonscheiding/gource-multi.git

#
# Clone the repositories you want to visualize into subdirectories of the gource-multi repo root
#
cd gource-multi
git clone git@github.com:user1/repository1.git
git clone git@github.com:user2/repository2.git
```

To run, simply execute `gource.ps1` in the repository root.

### Directory Aliases

To visualize multiple branches of the same repository, you can clone the repository multiple times, and set the custom Git config property `gourceMulti.directoryAlias` to tell the script that they are the same repo.

```bash
git clone git@github.com:user1/repository1.git
git clone -b somebranch git@github.com:user1/repository1.git repository1-somebranch

git -C repository1-somebranch config gourceMulti.directoryAlias repository1

./gource.ps1
```

This will combine the changes in both repos onto a single node in the visualization.