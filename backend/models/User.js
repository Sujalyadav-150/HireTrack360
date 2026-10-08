const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: {type:String, required:true, trim:true},
  email: {type:String, required:true, unique:true, lowercase:true, trim:true},
  password: {type:String, required:true},
  role: {type:String, enum:["job_seeker","recruiter"], required:true},
  skills: [String],
  companyName: String,
  resumeVersions: [{
    name:String,
    url:String,
    targetRole:String,
    createdAt:{type:Date, default:Date.now}
  }]
},{timestamps:true});

module.exports = mongoose.model("User", userSchema);
