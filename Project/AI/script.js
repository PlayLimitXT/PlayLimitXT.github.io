/**
 * AI Chat Application - PLXT
 * @author PlayLimitXT
 * @version 2.0
 */

(function() {
  'use strict';

  // ==================== Internationalization ====================
  const i18n = {
    en: {
      // Header
      notSelected: 'Not Selected',
      import: 'Import',
      export: 'Export',
      
      // Settings
      settings: 'Settings',
      apiKey: 'API Key',
      apiEndpoint: 'API Endpoint',
      model: 'Model',
      temperature: 'Temperature',
      maxTokens: 'Max Tokens',
      systemPrompt: 'System Prompt',
      advanced: 'Advanced',
      topP: 'Top P',
      frequencyPenalty: 'Frequency Penalty',
      presencePenalty: 'Presence Penalty',
      
      // Conversations
      conversations: 'Conversations',
      new: 'New',
      newConversation: 'New Chat',
      untitledConversation: 'Untitled Conversation',
      
      // Chat
      startNewChat: 'Start a New Chat',
      emptyDesc: 'Enter your API Key and model in the sidebar, then type your question to begin.',
      send: 'Send',
      stop: 'Stop',
      newLine: 'New Line',
      newChat: 'New Chat',
      shortcutsHint: 'Ctrl+Enter to send | Ctrl+N new chat',
      
      // Input
      inputPlaceholder: 'Type your message... (Shift+Enter for new line)',
      
      // Status
      ready: 'Ready',
      generating: 'Generating...',
      completed: 'Completed',
      
      // Actions
      copy: 'Copy',
      copied: 'Copied',
      copyAll: 'Copy All',
      rename: 'Rename',
      clear: 'Clear',
      delete: 'Delete',
      cancel: 'Cancel',
      confirm: 'Confirm',
      
      // Messages
      you: 'You',
      ai: 'AI',
      noMessages: 'No messages to copy',
      copiedToClipboard: 'Copied to clipboard',
      copyFailed: 'Copy failed',
      conversationCleared: 'Conversation cleared',
      conversationDeleted: 'Conversation deleted',
      exportSuccess: 'Export successful',
      importSuccess: 'Import successful',
      importFailed: 'Import failed: invalid file format',
      
      // Errors
      apiKeyRequired: 'Please enter your API Key',
      modelRequired: 'Please enter a model name',
      
      // Modal
      deleteConfirm: 'Are you sure you want to delete this conversation? This action cannot be undone.',
      clearConfirm: 'Are you sure you want to clear all messages?',
      renameConversation: 'Rename Conversation',
      enterNewName: 'Enter new name',
      
      // Code
      code: 'code',
      
      // Stopped
      stopped: '[Stopped]'
    },
    zh: {
      // Header
      notSelected: '未选择',
      import: '导入',
      export: '导出',
      
      // Settings
      settings: '设置',
      apiKey: 'API Key',
      apiEndpoint: '接口地址',
      model: '模型',
      temperature: '温度',
      maxTokens: '最大令牌数',
      systemPrompt: '系统提示',
      advanced: '高级设置',
      topP: 'Top P',
      frequencyPenalty: '频率惩罚',
      presencePenalty: '存在惩罚',
      
      // Conversations
      conversations: '会话列表',
      new: '新建',
      newConversation: '新会话',
      untitledConversation: '未命名会话',
      
      // Chat
      startNewChat: '开始新对话',
      emptyDesc: '在左侧填写 API Key 和模型，然后输入您的问题开始对话。',
      send: '发送',
      stop: '停止',
      newLine: '换行',
      newChat: '新会话',
      shortcutsHint: 'Ctrl+Enter 发送 | Ctrl+N 新会话',
      
      // Input
      inputPlaceholder: '输入您的消息... (Shift+Enter 换行)',
      
      // Status
      ready: '就绪',
      generating: '生成中...',
      completed: '完成',
      
      // Actions
      copy: '复制',
      copied: '已复制',
      copyAll: '复制全部',
      rename: '重命名',
      clear: '清空',
      delete: '删除',
      cancel: '取消',
      confirm: '确认',
      
      // Messages
      you: '你',
      ai: 'AI',
      noMessages: '没有消息可复制',
      copiedToClipboard: '已复制到剪贴板',
      copyFailed: '复制失败',
      conversationCleared: '会话已清空',
      conversationDeleted: '会话已删除',
      exportSuccess: '导出成功',
      importSuccess: '导入成功',
      importFailed: '导入失败：文件格式错误',
      
      // Errors
      apiKeyRequired: '请先填写 API Key',
      modelRequired: '请输入模型名称',
      
      // Modal
      deleteConfirm: '确定要删除这个会话吗？此操作无法撤销。',
      clearConfirm: '确定要清空当前会话的所有消息吗？',
      renameConversation: '重命名会话',
      enterNewName: '输入新名称',
      
      // Code
      code: '代码',
      
      // Stopped
      stopped: '[已停止]'
    }
  };

  // ==================== Configuration ====================
  const CONFIG = {
    STORAGE_KEY: 'plxt-ai-chat-v3',
    DEFAULT_API_BASE: 'https://api.openai.com/v1',
    DEFAULT_MODEL: '',
    DEFAULT_TEMPERATURE: 0.7,
    DEFAULT_MAX_TOKENS: 4096
  };

  // ==================== State Management ====================
  const state = {
    lang: 'en',
    conversations: [],
    currentId: null,
    settings: {
      apiKey: '',
      apiBase: CONFIG.DEFAULT_API_BASE,
      model: CONFIG.DEFAULT_MODEL,
      temperature: CONFIG.DEFAULT_TEMPERATURE,
      maxTokens: CONFIG.DEFAULT_MAX_TOKENS,
      systemPrompt: 'You are a helpful assistant.',
      topP: 1,
      frequencyPenalty: 0,
      presencePenalty: 0
    },
    isStreaming: false,
    abortController: null,
    theme: 'dark',
    tokenCount: 0
  };

  // ==================== DOM Elements ====================
  const dom = {};

  // ==================== Initialize ====================
  function init() {
    cacheDom();
    loadState();
    initI18n();
    bindEvents();
    setupMarkdown();
    render();
    updateTheme();
  }

  function cacheDom() {
    // Settings
    dom.apiKeyInput = document.getElementById('apiKey');
    dom.toggleApiKey = document.getElementById('toggleApiKey');
    dom.apiBaseInput = document.getElementById('apiBase');
    dom.modelInput = document.getElementById('modelInput');
    dom.temperatureInput = document.getElementById('temperature');
    dom.tempValue = document.getElementById('tempValue');
    dom.maxTokensInput = document.getElementById('maxTokens');
    dom.systemPromptInput = document.getElementById('systemPrompt');
    dom.topPInput = document.getElementById('topP');
    dom.frequencyPenaltyInput = document.getElementById('frequencyPenalty');
    dom.presencePenaltyInput = document.getElementById('presencePenalty');
    dom.advancedToggle = document.getElementById('advancedToggle');
    dom.advancedSettings = document.getElementById('advancedSettings');

    // Conversations
    dom.convList = document.getElementById('convList');
    dom.newConvBtn = document.getElementById('newConvBtn');

    // Chat
    dom.chatTitle = document.getElementById('chatTitle');
    dom.messageCount = document.getElementById('messageCount');
    dom.messagesContainer = document.getElementById('messagesContainer');
    dom.emptyState = document.getElementById('emptyState');

    // Input
    dom.inputTextarea = document.getElementById('inputTextarea');
    dom.sendBtn = document.getElementById('sendBtn');
    dom.stopBtn = document.getElementById('stopBtn');
    dom.clearInputBtn = document.getElementById('clearInputBtn');
    dom.pasteBtn = document.getElementById('pasteBtn');

    // Actions
    dom.exportBtn = document.getElementById('exportBtn');
    dom.importBtn = document.getElementById('importBtn');
    dom.clearBtn = document.getElementById('clearBtn');
    dom.copyAllBtn = document.getElementById('copyAllBtn');
    dom.deleteConvBtn = document.getElementById('deleteConvBtn');
    dom.renameConvBtn = document.getElementById('renameConvBtn');
    dom.exportMarkdownBtn = document.getElementById('exportMarkdownBtn');
    dom.searchBtn = document.getElementById('searchBtn');
    dom.searchBar = document.getElementById('searchBar');
    dom.searchInput = document.getElementById('searchInput');
    dom.searchResults = document.getElementById('searchResults');
    dom.closeSearchBtn = document.getElementById('closeSearchBtn');

    // Language & Theme
    dom.langToggle = document.getElementById('langToggle');
    dom.langText = document.getElementById('langText');
    dom.themeToggle = document.getElementById('themeToggle');

    // Mobile
    dom.mobileMenuBtn = document.getElementById('mobileMenuBtn');
    dom.sidebar = document.getElementById('sidebar');
    dom.closeSidebarBtn = document.getElementById('closeSidebarBtn');

    // Status
    dom.statusText = document.getElementById('statusText');
    dom.statusDot = document.getElementById('statusDot');
    dom.modelBadge = document.getElementById('modelBadge');
    dom.tokenCount = document.getElementById('tokenCount');
    dom.tokenValue = document.getElementById('tokenValue');

    // Modal
    dom.modalOverlay = document.getElementById('modalOverlay');
    dom.modalTitle = document.getElementById('modalTitle');
    dom.modalBody = document.getElementById('modalBody');
    dom.modalConfirm = document.getElementById('modalConfirm');
    dom.modalCancel = document.getElementById('modalCancel');

    // Toast
    dom.toastContainer = document.getElementById('toastContainer');
  }

  // ==================== Internationalization ====================
  function initI18n() {
    applyI18n();
    updateLangButton();
  }

  function t(key) {
    return i18n[state.lang][key] || i18n['en'][key] || key;
  }

  function applyI18n() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (i18n[state.lang][key]) {
        el.textContent = i18n[state.lang][key];
      }
    });

    document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
      const key = el.getAttribute('data-i18n-placeholder');
      if (i18n[state.lang][key]) {
        el.placeholder = i18n[state.lang][key];
      }
    });

    // Update HTML lang attribute
    document.documentElement.lang = state.lang;
  }

  function toggleLanguage() {
    state.lang = state.lang === 'en' ? 'zh' : 'en';
    applyI18n();
    updateLangButton();
    render();
    saveState();
  }

  function updateLangButton() {
    dom.langText.textContent = state.lang.toUpperCase();
  }

  // ==================== Markdown Setup ====================
  function setupMarkdown() {
    if (typeof marked === 'undefined') {
      console.warn('marked.js not loaded');
      return;
    }

    try {
      // Use markedHighlight extension if available (for marked v5+)
      if (typeof markedHighlight !== 'undefined') {
        marked.use(markedHighlight({
          langPrefix: 'hljs language-',
          highlight(code, lang) {
            if (typeof hljs === 'undefined') return code;
            
            try {
              // Try specific language first
              if (lang && hljs.getLanguage(lang)) {
                return hljs.highlight(code, { language: lang }).value;
              }
              // Fallback to auto-detection
              return hljs.highlightAuto(code).value;
            } catch (e) {
              console.warn('Highlight error:', e);
              return code;
            }
          }
        }));
        console.log('Using markedHighlight extension');
      } else {
        // Fallback: try setOptions for older marked versions
        // Note: marked v5+ doesn't support highlight in setOptions
        try {
          marked.setOptions({
            gfm: true,
            breaks: true,
            langPrefix: 'hljs language-',
            highlight(code, lang) {
              if (typeof hljs === 'undefined') return code;
              
              try {
                if (lang && hljs.getLanguage(lang)) {
                  return hljs.highlight(code, { language: lang }).value;
                }
                return hljs.highlightAuto(code).value;
              } catch (e) {
                return code;
              }
            }
          });
          console.log('Using marked.setOptions fallback');
        } catch (e) {
          // marked v5+ without markedHighlight - just use basic options
          marked.setOptions({
            gfm: true,
            breaks: true
          });
          console.warn('Code highlighting disabled - markedHighlight not available');
        }
      }
    } catch (e) {
      console.error('Failed to setup markdown:', e);
    }
  }

  // ==================== State Persistence ====================
  function loadState() {
    try {
      const saved = localStorage.getItem(CONFIG.STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        state.lang = parsed.lang || 'en';
        state.theme = parsed.theme || 'dark';
        Object.assign(state.settings, parsed.settings || {});
        state.conversations = parsed.conversations || [];
        state.currentId = parsed.currentId;
      }
    } catch (e) {
      console.error('Failed to load state:', e);
    }

    if (state.conversations.length === 0) {
      createNewConversation();
    }

    if (!state.currentId || !getCurrentConversation()) {
      state.currentId = state.conversations[0].id;
    }

    applySettingsToInputs();
  }

  function saveState() {
    try {
      const data = {
        lang: state.lang,
        theme: state.theme,
        settings: state.settings,
        conversations: state.conversations,
        currentId: state.currentId
      };
      localStorage.setItem(CONFIG.STORAGE_KEY, JSON.stringify(data));
    } catch (e) {
      console.error('Failed to save state:', e);
      showToast(t('copyFailed'), 'error');
    }
  }

  function applySettingsToInputs() {
    dom.apiKeyInput.value = state.settings.apiKey || '';
    dom.apiBaseInput.value = state.settings.apiBase || CONFIG.DEFAULT_API_BASE;
    dom.modelInput.value = state.settings.model || '';
    dom.temperatureInput.value = state.settings.temperature || CONFIG.DEFAULT_TEMPERATURE;
    dom.tempValue.textContent = state.settings.temperature || CONFIG.DEFAULT_TEMPERATURE;
    dom.maxTokensInput.value = state.settings.maxTokens || '';
    dom.systemPromptInput.value = state.settings.systemPrompt || '';
    dom.topPInput.value = state.settings.topP || 1;
    dom.frequencyPenaltyInput.value = state.settings.frequencyPenalty || 0;
    dom.presencePenaltyInput.value = state.settings.presencePenalty || 0;
  }

  function updateSettingsFromInputs() {
    state.settings.apiKey = dom.apiKeyInput.value.trim();
    state.settings.apiBase = dom.apiBaseInput.value.trim() || CONFIG.DEFAULT_API_BASE;
    state.settings.model = dom.modelInput.value.trim();
    state.settings.temperature = parseFloat(dom.temperatureInput.value) || CONFIG.DEFAULT_TEMPERATURE;
    state.settings.maxTokens = parseInt(dom.maxTokensInput.value) || CONFIG.DEFAULT_MAX_TOKENS;
    state.settings.systemPrompt = dom.systemPromptInput.value.trim();
    state.settings.topP = parseFloat(dom.topPInput.value) || 1;
    state.settings.frequencyPenalty = parseFloat(dom.frequencyPenaltyInput.value) || 0;
    state.settings.presencePenalty = parseFloat(dom.presencePenaltyInput.value) || 0;

    updateModelBadge();
    saveState();
  }

  // ==================== Theme ====================
  function toggleTheme() {
    state.theme = state.theme === 'dark' ? 'light' : 'dark';
    updateTheme();
    saveState();
  }

  function updateTheme() {
    document.body.classList.toggle('light-theme', state.theme === 'light');
    const icon = dom.themeToggle.querySelector('i');
    icon.className = state.theme === 'dark' ? 'fa-solid fa-moon' : 'fa-solid fa-sun';
  }

  // ==================== Conversation Management ====================
  function createNewConversation(title = null) {
    const conv = {
      id: generateId(),
      title: title || t('newConversation'),
      messages: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    state.conversations.unshift(conv);
    state.currentId = conv.id;
    saveState();
    return conv;
  }

  function getCurrentConversation() {
    return state.conversations.find(c => c.id === state.currentId);
  }

  function selectConversation(id) {
    const conv = state.conversations.find(c => c.id === id);
    if (conv) {
      state.currentId = id;
      saveState();
      render();
      closeMobileSidebar();
    }
  }

  function deleteConversation(id) {
    const index = state.conversations.findIndex(c => c.id === id);
    if (index === -1) return;

    state.conversations.splice(index, 1);

    if (state.conversations.length === 0) {
      createNewConversation();
    } else if (state.currentId === id) {
      state.currentId = state.conversations[0].id;
    }

    saveState();
    render();
    showToast(t('conversationDeleted'), 'success');
  }

  function renameConversation(id, newTitle) {
    const conv = state.conversations.find(c => c.id === id);
    if (conv && newTitle.trim()) {
      conv.title = newTitle.trim();
      conv.updatedAt = Date.now();
      saveState();
      render();
    }
  }

  function clearCurrentConversation() {
    const conv = getCurrentConversation();
    if (conv) {
      conv.messages = [];
      conv.updatedAt = Date.now();
      saveState();
      render();
      showToast(t('conversationCleared'), 'success');
    }
  }

  // ==================== Message Handling ====================
  function addMessage(role, content) {
    const conv = getCurrentConversation();
    if (!conv) return;

    const message = {
      id: generateId(),
      role,
      content,
      timestamp: Date.now()
    };

    conv.messages.push(message);
    conv.updatedAt = Date.now();

    if (role === 'user' && conv.messages.filter(m => m.role === 'user').length === 1) {
      conv.title = content.substring(0, 30) + (content.length > 30 ? '...' : '');
    }

    saveState();
    return message;
  }

  function updateMessage(messageId, content) {
    const conv = getCurrentConversation();
    if (!conv) return;

    const message = conv.messages.find(m => m.id === messageId);
    if (message) {
      message.content = content;
      message.updatedAt = Date.now();
      saveState();
    }
  }

  // ==================== API Communication ====================
  async function sendMessage() {
    const text = dom.inputTextarea.value.trim();
    if (!text || state.isStreaming) return;

    if (!state.settings.apiKey) {
      showToast(t('apiKeyRequired'), 'error');
      return;
    }

    if (!state.settings.model) {
      showToast(t('modelRequired'), 'error');
      return;
    }

    dom.inputTextarea.value = '';
    dom.inputTextarea.style.height = 'auto';
    addMessage('user', text);
    renderMessages();

    await streamResponse();
  }

  async function streamResponse() {
    const conv = getCurrentConversation();
    if (!conv) return;

    state.isStreaming = true;
    updateStreamingUI(true);

    const assistantMessage = addMessage('assistant', '');
    renderMessages();

    const messages = buildMessages(conv);
    state.abortController = new AbortController();

    try {
      const response = await fetch(`${state.settings.apiBase.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.settings.apiKey}`
        },
        body: JSON.stringify({
          model: state.settings.model,
          messages,
          temperature: state.settings.temperature,
          max_tokens: state.settings.maxTokens,
          top_p: state.settings.topP,
          frequency_penalty: state.settings.frequencyPenalty,
          presence_penalty: state.settings.presencePenalty,
          stream: true
        }),
        signal: state.abortController.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`API Error (${response.status}): ${errorText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let assistantContent = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data: ')) {
            try {
              const json = JSON.parse(trimmed.slice(6));
              const delta = json.choices?.[0]?.delta?.content;
              if (delta) {
                assistantContent += delta;
                updateMessage(assistantMessage.id, assistantContent);
                renderMessages();
                scrollToBottom();
              }
            } catch (e) {}
          }
        }
      }

      showToast(t('completed'), 'success');
    } catch (error) {
      if (error.name === 'AbortError') {
        updateMessage(assistantMessage.id, assistantMessage.content + '\n\n' + t('stopped'));
        showToast(t('stopped'), 'success');
      } else {
        updateMessage(assistantMessage.id, `**Error:** ${error.message}`);
        showToast(error.message, 'error');
      }
      renderMessages();
    } finally {
      state.isStreaming = false;
      state.abortController = null;
      updateStreamingUI(false);
    }
  }

  function buildMessages(conv) {
    const messages = [];

    if (state.settings.systemPrompt) {
      messages.push({ role: 'system', content: state.settings.systemPrompt });
    }

    for (const msg of conv.messages) {
      if (msg.role !== 'assistant' || msg.content) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    return messages;
  }

  function stopStreaming() {
    if (state.abortController) {
      state.abortController.abort();
    }
  }

  // ==================== Rendering ====================
  function render() {
    renderConversationList();
    renderMessages();
    updateModelBadge();
  }

  function renderConversationList() {
    dom.convList.innerHTML = state.conversations.map(c => `
      <div class="conv-item ${c.id === state.currentId ? 'active' : ''}" data-id="${c.id}">
        <div class="conv-info">
          <div class="conv-icon">
            <i class="fa-solid fa-message"></i>
          </div>
          <span class="conv-name">${escapeHtml(c.title)}</span>
        </div>
        <div class="conv-actions">
          <button class="conv-action-btn rename" title="${t('rename')}" data-action="rename">
            <i class="fa-solid fa-pen"></i>
          </button>
          <button class="conv-action-btn delete" title="${t('delete')}" data-action="delete">
            <i class="fa-solid fa-trash"></i>
          </button>
        </div>
      </div>
    `).join('');
  }

  function renderMessages() {
    const conv = getCurrentConversation();
    if (!conv) return;

    dom.chatTitle.textContent = conv.title;
    dom.messageCount.textContent = conv.messages.length > 0 ? `(${conv.messages.length})` : '';

    if (conv.messages.length === 0) {
      dom.emptyState.style.display = 'flex';
      dom.messagesContainer.innerHTML = '';
      dom.messagesContainer.appendChild(dom.emptyState);
      return;
    }

    dom.emptyState.style.display = 'none';

    dom.messagesContainer.innerHTML = conv.messages.map(msg => {
      const time = formatTime(msg.timestamp);
      const content = renderMarkdown(msg.content);

      return `
        <div class="message ${msg.role}" data-id="${msg.id}">
          <div class="message-avatar">
            <i class="fa-solid ${msg.role === 'user' ? 'fa-user' : 'fa-robot'}"></i>
          </div>
          <div class="message-content">
            <div class="message-header">
              <span class="message-sender">${msg.role === 'user' ? t('you') : 'AI'}</span>
              <span class="message-time">${time}</span>
              <div class="message-actions">
                <button class="msg-action-btn copy-msg" title="${t('copy')}">
                  <i class="fa-solid fa-copy"></i>
                </button>
              </div>
            </div>
            <div class="message-body">${content}</div>
          </div>
        </div>
      `;
    }).join('');

    // Render LaTeX
    renderMath();
    
    // Add copy buttons to code blocks
    addCodeCopyButtons();
    
    // Add message copy buttons
    addMessageCopyButtons();
    
    scrollToBottom();
  }

  function renderMarkdown(content) {
    if (typeof marked === 'undefined') {
      return escapeHtml(content).replace(/\n/g, '<br>');
    }

    // Handle empty or whitespace-only content
    if (!content || !content.trim()) {
      return '';
    }

    let html;
    try {
      html = marked.parse(content);
    } catch (e) {
      console.error('Markdown parse error:', e);
      return escapeHtml(content).replace(/\n/g, '<br>');
    }

    // Process code blocks with header
    // Match various formats of code blocks generated by marked + highlight.js
    // Formats: <pre><code>, <pre><code class="language-xxx">, <pre><code class="hljs language-xxx">
    html = html.replace(/<pre><code(?:\s+class="([^"]*)")?>/g, (match, classAttr) => {
      // Extract language from class attribute
      let lang = '';
      if (classAttr) {
        // Try to match "hljs language-xxx" or "language-xxx" pattern
        // Support special chars like +, # in language names (c++, c#)
        const langMatch = classAttr.match(/(?:hljs\s+)?language-([\w#+.-]+)/);
        if (langMatch) {
          lang = langMatch[1];
        }
      }
      const langDisplay = lang || t('code');
      const langClass = lang ? `hljs language-${lang}` : 'hljs';
      return `<div class="code-block">
        <div class="code-header">
          <span class="code-lang">${escapeHtml(langDisplay)}</span>
          <button class="code-copy">${t('copy')}</button>
        </div>
        <pre><code class="${langClass}">`;
    });

    // Close code block divs - use regex for reliability
    // Each code-block div needs a closing </div> after </code></pre>
    html = html.replace(/(<div class="code-block">[\s\S]*?)<\/code><\/pre>/g, '$1</code></pre></div>');

    // Handle unclosed code blocks (edge case during streaming)
    // Check if there are any code-block divs without matching closing tags
    const openCount = (html.match(/<div class="code-block">/g) || []).length;
    const closeCount = (html.match(/<\/code><\/pre><\/div>/g) || []).length;
    if (openCount > closeCount) {
      // Add closing tags for incomplete code blocks
      for (let i = 0; i < openCount - closeCount; i++) {
        html += '</code></pre></div>';
      }
    }

    // Style tables
    html = html.replace(/<table>/g, '<div class="table-wrapper"><table>');
    html = html.replace(/<\/table>/g, '</table></div>');

    return html;
  }

  function renderMath() {
    if (typeof renderMathInElement === 'undefined') return;
    
    try {
      renderMathInElement(dom.messagesContainer, {
        delimiters: [
          {left: '$$', right: '$$', display: true},
          {left: '$', right: '$', display: false},
          {left: '\\[', right: '\\]', display: true},
          {left: '\\(', right: '\\)', display: false}
        ],
        throwOnError: false,
        // Ignore code blocks and pre elements to prevent false positives
        ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'],
        ignoredClasses: ['code-block', 'code-header', 'hljs']
      });
    } catch (e) {
      console.error('KaTeX render error:', e);
    }
  }

  function addCodeCopyButtons() {
    document.querySelectorAll('.code-copy').forEach(btn => {
      btn.addEventListener('click', async () => {
        const codeBlock = btn.closest('.code-block');
        const code = codeBlock.querySelector('code').innerText;

        try {
          await navigator.clipboard.writeText(code);
          btn.textContent = t('copied');
          btn.classList.add('copied');
          setTimeout(() => {
            btn.textContent = t('copy');
            btn.classList.remove('copied');
          }, 2000);
        } catch (e) {
          showToast(t('copyFailed'), 'error');
        }
      });
    });
  }

  function addMessageCopyButtons() {
    document.querySelectorAll('.copy-msg').forEach(btn => {
      btn.addEventListener('click', async () => {
        const message = btn.closest('.message');
        const content = message.querySelector('.message-body').innerText;

        try {
          await navigator.clipboard.writeText(content);
          showToast(t('copiedToClipboard'), 'success');
        } catch (e) {
          showToast(t('copyFailed'), 'error');
        }
      });
    });
  }

  function updateStreamingUI(isStreaming) {
    dom.sendBtn.disabled = isStreaming;
    dom.sendBtn.style.display = isStreaming ? 'none' : 'flex';
    dom.stopBtn.style.display = isStreaming ? 'flex' : 'none';

    if (isStreaming) {
      setStatus(t('generating'), 'loading');
    } else {
      setStatus(t('ready'), 'ready');
    }
  }

  function updateModelBadge() {
    const model = state.settings.model;
    if (model) {
      dom.modelBadge.textContent = model.length > 15 ? model.substring(0, 15) + '...' : model;
    } else {
      dom.modelBadge.textContent = t('notSelected');
    }
  }

  // ==================== UI Helpers ====================
  function scrollToBottom() {
    dom.messagesContainer.scrollTop = dom.messagesContainer.scrollHeight;
  }

  function setStatus(text, type) {
    dom.statusText.textContent = text;
    dom.statusDot.className = 'status-dot ' + type;
  }

  function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <i class="fa-solid ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i>
      <span>${escapeHtml(message)}</span>
    `;

    dom.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  function showModal(title, body, onConfirm) {
    dom.modalTitle.textContent = title;
    dom.modalBody.innerHTML = body;
    dom.modalOverlay.classList.add('active');

    const handleConfirm = () => {
      hideModal();
      onConfirm();
    };

    dom.modalConfirm.onclick = handleConfirm;
    dom.modalCancel.onclick = hideModal;

    function hideModal() {
      dom.modalOverlay.classList.remove('active');
      dom.modalConfirm.onclick = null;
      dom.modalCancel.onclick = null;
    }
  }

  function closeMobileSidebar() {
    dom.sidebar.classList.remove('mobile-open');
  }

  // ==================== Search ====================
  function toggleSearch() {
    const isVisible = dom.searchBar.style.display === 'flex';
    dom.searchBar.style.display = isVisible ? 'none' : 'flex';
    if (!isVisible) {
      dom.searchInput.focus();
    } else {
      dom.searchInput.value = '';
      dom.searchResults.textContent = '';
      renderMessages();
    }
  }

  function searchMessages(query) {
    if (!query.trim()) {
      dom.searchResults.textContent = '';
      renderMessages();
      return;
    }

    const conv = getCurrentConversation();
    if (!conv) return;

    let count = 0;
    const lowerQuery = query.toLowerCase();

    document.querySelectorAll('.message').forEach(msgEl => {
      const content = msgEl.querySelector('.message-body').innerText.toLowerCase();
      const isMatch = content.includes(lowerQuery);
      msgEl.classList.toggle('search-highlight', isMatch);
      msgEl.classList.toggle('search-dim', !isMatch);
      if (isMatch) count++;
    });

    dom.searchResults.textContent = `${count} ${state.lang === 'en' ? 'results' : '个结果'}`;
  }

  // ==================== Import/Export ====================
  function exportData() {
    const data = {
      version: '3.0',
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      conversations: state.conversations
    };

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-chat-export-${formatDate(Date.now())}.json`;
    a.click();
    URL.revokeObjectURL(url);

    showToast(t('exportSuccess'), 'success');
  }

  function importData(file) {
    const reader = new FileReader();

    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);

        if (data.settings) {
          Object.assign(state.settings, data.settings);
        }

        if (data.conversations && Array.isArray(data.conversations)) {
          state.conversations = data.conversations;
        }

        if (!state.currentId && state.conversations.length > 0) {
          state.currentId = state.conversations[0].id;
        }

        applySettingsToInputs();
        saveState();
        render();

        showToast(t('importSuccess'), 'success');
      } catch (error) {
        showToast(t('importFailed'), 'error');
      }
    };

    reader.readAsText(file);
  }

  function exportAsMarkdown() {
    const conv = getCurrentConversation();
    if (!conv || conv.messages.length === 0) {
      showToast(t('noMessages'), 'error');
      return;
    }

    let md = `# ${conv.title}\n\n`;
    md += `> Exported from PLXT AI Chat on ${new Date().toLocaleString()}\n\n---\n\n`;

    conv.messages.forEach(msg => {
      const role = msg.role === 'user' ? t('you') : 'AI';
      md += `### ${role}\n\n${msg.content}\n\n---\n\n`;
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${conv.title.replace(/[^a-zA-Z0-9\u4e00-\u9fa5]/g, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);

    showToast(t('exportSuccess'), 'success');
  }

  function copyAllMessages() {
    const conv = getCurrentConversation();
    if (!conv || conv.messages.length === 0) {
      showToast(t('noMessages'), 'error');
      return;
    }

    const text = conv.messages.map(m => {
      const role = m.role === 'user' ? t('you') : 'AI';
      return `【${role}】\n${m.content}`;
    }).join('\n\n---\n\n');

    navigator.clipboard.writeText(text)
      .then(() => showToast(t('copiedToClipboard'), 'success'))
      .catch(() => showToast(t('copyFailed'), 'error'));
  }

  // ==================== Event Bindings ====================
  function bindEvents() {
    // Send message
    dom.sendBtn.addEventListener('click', sendMessage);
    dom.stopBtn.addEventListener('click', stopStreaming);

    dom.inputTextarea.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    // Auto-resize textarea
    dom.inputTextarea.addEventListener('input', () => {
      dom.inputTextarea.style.height = 'auto';
      dom.inputTextarea.style.height = Math.min(dom.inputTextarea.scrollHeight, 200) + 'px';
    });

    // Input actions
    dom.clearInputBtn.addEventListener('click', () => {
      dom.inputTextarea.value = '';
      dom.inputTextarea.style.height = 'auto';
      dom.inputTextarea.focus();
    });

    dom.pasteBtn.addEventListener('click', async () => {
      try {
        const text = await navigator.clipboard.readText();
        dom.inputTextarea.value += text;
        dom.inputTextarea.focus();
      } catch (e) {}
    });

    // API Key toggle
    dom.toggleApiKey.addEventListener('click', () => {
      const isPassword = dom.apiKeyInput.type === 'password';
      dom.apiKeyInput.type = isPassword ? 'text' : 'password';
      dom.toggleApiKey.querySelector('i').className = isPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye';
    });

    // Temperature slider
    dom.temperatureInput.addEventListener('input', () => {
      dom.tempValue.textContent = dom.temperatureInput.value;
    });

    // Advanced settings toggle
    dom.advancedToggle.addEventListener('click', () => {
      const isVisible = dom.advancedSettings.style.display === 'block';
      dom.advancedSettings.style.display = isVisible ? 'none' : 'block';
      dom.advancedToggle.querySelector('.toggle-icon').style.transform = isVisible ? '' : 'rotate(180deg)';
    });

    // Settings
    const settingInputs = [
      dom.apiKeyInput, dom.apiBaseInput, dom.modelInput, dom.temperatureInput,
      dom.maxTokensInput, dom.systemPromptInput, dom.topPInput, 
      dom.frequencyPenaltyInput, dom.presencePenaltyInput
    ];

    settingInputs.forEach(input => {
      if (input) {
        input.addEventListener('change', updateSettingsFromInputs);
        input.addEventListener('blur', updateSettingsFromInputs);
      }
    });

    // Language toggle
    dom.langToggle.addEventListener('click', toggleLanguage);

    // Theme toggle
    dom.themeToggle.addEventListener('click', toggleTheme);

    // New conversation
    dom.newConvBtn.addEventListener('click', () => {
      createNewConversation();
      render();
      closeMobileSidebar();
    });

    // Conversation list actions
    dom.convList.addEventListener('click', (e) => {
      const convItem = e.target.closest('.conv-item');
      if (!convItem) return;

      const id = convItem.dataset.id;
      const action = e.target.closest('[data-action]')?.dataset.action;

      if (action === 'delete') {
        showModal(t('delete'), `<p>${t('deleteConfirm')}</p>`, () => {
          deleteConversation(id);
        });
      } else if (action === 'rename') {
        const conv = state.conversations.find(c => c.id === id);
        if (conv) {
          showModal(t('renameConversation'), `
            <input type="text" id="renameInput" class="settings-input" 
                   value="${escapeHtml(conv.title)}" placeholder="${t('enterNewName')}">
          `, () => {
            const input = document.getElementById('renameInput');
            if (input) {
              renameConversation(id, input.value);
            }
          });

          setTimeout(() => {
            const input = document.getElementById('renameInput');
            if (input) {
              input.focus();
              input.select();
            }
          }, 100);
        }
      } else {
        selectConversation(id);
      }
    });

    // Export/Import
    dom.exportBtn.addEventListener('click', exportData);

    dom.importBtn.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) importData(file);
      };
      input.click();
    });

    dom.exportMarkdownBtn.addEventListener('click', exportAsMarkdown);

    // Clear current conversation
    dom.clearBtn.addEventListener('click', () => {
      showModal(t('clear'), `<p>${t('clearConfirm')}</p>`, clearCurrentConversation);
    });

    // Copy all messages
    dom.copyAllBtn.addEventListener('click', copyAllMessages);

    // Delete current conversation
    dom.deleteConvBtn.addEventListener('click', () => {
      showModal(t('delete'), `<p>${t('deleteConfirm')}</p>`, () => {
        deleteConversation(state.currentId);
      });
    });

    // Rename current conversation
    dom.renameConvBtn.addEventListener('click', () => {
      const conv = getCurrentConversation();
      if (conv) {
        showModal(t('renameConversation'), `
          <input type="text" id="renameInput" class="settings-input" 
                 value="${escapeHtml(conv.title)}" placeholder="${t('enterNewName')}">
        `, () => {
          const input = document.getElementById('renameInput');
          if (input) {
            renameConversation(state.currentId, input.value);
          }
        });

        setTimeout(() => {
          const input = document.getElementById('renameInput');
          if (input) {
            input.focus();
            input.select();
          }
        }, 100);
      }
    });

    // Search
    dom.searchBtn.addEventListener('click', toggleSearch);
    dom.closeSearchBtn.addEventListener('click', toggleSearch);
    dom.searchInput.addEventListener('input', (e) => searchMessages(e.target.value));

    // Mobile menu
    if (dom.mobileMenuBtn) {
      dom.mobileMenuBtn.addEventListener('click', () => {
        dom.sidebar.classList.add('mobile-open');
      });
    }

    if (dom.closeSidebarBtn) {
      dom.closeSidebarBtn.addEventListener('click', closeMobileSidebar);
    }

    // Close modal on overlay click
    dom.modalOverlay.addEventListener('click', (e) => {
      if (e.target === dom.modalOverlay) {
        dom.modalOverlay.classList.remove('active');
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        dom.modalOverlay.classList.remove('active');
        closeMobileSidebar();
        if (dom.searchBar.style.display === 'flex') {
          toggleSearch();
        }
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        createNewConversation();
        render();
      }

      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        sendMessage();
      }

      // Ctrl+F for search
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        toggleSearch();
      }
    });
  }

  // ==================== Utility Functions ====================
  function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2, 9);
  }

  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString(state.lang === 'zh' ? 'zh-CN' : 'en-US', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  }

  function formatDate(timestamp) {
    const date = new Date(timestamp);
    return date.toISOString().split('T')[0];
  }

  // ==================== Initialize on DOM Ready ====================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
