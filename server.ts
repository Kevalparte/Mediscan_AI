import express from "express";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import fs from "fs";
import { initializeApp, getApps, applicationDefault } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";

// Load environment variables
dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || "3000", 10);

// Resolve Firebase config from env vars or fallback to local config file
function loadFirebaseConfig(): Record<string, string> {
  // Prefer environment variables
  if (process.env.FIREBASE_PROJECT_ID) {
    return {
      projectId: process.env.FIREBASE_PROJECT_ID,
      appId: process.env.FIREBASE_APP_ID || "",
      apiKey: process.env.FIREBASE_API_KEY || "",
      authDomain: process.env.FIREBASE_AUTH_DOMAIN || "",
      firestoreDatabaseId: process.env.FIREBASE_FIRESTORE_DB_ID || "(default)",
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || "",
      messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || "",
    };
  }

  // Fallback to local config file for development
  const configPath = path.join(process.cwd(), "firebase-applet-config.json");
  if (fs.existsSync(configPath)) {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  }

  console.error("Firebase config not found. Set FIREBASE_PROJECT_ID env var or provide firebase-applet-config.json");
  process.exit(1);
}

const firebaseConfig = loadFirebaseConfig();

// Lazy Initialize Firebase Admin SDK securely for backend operations
let firebaseAdminAppInitialized = false;
function ensureFirebaseAdmin(): void {
  if (!firebaseAdminAppInitialized) {
    if (getApps().length > 0) {
      firebaseAdminAppInitialized = true;
      return;
    }
    try {
      initializeApp({
        credential: applicationDefault(),
        projectId: firebaseConfig.projectId,
      });
      console.log("Firebase Admin initialized with projectId:", firebaseConfig.projectId);
      firebaseAdminAppInitialized = true;
    } catch (e: any) {
      console.warn("Could not initialize Firebase Admin via applicationDefault, trying fallback:", e.message || e);
      try {
        initializeApp({
          projectId: firebaseConfig.projectId,
        });
        console.log("Firebase Admin initialized (fallback) with projectId:", firebaseConfig.projectId);
        firebaseAdminAppInitialized = true;
      } catch (innerErr: any) {
        console.warn("Firebase Admin init fallback also failed:", innerErr.message || innerErr);
        firebaseAdminAppInitialized = true;
      }
    }
  }
}

// Get the Firestore instance referencing the specific project database ID
function getAdminFirestore(): Firestore {
  ensureFirebaseAdmin();
  const dbId = firebaseConfig.firestoreDatabaseId;
  const apps = getApps();
  const appInstance = apps.length > 0 ? apps[0] : undefined;
  if (dbId && dbId !== "(default)") {
    return getFirestore(appInstance!, dbId);
  }
  return getFirestore(appInstance!);
}

// Set request payload limits for base64 image scanning
app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: true }));

// Initialize Gemini SDK with apiKey from environment
const geminiKey = process.env.GEMINI_API_KEY;
const ai = geminiKey ? new GoogleGenAI({ apiKey: geminiKey }) : null;

if (!ai) {
  console.warn("⚠️  GEMINI_API_KEY not set. AI features will be limited to Groq fallback.");
}

// Groq text completion utility
async function callGroqTextCompletion(prompt: string, expectJson: boolean = false): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || apiKey.includes("MY_GROQ") || apiKey.trim() === "") {
    throw new Error("Groq API key not configured. Set GROQ_API_KEY in your .env file.");
  }

  const groqModels = ["llama-3.3-70b-specdec", "llama-3.1-8b-instant", "mixtral-8x7b-32768"];
  let lastError: any = null;

  for (const modelName of groqModels) {
    try {
      console.log(`Attempting Groq completion using model: ${modelName}`);
      const payload: any = {
        model: modelName,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.2,
      };

      if (expectJson) {
        payload.response_format = { type: "json_object" };
      }

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Groq API error: ${response.status} - ${errText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || "";
      if (content) {
        console.log(`Groq completion succeeded with model: ${modelName}`);
        return content;
      }
    } catch (e: any) {
      console.warn(`Groq model ${modelName} failed:`, e.message || e);
      lastError = e;
    }
  }

  throw lastError || new Error("Failed to call Groq completion with all available models");
}

// Universal AI completion helper with Gemini + Groq fallback
async function callTextAIWithFallback(prompt: string, responseSchema: any = null): Promise<string> {
  const geminiModels = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];

  if (ai) {
    for (const model of geminiModels) {
      try {
        console.log(`Attempting query with Gemini model: ${model}`);
        const completion = await ai.models.generateContent({
          model: model,
          contents: prompt,
          config: responseSchema
            ? {
                responseMimeType: "application/json",
                responseSchema: responseSchema,
              }
            : undefined,
        });
        if (completion.text) {
          console.log(`Query succeeded with Gemini model: ${model}`);
          return completion.text;
        }
      } catch (geminiError: any) {
        console.warn(`Gemini model ${model} failed:`, geminiError.message || geminiError);
      }
    }
  }

  // Fallback to Groq
  console.log("Gemini unavailable. Falling back to Groq...");
  try {
    const isJson = !!responseSchema;
    const response = await callGroqTextCompletion(prompt, isJson);
    console.log("Groq text completion succeeded!");
    return response;
  } catch (groqError: any) {
    console.error("Groq fallback failed:", groqError.message || groqError);
    throw new Error(
      "Both Gemini and Groq AI services are currently unavailable. Please check your API keys and try again."
    );
  }
}

// OCR Space API Utility
async function OCRSpaceOCR(base64Image: string): Promise<string> {
  const ocrKey = process.env.OCR_SPACE_API_KEY;
  if (!ocrKey || ocrKey.includes("MY_OCR") || ocrKey.trim() === "") {
    console.warn("OCR_SPACE_API_KEY not configured. Skipping OCR extraction.");
    return "";
  }

  try {
    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        apikey: ocrKey,
        base64Image: base64Image,
        language: "eng",
        isOverlayRequired: "false",
        filetype: "JPG",
      }),
    });
    const result = await response.json();
    if (result && result.ParsedResults && result.ParsedResults.length > 0) {
      return result.ParsedResults[0].ParsedText || "";
    }
  } catch (error) {
    console.error("OCR Space API error:", error);
  }
  return "";
}

// OpenFDA API Utility
async function fetchFdaPrecaution(medicineName: string): Promise<string> {
  const fdaKey = process.env.OPENFDA_API_KEY;
  const apiKeyParam = fdaKey && !fdaKey.includes("MY_OPENFDA") ? `&api_key=${fdaKey}` : "";

  try {
    const response = await fetch(
      `https://api.fda.gov/drug/label.json?search=openfda.brand_name:"${encodeURIComponent(medicineName)}"+OR+openfda.generic_name:"${encodeURIComponent(medicineName)}"&limit=1${apiKeyParam}`
    );
    if (response.ok) {
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const result = data.results[0];
        const warnings = result.warnings ? result.warnings[0] : "";
        const usage = result.indications_and_usage ? result.indications_and_usage[0] : "";
        return `FDA Indications: ${usage.substring(0, 300)}... Warnings: ${warnings.substring(0, 300)}...`;
      }
    }
  } catch (e) {
    console.warn("FDA API query warning:", e);
  }
  return "";
}

// 1. API: Tablet Image Recognition or OCR text analysis
app.post("/api/scan-tablet", async (req, res) => {
  try {
    const { imageBase64, isPrescriptionOnly } = req.body;

    if (!imageBase64) {
      return res.status(400).json({ error: "Missing required product image/prescription data" });
    }

    // Strip base64 headers
    const rawBase64 = imageBase64.replace(/^data:image\/\w+;base64,/, "");
    // Run alternative OCR Space asynchronously for extra text grounding
    const extOcrText = await OCRSpaceOCR(imageBase64).catch(() => "");

    // Prepare system/prompt content
    const basePrompt = isPrescriptionOnly
      ? `You are an expert clinical prescription parser. Identify ALL of the printed or handwritten medicine names, dosage timings, frequencies, and directions listed on this medical prescription.
         You MUST extract informational guidance for every single medicine identified. Do not pick just one principal medication!
         For EACH medicine identified, fill in the nested details inside the 'medicines' array list.
         Also fill the root level fields summary:
         'medicineName': comma-separated list of all found medicine names,
         'purpose', 'dosage', 'sideEffects', and 'precautions' summarizing details for all medicines.`
      : `You are a certified clinical pharmacist assistant. 
         Identify the medicine tablet, capsule, strip, or medication bottle in the image.
         Analyze the text, imprint, shape, and colors. Extract the medicine brand/generic name, 
         explain in clear plain details what it is used for (purpose), how/when to take it (dosage guidelines), 
         critical side effects, and precautions. Flag safety warnings clearly! Include it as the single entry inside the 'medicines' array list as well.`;

    // Prompt instructions including OCR secondary clues if available
    const promptInstructions = `
      ${basePrompt}
      ${extOcrText ? `Secondary Grounding Text from OCR: ${extOcrText}` : ""}
      
      You must respond ONLY with a JSON object following this exact structure:
      {
        "medicineName": "string representing primary name identified, or comma separated list of all names",
        "purpose": "A simple clear explanation of what this compound is used for in plain layman language",
        "dosage": "A clear description of when and how to take this drug (dosage, timings, with or without food)",
        "sideEffects": "Common and severe side effects to be aware of",
        "precautions": "Important warnings (pregnancy, driving, alcohol, contraindications)",
        "isSafe": true,
        "severity": "safe",
        "medicines": [
          {
            "name": "string representing this medicine's name",
            "purpose": "A simple clear explanation of what this specific compound is used for",
            "dosage": "Clear instruction of when and how to take this specific drug",
            "sideEffects": "Common side effects for this specific medicine",
            "precautions": "Unique precautions for this specific medicine",
            "severity": "safe"
          }
        ]
      }
      If the drug is highly restricted, has direct dangerous interactions, or contains serious errors, set severity to 'caution' or 'dangerous'.
    `;

    let scanResultText = "";
    let success = false;

    // Try Gemini models first
    const geminiModelsToTry = ["gemini-2.5-flash", "gemini-2.0-flash", "gemini-1.5-flash"];
    if (ai) {
      for (const model of geminiModelsToTry) {
        if (success) break;
        try {
          console.log(`Attempting medication analysis with Gemini model: ${model}`);
          const completion = await ai.models.generateContent({
            model: model,
            contents: [
              {
                inlineData: {
                  data: rawBase64,
                  mimeType: "image/jpeg",
                },
              },
              promptInstructions,
            ],
            config: {
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  medicineName: { type: Type.STRING },
                  purpose: { type: Type.STRING },
                  dosage: { type: Type.STRING },
                  sideEffects: { type: Type.STRING },
                  precautions: { type: Type.STRING },
                  isSafe: { type: Type.BOOLEAN },
                  severity: {
                    type: Type.STRING,
                    enum: ["safe", "caution", "dangerous"],
                  },
                  medicines: {
                    type: Type.ARRAY,
                    description: "Details for each identified medicine in the prescription/image",
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        name: { type: Type.STRING },
                        purpose: { type: Type.STRING },
                        dosage: { type: Type.STRING },
                        sideEffects: { type: Type.STRING },
                        precautions: { type: Type.STRING },
                        severity: {
                          type: Type.STRING,
                          enum: ["safe", "caution", "dangerous"],
                        },
                      },
                      required: ["name", "purpose", "dosage", "sideEffects", "precautions"],
                    },
                  },
                },
                required: ["medicineName", "purpose", "dosage", "sideEffects", "precautions", "isSafe", "severity"],
              },
            },
          });
          if (completion.text) {
            scanResultText = completion.text;
            success = true;
            console.log(`Medication analysis succeeded with Gemini model: ${model}`);
          }
        } catch (geminiError: any) {
          console.warn(`Gemini model ${model} failed:`, geminiError.message || geminiError);
        }
      }
    }

    // Fallback to Groq text completion using OCR text
    if (!success) {
      console.log("Gemini unavailable. Initiating Groq OCR text fallback...");
      try {
        const groqPrompt = `
          You are an expert clinical pharmacologist.
          We received an image scan of a medicine or prescription but the visual model is unavailable.
          We have extracted the textual markings using OCR.
          
          Based on the OCR text below, identify the medicine brand or generic name(s), usage directions, dosages, side effects, and precautions.
          
          OCR Extracted Text:
          """
          ${extOcrText || "(No direct text markings detected. Treat as generic clinical instruction or unknown medicine)"}
          """
          
          ${isPrescriptionOnly ? "This is a PRESCRIPTION. Parse all medicine names and dosage directions listed." : "This is a TABLET/capsule package or bottle."}
          
          You must output a single JSON object matching this exact schema:
          {
            "medicineName": "string representing primary name(s) identified (if blank, use 'Unresolved Medicine')",
            "purpose": "A simple clear explanation of what this compound is used for in plain layman language",
            "dosage": "A clear description of when and how to take this drug (dosage, timings, with or without food)",
            "sideEffects": "Common and severe side effects to be aware of",
            "precautions": "Important warnings (pregnancy, driving, alcohol, contraindications)",
            "isSafe": true,
            "severity": "safe",
            "medicines": [
              {
                "name": "string representing this medicine's name",
                "purpose": "purpose of this drug",
                "dosage": "how to take",
                "sideEffects": "side effects",
                "precautions": "precautions",
                "severity": "safe"
              }
            ]
          }
          where severity is "safe", "caution", or "dangerous".
          
          Return ONLY the valid raw JSON object. Do not include markdown wraps or anything else.
        `;

        const groqCompletion = await callGroqTextCompletion(groqPrompt, true);
        if (groqCompletion) {
          scanResultText = groqCompletion;
          success = true;
          console.log("Groq OCR text fallback succeeded!");
        }
      } catch (groqError: any) {
        console.error("Groq fallback also failed:", groqError.message || groqError);
      }
    }

    if (!success) {
      throw new Error(
        "AI services are currently unavailable. Please check your API keys (GEMINI_API_KEY, GROQ_API_KEY) and try again."
      );
    }

    const parsedResponse = JSON.parse(scanResultText || "{}");

    // Augment with openFDA if it's a specific recognized brand
    if (parsedResponse.medicineName && parsedResponse.medicineName !== "Unknown") {
      const fdaData = await fetchFdaPrecaution(parsedResponse.medicineName);
      if (fdaData) {
        parsedResponse.precautions = `${parsedResponse.precautions}\n\nClinical Reference: ${fdaData}`;
      }
    }

    res.json(parsedResponse);
  } catch (error: any) {
    console.error("Error scanning tablet:", error);
    res.status(500).json({ error: error.message || "Failed to analyze tablet image" });
  }
});

// 2. API: Drug Interaction Checker
app.post("/api/check-interactions", async (req, res) => {
  try {
    const { medicines } = req.body;

    if (!medicines || !Array.isArray(medicines) || medicines.length < 2) {
      return res.status(400).json({ error: "Please input at least 2 medicine names to check for interactions" });
    }

    const medicinesList = medicines.join(", ");
    const prompt = `
      You are a clinical pharmacologist. Check for drug-drug interactions between these medicines: ${medicinesList}.
      Provide a highly accurate, objective, and plain-language assessment of taking them together.
      Specify:
      1. Severity of interaction: safe (no known severe issues), caution (can be taken with spacing/monitoring), or dangerous (high warning, seek clinical advice immediately).
      2. Clear explanation explaining why the interaction occurs and advice on safe usage.
      
      You must respond ONLY with a JSON object following this exact structure:
      {
        "severity": "safe" | "caution" | "dangerous",
        "explanation": "Plain explanation detailing molecular or compound synergy/reaction",
        "medicines": ["medicine1", "medicine2"]
      }
    `;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        severity: { type: Type.STRING, enum: ["safe", "caution", "dangerous"] },
        explanation: { type: Type.STRING },
        medicines: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
      },
      required: ["severity", "explanation", "medicines"],
    };

    const completionText = await callTextAIWithFallback(prompt, responseSchema);
    const parsedResult = JSON.parse(completionText || "{}");
    res.json(parsedResult);
  } catch (error: any) {
    console.error("Error checking interactions:", error);
    res.status(500).json({ error: error.message || "Failed to check interactions" });
  }
});

// 3. API: Universal Medicine Lookup Search
app.post("/api/search-medicine", async (req, res) => {
  try {
    const { medicineName } = req.body;
    if (!medicineName || typeof medicineName !== "string" || medicineName.trim() === "") {
      return res.status(400).json({ error: "Missing required parameter: medicineName" });
    }

    const trimmedName = medicineName.trim();
    const prompt = `You are a certified clinical pharmacist assistant. Provide comprehensive, accurate, and easy-to-understand medicine details for the medicine: "${trimmedName}". 
Fill in the fields accurately in plain english: explain what it is used for (purpose), standard general dosage instructions and frequency (dosage), common side effects, and important health/safety precautions.
Set isSafe to false if it has severe common counter-indications or serious risks. Set severity to 'safe', 'caution', or 'dangerous' depending on the typical clinical profile and risk factors.`;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        medicineName: { type: Type.STRING },
        purpose: { type: Type.STRING },
        dosage: { type: Type.STRING },
        sideEffects: { type: Type.STRING },
        precautions: { type: Type.STRING },
        isSafe: { type: Type.BOOLEAN },
        severity: {
          type: Type.STRING,
          enum: ["safe", "caution", "dangerous"],
        },
      },
      required: ["medicineName", "purpose", "dosage", "sideEffects", "precautions", "isSafe", "severity"],
    };

    const aiText = await callTextAIWithFallback(prompt, responseSchema);
    const parsed = JSON.parse(aiText);

    // Try finding FDA precautions too
    const fdaData = await fetchFdaPrecaution(parsed.medicineName || trimmedName);
    if (fdaData) {
      parsed.precautions = `${parsed.precautions}\n\n[FDA Label Warnings]: ${fdaData}`;
    }

    res.json({ success: true, result: parsed });
  } catch (error: any) {
    console.error("Error searching medicine info:", error);
    res.status(500).json({ error: error.message || "Failed to retrieve medicine details." });
  }
});

// 4. API: Multi-lingual Medical Field Translation
app.post("/api/translate-medicine", async (req, res) => {
  try {
    const { purpose, dosage, sideEffects, precautions, targetLang, medicines } = req.body;

    if (!targetLang || !["hi", "mr", "en"].includes(targetLang)) {
      return res.status(400).json({ error: "Invalid target language" });
    }

    if (targetLang === "en") {
      return res.json({ purpose, dosage, sideEffects, precautions, medicines });
    }

    const languageName = targetLang === "hi" ? "Hindi (हिंदी)" : "Marathi (मराठी)";

    // If batch translating an array of medicines
    if (medicines && Array.isArray(medicines) && medicines.length > 0) {
      const prompt = `
        You are an expert bilingual medical translator in India.
        Translate the following list of medical compounds/medicines from English into natural, empathetic, and standard colloquial ${languageName}.
        
        Ensure brand/generic names, side effects, dosage frequencies, numbers, and warnings remain absolutely accurate and matches standard Indian medical contexts.
        
        Medicines list:
        ${JSON.stringify(medicines, null, 2)}
        
        You must respond ONLY with a JSON object following this exact schema:
        {
          "medicines": [
            {
              "name": "untouchable or translated name depending on standard usage (keep brand name recognisable if standard, e.g. 'क्रोसिन (Crocin)')",
              "purpose": "translated purpose of this medicine",
              "dosage": "translated dosage instructions for this medicine",
              "sideEffects": "translated side effects",
              "precautions": "translated precautions",
              "severity": "same severity matching the source medicine"
            }
          ]
        }
      `;

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          medicines: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                name: { type: Type.STRING },
                purpose: { type: Type.STRING },
                dosage: { type: Type.STRING },
                sideEffects: { type: Type.STRING },
                precautions: { type: Type.STRING },
                severity: { type: Type.STRING },
              },
              required: ["name", "purpose", "dosage", "sideEffects", "precautions"],
            },
          },
        },
        required: ["medicines"],
      };

      const completionText = await callTextAIWithFallback(prompt, responseSchema);
      const parsedTranslations = JSON.parse(completionText || "{}");
      return res.json(parsedTranslations);
    }

    const prompt = `
      You are an expert bilingual medical translator in India.
      Translate the following medical descriptions from English into perfectly natural, empathetic, and standard colloquial ${languageName}. 
      Ensure safety details, numbers, and dosage limits remain absolutely accurate.
      
      Please translate:
      1. Purpose: "${purpose}"
      2. Dosage: "${dosage}"
      3. Side Effects: "${sideEffects}"
      4. Precautions: "${precautions}"
      
      You must respond ONLY with a JSON object containing the translations of these 4 fields under the exact same keys:
      {
        "purpose": "translated purpose",
        "dosage": "translated dosage",
        "sideEffects": "translated side effects",
        "precautions": "translated precautions"
      }
    `;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        purpose: { type: Type.STRING },
        dosage: { type: Type.STRING },
        sideEffects: { type: Type.STRING },
        precautions: { type: Type.STRING },
      },
      required: ["purpose", "dosage", "sideEffects", "precautions"],
    };

    const completionText = await callTextAIWithFallback(prompt, responseSchema);
    const parsedTranslations = JSON.parse(completionText || "{}");
    res.json(parsedTranslations);
  } catch (error: any) {
    console.error("Translation error:", error);
    res.status(500).json({ error: error.message || "Failed to translate medication text" });
  }
});

// 5. API: Translate Drug Interaction Diagnostic Report
app.post("/api/translate-interaction", async (req, res) => {
  try {
    const { explanation, targetLang } = req.body;

    if (!targetLang || !["hi", "mr", "en"].includes(targetLang)) {
      return res.status(400).json({ error: "Invalid target language" });
    }

    if (targetLang === "en" || !explanation) {
      return res.json({ explanation });
    }

    const languageName = targetLang === "hi" ? "Hindi (हिंदी)" : "Marathi (मराठी)";

    const prompt = `
      You are an expert bilingual pharmaceutical translator in India.
      Translate the following drug-drug interaction report explanation from English into perfectly natural, empathetic, clear, and standard colloquial ${languageName}.
      Ensure all safety details, chemical or brand names, severe alert terms, and numbers remain absolutely accurate so the patient is fully protected and understands clearly.

      Text to translate:
      "${explanation}"

      You must respond ONLY with a JSON object containing the translations under the key "explanation" in this exact schema:
      {
        "explanation": "the perfectly translated explanation text"
      }
    `;

    const responseSchema = {
      type: Type.OBJECT,
      properties: {
        explanation: { type: Type.STRING },
      },
      required: ["explanation"],
    };

    const completionText = await callTextAIWithFallback(prompt, responseSchema);
    const parsedTranslations = JSON.parse(completionText || "{}");
    res.json(parsedTranslations);
  } catch (error: any) {
    console.error("Interaction translation error:", error);
    res.status(500).json({ error: error.message || "Failed to translate drug interaction report" });
  }
});

// 6. API: Medical Conversational Assistant Bot
app.post("/api/chat", async (req, res) => {
  try {
    const { messages, scannedMedicine } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    // Format chat history for Gemini
    const lastMessage = messages[messages.length - 1]?.content;
    const historyPrompt = messages
      .slice(0, -1)
      .map((m: any) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`)
      .join("\n");

    const activeMedicineContext = scannedMedicine
      ? `Active patient-scanned medicine context:\nName: ${scannedMedicine.medicineName}\nPurpose: ${scannedMedicine.purpose}\nDosage: ${scannedMedicine.dosage}\nSide Effects: ${scannedMedicine.sideEffects}\nPrecautions: ${scannedMedicine.precautions}`
      : "No specific scanned medicine currently active.";

    const fullPrompt = `
      You are MediScan AI assistant, an empathetic, expert, and certified clinical chatbot.
      Your goal is to answer patient questions regarding their medication safely. 
      If the user is asking general questions, guide them, but always prioritize direct answers without fluff.
      Always insert a professional, brief disclaimer that this chatbot is an aid and patients should consult a medical provider for definitive decisions.
      
      ${activeMedicineContext}
      
      Chat History:
      ${historyPrompt}
      
      User's query: "${lastMessage}"
      
      Please reply directly to the patient's query in easy, supportive language.
    `;

    const responseText = await callTextAIWithFallback(fullPrompt, null);
    res.json({
      reply:
        responseText || "I apologize, but I could not formulate an answer. How else can I assist you with your medications?",
    });
  } catch (error: any) {
    console.error("Error in chat service:", error);
    res.status(500).json({ error: error.message || "Failed to process chat" });
  }
});

// Serve frontend assets or mount Vite Middleware
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    // Mount Vite middlewares
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`MediScan AI Server running on http://localhost:${PORT}`);
  });
}

startServer();
