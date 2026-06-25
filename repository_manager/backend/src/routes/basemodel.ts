// Route to handle base model uploads, downloads and deletes
// Debashish Buragohain

import { Router } from 'express';
import { baseModelUploader } from '../lib/multer/index.js';
import { existingModelCheck } from '../middleware/upload/existingModelCheck.js';
import { clearDirBeforeUpload } from '../middleware/upload/clearTemp.js';
import * as basemodelController from '../controllers/basemodel.controller.js';

// It makes no sense to have a route for the download of the 
// model as the model is always fetched from IPFS gateway directly by the client

const modelRouter = Router();

// Sends a model to the backend for uploading to the frontend
modelRouter.post('/upload', existingModelCheck, clearDirBeforeUpload, baseModelUploader, basemodelController.uploadModel);

// If the repo has commits, you delete the repository then the model gets deleted
modelRouter.delete('/delete', existingModelCheck, basemodelController.deleteModel);

// Get the fetch URL for the model from IPFS
modelRouter.get('/fetch_url', basemodelController.getModelFetchUrl);

export { modelRouter };