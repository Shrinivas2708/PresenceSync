
import express, { NextFunction, Request, Response } from 'express';
import dotenv from 'dotenv';
import { DatabaseSingleton } from './models/db';
import { validateDbName } from './middlewares/ValidateDBName';
import processLLMResponseAndInsert from './services/addToDB';
import { llmResponse } from './exports';
import processCsvWithGeminiAndInsert from './services/getMongoData';
// import processXlsxWithGeminiAndInsertFree from './services/getMongoData';
import processXlsxWithGeminiAndInsertFree from "./services/finale"
dotenv.config();
const app = express();
app.use(express.json());
async function initializeDatabase() {
  const dbManager = DatabaseSingleton.getInstance();
  await dbManager.initialize();
}


async function startServer() {
  try {
    // Initialize database connection BEFORE starting the server
    await initializeDatabase();

    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Server startup failed:', error);
    process.exit(1);
  }
}

app.post('/test', validateDbName ,async (req:Request, res:Response) => {
  const dbName = req.body.dbName;
  try {
    const csvFilePath = './dataforattendance.xlsx'
     const dbManager = DatabaseSingleton.getInstance();
      const db = dbManager.getDatabase(dbName);
    await processXlsxWithGeminiAndInsertFree(csvFilePath,db)
     return res.status(200).json({
      message: 'Data successfully inserted into MongoDB.'
      });
  } catch (error) {
    console.error('Error processing LLM response:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
})


process.on('SIGINT', async () => {
  const dbManager = DatabaseSingleton.getInstance();
  await dbManager.disconnect();
  process.exit(0);
});

startServer();

