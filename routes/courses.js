import express from "express"
import { fetchLectures,fetchLecture, getAllCourses, getSingleCourse, getMyCourses, checkout, paymentVerification } from "../controllers/courses.js";
import { isAuth } from "../middlewares/isAuth.js";
import { addLecture } from "../controllers/admin.js";

const router=express.Router();
router.get('/courses/all',getAllCourses)
router.get('/course/:id',getSingleCourse)
router.get('/lectures/:id',isAuth,fetchLectures)
router.get('/lecture/:id',isAuth,fetchLecture) 
router.get('/mycourse',isAuth,getMyCourses) 
router.post('/course/checkout/:id',isAuth,checkout)
router.post('/verification/:id',isAuth,paymentVerification)




export default router;