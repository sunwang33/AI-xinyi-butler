#!/usr/bin/env bash
# 将 web/index.html 发布到 GitHub Pages（gh-pages 孤立分支）。
# 用法（Git Bash，仓库根或 web/ 下均可）：bash web/deploy-pages.sh
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -f web/index.html ]; then
  echo "找不到 web/index.html" >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'git worktree remove --force "$TMP/site" 2>/dev/null || true; rm -rf "$TMP"' EXIT

# gh-pages 分支已存在（首次部署由人工创建）；worktree 检出该分支到临时目录
git fetch origin gh-pages --quiet
git worktree add --detach "$TMP/site" origin/gh-pages --quiet
git -C "$TMP/site" checkout -B gh-pages --quiet

cp web/index.html "$TMP/site/index.html"
git -C "$TMP/site" add index.html
if git -C "$TMP/site" diff --cached --quiet; then
  echo "页面无改动，跳过部署。"
  exit 0
fi
git -C "$TMP/site" commit -m "部署：更新密码重置页 $(date +%F)" --quiet
git -C "$TMP/site" push origin gh-pages --quiet
echo "已推送，约 1 分钟后生效：https://sunwang33.github.io/AI-xinyi-butler/"
