
// 从 URL 参数获取 Mermaid 代码
const urlParams = new URLSearchParams(window.location.search);
const encodedCode = urlParams.get('code');
const container = document.getElementById('mermaid-container');

if (!encodedCode) {
    container.innerHTML = '<div class="error">没有提供 Mermaid 代码</div>';
} else {
    let code;
    try {
        // 对应 content.js 中的 btoa(unescape(encodeURIComponent(str)))
        code = decodeURIComponent(escape(atob(encodedCode)));
    } catch (e) {
        container.innerHTML = '<div class="error">代码解码失败: ' + e.message + '</div>';
    }

    if (code) {
        container.innerHTML = '<div class="loading">正在渲染图表...</div>';

        // 等待 mermaid 加载且容器可见 (有宽度)
        const checkMermaid = setInterval(() => {
            if (typeof mermaid !== 'undefined' && container.clientWidth > 0) {
                clearInterval(checkMermaid);
                // 稍微延迟一点确保布局稳定
                setTimeout(() => initAndRender(code), 100);
            }
        }, 100);

        // 5秒超时
        setTimeout(() => {
            clearInterval(checkMermaid);
            if (typeof mermaid === 'undefined') {
                container.innerHTML = '<div class="error">Mermaid 库加载超时，请检查扩展文件是否完整</div>';
            }
        }, 5000);
    }
}

// ... (imports or setups if any)

function initAndRender(code) {
    try {
        // 不强制宽度，让 Mermaid 自然渲染
        // 如果图太大，容器会自动滚动

        mermaid.initialize({
            theme: 'default',
            themeVariables: {
                primaryColor: '#e0f2fe',
                primaryTextColor: '#1e293b',
                primaryBorderColor: '#3b82f6',
                lineColor: '#64748b',
                secondaryColor: '#f0f9ff',
                tertiaryColor: '#ffffff',
                mainBkg: '#ffffff',
                // Gantt
                taskBkgColor: '#e0f2fe',
                taskBorderColor: '#3b82f6',
                taskTextColor: '#1e293b',
                activeTaskBkgColor: '#eff6ff',
                activeTaskBorderColor: '#3b82f6',
                doneTaskBkgColor: '#f8fafc',
                doneTaskBorderColor: '#cbd5e1',
                critBkgColor: '#fee2e2',
                critBorderColor: '#ef4444',
                // Git
                git0: '#3b82f6',
                git1: '#60a5fa',
                git2: '#93c5fd',
                git3: '#1d4ed8',
                gitBranchLabel0: '#ffffff',
                gitBranchLabel1: '#ffffff',
                gitBranchLabel2: '#ffffff'
            },
            securityLevel: 'loose',
            // 让图表使用最大宽度自适应
            flowchart: { useMaxWidth: true, htmlLabels: true },
            gantt: { useMaxWidth: true },
            gitGraph: { useMaxWidth: true },
            quadrantChart: { useMaxWidth: true }
        });

        mermaid.render('diagram', code).then(({ svg }) => {
            container.innerHTML = svg;

            // 不做缩放变换，直接报告高度
            reportHeight();

            // 监听大小变化并汇报
            const resizeObserver = new ResizeObserver(() => {
                reportHeight();
            });
            resizeObserver.observe(container);

        }).catch(error => {
            console.error(error);
            container.innerHTML = '<div class="error">⚠️ 渲染失败:<br>' + (error.str || error.message) + '</div>';
            // Reset width on error to avoid horizontal scrollbar in error view usually
            container.style.minWidth = '';
            window.parent.postMessage({ type: 'mermaid-error', error: error.message }, '*');
        });

    } catch (error) {
        console.error(error);
        container.innerHTML = '<div class="error">⚠️ 初始化失败: ' + error.message + '<br><small>' + error.stack + '</small></div>';
    }

    // 监听来自父页面的导出指令
    window.addEventListener('message', (event) => {
        if (event.data?.type === 'export-svg') {
            exportSvg();
        }
    });

    // 初始化 transformOrigin
    container.style.transformOrigin = '0 0';
}

function fitToScreen() {
    // 确保 transformOrigin 正确
    container.style.transformOrigin = '0 0';

    const windowWidth = window.innerWidth;
    // 使用 scrollWidth 获取真实宽度
    const contentWidth = container.scrollWidth || 1600;

    // 计算缩放比例
    const padding = 20; // 减少 padding
    const availableWidth = windowWidth - padding;

    let scale = availableWidth > 0 ? availableWidth / contentWidth : 1;

    // 限制范围
    if (scale > 1) scale = 1;
    if (scale < 0.1) scale = 0.1;

    zoomState.scale = scale;
    zoomState.pointX = 0; // 靠左对齐
    zoomState.pointY = 0;

    updateTransform();
}

function reportHeight() {
    // 直接报告容器高度 (不再使用缩放)
    const height = container.scrollHeight || document.body.scrollHeight;
    window.parent.postMessage({ type: 'mermaid-rendered', height: height }, '*');
}

function exportSvg() {
    const originalSvg = document.querySelector('svg');
    if (!originalSvg) return;

    const svg = originalSvg.cloneNode(true);
    svg.style.backgroundColor = '#ffffff';

    let viewBox = svg.getAttribute('viewBox');
    let x, y, width, height;

    if (viewBox) {
        [x, y, width, height] = viewBox.split(/\s+/).map(Number);
    } else {
        const bbox = originalSvg.getBBox();
        x = bbox.x; y = bbox.y; width = bbox.width; height = bbox.height;
    }

    const padding = 50;
    x -= padding;
    y -= padding;
    width += padding * 2;
    height += padding * 2;

    svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.style.maxWidth = 'none';
    svg.style.height = 'auto';

    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svg);

    if (!source.match(/^<\?xml/)) {
        source = '<?xml version="1.0" standalone="no"?>\r\n' + source;
    }

    window.parent.postMessage({ type: 'export-data', format: 'svg', data: source }, '*');
}

/* Zoom Logic - 使用 CSS Transform 缩放，反向调整文字大小保持不变 */
let zoomState = {
    scale: 1,
    panning: false,
    pointX: 0,
    pointY: 0,
    startX: 0,
    startY: 0,
    originalFontSizes: [],
    isFullscreen: false
};

// 保存所有文本元素的原始字体大小
function saveOriginalFontSizes() {
    const svg = container.querySelector('svg');
    if (!svg) return;

    zoomState.originalFontSizes = [];
    const textElements = svg.querySelectorAll('text, tspan, .nodeLabel, .edgeLabel, .label');

    textElements.forEach((el) => {
        const computed = window.getComputedStyle(el);
        const fontSize = parseFloat(computed.fontSize) || 14;
        zoomState.originalFontSizes.push({ element: el, size: fontSize });
    });
}

// 根据缩放比例调整文字大小 (反向缩放以保持视觉大小不变)
function adjustTextSizes() {
    if (!zoomState.originalFontSizes.length) return;

    zoomState.originalFontSizes.forEach(item => {
        // 当图放大时 (scale > 1)，文字要缩小 (除以 scale)
        // 当图缩小时 (scale < 1)，文字要放大 (除以 scale)
        const newSize = item.size / zoomState.scale;
        item.element.style.fontSize = newSize + 'px';
    });
}

// 恢复原始文字大小
function restoreTextSizes() {
    if (!zoomState.originalFontSizes.length) return;

    zoomState.originalFontSizes.forEach(item => {
        item.element.style.fontSize = item.size + 'px';
    });
}

// 更新容器的 CSS transform
function updateTransform() {
    container.style.transform = `translate(${zoomState.pointX}px, ${zoomState.pointY}px) scale(${zoomState.scale})`;
    adjustTextSizes();
}

function handleMouseDown(e) {
    if (e.button !== 0) return;
    e.preventDefault();

    zoomState.startX = e.clientX - zoomState.pointX;
    zoomState.startY = e.clientY - zoomState.pointY;
    zoomState.panning = true;
    container.style.cursor = 'grabbing';
}

function handleMouseMove(e) {
    if (!zoomState.panning) return;
    e.preventDefault();

    zoomState.pointX = e.clientX - zoomState.startX;
    zoomState.pointY = e.clientY - zoomState.startY;
    updateTransform();
}

function handleMouseUp(e) {
    zoomState.panning = false;
    container.style.cursor = 'grab';
}

function handleWheel(e) {
    e.preventDefault();

    // 缩放因子
    const factor = 0.1;
    const delta = e.deltaY > 0 ? -1 : 1;
    const oldScale = zoomState.scale;
    let newScale = oldScale + delta * factor * oldScale;

    // 限制缩放范围 0.5x - 5x
    newScale = Math.max(0.5, Math.min(newScale, 5));

    // 获取鼠标相对于容器的位置
    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // 计算缩放中心点的偏移
    // 公式: newPoint = mousePos - (mousePos - oldPoint) * (newScale / oldScale)
    const scaleRatio = newScale / oldScale;
    zoomState.pointX = mouseX - (mouseX - zoomState.pointX) * scaleRatio;
    zoomState.pointY = mouseY - (mouseY - zoomState.pointY) * scaleRatio;
    zoomState.scale = newScale;

    updateTransform();
}

function enableZoom() {
    zoomState.isFullscreen = true;

    // 保存原始字体大小
    saveOriginalFontSizes();

    // 设置容器样式
    container.style.transformOrigin = '0 0';
    container.style.cursor = 'grab';

    // 重置缩放状态
    zoomState.scale = 1;
    zoomState.pointX = 0;
    zoomState.pointY = 0;
    container.style.transform = '';

    // 添加事件监听
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('wheel', handleWheel, { passive: false });
}

function disableZoom() {
    zoomState.isFullscreen = false;

    // 移除事件监听
    window.removeEventListener('mousedown', handleMouseDown);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('wheel', handleWheel);

    // 恢复原始字体大小
    restoreTextSizes();

    // 重置容器样式
    container.style.transform = '';
    container.style.transformOrigin = '';
    container.style.cursor = '';

    // 重置状态
    zoomState = {
        scale: 1,
        panning: false,
        pointX: 0,
        pointY: 0,
        startX: 0,
        startY: 0,
        originalFontSizes: [],
        isFullscreen: false
    };
}

window.addEventListener('message', (event) => {
    if (event.data?.type === 'toggle-fullscreen') {
        if (event.data.isFullscreen) {
            enableZoom();
        } else {
            disableZoom();
        }
    }
});

