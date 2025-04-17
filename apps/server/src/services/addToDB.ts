// async function processLLMResponseAndInsert(response, db) {
//     try {
//         console.log('[TEST] Starting to process LLM response and insert into MongoDB...');

//         // Parse the response
//         const parsedData = parseMongoOutput(response);
//         console.log(`[TEST] Parsed ${parsedData.artifacts.length} artifacts and ${parsedData.info.length} info messages`);

//         console.log("[DEBUG] Parsed Data:", JSON.stringify(parsedData, null, 2)); // Debugging line

//         // Object to store ObjectIds of common collections
//         const objectIdMap = {};

//         // Process Common Collections first
//         console.log('[TEST] Processing Common Collections and inserting...');
//         for (const artifact of parsedData.artifacts) {
//             for (const collection of artifact.collections) {
//                 if (collection.type && collection.type.includes("CommonCollection")) {
//                     const collectionName = collection.name;
//                     console.log(`[TEST] Processing Common Collection: ${collectionName}`);

//                     if (Array.isArray(collection.data)) {
//                         for (const item of collection.data) {
//                             try {
//                                 const newItem = { ...item };
//                                 if (newItem.createdAt === "<TIMESTAMP>") newItem.createdAt = new Date();
//                                 if (newItem.updatedAt === "<TIMESTAMP>") newItem.updatedAt = new Date();

//                                 // Insert into MongoDB
//                                 const result = await db.collection(collectionName).insertOne(newItem);
//                                 const insertedId = result.insertedId.toString();

//                                 // Store the ObjectId with the item's name as the key
//                                 objectIdMap[`${collectionName}_${newItem.name}`] = insertedId;
//                                 console.log(`[TEST] Inserted into ${collectionName}: ${newItem.name} with ID: ${insertedId}`);
//                                 console.log(`[TEST] Document data:`, newItem);
//                             } catch (error) {
//                                 console.error(`[TEST] Error inserting into ${collectionName}: ${item.name || 'unnamed item'}`, error);
//                             }
//                         }
//                     } else {
//                         console.log(`[TEST] No valid data array for collection ${collectionName}`);
//                     }
//                     console.log(`[TEST] Finished processing Common Collection: ${collectionName}`);
//                 }
//             }
//         }
//         console.log('[TEST] Finished processing all Common Collections and inserting.');

//         console.log("[DEBUG] objectIdMap:", JSON.stringify(objectIdMap, null, 2)); // Debugging line

//         // Process Unique Collections
//         console.log('[TEST] Processing Unique Collections and inserting...');
//         for (const artifact of parsedData.artifacts) {
//             for (const collection of artifact.collections) {
//                 if (collection.type && collection.type.includes("uniqueCollection")) {
//                     const collectionName = collection.name;
//                     console.log(`[TEST] Processing Unique Collection: ${collectionName}`);

//                     if (Array.isArray(collection.data)) {
//                         for (const item of collection.data) {
//                             try {
//                                 const newItem = { ...item };
//                                 if (newItem.createdAt === "<TIMESTAMP>") newItem.createdAt = new Date();
//                                 if (newItem.updatedAt === "<TIMESTAMP>") newItem.updatedAt = new Date();

//                                 console.log("[DEBUG] newItem before ref replacement:", JSON.stringify(newItem, null, 2));

//                                 // Replace <Ref> tags with the actual ObjectIds
//                                 for (const key in newItem) {
//                                     if (typeof newItem[key] === "string" && newItem[key].startsWith("<Ref")) {
//                                         const refRegex = /<Ref type="([^"]+)" name="([^"]+)">/;
//                                         const match = newItem[key].match(refRegex);

//                                         if (match) {
//                                             const refCollectionName = match[1];
//                                             const refName = match[2];
//                                             const mapKey = `${refCollectionName}_${refName}`;

//                                             if (objectIdMap[mapKey]) {
//                                                 newItem[key] = objectIdMap[mapKey];
//                                                 console.log(`[TEST] Replaced reference in ${collectionName}: ${key} with ObjectId for ${refName}`);
//                                             } else {
//                                                 console.error(`[TEST] ObjectId not found for reference in ${collectionName}: ${key} - ${refName}`);
//                                                 newItem[key] = null; // Or handle as needed
//                                             }
//                                         }
//                                     }
//                                 }

//                                 console.log("[DEBUG] newItem after ref replacement:", JSON.stringify(newItem, null, 2));
//                                 console.log("[DEBUG] Inserting document:", JSON.stringify(newItem, null, 2));

//                                 // Insert into MongoDB
//                                 const result = await db.collection(collectionName).insertOne(newItem);
//                                 const insertedId = result.insertedId.toString();
//                                 console.log(`[TEST] Inserted into ${collectionName}: ${newItem.name || 'unnamed item'} with ID: ${insertedId}`);
//                                 console.log(`[TEST] Document data:`, newItem);
//                             } catch (error) {
//                                 console.error(`[TEST] Error inserting into ${collectionName}: ${item.name || 'unnamed item'}`, error);
//                             }
//                         }
//                     } else {
//                         console.log(`[TEST] No valid data array for collection ${collectionName}`);
//                     }
//                     console.log(`[TEST] Finished processing Unique Collection: ${collectionName}`);
//                 }
//             }
//         }
//         console.log('[TEST] Finished processing all Unique Collections and inserting.');

//         // Process Info Messages
//         console.log('[TEST] Processing Info Messages...');
//         for (const info of parsedData.info) {
//             if (info.type === 'error') {
//                 console.error(`[TEST] Error: ${info.message}`);
//             } else if (info.type === 'report') {
//                 console.warn(`[TEST] Report: ${info.message}`);
//             } else if (info.type === 'done') {
//                 console.log(`[TEST] Done: ${info.message}`);
//             } else if (info.type === 'exit') {
//                 console.log(`[TEST] Process completed`);
//             } else {
//                 console.log(`[TEST] Info (${info.type}): ${info.message}`);
//             }
//         }

//         console.log('[TEST] LLM response processing and MongoDB insertion completed successfully');
//         return { success: true, objectIdMap };

//     } catch (error) {
//         console.error('[TEST] Error processing LLM response or MongoDB insertion:', error);
//         return { success: false, error: error.message };
//     }
// }

// function parseMongoOutput(output) {
//     const artifacts = [];
//     const info = [];

//     // First, extract all artifacts
//     const artifactRegex = /<MongoArtifact>([\s\S]*?)<\/MongoArtifact>/g;
//     let artifactMatch;
//     while ((artifactMatch = artifactRegex.exec(output)) !== null) {
//         const artifactContent = artifactMatch[1];
//         const artifact = { collections: [] };
//         artifacts.push(artifact);

//         // Extract all collections within this artifact
//         const collectionRegex = /<MongoCollection\s+type="([^"]*)"\s+name="([^"]*)">([\s\S]*?)<\/MongoCollection>/g;
//         let collectionMatch;
//         while ((collectionMatch = collectionRegex.exec(artifactContent)) !== null) {
//             const collectionType = collectionMatch[1];
//             const collectionName = collectionMatch[2];
//             const collectionContent = collectionMatch[3];

//             console.log(`[DEBUG] Found collection: ${collectionName}, type: ${collectionType}`);

//             const collection = {
//                 type: collectionType,
//                 name: collectionName,
//                 data: []
//             };
//             artifact.collections.push(collection);

//             // Extract data for this collection
//             const dataRegex = /<MongoData\s+for="([^"]*)">([\s\S]*?)<\/MongoData>/;
//             const dataMatch = collectionContent.match(dataRegex);

//             if (dataMatch) {
//                 const dataFor = dataMatch[1];
//                 let dataContent = dataMatch[2].trim();

//                 try {
//                     // Pre-process the JSON string to handle special tokens
//                     // 1. Replace <TIMESTAMP> with a string placeholder
//                     dataContent = dataContent.replace(/<TIMESTAMP>/g, '"<TIMESTAMP>"');

//                     // 2. Handle Ref tags by converting them to strings
//                     dataContent = dataContent.replace(/<Ref\s+type="([^"]+)"\s+name="([^"]+)">/g,
//                         '"<Ref type=\\"$1\\" name=\\"$2\\">"');

//                     console.log(`[DEBUG] Pre-processed JSON for ${collectionName}: ${dataContent}`);

//                     const parsedData = JSON.parse(dataContent);
//                     collection.data = parsedData;
//                     console.log(`[DEBUG] Successfully parsed data for ${collectionName}, ${parsedData.length} items`);

//                     // Post-process: Convert the string placeholders back to their original form if needed
//                     collection.data = collection.data.map(item => {
//                         const processedItem = { ...item };
//                         for (const key in processedItem) {
//                             if (processedItem[key] === "<TIMESTAMP>") {
//                                 processedItem[key] = "<TIMESTAMP>";
//                             } else if (typeof processedItem[key] === "string" &&
//                                 processedItem[key].startsWith("<Ref type=")) {
//                                 // Extract the information and reconstruct the proper format
//                                 const refRegex = /<Ref type=\\"([^"]+)\\" name=\\"([^"]+)\\">/;
//                                 const match = processedItem[key].match(refRegex);
//                                 if (match) {
//                                     processedItem[key] = {
//                                         refType: match[1],
//                                         refName: match[2],
//                                         original: `<Ref type="${match[1]}" name="${match[2]}">`
//                                     };
//                                 }
//                             }
//                         }
//                         return processedItem;
//                     });
//                 } catch (e) {
//                     console.error(`[TEST] Error parsing JSON for ${collectionName}:`, e);
//                     console.error(`[TEST] JSON content that failed:`, dataContent);
//                     collection.data = [];
//                 }
//             }
//         }
//     }

//     // Extract info messages
//     const infoRegex = /<MongoInfo\s+type="([^"]*)">([\s\S]*?)<\/MongoInfo>/g;
//     let infoMatch;
//     while ((infoMatch = infoRegex.exec(output)) !== null) {
//         const infoType = infoMatch[1];
//         const infoContent = infoMatch[2].trim();

//         info.push({
//             type: infoType,
//             message: infoContent.replace(/"/g, '')
//         });
//         console.log(`[DEBUG] Found info: ${infoType} - ${infoContent.replace(/"/g, '')}`);
//     }

//     return { artifacts, info };
// }

function parseMongoOutput(output) {
    const artifacts = [];
    const info = [];

    // Extract all artifacts
    const artifactRegex = /<MongoArtifact>([\s\S]*?)<\/MongoArtifact>/g;
    let artifactMatch;
    while ((artifactMatch = artifactRegex.exec(output)) !== null) {
        const artifactContent = artifactMatch[1];
        const artifact = { collections: [] };
        artifacts.push(artifact);

        // Extract all collections within this artifact
        const collectionRegex = /<MongoCollection\s+type="([^"]*)"\s+name="([^"]*)">([\s\S]*?)<\/MongoCollection>/g;
        let collectionMatch;
        while ((collectionMatch = collectionRegex.exec(artifactContent)) !== null) {
            const collectionType = collectionMatch[1];
            const collectionName = collectionMatch[2];
            const collectionContent = collectionMatch[3];

            console.log(`[DEBUG] Found collection: ${collectionName}, type: ${collectionType}`);

            const collection = {
                type: collectionType,
                name: collectionName,
                data: []
            };
            artifact.collections.push(collection);

            // Extract data for this collection
            const dataRegex = /<MongoData\s+for="([^"]*)">([\s\S]*?)<\/MongoData>/;
            const dataMatch = collectionContent.match(dataRegex);

            if (dataMatch) {
                const dataFor = dataMatch[1];
                let dataContent = dataMatch[2].trim();

                try {
                    // Handle references before JSON parsing
                    const refMatches = [];
                    let refIndex = 0;
                    const refPlaceholders = {};
                    
                    // Replace ref tags with placeholders before parsing
                    dataContent = dataContent.replace(/<Ref\s+type="([^"]+)"\s+name="([^"]+)">/g, (match, type, name) => {
                        const placeholder = `__REF_PLACEHOLDER_${refIndex}__`;
                        refPlaceholders[placeholder] = { 
                            type: type, 
                            name: name,
                            original: match
                        };
                        refIndex++;
                        return `"${placeholder}"`;
                    });
                    
                    // Replace TIMESTAMP with string
                    dataContent = dataContent.replace(/<TIMESTAMP>/g, '"<TIMESTAMP>"');
                    
                    console.log(`[DEBUG] Pre-processed JSON for ${collectionName}: ${dataContent}`);

                    // Parse the JSON
                    const parsedData = JSON.parse(dataContent);
                    
                    // Restore references
                    const restoreRefs = (obj) => {
                        if (!obj) return obj;
                        
                        if (Array.isArray(obj)) {
                            return obj.map(item => restoreRefs(item));
                        }
                        
                        if (typeof obj === 'object') {
                            const result = {};
                            for (const key in obj) {
                                if (typeof obj[key] === 'string' && obj[key].startsWith('__REF_PLACEHOLDER_')) {
                                    // This is a reference, restore it as a string for easy processing later
                                    const placeholder = obj[key];
                                    const refInfo = refPlaceholders[placeholder];
                                    result[key] = refInfo.original;
                                } else {
                                    result[key] = restoreRefs(obj[key]);
                                }
                            }
                            return result;
                        }
                        
                        return obj;
                    };
                    
                    collection.data = restoreRefs(parsedData);
                    console.log(`[DEBUG] Successfully parsed data for ${collectionName}, ${collection.data.length} items`);
                } catch (e) {
                    console.error(`[TEST] Error parsing JSON for ${collectionName}:`, e);
                    console.error(`[TEST] JSON content that failed:`, dataContent);
                    collection.data = [];
                }
            }
        }
    }

    // Extract info messages
    const infoRegex = /<MongoInfo\s+type="([^"]*)">([\s\S]*?)<\/MongoInfo>/g;
    let infoMatch;
    while ((infoMatch = infoRegex.exec(output)) !== null) {
        const infoType = infoMatch[1];
        const infoContent = infoMatch[2].trim();

        info.push({
            type: infoType,
            message: infoContent.replace(/"/g, '')
        });
        console.log(`[DEBUG] Found info: ${infoType} - ${infoContent.replace(/"/g, '')}`);
    }

    return { artifacts, info };
}
async function processLLMResponseAndInsert(response, db) {
    try {
        console.log('[TEST] Starting to process LLM response and insert into MongoDB...');

        // Parse the response
        const parsedData = parseMongoOutput(response);
        console.log(`[TEST] Parsed ${parsedData.artifacts.length} artifacts and ${parsedData.info.length} info messages`);

        console.log("[DEBUG] Parsed Data:", JSON.stringify(parsedData, null, 2)); // Debugging line

        // Object to store ObjectIds of common collections
        const objectIdMap = {};

        // Process Common Collections first
        console.log('[TEST] Processing Common Collections and inserting...');
        for (const artifact of parsedData.artifacts) {
            for (const collection of artifact.collections) {
                if (collection.type === "CommonCollection") {
                    const collectionName = collection.name;
                    console.log(`[TEST] Processing Common Collection: ${collectionName}`);

                    if (Array.isArray(collection.data)) {
                        for (const item of collection.data) {
                            try {
                                const newItem = { ...item };
                                if (newItem.createdAt === "<TIMESTAMP>") newItem.createdAt = new Date();
                                if (newItem.updatedAt === "<TIMESTAMP>") newItem.updatedAt = new Date();

                                // Insert into MongoDB
                                const result = await db.collection(collectionName).insertOne(newItem);
                                const insertedId = result.insertedId.toString();

                                // Store the ObjectId with the collection name and item name as the key
                                objectIdMap[`${collectionName}_${newItem.name}`] = insertedId;
                                console.log(`[TEST] Inserted into ${collectionName}: ${newItem.name} with ID: ${insertedId}`);
                                console.log(`[TEST] Document data:`, newItem);
                            } catch (error) {
                                console.error(`[TEST] Error inserting into ${collectionName}: ${item.name || 'unnamed item'}`, error);
                            }
                        }
                    } else {
                        console.log(`[TEST] No valid data array for collection ${collectionName}`);
                    }
                    console.log(`[TEST] Finished processing Common Collection: ${collectionName}`);
                }
            }
        }
        console.log('[TEST] Finished processing all Common Collections and inserting.');

        console.log("[DEBUG] objectIdMap:", JSON.stringify(objectIdMap, null, 2)); // Debugging line

        // Process Unique Collections
        console.log('[TEST] Processing Unique Collections and inserting...');
        for (const artifact of parsedData.artifacts) {
            for (const collection of artifact.collections) {
                if (collection.type === "uniqueCollection") {
                    const collectionName = collection.name;
                    console.log(`[TEST] Processing Unique Collection: ${collectionName}`);

                    if (Array.isArray(collection.data)) {
                        for (const item of collection.data) {
                            try {
                                const newItem = { ...item };
                                if (newItem.createdAt === "<TIMESTAMP>") newItem.createdAt = new Date();
                                if (newItem.updatedAt === "<TIMESTAMP>") newItem.updatedAt = new Date();

                                console.log("[DEBUG] newItem before ref replacement:", JSON.stringify(newItem, null, 2));

                                // Replace <Ref> tags with the actual ObjectIds
                                for (const key in newItem) {
                                    if (typeof newItem[key] === "string" && newItem[key].includes("<Ref")) {
                                        const refRegex = /<Ref type="([^"]+)" name="([^"]+)">/;
                                        const match = newItem[key].match(refRegex);

                                        if (match) {
                                            const refCollectionName = match[1];
                                            const refName = match[2];
                                            const mapKey = `${refCollectionName}_${refName}`;

                                            if (objectIdMap[mapKey]) {
                                                newItem[key] = objectIdMap[mapKey];
                                                console.log(`[TEST] Replaced reference in ${collectionName}: ${key} with ObjectId for ${refName}`);
                                            } else {
                                                console.error(`[TEST] ObjectId not found for reference in ${collectionName}: ${key} - ${refName}`);
                                                newItem[key] = null; // Or handle as needed
                                            }
                                        }
                                    }
                                }

                                console.log("[DEBUG] newItem after ref replacement:", JSON.stringify(newItem, null, 2));
                                console.log("[DEBUG] Inserting document:", JSON.stringify(newItem, null, 2));

                                // Insert into MongoDB
                                const result = await db.collection(collectionName).insertOne(newItem);
                                const insertedId = result.insertedId.toString();
                                console.log(`[TEST] Inserted into ${collectionName}: ${newItem.name || 'unnamed item'} with ID: ${insertedId}`);
                                console.log(`[TEST] Document data:`, newItem);
                            } catch (error) {
                                console.error(`[TEST] Error inserting into ${collectionName}: ${item.name || 'unnamed item'}`, error);
                            }
                        }
                    } else {
                        console.log(`[TEST] No valid data array for collection ${collectionName}`);
                    }
                    console.log(`[TEST] Finished processing Unique Collection: ${collectionName}`);
                }
            }
        }
        console.log('[TEST] Finished processing all Unique Collections and inserting.');

        // Process Info Messages
        console.log('[TEST] Processing Info Messages...');
        for (const info of parsedData.info) {
            if (info.type === 'error') {
                console.error(`[TEST] Error: ${info.message}`);
            } else if (info.type === 'report') {
                console.warn(`[TEST] Report: ${info.message}`);
            } else if (info.type === 'done') {
                console.log(`[TEST] Done: ${info.message}`);
            } else if (info.type === 'exit') {
                console.log(`[TEST] Process completed`);
            } else {
                console.log(`[TEST] Info (${info.type}): ${info.message}`);
            }
        }

        console.log('[TEST] LLM response processing and MongoDB insertion completed successfully');
        return { success: true, objectIdMap };

    } catch (error) {
        console.error('[TEST] Error processing LLM response or MongoDB insertion:', error);
        return { success: false, error: error.message };
    }
}
export default processLLMResponseAndInsert;