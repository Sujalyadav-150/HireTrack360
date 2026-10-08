const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema({
  jobId:{type:mongoose.Schema.Types.ObjectId,ref:"Job",required:true},
  candidateId:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
  resumeVersion:String,
  status:{
    type:String,
    enum:["APPLIED","SCREENING","INTERVIEW","OFFER","REJECTED"],
    default:"APPLIED"
  },
  matchScore:{type:Number,default:0},
  lastUpdated:{type:Date,default:Date.now},
  followUpRequired:{type:Boolean,default:false},
  interviewDate:Date
},{timestamps:true});

module.exports = mongoose.model("Application", applicationSchema);
