import { app } from "./src/app.js";
import { connect_db } from "./src/db/connectDb.js";
import dotenv from "dotenv";


dotenv.config();
const PORT = process.env.PORT || 8000;
connect_db()
  .then(() => {
    app.listen(PORT, () =>
      console.log(`Server is running at PORT:${PORT} 🔥🔥`)
    );
  })
  .catch((err) => {
    console.error("❌ Mongo_db connection failed!!!", err);
    process.exit(1);
  });
