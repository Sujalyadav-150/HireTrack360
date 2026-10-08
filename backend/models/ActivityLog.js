const mongoose = require("mongoose");

const activityLogSchema = new mongoose.Schema({
  actor:{type:mongoose.Schema.Types.ObjectId,ref:"User",required:true,index:true},
  action:{type:String,required:true},
  entityType:{type:String,required:true},
  entityId:{type:mongoose.Schema.Types.ObjectId},
  metadata:{type:mongoose.Schema.Types.Mixed,default:{}}
},{timestamps:true});

activityLogSchema.index({entityType:1,entityId:1,createdAt:-1});

module.exports = mongoose.model("ActivityLog", activityLogSchema);