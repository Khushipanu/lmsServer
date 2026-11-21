import "../config/config.js";
import crypto from "crypto";
import mongoose from "mongoose";
import razorpay from "../config/razorpay.js";
import TryCatch from "../middlewares/TryCatch.js";
import Course from "../models/courses.model.js";
import Lecture from "../models/lecture.model.js";
import User from "../models/user.model.js";
import { Payment } from "../models/Payment.model.js";

const isId = (id) => mongoose.Types.ObjectId.isValid(id);
const ownsCourse = (course, user) => String(course.createdBy?._id || course.createdBy) === String(user._id);
const isEnrolled = (user, courseId) => user.subscription.some((id) => String(id) === String(courseId));

/** Lecture counts for a list of courses, as { courseId: count }. */
const lectureCounts = async (courseIds) => {
  const rows = await Lecture.aggregate([
    { $match: { course: { $in: courseIds } } },
    { $group: { _id: "$course", count: { $sum: 1 } } },
  ]);
  return Object.fromEntries(rows.map((r) => [String(r._id), r.count]));
};

const withCounts = async (courses) => {
  const counts = await lectureCounts(courses.map((c) => c._id));
  return courses.map((c) => ({ ...c.toObject(), lectureCount: counts[String(c._id)] || 0 }));
};

export const getAllCourses = TryCatch(async (req, res) => {
  const courses = await Course.find().sort({ createdAt: -1 }).populate("createdBy", "name");
  res.json({ courses: await withCounts(courses) });
});

export const getSingleCourse = TryCatch(async (req, res) => {
  const { id } = req.params;
  if (!isId(id)) return res.status(400).json({ message: "Invalid course id" });

  const course = await Course.findById(id).populate("createdBy", "name");
  if (!course) return res.status(404).json({ message: "Course not found" });

  // Public curriculum: titles only, never video URLs.
  const lectures = await Lecture.find({ course: id }).select("title").sort({ createdAt: 1 });
  res.json({ course: { ...course.toObject(), lectureCount: lectures.length }, curriculum: lectures });
});

export const fetchLectures = TryCatch(async (req, res) => {
  const { id } = req.params;
  if (!isId(id)) return res.status(400).json({ message: "Invalid course id" });

  const course = await Course.findById(id);
  if (!course) return res.status(404).json({ message: "Course not found" });

  if (!ownsCourse(course, req.user) && !isEnrolled(req.user, id)) {
    return res.status(403).json({ message: "Enroll in this course to watch its lectures" });
  }

  const lectures = await Lecture.find({ course: id }).sort({ createdAt: 1 });
  res.json({ lectures });
});

export const fetchLecture = TryCatch(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ message: "Invalid lecture id" });

  const lecture = await Lecture.findById(req.params.id);
  if (!lecture) return res.status(404).json({ message: "Lecture not found" });

  const course = await Course.findById(lecture.course);
  if (!course) return res.status(404).json({ message: "Course not found" });

  if (!ownsCourse(course, req.user) && !isEnrolled(req.user, course._id)) {
    return res.status(403).json({ message: "Enroll in this course to watch its lectures" });
  }
  res.json({ lecture });
});

export const getMyCourses = TryCatch(async (req, res) => {
  const filter = req.user.role === "admin" ? { createdBy: req.user._id } : { _id: { $in: req.user.subscription } };
  const courses = await Course.find(filter).sort({ createdAt: -1 }).populate("createdBy", "name");
  res.json({ courses: await withCounts(courses) });
});

export const checkout = TryCatch(async (req, res) => {
  if (!isId(req.params.id)) return res.status(400).json({ message: "Invalid course id" });

  const user = await User.findById(req.user._id);
  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ message: "Course not found" });

  if (ownsCourse(course, user)) return res.status(400).json({ message: "You created this course" });
  if (isEnrolled(user, course._id)) return res.status(400).json({ message: "You're already enrolled" });

  // Free courses: enroll straight away, no payment needed.
  if (!course.price || Number(course.price) <= 0) {
    user.subscription.push(course._id);
    await user.save();
    return res.status(200).json({ free: true, message: "You're enrolled!" });
  }

  if (!razorpay) {
    return res.status(503).json({ message: "Payments are not configured on the server yet" });
  }

  const order = await razorpay.orders.create({
    amount: Math.round(Number(course.price) * 100),
    currency: "INR",
    receipt: `c_${String(course._id).slice(-8)}_${Date.now()}`,
    notes: { courseId: String(course._id), userId: String(user._id) },
  });

  res.status(201).json({ order, course, key: process.env.RAZORPAY_KEY_ID });
});

export const paymentVerification = TryCatch(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ message: "Missing payment details" });
  }

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET || "")
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest("hex");

  if (expected !== razorpay_signature) {
    return res.status(400).json({ message: "Payment verification failed" });
  }

  if (!isId(req.params.id)) return res.status(400).json({ message: "Invalid course id" });
  const course = await Course.findById(req.params.id);
  if (!course) return res.status(404).json({ message: "Course not found" });

  const user = await User.findById(req.user._id);

  // The signature only proves "this payment belongs to this order". Also check
  // the order was created for THIS course and THIS user, otherwise a payment for
  // a cheap course could be replayed to unlock an expensive one.
  if (!razorpay) return res.status(503).json({ message: "Payments are not configured on the server yet" });
  let order;
  try {
    order = await razorpay.orders.fetch(razorpay_order_id);
  } catch {
    return res.status(400).json({ message: "Payment verification failed" });
  }
  if (order.notes?.courseId !== String(course._id) || order.notes?.userId !== String(user._id)) {
    return res.status(400).json({ message: "This payment doesn't belong to this course" });
  }

  await Payment.updateOne(
    { razorpay_payment_id },
    {
      $setOnInsert: {
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature,
        user: user._id,
        course: course._id,
        amount: course.price,
      },
    },
    { upsert: true }
  );

  if (!isEnrolled(user, course._id)) {
    user.subscription.push(course._id);
    await user.save();
  }

  res.status(200).json({ message: "Payment successful — you're enrolled!" });
});
