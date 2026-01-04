
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

function initAndRender(code) {
    try {
        mermaid.initialize({
            // 使用 default 主题以获得更好的兼容性，并覆盖颜色
            theme: 'default',
            themeVariables: {
                primaryColor: '#e0f2fe',
                primaryTextColor: '#1e293b',
                primaryBorderColor: '#3b82f6',
                lineColor: '#64748b',
                secondaryColor: '#f0f9ff',
                tertiaryColor: '#ffffff',
                mainBkg: '#ffffff',
                // Gantt specific
                taskBkgColor: '#e0f2fe',
                taskBorderColor: '#3b82f6',
                taskTextColor: '#1e293b',
                activeTaskBkgColor: '#eff6ff',
                activeTaskBorderColor: '#3b82f6',
                doneTaskBkgColor: '#f8fafc',
                doneTaskBorderColor: '#cbd5e1',
                critBkgColor: '#fee2e2',
                critBorderColor: '#ef4444',
                // Git specific
                git0: '#3b82f6',
                git1: '#60a5fa',
                git2: '#93c5fd',
                git3: '#1d4ed8',
                gitBranchLabel0: '#ffffff',
                gitBranchLabel1: '#ffffff',
                gitBranchLabel2: '#ffffff'
            },
            securityLevel: 'loose',
            flowchart: { useMaxWidth: true, htmlLabels: true },
            // 禁用自动宽度并在容器层级控制，避免负宽度错误
            gantt: { useMaxWidth: false },
            gitGraph: { useMaxWidth: false }
        });

        // 渲染
        mermaid.render('diagram', code).then(({ svg }) => {
            container.innerHTML = svg;

            // 发送渲染成功消息和高度
            const height = document.body.scrollHeight;
            window.parent.postMessage({ type: 'mermaid-rendered', height: height }, '*');

            // 监听大小变化并汇报
            const resizeObserver = new ResizeObserver(() => {
                window.parent.postMessage({ type: 'mermaid-rendered', height: document.body.scrollHeight }, '*');
            });
            // 监听 container 而不是 body，避免因为 body 样式导致的循环
            resizeObserver.observe(container);

        }).catch(error => {
            console.error(error);
            container.innerHTML = '<div class="error">⚠️ 渲染失败:<br>' + (error.str || error.message) + '</div>';
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
}

function exportSvg() {
    const originalSvg = document.querySelector('svg');
    if (!originalSvg) return;

    // 克隆 SVG 以便修改
    const svg = originalSvg.cloneNode(true);

    // 强制白色背景 (通过 style)
    svg.style.backgroundColor = '#ffffff';

    // 尝试解析原始 viewBox
    let viewBox = svg.getAttribute('viewBox');
    let x, y, width, height;

    if (viewBox) {
        [x, y, width, height] = viewBox.split(/\s+/).map(Number);
    } else {
        // 如果没有 viewBox (罕见)，尝试使用 getBBox 或 width/height
        const bbox = originalSvg.getBBox();
        x = bbox.x;
        y = bbox.y;
        width = bbox.width;
        height = bbox.height;
    }

    // 增加内边距 (padding)
    const padding = 50;
    x -= padding;
    y -= padding;
    width += padding * 2;
    height += padding * 2;

    // 设置新的 viewBox
    svg.setAttribute('viewBox', `${x} ${y} ${width} ${height}`);

    // 设置显示尺寸 (也可以不设，让浏览器自适应，但设了比较稳妥)
    svg.setAttribute('width', width);
    svg.setAttribute('height', height);

    // 强制居中显示
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');

    // 清除可能干扰的样式
    svg.style.maxWidth = 'none';
    svg.style.height = 'auto';

    // 获取源码
    const serializer = new XMLSerializer();
    let source = serializer.serializeToString(svg);

    if (!source.match(/^<\?xml/)) {
        source = '<?xml version="1.0" standalone="no"?>\r\n' + source;
    }

    window.parent.postMessage({ type: 'export-data', format: 'svg', data: source }, '*');
}
