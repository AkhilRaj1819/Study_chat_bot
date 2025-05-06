require('dotenv').config();
const express = require('express');
const multer = require('multer');
const pdfParse = require('pdf-parse');
const cors = require('cors');

const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
app.use(cors());

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Setup Multer for PDF upload
const upload = multer({ storage: multer.memoryStorage() });

app.use(express.json());

// Route: POST /chatbot-file (accepts a PDF file)
app.post('/chatbot-file', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded.' });
  }

  try {
    // Extract text from uploaded PDF
    const pdfBuffer = req.file.buffer;
    const data = await pdfParse(pdfBuffer);
    const extractedText = data.text;
    console.log('Extracted text:', extractedText);
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

    const prompt = `
You are an AI tutor that generates flashcards from study material.
Take the following content and convert it into flashcards in strict JSON format only.
Your response must be ONLY valid JSON with no additional text, markdown formatting, or code blocks.

Format:
{
  "flashcards": [
    { "question": "Question 1", "answer": "Answer 1" },
    { "question": "Question 2", "answer": "Answer 2" }
  ]
}

Input:
${extractedText}
`;

    const result = await model.generateContent([{ text: prompt }]);
    let rawText = result.response.text();

    // Clean up the response to handle common JSON formatting issues
    // Remove any markdown code block markers
    rawText = rawText.replace(/```json/g, '').replace(/```/g, '');
    // Trim whitespace
    rawText = rawText.trim();

    // Validate JSON
    let jsonResponse;
    try {
      jsonResponse = JSON.parse(rawText);

      // Validate the structure
      if (!jsonResponse.flashcards || !Array.isArray(jsonResponse.flashcards)) {
        throw new Error('Response missing required "flashcards" array');
      }

      // Ensure each flashcard has question and answer
      jsonResponse.flashcards = jsonResponse.flashcards.filter(card =>
        card && typeof card === 'object' && card.question && card.answer
      );

      if (jsonResponse.flashcards.length === 0) {
        throw new Error('No valid flashcards found in response');
      }

    } catch (err) {
      console.error('JSON parsing error:', err.message);
      console.error('Raw text:', rawText);
      return res.status(500).json({
        error: 'Model output was not valid JSON. ' + err.message,
        raw: rawText.substring(0, 500) // Limit the raw text to avoid huge responses
      });
    }

    res.json(jsonResponse);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to process PDF and generate flashcards.' });
  }
});

// Start server
const PORT = process.env.PORT || 5001;
app.listen(PORT, () => {
  console.log(`Chatbot backend running on http://localhost:${PORT}`);
});
