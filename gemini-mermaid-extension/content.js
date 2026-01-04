/**
 * Gemini Mermaid Renderer - Content Script
 * 通过 background service worker 渲染 Mermaid 图表
 */

(function () {
  'use strict';

  // 配置
  const CONFIG = {
    enabled: true,
    autoRender: true,
    debounceDelay: 500
  };

  // 已处理的代码块缓存
  const processedBlocks = new WeakSet();
  let renderCounter = 0;

  // 检测 Mermaid 代码块
  function isMermaidCode(text) {
    const trimmed = text.trim();
    const mermaidKeywords = [
      'graph ', 'graph\n',
      'flowchart ', 'flowchart\n',
      'sequenceDiagram',
      'classDiagram',
      'stateDiagram',
      'erDiagram',
      'journey',
      'gantt',
      'pie ', 'pie\n',
      'mindmap',
      'timeline',
      'gitGraph',
      'C4Context',
      'quadrantChart',
      'requirementDiagram',
      'sankey-beta',
      'xychart-beta',
      'radarChart',
      'block-beta',
      'packet-beta',
      'kanban',
      'architecture-beta'
    ];

    return mermaidKeywords.some(keyword =>
      trimmed.startsWith(keyword) || trimmed.toLowerCase().startsWith(keyword.toLowerCase())
    );
  }

  // 创建渲染容器
  function createRenderContainer(originalCode, renderId) {
    const container = document.createElement('div');
    container.className = 'mermaid-rendered-container';
    container.dataset.renderId = renderId;

    // 工具栏
    const toolbar = document.createElement('div');
    toolbar.className = 'mermaid-toolbar';

    // 切换代码/图表按钮
    const toggleBtn = document.createElement('button');
    toggleBtn.className = 'mermaid-btn';
    toggleBtn.textContent = '📝 代码';
    toggleBtn.title = '查看原始代码';

    // 全屏按钮
    const fullscreenBtn = document.createElement('button');
    fullscreenBtn.className = 'mermaid-btn';
    fullscreenBtn.textContent = '⛶ 全屏';
    fullscreenBtn.title = '全屏查看';

    // 导出 SVG 按钮 (只保留 SVG)
    const exportSvgBtn = document.createElement('button');
    exportSvgBtn.className = 'mermaid-btn';
    exportSvgBtn.textContent = '⬇️ 导出 SVG';
    exportSvgBtn.title = '导出为矢量图 (SVG)';

    toolbar.appendChild(toggleBtn);
    toolbar.appendChild(fullscreenBtn);
    toolbar.appendChild(exportSvgBtn);

    // 图表容器
    const diagramContainer = document.createElement('div');
    diagramContainer.className = 'mermaid-diagram';

    // 代码视图
    const codeView = document.createElement('div');
    codeView.className = 'mermaid-code-view';
    const codePre = document.createElement('pre');
    codePre.textContent = originalCode;
    codeView.appendChild(codePre);

    container.appendChild(toolbar);
    container.appendChild(diagramContainer);
    container.appendChild(codeView);

    // 事件绑定
    toggleBtn.addEventListener('click', () => {
      const isCodeVisible = codeView.classList.toggle('visible');
      toggleBtn.textContent = isCodeVisible ? '📊 图表' : '📝 代码';
      toggleBtn.classList.toggle('active', isCodeVisible);
      diagramContainer.style.display = isCodeVisible ? 'none' : 'block';
    });

    fullscreenBtn.addEventListener('click', () => {
      container.classList.toggle('mermaid-fullscreen');
      fullscreenBtn.textContent = container.classList.contains('mermaid-fullscreen')
        ? '✕ 退出' : '⛶ 全屏';
    });

    exportSvgBtn.addEventListener('click', () => {
      exportSvgBtn.textContent = '⏳ ...';
      const iframe = container.querySelector('iframe');
      if (iframe) iframe.contentWindow.postMessage({ type: 'export-svg' }, '*');
    });

    // ESC 退出全屏
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && container.classList.contains('mermaid-fullscreen')) {
        container.classList.remove('mermaid-fullscreen');
        fullscreenBtn.textContent = '⛶ 全屏';
      }
    });

    return { container, diagramContainer };
  }

  // 显示提示
  function showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'mermaid-toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }

  // 使用扩展内部的 renderer.html 渲染图表
  function renderMermaid(code, container) {
    // Base64 编码 Mermaid 代码 (Standard Base64 for local renderer)
    function toBase64(str) {
      return btoa(unescape(encodeURIComponent(str)));
    }

    const encodedCode = toBase64(code);
    // 必须进行 URL 编码，否则 Base64 中的 + 会被解析为空格，导致 atob 失败
    const rendererUrl = chrome.runtime.getURL('renderer.html') + '?code=' + encodeURIComponent(encodedCode);

    const iframe = document.createElement('iframe');
    iframe.style.width = '100%';
    iframe.style.minHeight = '100px';
    iframe.style.border = 'none';
    iframe.style.background = 'transparent';
    iframe.setAttribute('title', 'Mermaid Diagram');

    // 监听 iframe 消息
    const messageHandler = (event) => {
      // 只处理来自我们 iframe 的消息
      if (event.source !== iframe.contentWindow) return;

      if (event.data?.type === 'mermaid-rendered') {
        iframe.style.height = (event.data.height + 20) + 'px';
        console.log('[Gemini Mermaid] Diagram rendered successfully');
      } else if (event.data?.type === 'mermaid-error') {
        console.error('[Gemini Mermaid] Render error:', event.data.error);
        // 如果出错，可以显示一条友好的错误信息，或者尝试调整高度
        iframe.style.height = '100px';
      } else if (event.data?.type === 'export-data') {
        // 处理导出数据
        downloadImage(event.data.data, event.data.format);

        // 恢复按钮状态
        const btn = container.querySelector('button[title="导出为矢量图 (SVG)"]');
        if (btn) btn.textContent = '⬇️ 导出 SVG';

        showToast(`已导出 ${event.data.format.toUpperCase()}`);
      }
    };

    window.addEventListener('message', messageHandler);

    container.innerHTML = '';
    container.appendChild(iframe);
    iframe.src = rendererUrl;
  }

  // 触发下载
  function downloadImage(dataContent, format) {
    let url;
    if (format === 'svg') {
      // 此时 dataContent 是 SVG 源码字符串，我们需要在 content script 上下文中创建 Blob URL
      const blob = new Blob([dataContent], { type: 'image/svg+xml;charset=utf-8' });
      url = URL.createObjectURL(blob);
    } else {
      url = dataContent;
    }

    const link = document.createElement('a');
    link.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    link.download = `gemini-mermaid-${timestamp}.${format}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    // 释放 URL
    if (url.startsWith('blob:')) {
      setTimeout(() => URL.revokeObjectURL(url), 100);
    }
  }

  // 处理代码块
  function processCodeBlock(codeBlock) {
    if (processedBlocks.has(codeBlock)) return;

    // 获取代码内容
    const codeElement = codeBlock.querySelector('code') || codeBlock;
    let codeText = codeElement.textContent || codeElement.innerText || '';

    // 检查是否是 Mermaid 代码
    const langClass = codeElement.className || '';
    const isMermaidLang = langClass.includes('mermaid') ||
      langClass.includes('language-mermaid');
    const isMermaidContent = isMermaidCode(codeText);

    if (!isMermaidLang && !isMermaidContent) return;

    console.log('[Gemini Mermaid] Found Mermaid code block');
    processedBlocks.add(codeBlock);

    // 创建渲染容器
    const renderId = `render-${++renderCounter}`;
    const { container, diagramContainer } = createRenderContainer(codeText, renderId);

    // 显示加载状态
    diagramContainer.innerHTML = '<div class="mermaid-loading">正在渲染图表...</div>';

    // 插入容器并隐藏原始代码块
    const parentPre = codeBlock.closest('pre') || codeBlock;
    parentPre.style.display = 'none';
    parentPre.insertAdjacentElement('afterend', container);

    // 渲染图表
    renderMermaid(codeText, diagramContainer);
  }

  // 扫描页面中的代码块
  function scanForMermaidBlocks() {
    if (!CONFIG.enabled || !CONFIG.autoRender) return;

    const selectors = [
      'pre code',
      'code-block code',
      '.code-block code',
      '[class*="code"] code',
      'pre[class*="language-"]',
      '.markdown-body pre code',
      'message-content pre code',
      '.response-content pre code',
      '[data-message-id] pre code'
    ];

    selectors.forEach(selector => {
      try {
        const blocks = document.querySelectorAll(selector);
        blocks.forEach(block => processCodeBlock(block));
      } catch (e) {
        // 忽略无效选择器
      }
    });
  }

  // 防抖函数
  function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  // 设置 MutationObserver
  function setupObserver() {
    const debouncedScan = debounce(scanForMermaidBlocks, CONFIG.debounceDelay);

    const observer = new MutationObserver((mutations) => {
      let shouldScan = false;

      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              if (node.tagName === 'PRE' ||
                node.tagName === 'CODE' ||
                node.querySelector?.('pre, code')) {
                shouldScan = true;
                break;
              }
            }
          }
        }
        if (shouldScan) break;
      }

      if (shouldScan) {
        debouncedScan();
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    console.log('[Gemini Mermaid] Observer started');
  }

  // 加载配置
  function loadConfig() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.get(['enabled', 'autoRender'], (result) => {
        if (result.enabled !== undefined) CONFIG.enabled = result.enabled;
        if (result.autoRender !== undefined) CONFIG.autoRender = result.autoRender;
        console.log('[Gemini Mermaid] Config loaded:', CONFIG);
      });
    }
  }

  // 监听配置变化
  function listenForConfigChanges() {
    if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (namespace === 'sync') {
          if (changes.enabled) CONFIG.enabled = changes.enabled.newValue;
          if (changes.autoRender) CONFIG.autoRender = changes.autoRender.newValue;

          if (CONFIG.enabled && CONFIG.autoRender) {
            scanForMermaidBlocks();
          }
        }
      });
    }
  }

  // 初始化
  function init() {
    console.log('[Gemini Mermaid] Initializing (using background service worker)...');

    loadConfig();
    listenForConfigChanges();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setupObserver();
        scanForMermaidBlocks();
      });
    } else {
      setupObserver();
      scanForMermaidBlocks();
    }
  }

  // 启动
  init();
})();
