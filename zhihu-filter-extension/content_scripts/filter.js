let blockedKeywords = [];

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
            if (mutation.addedNodes.length) {
                shouldFilter = true;
                break;
            }
        }
        if (shouldFilter) {
            filterPage();
        }
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true,
    });
}

function filterPage() {
    if (blockedKeywords.length === 0) return;

    // Selectors for Zhihu feed items. 
    // Common ones: .Card, .Feed, .TopstoryItem, .ZVideoItem
    // We need to be careful not to hide the entire container if it's not a feed item.
    // Targeted selection is better.
    const items = document.querySelectorAll('.Card.TopstoryItem, .Card.PCPiecesItem, .Card.SearchResult-Card');

    items.forEach(item => {
        // Check if already processed to avoid re-calculating too often, 
        // though text might change so we usually check repeatedly or mark checked.
        // For simplicity, we just check text content.
        const text = item.innerText;

        // Check if text contains any keyword
        const matched = blockedKeywords.some(keyword => text.includes(keyword));

        if (matched) {
            // Hide the item
            item.style.display = 'none';
            // console.log('Hid item containing keyword');
        } else {
            // Ensure it's visible if keyword was removed (optional, but good for UX)
            if (item.style.display === 'none') {
                item.style.display = '';
            }
        }
    });
}
