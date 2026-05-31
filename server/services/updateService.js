/**
 * 系统更新服务
 * 检查 GitHub 仓库是否有新版本，支持自动更新
 */
const axios = require('axios');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

// GitHub 仓库信息
const GITHUB_OWNER = 'sunqiangzhong';
const GITHUB_REPO = 'email-notify';
const GITHUB_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}`;

// 当前版本（从 package.json 读取）
let currentVersion = '1.0.0';
try {
  const pkg = require('../package.json');
  currentVersion = pkg.version || '1.0.0';
} catch (e) {
  // 忽略错误，使用默认版本
}

// 缓存最新版本信息
let latestVersionCache = null;
let lastCheckTime = null;
const CACHE_DURATION = 5 * 60 * 1000; // 5 分钟缓存

/**
 * 获取当前版本
 */
function getCurrentVersion() {
  return currentVersion;
}

/**
 * 检查 GitHub 是否有新版本
 */
async function checkForUpdates(force = false) {
  // 检查缓存
  if (!force && latestVersionCache && lastCheckTime) {
    const now = Date.now();
    if (now - lastCheckTime < CACHE_DURATION) {
      return {
        currentVersion,
        latestVersion: latestVersionCache.tag_name,
        hasUpdate: compareVersions(latestVersionCache.tag_name, currentVersion) > 0,
        releaseUrl: latestVersionCache.html_url,
        releaseNotes: latestVersionCache.body,
        publishedAt: latestVersionCache.published_at,
        cached: true,
      };
    }
  }

  try {
    // 获取最新的 release
    const response = await axios.get(`${GITHUB_API}/releases/latest`, {
      timeout: 10000,
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Mul-Email-Update-Checker',
      },
    });

    const release = response.data;
    latestVersionCache = release;
    lastCheckTime = Date.now();

    const latestVersion = release.tag_name;
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

    return {
      currentVersion,
      latestVersion,
      hasUpdate,
      releaseUrl: release.html_url,
      releaseNotes: release.body,
      publishedAt: release.published_at,
      cached: false,
    };
  } catch (error) {
    console.error('[UPDATE] 检查更新失败:', error.message);
    throw new Error(`检查更新失败: ${error.message}`);
  }
}

/**
 * 比较版本号
 * @returns {number} 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
function compareVersions(v1, v2) {
  const parts1 = v1.replace(/^v/, '').split('.').map(Number);
  const parts2 = v2.replace(/^v/, '').split('.').map(Number);

  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;

    if (p1 > p2) return 1;
    if (p1 < p2) return -1;
  }

  return 0;
}

/**
 * 执行自动更新
 * 注意：这需要 Docker 环境，并且容器需要有访问 Docker socket 的权限
 */
async function performUpdate() {
  const updateLog = [];

  try {
    updateLog.push({ time: new Date().toISOString(), message: '开始更新...' });

    // 1. 拉取最新镜像
    updateLog.push({ time: new Date().toISOString(), message: '正在拉取最新镜像...' });
    try {
      const { stdout: pullOutput } = await execAsync('docker pull sunqz/email-notify:latest');
      updateLog.push({ time: new Date().toISOString(), message: `镜像拉取完成: ${pullOutput.trim()}` });
    } catch (e) {
      throw new Error(`拉取镜像失败: ${e.message}`);
    }

    // 2. 重启容器
    updateLog.push({ time: new Date().toISOString(), message: '正在重启容器...' });
    try {
      // 获取当前容器名
      const { stdout: containerId } = await execAsync('hostname');
      const containerName = containerId.trim();

      // 使用 docker-compose 重启（如果存在 docker-compose.yml）
      try {
        await execAsync('docker compose up -d', { timeout: 60000 });
        updateLog.push({ time: new Date().toISOString(), message: '容器重启完成' });
      } catch (e) {
        // 如果 docker-compose 失败，尝试直接重启容器
        updateLog.push({ time: new Date().toISOString(), message: '尝试直接重启容器...' });
        await execAsync(`docker restart ${containerName}`, { timeout: 60000 });
        updateLog.push({ time: new Date().toISOString(), message: '容器重启完成' });
      }
    } catch (e) {
      throw new Error(`重启容器失败: ${e.message}`);
    }

    updateLog.push({ time: new Date().toISOString(), message: '更新完成！新版本将在重启后生效。' });

    return {
      success: true,
      message: '更新已执行，容器正在重启...',
      log: updateLog,
    };
  } catch (error) {
    updateLog.push({ time: new Date().toISOString(), message: `更新失败: ${error.message}` });
    console.error('[UPDATE] 更新失败:', error.message);

    return {
      success: false,
      message: error.message,
      log: updateLog,
    };
  }
}

/**
 * 检查是否在 Docker 环境中
 */
async function isDockerEnvironment() {
  try {
    await execAsync('test -f /.dockerenv');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 检查是否有 Docker 访问权限
 */
async function hasDockerAccess() {
  try {
    await execAsync('docker info');
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = {
  getCurrentVersion,
  checkForUpdates,
  performUpdate,
  isDockerEnvironment,
  hasDockerAccess,
  compareVersions,
};
