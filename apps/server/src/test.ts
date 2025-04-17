// function processLLMResponseTest(response) {
//     try {
//         console.log('[TEST] Starting to process LLM response...');
        
//         // Parse the response
//         const parsedData = parseMongoOutput(response);
//         console.log(`[TEST] Parsed ${parsedData.artifacts.length} artifacts and ${parsedData.info.length} info messages`);
        
//         // Debug: Log all collection types to see what's being parsed
//         console.log('[DEBUG] Collection types found:');
//         for (const artifact of parsedData.artifacts) {
//             for (const collection of artifact.collections) {
//                 console.log(`[DEBUG] Collection: ${collection.name}, Type: ${collection.type}, TypeOf: ${typeof collection.type}`);
//             }
//         }
        
//         // Object to store simulated ObjectIds
//         const objectIdMap = {};
        
//         // Process Common Collections first
//         console.log('[TEST] Processing Common Collections...');
//         for (const artifact of parsedData.artifacts) {
//             for (const collection of artifact.collections) {
//                 if (collection.type && collection.type.includes("CommonCollection")) {
//                     const collectionName = collection.name;
//                     console.log(`[TEST] Processing Common Collection: ${collectionName}`);
                    
//                     // Process each item in the collection
//                     if (Array.isArray(collection.data)) {
//                         for (const item of collection.data) {
//                             try {
//                                 // Replace timestamp placeholders with simulated timestamps
//                                 const newItem = { ...item };
//                                 if (newItem.createdAt === "<TIMESTAMP>") newItem.createdAt = new Date().toISOString();
//                                 if (newItem.updatedAt === "<TIMESTAMP>") newItem.updatedAt = new Date().toISOString();
                                
//                                 // Simulate inserting the document
//                                 const simulatedObjectId = `sim_id_${Math.random().toString(36).substr(2, 9)}`;
                                
//                                 // Store the simulated ObjectId with the item's name as the key
//                                 objectIdMap[`${collectionName}_${newItem.name}`] = simulatedObjectId;
//                                 console.log(`[TEST] Simulated insert into ${collectionName}: ${newItem.name} with ID: ${simulatedObjectId}`);
//                                 console.log(`[TEST] Document data:`, newItem);
//                             } catch (error) {
//                                 console.error(`[TEST] Error simulating insert into ${collectionName}: ${item.name || 'unnamed item'}`, error);
//                             }
//                         }
//                     } else {
//                         console.log(`[TEST] No valid data array for collection ${collectionName}`);
//                     }
//                     console.log(`[TEST] Finished processing Common Collection: ${collectionName}`);
//                 }
//             }
//         }
//         console.log('[TEST] Finished processing all Common Collections');
        
//         // Process Unique Collections
//         console.log('[TEST] Processing Unique Collections...');
//         for (const artifact of parsedData.artifacts) {
//             for (const collection of artifact.collections) {
//                 if (collection.type && collection.type.includes("uniqueCollection")) {
//                     const collectionName = collection.name;
//                     console.log(`[TEST] Processing Unique Collection: ${collectionName}`);
                    
//                     // Process each item in the collection
//                     if (Array.isArray(collection.data)) {
//                         for (const item of collection.data) {
//                             try {
//                                 // Create a copy to avoid modifying the original
//                                 const newItem = { ...item };
                                
//                                 // Replace timestamp placeholders with simulated timestamps
//                                 if (newItem.createdAt === "<TIMESTAMP>") newItem.createdAt = new Date().toISOString();
//                                 if (newItem.updatedAt === "<TIMESTAMP>") newItem.updatedAt = new Date().toISOString();
                                
//                                 // Handle references (now they are objects with refType and refName properties)
//                                 for (const key in newItem) {
//                                     if (newItem[key] && typeof newItem[key] === "object" && newItem[key].refType) {
//                                         const refCollectionName = newItem[key].refType;
//                                         const refName = newItem[key].refName;
//                                         const mapKey = `${refCollectionName}_${refName}`;
                                        
//                                         if (objectIdMap[mapKey]) {
//                                             newItem[key] = objectIdMap[mapKey];
//                                             console.log(`[TEST] Replaced reference in ${collectionName}: ${key} with simulated ObjectId for ${refName}`);
//                                         } else {
//                                             console.error(`[TEST] ObjectId not found for reference in ${collectionName}: ${key} - ${refName}`);
//                                             newItem[key] = `UNRESOLVED_REF_${refCollectionName}_${refName}`;
//                                         }
//                                     }
//                                 }
                                
//                                 // Simulate inserting the document
//                                 const simulatedObjectId = `sim_id_${Math.random().toString(36).substr(2, 9)}`;
//                                 console.log(`[TEST] Simulated insert into ${collectionName}: ${newItem.name || 'unnamed item'} with ID: ${simulatedObjectId}`);
//                                 console.log(`[TEST] Document data:`, newItem);
//                             } catch (error) {
//                                 console.error(`[TEST] Error simulating insert into ${collectionName}: ${item.name || 'unnamed item'}`, error);
//                             }
//                         }
//                     } else {
//                         console.log(`[TEST] No valid data array for collection ${collectionName}`);
//                     }
//                     console.log(`[TEST] Finished processing Unique Collection: ${collectionName}`);
//                 }
//             }
//         }
//         console.log('[TEST] Finished processing all Unique Collections');
        
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
        
//         console.log('[TEST] LLM response processing completed successfully');
//         return { success: true, objectIdMap };
        
//     } catch (error) {
//         console.error('[TEST] Error processing LLM response:', error);
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
//                                       processedItem[key].startsWith("<Ref type=")) {
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


// export const llmResponse = `<MongoArtifact>
// <MongoCollection type="CommonCollection" name="Branch">
// <MongoData for="Branch">
// [{
// "name": "IT",
// "createdAt": <TIMESTAMP>,
// "updatedAt": <TIMESTAMP>
// }]
// </MongoData>
// </MongoCollection>
// </MongoArtifact>
// <MongoArtifact>
// <MongoCollection type="CommonCollection" name="Specialization">
// <MongoData for="Specialization">
// [{
// "name": "SMAD",
// "createdAt": <TIMESTAMP>,
// "updatedAt": <TIMESTAMP>
// }]
// </MongoData>
// </MongoCollection>
// </MongoArtifact>
// <MongoArtifact>
// <MongoCollection type="CommonCollection" name="Department">
// <MongoData for="Department">
// [{
// "name": "SOC",
// "createdAt": <TIMESTAMP>,
// "updatedAt": <TIMESTAMP>
// }]
// </MongoData>
// </MongoCollection>
// </MongoArtifact>
// <MongoInfo type="done">
// "Done extracting and finding common fields"
// </MongoInfo>
// <MongoInfo type="report">
// "Duplicate record found: Name: Shrinivas Sherikar, Branch: IT, Specialization: SMAD, Mobile No: 9767655708, Email: ssherikar2005@gmail.com, Department: SOC"
// </MongoInfo>
// <MongoArtifact>
// <MongoCollection type="uniqueCollection" name="Students">
// <MongoData for="Students">
// [{
// "name": "Shrinivas Sherikar",
// "mobile_no": "9767655708",
// "email": "ssherikar2005@gmail.com",
// "branch_id": <Ref type="Branch" name="IT">,
// "specialization_id": <Ref type="Specialization" name="SMAD">,
// "department_id": <Ref type="Department" name="SOC">,
// "createdAt": <TIMESTAMP>,
// "updatedAt": <TIMESTAMP>
// },
// {
// "name": "Sanskrti Singh",
// "mobile_no": "9768275824",
// "email": "sans@gmail.com",
// "branch_id": <Ref type="Branch" name="IT">,
// "specialization_id": <Ref type="Specialization" name="SMAD">,
// "department_id": <Ref type="Department" name="SOC">,
// "createdAt": <TIMESTAMP>,
// "updatedAt": <TIMESTAMP>
// }]
// </MongoData>
// </MongoCollection>
// </MongoArtifact>
// <MongoInfo type="done">
// "Done with the extracting the unique collection"
// </MongoInfo>
// <MongoInfo type="exit"/>`;

// const testResult = processLLMResponseTest(llmResponse);
// console.log(testResult);

import { DatabaseSingleton } from './models/db';
import processCsvWithGeminiAndInsert from './services/getMongoData';
async function main(){
     const csvFilePath = './dataforattendance.xlsx'
     const dbManager = DatabaseSingleton.getInstance();
         const db = dbManager.getDatabase("test_db");
     await processCsvWithGeminiAndInsert(csvFilePath,db)
}
main();