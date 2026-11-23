/* ============================================================
   07-extras.js - Extension layer
   Registers additional settings pages, the Inspector, commands, export
   formats, the model library, lorebook and character cards, tool approval,
   request logs, privacy controls and legacy migration.
   ============================================================ */
(function () {
  'use strict';
  const AI = window.AI,
    U = AI.UI,
    F = U.F;
  const get = p => p.split('.').reduce((o, k) => (o == null ? undefined : o[k]), AI.state);
  const set = (p, v) => U.setBound(p, v);
  const en = () => AI.state.settings.lang === 'en';
  const L = (zh, e) => (en() ? e : zh);

  /* ---------- Shared widgets ---------- */
  function rng(label, path, min, max, step, hint) {
    const v = get(path);
    return `<div class="form-row"><label>${AI.esc(label)}</label>
    <div class="range-row"><input type="range" min="${min}" max="${max}" step="${step}" data-bind="${path}" data-type="float" value="${v == null ? min : v}"><b data-range-val>${v == null ? min : v}</b></div>
    ${hint ? `<span class="hint">${AI.esc(hint)}</span>` : ''}</div>`;
  }
  function sw(label, path, desc) {
    return F.toggle(label, path, desc);
  }
  function sel(label, path, opts) {
    return F.select(label, path, opts);
  }
  function combo(label, path, opts, opt) {
    return U.F.combo(label, path, opts, opt);
  }
  function inp(label, path, opt) {
    return F.input(label, path, opt || {});
  }
  function area(label, path, opt) {
    return F.area(label, path, opt || {});
  }
  function sec(t) {
    return F.section(t);
  }
  function card(title, inner, tag) {
    return `<div class="card"><div class="card-head"><b>${AI.esc(title)}</b><span class="tag">${AI.esc(tag || '')}</span></div>${inner}</div>`;
  }
  function hint(t) {
    return `<div class="card"><span class="hint" style="font-size:.76em;color:var(--dim);line-height:1.7">${t}</span></div>`;
  }
  const num = (v, d) => {
    const n = parseFloat(v);
    return isNaN(n) ? d : n;
  };

  /* ============================================================
   Register extension settings pages
   ============================================================ */
  const EXTRA_TABS = [
    ['modelslib', '模型库'],
    ['context', '上下文'],
    ['lorebook', '世界书'],
    ['tools', '工具与审批'],
    ['layout', '外观布局'],
    ['shortcuts', '快捷键'],
    ['logs', '请求日志'],
    ['privacy', '隐私数据']
  ];
  const existing = new Set(U.TABS.map(x => x[0]));
  EXTRA_TABS.forEach(t => {
    if (!existing.has(t[0])) U.TABS.push(t);
  });
  AI.INSPECTOR_TABS = [
    ['run', '运行'],
    ['system', '系统'],
    ['context', '上下文'],
    ['tools', '工具'],
    ['usage', '用量']
  ];

  /* ============================================================
   Overrides: general, parameters, search, backup and help
   ============================================================ */
  U.tab_general = function () {
    return (
      sec('外观') +
      `<div class="form-actions"><button class="btn primary" data-do="x-open" data-v="layout">打开「外观布局」</button>
     <button class="mini-btn" data-do="x-inspector">${L('显示/隐藏参数面板', 'Toggle inspector')}</button></div>` +
      sel(
        '设计语言',
        'settings.design',
        AI.DESIGNS.map(d => [d[0], d[1]])
      ) +
      `<div class="form-row"><label>${L('点击色卡快速切换', 'Quick switch')}</label><div class="theme-swatches">${[
        ['neon', '#a855f7', 'linear-gradient(100deg,#22d3ee,#a855f7,#f43f5e)'],
        ['ink', '#171717', '#171717'],
        ['prism', '#4285f4', 'linear-gradient(100deg,#4285f4,#9b72cb,#d96570)'],
        ['aurora', '#9aa4ff', 'linear-gradient(120deg,#5e5cff,#d646be,#24c4dc)'],
        ['slate', '#71717a', '#71717a'],
        ['bespoke', AI.state.settings.accent || '#3b5bdb', AI.state.settings.accent || '#3b5bdb']
      ]
        .map(
          ([k, c, fill]) =>
            `<div class="swatch ${AI.normalizeDesign(AI.state.settings.design) === k ? 'sel' : ''}" data-do="theme" data-v="${k}" title="${AI.esc((AI.DESIGNS.find(d => d[0] === k) || [k, k, k])[1])}"><i style="background:${fill}"></i></div>`
        )
        .join('')}</div></div>` +
      `<div class="form-grid">${sel('明暗模式', 'settings.mode', [
        ['light', '浅色'],
        ['dark', '深色'],
        ['auto', '跟随系统']
      ])}${sel('语言', 'settings.lang', [
        ['zh', '简体中文'],
        ['en', 'English']
      ])}</div>` +
      sec('对话') +
      `<div class="form-grid">${sel('发送快捷键', 'settings.sendKey', [
        ['enter', 'Enter 发送 / Shift+Enter 换行'],
        ['ctrl', 'Ctrl/⌘+Enter 发送']
      ])}${inp('输入框最小行数', 'settings.composerRows', { type: 'number' })}</div>` +
      sw('流式输出', 'settings.stream', '逐字显示回复') +
      sw('展示思考过程', 'settings.showReasoning', 'reasoning_content / <think> 折叠显示') +
      sw('自动生成标题', 'settings.autoTitle', '用当前模型为新会话命名') +
      sw('自动滚动', 'settings.autoScroll', '阅读历史消息时不会被强行拉到底部') +
      sw('保存输入草稿', 'settings.saveDrafts', '按会话保存未发送的文字') +
      sw('输入 token 预估', 'settings.inputTokenEstimate', '在输入区显示字符数与估算 token') +
      sec('请求与重试') +
      `<div class="form-grid three">${inp('请求超时（秒）', 'settings.requestTimeout', { type: 'number' })}${inp('重试次数', 'settings.retryCount', { type: 'number' })}${inp('退避基数（ms）', 'settings.retryBaseMs', { type: 'number' })}</div>` +
      `<div class="form-grid">${inp('最大并发请求', 'settings.maxConcurrency', { type: 'number' })}${inp('工具调用最大轮次', 'settings.maxToolRounds', { type: 'number' })}</div>` +
      sw('失败自动重试', 'settings.retry', '对 429 / 5xx / 网络错误使用指数退避') +
      sec('语音') +
      `<div class="form-grid">${inp('语音识别语言', 'settings.asrLang', { ph: 'zh-CN / en-US' })}${rng('朗读语速', 'settings.ttsRate', 0.5, 2, 0.1)}</div>` +
      sw('回复后自动朗读', 'settings.autoSpeak', '需要浏览器支持 speechSynthesis') +
      hint(
        '全部参数按 <b>会话覆盖 → 模型覆盖 → 助手覆盖 → 全局默认</b> 的优先级生效。可在「参数」页或右侧 Inspector 调整。'
      )
    );
  };

  U.tab_models = function () {
    const c = AI.currentConv();
    const keys = [
      ['temperature', 'Temperature', 'float'],
      ['maxTokens', 'Max Tokens', 'number'],
      ['topP', 'Top P', 'float'],
      ['freqPenalty', 'Frequency Penalty', 'float'],
      ['presPenalty', 'Presence Penalty', 'float'],
      ['seed', 'Seed（可复现）', 'number'],
      ['n', '候选数 n', 'number'],
      ['topK', 'Top K', 'number'],
      ['minP', 'Min P', 'float'],
      ['repeatPenalty', 'Repeat Penalty', 'float'],
      ['numCtx', 'Ollama num_ctx', 'number'],
      ['thinkingBudget', '思考预算 tokens', 'number'],
      ['topLogprobs', 'Top Logprobs', 'number'],
      ['requestTimeout', '请求超时（秒）', 'number']
    ];
    let h = sec('全局生成参数');
    h += `<div class="form-grid three">${inp('Temperature', 'settings.temperature', { type: 'float' })}${inp('Max Tokens', 'settings.maxTokens', { type: 'number' })}${inp('Top P', 'settings.topP', { type: 'float' })}</div>`;
    h += `<div class="form-grid">${inp('Frequency Penalty', 'settings.freqPenalty', { type: 'float' })}${inp('Presence Penalty', 'settings.presPenalty', { type: 'float' })}</div>`;
    h += `<div class="form-grid three">${combo(
      'Reasoning Effort',
      'settings.reasoningEffort',
      [
        ['', '默认'],
        ['low', 'low'],
        ['medium', 'medium'],
        ['high', 'high'],
        ['minimal', 'minimal'],
        ['xhigh', 'xhigh']
      ],
      { ph: '任意档位，如 high / xhigh' }
    )}${combo(
      'Tool Choice',
      'settings.toolChoice',
      [
        ['auto', 'auto'],
        ['none', 'none'],
        ['required', 'required']
      ],
      { ph: 'auto / none / required / 指定函数名' }
    )}${combo(
      '响应格式',
      'settings.responseFormat',
      [
        ['text', '文本'],
        ['json_object', 'JSON 对象'],
        ['json_schema', 'JSON Schema']
      ],
      { ph: '可填服务商私有值' }
    )}</div>`;
    h += area('Stop 序列（每行一个，或以 JSON 数组填写）', 'settings.stopSequences', { rows: 2, ph: 'END\n```' });
    h += `<div class="form-grid">${inp('Seed', 'settings.seed', { type: 'number', ph: '留空为随机' })}${inp('Service Tier', 'settings.serviceTier', { ph: 'auto / flex' })}${inp('请求 user 标识', 'settings.requestUser', { ph: '可选' })}</div>`;
    h += area('JSON Schema（response_format = json_schema 时，填写原始 JSON 文本）', 'settings.jsonSchema', {
      rows: 3,
      ph: '{"name":"output","schema":{"type":"object",...}}'
    });
    h += `<div class="form-grid">${combo(
      'Gemini 安全阈值',
      'settings.geminiSafety',
      [
        ['', '默认'],
        ['HARASSMENT:OFF, HATE_SPEECH:OFF', '宽松'],
        ['HARASSMENT:LOW, HATE_SPEECH:LOW', '严格']
      ],
      { ph: '可直接写完整阈值串' }
    )}${sel('系统提示位置', 'settings.systemPosition', [
      ['system', 'system 消息'],
      ['user-prefix', '首条 user 前缀'],
      ['none', '不发送']
    ])}</div>`;
    h += `<div class="form-grid">${inp('Ollama keep_alive', 'settings.keepAlive', { ph: '5m' })}${inp('Top K', 'settings.topK', { type: 'number' })}${inp('Min P', 'settings.minP', { type: 'float' })}</div>`;
    h += area('额外请求体 JSON（最高优先级，深度合并）', 'settings.extraBodyText', {
      rows: 3,
      ph: '{"max_completion_tokens": 16000}'
    });
    h += `<div class="form-grid">${sw('并行工具调用', 'settings.parallelToolCalls')}${sw('流式返回 usage', 'settings.includeUsage')}${sw('Logprobs', 'settings.logprobs')}</div>`;

    h += sec('当前会话覆盖（仅影响本会话）');
    h += `<div class="card"><div class="card-head"><b>${AI.esc(c ? c.title : '—')}</b><span class="tag">${Object.keys((c && c.params) || {}).length} 项覆盖</span></div>`;
    h += `<div class="form-grid">${keys
      .map(
        ([k, label, t]) =>
          `<div class="form-row"><label>${AI.esc(label)}</label><input class="input" data-conv-param="${k}" data-type="${t}" value="${AI.esc(c && c.params && c.params[k] !== undefined ? c.params[k] : '')}" placeholder="继承默认值"></div>`
      )
      .join('')}</div>`;
    h += `<div class="form-actions"><button class="mini-btn" data-do="x-conv-clear-params">清除全部覆盖</button>
    <button class="mini-btn" data-do="x-conv-copy-global">把全局参数写入本会话</button></div></div>`;
    h += area('本会话系统提示覆盖（追加，不替换助手提示）', '__conv_system', { rows: 3, ph: '仅本会话生效的补充指令' });
    h += hint('会话覆盖会随会话一起导出。模型级覆盖在「模型库」里编辑；右侧 Inspector 可实时调整常用参数。');
    return h;
  };

  U.tab_search = function () {
    const opts = AI.SEARCH_PROVIDERS || [];
    let h = sec('搜索服务');
    h += sel(
      '服务商',
      'search.provider',
      opts.map(x => [x[0], x[1] + (x[3] ? ' · ' + x[3] : '')])
    );
    h += inp('API Key', 'search.apiKey', { ph: '按服务商填写' });
    h += inp('服务地址（SearXNG / 自定义）', 'search.baseUrl', {
      ph: (opts.find(x => x[0] === AI.state.search.provider) || [])[2] || ''
    });
    h += area('自定义请求头 JSON 文本', 'search.headers', { rows: 2, ph: '{"X-API-Key":"..."}' });
    h += `<div class="form-grid three">${inp('结果条数', 'search.maxResults', { type: 'number' })}${inp('内容截断长度', 'search.contentLimit', { type: 'number' })}${sel(
      '时间范围',
      'search.timeRange',
      [
        ['', '不限'],
        ['day', '一天'],
        ['week', '一周'],
        ['month', '一月'],
        ['year', '一年']
      ]
    )}</div>`;
    h += `<div class="form-grid">${inp('语言', 'search.language', { ph: 'zh-CN / en-US' })}${inp('地区', 'search.region', { ph: 'cn / us' })}</div>`;
    h += `<div class="form-grid">${inp('域名白名单（逗号分隔）', 'search.includeDomains', { ph: 'github.com, example.com/docs' })}${inp('域名黑名单', 'search.excludeDomains', { ph: 'example.com' })}</div>`;
    h += area('结果注入模板', 'search.template', {
      rows: 3,
      ph: '[{{index}}] {{title}}\nURL: {{url}}\n{{content}}',
      hint: '可用变量 {{index}} {{title}} {{url}} {{content}} {{query}}'
    });
    h += `<div class="form-grid">${sel('引用样式', 'search.citationStyle', [
      ['chip', '来源卡片'],
      ['inline', '文内编号'],
      ['none', '不显示']
    ])}${sw('自动注入检索结果', 'search.autoInject')}</div>`;
    h += combo(
      '时间范围（可自定义）',
      'search.timeRange',
      [
        ['', '不限'],
        ['day', '近一天'],
        ['week', '近一周'],
        ['month', '近一月'],
        ['year', '近一年'],
        ['d', 'd / w / m / y']
      ],
      { ph: 'YYYY-MM-DD..YYYY-MM-DD' }
    );
    h += `<div class="form-actions"><button class="btn primary" data-do="search-test">测试搜索</button>
    <button class="mini-btn" data-do="x-search-once">立即检索输入框内容</button></div>`;
    h += hint(
      '支持 Tavily / Brave / Exa / Serper / Perplexity Sonar / Jina / Firecrawl / SearXNG / 自定义 JSON。工具模式下模型可自主调用 web_search；未开工具时先检索再注入上下文并附来源。所有请求由浏览器直接发出，受目标服务 CORS 限制。'
    );
    return h;
  };

  U.tab_backup = function () {
    return (
      sec('导出') +
      `<div class="form-actions">
      <button class="btn primary" data-do="export-json">全量 JSON 备份</button>
      <button class="mini-btn" data-do="x-export" data-v="md">Markdown</button>
      <button class="mini-btn" data-do="x-export" data-v="html">HTML</button>
      <button class="mini-btn" data-do="x-export" data-v="txt">纯文本 TXT</button>
      <button class="mini-btn" data-do="x-export" data-v="jsonl">JSONL 训练格式</button>
      <button class="mini-btn" data-do="x-export" data-v="csv">CSV</button>
      <button class="mini-btn" data-do="x-export" data-v="config">仅配置</button>
      <button class="mini-btn" data-do="qr">配置二维码</button></div>` +
      sec('导入与迁移') +
      `<div class="form-actions"><button class="btn primary" data-do="import-json">导入 JSON 备份</button>
      <button class="mini-btn" data-do="import-config">粘贴配置 JSON</button>
      <button class="mini-btn" data-do="x-migrate">从旧版 PLXT AI Chat 导入</button>
      <button class="mini-btn" data-do="x-import-card">导入角色卡 / 会话模板</button></div>` +
      sec('会话管理') +
      `<div class="form-actions"><button class="mini-btn" data-do="x-clone-conv">克隆当前会话</button>
      <button class="mini-btn" data-do="x-merge-json">合并他人分享的会话 JSON</button></div>` +
      hint(
        'JSON 备份包含会话、供应商（含 API Key）、助手、提示词、记忆、世界书、MCP、日志与设置；导出时默认脱敏；含密钥的完整备份请勿分享。Markdown / HTML 会内嵌图片 base64 与来源链接。'
      )
    );
  };

  U.tab_help = function () {
    return (
      sec('已实现的能力对照') +
      card(
        '模型与协议',
        'Chat Completions 兼容 / Anthropic / Gemini 原生适配；任意兼容端点与本地推理服务；per-model baseUrl、Key、headers、body、temperature、上下文长度与价格元数据；远程拉取模型列表。'
      ) +
      card(
        '对话结构',
        '消息树：编辑重答、重新生成、‹ 2/3 › 分支切换、换模型生成分支、多模型 Race、从任意节点派生新会话、固定消息不参与裁剪。'
      ) +
      card(
        '工具与检索',
        'MCP Streamable HTTP（initialize / tools / call / Session-ID / SSE）、内置 18 个工具、Web Worker 代码沙箱、多轮 Agent 循环、工具步骤卡与人工审批、十余种搜索源、来源引用与自定义注入模板。'
      ) +
      card(
        '内容与输入',
        'Markdown / 代码高亮 / LaTeX / 表格 / Mermaid / Artifact 预览；图片、PDF、DOCX、文本附件与屏幕截图；语音输入与朗读；推理过程折叠；结构化输出 JSON Schema。'
      ) +
      card(
        '个性化',
        '多助手、系统提示片段、Prompt 变量、世界书 / 角色卡、文件式记忆、上下文压缩与四种裁剪策略、多套设计语言与完整布局自定义、自定义 CSS / JS、快捷键与斜杠命令映射。'
      ) +
      card(
        '数据与效率',
        '文件夹 / 标签 / 归档 / 排序、全局全文搜索、命令面板、请求日志与用量图表、活动热力图、二维码配置分享、六种导出格式、旧版数据迁移、多标签同步、PWA 离线缓存。'
      ) +
      card(
        '价格与计量说明',
        '不同模型的分词与计费规则各不相同，且价格会变动。token 计数优先采用 API 返回的实际值（服务商未返回时才本地估算）；费用按本地配置的单价估算，不代表服务商账单；可通过自定义余额端点查询实际余额。'
      ) +
      sec('纯前端边界') +
      hint(
        '无法提供：proot Linux 工作区与真实终端、服务端向量库 / RAG、WebDAV / S3 自动备份、后台推送、应用内自动更新、绕过 CORS 的任意第三方直连。这些需要服务端或原生能力；本页用 Artifact 沙箱预览、浏览器内文件解析、手动导入导出与多标签同步做了等价替代。'
      ) +
      sec('快捷键') +
      hint(
        'Enter 发送 · Shift+Enter 换行 · Ctrl/⌘+K 命令面板 · Ctrl/⌘+N 新对话 · Ctrl/⌘+Shift+C 复制全部 · Ctrl/⌘+B 侧栏 · Ctrl/⌘+I 参数面板 · Ctrl/⌘+Shift+E 全屏编辑 · Esc 停止/关闭 · / 斜杠命令。全部可在「快捷键」页重映射。'
      ) +
      sec('维护') +
      `<div class="form-actions"><button class="mini-btn" data-do="x-error-log">错误日志</button> <button class="mini-btn" data-do="x-install-pwa" ${typeof U.hasInstallPrompt === 'function' && U.hasInstallPrompt() ? '' : 'disabled'} title="${typeof U.hasInstallPrompt === 'function' && U.hasInstallPrompt() ? '' : '当前浏览器未提供 PWA 安装提示'}">安装到设备</button></div>` +
      hint(
        '错误日志只记录本次页面运行期间的错误，保存在内存里、刷新即清空，不会上传。安装到设备需浏览器支持 PWA 且站点通过 HTTPS 访问。'
      ) +
      sec('关于与商标') +
      (function () {
        const nm = AI.BRAND.name;
        const zhDis =
          nm +
          ' 是独立的个人纯前端项目，与设置中所列的任何第三方服务、平台及其商标持有人无关联，亦未获得其认可或赞助。页面内出现的名称仅用于客观标识 API 接口兼容性；设计语言为原创中性命名，不使用任何第三方徽标、专属字体或品牌资产。';
        const enDis =
          nm +
          ' is an independent, personal, front-end-only project. It is not affiliated with, endorsed by, or sponsored by any third-party service, platform or trademark holder listed in Settings. Names shown in the interface are used solely to identify API compatibility; the design languages use original neutral naming and no third-party logos, proprietary fonts or brand assets.';
        const zhCopy =
          '© 2026 ' +
          nm +
          ' · 版本 ' +
          AI.VERSION +
          ' · 保留所有权利。本项目以源码形式提供，供个人学习与本地使用，按「现状」提供，不附带任何明示或暗示的担保。';
        const enCopy =
          '© 2026 ' +
          nm +
          ' · Version ' +
          AI.VERSION +
          ' · All rights reserved. Provided as source code for personal learning and local use, "as is", without warranty of any kind, express or implied.';
        return hint(en() ? enDis : zhDis) + hint(en() ? enCopy : zhCopy);
      })()
    );
  };

  /* ============================================================
   Addition: model library
   ============================================================ */
  U.tab_modelslib = function () {
    const ms = AI.allModels();
    const q = (AI.state.ui.modelQuery || '').toLowerCase();
    let h = sec('模型库 · 能力与元数据');
    h += `<div class="form-row"><input class="input" id="modelQuery" placeholder="搜索模型名称 / ID / 供应商" value="${AI.esc(AI.state.ui.modelQuery || '')}"></div>`;
    h += `<div class="form-actions">
    <button class="mini-btn" data-do="x-model-bulk">批量粘贴模型 ID</button>
    <button class="mini-btn" data-do="x-open" data-v="providers">管理供应商</button>
    <button class="mini-btn" data-do="x-refresh-models">刷新</button>
    <button class="mini-btn" data-do="x-infer-models">批量推断</button></div>`;
    const filtered = ms.filter(
      x => !q || (x.id + ' ' + (x.model.name || '') + ' ' + x.provider.name).toLowerCase().includes(q)
    );
    if (!filtered.length) h += '<div class="tiny">没有匹配的模型</div>';
    filtered.forEach(x => {
      const m = x.model,
        p = x.provider,
        isActive = AI.state.activeModel.providerId === p.id && AI.state.activeModel.modelId === x.id;
      const edit = U.editing === 'ml:' + p.id + '|' + x.id;
      const srcTxt =
        m.metaSource === 'api'
          ? en()
            ? 'API'
            : '接口提供'
          : m.metaSource === 'manual'
            ? en()
              ? 'Manual'
              : '手填'
            : m.metaSource === 'inferred'
              ? en()
                ? 'Inferred'
                : '本地推断'
              : '';
      const caps = [
        m.vision && (en() ? 'Vision' : '视觉'),
        m.tools && (en() ? 'Tools' : '工具'),
        m.reasoning && (en() ? 'Reasoning' : '推理'),
        m.json && 'JSON',
        m.context && Math.round(m.context / 1000) + 'K ' + (en() ? 'ctx' : '上下文'),
        m.maxOutput && (en() ? 'max out ' : '输出上限 ') + m.maxOutput,
        srcTxt && (en() ? 'Source: ' : '来源：') + srcTxt
      ].filter(Boolean);
      const md = m.modalities || {};
      const io = (md.input || []).concat('/', md.output || []).filter(x => x && x !== '/');
      h += `<div class="card"><div class="card-head">
      <b>${isActive ? '● ' : ''}${AI.esc(m.name || x.id)}</b>
      <div><button class="mini-btn ${m.favorite ? 'primary' : ''}" data-do="x-model-fav" data-v="${AI.esc(p.id + '|' + x.id)}">${AI.icon('star')}</button>
        <button class="mini-btn" data-do="x-model-edit" data-v="${AI.esc(p.id + '|' + x.id)}">${edit ? '收起' : '编辑'}</button>
        <button class="mini-btn del" data-do="x-model-del" data-v="${AI.esc(p.id + '|' + x.id)}">删除</button></div></div>
      <div class="tiny" style="word-break:break-all">${AI.esc(x.id)} · ${AI.esc(p.name)}</div>
      <div class="insp-cap-grid" style="margin-top:7px">${caps.map(c => `<span class="insp-cap">${AI.esc(c)}</span>`).join('') || '<span class="insp-cap">基础文本</span>'}
        ${m.priceIn ? `<span class="insp-cap">输入 $${m.priceIn}/M</span>` : ''}${m.priceOut ? `<span class="insp-cap">输出 $${m.priceOut}/M</span>` : ''}
        ${m.metaSource ? `<span class="insp-cap">${m.metaSource === 'api' ? '接口提供' : '本地推断'}</span>` : ''}</div>
      ${io.length ? `<div class="tiny" style="margin-top:5px">输入：${AI.esc((md.input || []).join(' / ') || '文本')} · 输出：${AI.esc((md.output || []).join(' / ') || '文本')}</div>` : ''}`;
      if (edit) {
        h += `<div class="form-grid three">
        <div class="form-row"><label>显示名</label><input class="input" data-ml="${AI.esc(p.id + '|' + x.id)}" data-f="name" value="${AI.esc(m.name || '')}"></div>
        <div class="form-row"><label>上下文长度</label><input class="input" type="number" data-ml="${AI.esc(p.id + '|' + x.id)}" data-f="context" value="${m.context || ''}"></div>
        <div class="form-row"><label>最大输出</label><input class="input" type="number" data-ml="${AI.esc(p.id + '|' + x.id)}" data-f="maxOutput" value="${m.maxOutput || ''}"></div></div>
        <div class="form-grid three">
        <div class="form-row"><label>Temperature 覆盖</label><input class="input" type="number" step="0.1" data-ml="${AI.esc(p.id + '|' + x.id)}" data-f="temperature" value="${m.temperature == null ? '' : m.temperature}"></div>
        <div class="form-row"><label>Max Tokens 覆盖</label><input class="input" type="number" data-ml="${AI.esc(p.id + '|' + x.id)}" data-f="maxTokens" value="${m.maxTokens == null ? '' : m.maxTokens}"></div>
        <div class="form-row"><label>独立 Base URL</label><input class="input" data-ml="${AI.esc(p.id + '|' + x.id)}" data-f="baseUrl" value="${AI.esc(m.baseUrl || '')}"></div></div>
        <div class="form-grid three">
        <div class="form-row"><label>独立 API Key</label><input class="input" data-ml="${AI.esc(p.id + '|' + x.id)}" data-f="apiKey" value="${AI.esc(m.apiKey || '')}"></div>
        <div class="form-row"><label>输入单价 $/M</label><input class="input" type="number" step="0.01" data-ml="${AI.esc(p.id + '|' + x.id)}" data-f="priceIn" value="${m.priceIn || ''}"></div>
        <div class="form-row"><label>输出单价 $/M</label><input class="input" type="number" step="0.01" data-ml="${AI.esc(p.id + '|' + x.id)}" data-f="priceOut" value="${m.priceOut || ''}"></div></div>
        <div class="form-grid three">
        ${[
          ['vision', '视觉模型'],
          ['tools', '支持工具调用'],
          ['reasoning', '推理模型'],
          ['json', 'JSON 模式'],
          ['favorite', '收藏'],
          ['enabled', '启用']
        ]
          .map(
            ([k, n]) =>
              `<div class="switch-row" style="padding:3px 0"><div style="font-size:.8em">${n}</div><button class="switch ${m[k] !== false && (m[k] === true || k === 'enabled') ? 'on' : ''}" data-do="x-model-flag" data-v="${AI.esc(p.id + '|' + x.id)}" data-f="${k}"></button></div>`
          )
          .join('')}</div>
        <div class="form-actions"><button class="btn primary" data-do="x-model-save" data-v="${AI.esc(p.id + '|' + x.id)}">保存</button></div>`;
      }
      h += '</div>';
    });
    h += hint(
      '模型元数据用于上下文占用条、费用估算与能力筛选。价格单位为「每百万 token 美元」，留空则不计算费用。禁用模型不会出现在选择器中。'
    );
    h += hint(
      '不同模型的分词与计费规则各不相同，且价格会变动。token 计数优先采用 API 返回的实际值（服务商未返回时才本地估算）；费用按本地配置的单价估算，不代表服务商账单；可通过自定义余额端点查询实际余额。'
    );
    h += hint('「批量推断」根据模型 ID 补齐上下文长度、视觉 / 工具 / 推理能力与输入输出模态；不会覆盖你手动填过的值。');
    return h;
  };

  /* ============================================================
   Additions: context, lorebook and tool approval
   ============================================================ */
  U.tab_context = function () {
    const st = AI.state.settings;
    let h = sec('上下文策略');
    h += sel('裁剪策略', 'settings.contextStrategy', [
      ['count', '按消息数'],
      ['tokens', '按 token 预算'],
      ['headtail', '保留首尾'],
      ['none', '不裁剪（全量）']
    ]);
    h += `<div class="form-grid">${inp('保留最近消息数', 'settings.contextLimit', { type: 'number' })}${inp('Token 预算', 'settings.tokenBudget', { type: 'number' })}${inp('首尾各保留条数', 'settings.headTailKeep', { type: 'number' })}</div>`;
    h += `<div class="form-grid">${sel('系统提示位置', 'settings.systemPosition', [
      ['system', 'system 消息'],
      ['user-prefix', '首条 user 前缀'],
      ['none', '不发送']
    ])}${sw('自动注入已生成摘要', 'settings.autoSummaryInject')}</div>`;
    h += `<div class="form-grid">${rng('消息间距密度', 'settings.density', 0.6, 1.6, 0.1)}${rng('行高', 'settings.lineHeight', 1.3, 2, 0.05)}</div>`;
    h += `<div class="form-grid">${sw('长时间无消息注入时间提醒', 'settings.injectTime')}${sw('启用长期记忆', 'settings.memoryEnabled')}</div>`;
    h += area('记忆注入模板', 'settings.memoryTemplate', {
      rows: 2,
      ph: '【记忆】\n{{memories}}',
      hint: '可用 {{memories}} 变量；留空使用默认格式'
    });
    h += area('系统提示末尾追加（全局）', 'settings.systemSuffix', { rows: 2, ph: '始终用简体中文回答…' });

    h += sec('提示词片段（可开关、可排序）');
    (st.promptFragments || []).forEach((f, i) => {
      const edit = U.editing === 'frag:' + i;
      h += `<div class="list-row"><span class="grow"><b>${AI.esc(f.name || '片段 ' + (i + 1))}</b><small>${AI.esc((f.content || '').slice(0, 70))}</small></span>
      <button class="switch ${f.enabled !== false ? 'on' : ''}" data-do="x-frag-toggle" data-v="${i}"></button>
      <button class="mini-btn" data-do="x-frag-edit" data-v="${i}">${AI.icon('edit')}</button>
      <button class="mini-btn del" data-do="x-frag-del" data-v="${i}">${AI.icon('close')}</button></div>`;
      if (edit)
        h += `<div class="card"><div class="form-grid">${inp('名称', '__frag_name')}${inp('排序权重', '__frag_order', { type: 'number' })}</div>
      ${area('内容（支持 {{变量}}）', '__frag_content', { rows: 4 })}
      <div class="form-actions"><button class="btn primary" data-do="x-frag-save" data-v="${i}">保存</button></div></div>`;
    });
    h += `<div class="form-actions"><button class="mini-btn" data-do="x-frag-add">＋ 新建片段</button></div>`;

    h += sec('会话模板');
    (AI.state.templates || []).forEach(
      t =>
        (h += `<div class="list-row"><span class="grow">${AI.esc(t.name)}<small>${AI.esc((t.system || '').slice(0, 70))}</small></span>
    <button class="mini-btn" data-do="x-tpl-use" data-v="${t.id}">新建会话</button>
    <button class="mini-btn del" data-do="x-tpl-del" data-v="${t.id}">${AI.icon('close')}</button></div>`)
    );
    h += `<div class="form-actions"><button class="mini-btn" data-do="x-tpl-add">＋ 从当前会话保存为模板</button></div>`;

    h += sec('压缩上下文');
    h += `<div class="form-actions"><button class="btn primary" data-do="x-compress">立即生成摘要</button>
    <button class="mini-btn" data-do="x-compress-clear">清除摘要</button></div>`;
    h += `<div class="form-grid">${sw('每 N 轮自动压缩', 'settings.compressAuto')}${inp('自动压缩间隔（轮）', 'settings.compressEvery', { type: 'number' })}</div>`;
    const c = AI.currentConv();
    if (c && c.summary) h += card('当前会话摘要', `<div class="md">${AI.Render.markdown(c.summary)}</div>`);
    h += hint(
      '压缩会插入一份摘要而非删除历史消息；生成摘要后，早于摘要时间点的消息默认不再重复发送，已固定的消息除外。'
    );
    return h;
  };

  U.tab_lorebook = function () {
    let h = sec('世界书 / Lorebook');
    h += hint('条目可按关键词或正则触发，命中后注入系统提示；常驻条目每次请求都注入。适合角色设定、术语表、项目背景。');
    (AI.state.lorebook || []).forEach(e => {
      const edit = U.editing === 'lore:' + e.id;
      h += `<div class="card"><div class="card-head"><b>${AI.esc(e.name || '未命名条目')} <span class="tag">${e.always ? '常驻' : '触发'} · P${e.priority || 0}</span></b>
      <div><button class="mini-btn" data-do="x-lore-edit" data-v="${e.id}">${edit ? '收起' : '编辑'}</button>
      <button class="mini-btn del" data-do="x-lore-del" data-v="${e.id}">${AI.icon('close')}</button></div></div>
      <div class="tiny">${AI.esc(e.keys || '')} · ${AI.esc((e.content || '').slice(0, 90))}</div>`;
      if (edit)
        h += `<div class="form-grid">${F.input('名称', 'arr:lorebook:' + e.id + ':name')}${F.input('优先级', 'arr:lorebook:' + e.id + ':priority', { type: 'number' })}</div>
      ${F.input('触发关键词（逗号或换行分隔）', 'arr:lorebook:' + e.id + ':keys')}
      ${F.area('注入内容（支持 {{变量}}）', 'arr:lorebook:' + e.id + ':content', { rows: 4 })}
      <div class="form-grid">${F.toggle('常驻注入', 'arr:lorebook:' + e.id + ':always')}${F.toggle('关键词按正则匹配', 'arr:lorebook:' + e.id + ':regex')}${F.toggle('启用', 'arr:lorebook:' + e.id + ':enabled')}</div>
      <div class="form-actions"><button class="btn primary" data-do="x-lore-save" data-v="${e.id}">保存</button></div>`;
      h += '</div>';
    });
    h += `<div class="form-actions"><button class="btn primary" data-do="x-lore-add">＋ 新建条目</button>
    <button class="mini-btn" data-do="x-card-import">导入角色卡 JSON</button>
    <button class="mini-btn" data-do="x-card-export">导出角色卡</button></div>`;
    h += sec('角色卡导入说明');
    h += hint(
      '支持 SillyTavern / chara_card_v2 的 JSON：name / description / personality / scenario / first_mes / mes_example 会生成助手系统提示、世界书条目与可选的开场消息。PNG 内嵌元数据需要额外解析，不在纯前端范围内。'
    );
    return h;
  };

  U.tab_tools = function () {
    const st = AI.state.settings;
    let h = sec('工具审批');
    h += sel('审批策略', 'settings.toolApproval', [
      ['never', '不审批（自动执行）'],
      ['writes', '写操作 / 外部调用需确认'],
      ['selected', '仅指定工具需确认'],
      ['always', '所有工具都需确认']
    ]);
    h += `<div class="form-grid">${inp('工具超时（秒）', 'settings.toolTimeout', { type: 'number' })}${inp('工具结果长度上限', 'settings.toolResultLimit', { type: 'number' })}</div>`;
    h += inp('指定审批的工具（逗号分隔，支持前缀 mcp）', '__approval_list');
    h += `<div class="form-actions"><button class="mini-btn" data-do="x-approval-save">保存审批清单</button>
    <button class="mini-btn" data-do="x-approval-reset">清除会话内放行记录</button></div>`;
    h += sec('工具集');
    h += sel('内置工具模式', 'settings.toolSetMode', [
      ['all', '全部可用'],
      ['whitelist', '仅白名单']
    ]);
    h += inp('工具白名单（逗号分隔）', '__toolset_list');
    h += `<div class="form-actions"><button class="mini-btn" data-do="x-toolset-save">保存白名单</button></div>`;
    h +=
      '<div class="card"><div class="card-head"><b>内置工具</b><span class="tag">' +
      AI.BUILTIN_TOOLS.length +
      ' 个</span></div>';
    h += '<div class="form-grid two">';
    AI.BUILTIN_TOOLS.forEach(t => {
      const blocked = (st.toolBlacklist || []).includes(t.name);
      h += `<div class="switch-row" style="padding:4px 0"><div style="min-width:0"><span style="font-family:var(--mono);font-size:.76em">${AI.esc(t.name)}</span><small>${AI.esc(t.description || '')}</small></div>
      <button class="switch ${blocked ? '' : 'on'}" data-do="x-tool-toggle" data-v="${t.name}" title="${blocked ? '已禁用' : '已启用'}"></button></div>`;
    });
    h += '</div></div>';
    h += `<div class="form-actions"><button class="mini-btn" data-do="x-test-tool">测试内置工具（时间 / 计算 / 沙箱）</button></div>`;
    h += sec('MCP 高级');
    h += hint('MCP 服务器在「MCP」页配置。这里可查看已发现工具并按服务器禁用单个工具；审批策略对 mcp_* 工具同样生效。');
    (AI.state.mcpServers || []).forEach(s => {
      const cache = AI.mcpCache[s.id];
      h += `<div class="card"><div class="card-head"><b>${AI.esc(s.name)}</b><span class="tag">${cache && cache.tools ? cache.tools.length + ' 个工具' : '未连接'}</span></div>
      <div class="tiny">${AI.esc(s.url)}</div>`;
      if (cache && cache.tools)
        h +=
          '<div class="form-grid">' +
          cache.tools
            .map(t => {
              const off = (s.disabledTools || []).includes(t.rawName);
              return `<div class="switch-row" style="padding:3px 0"><div style="font-size:.78em">${AI.esc(t.rawName)}</div><button class="switch ${off ? '' : 'on'}" data-do="x-mcp-tool" data-v="${AI.esc(s.id + '|' + t.rawName)}"></button></div>`;
            })
            .join('') +
          '</div>';
      h += '</div>';
    });
    return h;
  };

  /* ============================================================
   Addition: appearance and layout
   ============================================================ */
  U.tab_layout = function () {
    const s = AI.state.settings;
    let h = sec('设计语言与颜色');
    h += sel(
      '设计语言',
      'settings.design',
      AI.DESIGNS.map(d => [d[0], d[1]])
    );
    h += `<div class="form-grid">${inp('自定义强调色', 'settings.accent', { type: 'color', attr: 'type="color" style="height:38px;padding:3px"' })}${sw('启用自定义强调色', 'settings.accentCustom')}${sel(
      '明暗',
      'settings.mode',
      [
        ['light', '浅色'],
        ['dark', '深色'],
        ['auto', '跟随系统']
      ]
    )}</div>`;
    h += `<div class="form-actions"><button class="mini-btn" data-do="x-layout-reset">恢复默认外观</button></div>`;
    h += sec('排版');
    h += `<div class="form-grid three">${sel('字体', 'settings.fontFamily', [
      ['system', '系统无衬线'],
      ['readable', '易读黑体'],
      ['serif', '衬线'],
      ['mono', '等宽'],
      ['custom', '自定义字体栈']
    ])}${inp('字号（px）', 'settings.fontSize', { type: 'number' })}${rng('行高', 'settings.lineHeight', 1.3, 2, 0.05)}</div>`;
    h += inp('自定义字体栈（font-family）', 'settings.fontCustom', { ph: '-apple-system, "PingFang SC", sans-serif' });
    h += sec('布局尺寸');
    h += `<div class="form-grid three">${rng('消息间距密度', 'settings.density', 0.6, 1.6, 0.1)}${inp('内容最大宽度（px）', 'settings.contentWidth', { type: 'number' })}${inp('圆角（px）', 'settings.radius', { type: 'number' })}</div>`;
    h += `<div class="form-grid">${inp('侧栏宽度（px）', 'settings.sidebarWidth', { type: 'number' })}${inp('参数面板宽度（px）', 'settings.inspectorWidth', { type: 'number' })}</div>`;
    h += sel('边框强度', 'settings.borders', [
      ['none', '无边框'],
      ['normal', '标准'],
      ['strong', '加强']
    ]);
    h += `<div class="form-grid three">${sw('浮层阴影', 'settings.shadows')}${sw('过渡动画', 'settings.animations')}${sw('消息气泡背景', 'settings.bubbles')}</div>`;
    h += sec('代码块');
    h += `<div class="form-grid three">${sel('代码高亮主题', 'settings.codeTheme', [
      ['auto', '跟随明暗'],
      ['light', '浅色'],
      ['dark', '深色']
    ])}${sw('自动换行', 'settings.wrapCode')}${sw('显示行号', 'settings.lineNumbers')}</div>`;
    h += sec('显示开关');
    h += `<div class="form-grid three">${sw('头像', 'settings.showAvatar')}${sw('时间戳', 'settings.showTime')}${sw('Token 统计', 'settings.showStats')}${sw('模型徽标', 'settings.showModelBadge')}${sw('快捷回复', 'settings.showSuggestions')}${sw('起始提示词', 'settings.showStarters')}</div>`;
    h += sec('品牌与面板');
    h += `<div class="form-grid">${inp('用户名', 'settings.userName')}${inp('用户头像字符', 'settings.userEmoji')}</div>`;
    h += `<div class="form-grid">${sel('Inspector 默认标签', 'settings.inspectorTab', AI.INSPECTOR_TABS)}${sw('启动时打开参数面板', 'ui.inspectorOpen')}</div>`;
    h += sec('自定义代码');
    h += area('自定义 CSS', 'settings.customCss', { rows: 4, ph: '.msg-bubble { font-family: Georgia; }' });
    h += area('自定义 JS（页面加载时执行一次，仅本机）', 'settings.customJs', { rows: 4, ph: 'AI.toast("hello");' });
    h += sw(
      '启用自定义 JS',
      'settings.customJsEnabled',
      '风险提示：自定义脚本在本页面拥有完整权限，请只粘贴你自己编写的代码'
    );
    h += sec('文件夹');
    (AI.state.folders || []).forEach(
      f =>
        (h += `<div class="list-row"><span class="grow">${AI.esc(f.name)}<small>${AI.esc(f.id)}</small></span><button class="mini-btn del" data-do="x-folder-del" data-v="${f.id}">✕</button></div>`)
    );
    h += `<div class="form-actions"><input class="input" id="newFolder" placeholder="新文件夹名称" style="max-width:220px"><button class="mini-btn" data-do="x-folder-add">＋ 添加</button></div>`;
    h += hint('外观设置即时生效并保存在本机；移动端会自动忽略侧栏/面板宽度并把 Inspector 变成全屏面板。');
    return h;
  };

  /* ============================================================
   Additions: shortcuts and slash commands
   ============================================================ */
  U.tab_shortcuts = function () {
    const labels = {
      command: '命令面板',
      newChat: '新建会话',
      copyAll: '复制全部消息',
      stop: '停止生成 / 关闭浮层',
      search: '全局搜索',
      sidebar: '切换侧栏',
      inspector: '切换参数面板',
      send: '发送',
      fullEdit: '全屏编辑'
    };
    let h = sec('快捷键映射');
    h += hint(
      '格式：mod+k、mod+shift+c、mod+b、escape、enter、mod+shift+e。mod 在 Windows/Linux 为 Ctrl，在 macOS 为 ⌘。'
    );
    Object.keys(labels).forEach(
      k =>
        (h += `<div class="form-row"><label>${AI.esc(labels[k])}</label>
    <input class="input" data-shortcut="${k}" value="${AI.esc((AI.state.shortcuts || {})[k] || '')}" placeholder="mod+k"></div>`)
    );
    h += `<div class="form-actions"><button class="btn primary" data-do="x-shortcut-save">保存快捷键</button>
    <button class="mini-btn" data-do="x-shortcut-reset">恢复默认</button></div>`;
    h += sec('自定义斜杠命令');
    h += hint(
      '在输入框以 / 开头触发。action 可填：new、clear、compress、branch、race、image、theme、inspector、export、settings、model、prompt，或 open:标签名。'
    );
    (AI.state.customCommands || []).forEach(
      (c, i) =>
        (h += `<div class="list-row"><span class="grow"><b>/${AI.esc(c.name)}</b><small>→ ${AI.esc(c.action)}</small></span>
    <button class="mini-btn del" data-do="x-cmd-del" data-v="${i}">${AI.icon('close')}</button></div>`)
    );
    h += `<div class="form-grid"><input class="input" id="newCmdName" placeholder="命令名，如 summarize"><input class="input" id="newCmdAction" placeholder="动作，如 compress"></div>
    <div class="form-actions"><button class="mini-btn" data-do="x-cmd-add">＋ 添加命令</button></div>`;
    return h;
  };

  /* ============================================================
   Additions: request log and privacy data
   ============================================================ */
  U.tab_logs = function () {
    const logs = AI.state.requestLog || [];
    let ti = 0,
      to = 0,
      cost = 0,
      ok = 0;
    Object.values(AI.state.logs || {}).forEach(l => {
      ti += l.in || 0;
      to += l.out || 0;
      cost += l.cost || 0;
    });
    logs.forEach(l => {
      if (l.ok) ok++;
    });
    let h = sec('汇总');
    h += `<div class="stat-grid"><div class="stat-box"><b>${logs.length}</b><span>近期请求</span></div>
    <div class="stat-box"><b>${AI.fmtNum(ti)}</b><span>输入 tokens</span></div>
    <div class="stat-box"><b>${AI.fmtNum(to)}</b><span>输出 tokens</span></div>
    <div class="stat-box"><b>${ok}/${logs.length}</b><span>成功率</span></div>
    <div class="stat-box"><b>$${cost.toFixed(4)}</b><span>估算费用</span></div>
    <div class="stat-box"><b>${AI.fmtNum(AI.storageBytes() / 1024)}KB</b><span>本地存储</span></div></div>`;
    h += `<div class="form-actions"><button class="mini-btn" data-do="x-clear-log">清空请求日志</button>
    <button class="mini-btn" data-do="x-export" data-v="logs">导出日志 CSV</button>
    <button class="mini-btn" data-do="x-open" data-v="stats">活动热力图</button></div>`;
    h += sec('最近请求');
    if (!logs.length) h += '<div class="tiny">暂无请求记录</div>';
    logs
      .slice()
      .reverse()
      .slice(0, 80)
      .forEach(
        l =>
          (h += `<div class="list-row">
    <span class="grow"><b style="color:${l.ok ? 'var(--ok)' : 'var(--err)'}">${l.ok ? '✓' : '✕'}</b> ${AI.esc(l.model || '')} · ${AI.esc(l.provider || '')}
      <small>${new Date(l.at).toLocaleString()} · ${l.duration || 0}ms · ↑${l.in || 0} ↓${l.out || 0}${l.cost ? ' · ' + AI.money(l.cost || 0) : ''}${l.error ? ' · ' + AI.esc(l.error) : ''}</small></span></div>`)
      );
    return h;
  };

  U.tab_privacy = function () {
    let h = sec('本地数据');
    h += hint(
      '所有会话、设置与附件默认只写入浏览器 localStorage，不会上传。只有发送消息时，请求才会发往你自己配置的模型 / 搜索 / MCP 端点。'
    );
    h += `<div class="form-grid">${sel('API Key 存储位置', 'settings.keyStorage', [
      ['local', 'localStorage（持久）'],
      ['session', 'sessionStorage（关标签即失效）'],
      ['memory', '仅内存（刷新即失效）']
    ])}${sw('费用估算（需模型单价）', 'settings.costEnabled')}</div>`;
    h += sw(
      '隐私模式',
      'settings.privacyMode',
      '不把消息内容与附件写入本地存储；刷新后历史消息为空，仅保留设置与占位标题'
    );
    h += `<div class="form-grid">${inp('启动时自动清理 N 天前的会话（0 关闭）', 'settings.autoCleanDays', { type: 'number' })}${inp('备份提醒间隔天数（0 关闭）', 'settings.backupReminderDays', { type: 'number' })}</div>`;
    h += `<div class="form-actions"><button class="mini-btn" data-do="x-clean">立即清理旧会话与大附件</button>
    <button class="mini-btn" data-do="export-json">导出备份</button>
    <button class="mini-btn" data-do="x-migrate">从旧版 PLXT 导入</button></div>`;
    h += sec('存储用量');
    const bytes = AI.storageBytes();
    h += `<div class="form-row"><label>${AI.fmtNum(bytes / 1024)} KB / 约 5 MB 配额</label><div class="insp-meter"><i style="width:${Math.min(100, (bytes / (5 * 1024 * 1024)) * 100)}%"></i></div></div>`;
    h += sec('危险操作');
    h += `<div class="form-actions"><button class="btn danger" data-do="reset">清空本机全部数据</button></div>`;
    h += hint('若使用 sessionStorage / 仅内存密钥，导出的 JSON 备份不会包含 API Key，导入后需要重新填写。');
    return h;
  };

  /* ============================================================
   Inspector panel
   ============================================================ */
  U.inspectorTab_run = function () {
    const p = AI.currentProvider(),
      m = AI.currentModel(),
      st = AI.state.settings;
    const P = AI.resolveParams(AI.currentConv());
    let h = `<div class="insp-section">模型</div>`;
    h += `<div class="list-row" style="cursor:pointer" data-insp-click="model"><span class="grow"><b>${AI.esc(m ? m.name || m.id : '未选择模型')}</b><small>${AI.esc(p ? p.name + ' · ' + (p.type || 'openai') : '点击配置供应商')}</small></span><span class="mini-btn">切换</span></div>`;
    if (m)
      h += `<div class="insp-cap-grid" style="margin:8px 0 4px">
    ${m.vision ? '<span class="insp-cap">视觉</span>' : ''}${m.tools ? '<span class="insp-cap">工具</span>' : ''}
    ${m.reasoning ? '<span class="insp-cap">推理</span>' : ''}${m.context ? `<span class="insp-cap">${Math.round(m.context / 1000)}K 上下文</span>` : ''}
    ${m.maxOutput ? `<span class="insp-cap">最大输出 ${m.maxOutput}</span>` : ''}</div>`;
    h += `<div class="insp-section">核心参数</div>`;
    h += rng('Temperature', 'settings.temperature', 0, 2, 0.05);
    h += rng('Top P', 'settings.topP', 0, 1, 0.05);
    h += rng('Max Tokens', 'settings.maxTokens', 256, 32768, 256);
    h += rng('Frequency Penalty', 'settings.freqPenalty', -2, 2, 0.1);
    h += rng('Presence Penalty', 'settings.presPenalty', -2, 2, 0.1);
    h += `<div class="form-grid">${combo(
      'Reasoning Effort',
      'settings.reasoningEffort',
      [
        ['', '默认'],
        ['low', 'low'],
        ['medium', 'medium'],
        ['high', 'high'],
        ['minimal', 'minimal'],
        ['xhigh', 'xhigh']
      ],
      { ph: '任意档位' }
    )}${combo(
      '响应格式',
      'settings.responseFormat',
      [
        ['text', '文本'],
        ['json_object', 'JSON'],
        ['json_schema', 'Schema']
      ],
      { ph: '可填服务商私有值' }
    )}</div>`;
    h += `<div class="form-grid">${inp('Seed', 'settings.seed', { type: 'number' })}${inp('Stop（逗号分隔）', 'settings.stopSequences', { ph: 'END,STOP' })}</div>`;
    h += `<div class="insp-section">开关</div>`;
    h += `<div class="form-grid">${sw('流式', 'settings.stream')}${sw('思考过程', 'settings.showReasoning')}${sw('工具调用', 'settings.toolsOn')}${sw('联网搜索', 'settings.webSearchOn')}${sw('注入时间', 'settings.injectTime')}${sw('长期记忆', 'settings.memoryEnabled')}</div>`;
    h += `<div class="insp-section">会话覆盖</div>`;
    const cp = Object.keys((AI.currentConv() || {}).params || {});
    h += `<div class="insp-row"><label>当前会话覆盖</label><span class="val">${cp.length} 项</span></div>`;
    h += `<div class="tiny" style="margin:6px 0">${cp.length ? AI.esc(cp.join(', ')) : '继承全局 / 模型参数'}</div>`;
    h += `<div class="form-actions"><button class="mini-btn" data-do="x-conv-clear-params">清除覆盖</button>
    <button class="mini-btn" data-do="x-open" data-v="models">全部参数</button></div>`;
    return h;
  };
  U.inspectorTab_system = function () {
    const as = AI.currentAssistant(),
      c = AI.currentConv();
    let h = `<div class="insp-section">系统提示</div>`;
    h += `<div class="list-row" style="cursor:pointer" data-insp-click="assistant"><span class="grow"><b>${AI.esc(as.name)}</b><small>点击切换到助手设置</small></span></div>`;
    h += area('当前助手系统提示（支持 {{变量}}）', 'arr:assistants:' + as.id + ':systemPrompt', { rows: 8 });
    h += `<div class="form-actions"><button class="mini-btn" data-insp-click="saveSystem">保存提示词</button></div>`;
    h += `<div class="insp-section">会话追加指令</div>`;
    h += `<textarea class="textarea" id="inspConvSystem" rows="4" placeholder="仅本会话生效">${AI.esc((c && c.systemOverride) || '')}</textarea>`;
    h += `<div class="form-actions"><button class="mini-btn" data-insp-click="saveConvSystem">保存</button></div>`;
    h += `<div class="insp-section">注入内容</div>`;
    h += `<div class="insp-row"><label>提示词片段</label><span class="val">${(AI.state.settings.promptFragments || []).filter(f => f.enabled !== false).length}</span></div>`;
    h += `<div class="insp-row"><label>记忆条目</label><span class="val">${(AI.state.memories || []).length}</span></div>`;
    h += `<div class="insp-row"><label>世界书条目</label><span class="val">${(AI.state.lorebook || []).filter(e => e.enabled !== false).length}</span></div>`;
    h += `<div class="insp-row"><label>会话摘要</label><span class="val">${c && c.summary ? '已生成' : '无'}</span></div>`;
    h += `<div class="form-actions"><button class="mini-btn" data-do="x-open" data-v="lorebook">编辑世界书</button>
    <button class="mini-btn" data-do="x-open" data-v="context">上下文设置</button></div>`;
    return h;
  };
  U.inspectorTab_context = function () {
    const c = AI.currentConv(),
      m = AI.currentModel();
    /* Same source as the top context meter: use the exact prompt_tokens returned by the previous API request. */
    let exactIn = null;
    const path = c ? AI.pathOf(c) : [];
    for (let i = path.length - 1; i >= 0; i--) {
      const n = path[i];
      if (n.role === 'assistant' && n.stats && n.stats.usageSource === 'api') {
        exactIn = n.stats.in;
        break;
      }
    }
    const exact = exactIn != null;
    const tk = exact ? exactIn : AI.contextTokens(c);
    const limit = Math.max(4000, (m && m.context) || 32000),
      pct = Math.min(100, Math.round((tk / limit) * 100));
    let h = `<div class="insp-section">上下文占用</div>`;
    h += `<div class="insp-row"><label>${exact ? (en() ? 'API tokens' : 'API 计数') : en() ? 'Estimated tokens' : '估算 tokens'}</label><span class="val">${AI.fmtNum(tk)} / ${AI.fmtNum(limit)}</span></div>`;
    h += `<div class="insp-meter" style="margin:8px 0"><i style="width:${pct}%"></i></div>`;
    h += `<div class="insp-row"><label>当前路径消息</label><span class="val">${AI.pathOf(c).length}</span></div>`;
    h += `<div class="insp-row"><label>固定消息</label><span class="val">${AI.pathOf(c).filter(n => n.pinned).length}</span></div>`;
    h += `<div class="insp-section">策略</div>`;
    h += sel('裁剪策略', 'settings.contextStrategy', [
      ['count', '按消息数'],
      ['tokens', '按 token 预算'],
      ['headtail', '保留首尾'],
      ['none', '不裁剪']
    ]);
    h += `<div class="form-grid">${inp('保留消息数', 'settings.contextLimit', { type: 'number' })}${inp('Token 预算', 'settings.tokenBudget', { type: 'number' })}</div>`;
    h += `<div class="form-actions"><button class="mini-btn" data-do="x-compress">压缩为摘要</button>
    <button class="mini-btn" data-do="x-compress-clear">清除摘要</button>
    <button class="mini-btn" data-do="x-open" data-v="context">更多设置</button></div>`;
    if (c && c.summary)
      h += `<div class="insp-section">摘要预览</div><div class="tiny" style="white-space:pre-wrap;max-height:200px;overflow:auto">${AI.esc(c.summary.slice(0, 1200))}</div>`;
    return h;
  };
  U.inspectorTab_tools = function () {
    const st = AI.state.settings,
      s = AI.state.search;
    let h = `<div class="insp-section">检索与工具</div>`;
    h += `<div class="insp-row"><label>搜索服务</label><span class="val">${AI.esc((AI.SEARCH_PROVIDERS.find(x => x[0] === s.provider) || [])[1] || s.provider)}</span></div>`;
    h += `<div class="insp-row"><label>结果数 / 截断</label><span class="val">${s.maxResults || 5} / ${s.contentLimit || 900}</span></div>`;
    h += `<div class="insp-row"><label>审批策略</label><span class="val">${AI.esc(st.toolApproval)}</span></div>`;
    h += `<div class="insp-row"><label>最大工具轮次</label><span class="val">${st.maxToolRounds}</span></div>`;
    h += `<div class="form-grid">${sw('联网', 'settings.webSearchOn')}${sw('工具', 'settings.toolsOn')}${sw('思考展示', 'settings.showReasoning')}</div>`;
    h += `<div class="insp-section">MCP 服务器</div>`;
    if (!(AI.state.mcpServers || []).length) h += '<div class="tiny">未配置（设置 → MCP）</div>';
    (AI.state.mcpServers || []).forEach(x => {
      const c = AI.mcpCache[x.id];
      h += `<div class="insp-row"><label>${AI.esc(x.name)}</label><span class="val">${x.enabled === false ? '禁用' : c ? c.tools.length + ' 工具' : '未连接'}</span></div>`;
    });
    h += `<div class="form-actions"><button class="mini-btn" data-do="x-open" data-v="tools">工具与审批</button>
    <button class="mini-btn" data-do="x-open" data-v="search">搜索设置</button>
    <button class="mini-btn" data-do="x-test-tool">测试工具</button></div>`;
    return h;
  };
  U.inspectorTab_usage = function () {
    const k = AI.dayKey(),
      l = (AI.state.logs || {})[k] || { in: 0, out: 0, requests: 0, cost: 0, models: {} };
    let h = `<div class="insp-section">今日</div>`;
    h += `<div class="stat-grid"><div class="stat-box"><b>${l.requests || 0}</b><span>请求</span></div>
    <div class="stat-box"><b>${AI.fmtNum(l.in)}</b><span>输入</span></div>
    <div class="stat-box"><b>${AI.fmtNum(l.out)}</b><span>输出</span></div></div>`;
    h += `<div class="insp-row"><label>${en() ? 'Est. cost' : '费用估算'}</label><span class="val">$${(l.cost || 0).toFixed(4)}</span></div>`;
    h += `<div class="tiny" style="margin:2px 0 8px;line-height:1.6">${en() ? 'Token totals are the exact counts returned by the API; cost is computed from configured unit prices.' : 'token 汇总优先采用 API 返回的实际计数，费用按配置的单价估算。'}</div>`;
    h += `<div class="insp-section">模型分布</div>`;
    const models = Object.entries(l.models || {}).sort((a, b) => b[1] - a[1]);
    if (!models.length) h += '<div class="tiny">暂无数据</div>';
    models.forEach(
      ([m, n]) => (h += `<div class="insp-row"><label>${AI.esc(m)}</label><span class="val">${n}</span></div>`)
    );
    h += `<div class="insp-section">最近请求</div>`;
    (AI.state.requestLog || [])
      .slice(-8)
      .reverse()
      .forEach(
        x =>
          (h += `<div class="insp-row"><label>${x.ok ? '✓' : '✕'} ${AI.esc((x.model || '').slice(0, 22))}</label><span class="val">${x.duration || 0}ms</span></div>`)
      );
    h += `<div class="form-actions"><button class="mini-btn" data-do="x-open" data-v="logs">请求日志</button>
    <button class="mini-btn" data-do="x-open" data-v="stats">统计与热力图</button></div>`;
    return h;
  };

  /* ============================================================
   Extension actions
   ============================================================ */
  const A = (AI.EXTRA_ACTIONS = {});
  const findModel = key => {
    const [pid, mid] = String(key).split('|');
    const p = AI.state.providers.find(x => x.id === pid);
    const m = p && (p.models || []).find(x => (x.id || x) === mid);
    return { p, m, idx: p ? (p.models || []).findIndex(x => (x.id || x) === mid) : -1 };
  };
  A['x-open'] = ({ ds }) => U.openDrawer(ds.v || 'general');
  A['x-inspector'] = () => U.setInspector(U.dom.inspector.hidden);
  A['x-refresh-models'] = () => U.renderDrawer();
  A['x-model-edit'] = ({ ds }) => {
    U.editing = U.editing === 'ml:' + ds.v ? null : 'ml:' + ds.v;
    U.renderDrawer();
  };
  A['x-model-fav'] = ({ ds }) => {
    const { m } = findModel(ds.v);
    if (m && typeof m === 'object') {
      m.favorite = !m.favorite;
      AI.save();
      U.renderDrawer();
    }
  };
  A['x-model-del'] = ({ ds }) =>
    U.confirm('删除模型', '从该供应商的模型列表移除？', () => {
      const { p, idx } = findModel(ds.v);
      if (p && idx >= 0) {
        p.models.splice(idx, 1);
        AI.save(true);
        U.renderDrawer();
        U.updateLabels();
      }
    });
  A['x-model-flag'] = ({ ds }) => {
    const { m } = findModel(ds.v);
    if (m && typeof m === 'object') {
      m[ds.f] = !m[ds.f];
      AI.save();
      U.renderDrawer();
    }
  };
  A['x-model-save'] = ({ ds }) => {
    const { m } = findModel(ds.v);
    if (!m || typeof m !== 'object') return;
    document.querySelectorAll(`[data-ml="${CSS.escape(ds.v)}"]`).forEach(el => {
      const k = el.dataset.f;
      let v = el.value.trim();
      if (['context', 'maxOutput', 'maxTokens', 'priceIn', 'priceOut'].includes(k)) v = v === '' ? null : Number(v);
      else if (k === 'temperature') v = v === '' ? null : Number(v);
      m[k] = v;
    });
    AI.save(true);
    U.editing = null;
    U.renderDrawer();
    U.updateLabels();
    U.toast('模型元数据已保存', 'ok');
  };
  A['x-model-bulk'] = () =>
    U.modal({
      title: '批量添加模型',
      body: `<p>每行一个模型 ID，可加 <code>|显示名</code>；添加到第一个供应商。</p>
  <textarea class="textarea" id="bulkModels" rows="8" placeholder="gpt-4o-mini|GPT-4o mini\ndeepseek-chat"></textarea>`,
      actions: [
        { label: '取消', cls: 'ghost' },
        {
          label: '添加',
          cls: 'primary',
          onClick: root => {
            const p = AI.state.providers[0];
            if (!p) {
              U.toast('请先添加供应商', 'warn');
              return;
            }
            root
              .querySelector('#bulkModels')
              .value.split('\n')
              .map(x => x.trim())
              .filter(Boolean)
              .forEach(line => {
                const [id, name] = line.split('|');
                p.models = p.models || [];
                if (!p.models.some(m => (m.id || m) === id.trim()))
                  p.models.push({ id: id.trim(), name: (name || id).trim() });
              });
            AI.save(true);
            U.renderDrawer();
            U.toast('已添加', 'ok');
          }
        }
      ]
    });
  A['x-conv-clear-params'] = () => {
    const c = AI.currentConv();
    if (c) {
      c.params = {};
      AI.save(true);
      U.renderDrawer();
      U.renderInspector();
      U.updateCtxMeter();
      U.toast('已清除会话覆盖', 'ok');
    }
  };
  A['x-conv-copy-global'] = () => {
    const c = AI.currentConv();
    if (!c) return;
    c.params = AI.resolveParams({ params: {} });
    AI.save(true);
    U.renderDrawer();
    U.toast('已写入全局参数', 'ok');
  };
  A['x-frag-add'] = () => {
    (AI.state.settings.promptFragments || (AI.state.settings.promptFragments = [])).push({
      name: '新片段',
      content: '',
      enabled: true,
      order: 0
    });
    AI.save();
    U.editing = 'frag:' + (AI.state.settings.promptFragments.length - 1);
    U.renderDrawer();
  };
  A['x-frag-edit'] = ({ ds }) => {
    U.editing = U.editing === 'frag:' + ds.v ? null : 'frag:' + ds.v;
    U.renderDrawer();
  };
  A['x-frag-del'] = ({ ds }) => {
    AI.state.settings.promptFragments.splice(+ds.v, 1);
    AI.save();
    U.renderDrawer();
  };
  A['x-frag-toggle'] = ({ ds }) => {
    const f = AI.state.settings.promptFragments[+ds.v];
    if (f) {
      f.enabled = f.enabled === false;
      AI.save();
      U.renderDrawer();
    }
  };
  A['x-frag-save'] = ({ ds }) => {
    const f = AI.state.settings.promptFragments[+ds.v];
    if (!f) return;
    const root = U.dom.drawerBody;
    f.name = (root.querySelector('[data-bind="__frag_name"]') || {}).value || f.name;
    f.order = Number((root.querySelector('[data-bind="__frag_order"]') || {}).value) || 0;
    f.content = (root.querySelector('[data-bind="__frag_content"]') || {}).value || '';
    AI.save(true);
    U.editing = null;
    U.renderDrawer();
    U.toast('已保存', 'ok');
  };
  A['x-lore-add'] = () => {
    const e = {
      id: AI.uid(),
      name: '新条目',
      keys: '',
      content: '',
      always: false,
      regex: false,
      enabled: true,
      priority: 0
    };
    AI.state.lorebook.push(e);
    AI.save();
    U.editing = 'lore:' + e.id;
    U.renderDrawer();
  };
  A['x-lore-edit'] = ({ ds }) => {
    U.editing = U.editing === 'lore:' + ds.v ? null : 'lore:' + ds.v;
    U.renderDrawer();
  };
  A['x-lore-del'] = ({ ds }) => {
    AI.state.lorebook = AI.state.lorebook.filter(x => x.id !== ds.v);
    AI.save();
    U.renderDrawer();
  };
  A['x-lore-save'] = () => {
    U.editing = null;
    AI.save(true);
    U.renderDrawer();
    U.toast('已保存', 'ok');
  };
  A['x-card-import'] = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        const j = AI.safeJson(r.result, null);
        if (!j) {
          U.toast('角色卡 JSON 解析失败', 'err');
          return;
        }
        const d = j.data || (j.spec && j.spec.data) || j;
        const name = d.name || j.name || '导入角色';
        const sys = [d.description, d.personality, d.scenario, d.mes_example].filter(Boolean).join('\n\n');
        const as = {
          id: AI.uid(),
          name,
          emoji: '',
          systemPrompt: sys || AI.DEFAULT_SYSTEM_PROMPT,
          memory: true,
          quickReplies: [],
          promptInjections: [],
          toolSet: null
        };
        AI.state.assistants.push(as);
        AI.state.activeAssistantId = as.id;
        if (sys)
          AI.state.lorebook.push({
            id: AI.uid(),
            name: name + ' · 设定',
            keys: '',
            content: sys,
            always: true,
            regex: false,
            enabled: true,
            priority: 10
          });
        AI.state.templates.push({ id: AI.uid(), name, system: sys, firstMes: d.first_mes || '' });
        AI.save(true);
        U.renderDrawer();
        U.updateLabels();
        U.toast('角色卡已导入：' + name, 'ok');
      };
      r.readAsText(f);
    };
    inp.click();
  };
  A['x-card-export'] = () => {
    const as = AI.currentAssistant();
    const card = {
      spec: 'chara_card_v2',
      spec_version: '2.0',
      data: {
        name: as.name,
        description: as.systemPrompt,
        personality: '',
        scenario: '',
        first_mes: '',
        mes_example: '',
        creator_notes: (en() ? 'Exported from ' : '由 ') + AI.BRAND.name + (en() ? '' : ' 导出')
      }
    };
    downloadText(as.name + '.json', JSON.stringify(card, null, 2), 'application/json');
  };
  A['x-tpl-add'] = () => {
    const c = AI.currentConv(),
      as = AI.state.assistants.find(a => a.id === c.assistantId) || as0();
    AI.state.templates.push({ id: AI.uid(), name: c.title || '会话模板', system: as.systemPrompt, firstMes: '' });
    AI.save();
    U.renderDrawer();
    U.toast('已保存为模板', 'ok');
    function as0() {
      return AI.currentAssistant();
    }
  };
  A['x-tpl-use'] = ({ ds }) => {
    const t = AI.state.templates.find(x => x.id === ds.v);
    if (!t) return;
    AI.newChat(t.name);
    const c = AI.currentConv();
    if (c) {
      c.systemOverride = t.system || '';
      if (t.firstMes) AI.addNode(c, { role: 'user', content: t.firstMes }, c.rootId);
    }
    AI.save(true);
    U.closeDrawer();
    U.renderAll();
  };
  A['x-tpl-del'] = ({ ds }) => {
    AI.state.templates = AI.state.templates.filter(x => x.id !== ds.v);
    AI.save();
    U.renderDrawer();
  };
  A['x-compress'] = () => {
    U.closeDrawer();
    AI.compressContext();
  };
  A['x-compress-clear'] = () => {
    const c = AI.currentConv();
    if (c) {
      c.summary = '';
      c.summaryAt = 0;
      AI.save(true);
      U.renderDrawer();
      U.toast('摘要已清除', 'ok');
    }
  };
  A['x-approval-save'] = () => {
    const el = U.dom.drawerBody.querySelector('[data-bind="__approval_list"]');
    if (el) {
      AI.state.settings.approvalTools = el.value
        .split(/[,，]/)
        .map(x => x.trim())
        .filter(Boolean);
      AI.save();
      U.toast('已保存', 'ok');
    }
  };
  A['x-approval-reset'] = () => {
    AI.sessionApproved.clear();
    U.toast('放行记录已清除', 'ok');
  };
  A['x-toolset-save'] = () => {
    const el = U.dom.drawerBody.querySelector('[data-bind="__toolset_list"]');
    if (el) {
      AI.state.settings.toolSet = el.value
        .split(/[,，]/)
        .map(x => x.trim())
        .filter(Boolean);
      AI.save();
      U.toast('已保存', 'ok');
    }
  };
  A['x-tool-toggle'] = ({ ds }) => {
    const list = AI.state.settings.toolBlacklist || (AI.state.settings.toolBlacklist = []);
    const i = list.indexOf(ds.v);
    if (i >= 0) list.splice(i, 1);
    else list.push(ds.v);
    AI.save();
    U.renderDrawer();
  };
  A['x-mcp-tool'] = ({ ds }) => {
    const [sid, name] = String(ds.v).split('|'),
      s = AI.state.mcpServers.find(x => x.id === sid);
    if (!s) return;
    s.disabledTools = s.disabledTools || [];
    const i = s.disabledTools.indexOf(name);
    if (i >= 0) s.disabledTools.splice(i, 1);
    else s.disabledTools.push(name);
    AI.save();
    U.renderDrawer();
  };
  A['x-test-tool'] = async () => {
    U.toast('正在测试内置工具…');
    try {
      const a = await AI.executeTool('get_current_time', {});
      const b = await AI.executeTool('calculator', { expression: '(12+8)*3/4' });
      const c = await AI.executeTool('execute_js', { code: 'return [1,2,3].map(x=>x*x).join(",")' });
      U.modal({
        title: '内置工具测试',
        body: `<pre style="white-space:pre-wrap;font:12px/1.7 var(--mono)">${AI.esc(a.text + '\n' + b.text + '\n' + c.text)}</pre>`
      });
    } catch (e) {
      U.toast(e.message, 'err');
    }
  };
  A['x-search-once'] = async () => {
    const q = U.dom.input.value.trim() || 'AI chat 前端';
    const r = await AI.webSearch(q);
    U.modal({
      title: '搜索结果',
      wide: true,
      body: `<pre style="white-space:pre-wrap;font:12px/1.7 var(--mono);max-height:52vh;overflow:auto">${AI.esc(r.text || r.error || '')}</pre>`
    });
  };
  A['x-layout-reset'] = () => {
    const d = AI.DEFAULT_STATE().settings;
    [
      'design',
      'mode',
      'accent',
      'accentCustom',
      'fontSize',
      'lineHeight',
      'fontFamily',
      'fontCustom',
      'density',
      'contentWidth',
      'sidebarWidth',
      'inspectorWidth',
      'radius',
      'borders',
      'shadows',
      'animations',
      'codeTheme',
      'wrapCode',
      'lineNumbers',
      'showAvatar',
      'showTime',
      'showStats',
      'showModelBadge',
      'showSuggestions',
      'showStarters',
      'bubbles',
      'customCss'
    ].forEach(k => (AI.state.settings[k] = d[k]));
    AI.save(true);
    U.applyTheme();
    U.renderDrawer();
    U.toast('外观已恢复默认', 'ok');
  };
  A['x-folder-add'] = () => {
    const el = document.getElementById('newFolder');
    const name = el && el.value.trim();
    if (!name) return;
    AI.state.folders.push({ id: AI.uid().slice(0, 8), name });
    AI.save();
    U.renderDrawer();
    U.renderConvList();
  };
  A['x-folder-del'] = ({ ds }) => {
    AI.state.folders = AI.state.folders.filter(f => f.id !== ds.v);
    AI.state.conversations.forEach(c => {
      if (c.folder === ds.v) c.folder = '';
    });
    AI.save();
    U.renderDrawer();
    U.renderConvList();
  };
  A['x-shortcut-save'] = () => {
    U.dom.drawerBody.querySelectorAll('[data-shortcut]').forEach(el => {
      AI.state.shortcuts[el.dataset.shortcut] = el.value.trim();
    });
    AI.save();
    U.toast('快捷键已保存', 'ok');
  };
  A['x-shortcut-reset'] = () => {
    AI.state.shortcuts = AI.DEFAULT_STATE().shortcuts;
    AI.save();
    U.renderDrawer();
  };
  A['x-cmd-add'] = () => {
    const n = (document.getElementById('newCmdName') || {}).value,
      a = (document.getElementById('newCmdAction') || {}).value;
    if (!n || !a) return;
    AI.state.customCommands.push({ name: n.trim().replace(/^\//, ''), action: a.trim() });
    AI.save();
    registerSlash();
    U.renderDrawer();
  };
  A['x-cmd-del'] = ({ ds }) => {
    const c = AI.state.customCommands[+ds.v];
    if (c && AI.SLASH_COMMANDS) delete AI.SLASH_COMMANDS[c.name]; // Invalidated immediately after deletion.
    AI.state.customCommands.splice(+ds.v, 1);
    AI.save();
    U.renderDrawer();
  };
  A['x-clear-log'] = () => {
    AI.state.requestLog = [];
    AI.save(true);
    U.renderDrawer();
    U.toast('日志已清空', 'ok');
  };
  A['x-clean'] = () => {
    const days = AI.state.settings.autoCleanDays || 30,
      cutoff = Date.now() - days * 86400000;
    const before = AI.state.conversations.length;
    AI.state.conversations = AI.state.conversations.filter(c => c.updatedAt > cutoff);
    let imgs = 0;
    AI.state.conversations.forEach(c =>
      Object.values(c.nodes).forEach(n => {
        (n.attachments || []).forEach(a => {
          if (a.type === 'image' && (a.data || '').length > 400000) {
            delete a.data;
            imgs++;
          }
        });
      })
    );
    if (!AI.state.conversations.length) AI.newConversation({ silent: true });
    if (!AI.currentConv()) AI.state.currentId = AI.state.conversations[0].id;
    AI.save(true);
    U.renderAll();
    U.toast(`清理了 ${before - AI.state.conversations.length} 个旧会话、${imgs} 个大图片`, 'ok');
  };
  A['x-migrate'] = () =>
    U.confirm('从旧版导入', '会读取本机 plxt-ai-chat-v3 并追加供应商与会话，确定？', () => {
      const r = AI.migrateLegacy();
      U.toast(r.ok ? `已导入 ${r.conversations} 个会话` : r.reason, r.ok ? 'ok' : 'warn');
      if (r.ok) {
        U.closeDrawer();
        U.renderAll();
      }
    });
  A['x-import-card'] = () => U.openDrawer('lorebook');
  A['x-clone-conv'] = () => {
    const c = AI.currentConv();
    if (!c) return;
    const n = AI.clone(c);
    n.id = AI.uid();
    n.title = c.title + ' · 副本';
    n.createdAt = n.updatedAt = AI.now();
    AI.state.conversations.unshift(n);
    AI.state.currentId = n.id;
    AI.save(true);
    U.renderAll();
    U.toast('已克隆会话', 'ok');
  };
  A['x-merge-json'] = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = '.json,application/json';
    inp.onchange = () => {
      const f = inp.files[0];
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        const j = AI.safeJson(r.result, null);
        const cs = j && (j.conversations || (Array.isArray(j) ? j : [j]));
        if (!cs || !cs.length) {
          U.toast('文件里没有会话', 'warn');
          return;
        }
        cs.forEach(c => {
          if (c && c.nodes) {
            c.id = AI.uid();
            AI.state.conversations.unshift(c);
          }
        });
        AI.save(true);
        U.renderAll();
        U.toast(`已合并 ${cs.length} 个会话`, 'ok');
      };
      r.readAsText(f);
    };
    inp.click();
  };
  A['x-export'] = ({ ds }) => AI.exportAs(ds.v);

  /* ---------- Export formats ---------- */
  function downloadText(name, content, mime) {
    const blob = new Blob([content], { type: (mime || 'text/plain') + ';charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 800);
  }
  AI.exportAs = function (fmt) {
    const c = AI.currentConv();
    if (!c) return;
    const path = AI.pathOf(c),
      name = (c.title || 'chat').replace(/[\\/:*?"<>|]/g, '_');
    const q = s =>
      String(s || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;'); // Escape quotes inside attribute values as well
    if (fmt === 'logs') {
      const rows = [
        ['time', 'model', 'provider', 'ok', 'duration_ms', 'tokens_in', 'tokens_out', 'cost_usd', 'error']
      ].concat(
        (AI.state.requestLog || []).map(l => [
          new Date(l.at).toISOString(),
          l.model,
          l.provider,
          l.ok,
          l.duration,
          l.in,
          l.out,
          l.cost,
          l.error
        ])
      );
      downloadText(
        'request-log.csv',
        rows.map(r => r.map(x => `"${String(x == null ? '' : x).replace(/"/g, '""')}"`).join(',')).join('\n'),
        'text/csv'
      );
      return;
    }
    if (fmt === 'jsonl') {
      const lines = [];
      for (let i = 0; i < path.length - 1; i += 2) {
        if (path[i].role === 'user' && path[i + 1] && path[i + 1].role === 'assistant')
          lines.push(
            JSON.stringify({
              messages: [
                {
                  role: 'system',
                  content: (AI.state.assistants.find(a => a.id === c.assistantId) || {}).systemPrompt || ''
                },
                { role: 'user', content: path[i].content },
                { role: 'assistant', content: path[i + 1].content }
              ]
            })
          );
      }
      downloadText(name + '.jsonl', lines.join('\n'), 'application/jsonl');
      return;
    }
    if (fmt === 'csv') {
      const rows = [['index', 'role', 'model', 'content', 'created_at']].concat(
        path.map((n, i) => [i, n.role, n.model, n.content, new Date(n.createdAt).toISOString()])
      );
      downloadText(
        name + '.csv',
        rows.map(r => r.map(x => `"${String(x == null ? '' : x).replace(/"/g, '""')}"`).join(',')).join('\n'),
        'text/csv'
      );
      return;
    }
    if (fmt === 'txt') {
      downloadText(
        name + '.txt',
        path
          .map(n => `${n.role === 'user' ? '你' : 'AI'} (${new Date(n.createdAt).toLocaleString()})：\n${n.content}`)
          .join('\n\n────────\n\n'),
        'text/plain'
      );
      return;
    }
    if (fmt === 'html') {
      const body = path
        .map(
          n =>
            `<article class="m ${n.role}"><header>${n.role === 'user' ? '你' : 'AI'}${n.model ? ' · ' + q(n.model) : ''} · ${new Date(n.createdAt).toLocaleString()}</header><div class="b">${AI.Render.markdown(n.content)}</div>${(n.sources || []).length ? '<footer>' + n.sources.map(s => `<a href="${q(s.url)}">${q(s.title)}</a>`).join(' · ') + '</footer>' : ''}</article>`
        )
        .join('');
      const html = `<!doctype html><html lang="zh"><meta charset="utf-8"><title>${q(c.title)}</title><style>
      body{font:15px/1.7 -apple-system,"PingFang SC",sans-serif;max-width:820px;margin:40px auto;padding:0 20px;color:#1a1a1a;background:#fff}
      h1{font-size:22px;border-bottom:1px solid #e5e5e5;padding-bottom:12px}
      .m{margin:26px 0;padding:14px 18px;border:1px solid #e5e5e5;border-radius:10px}
      .m.user{background:#f7f7f8}header{font-size:12px;color:#777;margin-bottom:8px}
      pre{background:#f6f8fa;padding:12px;border-radius:8px;overflow:auto}code{font-family:monospace}
      table{border-collapse:collapse}td,th{border:1px solid #ddd;padding:5px 9px}
      footer{margin-top:10px;font-size:12px}a{color:#2563eb}
      img{max-width:100%}</style><h1>${q(c.title)}</h1><p style="color:#777;font-size:12px">导出于 ${new Date().toLocaleString()}</p>${body}`;
      downloadText(name + '.html', html, 'text/html');
      return;
    }
    if (fmt === 'md') {
      U.exportMarkdown(c);
      return;
    }
    if (fmt === 'config') {
      U.exportJson(true);
      return;
    }
    U.toast('未知导出格式：' + fmt, 'warn');
  };

  /* ============================================================
   Additional Inspector and form events (delegated to avoid duplicate binding)
   ============================================================ */
  document.addEventListener('change', e => {
    const cp = e.target.closest('[data-conv-param]');
    if (cp) {
      const c = AI.currentConv();
      if (!c) return;
      const v = cp.value.trim();
      const k = cp.dataset.convParam;
      if (v === '') delete c.params[k];
      else c.params[k] = cp.dataset.type === 'float' || cp.dataset.type === 'number' ? Number(v) : v;
      AI.save(true);
      U.updateCtxMeter();
      U.toast('会话参数已更新', 'ok');
      return;
    }
  });
  document.addEventListener('input', e => {
    const q = e.target.closest('#modelQuery');
    if (q) {
      AI.state.ui.modelQuery = q.value;
      clearTimeout(q._t);
      q._t = setTimeout(() => {
        const pos = q.selectionStart;
        U.renderDrawer();
        const n = document.getElementById('modelQuery');
        if (n) {
          n.focus();
          n.setSelectionRange(pos, pos);
        }
      }, 220);
    }
  });
  AI.on('inspector-click', d => {
    const k = d.key;
    if (k === 'model') U.showModelPicker(d.el);
    if (k === 'assistant') U.openDrawer('assistants');
    if (k === 'saveSystem') {
      AI.save(true);
      U.toast('系统提示已保存', 'ok');
      U.renderInspector();
    }
    if (k === 'saveConvSystem') {
      const el = document.getElementById('inspConvSystem'),
        c = AI.currentConv();
      if (el && c) {
        c.systemOverride = el.value;
        AI.save(true);
        U.toast('会话指令已保存', 'ok');
      }
    }
  });

  /* ---------- Extension commands and slash commands ---------- */
  AI.EXTRA_COMMANDS = [
    () => [
      { ico: AI.icon('palette'), label: '外观与布局设置', run: () => U.openDrawer('layout') },
      { ico: AI.icon('layers'), label: '模型库与能力元数据', run: () => U.openDrawer('modelslib') },
      { ico: AI.icon('book'), label: '世界书 / 角色卡', run: () => U.openDrawer('lorebook') },
      { ico: AI.icon('shield'), label: '工具与审批', run: () => U.openDrawer('tools') },
      { ico: AI.icon('sliders'), label: '快捷键设置', run: () => U.openDrawer('shortcuts') },
      { ico: AI.icon('chart'), label: '请求日志与费用', run: () => U.openDrawer('logs') },
      { ico: AI.icon('lock'), label: '隐私与数据', run: () => U.openDrawer('privacy') },
      { ico: AI.icon('compress'), label: '压缩上下文摘要', run: () => AI.compressContext() },
      {
        ico: AI.icon('fork'),
        label: '派生新会话（从最后一条）',
        run: () => {
          const c = AI.currentConv(),
            p = AI.pathOf(c);
          if (p.length) AI.forkFrom(c, p[p.length - 1].id);
        }
      },
      ...(AI.state.templates || []).map(t => ({
        ico: AI.icon('file'),
        label: '模板：' + t.name,
        hint: 'new chat',
        run: () => A['x-tpl-use']({ ds: { v: t.id } })
      }))
    ]
  ];
  AI.SLASH_COMMANDS = AI.SLASH_COMMANDS || {};
  function registerSlash() {
    (AI.state.customCommands || []).forEach(c => {
      AI.SLASH_COMMANDS[c.name] = arg => {
        const a = String(c.action || '');
        if (a.startsWith('open:')) U.openDrawer(a.slice(5));
        else if (a === 'new') AI.newChat();
        else if (a === 'clear') {
          AI.clearConv(AI.currentConv());
          U.renderAll();
        } else if (a === 'compress') AI.compressContext();
        else if (a === 'branch') U.branchTree();
        else if (a === 'race') U.raceDialog();
        else if (a === 'image') U.imageDialog();
        else if (a === 'theme') U.setMode(document.body.classList.contains('light') ? 'dark' : 'light');
        else if (a === 'inspector') U.setInspector(U.dom.inspector.hidden);
        else if (a === 'export') U.exportMarkdown();
        else if (a === 'model') U.showModelPicker(document.getElementById('btnModel'));
        else if (a === 'prompt') U.promptPicker(document.getElementById('btnPromptQuick'));
        else if (a === 'settings') U.openDrawer('general');
        else U.toast('自定义命令动作未知：' + a, 'warn');
      };
    });
  }
  registerSlash();

  /* ---------- Initialisation: PWA, custom JS, backup reminders and system prompt overrides ---------- */
  function initExtras() {
    // Custom JS runs only when explicitly enabled by the user
    const s = AI.state.settings;
    if (s.customJsEnabled && s.customJs && s.customJs.trim()) {
      try {
        new Function('AI', s.customJs)(AI);
      } catch (e) {
        U.toast('自定义 JS 执行失败：' + e.message, 'err');
      }
    }
    // PWA (HTTP(S) contexts only)
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    // Backup reminder
    if (s.backupReminderDays > 0 && Date.now() - (s.lastBackupAt || 0) > s.backupReminderDays * 86400000) {
      setTimeout(() => U.toast('距上次备份已超过 ' + s.backupReminderDays + ' 天，建议导出一份 JSON', 'warn'), 1600);
    }
    // Conversation-level system prompt override (virtual path used by tab_models)
    const c = AI.currentConv();
    const ta = document.querySelector('[data-bind="__conv_system"]');
    if (ta && c) ta.value = c.systemOverride || '';
    U.renderInspector();
  }
  document.addEventListener('change', ev => {
    const el = ev.target.closest('[data-bind="__conv_system"]');
    if (el) {
      const c = AI.currentConv();
      if (c) {
        c.systemOverride = el.value;
        AI.save(true);
      }
    }
  });
  // Synchronise virtual field values after a drawer redraw
  const origRenderDrawer = U.renderDrawer;
  U.renderDrawer = function () {
    origRenderDrawer.call(U);
    const c = AI.currentConv();
    const el = U.dom.drawerBody.querySelector('[data-bind="__conv_system"]');
    if (el && c) el.value = c.systemOverride || '';
    const ap = U.dom.drawerBody.querySelector('[data-bind="__approval_list"]');
    if (ap) ap.value = (AI.state.settings.approvalTools || []).join(', ');
    const ts = U.dom.drawerBody.querySelector('[data-bind="__toolset_list"]');
    if (ts) ts.value = (AI.state.settings.toolSet || []).join(', ');
  };
  // Prevent virtual fields from being written into state by generic binding
  // (intercept before setBound)
  const origSetBound = U.setBound;
  U.setBound = function (path, val, type) {
    if (String(path).startsWith('__')) return true;
    return origSetBound.call(U, path, val, type);
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initExtras);
  else setTimeout(initExtras, 0);
})();
