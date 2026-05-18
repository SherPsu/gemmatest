// DOM Elements
const pdfInput = document.getElementById('pdfInput');
const uploadBtn = document.getElementById('uploadBtn');
const uploadStatus = document.getElementById('uploadStatus');
const uploadLabel = document.querySelector('.upload-label');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const searchResults = document.getElementById('searchResults');
const pdfsList = document.getElementById('pdfsList');

// Navigation
const navItems = document.querySelectorAll('.nav-item');
const contentSections = document.querySelectorAll('.content-section');

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const section = item.dataset.section;
    showSection(section);
    
    navItems.forEach(nav => nav.classList.remove('active'));
    item.classList.add('active');
  });
});

function showSection(sectionName) {
  contentSections.forEach(section => section.classList.remove('active'));
  const section = document.getElementById(`${sectionName}-section`);
  if (section) {
    section.classList.add('active');
  }
}

// Drag and drop functionality
uploadLabel.addEventListener('dragover', (e) => {
  e.preventDefault();
  uploadLabel.style.background = '#f0f2ff';
  uploadLabel.style.borderColor = '#764ba2';
});

uploadLabel.addEventListener('dragleave', () => {
  uploadLabel.style.background = '#f8f9ff';
  uploadLabel.style.borderColor = '#667eea';
});

uploadLabel.addEventListener('drop', (e) => {
  e.preventDefault();
  uploadLabel.style.background = '#f8f9ff';
  uploadLabel.style.borderColor = '#667eea';

  const files = e.dataTransfer.files;
  if (files.length > 0) {
    pdfInput.files = files;
    uploadPDF();
  }
});

// Upload functionality
uploadBtn.addEventListener('click', uploadPDF);

pdfInput.addEventListener('change', () => {
  if (pdfInput.files.length > 0) {
    uploadBtn.textContent = `Upload "${pdfInput.files[0].name}"`;
  }
});

async function uploadPDF() {
  if (!pdfInput.files || pdfInput.files.length === 0) {
    showStatus('Please select a PDF file', 'error');
    return;
  }

  const file = pdfInput.files[0];

  if (file.type !== 'application/pdf') {
    showStatus('Please select a valid PDF file', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('pdf', file);

  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Uploading...';
  showStatus('Uploading PDF...', 'loading');

  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (response.ok) {
      showStatus(
        `✓ Successfully uploaded "${data.filename}" (${data.pages} pages)`,
        'success'
      );
      pdfInput.value = '';
      uploadBtn.textContent = 'Upload PDF';
      loadPDFsList();
    } else {
      showStatus(`Error: ${data.error}`, 'error');
    }
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
  } finally {
    uploadBtn.disabled = false;
  }
}

// AI Search Toggle
const aiSearchToggle = document.getElementById('aiSearchToggle');
let useAISearch = false;

if (aiSearchToggle) {
  aiSearchToggle.addEventListener('change', (e) => {
    useAISearch = e.target.checked;
    localStorage.setItem('useAISearch', useAISearch);
  });
  // Load saved preference
  useAISearch = localStorage.getItem('useAISearch') === 'true';
  aiSearchToggle.checked = useAISearch;
}

// Search functionality
searchBtn.addEventListener('click', searchPDFs);
searchInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    searchPDFs();
  }
});

async function searchPDFs() {
  const query = searchInput.value.trim();

  if (!query) {
    showSearch('Please enter a search query', 'error');
    return;
  }

  searchBtn.disabled = true;
  showSearch('Searching...', 'loading');

  try {
    const endpoint = useAISearch ? '/api/ai-search' : '/api/search';
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query })
    });

    const data = await response.json();

    if (response.ok) {
      displaySearchResults(data);
    } else {
      showSearch(`Error: ${data.error}`, 'error');
    }
  } catch (error) {
    showSearch(`Error: ${error.message}`, 'error');
  } finally {
    searchBtn.disabled = false;
  }
}

function displaySearchResults(data) {
  searchResults.innerHTML = '';

  if (data.resultCount === 0) {
    searchResults.innerHTML = `
      <div class="no-results">
        <svg width="48" height="48" class="empty-icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
          <circle cx="20" cy="20" r="12" stroke="currentColor" stroke-width="2"/>
          <path d="M30 30L38 38" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <p class="empty-title">No results found</p>
        <p class="empty-subtitle">Try searching with different keywords</p>
      </div>
    `;
    return;
  }

  const header = document.createElement('div');
  header.style.marginBottom = '20px';
  const searchMode = data.aiPowered ? '(AI-Powered)' : '';
  header.innerHTML = `<p style="color: var(--text-secondary);"><strong>${data.resultCount}</strong> result${data.resultCount !== 1 ? 's' : ''} found for "<strong>${escapeHtml(data.query)}</strong>" ${searchMode}</p>`;
  searchResults.appendChild(header);

  data.results.forEach(result => {
    const resultEl = document.createElement('div');
    resultEl.className = 'search-result';

    let matchTypes = '';
    let relevanceHTML = '';

    if (data.aiPowered) {
      // AI Search result
      const scoreClass = result.relevanceScore >= 8 ? 'relevance-very-high' : result.relevanceScore >= 6 ? 'relevance-high' : 'relevance-medium';
      const scannedBadge = result.isScanned ? '<span class="scanned-badge" title="This is a scanned document">📸 Scanned</span>' : '';
      relevanceHTML = `<span class="relevance-score ${scoreClass}">${result.relevanceLevel} (${result.relevanceScore}/10)</span><span class="ai-indicator">🤖 AI Powered</span>${scannedBadge}`;
    } else {
      // Traditional Search result
      if (result.filenameMatches) {
        matchTypes += '<span class="result-match-type match-filename">Filename Match</span>';
      }
      if (result.contentMatches) {
        matchTypes += '<span class="result-match-type match-content">Content Match</span>';
      }
    }

    let previewsHTML = '';
    if (result.previews && result.previews.length > 0) {
      previewsHTML = `
        <div class="result-previews">
          <div class="result-previews-title">Preview (${result.matchCount || result.previews.length} matches):</div>
          ${result.previews.map(line => 
            `<div class="preview-line">• ${escapeHtml(line.substring(0, 150))}${line.length > 150 ? '...' : ''}</div>`
          ).join('')}
        </div>
      `;
    }

    resultEl.innerHTML = `
      <div class="result-filename">📄 ${escapeHtml(result.filename)} ${relevanceHTML}</div>
      <div class="result-meta">${matchTypes}</div>
      ${previewsHTML}
    `;

    searchResults.appendChild(resultEl);
  });
}

// Load PDFs list
async function loadPDFsList() {
  try {
    const response = await fetch('/api/pdfs');
    const pdfs = await response.json();

    pdfsList.innerHTML = '';

    if (pdfs.length === 0) {
      pdfsList.innerHTML = `
        <div class="empty-message">
          <svg width="64" height="64" class="empty-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="8" y="4" width="48" height="56" rx="4" stroke="currentColor" stroke-width="2"/>
            <path d="M16 16H48M16 28H48M16 40H32" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
          </svg>
          <p class="empty-title">No documents yet</p>
          <p class="empty-subtitle">Start by uploading your first PDF</p>
        </div>
      `;
      return;
    }

    pdfs.forEach(pdf => {
      const pdfEl = document.createElement('div');
      pdfEl.className = 'document-item';

      const fileSize = (pdf.fileSize / 1024).toFixed(2);
      const uploadDate = new Date(pdf.uploadedAt).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });

      pdfEl.innerHTML = `
        <div class="document-info">
          <div class="document-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M13 2H6C4.9 2 4 2.9 4 4V20C4 21.1 4.9 22 6 22H18C19.1 22 20 21.1 20 20V9L13 2Z" fill="currentColor" opacity="0.3"/>
              <path d="M13 2V9H20" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="document-details">
            <h3>${escapeHtml(pdf.filename)}</h3>
            <p class="document-meta">Size: ${fileSize} KB • Uploaded: ${uploadDate}</p>
          </div>
        </div>
        <div class="document-actions">
          <button class="btn btn-secondary" onclick="viewDocument('${escapeHtml(pdf.filename).replace(/'/g, "\\'")}')" style="margin-right: 8px;">View</button>
          <button class="btn btn-delete" onclick="deletePDF('${escapeHtml(pdf.filename).replace(/'/g, "\\'")}')" >Delete</button>
        </div>
      `;

      pdfsList.appendChild(pdfEl);
    });
  } catch (error) {
    console.error('Error loading PDFs:', error);
  }
}

// View Document
async function viewDocument(filename) {
  try {
    const response = await fetch(`/api/document/${encodeURIComponent(filename)}`);
    
    if (!response.ok) {
      alert('Failed to load document');
      return;
    }

    const data = await response.json();
    const modal = document.getElementById('viewModal');
    const modalTitle = document.getElementById('modalTitle');
    const documentViewer = document.getElementById('documentViewer');

    modalTitle.textContent = data.filename;
    
    // Split text into pages (every 3000 chars for better readability)
    const pageSize = 3000;
    const pages = [];
    for (let i = 0; i < data.text.length; i += pageSize) {
      pages.push(data.text.substring(i, i + pageSize));
    }
    
    let html = `<div class="document-viewer-header">
      <p class="document-info">Total: ${pages.length} page(s) | Size: ${(data.fileSize / 1024).toFixed(2)} KB</p>
    </div>`;
    
    pages.forEach((pageText, index) => {
      html += `
        <div class="document-page">
          <div class="page-number">Page ${index + 1} of ${pages.length}</div>
          <div class="page-content">${escapeHtml(pageText)}</div>
        </div>
      `;
    });
    
    documentViewer.innerHTML = html;
    modal.style.display = 'flex';
  } catch (error) {
    console.error('Error viewing document:', error);
    alert('Error loading document: ' + error.message);
  }
}

function closeModal() {
  const modal = document.getElementById('viewModal');
  modal.style.display = 'none';
}

// Close modal when clicking outside
window.onclick = function(event) {
  const modal = document.getElementById('viewModal');
  if (event.target == modal) {
    modal.style.display = 'none';
  }
}

// Delete PDF
async function deletePDF(filename) {
  if (!confirm(`Are you sure you want to delete "${filename}"?`)) {
    return;
  }

  try {
    const response = await fetch(`/api/pdfs/${encodeURIComponent(filename)}`, {
      method: 'DELETE'
    });

    const data = await response.json();

    if (response.ok) {
      showStatus(`✓ "${filename}" deleted successfully`, 'success');
      loadPDFsList();
    } else {
      showStatus(`Error: ${data.error}`, 'error');
    }
  } catch (error) {
    showStatus(`Error: ${error.message}`, 'error');
  }
}

// Helper functions
function showStatus(message, type) {
  const statusEl = document.createElement('div');
  statusEl.className = `status-message status-${type}`;
  
  let icon = '';
  if (type === 'success') {
    icon = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M16.707 5.293a1 1 0 010 1.414l-9 9a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L7 13.586l8.293-8.293a1 1 0 011.414 0z" fill="currentColor"/></svg>';
  } else if (type === 'error') {
    icon = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" fill="currentColor"/></svg>';
  } else if (type === 'loading') {
    icon = '<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style="animation: spin 1s linear infinite"><path d="M10 2a8 8 0 100 16 8 8 0 000-16z" fill="currentColor" opacity="0.3"/><path d="M18 10a8 8 0 01-8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  }
  
  statusEl.innerHTML = `${icon}<span>${message}</span>`;

  uploadStatus.innerHTML = '';
  uploadStatus.appendChild(statusEl);

  // Auto-clear success/error messages after 5 seconds
  if (type !== 'loading') {
    setTimeout(() => {
      if (uploadStatus.contains(statusEl)) {
        uploadStatus.removeChild(statusEl);
      }
    }, 5000);
  }
}

// Add spinning animation
const style = document.createElement('style');
style.textContent = `
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;
document.head.appendChild(style);

function showSearch(message, type) {
  searchResults.innerHTML = '';
  const resultEl = document.createElement('div');
  resultEl.className = `status-message status-${type}`;
  resultEl.style.marginBottom = '0';
  resultEl.textContent = message;
  searchResults.appendChild(resultEl);
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}

// Load PDFs list on page load
loadPDFsList();
