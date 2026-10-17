#!/usr/bin/env bash
# Push the data commit(s) made in a workflow run to the branch it runs on, rebased onto whatever
# was pushed there since the checkout (another run, a merge). A few tries; fails the step if the
# push still doesn't go through (for example a rebase conflict on the same data file).
#   bash scripts/push-data.sh            (in a GitHub Actions step; GITHUB_REF_NAME is the branch)
set -u
branch="${GITHUB_REF_NAME:?GITHUB_REF_NAME is not set}"
for i in 1 2 3 4; do
  if git pull --rebase --autostash origin "$branch" && git push origin "HEAD:refs/heads/$branch"; then
    exit 0
  fi
  git rebase --abort >/dev/null 2>&1 || true
  echo "push to $branch: attempt $i failed"
  [ "$i" -lt 4 ] && sleep $((i * 10))
done
echo "::error::could not push the data commit to $branch"
exit 1
