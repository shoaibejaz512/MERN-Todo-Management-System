import mongoose from "mongoose";
import { DB_NAME } from "../constants.js";
import logger from "../loggers/index.js";
import {green,red} from "colorette"

export const connect_db = async () => {
  try {
    let connection_instance = await mongoose.connect(
      `${process.env.MONGODB_URI}/${DB_NAME}`
    );
    if (connection_instance) {
      console.log(
        green(
          `Database_Connected_Successfully ${connection_instance.connection.host} : `
        )
      );
      logger.info("MongoDB Connected");
    }
  } catch (error) {
    console.log(red("Database_Connection_failed_Error", error));
    process.exit(1);
  }
};
