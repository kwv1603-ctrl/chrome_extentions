// function to inject button
function injectButtons() {
    // Select all answer action bars
    const actionBars = document.querySelectorAll('.ContentItem-actions');

    actionBars.forEach(bar => {
        // Check if button already injected
        if (bar.querySelector('.notion-save-btn')) return;

        const btn = document.createElement('button');
        btn.innerText = 'Save to Notion';
        btn.className = 'Button ContentItem-action notion-save-btn'; // Use Zhihu classes for basic styling + custom class
        btn.style.marginLeft = '10px';
        btn.style.color = '#333';

        btn.onclick = async (e) => {
            e.preventDefault();
            e.stopPropagation();

            btn.innerText = 'Saving...';

            try {
                // Find parent ContentItem to scope scraping
                const contentItem = bar.closest('.ContentItem');
                if (!contentItem) throw new Error('Could not find answer container');

                // Scrape Data
                const questionTitleElement = document.querySelector('.QuestionHeader-title') || document.querySelector('h1.QuestionHeader-title') || document.querySelector('h1');
                const questionTitle = questionTitleElement ? questionTitleElement.innerText.trim() : '';

                const authorElement = contentItem.querySelector('.UserLink-link') || contentItem.querySelector('.AuthorInfo-name');
                const author = authorElement ? authorElement.innerText.trim() : 'Anonymous';

                const richTextElement = contentItem.querySelector('.RichText') || contentItem.querySelector('.CopyrightRichText-richText');
                const contentText = richTextElement ? richTextElement.innerText : '';

                if (!questionTitle || !contentText) {
                    const confirmSave = confirm(`Warning: Could not detect full content.\nTitle found: ${!!questionTitle}\nContent found: ${!!contentText}\n\nTry to save anyway?`);
                    if (!confirmSave) {
                        btn.innerText = 'Save to Notion';
                        return;
                    }
                }

                // Get URL (Try to find share link or permanent link, fallback to current)
                // For answers, Zhihu usually puts a meta itemprop="url"
                const metaUrl = contentItem.querySelector('meta[itemprop="url"]');
                const answerUrl = metaUrl ? metaUrl.getAttribute('content') : window.location.href;

                // Send to background
                chrome.runtime.sendMessage({
                    action: 'saveToNotion',
                    data: {
                        title: questionTitle || 'Untitled Zhihu Answer',
                        author: author,
                        url: answerUrl,
                        content: contentText || '[Empty Content]',
                        html: ''
                    }
                }, (response) => {
                    if (response && response.success) {
                        btn.innerText = 'Saved!';
                        btn.style.color = 'green';

                        if (response.url) {
                            // Open the new page to prove it worked
                            window.open(response.url, '_blank');
                        }
                    } else {
                        btn.innerText = 'Error';
                        btn.style.color = 'red';
                        alert('Failed to save: ' + (response ? response.error : 'Unknown error'));
                    }
                    setTimeout(() => {
                        btn.innerText = 'Save to Notion';
                        btn.style.color = '#333';
                    }, 3000);
                });

            } catch (err) {
                console.error(err);
                btn.innerText = 'Error';
                alert('Error scraping data: ' + err.message);
            }
        };

        bar.appendChild(btn);
    });
}

// Observe DOM changes to handle infinite scroll / dynamic loading
const observer = new MutationObserver((mutations) => {
    injectButtons();
});

observer.observe(document.body, {
    childList: true,
    subtree: true
});

// Initial run
injectButtons();
