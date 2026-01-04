document.addEventListener('DOMContentLoaded', () => {
    const tokenInput = document.getElementById('notionToken');
    const dbSelect = document.getElementById('databaseId');
    const saveButton = document.getElementById('save');
    const loadDbsButton = document.getElementById('loadDbs');
    const statusDiv = document.getElementById('status');

    // Load saved settings
    chrome.storage.local.get(['notionToken', 'databaseId'], (result) => {
        if (result.notionToken) {
            tokenInput.value = result.notionToken;
        }
        if (result.databaseId) {
            // We set the value, but if options aren't loaded yet it won't show the name. 
            // We'll create a temporary option so it shows something.
            const option = document.createElement('option');
            option.value = result.databaseId;
            option.text = "Saved " + result.databaseId.slice(0, 4) + "... (Load to see names)"; // Placeholder
            option.selected = true;
            dbSelect.appendChild(option);
        }
    });

    // Load Databases
    loadDbsButton.addEventListener('click', () => {
        const token = tokenInput.value.trim();
        if (!token) {
            statusDiv.textContent = 'Please enter a Token first.';
            statusDiv.style.color = 'red';
            return;
        }

        loadDbsButton.textContent = 'Loading...';
        statusDiv.textContent = '';

        chrome.runtime.sendMessage({ action: 'searchDatabases', token: token }, (response) => {
            loadDbsButton.textContent = '🔄 Load Databases';

            if (response && response.success) {
                dbSelect.innerHTML = '<option value="" disabled selected>Select a database...</option>';

                const items = response.results;

                if (items.length === 0) {
                    statusDiv.innerHTML = '<b>Token Valid, but NOTHING found!</b><br>You MUST go to your Notion Page/Database -> <code>...</code> menu -> <code>Connections</code> -> Add your integration.';
                    statusDiv.style.color = 'red';
                } else {
                    items.forEach(item => {
                        const option = document.createElement('option');
                        option.value = item.id;
                        // Store the type in a data attribute to retrieve later
                        option.dataset.type = item.object;
                        option.text = (item.object === 'database' ? '🗄️ ' : 'PAGE 📄 ') + item.title;
                        dbSelect.appendChild(option);
                    });

                    // Auto-select if we had one saved
                    chrome.storage.local.get(['databaseId'], (res) => {
                        if (res.databaseId) {
                            dbSelect.value = res.databaseId;
                        }
                    });

                    statusDiv.textContent = `Found ${items.length} targets.`;
                    statusDiv.style.color = 'green';
                }
            } else {
                statusDiv.textContent = 'Error: ' + (response ? response.error : 'Unknown');
                statusDiv.style.color = 'red';
            }
        });
    });

    // Save settings
    saveButton.addEventListener('click', () => {
        const notionToken = tokenInput.value.trim();
        const databaseId = dbSelect.value;
        // Get the type of the selected option
        const selectedOption = dbSelect.options[dbSelect.selectedIndex];
        const targetType = selectedOption.getAttribute('data-type') || 'database'; // default to database if unknown

        if (!databaseId) {
            statusDiv.textContent = 'Please select a target.';
            statusDiv.style.color = 'red';
            return;
        }

        chrome.storage.local.set({
            notionToken: notionToken,
            databaseId: databaseId,
            targetType: targetType
        }, () => {
            statusDiv.textContent = 'Settings saved!';
            setTimeout(() => {
                statusDiv.textContent = '';
            }, 2000);
        });
    });
});
