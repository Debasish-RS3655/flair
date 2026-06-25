import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';

export const clearDirBeforeUpload = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const cleared = await clearTempDir();
    if (cleared) {            
      return next();
    }
    res.status(400).send({ error: { message: "Could not clear temporary directory." } });
  } catch (err) {
    res.status(500).send({ error: { message: String(err) } });
  }
};

// Delete all files in the temp directory. If the directory doesn't exist, it will be created.
export const clearTempDir = async (): Promise<boolean> => {
  try {
    const tempDir = process.env.MULTER_URL as string;
    if (!tempDir) {
        console.error('Temporary upload directory not given in environment variables.');
        return false;
    }

    // Check if the directory exists; if not, create it.
    if (!fs.existsSync(tempDir)) {
      console.warn(`Temp directory does not exist. Creating: ${tempDir}`);
      fs.mkdirSync(tempDir, { recursive: true });
      return true; // Directory created, no files to clear.
    }

    // Clear the directory.
    const files = fs.readdirSync(tempDir);
    for (const file of files) {
      fs.unlinkSync(path.join(tempDir, file));
    }
  } catch (err) {
    console.error('Error clearing temp directory:', err);
    return false;
  }
  return true;
};
