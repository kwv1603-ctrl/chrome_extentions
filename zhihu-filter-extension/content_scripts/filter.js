let blockedKeywords = [];
let filterTimeout = null;

// Initialize
chrome.storage.sync.get(['keywords'], (result) => {
    blockedKeywords = result.keywords || [];
    filterPage();
    observeMutations();
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace === 'sync' && changes.keywords) {
        blockedKeywords = changes.keywords.newValue || [];
        filterPage();
    }
});

function observeMutations() {
    const observer = new MutationObserver((mutations) => {
        let shouldFilter = false;
        for (const mutation of mutations) {
            // Only react to added nodes, ignore attribute/style changes
            if (mutation.addedNodes.length) {
                // Check if any added node is a real content element (not just text nodes or our hidden elements)
                for (const node of mutation.addedNodes) {
                    if (node.nodeType === Node.ELEMENT_NODE && !node.hasAttribute('data-zhihu-filtered')) {
                        shouldFilter = true;
                        break;
                    }
                }
            }
            if (shouldFilter) break;
        }
        if (shouldFilter) {
            // Debounce: wait 100ms before filtering to batch multiple rapid changes
            if (filterTimeout) {
                clearTimeout(filterTimeout);
            }
            filterTimeout = setTimeout(() => {
                filterPage();
                filterTimeout = null;
            }, 100);
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

function filterPage() {
    // Only filter on feed/waterfall pages, skip detail pages
    const path = window.location.pathname;
    const detailPagePatterns = [
        /^\/question\/\d+/,    // Question detail page
        /^\/p\/\d+/,           // Article page
        /^\/answer\/\d+/,      // Answer page
        /^\/pin\/\d+/,         // Pin/thought page
        /^\/zvideo\/\d+/,      // Video page
    ];

    const isDetailPage = detailPagePatterns.some(pattern => pattern.test(path));
    if (isDetailPage) {
        return; // Skip filtering on detail pages
    }

    // ===== 1. ALWAYS HIDE ALL AD CARDS (unconditionally) =====
    const adSelectors = [
        '.Pc-feedAd-container',
        '.Pc-feedAd-new',           // NEW: from user screenshot
        '.Pc-card',
        '[data-za-detail-view-path-module*="Ad"]',
        '[data-za-detail-view-path-module*="ad"]',
        '.TopstoryItem--advertCard',
        '.Card[data-za-extra-module*="ad"]',
        '.Card[data-za-extra-module*="Ad"]',
        // Additional ad selectors
        '[class*="advert"]',
        '[class*="Advert"]',
        '[class*="AdvertImg"]',     // NEW: from user screenshot
        '[class*="feedAd"]',        // NEW: catches Pc-feedAd-* patterns
        '[class*="banner-ad"]',
        '[class*="BannerAd"]',
        '[class*="promote"]',
        '[class*="Promote"]',
        '.Pc-Business-Card',
        '.css-1qyytj7[data-za-detail-view-path-module]',
    ];

    const adCards = document.querySelectorAll(adSelectors.join(', '));
    adCards.forEach(ad => {
        ad.style.display = 'none';
    });

    // Also hide cards that contain "广告" label text
    const allCards = document.querySelectorAll('.Card, .TopstoryItem, .Feed');
    allCards.forEach(card => {
        // Check for ad label
        const adLabel = card.querySelector('.css-dqnzkq, .Pc-feedAd-text, [class*="ad-label"]');
        if (adLabel && adLabel.innerText.includes('广告')) {
            card.style.display = 'none';
            return;
        }
        // Also check if card text starts with or contains "广告" as a tag
        const tagElements = card.querySelectorAll('.Tag, .Label, span');
        for (const tag of tagElements) {
            if (tag.innerText.trim() === '广告') {
                card.style.display = 'none';
                return;
            }
        }
    });

    // ===== 2. KEYWORD FILTERING FOR REGULAR CONTENT =====
    if (blockedKeywords.length === 0) return;

    // Selectors for Zhihu feed items (non-ad content)
    const contentItems = document.querySelectorAll('.Card.TopstoryItem, .Card.PCPiecesItem, .Card.SearchResult-Card, .TopstoryItem-isRecommend, .ContentItem.AnswerItem');

    contentItems.forEach(item => {
        // Skip if already processed and hidden - don't toggle visibility
        if (item.hasAttribute('data-zhihu-hidden')) {
            // Check if user clicked "阅读全文" to expand - only then unhide
            const richContent = item.querySelector('.RichContent');
            const isNowExpanded = richContent && !richContent.classList.contains('is-collapsed');
            if (isNowExpanded) {
                item.removeAttribute('data-zhihu-hidden');
                item.style.display = '';
            }
            return; // Don't reprocess hidden items
        }

        // Skip if already processed and shown
        if (item.hasAttribute('data-zhihu-shown')) {
            return;
        }

        // For new items: check if content is already expanded (user is viewing)
        const richContent = item.querySelector('.RichContent');
        const isExpanded = richContent && !richContent.classList.contains('is-collapsed');

        // Also check if card is in modal/overlay view
        const isInModal = item.closest('.Modal-wrapper') || item.closest('.css-1qyytj7');

        if (isExpanded || isInModal) {
            // User is already viewing this content, mark as shown and don't hide
            item.setAttribute('data-zhihu-shown', 'true');
            return;
        }

        // Check text content for keywords
        const text = item.innerText;
        const matched = blockedKeywords.some(keyword => text.includes(keyword));

        if (matched) {
            // Hide and mark as hidden
            item.setAttribute('data-zhihu-hidden', 'true');
            item.style.display = 'none';
        } else {
            // Mark as shown (processed but not hidden)
            item.setAttribute('data-zhihu-shown', 'true');
        }
    });
}
