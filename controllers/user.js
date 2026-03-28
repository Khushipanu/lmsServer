import express from "express"
import bcrypt from 'bcrypt'
import User from "../models/user.model.js"
import jwt from 'jsonwebtoken'
import sendMail, { sendForgotMail } from "../middlewares/sendMail.js"
import TryCatch from "../middlewares/TryCatch.js"
import dotenv from "dotenv"
import { OAuth2Client } from "google-auth-library"
import fs from "fs"
dotenv.config();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

//register
export const register=TryCatch(async(req,res)=>{
    const {email,name,password,role}=req.body;
        // basic validation
        if(!email || !name || !password){
            return res.status(400).json({message:"name, email,role  and password are required"});
        }
        let user=await User.findOne({email});
        if(user) return res.status(400).json({message:"User already exists"});

        //hashed password
        const hashPassword=await bcrypt.hash(password,10);
        user={
            name:name,
            email:email,
            password :hashPassword,
            role:role
        }

        const otp=Math.floor(Math.random()*1000000);

        //jwt.sign(payload, secret, options)

        const activationToken=jwt.sign({
            user, //poora obj hi daal diya isme user: name , email and password hai
            otp,
        },process.env.ACTIVATION_SECRET,{
            expiresIn:"50d",
        })
        
        const data={name,otp};
        
        await sendMail(email,"LMS",data)
        
       return res.status(200).json({message:"OTP sent to your email",activationToken})

})

export const verifyUser=TryCatch(async(req,res)=>{
    const {otp,activationToken}=req.body;
    const verify=jwt.verify(activationToken,process.env.ACTIVATION_SECRET);
    console.log(verify)
    if(!verify) return res.status(400).json({message:"Otp expired"})
    if(verify.otp!==otp) return res.status(400).json({message:"invalid otp"})
   
    console.log(verify.user.name) //janki

    await User.create({
       name:verify.user.name,
       email:verify.user.email,
       password:verify.user.password,
       role:verify.user.role,
    })
   return res.json({
        message:"User registered"
    })

    })


    export const login=TryCatch(async(req,res)=>{
        const {email,password}=req.body;
        const user=await User.findOne({email});
        if(!user) return res.status(400).json({message:"user not found"});
        const hash=user.password; //db mai already saved hai as hashed password
        const isPassword=await bcrypt.compare(password,hash);
        if(!isPassword) return res.status(400).json({message:"wrong password"})
        const token=jwt.sign({
             _id:user._id,
             role:user.role
        },process.env.JWT_SECRET_KEY,{expiresIn:"55d"});
        
        return res.json({message:`Welcome back!! ${user.name}`,token,user})


    })
    export const myprofile=TryCatch(async(req,res)=>{
        const user=await User.findById(req.user._id);
        return res.json({user})


    })

    // Simple Google OAuth login using an ID token from the client.
    // The client should obtain `idToken` from Google and POST it to this endpoint.
   

    export const googleLogin = TryCatch(async (req, res) => {

  const { idToken } = req.body;

  if (!idToken) {
    return res.status(400).json({
      message: "Google idToken is required",
    });
  }

  // verify token from Google
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  const { sub: googleId, email, name } = payload;

  if (!email) {
    return res.status(400).json({
      message: "Google account email is required",
    });
  }

 
  let user = await User.findOne({ email });

  if (!user) {
    const pseudoPassword = googleId + process.env.JWT_SECRET_KEY;

    const hashedPassword = await bcrypt.hash(pseudoPassword, 10);

    user = await User.create({
      name: name || email.split("@")[0],
      email,
      password: hashedPassword,
      role: "user",
    });
  }

  // generate JWT token
  const token = jwt.sign(
    {
      _id: user._id,
      role: user.role,
    },
    process.env.JWT_SECRET_KEY,
    {
      expiresIn: "55d",
    }
  );

  return res.json({
    message: `Welcome back ${user.name}`,
    token,
    user,
  });
});

    export const forgotPassword=TryCatch(async(req,res)=>{
        const {email}=req.body;
        const user=await User.findOne({email})
        if(!user) return res.status(404).json({message:"User doesn't exist"})
         
        const token=jwt.sign({
            email
        },process.env.FORGOT_SECRET_KEY)

        const data={email,token};
        await sendForgotMail("LMS",data);
        user.resetPasswordExpire=Date.now() + 5 * 60 * 1000;

        await user.save();

       return res.json({message:"Reset password Link is send to your mail"});
    })
    
    export const resetPassword=TryCatch(async(req,res)=>{
        const decoded=jwt.verify(req.query.token,process.env.FORGOT_SECRET_KEY)
        const user=await User.findOne({email:decoded.email})
        if(!user) return res.status(404).json({message:"No user with this email"})
        if(user.resetPasswordExpire ===null) return res.status(400).json({message:"Token expired"})
        if(user.resetPasswordExpire < Date.now()){
            return res.status(400).json({message:"Token expired"})
        }  
        const password=await bcrypt.hash(req.body.password,10);
        user.password=password;
        user.resetPasswordExpire=null;
        await user.save();
        res.json({message:"Password reset"});
    })