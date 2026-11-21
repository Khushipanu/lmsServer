import express from "express";
import { isAdmin, isAuth } from "../middlewares/isAuth.js";
import {
  addLecture,
  createCourse,
  deleteCourse,
  deleteLecture,
  getAllStats,
  getAllUser,
  updateCourse,
} from "../controllers/admin.js";
import uploadFiles from "../middlewares/multer.js";

const router = express.Router();

router.post("/course/new", isAuth, isAdmin, uploadFiles, createCourse);
router.put("/course/:id", isAuth, isAdmin, uploadFiles, updateCourse);
router.delete("/course/:id", isAuth, isAdmin, deleteCourse);
router.post("/courses/:id", isAuth, isAdmin, uploadFiles, addLecture); // add lecture
router.delete("/lecture/:id", isAuth, isAdmin, deleteLecture);
router.get("/stats", isAuth, isAdmin, getAllStats);
router.get("/users", isAuth, isAdmin, getAllUser);

export default router;
