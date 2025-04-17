import { Request, Response, NextFunction } from 'express';
export const validateDbName = (req:Request, res:Response ,next: NextFunction) => {
  console.log(req.body);
  const { dbName } = req.body;
  
  if (!dbName || typeof dbName !== 'string') {
    return res.status(400).json({ 
      error: 'Invalid or missing database name' 
    });
  }
  if (dbName.length > 64 || /[^\w-]/.test(dbName)) {
    return res.status(400).json({ 
      error: 'Invalid database name format' 
    });
  }

  next();
};