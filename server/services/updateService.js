/**
 * 系统更新服务
 * 从 GitHub releases 获取最新版本并对比
 */
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { createProxyAgent } = require('./proxyService');
const { getDB } = require('../models/db');
const { HttpsProxyAgent } = require('https-proxy-agent');

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
 * 获取最适合拉取更新的代理 Agent
 */
function getUpdateProxyAgent() {
  // 1. 优先使用系统环境变量配置的 HTTP(S) 代理
  const envProxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy;
  if (envProxy) {
    try {
      return new HttpsProxyAgent(envProxy);
    } catch (e) {
      console.error('[UPDATE] 解析系统环境变量代理失败:', e.message);
    }
  }

  // 2. 其次尝试使用用户在系统中配置的第一个代理 (如果有)
  try {
    const db = getDB();
    if (db && db.data && db.data.proxies && db.data.proxies.length > 0) {
      const firstProxy = db.data.proxies[0];
      const agent = createProxyAgent(firstProxy);
      if (agent) {
        console.log(`[UPDATE] 检测到用户配置的代理 [${firstProxy.name}]，将作为获取 GitHub 更新的备用代理`);
        return agent;
      }
    }
  } catch (_) {}

  return null;
}

/**
 * 通用的带代理和重试的 GET 请求方法，专门用于不稳定的 GitHub 域名
 */
async function fetchWithRetry(url, options = {}) {
  const headers = { 'User-Agent': 'email-notify', ...options.headers };
  const agent = getUpdateProxyAgent();

  // 如果有代理，优先尝试使用代理拉取（在大陆环境能大幅提高成功率）
  if (agent) {
    try {
      console.log(`[UPDATE] 正在使用代理拉取数据: ${url}`);
      const res = await axios.get(url, {
        timeout: 8000,
        headers,
        httpAgent: agent,
        httpsAgent: agent,
      });
      return res.data;
    } catch (err) {
      console.warn(`[UPDATE] 代理拉取失败，尝试直连拉取: ${err.message}`);
    }
  }

  // 直连拉取
  const res = await axios.get(url, {
    timeout: 10000,
    headers,
  });
  return res.data;
}

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
    const release = await fetchWithRetry(GITHUB_RELEASES_API, { headers });
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
    const tags = await fetchWithRetry(GITHUB_TAGS_API, { headers });
    if (tags && tags.length > 0) {
      const latestTag = tags[0].name || '';
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
  const parts1 = (v1 || '').replace(/^v/, '').split('.').map(p => parseInt(p, 10) || 0);
  const parts2 = (v2 || '').replace(/^v/, '').split('.').map(p => parseInt(p, 10) || 0);

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
    // 1. 检查标准 /.dockerenv 或 run/.containerenv
    if (fs.existsSync('/.dockerenv') || fs.existsSync('/run/.containerenv')) {
      return true;
    }
    // 2. 检查 cgroup 中是否包含 docker 或 container 标识
    if (fs.existsSync('/proc/1/cgroup')) {
      const cgroup = fs.readFileSync('/proc/1/cgroup', 'utf8');
      if (cgroup.includes('docker') || cgroup.includes('lxc') || cgroup.includes('containerd')) {
        return true;
      }
    }
  } catch (_) {}
  return false;
}

/**
 * 检查是否有 Docker 访问权限
 */
async function hasDockerAccess() {
  // 1. 尝试直接执行 docker info (适用于安装了 docker CLI 且有访问权限的情况)
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    await execAsync('docker info');
    return true;
  } catch (e) {
    // 2. 降级检查：即使没有安装 docker CLI，如果挂载了可写 docker.sock，也说明拥有 Docker 访问权限
    try {
      if (fs.existsSync('/var/run/docker.sock')) {
        fs.accessSync('/var/run/docker.sock', fs.constants.W_OK);
        return true;
      }
    } catch (_) {}
  }
  return false;
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
    let pulled = false;
    try {
      const { stdout: pullOutput } = await execAsync('docker pull sunqz/email-notify:latest');
      updateLog.push({ time: new Date().toISOString(), message: `镜像拉取完成: ${pullOutput.trim()}` });
      pulled = true;
    } catch (e) {
      // 降级：如果没安装 docker 命令行，但有 docker.sock，使用 curl unix socket API 拉取
      if (fs.existsSync('/var/run/docker.sock')) {
        try {
          updateLog.push({ time: new Date().toISOString(), message: '未检测到 docker 命令行，正在尝试通过 Docker Socket API 拉取镜像...' });
          await execAsync('curl -s --unix-socket /var/run/docker.sock -X POST "http://localhost/images/create?fromImage=sunqz/email-notify&tag=latest"', { timeout: 120000 });
          updateLog.push({ time: new Date().toISOString(), message: '镜像拉取成功（通过 Socket API）' });
          pulled = true;
        } catch (sockErr) {
          console.error('[UPDATE] Socket API 拉取失败:', sockErr.message);
        }
      }
      if (!pulled) {
        throw new Error(`拉取镜像失败: ${e.message}`);
      }
    }

    // 2. 异步重启容器 (延迟 1.5 秒以确保 HTTP 成功响应和拉取日志能完整送达前端)
    updateLog.push({ time: new Date().toISOString(), message: '镜像拉取完成！已发出重启指令，容器将在 1.5 秒后自动重启。' });

    setTimeout(async () => {
      console.log('[UPDATE] 正在执行延迟重启以应用新版本...');
      try {
        await execAsync('docker compose up -d', { timeout: 60000 });
      } catch (e) {
        // 优先尝试通过 Unix Socket 重启自身
        let restarted = false;
        if (fs.existsSync('/var/run/docker.sock')) {
          try {
            const { stdout: containerId } = await execAsync('hostname');
            const containerName = containerId.trim();
            await execAsync(`curl -s --unix-socket /var/run/docker.sock -X POST "http://localhost/containers/${containerName}/restart"`, { timeout: 60000 });
            restarted = true;
          } catch (sockErr) {
            console.error('[UPDATE] 异步 Socket API 重启失败:', sockErr.message);
          }
        }
        if (!restarted) {
          try {
            const { stdout: containerId } = await execAsync('hostname');
            const containerName = containerId.trim();
            await execAsync(`docker restart ${containerName}`, { timeout: 60000 });
          } catch (cliErr) {
            console.error('[UPDATE] 异步 CLI 重启失败:', cliErr.message);
          }
        }
      }
    }, 1500);

    updateLog.push({ time: new Date().toISOString(), message: '更新任务就绪，正在安全传输升级包日志并通知前端...' });

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
