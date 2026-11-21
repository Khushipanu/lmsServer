import TryCatch from "../middlewares/TryCatch.js";
import Course from "../models/courses.model.js";
import Lecture from "../models/lecture.model.js";
import User from "../models/user.model.js";
import Query from "../models/query.model.js";
import { deleteUpload, discardUpload, saveUpload } from "../utils/storage.js";

const owns = (course, user) => String(course.createdBy) === String(user._id);

export const createCourse = TryCatch(async (req, res) => {
  const { title, description, category, duration, price } = req.body;

  if (!title?.trim() || !description?.trim() || !category?.trim()) {
    await discardUpload(req.file);
    return res.status(400).json({ message: "Title, description and category are required" });
  }
  if (!req.file) return res.status(400).json({ message: "Please add a cover image" });
  if (!req.file.mimetype.startsWith("image/")) {
    await discardUpload(req.file);
    return res.status(400).json({ message: "Cover must be an image" });
  }

  const image = await saveUpload(req.file);
  const course = await Course.create({
    title: title.trim(),
    description: description.trim(),
    category: category.trim(),
    createdBy: req.user._id,
    image,
    duration: Number(duration) || 1,
    price: Math.max(0, Number(price) || 0),
  });

  res.status(201).json({ message: "Course created", course });
});

export const updateCourse = TryCatch(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) {
    await discardUpload(req.file);
    return res.status(404).json({ message: "Course not found" });
  }
  if (!owns(course, req.user)) {
    await discardUpload(req.file);
    return res.status(403).json({ message: "You can only edit your own courses" });
  }

  const { title, description, category, duration, price } = req.body;
  if (title?.trim()) course.title = title.trim();
  if (description?.trim()) course.description = description.trim();
  if (category?.trim()) course.category = category.trim();
  if (duration !== undefined && duration !== "") course.duration = Number(duration) || course.duration;
  if (price !== undefined && price !== "") course.price = Math.max(0, Number(price) || 0);

  if (req.file) {
    const oldImage = course.image;
    course.image = await saveUpload(req.file);
    await deleteUpload(oldImage);
  }

  await course.save();
  res.json({ message: "Course updated", course });
});

export const addLecture = TryCatch(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) {
    await discardUpload(req.file);
    return res.status(404).json({ message: "Course not found" });
  }
  if (!owns(course, req.user)) {
    await discardUpload(req.file);
    return res.status(403).json({ message: "You can only add lectures to your own courses" });
  }

  const { title, description } = req.body;
  if (!title?.trim() || !description?.trim()) {
    await discardUpload(req.file);
    return res.status(400).json({ message: "Title and description are required" });
  }
  if (!req.file || !req.file.mimetype.startsWith("video/")) {
    await discardUpload(req.file);
    return res.status(400).json({ message: "Please upload a video file" });
  }

  const video = await saveUpload(req.file);
  const lecture = await Lecture.create({
    title: title.trim(),
    description: description.trim(),
    video,
    course: course._id,
    createdBy: req.user._id,
  });

  res.status(201).json({ message: "Lecture added", lecture });
});

export const deleteLecture = TryCatch(async (req, res) => {
  const lecture = await Lecture.findById(req.params.id);
  if (!lecture) return res.status(404).json({ message: "Lecture not found" });

  const course = await Course.findById(lecture.course);
  if (course && !owns(course, req.user)) {
    return res.status(403).json({ message: "You can only delete your own lectures" });
  }

  await deleteUpload(lecture.video);
  await lecture.deleteOne();
  res.json({ message: "Lecture deleted" });
});

export const deleteCourse = TryCatch(async (req, res) => {
  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ message: "Course not found" });
  if (!owns(course, req.user)) return res.status(403).json({ message: "You can only delete your own courses" });

  const lectures = await Lecture.find({ course: course._id });
  await Promise.all(lectures.map((l) => deleteUpload(l.video)));
  await deleteUpload(course.image);

  await Lecture.deleteMany({ course: course._id });
  await Query.deleteMany({ course: course._id });
  await course.deleteOne();
  await User.updateMany({}, { $pull: { subscription: course._id } });

  res.json({ message: "Course deleted" });
});

export const getAllStats = TryCatch(async (req, res) => {
  const courseIds = (await Course.find({ createdBy: req.user._id }).select("_id")).map((c) => c._id);

  const [totalLectures, totalUsers, pendingQueries] = courseIds.length
    ? await Promise.all([
        Lecture.countDocuments({ course: { $in: courseIds } }),
        User.countDocuments({ subscription: { $in: courseIds } }),
        Query.countDocuments({ instructor: req.user._id, status: "pending" }),
      ])
    : [0, 0, 0];

  res.json({ stats: { totalCourses: courseIds.length, totalLectures, totalUsers, pendingQueries } });
});

/** Students enrolled in this instructor's courses. */
export const getAllUser = TryCatch(async (req, res) => {
  const courses = await Course.find({ createdBy: req.user._id }).select("_id title");
  const courseIds = courses.map((c) => c._id);
  const titles = Object.fromEntries(courses.map((c) => [String(c._id), c.title]));

  const users = await User.find({ subscription: { $in: courseIds } })
    .select("name email role subscription createdAt")
    .sort({ createdAt: -1 })
    .lean();

  res.json({
    users: users.map((u) => ({
      ...u,
      enrolledIn: u.subscription.map(String).filter((id) => titles[id]).map((id) => titles[id]),
      subscription: undefined,
    })),
  });
});
