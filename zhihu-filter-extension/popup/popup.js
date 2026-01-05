document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('keyword-input');
  const addBtn = document.getElementById('add-btn');
  const list = document.getElementById('keyword-list');

  // Load keywords
  chrome.storage.sync.get(['keywords'], (result) => {
    const keywords = result.keywords || [];
    keywords.forEach(addKeywordElement);
  });

  // Add keyword
  addBtn.addEventListener('click', () => {
    const keyword = input.value.trim();
    if (keyword) {
      chrome.storage.sync.get(['keywords'], (result) => {
        const keywords = result.keywords || [];
        if (!keywords.includes(keyword)) {
          keywords.push(keyword);
          chrome.storage.sync.set({ keywords }, () => {
            addKeywordElement(keyword);
            input.value = '';
          });
        } else {
            input.value = '';
            // Flash input or show message if needed
        }
      });
    }
  });

  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      addBtn.click();
    }
  });

  function addKeywordElement(keyword) {
    const li = document.createElement('li');
    li.textContent = keyword;
    
    const removeBtn = document.createElement('button');
    removeBtn.textContent = '✕';
    removeBtn.className = 'remove-btn';
    removeBtn.addEventListener('click', () => {
      chrome.storage.sync.get(['keywords'], (result) => {
        const keywords = result.keywords || [];
        const index = keywords.indexOf(keyword);
        if (index > -1) {
          keywords.splice(index, 1);
          chrome.storage.sync.set({ keywords }, () => {
            li.remove();
          });
        }
      });
    });

    li.appendChild(removeBtn);
    list.appendChild(li);
  }
});
