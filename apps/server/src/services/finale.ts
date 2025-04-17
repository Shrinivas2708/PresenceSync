import { GoogleGenAI } from "@google/genai";
import axios from "axios";
import xlsx from "xlsx";
import { ObjectId } from "mongodb";
import fs from "fs";

// Utility functions (isEqual, validateFieldUpdate, logChanges, etc. remain the same)
function isEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (typeof a !== typeof b) return false;

    if (a instanceof Date && b instanceof Date)
        return a.getTime() === b.getTime();

    if (Array.isArray(a) && Array.isArray(b)) {
        return a.length === b.length && a.every((val, i) => isEqual(val, b[i]));
    }

    if (typeof a === 'object' && a !== null && b !== null) {
        const aKeys = Object.keys(a);
        const bKeys = Object.keys(b);
        return aKeys.length === bKeys.length && aKeys.every(key => isEqual(a[key], b[key]));
    }

    return false;
}

function validateFieldUpdate(key: string, newValue: any, existingValue: any): void {
    const protectedFields = ['registrationDate', 'createdAt'];
    if (protectedFields.includes(key) && existingValue) {
        throw new Error(`${key} field cannot be modified`);
    }

    if (key === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newValue)) {
        throw new Error('Invalid email format');
    }

    if (key === 'mobile_no' && !/^\d{10}$/.test(newValue)) {
        throw new Error('Invalid mobile number format');
    }
}

async function logChanges(
    userId: string,
    collectionName: string,
    docId: any,
    changes: any,
    db: any
): Promise<void> {
    await db.collection('audit_logs').insertOne({
        userId,
        collection: collectionName,
        documentId: docId,
        changes,
        timestamp: new Date()
    });
}
// Enhanced processing function with batch operations (processLLMResponseAndInsert remains the same)
async function processLLMResponseAndInsert(response: string, db: any) {
    try {
        console.log('[SYSTEM] Starting processing...');
        const parsedData = parseMongoOutput(response);
        const objectIdMap: Record<string, string> = {};

        // Process Common Collections in batches
        for (const artifact of parsedData.artifacts) {
            for (const collection of artifact.collections) {
                if (collection.type === "CommonCollection") {
                    const collectionName = collection.name;

                    // Create collection if needed
                    if ((await db.listCollections({ name: collectionName }).toArray()).length === 0) {
                        console.log(`[INFO] Creating collection: ${collectionName}`);
                        await db.createCollection(collectionName);
                    }

                    // Batch processing
                    const batchSize = 100;
                    for (let i = 0; i < collection.data.length; i += batchSize) {
                        const batch = collection.data.slice(i, i + batchSize);
                        const bulkOps = [];

                        for (const item of batch) {
                            const newItem = processItemTimestamps(item);
                            const query = buildUniqueQuery(newItem, collection.uniqueFields, true);

                            const existing = await db.collection(collectionName).findOne(query);
                            if (existing) {
                                const changes = calculateChanges(existing, newItem);
                                if (Object.keys(changes).length > 0) {
                                    bulkOps.push({
                                        updateOne: {
                                            filter: { _id: existing._id },
                                            update: { $set: changes }
                                        }
                                    });
                                    await logChanges('system', collectionName, existing._id, changes, db); // Log update changes
                                }
                                objectIdMap[`${collectionName}_${newItem.name}`] = existing._id.toString();
                            } else {
                                bulkOps.push({
                                    insertOne: {
                                        document: { ...newItem, createdAt: new Date(), updatedAt: new Date() }
                                    }
                                });
                                await logChanges('system', collectionName, 'new', newItem, db); // Log insert
                            }
                        }

                        if (bulkOps.length > 0) {
                            const result = await db.collection(collectionName).bulkWrite(bulkOps);
                            if (result && result.insertedIds) {
                                Object.keys(result.insertedIds).forEach((key) => {
                                    const id = result.insertedIds[key];
                                    const item = batch[parseInt(key)];
                                    objectIdMap[`${collectionName}_${item.name}`] = id.toString();
                                });
                            } else {
                                console.warn(`[WARN] result.insertedIds is not an object for ${collectionName}. bulkWrite result:`, result);
                            }
                            console.log(`[INFO] Processed ${bulkOps.length} documents in ${collectionName}`);
                        }
                    }
                }
            }
        }

        // Process Unique Collections with reference validation
        for (const artifact of parsedData.artifacts) {
            for (const collection of artifact.collections) {
                if (collection.type === "uniqueCollection") {
                    const collectionName = collection.name;

                    const batchSize = 100;
                    for (let i = 0; i < collection.data.length; i += batchSize) {
                        const batch = collection.data.slice(i, i + batchSize);
                        const bulkOps = [];

                        for (const item of batch) {
                            const newItem = processItemTimestamps(item);
                            resolveReferences(newItem, objectIdMap);

                            const query = buildUniqueQuery(newItem, collection.uniqueFields);
                            const existing = await db.collection(collectionName).findOne(query);

                            if (existing) {
                                const changes = calculateChanges(existing, newItem);
                                if (Object.keys(changes).length > 0) {
                                    bulkOps.push({
                                        updateOne: {
                                            filter: { _id: existing._id },
                                            update: { $set: changes }
                                        }
                                    });
                                    await logChanges('system', collectionName, existing._id, changes, db); // Log Update Changes
                                }
                            } else {
                                bulkOps.push({
                                    insertOne: {
                                        document: { ...newItem, createdAt: new Date(), updatedAt: new Date() }
                                    }
                                });
                                await logChanges('system', collectionName, 'new', newItem, db); // Log insert
                            }
                        }

                        if (bulkOps.length > 0) {
                            const result = await db.collection(collectionName).bulkWrite(bulkOps, { ordered: false });
                            if (result && result.insertedIds) {
                                Object.keys(result.insertedIds).forEach((key) => {
                                    const id = result.insertedIds[key];
                                    const item = batch[parseInt(key)];
                                    objectIdMap[`${collectionName}_${item.name}`] = id.toString();
                                });
                            } else {
                                console.warn(`[WARN] result.insertedIds is not an object for ${collectionName}. bulkWrite result:`, result);
                            }
                            console.log(`[INFO] Processed ${bulkOps.length} documents in ${collectionName}`);
                        }
                    }
                }
            }
        }

        // Handle info messages
        if (Array.isArray(parsedData.info)) {
            parsedData.info.forEach(info => {
                const logMethod = {
                    error: console.error,
                    report: console.warn,
                    done: console.log,
                    exit: () => console.log('[SYSTEM] Process completed')
                }[info.type] || console.log;

                logMethod(`[INFO] ${info.type}: ${info.message}`);
            });
        } else {
            console.warn("[WARN] parsedData.info is not an array. Info messages might be missing.");
        }

        return { success: true, objectIdMap };
    } catch (error) {
        console.error('[SYSTEM] Processing failed:', error);
        return { success: false, error: error.message };
    }
}

// Helper functions (processItemTimestamps, buildUniqueQuery, resolveReferences, calculateChanges, parseMongoOutput, parseCollectionData remain the same)
function processItemTimestamps(item: any): any {
    return item;
}

function buildUniqueQuery(item: any, uniqueFields: string[], isCommon = false): any {
    const query: any = {};
    if (uniqueFields && uniqueFields.length > 0) {
        uniqueFields.forEach(field => {
            if (item[field] !== undefined) query[field] = item[field];
        });
    }

    if (isCommon && !Object.keys(query).length && item.name) {
        query.name = item.name;
    }
    console.log("Generated Unique Query:", query); // Debugging
    return query;
}

function resolveReferences(item: any, objectIdMap: Record<string, string>): void {
    Object.entries(item).forEach(([key, value]) => {
        if (typeof value === 'string' && value.startsWith('<Ref')) {
            const match = value.match(/<Ref type="([^"]+)" name="([^"]+)">/);
            if (match) {
                const refKey = `${match[1]}_${match[2]}`;
                if (!objectIdMap[refKey]) {
                    throw new Error(`Missing reference: ${refKey}`);
                }
                item[key] = new ObjectId(objectIdMap[refKey]);
            }
        }
    });
}

function calculateChanges(existing: any, newItem: any): any {
    return Object.keys(newItem).reduce((acc: any, key) => {
        if (['_id', 'createdAt'].includes(key)) return acc;
        if (!isEqual(existing[key], newItem[key])) {
            acc[key] = newItem[key];
        }
        return acc;
    }, {});
}

// Enhanced parser with validation
function parseMongoOutput(output: string) {
    const artifacts: any[] = [];
    const info: any[] = [];

    // Clean and validate output
    const cleanOutput = output
        .replace(/<\?xml.*?\?>/g, '')
        .replace(/<!DOCTYPE.*?>/g, '')
        .replace(/```xml/g, '')
        .replace(/```/g, '');

    // Parse artifacts
    const artifactMatches = Array.from(cleanOutput.matchAll(/<MongoArtifact>([\s\S]*?)<\/MongoArtifact>/g));

    for (const [, artifactContent] of artifactMatches) {
        const collections = Array.from(artifactContent.matchAll(
            /<MongoCollection\s+type="(CommonCollection|uniqueCollection)"\s+name="([^"]+)"(?:\s+uniqueFields="([^"]*)")?>([\s\S]*?)<\/MongoCollection>/g
        )).map(([, type, name, uniqueFields, content]) => ({
            type,
            name,
            uniqueFields: (uniqueFields || '').split(',').filter(Boolean),
            data: parseCollectionData(content)
        }));

        if (collections.length > 0) {
            artifacts.push({ collections });
        }
    }

    // Parse info messages
    const infoMatches = Array.from(cleanOutput.matchAll(/<MongoInfo\s+type="([^"]*)">([\s\S]*?)<\/MongoInfo>/g));
    for (const [, type, message] of infoMatches) {
        info.push({
            type,
            message: message.trim().replace(/^"(.*)"$/, '$1')
        });
    }

    if (artifacts.length === 0) {
        throw new Error('No valid MongoDB artifacts found in response');
    }

    return { artifacts, info };
}

function parseCollectionData(content: string): any[] {
    const dataMatch = content.match(/<MongoData\s+for="([^"]*)">([\s\S]*?)<\/MongoData>/);
    if (!dataMatch) return [];

    try {
        let dataContent = dataMatch[2].trim();
        const refPlaceholders: Record<string, any> = {};

        // Replace all special tags with JSON-safe placeholders
        dataContent = dataContent
            .replace(/<Ref\s+type="([^"]+)"\s+name="([^"]+)">/g, (_, type, name) => {
                const placeholder = `__REF_${type}_${name}__`;
                refPlaceholders[placeholder] = { type, name };
                return `"${placeholder}"`;
            })
            .replace(/<TIMESTAMP>/g, '"__TIMESTAMP__"');

        // Parse clean JSON
        const parsedData = JSON.parse(dataContent);

        // Process parsed data
        const processParsedItem = (item: any): any => {
            return Object.fromEntries(
                Object.entries(item).map(([key, value]) => {
                    if (value === "__TIMESTAMP__") {
                        return [key, new Date()];
                    }
                    if (typeof value === "string" && value.startsWith("__REF_")) {
                        const ref = refPlaceholders[value];
                        return [key, `<Ref type="${ref.type}" name="${ref.name}">`];
                    }
                    return [key, value];
                })
            );
        };

        return Array.isArray(parsedData)
            ? parsedData.map(processParsedItem)
            : [processParsedItem(parsedData)];
    } catch (e) {
        console.error('Data parsing error:', e);
        return [];
    }
}

// Gemini integration (processXlsxWithGeminiAndInsertFree remains the same, but with enhanced prompt)
async function processXlsxWithGeminiAndInsertFree(googleDriveXlsxUrl: string, db: any) {
    try {
        console.log(`[INFO] Processing XLSX from URL: ${googleDriveXlsxUrl}`);
        // Download and convert XLSX
        // const response = await axios.get(googleDriveXlsxUrl, { responseType: "arraybuffer" })
        const response = fs.readFileSync(googleDriveXlsxUrl); // Simulating file read for local testing
        const workbook = xlsx.read(response, { type: "buffer" });
        const jsonData = xlsx.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]]);

        // Enhanced prompt with explicit format rules
        const prompt = `
            You are an AI agent that processes XLSX data for MongoDB, focusing on an attendance management system. You'll handle various data types, including timetables, departments, teachers, and students. Format your response EXACTLY as shown in the examples below:

            <MongoArtifact>
                <MongoCollection type="CommonCollection" name="Department">
                    <MongoData for="Department">[
                        {"name": "Computer Science", "createdAt": <TIMESTAMP>, "updatedAt": <TIMESTAMP>}
                    ]</MongoData>
                </MongoCollection>
            </MongoArtifact>
            <MongoArtifact>
                <MongoCollection type="CommonCollection" name="Teacher">
                    <MongoData for="Teacher">[
                        {"name": "Dr. Smith", "department_id": <Ref type="Department" name="Computer Science">, "createdAt": <TIMESTAMP>, "updatedAt": <TIMESTAMP>}
                    ]</MongoData>
                </MongoCollection>
            </MongoArtifact>
            <MongoArtifact>
                <MongoCollection type="CommonCollection" name="TimeTable">
                    <MongoData for="TimeTable">[
                        {"day": "Monday", "time": "10:00 AM", "subject": "Data Structures", "teacher_id": <Ref type="Teacher" name="Dr. Smith">, "createdAt": <TIMESTAMP>, "updatedAt": <TIMESTAMP>}
                    ]</MongoData>
                </MongoCollection>
            </MongoArtifact>
            <MongoInfo type="done">"Common data extracted."</MongoInfo>
            <MongoArtifact>
                <MongoCollection type="uniqueCollection" name="Student" uniqueFields="email">
                    <MongoData for="Student">[
                        {
                            "name": "Alice Johnson",
                            "email": "alice@example.com",
                            "department_id": <Ref type="Department" name="Computer Science">,
                            "createdAt": <TIMESTAMP>
                        }
                    ]</MongoData>
                </MongoCollection>
            </MongoArtifact>
            <MongoInfo type="exit"/>

            STRICT RULES:
            1. Wrap ALL JSON arrays in <MongoData> tags.
            2. Use DOUBLE quotes for ALL JSON properties and values.
            3. Keep <TIMESTAMP> and <Ref> tags UNQUOTED in the JSON.
            4. Maintain EXACT XML structure from the example.
            5. Validate email and phone formats before including.
            6. DO NOT deviate from this format - use EXACTLY the same tag structure and nesting.
            7. Dont include any extra information or comments in the response.
            8. Ensure all fields are properly formatted and validated.
            9. Ensure proper reference mapping between collections (Teacher to Department, TimeTable to Teacher and Department, Student to Department).
            10. Handle time tables, teacher student specializations and all related data to attendance system.

            XLSX Data (Converted to JSON):
            ${JSON.stringify(jsonData, null, 2)}
        `;
        console.log("Prompt for Gemini API:", prompt);
        const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
        // Call Gemini API
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
                model: "gemini-2.0-flash",
                contents: chunk,
            });

            fullResponse += response.text;
        }

        console.log("Gemini API Response:", fullResponse);
        const processed = await processLLMResponseAndInsert(fullResponse, db);
        return processed;
    } catch (error) {
        console.error('Processing failed:', error);
        throw error;
    }
}

export default processXlsxWithGeminiAndInsertFree;