const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const dotenv = require('dotenv');
const { authMiddleware } = require('../middlewares/auth');
const config = require('../config');
const {
  getStatus,
  pingDiagnostics,
  streamLogs,
  getLogFilterConfig,
  updateLogFilterConfig,
} = require('../controllers/systemController');

// .env 文件路径
const ENV_PATH = path.resolve(__dirname, '..', '.env');

router.use(authMiddleware);

// ============ 系统状态 ============
router.get('/status', getStatus);
router.get('/ping', pingDiagnostics);
router.get('/logs', streamLogs);
router.get('/logs/filter', getLogFilterConfig);
router.put('/logs/filter', updateLogFilterConfig);

// ============ 环境变量管理（参考 MoviePilot）============

/**
 * GET /api/system/env
 * 获取系统环境变量配置
 */
router.get('/env', (req, res, next) => {
  try {
    // 读取 .env 文件
    let envConfig = {};
    if (fs.existsSync(ENV_PATH)) {
      envConfig = dotenv.parse(fs.readFileSync(ENV_PATH));
    }

    // 返回配置（隐藏敏感信息）
    const safeConfig = { ...envConfig };
    // 不返回完整的 JWT_SECRET
    if (safeConfig.JWT_SECRET) {
      safeConfig.JWT_SECRET = '***已配置***';
    }
    // 不返回完整的密码
    if (safeConfig.ADMIN_PASSWORD) {
      safeConfig.ADMIN_PASSWORD = '***已配置***';
    }
    if (safeConfig.MYSQL_PASSWORD) {
      safeConfig.MYSQL_PASSWORD = '***已配置***';
    }
    if (safeConfig.MYSQL_ROOT_PASSWORD) {
      safeConfig.MYSQL_ROOT_PASSWORD = '***已配置***';
    }

    res.json({
      success: true,
      data: safeConfig,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/system/env
 * 更新系统环境变量配置
 * Body: { KEY1: value1, KEY2: value2, ... }
 */
router.post('/env', (req, res, next) => {
  try {
    const envUpdates = req.body;

    if (!envUpdates || typeof envUpdates !== 'object') {
      return res.status(400).json({
        success: false,
        message: '请求体必须是对象',
      });
    }

    // 确保 .env 文件存在
    if (!fs.existsSync(ENV_PATH)) {
      fs.writeFileSync(ENV_PATH, '# Email Notify Configuration\n');
    }

    // 更新每个配置项
    for (const [key, value] of Object.entries(envUpdates)) {
      if (key === 'undefined' || key === 'JWT_SECRET' || key === 'ADMIN_PASSWORD') {
        // 跳过不允许修改的配置
        continue;
      }

      const stringValue = value === null || value === undefined ? '' : String(value);

      // 使用 dotenv 更新 .env 文件
      dotenv.config({ path: ENV_PATH });
      const envConfig = fs.readFileSync(ENV_PATH, 'utf-8');

      // 检查 key 是否已存在
      const keyRegex = new RegExp(`^${key}=.*$`, 'm');
      if (keyRegex.test(envConfig)) {
        // 更新已存在的 key
        const updatedConfig = envConfig.replace(keyRegex, `${key}=${stringValue}`);
        fs.writeFileSync(ENV_PATH, updatedConfig);
      } else {
        // 追加新的 key
        fs.appendFileSync(ENV_PATH, `\n${key}=${stringValue}`);
      }

      // 同步更新到 process.env
      process.env[key] = stringValue;

      // 更新 config 对象（如果是 API_TOKEN）
      if (key === 'API_TOKEN') {
        config.apiToken = stringValue;
      }
    }

    res.json({
      success: true,
      message: '配置已保存，部分配置需要重启服务才能生效',
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/system/setting/:key
 * 获取单个配置项
 */
router.get('/setting/:key', (req, res, next) => {
  try {
    const { key } = req.params;

    // 先从 .env 文件读取
    let value = '';
    if (fs.existsSync(ENV_PATH)) {
      const envConfig = dotenv.parse(fs.readFileSync(ENV_PATH));
      value = envConfig[key] || '';
    }

    // 如果 .env 没有，从 process.env 读取
    if (!value) {
      value = process.env[key] || '';
    }

    res.json({
      success: true,
      data: { key, value },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/system/setting/:key
 * 更新单个配置项
 */
router.post('/setting/:key', (req, res, next) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (!key) {
      return res.status(400).json({
        success: false,
        message: '配置项名称不能为空',
      });
    }

    // 禁止修改的配置
    const protectedKeys = ['JWT_SECRET', 'ADMIN_PASSWORD', 'ADMIN_USERNAME'];
    if (protectedKeys.includes(key)) {
      return res.status(403).json({
        success: false,
        message: `配置项 ${key} 受保护，不允许修改`,
      });
    }

    const stringValue = value === null || value === undefined ? '' : String(value);

    // 确保 .env 文件存在
    if (!fs.existsSync(ENV_PATH)) {
      fs.writeFileSync(ENV_PATH, '# Email Notify Configuration\n');
    }

    // 读取并更新 .env 文件
    const envConfig = fs.readFileSync(ENV_PATH, 'utf-8');
    const keyRegex = new RegExp(`^${key}=.*$`, 'm');

    if (keyRegex.test(envConfig)) {
      const updatedConfig = envConfig.replace(keyRegex, `${key}=${stringValue}`);
      fs.writeFileSync(ENV_PATH, updatedConfig);
    } else {
      fs.appendFileSync(ENV_PATH, `\n${key}=${stringValue}`);
    }

    // 同步更新到 process.env
    process.env[key] = stringValue;

    // 更新 config 对象
    if (key === 'API_TOKEN') {
      config.apiToken = stringValue;
    }

    res.json({
      success: true,
      message: `配置项 ${key} 已保存`,
      data: { key, value: stringValue },
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
