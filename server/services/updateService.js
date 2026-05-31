/**
 * 系统更新服务
 * 从 GitHub releases 获取最新版本并对比
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// GitHub 仓库信息
const GITHUB_OWNER = 'sunqiangzhong';
const GITHUB_REPO = 'email-notify';
const GITHUB_RELEASES_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`;
const GITHUB_TAGS_API = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/tags`;
const GITHUB_RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases`;

// 版本信息文件路径（构建时生成）
const VERSION_FILE = path.join(__dirname, '..', 'version.json');

// 读取当前版本
let currentVersion = '1.0.0';
try {
  if (fs.existsSync(VERSION_FILE)) {
    const data = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf-8'));
    currentVersion = data.currentVersion || '1.0.0';
  }
} catch (e) {
  console.log('[UPDATE] 未找到版本信息文件，使用默认版本');
}

// 缓存最新版本信息
let cachedLatest = null;
let cacheExpiresAt = 0;

/**
 * 获取当前版本
 */
function getCurrentVersion() {
  return currentVersion;
}

/**
 * 从 GitHub 获取最新版本
 * 优先读 Release，没有则读最新 Tag
 */
async function fetchLatestFromGithub() {
  const headers = { 'User-Agent': 'email-notify' };

  // 方式一：尝试 GitHub Releases
  try {
    const res = await axios.get(GITHUB_RELEASES_API, { timeout: 10000, headers });
    const release = res.data;
    const tag = release.tag_name || '';
    return {
      latestVersion: tag.replace(/^v/, ''),
      releaseUrl: release.html_url || GITHUB_RELEASES_URL,
      releaseNotes: release.body || '',
      publishedAt: release.published_at || null,
    };
  } catch (err) {
    // 404 说明没有 Release，尝试 tags
    if (err.response?.status !== 404) {
      console.error('[UPDATE] 获取 GitHub Release 失败:', err.message);
    }
  }

  // 方式二：尝试 GitHub Tags
  try {
    const res = await axios.get(GITHUB_TAGS_API, { timeout: 10000, headers });
    if (res.data && res.data.length > 0) {
      const latestTag = res.data[0].name || '';
      return {
        latestVersion: latestTag.replace(/^v/, ''),
        releaseUrl: `${GITHUB_RELEASES_URL}/tag/${latestTag}`,
        releaseNotes: '',
        publishedAt: null,
      };
    }
  } catch (err) {
    console.error('[UPDATE] 获取 GitHub Tags 失败:', err.message);
  }

  return null;
}

/**
 * 检查是否有新版本
 */
async function checkForUpdates(force = false) {
  // 缓存 30 分钟
  if (!force && cachedLatest && Date.now() < cacheExpiresAt) {
    return {
      currentVersion,
      ...cachedLatest,
      hasUpdate: compareVersions(cachedLatest.latestVersion, currentVersion) > 0,
      cached: true,
    };
  }

  const latest = await fetchLatestFromGithub();

  if (latest) {
    cachedLatest = latest;
    cacheExpiresAt = Date.now() + 30 * 60 * 1000; // 30 分钟缓存

    return {
      currentVersion,
      ...latest,
      hasUpdate: compareVersions(latest.latestVersion, currentVersion) > 0,
      cached: false,
    };
  }

  // GitHub 请求失败，返回缓存或默认值
  if (cachedLatest) {
    return {
      currentVersion,
      ...cachedLatest,
      hasUpdate: compareVersions(cachedLatest.latestVersion, currentVersion) > 0,
      cached: true,
    };
  }

  return {
    currentVersion,
    latestVersion: currentVersion,
    hasUpdate: false,
    releaseUrl: '',
    releaseNotes: '',
    publishedAt: null,
    cached: false,
  };
}

/**
 * 比较版本号
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
 * 检查是否在 Docker 环境中
 */
async function isDockerEnvironment() {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
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
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    await execAsync('docker info');
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * 执行自动更新
 */
async function performUpdate() {
  const updateLog = [];

  try {
    updateLog.push({ time: new Date().toISOString(), message: '开始更新...' });

    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

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
      await execAsync('docker compose up -d', { timeout: 60000 });
      updateLog.push({ time: new Date().toISOString(), message: '容器重启完成' });
    } catch (e) {
      const { stdout: containerId } = await execAsync('hostname');
      const containerName = containerId.trim();
      await execAsync(`docker restart ${containerName}`, { timeout: 60000 });
      updateLog.push({ time: new Date().toISOString(), message: '容器重启完成' });
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

module.exports = {
  getCurrentVersion,
  checkForUpdates,
  performUpdate,
  isDockerEnvironment,
  hasDockerAccess,
  compareVersions,
};
