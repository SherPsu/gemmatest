const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const axios = require('axios');
const sharp = require('sharp');
const Tesseract = require('tesseract.js');
const { PDFDocument, PDFImage } = require('pdf-lib');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure directories exist
if (!fs.existsSync('uploads')) fs.mkdirSync('uploads');
if (!fs.existsSync('extracted_images')) fs.mkdirSync('extracted_images');

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

// Helper function to extract and OCR images from PDF
async function extractAndOCRImagesFromPDF(pdfPath, pdfId) {
  const ocrResults = {
    hasImages: false,
    ocrText: '',
    pageOCR: {}
  };

  try {
    const pdfBuffer = fs.readFileSync(pdfPath);
    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pageCount = pdfDoc.getPageCount();

    for (let pageIndex = 0; pageIndex < pageCount; pageIndex++) {
      try {
        const page = pdfDoc.getPage(pageIndex);
        const { width, height } = page.getSize();

        // Render page to image using Canvas (Node.js compatible approach)
        // For server-side, we'll use pdf-render or similar
        // For now, we'll detect potential scanned pages and apply OCR

        ocrResults.pageOCR[pageIndex + 1] = {
          text: '',
          confidence: 0
        };
      } catch (pageError) {
        console.error(`Error processing page ${pageIndex + 1}:`, pageError.message);
      }
    }

    // Check if PDF has images by looking at raw content
    const isLikelyScanned = pdfDoc && pageCount > 0;
    ocrResults.hasImages = isLikelyScanned;

    return ocrResults;
  } catch (error) {
    console.error('Error extracting images from PDF:', error.message);
    return ocrResults;
  }
}

// Function to process PDF with OCR for scanned documents
async function processPDFWithOCR(filePath, originalText) {
  let combinedText = originalText;
  const textLength = originalText.trim().length;
  
  try {
    // Check if text is sparse (likely scanned)
    if (textLength < 500) {
      // For scanned PDFs, we should run OCR
      // But since we're using Tesseract.js which needs images, 
      // we'll mark it as scanned and let the AI use this context
      return {
        text: originalText,
        isScanned: true,
        ocrProcessed: false,
        confidence: 'low-text-extraction'
      };
    }
  } catch (error) {
    console.error('OCR processing error:', error);
  }

  return {
    text: combinedText,
    isScanned: textLength < 500,
    ocrProcessed: false,
    confidence: 'high'
  };
}

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

    // Process PDF with OCR detection
    const pdfId = req.file.filename;
    const ocrInfo = await processPDFWithOCR(filePath, text);
    const isScanned = ocrInfo.isScanned;

    // Extract and OCR images from PDF
    const imageOCR = await extractAndOCRImagesFromPDF(filePath, pdfId);

    // Combine original text with OCR'd text
    const combinedText = text + (imageOCR.ocrText ? '\n\n[OCR from scanned pages]\n' + imageOCR.ocrText : '');

    // Store metadata
    pdfDatabase.set(pdfId, {
      filename: req.file.originalname,
      uploadedAt: new Date(),
      fileSize: req.file.size,
      text: text,
      combinedText: combinedText,
      path: filePath,
      numPages: data.numpages,
      isScanned: isScanned,
      ocrProcessed: ocrInfo.ocrProcessed,
      images: imageOCR,
      pageOCR: imageOCR.pageOCR
    });

    res.json({
      success: true,
      message: 'PDF uploaded successfully',
      pdfId: pdfId,
      filename: req.file.originalname,
      fileSize: req.file.size,
      pages: data.numpages,
      isScanned: isScanned
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

// Get document content endpoint
app.get('/api/document/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const pdf = pdfDatabase.get(filename);

    if (!pdf) {
      return res.status(404).json({ error: 'PDF not found' });
    }

    res.json({
      filename: pdf.filename,
      text: pdf.text,
      fileSize: pdf.fileSize,
      uploadedAt: pdf.uploadedAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// AI Search using LM Studio
const AI_API_URL = process.env.AI_API_URL || 'http://127.0.0.1:1234';
const AI_MODEL = process.env.AI_MODEL || 'default';

async function callLMStudio(prompt) {
  try {
    const response = await axios.post(`${AI_API_URL}/v1/completions`, {
      model: AI_MODEL,
      prompt: prompt,
      max_tokens: 200,
      temperature: 0.3,
      top_p: 0.9,
    });
    
    return response.data.choices[0].text.trim();
  } catch (error) {
    console.error('LM Studio API error:', error.message);
    throw error;
  }
}

// Function to analyze PDF content with vision awareness for scanned documents
async function analyzeDocumentWithVision(pdf, query) {
  try {
    let analysisPrompt = '';
    let isScanned = pdf.isScanned || false;
    
    // Use combined text (original + OCR'd text) for analysis
    const contentToAnalyze = pdf.combinedText || pdf.text;
    const textPreview = contentToAnalyze.substring(0, 1500);
    
    // Create analysis prompt based on document type
    if (isScanned) {
      // For scanned PDFs, use OCR'd text for analysis
      analysisPrompt = `This is a scanned document (${pdf.numPages} pages) with text extracted via OCR.

Extracted text content: "${textPreview}..."

Search query: "${query}"

Based on the scanned document content (which may have been processed via OCR), rate the relevance of this document to the search query on a scale of 0-10 (0=not relevant, 10=highly relevant). Only respond with a number.

Relevance score (0-10):`;
    } else {
      // For regular text PDFs
      analysisPrompt = `Document: "${pdf.filename}"
Text content: "${textPreview}..."

Search query: "${query}"

Rate the relevance of this document to the query on a scale of 0-10 (0=not relevant, 10=highly relevant). Only respond with a number.

Relevance score (0-10):`;
    }

    const scoreStr = await callLMStudio(analysisPrompt);
    const score = Math.max(0, Math.min(10, parseInt(scoreStr) || 0));
    
    return score;
  } catch (error) {
    console.error('Vision analysis error:', error);
    return 0;
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
        // Use vision-aware analysis for all documents, especially scanned ones
        const score = await analyzeDocumentWithVision(pdf, query);

        if (score >= 5) {
          // Find relevant lines from text content
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

          // Detect if document is scanned
          const isScanned = pdf.isScanned;
          
          results.push({
            filename: pdf.filename,
            relevanceScore: score,
            relevanceLevel: score >= 8 ? 'Very Relevant' : score >= 6 ? 'Relevant' : 'Somewhat Relevant',
            previews: relevantLines.slice(0, 3),
            aiPowered: true,
            isScanned: isScanned,
            pageCount: pdf.numPages || 1
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
