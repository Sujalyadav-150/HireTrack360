const mongoose = require("mongoose");

const resumeSchema = new mongoose.Schema({
  userId:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
  name:{type:String,required:true,trim:true},
  targetRole:{type:String,trim:true},
  fileName:{type:String,required:true},
  mimeType:{type:String,required:true},
  size:{type:Number,required:true},
  extractedSkills:{type:[String],default:[]},
  extractionStatus:{type:String,enum:["complete","partial","unsupported","failed"],default:"unsupported"},
  extractionMessage:{type:String,default:""},
  path:{type:String,required:true,select:false},
  uploadedAt:{type:Date,default:Date.now}
},{timestamps:true});

resumeSchema.index({userId:1,uploadedAt:-1});

module.exports = mongoose.model("Resume", resumeSchema);