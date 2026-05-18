const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'), false);
    }
  }
});

// Store PDF metadata in memory
const pdfDatabase = new Map();

// Upload PDF endpoint
app.post('/api/upload', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const filePath = req.file.path;
    const fileBuffer = fs.readFileSync(filePath);

    // Extract text from PDF
    const data = await pdf(fileBuffer);
    const text = data.text;

    // Store metadata
    const pdfId = req.file.filename;
    pdfDatabase.set(pdfId, {
      filename: req.file.originalname,
      uploadedAt: new Date(),
      fileSize: req.file.size,
      text: text,
      path: filePath
    });

    res.json({
      success: true,
      message: 'PDF uploaded successfully',
      pdfId: pdfId,
      filename: req.file.originalname,
      fileSize: req.file.size,
      pages: data.numpages
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all PDFs endpoint
app.get('/api/pdfs', (req, res) => {
  const pdfs = Array.from(pdfDatabase.values()).map(pdf => ({
    filename: pdf.filename,
    uploadedAt: pdf.uploadedAt,
    fileSize: pdf.fileSize
  }));

  res.json(pdfs);
});

// Search endpoint
app.post('/api/search', (req, res) => {
  try {
    const { query } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    const results = [];
    const searchLower = query.toLowerCase();

    pdfDatabase.forEach((pdf, pdfId) => {
      // Search by filename
      const filenameMatches = pdf.filename.toLowerCase().includes(searchLower);

      // Search in content
      const contentMatches = pdf.text.toLowerCase().includes(searchLower);

      if (filenameMatches || contentMatches) {
        // Find all occurrences in content
        const lines = pdf.text.split('\n');
        const matchingLines = lines.filter(line => 
          line.toLowerCase().includes(searchLower)
        );

        results.push({
          filename: pdf.filename,
          filenameMatches: filenameMatches,
          contentMatches: contentMatches,
          matchCount: matchingLines.length,
          previews: matchingLines.slice(0, 3) // Show first 3 matching lines
        });
      }
    });

    res.json({
      query: query,
      resultCount: results.length,
      results: results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete PDF endpoint
app.delete('/api/pdfs/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const pdf = pdfDatabase.get(filename);

    if (!pdf) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    // Delete file from disk
    if (fs.existsSync(pdf.path)) {
      fs.unlinkSync(pdf.path);
    }

    // Remove from database
    pdfDatabase.delete(filename);

    res.json({ success: true, message: 'PDF deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// AI Search using LM Studio
const AI_API_URL = process.env.AI_API_URL || 'http://127.0.0.1:1234';
const AI_MODEL = process.env.AI_MODEL || 'default';

async function callLMStudio(prompt) {
  try {
    const response = await fetch(`${AI_API_URL}/v1/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: AI_MODEL,
        prompt: prompt,
        max_tokens: 200,
        temperature: 0.3,
        top_p: 0.9,
      })
    });
    
    if (!response.ok) {
      throw new Error(`LM Studio error: ${response.statusText}`);
    }
    
    const data = await response.json();
    return data.choices[0].text.trim();
  } catch (error) {
    console.error('LM Studio API error:', error);
    throw error;
  }
}

app.post('/api/ai-search', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Search query is required' });
    }

    if (pdfDatabase.size === 0) {
      return res.json({
        query: query,
        resultCount: 0,
        results: []
      });
    }

    const results = [];
    const pdfEntries = Array.from(pdfDatabase.entries());

    // Process each PDF with AI analysis
    for (const [pdfId, pdf] of pdfEntries) {
      try {
        // Create a prompt that asks AI to evaluate relevance
        const textPreview = pdf.text.substring(0, 2000); // Use first 2000 chars for context
        const prompt = `Given the following document excerpt and search query, rate the relevance of this document to the query on a scale of 0-10 (0=not relevant, 10=highly relevant). Only respond with a number.

Document excerpt: "${textPreview.slice(0, 1500)}..."

Search query: "${query}"

Relevance score (0-10):`;        
        const scoreStr = await callLMStudio(prompt);
        const score = Math.max(0, Math.min(10, parseInt(scoreStr) || 0));

        if (score >= 5) {
          // Find relevant lines
          const lines = pdf.text.split('\n');
          const relevantLines = [];
          
          for (const line of lines) {
            if (line.trim().length > 0 && relevantLines.length < 3) {
              // Check for keyword matches as fallback
              const queryWords = query.toLowerCase().split(' ');
              const lineMatches = queryWords.some(word => line.toLowerCase().includes(word));
              if (lineMatches) {
                relevantLines.push(line.trim());
              }
            }
          }

          results.push({
            filename: pdf.filename,
            relevanceScore: score,
            relevanceLevel: score >= 8 ? 'Very Relevant' : score >= 6 ? 'Relevant' : 'Somewhat Relevant',
            previews: relevantLines.slice(0, 3),
            aiPowered: true
          });
        }
      } catch (error) {
        console.error(`Error analyzing PDF ${pdf.filename}:`, error);
        // Continue with other PDFs if one fails
      }
    }

    // Sort by relevance score
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);

    res.json({
      query: query,
      resultCount: results.length,
      results: results,
      aiPowered: true
    });
  } catch (error) {
    res.status(500).json({ error: error.message || 'AI search error' });
  }
});

app.listen(PORT, () => {
  console.log(`PDF Upload & Search Server running on http://localhost:${PORT}`);
  console.log(`AI Search enabled - Using LM Studio at ${AI_API_URL}`);
});
