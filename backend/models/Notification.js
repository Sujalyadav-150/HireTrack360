const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  userId:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
  type:{type:String,required:true},
  title:{type:String,required:true},
  message:{type:String,required:true},
  link:{type:String,default:"/dashboard.html"},
  read:{type:Boolean,default:false},
  dedupeKey:{type:String,unique:true,sparse:true}
},{timestamps:true});

notificationSchema.index({userId:1,read:1,createdAt:-1});

module.exports = mongoose.model("Notification", notificationSchema);