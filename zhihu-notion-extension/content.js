// function to inject button
function injectButtons() {
    // Select action bars
    const actionBars = document.querySelectorAll('.ContentItem-actions');

    actionBars.forEach(bar => {
        // Find parent card
        const contentItem = bar.closest('.ContentItem');
        if (!contentItem) return;

        // 1. DEDUPLICATION: Check if this Specific CARD already has a button
        // This is the most reliable way to prevent side-by-side duplicates
        if (contentItem.querySelector('.notion-save-btn')) return;

        // 2. EXTRA GUARD: Check the bar itself
        if (bar.classList.contains('notion-btn-injected')) return;

        // Skip if bar is hidden
        if (bar.offsetWidth === 0 && bar.offsetHeight === 0) return;

        // Mark as injected
        bar.classList.add('notion-btn-injected');

        const btn = document.createElement('button');
        // UI FIX: Simple "Notion" text
        btn.innerHTML = '&#128221; Notion'; // Clipboard/Notion icon + Text
        // UI FIX: Better styling to match Zhihu's clean look
        btn.className = 'Button ContentItem-action notion-save-btn';
        btn.style.cssText = `
            margin-left: auto; /* Pushes button to its far right in flex container */
            color: #172B4D; 
            border: 1px solid #E1E1E1;
            background: white;
            border-radius: 4px;
            padding: 0 10px;
            font-size: 14px;
            line-height: 30px; 
            cursor: pointer;
            display: inline-flex;
            align-items: center;
            gap: 6px;
            flex-shrink: 0; /* Prevents button from being squashed */
        `;

        btn.onmouseover = () => { btn.style.background = '#F6F6F6'; };
        btn.onmouseout = () => { btn.style.background = 'white'; };

        btn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            const oldText = btn.innerHTML;
            btn.innerHTML = 'Saving...';
            btn.disabled = true;

            try {
                // Find parent ContentItem to scope scraping
                const contentItem = bar.closest('.ContentItem');
                if (!contentItem) throw new Error('Could not find answer container');

                // Scrape Data
                // 1. Try to find title within the card (for Feed/Explore pages)
                let questionTitleElement = contentItem.querySelector('.ContentItem-title') || contentItem.querySelector('.QuestionItem-title');

                // 2. If not found locally, try global header (for Question Detail pages)
                if (!questionTitleElement) {
                    questionTitleElement = document.querySelector('.QuestionHeader-title') || document.querySelector('h1.QuestionHeader-title') || document.querySelector('h1');
                }

                const questionTitle = questionTitleElement ? questionTitleElement.innerText.trim() : '';

                const authorElement = contentItem.querySelector('.UserLink-link') || contentItem.querySelector('.AuthorInfo-name');
                const author = authorElement ? authorElement.innerText.trim() : 'Anonymous';

                // CONTENT PARSING FOR IMAGES matched with TEXT
                const richTextElement = contentItem.querySelector('.RichText') || contentItem.querySelector('.CopyrightRichText-richText');

                let parsedContent = [];
                if (richTextElement) {
                    // 1. DYNAMIC IMAGE RECOVERY: Find all candidates
                    // Zhihu uses several patterns for images: <figure>, <div> with specific classes, or raw <img>
                    const candidates = richTextElement.querySelectorAll('p, figure, h2, h3, blockquote, li, .ztext-image_parent-with-shadow, img');

                    const processedImages = new Set();

                    candidates.forEach(node => {
                        const tagName = node.tagName.toLowerCase();

                        // Check if node is an image or contains one
                        let isImage = false;
                        let src = null;

                        if (tagName === 'img') {
                            src = node.getAttribute('data-actualsrc') || node.getAttribute('data-original') || node.src;
                            isImage = !!src && !src.startsWith('data:');
                        } else if (tagName === 'figure' || node.classList.contains('ztext-image_parent-with-shadow')) {
                            const img = node.querySelector('img');
                            if (img) {
                                src = img.getAttribute('data-actualsrc') || img.getAttribute('data-original') || img.src;
                                isImage = !!src && !src.startsWith('data:');
                            }
                        }

                        if (isImage && src) {
                            // Deduplicate: Don't add same URL twice in a row (Zhihu often has noscript + lazy img)
                            if (processedImages.has(src)) return;
                            processedImages.add(src);

                            parsedContent.push({ type: 'image', url: src });

                            // If figure, capture caption
                            if (tagName === 'figure') {
                                const caption = node.querySelector('figcaption');
                                if (caption) {
                                    const cText = caption.innerText.trim();
                                    if (cText) parsedContent.push({ type: 'text', content: cText });
                                }
                            }
                        } else if (!node.closest('figure') && !node.classList.contains('ztext-image_parent-with-shadow')) {
                            // Text block (avoid processing text inside image containers)
                            const text = node.innerText.trim();
                            if (text && tagName !== 'img') {
                                parsedContent.push({ type: 'text', content: text });
                            }
                        }
                    });
                }

                const contentText = richTextElement ? richTextElement.innerText : ''; // Fallback / Detection check

                if (!questionTitle || (!contentText && parsedContent.length === 0)) {
                    const confirmSave = confirm(`Warning: Could not detect full content.\nTitle found: ${!!questionTitle}\nContent found: ${parsedContent.length > 0}\n\nTry to save anyway?`);
                    if (!confirmSave) {
                        btn.innerHTML = oldText;
                        btn.disabled = false;
                        return;
                    }
                }

                // Get URL
                const metaUrl = contentItem.querySelector('meta[itemprop="url"]');
                const answerUrl = metaUrl ? metaUrl.getAttribute('content') : window.location.href;

                // Send to background
                chrome.runtime.sendMessage({
                    action: 'saveToNotion',
                    data: {
                        title: questionTitle || 'Untitled Zhihu Answer',
                        author: author,
                        url: answerUrl,
                        content: contentText, // Legacy
                        structure: parsedContent // NEW: Structured content with images
                    }
                }, (response) => {
                    if (response && response.success) {
                        btn.innerHTML = '&#10003; Saved'; // Tick
                        btn.style.color = '#00875A'; // Green

                        if (response.url) {
                            window.open(response.url, '_blank');
                        }

                        // Reset after delay
                        setTimeout(() => {
                            btn.innerHTML = oldText;
                            btn.style.color = '#172B4D';
                            btn.disabled = false;
                        }, 3000);

                    } else {
                        btn.innerText = 'Error';
                        btn.style.color = '#DE350B'; // Red
                        alert('Failed to save: ' + (response ? response.error : 'Unknown error'));
                        btn.disabled = false;
                    }
                });

            } catch (err) {
                console.error(err);
                btn.innerText = 'Error';
                btn.style.color = '#DE350B';
                alert('Error scraping data: ' + err.message);
                btn.disabled = false;
            }
        };

        bar.appendChild(btn);
    });
}

// Debounce function to prevent rapid-fire execution
let injectionTimer = null;
function debouncedInject() {
    if (injectionTimer) clearTimeout(injectionTimer);
    injectionTimer = setTimeout(injectButtons, 200);
}

// Observe DOM changes to handle infinite scroll / dynamic loading
const observer = new MutationObserver((mutations) => {
    debouncedInject();
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Initial run
injectButtons();
