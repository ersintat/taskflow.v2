const { GoogleGenAI } = require('@google/genai');
require('dotenv').config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
async function checkModels() {
  try {
    const list = await ai.models.list();
    for await (const m of list) {
       console.log(m.name);
    }
  } catch (e) {
    console.error(e.message);
  }
}
checkModels();
