import express from "express";
import {
  createQuery,
  getStudentQueries,
  getInstructorQueries,
  updateQueryStatus,
} from "../controllers/query.js";
import { isAdmin, isAuth } from "../middlewares/isAuth.js";

const router = express.Router();

router.post("/create/:courseId", isAuth, createQuery); // student asks
router.get("/my", isAuth, getStudentQueries); // student's own doubts
router.get("/instructor", isAuth, isAdmin, getInstructorQueries); // instructor inbox
router.put("/status/:id", isAuth, isAdmin, updateQueryStatus); // instructor replies

export default router;
