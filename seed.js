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
    title: "Java Programming Masterclass",
    description:
      "Learn Java from basics to advanced topics including OOP, collections, multithreading, and building real-world applications.",
    category: "Development",
    price: 1799,
    duration: 10,
    image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&h=450&fit=crop",
    lectures: [
      {
        title: "Introduction to Java",
        description: "Set up Java, write your first program, and understand JVM basics.",
      },
      {
        title: "Object-Oriented Programming",
        description: "Classes, objects, inheritance, polymorphism, and encapsulation.",
      },
      {
        title: "Collections Framework",
        description: "Lists, sets, maps, and working with data efficiently in Java.",
      },
    ],
  },
  {
    title: "Complete Web Development Bootcamp",
    description:
      "Learn HTML, CSS, JavaScript, React, Node.js, and MongoDB from scratch. Build real-world projects and become a full-stack developer.",
    category: "Development",
    price: 1999,
    duration: 12,
    image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&h=450&fit=crop",
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
    image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&h=450&fit=crop",
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
    image: "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&h=450&fit=crop",
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

      // Upsert course so image/description stays consistent on every seed run
      let course = await Course.findOneAndUpdate(
        { title: courseFields.title },
        { ...courseFields, createdBy: admin._id },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
      console.log("✅ Synced course:", course.title);

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

    // Unify all course images to the same neutral placeholder (no text)
    const unifiedImage = "https://images.unsplash.com/photo-1496181133206-80ce9b88a853?w=800&h=450&fit=crop";
    await Course.updateMany({}, { image: unifiedImage });
    console.log("🖼️  Unified all course images to the same neutral placeholder");

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
