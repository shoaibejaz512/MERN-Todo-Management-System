import express from "express"
import cors from "cors"
import dotenv from "dotenv"
import helmet from "helmet"
import dotenv from "dotenv"


const app = express();
dotenv.config();
app.use(express.json());
app.use(express.urlencoded({extended:true}));
app.use(
  cors({
    origin:process.env.CURRENT_URL,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
    maxAge: 3600,//reduce preflight requirests
  })
);
app.use(helmet());