#!/bin/bash
# ============================================
# 构建并推送 Mul-Email All-in-One 镜像
# ============================================

set -e

IMAGE_NAME="sunqz/mul-email"
TAG="allinone-latest"
FULL_IMAGE="${IMAGE_NAME}:${TAG}"

echo "=========================================="
echo "构建 Mul-Email All-in-One 镜像"
echo "=========================================="
echo ""
echo "镜像名称: ${FULL_IMAGE}"
echo ""

# 给脚本加执行权限
chmod +x docker-entrypoint-allinone.sh

# 构建镜像
echo "[BUILD] 开始构建（预计需要 5-10 分钟）..."
echo ""
docker build -t ${FULL_IMAGE} -f Dockerfile.allinone .

if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "[BUILD] ✅ 构建成功！"
    echo "=========================================="
    echo ""
    echo "镜像信息:"
    docker images | grep ${IMAGE_NAME} | head -5
    echo ""
    echo "=========================================="
    echo "下一步操作:"
    echo "=========================================="
    echo ""
    echo "1. 停止旧的双容器版本:"
    echo "   docker-compose down"
    echo ""
    echo "2. 启动新的 All-in-One 版本:"
    echo "   docker-compose -f docker-compose.allinone.yml up -d"
    echo ""
    echo "3. 查看日志（首次启动需要 1-2 分钟初始化 MySQL）:"
    echo "   docker-compose -f docker-compose.allinone.yml logs -f"
    echo ""
    echo "4. 访问系统:"
    echo "   http://your-nas-ip:5111"
    echo ""
    echo "5. 推送到 Docker Hub（可选）:"
    echo "   docker push ${FULL_IMAGE}"
    echo ""
else
    echo ""
    echo "=========================================="
    echo "[BUILD] ❌ 构建失败"
    echo "=========================================="
    echo ""
    echo "请检查错误信息并重试"
    exit 1
fi
