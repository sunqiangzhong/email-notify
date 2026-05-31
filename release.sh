#!/bin/bash
# 发布脚本 - 自动读取版本号、提交、打标签、构建推送 Docker 镜像
# 用法: ./release.sh          (自动从 server/package.json 读取版本号)
#       ./release.sh 1.0.4    (手动指定版本号)

set -e

# 自动读取版本号
VERSION=${1:-$(grep -o '"version": *"[^"]*"' server/package.json | head -1 | sed 's/.*"version": *"\([^"]*\)"/\1/')}

if [ -z "$VERSION" ]; then
  echo "❌ 无法获取版本号"
  exit 1
fi

# 确保版本号不以 v 开头（用于 package.json）
VERSION_NUM="${VERSION#v}"
# 带 v 前缀（用于 git tag 和 docker tag）
VERSION_TAG="v${VERSION_NUM}"

echo "============================================"
echo "🚀 发布 $VERSION_TAG"
echo "============================================"
echo ""

# 1. 更新 server/package.json 版本号
echo "📝 更新 server/package.json -> $VERSION_NUM"
if command -v jq &> /dev/null; then
  jq ".version = \"$VERSION_NUM\"" server/package.json > /tmp/pkg.json && mv /tmp/pkg.json server/package.json
else
  sed -i.bak "s/\"version\": \"[^\"]*\"/\"version\": \"$VERSION_NUM\"/" server/package.json && rm -f server/package.json.bak
fi

# 2. 更新 server/version.json
echo "📝 更新 server/version.json -> $VERSION_NUM"
cat > server/version.json << EOF
{
  "currentVersion": "$VERSION_NUM",
  "latestVersion": "$VERSION_NUM",
  "releaseUrl": "",
  "releaseNotes": "",
  "publishedAt": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF

# 3. Git 提交 & 打标签 & 推送
echo ""
echo "📦 git add . && git commit && git tag && git push"
git add .
git diff --cached --quiet && echo "⚠️  没有变更需要提交" || git commit -m "release: $VERSION_TAG"
git tag -f $VERSION_TAG
git push origin main
git push origin -f $VERSION_TAG

# 4. 构建并推送 Docker 镜像
echo ""
echo "🐳 docker buildx build & push"
docker buildx build \
  --platform linux/amd64 \
  -t sunqz/email-notify:$VERSION_TAG \
  -t sunqz/email-notify:latest \
  -f Dockerfile \
  --push .

echo ""
echo "============================================"
echo "✅ 发布完成: $VERSION_TAG"
echo "   Docker: sunqz/email-notify:$VERSION_TAG"
echo "   Docker: sunqz/email-notify:latest"
echo "   Git:    $VERSION_TAG"
echo "============================================"
