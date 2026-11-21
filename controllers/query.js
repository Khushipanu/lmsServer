import mongoose from "mongoose";
import Course from "../models/courses.model.js";
import TryCatch from "../middlewares/TryCatch.js";
import Query from "../models/query.model.js";

export const createQuery = TryCatch(async (req, res) => {
  const { title, topic, description } = req.body;
  const { courseId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(courseId)) return res.status(400).json({ message: "Invalid course" });
  if (!title?.trim() || !topic?.trim() || !description?.trim()) {
    return res.status(400).json({ message: "Title, topic and description are required" });
  }

  const course = await Course.findById(courseId);
  if (!course) return res.status(404).json({ message: "Course not found" });

  if (String(course.createdBy) === String(req.user._id)) {
    return res.status(403).json({ message: "You can't ask a doubt on your own course" });
  }
  if (!req.user.subscription.some((id) => String(id) === String(courseId))) {
    return res.status(403).json({ message: "Enroll in this course to ask a doubt" });
  }

  const query = await Query.create({
    title: title.trim(),
    topic: topic.trim(),
    description: description.trim(),
    course: courseId,
    student: req.user._id,
    instructor: course.createdBy,
  });
  res.status(201).json({ message: "Your doubt was sent to the instructor", query });
});

export const getInstructorQueries = TryCatch(async (req, res) => {
  const queries = await Query.find({ instructor: req.user._id })
    .sort({ status: 1, createdAt: -1 })
    .populate("student", "name email")
    .populate("course", "title");
  res.json({ queries });
});

export const updateQueryStatus = TryCatch(async (req, res) => {
  const { status, reply } = req.body;
  const query = await Query.findById(req.params.id);
  if (!query) return res.status(404).json({ message: "Query not found" });

  if (String(query.instructor) !== String(req.user._id)) {
    return res.status(403).json({ message: "Only the course instructor can reply" });
  }

  if (status && ["pending", "solved"].includes(status)) query.status = status;
  if (reply?.trim()) query.reply = reply.trim();
  await query.save();

  res.json({ message: "Reply sent", query });
});

export const getStudentQueries = TryCatch(async (req, res) => {
  const queries = await Query.find({ student: req.user._id })
    .sort({ createdAt: -1 })
    .populate("course", "title")
    .populate("instructor", "name");
  res.json({ queries });
});
