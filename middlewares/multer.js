// Accepts a single upload in the "file" field. Files are first written to
// disk; utils/storage.js then moves them to Cloudinary when configured.
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuid } from "uuid";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || "";
    cb(null, `${uuid()}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
  if (/^(image|video)\//.test(file.mimetype)) return cb(null, true);
  const err = new Error("Only image and video files are allowed");
  err.status = 400;
  cb(err);
};

const uploadFiles = multer({
  storage,
  fileFilter,
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 200) * 1024 * 1024 },
}).single("file");

export default uploadFiles;
