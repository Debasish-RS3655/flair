import { Request } from "express";
import multer, { FileFilterCallback } from "multer";
import config from "../../../config.js";

// configuration file for the uploader
// the client sends the base model to the uploader in the backend which stores it locally first
// then it is uploaded to IPFS and the local file is deleted

// Debashish Buragohain

// the allowed file types must be consistent everywhere
const allowedBaseModelTypes = config.upload.baseModel.allowedFileTypes;
const maxBaseModelSize = config.upload.baseModel.maxBaseModelSize || 20;       // in MB
const allowedParamsTypes = config.upload.params.allowedFileTypes;
const maxParamsSize = config.upload.params.maxSize || 50;       // in MB

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, process.env.MULTER_URL!);
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        cb(null, file.fieldname + "-" + uniqueSuffix); // Create unique filenames
    },
});

// apply some other filters here
const baseModelFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const baseModelExt = file.originalname.split(".").pop()?.toLowerCase();
    if (baseModelExt && allowedBaseModelTypes.includes(baseModelExt)) {
        req.fileExtension = baseModelExt;        // attach the file extension to the request now
        cb(null, true);
    } else {
        cb(new Error(`Invalid base model file type! Only ${allowedBaseModelTypes.join(", ").toUpperCase()} files are allowed.`));
    }
};

// setup the middleware to upload the base model
// the model must be sent under the base model field in the request
export const baseModelUploader = multer({
    storage, 
    fileFilter: baseModelFilter,
    limits: { fileSize: (maxBaseModelSize as number) * 1024 * 1024 }
}).single('baseModel');

// Params uploader configuration - similar to baseModel but for commit parameters
const paramsFileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    const paramsExt = file.originalname.split(".").pop()?.toLowerCase();
    if (paramsExt && allowedParamsTypes.includes(paramsExt)) {
        req.fileExtension = paramsExt;        // attach the file extension to the request now
        cb(null, true);
    } else {
        cb(new Error(`Invalid param file type! Only ${allowedParamsTypes.join(", ").toUpperCase()} files are allowed.`));
    }
};

// Params uploader for commit creation workflow
export const paramsUploader = multer({
    storage, 
    fileFilter: paramsFileFilter,
    limits: { fileSize: (maxParamsSize as number) * 1024 * 1024 }
}).single('params');

// ZKML files uploader - accepts three compressed binary files
const zkmlFileFilter = (req: Request, file: Express.Multer.File, cb: FileFilterCallback) => {
    // Accept .zlib or any binary format for ZKML proofs
    const zkmlExt = file.originalname.split(".").pop()?.toLowerCase();
    // We're accepting compressed binary files, so we're lenient with extensions
    if (file.fieldname === 'proof' || file.fieldname === 'settings' || file.fieldname === 'verification_key') {
        req.fileExtension = zkmlExt || 'zlib';
        cb(null, true);
    } else {
        cb(new Error(`Invalid field name! Must be 'proof', 'settings', or 'verification_key'.`));
    }
};

export const zkmlUploader = multer({
    storage,
    fileFilter: zkmlFileFilter,
    limits: { fileSize: 50 * 1024 * 1024 } // 50MB max for ZKML files
}).fields([
    { name: 'proof', maxCount: 1 },
    { name: 'settings', maxCount: 1 },
    { name: 'verification_key', maxCount: 1 }
]);