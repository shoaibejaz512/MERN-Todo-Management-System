import "dotenv/config"; // yeh sab se pehli line honi chahiye
import { green, red } from "colorette";
import { app } from "./src/app.js";
import { connect_db } from "./src/db/connectDb.js";

const PORT = process.env.PORT || 8000;
connect_db()
  .then(() => {
    app.listen(PORT, () =>
      console.log(green(`Server is running at PORT:${PORT} 🔥🔥`))
    );
  })
  .catch((err) => {
    console.error(red("❌ Mongo_db connection failed!!!", err));
    process.exit(1);
  });
