/**
 * 连通性测试控制器
 *
 * 独立于代理和邮箱，提供通用站点连通性测试接口
 * 参照 MoviePilot 的站点检测设计
 */
const {
  testSingleTarget,
  testMultipleTargets,
  testProxyReachability,
  fullConnectivityTest,
  PRESET_TARGETS,
} = require('../services/connectivityService');

/**
 * GET /api/system/connectivity/presets
 * 获取所有预定义测试目标
 */
function getPresets(req, res, next) {
  try {
    res.json({
      success: true,
      data: PRESET_TARGETS,
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/system/connectivity/test
 * 测试单个或多个站点连通性
 *
 * Body:
 *   单个测试: { host, port, name?, category?, mode?, timeout? }
 *   批量测试: { targets: [{name, host, port, category?}, ...], mode?, timeout?, proxyConfig? }
 */
async function testConnectivity(req, res, next) {
  try {
    const { host, port, name, category, mode, timeout, targets, proxyConfig } = req.body;

    // 批量测试模式
    if (Array.isArray(targets) && targets.length > 0) {
      const results = await testMultipleTargets(targets, { proxyConfig, timeout, mode });
      return res.json({
        success: true,
        data: results,
      });
    }

    // 单个测试模式
    if (host && port) {
      const result = await testSingleTarget(
        { name: name || host, host, port: parseInt(port), category: category || 'custom' },
        { proxyConfig, timeout, mode }
      );
      return res.json({
        success: true,
        data: result,
      });
    }

    return res.status(400).json({
      success: false,
      code: 'MISSING_FIELDS',
      message: '请提供 host/port 或 targets 数组',
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/system/connectivity/test-all
 * 测试全部预设目标（可选代理）
 *
 * Body: { categories?, proxyConfig?, timeout?, mode? }
 *   categories: ['email', 'notification', 'network'] - 要测试的分类，默认全部
 */
async function testAll(req, res, next) {
  try {
    const { categories, proxyConfig, timeout, mode } = req.body;

    // 汇总要测试的目标
    const cats = categories || Object.keys(PRESET_TARGETS);
    let targets = [];
    for (const cat of cats) {
      if (PRESET_TARGETS[cat]) {
        targets = targets.concat(PRESET_TARGETS[cat]);
      }
    }

    if (targets.length === 0) {
      return res.status(400).json({
        success: false,
        code: 'NO_TARGETS',
        message: '无有效测试目标',
      });
    }

    // 如果有代理配置，做完整测试（代理 + 目标）
    if (proxyConfig && proxyConfig.host && proxyConfig.port) {
      const result = await fullConnectivityTest(proxyConfig, targets, { timeout, mode });
      return res.json({
        success: true,
        data: result,
      });
    }

    // 无代理，直接测试目标
    const results = await testMultipleTargets(targets, { timeout, mode });
    const successCount = results.filter(r => r.success).length;

    res.json({
      success: true,
      data: {
        proxy: null,
        targets: results,
        summary: {
          total: results.length,
          success: successCount,
          failed: results.length - successCount,
          proxyUsed: false,
        },
      },
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/system/connectivity/test-proxy
 * 仅测试代理服务器可达性
 *
 * Body: { host, port, type?, timeout? }
 */
async function testProxy(req, res, next) {
  try {
    const { host, port, type, timeout } = req.body;

    if (!host || !port) {
      return res.status(400).json({
        success: false,
        code: 'MISSING_FIELDS',
        message: '代理主机和端口不能为空',
      });
    }

    const result = await testProxyReachability(
      { host, port: parseInt(port), type: type || 'socks5' },
      timeout
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getPresets,
  testConnectivity,
  testAll,
  testProxy,
};
