import mongoose from "mongoose";

const subTodoSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "title is required"],
      minLength: [6, "minimum length must be 6"],
      maxLength: [30, "maximum length must be 30"],
      trim:true
    },
    description: {
      type: String,
      required: [true, "title is required"],
      minLength: [20, "minimum length must be 20 chars long"],
      trim:true
    },
    status: {
      type: String,
      enum: {
        values: ["START","COMPLETED", "PENDING", "ON_GOING", "IN_COMPLETE"],
        message: "the status must be [COMPLETED,PENDING,ON_GOING,IN_COMPLETE]",
      },
    },
  },
  { timestamps: true }
);

export const SubTodo = mongoose.model("SubTodo", subTodoSchema);
