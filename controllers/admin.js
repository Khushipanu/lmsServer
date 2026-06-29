import express from "express"
import TryCatch from "../middlewares/TryCatch.js"
import Course from "../models/courses.model.js";
import Lecture from "../models/lecture.model.js";
import {rm} from "fs"
import {promisify} from 'util'
import fs from 'fs'
import User from "../models/user.model.js"
import bcrypt from "bcrypt"

//since only admin can create a course-->
export const createCourse=TryCatch(async(req,res,next)=>{
    const {title,description,category,createdBy,duration,price}=req.body;
    const image=req.file;
    await Course.create({
        title,
        description,
        category,
        createdBy:req.user._id,  //this one updated now
        image:image?.path,
        duration,
        price
    })
    res.status(201).json({message:"course created"})
})

//lecture create 
export const addLecture=TryCatch(async(req,res)=>{
    const course=await Course.findById(req.params.id);
    if(!course) return res.status(404).json({message:"No Course found"})
    const {title,description}=req.body;
    const file=req.file;

    //ownership check
    if(course.createdBy.toString()!==req.user._id.toString()){
        return res.status(401).json({message:"Unauthorized,You cannot add lecture to this course"})
    }
    const lecture=await Lecture.create({
        title,
        description,
        video:file?.path,
        course:course._id,
        createdBy:req.user._id,
    })
    res.status(201).json({message:"lecture created",lecture})
    

})

export const deleteLecture=TryCatch(async(req,res)=>{
    const lecture=await Lecture.findById(req.params.id);
    if(!lecture) return res.status(404).json({message:"No Lecture found"})
    const course=await Course.findById(lecture.course);
    if(!course) return res.status(404).json({message:"No Course found"})

    if(course.createdBy.toString() !==req.user._id.toString()){
        return res.status(401).json({message:"Unauthorized,You cannot delete this lecture"})
    }

    if (lecture.video) {
        rm(lecture.video,()=>{    //sever files se bhi to delete krna hia
            console.log("video deleted")
        })
    }
    await lecture.deleteOne();
    res.json({messge:"Lecture deleted"})
    
    })

const unlinkAsync=promisify(fs.unlink)

 
export const deleteCourse=TryCatch(async(req,res)=>{
    const course=await Course.findById(req.params.id);
    if(!course) return res.status(404).json({message:"No Course found"})

    const lectures=await Lecture.find({course:course._id});
    if(course.createdBy.toString()!==req.user._id.toString()){
        return res.status(401).json({message:"Unauthorized,You cannot delete this course"})
    }

//delete all lecture videos
    await Promise.all(lectures.map(async(lecture)=>{
        if (lecture.video) {
            await unlinkAsync(lecture.video);
            console.log("video deleted")
        }
    }))

    //del course image
    if (course.image) {
        rm(course.image,()=>{
            console.log("image deleted");
        })
    }
  //del all lectures
  await Lecture.find({course:req.params.id}).deleteMany()
  //del the course
  await course.deleteOne();

  //del from subscription of all users
  await User.updateMany({},{$pull:{subscription:req.params.id}})  //subscription [] array mai se is id ko hatao  //pull ka kaamhai specific value remove krna array mai se
  res.json({message:"Course deleted"})

})


export const getAllStats=TryCatch(async(req,res)=>{
    // Get all courses created by this admin
    const instructorCourses = await Course.find({ createdBy: req.user._id }).select('_id');
    const instructorCourseIds = instructorCourses.map((c) => c._id);
    
    // Total courses created by this admin
    const totalCourses = instructorCourseIds.length;
    
    // Total lectures in admin courses
    const totalLectures = instructorCourseIds.length
        ? await Lecture.countDocuments({ course: { $in: instructorCourseIds } })
        : 0;
    
    // Total users enrolled in admin courses
    const totalUsers = instructorCourseIds.length
        ? await User.countDocuments({ subscription: { $in: instructorCourseIds } })
        : 0;
        
    res.json({ stats: { totalCourses, totalLectures, totalUsers } });
})


export const getAllUser = TryCatch(async (req, res) => {
    let users;

    if (req.user.role === "admin") {
        // Admin sees all users except themselves
        users = await User.find({ _id: { $ne: req.user._id } }).select("-password");
    } else if (req.user.role === "instructor") {
        // Instructor sees only students enrolled in their courses
        const instructorCourses = await Course.find({ createdBy: req.user._id }).select("_id");
        const instructorCourseIds = instructorCourses.map((c) => c._id);
        users = await User.find({ subscription: { $in: instructorCourseIds } }).select("-password");
    } else {
        return res.status(403).json({ message: "Forbidden" });
    }

    res.json({ users });
});





export const updateRole=TryCatch(async(req,res)=>{
    const user=await User.findById(req.params.id)
    if(!user) return res.status(404).json({message:"No User found"})

    if(user.role === "user"){
        user.role="admin";
        await user.save()

        return res.status(200).json({message:"Role updated to admin"})
    }

        if(user.role === "admin"){
        user.role="user";
        await user.save()

        return res.status(200).json({message:"Role update"})
    }
})
export const updateUserProfile=TryCatch(async(req,res)=>{
    const {id}=req.params;
    const user=await User.findById(id);
    if(!user) return res.status(404).json({message:"No User found"})

    if(req.user._id.toString()!==user._id.toString()){
        return res.status(401).json({message:"Unauthorized"})
    }
    const {name,email,password}=req.body;
    if(name) user.name=name;
    if(email) user.email=email;
    if(password){
        user.password=await bcrypt.hash(password,10);
    }
    await user.save();
    res.json({message:"Profile updated",user})

  })
