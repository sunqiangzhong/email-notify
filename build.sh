#!/bin/bash
# ============================================
# 构建 Mul-Email All-in-One 镜像 (linux/amd64)
# ============================================

set -e

IMAGE_NAME="sunqz/mul-email"
TAG="allinone-latest"
FULL_IMAGE="${IMAGE_NAME}:${TAG}"

echo "=========================================="
echo "构建 Mul-Email All-in-One 镜像"
echo "目标架构: linux/amd64 (x86_64 NAS)"
echo "=========================================="
echo ""

# 给脚本加执行权限
chmod +x docker-entrypoint.sh

# 检查 buildx 是否可用
if docker buildx version > /dev/null 2>&1; then
    echo "[BUILD] 使用 buildx 构建 amd64 镜像..."
    docker buildx create --name amd64builder --use 2>/dev/null || docker buildx use amd64builder 2>/dev/null || true

    docker buildx build \
        --platform linux/amd64 \
        -t ${FULL_IMAGE} \
        -f Dockerfile \
        --load \
        .
else
    echo "[BUILD] 使用普通 docker build..."
    docker build -t ${FULL_IMAGE} -f Dockerfile .
fi

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "[BUILD] ✅ 构建成功！"
    echo "=========================================="
    echo ""
    echo "镜像信息:"
    docker images | grep ${IMAGE_NAME} | head -3
    echo ""
    echo "=========================================="
    echo "推送到 Docker Hub:"
    echo "=========================================="
    echo ""
    echo "  docker login"
    echo "  docker push ${FULL_IMAGE}"
    echo ""
    echo "=========================================="
    echo "在 NAS 上使用:"
    echo "=========================================="
    echo ""
    echo "  docker pull ${FULL_IMAGE}"
    echo "  docker-compose up -d"
    echo ""
else
    echo ""
    echo "[BUILD] ❌ 构建失败"
    exit 1
fi
