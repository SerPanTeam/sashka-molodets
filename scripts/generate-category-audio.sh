#!/usr/bin/env bash
set -u
category="$1"; shift
ids=("$@")
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

for id in "${ids[@]}"; do
  echo "::group::[$category] $id"
  date -u "+[%Y-%m-%dT%H:%M:%SZ] ITEM START category=$category id=$id"
  status=success
  node scripts/generate-one-audio.mjs --id="$id" --mode=de --kinds=question,success --pause-ms=7000 || status=error

  git add public/assets/generated/audio public/assets/generated/progress.json content/categories
  test ! -f logs/generation.jsonl || git add -f logs/generation.jsonl
  if ! git diff --cached --quiet; then
    git commit -m "feat: checkpoint Gemini audio ${category}/${id} (${status})"
    git pull --rebase origin main
    git push origin HEAD:main
    echo "CHECKPOINT SAVED category=$category id=$id status=$status"
  else
    echo "NO CHANGES category=$category id=$id status=$status"
  fi
  date -u "+[%Y-%m-%dT%H:%M:%SZ] ITEM END category=$category id=$id status=$status"
  echo "::endgroup::"
  sleep 2
done
