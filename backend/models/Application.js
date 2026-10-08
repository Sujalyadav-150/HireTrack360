const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema({
  jobId:{type:mongoose.Schema.Types.ObjectId,ref:"Job",required:true},
  candidateId:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true},
  resumeId:{type:mongoose.Schema.Types.ObjectId,ref:"Resume"},
  resumeVersion:String,
  status:{
    type:String,
    enum:["APPLIED","SCREENING","SHORTLISTED","INTERVIEW","OFFER","OFFERED","ACCEPTED","REJECTED"],
    default:"APPLIED"
  },
  matchScore:{type:Number,default:0},
  matchComponents:{type:mongoose.Schema.Types.Mixed,default:{}},
  matchExplanation:[String],
  matchedSkills:[String],
  missingSkills:[String],
  appliedAt:{type:Date,default:Date.now},
  lastUpdated:{type:Date,default:Date.now},
  lastUpdatedAt:{type:Date,default:Date.now},
  followUpRequired:{type:Boolean,default:false},
  followUpNotifiedAt:Date,
  interviewDate:Date,
  statusHistory:[{
    status:{type:String,enum:["APPLIED","SCREENING","SHORTLISTED","INTERVIEW","OFFER","OFFERED","ACCEPTED","REJECTED"]},
    changedAt:{type:Date,default:Date.now},
    changedBy:{type:mongoose.Schema.Types.ObjectId,ref:"User"},
    note:String
  }]
},{timestamps:true});

applicationSchema.index({candidateId:1, jobId:1},{unique:true});
applicationSchema.index({candidateId:1, status:1, lastUpdated:-1});
applicationSchema.index({jobId:1, status:1, createdAt:-1});
applicationSchema.pre("save", function addStatusHistory(next) {
  if (this.isNew && this.statusHistory.length === 0) {
    this.statusHistory.push({status:this.status, changedAt:this.appliedAt, changedBy:this.candidateId});
  } else if (this.isModified("status")) {
    this.lastUpdated = new Date();
    this.lastUpdatedAt = this.lastUpdated;
    this.statusHistory.push({status:this.status, changedAt:this.lastUpdated});
  }
  next();
});

module.exports = mongoose.model("Application", applicationSchema);
