import { MongoClient, Db } from 'mongodb';
import dotenv from 'dotenv';

dotenv.config();

export class DatabaseSingleton {
  private static instance: DatabaseSingleton | null = null;
  private client: MongoClient;
  private databases: Map<string, Db> = new Map();
  private isConnected: boolean = false;

  private constructor() {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017';
    this.client = new MongoClient(uri);
  }

  public static getInstance(): DatabaseSingleton {
    if (!DatabaseSingleton.instance) {
      DatabaseSingleton.instance = new DatabaseSingleton();
    }
    return DatabaseSingleton.instance;
  }

  public async initialize(): Promise<void> {
    if (this.isConnected) {
      console.log('Database already connected');
      return;
    }

    try {
      await this.client.connect();
      this.isConnected = true;
      console.log('Database connection established');
    } catch (error) {
      console.error('Failed to connect to database:', error);
      throw error;
    }
  }

  public getDatabase(dbName: string): Db {
    if (!this.isConnected) {
      throw new Error('Database not initialized. Call initialize() first.');
    }

    if (!this.databases.has(dbName)) {
      const db = this.client.db(dbName);
      this.databases.set(dbName, db);
    }
 
    return this.databases.get(dbName)!;
  }

  public async disconnect(): Promise<void> {
    if (this.isConnected) {
      await this.client.close();
      this.isConnected = false;
      this.databases.clear();
      console.log('Database connection closed');
    }
  }
}