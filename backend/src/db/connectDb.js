import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";

export const connect_db = async () => {
  try {
    let connection_instance = await mongoose.connect(`${process.env.MONGODB_URI}/${DB_NAME}`);
    if(connection_instance){
        console.log("Database_Connected_Successfully = :)")
    }
  } catch (error) {
    console.log("Database_Connection_failed_Error", error);
    process.exit(1);
  }
};
