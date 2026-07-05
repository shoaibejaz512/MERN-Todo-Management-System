import swaggerAutogen from "swagger-autogen";

const doc = {
  info: {
    title: "AI Todo Management API",
    description:
      "A secure REST API for an AI-powered Todo Management System built with the MERN Stack. The API provides authentication, task management, AI-assisted productivity features, file uploads, and user profile management.",
    version: "1.0.0",
    contact: {
      name: "Shoaib Ejaz",
      email: "shoaibejaz512@gmail.com",
    },
  },

  host: process.env.API_HOST,
  schemes: ["http"], // change to https in production
  basePath: "/",
  consumes: ["application/json"],
  produces: ["application/json"],
};
const outputFile = "../service/swagger-output.json";
const routes = ["../app.js"];

/* NOTE: If you are using the express Router, you must pass in the 'routes' only the 
root file where the route starts, such as index.js, app.js, routes.js, etc ... */

swaggerAutogen()(outputFile, routes, doc);
