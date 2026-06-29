import dotenv from "dotenv";
dotenv.config();
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "./models/user.model.js";
import Course from "./models/courses.model.js";
import Lecture from "./models/lecture.model.js";

const demoAdminEmail = "admin@demo.com";
const demoAdminPassword = "demoadmin123";

const sampleVideos = [
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4",
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
];

const demoCourses = [
  {
    title: "Complete Web Development Bootcamp",
    description:
      "Learn HTML, CSS, JavaScript, React, Node.js, and MongoDB from scratch. Build real-world projects and become a full-stack developer.",
    category: "Development",
    price: 1999,
    duration: 12,
    image: "https://placehold.co/800x450/4f46e5/ffffff?text=Web+Development",
    lectures: [
      {
        title: "Introduction to Web Development",
        description: "Overview of how the web works and what you will learn in this course.",
      },
      {
        title: "HTML & CSS Fundamentals",
        description: "Build your first webpage using semantic HTML and modern CSS.",
      },
      {
        title: "JavaScript Basics",
        description: "Variables, functions, loops, and DOM manipulation in JavaScript.",
      },
    ],
  },
  {
    title: "Data Science with Python",
    description:
      "Master Python, Pandas, NumPy, data visualization, and machine learning basics with hands-on projects.",
    category: "Data Science",
    price: 2499,
    duration: 10,
    image: "https://placehold.co/800x450/06b6d4/ffffff?text=Data+Science",
    lectures: [
      {
        title: "Python for Data Science",
        description: "Install Python and learn the basics needed for data analysis.",
      },
      {
        title: "Data Analysis with Pandas",
        description: "Clean, transform, and analyze datasets using Pandas.",
      },
      {
        title: "Data Visualization",
        description: "Create charts and dashboards with Matplotlib and Seaborn.",
      },
    ],
  },
  {
    title: "UI/UX Design Masterclass",
    description:
      "Learn design principles, wireframing, prototyping, and user research to create beautiful digital products.",
    category: "Design",
    price: 1499,
    duration: 8,
    image: "https://placehold.co/800x450/ec4899/ffffff?text=UI%2FUX+Design",
    lectures: [
      {
        title: "Design Thinking Process",
        description: "Understand the design thinking framework and user-centered design.",
      },
      {
        title: "Wireframing & Prototyping",
        description: "Create low and high-fidelity prototypes using Figma.",
      },
      {
        title: "Color Theory & Typography",
        description: "Learn how to choose colors and fonts that enhance user experience.",
      },
    ],
  },
];

async function seed() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("✅ Connected to MongoDB");

    // Find or create demo admin
    let admin = await User.findOne({ email: demoAdminEmail });
    if (!admin) {
      const hashedPassword = await bcrypt.hash(demoAdminPassword, 10);
      admin = await User.create({
        name: "Demo Admin",
        email: demoAdminEmail,
        password: hashedPassword,
        role: "admin",
      });
      console.log("✅ Created demo admin:", admin.email, "/ password:", demoAdminPassword);
    } else {
      console.log("✅ Using existing admin:", admin.email);
    }

    for (const courseData of demoCourses) {
      const { lectures, ...courseFields } = courseData;

      let course = await Course.findOne({ title: courseFields.title });
      if (!course) {
        course = await Course.create({
          ...courseFields,
          createdBy: admin._id,
        });
        console.log("✅ Created course:", course.title);
      } else {
        console.log("⏩ Course already exists:", course.title);
      }

      for (let i = 0; i < lectures.length; i++) {
        const lectureData = lectures[i];
        const existingLecture = await Lecture.findOne({
          title: lectureData.title,
          course: course._id,
        });

        if (!existingLecture) {
          await Lecture.create({
            ...lectureData,
            video: sampleVideos[i % sampleVideos.length],
            course: course._id,
            createdBy: admin._id,
          });
          console.log("  ✅ Created lecture:", lectureData.title);
        } else {
          console.log("  ⏩ Lecture already exists:", lectureData.title);
        }
      }
    }

    console.log("\n🎉 Seed completed successfully!");
    console.log("\nDemo admin login:");
    console.log("Email:", demoAdminEmail);
    console.log("Password:", demoAdminPassword);
    process.exit(0);
  } catch (err) {
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
  }
}

seed();
