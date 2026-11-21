// File storage abstraction.
// - With Cloudinary configured: uploads go to Cloudinary and we store the
//   full https URL. This is what you want on Render, whose disk is wiped on
//   every deploy/restart.
// - Without it: files stay in ./uploads and we store "uploads/<name>"
//   (served by express.static), same as before.
import fs from "fs";
import path from "path";
import { v2 as cloudinary } from "cloudinary";
import { isCloudinaryConfigured } from "../config/config.js";

let configured = false;
const ensureConfigured = () => {
  if (configured) return;
  if (!process.env.CLOUDINARY_URL) {
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
  }
  cloudinary.config({ secure: true });
  configured = true;
};

const removeLocal = (filePath) =>
  fs.promises.unlink(filePath).catch(() => {
    /* already gone — fine */
  });

/** Persists a multer file and returns the value to save in the DB. */
export const saveUpload = async (file) => {
  if (!file) return undefined;

  if (!isCloudinaryConfigured()) {
    return `uploads/${path.basename(file.path)}`;
  }

  ensureConfigured();
  const isVideo = file.mimetype.startsWith("video/");
  try {
    const options = { folder: "lms", resource_type: isVideo ? "video" : "image" };
    const result = isVideo
      ? await new Promise((resolve, reject) =>
          cloudinary.uploader.upload_large(file.path, { ...options, chunk_size: 6_000_000 }, (err, res) =>
            err ? reject(err) : resolve(res)
          )
        )
      : await cloudinary.uploader.upload(file.path, options);
    return result.secure_url;
  } finally {
    await removeLocal(file.path);
  }
};

/** Deletes a stored file (local path or Cloudinary URL). Never throws. */
export const deleteUpload = async (stored) => {
  if (!stored) return;
  try {
    if (/^https?:\/\/res\.cloudinary\.com\//.test(stored)) {
      if (!isCloudinaryConfigured()) return;
      ensureConfigured();
      // https://res.cloudinary.com/<cloud>/<type>/upload/v123/lms/abc.mp4 -> lms/abc
      const match = stored.match(/\/(image|video)\/upload\/(?:v\d+\/)?(.+)\.[a-z0-9]+$/i);
      if (match) await cloudinary.uploader.destroy(match[2], { resource_type: match[1] });
    } else if (!/^https?:\/\//.test(stored)) {
      await removeLocal(path.join(process.cwd(), stored));
    }
  } catch (err) {
    console.warn("Could not delete file:", stored, err.message);
  }
};

/** Cleans up a temp upload when a request fails validation. */
export const discardUpload = (file) => (file ? removeLocal(file.path) : Promise.resolve());
