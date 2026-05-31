#!/bin/bash
# 构建时获取 GitHub Release 版本信息

VERSION_FILE="/app/server/version.json"
GITHUB_REPO="sunqiangzhong/email-notify"
PACKAGE_JSON="/app/server/package.json"

echo "[BUILD] 获取 GitHub Release 版本信息..."

# 从 package.json 读取当前版本
CURRENT_VERSION="1.0.0"
if [ -f "$PACKAGE_JSON" ]; then
    CURRENT_VERSION=$(jq -r '.version // "1.0.0"' "$PACKAGE_JSON")
fi
echo "[BUILD] 当前版本: v${CURRENT_VERSION}"

# 尝试获取最新的 Release
RELEASE_DATA=$(curl -s --connect-timeout 10 --max-time 15 "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" 2>/dev/null)
CURL_EXIT=$?

if [ $CURL_EXIT -eq 0 ] && echo "$RELEASE_DATA" | jq -e '.tag_name' > /dev/null 2>&1; then
    # 成功获取到 Release 信息
    LATEST_VERSION=$(echo "$RELEASE_DATA" | jq -r '.tag_name' | sed 's/^v//')
    RELEASE_URL=$(echo "$RELEASE_DATA" | jq -r '.html_url')
    RELEASE_NOTES=$(echo "$RELEASE_DATA" | jq -r '.body // ""' | head -c 1000)
    PUBLISHED_AT=$(echo "$RELEASE_DATA" | jq -r '.published_at')

    cat > "$VERSION_FILE" << EOF
{
  "currentVersion": "${CURRENT_VERSION}",
  "latestVersion": "${LATEST_VERSION}",
  "releaseUrl": "${RELEASE_URL}",
  "releaseNotes": $(echo "$RELEASE_NOTES" | jq -Rs .),
  "publishedAt": "${PUBLISHED_AT}"
}
EOF

    echo "[BUILD] ✅ 获取版本信息成功"
    echo "[BUILD]    当前版本: v${CURRENT_VERSION}"
    echo "[BUILD]    最新版本: v${LATEST_VERSION}"
else
    # 获取失败，使用当前版本
    echo "[BUILD] ⚠️ 获取 GitHub Release 失败 (exit: $CURL_EXIT)"

    # 检查是否是速率限制
    if echo "$RELEASE_DATA" | grep -q "rate limit"; then
        echo "[BUILD] ⚠️ GitHub API 速率限制"
    fi

    cat > "$VERSION_FILE" << EOF
{
  "currentVersion": "${CURRENT_VERSION}",
  "latestVersion": "${CURRENT_VERSION}",
  "releaseUrl": "https://github.com/${GITHUB_REPO}/releases",
  "releaseNotes": "",
  "publishedAt": null
}
EOF

    echo "[BUILD] ⚠️ 使用当前版本作为最新版本"
fi

echo "[BUILD] 版本信息已保存到 ${VERSION_FILE}"
cat "$VERSION_FILE"
