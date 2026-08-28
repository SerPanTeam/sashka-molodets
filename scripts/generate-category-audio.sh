#!/usr/bin/env bash
set -u
category="$1"; shift
ids=("$@")
provider="${AI_DEFAULT_PROVIDER:-openai}"
mode="${AUDIO_MODE:-de}"
git config user.name 'github-actions[bot]'
git config user.email '41898282+github-actions[bot]@users.noreply.github.com'

failures=0

push_checkpoint() {
  local attempt
  for attempt in 1 2 3 4 5; do
    if git pull --rebase origin main && git push origin HEAD:main; then
      return 0
    fi
    echo "PUSH RETRY $attempt/5 category=$category mode=$mode"
    git rebase --abort 2>/dev/null || true
    sleep $((attempt * 2))
  done
  return 1
}

for id in "${ids[@]}"; do
  echo "::group::[$provider/$mode/$category] $id"
  date -u "+[%Y-%m-%dT%H:%M:%SZ] ITEM START provider=$provider mode=$mode category=$category id=$id"
  status=success

  if ! node scripts/generate-one-audio.mjs --provider="$provider" --id="$id" --mode="$mode" --kinds=question,success --pause-ms=1200; then
    status=error
  fi

  question="public/assets/generated/audio/${id}.question.${mode}.wav"
  success="public/assets/generated/audio/${id}.success.${mode}.wav"
  for audio in "$question" "$success"; do
    if [[ ! -s "$audio" ]]; then
      echo "ERROR: expected generated audio is missing or empty: $audio"
      status=error
    fi
  done

  git add -f public/assets/generated/audio
  git add public/assets/generated/progress.json content/categories
  test ! -f logs/generation.jsonl || git add -f logs/generation.jsonl

  if ! git diff --cached --quiet; then
    git commit -m "feat: checkpoint ${provider} ${mode} audio ${category}/${id} (${status})"
    if push_checkpoint; then
      echo "CHECKPOINT SAVED provider=$provider mode=$mode category=$category id=$id status=$status"
    else
      echo "ERROR: checkpoint push failed after retries category=$category mode=$mode id=$id"
      status=error
    fi
  else
    echo "NO CHANGES provider=$provider mode=$mode category=$category id=$id status=$status"
  fi

  if [[ "$status" == "success" ]]; then
    for audio in "$question" "$success"; do
      if ! git ls-files --error-unmatch "$audio" >/dev/null 2>&1; then
        echo "ERROR: audio exists locally but is not tracked by git: $audio"
        status=error
      fi
    done
  fi

  if [[ "$status" != "success" ]]; then
    failures=$((failures + 1))
  fi

  date -u "+[%Y-%m-%dT%H:%M:%SZ] ITEM END provider=$provider mode=$mode category=$category id=$id status=$status"
  echo "::endgroup::"
  sleep 1
done

if (( failures > 0 )); then
  echo "ERROR: $failures audio checkpoint(s) failed in category $category mode=$mode"
  exit 2
fi
