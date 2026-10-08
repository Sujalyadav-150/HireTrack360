const mongoose = require("mongoose");

const interviewSchema = new mongoose.Schema({
  applicationId:{type:mongoose.Schema.Types.ObjectId,ref:"Application",required:true,index:true},
  jobId:{type:mongoose.Schema.Types.ObjectId,ref:"Job",required:true,index:true},
  candidateId:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
  recruiterId:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
  scheduledAt:{type:Date,required:true},
  interviewType:{type:String,enum:["VIDEO","PHONE","ONSITE"],default:"VIDEO"},
  meetingLink:String,
  notes:String,
  status:{type:String,enum:["SCHEDULED","COMPLETED","CANCELLED"],default:"SCHEDULED"},
  reminder24hSentAt:Date,
  reminder1hSentAt:Date
},{timestamps:true});

interviewSchema.index({candidateId:1,scheduledAt:1,status:1});
interviewSchema.index({recruiterId:1,scheduledAt:1,status:1});

module.exports = mongoose.model("Interview", interviewSchema);