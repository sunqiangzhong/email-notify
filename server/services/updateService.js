/**
 * 系统更新服务
 * 构建时注入版本信息，运行时直接读取
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 版本信息文件路径（构建时生成）
const VERSION_FILE = path.join(__dirname, '..', 'version.json');

// 读取版本信息
let versionInfo = {
  currentVersion: '1.0.0',
  latestVersion: '1.0.0',
  hasUpdate: false,
  releaseUrl: '',
  releaseNotes: '',
  publishedAt: null,
};

try {
  if (fs.existsSync(VERSION_FILE)) {
    const data = JSON.parse(fs.readFileSync(VERSION_FILE, 'utf-8'));
    versionInfo = { ...versionInfo, ...data };
    // 计算是否有更新
    versionInfo.hasUpdate = compareVersions(versionInfo.latestVersion, versionInfo.currentVersion) > 0;
  }
} catch (e) {
  console.log('[UPDATE] 未找到版本信息文件，使用默认版本');
}

/**
 * 获取当前版本
 */
function getCurrentVersion() {
  return versionInfo.currentVersion;
}

/**
 * 检查是否有新版本（直接读取构建时注入的信息）
 */
async function checkForUpdates(force = false) {
  return {
    currentVersion: versionInfo.currentVersion,
    latestVersion: versionInfo.latestVersion,
    hasUpdate: versionInfo.hasUpdate,
    releaseUrl: versionInfo.releaseUrl,
    releaseNotes: versionInfo.releaseNotes,
    publishedAt: versionInfo.publishedAt,
    cached: true,
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
