#!/usr/bin/env bash
set -u
category="$1"; shift
ids=("$@")
provider="${AI_DEFAULT_PROVIDER:-openai}"
quality="${OPENAI_IMAGE_QUALITY:-medium}"
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

failures=0

push_checkpoint() {
  local attempt
  for attempt in 1 2 3 4 5; do
    if git pull --rebase origin main && git push origin HEAD:main; then
      return 0
    fi
    echo "PUSH RETRY $attempt/5 category=$category"
    git rebase --abort 2>/dev/null || true
    sleep $((attempt * 2))
  done
  return 1
}

for id in "${ids[@]}"; do
  echo "::group::[$provider/image/$category] $id"
  date -u "+[%Y-%m-%dT%H:%M:%SZ] IMAGE START provider=$provider quality=$quality category=$category id=$id"
  status=success

  if ! node scripts/generate-one-image.mjs --provider="$provider" --quality="$quality" --id="$id"; then
    status=error
  fi

  image="public/assets/generated/images/${id}.png"
  if [[ ! -s "$image" ]]; then
    echo "ERROR: expected generated image is missing or empty: $image"
    status=error
  fi

  git add -f public/assets/generated/images
  git add public/assets/generated/progress.json content/categories
  test ! -f logs/generation.jsonl || git add -f logs/generation.jsonl

  if ! git diff --cached --quiet; then
    git commit -m "feat: checkpoint ${provider} image ${category}/${id} (${status})"
    if push_checkpoint; then
      echo "CHECKPOINT SAVED provider=$provider category=$category id=$id status=$status"
    else
      echo "ERROR: checkpoint push failed after retries category=$category id=$id"
      status=error
    fi
  else
    echo "NO CHANGES provider=$provider category=$category id=$id status=$status"
  fi

  # Verify the checkpoint is not only present in the runner but also tracked in
  # the current repository state. This prevents a green Actions step with a
  # generated file that disappears when the runner is destroyed.
  if [[ "$status" == "success" ]]; then
    if ! git ls-files --error-unmatch "$image" >/dev/null 2>&1; then
      echo "ERROR: image exists locally but is not tracked by git: $image"
      status=error
    fi
  fi

  if [[ "$status" != "success" ]]; then
    failures=$((failures + 1))
  fi

  date -u "+[%Y-%m-%dT%H:%M:%SZ] IMAGE END provider=$provider category=$category id=$id status=$status"
  echo "::endgroup::"
  sleep 1
done

if (( failures > 0 )); then
  echo "ERROR: $failures image checkpoint(s) failed in category $category"
  exit 2
fi
