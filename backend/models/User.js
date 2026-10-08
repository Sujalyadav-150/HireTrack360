const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {type:String, required:true, trim:true},
  email: {type:String, required:true, unique:true, lowercase:true, trim:true},
  password: {type:String, required:true, select:false},
  role: {type:String, enum:["jobseeker","recruiter"], required:true},
  authProvider: {type:String, enum:["local"], default:"local"},
  profileImage: String,
  phone: String,
  location: String,
  skills: [String],
  targetRole: String,
  preferredTitles: [String],
  preferredLocations: [String],
  preferredJobTypes: [String],
  remotePreference: {type:String,enum:["ANY","REMOTE","ONSITE"],default:"ANY"},
  experience: String,
  education: String,
  bio: String,
  savedJobs: [{type:mongoose.Schema.Types.ObjectId, ref:"Job"}],
  companyName: String,
  designation: String,
  companyWebsite: String,
  companyLocation: String,
  companyDescription: String,
  isActive: {type:Boolean, default:true},
  tokenVersion: {type:Number,default:0},
  resumeVersions: [{
    name:String,
    url:String,
    targetRole:String,
    createdAt:{type:Date, default:Date.now}
  }],
  passwordResetTokenHash: {type:String, select:false},
  passwordResetExpiresAt: {type:Date, select:false}
},{timestamps:true});

userSchema.index({ role:1, isActive:1 });

module.exports = mongoose.model("User", userSchema);
