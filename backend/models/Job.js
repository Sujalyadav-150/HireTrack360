const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema({
  title:{type:String,required:true},
  company:{type:String,required:true},
  location:String,
  employmentType:String,
  salaryMin:Number,
  salaryMax:Number,
  skills:[String],
  description:String,
  recruiterId:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
  trustScore:{type:Number,default:70},
  status:{type:String,enum:["OPEN","CLOSED"],default:"OPEN"},
  deadline:Date
},{timestamps:true});

module.exports = mongoose.model("Job", jobSchema);
