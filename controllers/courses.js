import { instance } from "../index.js";
import TryCatch from "../middlewares/TryCatch.js";
import Course from "../models/courses.model.js";
import Lecture from "../models/lecture.model.js";
import User from "../models/user.model.js";
import mongoose from "mongoose";
import crypto from "crypto"
import { Payment } from "../models/Payment.model.js";

export const getAllCourses=TryCatch(async(req,res)=>{
    const courses=await Course.find();
    return res.json({courses})

})
export const getSingleCourse=TryCatch(async(req,res)=>{
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid course id" });
    }
    const course=await Course.findById(id);
    return res.json({course})

})
export const fetchLectures=TryCatch(async(req,res)=>{
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({ message: "Invalid course id" });
    }
    const course=await Course.findById(id);
    if(!course) return res.status(404).json({message:"No Course found"})

    
    const user=await User.findById(req.user._id);
    if(user.role==="admin"){
        if(course.createdBy.toString()!==req.user._id.toString()){
            return res.status(401).json({message:"Unauthorized,You cannot access this course"})
        }
        const lectures=await Lecture.find({course:id})
        return res.json({lectures})
    }
    if(!user.subscription.includes(id))
        return res.status(400).json({message:"You have not subscribed to this course"})

    const lectures=await Lecture.find({course:id})
    return res.json({lectures})
})


export const fetchLecture=TryCatch(async(req,res)=>{
    const lecture=await Lecture.findById(req.params.id);
    const user=await User.findById(req.user._id);
    const course=await Course.findById(lecture.course);
    if(!course) return res.status(404).json({message:"No Course found"})

    if(user.role==="admin"){
        if(course.createdBy.toString()!==req.user._id.toString()){
            return res.status(401).json({message:"Unauthorized,You cannot access this course"})
        }
        return res.json({lecture})
    }
    if(!user.subscription.includes(lecture.course))
        return res.status(400).json({message:"you have not subscribed to this user"})
    res.json({lecture})

})
//get my course
export const getMyCourses=TryCatch(async(req,res)=>{
    let courses;
    if(req.user.role==="admin"){
        courses=await Course.find({createdBy:req.user._id});
    }else{
        courses=await Course.find({_id:{$in: req.user.subscription}})
    }
   
   
    return res.json({courses})
})

export const checkout=TryCatch(async(req,res)=>{
    const user=await User.findById(req.user._id);
    const course=await Course.findById(req.params.id);
    if(!user) return res.status(404).json({message:"No User found"})
    if(!course) return res.status(404).json({message:"No Course found"})
        
    if(user.subscription.includes(course._id)){
        return res.status(400).json({message:"You already have this course"})
    }

    if (!instance) {
        return res.status(503).json({ message: "Payment service is not configured. Please set Razorpay keys." });
    }

    const options={
        amount:Number(course.price * 100),
        currency:"INR", 
    }
    
    const order=await instance.orders.create(options);

//Ab yahan Razorpay ke system me ek order create ho gaya.
//Razorpay tumhe ek order_id dega (like: order_12345).
//Ye ek slip/receipt hai jo confirm karta hai ki Razorpay ne order register kar liya.
//Ye order aur course frontend ko bhej diya jata hai.


/*Ab tak ka step:

User: “Mujhe ye course chahiye.”

Backend: “Ok, Razorpay me order bana diya, ye slip lo aur payment karo.”  */
    res.status(201).json({order,course})

})
export const paymentVerification=TryCatch(async(req,res)=>{
    const {razorpay_order_id,razorpay_payment_id,razorpay_signature}=req.body;
    const body=razorpay_order_id + "|" +razorpay_payment_id;
    const expectedSignature=crypto.createHmac("sha256",
        process.env.RAZORPAY_KEY_SECRET).update(body).digest("hex")
    
    const isAuthentic=expectedSignature===razorpay_signature;

    if(isAuthentic){
        await Payment.create({
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature,
        })
        const user=await User.findById(req.user._id)
        const course=await Course.findById(req.params.id)
        user.subscription.push(course._id);
        await user.save();
        res.status(200).json({message:"Course purchased successfully"})

    }else{
        return res.status(400).json({message:"Payment failed"})
    }

})