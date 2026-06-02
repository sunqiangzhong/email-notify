/**
 * API 令牌路由
 * 完全对齐 MoviePilot message.py 实现
 * 参考: https://github.com/jxxghp/MoviePilot/blob/v1/app/api/endpoints/message.py
 */
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { getConfiguredApiToken } = require('../middlewares/apiToken');
const { getDB } = require('../models/db');
const { processNotification } = require('../services/notificationService');
const wechatCmd = require('../services/wechatCommandService');

/**
 * 企业微信加解密类（对齐 MoviePilot WXBizMsgCrypt3）
 * 参考: https://github.com/jxxghp/MoviePilot/blob/v1/app/modules/wechat/WXBizMsgCrypt3.py
 */
class WXBizMsgCrypt {
  constructor(sToken, sEncodingAESKey, sReceiveId) {
    this.m_sToken = sToken;
    this.m_sReceiveId = sReceiveId;
    this.key = Buffer.from(sEncodingAESKey + '=', 'base64');
    if (this.key.length !== 32) {
      throw new Error(`EncodingAESKey unvalid ! (length=${this.key.length})`);
    }
  }

  /**
   * 验证 URL —— 对齐 MoviePilot WXBizMsgCrypt.VerifyURL
   * @returns {[number, string|null]} [ret, sReplyEchoStr]
   */
  VerifyURL(sMsgSignature, sTimeStamp, sNonce, sEchoStr) {
    // SHA1.getSHA1
    const signature = this._getSHA1(this.m_sToken, sTimeStamp, sNonce, sEchoStr);
    if (signature !== sMsgSignature) {
      return [-40001, null]; // ValidateSignature_Error
    }
    // Prpcrypt.decrypt
    try {
      const sReplyEchoStr = this._decrypt(sEchoStr, this.m_sReceiveId);
      return [0, sReplyEchoStr];
    } catch (err) {
      return [err.code || -40007, null]; // DecryptAES_Error
    }
  }

  /**
   * 解密消息 —— 对齐 MoviePilot WXBizMsgCrypt.DecryptMsg
   * @returns {[number, string|null]} [ret, xml_content]
   */
  DecryptMsg(sPostData, sMsgSignature, sTimeStamp, sNonce) {
    // XMLParse.extract
    const encrypt = this._extractEncrypt(sPostData);
    if (!encrypt) {
      console.error('[WECHAT] _extractEncrypt 无法在 XML 中找到 Encrypt 字段');
      return [-40002, null]; // ParseXml_Error
    }
    // SHA1.getSHA1
    const signature = this._getSHA1(this.m_sToken, sTimeStamp, sNonce, encrypt);
    if (signature !== sMsgSignature) {
      console.error(`[WECHAT] 签名不匹配! 期望签名: "${signature}", 收到签名: "${sMsgSignature}"`);
      return [-40001, null]; // ValidateSignature_Error
    }
    // Prpcrypt.decrypt
    try {
      const xml_content = this._decrypt(encrypt, this.m_sReceiveId);
      return [0, xml_content];
    } catch (err) {
      console.error(`[WECHAT] 加密信息解密失败: ${err.message}`, err);
      return [err.code || -40007, null]; // DecryptAES_Error
    }
  }

  /**
   * 从 XML 提取 Encrypt 字段 —— 对齐 MoviePilot XMLParse.extract
   */
  _extractEncrypt(xmltext) {
    let match = xmltext.match(/<Encrypt><!\[CDATA\[([\s\S]*?)\]\]><\/Encrypt>/);
    if (match) return match[1].trim();
    match = xmltext.match(/<Encrypt>([\s\S]*?)<\/Encrypt>/);
    if (match) return match[1].trim();
    return null;
  }

  /**
   * SHA1 签名 —— 对齐 MoviePilot SHA1.getSHA1
   */
  _getSHA1(token, timestamp, nonce, encrypt) {
    const arr = [token, timestamp, nonce, encrypt];
    arr.sort();
    return crypto.createHash('sha1').update(arr.join('')).digest('hex');
  }

  /**
   * AES 解密 —— 对齐 MoviePilot Prpcrypt.decrypt
   */
  _decrypt(ciphertext, receiveId) {
    const encrypted = Buffer.from(ciphertext, 'base64');
    const iv = this.key.slice(0, 16);
    const decipher = crypto.createDecipheriv('aes-256-cbc', this.key, iv);
    decipher.setAutoPadding(false);

    let plain_text;
    try {
      plain_text = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    } catch (e) {
      const err = new Error('AES decrypt error');
      err.code = -40007;
      throw err;
    }

    // 去除 PKCS7 填充 (对齐 MoviePilot: pad = plain_text[-1])
    const pad = plain_text[plain_text.length - 1];
    if (pad < 1 || pad > 32) {
      plain_text = plain_text.slice(0, plain_text.length);
    } else {
      plain_text = plain_text.slice(0, plain_text.length - pad);
    }

    // 提取内容 (对齐 MoviePilot Prpcrypt.decrypt)
    const content = plain_text.slice(16); // 去除16字节随机字符串
    const xml_len = content.readUInt32BE(0); // socket.ntohl (网络字节序=大端序)
    const xml_content = content.slice(4, 4 + xml_len).toString('utf8');
    const from_receiveid = content.slice(4 + xml_len).toString('utf8');

    // 校验 corpId (健壮地移除尾部的 \0 填充及空格)
    const clean_from_receiveid = from_receiveid.replace(/\0+$/, '').trim();
    const clean_receiveId = receiveId.replace(/\0+$/, '').trim();
    if (clean_from_receiveid !== clean_receiveId) {
      const err = new Error(`CorpId 不匹配: 期望 "${clean_receiveId}", 实际收到 "${clean_from_receiveid}"`);
      err.code = -40005; // ValidateCorpid_Error
      throw err;
    }

    return xml_content;
  }
}

/**
 * 从数据库获取企业微信配置
 * 对齐 MoviePilot wechat_verify 中获取 client_config 的逻辑
 */
function getWechatConfig() {
  const db = getDB();
  const config = db.data.notifications.find(
    n => n.type === 'wecom_app' && n.active
  );
  return config || null;
}

/**
 * 微信验证响应 —— 对齐 MoviePilot wechat_verify()
 *
 * MoviePilot 源码 (message.py):
 *   wxcpt = WXBizMsgCrypt(sToken=..., sEncodingAESKey=..., sReceiveId=...)
 *   ret, sEchoStr = wxcpt.VerifyURL(sMsgSignature=..., sTimeStamp=..., sNonce=..., sEchoStr=...)
 *   if ret == 0:
 *       return PlainTextResponse(sEchoStr)
 *   return "微信验证失败"
 */
function wechat_verify(echostr, msg_signature, timestamp, nonce) {
  // 获取服务配置 (对齐 MoviePilot ServiceConfigHelper.get_notification_configs)
  const client_config = getWechatConfig();
  if (!client_config) {
    return { success: false, message: '未找到对应的消息配置' };
  }

  const sToken = client_config.config.token;
  const sEncodingAESKey = client_config.config.encodingAesKey;
  const sReceiveId = client_config.config.corpId;

  if (!sToken || !sEncodingAESKey || !sReceiveId) {
    return { success: false, message: '企业微信配置不完整' };
  }

  try {
    const wxcpt = new WXBizMsgCrypt(sToken, sEncodingAESKey, sReceiveId);
    const [ret, sEchoStr] = wxcpt.VerifyURL(msg_signature, timestamp, nonce, echostr);
    if (ret === 0) {
      return { success: true, message: sEchoStr };
    }
    console.error(`[WECHAT] 验证URL失败: ret=${ret}`);
    return { success: false, message: '微信验证失败' };
  } catch (err) {
    console.error(`[WECHAT] 验证异常: ${err.message}`);
    return { success: false, message: String(err) };
  }
}

/**
 * API Token 验证 —— 对齐 MoviePilot verify_apitoken
 *
 * MoviePilot 源码 (security.py):
 *   if settings.API_TOKEN:
 *       token = request.query_params.get("token") or auth ...
 *       if not token: raise credentials_exception
 *       if token != settings.API_TOKEN: raise credentials_exception
 */
function verifyApiToken(req) {
  const apiToken = getConfiguredApiToken();
  if (!apiToken) return true; // 未配置则不校验

  const token = req.query.token || req.headers['x-api-token'] || '';
  return token === apiToken;
}

/**
 * GET /
 * 回调请求验证 —— 对齐 MoviePilot incoming_verify
 *
 * MoviePilot 源码 (message.py):
 *   @router.get("/", summary="回调请求验证")
 *   def incoming_verify(
 *       token, echostr, msg_signature, timestamp, nonce, source,
 *       _: TokenPayload = Depends(verify_apitoken),
 *   ) -> Any:
 *       if echostr and msg_signature and timestamp and nonce:
 *           return wechat_verify(echostr, msg_signature, timestamp, nonce, source)
 *       return vocechat_verify()
 */
router.get('/', (req, res) => {
  const { token, echostr, msg_signature, timestamp, nonce } = req.query;

  // 1. API Token 验证 (对齐 MoviePilot Depends(verify_apitoken))
  if (!verifyApiToken(req)) {
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(401).send('Token 无效');
  }

  // 2. 企业微信回调验证 (对齐 MoviePilot if echostr and msg_signature and timestamp and nonce)
  if (echostr && msg_signature && timestamp && nonce) {
    console.log(`[WECHAT] 收到回调验证: msg_signature=${msg_signature}, timestamp=${timestamp}, nonce=${nonce}`);
    const result = wechat_verify(echostr, msg_signature, timestamp, nonce);
    // 对齐 MoviePilot: return PlainTextResponse(sEchoStr) 或 return "微信验证失败"
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.send(result.message);
  }

  // 3. 普通验证 (对齐 MoviePilot return vocechat_verify() -> {"status": "OK"})
  return res.json({ status: 'OK' });
});

/**
 * POST /
 * 接收消息 —— 对齐 MoviePilot user_message + message_parser
 *
 * MoviePilot 源码 (message.py + wechat/__init__.py):
 *   body = await request.body()  # 原始 bytes
 *   ret, sMsg = wxcpt.DecryptMsg(sPostData=body, sMsgSignature=..., sTimeStamp=..., sNonce=...)
 */
router.post('/', express.text({ type: '*/*' }), async (req, res, next) => {
  try {
    const { msg_signature, timestamp, nonce } = req.query;
    const { token } = req.query;

    // API Token 验证
    if (!verifyApiToken(req)) {
      return res.status(401).json({ status: 'ERROR', message: 'Token 无效' });
    }

    // 企业微信消息 (对齐 MoviePilot: msg_signature and timestamp and nonce)
    if (msg_signature && timestamp && nonce) {
      console.log('[WECHAT] 收到消息推送');

      // 获取原始请求体 (对齐 MoviePilot: body = await request.body())
      let rawBody = req.body;
      if (Buffer.isBuffer(rawBody)) {
        rawBody = rawBody.toString('utf-8');
      }
      if (typeof rawBody !== 'string' || !rawBody) {
        console.error('[WECHAT] 请求体为空或格式错误');
        return res.status(200).json({ status: 'OK' });
      }

      // 获取配置
      const client_config = getWechatConfig();
      if (!client_config) {
        console.error('[WECHAT] 未找到企业微信配置');
        return res.status(200).json({ status: 'OK' });
      }

      const sToken = client_config.config.token;
      const sEncodingAESKey = client_config.config.encodingAesKey;
      const sReceiveId = client_config.config.corpId;

      // 解密消息 (对齐 MoviePilot: wxcpt.DecryptMsg)
      const wxcpt = new WXBizMsgCrypt(sToken, sEncodingAESKey, sReceiveId);
      const [ret, sMsg] = wxcpt.DecryptMsg(rawBody, msg_signature, timestamp, nonce);

      if (ret !== 0) {
        console.error(`[WECHAT] 解密失败: ret=${ret}`);
        return res.status(200).json({ status: 'OK' });
      }

      // 解析 XML (对齐 MoviePilot DomUtils.tag_value, 健壮支持跨行与可选的 CDATA 包裹)
      const sMsgStr = Buffer.isBuffer(sMsg) ? sMsg.toString('utf-8') : sMsg;
      const msgType = ((sMsgStr.match(/<MsgType>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/MsgType>/) || [])[1] || '').trim();
      const content = ((sMsgStr.match(/<Content>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/Content>/) || [])[1] || '').trim();
      const fromUser = ((sMsgStr.match(/<FromUserName>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/FromUserName>/) || [])[1] || '').trim();
      const event = ((sMsgStr.match(/<Event>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/Event>/) || [])[1] || '').trim();
      const eventKey = ((sMsgStr.match(/<EventKey>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/EventKey>/) || [])[1] || '').trim();

      console.log(`[WECHAT] 消息: type=${msgType}, event=${event}, from=${fromUser}, content=${content}, eventKey=${eventKey}`);

      // 使用命令服务处理消息（对齐 MoviePilot message_parser）
      const replyContent = await wechatCmd.processMessage(
        msgType,
        event,
        msgType === 'event' ? eventKey : content,
        fromUser,
        client_config
      );

      // 发送回复消息
      if (replyContent) {
        try {
          await wechatCmd.sendTextMessage(client_config.config, replyContent, fromUser);
          console.log(`[WECHAT] 回复已发送给 ${fromUser}`);
        } catch (err) {
          console.error(`[WECHAT] 发送回复失败: ${err.message}`);
        }
      }

      // 对齐 MoviePilot: return schemas.Response(success=True)
      return res.status(200).json({ status: 'OK' });
    }

    // 普通 API 消息
    const db = getDB();
    const { title, text, image, userid, link } = req.body;

    if (!title && !text) {
      return res.status(400).json({ status: 'ERROR', message: '缺少必要字段' });
    }

    const user = db.data.users[0];
    if (!user) {
      return res.status(500).json({ status: 'ERROR', message: '系统中没有用户' });
    }

    const emailData = {
      subject: title || text || '(无主题)',
      senderName: 'API 通知',
      senderEmail: 'api@local',
      toEmail: '',
      snippet: text || title || '',
      receivedAt: new Date().toISOString(),
    };

    const { v4: uuidv4 } = require('uuid');
    const logId = uuidv4();
    db.data.emailLogs.push({
      id: logId,
      userId: user.id,
      accountId: 'external',
      subject: emailData.subject,
      senderName: emailData.senderName,
      senderEmail: emailData.senderEmail,
      toEmail: emailData.toEmail,
      receivedAt: emailData.receivedAt,
      forwardStatus: 'sending',
      snippet: emailData.snippet,
    });
    await db.write('emailLogs');
    await processNotification(user.id, emailData, logId);

    res.json({ status: 'OK' });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/token/status
 */
router.get('/status', async (req, res, next) => {
  try {
    if (!verifyApiToken(req)) {
      return res.status(401).json({ status: 'ERROR', message: 'Token 无效' });
    }
    const db = getDB();
    const accounts = db.data.accounts.filter(a => a.active !== false);
    res.json({
      status: 'OK',
      data: {
        accounts: accounts.map(a => ({
          email: a.email,
          status: a.status,
          lastSync: a.lastSync,
        })),
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/token/emails
 */
router.get('/emails', async (req, res, next) => {
  try {
    if (!verifyApiToken(req)) {
      return res.status(401).json({ status: 'ERROR', message: 'Token 无效' });
    }
    const db = getDB();
    const page = parseInt(req.query.page) || 1;
    const pageSize = parseInt(req.query.pageSize) || 10;

    const accounts = db.data.accounts.filter(a => a.active !== false);
    const allEmails = [];
    for (const account of accounts) {
      const emails = db.data.accountEmails
        .filter(e => e.accountId === account.id)
        .map(e => ({ ...e, accountEmail: account.email }));
      allEmails.push(...emails);
    }

    allEmails.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const total = allEmails.length;
    const totalPages = Math.ceil(total / pageSize);
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, total);
    const pageEmails = allEmails.slice(startIndex, endIndex);

    res.json({
      status: 'OK',
      data: pageEmails,
      pagination: { page, pageSize, total, totalPages }
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
