#!/bin/bash
# ============================================
# 构建并推送 Docker 镜像到 Docker Hub
# ============================================
# 使用方式: ./build-and-push.sh [用户名] [版本]
# 例如: ./build-and-push.sh myusername v1.0.0
# ============================================

set -e

# 配置
DOCKER_USERNAME=${1:-"your-dockerhub-username"}
VERSION=${2:-"latest"}
IMAGE_NAME="${DOCKER_USERNAME}/mul-email"

echo "=========================================="
echo "构建 Docker 镜像"
echo "=========================================="
echo "镜像名称: ${IMAGE_NAME}:${VERSION}"
echo ""

# 构建镜像
docker build -t ${IMAGE_NAME}:${VERSION} .
docker tag ${IMAGE_NAME}:${VERSION} ${IMAGE_NAME}:latest

echo ""
echo "=========================================="
echo "推送到 Docker Hub"
echo "=========================================="

# 登录 Docker Hub
docker login

# 推送镜像
docker push ${IMAGE_NAME}:${VERSION}
docker push ${IMAGE_NAME}:latest

echo ""
echo "=========================================="
echo "完成！"
echo "=========================================="
echo ""
echo "其他人可以使用以下命令运行:"
echo ""
echo "docker run -d \\"
echo "  --name mul-email \\"
echo "  -p 6000:80 \\"
echo "  -v mul-email-data:/app/server/data \\"
echo "  ${IMAGE_NAME}:${VERSION}"
echo ""
echo "或者使用 docker-compose.yml"
echo "=========================================="
