#!/usr/bin/env bash
set -u
category="$1"; shift
ids=("$@")
provider="${AI_DEFAULT_PROVIDER:-openai}"
quality="${OPENAI_IMAGE_QUALITY:-medium}"
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

for id in "${ids[@]}"; do
  echo "::group::[$provider/image/$category] $id"
  date -u "+[%Y-%m-%dT%H:%M:%SZ] IMAGE START provider=$provider quality=$quality category=$category id=$id"
  status=success
  node scripts/generate-one-image.mjs --provider="$provider" --quality="$quality" --id="$id" || status=error

  git add public/assets/generated/images public/assets/generated/progress.json content/categories
  test ! -f logs/generation.jsonl || git add -f logs/generation.jsonl
  if ! git diff --cached --quiet; then
    git commit -m "feat: checkpoint ${provider} image ${category}/${id} (${status})"
    git pull --rebase origin main
    git push origin HEAD:main
    echo "CHECKPOINT SAVED provider=$provider category=$category id=$id status=$status"
  else
    echo "NO CHANGES provider=$provider category=$category id=$id status=$status"
  fi
  date -u "+[%Y-%m-%dT%H:%M:%SZ] IMAGE END provider=$provider category=$category id=$id status=$status"
  echo "::endgroup::"
  sleep 1
done
