chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'saveToNotion') {
        handleSaveToNotion(request.data, sendResponse);
        return true; // Will respond asynchronously
    } else if (request.action === 'searchDatabases') {
        handleSearchDatabases(request.token, sendResponse);
        return true;
    }
});

async function handleSearchDatabases(token, sendResponse) {
    try {
        if (!token) throw new Error('Token is required');

        const response = await fetch('https://api.notion.com/v1/search', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                sort: {
                    direction: 'descending',
                    timestamp: 'last_edited_time'
                }
            })
        });

        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.message || response.statusText);
        }

        const results = data.results.map(item => ({
            id: item.id,
            title: item.title && item.title.length > 0 ? item.title[0].plain_text :
                (item.properties && item.properties.title && item.properties.title.title && item.properties.title.title.length > 0 ? item.properties.title.title[0].plain_text : 'Untitled'),
            object: item.object
        }));

        sendResponse({ success: true, results: results });

    } catch (error) {
        console.error('Notion Search Error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function handleSaveToNotion(data, sendResponse) {
    try {
        // Get credentials
        const stored = await chrome.storage.local.get(['notionToken', 'databaseId', 'targetType']);
        const token = stored.notionToken;
        const targetId = stored.databaseId;
        // Default to database for backward compatibility if not set
        const targetType = stored.targetType || 'database';

        if (!token || !targetId) {
            throw new Error('Please configure Notion Token and Target in extension settings.');
        }

        // Notion API has a limit of 100 children per request
        const MAX_BLOCKS = 100;

        const childrenBlocksFull = [
            {
                object: 'block',
                type: 'heading_2',
                heading_2: {
                    rich_text: [{ text: { content: data.title } }]
                }
            },
            {
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [{ text: { content: `Author: ${data.author}` } }]
                }
            },
            {
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [{ text: { content: `Source: ${data.url}`, link: { url: data.url } } }]
                }
            },
            {
                object: 'block',
                type: 'divider',
                divider: {}
            },
            ...createParagraphBlocks((data.structure && data.structure.length > 0) ? data.structure : data.content)
        ];

        const initialBlocks = childrenBlocksFull.slice(0, MAX_BLOCKS);
        const remainingBlocks = childrenBlocksFull.slice(MAX_BLOCKS);

        // Construct Body based on Target Type
        let body = {};

        if (targetType === 'page') {
            body = {
                parent: { page_id: targetId },
                properties: { title: [{ text: { content: data.title } }] },
                children: initialBlocks
            };
        } else {
            body = {
                parent: { database_id: targetId },
                properties: {
                    "Name": { title: [{ text: { content: data.title } }] },
                    "URL": { url: data.url },
                    "Author": { rich_text: [{ text: { content: data.author } }] }
                },
                children: initialBlocks
            };
        }

        const response = await fetch('https://api.notion.com/v1/pages', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const resJson = await response.json();

        if (!response.ok) {
            // Check for common error: Database properties mismatch
            if (targetType === 'database' && resJson.code === 'validation_error') {
                console.warn("Database property mismatch, trying simple fallback");
                // Fallback: Try sending ONLY title if URL/Author properties don't exist in user's DB
                const fallbackBody = {
                    parent: { database_id: targetId },
                    properties: { "Name": { title: [{ text: { content: data.title } }] } }, // "Name" is the default title prop usually
                    children: initialBlocks
                };
                const fallbackResponse = await fetch('https://api.notion.com/v1/pages', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
                    body: JSON.stringify(fallbackBody)
                });
                const fallbackJson = await fallbackResponse.json();
                if (fallbackResponse.ok) {
                    await appendRemainingBlocks(fallbackJson.id, remainingBlocks, token);
                    sendResponse({ success: true, data: fallbackJson, url: fallbackJson.url });
                    return;
                }
            }
            throw new Error(resJson.message || response.statusText);
        }

        // Successfully created page, now append remaining blocks if any
        if (remainingBlocks.length > 0) {
            await appendRemainingBlocks(resJson.id, remainingBlocks, token);
        }

        sendResponse({ success: true, data: resJson, url: resJson.url });

    } catch (error) {
        console.error('Notion API Error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

async function appendRemainingBlocks(blockId, blocks, token) {
    const CHUNK_SIZE = 100;
    for (let i = 0; i < blocks.length; i += CHUNK_SIZE) {
        const chunk = blocks.slice(i, i + CHUNK_SIZE);
        const response = await fetch(`https://api.notion.com/v1/blocks/${blockId}/children`, {
            method: 'PATCH',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Notion-Version': '2022-06-28',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ children: chunk })
        });
        if (!response.ok) {
            const err = await response.json();
            console.error('Error appending blocks:', err);
            // We don't throw here to avoid failing the whole save, but we log it.
        }
    }
}

function createParagraphBlocks(data) {
    // Handle both legacy (string) and new structured (array) content
    if (!data) return [];

    // If string, use legacy splitter
    if (typeof data === 'string') {
        const text = data;
        const maxLength = 2000;
        const blocks = [];
        for (let i = 0; i < text.length; i += maxLength) {
            const chunk = text.substring(i, i + maxLength);
            blocks.push({
                object: 'block',
                type: 'paragraph',
                paragraph: {
                    rich_text: [{ text: { content: chunk } }]
                }
            });
        }
        return blocks;
    }

    // New Structured Content (Array of {type, content/url})
    if (Array.isArray(data)) {
        const blocks = [];
        data.forEach(item => {
            if (item.type === 'image') {
                blocks.push({
                    object: 'block',
                    type: 'image',
                    image: {
                        type: 'external',
                        external: {
                            url: item.url
                        }
                    }
                });
            } else if (item.type === 'text') {
                // Split text if too long (Notion limit 2000)
                const text = item.content;
                const maxLength = 2000;
                for (let i = 0; i < text.length; i += maxLength) {
                    const chunk = text.substring(i, i + maxLength);
                    blocks.push({
                        object: 'block',
                        type: 'paragraph',
                        paragraph: {
                            rich_text: [{ text: { content: chunk } }]
                        }
                    });
                }
            }
        });
        return blocks;
    }

    return [];
}
