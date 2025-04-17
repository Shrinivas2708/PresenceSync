import { GenerateContentResponse, GoogleGenAI } from "@google/genai";
import axios from "axios";
import xlsx from "xlsx";
import { ObjectId } from "mongodb";
import fs from "fs";

// Utility functions remain the same
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

// Enhanced processing function with batch operations
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
                                objectIdMap[`<span class="math-inline">\{collectionName\}\_</span>{newItem.name}`] = existing._id.toString();
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
                                    objectIdMap[`<span class="math-inline">\{collectionName\}\_</span>{item.name}`] = id.toString();
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

                    // Create collection if needed
                    if ((await db.listCollections({ name: collectionName }).toArray()).length === 0) {
                        console.log(`[INFO] Creating collection: ${collectionName}`);
                        await db.createCollection(collectionName);
                    }

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
                                    objectIdMap[`<span class="math-inline">\{collectionName\}\_</span>{item.name}`] = id.toString();
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

// Helper functions (Your existing implementations)
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
                const refKey = `<span class="math-inline">\{match\[1\]\}\_</span>{match[2]}`;
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
                        return [key, `<Ref type="<span class="math-inline">\{ref\.type\}" name\="</span>{ref.name}">`];
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

// NEW CODE: Specialized function to process timetable data
async function processTimeTableData(xlsxPath: string, db: any, universityId: string) {
    try {
        console.log(`[INFO] Processing timetable data from: ${xlsxPath} for university: ${universityId}`);

        // Read the XLSX file
        const fileData = fs.readFileSync(xlsxPath);
        const workbook = xlsx.read(fileData, { type: "buffer" });

        // Extract sheets - we expect specific sheet names for different data types
        const sheets = workbook.SheetNames;
        const jsonData: Record<string, any[]> = {};

        // Process each sheet
        for (const sheet of sheets) {
            jsonData[sheet] = xlsx.utils.sheet_to_json(workbook.Sheets[sheet]);
        }

        // Enhanced prompt specifically for timetable processing
        const prompt = `
            You are an AI agent that specializes in processing university timetable data for MongoDB. Focus on creating a proper hierarchical structure for an attendance system.

            <MongoArtifact>
                <MongoCollection type="CommonCollection" name="School">
                    <MongoData for="School">[
                        {"name": "School of Computing", "code": "SOC", "universityId": "${universityId}", "createdAt": <TIMESTAMP>, "updatedAt": <TIMESTAMP>}
                    ]</MongoData>
                </MongoCollection>
            </MongoArtifact>
            <MongoArtifact>
                <MongoCollection type="CommonCollection" name="Branch">
                    <MongoData for="Branch">[
                        {"name": "Information Technology", "code": "IT", "school_id": <Ref type="School" name="School of Computing">, "createdAt": <TIMESTAMP>, "updatedAt": <TIMESTAMP>}
                    ]</MongoData>
                </MongoCollection>
            </MongoArtifact>
            <MongoArtifact>
                <MongoCollection type="CommonCollection" name="Specialization">
                    <MongoData for="Specialization">[
                        {"name": "Software Modeling and Design", "code": "SMAD", "branch_id": <Ref type="Branch" name="Information Technology">, "createdAt": <TIMESTAMP>, "updatedAt": <TIMESTAMP>}
                    ]</MongoData>
                </MongoCollection>
            </MongoArtifact>
            <MongoArtifact>
                <MongoCollection type="CommonCollection" name="Subject">
                    <MongoData for="Subject">[
                        {"name": "Web Development", "code": "WEB101", "specialization_id": <Ref type="Specialization" name="Software Modeling and Design">, "credits": 4, "createdAt": <TIMESTAMP>, "updatedAt": <TIMESTAMP>}
                    ]</MongoData>
                </MongoCollection>
            </MongoArtifact>
            <MongoArtifact>
                <MongoCollection type="uniqueCollection" name="Classroom" uniqueFields="name,building">
                    <MongoData for="Classroom">[
                        {"name": "101", "building": "Tech Block", "capacity": 60, "createdAt": <TIMESTAMP>, "updatedAt": <TIMESTAMP>}
                    ]</MongoData>
                </MongoCollection>
            </MongoArtifact>
            <MongoArtifact>
                <MongoCollection type="uniqueCollection" name="Teacher" uniqueFields="email">
                    <MongoData for="Teacher">[
                        {
                            "name": "Dr. John Smith",
                            "email": "john.smith@university.edu",
                            "designation": "Associate Professor",
                            "specialization_id": <Ref type="Specialization" name="Software Modeling and Design">,
                            "createdAt": <TIMESTAMP>,
                            "updatedAt": <TIMESTAMP>
                        }
                    ]</MongoData>
                </MongoCollection>
            </MongoArtifact>
            <MongoArtifact>
                <MongoCollection type="uniqueCollection" name="TimeTable" uniqueFields="day,period,classroom_id,subject_id,teacher_id,specialization_id,academicYear,semester">
                    <MongoData for="TimeTable">[
                        {
                            "day": "Monday",
                            "period": 1,
                            "startTime": "09:00",
                            "endTime": "10:00",
                            "subject_id": <Ref type="Subject" name="Web Development">,
                            "teacher_id": <Ref type="Teacher" name="Dr. John Smith">,
                            "classroom_id": <Ref type="Classroom" name="101">,
                            "specialization_id": <Ref type="Specialization" name="Software Modeling and Design">,
                            "academicYear": "2024-2025",
                            "semester": "Fall",
                            "createdAt": <TIMESTAMP>,
                            "updatedAt": <TIMESTAMP>
                        }
                    ]</MongoData>
                </MongoCollection>
            </MongoArtifact>
            <MongoArtifact>
                <MongoCollection type="uniqueCollection" name="Division" uniqueFields="name,specialization_id,academicYear,semester">
                    <MongoData for="Division">[
                        {
                            "name": "A",
                            "specialization_id": <Ref type="Specialization" name="Software Modeling and Design">,
                            "academicYear": "2024-2025",
                            "semester": "Fall",
                            "createdAt": <TIMESTAMP>,
                            "updatedAt": <TIMESTAMP>
                        }
                    ]</MongoData>
                </MongoCollection>
            </MongoArtifact>
            <MongoArtifact>
                <MongoCollection type="uniqueCollection" name="StudentDivision" uniqueFields="student_id,division_id,academicYear,semester">
                    <MongoData for="StudentDivision">[
                        {
                            "student_id": "will_be_replaced_with_proper_id",
                            "division_id": <Ref type="Division" name="A">,
                            "academicYear": "2024-2025",
                            "semester": "Fall",
                            "joinDate": <TIMESTAMP>,
                            "createdAt": <TIMESTAMP>,
                            "updatedAt": <TIMESTAMP>
                        }
                    ]</MongoData>
                </MongoCollection>
            </MongoArtifact>
            <MongoArtifact>
                <MongoCollection type="uniqueCollection" name="Attendance" uniqueFields="student_id,timetable_id,date">
                    <MongoData for="Attendance">[
                        {
                            "student_id": "will_be_replaced_with_proper_id",
                            "timetable_id": "will_be_replaced_with_proper_id",
                            "date": "2024-09-05",
                            "status": "present",
                            "marked_by": <Ref type="Teacher" name="Dr. John Smith">,
                            "createdAt": <TIMESTAMP>,
                            "updatedAt": <TIMESTAMP>
                        }
                    ]</MongoData>
                </MongoCollection>
            </MongoArtifact>
            <MongoInfo type="done">"Timetable data processing logic needs to be implemented based on the structure of your Excel sheets. The provided example shows the desired MongoDB structure."</MongoInfo>

            STRICT RULES:
            1. Create a HIERARCHICAL structure: School → Branch → Specialization → Subjects & Teachers
            2. Every TimeTable entry must link to Subject, Teacher, Classroom, and Specialization
            3. Create Divisions for student grouping
            4. Include academic year and semester fields to track changes over time
            5. Follow the EXACT format as shown in the example tags
            6. Process all sheets in the Excel file, understanding their relationships
            7. Automatically detect the structure in the provided data
            8. Maintain proper references between all entities
            9. Create separate entries for each unique entity (Schools, Branches, etc.)
            10. Add unique fields to ensure data integrity (email for teachers, name+building for classrooms)
            11. Ensure "createdAt" and "updatedAt" fields for all documents
            12. Use <TIMESTAMP> and <Ref> tags correctly

            Excel Data Sheets:
            ${JSON.stringify(jsonData, null, 2)}
        `;

        // Call Gemini API with the specialized prompt
        const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });

        // Handle potential large data by chunking
        const chunkSize = 4000;
        const promptChunks = [];
        for (let i = 0; i < prompt.length; i += chunkSize) {
            promptChunks.push(prompt.slice(i, i + chunkSize));
        }

        let fullResponse = "";
         for (const chunk of promptChunks) {
            const result: GenerateContentResponse = await ai.models.generateContent({
                model: "gemini-2.0-flash",
                contents: chunk,
            });

            if (result.candidates && result.candidates[0]?.content?.parts?.[0]?.text) {
                fullResponse += result.candidates[0].content.parts[0].text;
            } else {
                console.warn("[WARN] No text content found in the Gemini response chunk:", result);
            }
        }

        console.log("Gemini API Response for Timetable:", fullResponse);

        // Process the response
        const processed = await processLLMResponseAndInsert(fullResponse, db);
        return processed;
    } catch (error) {
        console.error('Timetable processing failed:', error);
        throw error;
    }
}

// NEW CODE: Function to retrieve timetable data with proper hierarchical structure
async function getTimeTableData(db: any, query: any = {}) {
    try {
        // Query timetable data with aggregation pipeline to include related information
        const pipeline = [
            { $match: query },
            {
                $lookup: {
                    from: "Subject",
                    localField: "subject_id",
                    foreignField: "_id",
                    as: "subject"
                }
            },
            {
                $lookup: {
                    from: "Teacher",
                    localField: "teacher_id",
                    foreignField: "_id",
                    as: "teacher"
                }
            },
            {
                $lookup: {
                    from: "Classroom",
                    localField: "classroom_id",
                    foreignField: "_id",
                    as: "classroom"
                }
            },
            {
                $lookup: {
                    from: "Specialization",
                    localField: "specialization_id",
                    foreignField: "_id",
                    as: "specialization"
                }
            },
            {
                $unwind: "$subject"
            },
            {
                $unwind: "$teacher"
            },
            {
                $unwind: "$classroom"
            },
            {
                $unwind: "$specialization"
            },
            {
                $lookup: {
                    from: "Branch",
                    localField: "specialization.branch_id",
                    foreignField: "_id",
                    as: "branch"
                }
            },
            {
                $unwind: "$branch"
            },
            {
                $lookup: {
                    from: "School",
                    localField: "branch.school_id",
                    foreignField: "_id",
                    as: "school"
                }
            },
            {
                $unwind: "$school"
            },
            {
                $project: {
                    _id: 1,
                    day: 1,
                    period: 1,
                    startTime: 1,
                    endTime: 1,
                    academicYear: 1,
                    semester: 1,
                    subject: {
                        _id: "$subject._id",
                        name: "$subject.name",
                        code: "$subject.code",
                        credits: "$subject.credits"
                    },
                    teacher: {
                        _id: "$teacher._id",
                        name: "$teacher.name",
                        email: "$teacher.email",
                        designation: "$teacher.designation"
                    },
                    classroom: {
                        _id: "$classroom._id",
                        name: "$classroom.name",
                        building: "$classroom.building",
                        capacity: "$classroom.capacity"
                    },
                    specialization: {
                        _id: "$specialization._id",
                        name: "$specialization.name",
                        code: "$specialization.code"
                    },
                    branch: {
                        _id: "$branch._id",
                        name: "$branch.name",
                        code: "$branch.code"
                    },
                    school: {
                        _id: "$school._id",
                        name: "$school.name",
                        code: "$school.code"
                    }
                }
            }
        ];

        const timetableData = await db.collection("TimeTable").aggregate(pipeline).toArray();
        return timetableData;
    } catch (error) {
        console.error('Error fetching timetable data:', error);
        throw error;
    }
}

// NEW CODE: Function to get student attendance data
async function getStudentAttendance(db: any, studentId: string, academicYear: string, semester: string) {
    try {
        // First get the student's division
        const studentDivision = await db.collection("StudentDivision").findOne({
            student_id: new ObjectId(studentId),
            academicYear,
            semester
        });

        if (!studentDivision) {
            return { error: "Student division not found" };
        }

        // Get the timetable entries for this student's specialization, academic year, and semester
        const timetableEntries = await db.collection("TimeTable").find({
            specialization_id: studentDivision.division_id, // Assuming division_id directly references specialization
            academicYear,
            semester
        }).toArray();

        if (!timetableEntries.length) {
            return { error: "No timetable entries found for this student's division, academic year, and semester" };
        }

        // Get attendance records for this student
        const attendanceRecords = await db.collection("Attendance").find({
            student_id: new ObjectId(studentId),
            date: { $gte: new Date(`${academicYear.split('-')[0]}-01-01`), $lte: new Date(`${academicYear.split('-')[1]}-12-31`) } // Basic date range for the academic year
        }).toArray();

        // Map timetable IDs to timetable entries
        const timetableMap = timetableEntries.reduce((acc, entry) => {
            acc[entry._id.toString()] = entry;
            return acc;
        }, {});

        // Process attendance data with subject and teacher details
        const attendanceData = [];
        for (const record of attendanceRecords) {
            const timetableId = record.timetable_id.toString();
            const timetableEntry = timetableMap[timetableId];

            if (timetableEntry) {
                // Get subject details
                const subject = await db.collection("Subject").findOne({
                    _id: timetableEntry.subject_id
                });

                // Get teacher details
                const teacher = await db.collection("Teacher").findOne({
                    _id: timetableEntry.teacher_id
                });

                attendanceData.push({
                    date: record.date,
                    status: record.status,
                    subject: subject?.name || "Unknown Subject",
                    subjectCode: subject?.code || "Unknown",
                    teacher: teacher?.name || "Unknown Teacher",
                    day: timetableEntry.day,
                    period: timetableEntry.period,
                    startTime: timetableEntry.startTime,
                    endTime: timetableEntry.endTime
                });
            }
        }

        // Calculate attendance statistics
        const relevantTimetableEntries = timetableEntries.filter(entry =>
            attendanceRecords.some(record => record.timetable_id?.toString() === entry._id.toString())
        );
        const totalPossibleClasses = relevantTimetableEntries.length;
        const presentClasses = attendanceData.filter(record => record.status === "present").length;
        const attendancePercentage = totalPossibleClasses > 0 ? (presentClasses / totalPossibleClasses) * 100 : 0;

        return {
            studentId,
            academicYear,
            semester,
            totalClasses: totalPossibleClasses,
            presentClasses,
            attendancePercentage: attendancePercentage.toFixed(2) + "%",
            attendanceRecords: attendanceData
        };
    } catch (error) {
        console.error('Error fetching student attendance:', error);
        throw error;
    }
}

// NEW CODE: Function to mark attendance
async function markAttendance(db: any, timetableId: string, studentIds: string[], date: string, status: string, markedBy: string) {
    try {
        const objectTimetableId = new ObjectId(timetableId);
        const objectStudentIds = studentIds.map(id => new ObjectId(id));
        const objectMarkedBy = new ObjectId(markedBy);
        const attendanceDate = new Date(date);

        const bulkOps = objectStudentIds.map(studentId => ({
            updateOne: {
                filter: {
                    student_id: studentId,
                    timetable_id: objectTimetableId,
                    date: attendanceDate
                },
                update: {
                    $set: {
                        status,
                        marked_by: objectMarkedBy,
                        updatedAt: new Date()
                    },
                    $setOnInsert: {
                        createdAt: new Date()
                    }
                },
                upsert: true
            }
        }));

        const result = await db.collection("Attendance").bulkWrite(bulkOps);
        console.log(`[INFO] Marked attendance for ${result.modifiedCount} students and inserted ${result.upsertedCount} new records.`);
        return { success: true, modifiedCount: result.modifiedCount, upsertedCount: result.upsertedCount };
    } catch (error) {
        console.error('Error marking attendance:', error);
        return { success: false, error: error.message };
    }
}

// NEW CODE: Specialized function to process raw timetable data (e.g., from a different format)
async function processRawTimeTableData(rawData: any[], db: any, academicYear: string, semester: string, specializationId: string) {
    try {
        console.log(`[INFO] Processing raw timetable data for specialization: ${specializationId}, academic year: ${academicYear}, semester: ${semester}`);

        const bulkOps = rawData.map(item => {
            // Assuming 'item' has fields like day, period, startTime, endTime, subjectName, teacherEmail, classroomName, classroomBuilding
            return {
                insertOne: {
                    document: {
                        day: item.day,
                        period: parseInt(item.period),
                        startTime: item.startTime,
                        endTime: item.endTime,
                        academicYear,
                        semester,
                        specialization_id: new ObjectId(specializationId),
                        subject_name: item.subjectName, // Temporary, will be resolved
                        teacher_email: item.teacherEmail, // Temporary, will be resolved
                        classroom_name: item.classroomName,
                        classroom_building: item.classroomBuilding,
                        createdAt: new Date(),
                        updatedAt: new Date()
                    }
                }
            };
        });

        const insertResult = await db.collection("TimeTable_Raw").bulkWrite(bulkOps);
        console.log(`[INFO] Inserted ${insertResult.insertedCount} raw timetable entries.`);

        // Now, a separate process would be needed to:
        // 1. Find or create Subject, Teacher, and Classroom documents based on the raw data.
        // 2. Update the TimeTable_Raw entries with the correct ObjectIds for these related entities.
        // 3. Potentially move the processed data to the main TimeTable collection.

        // This example only inserts the raw data. A more sophisticated approach using the LLM or direct data mapping is required for full processing.

        return { success: true, insertedCount: insertResult.insertedCount };

    } catch (error) {
        console.error('Error processing raw timetable data:', error);
        return { success: false, error: error.message };
    }
}

// NEW CODE: Function to retrieve raw timetable data (for potential manual review or reprocessing)
async function getRawTimeTableData(db: any, query: any = {}) {
    try {
        const rawTimetableData = await db.collection("TimeTable_Raw").find(query).toArray();
        return rawTimetableData;
    } catch (error) {
        console.error('Error fetching raw timetable data:', error);
        throw error;
    }
}

export {
    processLLMResponseAndInsert,
    processTimeTableData,
    getTimeTableData,
    getStudentAttendance,
    markAttendance,
    processRawTimeTableData,
    getRawTimeTableData
};