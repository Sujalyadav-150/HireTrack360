const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema({
  title:{type:String,required:true},
  company:{type:String,required:true},
  location:String,
  employmentType:String,
  salaryMin:Number,
  salaryMax:Number,
  skills:[String],
  requiredSkills:[String],
  experience:String,
  educationRequirements:String,
  responsibilities:[String],
  description:String,
  contactEmail:String,
  externalLinks:[String],
  recruiterId:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
  trustScore:{type:Number,default:70},
  trustSignals:[String],
  trustWarnings:[String],
  riskScore:{type:Number,min:0,max:100,default:0},
  riskLevel:{type:String,enum:["LOW","REVIEW","HIGH"],default:"LOW"},
  riskSignals:[String],
  riskWarnings:[String],
  riskEvidence:[mongoose.Schema.Types.Mixed],
  reviewRequired:{type:Boolean,default:false},
  remote:{type:Boolean,default:false},
  status:{type:String,enum:["OPEN","CLOSED"],default:"OPEN"},
  deadline:Date
},{timestamps:true});

jobSchema.index({ status:1, createdAt:-1 });
jobSchema.index({ location:1, employmentType:1, remote:1, status:1 });
jobSchema.index({ recruiterId:1, status:1, createdAt:-1 });
jobSchema.index({ title:"text", company:"text", description:"text" });
jobSchema.index({ requiredSkills:1, status:1 });

module.exports = mongoose.model("Job", jobSchema);
