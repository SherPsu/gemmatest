# PDF Upload & Search Application

A simple web application to upload PDFs and search their content by filename or text within the documents.

## Features

- 📤 **Upload PDFs** - Drag and drop or click to upload PDF files
- 🔍 **Full-Text Search** - Search by filename or PDF content
- 📊 **Quick Preview** - View matching excerpts from PDFs
- 🗑️ **Manage Files** - Delete uploaded PDFs
- 📱 **Responsive Design** - Works on desktop and mobile

## Tech Stack

- **Backend**: Node.js + Express
- **Frontend**: HTML + CSS + JavaScript
- **PDF Processing**: pdf-parse
- **File Upload**: Multer

## Installation

1. Navigate to the project directory:
```bash
cd gemma
```

2. Install dependencies:
```bash
npm install
```

3. Create uploads directory (if it doesn't exist):
```bash
mkdir uploads
```

## Running the Application

### Development Mode (with auto-reload):
```bash
npm run dev
```

### Production Mode:
```bash
npm start
```

The application will be available at `http://localhost:3000`

## How to Use

### Upload a PDF:
1. Click the upload box or drag and drop a PDF file
2. Click the "Upload PDF" button
3. Wait for the upload to complete

### Search PDFs:
1. Enter your search query in the search box
2. Press Enter or click the "Search" button
3. View matching PDFs with preview excerpts

### Delete PDFs:
1. Find the PDF in the "Uploaded PDFs" section
2. Click the "Delete" button

## API Endpoints

- **POST /api/upload** - Upload a new PDF
- **GET /api/pdfs** - Get list of all uploaded PDFs
- **POST /api/search** - Search PDFs by query
- **DELETE /api/pdfs/:filename** - Delete a PDF

## Notes

- Only PDF files are accepted
- PDFs are stored in the `uploads/` directory
- Search is case-insensitive
- Maximum file size depends on system resources (default: unlimited)

## Future Enhancements

- Database integration for persistence
- Advanced search filters
- PDF preview/viewer
- User authentication
- Cloud storage integration
