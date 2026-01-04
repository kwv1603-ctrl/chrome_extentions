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

        // Construct Body based on Target Type
        let body = {};

        const childrenBlocks = [
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
                    rich_text: [{ text: { content: `Source: ${data.url}`, link: { url: data.url } } }] // Make source clickable
                }
            },
            {
                object: 'block',
                type: 'divider',
                divider: {}
            },
            ...createParagraphBlocks(data.content)
        ];

        if (targetType === 'page') {
            // Saving as a Sub-Page
            body = {
                parent: { page_id: targetId },
                properties: {
                    title: [
                        { text: { content: data.title } }
                    ]
                },
                children: childrenBlocks
            };
        } else {
            // Saving to a Database
            body = {
                parent: { database_id: targetId },
                properties: {
                    "Name": {
                        title: [{ text: { content: data.title } }]
                    },
                    "URL": {
                        url: data.url
                    },
                    "Author": {
                        rich_text: [{ text: { content: data.author } }]
                    }
                },
                children: childrenBlocks
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
                    properties: {
                        "Name": { title: [{ text: { content: data.title } }] } // "Name" is the default title prop usually
                    },
                    children: childrenBlocks
                };
                const fallbackResponse = await fetch('https://api.notion.com/v1/pages', {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
                    body: JSON.stringify(fallbackBody)
                });
                const fallbackJson = await fallbackResponse.json();
                if (fallbackResponse.ok) {
                    // Return the URL of the fallback creation
                    sendResponse({ success: true, data: fallbackJson, url: fallbackJson.url });
                    return;
                }
            }
            throw new Error(resJson.message || response.statusText);
        }

        sendResponse({ success: true, data: resJson, url: resJson.url });

    } catch (error) {
        console.error('Notion API Error:', error);
        sendResponse({ success: false, error: error.message });
    }
}

function createParagraphBlocks(text) {
    if (!text) return [];

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
