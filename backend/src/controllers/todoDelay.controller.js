import { runDelayDetection } from "../jobs/delayDetection.job.js";
import { ApiResponse } from "../utils/ApiResponse.js";

const getTaskDelayAnalysis = async (req, res) => {
  try {
    const { taskId } = req.params;
    const userId = req.user.userId;

    if (!taskId) {
      return res
        .status(400)
        .json(new ApiResponse(400, null, "Task ID is required", false));
    }

    const result = await runDelayDetection(taskId, userId);

    if (!result.delayed) {
      return res
        .status(400)
        .json(new ApiResponse(400, result, result.message, false));
    }

    return res
      .status(200)
      .json(
        new ApiResponse(
          200,
          result,
          "Task delay analysis generated successfully",
          true
        )
      );
  } catch (error) {
    console.error("getTaskDelayAnalysis:", error);

    return res
      .status(500)
      .json(
        new ApiResponse(
          500,
          null,
          error.message || "Failed to analyze task delay",
          false
        )
      );
  }
};

export { getTaskDelayAnalysis };
