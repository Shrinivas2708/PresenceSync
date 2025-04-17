import processLLMResponseAndInsert from "./addToDB";
import axios from "axios";
import xlsx from "xlsx";
import { GoogleGenAI } from "@google/genai";
import fs from "fs";
async function processXlsxWithGeminiAndInsertFree(googleDriveXlsxUrl, db) {
    try {
        // Step 1: Download XLSX from Google Drive
        console.log("Fetching XLSX file from Google Drive...");
        // const response = await axios.get(googleDriveXlsxUrl, { responseType: "arraybuffer" });
        // const response =  googleDriveXlsxUrl
        const response = fs.readFileSync(googleDriveXlsxUrl);
        // Step 2: Convert XLSX to JSON
        console.log("Converting XLSX to JSON...");
        const workbook = xlsx.read(response, { type: "buffer" });
        const sheetName = workbook.SheetNames[0]; // Get first sheet
        const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName]);

        console.log("Extracted Data:", jsonData);

        // Step 3: Prepare Prompt for Gemini
        const prompt = `
        You are an AI agent that processes XLSX data for MongoDB. Format your response EXACTLY as shown in the example below, maintaining all tags, structure, and attributes precisely.

        **Format Example:**
        <MongoArtifact>
        <MongoCollection type="CommonCollection" name="Branch">
        <MongoData for="Branch">
        [{
          "name": "IT",
          "createdAt": <TIMESTAMP>,
          "updatedAt": <TIMESTAMP>
        }]
        </MongoData>
        </MongoCollection>
        </MongoArtifact>
        <MongoArtifact>
        <MongoCollection type="CommonCollection" name="Specialization">
        <MongoData for="Specialization">
        [{
          "name": "SMAD",
          "createdAt": <TIMESTAMP>,
          "updatedAt": <TIMESTAMP>
        }]
        </MongoData>
        </MongoCollection>
        </MongoArtifact>
        <MongoArtifact>
        <MongoCollection type="CommonCollection" name="Department">
        <MongoData for="Department">
        [{
          "name": "SOC",
          "createdAt": <TIMESTAMP>,
          "updatedAt": <TIMESTAMP>
        }]
        </MongoData>
        </MongoCollection>
        </MongoArtifact>
        <MongoInfo type="done">
        "Done extracting and finding common fields"
        </MongoInfo>
        <MongoInfo type="report">
        "Duplicate record found: Name: John Doe, Branch: IT, Specialization: SMAD, Mobile No: 1234567890, Email: john@example.com, Department: SOC"
        </MongoInfo>
        <MongoArtifact>
        <MongoCollection type="uniqueCollection" name="Students">
        <MongoData for="Students">
        [{
          "name": "John Doe",
          "mobile_no": "1234567890",
          "email": "john@example.com",
          "branch_id": <Ref type="Branch" name="IT">,
          "specialization_id": <Ref type="Specialization" name="SMAD">,
          "department_id": <Ref type="Department" name="SOC">,
          "createdAt": <TIMESTAMP>,
          "updatedAt": <TIMESTAMP>
        }]
        </MongoData>
        </MongoCollection>
        </MongoArtifact>
        <MongoInfo type="done">
        "Done with the extracting the unique collection"
        </MongoInfo>
        <MongoInfo type="exit"/>

        Rules:
        1. Each common field (Branch, Department, Specialization) gets its own <MongoArtifact> with type="CommonCollection"
        2. Use <MongoData for="CollectionName"> to wrap the actual JSON array
        3. For unique collections, use name="Students" and include references to common fields with <Ref type="Branch" name="IT"> format
        4. Report duplicates with <MongoInfo type="report">
        5. End with <MongoInfo type="exit"/>
        6. DO NOT deviate from this format - use EXACTLY the same tag structure and nesting
        7. Each field name in your JSON MUST match the example (e.g., "name", "mobile_no", "email", "branch_id", etc.)

        XLSX Data (Converted to JSON):
        ${JSON.stringify(jsonData, null, 2)}
    `;

        console.log("Prompt for Gemini:", prompt);

        // Step 4: Call Gemini API using the new approach
        const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
        
        // Breaking the data into chunks if needed
        const chunkSize = 4000;
        const promptChunks = [];
        for (let i = 0; i < prompt.length; i += chunkSize) {
            promptChunks.push(prompt.slice(i, i + chunkSize));
        }
        
        // Use gemini-2.0-flash model which should be available in the free tier
        let fullResponse = "";
        for (const chunk of promptChunks) {
            const response = await ai.models.generateContent({
                model: "gemini-2.0-flash",  // Using the free model you suggested
                contents: chunk,
            });
            
            fullResponse += response.text;
        }

        console.log("Gemini API Response:", fullResponse);

        // Step 5: Process and Insert into MongoDB
         processLLMResponseAndInsert(fullResponse, db).then((res) => {
            console.log("MongoDB Response:", res);
            console.log("Data successfully processed and inserted into MongoDB.");
        }).catch((error) => {
            console.error("Error inserting data into MongoDB:", error);
        });
        console.log("Processing complete.");

    } catch (error) {
        console.error("Error processing XLSX data:", error);
        // Enhanced error handling
        if (error.response) {
            console.error("API Response Error:", error.response.data);
            console.error("Status:", error.response.status);
        } else if (error.request) {
            console.error("No response received:", error.request);
        } else {
            console.error("Error setting up request:", error.message);
        }
        // Propagate error for handling by caller
        throw error;
    }
}

export default processXlsxWithGeminiAndInsertFree;