import mongoose from 'mongoose'
const UserSchema=new mongoose.Schema({
    name:{
        type:String,
    },
    email:{
        type:String,
        required:true,
       
    },
    password:{
        type:String,
     },
     googleId:{
        type:String,
     },
     
    role:{
        type:String,
        default:"user"
    },
    subscription:[
        {
            type:mongoose.Schema.Types.ObjectId,
            ref:"Course"
             
        }
    ],
    resetPasswordExpire:{
        type:Date
    }
},{
    timestamps:true,
})
const User=mongoose.model("User",UserSchema);
export default User;
 