/**
 * Gemini Mermaid Renderer - Popup Script
 */

document.addEventListener('DOMContentLoaded', async () => {
    const enabledToggle = document.getElementById('enabled');
    const autoRenderToggle = document.getElementById('autoRender');
    const renderCount = document.getElementById('renderCount');
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    // 加载保存的设置
    async function loadSettings() {
        try {
            const result = await chrome.storage.sync.get(['enabled', 'autoRender']);
            enabledToggle.checked = result.enabled !== false;
            autoRenderToggle.checked = result.autoRender !== false;
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    }

    // 保存设置
    async function saveSettings() {
        try {
            await chrome.storage.sync.set({
                enabled: enabledToggle.checked,
                autoRender: autoRenderToggle.checked
            });
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    // 检查当前标签页
    async function checkCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            const isGeminiPage = tab?.url?.includes('gemini.google.com');

            if (isGeminiPage) {
                statusDot.classList.add('active');
                statusText.textContent = '已在 Gemini 页面激活';

                // 尝试获取渲染计数
                try {
                    const response = await chrome.tabs.sendMessage(tab.id, { action: 'getRenderCount' });
                    if (response?.count !== undefined) {
                        renderCount.textContent = response.count;
                    }
                } catch (e) {
                    // Content script 可能未加载
                    renderCount.textContent = '0';
                }
            } else {
                statusDot.classList.remove('active');
                statusText.textContent = '请在 Gemini 页面使用';
                renderCount.textContent = '-';
            }
        } catch (error) {
            console.error('Failed to check tab:', error);
            statusDot.classList.remove('active');
            statusText.textContent = '状态未知';
        }
    }

    // 事件监听
    enabledToggle.addEventListener('change', saveSettings);
    autoRenderToggle.addEventListener('change', saveSettings);

    // 初始化
    await loadSettings();
    await checkCurrentTab();
});
