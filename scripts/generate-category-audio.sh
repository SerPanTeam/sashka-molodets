#!/usr/bin/env bash
set -u
category="$1"; shift
ids=("$@")
provider="${AI_DEFAULT_PROVIDER:-openai}"
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

for id in "${ids[@]}"; do
  echo "::group::[$provider/$category] $id"
  date -u "+[%Y-%m-%dT%H:%M:%SZ] ITEM START provider=$provider category=$category id=$id"
  status=success
  node scripts/generate-one-audio.mjs --provider="$provider" --id="$id" --mode=de --kinds=question,success --pause-ms=1200 || status=error

  git add public/assets/generated/audio public/assets/generated/progress.json content/categories
  test ! -f logs/generation.jsonl || git add -f logs/generation.jsonl
  if ! git diff --cached --quiet; then
    git commit -m "feat: checkpoint ${provider} audio ${category}/${id} (${status})"
    git pull --rebase origin main
    git push origin HEAD:main
    echo "CHECKPOINT SAVED provider=$provider category=$category id=$id status=$status"
  else
    echo "NO CHANGES provider=$provider category=$category id=$id status=$status"
  fi
  date -u "+[%Y-%m-%dT%H:%M:%SZ] ITEM END provider=$provider category=$category id=$id status=$status"
  echo "::endgroup::"
  sleep 1
done
